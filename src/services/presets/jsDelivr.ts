/**
 * jsDelivr service preset – CDN request hits for unscoped and scoped npm packages (`/badge/jsdelivr/[:scope/]:pkg/:metric`).
 */

import { CACHE_TTL, createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createCountMetric, encodeNpmPackageName } from '@/services/metrics';
import type { MetricEndpoint, MetricPresentation } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Request hit statistics of a jsDelivr package. */
interface JsDelivrHits {
  /** Total hits in the requested period. */
  total?: number;
}

/** Partial jsDelivr package statistics payload (`data.jsdelivr.com/v1/stats/packages/npm/:pkg`). */
interface JsDelivrStatsPayload {
  /** Request hit statistics for the requested period. */
  hits: JsDelivrHits | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default presentation for jsDelivr hit metrics. */
const HITS: MetricPresentation = {
  defaultColor: 'orange',
  defaultIcon: 'jsdelivr',
  defaultLabel: 'jsdelivr',
};

/** Projection of the jsDelivr statistics (only the hit totals). */
const HITS_PROJECTION = pickFields<JsDelivrStatsPayload>(['hits']);

// -------------------------------------- INTERNALS --------------------------------------

/** Create a jsDelivr npm package statistics endpoint for a period (`week`, `month`, `year`; Refreshed daily). */
function createJsDelivrEndpoint(period: string): MetricEndpoint<Partial<JsDelivrStatsPayload>> {
  return createEndpoint({
    api: ({ owner, target }) =>
      `https://data.jsdelivr.com/v1/stats/packages/npm/${encodeNpmPackageName(owner, target)}?period=${period}`,
    page: ({ owner, target }) =>
      `https://www.jsdelivr.com/package/npm/${encodeNpmPackageName(owner, target)}`,
    project: HITS_PROJECTION,
    ttl: CACHE_TTL.daily,
  });
}

// -------------------------------------- PUBLIC API -------------------------------------

/** jsDelivr CDN statistics service preset (`jsdelivr`). */
export const JSDELIVR_SERVICE = defineService({
  docs: {
    description: 'Weekly, monthly, and yearly CDN request hits for any npm package (hw/hm/hy).',
    title: 'jsDelivr',
  },
  metricAliases: { hits: 'hm' },
  metrics: {
    hm: createCountMetric(
      createJsDelivrEndpoint('month'),
      HITS,
      (stats) => stats.hits?.total,
      '/mo'
    ),
    hw: createCountMetric(
      createJsDelivrEndpoint('week'),
      HITS,
      (stats) => stats.hits?.total,
      '/wk'
    ),
    hy: createCountMetric(
      createJsDelivrEndpoint('year'),
      HITS,
      (stats) => stats.hits?.total,
      '/yr'
    ),
  },
  route: { owner: { isRequired: false, placeholder: ':scope' }, target: { placeholder: ':pkg' } },
});
