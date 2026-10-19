/**
 * jsDelivr service preset – CDN request hits for unscoped and scoped npm packages (`/badge/jsdelivr/[:scope/]:pkg/:metric`).
 */

import { createCountTransform, resolveNpmPackageName } from '@/services/metrics';
import type { MetricEndpoint, MetricPresentation, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial jsDelivr package statistics payload (`data.jsdelivr.com/v1/stats/packages/npm/:pkg`). */
interface JsDelivrStatsPayload {
  /** Request hit statistics for the requested period. */
  hits: {
    /** Total hits in the requested period. */
    total?: number;
  };
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default presentation for jsDelivr hit metrics. */
const HITS: MetricPresentation = {
  defaultColor: 'orange',
  defaultIcon: 'jsdelivr',
  defaultLabel: 'jsdelivr',
};

// -------------------------------------- INTERNALS --------------------------------------

/** Create a jsDelivr npm package statistics endpoint for a period (`week`, `month`, `year`). */
function createJsDelivrEndpoint(period: string): MetricEndpoint {
  return {
    buildApiUrl: (scope: string, pkg: string): string =>
      `https://data.jsdelivr.com/v1/stats/packages/npm/${resolveNpmPackageName(scope, pkg)}?period=${period}`,
    buildRedirectUrl: (scope: string, pkg: string): string =>
      `https://www.jsdelivr.com/package/npm/${resolveNpmPackageName(scope, pkg)}`,
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** jsDelivr CDN statistics service preset (`jsdelivr`). */
export const JSDELIVR_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Weekly, monthly, and yearly CDN request hits for any npm package.',
    ownerName: ':scope',
    targetName: ':pkg',
    title: 'jsDelivr',
  },
  metricAliases: { hits: 'hm' },
  metrics: {
    hm: {
      ...createJsDelivrEndpoint('month'),
      ...HITS,
      transform: createCountTransform<JsDelivrStatsPayload>(
        (payload) => payload.hits?.total,
        '/mo'
      ),
    },
    hw: {
      ...createJsDelivrEndpoint('week'),
      ...HITS,
      transform: createCountTransform<JsDelivrStatsPayload>(
        (payload) => payload.hits?.total,
        '/wk'
      ),
    },
    hy: {
      ...createJsDelivrEndpoint('year'),
      ...HITS,
      transform: createCountTransform<JsDelivrStatsPayload>(
        (payload) => payload.hits?.total,
        '/yr'
      ),
    },
  },
  ownerMode: 'optional',
};
