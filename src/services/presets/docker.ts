/**
 * Docker Hub service preset – Image pull and star counts for official and namespaced images (`/badge/docker/[:owner/]:repo/:metric`).
 */

import { createCountTransform, STARS } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Docker Hub repository API payload (`hub.docker.com/v2/repositories/:owner/:repo/`). */
interface DockerHubRepoPayload {
  /** Total image pulls. */
  pull_count: number;
  /** Total repository stars. */
  star_count: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Docker Hub namespace of official images. */
const OFFICIAL_NAMESPACE = 'library';

/** Docker Hub repository endpoint with official (`/_/`) or namespaced (`/r/`) page redirect. */
const DOCKER_HUB_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (owner: string, repo: string): string =>
    `https://hub.docker.com/v2/repositories/${owner}/${repo}/`,
  buildRedirectUrl: (owner: string, repo: string): string =>
    owner === OFFICIAL_NAMESPACE
      ? `https://hub.docker.com/_/${repo}`
      : `https://hub.docker.com/r/${owner}/${repo}`,
};

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve the default Docker Hub namespace (`library` for official images). */
function resolveDefaultDockerOwner(): string {
  return OFFICIAL_NAMESPACE;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Docker Hub service preset (`docker`). */
export const DOCKER_SERVICE: ServiceDefinition = {
  defaultOwner: resolveDefaultDockerOwner,
  docs: {
    description: 'Image pulls and stars (omit :owner for official library images).',
    ownerName: ':owner',
    targetName: ':repo',
    title: 'Docker Hub',
  },
  metricAliases: { dl: 'pulls', dt: 'pulls' },
  metrics: {
    pulls: {
      ...DOCKER_HUB_ENDPOINT,
      defaultColor: 'sky',
      defaultIcon: 'docker',
      defaultLabel: 'docker pulls',
      transform: createCountTransform<DockerHubRepoPayload>((payload) => payload.pull_count),
    },
    stars: {
      ...DOCKER_HUB_ENDPOINT,
      ...STARS,
      defaultLabel: 'docker stars',
      transform: createCountTransform<DockerHubRepoPayload>((payload) => payload.star_count),
    },
  },
  ownerMode: 'optional',
};
