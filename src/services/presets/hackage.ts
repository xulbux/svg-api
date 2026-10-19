/**
 * Hackage service preset – Latest preferred Haskell package version (`/badge/hackage/:pkg/:metric`).
 */

import { createVersionTransform } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Hackage preferred versions payload (`hackage.haskell.org/package/:pkg/preferred`). */
interface HackagePreferredPayload {
  /** Non-deprecated versions, newest first. */
  'normal-version': string[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Hackage preferred versions endpoint (JSON via `Accept`) with package page redirect. */
const HACKAGE_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, pkg: string): string =>
    `https://hackage.haskell.org/package/${pkg}/preferred`,
  buildRedirectUrl: (_owner: string, pkg: string): string =>
    `https://hackage.haskell.org/package/${pkg}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Hackage service preset (`hackage`). */
export const HACKAGE_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Latest non-deprecated package version.',
    targetName: ':pkg',
    title: 'Hackage',
  },
  metrics: {
    v: {
      ...HACKAGE_ENDPOINT,
      defaultColor: 'violet',
      defaultIcon: 'haskell',
      defaultLabel: 'hackage',
      transform: createVersionTransform<HackagePreferredPayload>(
        (payload) => payload['normal-version']?.[0]
      ),
    },
  },
  ownerMode: 'none',
};
