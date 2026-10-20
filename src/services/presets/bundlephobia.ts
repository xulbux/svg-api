/**
 * Bundlephobia service preset – Minified size, gzipped size, and dependency count of the latest version of an unscoped or scoped npm package (`/badge/bundlephobia/[:scope/]:pkg/:metric`).
 */

import {
  CACHE_TTL,
  NPM_PACKAGE_ROUTE,
  createEndpoint,
  defineService,
  pickFields,
} from '@/services/endpoint';
import { createBytesMetric, createCountMetric } from '@/services/metrics';

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
      { defaultColor: 'indigo', defaultIcon: 'package', defaultLabel: 'dependencies' },
      (sizes) => sizes.dependencyCount
    ),
    gzip: createBytesMetric(
      BUNDLEPHOBIA_ENDPOINT,
      { defaultColor: 'emerald', defaultIcon: 'weight', defaultLabel: 'minzipped' },
      (sizes) => sizes.gzip
    ),
    min: createBytesMetric(
      BUNDLEPHOBIA_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'weight', defaultLabel: 'minified' },
      (sizes) => sizes.size
    ),
  },
  route: NPM_PACKAGE_ROUTE,
});
