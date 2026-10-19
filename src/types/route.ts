/**
 * Route types – SVG route dispatch results and numeric query parameter ranges.
 */

import type { ServiceRequest } from './service';

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
  /** Complete SVG markup. */
  svg: string;
  /** Shared edge cache TTL in seconds. */
  ttlSeconds: number;
}

/** Service preset route match that needs upstream metric data. */
export interface ServiceSvgRouteMatch {
  /** Discriminant of a service preset badge. */
  kind: 'service';
  /** Parsed service preset route. */
  request: ServiceRequest;
}

/** Result of dispatching a request URL onto an SVG route. */
export type SvgRouteMatch = ServiceSvgRouteMatch | StaticSvgRouteMatch;
