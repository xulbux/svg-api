/**
 * OpenGraph vector rasterizer – Paints rounded `<rect>` SDFs, `4x4` supersampled filled `<path>` outlines, and stroked `<g>` icon groups onto an RGB canvas.
 */

import { clampRange, ditherCanvasToRgb, encodeRgbPng } from './png.ts';
import { evaluatePaint, flattenSvgPath, parseGradientDefs, parseXmlAttrs } from './svgParser.ts';
import type {
  DirectedEdge,
  FilledPathEdges,
  FlattenedSubpath,
  GradientDef,
  GroupSegments,
  RgbaTuple,
  ScanlineCrossing,
  Segment2D,
} from './types.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/** Vertical supersampling grid resolution per pixel row for anti-aliased vector fills. */
const SUPERSAMPLE_ROWS = 4;

/** Horizontal supersampling grid resolution per pixel column for anti-aliased vector fills. */
const SUPERSAMPLE_COLS = 4;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches `<defs>…</defs>` so it can be stripped before walking painted body elements. */
const DEFS_BLOCK_RX = /<defs>[\s\S]*?<\/defs>/;

/** Matches painted top-level SVG body primitives (`<rect>`, `<g>…</g>`, or `<path>`). */
const BODY_PRIMITIVE_RX =
  /<g\s+(?<groupAttrs>[^>]+)>(?<groupBody>[\s\S]*?)<\/g>|(?<selfTag><(?:rect|path)\s+[^>]*\/>)/g;

/** Matches `<path … />` elements inside a `<g>` group. */
const INNER_PATH_RX = /<path\s+(?<attrs>[^>]*)\/>/g;

/** Matches `translate(tx ty)` inside a `transform` attribute. */
const TRANSLATE_RX = /translate\(\s*(?<tx>[-+\d.]+)[\s,]+(?<ty>[-+\d.]+)\s*\)/;

/** Matches `scale(s)` inside a `transform` attribute. */
const SCALE_RX = /scale\(\s*(?<scale>[-+\d.]+)\s*\)/;

// -------------------------------------- INTERNALS --------------------------------------

/** Alpha-composite `[red, green, blue, alpha]` onto `canvas` (`Float32Array`) at pixel index `pixelOffset`. */
function blendPixel(
  canvas: Float32Array,
  pixelOffset: number,
  red: number,
  green: number,
  blue: number,
  alpha: number
): void {
  if (alpha <= 0) {
    return;
  }
  if (alpha >= 1) {
    canvas[pixelOffset] = red;
    canvas[pixelOffset + 1] = green;
    canvas[pixelOffset + 2] = blue;
    return;
  }
  const invAlpha = 1 - alpha;
  canvas[pixelOffset] = (canvas[pixelOffset] ?? 0) * invAlpha + red * alpha;
  canvas[pixelOffset + 1] = (canvas[pixelOffset + 1] ?? 0) * invAlpha + green * alpha;
  canvas[pixelOffset + 2] = (canvas[pixelOffset + 2] ?? 0) * invAlpha + blue * alpha;
}

/** Compute analytical signed distance from `(pointX, pointY)` to a rounded rectangle. */
function signedDistanceRoundedRect(
  pointX: number,
  pointY: number,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
  radius: number
): number {
  const clampedRadius = Math.min(radius, halfWidth, halfHeight);
  const offsetX = Math.abs(pointX - centerX) - (halfWidth - clampedRadius);
  const offsetY = Math.abs(pointY - centerY) - (halfHeight - clampedRadius);
  const outsideDist = Math.hypot(Math.max(offsetX, 0), Math.max(offsetY, 0));
  const insideDist = Math.min(Math.max(offsetX, offsetY), 0);
  return outsideDist + insideDist - clampedRadius;
}

/** Paint a `<rect>` primitive (solid or gradient fill plus optional 1px stroke) onto `canvas`. */
function paintRect(
  canvas: Float32Array,
  canvasWidth: number,
  canvasHeight: number,
  attrs: Readonly<Record<string, string>>,
  gradients: ReadonlyMap<string, GradientDef>
): void {
  const rectX = Number.parseFloat(attrs.x ?? '0');
  const rectY = Number.parseFloat(attrs.y ?? '0');
  const rectWidth = Number.parseFloat(attrs.width ?? '0');
  const rectHeight = Number.parseFloat(attrs.height ?? '0');
  const cornerRadius = Number.parseFloat(attrs.rx ?? '0');
  if (rectWidth <= 0 || rectHeight <= 0) {
    return;
  }

  const fillSpec = attrs.fill ?? '#000000';
  const strokeSpec = attrs.stroke ?? 'none';
  const hasFill = fillSpec !== 'none';
  const strokeColor =
    strokeSpec !== 'none' ? evaluatePaint(strokeSpec, gradients, 0, 0) : undefined;

  const halfWidth = rectWidth / 2;
  const halfHeight = rectHeight / 2;
  const centerX = rectX + halfWidth;
  const centerY = rectY + halfHeight;

  const minCol = Math.max(0, Math.floor(rectX - 2));
  const maxCol = Math.min(canvasWidth - 1, Math.ceil(rectX + rectWidth + 2));
  const minRow = Math.max(0, Math.floor(rectY - 2));
  const maxRow = Math.min(canvasHeight - 1, Math.ceil(rectY + rectHeight + 2));

  for (let row = minRow; row <= maxRow; row += 1) {
    const sampleY = row + 0.5;
    const unitY = (sampleY - rectY) / rectHeight;
    for (let col = minCol; col <= maxCol; col += 1) {
      const sampleX = col + 0.5;
      const dist = signedDistanceRoundedRect(
        sampleX,
        sampleY,
        centerX,
        centerY,
        halfWidth,
        halfHeight,
        cornerRadius
      );
      const pixelOffset = (row * canvasWidth + col) * 3;

      if (hasFill && dist < 0.5) {
        const fillCoverage = clampRange(0.5 - dist, 0, 1);
        const unitX = (sampleX - rectX) / rectWidth;
        const paint = evaluatePaint(fillSpec, gradients, unitX, unitY);
        if (paint) {
          blendPixel(canvas, pixelOffset, paint[0], paint[1], paint[2], paint[3] * fillCoverage);
        }
      }

      if (strokeColor) {
        const strokeCoverage = clampRange(1 - Math.abs(dist), 0, 1);
        if (strokeCoverage > 0) {
          blendPixel(
            canvas,
            pixelOffset,
            strokeColor[0],
            strokeColor[1],
            strokeColor[2],
            strokeColor[3] * strokeCoverage
          );
        }
      }
    }
  }
}

/** Append one directed non-horizontal edge `(x1, y1) -> (x2, y2)` to `edges`. */
function pushDirectedEdge(
  edges: DirectedEdge[],
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  if (y1 !== y2) {
    edges.push(y1 < y2 ? { dir: 1, x1, x2, y1, y2 } : { dir: -1, x1: x2, x2: x1, y1: y2, y2: y1 });
  }
}

/** Collect directed scanline edges and bounding box from flattened `subpaths`. */
function collectFilledPathEdges(subpaths: readonly FlattenedSubpath[]): FilledPathEdges {
  const edges: DirectedEdge[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const subpath of subpaths) {
    const { points } = subpath;
    if (points.length >= 2) {
      for (let i = 0; i < points.length - 1; i += 1) {
        const pointA = points[i];
        const pointB = points[i + 1];
        if (pointA && pointB) {
          const [x1, y1] = pointA;
          const [x2, y2] = pointB;
          minX = Math.min(minX, x1, x2);
          minY = Math.min(minY, y1, y2);
          maxX = Math.max(maxX, x1, x2);
          maxY = Math.max(maxY, y1, y2);
          pushDirectedEdge(edges, x1, y1, x2, y2);
        }
      }
      const [firstPoint] = points;
      const lastPoint = points.at(-1);
      if (firstPoint && lastPoint) {
        pushDirectedEdge(edges, lastPoint[0], lastPoint[1], firstPoint[0], firstPoint[1]);
      }
    }
  }

  return { edges, maxX, maxY, minX, minY };
}

/** Accumulate non-zero winding supersample hits along horizontal sub-row `scanY` into `hitCounts`. */
function accumulateSubRowHits(
  edges: readonly DirectedEdge[],
  scanY: number,
  startCol: number,
  endCol: number,
  hitCounts: Uint8Array,
  crossings: ScanlineCrossing[]
): void {
  crossings.length = 0;
  for (const edge of edges) {
    if (scanY >= edge.y1 && scanY < edge.y2) {
      const intersectX = edge.x1 + ((scanY - edge.y1) * (edge.x2 - edge.x1)) / (edge.y2 - edge.y1);
      crossings.push({ dir: edge.dir, x: intersectX });
    }
  }
  if (crossings.length < 2) {
    return;
  }
  crossings.sort((left, right) => left.x - right.x);

  let winding = 0;
  let spanStartX = 0;
  for (const crossing of crossings) {
    const prevWinding = winding;
    winding += crossing.dir;
    if (prevWinding === 0 && winding !== 0) {
      spanStartX = crossing.x;
    } else if (prevWinding !== 0 && winding === 0) {
      const firstSubCol = Math.max(
        startCol * SUPERSAMPLE_COLS,
        Math.ceil(spanStartX * SUPERSAMPLE_COLS - 0.5)
      );
      const lastSubCol = Math.min(
        (endCol + 1) * SUPERSAMPLE_COLS - 1,
        Math.floor(crossing.x * SUPERSAMPLE_COLS - 0.5)
      );
      for (let subCol = firstSubCol; subCol <= lastSubCol; subCol += 1) {
        const colIndex = Math.floor(subCol / SUPERSAMPLE_COLS) - startCol;
        hitCounts[colIndex] = (hitCounts[colIndex] ?? 0) + 1;
      }
    }
  }
}

/** Paint a filled `<path>` primitive onto `canvas` using `4x4` non-zero winding scanline supersampling. */
function paintFilledPath(
  canvas: Float32Array,
  canvasWidth: number,
  canvasHeight: number,
  pathData: string,
  fillColor: RgbaTuple,
  offsetX = 0,
  offsetY = 0
): void {
  const { edges, maxX, maxY, minX, minY } = collectFilledPathEdges(
    flattenSvgPath(pathData, offsetX, offsetY)
  );
  if (edges.length === 0) {
    return;
  }

  const startRow = Math.max(0, Math.floor(minY));
  const endRow = Math.min(canvasHeight - 1, Math.ceil(maxY));
  const startCol = Math.max(0, Math.floor(minX));
  const endCol = Math.min(canvasWidth - 1, Math.ceil(maxX));
  const rowWidth = endCol - startCol + 1;
  const hitCounts = new Uint8Array(rowWidth);
  const totalSamples = SUPERSAMPLE_ROWS * SUPERSAMPLE_COLS;
  const crossings: ScanlineCrossing[] = [];

  for (let row = startRow; row <= endRow; row += 1) {
    hitCounts.fill(0);
    for (let subRow = 0; subRow < SUPERSAMPLE_ROWS; subRow += 1) {
      const scanY = row + (subRow + 0.5) / SUPERSAMPLE_ROWS;
      accumulateSubRowHits(edges, scanY, startCol, endCol, hitCounts, crossings);
    }
    for (let i = 0; i < rowWidth; i += 1) {
      const hits = hitCounts[i] ?? 0;
      if (hits > 0) {
        const pixelOffset = (row * canvasWidth + (startCol + i)) * 3;
        blendPixel(
          canvas,
          pixelOffset,
          fillColor[0],
          fillColor[1],
          fillColor[2],
          (fillColor[3] * hits) / totalSamples
        );
      }
    }
  }
}

/** Squared distance from `(pointX, pointY)` to segment `(ax, ay) -> (bx, by)`. */
function distToSegmentSquared(
  pointX: number,
  pointY: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const segDx = bx - ax;
  const segDy = by - ay;
  const segLenSq = segDx * segDx + segDy * segDy;
  if (segLenSq === 0) {
    return (pointX - ax) * (pointX - ax) + (pointY - ay) * (pointY - ay);
  }
  const proj = clampRange(((pointX - ax) * segDx + (pointY - ay) * segDy) / segLenSq, 0, 1);
  const nearX = ax + proj * segDx;
  const nearY = ay + proj * segDy;
  return (pointX - nearX) * (pointX - nearX) + (pointY - nearY) * (pointY - nearY);
}

/** Collect flattened line segments and bounding box from `<path>` elements inside a `<g>` group. */
function collectGroupSegments(
  groupBody: string,
  offsetX: number,
  offsetY: number,
  scale: number
): GroupSegments {
  const segments: Segment2D[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const pathMatch of groupBody.matchAll(INNER_PATH_RX)) {
    const pathAttrs = parseXmlAttrs(pathMatch.groups?.attrs ?? '');
    for (const subpath of flattenSvgPath(pathAttrs.d ?? '', offsetX, offsetY, scale)) {
      const { points } = subpath;
      for (let i = 0; i < points.length - 1; i += 1) {
        const pointA = points[i];
        const pointB = points[i + 1];
        if (pointA && pointB) {
          const [ax, ay] = pointA;
          const [bx, by] = pointB;
          segments.push([ax, ay, bx, by]);
          minX = Math.min(minX, ax, bx);
          minY = Math.min(minY, ay, by);
          maxX = Math.max(maxX, ax, bx);
          maxY = Math.max(maxY, ay, by);
        }
      }
    }
  }

  return { maxX, maxY, minX, minY, segments };
}

/** Paint a stroked `<g>` icon group (round caps & joins) onto `canvas` using exact segment SDF. */
function paintStrokedGroup(
  canvas: Float32Array,
  canvasWidth: number,
  canvasHeight: number,
  groupAttrs: Readonly<Record<string, string>>,
  groupBody: string,
  gradients: ReadonlyMap<string, GradientDef>
): void {
  const strokeColor = evaluatePaint(groupAttrs.stroke ?? '#FFFFFF', gradients, 0, 0);
  if (!strokeColor) {
    return;
  }
  const translateMatch = TRANSLATE_RX.exec(groupAttrs.transform ?? '');
  const scaleMatch = SCALE_RX.exec(groupAttrs.transform ?? '');
  const offsetX = Number.parseFloat(translateMatch?.groups?.tx ?? '0');
  const offsetY = Number.parseFloat(translateMatch?.groups?.ty ?? '0');
  const scale = Number.parseFloat(scaleMatch?.groups?.scale ?? '1');
  const halfStroke = (Number.parseFloat(groupAttrs['stroke-width'] ?? '2') * scale) / 2;

  const { maxX, maxY, minX, minY, segments } = collectGroupSegments(
    groupBody,
    offsetX,
    offsetY,
    scale
  );
  if (segments.length === 0) {
    return;
  }

  const pad = Math.ceil(halfStroke + 2);
  const startRow = Math.max(0, Math.floor(minY - pad));
  const endRow = Math.min(canvasHeight - 1, Math.ceil(maxY + pad));
  const startCol = Math.max(0, Math.floor(minX - pad));
  const endCol = Math.min(canvasWidth - 1, Math.ceil(maxX + pad));

  for (let row = startRow; row <= endRow; row += 1) {
    const sampleY = row + 0.5;
    for (let col = startCol; col <= endCol; col += 1) {
      const sampleX = col + 0.5;
      let minDistSq = Number.POSITIVE_INFINITY;
      for (const [ax, ay, bx, by] of segments) {
        minDistSq = Math.min(minDistSq, distToSegmentSquared(sampleX, sampleY, ax, ay, bx, by));
      }
      const coverage = clampRange(halfStroke + 0.5 - Math.sqrt(minDistSq), 0, 1);
      if (coverage > 0) {
        const pixelOffset = (row * canvasWidth + col) * 3;
        blendPixel(
          canvas,
          pixelOffset,
          strokeColor[0],
          strokeColor[1],
          strokeColor[2],
          strokeColor[3] * coverage
        );
      }
    }
  }
}

/** Paint a single matched SVG body primitive (`<g>`, `<rect>`, or `<path>`) onto `canvas`. */
function paintBodyPrimitive(
  canvas: Float32Array,
  width: number,
  height: number,
  match: RegExpExecArray,
  gradients: ReadonlyMap<string, GradientDef>
): void {
  if (match.groups?.groupAttrs !== undefined) {
    paintStrokedGroup(
      canvas,
      width,
      height,
      parseXmlAttrs(match.groups.groupAttrs),
      match.groups.groupBody ?? '',
      gradients
    );
    return;
  }
  const selfTag = match.groups?.selfTag ?? '';
  const attrs = parseXmlAttrs(selfTag);
  if (selfTag.startsWith('<rect')) {
    paintRect(canvas, width, height, attrs, gradients);
  } else if (selfTag.startsWith('<path') && attrs.d) {
    const fillColor = evaluatePaint(attrs.fill ?? '#FFFFFF', gradients, 0, 0);
    if (fillColor) {
      const translateMatch = TRANSLATE_RX.exec(attrs.transform ?? '');
      const offsetX = Number.parseFloat(translateMatch?.groups?.tx ?? '0');
      const offsetY = Number.parseFloat(translateMatch?.groups?.ty ?? '0');
      paintFilledPath(canvas, width, height, attrs.d, fillColor, offsetX, offsetY);
    }
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Rasterize `svgMarkup` (`width` x `height`) into a compressed PNG `Buffer`.
 * @param svgMarkup      SVG card markup returned by `renderOgImageSvg()`.
 * @param width          Card width in pixels.
 * @param height         Card height in pixels.
 * @param sourceDigest   Hex SHA-256 digest of `svgMarkup`.
 * @returns Compressed PNG image buffer.
 */
export function rasterizeOgSvgToPng(
  svgMarkup: string,
  width: number,
  height: number,
  sourceDigest: string
): Buffer {
  const gradients = parseGradientDefs(svgMarkup);
  const canvas = new Float32Array(width * height * 3);
  const bodyMarkup = svgMarkup.replace(DEFS_BLOCK_RX, '');

  for (const match of bodyMarkup.matchAll(BODY_PRIMITIVE_RX)) {
    paintBodyPrimitive(canvas, width, height, match, gradients);
  }

  return encodeRgbPng(width, height, ditherCanvasToRgb(canvas, width, height), sourceDigest);
}
