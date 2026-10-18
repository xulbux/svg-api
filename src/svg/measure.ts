/**
 * Text measurement & vector path rendering – Exact OpenType glyph outline measurement and `<path>` generation using bundled Geist Sans `.ttf` binaries (`500` Medium, `600` SemiBold, `600` SemiBold Italic).
 */

import opentype, { type Font, type PathCommand, type RenderOptions } from 'opentype.js';
import geistMediumBuffer from '@/assets/fonts/Geist-Medium.ttf';
import geistSemiBoldBuffer from '@/assets/fonts/Geist-SemiBold.ttf';
import geistSemiBoldItalicBuffer from '@/assets/fonts/Geist-SemiBoldItalic.ttf';

// ---------------------------------------- TYPES ----------------------------------------

/** Cached analytical ink bounding box metrics for a text string at `(0, 0)` baseline. */
interface TextInkMetrics {
  /** Whether the path contains zero visible contours (e.g. empty or whitespace-only text). */
  isEmpty: boolean;
  /** Visible ink width (`x2 - x1`) or advance width for whitespace-only strings. */
  width: number;
  /** Leftmost visible ink X coordinate relative to `x = 0` origin. */
  x1: number;
  /** Rightmost visible ink X coordinate relative to `x = 0` origin. */
  x2: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default OpenType layout options (`kerning: true`, slight `-0.01em` UI tracking). */
const PATH_OPTIONS: RenderOptions = { kerning: true, letterSpacing: -0.01 };

/** Ratio of Geist Sans cap-height (`710 / 1000`) to `fontSize`, halved (`0.355`) for vertical baseline centering. */
const HALF_CAP_HEIGHT_RATIO = 0.355;

/** Maximum number of entries in the in-memory `TextInkMetrics` cache per Worker isolate. */
const MAX_METRICS_CACHE_SIZE = 512;

// -------------------------------------- INTERNALS --------------------------------------

/** Lazily parsed Geist Sans `Font` singletons (`500` Medium, `600` SemiBold, `600` SemiBold Italic). */
const fontSingletons: { italic?: Font; medium?: Font; semiBold?: Font } = {};

/** Bounded in-memory lookup cache mapping `text|fontSize|bold|italic` to `TextInkMetrics`. */
const metricsCache = new Map<string, TextInkMetrics>();

/** Return the lazily initialized Geist Sans `Font` instance for the requested weight and style. */
function resolveGeistFont(isBold: boolean, isItalic: boolean): Font {
  if (isItalic) {
    fontSingletons.italic ??= opentype.parse(geistSemiBoldItalicBuffer);
    return fontSingletons.italic;
  }
  if (isBold) {
    fontSingletons.semiBold ??= opentype.parse(geistSemiBoldBuffer);
    return fontSingletons.semiBold;
  }
  fontSingletons.medium ??= opentype.parse(geistMediumBuffer);
  return fontSingletons.medium;
}

/** Round a numeric coordinate to at most 2 decimal places (`15` instead of `15.00`). */
function fmtCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Serialize an array of OpenType `PathCommand` objects into a compact, NaN-free SVG `d` string. */
function serializePathCommands(commands: readonly PathCommand[]): string {
  let d = '';
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M': {
        d += `M${fmtCoord(cmd.x)} ${fmtCoord(cmd.y)}`;
        break;
      }
      case 'L': {
        d += `L${fmtCoord(cmd.x)} ${fmtCoord(cmd.y)}`;
        break;
      }
      case 'Q': {
        d += `Q${fmtCoord(cmd.x1)} ${fmtCoord(cmd.y1)} ${fmtCoord(cmd.x)} ${fmtCoord(cmd.y)}`;
        break;
      }
      case 'C': {
        d += `C${fmtCoord(cmd.x1)} ${fmtCoord(cmd.y1)} ${fmtCoord(cmd.x2)} ${fmtCoord(cmd.y2)} ${fmtCoord(cmd.x)} ${fmtCoord(cmd.y)}`;
        break;
      }
      case 'Z': {
        d += 'Z';
        break;
      }
      default: {
        break;
      }
    }
  }
  return d;
}

/** Compute or retrieve cached analytical ink bounds (`x1`, `x2`, `width`) for `text` at `(0, 0)`. */
function getTextInkMetrics(
  text: string,
  fontSize: number,
  isBold: boolean,
  isItalic: boolean
): TextInkMetrics {
  const cacheKey = `${text}|${fontSize}|${isBold ? 1 : 0}|${isItalic ? 1 : 0}`;
  const cached = metricsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const font = resolveGeistFont(isBold, isItalic);
  const path = font.getPath(text, 0, 0, fontSize, PATH_OPTIONS);
  const isEmpty = path.commands.length === 0;
  const bbox = path.getBoundingBox();
  const rawWidth = isEmpty
    ? font.getAdvanceWidth(text, fontSize, PATH_OPTIONS)
    : Math.max(0, bbox.x2 - bbox.x1);

  const metrics: TextInkMetrics = { isEmpty, width: fmtCoord(rawWidth), x1: bbox.x1, x2: bbox.x2 };

  if (metricsCache.size >= MAX_METRICS_CACHE_SIZE) {
    metricsCache.clear();
  }
  metricsCache.set(cacheKey, metrics);
  return metrics;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Calculate the exact visible pixel ink width (`bbox.x2 - bbox.x1`) of a text string in Geist Sans.
 * @param text       Text string to measure.
 * @param fontSize   Font size in pixels (defaults to `11`).
 * @param isBold     Whether the text is rendered with semi-bold (`600`) weight.
 * @param isItalic   Whether the text is rendered with semi-bold italic (`600` italic) style.
 * @returns Exact visible ink width in pixels (rounded to 2 decimal places).
 */
export function measureTextWidth(
  text: string,
  fontSize = 11,
  isBold = false,
  isItalic = false
): number {
  if (text.length === 0) {
    return 0;
  }
  return getTextInkMetrics(text, fontSize, isBold, isItalic).width;
}

/**
 * Render a text string directly as an SVG `<path d="..." fill="..." />` vector outline in Geist Sans.
 * Aligns the path using its exact analytical Bezier bounding box (`x1..x2`) so horizontal centering or
 * left-alignment has `0.00px` sidebearing error on every operating system and browser.
 * @param text       Raw unescaped text string to convert to an SVG `<path>`.
 * @param anchorX    Target horizontal X coordinate (`centerX` when `align === 'center'`, `visualStartX` when `align === 'left'`).
 * @param baselineY  Target vertical baseline Y coordinate in pixels.
 * @param fontSize   Font size in pixels.
 * @param fill       SVG `fill` color string.
 * @param isBold     Whether to use Geist Sans SemiBold (`600`) instead of Medium (`500`).
 * @param isItalic   Whether to use Geist Sans SemiBold Italic (`600` italic).
 * @param align      Horizontal alignment mode (`'center'` or `'left'`, defaults to `'center'`).
 * @returns `<path d="..." fill="..." />` SVG string, or `''` if `text` has no visible contours.
 */
export function renderTextPathMarkup(
  text: string,
  anchorX: number,
  baselineY: number,
  fontSize: number,
  fill: string,
  isBold = false,
  isItalic = false,
  align: 'center' | 'left' = 'center'
): string {
  if (text.length === 0) {
    return '';
  }
  const metrics = getTextInkMetrics(text, fontSize, isBold, isItalic);
  if (metrics.isEmpty) {
    return '';
  }
  const originX =
    align === 'center'
      ? fmtCoord(anchorX - (metrics.x1 + metrics.x2) / 2)
      : fmtCoord(anchorX - metrics.x1);
  const y = fmtCoord(baselineY);
  const font = resolveGeistFont(isBold, isItalic);
  const pathData = serializePathCommands(
    font.getPath(text, originX, y, fontSize, PATH_OPTIONS).commands
  );
  return pathData.length > 0 ? `<path d="${pathData}" fill="${fill}" />` : '';
}

/**
 * Compute the vertically centered cap-height baseline Y coordinate for a container of `height` pixels.
 * @param height     Total vertical container height in pixels.
 * @param fontSize   Font size in pixels.
 * @returns Baseline Y coordinate where the cap-height midpoint sits at `height / 2`.
 */
export function computeCenteredBaselineY(height: number, fontSize: number): number {
  return fmtCoord(height / 2 + fontSize * HALF_CAP_HEIGHT_RATIO);
}
