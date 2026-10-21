/**
 * pub.dev service preset – Dart/Flutter package version, likes, pub points, and 30-day downloads (`/badge/pub/:pkg/:metric`).
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  SCORE,
  SERIES_DELTA_SPECIALS,
  buildSeriesSpecials,
  createCommunityMetric,
  createDownloadsMetric,
  createScoreMetric,
  createVersionMetric,
  readFiniteNumber,
  readText,
  sumSeries,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected pub.dev package metadata (`pub.dev/api/packages/:pkg`). */
interface PubPackageProjection {
  /** Latest stable version. */
  version?: string;
}

/** Projected pub.dev package score and weekly downloads (`pub.dev/api/packages/:pkg/metrics`). */
interface PubScoreProjection {
  /** Downloads in the last 30 days. */
  downloadCount30Days?: number;
  /** Granted pub points. */
  grantedPoints?: number;
  /** Number of likes. */
  likeCount?: number;
  /** Maximum achievable pub points. */
  maxPoints?: number;
  /** Preceding 4-week download total. */
  prev4w?: number;
  /** Latest 4-week download total. */
  recent4w?: number;
  /** Chronological 12-week download series. */
  weeklySeries?: number[];
}

// -------------------------------------- INTERNALS --------------------------------------

/** Project a pub.dev package payload to its latest stable version string (dropping `pubspec`). */
function projectPubPackage(data: unknown): PubPackageProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const latest = isJsonObject(data.latest) ? data.latest : undefined;
  return { version: readText(latest?.version) };
}

/** Project a pub.dev `/metrics` (or flat `/score`) payload to its score counters and weekly series. */
function projectPubScore(data: unknown): PubScoreProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const score = isJsonObject(data.score) ? data.score : data;
  const scorecard = isJsonObject(data.scorecard) ? data.scorecard : undefined;
  const weeklyDownloads = isJsonObject(scorecard?.weeklyVersionDownloads)
    ? scorecard.weeklyVersionDownloads
    : undefined;
  const rawWeekly = Array.isArray(weeklyDownloads?.totalWeeklyDownloads)
    ? weeklyDownloads.totalWeeklyDownloads
    : undefined;
  const newestFirst: number[] = [];
  if (rawWeekly) {
    for (const item of rawWeekly) {
      const count = readFiniteNumber(item);
      if (count !== undefined) {
        newestFirst.push(count);
      }
    }
  }
  return {
    downloadCount30Days: readFiniteNumber(score.downloadCount30Days),
    grantedPoints: readFiniteNumber(score.grantedPoints),
    likeCount: readFiniteNumber(score.likeCount),
    maxPoints: readFiniteNumber(score.maxPoints),
    prev4w: newestFirst.length >= 8 ? sumSeries(newestFirst, 4, 8) : undefined,
    recent4w: newestFirst.length >= 4 ? sumSeries(newestFirst, 0, 4) : undefined,
    weeklySeries: newestFirst.length >= 2 ? newestFirst.slice(0, 12).toReversed() : undefined,
  };
}

/** Format granted and maximum pub points (`'150/160'`). */
function formatPubPoints(achieved: number, maximum: number): string {
  return `${achieved}/${maximum}`;
}

/** pub.dev package endpoint with package page redirect (only the latest version is cached). */
const PUB_PACKAGE_ENDPOINT = createEndpoint({
  api: 'https://pub.dev/api/packages/{target}',
  extractKeys: ['latest'],
  page: 'https://pub.dev/packages/{target}',
  project: projectPubPackage,
});

/** pub.dev package metrics endpoint with score page redirect. */
const PUB_SCORE_ENDPOINT = createEndpoint({
  api: 'https://pub.dev/api/packages/{target}/metrics',
  page: 'https://pub.dev/packages/{target}/score',
  project: projectPubScore,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** pub.dev service preset (`pub`). */
export const PUB_SERVICE = defineService({
  docs: {
    description: 'Latest version, likes, pub points (with ring gauge), and 30-day downloads.',
    title: 'pub.dev',
  },
  metrics: {
    dl: createDownloadsMetric(
      PUB_SCORE_ENDPOINT,
      'dl',
      (score) => score.downloadCount30Days,
      { autoSpecials: SERIES_DELTA_SPECIALS },
      (score) =>
        buildSeriesSpecials({
          barsValues: score.weeklySeries,
          current: score.recent4w,
          previous: score.prev4w,
          sparklineValues: score.weeklySeries,
        })
    ),
    likes: createCommunityMetric(PUB_SCORE_ENDPOINT, 'likes', 'dart', (score) => score.likeCount),
    points: createScoreMetric(
      PUB_SCORE_ENDPOINT,
      { ...SCORE, defaultLabel: 'pub points' },
      (score) => [score.grantedPoints, score.maxPoints],
      formatPubPoints
    ),
    v: createVersionMetric(
      PUB_PACKAGE_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'dart', defaultLabel: 'pub' },
      (pkg) => pkg.version
    ),
  },
  route: { target: { placeholder: ':pkg' } },
});
