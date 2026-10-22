/**
 * Upstream service fetcher – Validates service preset requests and resolves metrics with request coalescing, an in-isolate memory cache, and Tier-1 JSON edge caching.
 *
 * Lookup order per upstream URL: in-isolate memory cache -> in-flight request -> Cloudflare edge
 * cache -> upstream `fetch` (with timeout and a response size cap). Only the endpoint projection
 * of a payload is kept in both caches, and failures are cached briefly as small markers. Failures
 * never throw; They resolve to error badges.
 */

import { SERVICES_CONFIG } from '@/config/services';
import { FALLBACK_REDIRECT_URL, SITE_HOST, SITE_ORIGIN } from '@/config/site';
import { getEdgeCache, putInEdgeCache } from '@/services/edgeCache';
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
  WaitUntilContext,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Outcome of loading an upstream JSON document (also the in-isolate memory cache entry). */
interface UpstreamOutcome {
  /** Projected payload (only present for successful `2xx` responses other than `202`). */
  data?: unknown;
  /** Expiry timestamp of the outcome in milliseconds. */
  expiresAt: number;
  /** Whether the payload could not be projected (rendered as `invalid data`). */
  isInvalidData?: boolean;
  /** Serialized projected payload size in UTF-16 code units (`0` for failures; Weighs memory cache entries). */
  size: number;
  /** Upstream HTTP status (`504` for timeouts, `502` for network or JSON errors, `413` for oversized bodies). */
  status: number;
}

/** Raw upstream response body before JSON parsing and projection. */
interface UpstreamBody {
  /** Leading value already parsed by the streaming prefix reader (`{ [leadingKey]: value }`). */
  data?: unknown;
  /** Seconds until a rate limit resets (`Retry-After` or `x-ratelimit-reset`). */
  retryAfter?: number;
  /** Upstream HTTP status (`504` for timeouts, `502` for network errors, `413` for oversized bodies). */
  status: number;
  /** Complete response body (successful responses without a parsed leading value). */
  text?: string;
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
  /** Theme color token (defaults to `rose`). */
  color?: ThemeColorName;
  /** Icon slug (defaults to `circle-alert`). */
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

/** Minimum remaining memory cache lifetime in milliseconds of an edge cache hit. */
const MIN_MEMORY_LIFETIME = 1000;

/** Upstream request timeout in milliseconds. */
const UPSTREAM_TIMEOUT = 8000;

/** Maximum upstream response body size in bytes (larger bodies resolve to a `too large` badge). */
const MAX_UPSTREAM_BYTES = 2_097_152;

/**
 * Maximum wire bytes scanned by the streaming JSON key extractor (`32 MB`): Unneeded keys are
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
const JSON_CACHE_ORIGIN = 'https://internal-json-cache.xul.is/v2/';

/** Edge cache entry header holding the outcome expiry timestamp in milliseconds. */
const EXPIRES_AT_HEADER = 'X-Svg-Api-Expires-At';

/** Edge cache entry header holding the upstream status of negative outcome markers. */
const STATUS_HEADER = 'X-Svg-Api-Status';

/** Default upstream request headers. */
const DEFAULT_HEADERS: Readonly<Record<string, string>> = {
  Accept: 'application/json',
  'User-Agent': `svg-api/1.0 (${SITE_ORIGIN})`,
};

/** HTTP status of rate-limited upstream responses (GitHub's `403` + `x-ratelimit-remaining: 0` is normalized to it). */
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
 * Matches a safe owner or target path segment: Word characters, dots, hyphens, `@` (npm scopes,
 * Homebrew `python@3.12`), and `+` (Homebrew `gtk+3`), but not dots only (blocks `..` path
 * traversal into other upstream API routes). Slashes never match, so every segment stays atomic.
 */
const SAFE_SEGMENT_RX = /^(?!\.+$)[\w.@+-]{1,214}$/;

/** Matches a non-negative integer (delta-seconds `Retry-After` and epoch `x-ratelimit-reset` values). */
const DIGITS_RX = /^\d+$/;

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

/** Check whether `owner` is permitted by the service's owner allowlist. */
function isOwnerAllowed(service: ServiceDefinition, owner: string, env: Env): boolean {
  if (!service.allowedOwners) {
    return true;
  }
  const ownerLower = owner.toLowerCase();
  for (const allowed of service.allowedOwners(env)) {
    const allowedLower = allowed.toLowerCase();
    if (allowedLower === '*' || allowedLower === ownerLower) {
      return true;
    }
  }
  return false;
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
  request: ServiceRequest,
  env: Env
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
      owner = ownerSegment.resolveDefault(env) ?? '';
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
  if (!isOwnerAllowed(service, owner, env)) {
    return buildErrorResult(SITE_HOST, 'restricted', 403, { icon: 'lock' });
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

/** Read a non-expired upstream outcome from the in-isolate memory cache (`now` in milliseconds). */
function readMemoryCache(apiUrl: string, now: number): UpstreamOutcome | undefined {
  const outcome = readLruCache(MEMORY_CACHE, apiUrl);
  if (!outcome) {
    return undefined;
  }
  if (outcome.expiresAt <= now) {
    deleteLruEntry(MEMORY_CACHE, apiUrl);
    return undefined;
  }
  return outcome;
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
    if (DIGITS_RX.test(retryAfter)) {
      return Number(retryAfter);
    }
    const retryAt = Date.parse(retryAfter);
    return Number.isFinite(retryAt) ? (retryAt - now) / 1000 : undefined;
  }
  const resetHeader = (
    response.headers.get('x-ratelimit-reset') ?? response.headers.get('ratelimit-reset')
  )?.trim();
  if (!resetHeader || !DIGITS_RX.test(resetHeader)) {
    return undefined;
  }
  const resetValue = Number(resetHeader);
  return resetValue < RATE_LIMIT_RESET_EPOCH_THRESHOLD ? resetValue : resetValue - now / 1000;
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

/** Check whether a failed outcome is cached at the edge as a negative marker (`404`, `413`, `429`, `5xx`). */
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

/** Advance a structural phase (`root`, `first-key-or-end`, `comma-or-end`, `next-key`, `colon`, `value-start`) at `char`. */
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

/**
 * Fetch an upstream document body, mapping timeouts, network errors, rate limits, oversized bodies,
 * and the endpoint's `missingStatuses` (to `404`) to statuses.
 */
async function fetchUpstreamBody(
  apiUrl: string,
  headers: Readonly<Record<string, string>>,
  endpoint: MetricEndpoint
): Promise<UpstreamBody> {
  let response: Response | undefined = undefined;
  try {
    response = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT) });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return { status: isTimeout ? 504 : 502 };
  }
  if (!response.ok) {
    cancelBody(response.body);
    if (isRateLimited(response)) {
      return { retryAfter: readRetryAfter(response, Date.now()), status: RATE_LIMITED_STATUS };
    }
    return { status: endpoint.missingStatuses?.includes(response.status) ? 404 : response.status };
  }
  // Streaming key extractions (`extractKeys`) skip unneeded keys and stop early, so only the streaming byte counter may reject them.
  const extractKeys = resolveExtractKeys(endpoint);
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (extractKeys === undefined && contentLength > MAX_UPSTREAM_BYTES) {
    cancelBody(response.body);
    return { status: TOO_LARGE_STATUS };
  }
  try {
    return await readResponseBody(response, extractKeys);
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return { status: isTimeout ? 504 : 502 };
  }
}

/** Build a failed outcome cached for its failure TTL. */
function buildFailureOutcome(status: number, retryAfter?: number): UpstreamOutcome {
  return { expiresAt: Date.now() + resolveFailureTtl(status, retryAfter) * 1000, size: 0, status };
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
  // Keep the verbatim body of unprojected payloads; Serialize projections (always small).
  const edgeBody =
    endpoint.project || fetched.text === undefined ? JSON.stringify(projected) : fetched.text;
  const outcome: UpstreamOutcome = {
    data: projected,
    expiresAt: Date.now() + endpoint.ttl * 1000,
    size: edgeBody.length,
    status: fetched.status,
  };
  return [outcome, edgeBody];
}

/** Read an edge cache entry (projected payload or negative marker) into an outcome, or `undefined` when corrupt. */
async function readEdgeCacheEntry(cached: Response): Promise<UpstreamOutcome | undefined> {
  const now = Date.now();
  const expiresAt = Math.max(
    Number(cached.headers.get(EXPIRES_AT_HEADER) ?? '0') || 0,
    now + MIN_MEMORY_LIFETIME
  );
  const markerStatus = Number(cached.headers.get(STATUS_HEADER) ?? '0');
  if (markerStatus > 0) {
    cancelBody(cached.body);
    return { expiresAt, size: 0, status: markerStatus };
  }
  try {
    const text = await cached.text();
    return { data: JSON.parse(text) as unknown, expiresAt, size: text.length, status: 200 };
  } catch {
    return undefined;
  }
}

/** Write an outcome into the edge cache (projected payload or negative marker), never throwing. */
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
  const maxAge = Math.max(1, Math.ceil((outcome.expiresAt - Date.now()) / 1000));
  const headers: Record<string, string> = {
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    'Content-Type': 'application/json',
    [EXPIRES_AT_HEADER]: String(outcome.expiresAt),
  };
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

/** Load an upstream JSON document through the edge cache, writing projections and negative markers back. */
async function loadThroughEdgeCache(
  endpoint: MetricEndpoint,
  apiUrl: string,
  headers: Readonly<Record<string, string>>,
  executionCtx?: WaitUntilContext
): Promise<UpstreamOutcome> {
  const edgeCache = getEdgeCache();
  const cacheKey = edgeCache
    ? new Request(`${JSON_CACHE_ORIGIN}?url=${encodeURIComponent(apiUrl)}`)
    : undefined;

  if (edgeCache && cacheKey) {
    let cached: Response | undefined = undefined;
    try {
      cached = await edgeCache.match(cacheKey);
    } catch {
      // A failing edge cache falls through to a fresh upstream fetch.
    }
    const cachedOutcome = cached ? await readEdgeCacheEntry(cached) : undefined;
    // A corrupt cache entry falls through to a fresh upstream fetch.
    if (cachedOutcome) {
      return cachedOutcome;
    }
  }

  const fetched = await fetchUpstreamBody(apiUrl, headers, endpoint);
  const [outcome, edgeBody] = buildFetchedOutcome(fetched, endpoint);
  if (edgeCache && cacheKey) {
    await writeEdgeCacheEntry(edgeCache, cacheKey, outcome, edgeBody, executionCtx);
  }
  return outcome;
}

/** Load an upstream JSON document via memory cache, in-flight request coalescing, and the edge cache. */
async function loadUpstreamJson(
  endpoint: MetricEndpoint,
  apiUrl: string,
  headers: Readonly<Record<string, string>>,
  executionCtx?: WaitUntilContext
): Promise<UpstreamOutcome> {
  const memoryHit = readMemoryCache(apiUrl, Date.now());
  if (memoryHit) {
    return memoryHit;
  }

  const pending = IN_FLIGHT_LOADS.get(apiUrl);
  if (pending) {
    return pending;
  }

  const load = loadThroughEdgeCache(endpoint, apiUrl, headers, executionCtx)
    // A rejected load must never reject every coalesced request.
    .catch((): UpstreamOutcome => buildFailureOutcome(502))
    .then((outcome) => {
      writeLruCache(MEMORY_CACHE, apiUrl, outcome);
      return outcome;
    });
  IN_FLIGHT_LOADS.set(apiUrl, load);
  try {
    return await load;
  } finally {
    IN_FLIGHT_LOADS.delete(apiUrl);
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
 * Clear the in-isolate memory cache and the in-flight request registry (used for test isolation).
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
 * @param env       Worker environment bindings.
 * @returns Upstream page URL, or the fallback URL when the request is invalid or restricted.
 */
export function resolveServiceRedirectUrl(request: ServiceRequest, env: Env): string {
  const context = resolveServiceContext(request, env);
  return isResolvedError(context)
    ? context.result.redirectUrl
    : context.metric.endpoint.buildPageUrl(context.params);
}

/**
 * Resolve a service preset badge from sample data without any network access (used by the docs previews).
 * Applies the exact same request validation, projection, and metric defaults as `resolveServiceMetric`.
 * @param request   Parsed service preset route.
 * @param env       Worker environment bindings.
 * @param sample    Sample right-hand value text (e.g., `'4.2M/mo'`) or a sample upstream JSON payload run through the projection and transform.
 * @returns Resolved metric result (an error badge when the request is invalid).
 */
export function resolveServicePreview(
  request: ServiceRequest,
  env: Env,
  sample: ServicePreviewSample
): MetricResult {
  const context = resolveServiceContext(request, env);
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
 * Resolve an external service metric with request validation, owner allowlisting, and multi-tier caching.
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
  const context = resolveServiceContext(request, env);
  if (isResolvedError(context)) {
    return context;
  }

  const { metric, params, service } = context;
  const { endpoint } = metric;
  const apiUrl = endpoint.buildApiUrl(params);
  const redirectUrl = endpoint.buildPageUrl(params);
  const headers = resolveRequestHeaders(service, env);
  const outcome = await loadUpstreamJson(endpoint, apiUrl, headers, executionCtx);
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
