/**
 * Coveralls service preset – Test coverage of a GitHub repository with a threshold-colored ring gauge (`/badge/coveralls/:owner/:repo/:metric`).
 */

import { createCoverageService } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Coveralls repository payload (`coveralls.io/github/:owner/:repo.json`). */
interface CoverallsRepoPayload {
  /** Signed percentage point change from the previous build. */
  coverage_change: number | null;
  /** Latest build coverage percentage. */
  covered_percent: number | null;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Coveralls service preset (`coveralls`). */
export const COVERALLS_SERVICE = createCoverageService<CoverallsRepoPayload>({
  api: 'https://coveralls.io/github/{owner}/{target}.json',
  description: 'Latest-build test coverage of a GitHub repository (ring gauge, colored by %).',
  icon: 'coveralls',
  page: 'https://coveralls.io/github/{owner}/{target}',
  readDelta: (repo) => repo.coverage_change,
  readPercent: (repo) => repo.covered_percent,
  title: 'Coveralls',
});
