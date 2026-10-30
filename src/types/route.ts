/**
 * Route Types
 *
 * SVG route dispatch results and numeric query parameter ranges.
 */

import type { MetricResult, ServiceRequest } from '@/types/service';
import type { BuilderKind } from '@/types/site';

// ---------------------------------------- TYPES ----------------------------------------

/** Inclusive numeric bounds and default value of a clamped query parameter (e.g., `?size=`). */
export interface NumericRange {
  /** Value used when the parameter is omitted or invalid. */
  default: number;
  /** Maximum allowed value. */
  max: number;
  /** Minimum allowed value. */
  min: number;
}

/** Statically rendered SVG route match that needs no upstream data. */
export interface StaticSvgRouteMatch {
  /** Discriminant of a statically rendered SVG. */
  kind: 'static';
  /** Render the complete SVG markup (deferred, so edge cache hits skip rendering entirely). */
  render: () => string;
  /** Shared edge cache TTL in seconds. */
  ttl: number;
}

/** Service preset route match that needs upstream metric data. */
export interface ServiceSvgRouteMatch {
  /** Discriminant of a service preset badge. */
  kind: 'service';
  /** Render the complete badge SVG markup from the resolved upstream metric and normalized query. */
  render: (result: MetricResult) => string;
  /** Parsed service preset route. */
  request: ServiceRequest;
}

/** Result of dispatching a request URL onto an SVG route. */
export type SvgRouteMatch = ServiceSvgRouteMatch | StaticSvgRouteMatch;

/** SVG route table entry serving `/<prefix>` and `/<prefix>/*`. */
export interface SvgRouteDefinition {
  /** Canonical route prefix when this entry is a shorthand alias (e.g., `'button'` for `'btn'`); Omitted on canonical routes. */
  aliasOf?: string;
  /** Builder element kind that edits static requests on this route. */
  builderKind?: BuilderKind;
  /** Maximum number of decoded path segments after the prefix (omitted when the resolver validates the count itself). */
  maxSegments?: number;
  /** First path segment (e.g., `'badge'`, `'icon'`). */
  prefix: string;
  /** Alphabetically sorted query parameters the route reads; The only ones passed to `resolve` and kept in the edge cache key. */
  queryParams: readonly string[];
  /** Resolve decoded path segments and the filtered query parameters onto a route match. */
  resolve: (segments: readonly string[], query: URLSearchParams) => SvgRouteMatch | undefined;
}

/** SVG route match together with its normalized edge cache key. */
export interface ResolvedSvgRequest {
  /** Normalized cache key URL (origin, raw pathname, and only the route's recognized query parameters, sorted). */
  cacheKey: string;
  /** Canonical path and query string when resolved through a shorthand route alias (`undefined` on canonical prefixes). */
  canonicalPath?: string;
  /** Dispatched route match. */
  match: SvgRouteMatch;
}
