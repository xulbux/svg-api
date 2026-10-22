/**
 * Open Collective service preset – Backer count and yearly budget of a collective (`/badge/opencollective/:slug/:metric`).
 */

import { createEndpoint, createMetric, defineService, pickFields } from '@/services/endpoint';
import { createCommunityMetric, formatCurrency, readFiniteNumber } from '@/services/metrics';
import type { MetricResult } from '@/types';

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
const OPEN_COLLECTIVE_ENDPOINT = createEndpoint({
  api: 'https://opencollective.com/{target}.json',
  page: 'https://opencollective.com/{target}',
  project: pickFields<OpenCollectivePayload>(['backersCount', 'currency', 'yearlyIncome']),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Transform a collective payload into its yearly budget (`'$177.5k/yr'`). */
function transformOpenCollectiveBudget(
  collective: Partial<OpenCollectivePayload>
): Partial<MetricResult> {
  const yearlyIncome = readFiniteNumber(collective.yearlyIncome);
  const income = yearlyIncome === undefined ? undefined : yearlyIncome / CENTS_PER_UNIT;
  return { value: formatCurrency(income, collective.currency, '/yr') };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Open Collective service preset (`opencollective`). */
export const OPEN_COLLECTIVE_SERVICE = defineService({
  docs: {
    description: 'Backer count and estimated yearly budget in the collective currency.',
    title: 'Open Collective',
  },
  metrics: {
    backers: createCommunityMetric(
      OPEN_COLLECTIVE_ENDPOINT,
      'backers',
      'opencollective',
      (collective) => collective.backersCount
    ),
    budget: createMetric(
      OPEN_COLLECTIVE_ENDPOINT,
      { defaultColor: 'emerald', defaultIcon: 'opencollective', defaultLabel: 'Budget' },
      transformOpenCollectiveBudget
    ),
  },
  route: { target: { placeholder: ':slug' } },
});
