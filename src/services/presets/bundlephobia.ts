/**
 * Bundlephobia service preset – Minified and gzipped bundle size of the latest version of an unscoped or scoped npm package (`/badge/bundlephobia/[:scope/]:pkg/:metric`).
 */

import { CACHE_TTL, createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createBytesMetric, encodeNpmPackageName, resolveNpmPackageName } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Bundlephobia size payload (`bundlephobia.com/api/size?package=:pkg`). */
interface BundlephobiaSizePayload {
  /** Gzipped size in bytes. */
  gzip: number;
  /** Minified size in bytes. */
  size: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Bundlephobia size endpoint (URL-encoded package name; Sizes only change with new releases). */
const BUNDLEPHOBIA_ENDPOINT = createEndpoint({
  api: ({ owner, target }) =>
    `https://bundlephobia.com/api/size?package=${encodeURIComponent(resolveNpmPackageName(owner, target))}`,
  page: ({ owner, target }) =>
    `https://bundlephobia.com/package/${encodeNpmPackageName(owner, target)}`,
  project: pickFields<BundlephobiaSizePayload>(['gzip', 'size']),
  ttl: CACHE_TTL.daily,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Bundlephobia service preset (`bundlephobia`). */
export const BUNDLEPHOBIA_SERVICE = defineService({
  docs: {
    description: 'Minified and gzipped bundle size of the latest version of any npm package.',
    title: 'Bundlephobia',
  },
  metricAliases: { minzip: 'gzip', size: 'min' },
  metrics: {
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
  route: { owner: { isRequired: false, placeholder: ':scope' }, target: { placeholder: ':pkg' } },
});
