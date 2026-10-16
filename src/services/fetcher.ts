/**
 * Upstream service fetcher – Resolves service preset metrics with Tier-1 JSON edge caching.
 */

import { SERVICES_CONFIG } from '@/config/services';
import type {
  Env,
  ResolvedServiceMetric,
  ServiceDefinition,
  ServiceMetricConfig,
  WaitUntilContext,
} from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Default fallback redirect URL when a service or metric is invalid or restricted. */
const FALLBACK_REDIRECT_URL = 'https://xul.is';

/** Default Tier-1 upstream JSON cache TTL in seconds. */
const DEFAULT_JSON_CACHE_TTL = 600;

// -------------------------------------- INTERNALS --------------------------------------

/** Retrieve the Cloudflare Workers default edge cache if available in the current runtime. */
function getEdgeCache(): Cache | undefined {
  if (typeof caches !== 'undefined' && 'default' in caches) {
    return caches.default;
  }
  return undefined;
}

/** Build a standardized `403` restricted badge response when an owner or target is not allowlisted. */
function buildRestrictedResponse(): ResolvedServiceMetric {
  return {
    result: {
      color: 'rose',
      icon: 'lock',
      label: 'badge.xul.is',
      redirectUrl: FALLBACK_REDIRECT_URL,
      value: 'restricted',
    },
    status: 403,
  };
}

/** Check whether the requested `owner` and `target` are permitted by the service's allowlists. */
function isTargetAllowed(
  service: ServiceDefinition,
  owner: string,
  target: string,
  env: Env
): boolean {
  if (service.allowedOwners) {
    const allowedOwners = new Set(
      service.allowedOwners(env).map((ownerItem) => ownerItem.toLowerCase())
    );
    if (!allowedOwners.has('*') && !allowedOwners.has(owner.toLowerCase())) {
      return false;
    }
  }

  if (service.allowedTargets && service.allowedTargets.length > 0) {
    const allowedTargets = new Set(
      service.allowedTargets.map((targetItem) => targetItem.toLowerCase())
    );
    if (!allowedTargets.has(target.toLowerCase())) {
      return false;
    }
  }

  return true;
}

/** Fetch upstream API JSON with Tier-1 Cloudflare edge cache lookup and write-through. */
async function fetchUpstreamJson(
  serviceKey: string,
  metric: ServiceMetricConfig,
  apiUrl: string,
  redirectUrl: string,
  env: Env,
  executionCtx?: WaitUntilContext
): Promise<{ data?: unknown; errorResult?: ResolvedServiceMetric }> {
  const ttlSeconds = metric.cacheTtlSeconds ?? DEFAULT_JSON_CACHE_TTL;
  const edgeCache = getEdgeCache();
  const cacheKey = new Request(
    `https://internal-json-cache.xul.is/?url=${encodeURIComponent(apiUrl)}`,
    { method: 'GET' }
  );

  const cachedResponse = edgeCache ? await edgeCache.match(cacheKey) : undefined;
  if (cachedResponse) {
    return { data: await cachedResponse.json() };
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'xul-badge-engine/1.0 (https://badge.xul.is)',
  };
  if (serviceKey === 'gh' && env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const upstreamResponse = await fetch(apiUrl, { headers });
  if (!upstreamResponse.ok) {
    return {
      errorResult: {
        result: {
          color: 'rose',
          icon: metric.defaultIcon,
          label: metric.defaultLabel,
          redirectUrl,
          value: upstreamResponse.status === 404 ? 'not found' : 'api error',
        },
        status: upstreamResponse.status,
      },
    };
  }

  const rawData: unknown = await upstreamResponse.json();
  if (edgeCache) {
    const jsonToCache = Response.json(rawData, {
      headers: { 'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}` },
    });
    const cachePromise = edgeCache.put(cacheKey, jsonToCache);
    if (executionCtx) {
      executionCtx.waitUntil(cachePromise);
    } else {
      await cachePromise;
    }
  }

  return { data: rawData };
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Resolve an external service metric with owner/target allowlist validation and Tier-1 JSON caching.
 * @param serviceName    Service identifier (`'gh'` or `'pypi'`).
 * @param ownerInput     Explicit owner segment from the route, or `undefined` to use the default owner.
 * @param target         Repository or package name.
 * @param metricName     Metric slug (e.g., `'stars'`, `'forks'`, `'v'`, `'dl'`).
 * @param env            Cloudflare Worker environment bindings.
 * @param executionCtx   Optional Worker execution context for non-blocking cache writes.
 * @returns HTTP status code and resolved metric result.
 */
export async function resolveServiceMetric(
  serviceName: string,
  ownerInput: string | undefined,
  target: string,
  metricName: string,
  env: Env,
  executionCtx?: WaitUntilContext
): Promise<ResolvedServiceMetric> {
  const serviceKey = serviceName.toLowerCase();
  const service = SERVICES_CONFIG[serviceKey];
  if (!service) {
    return {
      result: {
        color: 'rose',
        icon: 'circle-alert',
        label: serviceName,
        redirectUrl: FALLBACK_REDIRECT_URL,
        value: 'unknown service',
      },
      status: 404,
    };
  }

  const owner = ownerInput || (service.defaultOwner ? service.defaultOwner(env) : '');
  if (!isTargetAllowed(service, owner, target, env)) {
    return buildRestrictedResponse();
  }

  const metric = service.metrics[metricName.toLowerCase()];
  if (!metric) {
    return {
      result: {
        color: 'amber',
        icon: 'circle-help',
        label: serviceName,
        redirectUrl: FALLBACK_REDIRECT_URL,
        value: 'invalid metric',
      },
      status: 404,
    };
  }

  const apiUrl = metric.buildApiUrl(owner, target);
  const redirectUrl = metric.buildRedirectUrl(owner, target);
  const upstream = await fetchUpstreamJson(
    serviceKey,
    metric,
    apiUrl,
    redirectUrl,
    env,
    executionCtx
  );
  if (upstream.errorResult) {
    return upstream.errorResult;
  }

  const transformed = metric.transform(upstream.data, owner, target);

  return {
    result: {
      color: transformed.color ?? metric.defaultColor,
      dot: transformed.dot,
      icon: transformed.icon ?? metric.defaultIcon,
      label: transformed.label ?? metric.defaultLabel,
      redirectUrl,
      sparkline: transformed.sparkline,
      value: transformed.value ?? 'n/a',
    },
    status: 200,
  };
}
