/**
 * deps.dev service preset – Stars, forks, open issues, license, and OpenSSF Scorecard score of any public GitHub repository via the token-free Open Source Insights API (`/badge/depsdev/:owner/:repo/:metric`).
 *
 * deps.dev mirrors GitHub project metadata roughly once a day, so values may lag behind GitHub.
 */

import { CACHE_TTL, createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  FORKS,
  ISSUES,
  RATIO_SPECIALS,
  STARS,
  buildRatioSpecials,
  createCountMetric,
  createLicenseMetric,
  createScorecardMetric,
  readFiniteNumber,
  readScorecardCheckScores,
  readText,
} from '@/services/metrics';
import type { ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected deps.dev project payload (`api.deps.dev/v3/projects/github.com%2F:owner%2F:repo`). */
interface DepsDevProjectProjection {
  /** Valid OpenSSF Scorecard check scores (`0`–`10`). */
  checks?: number[];
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

/** Project a deps.dev project into its counters, license, and Scorecard score + check scores. */
function projectDepsDevProject(data: unknown): DepsDevProjectProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const scorecard = isJsonObject(data.scorecard) ? data.scorecard : undefined;
  const checks = readScorecardCheckScores(scorecard?.checks);
  return {
    ...(checks ? { checks } : {}),
    forks: readFiniteNumber(data.forksCount),
    issues: readFiniteNumber(data.openIssuesCount),
    license: readText(data.license),
    score: readFiniteNumber(scorecard?.overallScore),
    stars: readFiniteNumber(data.starsCount),
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
      forks: createCountMetric(
        projectEndpoint,
        { ...FORKS, autoSpecials: RATIO_SPECIALS },
        (project) => project.forks,
        '',
        (project) => buildRatioSpecials(project.forks, project.stars)
      ),
      issues: createCountMetric(
        projectEndpoint,
        { ...ISSUES, autoSpecials: RATIO_SPECIALS, defaultLabel: 'issues & PRs' },
        (project) => project.issues,
        '',
        (project) => buildRatioSpecials(project.issues, project.stars)
      ),
      license: createLicenseMetric(projectEndpoint, (project) => project.license),
      score: createScorecardMetric(
        projectEndpoint,
        (project) => project.score,
        (project) => project.checks
      ),
      stars: createCountMetric(projectEndpoint, STARS, (project) => project.stars),
    },
    route: { owner: { isRequired: true, placeholder: ':owner' }, target: { placeholder: ':repo' } },
  });
}

// -------------------------------------- PUBLIC API -------------------------------------

/** deps.dev service preset (`depsdev`). */
export const DEPS_DEV_SERVICE: ServiceDefinition = createDepsDevService();
