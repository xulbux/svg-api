/**
 * Bundlephobia Service Preset
 *
 * Live upstream metrics and redirect transformations for Bundlephobia.
 */

import {
  CACHE_TTL,
  NPM_PACKAGE_ROUTE,
  createEndpoint,
  defineService,
  pickFields,
} from '@/services/endpoint';
import {
  RATIO_DELTA_SPECIALS,
  buildRatioSpecials,
  createBytesMetric,
  createCountMetric,
  formatDeltaPercent,
} from '@/services/metrics';
import type { BadgeSpecialMap } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Bundlephobia size payload (`bundlephobia.com/api/size?package=:pkg`). */
interface BundlephobiaSizePayload {
  /** Direct dependency count. */
  dependencyCount: number;
  /** Gzipped size in bytes. */
  gzip: number;
  /** Minified size in bytes. */
  size: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Bundlephobia size endpoint (URL-encoded package name; Sizes only change with new releases). */
const BUNDLEPHOBIA_ENDPOINT = createEndpoint({
  api: 'https://bundlephobia.com/api/size?package={npm-id}',
  page: 'https://bundlephobia.com/package/{npm}',
  project: pickFields<BundlephobiaSizePayload>(['dependencyCount', 'gzip', 'size']),
  ttl: CACHE_TTL.daily,
});

// -------------------------------------- INTERNALS --------------------------------------

/** Build `bar`, `ring`, and compression `delta` (`gzip` vs `size`) widgets. */
function buildBundleSizeSpecials(
  sizes: Partial<BundlephobiaSizePayload>
): BadgeSpecialMap | undefined {
  const ratio = buildRatioSpecials(sizes.gzip, sizes.size);
  const delta = formatDeltaPercent(sizes.gzip, sizes.size);
  if (!ratio && !delta) {
    return undefined;
  }
  return { ...ratio, ...(delta ? { delta: { type: 'delta', value: delta } } : {}) };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Bundlephobia service preset (`bundlephobia`). */
export const BUNDLEPHOBIA_SERVICE = defineService({
  docs: {
    description:
      'Minified size, gzipped size, and dependency count of the latest version of any npm package.',
    title: 'Bundlephobia',
  },
  metricAliases: { dependencies: 'deps', minzip: 'gzip', size: 'min' },
  metrics: {
    deps: createCountMetric(
      BUNDLEPHOBIA_ENDPOINT,
      { defaultColor: 'indigo', defaultIcon: 'package', defaultLabel: 'Dependencies' },
      (sizes) => sizes.dependencyCount
    ),
    gzip: createBytesMetric(
      BUNDLEPHOBIA_ENDPOINT,
      {
        autoSpecials: RATIO_DELTA_SPECIALS,
        defaultColor: 'emerald',
        defaultIcon: 'weight',
        defaultLabel: 'Minzipped',
      },
      (sizes) => sizes.gzip,
      buildBundleSizeSpecials
    ),
    min: createBytesMetric(
      BUNDLEPHOBIA_ENDPOINT,
      {
        autoSpecials: RATIO_DELTA_SPECIALS,
        defaultColor: 'sky',
        defaultIcon: 'weight',
        defaultLabel: 'Minified',
      },
      (sizes) => sizes.size,
      buildBundleSizeSpecials
    ),
  },
  route: NPM_PACKAGE_ROUTE,
});
