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
  PULL_REQUESTS,
  SERIES_DELTA_SPECIALS,
  STARS,
  buildSeriesSpecials,
  createCountMetric,
  createRelativeDateMetric,
  createReleaseMetric,
  formatCompactNumber,
  formatLicense,
  sumSeries,
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
  /** ISO 8601 timestamp of the most recent git push. */
  pushed_at: string;
  /** Number of repository stargazers. */
  stargazers_count: number;
}

/** Partial GitHub issue / pull request search payload (`api.github.com/search/issues`). */
interface GitHubSearchCountPayload {
  /** Total number of matching issues or pull requests. */
  total_count: number;
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
    'pushed_at',
    'stargazers_count',
  ]),
});

/** GitHub open issues count endpoint (excludes pull requests via `type:issue`). */
const ISSUES_ENDPOINT = createEndpoint({
  api: 'https://api.github.com/search/issues?q=repo:{owner}/{target}+type:issue+state:open&per_page=1',
  leadingKey: 'total_count',
  missingStatuses: [422],
  page: 'https://github.com/{owner}/{target}/issues',
  project: pickFields<GitHubSearchCountPayload>(['total_count']),
});

/** GitHub open pull requests count endpoint (`type:pr`). */
const PRS_ENDPOINT = createEndpoint({
  api: 'https://api.github.com/search/issues?q=repo:{owner}/{target}+type:pr+state:open&per_page=1',
  leadingKey: 'total_count',
  missingStatuses: [422],
  page: 'https://github.com/{owner}/{target}/pulls',
  project: pickFields<GitHubSearchCountPayload>(['total_count']),
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

/** Transform GitHub commit participation into an 8-week total, sparkline, and candidate widgets (non-numeric weeks count as `0`). */
function transformGitHubActivity(
  payload: Partial<GitHubParticipationPayload>
): Partial<MetricResult> {
  const allWeeks = Array.isArray(payload.all) ? payload.all : [];
  const parsedWeeks: number[] = [];
  for (const rawCount of allWeeks) {
    parsedWeeks.push(
      typeof rawCount === 'number' && Number.isFinite(rawCount) ? Math.max(0, rawCount) : 0
    );
  }
  const recentWeeks = parsedWeeks.slice(-ACTIVITY_WEEKS);
  const totalRecent = sumSeries(recentWeeks);
  const prevTotal =
    parsedWeeks.length >= ACTIVITY_WEEKS * 2
      ? sumSeries(
          parsedWeeks,
          parsedWeeks.length - ACTIVITY_WEEKS * 2,
          parsedWeeks.length - ACTIVITY_WEEKS
        )
      : undefined;
  const values =
    recentWeeks.length >= 2 ? recentWeeks : Array.from({ length: ACTIVITY_WEEKS }, () => 0);
  const sparkline = { type: 'sparkline' as const, values };
  const specials = buildSeriesSpecials({
    barsValues: values,
    current: totalRecent,
    previous: prevTotal,
    sparklineValues: values,
  });
  return {
    special: sparkline,
    specials: { ...specials, sparkline },
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
      'Repository stars, forks, open issues, open pull requests, license, last commit, release, and activity.',
    title: 'GitHub',
  },
  metrics: {
    activity: createMetric(
      PARTICIPATION_ENDPOINT,
      {
        autoSpecials: SERIES_DELTA_SPECIALS,
        defaultColor: 'emerald',
        defaultIcon: 'activity',
        defaultLabel: 'Commits',
        defaultSpecial: 'sparkline',
      },
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
    issues: createCountMetric(ISSUES_ENDPOINT, ISSUES, (payload) => payload.total_count),
    // The repository root renders any license file (`LICENSE.md`, `COPYING`, …).
    license: createMetric(REPO_ENDPOINT, LICENSE, transformGitHubLicense),
    prs: createCountMetric(PRS_ENDPOINT, PULL_REQUESTS, (payload) => payload.total_count),
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
