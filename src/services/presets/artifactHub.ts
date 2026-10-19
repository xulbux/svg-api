/**
 * Artifact Hub service preset – Latest version, app version, and stars of Helm charts and other cloud-native packages (`/badge/artifacthub/:kind/:repo/:pkg/:metric`, e.g., `/badge/artifacthub/helm/bitnami/nginx/v`).
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createCountMetric, createVersionMetric, STARS } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Artifact Hub package summary payload (`artifacthub.io/api/v1/packages/:kind/:repo/:pkg/summary`). */
interface ArtifactHubSummaryPayload {
  /** Version of the packaged application (e.g., the image tag of a Helm chart). */
  app_version: string;
  /** Number of Artifact Hub stars. */
  stars: number;
  /** Latest package version. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Number of path segments of a package address (`:kind/:repo/:pkg`). */
const PACKAGE_ADDRESS_SEGMENTS = 3;

/** Artifact Hub package summary endpoint (`~1 KB`) with package page redirect. */
const ARTIFACT_HUB_ENDPOINT = createEndpoint({
  api: 'https://artifacthub.io/api/v1/packages/{target}/summary',
  page: 'https://artifacthub.io/packages/{target}',
  project: pickFields<ArtifactHubSummaryPayload>(['app_version', 'stars', 'version']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Artifact Hub service preset (`artifacthub`). */
export const ARTIFACT_HUB_SERVICE = defineService({
  docs: {
    description:
      'Latest package version, app version, and stars (:kind/:repo/:pkg, e.g., helm/bitnami/nginx).',
    title: 'Artifact Hub',
  },
  metricAliases: { 'app-version': 'app' },
  metrics: {
    app: createVersionMetric(
      ARTIFACT_HUB_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'box', defaultLabel: 'app version' },
      (summary) => summary.app_version
    ),
    stars: createCountMetric(ARTIFACT_HUB_ENDPOINT, STARS, (summary) => summary.stars),
    v: createVersionMetric(
      ARTIFACT_HUB_ENDPOINT,
      { defaultColor: 'teal', defaultIcon: 'artifacthub', defaultLabel: 'artifact hub' },
      (summary) => summary.version
    ),
  },
  route: {
    target: {
      maxSegments: PACKAGE_ADDRESS_SEGMENTS,
      minSegments: PACKAGE_ADDRESS_SEGMENTS,
      placeholder: ':kind/:repo/:pkg',
    },
  },
});
