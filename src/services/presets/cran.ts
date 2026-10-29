/**
 * CRAN service preset – Live upstream metrics and redirect transformations.
 */

import {
  CACHE_TTL,
  PACKAGE_ROUTE,
  createEndpoint,
  defineService,
  isJsonObject,
  pickFields,
  readFirstObjectEntry,
} from '@/services/endpoint';
import {
  SERIES_DELTA_SPECIALS,
  bucketSeries,
  buildSeriesSpecials,
  compareTrailingWindows,
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
  readFiniteNumber,
  sumSeries,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial crandb package payload (`crandb.r-pkg.org/:pkg`). */
interface CranPackagePayload {
  /** License specification (e.g., `'MIT + file LICENSE'`). */
  License: string;
  /** Latest published version. */
  Version: string;
}

/** Projected cranlogs daily downloads (`cranlogs.r-pkg.org/downloads/daily/last-month/:pkg`). */
interface CranDownloadsProjection {
  /** Bucketed 30-day download histogram. */
  bars30d?: number[];
  /** Downloads in the recent half of the 30-day window. */
  currDl?: number;
  /** Downloads on the latest recorded day. */
  dd?: number;
  /** Downloads in the last 30 days. */
  dl?: number;
  /** Downloads in the last 7 days. */
  dw?: number;
  /** Downloads on the preceding day. */
  prevDd?: number;
  /** Downloads in the prior half of the 30-day window. */
  prevDl?: number;
  /** Downloads in the preceding weekly window. */
  prevDw?: number;
  /** Bucketed 30-day download sparkline series. */
  series30d?: number[];
  /** Trailing weekly daily download series. */
  series7d?: number[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** crandb package endpoint with CRAN package page redirect. */
const CRANDB_ENDPOINT = createEndpoint({
  api: 'https://crandb.r-pkg.org/{target}',
  page: 'https://cran.r-project.org/package={target}',
  project: pickFields<CranPackagePayload>(['License', 'Version']),
});

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches the redundant `+ file LICENSE` suffix of CRAN license fields without whitespace backtracking. */
const FILE_LICENSE_SUFFIX_RX = /(?<!\s)\s*\+\s*file\s+LICEN[CS]E$/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Project a cranlogs daily response into daily/weekly/monthly totals, deltas, and compact series. */
function projectCranDownloads(data: unknown): CranDownloadsProjection | undefined {
  const firstEntry = readFirstObjectEntry(data);
  if (!firstEntry) {
    return undefined;
  }
  const scalarCount = readFiniteNumber(firstEntry.downloads);
  if (scalarCount !== undefined) {
    return { dd: scalarCount, dl: scalarCount, dw: scalarCount };
  }
  if (!Array.isArray(firstEntry.downloads) || firstEntry.downloads.length === 0) {
    return undefined;
  }
  const daily: number[] = [];
  for (const row of firstEntry.downloads) {
    if (isJsonObject(row)) {
      daily.push(readFiniteNumber(row.downloads) ?? 0);
    }
  }
  if (daily.length === 0) {
    return undefined;
  }
  const totalDays = daily.length;
  const [currDl, prevDl] = compareTrailingWindows(daily, 15, 2);
  const [dw, prevDw] = compareTrailingWindows(daily, 7, 7);
  return {
    bars30d: bucketSeries(daily, 10),
    currDl,
    dd: daily.at(-1),
    dl: sumSeries(daily),
    dw: dw ?? sumSeries(daily, totalDays - 7),
    prevDd: totalDays >= 2 ? daily.at(-2) : undefined,
    prevDl,
    prevDw,
    series7d: daily.slice(-7),
    series30d: bucketSeries(daily, 15),
  };
}

/** Shared cranlogs daily downloads endpoint (`last-month` covers `dd`, `dw`, and `dl`; Refreshed daily). */
const CRANLOGS_ENDPOINT = createEndpoint({
  api: 'https://cranlogs.r-pkg.org/downloads/daily/last-month/{target}',
  page: 'https://cran.r-project.org/package={target}',
  project: projectCranDownloads,
  ttl: CACHE_TTL.daily,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** CRAN service preset (`cran`). */
export const CRAN_SERVICE = defineService({
  docs: {
    description: 'Package version, license, and daily/weekly/monthly downloads (dd/dw/dl).',
    title: 'CRAN',
  },
  metrics: {
    dd: createDownloadsMetric(
      CRANLOGS_ENDPOINT,
      'dd',
      (stats) => stats.dd,
      { autoSpecials: SERIES_DELTA_SPECIALS },
      (stats) =>
        buildSeriesSpecials({
          barsValues: stats.series7d,
          current: stats.dd,
          previous: stats.prevDd,
          sparklineValues: stats.series7d,
        })
    ),
    dl: createDownloadsMetric(
      CRANLOGS_ENDPOINT,
      'dl',
      (stats) => stats.dl,
      { autoSpecials: SERIES_DELTA_SPECIALS },
      (stats) =>
        buildSeriesSpecials({
          barsValues: stats.bars30d,
          current: stats.currDl,
          previous: stats.prevDl,
          sparklineValues: stats.series30d,
        })
    ),
    dw: createDownloadsMetric(
      CRANLOGS_ENDPOINT,
      'dw',
      (stats) => stats.dw,
      { autoSpecials: SERIES_DELTA_SPECIALS },
      (stats) =>
        buildSeriesSpecials({
          barsValues: stats.series7d,
          current: stats.dw,
          previous: stats.prevDw,
          sparklineValues: stats.series7d,
        })
    ),
    license: createLicenseMetric(CRANDB_ENDPOINT, (pkg) =>
      typeof pkg.License === 'string' ? pkg.License.replace(FILE_LICENSE_SUFFIX_RX, '') : undefined
    ),
    v: createVersionMetric(
      CRANDB_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'r', defaultLabel: 'CRAN' },
      (pkg) => pkg.Version
    ),
  },
  route: PACKAGE_ROUTE,
});
