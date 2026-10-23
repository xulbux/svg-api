/**
 * OpenSSF Scorecard service preset – Live upstream metrics and redirect transformations.
 */

import {
  CACHE_TTL,
  OWNER_REPO_ROUTE,
  createEndpoint,
  defineService,
  isJsonObject,
} from '@/services/endpoint';
import {
  createScorecardMetric,
  readFiniteNumber,
  readScorecardCheckScores,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected OpenSSF Scorecard project payload (`api.securityscorecards.dev/projects/github.com/:owner/:repo`). */
interface ScorecardProjectProjection {
  /** Valid check scores (`0`–`10`). */
  checks?: number[];
  /** Aggregate score (`0`–`10`). */
  score?: number;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Project an OpenSSF Scorecard payload to its aggregate score and individual check scores. */
function projectScorecard(data: unknown): ScorecardProjectProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const checks = readScorecardCheckScores(data.checks);
  return { ...(checks ? { checks } : {}), score: readFiniteNumber(data.score) };
}

/** OpenSSF Scorecard API endpoint (results refresh weekly) with Scorecard viewer redirect. */
const SCORECARD_ENDPOINT = createEndpoint({
  api: 'https://api.securityscorecards.dev/projects/github.com/{owner}/{target}',
  page: 'https://scorecard.dev/viewer/?uri=github.com/{owner}/{target}',
  project: projectScorecard,
  ttl: CACHE_TTL.daily,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** OpenSSF Scorecard service preset (`scorecard`). */
export const SCORECARD_SERVICE = defineService({
  docs: {
    description: 'OpenSSF Scorecard score of a GitHub repository (ring gauge, colored by score).',
    title: 'OpenSSF Scorecard',
  },
  metrics: {
    score: createScorecardMetric(
      SCORECARD_ENDPOINT,
      (project) => project.score,
      (project) => project.checks
    ),
  },
  route: OWNER_REPO_ROUTE,
});
