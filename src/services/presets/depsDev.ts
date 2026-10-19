/**
 * deps.dev service preset – Stars, forks, open issues, license, and OpenSSF Scorecard score of any public GitHub repository via the token-free Open Source Insights API (`/badge/depsdev/:owner/:repo/:metric`).
 *
 * deps.dev mirrors GitHub project metadata roughly once a day, so values may lag behind GitHub.
 */

import { CACHE_TTL, createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  createCountMetric,
  createLicenseMetric,
  createScorecardMetric,
  FORKS,
  ISSUES,
  STARS,
  toFiniteNumber,
} from '@/services/metrics';
import type { ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected deps.dev project payload (`api.deps.dev/v3/projects/github.com%2F:owner%2F:repo`). */
interface DepsDevProjectProjection {
  /** Number of forks (`forksCount`). */
  forks?: number;
  /** Number of open issues and pull requests (`openIssuesCount`). */
  issues?: number;
  /** SPDX license identifier (`license`). */
  license?: string;
  /** OpenSSF Scorecard aggregate score (`scorecard.overallScore`, `0`–`10`). */
  score?: number;
  /** Number of stargazers (`starsCount`). */
  stars?: number;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Read a finite number field. */
function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? toFiniteNumber(value) : undefined;
}

/** Project a deps.dev project into its counters, license, and Scorecard score (the check details are dropped). */
function projectDepsDevProject(data: unknown): DepsDevProjectProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const scorecard = isJsonObject(data.scorecard) ? data.scorecard : undefined;
  return {
    forks: readNumber(data.forksCount),
    issues: readNumber(data.openIssuesCount),
    license: typeof data.license === 'string' && data.license ? data.license : undefined,
    score: readNumber(scorecard?.overallScore),
    stars: readNumber(data.starsCount),
  };
}

/** Create the deps.dev service preset. */
function createDepsDevService(): ServiceDefinition {
  const projectEndpoint = createEndpoint({
    api: 'https://api.deps.dev/v3/projects/github.com%2F{id}',
    page: 'https://deps.dev/project/github/{id}',
    project: projectDepsDevProject,
    ttl: CACHE_TTL.daily,
  });
  return defineService({
    docs: {
      description:
        'Stars, forks, open issues & PRs, license, and OpenSSF Scorecard score of any public GitHub repository (refreshed about daily).',
      title: 'deps.dev',
    },
    metrics: {
      forks: createCountMetric(projectEndpoint, FORKS, (project) => project.forks),
      issues: createCountMetric(
        projectEndpoint,
        { ...ISSUES, defaultLabel: 'issues & PRs' },
        (project) => project.issues
      ),
      license: createLicenseMetric(projectEndpoint, (project) => project.license),
      score: createScorecardMetric(projectEndpoint, (project) => project.score),
      stars: createCountMetric(projectEndpoint, STARS, (project) => project.stars),
    },
    route: { owner: { isRequired: true, placeholder: ':owner' }, target: { placeholder: ':repo' } },
  });
}

// -------------------------------------- PUBLIC API -------------------------------------

/** deps.dev service preset (`depsdev`). */
export const DEPS_DEV_SERVICE: ServiceDefinition = createDepsDevService();
