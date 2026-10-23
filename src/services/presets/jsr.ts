/**
 * JSR service preset – Live upstream metrics and redirect transformations.
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createPercentScoreMetric, createVersionMetric, SCORE } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial JSR package API payload (`api.jsr.io/scopes/:scope/packages/:pkg`). */
interface JsrPackagePayload {
  /** Latest published version, or `null` when nothing is published. */
  latestVersion: string | null;
  /** JSR package quality score percentage (`0`–`100`). */
  score: number | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** JSR package endpoint (`{scope}` strips any optional `@` prefix) with package page redirect. */
const JSR_ENDPOINT = createEndpoint({
  api: 'https://api.jsr.io/scopes/{scope}/packages/{target}',
  page: 'https://jsr.io/@{scope}/{target}',
  project: pickFields<JsrPackagePayload>(['latestVersion', 'score']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** JavaScript Registry service preset (`jsr`). */
export const JSR_SERVICE = defineService({
  docs: { description: 'Latest version and JSR quality score (with ring gauge).', title: 'JSR' },
  metrics: {
    score: createPercentScoreMetric(
      JSR_ENDPOINT,
      { ...SCORE, defaultLabel: 'JSR Score' },
      (pkg) => pkg.score
    ),
    v: createVersionMetric(
      JSR_ENDPOINT,
      { defaultColor: 'yellow', defaultIcon: 'jsr', defaultLabel: 'JSR' },
      (pkg) => pkg.latestVersion
    ),
  },
  route: { owner: { isRequired: true, placeholder: ':scope' }, target: { placeholder: ':pkg' } },
});
