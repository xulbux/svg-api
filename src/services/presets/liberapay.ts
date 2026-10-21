/**
 * Liberapay service preset – Patron count and weekly donations received by a user or team (`/badge/liberapay/:user/:metric`).
 */

import { createEndpoint, createMetric, defineService, pickFields } from '@/services/endpoint';
import {
  RATIO_STEPS_SPECIALS,
  buildRatioSpecials,
  createCommunityMetric,
  formatCurrency,
} from '@/services/metrics';
import type { MetricResult } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Liberapay money amount. */
interface LiberapayAmount {
  /** Decimal amount string (e.g., `'640.85'`). */
  amount?: string;
  /** ISO 4217 currency code. */
  currency?: string;
}

/** Partial Liberapay public profile payload (`liberapay.com/:user/public.json`). */
interface LiberapayPublicPayload {
  /** Weekly funding goal, or `null` when none is set. */
  goal: LiberapayAmount | null;
  /** Number of patrons. */
  npatrons: number;
  /** Weekly donations received, or `null` when the user hides them. */
  receiving: LiberapayAmount | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Liberapay public profile endpoint with profile page redirect. */
const LIBERAPAY_ENDPOINT = createEndpoint({
  api: 'https://liberapay.com/{target}/public.json',
  page: 'https://liberapay.com/{target}',
  project: pickFields<LiberapayPublicPayload>(['goal', 'npatrons', 'receiving']),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Transform a Liberapay profile into its weekly receipts (`'€640.85/wk'`), or `'hidden'`. */
function transformLiberapayReceiving(
  profile: Partial<LiberapayPublicPayload>
): Partial<MetricResult> {
  const { goal, receiving } = profile;
  if (!receiving) {
    return { value: 'hidden' };
  }
  return {
    specials: buildRatioSpecials(receiving.amount, goal?.amount, true),
    value: formatCurrency(receiving.amount, receiving.currency, '/wk'),
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Liberapay service preset (`liberapay`). */
export const LIBERAPAY_SERVICE = defineService({
  docs: {
    description: 'Patron count and weekly donations received (hidden when private).',
    title: 'Liberapay',
  },
  metrics: {
    patrons: createCommunityMetric(
      LIBERAPAY_ENDPOINT,
      'patrons',
      'liberapay',
      (profile) => profile.npatrons
    ),
    receives: createMetric(
      LIBERAPAY_ENDPOINT,
      {
        autoSpecials: RATIO_STEPS_SPECIALS,
        defaultColor: 'emerald',
        defaultIcon: 'liberapay',
        defaultLabel: 'receives',
      },
      transformLiberapayReceiving
    ),
  },
  route: { target: { placeholder: ':user' } },
});
