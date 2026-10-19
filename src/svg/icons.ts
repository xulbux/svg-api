/**
 * Icon resolver – Resolves Lucide (stroke) and Iconify brand/tech (`@iconify-json/devicon-plain` + `@iconify-json/simple-icons`) SVG paths and their exact horizontal ink bounds.
 */

import { icons as deviconPlainSet } from '@iconify-json/devicon-plain';
import { icons as simpleIconSet } from '@iconify-json/simple-icons';
import * as lucideIcons from 'lucide-static';
import { createLruCache, getOwnValue, readLruCache, writeLruCache } from '@/svg/shared';
import type { IconBody, IconPickerIndex, IconPickerSetId, ResolvedIcon } from '@/types';

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

/** Running horizontal ink bounds in `24x24` icon space. */
interface IconXBounds {
  /** Rightmost visible X coordinate. */
  maxX: number;
  /** Leftmost visible X coordinate. */
  minX: number;
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
  rotationDeg: number;
  /** Arc start X coordinate. */
  startX: number;
  /** Arc start Y coordinate. */
  startY: number;
}

/** Lazily built fallback icons. */
interface LazyIconCache {
  /** Plain stroked circle used when even the fallback slug cannot be resolved. */
  circle?: ResolvedIcon;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Scale factor normalizing `@iconify-json/devicon-plain`'s `128x128` coordinate space to `24x24` (`24 / 128 = 0.1875`). */
const DEVICON_SCALE = 0.1875;

/**
 * Canonical brand slugs that prefer `@iconify-json/devicon-plain` over `@iconify-json/simple-icons`
 * so icon families (`c` / `cplusplus` / `csharp`, `javascript` / `typescript`) share an identical geometric frame
 * and database icons (`mysql`, `sqlite`) use clean symbol-only marks without embedded wordmark text.
 */
const DEVICON_PREFERRED_SLUGS: ReadonlySet<string> = new Set([
  'c',
  'cplusplus',
  'csharp',
  'javascript',
  'mysql',
  'sqlite',
  'typescript',
]);

/** Common icon slug aliases mapped to their canonical Lucide, Simple Icons, or Devicon Plain slugs. */
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

/** Lucide slug rendered by standalone `/icon/:icon` requests whose slug cannot be resolved. */
export const FALLBACK_ICON_SLUG = 'circle-help';

/** Inner SVG of the last-resort fallback icon (a plain `24x24` circle). */
const FALLBACK_CIRCLE_SVG = '<circle cx="12" cy="12" r="9" />';

/** Horizontal bounds used when an icon body contains no measurable geometry. */
const DEFAULT_ICON_X_BOUNDS: Readonly<IconXBounds> = { maxX: 22, minX: 2 };

/** Half of the default Lucide stroke width (`2.25 / 2`) added to stroked icon bounds. */
const STROKE_BOUNDS_PAD = 1.125;

/** Longest accepted icon slug in characters (the longest real slug is about 40 characters). */
const MAX_ICON_SLUG_LENGTH = 64;

/**
 * Maximum number of resolved icons in the icon cache per Worker isolate. Misses are never cached: They
 * are a few cheap map lookups, and caching them would let junk slugs evict hot entries.
 */
const MAX_RESOLVED_ICON_CACHE_SIZE = 1024;

/** Number of icons per icon picker body page (`/assets/icons-<set>-<page>.json`). */
export const ICON_PICKER_PAGE_SIZE = 120;

/** Lucide `lucide-static` exports (SVG strings) keyed by PascalCase icon name. */
const LUCIDE_ICON_MAP: Readonly<Record<string, unknown>> = lucideIcons;

/** Bounded LRU cache of resolved icons keyed by `${isBrandFirst ? 'b' : 'l'}:${cleanSlug}`. */
const RESOLVED_ICON_CACHE = createLruCache<ResolvedIcon>(MAX_RESOLVED_ICON_CACHE_SIZE);

/** Lazily built fallback icons. */
const LAZY_ICONS: LazyIconCache = {};

/** Memoized icon picker index (`undefined` until first built). */
let iconPickerIndexCache: IconPickerIndex | undefined = undefined;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches hyphen or underscore word separators in icon slugs. */
const SLUG_SEPARATOR_RX = /[-_]/g;

/** Matches hyphen, underscore, or dot characters in brand icon slugs. */
const BRAND_SLUG_CLEAN_RX = /[-_.]/g;

/** Matches the last character before a PascalCase word boundary (a lowercase letter or digit before an uppercase letter, or an uppercase letter before a capitalized word, e.g., `AArrow`). */
const PASCAL_BOUNDARY_RX = /[\da-z](?=[A-Z])|[A-Z](?=[A-Z][a-z])/g;

/** Matches `fill="currentColor"` attributes inside Iconify SVG path bodies so parent `<g fill="...">` controls color and sheen. */
const CURRENT_COLOR_FILL_RX = /\s*fill="currentColor"/g;

/** Matches `<circle ...>` elements in SVG markup. */
const CIRCLE_TAG_RX = /<circle\b[^>]*>/g;

/** Matches `<ellipse ...>` elements in SVG markup. */
const ELLIPSE_TAG_RX = /<ellipse\b[^>]*>/g;

/** Matches `<rect ...>` elements in SVG markup. */
const RECT_TAG_RX = /<rect\b[^>]*>/g;

/** Matches `<line ...>` elements in SVG markup. */
const LINE_TAG_RX = /<line\b[^>]*>/g;

/** Matches `<polyline ... points="...">` and `<polygon ... points="...">` elements in SVG markup. */
const POLY_POINTS_RX = /<(?:polyline|polygon)\b[^>]*\bpoints="(?<pts>[^"]+)"/g;

/** Matches `d="..."` path data attributes in SVG markup. */
const PATH_D_RX = /\bd="(?<d>[^"]+)"/g;

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
  for (const match of svgStr.matchAll(CIRCLE_TAG_RX)) {
    const centerX = extractNumericAttr(match[0], CX_ATTR_RX);
    const radius = extractNumericAttr(match[0], R_ATTR_RX);
    updateBounds(bounds, centerX - radius, scale);
    updateBounds(bounds, centerX + radius, scale);
  }
  for (const match of svgStr.matchAll(ELLIPSE_TAG_RX)) {
    const centerX = extractNumericAttr(match[0], CX_ATTR_RX);
    const radiusX = extractNumericAttr(match[0], RX_ATTR_RX);
    updateBounds(bounds, centerX - radiusX, scale);
    updateBounds(bounds, centerX + radiusX, scale);
  }
  for (const match of svgStr.matchAll(RECT_TAG_RX)) {
    const rectX = extractNumericAttr(match[0], X_ATTR_RX);
    const width = extractNumericAttr(match[0], WIDTH_ATTR_RX);
    updateBounds(bounds, rectX, scale);
    updateBounds(bounds, rectX + width, scale);
  }
  for (const match of svgStr.matchAll(LINE_TAG_RX)) {
    updateBounds(bounds, extractNumericAttr(match[0], X1_ATTR_RX), scale);
    updateBounds(bounds, extractNumericAttr(match[0], X2_ATTR_RX), scale);
  }
  for (const match of svgStr.matchAll(POLY_POINTS_RX)) {
    const points = (match.groups?.pts ?? '').trim().split(COORD_SPLIT_RX);
    for (let i = 0; i < points.length; i += 2) {
      updateBounds(bounds, Number(points[i]), scale);
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
  // Roots of the derivative `3 * (a * t² + b * t + c)` are the interior extrema candidates.
  const coefA = -startX + 3 * control1X - 3 * control2X + endX;
  const coefB = 2 * (startX - 2 * control1X + control2X);
  const coefC = control1X - startX;
  const roots: number[] = [];
  if (Math.abs(coefA) < 1e-12) {
    if (Math.abs(coefB) > 1e-12) {
      roots.push(-coefC / coefB);
    }
  } else {
    const discriminant = coefB * coefB - 4 * coefA * coefC;
    if (discriminant >= 0) {
      const sqrtDiscriminant = Math.sqrt(discriminant);
      roots.push(
        (-coefB + sqrtDiscriminant) / (2 * coefA),
        (-coefB - sqrtDiscriminant) / (2 * coefA)
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
    // Zero radii draw a straight line and coincident endpoints draw nothing.
    return;
  }

  const rotation = (arc.rotationDeg * Math.PI) / 180;
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);
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

  // `x(θ) = cx + rx·cos(φ)·cos(θ) − ry·sin(φ)·sin(θ)` is extremal where its derivative vanishes.
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
    ' ,\n\t\r'.includes(cursor.pathData[cursor.index])
  ) {
    cursor.index += 1;
  }
}

/** Read the next number token at `cursor` (`NaN` when none is present). */
function readPathNumber(cursor: PathCursor): number {
  skipPathSeparators(cursor);
  PATH_NUMBER_RX.lastIndex = cursor.index;
  const numMatch = PATH_NUMBER_RX.exec(cursor.pathData);
  if (!numMatch) {
    return Number.NaN;
  }
  cursor.index += numMatch[0].length;
  return Number(numMatch[0]);
}

/** Read an arc flag at `cursor`, which may be packed without separators (e.g., `a1 1 0 011 1`). */
function readPathArcFlag(cursor: PathCursor): number {
  skipPathSeparators(cursor);
  const char = cursor.pathData[cursor.index];
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

/** Read an end point into the pen's current position. */
function readPathEndPoint(
  cursor: PathCursor,
  pen: PathPen,
  originX: number,
  originY: number
): void {
  pen.currentX = originX + readPathNumber(cursor);
  pen.currentY = originY + readPathNumber(cursor);
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
  // Smooth curves only reflect the control point of the immediately preceding segment.
  pen.lastCubicControlX = undefined;
  pen.lastQuadControlX = undefined;

  switch (upper) {
    case 'M':
    case 'L': {
      readPathEndPoint(cursor, pen, originX, originY);
      if (upper === 'M') {
        pen.subpathStartX = pen.currentX;
        pen.subpathStartY = pen.currentY;
        // Implicit coordinate pairs after a moveto are linetos.
        pen.command = isAbsolute ? 'L' : 'l';
      }
      break;
    }
    case 'H': {
      pen.currentX = originX + readPathNumber(cursor);
      break;
    }
    case 'V': {
      pen.currentY = originY + readPathNumber(cursor);
      return;
    }
    case 'C':
    case 'S': {
      const control1X =
        upper === 'C'
          ? readPathPointX(cursor, originX)
          : 2 * startX - (lastCubicControlX ?? startX);
      const control2X = readPathPointX(cursor, originX);
      readPathEndPoint(cursor, pen, originX, originY);
      recordCubicXBounds(startX, control1X, control2X, pen.currentX, scale, bounds);
      pen.lastCubicControlX = control2X;
      break;
    }
    case 'Q':
    case 'T': {
      const controlX =
        upper === 'Q' ? readPathPointX(cursor, originX) : 2 * startX - (lastQuadControlX ?? startX);
      readPathEndPoint(cursor, pen, originX, originY);
      recordQuadXBounds(startX, controlX, pen.currentX, scale, bounds);
      pen.lastQuadControlX = controlX;
      break;
    }
    case 'A': {
      const radiusX = readPathNumber(cursor);
      const radiusY = readPathNumber(cursor);
      const rotationDeg = readPathNumber(cursor);
      const isLargeArc = readPathArcFlag(cursor) === 1;
      const isSweep = readPathArcFlag(cursor) === 1;
      const startY = pen.currentY;
      readPathEndPoint(cursor, pen, originX, originY);
      recordArcXBounds(
        {
          endX: pen.currentX,
          endY: pen.currentY,
          isLargeArc,
          isSweep,
          radiusX,
          radiusY,
          rotationDeg,
          startX,
          startY,
        },
        scale,
        bounds
      );
      break;
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

/** Parse a single SVG `<path d="...">` string and update `[minX, maxX]` bounds. */
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
    const char = pathData[cursor.index];
    if ((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z')) {
      pen.command = char;
      cursor.index += 1;
    }
    applyPathCommand(cursor, pen, scale, bounds);
    // Skip unknown commands and malformed tokens so the scan always makes progress.
    if (cursor.index === iterationStart) {
      cursor.index += 1;
    }
  }
}

/** Compute the exact horizontal visual bounding box `[minX, maxX]` in `24x24` coordinate space for an icon SVG body. */
function measureIconXBounds(svgStr: string, isStroke: boolean, coordScale: number): IconXBounds {
  const bounds: IconXBounds = { maxX: Number.NEGATIVE_INFINITY, minX: Number.POSITIVE_INFINITY };
  recordShapeBounds(svgStr, coordScale, bounds);
  for (const match of svgStr.matchAll(PATH_D_RX)) {
    recordSinglePathD(match.groups?.d ?? '', coordScale, bounds);
  }
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.maxX) ||
    bounds.maxX <= bounds.minX
  ) {
    return { ...DEFAULT_ICON_X_BOUNDS };
  }
  const strokePad = isStroke ? STROKE_BOUNDS_PAD : 0;
  return {
    maxX: Number(Math.min(24, bounds.maxX + strokePad).toFixed(2)),
    minX: Number(Math.max(0, bounds.minX - strokePad).toFixed(2)),
  };
}

/** Capitalize the first letter of every `-`/`_`-separated slug part and join the parts with `joiner`. */
function capitalizeSlugParts(slug: string, joiner: string): string {
  let result = '';
  for (const part of slug.split(SLUG_SEPARATOR_RX)) {
    if (part.length > 0) {
      result += `${result.length > 0 ? joiner : ''}${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    }
  }
  return result;
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
  const aliases = simpleIconSet.aliases ?? {};
  const aliasParent =
    getOwnValue(aliases, slug)?.parent ?? getOwnValue(aliases, normalized)?.parent;
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

/** Read a brand/tech icon body (Devicon Plain first for `DEVICON_PREFERRED_SLUGS`, otherwise Simple Icons first). */
function getBrandIconBody(slug: string): IconBody | undefined {
  if (DEVICON_PREFERRED_SLUGS.has(slug)) {
    return getDeviconPlainBody(slug) ?? getSimpleIconBody(slug);
  }
  return getSimpleIconBody(slug) ?? getDeviconPlainBody(slug);
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
  // The Devicon scale wrapper carries no geometry, so the native coordinates are measured with coordScale.
  return { ...body, ...measureIconXBounds(body.innerSvg, body.type === 'lucide', body.coordScale) };
}

/** Look up a brand/tech slug in `@iconify-json/devicon-plain` and `@iconify-json/simple-icons`. */
function lookupBrandIcon(slug: string): ResolvedIcon | undefined {
  return measureIconBody(getBrandIconBody(slug));
}

/** Look up a UI stroke icon slug in `lucide-static`. */
function lookupLucideIcon(slug: string): ResolvedIcon | undefined {
  return measureIconBody(getLucideIconBody(slug));
}

/** Convert a PascalCase `lucide-static` export name into its kebab-case slug (e.g., `'ArrowDown01'` -> `'arrow-down01'`). */
function toLucideSlug(exportName: string): string {
  return exportName.replace(PASCAL_BOUNDARY_RX, '$&-').toLowerCase();
}

/** Build (once per isolate) the icon picker index: Distinct Lucide glyphs, brand slugs, and every alias. */
function buildIconPickerIndex(): IconPickerIndex {
  const primaryByGlyph = new Map<string, string>();
  const lucideSlugs: string[] = [];
  const lucideAliases: Record<string, string> = {};
  for (const [exportName, glyph] of Object.entries(LUCIDE_ICON_MAP)) {
    const slug = toLucideSlug(exportName);
    if (typeof glyph === 'string' && capitalizeSlugParts(slug, '') === exportName) {
      const primarySlug = primaryByGlyph.get(glyph);
      if (primarySlug === undefined) {
        primaryByGlyph.set(glyph, slug);
        lucideSlugs.push(slug);
      } else {
        lucideAliases[slug] = primarySlug;
      }
    }
  }

  const brandSlugs = new Set<string>(Object.keys(simpleIconSet.icons));
  for (const slug of Object.keys(deviconPlainSet.icons)) {
    brandSlugs.add(slug);
  }
  const brandAliases: Record<string, string> = {};
  for (const [alias, entry] of Object.entries(simpleIconSet.aliases ?? {})) {
    brandAliases[alias] = entry.parent;
  }

  return {
    aliases: { ...ICON_SLUG_ALIASES },
    brandAliases,
    lucideAliases,
    pageSize: ICON_PICKER_PAGE_SIZE,
    sets: { brands: [...brandSlugs].toSorted(), lucide: lucideSlugs },
  };
}
/** Run `lookup` with the canonical slug, then with the raw (pre-alias) slug when it differs. */
function lookupWithAlias(
  cleanSlug: string,
  rawSlug: string,
  lookup: (slug: string) => ResolvedIcon | undefined
): ResolvedIcon | undefined {
  return lookup(cleanSlug) ?? (cleanSlug === rawSlug ? undefined : lookup(rawSlug));
}

/** Return the lazily built last-resort fallback icon (a plain stroked circle). */
function getCircleFallbackIcon(): ResolvedIcon {
  LAZY_ICONS.circle ??= {
    coordScale: 1,
    innerSvg: FALLBACK_CIRCLE_SVG,
    ...measureIconXBounds(FALLBACK_CIRCLE_SVG, true, 1),
    type: 'lucide',
  };
  return LAZY_ICONS.circle;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Compute the exact horizontal visual bounding box of an icon body in `24x24` space (Bezier and arc extrema, not control points).
 * @param svgStr       Inner SVG markup of the icon body.
 * @param isStroke     Whether the icon is stroked (pads the bounds by half the default Lucide stroke width).
 * @param coordScale   Scale factor from the body's coordinate space to `24x24` (defaults to `1`).
 * @returns `minX`/`maxX` bounds clamped to `0`–`24` (`2`–`22` when the body has no measurable geometry).
 */
export function computeIconXBounds(svgStr: string, isStroke: boolean, coordScale = 1): IconXBounds {
  return measureIconXBounds(svgStr, isStroke, coordScale);
}

/**
 * Normalize an icon slug to its canonical lookup key (trimmed, lowercase, alias-resolved).
 * @param slug   Raw icon slug (e.g., `' PY '`, `'cpp'`, `'rocket-launch'`).
 * @returns Canonical slug (e.g., `'python'`, `'cplusplus'`, `'rocket'`).
 */
export function normalizeIconSlug(slug: string): string {
  const rawSlug = slug.trim().toLowerCase();
  return getOwnValue(ICON_SLUG_ALIASES, rawSlug) ?? rawSlug;
}

/**
 * Resolve an icon slug to its inner SVG markup and horizontal visual bounds from `lucide-static`, `@iconify-json/simple-icons`, or `@iconify-json/devicon-plain`.
 * @param slug           Icon slug (e.g., `'star'`, `'globe-code'`, `'rust'`, `'archlinux'`) or `'none'`.
 * @param isBrandFirst   When `true` (e.g., on `/stack/:icons`), checks brand icons before Lucide stroke icons.
 * @returns The resolved icon data, or `undefined` if `'none'`, empty, too long, or not found.
 */
export function resolveIcon(slug?: string, isBrandFirst = false): ResolvedIcon | undefined {
  if (!slug) {
    return undefined;
  }
  const rawSlug = slug.trim().toLowerCase();
  if (!rawSlug || rawSlug === 'none' || rawSlug.length > MAX_ICON_SLUG_LENGTH) {
    return undefined;
  }
  const cleanSlug = getOwnValue(ICON_SLUG_ALIASES, rawSlug) ?? rawSlug;
  const cacheKey = `${isBrandFirst ? 'b' : 'l'}:${cleanSlug}`;
  const cached = readLruCache(RESOLVED_ICON_CACHE, cacheKey);
  if (cached) {
    return cached;
  }

  const resolved = isBrandFirst
    ? (lookupWithAlias(cleanSlug, rawSlug, lookupBrandIcon) ??
      lookupWithAlias(cleanSlug, rawSlug, lookupLucideIcon))
    : (lookupWithAlias(cleanSlug, rawSlug, lookupLucideIcon) ??
      lookupWithAlias(cleanSlug, rawSlug, lookupBrandIcon));
  if (resolved) {
    writeLruCache(RESOLVED_ICON_CACHE, cacheKey, resolved);
  }
  return resolved;
}

/**
 * Resolve an icon slug, falling back to `fallbackSlug` (Lucide-first) and finally to a plain circle so a glyph is always drawn.
 * @param slug           Requested icon slug.
 * @param fallbackSlug   Icon slug rendered when `slug` cannot be resolved (e.g., `FALLBACK_ICON_SLUG`).
 * @param isBrandFirst   When `true`, checks brand icons before Lucide stroke icons for `slug`.
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
 * Build (once per isolate) the icon picker index served at `/assets/icons.json`.
 * @returns Distinct Lucide glyph slugs, brand slugs (Simple Icons and Devicon Plain), Lucide name aliases, and slug aliases.
 */
export function getIconPickerIndex(): IconPickerIndex {
  iconPickerIndexCache ??= buildIconPickerIndex();
  return iconPickerIndexCache;
}

/**
 * Collect one page of icon picker bodies (inner SVG markup in `24x24` space, without ink bounds).
 * @param setId   Icon picker set (`'lucide'` or `'brands'`).
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
  for (const slug of slugs.slice(start, start + ICON_PICKER_PAGE_SIZE)) {
    const body = setId === 'lucide' ? getLucideIconBody(slug) : getBrandIconBody(slug);
    if (body) {
      bodies[slug] = body.innerSvg;
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
