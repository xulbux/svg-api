/**
 * Docker Hub service preset – Image pull and star counts for official and namespaced images (`/badge/docker/[:owner/]:repo/:metric`).
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createCountMetric, STARS } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Docker Hub repository API payload (`hub.docker.com/v2/repositories/:owner/:repo/`). */
interface DockerHubRepoPayload {
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
  project: pickFields<DockerHubRepoPayload>(['pull_count', 'star_count']),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve the default Docker Hub namespace (`library` for official images). */
function resolveDefaultDockerOwner(): string {
  return OFFICIAL_NAMESPACE;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Docker Hub service preset (`docker`). */
export const DOCKER_SERVICE = defineService({
  docs: {
    description: 'Image pulls and stars (omit :owner for official library images).',
    title: 'Docker Hub',
  },
  metricAliases: { dl: 'pulls', dt: 'pulls' },
  metrics: {
    pulls: createCountMetric(
      DOCKER_HUB_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'docker', defaultLabel: 'docker pulls' },
      (repo) => repo.pull_count
    ),
    stars: createCountMetric(
      DOCKER_HUB_ENDPOINT,
      { ...STARS, defaultLabel: 'docker stars' },
      (repo) => repo.star_count
    ),
  },
  route: {
    owner: { isRequired: false, placeholder: ':owner', resolveDefault: resolveDefaultDockerOwner },
    target: { placeholder: ':repo' },
  },
});
