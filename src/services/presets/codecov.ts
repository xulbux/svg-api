/**
 * Codecov service preset – Test coverage of a GitHub repository with a threshold-colored ring gauge (`/badge/codecov/:owner/:repo/:metric`).
 */

import { COVERAGE, createCoverageTransform } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Codecov repository payload (`api.codecov.io/api/v2/github/:owner/repos/:repo/`). */
interface CodecovRepoPayload {
  /** Coverage totals of the default branch. */
  totals: {
    /** Line coverage percentage (`null` when no report was uploaded yet). */
    coverage?: number | null;
  } | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Codecov API v2 repository endpoint with Codecov dashboard redirect. */
const CODECOV_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (owner: string, repo: string): string =>
    `https://api.codecov.io/api/v2/github/${owner}/repos/${repo}/`,
  buildRedirectUrl: (owner: string, repo: string): string =>
    `https://app.codecov.io/gh/${owner}/${repo}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Codecov service preset (`codecov`). */
export const CODECOV_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Default-branch test coverage of a GitHub repository (ring gauge, colored by %).',
    ownerName: ':owner',
    targetName: ':repo',
    title: 'Codecov',
  },
  metricAliases: { cov: 'coverage' },
  metrics: {
    coverage: {
      ...CODECOV_ENDPOINT,
      ...COVERAGE,
      defaultIcon: 'codecov',
      transform: createCoverageTransform<CodecovRepoPayload>((payload) => payload.totals?.coverage),
    },
  },
  ownerMode: 'required',
};
