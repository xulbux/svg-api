/**
 * GitLab service preset – Public gitlab.com project stars, forks, license, last activity, and latest release for any owner (`/badge/gitlab/:owner/:repo/:metric`).
 */

import {
  createCountTransform,
  createLicenseTransform,
  createRelativeDateTransform,
  createRepoEndpointFactory,
  createVersionTransform,
  FORKS,
  formatSpdxKey,
  LAST_COMMIT,
  LICENSE,
  RELEASE,
  STARS,
} from '@/services/metrics';
import type { ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial GitLab project API payload (`gitlab.com/api/v4/projects/:id?license=true`). */
interface GitLabProjectPayload {
  /** Number of project forks. */
  forks_count: number;
  /** ISO 8601 timestamp of the most recent project activity. */
  last_activity_at: string;
  /** Detected license metadata. */
  license: {
    /** Lowercase SPDX license key (e.g., `'mit'`, `'apache-2.0'`). */
    key?: string;
  } | null;
  /** Number of project stars. */
  star_count: number;
}

/** Partial GitLab latest release API payload. */
interface GitLabReleasePayload {
  /** Release git tag name. */
  tag_name: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Create an endpoint pair for a GitLab API sub-resource (URL-encoded `owner%2Frepo` project ID) and a gitlab.com page path. */
const createGitLabEndpoint = createRepoEndpointFactory(
  (owner: string, repo: string): string =>
    `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}`,
  'https://gitlab.com'
);

// -------------------------------------- PUBLIC API -------------------------------------

/** GitLab project service preset (`gitlab`). */
export const GITLAB_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Project stars, forks, license, last activity, and latest release.',
    ownerName: ':owner',
    targetName: ':repo',
    title: 'GitLab',
  },
  metricAliases: { commit: 'updated', l: 'license', 'last-commit': 'updated' },
  metrics: {
    forks: {
      ...createGitLabEndpoint('?license=true', '/-/forks'),
      ...FORKS,
      transform: createCountTransform<GitLabProjectPayload>((payload) => payload.forks_count),
    },
    license: {
      ...createGitLabEndpoint('?license=true', ''),
      ...LICENSE,
      transform: createLicenseTransform<GitLabProjectPayload>((payload) =>
        formatSpdxKey(payload.license?.key)
      ),
    },
    release: {
      ...createGitLabEndpoint('/releases/permalink/latest', '/-/releases'),
      ...RELEASE,
      transform: createVersionTransform<GitLabReleasePayload>((payload) => payload.tag_name),
    },
    stars: {
      ...createGitLabEndpoint('?license=true', '/-/starrers'),
      ...STARS,
      transform: createCountTransform<GitLabProjectPayload>((payload) => payload.star_count),
    },
    updated: {
      ...createGitLabEndpoint('?license=true', '/-/activity'),
      ...LAST_COMMIT,
      defaultLabel: 'last activity',
      transform: createRelativeDateTransform<GitLabProjectPayload>(
        (payload) => payload.last_activity_at
      ),
    },
  },
  ownerMode: 'required',
};
