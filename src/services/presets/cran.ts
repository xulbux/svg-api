/**
 * CRAN service preset – R package version and license from crandb plus daily/weekly/monthly downloads from cranlogs (RStudio mirror) (`/badge/cran/:pkg/:metric`).
 */

import {
  CACHE_TTL,
  createEndpoint,
  defineService,
  pickFields,
  projectFirstEntry,
} from '@/services/endpoint';
import {
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
} from '@/services/metrics';
import type { MetricEndpoint } from '@/types';

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

/** crandb package endpoint with CRAN package page redirect. */
const CRANDB_ENDPOINT = createEndpoint({
  api: 'https://crandb.r-pkg.org/{target}',
  page: 'https://cran.r-project.org/package={target}',
  project: pickFields<CranPackagePayload>(['License', 'Version']),
});

/** Projection of the first (only) cranlogs row (an empty list is not found). */
const CRANLOGS_PROJECTION = projectFirstEntry<CranDownloadsEntry>(undefined, ['downloads']);

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches the redundant `+ file LICENSE` suffix of CRAN license fields. */
const FILE_LICENSE_SUFFIX_RX = /\s*\+\s*file\s+LICEN[CS]E$/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Create a cranlogs total downloads endpoint for a period (`last-day`, `last-week`, `last-month`; Refreshed daily). */
function createCranlogsEndpoint(period: string): MetricEndpoint<Partial<CranDownloadsEntry>> {
  return createEndpoint({
    api: `https://cranlogs.r-pkg.org/downloads/total/${period}/{target}`,
    page: 'https://cran.r-project.org/package={target}',
    project: CRANLOGS_PROJECTION,
    ttl: CACHE_TTL.daily,
  });
}

// -------------------------------------- PUBLIC API -------------------------------------

/** CRAN service preset (`cran`). */
export const CRAN_SERVICE = defineService({
  docs: {
    description: 'Package version, license, and daily/weekly/monthly downloads (dd/dw/dl).',
    title: 'CRAN',
  },
  metrics: {
    dd: createDownloadsMetric(createCranlogsEndpoint('last-day'), 'dd', (row) => row.downloads),
    dl: createDownloadsMetric(createCranlogsEndpoint('last-month'), 'dl', (row) => row.downloads),
    dw: createDownloadsMetric(createCranlogsEndpoint('last-week'), 'dw', (row) => row.downloads),
    license: createLicenseMetric(CRANDB_ENDPOINT, (pkg) =>
      typeof pkg.License === 'string' ? pkg.License.replace(FILE_LICENSE_SUFFIX_RX, '') : undefined
    ),
    v: createVersionMetric(
      CRANDB_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'r', defaultLabel: 'cran' },
      (pkg) => pkg.Version
    ),
  },
  route: { target: { placeholder: ':pkg' } },
});
