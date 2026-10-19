/**
 * OpenSSF Scorecard service preset – Supply-chain security score (`0`–`10`) of a GitHub repository with a threshold-colored ring gauge (`/badge/scorecard/:owner/:repo/:metric`).
 */

import { createScoreTransform } from '@/services/metrics';
import type { MetricEndpoint, ScoreColorThreshold, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial OpenSSF Scorecard project payload (`api.securityscorecards.dev/projects/github.com/:owner/:repo`). */
interface ScorecardProjectPayload {
  /** Aggregate score (`0`–`10`). */
  score: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum OpenSSF Scorecard score. */
const MAX_SCORECARD_SCORE = 10;

/** Tier-1 JSON cache TTL in seconds (Scorecard results refresh weekly). */
const SCORECARD_CACHE_TTL_SECONDS = 3600;

/** Score color thresholds: `>= 7.0` emerald, `>= 4.0` amber, otherwise rose. */
const SCORECARD_THRESHOLDS: readonly ScoreColorThreshold[] = [
  { color: 'emerald', minPercent: 70 },
  { color: 'amber', minPercent: 40 },
  { color: 'rose', minPercent: 0 },
];

/** OpenSSF Scorecard API endpoint with Scorecard viewer redirect. */
const SCORECARD_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (owner: string, repo: string): string =>
    `https://api.securityscorecards.dev/projects/github.com/${owner}/${repo}`,
  buildRedirectUrl: (owner: string, repo: string): string =>
    `https://scorecard.dev/viewer/?uri=github.com/${owner}/${repo}`,
  cacheTtlSeconds: SCORECARD_CACHE_TTL_SECONDS,
};

// -------------------------------------- INTERNALS --------------------------------------

/** Format a Scorecard score with at most 1 decimal (`'8.3/10'`). */
function formatScorecardScore(achieved: number, maximum: number): string {
  return `${Number(achieved.toFixed(1))}/${maximum}`;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** OpenSSF Scorecard service preset (`scorecard`). */
export const SCORECARD_SERVICE: ServiceDefinition = {
  docs: {
    description: 'OpenSSF Scorecard score of a GitHub repository (ring gauge, colored by score).',
    ownerName: ':owner',
    targetName: ':repo',
    title: 'OpenSSF Scorecard',
  },
  metrics: {
    score: {
      ...SCORECARD_ENDPOINT,
      defaultColor: 'emerald',
      defaultIcon: 'shield-check',
      defaultLabel: 'openssf scorecard',
      transform: createScoreTransform<ScorecardProjectPayload>(
        (payload) => [payload.score, MAX_SCORECARD_SCORE],
        formatScorecardScore,
        SCORECARD_THRESHOLDS
      ),
    },
  },
  ownerMode: 'required',
};
