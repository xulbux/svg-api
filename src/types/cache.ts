/**
 * Cache Types
 *
 * Bounded, weight-budgeted in-isolate LRU cache state.
 */

// ---------------------------------------- TYPES ----------------------------------------

/** Bounded least-recently-used cache state backed by an insertion-ordered `Map` (oldest entries first). */
export interface LruCache<V> {
  /** Cached values keyed by cache key, least recently used first (`undefined` is never stored). */
  entries: Map<string, V>;
  /** Maximum number of entries. */
  maxEntries: number;
  /** Maximum summed weight of all entries; Single entries heavier than this are never cached. */
  maxWeight: number;
  /** Current summed weight of all entries. */
  totalWeight: number;
  /** Computes the weight of a value (e.g., its serialized size in UTF-16 code units). */
  weigh: (value: V) => number;
}
