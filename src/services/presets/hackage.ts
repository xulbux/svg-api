/**
 * Hackage service preset – Live upstream metrics and redirect transformations.
 */

import { PACKAGE_ROUTE, createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createVersionMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Hackage preferred versions payload (`hackage.haskell.org/package/:pkg/preferred`). */
interface HackagePreferredPayload {
  /** Non-deprecated versions, newest first. */
  'normal-version': string[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Hackage preferred versions endpoint (JSON via `Accept`) with package page redirect. */
const HACKAGE_ENDPOINT = createEndpoint({
  api: 'https://hackage.haskell.org/package/{target}/preferred',
  page: 'https://hackage.haskell.org/package/{target}',
  project: pickFields<HackagePreferredPayload>(['normal-version']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Hackage service preset (`hackage`). */
export const HACKAGE_SERVICE = defineService({
  docs: { description: 'Latest non-deprecated package version.', title: 'Hackage' },
  metrics: {
    v: createVersionMetric(
      HACKAGE_ENDPOINT,
      { defaultColor: 'violet', defaultIcon: 'haskell', defaultLabel: 'Hackage' },
      (preferred) => {
        const versions = preferred['normal-version'];
        return Array.isArray(versions) ? versions[0] : undefined;
      }
    ),
  },
  route: PACKAGE_ROUTE,
});
