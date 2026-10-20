/**
 * jsDelivr service preset – CDN request hits for unscoped and scoped npm packages (`/badge/jsdelivr/[:scope/]:pkg/:metric`).
 */

import {
  CACHE_TTL,
  NPM_PACKAGE_ROUTE,
  createEndpoint,
  defineService,
  isJsonObject,
} from '@/services/endpoint';
import { createCountMetric, readFiniteNumber } from '@/services/metrics';
import type { MetricEndpoint, MetricPresentation } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected jsDelivr package hit statistics (`data.jsdelivr.com/v1/stats/packages/npm/:pkg`). */
interface JsDelivrHitsProjection {
  /** Total hits in the requested period. */
  total?: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default presentation for jsDelivr hit metrics. */
const HITS: MetricPresentation = {
  defaultColor: 'orange',
  defaultIcon: 'jsdelivr',
  defaultLabel: 'jsdelivr',
};

// -------------------------------------- INTERNALS --------------------------------------

/** Project a jsDelivr statistics payload to its total hit count (discarding per-day/per-version breakdowns). */
function projectJsDelivrHits(data: unknown): JsDelivrHitsProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const hits = isJsonObject(data.hits) ? data.hits : undefined;
  return { total: readFiniteNumber(hits?.total) };
}

/** Create a jsDelivr npm package statistics endpoint for a period (`week`, `month`, `year`; Refreshed daily). */
function createJsDelivrEndpoint(period: string): MetricEndpoint<JsDelivrHitsProjection> {
  return createEndpoint({
    api: `https://data.jsdelivr.com/v1/stats/packages/npm/{npm}?period=${period}`,
    page: 'https://www.jsdelivr.com/package/npm/{npm}',
    project: projectJsDelivrHits,
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
    hm: createCountMetric(createJsDelivrEndpoint('month'), HITS, (stats) => stats.total, '/mo'),
    hw: createCountMetric(createJsDelivrEndpoint('week'), HITS, (stats) => stats.total, '/wk'),
    hy: createCountMetric(createJsDelivrEndpoint('year'), HITS, (stats) => stats.total, '/yr'),
  },
  route: NPM_PACKAGE_ROUTE,
});
