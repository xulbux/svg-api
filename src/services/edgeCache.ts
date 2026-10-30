/**
 * Edge Cache Helpers
 *
 * Access to the Cloudflare Workers default Cache API with non-blocking writes.
 */

import type { WaitUntilContext } from '@/types';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Retrieve the Cloudflare Workers default edge cache if available in the current runtime.
 * @returns Default `Cache` instance, or `undefined` when unavailable (e.g., in unit tests).
 */
export function getEdgeCache(): Cache | undefined {
  if (typeof caches !== 'undefined' && 'default' in caches) {
    return caches.default;
  }
  return undefined;
}

/**
 * Write a `Response` into the Cloudflare edge cache, using `executionCtx.waitUntil` when available.
 * @param edgeCache      Active edge `Cache` instance.
 * @param cacheKey       Cache key `Request`.
 * @param response       `Response` to store.
 * @param executionCtx   Optional Worker execution context.
 */
export async function putInEdgeCache(
  edgeCache: Cache,
  cacheKey: Request,
  response: Response,
  executionCtx?: WaitUntilContext
): Promise<void> {
  let cachePromise: Promise<void> | undefined = undefined;
  try {
    cachePromise = edgeCache.put(cacheKey, response).catch(() => undefined);
  } catch {
    return;
  }
  if (executionCtx) {
    executionCtx.waitUntil(cachePromise);
  } else {
    await cachePromise;
  }
}
