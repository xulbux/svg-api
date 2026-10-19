/**
 * pub.dev service preset – Dart/Flutter package version, likes, pub points, and 30-day downloads (`/badge/pub/:pkg/:metric`).
 */

import {
  createCountTransform,
  createScoreTransform,
  createVersionTransform,
  RECENT_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial pub.dev package API payload (`pub.dev/api/packages/:pkg`). */
interface PubPackagePayload {
  /** Latest stable release. */
  latest: {
    /** Latest stable version. */
    version?: string;
  };
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

// ---------------------------------------- CONSTS ---------------------------------------

/** pub.dev package endpoint with package page redirect. */
const PUB_PACKAGE_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, pkg: string): string => `https://pub.dev/api/packages/${pkg}`,
  buildRedirectUrl: (_owner: string, pkg: string): string => `https://pub.dev/packages/${pkg}`,
};

/** pub.dev package score endpoint with score page redirect. */
const PUB_SCORE_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, pkg: string): string => `https://pub.dev/api/packages/${pkg}/score`,
  buildRedirectUrl: (_owner: string, pkg: string): string =>
    `https://pub.dev/packages/${pkg}/score`,
};

// -------------------------------------- INTERNALS --------------------------------------

/** Format granted and maximum pub points (`'150/160'`). */
function formatPubPoints(achieved: number, maximum: number): string {
  return `${achieved}/${maximum}`;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** pub.dev service preset (`pub`). */
export const PUB_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Latest version, likes, pub points (with ring gauge), and 30-day downloads.',
    targetName: ':pkg',
    title: 'pub.dev',
  },
  metricAliases: { dm: 'dl' },
  metrics: {
    dl: {
      ...PUB_SCORE_ENDPOINT,
      ...RECENT_DOWNLOADS,
      transform: createCountTransform<PubScorePayload>(
        (payload) => payload.downloadCount30Days,
        '/mo'
      ),
    },
    likes: {
      ...PUB_SCORE_ENDPOINT,
      defaultColor: 'blue',
      defaultIcon: 'thumbs-up',
      defaultLabel: 'likes',
      transform: createCountTransform<PubScorePayload>((payload) => payload.likeCount),
    },
    points: {
      ...PUB_SCORE_ENDPOINT,
      defaultColor: 'emerald',
      defaultIcon: 'gauge',
      defaultLabel: 'pub points',
      transform: createScoreTransform<PubScorePayload>(
        (payload) => [payload.grantedPoints, payload.maxPoints],
        formatPubPoints
      ),
    },
    v: {
      ...PUB_PACKAGE_ENDPOINT,
      defaultColor: 'sky',
      defaultIcon: 'dart',
      defaultLabel: 'pub',
      transform: createVersionTransform<PubPackagePayload>((payload) => payload.latest?.version),
    },
  },
  ownerMode: 'none',
};
