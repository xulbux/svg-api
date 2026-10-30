/**
 * Upstream Service Fetcher
 *
 * Validates service preset requests and resolves metrics with request coalescing,
 * an in-isolate memory cache, conditional `ETag` revalidation, `stale-if-error` fallback, and Tier-1 JSON edge caching.
 *
 * Lookup order per upstream key: in-isolate memory cache -> in-flight request -> Cloudflare edge cache
 * -> conditional or fresh upstream `fetch` (with timeout and a response size cap).
 * Positive projections stay physically retained at the edge beyond their logical TTL
 * so expired entries can revalidate via `If-None-Match` (`304 Not Modified`) and survive transient `429` / `5xx` errors.
 */

import { SERVICES_CONFIG } from '@/config/services';
import { FALLBACK_REDIRECT_URL, SERVICE_USER_AGENT, SITE_HOST } from '@/config/site';
import { getEdgeCache, putInEdgeCache } from '@/services/edgeCache';
import {
  MAX_UPSTREAM_BYTES,
  UPSTREAM_TIMEOUT,
  cancelBody,
  countUtf8Bytes,
  isJsonObject,
  readBoundedResponseText,
} from '@/services/endpoint';
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
  PreparsedUpstreamResponse,
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
  /** Top-level object fields already parsed by the streaming extractor (`extractKeys`). */
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
  /** Verbatim serialized projection read from the edge cache (avoids `JSON.stringify` on `304`/rescue). */
  rawText?: string;
}

/** Result of looking up an entry in the Tier-1 JSON edge cache. */
interface EdgeCacheLookup {
  /** Synthetic cache key `Request` when the edge cache is available. */
  cacheKey?: Request;
  /** Active edge `Cache` instance when available. */
  edgeCache?: Cache;
  /** Decoded positive or negative cache entry when found and valid. */
  entry?: EdgeCacheReadResult;
}

/** Stale positive projection candidate retained across revalidation (`304` and `stale-if-error`). */
interface StaleCandidate {
  /** Expired positive outcome with non-empty `data`. */
  outcome: UpstreamOutcome;
  /** Optional already-serialized JSON body when read from the edge cache. */
  rawText?: string;
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

/** Merged upstream request headers of a service, memoized by serialized dynamic headers. */
interface MergedHeadersEntry {
  /** Serialized dynamic headers the entry was built for. */
  cacheKey: string;
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
  | 'root-end'
  | 'root-non-object'
  | 'value-container'
  | 'value-primitive'
  | 'value-start'
  | 'value-string';

/** Mutable state of the streaming top-level JSON object key extractor across chunks. */
interface JsonStreamScanner {
  /** Summed length in UTF-8 wire bytes of all already parsed wanted values. */
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
  /** Length in UTF-8 wire bytes of `valueBuffer`. */
  valueBytes: number;
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
 * Smaller values are seconds until the reset, larger ones Unix epochs.
 */
const RATE_LIMIT_RESET_EPOCH_THRESHOLD = 1_000_000_000;

/** Smallest `x-ratelimit-reset` value read as a millisecond epoch timestamp (`2001-09-09T01:46:40.000Z`). */
const RATE_LIMIT_RESET_EPOCH_MS_THRESHOLD = 1_000_000_000_000;

/** Maximum distinct upstream loads simultaneously in flight per Worker isolate (sheds random-slug cache-busting floods). */
const MAX_IN_FLIGHT_LOADS = 64;

/** Minimum remaining memory cache lifetime in milliseconds of an edge cache hit. */
const MIN_MEMORY_LIFETIME = 1000;

/**
 * Maximum wire bytes scanned by the streaming JSON key extractor:
 * Unneeded keys are discarded in `O(1)` memory while streaming, while captured values stay capped at `MAX_UPSTREAM_BYTES`.
 */
const MAX_STREAM_SCAN_BYTES = 33_554_432;

/** Maximum length in UTF-16 code units of a top-level JSON object key read by the streaming scanner. */
const MAX_JSON_KEY_LENGTH = 1024;

/** Maximum number of upstream outcomes kept in the in-isolate memory cache. */
const MAX_MEMORY_CACHE_ENTRIES = 256;

/** Maximum summed projected payload size in UTF-16 code units of the in-isolate memory cache. */
const MAX_MEMORY_CACHE_WEIGHT = 4_000_000;

/** Synthetic origin of Tier-1 JSON edge cache keys (versioned, because entries hold projections). */
const JSON_CACHE_ORIGIN = `https://internal-json-cache.${SITE_HOST}/v3/`;

/** Physical edge cache retention in seconds for positive projections, preserving `ETag` and `stale-if-error` data past logical expiry. */
const POSITIVE_EDGE_RETENTION = 604_800;

/** Maximum number of HTTPS redirect hops followed per upstream `fetch` call. */
const MAX_UPSTREAM_REDIRECTS = 5;

/** HTTP redirect statuses handled manually so scheme and origin changes are validated per hop. */
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

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
  'User-Agent': SERVICE_USER_AGENT,
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
 * Global default metric aliases (alias -> canonical metric);
 * An alias applies to every service that defines the canonical metric, unless the service defines a metric or alias with the same slug.
 */
export const DEFAULT_METRIC_ALIASES: Readonly<Record<string, string>> = {
  cov: 'coverage',
  dl: 'dt',
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

/** Pending Tier-1 edge cache reads keyed by API URL, coalescing concurrent lookups during saturation. */
const IN_FLIGHT_EDGE_READS = new Map<string, Promise<EdgeCacheLookup>>();

/** Memoized merged request headers for services with static `service.headers`. */
const STATIC_MERGED_HEADERS = new WeakMap<ServiceDefinition, Readonly<Record<string, string>>>();

/** Memoized merged request headers for services with dynamic `service.buildHeaders`. */
const DYNAMIC_MERGED_HEADERS = new WeakMap<ServiceDefinition, MergedHeadersEntry>();

/** Memoized `ReadonlySet` instances for static endpoint `extractKeys` arrays. */
const EXTRACT_KEY_SETS = new WeakMap<readonly string[], ReadonlySet<string>>();

// ------------------------------------ REGEX PATTERNS -----------------------------------

/**
 * Matches a safe owner or target path segment:
 * Word characters, dots, colons, hyphens, `@`, and `+`, rejecting dot-only (`..` path traversal), colon-only, and bare `@` / `@@…` segments.
 * Slashes never match, so every segment stays atomic.
 */
const SAFE_SEGMENT_RX = /^(?!\.+$)(?!:+$)(?!@(?:$|@))[\w.:@+-]{1,214}$/;

/** Matches a non-negative integer or decimal number (e.g., `Retry-After` and `x-ratelimit-*` headers). */
const NON_NEGATIVE_NUMBER_RX = /^\d+(?:\.\d+)?$/;

/** Matches a canonical dotted-quad IPv4 literal hostname produced by `URL.hostname`. */
const IPV4_LITERAL_RX = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Matches trailing DNS root dots on a hostname (`example.com.` -> `example.com`). */
const TRAILING_DOTS_RX = /\.+$/;

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
 * Check whether `target` is valid for `service`:
 * Between `route.target.minSegments` and `route.target.maxSegments` (both default `1`) `/`-separated segments,
 * each one matching `SAFE_SEGMENT_RX` and the optional `route.target.pattern`.
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

/**
 * Resolve a requested metric slug to its canonical metric key on `service` (metrics, then service aliases, then applicable global aliases).
 * @param service     Service definition.
 * @param metricKey   Lowercased requested metric slug.
 * @returns Canonical metric key on `service`, or `metricKey` unchanged when unknown.
 */
function resolveMetricKey(service: ServiceDefinition, metricKey: string): string {
  if (Object.hasOwn(service.metrics, metricKey)) {
    return metricKey;
  }
  const serviceAlias = service.metricAliases
    ? getOwnValue(service.metricAliases, metricKey)
    : undefined;
  if (serviceAlias !== undefined) {
    return serviceAlias;
  }
  const defaultAlias = getOwnValue(DEFAULT_METRIC_ALIASES, metricKey);
  return defaultAlias !== undefined && Object.hasOwn(service.metrics, defaultAlias)
    ? defaultAlias
    : metricKey;
}

/** Resolve a requested metric slug (or alias) to its metric configuration on `service`. */
function resolveServiceMetricConfig(
  service: ServiceDefinition,
  metric: string
): ServiceMetricConfig | undefined {
  return getOwnValue(service.metrics, resolveMetricKey(service, metric.toLowerCase()));
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
    if (ownerSegment.defaultValue !== undefined) {
      owner = ownerSegment.defaultValue;
      if (!owner) {
        return buildRouteErrorResult(serviceKey, 'missing owner');
      }
    }
  }

  const isOwnerValid =
    (request.owner === undefined && owner === '') ||
    (SAFE_SEGMENT_RX.test(owner) &&
      (ownerSegment?.pattern === undefined || ownerSegment.pattern.test(owner)));
  if (!isOwnerValid || !isTargetValid(service, request.target)) {
    return buildErrorResult(serviceKey, 'invalid name', 400);
  }

  const metric = resolveServiceMetricConfig(service, request.metric);
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

/** Resolve the upstream request headers of a service (memoized per service and dynamic header set). */
function resolveRequestHeaders(
  service: ServiceDefinition,
  env: Env
): Readonly<Record<string, string>> {
  if (!service.headers && !service.buildHeaders) {
    return DEFAULT_HEADERS;
  }
  if (!service.buildHeaders) {
    let cachedStatic = STATIC_MERGED_HEADERS.get(service);
    if (!cachedStatic) {
      cachedStatic = { ...DEFAULT_HEADERS, ...service.headers };
      STATIC_MERGED_HEADERS.set(service, cachedStatic);
    }
    return cachedStatic;
  }
  const dynamicHeaders = service.buildHeaders(env);
  let cacheKey = '';
  const keys = Object.keys(dynamicHeaders);
  if (keys.length === 1) {
    const singleKey = keys[0] ?? '';
    cacheKey = `${singleKey}\0${dynamicHeaders[singleKey] ?? ''}`;
  } else if (keys.length > 1) {
    keys.sort();
    for (const key of keys) {
      cacheKey += `${key}\0${dynamicHeaders[key] ?? ''}\0`;
    }
  }
  const cachedDynamic = DYNAMIC_MERGED_HEADERS.get(service);
  if (cachedDynamic?.cacheKey === cacheKey) {
    return cachedDynamic.headers;
  }
  const headers = { ...DEFAULT_HEADERS, ...service.headers, ...dynamicHeaders };
  DYNAMIC_MERGED_HEADERS.set(service, { cacheKey, headers });
  return headers;
}

/** Read a lowercase response header value from a `Headers` instance or plain header record. */
function readHeaderValue(
  headers: Headers | Readonly<Record<string, string>> | undefined,
  lowerName: string
): string | undefined {
  if (!headers) {
    return undefined;
  }
  if (headers instanceof Headers) {
    return headers.get(lowerName) ?? undefined;
  }
  return getOwnValue(headers, lowerName);
}

/** Check whether a response signals an exhausted rate limit (`429`, or `403` with `x-ratelimit-remaining: 0` / `ratelimit-remaining: 0`). */
function isRateLimited(
  status: number,
  headers: Headers | Readonly<Record<string, string>> | undefined
): boolean {
  if (status === RATE_LIMITED_STATUS) {
    return true;
  }
  if (status !== 403) {
    return false;
  }
  const remaining =
    readHeaderValue(headers, 'x-ratelimit-remaining') ??
    readHeaderValue(headers, 'ratelimit-remaining');
  return remaining === '0';
}

/**
 * Read the seconds until a rate limit resets from `Retry-After` (seconds or HTTP date) or `x-ratelimit-reset` / `ratelimit-reset`
 * (epoch seconds, millisecond epochs, or delta seconds; Values below `RATE_LIMIT_RESET_EPOCH_THRESHOLD` are deltas);
 * `now` is a timestamp in milliseconds.
 */
function readRetryAfter(
  headers: Headers | Readonly<Record<string, string>> | undefined,
  now: number
): number | undefined {
  const retryAfter = readHeaderValue(headers, 'retry-after')?.trim();
  if (retryAfter) {
    if (NON_NEGATIVE_NUMBER_RX.test(retryAfter)) {
      const retryDelta = Number(retryAfter);
      if (retryDelta > 0) {
        return retryDelta;
      }
    } else {
      const retryAt = Date.parse(retryAfter);
      if (Number.isFinite(retryAt) && retryAt > now) {
        return (retryAt - now) / 1000;
      }
    }
  }
  const resetHeader = (
    readHeaderValue(headers, 'x-ratelimit-reset') ?? readHeaderValue(headers, 'ratelimit-reset')
  )?.trim();
  if (!resetHeader || !NON_NEGATIVE_NUMBER_RX.test(resetHeader)) {
    return undefined;
  }
  const resetValue = Number(resetHeader);
  let resetDelta = resetValue;
  if (resetValue >= RATE_LIMIT_RESET_EPOCH_MS_THRESHOLD) {
    resetDelta = (resetValue - now) / 1000;
  } else if (resetValue >= RATE_LIMIT_RESET_EPOCH_THRESHOLD) {
    resetDelta = resetValue - now / 1000;
  }
  return resetDelta > 0 ? resetDelta : undefined;
}

/**
 * Compute an extended logical TTL in seconds up to the rate-limit window reset
 * (capped at `MAX_ADAPTIVE_TTL`) when an upstream bucket has at most `LOW_QUOTA_RATIO` remaining.
 */
function readAdaptiveTtl(
  headers: Headers | Readonly<Record<string, string>> | undefined,
  now: number,
  precomputedRetryAfter?: number
): number | undefined {
  const rawLimit = (
    readHeaderValue(headers, 'x-ratelimit-limit') ?? readHeaderValue(headers, 'ratelimit-limit')
  )?.trim();
  const rawRemaining = (
    readHeaderValue(headers, 'x-ratelimit-remaining') ??
    readHeaderValue(headers, 'ratelimit-remaining')
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
  const resetDelta = precomputedRetryAfter ?? readRetryAfter(headers, now);
  if (resetDelta === undefined || resetDelta <= 0) {
    return undefined;
  }
  return Math.min(MAX_ADAPTIVE_TTL, Math.ceil(resetDelta));
}

/** Resolve the cache TTL in seconds of a failed upstream outcome. */
function resolveFailureTtl(status: number, retryAfter: number | undefined): number {
  if (status === 404 || status === TOO_LARGE_STATUS) {
    return NOT_FOUND_CACHE_TTL;
  }
  if (status === RATE_LIMITED_STATUS) {
    const retryWindow = retryAfter ?? RATE_LIMIT_CACHE_TTL.min;
    return Math.min(
      RATE_LIMIT_CACHE_TTL.max,
      Math.max(RATE_LIMIT_CACHE_TTL.min, Math.ceil(retryWindow))
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

/** Append a slice of a wanted value to `scanner.valueBuffer`, returning `false` when `MAX_UPSTREAM_BYTES` is exceeded. */
function hasAppendedCapturedSlice(
  scanner: JsonStreamScanner,
  chunk: string,
  start: number,
  end: number
): boolean {
  if (scanner.matchedKey === undefined || end <= start) {
    return true;
  }
  const sliceBytes = countUtf8Bytes(chunk, start, end);
  if (scanner.capturedSize + scanner.valueBytes + sliceBytes > MAX_UPSTREAM_BYTES) {
    scanner.isTooLarge = true;
    scanner.phase = 'mismatch';
    return false;
  }
  scanner.valueBuffer += chunk.slice(start, end);
  scanner.valueBytes += sliceBytes;
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
    scanner.capturedSize += scanner.valueBytes;
    scanner.valueBuffer = '';
    scanner.valueBytes = 0;
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
      if (scanner.keyBuffer.length + (i - startIndex) > MAX_JSON_KEY_LENGTH) {
        scanner.phase = 'mismatch';
        return i + 1;
      }
      scanner.keyBuffer += chunk.slice(startIndex, i);
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
  if (scanner.keyBuffer.length + (chunk.length - startIndex) > MAX_JSON_KEY_LENGTH) {
    scanner.phase = 'mismatch';
    return chunk.length;
  }
  scanner.keyBuffer += chunk.slice(startIndex);
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
      if (hasAppendedCapturedSlice(scanner, chunk, startIndex, i + 1)) {
        finishScannedValue(scanner);
      }
      return i + 1;
    }
  }
  hasAppendedCapturedSlice(scanner, chunk, startIndex, chunk.length);
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
        if (hasAppendedCapturedSlice(scanner, chunk, startIndex, i + 1)) {
          finishScannedValue(scanner);
        }
        return i + 1;
      }
    }
  }
  hasAppendedCapturedSlice(scanner, chunk, startIndex, chunk.length);
  return chunk.length;
}

/** Scan a top-level primitive value (`true`, `false`, `null`, or number) up to its delimiter. */
function scanValuePrimitive(chunk: string, startIndex: number, scanner: JsonStreamScanner): number {
  for (let i = startIndex; i < chunk.length; i += 1) {
    const char = chunk[i] ?? '';
    if (char === ',' || char === '}' || isJsonWhitespace(char)) {
      if (hasAppendedCapturedSlice(scanner, chunk, startIndex, i)) {
        finishScannedValue(scanner);
      }
      return i;
    }
  }
  hasAppendedCapturedSlice(scanner, chunk, startIndex, chunk.length);
  return chunk.length;
}

/** Begin scanning a top-level value at `chunk[index]` according to its leading token. */
function startValueScan(char: string, index: number, scanner: JsonStreamScanner): number {
  const isMatched = scanner.matchedKey !== undefined;
  if (char === '"') {
    scanner.valueBuffer = isMatched ? '"' : '';
    scanner.valueBytes = isMatched ? 1 : 0;
    scanner.isEscaped = false;
    scanner.phase = 'value-string';
    return index + 1;
  }
  if (char === '{' || char === '[') {
    scanner.valueBuffer = isMatched ? char : '';
    scanner.valueBytes = isMatched ? 1 : 0;
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
  scanner.valueBytes = 0;
  scanner.phase = 'value-primitive';
  return index;
}

/** Check whether `char` can start a valid non-object root JSON value (`null`, `true`, `false`, array, string, or number). */
function isJsonNonObjectStart(char: string): boolean {
  return (
    char === '[' ||
    char === '"' ||
    char === 't' ||
    char === 'f' ||
    char === 'n' ||
    char === '-' ||
    (char >= '0' && char <= '9')
  );
}

/** Advance a structural phase at `char`. */
function advanceStructuralPhase(char: string, index: number, scanner: JsonStreamScanner): number {
  switch (scanner.phase) {
    case 'root': {
      if (char === '{') {
        scanner.phase = 'first-key-or-end';
        return index + 1;
      }
      if (isJsonNonObjectStart(char)) {
        scanner.phase = 'root-non-object';
        return index;
      }
      scanner.phase = 'mismatch';
      return index + 1;
    }
    case 'first-key-or-end': {
      if (char === '}') {
        scanner.phase = 'root-end';
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
        scanner.phase = 'root-end';
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
      case 'root-end': {
        index = skipJsonWhitespace(chunk, index);
        if (index < chunk.length) {
          scanner.phase = 'mismatch';
        }
        return;
      }
      case 'root-non-object': {
        const sliceBytes = countUtf8Bytes(chunk, index, chunk.length);
        if (scanner.valueBytes + sliceBytes > MAX_UPSTREAM_BYTES) {
          scanner.isTooLarge = true;
          scanner.phase = 'mismatch';
          return;
        }
        scanner.valueBuffer += chunk.slice(index);
        scanner.valueBytes += sliceBytes;
        return;
      }
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

/** Resolve or memoize the `ReadonlySet` of wanted top-level keys for `extractKeys`. */
function getExtractKeySet(extractKeys: readonly string[]): ReadonlySet<string> {
  const cached = EXTRACT_KEY_SETS.get(extractKeys);
  if (cached) {
    return cached;
  }
  const created = new Set<string>(extractKeys);
  EXTRACT_KEY_SETS.set(extractKeys, created);
  return created;
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
    targetKeys: getExtractKeySet(extractKeys),
    valueBuffer: '',
    valueBytes: 0,
  };
}

/** Normalize an optional `extractKeys` list (`undefined` when unset or empty so the full body is read). */
function normalizeExtractKeys(
  extractKeys: readonly string[] | undefined
): readonly string[] | undefined {
  return extractKeys && extractKeys.length > 0 ? extractKeys : undefined;
}

/**
 * Stream a response body and extract only `extractKeys` from the top-level JSON object:
 * Unneeded keys are skipped in `O(1)` memory, and the stream is cancelled as soon as all keys are read.
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
  if (scanner.phase === 'done' || scanner.phase === 'root-end') {
    return { data: scanner.extracted, status };
  }
  if (scanner.phase === 'root-non-object') {
    try {
      return { data: JSON.parse(scanner.valueBuffer) as unknown, status };
    } catch {
      return { status: INVALID_DATA_STATUS };
    }
  }
  return { status: INVALID_DATA_STATUS };
}

/**
 * Read a response body with a byte cap;
 * With `extractKeys`, skip unneeded keys in `O(1)` memory and stop reading (cancelling the stream) as soon as all target keys are complete.
 */
async function readResponseBody(
  response: Response,
  extractKeys: readonly string[] | undefined
): Promise<UpstreamBody> {
  if (extractKeys !== undefined && response.body) {
    return readExtractedResponseBody(response.body.getReader(), response.status, extractKeys);
  }
  const text = await readBoundedResponseText(response);
  return text === undefined ? { status: TOO_LARGE_STATUS } : { status: response.status, text };
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
      extractKeys: normalizeExtractKeys(endpoint.extractKeys),
      headers: serviceHeaders,
      method: 'GET',
      url: apiUrl,
    };
  }
  return {
    body: custom.body,
    cacheKeyUrl: custom.cacheKey ?? custom.url,
    extractKeys: normalizeExtractKeys(custom.extractKeys),
    headers: custom.headers ? { ...serviceHeaders, ...custom.headers } : serviceHeaders,
    method: custom.method ?? 'GET',
    send: custom.send,
    url: custom.url,
  };
}

/** Map a thrown `fetch` or stream error to its synthetic upstream HTTP status. */
function buildFetchErrorBody(error: unknown): UpstreamBody {
  const isTimeout = error instanceof Error && error.name === 'TimeoutError';
  return { status: isTimeout ? 504 : 502 };
}

/** Convert a pre-parsed custom transport result into an `UpstreamBody` without stream re-parsing. */
function buildPreparsedUpstreamBody(
  result: PreparsedUpstreamResponse,
  endpoint: MetricEndpoint
): UpstreamBody {
  const { data, headers, status } = result;
  if (status < 200 || status >= 300) {
    if (isRateLimited(status, headers)) {
      return { retryAfter: readRetryAfter(headers, Date.now()), status: RATE_LIMITED_STATUS };
    }
    return { status: endpoint.missingStatuses?.includes(status) ? 404 : status };
  }
  if (status === 202 || !headers) {
    return { data, status };
  }
  const now = Date.now();
  const retryAfter = readRetryAfter(headers, now);
  return { adaptiveTtl: readAdaptiveTtl(headers, now, retryAfter), data, retryAfter, status };
}

/** Check whether a redirect destination is a public HTTPS DNS origin outside `SITE_HOST`. */
function isSafeRedirectUrl(url: URL): boolean {
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') {
    return false;
  }
  const host = url.hostname.toLowerCase().replace(TRAILING_DOTS_RX, '');
  if (
    host === '' ||
    host === 'localhost' ||
    host === SITE_HOST ||
    host.endsWith(`.${SITE_HOST}`) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.startsWith('[') ||
    IPV4_LITERAL_RX.test(host)
  ) {
    return false;
  }
  return true;
}

/** Return a copy of `headers` without `Authorization` when following a cross-origin redirect. */
function stripCrossOriginAuthHeaders(
  headers: Readonly<Record<string, string>>
): Readonly<Record<string, string>> {
  if (!('Authorization' in headers) && !('authorization' in headers)) {
    return headers;
  }
  const stripped: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'authorization') {
      stripped[key] = value;
    }
  }
  return stripped;
}

/** Strip request body headers (`Content-Type`, `Content-Length`) when a redirect downgrades `POST` to `GET`. */
function stripPostBodyHeaders(
  headers: Readonly<Record<string, string>>
): Readonly<Record<string, string>> {
  const stripped: Record<string, string> = {};
  let hasRemoved = false;
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'content-type' || lower === 'content-length') {
      hasRemoved = true;
    } else {
      stripped[key] = value;
    }
  }
  return hasRemoved ? stripped : headers;
}

/** Follow up to `MAX_UPSTREAM_REDIRECTS` validated HTTPS redirects manually, stripping cross-origin `Authorization` headers. */
async function fetchWithSafeRedirects(
  url: string,
  method: 'GET' | 'POST',
  headers: Readonly<Record<string, string>>,
  body: string | undefined
): Promise<Response | undefined> {
  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT);
  let currentUrl = url;
  let currentOrigin: string | undefined = undefined;
  let currentMethod: 'GET' | 'POST' = method;
  let currentHeaders = headers;
  let currentBody = body;

  for (let hop = 0; hop <= MAX_UPSTREAM_REDIRECTS; hop += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Redirect hops depend on the preceding `Location` header.
    const response = await fetch(currentUrl, {
      body: currentBody,
      headers: currentHeaders,
      method: currentMethod,
      redirect: 'manual',
      signal,
    });
    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }
    cancelBody(response.body);
    if (hop === MAX_UPSTREAM_REDIRECTS) {
      return undefined;
    }
    const location = response.headers.get('location')?.trim();
    if (!location) {
      return undefined;
    }
    let resolvedUrl: URL | undefined = undefined;
    try {
      resolvedUrl = new URL(location, currentUrl);
    } catch {
      return undefined;
    }
    if (!isSafeRedirectUrl(resolvedUrl)) {
      return undefined;
    }
    currentOrigin ??= new URL(currentUrl).origin;
    if (resolvedUrl.origin !== currentOrigin) {
      currentHeaders = stripCrossOriginAuthHeaders(currentHeaders);
      currentOrigin = resolvedUrl.origin;
    }
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && currentMethod === 'POST')
    ) {
      currentMethod = 'GET';
      currentBody = undefined;
      currentHeaders = stripPostBodyHeaders(currentHeaders);
    }
    currentUrl = resolvedUrl.href;
  }
  return undefined;
}

/**
 * Fetch an upstream document body, mapping conditional `304` hits, timeouts, network errors,
 * rate limits, oversized bodies, and the endpoint's `missingStatuses` (to `404`) to statuses.
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

  let transportResult: Response | PreparsedUpstreamResponse | undefined = undefined;
  try {
    transportResult = target.send
      ? await target.send(requestHeaders)
      : await fetchWithSafeRedirects(target.url, target.method, requestHeaders, target.body);
  } catch (error) {
    return buildFetchErrorBody(error);
  }

  if (transportResult === undefined) {
    return { status: 502 };
  }
  if (!(transportResult instanceof Response)) {
    return buildPreparsedUpstreamBody(transportResult, endpoint);
  }
  const response = transportResult;

  if (
    (response.url && !response.url.startsWith('https:')) ||
    REDIRECT_STATUSES.has(response.status)
  ) {
    cancelBody(response.body);
    return { status: 502 };
  }
  if (response.status === NOT_MODIFIED_STATUS) {
    cancelBody(response.body);
    return {
      adaptiveTtl: readAdaptiveTtl(response.headers, Date.now()),
      etag: readBoundedEtag(response, 'etag'),
      status: NOT_MODIFIED_STATUS,
    };
  }
  if (!response.ok) {
    cancelBody(response.body);
    if (isRateLimited(response.status, response.headers)) {
      return {
        retryAfter: readRetryAfter(response.headers, Date.now()),
        status: RATE_LIMITED_STATUS,
      };
    }
    return { status: endpoint.missingStatuses?.includes(response.status) ? 404 : response.status };
  }
  if (response.status === 202) {
    cancelBody(response.body);
    return { status: 202 };
  }

  const now = Date.now();
  const retryAfter = readRetryAfter(response.headers, now);
  const adaptiveTtl = readAdaptiveTtl(response.headers, now, retryAfter);
  const etag = readBoundedEtag(response, 'etag');
  try {
    const body = await readResponseBody(response, target.extractKeys);
    return { ...body, adaptiveTtl, etag, retryAfter };
  } catch (error) {
    return buildFetchErrorBody(error);
  }
}

/** Build a failed outcome cached for its failure TTL. */
function buildFailureOutcome(status: number, retryAfter?: number): UpstreamOutcome {
  return { expiresAt: Date.now() + resolveFailureTtl(status, retryAfter) * 1000, size: 0, status };
}

/**
 * Classify GraphQL-style error payloads (`{ errors: […] }`) so rate-limit and server errors
 * on HTTP `200` responses map to `429` or `502` instead of being misclassified as `404 not found`.
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
  let hasDataKeys = false;
  for (const key in parsed.data) {
    if (Object.hasOwn(parsed.data, key)) {
      hasDataKeys = true;
      if (parsed.data[key] !== null) {
        return undefined;
      }
    }
  }
  if (hasDataKeys) {
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
  stale: StaleCandidate | undefined
): [outcome: UpstreamOutcome, edgeBody: string | undefined] {
  if (fetched.status === NOT_MODIFIED_STATUS) {
    if (!stale || stale.outcome.data === undefined) {
      return [buildFailureOutcome(502), undefined];
    }
    const edgeBody = stale.rawText ?? JSON.stringify(stale.outcome.data);
    const effectiveTtl = Math.max(endpoint.ttl, fetched.adaptiveTtl ?? 0);
    return [
      {
        data: stale.outcome.data,
        etag: fetched.etag ?? stale.outcome.etag,
        expiresAt: Date.now() + effectiveTtl * 1000,
        size: edgeBody.length,
        status: 200,
      },
      edgeBody,
    ];
  }
  const [freshOutcome, freshEdgeBody] = buildFetchedOutcome(fetched, endpoint);
  if (stale && stale.outcome.data !== undefined && isStaleRescuable(freshOutcome)) {
    const backoff =
      freshOutcome.status === 202
        ? ERROR_CACHE_TTL
        : resolveFailureTtl(freshOutcome.status, fetched.retryAfter);
    const edgeBody = stale.rawText ?? JSON.stringify(stale.outcome.data);
    return [
      {
        data: stale.outcome.data,
        etag: stale.outcome.etag,
        expiresAt: Date.now() + backoff * 1000,
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
  if (rawExpiresAt <= 0) {
    cancelBody(cached.body);
    return undefined;
  }
  const markerStatus = Number(cached.headers.get(STATUS_HEADER) ?? '0');
  if (markerStatus > 0) {
    cancelBody(cached.body);
    if (rawExpiresAt <= now) {
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
    const isFresh = rawExpiresAt > now;
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
      rawText: text,
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
  const cacheMaxAge = isPositive ? Math.max(logicalMaxAge, POSITIVE_EDGE_RETENTION) : logicalMaxAge;
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
  await putInEdgeCache(
    edgeCache,
    cacheKey,
    new Response(edgeBody ?? '', { headers }),
    executionCtx
  );
}

/** Perform one Tier-1 edge cache lookup for `cacheKeyUrl`. */
async function readEdgeCacheLookup(cacheKeyUrl: string): Promise<EdgeCacheLookup> {
  const edgeCache = getEdgeCache();
  if (!edgeCache) {
    return {};
  }
  const cacheKey = new Request(`${JSON_CACHE_ORIGIN}?url=${encodeURIComponent(cacheKeyUrl)}`);
  let cached: Response | undefined = undefined;
  try {
    cached = await edgeCache.match(cacheKey);
  } catch {
    // A failing edge cache falls through to an upstream fetch.
  }
  const entry = cached ? await readEdgeCacheEntry(cached, Date.now()) : undefined;
  return { cacheKey, edgeCache, entry };
}

/** Look up a Tier-1 edge cache entry for `cacheKeyUrl`, coalescing concurrent lookups per URL. */
async function matchEdgeCacheEntry(cacheKeyUrl: string): Promise<EdgeCacheLookup> {
  const pendingRead = IN_FLIGHT_EDGE_READS.get(cacheKeyUrl);
  if (pendingRead) {
    return pendingRead;
  }
  const lookupPromise = readEdgeCacheLookup(cacheKeyUrl);
  if (IN_FLIGHT_EDGE_READS.size >= MAX_IN_FLIGHT_LOADS) {
    return lookupPromise;
  }
  IN_FLIGHT_EDGE_READS.set(cacheKeyUrl, lookupPromise);
  try {
    return await lookupPromise;
  } finally {
    IN_FLIGHT_EDGE_READS.delete(cacheKeyUrl);
  }
}

/** Load an upstream JSON document through the edge cache, revalidating stale entries via `If-None-Match`. */
async function loadThroughEdgeCache(
  endpoint: MetricEndpoint,
  target: ResolvedFetchTarget,
  staleMemory: StaleCandidate | undefined,
  executionCtx?: WaitUntilContext
): Promise<UpstreamOutcome> {
  const { cacheKey, edgeCache, entry } = await matchEdgeCacheEntry(target.cacheKeyUrl);
  if (entry?.isFresh) {
    return entry.outcome;
  }
  const stale = entry ? { outcome: entry.outcome, rawText: entry.rawText } : staleMemory;
  const fetched = await fetchUpstreamBody(target, endpoint, stale?.outcome.etag);
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
  const pending = IN_FLIGHT_LOADS.get(cacheKeyUrl);
  if (pending) {
    return pending;
  }
  const staleMemory =
    memoryEntry && memoryEntry.status === 200 && memoryEntry.data !== undefined
      ? memoryEntry
      : undefined;
  if (IN_FLIGHT_LOADS.size >= MAX_IN_FLIGHT_LOADS) {
    // Serve fresh or retained Tier-1 edge cache entries before shedding load on upstream saturating bursts:
    const { entry: edgeEntry } = await matchEdgeCacheEntry(cacheKeyUrl);
    if (edgeEntry?.isFresh) {
      writeLruCache(MEMORY_CACHE, cacheKeyUrl, edgeEntry.outcome);
      return edgeEntry.outcome;
    }
    const staleOutcome =
      edgeEntry && edgeEntry.outcome.status === 200 && edgeEntry.outcome.data !== undefined
        ? edgeEntry.outcome
        : staleMemory;
    if (staleOutcome) {
      const rescued: UpstreamOutcome = {
        ...staleOutcome,
        expiresAt: Date.now() + RATE_LIMIT_CACHE_TTL.min * 1000,
      };
      writeLruCache(MEMORY_CACHE, cacheKeyUrl, rescued);
      return rescued;
    }
    if (memoryEntry) {
      deleteLruEntry(MEMORY_CACHE, cacheKeyUrl);
    }
    return { expiresAt: 0, size: 0, status: RATE_LIMITED_STATUS };
  }
  if (memoryEntry) {
    deleteLruEntry(MEMORY_CACHE, cacheKeyUrl);
  }

  const staleCandidate = staleMemory ? { outcome: staleMemory } : undefined;
  const load = loadThroughEdgeCache(endpoint, target, staleCandidate, executionCtx)
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

/** Transform projected payload data into a `ResolvedServiceMetric`, mapping invalid or empty results to error badges. */
function resolveTransformedMetric(
  metric: ServiceMetricConfig,
  projected: unknown,
  params: ServiceRouteParams,
  redirectUrl: string,
  status: number
): ResolvedServiceMetric {
  const errorOptions: ErrorResultOptions = { icon: metric.defaultIcon, redirectUrl };
  const transformed = projected === undefined ? undefined : runTransform(metric, projected, params);
  if (transformed === 'invalid') {
    return buildErrorResult(metric.defaultLabel, 'invalid data', INVALID_DATA_STATUS, errorOptions);
  }
  if (!transformed) {
    return buildErrorResult(metric.defaultLabel, 'not found', 404, errorOptions);
  }
  return { result: buildMetricResult(metric, transformed, redirectUrl), status };
}

// -------------------------------------- PUBLIC API -------------------------------------

export { resolveMetricKey };

/**
 * Check whether a parsed service preset request matches a registered service, metric (or alias), owner segment rule, and target segment pattern.
 * @param request   Parsed service preset route.
 * @returns `true` when `request` passes route and segment validation.
 */
export function isValidServiceRequest(request: ServiceRequest): boolean {
  return !isResolvedError(resolveServiceContext(request));
}

/** Clear the in-isolate memory cache and the in-flight request registry. */
export function resetUpstreamCaches(): void {
  clearLruCache(MEMORY_CACHE);
  IN_FLIGHT_EDGE_READS.clear();
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
    return buildErrorResult(metric.defaultLabel, 'invalid data', INVALID_DATA_STATUS, {
      icon: metric.defaultIcon,
      redirectUrl,
    }).result;
  }
  return resolveTransformedMetric(metric, projected, params, redirectUrl, 200).result;
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

  return resolveTransformedMetric(metric, outcome.data, params, redirectUrl, outcome.status);
}
