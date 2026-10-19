/**
 * Open Collective service preset – Backer count and yearly budget of a collective (`/badge/opencollective/:slug/:metric`).
 */

import { createCountTransform, formatCurrency } from '@/services/metrics';
import type { MetricEndpoint, MetricResult, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Open Collective collective payload (`opencollective.com/:slug.json`). */
interface OpenCollectivePayload {
  /** Number of backers (individuals and organizations). */
  backersCount: number;
  /** ISO 4217 currency code of the collective. */
  currency: string;
  /** Estimated yearly income in cents. */
  yearlyIncome: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Number of cents per major currency unit. */
const CENTS_PER_UNIT = 100;

/** Open Collective collective endpoint with collective page redirect. */
const OPEN_COLLECTIVE_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, slug: string): string => `https://opencollective.com/${slug}.json`,
  buildRedirectUrl: (_owner: string, slug: string): string => `https://opencollective.com/${slug}`,
};

// -------------------------------------- INTERNALS --------------------------------------

/** Transform a collective payload into its yearly budget (`'$177.5k/yr'`). */
function transformOpenCollectiveBudget(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as Partial<OpenCollectivePayload>;
  const income =
    typeof payload.yearlyIncome === 'number' ? payload.yearlyIncome / CENTS_PER_UNIT : undefined;
  return { value: formatCurrency(income, payload.currency, '/yr') };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Open Collective service preset (`opencollective`). */
export const OPEN_COLLECTIVE_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Backer count and estimated yearly budget in the collective currency.',
    targetName: ':slug',
    title: 'Open Collective',
  },
  metrics: {
    backers: {
      ...OPEN_COLLECTIVE_ENDPOINT,
      defaultColor: 'blue',
      defaultIcon: 'opencollective',
      defaultLabel: 'backers',
      transform: createCountTransform<OpenCollectivePayload>((payload) => payload.backersCount),
    },
    budget: {
      ...OPEN_COLLECTIVE_ENDPOINT,
      defaultColor: 'emerald',
      defaultIcon: 'opencollective',
      defaultLabel: 'budget',
      transform: transformOpenCollectiveBudget,
    },
  },
  ownerMode: 'none',
};
