/**
 * GitLab service preset – Public gitlab.com project stars, forks, open issues, license, last activity, and latest release for any owner, incl. projects in nested subgroups (`/badge/gitlab/:owner/[:subgroup/]:repo/:metric`).
 */

import { createEndpoint, defineService, pickFields, withPageSuffix } from '@/services/endpoint';
import {
  FORKS,
  ISSUES,
  LAST_COMMIT,
  RATIO_SPECIALS,
  RATIO_STEPS_SPECIALS,
  STARS,
  buildRatioSpecials,
  createCountMetric,
  createLicenseMetric,
  createRelativeDateMetric,
  createReleaseMetric,
  formatSpdxKey,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Detected license metadata of a GitLab project. */
interface GitLabLicense {
  /** Lowercase SPDX license key (e.g., `'mit'`, `'apache-2.0'`). */
  key?: string;
}

/** Partial GitLab project API payload (`gitlab.com/api/v4/projects/:id?license=true`). */
interface GitLabProjectPayload {
  /** Number of project forks. */
  forks_count: number;
  /** ISO 8601 timestamp of the most recent project activity. */
  last_activity_at: string;
  /** Detected license metadata. */
  license: GitLabLicense | null;
  /** Number of project stars. */
  star_count: number;
}

/** GitLab issue counts by state. */
interface GitLabIssueCounts {
  /** Total issues (opened + closed). */
  all?: number;
  /** Number of closed issues. */
  closed?: number;
  /** Number of open issues. */
  opened?: number;
}

/** GitLab issue statistics of a project. */
interface GitLabIssueStatistics {
  /** Issue counts by state. */
  counts?: GitLabIssueCounts;
}

/** Partial GitLab issue statistics payload (`gitlab.com/api/v4/projects/:id/issues_statistics`). */
interface GitLabIssueStatisticsPayload {
  /** Issue statistics. */
  statistics: GitLabIssueStatistics;
}

/** Partial GitLab latest release API payload. */
interface GitLabReleasePayload {
  /** Release git tag name. */
  tag_name: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum number of target segments after the top-level group (up to 3 nested subgroups plus the project). */
const GITLAB_MAX_TARGET_SEGMENTS = 4;

/** GitLab project endpoint (URL-encoded `owner%2Frepo` project ID; One projection shared by every project metric). */
const PROJECT_ENDPOINT = createEndpoint({
  api: 'https://gitlab.com/api/v4/projects/{id}?license=true',
  page: 'https://gitlab.com/{owner}/{target}',
  project: pickFields<GitLabProjectPayload>([
    'forks_count',
    'last_activity_at',
    'license',
    'star_count',
  ]),
});

/** GitLab issue statistics endpoint (anonymous project payloads omit `open_issues_count`). */
const ISSUES_ENDPOINT = createEndpoint({
  api: 'https://gitlab.com/api/v4/projects/{id}/issues_statistics?scope=all',
  page: 'https://gitlab.com/{owner}/{target}/-/issues',
  project: pickFields<GitLabIssueStatisticsPayload>(['statistics']),
});

/** GitLab latest release endpoint. */
const RELEASE_ENDPOINT = createEndpoint({
  api: 'https://gitlab.com/api/v4/projects/{id}/releases/permalink/latest',
  page: 'https://gitlab.com/{owner}/{target}/-/releases',
  project: pickFields<GitLabReleasePayload>(['tag_name']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** GitLab project service preset (`gitlab`). */
export const GITLAB_SERVICE = defineService({
  docs: {
    description: 'Project stars, forks, open issues, license, last activity, and latest release.',
    title: 'GitLab',
  },
  metricAliases: { commit: 'updated', 'last-commit': 'updated' },
  metrics: {
    forks: createCountMetric(
      withPageSuffix(PROJECT_ENDPOINT, '/-/forks'),
      { ...FORKS, autoSpecials: RATIO_SPECIALS },
      (project) => project.forks_count,
      '',
      (project) => buildRatioSpecials(project.forks_count, project.star_count)
    ),
    issues: createCountMetric(
      ISSUES_ENDPOINT,
      { ...ISSUES, autoSpecials: RATIO_STEPS_SPECIALS },
      (payload) => payload.statistics?.counts?.opened,
      '',
      (payload) =>
        buildRatioSpecials(
          payload.statistics?.counts?.closed,
          payload.statistics?.counts?.all,
          true
        )
    ),
    license: createLicenseMetric(PROJECT_ENDPOINT, (project) =>
      formatSpdxKey(project.license?.key)
    ),
    release: createReleaseMetric(RELEASE_ENDPOINT, (release) => release.tag_name),
    stars: createCountMetric(
      withPageSuffix(PROJECT_ENDPOINT, '/-/starrers'),
      STARS,
      (project) => project.star_count
    ),
    updated: createRelativeDateMetric(
      withPageSuffix(PROJECT_ENDPOINT, '/-/activity'),
      { ...LAST_COMMIT, defaultLabel: 'last activity' },
      (project) => project.last_activity_at
    ),
  },
  route: {
    owner: { isRequired: true, placeholder: ':owner' },
    // Nested subgroups (`group/subgroup/project`) span several target segments.
    target: { maxSegments: GITLAB_MAX_TARGET_SEGMENTS, placeholder: ':[subgroup/]repo' },
  },
});
