/**
 * Upstream service fetcher – Validates service preset requests and resolves metrics with request coalescing, an in-isolate memory cache, and Tier-1 JSON edge caching.
 *
 * Lookup order per upstream URL: in-isolate memory cache -> in-flight request -> Cloudflare edge
 * cache -> upstream `fetch` (with timeout). Failures never throw; They resolve to error badges.
 */

import { SERVICES_CONFIG } from '@/config/services';
import { FALLBACK_REDIRECT_URL, SITE_ORIGIN } from '@/config/site';
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
  MetricResult,
  ResolvedServiceMetric,
  ServiceDefinition,
  ServiceMetricConfig,
  ServicePreviewSample,
  ServiceRequest,
  ThemeColorName,
  WaitUntilContext,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Outcome of loading an upstream JSON document. */
interface UpstreamOutcome {
  /** Parsed JSON payload (only present for successful `2xx` responses). */
  data?: unknown;
  /** Serialized payload size in UTF-16 code units (`0` for failures; Weighs memory cache entries). */
  size: number;
  /** Upstream HTTP status (`504` for timeouts, `502` for network or JSON errors). */
  status: number;
}

/** Raw upstream response body before JSON parsing. */
interface UpstreamText {
  /** Upstream HTTP status (`504` for timeouts, `502` for network errors). */
  status: number;
  /** Response body (only present for successful `2xx` responses). */
  text?: string;
}

/** Entry of the bounded in-isolate memory cache. */
interface MemoryCacheEntry {
  /** Expiry timestamp in milliseconds. */
  expiresAt: number;
  /** Cached upstream outcome. */
  outcome: UpstreamOutcome;
}

/** Validated service request with its resolved preset, metric, and owner. */
interface ResolvedServiceContext {
  /** Resolved metric configuration. */
  metric: ServiceMetricConfig;
  /** Effective owner (explicit, default, or empty). */
  owner: string;
  /** Resolved service definition. */
  service: ServiceDefinition;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default Tier-1 upstream JSON cache TTL in seconds. */
const DEFAULT_JSON_CACHE_TTL = 600;

/** Memory cache TTL in seconds for failed or pending upstream outcomes. */
const ERROR_CACHE_TTL = 60;

/** Upstream request timeout in milliseconds. */
const UPSTREAM_TIMEOUT_MS = 8000;

/** Maximum number of upstream outcomes kept in the in-isolate memory cache. */
const MAX_MEMORY_CACHE_ENTRIES = 256;

/**
 * Maximum summed payload size in UTF-16 code units of the in-isolate memory cache; Larger payloads
 * (e.g., huge PyPI release lists) are still served from the edge cache, just not kept parsed in memory.
 */
const MAX_MEMORY_CACHE_WEIGHT = 4_000_000;

/** Synthetic origin used to build Tier-1 JSON edge cache keys. */
const JSON_CACHE_ORIGIN = 'https://internal-json-cache.xul.is/';

/** Default upstream request headers. */
const DEFAULT_HEADERS: Readonly<Record<string, string>> = {
  Accept: 'application/json',
  'User-Agent': `svg-api/1.0 (${SITE_ORIGIN})`,
};

/** HTTP status of rate-limited upstream responses (GitHub's `403` + `x-ratelimit-remaining: 0` is normalized to it). */
const RATE_LIMITED_STATUS = 429;

/** Bounded in-isolate LRU memory cache of upstream outcomes keyed by API URL, weighted by payload size. */
const MEMORY_CACHE = createLruCache<MemoryCacheEntry>(
  MAX_MEMORY_CACHE_ENTRIES,
  (entry) => entry.outcome.size,
  MAX_MEMORY_CACHE_WEIGHT
);

/** Pending upstream loads keyed by API URL, so concurrent badge requests share one upstream call. */
const IN_FLIGHT_LOADS = new Map<string, Promise<UpstreamOutcome>>();

// ------------------------------------ REGEX PATTERNS -----------------------------------

/**
 * Matches a safe owner or target path segment: Word characters, dots, hyphens, `@` (npm scopes,
 * Homebrew `python@3.12`), and `+` (Homebrew `gtk+3`), but not dots only (blocks `..` path
 * traversal into other upstream API routes). Slashes never match, so every segment stays atomic.
 */
const SAFE_SEGMENT_RX = /^(?!\.+$)[\w.@+-]{1,214}$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Build a resolved error badge result. */
function buildErrorResult(
  label: string,
  value: string,
  status: number,
  options: { color?: ThemeColorName; icon?: string; redirectUrl?: string } = {}
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
 * Check whether `target` is valid for `service`: At most `maxTargetSegments` (default `1`)
 * `/`-separated segments, each one matching `SAFE_SEGMENT_RX`.
 */
function isTargetValid(service: ServiceDefinition, target: string): boolean {
  const maxSegments = service.maxTargetSegments ?? 1;
  let segmentCount = 0;
  for (const segment of target.split('/')) {
    segmentCount += 1;
    if (segmentCount > maxSegments || !SAFE_SEGMENT_RX.test(segment)) {
      return false;
    }
  }
  return true;
}

/** Validate a service request and resolve its preset, metric, and effective owner. */
function resolveServiceContext(
  request: ServiceRequest,
  env: Env
): ResolvedServiceContext | ResolvedServiceMetric {
  const serviceKey = request.service.toLowerCase();
  const service = getOwnValue(SERVICES_CONFIG, serviceKey);
  if (!service) {
    return buildErrorResult(request.service, 'unknown service', 404);
  }

  const hasExplicitOwner = request.owner !== undefined;
  if (service.ownerMode === 'none' && hasExplicitOwner) {
    return buildErrorResult(serviceKey, 'invalid route', 404, {
      color: 'amber',
      icon: 'circle-help',
    });
  }
  if (service.ownerMode === 'required' && !hasExplicitOwner) {
    return buildErrorResult(serviceKey, 'missing owner', 404, {
      color: 'amber',
      icon: 'circle-help',
    });
  }

  const owner = request.owner ?? service.defaultOwner?.(env) ?? '';
  const isOwnerValid = owner === '' || SAFE_SEGMENT_RX.test(owner);
  if (!isOwnerValid || !isTargetValid(service, request.target)) {
    return buildErrorResult(serviceKey, 'invalid name', 400);
  }
  if (!isOwnerAllowed(service, owner, env)) {
    return buildErrorResult('svg.xul.is', 'restricted', 403, { icon: 'lock' });
  }

  const metricKey = request.metric.toLowerCase();
  const canonicalKey = service.metricAliases
    ? (getOwnValue(service.metricAliases, metricKey) ?? metricKey)
    : metricKey;
  const metric = getOwnValue(service.metrics, canonicalKey);
  if (!metric) {
    return buildErrorResult(serviceKey, 'invalid metric', 404, {
      color: 'amber',
      icon: 'circle-help',
    });
  }

  return { metric, owner, service };
}

/** Narrow a `resolveServiceContext` result to an error result. */
function isResolvedError(
  candidate: ResolvedServiceContext | ResolvedServiceMetric
): candidate is ResolvedServiceMetric {
  return 'status' in candidate;
}

/** Read a non-expired upstream outcome from the in-isolate memory cache. */
function readMemoryCache(apiUrl: string, nowMs: number): UpstreamOutcome | undefined {
  const entry = readLruCache(MEMORY_CACHE, apiUrl);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= nowMs) {
    deleteLruEntry(MEMORY_CACHE, apiUrl);
    return undefined;
  }
  return entry.outcome;
}

/** Store an upstream outcome in the in-isolate memory cache for `ttlSeconds`. */
function writeMemoryCache(apiUrl: string, outcome: UpstreamOutcome, ttlSeconds: number): void {
  writeLruCache(MEMORY_CACHE, apiUrl, { expiresAt: Date.now() + ttlSeconds * 1000, outcome });
}

/** Check whether a response signals an exhausted rate limit (`429`, or GitHub's `403` with no remaining quota). */
function isRateLimited(response: Response): boolean {
  return (
    response.status === RATE_LIMITED_STATUS ||
    (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')
  );
}

/** Fetch an upstream document body, mapping timeouts, network errors, and rate limits to statuses. */
async function fetchUpstreamText(
  apiUrl: string,
  headers: Readonly<Record<string, string>>
): Promise<UpstreamText> {
  let response: Response | undefined = undefined;
  try {
    response = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return { status: isTimeout ? 504 : 502 };
  }
  if (!response.ok) {
    return { status: isRateLimited(response) ? RATE_LIMITED_STATUS : response.status };
  }
  try {
    return { status: response.status, text: await response.text() };
  } catch {
    return { status: 502 };
  }
}

/** Parse a JSON document body into an outcome, mapping invalid JSON to `502`. */
function parseJsonOutcome(text: string, status: number): UpstreamOutcome {
  try {
    return { data: JSON.parse(text) as unknown, size: text.length, status };
  } catch {
    return { size: 0, status: 502 };
  }
}

/** Load an upstream JSON document through the edge cache, writing successful `200` bodies back verbatim. */
async function loadThroughEdgeCache(
  apiUrl: string,
  headers: Readonly<Record<string, string>>,
  ttlSeconds: number,
  executionCtx?: WaitUntilContext
): Promise<UpstreamOutcome> {
  const edgeCache = getEdgeCache();
  const cacheKey = new Request(`${JSON_CACHE_ORIGIN}?url=${encodeURIComponent(apiUrl)}`);

  if (edgeCache) {
    const cachedResponse = await edgeCache.match(cacheKey);
    if (cachedResponse) {
      const cachedOutcome = parseJsonOutcome(await cachedResponse.text(), 200);
      // A corrupt cache entry falls through to a fresh upstream fetch.
      if (cachedOutcome.data !== undefined) {
        return cachedOutcome;
      }
    }
  }

  const fetched = await fetchUpstreamText(apiUrl, headers);
  if (fetched.text === undefined) {
    return { size: 0, status: fetched.status };
  }
  const outcome = parseJsonOutcome(fetched.text, fetched.status);
  if (edgeCache && outcome.status === 200) {
    const bodyToCache = new Response(fetched.text, {
      headers: {
        'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
        'Content-Type': 'application/json',
      },
    });
    await putInEdgeCache(edgeCache, cacheKey, bodyToCache, executionCtx);
  }
  return outcome;
}

/** Load an upstream JSON document via memory cache, in-flight request coalescing, and the edge cache. */
async function loadUpstreamJson(
  apiUrl: string,
  headers: Readonly<Record<string, string>>,
  ttlSeconds: number,
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

  const load = loadThroughEdgeCache(apiUrl, headers, ttlSeconds, executionCtx).then((outcome) => {
    writeMemoryCache(apiUrl, outcome, outcome.status === 200 ? ttlSeconds : ERROR_CACHE_TTL);
    return outcome;
  });
  IN_FLIGHT_LOADS.set(apiUrl, load);
  try {
    return await load;
  } finally {
    IN_FLIGHT_LOADS.delete(apiUrl);
  }
}

/** Map a failed upstream status to its short badge value. */
function describeUpstreamFailure(status: number): string {
  switch (status) {
    case 404: {
      return 'not found';
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
 * Resolve the browser redirect destination of a service preset badge without any network access.
 * @param request   Parsed service preset route.
 * @param env       Worker environment bindings.
 * @returns Upstream page URL, or the fallback URL when the request is invalid or restricted.
 */
export function resolveServiceRedirectUrl(request: ServiceRequest, env: Env): string {
  const context = resolveServiceContext(request, env);
  return isResolvedError(context)
    ? context.result.redirectUrl
    : context.metric.buildRedirectUrl(context.owner, request.target);
}

/**
 * Resolve a service preset badge from sample data without any network access (used by the docs previews).
 * Applies the exact same request validation and metric defaults as `resolveServiceMetric`.
 * @param request   Parsed service preset route.
 * @param env       Worker environment bindings.
 * @param sample    Sample right-hand value text (e.g., `'4.2M/mo'`) or a sample upstream JSON payload run through the metric transform.
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
  const redirectUrl = context.metric.buildRedirectUrl(context.owner, request.target);
  const transformed =
    typeof sample === 'string'
      ? { value: sample }
      : (context.metric.transform(sample, context.owner, request.target) ?? { value: 'not found' });
  return buildMetricResult(context.metric, transformed, redirectUrl);
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

  const { metric, owner, service } = context;
  const apiUrl = metric.buildApiUrl(owner, request.target);
  const redirectUrl = metric.buildRedirectUrl(owner, request.target);
  const headers = service.buildHeaders
    ? { ...DEFAULT_HEADERS, ...service.buildHeaders(env) }
    : DEFAULT_HEADERS;
  const ttlSeconds = metric.cacheTtlSeconds ?? DEFAULT_JSON_CACHE_TTL;
  const outcome = await loadUpstreamJson(apiUrl, headers, ttlSeconds, executionCtx);
  const errorOptions = { icon: metric.defaultIcon, redirectUrl };

  if (outcome.status === 202) {
    return buildErrorResult(metric.defaultLabel, 'computing', 202, {
      ...errorOptions,
      color: 'slate',
    });
  }
  if (outcome.data === undefined) {
    return buildErrorResult(
      metric.defaultLabel,
      describeUpstreamFailure(outcome.status),
      outcome.status,
      errorOptions
    );
  }

  const transformed = metric.transform(outcome.data, owner, request.target);
  if (!transformed) {
    return buildErrorResult(metric.defaultLabel, 'not found', 404, errorOptions);
  }
  return { result: buildMetricResult(metric, transformed, redirectUrl), status: outcome.status };
}
