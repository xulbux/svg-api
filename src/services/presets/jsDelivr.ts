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
import {
  SERIES_DELTA_SPECIALS,
  bucketSeries,
  buildSeriesSpecials,
  createCountMetric,
  readDateKeyedSeries,
  readFiniteNumber,
  sumSeries,
} from '@/services/metrics';
import type { MetricEndpoint, MetricPresentation } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected jsDelivr package hit statistics (`data.jsdelivr.com/v1/stats/packages/npm/:pkg`). */
interface JsDelivrHitsProjection {
  /** Compact bucketed bar series for the period. */
  bars?: number[];
  /** Current comparison total (`hits.total` when `hits.prev.total` is present, else second half of `dates`). */
  currDelta?: number;
  /** Previous comparison total (`hits.prev.total` when present, else first half of `dates`). */
  prevDelta?: number;
  /** Compact bucketed sparkline series for the period. */
  sparkline?: number[];
  /** Total hits in the requested period. */
  total?: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default presentation for jsDelivr hit metrics. */
const HITS: MetricPresentation = {
  autoSpecials: SERIES_DELTA_SPECIALS,
  defaultColor: 'orange',
  defaultIcon: 'jsdelivr',
  defaultLabel: 'jsdelivr',
};

// -------------------------------------- INTERNALS --------------------------------------

/** Project a jsDelivr statistics payload to its total hit count, prior period total, and bucketed series. */
function projectJsDelivrHits(data: unknown): JsDelivrHitsProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const hits = isJsonObject(data.hits) ? data.hits : undefined;
  const prev = isJsonObject(hits?.prev) ? hits.prev : undefined;
  const total = readFiniteNumber(hits?.total);
  const prevTotal = readFiniteNumber(prev?.total);
  const daily = readDateKeyedSeries(hits?.dates);
  const mid = Math.floor(daily.length / 2);
  let currDelta = total !== undefined && prevTotal !== undefined ? total : undefined;
  let prevDelta = total !== undefined && prevTotal !== undefined ? prevTotal : undefined;
  if (currDelta === undefined && mid >= 1) {
    currDelta = sumSeries(daily, mid, daily.length);
    prevDelta = sumSeries(daily, 0, mid);
  }
  return {
    bars: daily.length >= 2 ? bucketSeries(daily, 12) : undefined,
    currDelta,
    prevDelta,
    sparkline: daily.length >= 2 ? bucketSeries(daily, 15) : undefined,
    total,
  };
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

/** Create a jsDelivr hit count metric with automatic `sparkline`, `bars`, and `delta` widgets. */
function createJsDelivrMetric(period: string, suffix: string) {
  return createCountMetric(
    createJsDelivrEndpoint(period),
    HITS,
    (stats) => stats.total,
    suffix,
    (stats) =>
      buildSeriesSpecials({
        barsValues: stats.bars,
        current: stats.currDelta,
        previous: stats.prevDelta,
        sparklineValues: stats.sparkline,
      })
  );
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
    hm: createJsDelivrMetric('month', '/mo'),
    hw: createJsDelivrMetric('week', '/wk'),
    hy: createJsDelivrMetric('year', '/yr'),
  },
  route: NPM_PACKAGE_ROUTE,
});
