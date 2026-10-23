/**
 * Thunderstore service preset – Live upstream metrics and redirect transformations.
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createCountMetric, createDownloadsMetric, createVersionMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Thunderstore package metrics payload (`thunderstore.io/api/v1/package-metrics/:namespace/:pkg/`). */
interface ThunderstoreMetricsPayload {
  /** All-time downloads of every version. */
  downloads: number;
  /** Latest published version. */
  latest_version: string;
  /** Number of user ratings (thumbs up). */
  rating_score: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Thunderstore package metrics endpoint (`~70 B`) with package page redirect. */
const THUNDERSTORE_ENDPOINT = createEndpoint({
  api: 'https://thunderstore.io/api/v1/package-metrics/{owner}/{target}/',
  page: 'https://thunderstore.io/package/{owner}/{target}/',
  project: pickFields<ThunderstoreMetricsPayload>(['downloads', 'latest_version', 'rating_score']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Thunderstore service preset (`thunderstore`). */
export const THUNDERSTORE_SERVICE = defineService({
  docs: {
    description: 'Mod all-time downloads, rating score (thumbs up), and latest version.',
    title: 'Thunderstore',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: createDownloadsMetric(THUNDERSTORE_ENDPOINT, 'dt', (metrics) => metrics.downloads),
    rating: createCountMetric(
      THUNDERSTORE_ENDPOINT,
      { defaultColor: 'amber', defaultIcon: 'thumbs-up', defaultLabel: 'Rating' },
      (metrics) => metrics.rating_score
    ),
    v: createVersionMetric(
      THUNDERSTORE_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'thunderstore', defaultLabel: 'Thunderstore' },
      (metrics) => metrics.latest_version
    ),
  },
  route: {
    owner: { isRequired: true, placeholder: ':namespace' },
    target: { placeholder: ':pkg' },
  },
});
