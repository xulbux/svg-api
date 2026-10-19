/**
 * Packagist service preset – PHP Composer package version and total/monthly/daily downloads (`/badge/packagist/:vendor/:pkg/:metric`).
 */

import {
  createCountTransform,
  formatVersion,
  RECENT_DOWNLOADS,
  TOTAL_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, MetricResult, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Packagist package statistics payload (`packagist.org/packages/:vendor/:pkg/stats.json`). */
interface PackagistStatsPayload {
  /** Download counters. */
  downloads: {
    /** Downloads in the last 24 hours. */
    daily?: number;
    /** Downloads in the last 30 days. */
    monthly?: number;
    /** All-time downloads. */
    total?: number;
  };
  /** Published version names, newest first (including `-dev` branches and pre-releases). */
  versions: string[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Packagist statistics endpoint with package page redirect. */
const PACKAGIST_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (vendor: string, pkg: string): string =>
    `https://packagist.org/packages/${vendor}/${pkg}/stats.json`,
  buildRedirectUrl: (vendor: string, pkg: string): string =>
    `https://packagist.org/packages/${vendor}/${pkg}`,
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches development branches and pre-release versions (`dev-main`, `13.x-dev`, `2.0.0-RC1`). */
const UNSTABLE_VERSION_RX = /dev|alpha|beta|rc|-(?:a|b|p)\d/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Transform Packagist statistics into the latest stable version (falling back to the newest version). */
function transformPackagistVersion(data: unknown): Partial<MetricResult> {
  const { versions } = (data ?? {}) as Partial<PackagistStatsPayload>;
  if (!Array.isArray(versions)) {
    return { value: formatVersion(undefined) };
  }
  let stableVersion: string | undefined = undefined;
  for (const version of versions) {
    if (!UNSTABLE_VERSION_RX.test(version)) {
      stableVersion = version;
      break;
    }
  }
  return { value: formatVersion(stableVersion ?? versions[0]) };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Packagist service preset (`packagist`). */
export const PACKAGIST_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Latest stable version and total/monthly/daily Composer installs.',
    ownerName: ':vendor',
    targetName: ':pkg',
    title: 'Packagist',
  },
  metricAliases: { dm: 'dl' },
  metrics: {
    dd: {
      ...PACKAGIST_ENDPOINT,
      ...RECENT_DOWNLOADS,
      defaultColor: 'sky',
      transform: createCountTransform<PackagistStatsPayload>(
        (payload) => payload.downloads?.daily,
        '/day'
      ),
    },
    dl: {
      ...PACKAGIST_ENDPOINT,
      ...RECENT_DOWNLOADS,
      transform: createCountTransform<PackagistStatsPayload>(
        (payload) => payload.downloads?.monthly,
        '/mo'
      ),
    },
    dt: {
      ...PACKAGIST_ENDPOINT,
      ...TOTAL_DOWNLOADS,
      transform: createCountTransform<PackagistStatsPayload>((payload) => payload.downloads?.total),
    },
    v: {
      ...PACKAGIST_ENDPOINT,
      defaultColor: 'orange',
      defaultIcon: 'packagist',
      defaultLabel: 'packagist',
      transform: transformPackagistVersion,
    },
  },
  ownerMode: 'required',
};
