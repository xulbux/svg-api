/**
 * Flathub service preset – Live upstream metrics and redirect transformations.
 */

import {
  CACHE_TTL,
  createEndpoint,
  defineService,
  isJsonObject,
  readFirstObjectEntry,
} from '@/services/endpoint';
import {
  INSTALLS_LABEL,
  SERIES_DELTA_SPECIALS,
  bucketSeries,
  buildSeriesSpecials,
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
  readDateKeyedSeries,
  readFiniteNumber,
  readText,
  sumSeries,
} from '@/services/metrics';
import { MAX_BARS_POINTS, MIN_SERIES_POINTS } from '@/svg/renderer';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Flathub AppStream payload (`flathub.org/api/v2/appstream/:app`). */
interface FlathubAppStreamProjection {
  /** SPDX license expression of the project (`project_license`). */
  license?: string;
  /** Version of the newest release (`releases[0].version`). */
  version?: string;
}

/** Projected Flathub statistics payload (`flathub.org/api/v2/stats/:app`). */
interface FlathubStatsProjection {
  /** Bucketed 30-day install histogram. */
  bars30d?: number[];
  /** Installs in the last 7 days. */
  installs_last_7_days?: number;
  /** Installs in the last 30 days. */
  installs_last_month?: number;
  /** All-time installs. */
  installs_total?: number;
  /** Installs in the preceding 30-day window. */
  prev30d?: number;
  /** Installs in the preceding 7-day window. */
  prev7d?: number;
  /** Bucketed 30-day install sparkline series. */
  series30d?: number[];
  /** Trailing 7-day daily install series. */
  series7d?: number[];
}

// -------------------------------------- INTERNALS --------------------------------------

/** Project an AppStream document into its license and newest release version (release notes are dropped). */
function projectAppStream(data: unknown): FlathubAppStreamProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  return {
    license: readText(data.project_license),
    version: readText(readFirstObjectEntry(data.releases)?.version),
  };
}

/** Project Flathub install statistics into totals, prior-window deltas, and compact daily series. */
function projectFlathubStats(data: unknown): FlathubStatsProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const daily = readDateKeyedSeries(data.installs_per_day);
  const totalDays = daily.length;
  const recent30d = daily.slice(-30);
  return {
    bars30d:
      recent30d.length >= MIN_SERIES_POINTS ? bucketSeries(recent30d, MAX_BARS_POINTS) : undefined,
    installs_last_7_days: readFiniteNumber(data.installs_last_7_days),
    installs_last_month: readFiniteNumber(data.installs_last_month),
    installs_total: readFiniteNumber(data.installs_total),
    prev7d: totalDays >= 14 ? sumSeries(daily, totalDays - 14, totalDays - 7) : undefined,
    prev30d: totalDays >= 60 ? sumSeries(daily, totalDays - 60, totalDays - 30) : undefined,
    series7d: totalDays >= MIN_SERIES_POINTS ? daily.slice(-7) : undefined,
    series30d: recent30d.length >= MIN_SERIES_POINTS ? bucketSeries(recent30d, 15) : undefined,
  };
}

/** Flathub AppStream metadata endpoint. */
const APPSTREAM_ENDPOINT = createEndpoint({
  api: 'https://flathub.org/api/v2/appstream/{target}',
  extractKeys: ['project_license', 'releases'],
  page: 'https://flathub.org/apps/{target}',
  project: projectAppStream,
});

/** Flathub install statistics endpoint (refreshed daily). */
const STATS_ENDPOINT = createEndpoint({
  api: 'https://flathub.org/api/v2/stats/{target}',
  extractKeys: [
    'installs_last_7_days',
    'installs_last_month',
    'installs_per_day',
    'installs_total',
  ],
  page: 'https://flathub.org/apps/{target}',
  project: projectFlathubStats,
  ttl: CACHE_TTL.daily,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Flathub service preset (`flathub`). */
export const FLATHUB_SERVICE = defineService({
  docs: {
    description: 'App version, license, and total/monthly/weekly installs (dt/dl/dw).',
    title: 'Flathub',
  },
  metrics: {
    dl: createDownloadsMetric(
      STATS_ENDPOINT,
      'dl',
      (stats) => stats.installs_last_month,
      { ...INSTALLS_LABEL, autoSpecials: SERIES_DELTA_SPECIALS },
      (stats) =>
        buildSeriesSpecials({
          barsValues: stats.bars30d,
          current: stats.installs_last_month,
          previous: stats.prev30d,
          sparklineValues: stats.series30d,
        })
    ),
    dt: createDownloadsMetric(
      STATS_ENDPOINT,
      'dt',
      (stats) => stats.installs_total,
      { ...INSTALLS_LABEL, autoSpecials: SERIES_DELTA_SPECIALS },
      (stats) =>
        buildSeriesSpecials({
          barsValues: stats.bars30d,
          current: stats.installs_last_month,
          previous: stats.prev30d,
          sparklineValues: stats.series30d,
        })
    ),
    dw: createDownloadsMetric(
      STATS_ENDPOINT,
      'dw',
      (stats) => stats.installs_last_7_days,
      { ...INSTALLS_LABEL, autoSpecials: SERIES_DELTA_SPECIALS },
      (stats) =>
        buildSeriesSpecials({
          barsValues: stats.series7d,
          current: stats.installs_last_7_days,
          previous: stats.prev7d,
          sparklineValues: stats.series7d,
        })
    ),
    license: createLicenseMetric(APPSTREAM_ENDPOINT, (app) => app.license),
    v: createVersionMetric(
      APPSTREAM_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'flathub', defaultLabel: 'Flathub' },
      (app) => app.version
    ),
  },
  route: { target: { placeholder: ':app' } },
});
