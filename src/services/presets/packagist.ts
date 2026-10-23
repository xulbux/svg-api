/**
 * Packagist service preset – Live upstream metrics and redirect transformations.
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  DELTA_SPECIALS,
  buildWindowDeltaSpecials,
  createDownloadsMetric,
  createVersionMetric,
  readFiniteNumber,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Packagist package statistics (`packagist.org/packages/:vendor/:pkg/stats.json`). */
interface PackagistStatsProjection {
  /** Downloads in the last 24 hours. */
  daily?: number;
  /** Downloads in the last 30 days. */
  monthly?: number;
  /** All-time downloads. */
  total?: number;
  /** Latest stable version (falling back to the newest published version). */
  version?: string;
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/**
 * Matches Composer development branches and pre-release versions, anchored to the version start
 * (`dev-main`) or end (`13.x-dev`, `2.0.0-RC1`, `1.0.0-beta.2`, `3.1a2`); Patch suffixes such as
 * `-p1` and `-patch1` are stable.
 */
const UNSTABLE_VERSION_RX = /^dev-|[._-]dev$|\d[._-]?(?:alpha|beta|rc|a|b)[\d.-]*$/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Read the latest stable version from Packagist's `versions` list (falling back to the newest version). */
function readStablePackagistVersion(rawVersions: unknown): string | undefined {
  if (!Array.isArray(rawVersions)) {
    return undefined;
  }
  let newestVersion: string | undefined = undefined;
  for (const version of rawVersions) {
    if (typeof version === 'string') {
      if (!UNSTABLE_VERSION_RX.test(version)) {
        return version;
      }
      newestVersion ??= version;
    }
  }
  return newestVersion;
}

/** Project Packagist statistics to its download counters and resolved version string. */
function projectPackagistStats(data: unknown): PackagistStatsProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const downloads = isJsonObject(data.downloads) ? data.downloads : undefined;
  return {
    daily: readFiniteNumber(downloads?.daily),
    monthly: readFiniteNumber(downloads?.monthly),
    total: readFiniteNumber(downloads?.total),
    version: readStablePackagistVersion(data.versions),
  };
}

/** Packagist statistics endpoint with package page redirect. */
const PACKAGIST_ENDPOINT = createEndpoint({
  api: 'https://packagist.org/packages/{owner}/{target}/stats.json',
  page: 'https://packagist.org/packages/{owner}/{target}',
  project: projectPackagistStats,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Packagist service preset (`packagist`). */
export const PACKAGIST_SERVICE = defineService({
  docs: {
    description: 'Latest stable version and total/monthly/daily Composer installs (dt/dl/dd).',
    title: 'Packagist',
  },
  metrics: {
    dd: createDownloadsMetric(
      PACKAGIST_ENDPOINT,
      'dd',
      (stats) => stats.daily,
      { autoSpecials: DELTA_SPECIALS },
      (stats) => buildWindowDeltaSpecials(stats.daily, 1, stats.monthly, 30)
    ),
    dl: createDownloadsMetric(PACKAGIST_ENDPOINT, 'dl', (stats) => stats.monthly),
    dt: createDownloadsMetric(PACKAGIST_ENDPOINT, 'dt', (stats) => stats.total),
    v: createVersionMetric(
      PACKAGIST_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'packagist', defaultLabel: 'Packagist' },
      (stats) => stats.version
    ),
  },
  route: { owner: { isRequired: true, placeholder: ':vendor' }, target: { placeholder: ':pkg' } },
});
