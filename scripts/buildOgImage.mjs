/**
 * OpenGraph rasterizer – Evaluates `renderOgImageSvg()` from `src/site/seo.ts` and rasterizes it into `src/assets/og.png` with zero external image dependencies.
 */

/* oxlint-disable no-bitwise -- PNG CRC-32 and big-endian chunk headers require bitwise integer operations. */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';

// ---------------------------------------- CONSTS ---------------------------------------

/** Output path of the generated OpenGraph raster card bundled by Wrangler. */
const OG_PNG_OUTPUT_PATH = 'src/assets/og.png';

/** Vertical supersampling grid resolution per pixel row for anti-aliased vector fills. */
const SUPERSAMPLE_ROWS = 4;

/** Horizontal supersampling grid resolution per pixel column for anti-aliased vector fills. */
const SUPERSAMPLE_COLS = 4;

/** Curve subdivision steps per Bezier or elliptical arc segment. */
const CURVE_STEPS = 12;

/** PNG file signature bytes (`\x89PNG\r\n\x1a\n`). */
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** `4x4` Bayer ordered dither matrix normalized to `[-0.5, +0.5]` to prevent 8-bit dark gradient banding. */
const BAYER_4X4 = [
  -0.46875, 0.03125, -0.34375, 0.15625, 0.28125, -0.21875, 0.40625, -0.09375, -0.28125, 0.21875,
  -0.40625, 0.09375, 0.46875, -0.03125, 0.34375, -0.15625,
];

/** Lazily initialized IEEE 802.3 CRC-32 lookup table (`undefined` until first PNG encode). */
let crc32Table = undefined;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches XML attributes (`name="value"`) inside an SVG tag. */
const XML_ATTR_RX = /(?<name>[\w-]+)="(?<value>[^"]*)"/g;

/** Matches `<linearGradient>` blocks in `<defs>`. */
const LINEAR_GRADIENT_RX = /<linearGradient\s+(?<attrs>[^>]+)>(?<body>[\s\S]*?)<\/linearGradient>/g;

/** Matches `<radialGradient>` blocks in `<defs>`. */
const RADIAL_GRADIENT_RX = /<radialGradient\s+(?<attrs>[^>]+)>(?<body>[\s\S]*?)<\/radialGradient>/g;

/** Matches `<stop … />` elements inside gradient definitions. */
const GRADIENT_STOP_RX = /<stop\s+(?<attrs>[^>]+)\/>/g;

/** Matches `<defs>…</defs>` so it can be stripped before walking painted body elements. */
const DEFS_BLOCK_RX = /<defs>[\s\S]*?<\/defs>/;

/** Matches painted top-level SVG body primitives (`<rect>`, `<g>…</g>`, or `<path>`). */
const BODY_PRIMITIVE_RX =
  /<g\s+(?<groupAttrs>[^>]+)>(?<groupBody>[\s\S]*?)<\/g>|(?<selfTag><(?:rect|path)\s+[^>]*\/>)/g;

/** Matches `<path … />` elements inside a `<g>` group. */
const INNER_PATH_RX = /<path\s+(?<attrs>[^>]*)\/>/g;

/** Matches SVG path command letters and numeric coordinates in `d="…"`. */
const PATH_TOKEN_RX = /[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/** Matches a single SVG path command letter token. */
const COMMAND_LETTER_RX = /^[A-Za-z]$/;

/** Matches `translate(tx ty)` inside a `transform` attribute. */
const TRANSLATE_RX = /translate\(\s*(?<tx>[-+\d.]+)[\s,]+(?<ty>[-+\d.]+)\s*\)/;

/** Matches `scale(s)` inside a `transform` attribute. */
const SCALE_RX = /scale\(\s*(?<scale>[-+\d.]+)\s*\)/;

// -------------------------------------- INTERNALS --------------------------------------

/** Build the 256-entry CRC-32 lookup table for PNG chunk checksums. */
function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc & 1) !== 0 ? 0xed_b8_83_20 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
}

/** Compute the unsigned 32-bit CRC-32 checksum over `typeBuffer` concatenated with `dataBuffer`. */
function computePngChunkCrc(typeBuffer, dataBuffer) {
  crc32Table ??= buildCrc32Table();
  let crc = 0xff_ff_ff_ff;
  for (const byte of typeBuffer) {
    crc = (crc32Table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  for (const byte of dataBuffer) {
    crc = (crc32Table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

/** Pack a single PNG chunk (`length` + `type` + `data` + `CRC-32`). */
function packPngChunk(chunkType, dataBuffer) {
  const typeBuffer = Buffer.from(chunkType, 'ascii');
  const chunk = Buffer.allocUnsafe(12 + dataBuffer.length);
  chunk.writeUInt32BE(dataBuffer.length, 0);
  typeBuffer.copy(chunk, 4);
  dataBuffer.copy(chunk, 8);
  chunk.writeUInt32BE(computePngChunkCrc(typeBuffer, dataBuffer), 8 + dataBuffer.length);
  return chunk;
}

/** Paeth predictor used by PNG scanline filter type `4`. */
function predictPaeth(leftByte, upByte, upLeftByte) {
  const estimate = leftByte + upByte - upLeftByte;
  const distLeft = Math.abs(estimate - leftByte);
  const distUp = Math.abs(estimate - upByte);
  const distUpLeft = Math.abs(estimate - upLeftByte);
  if (distLeft <= distUp && distLeft <= distUpLeft) {
    return leftByte;
  }
  return distUp <= distUpLeft ? upByte : upLeftByte;
}

/** Filter a single RGB scanline with PNG filter `1` (`Sub`) and `4` (`Paeth`), writing the smaller residue into `rawScanlines`. */
function filterPngScanline(rgbPixels, row, rowBytes, subRow, paethRow, rawScanlines) {
  const rowOffset = row * rowBytes;
  const prevRowOffset = (row - 1) * rowBytes;
  let subScore = 0;
  let paethScore = 0;

  for (let i = 0; i < rowBytes; i += 1) {
    const current = rgbPixels[rowOffset + i] ?? 0;
    const left = i >= 3 ? (rgbPixels[rowOffset + i - 3] ?? 0) : 0;
    const up = row > 0 ? (rgbPixels[prevRowOffset + i] ?? 0) : 0;
    const upLeft = row > 0 && i >= 3 ? (rgbPixels[prevRowOffset + i - 3] ?? 0) : 0;

    const subByte = (current - left) & 0xff;
    const paethByte = (current - predictPaeth(left, up, upLeft)) & 0xff;
    subRow[i] = subByte;
    paethRow[i] = paethByte;
    subScore += subByte < 128 ? subByte : 256 - subByte;
    paethScore += paethByte < 128 ? paethByte : 256 - paethByte;
  }

  const outOffset = row * (1 + rowBytes);
  if (paethScore <= subScore) {
    rawScanlines[outOffset] = 4;
    rawScanlines.set(paethRow, outOffset + 1);
  } else {
    rawScanlines[outOffset] = 1;
    rawScanlines.set(subRow, outOffset + 1);
  }
}

/** Encode an `rgbPixels` (`Uint8Array` of `width * height * 3` bytes) image into a compressed PNG `Buffer`. */
function encodeRgbPng(width, height, rgbPixels, sourceDigest) {
  const rowBytes = width * 3;
  const rawScanlines = Buffer.allocUnsafe(height * (1 + rowBytes));
  const subRow = new Uint8Array(rowBytes);
  const paethRow = new Uint8Array(rowBytes);

  for (let row = 0; row < height; row += 1) {
    filterPngScanline(rgbPixels, row, rowBytes, subRow, paethRow, rawScanlines);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel.
  ihdr[9] = 2; // Truecolor RGB (`image/png`).

  const compressed = deflateSync(rawScanlines, { level: 9 });
  const textChunkData = Buffer.from(`Comment\0svg-sha256=${sourceDigest}`, 'ascii');
  return Buffer.concat([
    PNG_SIGNATURE,
    packPngChunk('IHDR', ihdr),
    packPngChunk('tEXt', textChunkData),
    packPngChunk('IDAT', compressed),
    packPngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Parse XML attributes from an opening tag fragment into a plain record. */
function parseXmlAttrs(attrSource) {
  const attrs = {};
  for (const match of attrSource.matchAll(XML_ATTR_RX)) {
    if (match.groups?.name) {
      attrs[match.groups.name] = match.groups.value ?? '';
    }
  }
  return attrs;
}

/** Parse a `#RRGGBB` hex color into `[red, green, blue]` floats in `[0, 255]`. */
function parseHexColor(hexColor) {
  const cleaned = hexColor.replace('#', '').trim();
  const value = Number.parseInt(cleaned, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Parse a percentage or fraction string (e.g., `'85%'` or `'0.85'`) into `[0, 1]`. */
function parseUnitFraction(raw, fallback) {
  if (!raw) {
    return fallback;
  }
  return raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
}

/** Parse `<stop>` elements inside a gradient block body. */
function parseGradientStops(bodyMarkup) {
  const stops = [];
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

/** Parse `<linearGradient>` and `<radialGradient>` definitions from `svgMarkup`. */
function parseGradientDefs(svgMarkup) {
  const gradients = new Map();

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

/** Clamp `value` into `[minValue, maxValue]`. */
function clampRange(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

/** Interpolate `[red, green, blue, alpha]` along a 2-stop gradient at `position` in `[0, 1]`. */
function sampleGradientStops(stops, position) {
  const clamped = clampRange(position, 0, 1);
  const [first] = stops;
  const last = stops.at(-1);
  const span = Math.max(1e-6, last.offset - first.offset);
  const ratio = clampRange((clamped - first.offset) / span, 0, 1);
  return [
    first.color[0] + (last.color[0] - first.color[0]) * ratio,
    first.color[1] + (last.color[1] - first.color[1]) * ratio,
    first.color[2] + (last.color[2] - first.color[2]) * ratio,
    first.opacity + (last.opacity - first.opacity) * ratio,
  ];
}

/** Evaluate a paint spec (`#RRGGBB` or `url(#id)`) at normalized box coordinates `(unitX, unitY)`. */
function evaluatePaint(paintSpec, gradients, unitX, unitY) {
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

/** Alpha-composite `[red, green, blue, alpha]` onto `canvas` (`Float32Array`) at pixel index `pixelOffset`. */
function blendPixel(canvas, pixelOffset, red, green, blue, alpha) {
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
  pointX,
  pointY,
  centerX,
  centerY,
  halfWidth,
  halfHeight,
  radius
) {
  const clampedRadius = Math.min(radius, halfWidth, halfHeight);
  const offsetX = Math.abs(pointX - centerX) - (halfWidth - clampedRadius);
  const offsetY = Math.abs(pointY - centerY) - (halfHeight - clampedRadius);
  const outsideDist = Math.hypot(Math.max(offsetX, 0), Math.max(offsetY, 0));
  const insideDist = Math.min(Math.max(offsetX, offsetY), 0);
  return outsideDist + insideDist - clampedRadius;
}

/** Paint a `<rect>` primitive (solid or gradient fill plus optional 1px stroke) onto `canvas`. */
function paintRect(canvas, canvasWidth, canvasHeight, attrs, gradients) {
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

/** Convert an SVG elliptical arc segment into polyline points appended to `subpath`. */
function appendArcPoints(
  subpath,
  startX,
  startY,
  rawRx,
  rawRy,
  xAxisRotationDeg,
  largeArcFlag,
  sweepFlag,
  endX,
  endY
) {
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
  const rootSign = largeArcFlag === sweepFlag ? -1 : 1;
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
  if (!sweepFlag && deltaAngle > 0) {
    deltaAngle -= Math.PI * 2;
  } else if (sweepFlag && deltaAngle < 0) {
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
function appendQuadraticPoints(points, startX, startY, ctrlX, ctrlY, endX, endY, toPoint) {
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
  points,
  startX,
  startY,
  ctrl1X,
  ctrl1Y,
  ctrl2X,
  ctrl2Y,
  endX,
  endY,
  toPoint
) {
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

/** Execute one parameterized SVG path command (`M`, `L`, `H`, `V`, `Q`, `C`, `A`) against `state`. */
function stepSvgPathCommand(state, upper, baseX, baseY, readNumber, toPoint) {
  const targetPoints = state.currentSubpath?.points;
  switch (upper) {
    case 'M': {
      const nextX = baseX + readNumber();
      const nextY = baseY + readNumber();
      state.cursorX = nextX;
      state.cursorY = nextY;
      state.startX = nextX;
      state.startY = nextY;
      state.currentSubpath = { closed: false, points: [toPoint(nextX, nextY)] };
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
    case 'Q': {
      const ctrlX = baseX + readNumber();
      const ctrlY = baseY + readNumber();
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
      state.cursorX = endX;
      state.cursorY = endY;
      break;
    }
    case 'C': {
      const ctrl1X = baseX + readNumber();
      const ctrl1Y = baseY + readNumber();
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
      state.cursorX = endX;
      state.cursorY = endY;
      break;
    }
    case 'A': {
      const arcRx = readNumber();
      const arcRy = readNumber();
      const rotation = readNumber();
      const isLargeArc = readNumber() !== 0;
      const isSweep = readNumber() !== 0;
      const endX = baseX + readNumber();
      const endY = baseY + readNumber();
      const arcPoints = [];
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

/** Parse an SVG path `d` string into flattened subpaths (`Array<{ closed: boolean; points: [number, number][] }>`). */
function flattenSvgPath(pathData, offsetX = 0, offsetY = 0, scale = 1) {
  const tokens = pathData.match(PATH_TOKEN_RX) ?? [];
  const state = {
    command: '',
    currentSubpath: undefined,
    cursorX: 0,
    cursorY: 0,
    startX: 0,
    startY: 0,
    subpaths: [],
  };
  let index = 0;

  function toPoint(rawX, rawY) {
    return [offsetX + rawX * scale, offsetY + rawY * scale];
  }

  function readNumber() {
    const value = Number.parseFloat(tokens[index] ?? '0');
    index += 1;
    return value;
  }

  while (index < tokens.length) {
    const token = tokens[index] ?? '';
    let isCloseCommand = false;
    if (COMMAND_LETTER_RX.test(token)) {
      state.command = token;
      index += 1;
      if (token === 'Z' || token === 'z') {
        if (state.currentSubpath && state.currentSubpath.points.length > 0) {
          state.currentSubpath.closed = true;
          state.currentSubpath.points.push(toPoint(state.startX, state.startY));
        }
        state.cursorX = state.startX;
        state.cursorY = state.startY;
        isCloseCommand = true;
      }
    }
    if (!isCloseCommand) {
      const isRelative = state.command === state.command.toLowerCase();
      stepSvgPathCommand(
        state,
        state.command.toUpperCase(),
        isRelative ? state.cursorX : 0,
        isRelative ? state.cursorY : 0,
        readNumber,
        toPoint
      );
    }
  }

  return state.subpaths;
}

/** Append one directed non-horizontal edge `(x1, y1) -> (x2, y2)` to `edges`. */
function pushDirectedEdge(edges, x1, y1, x2, y2) {
  if (y1 !== y2) {
    edges.push(y1 < y2 ? { dir: 1, x1, x2, y1, y2 } : { dir: -1, x1: x2, x2: x1, y1: y2, y2: y1 });
  }
}

/** Collect directed scanline edges and bounding box from flattened `subpaths`. */
function collectFilledPathEdges(subpaths) {
  const edges = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const subpath of subpaths) {
    const { points } = subpath;
    if (points.length >= 2) {
      for (let i = 0; i < points.length - 1; i += 1) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[i + 1];
        minX = Math.min(minX, x1, x2);
        minY = Math.min(minY, y1, y2);
        maxX = Math.max(maxX, x1, x2);
        maxY = Math.max(maxY, y1, y2);
        pushDirectedEdge(edges, x1, y1, x2, y2);
      }
      const [firstPoint] = points;
      const lastPoint = points.at(-1);
      pushDirectedEdge(edges, lastPoint[0], lastPoint[1], firstPoint[0], firstPoint[1]);
    }
  }

  return { edges, maxX, maxY, minX, minY };
}

/** Accumulate non-zero winding supersample hits along horizontal sub-row `scanY` into `hitCounts`. */
function accumulateSubRowHits(edges, scanY, startCol, endCol, hitCounts, crossings) {
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
  canvas,
  canvasWidth,
  canvasHeight,
  pathData,
  fillColor,
  offsetX = 0,
  offsetY = 0
) {
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
  const crossings = [];

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

/** Squared distance from `(px, py)` to segment `(ax, ay) -> (bx, by)`. */
function distToSegmentSquared(px, py, ax, ay, bx, by) {
  const segDx = bx - ax;
  const segDy = by - ay;
  const segLenSq = segDx * segDx + segDy * segDy;
  if (segLenSq === 0) {
    return (px - ax) * (px - ax) + (py - ay) * (py - ay);
  }
  const proj = clampRange(((px - ax) * segDx + (py - ay) * segDy) / segLenSq, 0, 1);
  const nearX = ax + proj * segDx;
  const nearY = ay + proj * segDy;
  return (px - nearX) * (px - nearX) + (py - nearY) * (py - nearY);
}

/** Collect flattened line segments and bounding box from `<path>` elements inside a `<g>` group. */
function collectGroupSegments(groupBody, offsetX, offsetY, scale) {
  const segments = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const pathMatch of groupBody.matchAll(INNER_PATH_RX)) {
    const pathAttrs = parseXmlAttrs(pathMatch.groups?.attrs ?? '');
    for (const subpath of flattenSvgPath(pathAttrs.d ?? '', offsetX, offsetY, scale)) {
      const { points } = subpath;
      for (let i = 0; i < points.length - 1; i += 1) {
        const [ax, ay] = points[i];
        const [bx, by] = points[i + 1];
        segments.push([ax, ay, bx, by]);
        minX = Math.min(minX, ax, bx);
        minY = Math.min(minY, ay, by);
        maxX = Math.max(maxX, ax, bx);
        maxY = Math.max(maxY, ay, by);
      }
    }
  }

  return { maxX, maxY, minX, minY, segments };
}

/** Paint a stroked `<g>` icon group (round caps & joins) onto `canvas` using exact segment SDF. */
function paintStrokedGroup(canvas, canvasWidth, canvasHeight, groupAttrs, groupBody, gradients) {
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
function paintBodyPrimitive(canvas, width, height, match, gradients) {
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

/** Convert floating-point `canvas` RGB pixels into `4x4` Bayer-dithered `Uint8Array` bytes. */
function ditherCanvasToRgb(canvas, width, height) {
  const rgbPixels = new Uint8Array(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    const bayerRowOffset = (row & 3) * 4;
    for (let col = 0; col < width; col += 1) {
      const dither = BAYER_4X4[bayerRowOffset + (col & 3)] ?? 0;
      const offset = (row * width + col) * 3;
      rgbPixels[offset] = clampRange(Math.round((canvas[offset] ?? 0) + dither), 0, 255);
      rgbPixels[offset + 1] = clampRange(Math.round((canvas[offset + 1] ?? 0) + dither), 0, 255);
      rgbPixels[offset + 2] = clampRange(Math.round((canvas[offset + 2] ?? 0) + dither), 0, 255);
    }
  }
  return rgbPixels;
}

/** Rasterize `svgMarkup` (`width` x `height`) into a compressed PNG `Buffer`. */
function rasterizeOgSvgToPng(svgMarkup, width, height, sourceDigest) {
  const gradients = parseGradientDefs(svgMarkup);
  const canvas = new Float32Array(width * height * 3);
  const bodyMarkup = svgMarkup.replace(DEFS_BLOCK_RX, '');

  for (const match of bodyMarkup.matchAll(BODY_PRIMITIVE_RX)) {
    paintBodyPrimitive(canvas, width, height, match, gradients);
  }

  return encodeRgbPng(width, height, ditherCanvasToRgb(canvas, width, height), sourceDigest);
}

/** Bundle and evaluate `renderOgImageSvg()` from `src/site/seo.ts` via `esbuild` with externalized packages. */
async function evaluateLiveOgSvg() {
  const tempBundlePath = path.resolve(import.meta.dirname, '..', '.wrangler', 'og-eval.cjs');
  await mkdir(path.dirname(tempBundlePath), { recursive: true });
  await build({
    bundle: true,
    format: 'cjs',
    outfile: tempBundlePath,
    packages: 'external',
    platform: 'node',
    plugins: [
      {
        name: 'worker-module-loaders',
        setup(buildContext) {
          buildContext.onLoad({ filter: /\.(?:ttf|png)$/ }, (args) => ({
            contents: `const { readFileSync } = require('node:fs'); const raw = readFileSync(${JSON.stringify(args.path)}); module.exports = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);`,
            loader: 'js',
          }));
          buildContext.onLoad({ filter: /\.(?:css|client\.js)$/ }, async (args) => ({
            contents: await readFile(args.path, 'utf8'),
            loader: 'text',
          }));
        },
      },
    ],
    stdin: {
      contents:
        "export { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, renderOgImageSvg } from './src/site/seo.ts';",
      loader: 'ts',
      resolveDir: path.resolve(import.meta.dirname, '..'),
    },
    target: 'node24',
    tsconfig: 'tsconfig.json',
  });

  try {
    const requireModule = createRequire(import.meta.url);
    return requireModule(tempBundlePath);
  } finally {
    await rm(tempBundlePath, { force: true });
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render `src/assets/og.png` directly from `renderOgImageSvg()`, skipping rasterization when its SHA-256 matches.
 */
export async function buildOgImagePng() {
  const { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, renderOgImageSvg } = await evaluateLiveOgSvg();
  const svgMarkup = renderOgImageSvg();
  const sourceDigest = createHash('sha256').update(svgMarkup).digest('hex');
  const expectedMarker = Buffer.from(`Comment\0svg-sha256=${sourceDigest}`, 'ascii');

  try {
    const existingBuffer = await readFile(OG_PNG_OUTPUT_PATH);
    if (existingBuffer.includes(expectedMarker)) {
      return;
    }
  } catch {
    // `og.png` does not exist yet on a clean checkout.
  }

  const pngBuffer = rasterizeOgSvgToPng(svgMarkup, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, sourceDigest);
  await writeFile(OG_PNG_OUTPUT_PATH, pngBuffer);
}
