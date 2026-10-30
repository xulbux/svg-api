/**
 * Shared Test Helpers
 *
 * Worker environment bindings, SVG attribute extraction, client bundle evaluation, and an in-memory edge cache stub shared by the test suites.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
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

/** Cached concatenated TypeScript module sources per client bundle directory. */
const CLIENT_SOURCE_CACHE: Partial<Record<'builder' | 'site', string>> = {};

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
 * Count non-overlapping occurrences of `needle` inside `haystack`.
 * @param haystack   Source string to scan.
 * @param needle     Non-empty substring to count.
 * @returns Number of non-overlapping matches (`0` when `needle` is empty).
 */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let offset = 0;
  while (true) {
    const matchIndex = haystack.indexOf(needle, offset);
    if (matchIndex === -1) {
      return count;
    }
    count += 1;
    offset = matchIndex + needle.length;
  }
}

/**
 * Create an in-memory edge cache stub keyed by request URL.
 * Install it with `vi.stubGlobal('caches', { default: stub.cache })` and undo it with `vi.unstubAllGlobals()`.
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

/**
 * Evaluate a bundled browser client script without a DOM and return its exposed global core object.
 * @param bundleSource   Bundled JavaScript source text.
 * @param exportName     Property name attached onto `globalThis` by the script.
 * @returns Exposed pure helper object.
 * @throws {Error} When the script does not expose `exportName` without a DOM.
 */
export function evaluateClientCore<T>(bundleSource: string, exportName: string): T {
  const sandbox: Record<string, unknown> = {};
  // oxlint-disable-next-line typescript/no-implied-eval, no-new-func -- Evaluates the exact shipped browser bundle in an isolated sandbox.
  new Function('globalThis', bundleSource)(sandbox);
  const exposed = sandbox[exportName];
  if (exposed === undefined) {
    throw new Error(`The client bundle did not expose ${exportName} without a DOM.`);
  }
  return exposed as T;
}

/**
 * Evaluate a bundled browser client script against an explicit map of injected globals.
 * @param bundleSource   Bundled JavaScript source text.
 * @param globals        Injected global identifiers and values passed into the sandboxed wrapper.
 */
export function evaluateClientDom(
  bundleSource: string,
  globals: Readonly<Record<string, unknown>>
): void {
  const paramNames = Object.keys(globals);
  const paramValues = paramNames.map((name) => globals[name]);
  // oxlint-disable-next-line typescript/no-implied-eval, no-new-func -- Executes the shipped browser bundle against a minimal DOM sandbox.
  new Function(...paramNames, bundleSource)(...paramValues);
}

/**
 * Read and concatenate the TypeScript source modules of a browser client (`src/site/client/<kind>/*.ts`),
 * so structural source guards stay independent of `esbuild` minification while runtime tests execute the shipped bundle.
 * @param clientKind   Client bundle directory name.
 * @returns Concatenated TypeScript module source text.
 */
export function readClientModuleSources(clientKind: 'builder' | 'site'): string {
  const cached = CLIENT_SOURCE_CACHE[clientKind];
  if (cached !== undefined) {
    return cached;
  }
  const clientDir = path.resolve(import.meta.dirname, '../src/site/client', clientKind);
  const filenames = readdirSync(clientDir)
    .filter((filename) => filename.endsWith('.ts'))
    .toSorted();
  const sources: string[] = [];
  for (const filename of filenames) {
    sources.push(readFileSync(path.join(clientDir, filename), { encoding: 'utf8' }));
  }
  const combined = sources.join('\n');
  CLIENT_SOURCE_CACHE[clientKind] = combined;
  return combined;
}
