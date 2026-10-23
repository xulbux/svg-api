/**
 * Shared test helpers – Worker environment bindings, SVG attribute extraction, and an in-memory edge cache stub shared by the test suites.
 */

import { vi } from 'vitest';
import type { Env } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** In-memory `caches.default` stub with inspectable stored entries and call counts. */
export interface EdgeCacheStub {
  /** Stub `Cache` implementing `match` and `put` (other methods are never used by the Worker). */
  cache: Cache;
  /** Cache key URLs passed to `match`, in call order. */
  matchedKeys: string[];
  /** Stored response bodies keyed by cache key URL. */
  store: Map<string, Response>;
  /** Cache key URLs passed to `put`, in call order. */
  storedKeys: string[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default unauthenticated test Worker environment bindings. */
export const TEST_ENV: Env = {};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches the `aria-label` attribute of a rendered SVG and captures its value. */
export const ARIA_LABEL_RX = /aria-label="(?<label>[^"]*)"/;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Extract the `aria-label` attribute of a rendered SVG.
 * @param svg   Complete SVG markup.
 * @returns Attribute value (still XML-escaped), or `undefined` when missing.
 */
export function extractAriaLabel(svg: string): string | undefined {
  return ARIA_LABEL_RX.exec(svg)?.groups?.label;
}

/**
 * Narrow a value the test requires to exist (e.g., an indexed array element), failing loudly otherwise.
 * @param value         Possibly missing value.
 * @param description   Human-readable name used in the failure message.
 * @returns The defined value.
 * @throws {Error} When `value` is `undefined`.
 */
export function requireDefined<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`Expected ${description} to be defined`);
  }
  return value;
}

/**
 * Create an in-memory edge cache stub keyed by request URL; Install it with
 * `vi.stubGlobal('caches', { default: stub.cache })` and undo it with `vi.unstubAllGlobals()`.
 * @returns Edge cache stub with its backing store and call logs.
 */
export function createEdgeCacheStub(): EdgeCacheStub {
  const store = new Map<string, Response>();
  const matchedKeys: string[] = [];
  const storedKeys: string[] = [];
  const cache = {
    match(request: Request): Promise<Response | undefined> {
      matchedKeys.push(request.url);
      return Promise.resolve(store.get(request.url)?.clone());
    },
    put(request: Request, response: Response): Promise<void> {
      storedKeys.push(request.url);
      store.set(request.url, response);
      return Promise.resolve();
    },
  };
  // @ts-expect-error: The Worker only calls `match` and `put`; The remaining `Cache` methods are intentionally absent.
  const stubCache: Cache = cache;
  return { cache: stubCache, matchedKeys, store, storedKeys };
}

/**
 * Create and install an in-memory edge cache stub as `caches.default` (undo with `vi.unstubAllGlobals()`).
 * @returns Installed edge cache stub with its backing store and call logs.
 */
export function installEdgeCacheStub(): EdgeCacheStub {
  const stub = createEdgeCacheStub();
  vi.stubGlobal('caches', { default: stub.cache });
  return stub;
}
