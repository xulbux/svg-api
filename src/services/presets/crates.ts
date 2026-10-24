/**
 * crates.io service preset – Live upstream metrics and redirect transformations.
 *
 * `?include=default_version,downloads` shrinks the crate document from `~440 KB` (every version)
 * to `~3 KB` (only the default version and recent download counters).
 */

import {
  CACHE_TTL,
  asJsonObject,
  createEndpoint,
  defineService,
  isJsonObject,
  readFirstObjectEntry,
} from '@/services/endpoint';
import {
  SERIES_DELTA_SPECIALS,
  bucketSeries,
  buildSeriesSpecials,
  compareTrailingWindows,
  createBytesMetric,
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
  readFiniteNumber,
  readText,
  sumSeries,
} from '@/services/metrics';
import { MAX_BARS_POINTS, MIN_SERIES_POINTS } from '@/svg/renderer';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected crates.io crate metadata (`crates.io/api/v1/crates/:crate?include=default_version,downloads`). */
interface CratesIoProjection {
  /** Default (latest stable, non-yanked) version string. */
  defaultVersion?: string;
  /** Total all-time downloads. */
  downloads?: number;
  /** SPDX license expression of the default version. */
  license?: string;
  /** Minimum supported Rust version (`rust_version`) of the default version. */
  msrv?: string;
  /** Compressed `.crate` tarball size in bytes (`crate_size`) of the default version. */
  size?: number;
}

/** Projected crates.io 90-day daily downloads (`crates.io/api/v1/crates/:crate/downloads`). */
interface CratesDownloadsProjection {
  /** Bucketed 90-day download histogram. */
  bars?: number[];
  /** Downloads in the most recent trailing comparison window. */
  currWindow?: number;
  /** Downloads in the preceding trailing comparison window. */
  prevWindow?: number;
  /** Total 90-day downloads summed across all versions. */
  recentDownloads?: number;
  /** Bucketed 90-day download sparkline series. */
  sparkline?: number[];
}

// -------------------------------------- INTERNALS --------------------------------------

/** Accumulate daily `{ date, downloads }` entries into `byDate`. */
function addDailyEntries(entries: unknown, byDate: Map<string, number>): void {
  if (!Array.isArray(entries)) {
    return;
  }
  for (const entry of entries) {
    if (isJsonObject(entry) && typeof entry.date === 'string') {
      const count = readFiniteNumber(entry.downloads) ?? 0;
      byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + count);
    }
  }
}

/** Project the crates.io 90-day downloads endpoint (`version_downloads` + `meta.extra_downloads`). */
function projectCratesDownloads(data: unknown): CratesDownloadsProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const byDate = new Map<string, number>();
  addDailyEntries(data.version_downloads, byDate);
  addDailyEntries(asJsonObject(data.meta)?.extra_downloads, byDate);
  if (byDate.size === 0) {
    if (Array.isArray(data.version_downloads)) {
      return { recentDownloads: 0 };
    }
    return { recentDownloads: readFiniteNumber(asJsonObject(data.crate)?.recent_downloads) };
  }
  const daily: number[] = [];
  for (const dateKey of [...byDate.keys()].toSorted()) {
    daily.push(byDate.get(dateKey) ?? 0);
  }
  const totalDays = daily.length;
  const [currWindow, prevWindow] = compareTrailingWindows(daily, 30);
  return {
    bars: totalDays >= MIN_SERIES_POINTS ? bucketSeries(daily, MAX_BARS_POINTS) : undefined,
    currWindow,
    prevWindow,
    recentDownloads: sumSeries(daily),
    sparkline: totalDays >= MIN_SERIES_POINTS ? bucketSeries(daily, 15) : undefined,
  };
}

/** Find the version entry matching `defaultVersion` (or the first version entry as a fallback). */
function findDefaultVersionEntry(
  versions: unknown,
  defaultVersion: string | undefined
): Record<string, unknown> | undefined {
  if (!Array.isArray(versions)) {
    return undefined;
  }
  for (const candidate of versions) {
    if (isJsonObject(candidate) && candidate.num === defaultVersion) {
      return candidate;
    }
  }
  return readFirstObjectEntry(versions);
}

/** Project a crates.io crate document to its summary counts and default version metadata. */
function projectCratesPayload(data: unknown): CratesIoProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const crate = asJsonObject(data.crate);
  const defaultVersion =
    readText(crate?.default_version) ??
    readText(crate?.max_stable_version) ??
    readText(crate?.max_version) ??
    readText(crate?.newest_version);
  const matchedVersion = findDefaultVersionEntry(data.versions, defaultVersion);
  return {
    defaultVersion,
    downloads: readFiniteNumber(crate?.downloads),
    license: readText(matchedVersion?.license),
    msrv: readText(matchedVersion?.rust_version),
    size: readFiniteNumber(matchedVersion?.crate_size),
  };
}

/** crates.io crate metadata endpoint (default version only) with crate page redirect. */
const CRATES_ENDPOINT = createEndpoint({
  api: 'https://crates.io/api/v1/crates/{target}?include=default_version,downloads',
  page: 'https://crates.io/crates/{target}',
  project: projectCratesPayload,
});

/** crates.io 90-day daily downloads endpoint (refreshed daily) with crate page redirect. */
const CRATES_DOWNLOADS_ENDPOINT = createEndpoint({
  api: 'https://crates.io/api/v1/crates/{target}/downloads',
  page: 'https://crates.io/crates/{target}',
  project: projectCratesDownloads,
  ttl: CACHE_TTL.daily,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** crates.io service preset (`crates`). */
export const CRATES_SERVICE = defineService({
  docs: {
    description:
      'Default version, MSRV, crate size, total and 90-day downloads (dt/dq), and license.',
    title: 'crates.io',
  },
  // `dl` reported the 90-day downloads before the download keys were normalized:
  metricAliases: { dl: 'dq', rust: 'msrv' },
  metrics: {
    dq: createDownloadsMetric(
      CRATES_DOWNLOADS_ENDPOINT,
      'dq',
      (stats) => stats.recentDownloads,
      { autoSpecials: SERIES_DELTA_SPECIALS },
      (stats) =>
        buildSeriesSpecials({
          barsValues: stats.bars,
          current: stats.currWindow,
          previous: stats.prevWindow,
          sparklineValues: stats.sparkline,
        })
    ),
    dt: createDownloadsMetric(CRATES_ENDPOINT, 'dt', (crate) => crate.downloads),
    license: createLicenseMetric(CRATES_ENDPOINT, (crate) => crate.license),
    msrv: createVersionMetric(
      CRATES_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'rust', defaultLabel: 'MSRV' },
      (crate) => crate.msrv
    ),
    size: createBytesMetric(
      CRATES_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'weight', defaultLabel: 'Crate Size' },
      (crate) => crate.size
    ),
    v: createVersionMetric(
      CRATES_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'rust', defaultLabel: 'crates.io' },
      (crate) => crate.defaultVersion
    ),
  },
  route: { target: { placeholder: ':crate' } },
});
