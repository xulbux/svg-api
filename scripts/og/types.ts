/**
 * OpenGraph rasterizer types – Shared color, gradient, geometry, and module shapes for build-time SVG-to-PNG rendering.
 */

import type { RgbTuple } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

export type { RgbTuple } from '@/types';

/** 2D Cartesian coordinate `[pointX, pointY]` in canvas pixels. */
export type Point2D = readonly [pointX: number, pointY: number];

/** Floating-point premultiplied-ready RGBA color `[red, green, blue, alpha]` (`rgb` in `[0, 255]`, `alpha` in `[0, 1]`). */
export type RgbaTuple = readonly [red: number, green: number, blue: number, alpha: number];

/** Directed 2D line segment `[ax, ay, bx, by]` in canvas pixels. */
export type Segment2D = readonly [ax: number, ay: number, bx: number, by: number];

/** Parsed `<stop>` definition inside an SVG gradient. */
export interface GradientStop {
  /** Stop color channels in `[0, 255]`. */
  color: RgbTuple;
  /** Normalized stop position in `[0, 1]`. */
  offset: number;
  /** Stop opacity in `[0, 1]`. */
  opacity: number;
}

/** Parsed `<linearGradient>` definition in normalized object-bounding-box coordinates. */
interface LinearGradientDef {
  /** Discriminator tag. */
  kind: 'linear';
  /** Ordered gradient color stops. */
  stops: GradientStop[];
  /** Start X fraction in `[0, 1]`. */
  x1: number;
  /** End X fraction in `[0, 1]`. */
  x2: number;
  /** Start Y fraction in `[0, 1]`. */
  y1: number;
  /** End Y fraction in `[0, 1]`. */
  y2: number;
}

/** Parsed `<radialGradient>` definition in normalized object-bounding-box coordinates. */
interface RadialGradientDef {
  /** Center X fraction in `[0, 1]`. */
  cx: number;
  /** Center Y fraction in `[0, 1]`. */
  cy: number;
  /** Discriminator tag. */
  kind: 'radial';
  /** Outer radius fraction in `[0, 1]`. */
  radius: number;
  /** Ordered gradient color stops. */
  stops: GradientStop[];
}

/** Parsed SVG linear or radial gradient definition. */
export type GradientDef = LinearGradientDef | RadialGradientDef;

/** Flattened polyline subpath extracted from an SVG `<path>` `d` attribute. */
export interface FlattenedSubpath {
  /** Whether the subpath ended with a `Z` / `z` closepath command. */
  isClosed: boolean;
  /** Ordered polyline vertices in canvas pixels. */
  points: Point2D[];
}

/** Non-horizontal directed polygon edge ordered top-to-bottom (`y1 < y2`) for winding-rule scanlines. */
export interface DirectedEdge {
  /** Vertical winding direction (`1` downward, `-1` upward). */
  dir: -1 | 1;
  /** X coordinate at `y1`. */
  x1: number;
  /** X coordinate at `y2`. */
  x2: number;
  /** Upper Y coordinate. */
  y1: number;
  /** Lower Y coordinate. */
  y2: number;
}

/** Scanline intersection with a directed polygon edge. */
export interface ScanlineCrossing {
  /** Horizontal intersection coordinate in canvas pixels. */
  crossingX: number;
  /** Edge winding direction (`1` or `-1`). */
  dir: -1 | 1;
}

/** Directed scanline edge list and axis-aligned bounding box of a flattened `<path>`. */
export interface FilledPathEdges {
  /** Non-horizontal directed edges. */
  edges: DirectedEdge[];
  /** Maximum X coordinate across all edges. */
  maxX: number;
  /** Maximum Y coordinate across all edges. */
  maxY: number;
  /** Minimum X coordinate across all edges. */
  minX: number;
  /** Minimum Y coordinate across all edges. */
  minY: number;
}

/** Flattened line segments and axis-aligned bounding box of a stroked `<g>` icon group. */
export interface GroupSegments {
  /** Maximum X coordinate across all segments. */
  maxX: number;
  /** Maximum Y coordinate across all segments. */
  maxY: number;
  /** Minimum X coordinate across all segments. */
  minX: number;
  /** Minimum Y coordinate across all segments. */
  minY: number;
  /** Flattened polyline segments. */
  segments: Segment2D[];
}

/** Exports evaluated from `src/site/seo.ts` at build time. */
export interface LiveOgModule {
  /** Square pixel dimension of `/favicon.png`. */
  FAVICON_PNG_SIZE: number;
  /** OpenGraph card height in pixels. */
  OG_IMAGE_HEIGHT: number;
  /** OpenGraph card width in pixels. */
  OG_IMAGE_WIDTH: number;
  /** Renders the live OpenGraph SVG card markup. */
  renderOgImageSvg: () => string;
}
