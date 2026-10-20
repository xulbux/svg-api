/**
 * GitHub service preset – Owner-restricted repository metrics (`/badge/gh/[:owner/]:repo/:metric`) authenticated with `GITHUB_TOKEN`.
 *
 * The only allowed owner (and the default owner of 3-segment routes) is the `DEFAULT_GH_OWNER`
 * binding; Without it, every `gh` badge is restricted.
 */

import { resolveDefaultGhOwner } from '@/config/site';
import {
  createEndpoint,
  createMetric,
  defineService,
  pickFields,
  withPageSuffix,
} from '@/services/endpoint';
import {
  FORKS,
  ISSUES,
  LAST_COMMIT,
  LICENSE,
  STARS,
  createCountMetric,
  createRelativeDateMetric,
  createReleaseMetric,
  formatCompactNumber,
  formatLicense,
} from '@/services/metrics';
import type { Env, MetricResult } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** License metadata of a GitHub repository. */
interface GitHubLicense {
  /** SPDX license identifier (`NOASSERTION` for unrecognized licenses). */
  spdx_id?: string | null;
}

/** Partial GitHub repository API payload (`api.github.com/repos/:owner/:repo`). */
interface GitHubRepoPayload {
  /** Number of repository forks. */
  forks_count: number;
  /** Repository license metadata (`null` without a detected license). */
  license: GitHubLicense | null;
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
  all: unknown[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Number of trailing weeks summarized by the `activity` metric. */
const ACTIVITY_WEEKS = 8;

/** GitHub repository endpoint (one cached projection shared by every repository metric). */
const REPO_ENDPOINT = createEndpoint({
  api: 'https://api.github.com/repos/{owner}/{target}',
  page: 'https://github.com/{owner}/{target}',
  project: pickFields<GitHubRepoPayload>([
    'forks_count',
    'license',
    'open_issues_count',
    'pushed_at',
    'stargazers_count',
  ]),
});

/** GitHub latest release endpoint. */
const RELEASE_ENDPOINT = createEndpoint({
  api: 'https://api.github.com/repos/{owner}/{target}/releases/latest',
  page: 'https://github.com/{owner}/{target}/releases',
  project: pickFields<GitHubReleasePayload>(['tag_name']),
});

/** GitHub commit participation endpoint. */
const PARTICIPATION_ENDPOINT = createEndpoint({
  api: 'https://api.github.com/repos/{owner}/{target}/stats/participation',
  page: 'https://github.com/{owner}/{target}/graphs/commit-activity',
  project: pickFields<GitHubParticipationPayload>(['all']),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve the allowlist of GitHub owners from environment bindings (empty without `DEFAULT_GH_OWNER`). */
function resolveAllowedGitHubOwners(env: Env): readonly string[] {
  const owner = resolveDefaultGhOwner(env);
  return owner ? [owner] : [];
}

/** Build the `Authorization` header when a `GITHUB_TOKEN` secret is configured. */
function buildGitHubHeaders(env: Env): Readonly<Record<string, string>> {
  return env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {};
}

/** Transform a GitHub repository into its SPDX license (`none` without license, `custom` when unrecognized). */
function transformGitHubLicense(payload: Partial<GitHubRepoPayload>): Partial<MetricResult> {
  const { license } = payload;
  if (!license) {
    return { value: 'none' };
  }
  const spdxId = license.spdx_id;
  return { value: spdxId && spdxId !== 'NOASSERTION' ? formatLicense(spdxId) : 'custom' };
}

/** Transform GitHub commit participation into an 8-week total and sparkline (non-numeric weeks count as `0`). */
function transformGitHubActivity(
  payload: Partial<GitHubParticipationPayload>
): Partial<MetricResult> {
  const allWeeks = Array.isArray(payload.all) ? payload.all : [];
  const recentWeeks: number[] = [];
  let totalRecent = 0;
  for (let i = Math.max(0, allWeeks.length - ACTIVITY_WEEKS); i < allWeeks.length; i += 1) {
    const rawCount: unknown = allWeeks[i];
    const weekCount =
      typeof rawCount === 'number' && Number.isFinite(rawCount) ? Math.max(0, rawCount) : 0;
    recentWeeks.push(weekCount);
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

/** GitHub repository service preset (`gh`), restricted to the `DEFAULT_GH_OWNER` binding. */
export const GITHUB_SERVICE = defineService({
  allowedOwners: resolveAllowedGitHubOwners,
  buildHeaders: buildGitHubHeaders,
  docs: {
    description:
      'Repository stars, forks, open issues & PRs, license, last commit, release, and activity.',
    title: 'GitHub',
  },
  metrics: {
    activity: createMetric(
      PARTICIPATION_ENDPOINT,
      { defaultColor: 'emerald', defaultIcon: 'activity', defaultLabel: 'commits' },
      transformGitHubActivity
    ),
    commit: createRelativeDateMetric(
      withPageSuffix(REPO_ENDPOINT, '/commits'),
      LAST_COMMIT,
      (repo) => repo.pushed_at
    ),
    forks: createCountMetric(
      withPageSuffix(REPO_ENDPOINT, '/network/members'),
      FORKS,
      (repo) => repo.forks_count
    ),
    // GitHub's `open_issues_count` includes open pull requests.
    issues: createCountMetric(
      withPageSuffix(REPO_ENDPOINT, '/issues'),
      { ...ISSUES, defaultLabel: 'issues & PRs' },
      (repo) => repo.open_issues_count
    ),
    // The repository root renders any license file (`LICENSE.md`, `COPYING`, …).
    license: createMetric(REPO_ENDPOINT, LICENSE, transformGitHubLicense),
    release: createReleaseMetric(RELEASE_ENDPOINT, (release) => release.tag_name),
    stars: createCountMetric(
      withPageSuffix(REPO_ENDPOINT, '/stargazers'),
      STARS,
      (repo) => repo.stargazers_count
    ),
  },
  route: {
    owner: { isRequired: false, placeholder: ':owner', resolveDefault: resolveDefaultGhOwner },
    target: { placeholder: ':repo' },
  },
});
