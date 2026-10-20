/**
 * pub.dev service preset – Dart/Flutter package version, likes, pub points, and 30-day downloads (`/badge/pub/:pkg/:metric`).
 */

import { createEndpoint, defineService, isJsonObject, pickFields } from '@/services/endpoint';
import {
  SCORE,
  createCommunityMetric,
  createDownloadsMetric,
  createScoreMetric,
  createVersionMetric,
  readText,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected pub.dev package metadata (`pub.dev/api/packages/:pkg`). */
interface PubPackageProjection {
  /** Latest stable version. */
  version?: string;
}

/** Partial pub.dev package score API payload (`pub.dev/api/packages/:pkg/score`). */
interface PubScorePayload {
  /** Downloads in the last 30 days. */
  downloadCount30Days: number;
  /** Granted pub points. */
  grantedPoints: number;
  /** Number of likes. */
  likeCount: number;
  /** Maximum achievable pub points. */
  maxPoints: number;
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

/** Format granted and maximum pub points (`'150/160'`). */
function formatPubPoints(achieved: number, maximum: number): string {
  return `${achieved}/${maximum}`;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** pub.dev package endpoint with package page redirect (only the latest version is cached). */
const PUB_PACKAGE_ENDPOINT = createEndpoint({
  api: 'https://pub.dev/api/packages/{target}',
  page: 'https://pub.dev/packages/{target}',
  project: projectPubPackage,
});

/** pub.dev package score endpoint with score page redirect. */
const PUB_SCORE_ENDPOINT = createEndpoint({
  api: 'https://pub.dev/api/packages/{target}/score',
  page: 'https://pub.dev/packages/{target}/score',
  project: pickFields<PubScorePayload>([
    'downloadCount30Days',
    'grantedPoints',
    'likeCount',
    'maxPoints',
  ]),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** pub.dev service preset (`pub`). */
export const PUB_SERVICE = defineService({
  docs: {
    description: 'Latest version, likes, pub points (with ring gauge), and 30-day downloads.',
    title: 'pub.dev',
  },
  metrics: {
    dl: createDownloadsMetric(PUB_SCORE_ENDPOINT, 'dl', (score) => score.downloadCount30Days),
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
