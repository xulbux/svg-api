/**
 * JSR service preset – JavaScript Registry package version and JSR quality score (`/badge/jsr/:scope/:pkg/:metric`).
 */

import { createEndpoint, defineService, pickFields, stripScopePrefix } from '@/services/endpoint';
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

/** JSR package endpoint (the optional `@` of the scope segment is dropped) with package page redirect. */
const JSR_ENDPOINT = createEndpoint({
  api: ({ owner, target }) =>
    `https://api.jsr.io/scopes/${encodeURIComponent(stripScopePrefix(owner))}/packages/${encodeURIComponent(target)}`,
  page: ({ owner, target }) =>
    `https://jsr.io/@${encodeURIComponent(stripScopePrefix(owner))}/${encodeURIComponent(target)}`,
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
