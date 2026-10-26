/**
 * Vector SVG rasterizer – Paints rounded `<rect>` and `<circle>` SDFs, `4x4` supersampled filled `<path>` outlines, and stroked `<g>` groups onto an RGBA canvas.
 */

import {
  clampRange,
  ditherCanvasToRgb,
  ditherCanvasToRgba,
  encodeRgbaPng,
  encodeRgbPng,
} from './png.ts';
import {
  CURVE_STEPS,
  evaluatePaint,
  flattenSvgPath,
  parseGradientDefs,
  parseXmlAttrs,
} from './svgParser.ts';
import type {
  DirectedEdge,
  FilledPathEdges,
  FlattenedSubpath,
  GradientDef,
  GroupSegments,
  ScanlineCrossing,
  Segment2D,
} from './types.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** Shared canvas dimensions, root coordinate scale, and parsed gradient map for primitive painters. */
interface RasterScene {
  /** Floating-point RGBA pixel buffer (`width * height * 4` floats). */
  canvas: Float32Array;
  /** Parsed `<linearGradient>` and `<radialGradient>` definitions. */
  gradients: ReadonlyMap<string, GradientDef>;
  /** Target raster height in pixels. */
  height: number;
  /** Uniform scale from SVG `viewBox` units to target raster pixels. */
  rootScale: number;
  /** Target raster width in pixels. */
  width: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Vertical supersampling grid resolution per pixel row for anti-aliased vector fills. */
const SUPERSAMPLE_ROWS = 4;

/** Horizontal supersampling grid resolution per pixel column for anti-aliased vector fills. */
const SUPERSAMPLE_COLS = 4;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches the opening `<svg …>` tag to read `viewBox` or `width` dimensions. */
const SVG_OPEN_TAG_RX = /<svg\s+(?<attrs>[^>]+)>/;

/** Matches `<defs>…</defs>` so it can be stripped before walking painted body elements. */
const DEFS_BLOCK_RX = /<defs>[\s\S]*?<\/defs>/;

/** Matches painted top-level SVG body primitives (`<g>…</g>`, `<rect>`, `<circle>`, or `<path>`). */
const BODY_PRIMITIVE_RX =
  /<g\s+(?<groupAttrs>[^>]+)>(?<groupBody>[\s\S]*?)<\/g>|(?<selfTag><(?:rect|circle|path)\s+[^>]*\/>)/g;

/** Matches `<path … />` and `<circle … />` elements inside a `<g>` group. */
const INNER_SHAPE_RX = /<(?<tag>path|circle)\s+(?<attrs>[^>]*)\/>/g;

/** Matches `translate(tx ty)` inside a `transform` attribute. */
const TRANSLATE_RX = /translate\(\s*(?<tx>[-+\d.]+)[\s,]+(?<ty>[-+\d.]+)\s*\)/;

/** Matches `scale(s)` inside a `transform` attribute. */
const SCALE_RX = /scale\(\s*(?<scale>[-+\d.]+)\s*\)/;

/** Matches whitespace or comma separators inside an SVG `viewBox` attribute. */
const VIEWBOX_SEP_RX = /[\s,]+/;

// -------------------------------------- INTERNALS --------------------------------------

/** Porter-Duff `source over destination` alpha blend onto `canvas` (`Float32Array`) at `pixelOffset`. */
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
    canvas[pixelOffset + 3] = 1;
    return;
  }
  const destAlpha = canvas[pixelOffset + 3] ?? 0;
  const invAlpha = 1 - alpha;
  const outAlpha = alpha + destAlpha * invAlpha;
  if (outAlpha <= 0) {
    return;
  }
  canvas[pixelOffset] =
    (red * alpha + (canvas[pixelOffset] ?? 0) * destAlpha * invAlpha) / outAlpha;
  canvas[pixelOffset + 1] =
    (green * alpha + (canvas[pixelOffset + 1] ?? 0) * destAlpha * invAlpha) / outAlpha;
  canvas[pixelOffset + 2] =
    (blue * alpha + (canvas[pixelOffset + 2] ?? 0) * destAlpha * invAlpha) / outAlpha;
  canvas[pixelOffset + 3] = outAlpha;
}

/** Resolve the uniform coordinate scale from `<svg viewBox="…">` (or `width`) to `targetWidth`. */
function resolveRootScale(svgMarkup: string, targetWidth: number): number {
  const openMatch = SVG_OPEN_TAG_RX.exec(svgMarkup);
  const svgAttrs = parseXmlAttrs(openMatch?.groups?.attrs ?? '');
  if (svgAttrs.viewBox) {
    const parts = svgAttrs.viewBox.trim().split(VIEWBOX_SEP_RX);
    const viewBoxWidth = Number.parseFloat(parts[2] ?? '0');
    if (viewBoxWidth > 0) {
      return targetWidth / viewBoxWidth;
    }
  }
  const declaredWidth = Number.parseFloat(svgAttrs.width ?? '0');
  return declaredWidth > 0 ? targetWidth / declaredWidth : 1;
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

/** Blend signed-distance `dist` fill and stroke coverage for one pixel sample onto `scene.canvas`. */
function blendSdfSample(
  scene: RasterScene,
  pixelOffset: number,
  dist: number,
  unitX: number,
  unitY: number,
  fillSpec: string | undefined,
  fillOpacity: number,
  strokeSpec: string | undefined,
  strokeOpacity: number,
  halfStroke: number
): void {
  if (fillSpec !== undefined && dist < 0.5) {
    const fillPaint = evaluatePaint(fillSpec, scene.gradients, unitX, unitY);
    if (fillPaint) {
      blendPixel(
        scene.canvas,
        pixelOffset,
        fillPaint[0],
        fillPaint[1],
        fillPaint[2],
        fillPaint[3] * fillOpacity * clampRange(0.5 - dist, 0, 1)
      );
    }
  }
  if (strokeSpec !== undefined && halfStroke > 0) {
    const strokeCoverage = clampRange(halfStroke + 0.5 - Math.abs(dist), 0, 1);
    if (strokeCoverage > 0) {
      const strokePaint = evaluatePaint(strokeSpec, scene.gradients, unitX, unitY);
      if (strokePaint) {
        blendPixel(
          scene.canvas,
          pixelOffset,
          strokePaint[0],
          strokePaint[1],
          strokePaint[2],
          strokePaint[3] * strokeOpacity * strokeCoverage
        );
      }
    }
  }
}

/** Paint a `<rect>` primitive (solid or gradient fill plus optional stroke) onto `scene`. */
function paintRect(scene: RasterScene, attrs: Readonly<Record<string, string>>): void {
  const rectX = Number.parseFloat(attrs.x ?? '0') * scene.rootScale;
  const rectY = Number.parseFloat(attrs.y ?? '0') * scene.rootScale;
  const rectWidth = Number.parseFloat(attrs.width ?? '0') * scene.rootScale;
  const rectHeight = Number.parseFloat(attrs.height ?? '0') * scene.rootScale;
  const cornerRadius = Number.parseFloat(attrs.rx ?? '0') * scene.rootScale;
  if (rectWidth <= 0 || rectHeight <= 0) {
    return;
  }

  const fillSpec = attrs.fill ?? '#000000';
  const strokeSpec = attrs.stroke ?? 'none';
  const fillOpacity = clampRange(Number.parseFloat(attrs['fill-opacity'] ?? '1'), 0, 1);
  const strokeOpacity = clampRange(Number.parseFloat(attrs['stroke-opacity'] ?? '1'), 0, 1);
  const halfStroke = (Number.parseFloat(attrs['stroke-width'] ?? '1') * scene.rootScale) / 2;
  const activeFillSpec = fillSpec !== 'none' && fillOpacity > 0 ? fillSpec : undefined;
  const activeStrokeSpec =
    strokeSpec !== 'none' && halfStroke > 0 && strokeOpacity > 0 ? strokeSpec : undefined;

  const halfWidth = rectWidth / 2;
  const halfHeight = rectHeight / 2;
  const centerX = rectX + halfWidth;
  const centerY = rectY + halfHeight;
  const pad = Math.ceil(Math.max(0, halfStroke) + 2);

  const minCol = Math.max(0, Math.floor(rectX - pad));
  const maxCol = Math.min(scene.width - 1, Math.ceil(rectX + rectWidth + pad));
  const minRow = Math.max(0, Math.floor(rectY - pad));
  const maxRow = Math.min(scene.height - 1, Math.ceil(rectY + rectHeight + pad));

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
      blendSdfSample(
        scene,
        (row * scene.width + col) * 4,
        dist,
        (sampleX - rectX) / rectWidth,
        unitY,
        activeFillSpec,
        fillOpacity,
        activeStrokeSpec,
        strokeOpacity,
        halfStroke
      );
    }
  }
}

/** Paint a top-level `<circle>` primitive (solid or gradient fill plus optional stroke) onto `scene`. */
function paintCircle(scene: RasterScene, attrs: Readonly<Record<string, string>>): void {
  const radius = Number.parseFloat(attrs.r ?? '0') * scene.rootScale;
  if (radius <= 0) {
    return;
  }
  const centerX = Number.parseFloat(attrs.cx ?? '0') * scene.rootScale;
  const centerY = Number.parseFloat(attrs.cy ?? '0') * scene.rootScale;
  const fillSpec = attrs.fill ?? '#000000';
  const strokeSpec = attrs.stroke ?? 'none';
  const fillOpacity = clampRange(Number.parseFloat(attrs['fill-opacity'] ?? '1'), 0, 1);
  const strokeOpacity = clampRange(Number.parseFloat(attrs['stroke-opacity'] ?? '1'), 0, 1);
  const halfStroke = (Number.parseFloat(attrs['stroke-width'] ?? '1') * scene.rootScale) / 2;
  const activeFillSpec = fillSpec !== 'none' && fillOpacity > 0 ? fillSpec : undefined;
  const activeStrokeSpec =
    strokeSpec !== 'none' && halfStroke > 0 && strokeOpacity > 0 ? strokeSpec : undefined;

  const diameter = radius * 2;
  const originX = centerX - radius;
  const originY = centerY - radius;
  const pad = Math.ceil(radius + Math.max(0, halfStroke) + 2);
  const minCol = Math.max(0, Math.floor(centerX - pad));
  const maxCol = Math.min(scene.width - 1, Math.ceil(centerX + pad));
  const minRow = Math.max(0, Math.floor(centerY - pad));
  const maxRow = Math.min(scene.height - 1, Math.ceil(centerY + pad));

  for (let row = minRow; row <= maxRow; row += 1) {
    const sampleY = row + 0.5;
    const unitY = (sampleY - originY) / diameter;
    for (let col = minCol; col <= maxCol; col += 1) {
      const sampleX = col + 0.5;
      const dist = Math.hypot(sampleX - centerX, sampleY - centerY) - radius;
      blendSdfSample(
        scene,
        (row * scene.width + col) * 4,
        dist,
        (sampleX - originX) / diameter,
        unitY,
        activeFillSpec,
        fillOpacity,
        activeStrokeSpec,
        strokeOpacity,
        halfStroke
      );
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
      crossings.push({ crossingX: intersectX, dir: edge.dir });
    }
  }
  if (crossings.length < 2) {
    return;
  }
  crossings.sort((left, right) => left.crossingX - right.crossingX);

  let winding = 0;
  let spanStartX = 0;
  for (const crossing of crossings) {
    const prevWinding = winding;
    winding += crossing.dir;
    if (prevWinding === 0 && winding !== 0) {
      spanStartX = crossing.crossingX;
    } else if (prevWinding !== 0 && winding === 0) {
      const firstSubCol = Math.max(
        startCol * SUPERSAMPLE_COLS,
        Math.ceil(spanStartX * SUPERSAMPLE_COLS - 0.5)
      );
      const lastSubCol = Math.min(
        (endCol + 1) * SUPERSAMPLE_COLS - 1,
        Math.floor(crossing.crossingX * SUPERSAMPLE_COLS - 0.5)
      );
      for (let subCol = firstSubCol; subCol <= lastSubCol; subCol += 1) {
        const colIndex = Math.floor(subCol / SUPERSAMPLE_COLS) - startCol;
        hitCounts[colIndex] = (hitCounts[colIndex] ?? 0) + 1;
      }
    }
  }
}

/** Parse optional `translate(...)` and `scale(...)` attributes scaled by `rootScale`. */
function resolveElementTransform(
  transformAttr: string | undefined,
  rootScale: number
): { localScale: number; offsetX: number; offsetY: number } {
  const transform = transformAttr ?? '';
  const translateMatch = TRANSLATE_RX.exec(transform);
  const scaleMatch = SCALE_RX.exec(transform);
  return {
    localScale: Number.parseFloat(scaleMatch?.groups?.scale ?? '1') * rootScale,
    offsetX: Number.parseFloat(translateMatch?.groups?.tx ?? '0') * rootScale,
    offsetY: Number.parseFloat(translateMatch?.groups?.ty ?? '0') * rootScale,
  };
}

/** Blend one supersampled scanline `row` of a filled `<path>` onto `scene.canvas`. */
function paintFilledScanlineRow(
  scene: RasterScene,
  row: number,
  startCol: number,
  hitCounts: Uint8Array,
  fillSpec: string,
  fillOpacity: number,
  minX: number,
  spanX: number,
  unitY: number
): void {
  const totalSamples = SUPERSAMPLE_ROWS * SUPERSAMPLE_COLS;
  for (let i = 0; i < hitCounts.length; i += 1) {
    const hits = hitCounts[i] ?? 0;
    if (hits > 0) {
      const col = startCol + i;
      const paint = evaluatePaint(fillSpec, scene.gradients, (col + 0.5 - minX) / spanX, unitY);
      if (paint) {
        blendPixel(
          scene.canvas,
          (row * scene.width + col) * 4,
          paint[0],
          paint[1],
          paint[2],
          (paint[3] * fillOpacity * hits) / totalSamples
        );
      }
    }
  }
}

/** Paint a self-closing `<path>` element with optional `translate(...)` and `scale(...)` transforms. */
function paintPathElement(scene: RasterScene, attrs: Readonly<Record<string, string>>): void {
  const fillSpec = attrs.fill ?? '#FFFFFF';
  const fillOpacity = clampRange(Number.parseFloat(attrs['fill-opacity'] ?? '1'), 0, 1);
  if (!attrs.d || fillSpec === 'none' || fillOpacity <= 0) {
    return;
  }
  const { localScale, offsetX, offsetY } = resolveElementTransform(
    attrs.transform,
    scene.rootScale
  );
  const { edges, maxX, maxY, minX, minY } = collectFilledPathEdges(
    flattenSvgPath(attrs.d, offsetX, offsetY, localScale)
  );
  if (edges.length === 0) {
    return;
  }

  const startRow = Math.max(0, Math.floor(minY));
  const endRow = Math.min(scene.height - 1, Math.ceil(maxY));
  const startCol = Math.max(0, Math.floor(minX));
  const endCol = Math.min(scene.width - 1, Math.ceil(maxX));
  const hitCounts = new Uint8Array(endCol - startCol + 1);
  const crossings: ScanlineCrossing[] = [];
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);

  for (let row = startRow; row <= endRow; row += 1) {
    hitCounts.fill(0);
    for (let subRow = 0; subRow < SUPERSAMPLE_ROWS; subRow += 1) {
      accumulateSubRowHits(
        edges,
        row + (subRow + 0.5) / SUPERSAMPLE_ROWS,
        startCol,
        endCol,
        hitCounts,
        crossings
      );
    }
    paintFilledScanlineRow(
      scene,
      row,
      startCol,
      hitCounts,
      fillSpec,
      fillOpacity,
      minX,
      spanX,
      (row + 0.5 - minY) / spanY
    );
  }
}

/** Squared distance from `(pointX, pointY)` to segment `(startX, startY) -> (endX, endY)`. */
function distToSegmentSquared(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): number {
  const segDx = endX - startX;
  const segDy = endY - startY;
  const segLenSq = segDx * segDx + segDy * segDy;
  if (segLenSq === 0) {
    return (pointX - startX) * (pointX - startX) + (pointY - startY) * (pointY - startY);
  }
  const proj = clampRange(((pointX - startX) * segDx + (pointY - startY) * segDy) / segLenSq, 0, 1);
  const nearX = startX + proj * segDx;
  const nearY = startY + proj * segDy;
  return (pointX - nearX) * (pointX - nearX) + (pointY - nearY) * (pointY - nearY);
}

/** Collect flattened line segments and bounding box from `<path>` and `<circle>` elements inside a `<g>` group. */
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

  function pushSegment(startX: number, startY: number, endX: number, endY: number): void {
    segments.push([startX, startY, endX, endY]);
    minX = Math.min(minX, startX, endX);
    minY = Math.min(minY, startY, endY);
    maxX = Math.max(maxX, startX, endX);
    maxY = Math.max(maxY, startY, endY);
  }

  for (const shapeMatch of groupBody.matchAll(INNER_SHAPE_RX)) {
    const tag = shapeMatch.groups?.tag;
    const shapeAttrs = parseXmlAttrs(shapeMatch.groups?.attrs ?? '');
    if (tag === 'circle') {
      const radius = Number.parseFloat(shapeAttrs.r ?? '0') * scale;
      if (radius > 0) {
        const centerX = offsetX + Number.parseFloat(shapeAttrs.cx ?? '0') * scale;
        const centerY = offsetY + Number.parseFloat(shapeAttrs.cy ?? '0') * scale;
        const circleSteps = CURVE_STEPS * 2;
        let prevX = centerX + radius;
        let prevY = centerY;
        for (let step = 1; step <= circleSteps; step += 1) {
          const angle = (Math.PI * 2 * step) / circleSteps;
          const nextX = centerX + Math.cos(angle) * radius;
          const nextY = centerY + Math.sin(angle) * radius;
          pushSegment(prevX, prevY, nextX, nextY);
          prevX = nextX;
          prevY = nextY;
        }
      }
    } else {
      for (const subpath of flattenSvgPath(shapeAttrs.d ?? '', offsetX, offsetY, scale)) {
        const { points } = subpath;
        for (let i = 0; i < points.length - 1; i += 1) {
          const pointA = points[i];
          const pointB = points[i + 1];
          if (pointA && pointB) {
            pushSegment(pointA[0], pointA[1], pointB[0], pointB[1]);
          }
        }
      }
    }
  }

  return { maxX, maxY, minX, minY, segments };
}

/** Compute the minimum squared distance from `(sampleX, sampleY)` across `segments`. */
function measureMinSegmentDistSq(
  sampleX: number,
  sampleY: number,
  segments: readonly Segment2D[]
): number {
  let minDistSq = Number.POSITIVE_INFINITY;
  for (const [segStartX, segStartY, segEndX, segEndY] of segments) {
    minDistSq = Math.min(
      minDistSq,
      distToSegmentSquared(sampleX, sampleY, segStartX, segStartY, segEndX, segEndY)
    );
  }
  return minDistSq;
}

/** Paint a stroked `<g>` group (round caps & joins, solid or gradient stroke) onto `scene`. */
function paintStrokedGroup(
  scene: RasterScene,
  groupAttrs: Readonly<Record<string, string>>,
  groupBody: string
): void {
  const strokeSpec = groupAttrs.stroke ?? '#FFFFFF';
  const strokeOpacity = clampRange(Number.parseFloat(groupAttrs['stroke-opacity'] ?? '1'), 0, 1);
  if (strokeSpec === 'none' || strokeOpacity <= 0) {
    return;
  }
  const {
    localScale: scale,
    offsetX,
    offsetY,
  } = resolveElementTransform(groupAttrs.transform, scene.rootScale);
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
  const endRow = Math.min(scene.height - 1, Math.ceil(maxY + pad));
  const startCol = Math.max(0, Math.floor(minX - pad));
  const endCol = Math.min(scene.width - 1, Math.ceil(maxX + pad));
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);

  for (let row = startRow; row <= endRow; row += 1) {
    const sampleY = row + 0.5;
    const unitY = (sampleY - minY) / spanY;
    for (let col = startCol; col <= endCol; col += 1) {
      const sampleX = col + 0.5;
      const minDistSq = measureMinSegmentDistSq(sampleX, sampleY, segments);
      const coverage = clampRange(halfStroke + 0.5 - Math.sqrt(minDistSq), 0, 1);
      if (coverage > 0) {
        const paint = evaluatePaint(strokeSpec, scene.gradients, (sampleX - minX) / spanX, unitY);
        if (paint) {
          blendPixel(
            scene.canvas,
            (row * scene.width + col) * 4,
            paint[0],
            paint[1],
            paint[2],
            paint[3] * strokeOpacity * coverage
          );
        }
      }
    }
  }
}

/** Paint a single matched SVG body primitive (`<g>`, `<rect>`, `<circle>`, or `<path>`) onto `scene`. */
function paintBodyPrimitive(scene: RasterScene, match: RegExpExecArray): void {
  if (match.groups?.groupAttrs !== undefined) {
    paintStrokedGroup(scene, parseXmlAttrs(match.groups.groupAttrs), match.groups.groupBody ?? '');
    return;
  }
  const selfTag = match.groups?.selfTag ?? '';
  const attrs = parseXmlAttrs(selfTag);
  if (selfTag.startsWith('<rect')) {
    paintRect(scene, attrs);
  } else if (selfTag.startsWith('<circle')) {
    paintCircle(scene, attrs);
  } else if (selfTag.startsWith('<path')) {
    paintPathElement(scene, attrs);
  }
}

/** Paint `svgMarkup` onto a floating-point RGBA `Float32Array` (`width * height * 4` floats). */
function rasterizeSvgCanvas(svgMarkup: string, width: number, height: number): Float32Array {
  const scene: RasterScene = {
    canvas: new Float32Array(width * height * 4),
    gradients: parseGradientDefs(svgMarkup),
    height,
    rootScale: resolveRootScale(svgMarkup, width),
    width,
  };
  const bodyMarkup = svgMarkup.replace(DEFS_BLOCK_RX, '');

  for (const match of bodyMarkup.matchAll(BODY_PRIMITIVE_RX)) {
    paintBodyPrimitive(scene, match);
  }

  return scene.canvas;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Rasterize `svgMarkup` (`width` x `height`) into a compressed RGB PNG `Buffer`.
 * @param svgMarkup      Source SVG document markup.
 * @param width          Output width in pixels.
 * @param height         Output height in pixels.
 * @param sourceDigest   Hex SHA-256 digest of `svgMarkup`.
 * @returns Compressed 24-bit RGB PNG image buffer.
 */
export function rasterizeOgSvgToPng(
  svgMarkup: string,
  width: number,
  height: number,
  sourceDigest: string
): Buffer {
  const canvas = rasterizeSvgCanvas(svgMarkup, width, height);
  return encodeRgbPng(width, height, ditherCanvasToRgb(canvas, width, height), sourceDigest);
}

/**
 * Rasterize `svgMarkup` (`width` x `height`) into a compressed RGBA PNG `Buffer` preserving outer transparency.
 * @param svgMarkup      Source SVG document markup.
 * @param width          Output width in pixels.
 * @param height         Output height in pixels.
 * @param sourceDigest   Hex SHA-256 digest of `svgMarkup`.
 * @returns Compressed 32-bit RGBA PNG image buffer.
 */
export function rasterizeSvgToRgbaPng(
  svgMarkup: string,
  width: number,
  height: number,
  sourceDigest: string
): Buffer {
  const canvas = rasterizeSvgCanvas(svgMarkup, width, height);
  return encodeRgbaPng(width, height, ditherCanvasToRgba(canvas, width, height), sourceDigest);
}
