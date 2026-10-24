/**
 * Icon resolver – Resolves stroke and brand/tech vector icon paths and their exact horizontal ink bounds.
 */

import { icons as deviconPlainSet } from '@iconify-json/devicon-plain';
import { icons as fileIconSet } from '@iconify-json/file-icons';
import { icons as simpleIconSet } from '@iconify-json/simple-icons';
// oxlint-disable-next-line import/no-namespace -- Lucide exports one binding per icon; The whole namespace is the slug lookup table.
import * as lucideIcons from 'lucide-static';
import lucideTagMap from 'lucide-static/tags.json';
import {
  BRAND_SLUG_CLEAN_RX,
  capitalizeSlugParts,
  createLruCache,
  getOwnValue,
  readLruCache,
  roundCoord,
  roundScale,
  writeLruCache,
} from '@/svg/shared';
import type {
  IconBody,
  IconLookup,
  IconPickerIndex,
  IconPickerSetId,
  IconXBounds,
  LruCache,
  ResolvedIcon,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Mutable scan position inside an SVG path `d` string. */
interface PathCursor {
  /** Current character index. */
  index: number;
  /** Complete path data being scanned. */
  pathData: string;
}

/** Mutable pen state while scanning an SVG path. */
interface PathPen {
  /** Active (possibly implicit) path command letter. */
  command: string;
  /** Current pen X coordinate. */
  currentX: number;
  /** Current pen Y coordinate. */
  currentY: number;
  /** Absolute X coordinate of the previous `C`/`S` segment's second control point (reflected by `S`). */
  lastCubicControlX: number | undefined;
  /** Absolute X coordinate of the previous `Q`/`T` segment's control point (reflected by `T`). */
  lastQuadControlX: number | undefined;
  /** X coordinate of the current subpath start (restored by `Z`). */
  subpathStartX: number;
  /** Y coordinate of the current subpath start (restored by `Z`). */
  subpathStartY: number;
}

/** Absolute endpoint parameters of an SVG elliptical arc segment (`A`/`a`). */
interface ArcSegment {
  /** Arc end X coordinate. */
  endX: number;
  /** Arc end Y coordinate. */
  endY: number;
  /** Whether the large-arc flag is set. */
  isLargeArc: boolean;
  /** Whether the sweep flag is set (positive-angle direction). */
  isSweep: boolean;
  /** Ellipse X radius. */
  radiusX: number;
  /** Ellipse Y radius. */
  radiusY: number;
  /** Ellipse X-axis rotation in degrees. */
  rotation: number;
  /** Arc start X coordinate. */
  startX: number;
  /** Arc start Y coordinate. */
  startY: number;
}

/** Lazily built fallback icons. */
interface LazyIconCache {
  /** Plain stroked circle used when even the fallback slug cannot be resolved. */
  circle?: ResolvedIcon;
  /** Translucent-ring `!` placeholder icon used for unknown icon slugs outside stack tiles. */
  placeholder?: ResolvedIcon;
  /** Standalone `!` placeholder icon used inside the translucent frame of unknown stack tiles. */
  stackPlaceholder?: ResolvedIcon;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Ordered display names of all bundled stroke and brand icon sets. */
export const ALL_ICON_SOURCE_NAMES: readonly string[] = [
  'Lucide',
  'Simple Icons',
  'Devicon Plain',
  'File Icons',
];

/** Scale factor normalizing Devicon Plain's `128x128` coordinate space to `24x24`. */
const DEVICON_SCALE = 0.1875;

/** Default coordinate box size of File Icons (`512x512`). */
const FILE_ICONS_DEFAULT_SIZE = 512;

/** Scale factor normalizing File Icons' `512x512` coordinate space to `24x24`. */
const FILE_ICONS_SCALE = 0.046875;

/**
 * Canonical brand slugs that prefer `@iconify-json/devicon-plain` over `@iconify-json/simple-icons`
 * so icon families (`c` / `cplusplus` / `csharp`, `javascript` / `typescript`) share an identical geometric frame
 * and database icons (`mysql`, `sqlite`) use clean symbol-only marks without embedded wordmark text.
 */
const DEVICON_PREFERRED_SLUG_LIST: readonly string[] = [
  'c',
  'cplusplus',
  'csharp',
  'javascript',
  'mysql',
  'sqlite',
  'typescript',
];

/** Lazily built set of `DEVICON_PREFERRED_SLUG_LIST` (`undefined` until first brand lookup). */
let deviconPreferredSlugsCache: ReadonlySet<string> | undefined = undefined;

/** Common icon slug aliases mapped to their canonical icon set slugs. */
export const ICON_SLUG_ALIASES: Readonly<Record<string, string>> = {
  ae: 'adobeaftereffects',
  ai: 'adobeillustrator',
  aws: 'amazonwebservices',
  azure: 'microsoftazure',
  bash: 'gnubash',
  'box-isometric-tape': 'package',
  browser: 'app-window',
  'camera-rotate': 'switch-camera',
  'circle-info': 'info',
  cpp: 'cplusplus',
  'crosshairs-simple': 'crosshair',
  cs: 'csharp',
  css: 'css3',
  'globe-code': 'globe',
  html: 'html5',
  js: 'javascript',
  md: 'markdown',
  microchip: 'cpu',
  nodejs: 'nodedotjs',
  postgres: 'postgresql',
  pr: 'adobepremierepro',
  ps: 'adobephotoshop',
  'puzzle-piece': 'puzzle',
  py: 'python',
  'rocket-launch': 'rocket',
  snake: 'worm',
  'square-text': 'message-square-text',
  swatchbook: 'swatch-book',
  tailwind: 'tailwindcss',
  threejs: 'threedotjs',
  ts: 'typescript',
  unreal: 'unrealengine',
  vscode: 'visualstudiocode',
  vue: 'vuedotjs',
};

/** Default stroke width in `24x24` icon units across stroked icons. */
export const DEFAULT_ICON_STROKE_WIDTH = 2.25;

/** Default icon slug rendered when an icon or tile request omits its slug. */
export const DEFAULT_ICON_SLUG = 'sparkles';

/** Fallback stroke icon slug rendered when a requested slug cannot be resolved. */
export const FALLBACK_ICON_SLUG = 'circle-alert';

/** Stroke opacity of the outer border around unknown-icon placeholders across all SVG elements. */
export const PLACEHOLDER_BORDER_OPACITY = 0.45;

/** Longest accepted icon slug in characters (the longest real slug is about 40 characters). */
export const MAX_ICON_SLUG_LENGTH = 64;

/** Inner SVG of the placeholder icon (translucent circle border + standalone `!`) rendered for unknown icon slugs outside stack tiles. */
const PLACEHOLDER_ICON_SVG = `<circle cx="12" cy="12" r="10" stroke-opacity="${PLACEHOLDER_BORDER_OPACITY}" /><path d="M12 7v5.5" /><path d="M12 16.5h.01" />`;

/** Inner SVG of the standalone `!` placeholder icon rendered inside the translucent frame of unknown stack tiles. */
const STACK_PLACEHOLDER_ICON_SVG =
  '<g stroke-width="2.75"><path d="M12 3.5v10.5" /><path d="M12 19.5h.01" /></g>';

/** Inner SVG of the last-resort fallback icon (a plain `24x24` circle). */
const FALLBACK_CIRCLE_SVG = '<circle cx="12" cy="12" r="9" />';

/** Horizontal bounds used when an icon body contains no measurable geometry. */
const DEFAULT_ICON_X_BOUNDS: Readonly<IconXBounds> = { maxX: 22, minX: 2 };

/** Half of the default stroke width added to stroked icon bounds. */
const STROKE_BOUNDS_PAD = DEFAULT_ICON_STROKE_WIDTH / 2;

/**
 * Maximum number of resolved icons in the icon cache per Worker isolate. Misses are never cached: They
 * are a few cheap map lookups, and caching them would let junk slugs evict hot entries.
 */
const MAX_RESOLVED_ICON_CACHE_SIZE = 1024;

/**
 * Maximum summed `innerSvg` length in UTF-16 code units of the resolved icon cache; The largest brand
 * bodies reach ~54k code units, so the entry count alone cannot bound the isolate's memory.
 */
const MAX_RESOLVED_ICON_CACHE_WEIGHT = 2_000_000;

/** Number of icons per icon picker body asset page. */
const ICON_PICKER_PAGE_SIZE = 120;

/** Lucide `lucide-static` exports (SVG strings) keyed by PascalCase icon name. */
const LUCIDE_ICON_MAP: Readonly<Record<string, unknown>> = lucideIcons;

/**
 * Bounded LRU cache of resolved icons keyed by icon category and exact lookup slug, weighted by body size.
 */
const RESOLVED_ICON_CACHE = createLruCache<ResolvedIcon>(
  MAX_RESOLVED_ICON_CACHE_SIZE,
  (icon) => icon.innerSvg.length,
  MAX_RESOLVED_ICON_CACHE_WEIGHT
);

/** Lazily built fallback icons. */
const LAZY_ICONS: LazyIconCache = {};

/** Memoized icon picker index (`undefined` until first built). */
let iconPickerIndexCache: IconPickerIndex | undefined = undefined;

/** Memoized cleaned-slug (`[-_.]` stripped) lookup table for `@iconify-json/file-icons` (`undefined` until first built). */
let fileIconsCleanSlugMap: Map<string, string> | undefined = undefined;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches the last character before a PascalCase word boundary (a lowercase letter or digit before an uppercase letter, or an uppercase letter before a capitalized word, e.g., `AArrow`). */
const PASCAL_BOUNDARY_RX = /[\da-z](?=[A-Z])|[A-Z](?=[A-Z][a-z])/g;

/** Matches `fill="currentColor"` attributes inside Iconify SVG path bodies so parent `<g fill="…">` controls color and sheen. */
const CURRENT_COLOR_FILL_RX = /\s*fill="currentColor"/g;

/** Matches basic non-path SVG shape tags (`<circle>`, `<ellipse>`, `<rect>`, `<line>`, `<polyline>`, `<polygon>`). */
const SHAPE_TAG_RX = /<(?:circle|ellipse|rect|line|polyline|polygon)\b/;

/** Matches `<circle …>` elements in SVG markup. */
const CIRCLE_TAG_RX = /<circle\b[^>]*>/g;

/** Matches `<ellipse …>` elements in SVG markup. */
const ELLIPSE_TAG_RX = /<ellipse\b[^>]*>/g;

/** Matches `<rect …>` elements in SVG markup. */
const RECT_TAG_RX = /<rect\b[^>]*>/g;

/** Matches `<line …>` elements in SVG markup. */
const LINE_TAG_RX = /<line\b[^>]*>/g;

/** Matches `<polyline …>` and `<polygon …>` elements in SVG markup. */
const POLY_TAG_RX = /<(?:polyline|polygon)\b[^>]*>/g;

/** Matches whitespace-delimited `d="…"` path data attributes in SVG markup (never `data-d="…"`). */
const PATH_D_RX = /(?:^|\s)d="(?<d>[^"]+)"/g;

/** Matches a whitespace-delimited `cx="…"` attribute. */
const CX_ATTR_RX = /(?:^|\s)cx="(?<value>[^"]+)"/;

/** Matches a whitespace-delimited `r="…"` attribute. */
const R_ATTR_RX = /(?:^|\s)r="(?<value>[^"]+)"/;

/** Matches a whitespace-delimited `rx="…"` attribute. */
const RX_ATTR_RX = /(?:^|\s)rx="(?<value>[^"]+)"/;

/** Matches a whitespace-delimited `x="…"` attribute. */
const X_ATTR_RX = /(?:^|\s)x="(?<value>[^"]+)"/;

/** Matches a whitespace-delimited `width="…"` attribute (never `stroke-width="…"`). */
const WIDTH_ATTR_RX = /(?:^|\s)width="(?<value>[^"]+)"/;

/** Matches a whitespace-delimited `x1="…"` attribute. */
const X1_ATTR_RX = /(?:^|\s)x1="(?<value>[^"]+)"/;

/** Matches a whitespace-delimited `x2="…"` attribute. */
const X2_ATTR_RX = /(?:^|\s)x2="(?<value>[^"]+)"/;

/** Matches a whitespace-delimited `points="…"` attribute. */
const POINTS_ATTR_RX = /(?:^|\s)points="(?<value>[^"]+)"/;

/** Matches whitespace or comma separators inside SVG coordinate lists. */
const COORD_SPLIT_RX = /[\s,]+/;

/** Matches an SVG path number token (integer, decimal, or scientific notation) at `lastIndex` (sticky). */
const PATH_NUMBER_RX = /[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/iy;

// -------------------------------------- INTERNALS --------------------------------------

/** Extract a numeric attribute value (`attr="12.5"`) from an SVG tag string (`0` when absent). */
function extractNumericAttr(tag: string, attrRx: RegExp): number {
  const value = attrRx.exec(tag)?.groups?.value;
  return value === undefined ? 0 : Number(value);
}

/** Update running `[minX, maxX]` bounds with a candidate X coordinate in `24x24` space. */
function updateBounds(bounds: IconXBounds, rawX: number, scale: number): void {
  const scaled = rawX * scale;
  if (Number.isFinite(scaled)) {
    if (scaled < bounds.minX) {
      bounds.minX = scaled;
    }
    if (scaled > bounds.maxX) {
      bounds.maxX = scaled;
    }
  }
}

/** Record horizontal bounds for basic SVG geometric primitives (`circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`). */
function recordShapeBounds(svgStr: string, scale: number, bounds: IconXBounds): void {
  if (!SHAPE_TAG_RX.test(svgStr)) {
    return;
  }
  for (const match of svgStr.matchAll(CIRCLE_TAG_RX)) {
    const radius = extractNumericAttr(match[0], R_ATTR_RX);
    if (radius > 0) {
      const centerX = extractNumericAttr(match[0], CX_ATTR_RX);
      updateBounds(bounds, centerX - radius, scale);
      updateBounds(bounds, centerX + radius, scale);
    }
  }
  for (const match of svgStr.matchAll(ELLIPSE_TAG_RX)) {
    const radiusX = extractNumericAttr(match[0], RX_ATTR_RX);
    if (radiusX > 0) {
      const centerX = extractNumericAttr(match[0], CX_ATTR_RX);
      updateBounds(bounds, centerX - radiusX, scale);
      updateBounds(bounds, centerX + radiusX, scale);
    }
  }
  for (const match of svgStr.matchAll(RECT_TAG_RX)) {
    const width = extractNumericAttr(match[0], WIDTH_ATTR_RX);
    if (width > 0) {
      const rectX = extractNumericAttr(match[0], X_ATTR_RX);
      updateBounds(bounds, rectX, scale);
      updateBounds(bounds, rectX + width, scale);
    }
  }
  for (const match of svgStr.matchAll(LINE_TAG_RX)) {
    updateBounds(bounds, extractNumericAttr(match[0], X1_ATTR_RX), scale);
    updateBounds(bounds, extractNumericAttr(match[0], X2_ATTR_RX), scale);
  }
  for (const match of svgStr.matchAll(POLY_TAG_RX)) {
    const trimmedPoints = (POINTS_ATTR_RX.exec(match[0])?.groups?.value ?? '').trim();
    if (trimmedPoints.length > 0) {
      const points = trimmedPoints.split(COORD_SPLIT_RX);
      for (let i = 0; i < points.length; i += 2) {
        updateBounds(bounds, Number(points[i]), scale);
      }
    }
  }
}

/** Evaluate a 1D cubic Bezier polynomial at curve parameter `progress` (`0`–`1`). */
function evaluateCubic(
  startX: number,
  control1X: number,
  control2X: number,
  endX: number,
  progress: number
): number {
  const inverse = 1 - progress;
  return (
    inverse * inverse * inverse * startX +
    3 * inverse * inverse * progress * control1X +
    3 * inverse * progress * progress * control2X +
    progress * progress * progress * endX
  );
}

/** Record the interior horizontal extrema of a cubic Bezier segment (the end points are recorded by the caller). */
function recordCubicXBounds(
  startX: number,
  control1X: number,
  control2X: number,
  endX: number,
  scale: number,
  bounds: IconXBounds
): void {
  // Roots of the derivative `3 * (a * t² + b * t + c)` are the interior extrema candidates:
  const quadraticCoef = -startX + 3 * control1X - 3 * control2X + endX;
  const linearCoef = 2 * (startX - 2 * control1X + control2X);
  const constantCoef = control1X - startX;
  const roots: number[] = [];
  if (Math.abs(quadraticCoef) < 1e-12) {
    if (Math.abs(linearCoef) > 1e-12) {
      roots.push(-constantCoef / linearCoef);
    }
  } else {
    const discriminant = linearCoef * linearCoef - 4 * quadraticCoef * constantCoef;
    if (discriminant >= 0) {
      const sqrtDiscriminant = Math.sqrt(discriminant);
      roots.push(
        (-linearCoef + sqrtDiscriminant) / (2 * quadraticCoef),
        (-linearCoef - sqrtDiscriminant) / (2 * quadraticCoef)
      );
    }
  }
  for (const progress of roots) {
    if (progress > 0 && progress < 1) {
      updateBounds(bounds, evaluateCubic(startX, control1X, control2X, endX, progress), scale);
    }
  }
}

/** Record the interior horizontal extremum of a quadratic Bezier segment (the end points are recorded by the caller). */
function recordQuadXBounds(
  startX: number,
  controlX: number,
  endX: number,
  scale: number,
  bounds: IconXBounds
): void {
  const denominator = startX - 2 * controlX + endX;
  if (Math.abs(denominator) < 1e-12) {
    return;
  }
  const progress = (startX - controlX) / denominator;
  if (progress > 0 && progress < 1) {
    const inverse = 1 - progress;
    updateBounds(
      bounds,
      inverse * inverse * startX + 2 * inverse * progress * controlX + progress * progress * endX,
      scale
    );
  }
}

/** Check whether `angle` lies on the arc that starts at `startAngle` and sweeps by `deltaAngle` radians. */
function isAngleOnArc(angle: number, startAngle: number, deltaAngle: number): boolean {
  const fullTurn = 2 * Math.PI;
  const offset = deltaAngle >= 0 ? angle - startAngle : startAngle - angle;
  return ((offset % fullTurn) + fullTurn) % fullTurn <= Math.abs(deltaAngle);
}

/**
 * Record the exact horizontal extrema of an SVG elliptical arc (endpoint recorded by the caller), honoring
 * both radii, the X-axis rotation, and out-of-range radius scaling (SVG 1.1 implementation notes, F.6.5–F.6.6).
 */
function recordArcXBounds(arc: ArcSegment, scale: number, bounds: IconXBounds): void {
  let radiusX = Math.abs(arc.radiusX);
  let radiusY = Math.abs(arc.radiusY);
  const halfDeltaX = (arc.startX - arc.endX) / 2;
  const halfDeltaY = (arc.startY - arc.endY) / 2;
  if (radiusX === 0 || radiusY === 0 || (halfDeltaX === 0 && halfDeltaY === 0)) {
    // Zero radii draw a straight line and coincident endpoints draw nothing:
    return;
  }

  const axisAngle = (arc.rotation * Math.PI) / 180;
  const cosRotation = Math.cos(axisAngle);
  const sinRotation = Math.sin(axisAngle);
  const primeX = cosRotation * halfDeltaX + sinRotation * halfDeltaY;
  const primeY = -sinRotation * halfDeltaX + cosRotation * halfDeltaY;

  const radiiScale =
    (primeX * primeX) / (radiusX * radiusX) + (primeY * primeY) / (radiusY * radiusY);
  if (radiiScale > 1) {
    radiusX *= Math.sqrt(radiiScale);
    radiusY *= Math.sqrt(radiiScale);
  }

  const radiusXSq = radiusX * radiusX;
  const radiusYSq = radiusY * radiusY;
  const numerator =
    radiusXSq * radiusYSq - radiusXSq * primeY * primeY - radiusYSq * primeX * primeX;
  const denominator = radiusXSq * primeY * primeY + radiusYSq * primeX * primeX;
  const centerSign = arc.isLargeArc === arc.isSweep ? -1 : 1;
  const centerFactor = centerSign * Math.sqrt(Math.max(0, numerator / denominator));
  const centerPrimeX = (centerFactor * radiusX * primeY) / radiusY;
  const centerPrimeY = (-centerFactor * radiusY * primeX) / radiusX;
  const centerX =
    cosRotation * centerPrimeX - sinRotation * centerPrimeY + (arc.startX + arc.endX) / 2;

  const startAngle = Math.atan2(
    (primeY - centerPrimeY) / radiusY,
    (primeX - centerPrimeX) / radiusX
  );
  const endAngle = Math.atan2(
    (-primeY - centerPrimeY) / radiusY,
    (-primeX - centerPrimeX) / radiusX
  );
  let deltaAngle = endAngle - startAngle;
  if (arc.isSweep && deltaAngle < 0) {
    deltaAngle += 2 * Math.PI;
  } else if (!arc.isSweep && deltaAngle > 0) {
    deltaAngle -= 2 * Math.PI;
  }

  // `x(θ) = cx + rx·cos(φ)·cos(θ) − ry·sin(φ)·sin(θ)` is extremal where its derivative vanishes:
  const extremumAngle = Math.atan2(-radiusY * sinRotation, radiusX * cosRotation);
  for (const angle of [extremumAngle, extremumAngle + Math.PI]) {
    if (isAngleOnArc(angle, startAngle, deltaAngle)) {
      updateBounds(
        bounds,
        centerX + radiusX * cosRotation * Math.cos(angle) - radiusY * sinRotation * Math.sin(angle),
        scale
      );
    }
  }
}

/** Advance `cursor` past whitespace and comma separators. */
function skipPathSeparators(cursor: PathCursor): void {
  while (
    cursor.index < cursor.pathData.length &&
    ' ,\n\t\r'.includes(cursor.pathData.charAt(cursor.index))
  ) {
    cursor.index += 1;
  }
}

/** Read the next number token at `cursor` (`NaN` when none is present). */
function readPathNumber(cursor: PathCursor): number {
  skipPathSeparators(cursor);
  PATH_NUMBER_RX.lastIndex = cursor.index;
  const numberMatch = PATH_NUMBER_RX.exec(cursor.pathData);
  if (!numberMatch) {
    return Number.NaN;
  }
  cursor.index += numberMatch[0].length;
  return Number(numberMatch[0]);
}

/** Read an arc flag at `cursor`, which may be packed without separators (e.g., `a1 1 0 011 1`). */
function readPathArcFlag(cursor: PathCursor): number {
  skipPathSeparators(cursor);
  const char = cursor.pathData.charAt(cursor.index);
  if (char === '0' || char === '1') {
    cursor.index += 1;
    return Number(char);
  }
  return readPathNumber(cursor);
}

/** Read the X coordinate of a control or end point and skip its Y coordinate. */
function readPathPointX(cursor: PathCursor, originX: number): number {
  const pointX = originX + readPathNumber(cursor);
  readPathNumber(cursor);
  return pointX;
}

/** Read an end point into the pen's current position (`false` when truncated). */
function hasReadPathEndPoint(
  cursor: PathCursor,
  pen: PathPen,
  originX: number,
  originY: number
): boolean {
  const rawX = readPathNumber(cursor);
  const rawY = readPathNumber(cursor);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return false;
  }
  pen.currentX = originX + rawX;
  pen.currentY = originY + rawY;
  return true;
}

/** Consume a cubic (`C`/`S`) path segment and record its horizontal bounds. */
function applyCubicPathCommand(
  cursor: PathCursor,
  pen: PathPen,
  originX: number,
  originY: number,
  startX: number,
  lastCubicControlX: number | undefined,
  isSmooth: boolean,
  scale: number,
  bounds: IconXBounds
): void {
  const control1X = isSmooth
    ? 2 * startX - (lastCubicControlX ?? startX)
    : readPathPointX(cursor, originX);
  const control2X = readPathPointX(cursor, originX);
  if (
    !Number.isFinite(control1X) ||
    !Number.isFinite(control2X) ||
    !hasReadPathEndPoint(cursor, pen, originX, originY)
  ) {
    return;
  }
  recordCubicXBounds(startX, control1X, control2X, pen.currentX, scale, bounds);
  pen.lastCubicControlX = control2X;
  updateBounds(bounds, pen.currentX, scale);
}

/** Consume a quadratic (`Q`/`T`) path segment and record its horizontal bounds. */
function applyQuadPathCommand(
  cursor: PathCursor,
  pen: PathPen,
  originX: number,
  originY: number,
  startX: number,
  lastQuadControlX: number | undefined,
  isSmooth: boolean,
  scale: number,
  bounds: IconXBounds
): void {
  const controlX = isSmooth
    ? 2 * startX - (lastQuadControlX ?? startX)
    : readPathPointX(cursor, originX);
  if (!Number.isFinite(controlX) || !hasReadPathEndPoint(cursor, pen, originX, originY)) {
    return;
  }
  recordQuadXBounds(startX, controlX, pen.currentX, scale, bounds);
  pen.lastQuadControlX = controlX;
  updateBounds(bounds, pen.currentX, scale);
}

/** Consume an elliptical arc (`A`) path segment and record its horizontal bounds. */
function applyArcPathCommand(
  cursor: PathCursor,
  pen: PathPen,
  originX: number,
  originY: number,
  startX: number,
  scale: number,
  bounds: IconXBounds
): void {
  const radiusX = readPathNumber(cursor);
  const radiusY = readPathNumber(cursor);
  const rotation = readPathNumber(cursor);
  const isLargeArc = readPathArcFlag(cursor) === 1;
  const isSweep = readPathArcFlag(cursor) === 1;
  const startY = pen.currentY;
  if (
    !Number.isFinite(radiusX) ||
    !Number.isFinite(radiusY) ||
    !Number.isFinite(rotation) ||
    !hasReadPathEndPoint(cursor, pen, originX, originY)
  ) {
    return;
  }
  recordArcXBounds(
    {
      endX: pen.currentX,
      endY: pen.currentY,
      isLargeArc,
      isSweep,
      radiusX,
      radiusY,
      rotation,
      startX,
      startY,
    },
    scale,
    bounds
  );
  updateBounds(bounds, pen.currentX, scale);
}

/** Consume the coordinates of one path command (`pen.command`) and record its exact horizontal extent. */
function applyPathCommand(
  cursor: PathCursor,
  pen: PathPen,
  scale: number,
  bounds: IconXBounds
): void {
  const upper = pen.command.toUpperCase();
  const isAbsolute = pen.command === upper;
  const originX = isAbsolute ? 0 : pen.currentX;
  const originY = isAbsolute ? 0 : pen.currentY;
  const startX = pen.currentX;
  const { lastCubicControlX, lastQuadControlX } = pen;
  // Smooth curves only reflect the control point of the immediately preceding segment:
  pen.lastCubicControlX = undefined;
  pen.lastQuadControlX = undefined;

  switch (upper) {
    case 'M':
    case 'L': {
      if (!hasReadPathEndPoint(cursor, pen, originX, originY)) {
        return;
      }
      if (upper === 'M') {
        pen.subpathStartX = pen.currentX;
        pen.subpathStartY = pen.currentY;
        // Implicit coordinate pairs after a moveto are linetos:
        pen.command = isAbsolute ? 'L' : 'l';
      }
      break;
    }
    case 'H': {
      const rawX = readPathNumber(cursor);
      if (!Number.isFinite(rawX)) {
        return;
      }
      pen.currentX = originX + rawX;
      break;
    }
    case 'V': {
      const rawY = readPathNumber(cursor);
      if (Number.isFinite(rawY)) {
        pen.currentY = originY + rawY;
      }
      return;
    }
    case 'C':
    case 'S': {
      applyCubicPathCommand(
        cursor,
        pen,
        originX,
        originY,
        startX,
        lastCubicControlX,
        upper === 'S',
        scale,
        bounds
      );
      return;
    }
    case 'Q':
    case 'T': {
      applyQuadPathCommand(
        cursor,
        pen,
        originX,
        originY,
        startX,
        lastQuadControlX,
        upper === 'T',
        scale,
        bounds
      );
      return;
    }
    case 'A': {
      applyArcPathCommand(cursor, pen, originX, originY, startX, scale, bounds);
      return;
    }
    case 'Z': {
      pen.currentX = pen.subpathStartX;
      pen.currentY = pen.subpathStartY;
      return;
    }
    default: {
      return;
    }
  }
  updateBounds(bounds, pen.currentX, scale);
}

/** Parse a single SVG `<path d="…">` string and update `[minX, maxX]` bounds. */
function recordSinglePathD(pathData: string, scale: number, bounds: IconXBounds): void {
  const cursor: PathCursor = { index: 0, pathData };
  const pen: PathPen = {
    command: '',
    currentX: 0,
    currentY: 0,
    lastCubicControlX: undefined,
    lastQuadControlX: undefined,
    subpathStartX: 0,
    subpathStartY: 0,
  };

  while (cursor.index < pathData.length) {
    skipPathSeparators(cursor);
    if (cursor.index >= pathData.length) {
      break;
    }
    const iterationStart = cursor.index;
    const char = pathData.charAt(cursor.index);
    if ((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z')) {
      pen.command = char;
      cursor.index += 1;
    }
    if (pen.command.length > 0) {
      applyPathCommand(cursor, pen, scale, bounds);
    }
    // Skip unknown commands and malformed tokens so the scan always makes progress:
    if (cursor.index === iterationStart) {
      cursor.index += 1;
    }
  }
}

/**
 * Compute the exact horizontal visual bounding box of an icon body in `24x24` space (Bezier and arc extrema, not control points).
 * Exported from the `PUBLIC API` section; Declared here because the internal icon lookups measure with it.
 * @param svgStr         Inner SVG markup of the icon body.
 * @param isStroke       Whether the icon is stroked (pads the bounds by half the default stroke width).
 * @param coordScale     Scale factor from the body's coordinate space to `24x24` (defaults to `1`).
 * @param coordOffsetX   Horizontal offset in `24x24` units applied to the scaled coordinates (defaults to `0`).
 * @returns `minX`/`maxX` bounds clamped to `0`–`24` (`2`–`22` when the body has no measurable geometry).
 */
function computeIconXBounds(
  svgStr: string,
  isStroke: boolean,
  coordScale = 1,
  coordOffsetX = 0
): IconXBounds {
  const bounds: IconXBounds = { maxX: Number.NEGATIVE_INFINITY, minX: Number.POSITIVE_INFINITY };
  recordShapeBounds(svgStr, coordScale, bounds);
  for (const match of svgStr.matchAll(PATH_D_RX)) {
    recordSinglePathD(match.groups?.d ?? '', coordScale, bounds);
  }
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)) {
    return { ...DEFAULT_ICON_X_BOUNDS };
  }
  const strokePad = isStroke ? STROKE_BOUNDS_PAD : 0;
  const maxX = roundCoord(Math.min(24, bounds.maxX + coordOffsetX + strokePad));
  const minX = roundCoord(Math.max(0, bounds.minX + coordOffsetX - strokePad));
  if (maxX <= minX) {
    return { ...DEFAULT_ICON_X_BOUNDS };
  }
  return { maxX, minX };
}

/** Extract the inner markup of the outermost `<svg …>…</svg>` element (`undefined` when malformed). */
function extractInnerSvg(rawSvg: string): string | undefined {
  const openStart = rawSvg.indexOf('<svg');
  const openEnd = openStart === -1 ? -1 : rawSvg.indexOf('>', openStart);
  const closeStart = rawSvg.lastIndexOf('</svg>');
  if (openEnd === -1 || closeStart <= openEnd) {
    return undefined;
  }
  return rawSvg.slice(openEnd + 1, closeStart).trim();
}

/** Resolve a cleaned (`[-_.]` stripped) brand slug to its `@iconify-json/file-icons` key (built lazily on first use). */
function resolveFileIconCleanSlug(cleanSlug: string): string | undefined {
  if (fileIconsCleanSlugMap === undefined) {
    fileIconsCleanSlugMap = new Map<string, string>();
    for (const key of Object.keys(fileIconSet.icons)) {
      const cleanKey = key.replace(BRAND_SLUG_CLEAN_RX, '');
      if (!fileIconsCleanSlugMap.has(cleanKey)) {
        fileIconsCleanSlugMap.set(cleanKey, key);
      }
    }
  }
  return fileIconsCleanSlugMap.get(cleanSlug);
}

/** Resolve a Simple Icons alias slug (exact or `[-_.]`-cleaned) to its canonical parent slug (`undefined` when not an alias). */
function resolveSimpleIconAlias(slug: string): string | undefined {
  const { aliases } = simpleIconSet;
  if (!aliases) {
    return undefined;
  }
  return (
    getOwnValue(aliases, slug)?.parent ??
    getOwnValue(aliases, slug.replace(BRAND_SLUG_CLEAN_RX, ''))?.parent
  );
}

/** Canonicalize a normalized slug against Simple Icons' alias table when it is not a direct Simple Icons slug. */
function canonicalizeBrandSlug(slug: string): string {
  const normalized = slug.replace(BRAND_SLUG_CLEAN_RX, '');
  if (
    getOwnValue(simpleIconSet.icons, slug) !== undefined ||
    getOwnValue(simpleIconSet.icons, normalized) !== undefined
  ) {
    return slug;
  }
  return resolveSimpleIconAlias(slug) ?? slug;
}

/** Read a `512`-unit icon body from `@iconify-json/file-icons`, scaled and centered to `24x24` (no ink bounds). */
function getFileIconBody(slug: string): IconBody | undefined {
  const matchedKey = Object.hasOwn(fileIconSet.icons, slug)
    ? slug
    : resolveFileIconCleanSlug(slug.replace(BRAND_SLUG_CLEAN_RX, ''));
  const entry = matchedKey ? getOwnValue(fileIconSet.icons, matchedKey) : undefined;
  if (!entry?.body) {
    return undefined;
  }
  const width = entry.width ?? FILE_ICONS_DEFAULT_SIZE;
  const height = entry.height ?? FILE_ICONS_DEFAULT_SIZE;
  const boxSize = Math.max(width, height, FILE_ICONS_DEFAULT_SIZE);
  const coordScale =
    boxSize === FILE_ICONS_DEFAULT_SIZE ? FILE_ICONS_SCALE : roundScale(24 / boxSize);
  const coordOffsetX = width === boxSize ? 0 : roundCoord((24 - width * coordScale) / 2);
  const offsetY = height === boxSize ? 0 : roundCoord((24 - height * coordScale) / 2);
  const transform =
    coordOffsetX === 0 && offsetY === 0
      ? `scale(${coordScale})`
      : `translate(${coordOffsetX}, ${offsetY}) scale(${coordScale})`;
  const cleanBody = entry.body.replace(CURRENT_COLOR_FILL_RX, '').trim();
  return {
    coordOffsetX,
    coordScale,
    innerSvg: `<g transform="${transform}">${cleanBody}</g>`,
    type: 'simple',
  };
}

/** Read a `128x128` icon body from `@iconify-json/devicon-plain`, normalized to `24x24` (no ink bounds). */
function getDeviconPlainBody(slug: string): IconBody | undefined {
  const entry =
    getOwnValue(deviconPlainSet.icons, slug) ??
    getOwnValue(deviconPlainSet.icons, slug.replace(BRAND_SLUG_CLEAN_RX, ''));
  if (!entry?.body) {
    return undefined;
  }
  const cleanBody = entry.body.replace(CURRENT_COLOR_FILL_RX, '').trim();
  return {
    coordScale: DEVICON_SCALE,
    innerSvg: `<g transform="scale(${DEVICON_SCALE})">${cleanBody}</g>`,
    type: 'simple',
  };
}

/** Read a `24x24` icon body from `@iconify-json/simple-icons`, including its alias table (no ink bounds). */
function getSimpleIconBody(slug: string): IconBody | undefined {
  const normalized = slug.replace(BRAND_SLUG_CLEAN_RX, '');
  const aliasParent = resolveSimpleIconAlias(slug);
  const entry =
    getOwnValue(simpleIconSet.icons, slug) ??
    getOwnValue(simpleIconSet.icons, normalized) ??
    (aliasParent ? getOwnValue(simpleIconSet.icons, aliasParent) : undefined);
  if (!entry?.body) {
    return undefined;
  }
  return {
    coordScale: 1,
    innerSvg: entry.body.replace(CURRENT_COLOR_FILL_RX, '').trim(),
    type: 'simple',
  };
}

/**
 * Read a brand/tech icon body with preferred-set deduplication:
 * `DEVICON_PREFERRED_SLUG_LIST` check Devicon Plain first, otherwise Simple Icons -> Devicon Plain -> File Icons.
 */
function getBrandIconBody(slug: string): IconBody | undefined {
  deviconPreferredSlugsCache ??= new Set(DEVICON_PREFERRED_SLUG_LIST);
  if (deviconPreferredSlugsCache.has(slug)) {
    return getDeviconPlainBody(slug) ?? getSimpleIconBody(slug) ?? getFileIconBody(slug);
  }
  return getSimpleIconBody(slug) ?? getDeviconPlainBody(slug) ?? getFileIconBody(slug);
}

/** Read a UI stroke icon body from `lucide-static` (no ink bounds). */
function getLucideIconBody(slug: string): IconBody | undefined {
  const rawSvg = getOwnValue(LUCIDE_ICON_MAP, capitalizeSlugParts(slug, ''));
  const innerContent = typeof rawSvg === 'string' ? extractInnerSvg(rawSvg) : undefined;
  return innerContent ? { coordScale: 1, innerSvg: innerContent, type: 'lucide' } : undefined;
}

/** Add the exact horizontal ink bounds to an icon body. */
function measureIconBody(body: IconBody | undefined): ResolvedIcon | undefined {
  if (!body) {
    return undefined;
  }
  // The scale/translate wrapper carries no path geometry, so native coordinates are measured with `coordScale` and `coordOffsetX`:
  return {
    ...body,
    ...computeIconXBounds(
      body.innerSvg,
      body.type === 'lucide',
      body.coordScale,
      body.coordOffsetX
    ),
  };
}

/** Convert a PascalCase `lucide-static` export name into its kebab-case slug (e.g., `'ArrowDown01'` -> `'arrow-down01'`). */
function toLucideSlug(exportName: string): string {
  return exportName.replace(PASCAL_BOUNDARY_RX, '$&-').toLowerCase();
}

/**
 * Merge a secondary brand icon set into `brandSlugs`, deduplicating by both exact and cleaned
 * (`[-_.]`-stripped) slug so preferred sets always win and hyphenated duplicates become aliases.
 */
function mergeBrandIconSet(
  slugs: readonly string[],
  brandSlugs: Set<string>,
  canonicalByCleanSlug: Map<string, string>,
  brandAliases: Record<string, string>
): void {
  for (const slug of slugs) {
    const cleanSlug = slug.replace(BRAND_SLUG_CLEAN_RX, '');
    const existingCanonical = canonicalByCleanSlug.get(cleanSlug);
    if (existingCanonical === undefined) {
      brandSlugs.add(slug);
      canonicalByCleanSlug.set(cleanSlug, slug);
    } else if (slug !== existingCanonical) {
      brandAliases[slug] = existingCanonical;
    }
  }
}

/** Build (once per isolate) the icon picker index: Distinct stroke glyphs, brand slugs, search tags, and every alias. */
function buildIconPickerIndex(): IconPickerIndex {
  const primaryByGlyph = new Map<string, string>();
  const lucideSlugs: string[] = [];
  const lucideAliases: Record<string, string> = {};
  const lucideTags: Record<string, string> = {};

  for (const [slug, tagList] of Object.entries(lucideTagMap)) {
    const glyph = getOwnValue(LUCIDE_ICON_MAP, capitalizeSlugParts(slug, ''));
    if (typeof glyph === 'string') {
      const primarySlug = primaryByGlyph.get(glyph);
      if (primarySlug === undefined) {
        primaryByGlyph.set(glyph, slug);
        lucideSlugs.push(slug);
        if (tagList.length > 0) {
          lucideTags[slug] = tagList.join(' ').toLowerCase();
        }
      } else {
        lucideAliases[slug] = primarySlug;
      }
    }
  }

  for (const [exportName, glyph] of Object.entries(LUCIDE_ICON_MAP)) {
    const slug = toLucideSlug(exportName);
    if (typeof glyph === 'string' && capitalizeSlugParts(slug, '') === exportName) {
      const primarySlug = primaryByGlyph.get(glyph);
      if (primarySlug === undefined) {
        primaryByGlyph.set(glyph, slug);
        lucideSlugs.push(slug);
      } else if (slug !== primarySlug) {
        lucideAliases[slug] = primarySlug;
      }
    }
  }

  const brandSlugs = new Set<string>();
  const canonicalByCleanSlug = new Map<string, string>();
  for (const slug of Object.keys(simpleIconSet.icons)) {
    brandSlugs.add(slug);
    canonicalByCleanSlug.set(slug.replace(BRAND_SLUG_CLEAN_RX, ''), slug);
  }

  const brandAliases: Record<string, string> = {};
  for (const [alias, entry] of Object.entries(simpleIconSet.aliases ?? {})) {
    brandAliases[alias] = entry.parent;
    const cleanAlias = alias.replace(BRAND_SLUG_CLEAN_RX, '');
    if (!canonicalByCleanSlug.has(cleanAlias)) {
      canonicalByCleanSlug.set(cleanAlias, entry.parent);
    }
  }

  mergeBrandIconSet(
    Object.keys(deviconPlainSet.icons),
    brandSlugs,
    canonicalByCleanSlug,
    brandAliases
  );
  mergeBrandIconSet(Object.keys(fileIconSet.icons), brandSlugs, canonicalByCleanSlug, brandAliases);

  return {
    aliases: { ...ICON_SLUG_ALIASES },
    brandAliases,
    lucideAliases,
    lucideTags,
    pageSize: ICON_PICKER_PAGE_SIZE,
    sets: { brands: [...brandSlugs].toSorted(), lucide: lucideSlugs },
  };
}

/**
 * Look up one exact slug in one icon set, memoized under `<set>:<slug>` so a cached entry always
 * belongs to the slug it is keyed by (misses are never cached).
 */
function lookupCachedIcon(slug: string, isBrand: boolean): ResolvedIcon | undefined {
  const effectiveSlug = isBrand ? canonicalizeBrandSlug(slug) : slug;
  const cacheKey = `${isBrand ? 'b' : 'l'}:${effectiveSlug}`;
  const cached = readLruCache(RESOLVED_ICON_CACHE, cacheKey);
  if (cached) {
    return cached;
  }
  const resolved = measureIconBody(
    isBrand ? getBrandIconBody(effectiveSlug) : getLucideIconBody(effectiveSlug)
  );
  if (resolved) {
    writeLruCache(RESOLVED_ICON_CACHE, cacheKey, resolved);
  }
  return resolved;
}

/** Look up the canonical key in one icon set, then the raw (pre-alias) slug when it differs. */
function lookupInIconSet(key: string, rawSlug: string, isBrand: boolean): ResolvedIcon | undefined {
  return (
    lookupCachedIcon(key, isBrand) ??
    (key === rawSlug ? undefined : lookupCachedIcon(rawSlug, isBrand))
  );
}

/** Build a `24x24` stroked `ResolvedIcon` from static inner SVG markup. */
function buildBuiltinStrokeIcon(innerSvg: string): ResolvedIcon {
  return { coordScale: 1, innerSvg, ...computeIconXBounds(innerSvg, true), type: 'lucide' };
}

/** Return the lazily built last-resort fallback icon (a plain stroked circle). */
function getCircleFallbackIcon(): ResolvedIcon {
  LAZY_ICONS.circle ??= buildBuiltinStrokeIcon(FALLBACK_CIRCLE_SVG);
  return LAZY_ICONS.circle;
}

// -------------------------------------- PUBLIC API -------------------------------------

export { computeIconXBounds };
export { BRAND_SLUG_CLEAN_RX } from '@/svg/shared';

/**
 * Normalize an icon slug to its canonical lookup key (trimmed, lowercase, alias-resolved).
 * @param slug      Raw icon slug (e.g., `' PY '`, `'cpp'`, `'rocket-launch'`).
 * @param isBrand   When `true`, also resolves Simple Icons aliases to their canonical parent slug.
 * @returns Canonical slug (e.g., `'python'`, `'cplusplus'`, `'rocket'`).
 */
export function normalizeIconSlug(slug: string, isBrand = false): string {
  const rawSlug = slug.trim().toLowerCase();
  const baseKey = getOwnValue(ICON_SLUG_ALIASES, rawSlug) ?? rawSlug;
  return isBrand ? canonicalizeBrandSlug(baseKey) : baseKey;
}

/**
 * Resolve an icon slug and return the resolved data together with its canonical key (normalized once).
 * @param slug           Icon slug (e.g., `'star'`, `'ts'`, `'rust'`) or `'none'`.
 * @param isBrandFirst   When `true`, checks brand icons before stroke icons.
 * @returns Resolved icon data (`undefined` if `'none'`, empty, too long, or not found) and the canonical key.
 */
export function resolveIconLookup(slug: string, isBrandFirst = false): IconLookup {
  const rawSlug = slug.trim().toLowerCase();
  const baseKey = getOwnValue(ICON_SLUG_ALIASES, rawSlug) ?? rawSlug;
  if (!rawSlug || rawSlug === 'none' || rawSlug.length > MAX_ICON_SLUG_LENGTH) {
    return { data: undefined, key: isBrandFirst ? canonicalizeBrandSlug(baseKey) : baseKey };
  }
  if (isBrandFirst) {
    const brandKey = canonicalizeBrandSlug(baseKey);
    const brandData = lookupInIconSet(brandKey, rawSlug, true);
    if (brandData) {
      return { data: brandData, key: brandKey };
    }
    return { data: lookupInIconSet(baseKey, rawSlug, false), key: baseKey };
  }
  const strokeData = lookupInIconSet(baseKey, rawSlug, false);
  if (strokeData) {
    return { data: strokeData, key: baseKey };
  }
  const brandKey = canonicalizeBrandSlug(baseKey);
  const brandData = lookupInIconSet(brandKey, rawSlug, true);
  return { data: brandData, key: brandData ? brandKey : baseKey };
}

/**
 * Resolve an icon slug to its inner SVG markup and horizontal visual bounds from the bundled stroke and brand icon sets.
 * @param slug           Icon slug (e.g., `'star'`, `'globe-code'`, `'rust'`, `'archlinux'`) or `'none'`.
 * @param isBrandFirst   When `true`, checks brand icons before stroke icons.
 * @returns The resolved icon data, or `undefined` if `'none'`, empty, too long, or not found.
 */
export function resolveIcon(slug?: string, isBrandFirst = false): ResolvedIcon | undefined {
  return slug ? resolveIconLookup(slug, isBrandFirst).data : undefined;
}

/**
 * Return the lazily built placeholder icon (translucent circle border + standalone `!`) used to flag
 * unknown icon slugs outside stack tiles.
 * @returns The resolved placeholder icon data (never `undefined`).
 */
export function resolvePlaceholderIcon(): ResolvedIcon {
  LAZY_ICONS.placeholder ??= buildBuiltinStrokeIcon(PLACEHOLDER_ICON_SVG);
  return LAZY_ICONS.placeholder;
}

/**
 * Return the lazily built standalone `!` placeholder icon rendered inside the translucent frame of
 * unknown stack tiles.
 * @returns The resolved stack placeholder icon data (never `undefined`).
 */
export function resolveStackPlaceholderIcon(): ResolvedIcon {
  LAZY_ICONS.stackPlaceholder ??= buildBuiltinStrokeIcon(STACK_PLACEHOLDER_ICON_SVG);
  return LAZY_ICONS.stackPlaceholder;
}

/**
 * Resolve an icon slug, falling back to `fallbackSlug` (stroke-first) and finally to a plain circle so a glyph is always drawn.
 * @param slug           Requested icon slug.
 * @param fallbackSlug   Icon slug rendered when `slug` cannot be resolved (e.g., `FALLBACK_ICON_SLUG`).
 * @param isBrandFirst   When `true`, checks brand icons before stroke icons for `slug`.
 * @returns The resolved icon data (never `undefined`).
 */
export function resolveIconWithFallback(
  slug: string,
  fallbackSlug: string,
  isBrandFirst = false
): ResolvedIcon {
  return resolveIcon(slug, isBrandFirst) ?? resolveIcon(fallbackSlug) ?? getCircleFallbackIcon();
}

/**
 * Inspect the bounded resolved-icon cache (entry count, summed body size, and its limits) without mutating it.
 * @returns Read-only cache state.
 */
export function inspectResolvedIconCache(): Readonly<LruCache<ResolvedIcon>> {
  return RESOLVED_ICON_CACHE;
}

/**
 * Build (once per isolate) the icon picker index asset.
 * @returns Distinct stroke glyph slugs, brand slugs, search tags, and slug aliases.
 */
export function getIconPickerIndex(): IconPickerIndex {
  iconPickerIndexCache ??= buildIconPickerIndex();
  return iconPickerIndexCache;
}

/**
 * Collect one page of icon picker bodies (inner SVG markup in `24x24` space, without ink bounds).
 * @param setId   Icon picker set identifier.
 * @param page    Zero-based page index (`ICON_PICKER_PAGE_SIZE` icons per page).
 * @returns Inner SVG markup keyed by slug, or `undefined` for pages out of range.
 */
export function getIconPickerPage(
  setId: IconPickerSetId,
  page: number
): Record<string, string> | undefined {
  const slugs = getIconPickerIndex().sets[setId];
  const start = page * ICON_PICKER_PAGE_SIZE;
  if (!Number.isInteger(page) || page < 0 || start >= slugs.length) {
    return undefined;
  }
  const bodies: Record<string, string> = {};
  const end = Math.min(start + ICON_PICKER_PAGE_SIZE, slugs.length);
  for (let i = start; i < end; i += 1) {
    const slug = slugs[i];
    if (slug !== undefined) {
      const body = setId === 'lucide' ? getLucideIconBody(slug) : getBrandIconBody(slug);
      if (body) {
        bodies[slug] = body.innerSvg;
      }
    }
  }
  return bodies;
}

/**
 * Build a human-readable title from a slug by capitalizing its `-`/`_`-separated parts (e.g., `'my-tool'` to `'My Tool'`).
 * @param slug   Lowercase icon slug.
 * @returns Space-separated title-cased words.
 */
export function formatSlugTitle(slug: string): string {
  return capitalizeSlugParts(slug, ' ');
}
