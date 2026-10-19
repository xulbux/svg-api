/**
 * Liberapay service preset – Patron count and weekly donations received by a user or team (`/badge/liberapay/:user/:metric`).
 */

import { createCountTransform, formatCurrency } from '@/services/metrics';
import type { MetricEndpoint, MetricResult, ServiceDefinition } from '@/types';

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
  /** Number of patrons. */
  npatrons: number;
  /** Weekly donations received, or `null` when the user hides them. */
  receiving: LiberapayAmount | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Liberapay public profile endpoint with profile page redirect. */
const LIBERAPAY_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, user: string): string =>
    `https://liberapay.com/${user}/public.json`,
  buildRedirectUrl: (_owner: string, user: string): string => `https://liberapay.com/${user}`,
};

// -------------------------------------- INTERNALS --------------------------------------

/** Transform a Liberapay profile into its weekly receipts (`'€640.85/wk'`), or `'hidden'`. */
function transformLiberapayReceiving(data: unknown): Partial<MetricResult> {
  const { receiving } = (data ?? {}) as Partial<LiberapayPublicPayload>;
  if (!receiving) {
    return { value: 'hidden' };
  }
  return { value: formatCurrency(receiving.amount, receiving.currency, '/wk') };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Liberapay service preset (`liberapay`). */
export const LIBERAPAY_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Patron count and weekly donations received (hidden when private).',
    targetName: ':user',
    title: 'Liberapay',
  },
  metrics: {
    patrons: {
      ...LIBERAPAY_ENDPOINT,
      defaultColor: 'amber',
      defaultIcon: 'liberapay',
      defaultLabel: 'patrons',
      transform: createCountTransform<LiberapayPublicPayload>((payload) => payload.npatrons),
    },
    receives: {
      ...LIBERAPAY_ENDPOINT,
      defaultColor: 'emerald',
      defaultIcon: 'liberapay',
      defaultLabel: 'receives',
      transform: transformLiberapayReceiving,
    },
  },
  ownerMode: 'none',
};
