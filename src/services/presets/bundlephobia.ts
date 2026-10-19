/**
 * Bundlephobia service preset – Minified and gzipped bundle size of the latest version of an unscoped or scoped npm package (`/badge/bundlephobia/[:scope/]:pkg/:metric`).
 */

import { createBytesTransform, resolveNpmPackageName } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Bundlephobia size payload (`bundlephobia.com/api/size?package=:pkg`). */
interface BundlephobiaSizePayload {
  /** Gzipped size in bytes. */
  gzip: number;
  /** Minified size in bytes. */
  size: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Tier-1 JSON cache TTL in seconds (sizes only change with new releases). */
const BUNDLEPHOBIA_CACHE_TTL_SECONDS = 3600;

/** Bundlephobia size endpoint (URL-encoded package name) with package page redirect. */
const BUNDLEPHOBIA_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (scope: string, pkg: string): string =>
    `https://bundlephobia.com/api/size?package=${encodeURIComponent(resolveNpmPackageName(scope, pkg))}`,
  buildRedirectUrl: (scope: string, pkg: string): string =>
    `https://bundlephobia.com/package/${resolveNpmPackageName(scope, pkg)}`,
  cacheTtlSeconds: BUNDLEPHOBIA_CACHE_TTL_SECONDS,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Bundlephobia service preset (`bundlephobia`). */
export const BUNDLEPHOBIA_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Minified and gzipped bundle size of the latest version of any npm package.',
    ownerName: ':scope',
    targetName: ':pkg',
    title: 'Bundlephobia',
  },
  metricAliases: { minzip: 'gzip', size: 'min' },
  metrics: {
    gzip: {
      ...BUNDLEPHOBIA_ENDPOINT,
      defaultColor: 'emerald',
      defaultIcon: 'weight',
      defaultLabel: 'minzipped',
      transform: createBytesTransform<BundlephobiaSizePayload>((payload) => payload.gzip),
    },
    min: {
      ...BUNDLEPHOBIA_ENDPOINT,
      defaultColor: 'sky',
      defaultIcon: 'weight',
      defaultLabel: 'minified',
      transform: createBytesTransform<BundlephobiaSizePayload>((payload) => payload.size),
    },
  },
  ownerMode: 'optional',
};
