/**
 * DUB service preset – D package version, license, total/monthly/weekly/daily downloads, and package score (`/badge/dub/:pkg/:metric`).
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  DELTA_SPECIALS,
  SCORE,
  buildWindowDeltaSpecials,
  createDownloadsMetric,
  createLicenseMetric,
  createScoreMetric,
  createVersionMetric,
  readFiniteNumber,
  readText,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected DUB latest version metadata (`code.dlang.org/api/packages/:pkg/latest/info`). */
interface DubInfoProjection {
  /** SPDX license expression from `info.license`. */
  license?: string;
  /** Latest published version string. */
  version?: string;
}

/** Projected DUB package statistics (`code.dlang.org/api/packages/:pkg/stats`). */
interface DubStatsProjection {
  /** Downloads on the last day. */
  daily?: number;
  /** Downloads in the last 30 days. */
  monthly?: number;
  /** Package quality score (`0`–`5`). */
  score?: number;
  /** All-time downloads. */
  total?: number;
  /** Downloads in the last 7 days. */
  weekly?: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum DUB package score (`0`–`5`). */
const MAX_DUB_SCORE = 5;

/** Shared DUB package page URL template. */
const DUB_PAGE = 'https://code.dlang.org/packages/{target}';

// -------------------------------------- INTERNALS --------------------------------------

/** Project a DUB `/latest/info` response into its version and license (dropping README fields). */
function projectDubInfo(data: unknown): DubInfoProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const info = isJsonObject(data.info) ? data.info : undefined;
  return { license: readText(info?.license), version: readText(data.version) };
}

/** Project a DUB `/stats` response into its download windows and score. */
function projectDubStats(data: unknown): DubStatsProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const downloads = isJsonObject(data.downloads) ? data.downloads : undefined;
  return {
    daily: readFiniteNumber(downloads?.daily),
    monthly: readFiniteNumber(downloads?.monthly),
    score: readFiniteNumber(data.score),
    total: readFiniteNumber(downloads?.total),
    weekly: readFiniteNumber(downloads?.weekly),
  };
}

/** DUB latest package metadata endpoint (`extractKeys` skips `readme` and `readmeMarkdown`). */
const DUB_INFO_ENDPOINT = createEndpoint({
  api: 'https://code.dlang.org/api/packages/{target}/latest/info',
  extractKeys: ['info', 'version'],
  page: DUB_PAGE,
  project: projectDubInfo,
});

/** DUB package download and score statistics endpoint. */
const DUB_STATS_ENDPOINT = createEndpoint({
  api: 'https://code.dlang.org/api/packages/{target}/stats',
  page: DUB_PAGE,
  project: projectDubStats,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** DUB (D package registry) service preset (`dub`). */
export const DUB_SERVICE = defineService({
  docs: {
    description:
      'Latest version, license, total/monthly/weekly/daily downloads (dt/dl/dw/dd), and package score.',
    title: 'DUB',
  },
  metrics: {
    dd: createDownloadsMetric(
      DUB_STATS_ENDPOINT,
      'dd',
      (stats) => stats.daily,
      { autoSpecials: DELTA_SPECIALS },
      (stats) => buildWindowDeltaSpecials(stats.daily, 1, stats.weekly, 7)
    ),
    dl: createDownloadsMetric(DUB_STATS_ENDPOINT, 'dl', (stats) => stats.monthly),
    dt: createDownloadsMetric(DUB_STATS_ENDPOINT, 'dt', (stats) => stats.total),
    dw: createDownloadsMetric(
      DUB_STATS_ENDPOINT,
      'dw',
      (stats) => stats.weekly,
      { autoSpecials: DELTA_SPECIALS },
      (stats) => buildWindowDeltaSpecials(stats.weekly, 7, stats.monthly, 30)
    ),
    license: createLicenseMetric(DUB_INFO_ENDPOINT, (pkg) => pkg.license),
    score: createScoreMetric(
      DUB_STATS_ENDPOINT,
      { ...SCORE, defaultLabel: 'dub score' },
      (stats) => [stats.score, MAX_DUB_SCORE]
    ),
    v: createVersionMetric(
      DUB_INFO_ENDPOINT,
      { defaultColor: 'rose', defaultIcon: 'd', defaultLabel: 'dub' },
      (pkg) => pkg.version
    ),
  },
  route: { target: { placeholder: ':pkg' } },
});
