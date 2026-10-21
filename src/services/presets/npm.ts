/**
 * npm service preset – Registry version, license, TypeScript types, and download counts for unscoped and scoped packages (`/badge/npm/[:scope/]:pkg/:metric`).
 */

import {
  CACHE_TTL,
  NPM_PACKAGE_ROUTE,
  createEndpoint,
  createMetric,
  defineService,
  isJsonObject,
} from '@/services/endpoint';
import {
  SERIES_DELTA_SPECIALS,
  bucketSeries,
  buildSeriesSpecials,
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
  readFiniteNumber,
  readLicenseName,
  readText,
  sumSeries,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected npm Registry latest version metadata (`registry.npmjs.org/:pkg/latest`). */
interface NpmLatestProjection {
  /** Whether the package ships TypeScript declarations (`types`, `typings`, or an `exports` `types` condition). */
  hasTypes: boolean;
  /** SPDX license identifier (from a string or a legacy `{ type }` object). */
  license?: string;
  /** Latest published npm version. */
  version?: string;
}

/** Projected npm Downloads API payload (`api.npmjs.org/downloads/range/last-year/:pkg`). */
interface NpmDownloadsProjection {
  /** 10-bar 30-day download histogram. */
  bars30d?: number[];
  /** 12-month download series (30-day buckets). */
  bars12m?: number[];
  /** Current window sum for the `dl` delta comparison. */
  currDl?: number;
  /** Downloads in the last 30 days. */
  dl?: number;
  /** Downloads in the last 7 days. */
  dw?: number;
  /** Downloads in the last 365 days. */
  dy?: number;
  /** Prior window sum for the `dl` delta comparison. */
  prevDl?: number;
  /** Downloads in the prior 7-day window (days -14 to -8). */
  prevDw?: number;
  /** 7-day daily download series. */
  series7d?: number[];
  /** 15-point 30-day download series (2-day buckets). */
  series30d?: number[];
}

/** Remaining key budget of the bounded `exports` walk. */
interface ExportsWalkBudget {
  /** Number of object keys that may still be visited. */
  remainingKeys: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum nesting depth of the `exports` map searched for `types` conditions. */
const MAX_EXPORTS_DEPTH = 4;

/** Maximum number of `exports` keys visited (huge subpath maps stay cheap). */
const MAX_EXPORTS_KEYS = 256;

// -------------------------------------- INTERNALS --------------------------------------

/** Check whether an `exports` node declares a `types` condition (bounded depth and key count). */
function hasTypesCondition(node: unknown, depth: number, budget: ExportsWalkBudget): boolean {
  if (depth > MAX_EXPORTS_DEPTH || typeof node !== 'object' || node === null) {
    return false;
  }
  if (Array.isArray(node)) {
    // Fallback arrays (`["./a.js", { "types": … }]`).
    for (const entry of node) {
      budget.remainingKeys -= 1;
      if (budget.remainingKeys < 0) {
        return false;
      }
      if (hasTypesCondition(entry, depth + 1, budget)) {
        return true;
      }
    }
    return false;
  }
  const conditions = node as Record<string, unknown>;
  for (const key of Object.keys(conditions)) {
    budget.remainingKeys -= 1;
    if (budget.remainingKeys < 0) {
      return false;
    }
    const value = conditions[key];
    if (key === 'types' && (typeof value === 'string' || isJsonObject(value))) {
      return true;
    }
    if (hasTypesCondition(value, depth + 1, budget)) {
      return true;
    }
  }
  return false;
}

/** Project npm latest metadata into its version, license, and TypeScript declarations flag. */
function projectNpmLatest(data: unknown): NpmLatestProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const hasTopLevelTypes = Boolean(data.types) || Boolean(data.typings);
  return {
    hasTypes:
      hasTopLevelTypes || hasTypesCondition(data.exports, 0, { remainingKeys: MAX_EXPORTS_KEYS }),
    license: readLicenseName(data.license),
    version: readText(data.version),
  };
}

/** Project npm range downloads into weekly/monthly/yearly totals, deltas, and compact series. */
function projectNpmDownloads(data: unknown): NpmDownloadsProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const pointCount = readFiniteNumber(data.downloads);
  if (pointCount !== undefined) {
    return { dl: pointCount, dw: pointCount, dy: pointCount };
  }
  if (!Array.isArray(data.downloads)) {
    return {};
  }
  const daily: number[] = [];
  for (const entry of data.downloads) {
    if (isJsonObject(entry)) {
      daily.push(readFiniteNumber(entry.downloads) ?? 0);
    }
  }
  if (daily.length === 0) {
    return {};
  }
  const totalDays = daily.length;
  const recent30d = daily.slice(-30);
  const halfRecent = Math.floor(recent30d.length / 2);
  let currDl: number | undefined = undefined;
  let prevDl: number | undefined = undefined;
  if (totalDays >= 60) {
    currDl = sumSeries(daily, totalDays - 30);
    prevDl = sumSeries(daily, totalDays - 60, totalDays - 30);
  } else if (halfRecent >= 2) {
    currDl = sumSeries(recent30d, halfRecent);
    prevDl = sumSeries(recent30d, 0, halfRecent);
  }
  return {
    bars12m: bucketSeries(daily, 12),
    bars30d: bucketSeries(recent30d, 10),
    currDl,
    dl: sumSeries(daily, totalDays - 30),
    dw: sumSeries(daily, totalDays - 7),
    dy: sumSeries(daily),
    prevDl,
    prevDw: totalDays >= 14 ? sumSeries(daily, totalDays - 14, totalDays - 7) : undefined,
    series7d: daily.slice(-7),
    series30d: bucketSeries(recent30d, 15),
  };
}

/** Shared npm Downloads range API endpoint (`last-year` covers `dw`, `dl`, and `dy` in one request). */
const NPM_DOWNLOADS_ENDPOINT = createEndpoint({
  api: 'https://api.npmjs.org/downloads/range/last-year/{npm}',
  page: 'https://www.npmjs.com/package/{npm}',
  project: projectNpmDownloads,
  ttl: CACHE_TTL.daily,
});

/** npm Registry latest version metadata endpoint. */
const NPM_LATEST_ENDPOINT = createEndpoint({
  api: 'https://registry.npmjs.org/{npm}/latest',
  page: 'https://www.npmjs.com/package/{npm}',
  project: projectNpmLatest,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** npm Registry service preset (`npm`). */
export const NPM_SERVICE = defineService({
  docs: {
    description:
      'Version, weekly/monthly/yearly downloads (dw/dl/dy), license, and bundled TS types.',
    title: 'npm',
  },
  // `dt` reported the last-year downloads before the download keys were normalized.
  metricAliases: { dt: 'dy' },
  metrics: {
    dl: createDownloadsMetric(
      NPM_DOWNLOADS_ENDPOINT,
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
      NPM_DOWNLOADS_ENDPOINT,
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
    dy: createDownloadsMetric(
      NPM_DOWNLOADS_ENDPOINT,
      'dy',
      (stats) => stats.dy,
      { autoSpecials: SERIES_DELTA_SPECIALS },
      (stats) =>
        buildSeriesSpecials({
          barsValues: stats.bars12m,
          current: stats.dl,
          previous: stats.prevDl,
          sparklineValues: stats.bars12m,
        })
    ),
    license: createLicenseMetric(NPM_LATEST_ENDPOINT, (latest) => latest.license),
    types: createMetric(
      NPM_LATEST_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'ts', defaultLabel: 'types' },
      (latest) => ({ value: latest.hasTypes ? 'included' : 'none' })
    ),
    v: createVersionMetric(
      NPM_LATEST_ENDPOINT,
      { defaultColor: 'rose', defaultIcon: 'npm', defaultLabel: 'npm' },
      (latest) => latest.version
    ),
  },
  route: NPM_PACKAGE_ROUTE,
});
