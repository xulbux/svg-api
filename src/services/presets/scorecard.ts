/**
 * OpenSSF Scorecard service preset – Supply-chain security score (`0`–`10`) of a GitHub repository with a threshold-colored ring gauge (`/badge/scorecard/:owner/:repo/:metric`).
 */

import { CACHE_TTL, createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createScorecardMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial OpenSSF Scorecard project payload (`api.securityscorecards.dev/projects/github.com/:owner/:repo`). */
interface ScorecardProjectPayload {
  /** Aggregate score (`0`–`10`). */
  score: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** OpenSSF Scorecard API endpoint (results refresh weekly) with Scorecard viewer redirect. */
const SCORECARD_ENDPOINT = createEndpoint({
  api: 'https://api.securityscorecards.dev/projects/github.com/{owner}/{target}',
  page: 'https://scorecard.dev/viewer/?uri=github.com/{owner}/{target}',
  project: pickFields<ScorecardProjectPayload>(['score']),
  ttl: CACHE_TTL.daily,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** OpenSSF Scorecard service preset (`scorecard`). */
export const SCORECARD_SERVICE = defineService({
  docs: {
    description: 'OpenSSF Scorecard score of a GitHub repository (ring gauge, colored by score).',
    title: 'OpenSSF Scorecard',
  },
  metrics: { score: createScorecardMetric(SCORECARD_ENDPOINT, (project) => project.score) },
  route: { owner: { isRequired: true, placeholder: ':owner' }, target: { placeholder: ':repo' } },
});
