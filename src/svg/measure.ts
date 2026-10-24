/**
 * Text measurement & vector path rendering – Exact OpenType glyph outline measurement and `<path>` generation from bundled `.ttf` fonts.
 *
 * Each distinct text and typography combination is laid out once at the `(0, 0)` baseline;
 * Its ink bounds and serialized outline are cached (LRU) and positioned with `transform="translate(…)"`.
 * Probe measurements used while wrapping and truncating go through uncached helpers, and one-off text
 * is rendered with `isUncached`, so neither ever evicts hot entries.
 */

import { parse as parseFont } from 'opentype.js';
import type { Font, Glyph, Path, PathCommand, RenderOptions } from 'opentype.js';
import geistMediumBuffer from '@/assets/fonts/Geist-Medium.ttf';
import geistSemiBoldBuffer from '@/assets/fonts/Geist-SemiBold.ttf';
import geistSemiBoldItalicBuffer from '@/assets/fonts/Geist-SemiBoldItalic.ttf';
import jetBrainsMonoBoldBuffer from '@/assets/fonts/JetBrainsMono-Bold.ttf';
import jetBrainsMonoRegularBuffer from '@/assets/fonts/JetBrainsMono-Regular.ttf';
import {
  BADGE_FONT_SIZE,
  createLruCache,
  readLruCache,
  roundCoord,
  writeLruCache,
} from '@/svg/shared';
import type { GlyphLineLayout, PositionedCharGlyph, TypingFont } from '@/types';

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

/** Composite OpenType path and ink metrics built per character with cross-font glyph fallback. */
interface FallbackPathLayout {
  /** Combined OpenType path at the `(0, 0)` baseline. */
  combinedPath: Path;
  /** Measured ink bounding box metrics. */
  metrics: InkMetrics;
}

/** Lazily parsed proportional and monospace `Font` singletons. */
interface FontSingletons {
  /** Proportional bold italic font instance. */
  italic?: Font;
  /** Proportional regular/medium font instance. */
  medium?: Font;
  /** Monospace bold font instance. */
  monoBold?: Font;
  /** Monospace regular font instance. */
  monoRegular?: Font;
  /** Proportional bold font instance. */
  semiBold?: Font;
}

/** Resolved OpenType `Font`, `Glyph`, and effective font family for a single character. */
interface ResolvedFontGlyph {
  /** Unicode character code point string. */
  char: string;
  /** Effective font family after `.notdef` fallback. */
  font: Font;
  /** Effective font family key. */
  fontKey: TypingFont;
  /** OpenType glyph instance (`index === 0` when missing in both fonts). */
  glyph: Glyph;
}

/** Options for `renderTextPathMarkup`. */
interface TextPathOptions {
  /** Horizontal alignment mode (defaults to `'center'`). */
  align?: 'center' | 'left';
  /** Target horizontal X coordinate (`centerX` when `align === 'center'`, `visualStartX` when `align === 'left'`). */
  anchorX: number;
  /** Target vertical baseline Y coordinate in pixels. */
  baselineY: number;
  /** SVG `fill` color string. */
  fill: string;
  /** Optional font family (defaults to `'sans'`). */
  font?: TypingFont;
  /** Font size in pixels. */
  fontSize: number;
  /** Whether to use the bold font weight. */
  isBold?: boolean;
  /** Whether to use the bold italic font style. */
  isItalic?: boolean;
  /**
   * Whether to lay the text out without reading or writing the shared outline cache (used for one-off
   * wrapped text so it never evicts hot entries; Defaults to `false`).
   */
  isUncached?: boolean;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default OpenType layout options (`kerning: true`, slight `-0.01em` UI tracking). */
const PATH_OPTIONS: RenderOptions = { kerning: true, letterSpacing: -0.01 };

/** OpenType layout options for monospace fonts (no kerning or tracking). */
const MONO_PATH_OPTIONS: RenderOptions = { kerning: false };

/** Half of the proportional font's cap-height-to-em ratio, used for vertical baseline centering. */
const HALF_CAP_HEIGHT_RATIO = 0.355;

/** Maximum number of entries in the in-memory `TextOutline` cache per Worker isolate. */
const MAX_OUTLINE_CACHE_SIZE = 512;

/**
 * Maximum summed `pathData` length in UTF-16 code units of the `TextOutline` cache; Long labels of
 * complex glyphs serialize to tens of thousands of code units, so entry count alone cannot bound memory.
 */
const MAX_OUTLINE_CACHE_WEIGHT = 4_000_000;

/** Maximum text length in UTF-16 code units whose outline is cached (longer strings are laid out per request). */
const MAX_CACHED_TEXT_LENGTH = 128;

/** Lazily parsed OpenType `Font` singletons. */
const FONT_SINGLETONS: FontSingletons = {};

/** Bounded LRU cache of laid-out text outlines, weighted by serialized path size. */
const OUTLINE_CACHE = createLruCache<TextOutline>(
  MAX_OUTLINE_CACHE_SIZE,
  (outline) => outline.pathData.length,
  MAX_OUTLINE_CACHE_WEIGHT
);

/** Maximum number of single-character glyph outlines cached per Worker isolate. */
const MAX_GLYPH_CACHE_SIZE = 1024;

/** Maximum summed `pathData` length in UTF-16 code units of the single-glyph outline cache. */
const MAX_GLYPH_CACHE_WEIGHT = 1_000_000;

/** Bounded LRU cache of serialized single-glyph path data at `(0, 0)`. */
const GLYPH_OUTLINE_CACHE = createLruCache<string>(
  MAX_GLYPH_CACHE_SIZE,
  (pathData) => pathData.length,
  MAX_GLYPH_CACHE_WEIGHT
);

// -------------------------------------- INTERNALS --------------------------------------

/** Parse a monospace `.ttf` binary and strip `GSUB` so `opentype.js` never runs unsupported contextual ligature lookups. */
function parseMonoFont(buffer: ArrayBuffer): Font {
  const font = parseFont(buffer);
  font.tables.gsub = undefined;
  return font;
}

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

/** Return the lazily initialized JetBrains Mono `Font` instance for the requested weight. */
function resolveMonoFont(isBold: boolean): Font {
  if (isBold) {
    FONT_SINGLETONS.monoBold ??= parseMonoFont(jetBrainsMonoBoldBuffer);
    return FONT_SINGLETONS.monoBold;
  }
  FONT_SINGLETONS.monoRegular ??= parseMonoFont(jetBrainsMonoRegularBuffer);
  return FONT_SINGLETONS.monoRegular;
}

/** Return the lazily initialized `Font` instance for the requested family, weight, and style. */
function resolveFontFamily(fontFamily: TypingFont, isBold: boolean, isItalic = false): Font {
  return fontFamily === 'mono' ? resolveMonoFont(isBold) : resolveGeistFont(isBold, isItalic);
}

/** Resolve the OpenType `Glyph` for `char`, falling back across bundled font families when a glyph is missing. */
function resolveFontGlyph(
  char: string,
  fontFamily: TypingFont,
  isBold: boolean,
  isItalic = false
): ResolvedFontGlyph {
  const primaryFont = resolveFontFamily(fontFamily, isBold, isItalic);
  const primaryGlyph = primaryFont.charToGlyph(char);
  if (primaryGlyph.index !== 0) {
    return { char, font: primaryFont, fontKey: fontFamily, glyph: primaryGlyph };
  }
  const fallbackFamily: TypingFont = fontFamily === 'mono' ? 'sans' : 'mono';
  const fallbackFont = resolveFontFamily(fallbackFamily, isBold, isItalic);
  const fallbackGlyph = fallbackFont.charToGlyph(char);
  if (fallbackGlyph.index !== 0) {
    return { char, font: fallbackFont, fontKey: fallbackFamily, glyph: fallbackGlyph };
  }
  return { char, font: primaryFont, fontKey: fontFamily, glyph: primaryGlyph };
}

/** Resolve every Unicode character of `text` to its OpenType `Glyph` and fallback font family. */
function resolveFontGlyphs(
  text: string,
  fontFamily: TypingFont,
  isBold: boolean,
  isItalic = false
): ResolvedFontGlyph[] {
  const resolvedList: ResolvedFontGlyph[] = [];
  for (const char of text) {
    resolvedList.push(resolveFontGlyph(char, fontFamily, isBold, isItalic));
  }
  return resolvedList;
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

/** Compute or retrieve the cached SVG `<path>` `d` outline of a single glyph at `(0, 0)`. */
function getGlyphPathData(
  resolved: ResolvedFontGlyph,
  fontSize: number,
  isBold: boolean,
  isItalic = false
): string {
  if (resolved.glyph.index === 0) {
    return '';
  }
  const cacheKey = `${resolved.fontKey}|${isBold ? 1 : 0}|${isItalic ? 1 : 0}|${fontSize}|${resolved.glyph.index}`;
  const cached = readLruCache(GLYPH_OUTLINE_CACHE, cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const pathData = serializePathCommands(resolved.glyph.getPath(0, 0, fontSize).commands);
  writeLruCache(GLYPH_OUTLINE_CACHE, cacheKey, pathData);
  return pathData;
}

/** Compute the ink metrics of a laid-out path (advance width for whitespace-only text). */
function computeInkMetrics(
  path: Path,
  font: Font,
  text: string,
  fontSize: number,
  options: RenderOptions = PATH_OPTIONS
): InkMetrics {
  const isEmpty = path.commands.length === 0;
  const bbox = path.getBoundingBox();
  const rawWidth = isEmpty
    ? font.getAdvanceWidth(text, fontSize, options)
    : Math.max(0, bbox.x2 - bbox.x1);
  return { isEmpty, width: roundCoord(rawWidth), x1: bbox.x1, x2: bbox.x2 };
}

/** Compute the horizontal advance in pixels of `resolved` (including `sans` tracking and pair kerning to `nextResolved`). */
function computeGlyphStepAdvance(
  resolved: ResolvedFontGlyph,
  nextResolved: ResolvedFontGlyph | undefined,
  fontSize: number
): number {
  if (resolved.glyph.index === 0) {
    return 0;
  }
  const scale = fontSize / resolved.font.unitsPerEm;
  const tracking = resolved.fontKey === 'mono' ? 0 : (PATH_OPTIONS.letterSpacing ?? 0) * fontSize;
  let stepAdvance = (resolved.glyph.advanceWidth ?? 0) * scale + tracking;
  if (
    nextResolved &&
    resolved.fontKey === 'sans' &&
    nextResolved.fontKey === 'sans' &&
    nextResolved.glyph.index !== 0
  ) {
    stepAdvance += resolved.font.getKerningValue(resolved.glyph, nextResolved.glyph) * scale;
  }
  return Math.max(0, stepAdvance);
}

/** Check whether `text` contains any character missing (`.notdef`, `index === 0`) in `font`. */
function hasMissingGlyphInFont(font: Font, text: string): boolean {
  for (const char of text) {
    if (font.charToGlyph(char).index === 0) {
      return true;
    }
  }
  return false;
}

/** Lay out a composite path per character with cross-font glyph fallback and `.notdef` suppression, without serializing path commands. */
function layoutFallbackPath(
  text: string,
  primaryFont: Font,
  fontSize: number,
  isBold: boolean,
  isItalic: boolean,
  fontFamily: TypingFont
): FallbackPathLayout {
  const combinedPath = primaryFont.getPath('', 0, 0, fontSize);
  const resolvedList = resolveFontGlyphs(text, fontFamily, isBold, isItalic);

  let cursorX = 0;
  for (const [i, resolved] of resolvedList.entries()) {
    if (resolved.glyph.index !== 0) {
      const charPath = resolved.glyph.getPath(cursorX, 0, fontSize);
      for (const command of charPath.commands) {
        combinedPath.commands.push(command);
      }
    }
    cursorX += computeGlyphStepAdvance(resolved, resolvedList[i + 1], fontSize);
  }

  const isEmpty = combinedPath.commands.length === 0;
  const bbox = combinedPath.getBoundingBox();
  const rawWidth = isEmpty ? cursorX : Math.max(0, bbox.x2 - bbox.x1);
  return {
    combinedPath,
    metrics: { isEmpty, width: roundCoord(rawWidth), x1: bbox.x1, x2: bbox.x2 },
  };
}

/** Build a composite `TextOutline` per character with cross-font glyph fallback and `.notdef` suppression. */
function buildFallbackTextOutline(
  text: string,
  primaryFont: Font,
  fontSize: number,
  isBold: boolean,
  isItalic: boolean,
  fontFamily: TypingFont
): TextOutline {
  const { combinedPath, metrics } = layoutFallbackPath(
    text,
    primaryFont,
    fontSize,
    isBold,
    isItalic,
    fontFamily
  );
  return { ...metrics, pathData: serializePathCommands(combinedPath.commands) };
}

/** Lay out `text` at the `(0, 0)` baseline and serialize its outline (uncached). */
function buildTextOutline(
  text: string,
  fontSize: number,
  isBold: boolean,
  isItalic: boolean,
  fontFamily: TypingFont = 'sans'
): TextOutline {
  const font = resolveFontFamily(fontFamily, isBold, isItalic);
  if (hasMissingGlyphInFont(font, text)) {
    return buildFallbackTextOutline(text, font, fontSize, isBold, isItalic, fontFamily);
  }
  const options = fontFamily === 'mono' ? MONO_PATH_OPTIONS : PATH_OPTIONS;
  const path = font.getPath(text, 0, 0, fontSize, options);
  return {
    ...computeInkMetrics(path, font, text, fontSize, options),
    pathData: serializePathCommands(path.commands),
  };
}

/** Compute or retrieve the cached, serialized outline of `text` at the `(0, 0)` baseline. */
function getTextOutline(
  text: string,
  fontSize: number,
  isBold: boolean,
  isItalic: boolean,
  fontFamily: TypingFont = 'sans'
): TextOutline {
  if (text.length > MAX_CACHED_TEXT_LENGTH) {
    return buildTextOutline(text, fontSize, isBold, isItalic, fontFamily);
  }
  const cacheKey = `${fontFamily === 'mono' ? 1 : 0}|${fontSize}|${isBold ? 1 : 0}|${isItalic ? 1 : 0}|${text}`;
  const cached = readLruCache(OUTLINE_CACHE, cacheKey);
  if (cached) {
    return cached;
  }
  const outline = buildTextOutline(text, fontSize, isBold, isItalic, fontFamily);
  writeLruCache(OUTLINE_CACHE, cacheKey, outline);
  return outline;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Calculate the exact visible pixel ink width (`bbox.x2 - bbox.x1`) of a text string (cached).
 * @param text         Text string to measure.
 * @param fontSize     Font size in pixels (defaults to `BADGE_FONT_SIZE`).
 * @param isBold       Whether the text is rendered with the bold font weight.
 * @param isItalic     Whether the text is rendered with the italic font style.
 * @param fontFamily   Font family (defaults to `'sans'`).
 * @returns Exact visible ink width in pixels (rounded to 2 decimal places).
 */
export function measureTextWidth(
  text: string,
  fontSize = BADGE_FONT_SIZE,
  isBold = false,
  isItalic = false,
  fontFamily: TypingFont = 'sans'
): number {
  if (text.length === 0) {
    return 0;
  }
  return getTextOutline(text, fontSize, isBold, isItalic, fontFamily).width;
}

/**
 * Calculate the exact visible pixel ink width of a text string without touching the outline cache.
 * Used for throwaway probe strings (e.g., binary-search truncation candidates) that are never rendered.
 * @param text       Text string to measure.
 * @param fontSize   Font size in pixels.
 * @param isBold     Whether the text is rendered with the bold font weight.
 * @param isItalic   Whether the text is rendered with the italic font style.
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
  if (hasMissingGlyphInFont(font, text)) {
    return layoutFallbackPath(text, font, fontSize, isBold, isItalic, 'sans').metrics.width;
  }
  return computeInkMetrics(font.getPath(text, 0, 0, fontSize, PATH_OPTIONS), font, text, fontSize)
    .width;
}

/**
 * Calculate the typographic advance width (including side bearings and tracking) of a text string.
 * Much cheaper than an ink measurement because no glyph outlines are built; Advances of adjacent
 * words and spaces add up, which makes it suitable for incremental line wrapping estimates.
 * @param text       Text string to measure.
 * @param fontSize   Font size in pixels.
 * @param isBold     Whether the text is rendered with the bold font weight.
 * @param isItalic   Whether the text is rendered with the italic font style.
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
 * Render a text string directly as an SVG `<path>` vector outline.
 * Aligns the path using its exact analytical Bezier bounding box (`x1`–`x2`) so horizontal centering or
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
  const fontFamily = options.font ?? 'sans';
  const outline = options.isUncached
    ? buildTextOutline(text, fontSize, isBold, isItalic, fontFamily)
    : getTextOutline(text, fontSize, isBold, isItalic, fontFamily);
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
 * Resolve a single character's glyph outline at `(0, 0)` and its advance width in pixels.
 * @param char         Single character to lay out.
 * @param fontSize     Font size in pixels.
 * @param isBold       Whether to use the bold font weight.
 * @param fontFamily   Font family identifier.
 * @returns Positioned character glyph at `glyphX = 0`.
 */
export function resolveCharGlyph(
  char: string,
  fontSize: number,
  isBold: boolean,
  fontFamily: TypingFont
): PositionedCharGlyph {
  const resolved = resolveFontGlyph(char, fontFamily, isBold);
  return {
    advance: roundCoord(computeGlyphStepAdvance(resolved, undefined, fontSize)),
    char,
    glyphX: 0,
    pathData: getGlyphPathData(resolved, fontSize, isBold),
  };
}

/**
 * Lay out a string character-by-character with pair kerning, returning each character's baseline `glyphX`
 * offset, advance width, and cached `(0, 0)` outline `<path>` data.
 * @param text         Text string to lay out.
 * @param fontSize     Font size in pixels.
 * @param isBold       Whether to use the bold font weight.
 * @param fontFamily   Font family identifier.
 * @returns Per-character glyph positions and total advance width in pixels.
 */
export function layoutTextGlyphs(
  text: string,
  fontSize: number,
  isBold: boolean,
  fontFamily: TypingFont
): GlyphLineLayout {
  if (text.length === 0) {
    return { glyphs: [], totalAdvance: 0 };
  }
  const resolvedList = resolveFontGlyphs(text, fontFamily, isBold);
  const glyphs: PositionedCharGlyph[] = [];
  let cursorX = 0;

  for (const [i, resolved] of resolvedList.entries()) {
    const clampedAdvance = computeGlyphStepAdvance(resolved, resolvedList[i + 1], fontSize);
    glyphs.push({
      advance: roundCoord(clampedAdvance),
      char: resolved.char,
      glyphX: roundCoord(cursorX),
      pathData: getGlyphPathData(resolved, fontSize, isBold),
    });
    cursorX += clampedAdvance;
  }

  return { glyphs, totalAdvance: roundCoord(Math.max(0, cursorX)) };
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
