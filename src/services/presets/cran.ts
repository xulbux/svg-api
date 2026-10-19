/**
 * CRAN service preset – R package version and license from crandb plus daily/weekly/monthly downloads from cranlogs (RStudio mirror) (`/badge/cran/:pkg/:metric`).
 */

import {
  createCountTransform,
  createFirstEntryTransform,
  createLicenseTransform,
  createVersionTransform,
  LICENSE,
  RECENT_DOWNLOADS,
  WEEKLY_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, MetricTransform, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial crandb package payload (`crandb.r-pkg.org/:pkg`). */
interface CranPackagePayload {
  /** License specification (e.g., `'MIT + file LICENSE'`). */
  License: string;
  /** Latest published version. */
  Version: string;
}

/** Single row of a cranlogs total downloads response (`cranlogs.r-pkg.org/downloads/total/:period/:pkg`). */
interface CranDownloadsEntry {
  /** Downloads in the requested period. */
  downloads: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Tier-1 JSON cache TTL in seconds for the daily refreshed cranlogs statistics. */
const CRANLOGS_CACHE_TTL_SECONDS = 3600;

/** crandb package endpoint with CRAN package page redirect. */
const CRANDB_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, pkg: string): string => `https://crandb.r-pkg.org/${pkg}`,
  buildRedirectUrl: (_owner: string, pkg: string): string =>
    `https://cran.r-project.org/package=${pkg}`,
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches the redundant `+ file LICENSE` suffix of CRAN license fields. */
const FILE_LICENSE_SUFFIX_RX = /\s*\+\s*file\s+LICEN[CS]E$/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Create a cranlogs total downloads endpoint for a period (`last-day`, `last-week`, `last-month`). */
function createCranlogsEndpoint(period: string): MetricEndpoint {
  return {
    buildApiUrl: (_owner: string, pkg: string): string =>
      `https://cranlogs.r-pkg.org/downloads/total/${period}/${pkg}`,
    buildRedirectUrl: CRANDB_ENDPOINT.buildRedirectUrl,
    cacheTtlSeconds: CRANLOGS_CACHE_TTL_SECONDS,
  };
}

/** Create a cranlogs downloads transform reading the first (only) result row. */
function createCranlogsTransform(suffix: string): MetricTransform {
  return createFirstEntryTransform<CranDownloadsEntry[]>(
    (payload) => payload,
    createCountTransform<CranDownloadsEntry>((entry) => entry.downloads, suffix)
  );
}

// -------------------------------------- PUBLIC API -------------------------------------

/** CRAN service preset (`cran`). */
export const CRAN_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Package version, license, and daily/weekly/monthly downloads (RStudio mirror).',
    targetName: ':pkg',
    title: 'CRAN',
  },
  metricAliases: { dm: 'dl', l: 'license' },
  metrics: {
    dd: {
      ...createCranlogsEndpoint('last-day'),
      ...RECENT_DOWNLOADS,
      defaultColor: 'sky',
      transform: createCranlogsTransform('/day'),
    },
    dl: {
      ...createCranlogsEndpoint('last-month'),
      ...RECENT_DOWNLOADS,
      transform: createCranlogsTransform('/mo'),
    },
    dw: {
      ...createCranlogsEndpoint('last-week'),
      ...WEEKLY_DOWNLOADS,
      transform: createCranlogsTransform('/wk'),
    },
    license: {
      ...CRANDB_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<CranPackagePayload>((payload) =>
        payload.License?.replace(FILE_LICENSE_SUFFIX_RX, '')
      ),
    },
    v: {
      ...CRANDB_ENDPOINT,
      defaultColor: 'blue',
      defaultIcon: 'r',
      defaultLabel: 'cran',
      transform: createVersionTransform<CranPackagePayload>((payload) => payload.Version),
    },
  },
  ownerMode: 'none',
};
