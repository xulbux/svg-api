/**
 * JSR service preset – JavaScript Registry package version and JSR quality score (`/badge/jsr/:scope/:pkg/:metric`).
 */

import { createScoreTransform, createVersionTransform } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial JSR package API payload (`api.jsr.io/scopes/:scope/packages/:pkg`). */
interface JsrPackagePayload {
  /** Latest published version, or `null` when nothing is published. */
  latestVersion: string | null;
  /** JSR package quality score percentage (`0`–`100`). */
  score: number | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum JSR package quality score. */
const MAX_JSR_SCORE = 100;

// -------------------------------------- INTERNALS --------------------------------------

/** Strip an optional leading `@` from a JSR scope segment. */
function normalizeJsrScope(scope: string): string {
  return scope.startsWith('@') ? scope.slice(1) : scope;
}

/** Format a JSR score as a percentage (`'94%'`). */
function formatJsrScore(achieved: number): string {
  return `${achieved}%`;
}

/** JSR package endpoint with package page redirect. */
const JSR_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (scope: string, pkg: string): string =>
    `https://api.jsr.io/scopes/${normalizeJsrScope(scope)}/packages/${pkg}`,
  buildRedirectUrl: (scope: string, pkg: string): string =>
    `https://jsr.io/@${normalizeJsrScope(scope)}/${pkg}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** JavaScript Registry service preset (`jsr`). */
export const JSR_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Latest version and JSR quality score (with ring gauge).',
    ownerName: ':scope',
    targetName: ':pkg',
    title: 'JSR',
  },
  metrics: {
    score: {
      ...JSR_ENDPOINT,
      defaultColor: 'emerald',
      defaultIcon: 'gauge',
      defaultLabel: 'jsr score',
      transform: createScoreTransform<JsrPackagePayload>(
        (payload) => [payload.score, MAX_JSR_SCORE],
        formatJsrScore
      ),
    },
    v: {
      ...JSR_ENDPOINT,
      defaultColor: 'yellow',
      defaultIcon: 'jsr',
      defaultLabel: 'jsr',
      transform: createVersionTransform<JsrPackagePayload>((payload) => payload.latestVersion),
    },
  },
  ownerMode: 'required',
};
