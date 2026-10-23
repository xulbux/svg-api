/**
 * Upstream service fetcher – Validates service preset requests and resolves metrics with request coalescing, an in-isolate memory cache, conditional `ETag` revalidation, `stale-if-error` fallback, and Tier-1 JSON edge caching.
 *
 * Lookup order per upstream key: in-isolate memory cache -> in-flight request -> Cloudflare edge
 * cache -> conditional or fresh upstream `fetch` (with timeout and a response size cap). Positive
 * projections stay physically retained at the edge beyond their logical TTL so expired entries can
 * revalidate via `If-None-Match` (`304 Not Modified`) and survive transient `429` / `5xx` errors.
 */

import { SERVICES_CONFIG } from '@/config/services';
import { FALLBACK_REDIRECT_URL, SITE_ORIGIN } from '@/config/site';
import { getEdgeCache, putInEdgeCache } from '@/services/edgeCache';
import { isJsonObject } from '@/services/endpoint';
import {
  clearLruCache,
  createLruCache,
  deleteLruEntry,
  getOwnValue,
  readLruCache,
  writeLruCache,
} from '@/svg/shared';
import type {
  Env,
  MetricEndpoint,
  MetricResult,
  ResolvedServiceMetric,
  ServiceDefinition,
  ServiceMetricConfig,
  ServicePreviewSample,
  ServiceRequest,
  ServiceRouteParams,
  ThemeColorName,
  UpstreamTransport,
  WaitUntilContext,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Outcome of loading an upstream JSON document (also the in-isolate memory cache entry). */
interface UpstreamOutcome {
  /** Projected payload (only present for successful `2xx` responses other than `202`). */
  data?: unknown;
  /** Upstream `ETag` validator kept for conditional `If-None-Match` revalidation. */
  etag?: string;
  /** Logical expiry timestamp of the outcome in milliseconds. */
  expiresAt: number;
  /** Whether the payload could not be projected (rendered as `invalid data`). */
  isInvalidData?: boolean;
  /** Serialized projected payload size in UTF-16 code units (`0` for failures; Weighs memory cache entries). */
  size: number;
  /** Upstream HTTP status (synthetic statuses represent timeouts, network/JSON errors, and oversized bodies). */
  status: number;
}

/** Raw upstream response body before JSON parsing and projection. */
interface UpstreamBody {
  /** Extended logical TTL in seconds when the upstream rate-limit bucket is running low. */
  adaptiveTtl?: number;
  /** Leading value already parsed by the streaming prefix reader (`{ [leadingKey]: value }`). */
  data?: unknown;
  /** Upstream `ETag` response header value (when within `MAX_ETAG_LENGTH`). */
  etag?: string;
  /** Seconds until a rate limit resets (`Retry-After` or `x-ratelimit-reset`). */
  retryAfter?: number;
  /** Upstream HTTP status (synthetic statuses represent timeouts, network errors, and oversized bodies). */
  status: number;
  /** Complete response body (successful responses without a parsed leading value). */
  text?: string;
}

/** Result of reading an entry from the Tier-1 JSON edge cache. */
interface EdgeCacheReadResult {
  /** Whether the entry's logical TTL (`X-Svg-Api-Expires-At`) is still fresh. */
  isFresh: boolean;
  /** Decoded positive or negative outcome. */
  outcome: UpstreamOutcome;
}

/** Concrete HTTP request parameters and cache key for one upstream load. */
interface ResolvedFetchTarget {
  /** Optional request body (e.g., serialized GraphQL JSON query). */
  body?: string;
  /** Deterministic cache key URL for memory, coalescing, and edge caches. */
  cacheKeyUrl: string;
  /** Top-level JSON object keys to extract while streaming (`undefined` reads full body). */
  extractKeys?: readonly string[];
  /** Request headers before conditional `If-None-Match` injection. */
  headers: Readonly<Record<string, string>>;
  /** HTTP request method. */
  method: 'GET' | 'POST';
  /** Optional custom HTTP transport (e.g., micro-batched GraphQL queries). */
  send?: UpstreamTransport;
  /** Upstream URL passed to `fetch()`. */
  url: string;
}

/** Validated service request with its resolved preset, metric, and route params. */
interface ResolvedServiceContext {
  /** Resolved metric configuration. */
  metric: ServiceMetricConfig;
  /** Effective owner and target. */
  params: ServiceRouteParams;
  /** Resolved service definition. */
  service: ServiceDefinition;
}

/** Optional overrides of an error badge. */
interface ErrorResultOptions {
  /** Theme color token override. */
  color?: ThemeColorName;
  /** Icon slug override. */
  icon?: string;
  /** Redirect destination (defaults to `FALLBACK_REDIRECT_URL`). */
  redirectUrl?: string;
}

/** Merged upstream request headers of a service, memoized per environment object. */
interface MergedHeadersEntry {
  /** Environment the headers were built for. */
  env: Env;
  /** Default headers merged with the service headers. */
  headers: Readonly<Record<string, string>>;
}

/** Phase of the streaming top-level JSON object key extractor. */
type JsonScanPhase =
  | 'colon'
  | 'comma-or-end'
  | 'done'
  | 'first-key-or-end'
  | 'key'
  | 'mismatch'
  | 'next-key'
  | 'root'
  | 'value-container'
  | 'value-primitive'
  | 'value-start'
  | 'value-string';

/** Mutable state of the streaming top-level JSON object key extractor across chunks. */
interface JsonStreamScanner {
  /** Summed length in UTF-16 code units of all already parsed wanted values. */
  capturedSize: number;
  /** Current object/array nesting depth inside a `value-container`. */
  depth: number;
  /** Extracted top-level key-value pairs parsed so far. */
  extracted: Record<string, unknown>;
  /** Set of wanted top-level keys that have already been extracted. */
  foundKeys: Set<string>;
  /** Whether the current key string contains a backslash escape sequence. */
  hasKeyEscape: boolean;
  /** Whether the previous character inside a string was a backslash. */
  isEscaped: boolean;
  /** Whether the container scanner is currently inside a JSON string literal. */
  isInString: boolean;
  /** Whether a captured value exceeded `MAX_UPSTREAM_BYTES`. */
  isTooLarge: boolean;
  /** Buffer accumulating the current top-level key string. */
  keyBuffer: string;
  /** Currently matched wanted key (`undefined` when the current key is being skipped in `O(1)` memory). */
  matchedKey: string | undefined;
  /** Current lexer phase. */
  phase: JsonScanPhase;
  /** Wanted top-level object keys. */
  targetKeys: ReadonlySet<string>;
  /** Buffer accumulating the JSON slice of a matched key's value (`''` while skipping unwanted keys). */
  valueBuffer: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Memory and edge cache TTL in seconds for failed or pending upstream outcomes. */
const ERROR_CACHE_TTL = 60;

/** Memory and edge cache TTL in seconds for missing (`404`) and oversized (`413`) upstream documents. */
const NOT_FOUND_CACHE_TTL = 300;

/** Minimum and maximum cache TTL in seconds for rate-limited (`429`) outcomes. */
const RATE_LIMIT_CACHE_TTL = { max: 900, min: 60 } as const;

/**
 * Smallest `x-ratelimit-reset` value read as an epoch timestamp in seconds (September 2001);
 * Smaller values are seconds until the reset, larger ones epochs (GitHub).
 */
const RATE_LIMIT_RESET_EPOCH_THRESHOLD = 1_000_000_000;

/** Smallest `x-ratelimit-reset` value read as a millisecond epoch timestamp (`2001-09-09T01:46:40.000Z`). */
const RATE_LIMIT_RESET_EPOCH_MS_THRESHOLD = 1_000_000_000_000;

/** Maximum distinct upstream loads simultaneously in flight per Worker isolate (sheds random-slug cache-busting floods). */
const MAX_IN_FLIGHT_LOADS = 64;

/** Minimum remaining memory cache lifetime in milliseconds of an edge cache hit. */
const MIN_MEMORY_LIFETIME = 1000;

/** Upstream request timeout in milliseconds. */
const UPSTREAM_TIMEOUT = 8000;

/** Maximum upstream response body size in bytes (larger bodies resolve to a `too large` badge). */
const MAX_UPSTREAM_BYTES = 2_097_152;

/**
 * Maximum wire bytes scanned by the streaming JSON key extractor: Unneeded keys are
 * discarded in `O(1)` memory while streaming, while captured values stay capped at `MAX_UPSTREAM_BYTES`.
 */
const MAX_STREAM_SCAN_BYTES = 33_554_432;

/** Maximum length in UTF-16 code units of a top-level JSON object key read by the streaming scanner. */
const MAX_JSON_KEY_LENGTH = 1024;

/** Maximum number of upstream outcomes kept in the in-isolate memory cache. */
const MAX_MEMORY_CACHE_ENTRIES = 256;

/** Maximum summed projected payload size in UTF-16 code units of the in-isolate memory cache. */
const MAX_MEMORY_CACHE_WEIGHT = 4_000_000;

/** Synthetic origin of Tier-1 JSON edge cache keys (versioned, because entries hold projections). */
const JSON_CACHE_ORIGIN = 'https://internal-json-cache.xul.is/v3/';

/** Physical edge cache retention in seconds for positive projections, preserving `ETag` and `stale-if-error` data past logical expiry. */
const POSITIVE_EDGE_RETENTION_SECONDS = 604_800;

/** Remaining-quota fraction at or below which positive logical TTLs stretch toward the rate-limit reset. */
const LOW_QUOTA_RATIO = 0.1;

/** Maximum adaptive logical TTL in seconds when an upstream rate-limit bucket is running low. */
const MAX_ADAPTIVE_TTL = 3600;

/** Maximum length in UTF-16 code units of an upstream `ETag` header stored in cache. */
const MAX_ETAG_LENGTH = 512;

/** Edge cache entry header holding the upstream `ETag` validator. */
const ETAG_HEADER = 'X-Svg-Api-ETag';

/** Edge cache entry header holding the outcome expiry timestamp in milliseconds. */
const EXPIRES_AT_HEADER = 'X-Svg-Api-Expires-At';

/** Edge cache entry header holding the upstream status of negative outcome markers. */
const STATUS_HEADER = 'X-Svg-Api-Status';

/** Default upstream request headers. */
const DEFAULT_HEADERS: Readonly<Record<string, string>> = {
  Accept: 'application/json',
  'User-Agent': `svg-api/1.0 (${SITE_ORIGIN})`,
};

/** HTTP status of unchanged conditional upstream responses (`If-None-Match` hit). */
const NOT_MODIFIED_STATUS = 304;

/** HTTP status of rate-limited upstream responses (exhausted `403` rate-limit responses are normalized to it). */
const RATE_LIMITED_STATUS = 429;

/** HTTP status of upstream responses exceeding `MAX_UPSTREAM_BYTES`. */
const TOO_LARGE_STATUS = 413;

/** Badge status of payloads that could not be projected or transformed. */
const INVALID_DATA_STATUS = 502;

/**
 * Global default metric aliases (alias -> canonical metric); An alias applies to every service that
 * defines the canonical metric, unless the service defines a metric or alias with the same slug.
 */
const DEFAULT_METRIC_ALIASES: Readonly<Record<string, string>> = {
  cov: 'coverage',
  dm: 'dl',
  l: 'license',
  'last-commit': 'commit',
  pr: 'prs',
  'pull-requests': 'prs',
  pulls: 'prs',
  version: 'v',
};

/** Bounded in-isolate LRU memory cache of upstream outcomes keyed by API URL, weighted by payload size. */
const MEMORY_CACHE = createLruCache<UpstreamOutcome>(
  MAX_MEMORY_CACHE_ENTRIES,
  (outcome) => outcome.size,
  MAX_MEMORY_CACHE_WEIGHT
);

/** Pending upstream loads keyed by API URL, so concurrent badge requests share one upstream call. */
const IN_FLIGHT_LOADS = new Map<string, Promise<UpstreamOutcome>>();

/** Merged request headers per service (bounded by the number of service presets). */
const MERGED_HEADERS = new WeakMap<ServiceDefinition, MergedHeadersEntry>();

// ------------------------------------ REGEX PATTERNS -----------------------------------

/**
 * Matches a safe owner or target path segment: Word characters, dots, hyphens, `@`, and `+`,
 * rejecting dot-only segments (`..` path traversal) and bare `@` / `@@…` scope prefixes. Slashes never match, so every segment stays atomic.
 */
const SAFE_SEGMENT_RX = /^(?!\.+$)(?!@(?:$|@))[\w.@+-]{1,214}$/;

/** Matches a non-negative integer or decimal number (e.g., `Retry-After` and `x-ratelimit-*` headers). */
const NON_NEGATIVE_NUMBER_RX = /^\d+(?:\.\d+)?$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Build a resolved error badge result. */
function buildErrorResult(
  label: string,
  value: string,
  status: number,
  options: ErrorResultOptions = {}
): ResolvedServiceMetric {
  return {
    result: {
      color: options.color ?? 'rose',
      icon: options.icon ?? 'circle-alert',
      label,
      redirectUrl: options.redirectUrl ?? FALLBACK_REDIRECT_URL,
      value,
    },
    status,
  };
}

/** Build an amber `invalid route` / `missing owner` / `invalid metric` badge. */
function buildRouteErrorResult(serviceKey: string, value: string): ResolvedServiceMetric {
  return buildErrorResult(serviceKey, value, 404, { color: 'amber', icon: 'circle-help' });
}

/**
 * Check whether `target` is valid for `service`: Between `route.target.minSegments` and
 * `route.target.maxSegments` (both default `1`) `/`-separated segments, each one matching
 * `SAFE_SEGMENT_RX` and the optional `route.target.pattern`.
 */
function isTargetValid(service: ServiceDefinition, target: string): boolean {
  const { maxSegments = 1, minSegments = 1, pattern } = service.route.target;
  let segmentCount = 0;
  for (const segment of target.split('/')) {
    segmentCount += 1;
    if (
      segmentCount > maxSegments ||
      !SAFE_SEGMENT_RX.test(segment) ||
      (pattern !== undefined && !pattern.test(segment))
    ) {
      return false;
    }
  }
  return segmentCount >= minSegments;
}

/** Resolve a requested metric slug to its canonical metric key (metrics, then service aliases, then global aliases). */
function resolveMetricKey(service: ServiceDefinition, metricKey: string): string {
  if (Object.hasOwn(service.metrics, metricKey)) {
    return metricKey;
  }
  const serviceAlias = service.metricAliases
    ? getOwnValue(service.metricAliases, metricKey)
    : undefined;
  return serviceAlias ?? getOwnValue(DEFAULT_METRIC_ALIASES, metricKey) ?? metricKey;
}

/** Validate a service request and resolve its preset, metric, and effective route params. */
function resolveServiceContext(
  request: ServiceRequest
): ResolvedServiceContext | ResolvedServiceMetric {
  const serviceKey = request.service.toLowerCase();
  const service = getOwnValue(SERVICES_CONFIG, serviceKey);
  if (!service) {
    return buildErrorResult(request.service, 'unknown service', 404);
  }

  const ownerSegment = service.route.owner;
  let owner = request.owner ?? '';
  if (!ownerSegment && request.owner !== undefined) {
    return buildRouteErrorResult(serviceKey, 'invalid route');
  }
  if (ownerSegment && request.owner === undefined) {
    if (ownerSegment.isRequired) {
      return buildRouteErrorResult(serviceKey, 'missing owner');
    }
    if (ownerSegment.resolveDefault) {
      owner = ownerSegment.resolveDefault();
      if (!owner) {
        return buildRouteErrorResult(serviceKey, 'missing owner');
      }
    }
  }

  const isOwnerValid =
    owner === '' ||
    (SAFE_SEGMENT_RX.test(owner) &&
      (ownerSegment?.pattern === undefined || ownerSegment.pattern.test(owner)));
  if (!isOwnerValid || !isTargetValid(service, request.target)) {
    return buildErrorResult(serviceKey, 'invalid name', 400);
  }

  const metric = getOwnValue(
    service.metrics,
    resolveMetricKey(service, request.metric.toLowerCase())
  );
  if (!metric) {
    return buildRouteErrorResult(serviceKey, 'invalid metric');
  }

  return { metric, params: { owner, target: request.target }, service };
}

/** Narrow a `resolveServiceContext` result to an error result. */
function isResolvedError(
  candidate: ResolvedServiceContext | ResolvedServiceMetric
): candidate is ResolvedServiceMetric {
  return 'status' in candidate;
}

/** Resolve the upstream request headers of a service (memoized per service and environment). */
function resolveRequestHeaders(
  service: ServiceDefinition,
  env: Env
): Readonly<Record<string, string>> {
  if (!service.buildHeaders) {
    return DEFAULT_HEADERS;
  }
  const cached = MERGED_HEADERS.get(service);
  if (cached?.env === env) {
    return cached.headers;
  }
  const headers = { ...DEFAULT_HEADERS, ...service.buildHeaders(env) };
  MERGED_HEADERS.set(service, { env, headers });
  return headers;
}

/** Check whether a response signals an exhausted rate limit (`429`, or `403` with `x-ratelimit-remaining: 0` / `ratelimit-remaining: 0`). */
function isRateLimited(response: Response): boolean {
  if (response.status === RATE_LIMITED_STATUS) {
    return true;
  }
  if (response.status !== 403) {
    return false;
  }
  const remaining =
    response.headers.get('x-ratelimit-remaining') ?? response.headers.get('ratelimit-remaining');
  return remaining === '0';
}

/**
 * Read the seconds until a rate limit resets from `Retry-After` (seconds or HTTP date) or
 * `x-ratelimit-reset` / `ratelimit-reset` (epoch seconds like GitHub, or delta seconds; Values below
 * `RATE_LIMIT_RESET_EPOCH_THRESHOLD` are deltas); `now` is a timestamp in milliseconds.
 */
function readRetryAfter(response: Response, now: number): number | undefined {
  const retryAfter = response.headers.get('retry-after')?.trim();
  if (retryAfter) {
    if (NON_NEGATIVE_NUMBER_RX.test(retryAfter)) {
      return Number(retryAfter);
    }
    const retryAt = Date.parse(retryAfter);
    return Number.isFinite(retryAt) ? (retryAt - now) / 1000 : undefined;
  }
  const resetHeader = (
    response.headers.get('x-ratelimit-reset') ?? response.headers.get('ratelimit-reset')
  )?.trim();
  if (!resetHeader || !NON_NEGATIVE_NUMBER_RX.test(resetHeader)) {
    return undefined;
  }
  const resetValue = Number(resetHeader);
  if (resetValue >= RATE_LIMIT_RESET_EPOCH_MS_THRESHOLD) {
    return (resetValue - now) / 1000;
  }
  return resetValue < RATE_LIMIT_RESET_EPOCH_THRESHOLD ? resetValue : resetValue - now / 1000;
}

/**
 * Compute an extended logical TTL in seconds up to the rate-limit window reset (capped at
 * `MAX_ADAPTIVE_TTL`) when an upstream bucket has at most `LOW_QUOTA_RATIO` remaining.
 */
function readAdaptiveTtlSeconds(response: Response, now: number): number | undefined {
  const rawLimit = (
    response.headers.get('x-ratelimit-limit') ?? response.headers.get('ratelimit-limit')
  )?.trim();
  const rawRemaining = (
    response.headers.get('x-ratelimit-remaining') ?? response.headers.get('ratelimit-remaining')
  )?.trim();
  if (
    !rawLimit ||
    !rawRemaining ||
    !NON_NEGATIVE_NUMBER_RX.test(rawLimit) ||
    !NON_NEGATIVE_NUMBER_RX.test(rawRemaining)
  ) {
    return undefined;
  }
  const limit = Number(rawLimit);
  const remaining = Number(rawRemaining);
  if (limit <= 0 || remaining > limit * LOW_QUOTA_RATIO) {
    return undefined;
  }
  const resetSeconds = readRetryAfter(response, now);
  if (resetSeconds === undefined || resetSeconds <= 0) {
    return undefined;
  }
  return Math.min(MAX_ADAPTIVE_TTL, Math.ceil(resetSeconds));
}

/** Resolve the cache TTL in seconds of a failed upstream outcome. */
function resolveFailureTtl(status: number, retryAfter: number | undefined): number {
  if (status === 404 || status === TOO_LARGE_STATUS) {
    return NOT_FOUND_CACHE_TTL;
  }
  if (status === RATE_LIMITED_STATUS) {
    const seconds = retryAfter ?? RATE_LIMIT_CACHE_TTL.min;
    return Math.min(
      RATE_LIMIT_CACHE_TTL.max,
      Math.max(RATE_LIMIT_CACHE_TTL.min, Math.ceil(seconds))
    );
  }
  return ERROR_CACHE_TTL;
}

/** Check whether a failed outcome is cached at the edge as a negative marker. */
function isEdgeCacheableFailure(outcome: UpstreamOutcome): boolean {
  const { status } = outcome;
  return (
    !outcome.isInvalidData &&
    (status === 404 ||
      status === TOO_LARGE_STATUS ||
      status === RATE_LIMITED_STATUS ||
      status >= 500)
  );
}

/** Ignore a stream cancellation failure (the stream is discarded either way). */
function ignoreCancelError(): void {
  // Intentionally empty.
}

/**
 * Cancel a response body stream without awaiting it: Cancelling one branch of a tee'd body (e.g., a
 * cloned cache response) only settles once every branch is cancelled.
 */
function cancelBody(
  body: ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array> | null
): void {
  body?.cancel().catch(ignoreCancelError);
}

/** Check whether a character is RFC 8259 JSON whitespace. */
function isJsonWhitespace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t';
}

/** Advance past JSON whitespace starting at `index`. */
function skipJsonWhitespace(text: string, index: number): number {
  let position = index;
  while (position < text.length && isJsonWhitespace(text[position] ?? '')) {
    position += 1;
  }
  return position;
}

/** Append a slice of a wanted value to `scanner.valueBuffer`, enforcing `MAX_UPSTREAM_BYTES`. */
function appendCapturedSlice(
  scanner: JsonStreamScanner,
  chunk: string,
  start: number,
  end: number
): boolean {
  if (scanner.matchedKey === undefined || end <= start) {
    return true;
  }
  if (scanner.capturedSize + scanner.valueBuffer.length + (end - start) > MAX_UPSTREAM_BYTES) {
    scanner.isTooLarge = true;
    scanner.phase = 'mismatch';
    return false;
  }
  scanner.valueBuffer += chunk.slice(start, end);
  return true;
}

/** Parse a completed wanted value (or finish a skipped value) and advance the scanner phase. */
function finishScannedValue(scanner: JsonStreamScanner): void {
  if (scanner.matchedKey === undefined) {
    scanner.phase = 'comma-or-end';
    return;
  }
  try {
    scanner.extracted[scanner.matchedKey] = JSON.parse(scanner.valueBuffer) as unknown;
    scanner.capturedSize += scanner.valueBuffer.length;
    scanner.valueBuffer = '';
    scanner.foundKeys.add(scanner.matchedKey);
    scanner.matchedKey = undefined;
    scanner.phase = scanner.foundKeys.size >= scanner.targetKeys.size ? 'done' : 'comma-or-end';
  } catch {
    scanner.phase = 'mismatch';
  }
}

/** Scan a top-level JSON object key string starting at `startIndex` (after the opening quote). */
function scanKeyString(chunk: string, startIndex: number, scanner: JsonStreamScanner): number {
  for (let i = startIndex; i < chunk.length; i += 1) {
    const char = chunk[i];
    if (scanner.isEscaped) {
      scanner.isEscaped = false;
    } else if (char === '\\') {
      scanner.isEscaped = true;
      scanner.hasKeyEscape = true;
    } else if (char === '"') {
      scanner.keyBuffer += chunk.slice(startIndex, i);
      if (scanner.keyBuffer.length > MAX_JSON_KEY_LENGTH) {
        scanner.phase = 'mismatch';
        return i + 1;
      }
      try {
        const keyName = scanner.hasKeyEscape
          ? (JSON.parse(`"${scanner.keyBuffer}"`) as string)
          : scanner.keyBuffer;
        scanner.matchedKey = scanner.targetKeys.has(keyName) ? keyName : undefined;
        scanner.keyBuffer = '';
        scanner.phase = 'colon';
      } catch {
        scanner.phase = 'mismatch';
      }
      return i + 1;
    }
  }
  scanner.keyBuffer += chunk.slice(startIndex);
  if (scanner.keyBuffer.length > MAX_JSON_KEY_LENGTH) {
    scanner.phase = 'mismatch';
  }
  return chunk.length;
}

/** Scan a top-level string value (skipping in `O(1)` memory when unwanted, or capturing when wanted). */
function scanValueString(chunk: string, startIndex: number, scanner: JsonStreamScanner): number {
  for (let i = startIndex; i < chunk.length; i += 1) {
    const char = chunk[i];
    if (scanner.isEscaped) {
      scanner.isEscaped = false;
    } else if (char === '\\') {
      scanner.isEscaped = true;
    } else if (char === '"') {
      if (appendCapturedSlice(scanner, chunk, startIndex, i + 1)) {
        finishScannedValue(scanner);
      }
      return i + 1;
    }
  }
  appendCapturedSlice(scanner, chunk, startIndex, chunk.length);
  return chunk.length;
}

/** Scan a top-level `{…}` or `[…]` value (skipping in `O(1)` memory when unwanted, or capturing when wanted). */
function scanValueContainer(chunk: string, startIndex: number, scanner: JsonStreamScanner): number {
  for (let i = startIndex; i < chunk.length; i += 1) {
    const char = chunk[i];
    if (scanner.isInString) {
      if (scanner.isEscaped) {
        scanner.isEscaped = false;
      } else if (char === '\\') {
        scanner.isEscaped = true;
      } else if (char === '"') {
        scanner.isInString = false;
      }
    } else if (char === '"') {
      scanner.isInString = true;
    } else if (char === '{' || char === '[') {
      scanner.depth += 1;
    } else if (char === '}' || char === ']') {
      scanner.depth -= 1;
      if (scanner.depth === 0) {
        if (appendCapturedSlice(scanner, chunk, startIndex, i + 1)) {
          finishScannedValue(scanner);
        }
        return i + 1;
      }
    }
  }
  appendCapturedSlice(scanner, chunk, startIndex, chunk.length);
  return chunk.length;
}

/** Scan a top-level primitive value (`true`, `false`, `null`, or number) up to its delimiter. */
function scanValuePrimitive(chunk: string, startIndex: number, scanner: JsonStreamScanner): number {
  for (let i = startIndex; i < chunk.length; i += 1) {
    const char = chunk[i] ?? '';
    if (char === ',' || char === '}' || isJsonWhitespace(char)) {
      if (appendCapturedSlice(scanner, chunk, startIndex, i)) {
        finishScannedValue(scanner);
      }
      return i;
    }
  }
  appendCapturedSlice(scanner, chunk, startIndex, chunk.length);
  return chunk.length;
}

/** Begin scanning a top-level value at `chunk[index]` according to its leading token. */
function startValueScan(char: string, index: number, scanner: JsonStreamScanner): number {
  if (char === '"') {
    scanner.valueBuffer = scanner.matchedKey === undefined ? '' : '"';
    scanner.isEscaped = false;
    scanner.phase = 'value-string';
    return index + 1;
  }
  if (char === '{' || char === '[') {
    scanner.valueBuffer = scanner.matchedKey === undefined ? '' : char;
    scanner.depth = 1;
    scanner.isInString = false;
    scanner.isEscaped = false;
    scanner.phase = 'value-container';
    return index + 1;
  }
  if (char === '}' || char === ']' || char === ',') {
    scanner.phase = 'mismatch';
    return index + 1;
  }
  scanner.valueBuffer = '';
  scanner.phase = 'value-primitive';
  return index;
}

/** Advance a structural phase at `char`. */
function advanceStructuralPhase(char: string, index: number, scanner: JsonStreamScanner): number {
  switch (scanner.phase) {
    case 'root': {
      scanner.phase = char === '{' ? 'first-key-or-end' : 'mismatch';
      return index + 1;
    }
    case 'first-key-or-end': {
      if (char === '}') {
        scanner.phase = 'done';
      } else if (char === '"') {
        scanner.hasKeyEscape = false;
        scanner.isEscaped = false;
        scanner.keyBuffer = '';
        scanner.phase = 'key';
      } else {
        scanner.phase = 'mismatch';
      }
      return index + 1;
    }
    case 'comma-or-end': {
      if (char === '}') {
        scanner.phase = 'done';
      } else if (char === ',') {
        scanner.phase = 'next-key';
      } else {
        scanner.phase = 'mismatch';
      }
      return index + 1;
    }
    case 'next-key': {
      if (char === '"') {
        scanner.hasKeyEscape = false;
        scanner.isEscaped = false;
        scanner.keyBuffer = '';
        scanner.phase = 'key';
      } else {
        scanner.phase = 'mismatch';
      }
      return index + 1;
    }
    case 'colon': {
      scanner.phase = char === ':' ? 'value-start' : 'mismatch';
      return index + 1;
    }
    default: {
      return startValueScan(char, index, scanner);
    }
  }
}

/** Advance the streaming JSON object key extractor across a decoded chunk. */
function advanceJsonScanner(chunk: string, scanner: JsonStreamScanner): void {
  let index = 0;
  while (index < chunk.length && scanner.phase !== 'done' && scanner.phase !== 'mismatch') {
    switch (scanner.phase) {
      case 'key': {
        index = scanKeyString(chunk, index, scanner);
        break;
      }
      case 'value-string': {
        index = scanValueString(chunk, index, scanner);
        break;
      }
      case 'value-container': {
        index = scanValueContainer(chunk, index, scanner);
        break;
      }
      case 'value-primitive': {
        index = scanValuePrimitive(chunk, index, scanner);
        break;
      }
      default: {
        index = skipJsonWhitespace(chunk, index);
        if (index < chunk.length) {
          index = advanceStructuralPhase(chunk[index] ?? '', index, scanner);
        }
        break;
      }
    }
  }
}

/** Create a fresh streaming JSON key extractor for `extractKeys`. */
function createJsonStreamScanner(extractKeys: readonly string[]): JsonStreamScanner {
  return {
    capturedSize: 0,
    depth: 0,
    extracted: {},
    foundKeys: new Set<string>(),
    hasKeyEscape: false,
    isEscaped: false,
    isInString: false,
    isTooLarge: false,
    keyBuffer: '',
    matchedKey: undefined,
    phase: 'root',
    targetKeys: new Set<string>(extractKeys),
    valueBuffer: '',
  };
}

/** Resolve the top-level JSON keys to extract while streaming (`undefined` when the full body is read). */
function resolveExtractKeys(endpoint: MetricEndpoint): readonly string[] | undefined {
  if (endpoint.extractKeys && endpoint.extractKeys.length > 0) {
    return endpoint.extractKeys;
  }
  return endpoint.leadingKey === undefined ? undefined : [endpoint.leadingKey];
}

/**
 * Stream a response body and extract only `extractKeys` from the top-level JSON object: Unneeded
 * keys are skipped in `O(1)` memory, and the stream is cancelled as soon as all keys are read.
 */
async function readExtractedResponseBody(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  status: number,
  extractKeys: readonly string[]
): Promise<UpstreamBody> {
  const decoder = new TextDecoder();
  const scanner = createJsonStreamScanner(extractKeys);
  let byteCount = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Stream chunks can only be read sequentially.
    const chunk = await reader.read();
    if (chunk.done) {
      advanceJsonScanner(decoder.decode(), scanner);
      break;
    }
    byteCount += chunk.value.byteLength;
    if (byteCount > MAX_STREAM_SCAN_BYTES) {
      cancelBody(reader);
      return { status: TOO_LARGE_STATUS };
    }
    advanceJsonScanner(decoder.decode(chunk.value, { stream: true }), scanner);
    if (scanner.isTooLarge) {
      cancelBody(reader);
      return { status: TOO_LARGE_STATUS };
    }
    if (scanner.phase === 'done') {
      cancelBody(reader);
      return { data: scanner.extracted, status };
    }
    if (scanner.phase === 'mismatch') {
      cancelBody(reader);
      return { status: INVALID_DATA_STATUS };
    }
  }
  if (scanner.isTooLarge) {
    return { status: TOO_LARGE_STATUS };
  }
  return scanner.phase === 'done'
    ? { data: scanner.extracted, status }
    : { status: INVALID_DATA_STATUS };
}

/**
 * Read a response body with a byte cap; With `extractKeys`, skip unneeded keys in `O(1)` memory
 * and stop reading (cancelling the stream) as soon as all target keys are complete.
 */
async function readResponseBody(
  response: Response,
  extractKeys: readonly string[] | undefined
): Promise<UpstreamBody> {
  const { body } = response;
  if (!body) {
    return { status: response.status, text: await response.text() };
  }
  const reader = body.getReader();
  if (extractKeys !== undefined) {
    return readExtractedResponseBody(reader, response.status, extractKeys);
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let byteCount = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Stream chunks can only be read sequentially.
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    byteCount += chunk.value.byteLength;
    if (byteCount > MAX_UPSTREAM_BYTES) {
      cancelBody(reader);
      return { status: TOO_LARGE_STATUS };
    }
    buffer += decoder.decode(chunk.value, { stream: true });
  }
  return { status: response.status, text: buffer + decoder.decode() };
}

/** Read a bounded `ETag` validator from an upstream or cached `Response`. */
function readBoundedEtag(response: Response, headerName: string): string | undefined {
  const raw = response.headers.get(headerName)?.trim() ?? '';
  return raw.length > 0 && raw.length <= MAX_ETAG_LENGTH ? raw : undefined;
}

/** Read a fresh positive projected payload from the in-isolate memory cache by cache key URL. */
function peekFreshMemoryCache(cacheKeyUrl: string): unknown {
  const entry = readLruCache(MEMORY_CACHE, cacheKeyUrl);
  return entry && entry.status === 200 && entry.expiresAt > Date.now() ? entry.data : undefined;
}

/** Resolve the concrete HTTP request parameters and cache key of an endpoint call. */
function resolveFetchTarget(
  endpoint: MetricEndpoint,
  params: ServiceRouteParams,
  serviceHeaders: Readonly<Record<string, string>>,
  env: Env
): ResolvedFetchTarget {
  const custom = endpoint.buildRequest?.(params, env, peekFreshMemoryCache);
  if (!custom) {
    const apiUrl = endpoint.buildApiUrl(params);
    return {
      cacheKeyUrl: apiUrl,
      extractKeys: resolveExtractKeys(endpoint),
      headers: serviceHeaders,
      method: 'GET',
      url: apiUrl,
    };
  }
  return {
    body: custom.body,
    cacheKeyUrl: custom.cacheKey ?? custom.url,
    extractKeys: custom.extractKeys,
    headers: custom.headers ? { ...serviceHeaders, ...custom.headers } : serviceHeaders,
    method: custom.method ?? 'GET',
    send: custom.send,
    url: custom.url,
  };
}

/**
 * Fetch an upstream document body, mapping conditional `304` hits, timeouts, network errors, rate
 * limits, oversized bodies, and the endpoint's `missingStatuses` (to `404`) to statuses.
 */
async function fetchUpstreamBody(
  target: ResolvedFetchTarget,
  endpoint: MetricEndpoint,
  ifNoneMatch?: string
): Promise<UpstreamBody> {
  const requestHeaders =
    ifNoneMatch && target.method === 'GET'
      ? { ...target.headers, 'If-None-Match': ifNoneMatch }
      : target.headers;
  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT);

  let response: Response | undefined = undefined;
  try {
    response = target.send
      ? await target.send(requestHeaders, signal)
      : await fetch(target.url, {
          body: target.body,
          headers: requestHeaders,
          method: target.method,
          signal,
        });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return { status: isTimeout ? 504 : 502 };
  }

  if (response.status === NOT_MODIFIED_STATUS) {
    cancelBody(response.body);
    return {
      adaptiveTtl: readAdaptiveTtlSeconds(response, Date.now()),
      etag: readBoundedEtag(response, 'etag'),
      status: NOT_MODIFIED_STATUS,
    };
  }
  if (!response.ok) {
    cancelBody(response.body);
    if (isRateLimited(response)) {
      return { retryAfter: readRetryAfter(response, Date.now()), status: RATE_LIMITED_STATUS };
    }
    return { status: endpoint.missingStatuses?.includes(response.status) ? 404 : response.status };
  }
  if (response.status === 202) {
    cancelBody(response.body);
    return { status: 202 };
  }

  // Streaming key extractions (`extractKeys`) skip unneeded keys and stop early, so only the streaming byte counter may reject them:
  const { extractKeys } = target;
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (extractKeys === undefined && contentLength > MAX_UPSTREAM_BYTES) {
    cancelBody(response.body);
    return { status: TOO_LARGE_STATUS };
  }

  const now = Date.now();
  const adaptiveTtl = readAdaptiveTtlSeconds(response, now);
  const etag = readBoundedEtag(response, 'etag');
  const retryAfter = readRetryAfter(response, now);
  try {
    const body = await readResponseBody(response, extractKeys);
    return { ...body, adaptiveTtl, etag, retryAfter };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return { status: isTimeout ? 504 : 502 };
  }
}

/** Build a failed outcome cached for its failure TTL. */
function buildFailureOutcome(status: number, retryAfter?: number): UpstreamOutcome {
  return { expiresAt: Date.now() + resolveFailureTtl(status, retryAfter) * 1000, size: 0, status };
}

/**
 * Classify GraphQL-style error payloads (`{ errors: [...] }`) so rate-limit and server errors on
 * HTTP `200` responses map to `429` or `502` instead of being misclassified as `404 not found`.
 */
function classifyGraphQlErrorStatus(parsed: unknown): number | undefined {
  if (!isJsonObject(parsed) || !Array.isArray(parsed.errors) || parsed.errors.length === 0) {
    return undefined;
  }
  let hasNotFound = false;
  for (const entry of parsed.errors) {
    if (isJsonObject(entry)) {
      if (entry.type === 'RATE_LIMITED' || entry.code === 'graphql_rate_limit') {
        return RATE_LIMITED_STATUS;
      }
      if (entry.type === 'NOT_FOUND') {
        hasNotFound = true;
      }
    }
  }
  if (!isJsonObject(parsed.data)) {
    return hasNotFound ? 404 : 502;
  }
  const dataValues = Object.values(parsed.data);
  if (dataValues.length > 0 && dataValues.every((value) => value === null)) {
    return hasNotFound ? 404 : 502;
  }
  return undefined;
}

/** Check whether a failed revalidation should fall back to a previously cached positive projection (`stale-if-error`). */
function isStaleRescuable(outcome: UpstreamOutcome): boolean {
  if (outcome.isInvalidData) {
    return false;
  }
  return outcome.status === 202 || outcome.status === RATE_LIMITED_STATUS || outcome.status >= 500;
}

/** Parse and project a fetched body into an outcome and the serialized projection stored at the edge. */
function buildFetchedOutcome(
  fetched: UpstreamBody,
  endpoint: MetricEndpoint
): [outcome: UpstreamOutcome, edgeBody: string | undefined] {
  if (fetched.status === 202) {
    return [{ expiresAt: Date.now() + ERROR_CACHE_TTL * 1000, size: 0, status: 202 }, undefined];
  }
  if (fetched.data === undefined && fetched.text === undefined) {
    return [buildFailureOutcome(fetched.status, fetched.retryAfter), undefined];
  }
  let parsed: unknown = fetched.data;
  if (fetched.text !== undefined) {
    try {
      parsed = JSON.parse(fetched.text) as unknown;
    } catch {
      return [buildFailureOutcome(502), undefined];
    }
  }
  const graphQlErrorStatus = classifyGraphQlErrorStatus(parsed);
  if (graphQlErrorStatus !== undefined) {
    return [buildFailureOutcome(graphQlErrorStatus, fetched.retryAfter), undefined];
  }
  let projected: unknown = undefined;
  try {
    projected = endpoint.project ? endpoint.project(parsed) : (parsed ?? {});
  } catch {
    const invalid = buildFailureOutcome(INVALID_DATA_STATUS);
    return [{ ...invalid, isInvalidData: true }, undefined];
  }
  if (projected === undefined) {
    return [buildFailureOutcome(404), undefined];
  }
  // Keep the verbatim body of unprojected payloads; serialize projections (always small):
  const edgeBody =
    endpoint.project || fetched.text === undefined || parsed === null
      ? JSON.stringify(projected)
      : fetched.text;
  const effectiveTtl = Math.max(endpoint.ttl, fetched.adaptiveTtl ?? 0);
  const outcome: UpstreamOutcome = {
    data: projected,
    etag: fetched.etag,
    expiresAt: Date.now() + effectiveTtl * 1000,
    size: edgeBody.length,
    status: 200,
  };
  return [outcome, edgeBody];
}

/** Reconcile a fresh or conditional upstream response with an optional stale positive projection. */
function resolveRevalidatedOutcome(
  fetched: UpstreamBody,
  endpoint: MetricEndpoint,
  stale: UpstreamOutcome | undefined
): [outcome: UpstreamOutcome, edgeBody: string | undefined] {
  if (fetched.status === NOT_MODIFIED_STATUS) {
    if (!stale || stale.data === undefined) {
      return [buildFailureOutcome(502), undefined];
    }
    const edgeBody = JSON.stringify(stale.data);
    const effectiveTtl = Math.max(endpoint.ttl, fetched.adaptiveTtl ?? 0);
    return [
      {
        data: stale.data,
        etag: fetched.etag ?? stale.etag,
        expiresAt: Date.now() + effectiveTtl * 1000,
        size: edgeBody.length,
        status: 200,
      },
      edgeBody,
    ];
  }
  const [freshOutcome, freshEdgeBody] = buildFetchedOutcome(fetched, endpoint);
  if (stale && stale.data !== undefined && isStaleRescuable(freshOutcome)) {
    const backoffSeconds =
      freshOutcome.status === 202
        ? ERROR_CACHE_TTL
        : resolveFailureTtl(freshOutcome.status, fetched.retryAfter);
    const edgeBody = JSON.stringify(stale.data);
    return [
      {
        data: stale.data,
        etag: stale.etag,
        expiresAt: Date.now() + backoffSeconds * 1000,
        size: edgeBody.length,
        status: 200,
      },
      edgeBody,
    ];
  }
  return [freshOutcome, freshEdgeBody];
}

/** Read an edge cache entry (projected payload or negative marker) and whether its logical TTL is fresh. */
async function readEdgeCacheEntry(
  cached: Response,
  now: number
): Promise<EdgeCacheReadResult | undefined> {
  const rawExpiresAt = Number(cached.headers.get(EXPIRES_AT_HEADER) ?? '0') || 0;
  const markerStatus = Number(cached.headers.get(STATUS_HEADER) ?? '0');
  if (markerStatus > 0) {
    cancelBody(cached.body);
    if (rawExpiresAt > 0 && rawExpiresAt <= now) {
      return undefined;
    }
    return {
      isFresh: true,
      outcome: {
        expiresAt: Math.max(rawExpiresAt, now + MIN_MEMORY_LIFETIME),
        size: 0,
        status: markerStatus,
      },
    };
  }
  const etag = readBoundedEtag(cached, ETAG_HEADER);
  try {
    const text = await cached.text();
    const isFresh = rawExpiresAt === 0 || rawExpiresAt > now;
    const expiresAt = isFresh ? Math.max(rawExpiresAt, now + MIN_MEMORY_LIFETIME) : rawExpiresAt;
    return {
      isFresh,
      outcome: {
        data: JSON.parse(text) as unknown,
        etag,
        expiresAt,
        size: text.length,
        status: 200,
      },
    };
  } catch {
    return undefined;
  }
}

/** Write an outcome into the edge cache (projected payload with extended retention or negative marker), never throwing. */
async function writeEdgeCacheEntry(
  edgeCache: Cache,
  cacheKey: Request,
  outcome: UpstreamOutcome,
  edgeBody: string | undefined,
  executionCtx: WaitUntilContext | undefined
): Promise<void> {
  const isPositive = outcome.status === 200 && edgeBody !== undefined;
  if (!isPositive && !isEdgeCacheableFailure(outcome)) {
    return;
  }
  const logicalMaxAge = Math.max(1, Math.ceil((outcome.expiresAt - Date.now()) / 1000));
  const cacheMaxAge = isPositive
    ? Math.max(logicalMaxAge, POSITIVE_EDGE_RETENTION_SECONDS)
    : logicalMaxAge;
  const headers: Record<string, string> = {
    'Cache-Control': `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge}`,
    'Content-Type': 'application/json',
    [EXPIRES_AT_HEADER]: String(outcome.expiresAt),
  };
  if (isPositive && outcome.etag) {
    headers[ETAG_HEADER] = outcome.etag;
  }
  if (!isPositive) {
    headers[STATUS_HEADER] = String(outcome.status);
  }
  try {
    await putInEdgeCache(
      edgeCache,
      cacheKey,
      new Response(edgeBody ?? '', { headers }),
      executionCtx
    );
  } catch {
    // Edge cache writes are best-effort.
  }
}

/** Load an upstream JSON document through the edge cache, revalidating stale entries via `If-None-Match`. */
async function loadThroughEdgeCache(
  endpoint: MetricEndpoint,
  target: ResolvedFetchTarget,
  staleMemory: UpstreamOutcome | undefined,
  executionCtx?: WaitUntilContext
): Promise<UpstreamOutcome> {
  const edgeCache = getEdgeCache();
  const cacheKey = edgeCache
    ? new Request(`${JSON_CACHE_ORIGIN}?url=${encodeURIComponent(target.cacheKeyUrl)}`)
    : undefined;
  let staleEdge: UpstreamOutcome | undefined = undefined;

  if (edgeCache && cacheKey) {
    let cached: Response | undefined = undefined;
    try {
      cached = await edgeCache.match(cacheKey);
    } catch {
      // A failing edge cache falls through to an upstream fetch.
    }
    const edgeEntry = cached ? await readEdgeCacheEntry(cached, Date.now()) : undefined;
    if (edgeEntry?.isFresh) {
      return edgeEntry.outcome;
    }
    staleEdge = edgeEntry?.outcome;
  }

  const stale = staleEdge ?? staleMemory;
  const fetched = await fetchUpstreamBody(target, endpoint, stale?.etag);
  const [outcome, edgeBody] = resolveRevalidatedOutcome(fetched, endpoint, stale);
  if (edgeCache && cacheKey) {
    await writeEdgeCacheEntry(edgeCache, cacheKey, outcome, edgeBody, executionCtx);
  }
  return outcome;
}

/** Load an upstream JSON document via memory cache, in-flight request coalescing, and the edge cache. */
async function loadUpstreamJson(
  endpoint: MetricEndpoint,
  target: ResolvedFetchTarget,
  executionCtx?: WaitUntilContext
): Promise<UpstreamOutcome> {
  const { cacheKeyUrl } = target;
  const now = Date.now();
  const memoryEntry = readLruCache(MEMORY_CACHE, cacheKeyUrl);
  if (memoryEntry && memoryEntry.expiresAt > now) {
    return memoryEntry;
  }
  const staleMemory =
    memoryEntry && memoryEntry.status === 200 && memoryEntry.data !== undefined
      ? memoryEntry
      : undefined;
  if (memoryEntry) {
    deleteLruEntry(MEMORY_CACHE, cacheKeyUrl);
  }

  const pending = IN_FLIGHT_LOADS.get(cacheKeyUrl);
  if (pending) {
    return pending;
  }
  if (IN_FLIGHT_LOADS.size >= MAX_IN_FLIGHT_LOADS) {
    return { expiresAt: 0, size: 0, status: RATE_LIMITED_STATUS };
  }

  const load = loadThroughEdgeCache(endpoint, target, staleMemory, executionCtx)
    // A rejected load must never reject every coalesced request:
    .catch((): UpstreamOutcome => buildFailureOutcome(502))
    .then((outcome) => {
      writeLruCache(MEMORY_CACHE, cacheKeyUrl, outcome);
      return outcome;
    });
  IN_FLIGHT_LOADS.set(cacheKeyUrl, load);
  try {
    return await load;
  } finally {
    IN_FLIGHT_LOADS.delete(cacheKeyUrl);
  }
}

/** Map a failed upstream outcome to its short badge value. */
function describeUpstreamFailure(outcome: UpstreamOutcome): string {
  if (outcome.isInvalidData) {
    return 'invalid data';
  }
  switch (outcome.status) {
    case 404: {
      return 'not found';
    }
    case TOO_LARGE_STATUS: {
      return 'too large';
    }
    case RATE_LIMITED_STATUS: {
      return 'rate limited';
    }
    case 504: {
      return 'timeout';
    }
    default: {
      return 'api error';
    }
  }
}

/** Run a metric transform, mapping thrown errors (malformed upstream data) to `'invalid'`. */
function runTransform(
  metric: ServiceMetricConfig,
  data: unknown,
  params: ServiceRouteParams
): Partial<MetricResult> | undefined | 'invalid' {
  try {
    return metric.transform(data, params);
  } catch {
    return 'invalid';
  }
}

/** Merge transformed metric properties with the metric's default presentation. */
function buildMetricResult(
  metric: ServiceMetricConfig,
  transformed: Partial<MetricResult>,
  redirectUrl: string
): MetricResult {
  return {
    color: transformed.color ?? metric.defaultColor,
    dot: transformed.dot,
    icon: transformed.icon ?? metric.defaultIcon,
    label: transformed.label ?? metric.defaultLabel,
    redirectUrl,
    special: transformed.special,
    specials: transformed.specials,
    value: transformed.value ?? 'n/a',
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Clear the in-isolate memory cache and the in-flight request registry.
 */
export function resetUpstreamCaches(): void {
  clearLruCache(MEMORY_CACHE);
  IN_FLIGHT_LOADS.clear();
}

/**
 * List the effective metric aliases of a service (service aliases plus applicable global defaults).
 * @param service   Service definition.
 * @returns `[alias, canonicalMetric]` pairs, service aliases first.
 */
export function listServiceMetricAliases(
  service: ServiceDefinition
): [alias: string, metric: string][] {
  const aliases: [alias: string, metric: string][] = [];
  const serviceAliases = service.metricAliases ?? {};
  for (const [alias, metric] of Object.entries(serviceAliases)) {
    aliases.push([alias, metric]);
  }
  for (const [alias, metric] of Object.entries(DEFAULT_METRIC_ALIASES)) {
    const isShadowed =
      Object.hasOwn(serviceAliases, alias) || Object.hasOwn(service.metrics, alias);
    if (!isShadowed && Object.hasOwn(service.metrics, metric)) {
      aliases.push([alias, metric]);
    }
  }
  return aliases;
}

/**
 * Resolve the browser redirect destination of a service preset badge without any network access.
 * @param request   Parsed service preset route.
 * @returns Upstream page URL, or the fallback URL when the request is invalid.
 */
export function resolveServiceRedirectUrl(request: ServiceRequest): string {
  const context = resolveServiceContext(request);
  return isResolvedError(context)
    ? context.result.redirectUrl
    : context.metric.endpoint.buildPageUrl(context.params);
}

/**
 * Resolve a service preset badge from sample data without any network access.
 * Applies the exact same request validation, projection, and metric defaults as `resolveServiceMetric`.
 * @param request   Parsed service preset route.
 * @param sample    Sample right-hand value text (e.g., `'4.2M/mo'`) or a sample upstream JSON payload run through the projection and transform.
 * @returns Resolved metric result (an error badge when the request is invalid).
 */
export function resolveServicePreview(
  request: ServiceRequest,
  sample: ServicePreviewSample
): MetricResult {
  const context = resolveServiceContext(request);
  if (isResolvedError(context)) {
    return context.result;
  }
  const { metric, params } = context;
  const redirectUrl = metric.endpoint.buildPageUrl(params);
  if (typeof sample === 'string') {
    return buildMetricResult(metric, { value: sample }, redirectUrl);
  }
  let projected: unknown = undefined;
  try {
    projected = metric.endpoint.project ? metric.endpoint.project(sample) : sample;
  } catch {
    return buildMetricResult(metric, { color: 'rose', value: 'invalid data' }, redirectUrl);
  }
  const transformed = projected === undefined ? undefined : runTransform(metric, projected, params);
  if (transformed === 'invalid') {
    return buildMetricResult(metric, { color: 'rose', value: 'invalid data' }, redirectUrl);
  }
  return buildMetricResult(
    metric,
    transformed ?? { color: 'rose', value: 'not found' },
    redirectUrl
  );
}

/**
 * Resolve an external service metric with request validation, conditional revalidation, and multi-tier caching.
 * @param request        Parsed service preset route.
 * @param env            Cloudflare Worker environment bindings.
 * @param executionCtx   Optional Worker execution context for non-blocking cache writes.
 * @returns HTTP status code and resolved metric result (never throws).
 */
export async function resolveServiceMetric(
  request: ServiceRequest,
  env: Env,
  executionCtx?: WaitUntilContext
): Promise<ResolvedServiceMetric> {
  const context = resolveServiceContext(request);
  if (isResolvedError(context)) {
    return context;
  }

  const { metric, params, service } = context;
  const { endpoint } = metric;
  const redirectUrl = endpoint.buildPageUrl(params);
  const serviceHeaders = resolveRequestHeaders(service, env);
  const target = resolveFetchTarget(endpoint, params, serviceHeaders, env);
  const outcome = await loadUpstreamJson(endpoint, target, executionCtx);
  const errorOptions: ErrorResultOptions = { icon: metric.defaultIcon, redirectUrl };

  if (outcome.status === 202) {
    return buildErrorResult(metric.defaultLabel, 'computing', 202, {
      ...errorOptions,
      color: 'slate',
    });
  }
  if (outcome.data === undefined) {
    return buildErrorResult(
      metric.defaultLabel,
      describeUpstreamFailure(outcome),
      outcome.status,
      errorOptions
    );
  }

  const transformed = runTransform(metric, outcome.data, params);
  if (transformed === 'invalid') {
    return buildErrorResult(metric.defaultLabel, 'invalid data', INVALID_DATA_STATUS, errorOptions);
  }
  if (!transformed) {
    return buildErrorResult(metric.defaultLabel, 'not found', 404, errorOptions);
  }
  return { result: buildMetricResult(metric, transformed, redirectUrl), status: outcome.status };
}
