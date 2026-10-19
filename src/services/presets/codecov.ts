/**
 * Codecov service preset – Test coverage of a GitHub repository with a threshold-colored ring gauge (`/badge/codecov/:owner/:repo/:metric`).
 */

import { createCoverageService } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Coverage totals of a Codecov repository's default branch. */
interface CodecovTotals {
  /** Line coverage percentage (`null` when no report was uploaded yet). */
  coverage?: number | null;
}

/** Partial Codecov repository payload (`api.codecov.io/api/v2/github/:owner/repos/:repo/`). */
interface CodecovRepoPayload {
  /** Coverage totals of the default branch. */
  totals: CodecovTotals | null;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Codecov service preset (`codecov`). */
export const CODECOV_SERVICE = createCoverageService<CodecovRepoPayload>({
  api: 'https://api.codecov.io/api/v2/github/{owner}/repos/{target}/',
  description: 'Default-branch test coverage of a GitHub repository (ring gauge, colored by %).',
  icon: 'codecov',
  page: 'https://app.codecov.io/gh/{owner}/{target}',
  readPercent: (repo) => repo.totals?.coverage,
  title: 'Codecov',
});
