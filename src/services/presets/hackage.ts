/**
 * Hackage service preset – Live upstream metrics and redirect transformations.
 */

import { PACKAGE_ROUTE, createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import { createVersionMetric, readText } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Hackage preferred versions metadata (`hackage.haskell.org/package/:pkg/preferred`). */
interface HackagePreferredProjection {
  /** Newest non-deprecated package version. */
  latestVersion?: string;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Project a Hackage preferred versions payload to its newest non-deprecated version. */
function projectHackagePreferred(data: unknown): HackagePreferredProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const versions = data['normal-version'];
  return { latestVersion: Array.isArray(versions) ? readText(versions[0]) : undefined };
}

/** Hackage preferred versions endpoint (JSON via `Accept`) with package page redirect. */
const HACKAGE_ENDPOINT = createEndpoint({
  api: 'https://hackage.haskell.org/package/{target}/preferred',
  extractKeys: ['normal-version'],
  page: 'https://hackage.haskell.org/package/{target}',
  project: projectHackagePreferred,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Hackage service preset (`hackage`). */
export const HACKAGE_SERVICE = defineService({
  docs: { description: 'Latest non-deprecated package version.', title: 'Hackage' },
  metrics: {
    v: createVersionMetric(
      HACKAGE_ENDPOINT,
      { defaultColor: 'violet', defaultIcon: 'haskell', defaultLabel: 'Hackage' },
      (preferred) => preferred.latestVersion
    ),
  },
  route: PACKAGE_ROUTE,
});
