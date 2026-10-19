/**
 * GitHub service preset – Owner-restricted repository metrics (`/badge/gh/[:owner/]:repo/:metric`) authenticated with `GITHUB_TOKEN`.
 */

import { resolveDefaultGhOwner } from '@/config/site';
import {
  createCountTransform,
  createRelativeDateTransform,
  createRepoEndpointFactory,
  createVersionTransform,
  formatCompactNumber,
  FORKS,
  ISSUES,
  LAST_COMMIT,
  LICENSE,
  RELEASE,
  STARS,
} from '@/services/metrics';
import type { Env, MetricResult, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial GitHub repository API payload. */
interface GitHubRepoPayload {
  /** Number of repository forks. */
  forks_count: number;
  /** Repository license metadata. */
  license: {
    /** SPDX license identifier. */
    spdx_id?: string;
  } | null;
  /** Number of open issues and pull requests. */
  open_issues_count: number;
  /** ISO 8601 timestamp of the most recent git push. */
  pushed_at: string;
  /** Number of repository stargazers. */
  stargazers_count: number;
}

/** Partial GitHub latest release API payload. */
interface GitHubReleasePayload {
  /** Release git tag name. */
  tag_name: string;
}

/** Partial GitHub commit participation API payload. */
interface GitHubParticipationPayload {
  /** Weekly commit counts for all users over the last 52 weeks. */
  all: number[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Number of trailing weeks summarized by the `activity` metric. */
const ACTIVITY_WEEKS = 8;

/** Create an endpoint pair for a GitHub API sub-resource and a github.com page path. */
const createGitHubEndpoint = createRepoEndpointFactory(
  (owner: string, repo: string): string => `https://api.github.com/repos/${owner}/${repo}`,
  'https://github.com'
);

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve the allowlist of GitHub owners from environment bindings. */
function resolveAllowedGitHubOwners(env: Env): string[] {
  return [resolveDefaultGhOwner(env)];
}

/** Build the `Authorization` header when a `GITHUB_TOKEN` secret is configured. */
function buildGitHubHeaders(env: Env): Record<string, string> {
  return env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {};
}

/** Transform GitHub repository payload into an SPDX license identifier metric. */
function transformGitHubLicense(data: unknown): Partial<MetricResult> {
  const spdxId = ((data ?? {}) as Partial<GitHubRepoPayload>).license?.spdx_id;
  return { value: spdxId && spdxId !== 'NOASSERTION' ? spdxId : 'custom' };
}

/** Transform GitHub commit participation payload into an 8-week total and sparkline. */
function transformGitHubActivity(data: unknown): Partial<MetricResult> {
  const allWeeks = ((data ?? {}) as Partial<GitHubParticipationPayload>).all;
  const recentWeeks = Array.isArray(allWeeks) ? allWeeks.slice(-ACTIVITY_WEEKS) : [];
  let totalRecent = 0;
  for (const weekCount of recentWeeks) {
    totalRecent += weekCount;
  }
  return {
    special: {
      type: 'sparkline',
      values:
        recentWeeks.length >= 2 ? recentWeeks : Array.from({ length: ACTIVITY_WEEKS }, () => 0),
    },
    value: `${formatCompactNumber(totalRecent)}/${ACTIVITY_WEEKS}w`,
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** GitHub repository service preset (`gh`), restricted to `DEFAULT_GH_OWNER`. */
export const GITHUB_SERVICE: ServiceDefinition = {
  allowedOwners: resolveAllowedGitHubOwners,
  buildHeaders: buildGitHubHeaders,
  defaultOwner: resolveDefaultGhOwner,
  docs: {
    description: 'Repository stars, forks, issues, license, last commit, release, and activity.',
    ownerName: ':owner',
    targetName: ':repo',
    title: 'GitHub',
  },
  metricAliases: { l: 'license', 'last-commit': 'commit' },
  metrics: {
    activity: {
      ...createGitHubEndpoint('/stats/participation', '/graphs/commit-activity'),
      defaultColor: 'emerald',
      defaultIcon: 'activity',
      defaultLabel: 'commits',
      transform: transformGitHubActivity,
    },
    commit: {
      ...createGitHubEndpoint('', '/commits'),
      ...LAST_COMMIT,
      transform: createRelativeDateTransform<GitHubRepoPayload>((payload) => payload.pushed_at),
    },
    forks: {
      ...createGitHubEndpoint('', '/network/members'),
      ...FORKS,
      transform: createCountTransform<GitHubRepoPayload>((payload) => payload.forks_count),
    },
    issues: {
      ...createGitHubEndpoint('', '/issues'),
      ...ISSUES,
      transform: createCountTransform<GitHubRepoPayload>((payload) => payload.open_issues_count),
    },
    license: {
      ...createGitHubEndpoint('', '/blob/HEAD/LICENSE'),
      ...LICENSE,
      transform: transformGitHubLicense,
    },
    release: {
      ...createGitHubEndpoint('/releases/latest', '/releases'),
      ...RELEASE,
      transform: createVersionTransform<GitHubReleasePayload>((payload) => payload.tag_name),
    },
    stars: {
      ...createGitHubEndpoint('', '/stargazers'),
      ...STARS,
      transform: createCountTransform<GitHubRepoPayload>((payload) => payload.stargazers_count),
    },
  },
  ownerMode: 'optional',
};
