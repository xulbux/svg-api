/**
 * OpenGraph SVG parser – Parses XML attributes, linear/radial gradients, paint specs, and SVG `<path>` commands into flattened polylines.
 */

import { clampRange } from './png.ts';
import type {
  FlattenedSubpath,
  GradientDef,
  GradientStop,
  Point2D,
  RgbaTuple,
  RgbTuple,
} from './types.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** Mutable cursor state used while stepping through tokenized SVG `<path>` commands. */
interface PathFlattenState {
  /** Active SVG path command letter. */
  command: string;
  /** Currently open subpath (`undefined` before the first `M` / `m`). */
  currentSubpath: FlattenedSubpath | undefined;
  /** Current pen X coordinate in path user units. */
  cursorX: number;
  /** Current pen Y coordinate in path user units. */
  cursorY: number;
  /** Previous cubic Bezier second control point X in path user units (reflected by `S` / `s`). */
  lastCubicCtrlX: number | undefined;
  /** Previous cubic Bezier second control point Y in path user units (reflected by `S` / `s`). */
  lastCubicCtrlY: number | undefined;
  /** Previous quadratic Bezier control point X in path user units (reflected by `T` / `t`). */
  lastQuadCtrlX: number | undefined;
  /** Previous quadratic Bezier control point Y in path user units (reflected by `T` / `t`). */
  lastQuadCtrlY: number | undefined;
  /** Subpath origin X coordinate in path user units. */
  startX: number;
  /** Subpath origin Y coordinate in path user units. */
  startY: number;
  /** Accumulated flattened subpaths. */
  subpaths: FlattenedSubpath[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Curve subdivision steps per Bezier or elliptical arc segment. */
export const CURVE_STEPS = 12;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches XML attributes (`name="value"`) inside an SVG tag. */
const XML_ATTR_RX = /(?<name>[\w-]+)="(?<value>[^"]*)"/g;

/** Matches `<linearGradient>` blocks in `<defs>`. */
const LINEAR_GRADIENT_RX = /<linearGradient\s+(?<attrs>[^>]+)>(?<body>[\s\S]*?)<\/linearGradient>/g;

/** Matches `<radialGradient>` blocks in `<defs>`. */
const RADIAL_GRADIENT_RX = /<radialGradient\s+(?<attrs>[^>]+)>(?<body>[\s\S]*?)<\/radialGradient>/g;

/** Matches `<stop … />` elements inside gradient definitions. */
const GRADIENT_STOP_RX = /<stop\s+(?<attrs>[^>]+)\/>/g;

/** Matches an SVG path number token (integer, decimal, or scientific notation) at `lastIndex` (sticky). */
const PATH_NUMBER_RX = /[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/iy;

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Parse XML attributes from an opening tag fragment into a plain record.
 * @param attrSource   Raw XML attribute substring.
 * @returns Attribute key-value map.
 */
function parseXmlAttrs(attrSource: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of attrSource.matchAll(XML_ATTR_RX)) {
    if (match.groups?.name) {
      attrs[match.groups.name] = match.groups.value ?? '';
    }
  }
  return attrs;
}

/** Parse a `#RGB` or `#RRGGBB` hex color into `[red, green, blue]` floats in `[0, 255]`. */
function parseHexColor(hexColor: string): RgbTuple {
  const raw = hexColor.replace('#', '').trim();
  const cleaned =
    raw.length === 3
      ? `${raw.charAt(0)}${raw.charAt(0)}${raw.charAt(1)}${raw.charAt(1)}${raw.charAt(2)}${raw.charAt(2)}`
      : raw;
  const red = Number.parseInt(cleaned.slice(0, 2), 16) || 0;
  const green = Number.parseInt(cleaned.slice(2, 4), 16) || 0;
  const blue = Number.parseInt(cleaned.slice(4, 6), 16) || 0;
  return [red, green, blue];
}

/** Parse a percentage or fraction string (e.g., `'85%'` or `'0.85'`) into `[0, 1]`. */
function parseUnitFraction(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  return raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
}

/** Parse `<stop>` elements inside a gradient block body. */
function parseGradientStops(bodyMarkup: string): GradientStop[] {
  const stops: GradientStop[] = [];
  for (const stopMatch of bodyMarkup.matchAll(GRADIENT_STOP_RX)) {
    const stopAttrs = parseXmlAttrs(stopMatch.groups?.attrs ?? '');
    stops.push({
      color: parseHexColor(stopAttrs['stop-color'] ?? '#000000'),
      offset: parseUnitFraction(stopAttrs.offset, 0),
      opacity: Number.parseFloat(stopAttrs['stop-opacity'] ?? '1'),
    });
  }
  return stops;
}

/** Interpolate `[red, green, blue, alpha]` along a gradient stop list at `position` in `[0, 1]`. */
function sampleGradientStops(stops: readonly GradientStop[], position: number): RgbaTuple {
  const clamped = clampRange(position, 0, 1);
  const [first] = stops;
  const last = stops.at(-1);
  if (!first || !last) {
    return [0, 0, 0, 0];
  }
  if (clamped <= first.offset) {
    return [first.color[0], first.color[1], first.color[2], first.opacity];
  }
  if (clamped >= last.offset) {
    return [last.color[0], last.color[1], last.color[2], last.opacity];
  }
  let stopA = first;
  let stopB = last;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const current = stops[i];
    const next = stops[i + 1];
    if (current && next && clamped >= current.offset && clamped <= next.offset) {
      stopA = current;
      stopB = next;
      break;
    }
  }
  const span = Math.max(1e-6, stopB.offset - stopA.offset);
  const ratio = clampRange((clamped - stopA.offset) / span, 0, 1);
  return [
    stopA.color[0] + (stopB.color[0] - stopA.color[0]) * ratio,
    stopA.color[1] + (stopB.color[1] - stopA.color[1]) * ratio,
    stopA.color[2] + (stopB.color[2] - stopA.color[2]) * ratio,
    stopA.opacity + (stopB.opacity - stopA.opacity) * ratio,
  ];
}

/** Convert an SVG elliptical arc segment into polyline points appended to `subpath`. */
function appendArcPoints(
  subpath: Point2D[],
  startX: number,
  startY: number,
  rawRx: number,
  rawRy: number,
  xAxisRotationDeg: number,
  isLargeArc: boolean,
  isSweep: boolean,
  endX: number,
  endY: number
): void {
  if (startX === endX && startY === endY) {
    return;
  }
  let radiusX = Math.abs(rawRx);
  let radiusY = Math.abs(rawRy);
  if (radiusX === 0 || radiusY === 0) {
    subpath.push([endX, endY]);
    return;
  }

  const phi = (xAxisRotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const midDx = (startX - endX) / 2;
  const midDy = (startY - endY) / 2;
  const x1Prime = cosPhi * midDx + sinPhi * midDy;
  const y1Prime = -sinPhi * midDx + cosPhi * midDy;

  const radiiCheck =
    (x1Prime * x1Prime) / (radiusX * radiusX) + (y1Prime * y1Prime) / (radiusY * radiusY);
  if (radiiCheck > 1) {
    const scaleFactor = Math.sqrt(radiiCheck);
    radiusX *= scaleFactor;
    radiusY *= scaleFactor;
  }

  const rxSq = radiusX * radiusX;
  const rySq = radiusY * radiusY;
  const x1pSq = x1Prime * x1Prime;
  const y1pSq = y1Prime * y1Prime;
  const numerator = Math.max(0, rxSq * rySq - rxSq * y1pSq - rySq * x1pSq);
  const denominator = Math.max(1e-9, rxSq * y1pSq + rySq * x1pSq);
  const rootSign = isLargeArc === isSweep ? -1 : 1;
  const centerFactor = rootSign * Math.sqrt(numerator / denominator);
  const cxPrime = (centerFactor * (radiusX * y1Prime)) / radiusY;
  const cyPrime = (centerFactor * -(radiusY * x1Prime)) / radiusX;

  const centerX = cosPhi * cxPrime - sinPhi * cyPrime + (startX + endX) / 2;
  const centerY = sinPhi * cxPrime + cosPhi * cyPrime + (startY + endY) / 2;

  const startVecX = (x1Prime - cxPrime) / radiusX;
  const startVecY = (y1Prime - cyPrime) / radiusY;
  const endVecX = (-x1Prime - cxPrime) / radiusX;
  const endVecY = (-y1Prime - cyPrime) / radiusY;

  const startAngle = Math.atan2(startVecY, startVecX);
  let deltaAngle = Math.atan2(
    startVecX * endVecY - startVecY * endVecX,
    startVecX * endVecX + startVecY * endVecY
  );
  if (!isSweep && deltaAngle > 0) {
    deltaAngle -= Math.PI * 2;
  } else if (isSweep && deltaAngle < 0) {
    deltaAngle += Math.PI * 2;
  }

  for (let step = 1; step <= CURVE_STEPS; step += 1) {
    const angle = startAngle + (deltaAngle * step) / CURVE_STEPS;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    subpath.push([
      cosPhi * radiusX * cosAngle - sinPhi * radiusY * sinAngle + centerX,
      sinPhi * radiusX * cosAngle + cosPhi * radiusY * sinAngle + centerY,
    ]);
  }
}

/** Subdivide a quadratic Bezier segment into `points` with affine `toPoint` transform. */
function appendQuadraticPoints(
  points: Point2D[],
  startX: number,
  startY: number,
  ctrlX: number,
  ctrlY: number,
  endX: number,
  endY: number,
  toPoint: (rawX: number, rawY: number) => Point2D
): void {
  for (let step = 1; step <= CURVE_STEPS; step += 1) {
    const tVal = step / CURVE_STEPS;
    const invT = 1 - tVal;
    const pointX = invT * invT * startX + 2 * invT * tVal * ctrlX + tVal * tVal * endX;
    const pointY = invT * invT * startY + 2 * invT * tVal * ctrlY + tVal * tVal * endY;
    points.push(toPoint(pointX, pointY));
  }
}

/** Subdivide a cubic Bezier segment into `points` with affine `toPoint` transform. */
function appendCubicPoints(
  points: Point2D[],
  startX: number,
  startY: number,
  ctrl1X: number,
  ctrl1Y: number,
  ctrl2X: number,
  ctrl2Y: number,
  endX: number,
  endY: number,
  toPoint: (rawX: number, rawY: number) => Point2D
): void {
  for (let step = 1; step <= CURVE_STEPS; step += 1) {
    const tVal = step / CURVE_STEPS;
    const invT = 1 - tVal;
    const pointX =
      invT * invT * invT * startX +
      3 * invT * invT * tVal * ctrl1X +
      3 * invT * tVal * tVal * ctrl2X +
      tVal * tVal * tVal * endX;
    const pointY =
      invT * invT * invT * startY +
      3 * invT * invT * tVal * ctrl1Y +
      3 * invT * tVal * tVal * ctrl2Y +
      tVal * tVal * tVal * endY;
    points.push(toPoint(pointX, pointY));
  }
}

/** Execute one curved (`Q`, `T`, `C`, `S`) or elliptical arc (`A`) SVG path command against `state`. */
function stepSvgCurveOrArcCommand(
  state: PathFlattenState,
  upper: string,
  baseX: number,
  baseY: number,
  previousCtrlX: number | undefined,
  previousCtrlY: number | undefined,
  readNumber: () => number,
  isNextArcFlagSet: () => boolean,
  toPoint: (rawX: number, rawY: number) => Point2D
): void {
  const targetPoints = state.currentSubpath?.points;
  switch (upper) {
    case 'Q':
    case 'T': {
      const ctrlX =
        upper === 'Q' ? baseX + readNumber() : 2 * state.cursorX - (previousCtrlX ?? state.cursorX);
      const ctrlY =
        upper === 'Q' ? baseY + readNumber() : 2 * state.cursorY - (previousCtrlY ?? state.cursorY);
      const endX = baseX + readNumber();
      const endY = baseY + readNumber();
      if (targetPoints) {
        appendQuadraticPoints(
          targetPoints,
          state.cursorX,
          state.cursorY,
          ctrlX,
          ctrlY,
          endX,
          endY,
          toPoint
        );
      }
      state.lastQuadCtrlX = ctrlX;
      state.lastQuadCtrlY = ctrlY;
      state.cursorX = endX;
      state.cursorY = endY;
      break;
    }
    case 'C':
    case 'S': {
      const ctrl1X =
        upper === 'C' ? baseX + readNumber() : 2 * state.cursorX - (previousCtrlX ?? state.cursorX);
      const ctrl1Y =
        upper === 'C' ? baseY + readNumber() : 2 * state.cursorY - (previousCtrlY ?? state.cursorY);
      const ctrl2X = baseX + readNumber();
      const ctrl2Y = baseY + readNumber();
      const endX = baseX + readNumber();
      const endY = baseY + readNumber();
      if (targetPoints) {
        appendCubicPoints(
          targetPoints,
          state.cursorX,
          state.cursorY,
          ctrl1X,
          ctrl1Y,
          ctrl2X,
          ctrl2Y,
          endX,
          endY,
          toPoint
        );
      }
      state.lastCubicCtrlX = ctrl2X;
      state.lastCubicCtrlY = ctrl2Y;
      state.cursorX = endX;
      state.cursorY = endY;
      break;
    }
    case 'A': {
      const arcRx = readNumber();
      const arcRy = readNumber();
      const rotation = readNumber();
      const isLargeArc = isNextArcFlagSet();
      const isSweep = isNextArcFlagSet();
      const endX = baseX + readNumber();
      const endY = baseY + readNumber();
      const arcPoints: Point2D[] = [];
      appendArcPoints(
        arcPoints,
        state.cursorX,
        state.cursorY,
        arcRx,
        arcRy,
        rotation,
        isLargeArc,
        isSweep,
        endX,
        endY
      );
      for (const [arcX, arcY] of arcPoints) {
        targetPoints?.push(toPoint(arcX, arcY));
      }
      state.cursorX = endX;
      state.cursorY = endY;
      break;
    }
    default: {
      readNumber();
    }
  }
}

/** Execute one parameterized SVG path command (`M`, `L`, `H`, `V`, `Q`, `T`, `C`, `S`, `A`) against `state`. */
function stepSvgPathCommand(
  state: PathFlattenState,
  upper: string,
  baseX: number,
  baseY: number,
  readNumber: () => number,
  isNextArcFlagSet: () => boolean,
  toPoint: (rawX: number, rawY: number) => Point2D
): void {
  if (upper !== 'M' && !state.currentSubpath) {
    state.currentSubpath = { isClosed: false, points: [toPoint(state.cursorX, state.cursorY)] };
    state.subpaths.push(state.currentSubpath);
  }
  const targetPoints = state.currentSubpath?.points;
  const previousCtrlX = upper === 'Q' || upper === 'T' ? state.lastQuadCtrlX : state.lastCubicCtrlX;
  const previousCtrlY = upper === 'Q' || upper === 'T' ? state.lastQuadCtrlY : state.lastCubicCtrlY;
  // Smooth curves only reflect the control point of the immediately preceding curve command:
  state.lastCubicCtrlX = undefined;
  state.lastCubicCtrlY = undefined;
  state.lastQuadCtrlX = undefined;
  state.lastQuadCtrlY = undefined;

  switch (upper) {
    case 'M': {
      const nextX = baseX + readNumber();
      const nextY = baseY + readNumber();
      state.cursorX = nextX;
      state.cursorY = nextY;
      state.startX = nextX;
      state.startY = nextY;
      state.currentSubpath = { isClosed: false, points: [toPoint(nextX, nextY)] };
      state.subpaths.push(state.currentSubpath);
      state.command = state.command === 'm' ? 'l' : 'L';
      break;
    }
    case 'L': {
      state.cursorX = baseX + readNumber();
      state.cursorY = baseY + readNumber();
      targetPoints?.push(toPoint(state.cursorX, state.cursorY));
      break;
    }
    case 'H': {
      state.cursorX = baseX + readNumber();
      targetPoints?.push(toPoint(state.cursorX, state.cursorY));
      break;
    }
    case 'V': {
      state.cursorY = baseY + readNumber();
      targetPoints?.push(toPoint(state.cursorX, state.cursorY));
      break;
    }
    default: {
      stepSvgCurveOrArcCommand(
        state,
        upper,
        baseX,
        baseY,
        previousCtrlX,
        previousCtrlY,
        readNumber,
        isNextArcFlagSet,
        toPoint
      );
    }
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

export { parseXmlAttrs };

/**
 * Parse `<linearGradient>` and `<radialGradient>` definitions from `svgMarkup`.
 * @param svgMarkup   Complete SVG document string.
 * @returns Gradient definitions keyed by element `id`.
 */
export function parseGradientDefs(svgMarkup: string): Map<string, GradientDef> {
  const gradients = new Map<string, GradientDef>();

  for (const match of svgMarkup.matchAll(LINEAR_GRADIENT_RX)) {
    const attrs = parseXmlAttrs(match.groups?.attrs ?? '');
    const stops = parseGradientStops(match.groups?.body ?? '');
    if (attrs.id && stops.length >= 2) {
      gradients.set(attrs.id, {
        kind: 'linear',
        stops,
        x1: parseUnitFraction(attrs.x1, 0),
        x2: parseUnitFraction(attrs.x2, 1),
        y1: parseUnitFraction(attrs.y1, 0),
        y2: parseUnitFraction(attrs.y2, 0),
      });
    }
  }

  for (const match of svgMarkup.matchAll(RADIAL_GRADIENT_RX)) {
    const attrs = parseXmlAttrs(match.groups?.attrs ?? '');
    const stops = parseGradientStops(match.groups?.body ?? '');
    if (attrs.id && stops.length >= 2) {
      gradients.set(attrs.id, {
        cx: parseUnitFraction(attrs.cx, 0.5),
        cy: parseUnitFraction(attrs.cy, 0.5),
        kind: 'radial',
        radius: parseUnitFraction(attrs.r, 0.5),
        stops,
      });
    }
  }

  return gradients;
}

/**
 * Evaluate a paint spec (`#RRGGBB` or `url(#id)`) at normalized box coordinates `(unitX, unitY)`.
 * @param paintSpec   SVG `fill` or `stroke` attribute value.
 * @param gradients   Parsed gradient definitions.
 * @param unitX       Normalized horizontal position in `[0, 1]`.
 * @param unitY       Normalized vertical position in `[0, 1]`.
 * @returns Evaluated RGBA color, or `undefined` for `'none'` / missing gradients.
 */
export function evaluatePaint(
  paintSpec: string | undefined,
  gradients: ReadonlyMap<string, GradientDef>,
  unitX: number,
  unitY: number
): RgbaTuple | undefined {
  if (!paintSpec || paintSpec === 'none') {
    return undefined;
  }
  if (paintSpec.startsWith('url(#') && paintSpec.endsWith(')')) {
    const grad = gradients.get(paintSpec.slice(5, -1));
    if (!grad) {
      return undefined;
    }
    if (grad.kind === 'linear') {
      const dirX = grad.x2 - grad.x1;
      const dirY = grad.y2 - grad.y1;
      const lengthSq = Math.max(1e-6, dirX * dirX + dirY * dirY);
      const proj = ((unitX - grad.x1) * dirX + (unitY - grad.y1) * dirY) / lengthSq;
      return sampleGradientStops(grad.stops, proj);
    }
    const deltaX = (unitX - grad.cx) / Math.max(1e-6, grad.radius);
    const deltaY = (unitY - grad.cy) / Math.max(1e-6, grad.radius);
    return sampleGradientStops(grad.stops, Math.hypot(deltaX, deltaY));
  }
  const rgb = parseHexColor(paintSpec);
  return [rgb[0], rgb[1], rgb[2], 1];
}

/**
 * Parse an SVG path `d` string into flattened polyline subpaths.
 * @param pathData   SVG `<path>` `d` attribute string.
 * @param offsetX    Horizontal translation in canvas pixels.
 * @param offsetY    Vertical translation in canvas pixels.
 * @param scale      Uniform scale factor.
 * @returns Flattened subpaths in canvas coordinates.
 */
export function flattenSvgPath(
  pathData: string,
  offsetX = 0,
  offsetY = 0,
  scale = 1
): FlattenedSubpath[] {
  const state: PathFlattenState = {
    command: '',
    currentSubpath: undefined,
    cursorX: 0,
    cursorY: 0,
    lastCubicCtrlX: undefined,
    lastCubicCtrlY: undefined,
    lastQuadCtrlX: undefined,
    lastQuadCtrlY: undefined,
    startX: 0,
    startY: 0,
    subpaths: [],
  };
  let cursorIndex = 0;

  function skipSeparators(): void {
    while (cursorIndex < pathData.length && ' ,\n\t\r'.includes(pathData.charAt(cursorIndex))) {
      cursorIndex += 1;
    }
  }

  function toPoint(rawX: number, rawY: number): Point2D {
    return [offsetX + rawX * scale, offsetY + rawY * scale];
  }

  function readNumber(): number {
    skipSeparators();
    PATH_NUMBER_RX.lastIndex = cursorIndex;
    const match = PATH_NUMBER_RX.exec(pathData);
    if (!match) {
      return 0;
    }
    cursorIndex += match[0].length;
    return Number.parseFloat(match[0]);
  }

  function isNextArcFlagSet(): boolean {
    skipSeparators();
    const char = pathData.charAt(cursorIndex);
    if (char === '0' || char === '1') {
      cursorIndex += 1;
      return char === '1';
    }
    return readNumber() !== 0;
  }

  while (cursorIndex < pathData.length) {
    skipSeparators();
    if (cursorIndex >= pathData.length) {
      break;
    }
    const iterationStart = cursorIndex;
    const char = pathData.charAt(cursorIndex);
    let isCloseCommand = false;
    if ((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z')) {
      state.command = char;
      cursorIndex += 1;
      if (char === 'Z' || char === 'z') {
        if (state.currentSubpath && state.currentSubpath.points.length > 0) {
          state.currentSubpath.isClosed = true;
          state.currentSubpath.points.push(toPoint(state.startX, state.startY));
        }
        state.currentSubpath = undefined;
        state.command = '';
        state.cursorX = state.startX;
        state.cursorY = state.startY;
        state.lastCubicCtrlX = undefined;
        state.lastCubicCtrlY = undefined;
        state.lastQuadCtrlX = undefined;
        state.lastQuadCtrlY = undefined;
        isCloseCommand = true;
      }
    }
    if (!isCloseCommand && state.command.length > 0) {
      const isRelative = state.command === state.command.toLowerCase();
      stepSvgPathCommand(
        state,
        state.command.toUpperCase(),
        isRelative ? state.cursorX : 0,
        isRelative ? state.cursorY : 0,
        readNumber,
        isNextArcFlagSet,
        toPoint
      );
    }
    if (cursorIndex === iterationStart) {
      cursorIndex += 1;
    }
  }

  return state.subpaths;
}
