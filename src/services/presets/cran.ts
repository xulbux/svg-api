/**
 * CRAN service preset – R package version and license from crandb plus daily/weekly/monthly downloads from cranlogs (RStudio mirror) (`/badge/cran/:pkg/:metric`).
 */

import {
  CACHE_TTL,
  createEndpoint,
  defineService,
  isJsonObject,
  pickFields,
} from '@/services/endpoint';
import {
  SERIES_DELTA_SPECIALS,
  bucketSeries,
  buildSeriesSpecials,
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
  /** 10-bar 30-day download histogram. */
  bars30d?: number[];
  /** Downloads on the latest recorded day. */
  dd?: number;
  /** Downloads in the last 30 days. */
  dl?: number;
  /** Downloads in the last 7 days. */
  dw?: number;
  /** Downloads on the preceding day. */
  prevDd?: number;
  /** Downloads in the preceding 7-day window. */
  prevDw?: number;
  /** 15-point 30-day download series. */
  series30d?: number[];
  /** 7-day daily download series. */
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

/** Matches the redundant `+ file LICENSE` suffix of CRAN license fields. */
const FILE_LICENSE_SUFFIX_RX = /\s*\+\s*file\s+LICEN[CS]E$/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Project a cranlogs daily response into daily/weekly/monthly totals, deltas, and compact series. */
function projectCranDownloads(data: unknown): CranDownloadsProjection | undefined {
  const firstEntry: unknown = Array.isArray(data) ? data[0] : undefined;
  if (!isJsonObject(firstEntry)) {
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
  return {
    bars30d: bucketSeries(daily, 10),
    dd: daily.at(-1),
    dl: sumSeries(daily),
    dw: sumSeries(daily, totalDays - 7),
    prevDd: totalDays >= 2 ? daily.at(-2) : undefined,
    prevDw: totalDays >= 14 ? sumSeries(daily, totalDays - 14, totalDays - 7) : undefined,
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
          current: stats.dw,
          previous: stats.prevDw,
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
  route: { target: { placeholder: ':pkg' } },
});
