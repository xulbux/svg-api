/**
 * Hex.pm service preset – Live upstream metrics and redirect transformations.
 */

import {
  PACKAGE_ROUTE,
  asJsonObject,
  createEndpoint,
  defineService,
  isJsonObject,
} from '@/services/endpoint';
import {
  DELTA_SPECIALS,
  buildWindowDeltaSpecials,
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
  readFiniteNumber,
  readLicenseName,
  readText,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Hex.pm package metadata (`hex.pm/api/packages/:pkg`). */
interface HexPackageProjection {
  /** All-time downloads. */
  all?: number;
  /** First SPDX license identifier from `meta.licenses`. */
  license?: string;
  /** Downloads in the last 90 days. */
  recent?: number;
  /** Latest stable version (falling back to the latest version). */
  version?: string;
  /** Downloads in the last 7 days. */
  week?: number;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Project a Hex.pm package payload to its download counters, version, and license. */
function projectHexPackage(data: unknown): HexPackageProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const downloads = asJsonObject(data.downloads);
  const meta = asJsonObject(data.meta);
  return {
    all: readFiniteNumber(downloads?.all),
    license: readLicenseName(meta?.licenses),
    recent: readFiniteNumber(downloads?.recent),
    version: readText(data.latest_stable_version) ?? readText(data.latest_version),
    week: readFiniteNumber(downloads?.week),
  };
}

/** Hex.pm package endpoint with package page redirect. */
const HEX_ENDPOINT = createEndpoint({
  api: 'https://hex.pm/api/packages/{target}',
  extractKeys: ['downloads', 'latest_stable_version', 'latest_version', 'meta'],
  page: 'https://hex.pm/packages/{target}',
  project: projectHexPackage,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Hex.pm service preset (`hex`). */
export const HEX_SERVICE = defineService({
  docs: {
    description: 'Latest stable version, all-time/90-day/weekly downloads (dt/dq/dw), and license.',
    title: 'Hex.pm',
  },
  // `dl` reported the 90-day downloads before the download keys were normalized:
  metricAliases: { dl: 'dq' },
  metrics: {
    dq: createDownloadsMetric(HEX_ENDPOINT, 'dq', (pkg) => pkg.recent),
    dt: createDownloadsMetric(HEX_ENDPOINT, 'dt', (pkg) => pkg.all),
    dw: createDownloadsMetric(
      HEX_ENDPOINT,
      'dw',
      (pkg) => pkg.week,
      { autoSpecials: DELTA_SPECIALS },
      (pkg) => buildWindowDeltaSpecials(pkg.week, 7, pkg.recent, 90)
    ),
    license: createLicenseMetric(HEX_ENDPOINT, (pkg) => pkg.license),
    v: createVersionMetric(
      HEX_ENDPOINT,
      { defaultColor: 'violet', defaultIcon: 'elixir', defaultLabel: 'Hex' },
      (pkg) => pkg.version
    ),
  },
  route: PACKAGE_ROUTE,
});
