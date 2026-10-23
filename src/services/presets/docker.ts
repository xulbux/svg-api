/**
 * Docker Hub service preset – Live upstream metrics and redirect transformations.
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { STARS, UPDATED, createCountMetric, createRelativeDateMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Docker Hub repository API payload (`hub.docker.com/v2/repositories/:owner/:repo/`). */
interface DockerHubRepoPayload {
  /** ISO 8601 timestamp when the repository was last updated. */
  last_updated: string | null;
  /** Total image pulls. */
  pull_count: number;
  /** Total repository stars. */
  star_count: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Docker Hub namespace of official images (the default owner). */
const OFFICIAL_NAMESPACE = 'library';

/** Docker Hub repository endpoint with official (`/_/`) or namespaced (`/r/`) page redirect. */
const DOCKER_HUB_ENDPOINT = createEndpoint({
  api: 'https://hub.docker.com/v2/repositories/{owner}/{target}/',
  page: ({ owner, target }) =>
    owner === OFFICIAL_NAMESPACE
      ? `https://hub.docker.com/_/${encodeURIComponent(target)}`
      : `https://hub.docker.com/r/${encodeURIComponent(owner)}/${encodeURIComponent(target)}`,
  project: pickFields<DockerHubRepoPayload>(['last_updated', 'pull_count', 'star_count']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Docker Hub service preset (`docker`). */
export const DOCKER_SERVICE = defineService({
  docs: {
    description: `Image pulls, stars, and last-updated age (omit :owner for official ${OFFICIAL_NAMESPACE} images).`,
    title: 'Docker Hub',
  },
  metricAliases: { dl: 'pulls', dt: 'pulls' },
  metrics: {
    pulls: createCountMetric(
      DOCKER_HUB_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'docker', defaultLabel: 'Docker Pulls' },
      (repo) => repo.pull_count
    ),
    stars: createCountMetric(
      DOCKER_HUB_ENDPOINT,
      { ...STARS, defaultLabel: 'Docker Stars' },
      (repo) => repo.star_count
    ),
    updated: createRelativeDateMetric(DOCKER_HUB_ENDPOINT, UPDATED, (repo) => repo.last_updated),
  },
  route: {
    owner: { defaultValue: OFFICIAL_NAMESPACE, isRequired: false, placeholder: ':owner' },
    target: { placeholder: ':repo' },
  },
});
