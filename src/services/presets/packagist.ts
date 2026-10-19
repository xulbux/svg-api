/**
 * Packagist service preset – PHP Composer package version and total/monthly/daily downloads (`/badge/packagist/:vendor/:pkg/:metric`).
 */

import { createEndpoint, createMetric, defineService, pickFields } from '@/services/endpoint';
import { createDownloadsMetric, formatVersion } from '@/services/metrics';
import type { MetricResult } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Download counters of a Packagist package. */
interface PackagistDownloads {
  /** Downloads in the last 24 hours. */
  daily?: number;
  /** Downloads in the last 30 days. */
  monthly?: number;
  /** All-time downloads. */
  total?: number;
}

/** Partial Packagist package statistics payload (`packagist.org/packages/:vendor/:pkg/stats.json`). */
interface PackagistStatsPayload {
  /** Download counters. */
  downloads: PackagistDownloads | null;
  /** Published version names, newest first (including `-dev` branches and pre-releases). */
  versions: unknown[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Packagist statistics endpoint with package page redirect. */
const PACKAGIST_ENDPOINT = createEndpoint({
  api: 'https://packagist.org/packages/{owner}/{target}/stats.json',
  page: 'https://packagist.org/packages/{owner}/{target}',
  project: pickFields<PackagistStatsPayload>(['downloads', 'versions']),
});

// ------------------------------------ REGEX PATTERNS -----------------------------------

/**
 * Matches Composer development branches and pre-release versions, anchored to the version start
 * (`dev-main`) or end (`13.x-dev`, `2.0.0-RC1`, `1.0.0-beta.2`, `3.1a2`); Patch suffixes such as
 * `-p1` and `-patch1` are stable.
 */
const UNSTABLE_VERSION_RX = /^dev-|[._-]dev$|\d[._-]?(?:alpha|beta|rc|a|b)[\d.-]*$/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Transform Packagist statistics into the latest stable version (falling back to the newest version). */
function transformPackagistVersion(stats: Partial<PackagistStatsPayload>): Partial<MetricResult> {
  const versions = Array.isArray(stats.versions) ? stats.versions : [];
  let newestVersion: string | undefined = undefined;
  for (const version of versions) {
    if (typeof version === 'string') {
      if (!UNSTABLE_VERSION_RX.test(version)) {
        return { value: formatVersion(version) };
      }
      newestVersion ??= version;
    }
  }
  return { value: formatVersion(newestVersion) };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Packagist service preset (`packagist`). */
export const PACKAGIST_SERVICE = defineService({
  docs: {
    description: 'Latest stable version and total/monthly/daily Composer installs (dt/dl/dd).',
    title: 'Packagist',
  },
  metrics: {
    dd: createDownloadsMetric(PACKAGIST_ENDPOINT, 'dd', (stats) => stats.downloads?.daily),
    dl: createDownloadsMetric(PACKAGIST_ENDPOINT, 'dl', (stats) => stats.downloads?.monthly),
    dt: createDownloadsMetric(PACKAGIST_ENDPOINT, 'dt', (stats) => stats.downloads?.total),
    v: createMetric(
      PACKAGIST_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'packagist', defaultLabel: 'packagist' },
      transformPackagistVersion
    ),
  },
  route: { owner: { isRequired: true, placeholder: ':vendor' }, target: { placeholder: ':pkg' } },
});
