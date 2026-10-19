/**
 * Coveralls service preset – Test coverage of a GitHub repository with a threshold-colored ring gauge (`/badge/coveralls/:owner/:repo/:metric`).
 */

import { COVERAGE, createCoverageTransform } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Coveralls repository payload (`coveralls.io/github/:owner/:repo.json`). */
interface CoverallsRepoPayload {
  /** Latest build coverage percentage. */
  covered_percent: number | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Coveralls repository JSON endpoint with Coveralls dashboard redirect. */
const COVERALLS_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (owner: string, repo: string): string =>
    `https://coveralls.io/github/${owner}/${repo}.json`,
  buildRedirectUrl: (owner: string, repo: string): string =>
    `https://coveralls.io/github/${owner}/${repo}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Coveralls service preset (`coveralls`). */
export const COVERALLS_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Latest-build test coverage of a GitHub repository (ring gauge, colored by %).',
    ownerName: ':owner',
    targetName: ':repo',
    title: 'Coveralls',
  },
  metricAliases: { cov: 'coverage' },
  metrics: {
    coverage: {
      ...COVERALLS_ENDPOINT,
      ...COVERAGE,
      defaultIcon: 'coveralls',
      transform: createCoverageTransform<CoverallsRepoPayload>(
        (payload) => payload.covered_percent
      ),
    },
  },
  ownerMode: 'required',
};
