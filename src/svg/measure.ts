/**
 * Text measurement & vector path rendering – Exact OpenType glyph outline measurement and `<path>` generation using bundled Geist Sans `.ttf` binaries (`500` Medium, `600` SemiBold, `600` SemiBold Italic).
 *
 * Each distinct `text|fontSize|weight|style` combination is laid out once at the `(0, 0)` baseline;
 * Its ink bounds and serialized outline are cached (LRU) and positioned with `transform="translate(…)"`.
 * Probe measurements used while wrapping and truncating go through uncached helpers, and one-off text
 * (quote lines and authors) is rendered with `isUncached`, so neither ever evicts hot entries.
 */

import { parse as parseFont } from 'opentype.js';
import type { Font, Path, PathCommand, RenderOptions } from 'opentype.js';
import geistMediumBuffer from '@/assets/fonts/Geist-Medium.ttf';
import geistSemiBoldBuffer from '@/assets/fonts/Geist-SemiBold.ttf';
import geistSemiBoldItalicBuffer from '@/assets/fonts/Geist-SemiBoldItalic.ttf';
import { BADGE_FONT_SIZE, createLruCache, readLruCache, writeLruCache } from '@/svg/shared';

// ---------------------------------------- TYPES ----------------------------------------

/** Ink bounding box metrics of a text string laid out at the `(0, 0)` baseline. */
interface InkMetrics {
  /** Whether the path contains zero visible contours (e.g., empty or whitespace-only text). */
  isEmpty: boolean;
  /** Visible ink width (`x2 - x1`) or advance width for whitespace-only strings, in pixels. */
  width: number;
  /** Leftmost visible ink X coordinate relative to the `x = 0` origin. */
  x1: number;
  /** Rightmost visible ink X coordinate relative to the `x = 0` origin. */
  x2: number;
}

/** Cached ink metrics and serialized outline of a text string at the `(0, 0)` baseline. */
interface TextOutline extends InkMetrics {
  /** Serialized SVG path data at the `(0, 0)` baseline. */
  pathData: string;
}

/** Lazily parsed Geist Sans `Font` singletons. */
interface FontSingletons {
  /** Geist Sans `600` SemiBold Italic. */
  italic?: Font;
  /** Geist Sans `500` Medium. */
  medium?: Font;
  /** Geist Sans `600` SemiBold. */
  semiBold?: Font;
}

/** Options for `renderTextPathMarkup`. */
interface TextPathOptions {
  /** Horizontal alignment mode (`'center'` or `'left'`; Defaults to `'center'`). */
  align?: 'center' | 'left';
  /** Target horizontal X coordinate (`centerX` when `align === 'center'`, `visualStartX` when `align === 'left'`). */
  anchorX: number;
  /** Target vertical baseline Y coordinate in pixels. */
  baselineY: number;
  /** SVG `fill` color string. */
  fill: string;
  /** Font size in pixels. */
  fontSize: number;
  /** Whether to use Geist Sans SemiBold (`600`) instead of Medium (`500`). */
  isBold?: boolean;
  /** Whether to use Geist Sans SemiBold Italic (`600` italic). */
  isItalic?: boolean;
  /**
   * Whether to lay the text out without reading or writing the shared outline cache (one-off text such
   * as quote lines, which would otherwise evict hot badge labels; Defaults to `false`).
   */
  isUncached?: boolean;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default OpenType layout options (`kerning: true`, slight `-0.01em` UI tracking). */
const PATH_OPTIONS: RenderOptions = { kerning: true, letterSpacing: -0.01 };

/** Ratio of Geist Sans cap-height (`710 / 1000`) to `fontSize`, halved (`0.355`) for vertical baseline centering. */
const HALF_CAP_HEIGHT_RATIO = 0.355;

/** Maximum number of entries in the in-memory `TextOutline` cache per Worker isolate. */
const MAX_OUTLINE_CACHE_SIZE = 512;

/**
 * Maximum summed `pathData` length in UTF-16 code units of the `TextOutline` cache; One 128-character
 * label of complex glyphs at `28px` serializes to roughly `100k` code units, so the entry count alone
 * cannot bound the isolate's memory.
 */
const MAX_OUTLINE_CACHE_WEIGHT = 4_000_000;

/** Maximum text length in UTF-16 code units whose outline is cached (longer strings are laid out per request). */
const MAX_CACHED_TEXT_LENGTH = 128;

/** Lazily parsed Geist Sans `Font` singletons (`500` Medium, `600` SemiBold, `600` SemiBold Italic). */
const FONT_SINGLETONS: FontSingletons = {};

/** Bounded LRU cache mapping `text|fontSize|bold|italic` to `TextOutline`, weighted by serialized path size. */
const OUTLINE_CACHE = createLruCache<TextOutline>(
  MAX_OUTLINE_CACHE_SIZE,
  (outline) => outline.pathData.length,
  MAX_OUTLINE_CACHE_WEIGHT
);

// -------------------------------------- INTERNALS --------------------------------------

/** Return the lazily initialized Geist Sans `Font` instance for the requested weight and style. */
function resolveGeistFont(isBold: boolean, isItalic: boolean): Font {
  if (isItalic) {
    FONT_SINGLETONS.italic ??= parseFont(geistSemiBoldItalicBuffer);
    return FONT_SINGLETONS.italic;
  }
  if (isBold) {
    FONT_SINGLETONS.semiBold ??= parseFont(geistSemiBoldBuffer);
    return FONT_SINGLETONS.semiBold;
  }
  FONT_SINGLETONS.medium ??= parseFont(geistMediumBuffer);
  return FONT_SINGLETONS.medium;
}

/** Round a numeric coordinate to at most 2 decimal places (`15` instead of `15.00`). */
function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Serialize an array of OpenType `PathCommand` objects into a compact, NaN-free SVG `d` string. */
function serializePathCommands(commands: readonly PathCommand[]): string {
  let pathData = '';
  for (const command of commands) {
    switch (command.type) {
      case 'M':
      case 'L': {
        pathData += `${command.type}${roundCoord(command.x)} ${roundCoord(command.y)}`;
        break;
      }
      case 'Q': {
        pathData += `Q${roundCoord(command.x1)} ${roundCoord(command.y1)} ${roundCoord(command.x)} ${roundCoord(command.y)}`;
        break;
      }
      case 'C': {
        pathData += `C${roundCoord(command.x1)} ${roundCoord(command.y1)} ${roundCoord(command.x2)} ${roundCoord(command.y2)} ${roundCoord(command.x)} ${roundCoord(command.y)}`;
        break;
      }
      case 'Z': {
        pathData += 'Z';
        break;
      }
      default: {
        break;
      }
    }
  }
  return pathData;
}

/** Compute the ink metrics of a laid-out path (advance width for whitespace-only text). */
function computeInkMetrics(path: Path, font: Font, text: string, fontSize: number): InkMetrics {
  const isEmpty = path.commands.length === 0;
  const bbox = path.getBoundingBox();
  const rawWidth = isEmpty
    ? font.getAdvanceWidth(text, fontSize, PATH_OPTIONS)
    : Math.max(0, bbox.x2 - bbox.x1);
  return { isEmpty, width: roundCoord(rawWidth), x1: bbox.x1, x2: bbox.x2 };
}

/** Lay out `text` at the `(0, 0)` baseline and serialize its outline (uncached). */
function buildTextOutline(
  text: string,
  fontSize: number,
  isBold: boolean,
  isItalic: boolean
): TextOutline {
  const font = resolveGeistFont(isBold, isItalic);
  const path = font.getPath(text, 0, 0, fontSize, PATH_OPTIONS);
  return {
    ...computeInkMetrics(path, font, text, fontSize),
    pathData: serializePathCommands(path.commands),
  };
}

/** Compute or retrieve the cached, serialized outline of `text` at the `(0, 0)` baseline. */
function getTextOutline(
  text: string,
  fontSize: number,
  isBold: boolean,
  isItalic: boolean
): TextOutline {
  if (text.length > MAX_CACHED_TEXT_LENGTH) {
    return buildTextOutline(text, fontSize, isBold, isItalic);
  }
  const cacheKey = `${text}|${fontSize}|${isBold ? 1 : 0}|${isItalic ? 1 : 0}`;
  const cached = readLruCache(OUTLINE_CACHE, cacheKey);
  if (cached) {
    return cached;
  }
  const outline = buildTextOutline(text, fontSize, isBold, isItalic);
  writeLruCache(OUTLINE_CACHE, cacheKey, outline);
  return outline;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Calculate the exact visible pixel ink width (`bbox.x2 - bbox.x1`) of a text string in Geist Sans (cached).
 * @param text       Text string to measure.
 * @param fontSize   Font size in pixels (defaults to the `22px` badge font size, `BADGE_FONT_SIZE`).
 * @param isBold     Whether the text is rendered with semi-bold (`600`) weight.
 * @param isItalic   Whether the text is rendered with semi-bold italic (`600` italic) style.
 * @returns Exact visible ink width in pixels (rounded to 2 decimal places).
 */
export function measureTextWidth(
  text: string,
  fontSize = BADGE_FONT_SIZE,
  isBold = false,
  isItalic = false
): number {
  if (text.length === 0) {
    return 0;
  }
  return getTextOutline(text, fontSize, isBold, isItalic).width;
}

/**
 * Calculate the exact visible pixel ink width of a text string without touching the outline cache.
 * Used for throwaway probe strings (e.g., binary-search truncation candidates) that are never rendered.
 * @param text       Text string to measure.
 * @param fontSize   Font size in pixels.
 * @param isBold     Whether the text is rendered with semi-bold (`600`) weight.
 * @param isItalic   Whether the text is rendered with semi-bold italic (`600` italic) style.
 * @returns Exact visible ink width in pixels (rounded to 2 decimal places).
 */
export function measureTextWidthUncached(
  text: string,
  fontSize: number,
  isBold = false,
  isItalic = false
): number {
  if (text.length === 0) {
    return 0;
  }
  const font = resolveGeistFont(isBold, isItalic);
  return computeInkMetrics(font.getPath(text, 0, 0, fontSize, PATH_OPTIONS), font, text, fontSize)
    .width;
}

/**
 * Calculate the typographic advance width (including side bearings and tracking) of a text string.
 * Much cheaper than an ink measurement because no glyph outlines are built; Advances of adjacent
 * words and spaces add up, which makes it suitable for incremental line wrapping estimates.
 * @param text       Text string to measure.
 * @param fontSize   Font size in pixels.
 * @param isBold     Whether the text is rendered with semi-bold (`600`) weight.
 * @param isItalic   Whether the text is rendered with semi-bold italic (`600` italic) style.
 * @returns Advance width in pixels (unrounded).
 */
export function measureTextAdvance(
  text: string,
  fontSize: number,
  isBold = false,
  isItalic = false
): number {
  if (text.length === 0) {
    return 0;
  }
  return resolveGeistFont(isBold, isItalic).getAdvanceWidth(text, fontSize, PATH_OPTIONS);
}

/**
 * Render a text string directly as an SVG `<path>` vector outline in Geist Sans.
 * Aligns the path using its exact analytical Bezier bounding box (`x1..x2`) so horizontal centering or
 * left-alignment has `0.00px` sidebearing error on every operating system and browser.
 * @param text      Raw unescaped text string to convert to an SVG `<path>`.
 * @param options   Anchor position, baseline, font size, fill, weight/style, and alignment.
 * @returns `<path transform="…" d="…" fill="…" />` SVG string, or `''` if `text` has no visible contours.
 */
export function renderTextPathMarkup(text: string, options: TextPathOptions): string {
  if (text.length === 0) {
    return '';
  }
  const { align = 'center', anchorX, baselineY, fill, fontSize } = options;
  const isBold = options.isBold ?? false;
  const isItalic = options.isItalic ?? false;
  const outline = options.isUncached
    ? buildTextOutline(text, fontSize, isBold, isItalic)
    : getTextOutline(text, fontSize, isBold, isItalic);
  if (outline.isEmpty || outline.pathData.length === 0) {
    return '';
  }
  const originX =
    align === 'center'
      ? roundCoord(anchorX - (outline.x1 + outline.x2) / 2)
      : roundCoord(anchorX - outline.x1);
  return `<path transform="translate(${originX} ${roundCoord(baselineY)})" d="${outline.pathData}" fill="${fill}" />`;
}

/**
 * Compute the vertically centered cap-height baseline Y coordinate for a container of `height` pixels.
 * @param height     Total vertical container height in pixels.
 * @param fontSize   Font size in pixels.
 * @returns Baseline Y coordinate where the cap-height midpoint sits at `height / 2`.
 */
export function computeCenteredBaselineY(height: number, fontSize: number): number {
  return roundCoord(height / 2 + fontSize * HALF_CAP_HEIGHT_RATIO);
}
