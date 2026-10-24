/**
 * Quote card renderer – Renders Kumo 3D horizontal and vertical quote cards.
 */

import { WHITE } from '@/config/palette';
import { THEMES } from '@/config/theme';
import { measureTextAdvance, measureTextWidthUncached, renderTextPathMarkup } from '@/svg/measure';
import {
  ELLIPSIS,
  PRIMARY_FOREGROUND_OPACITY,
  buildThemeGradientId,
  clampInt,
  prepareDisplayText,
  renderKumoBoxSurface,
  renderSheenOverlay,
  renderSurfaceGradientDefs,
  renderSvgDocument,
  resolveForegroundColor,
  resolveScaledFontSize,
  resolveSurfaceTextColor,
  roundCoord,
  roundTenths,
  sliceAtCodePoint,
} from '@/svg/shared';
import type {
  AnimationMode,
  BadgeVariant,
  NumericRange,
  QuoteLayout,
  QuoteRenderOptions,
  SizePreset,
  ThemeColorName,
  ThemePalette,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Resolved typography and spacing dimensions for a quote card. */
interface QuoteMetrics {
  /** Author font size in pixels. */
  authorFontSize: number;
  /** Vertical space reserved for the author line in pixels. */
  authorSpace: number;
  /** Width of the vertical accent bar in horizontal layout in pixels. */
  barWidth: number;
  /** Quote body font size in pixels. */
  fontSize: number;
  /** Line height in pixels for wrapped quote lines. */
  lineHeight: number;
  /** Horizontal inner padding of vertical cards in pixels (horizontal cards are inset by their bar and watermark). */
  padX: number;
  /** Vertical inner padding in pixels. */
  padY: number;
  /** Scale factor for decorative quote mark icons (`24x24` coordinate space). */
  quoteIconScale: number;
  /** Outer corner radius in pixels. */
  radius: number;
}

/** Font size, weight, and style of a measured text run. */
interface TextStyle {
  /** Font size in pixels. */
  fontSize: number;
  /** Whether the text is rendered with the bold font weight. */
  isBold: boolean;
  /** Whether the text is rendered with the italic font style. */
  isItalic: boolean;
}

/** Typography and quote mark decoration used while wrapping quote lines. */
interface QuoteWrapContext {
  /** Quote body font size in pixels. */
  fontSize: number;
  /** Whether the text is rendered with the bold font weight. */
  isBold: boolean;
  /** Maximum rendered line width in pixels. */
  maxWidth: number;
  /** Opening quote mark rendered before the first line (`''` for none). */
  prefix: string;
  /** Closing quote mark rendered after the last line (`''` for none). */
  suffix: string;
}

/** Horizontal extent of the text column of a quote card. */
interface QuoteTextColumn {
  /** Maximum rendered line width in pixels. */
  maxWidth: number;
  /** X coordinate where left-aligned (horizontal) text starts. */
  startX: number;
}

/** Variant-dependent colors, font weight, and `<defs>` gradients of a quote card. */
interface QuoteStyleTokens {
  /** Author line color. */
  authorColor: string;
  /** `<defs>` gradient markup required by the card. */
  gradDefs: string;
  /** Whether the quote body uses the bold font weight. */
  isBoldText: boolean;
  /** Quote body text color. */
  textColor: string;
}

/** Fully resolved layout and style state shared by the quote surface and content renderers. */
interface QuoteCardContext {
  /** Author line color. */
  authorColor: string;
  /** Width-truncated author line including its leading dash (`''` when no author is given). */
  authorLine: string;
  /** Theme color token of the card accent. */
  color: ThemeColorName;
  /** Total card height in pixels. */
  height: number;
  /** Rendered size of a decorative quote mark icon in pixels. */
  iconBoxSize: number;
  /** Whether the quote body uses the bold font weight. */
  isBoldText: boolean;
  /** Card layout orientation. */
  layout: QuoteLayout;
  /** Wrapped quote body lines. */
  lines: readonly string[];
  /** Resolved typography and spacing dimensions. */
  metrics: QuoteMetrics;
  /** Resolved theme palette of `color`. */
  palette: ThemePalette;
  /** Total height of all wrapped lines in pixels (`lines.length * lineHeight`). */
  textBlockHeight: number;
  /** Quote body text color. */
  textColor: string;
  /** Horizontal extent of the text column. */
  textColumn: QuoteTextColumn;
  /** Card surface variant. */
  variant: BadgeVariant;
  /** Total card width in pixels. */
  width: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default quote card layout when layout parameters are omitted. */
export const DEFAULT_QUOTE_LAYOUT: QuoteLayout = 'horizontal';

/** Default typography size preset for horizontal quote cards. */
export const DEFAULT_HORIZONTAL_QUOTE_SIZE: SizePreset = 'md';

/** Default typography size preset for vertical centered quote cards. */
export const DEFAULT_VERTICAL_QUOTE_SIZE: SizePreset = 'lg';

/** Card width bounds in pixels (the default applies to horizontal cards). */
export const QUOTE_WIDTH_RANGE: NumericRange = { default: 560, max: 900, min: 240 };

/** Default card width in pixels for vertical centered quote cards. */
export const DEFAULT_VERTICAL_QUOTE_WIDTH = 380;

/** Custom numeric quote font size bounds in pixels. */
export const QUOTE_FONT_SIZE_RANGE: NumericRange = { default: 15, max: 28, min: 11 };

/** Maximum quote text and author length in UTF-16 code units before ellipsis truncation. */
export const MAX_QUOTE_TEXT_LENGTH = 1000;

/** Preset font sizes in pixels for named `SizePreset` tokens. */
export const QUOTE_SIZE_MAP: Readonly<Record<SizePreset, number>> = {
  lg: 17.5,
  md: 15,
  sm: 13.5,
  xl: 20,
};

/** Maximum number of wrapped text lines rendered in a quote card. */
const MAX_QUOTE_LINES = 10;

/** Placeholder quote rendered when the requested text has no visible words. */
const DEFAULT_QUOTE_TEXT = 'Always creating more cool stuff for you.';

/** Fraction of the font size within which an estimated (advance-based) line width is verified with an exact ink measurement. */
const WRAP_TOLERANCE_RATIO = 0.25;

/**
 * Conservative lower bound of a Geist glyph advance in em; The narrowest non-zero advance is `0.171em`
 * (italic apostrophe), so `0.15` leaves headroom for negative kerning and tracking.
 */
const MIN_GLYPH_ADVANCE_RATIO = 0.15;

/** Inner `24x24` SVG paths for double quotation marks. */
const QUOTE_MARK_PATHS =
  '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>';

/** Leftmost ink X coordinate of the stroked watermark quote marks in `24x24` units (path edge at `3` minus half the `2`-unit stroke). */
const QUOTE_MARK_INK_LEFT = 2;

/** Inset in pixels of the horizontal card decorations from the card edges (accent bar on the left, watermark on the right). */
const QUOTE_EDGE_INSET = 18;

/** Gap in pixels between the horizontal text column and its decorations (accent bar on the left, watermark ink on the right). */
const QUOTE_TEXT_GAP = 16;

/** Minimum X coordinate in pixels where horizontal card text starts. */
const MIN_QUOTE_TEXT_START_X = 34;

/** Vertical gap in pixels between the top quote mark and the first text line of vertical cards. */
const VERTICAL_MARK_TOP_GAP = 10;

/** Vertical gap in pixels between the text block and the bottom quote mark of vertical cards. */
const VERTICAL_MARK_BOTTOM_GAP = 14;

/** Vertical quote mark fill opacity by surface variant. */
const VERTICAL_QUOTE_OPACITY_BY_VARIANT: Readonly<Record<BadgeVariant, string>> = {
  '1': '0.74',
  '2': '0.78',
  '3': '0.52',
};

/** Watermark stroke opacity by surface variant. */
const WATERMARK_OPACITY_BY_VARIANT: Readonly<Record<BadgeVariant, string>> = {
  '1': '0.20',
  '2': '0.16',
  '3': '0.12',
};

/** Opening quote mark prepended to the first line of horizontal quote cards. */
const OPENING_QUOTE_MARK = '“';

/** Closing quote mark appended to the last line of horizontal quote cards. */
const CLOSING_QUOTE_MARK = '”';

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches one or more whitespace characters for word splitting. */
const WORD_SPLIT_RX = /\s+/;

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve `QuoteMetrics` from the requested `size` option and `layout`. */
function resolveQuoteMetrics(
  sizeOption: SizePreset | number | undefined,
  layout: QuoteLayout
): QuoteMetrics {
  const defaultPreset: SizePreset =
    layout === 'vertical' ? DEFAULT_VERTICAL_QUOTE_SIZE : DEFAULT_HORIZONTAL_QUOTE_SIZE;
  const fontSize = resolveScaledFontSize(
    sizeOption,
    QUOTE_SIZE_MAP,
    QUOTE_FONT_SIZE_RANGE,
    defaultPreset
  );

  const scale = fontSize / 15;
  return {
    authorFontSize: roundTenths(fontSize * 0.84),
    authorSpace: Math.round(28 * scale),
    barWidth: roundTenths(Math.max(3, 3.5 * scale)),
    fontSize,
    lineHeight: Math.round(fontSize * 1.56),
    padX: Math.round(36 * scale),
    padY: Math.round((layout === 'vertical' ? 30 : 21) * scale),
    quoteIconScale: roundCoord(1.05 * scale),
    radius: Math.max(10, Math.round(11 * scale)),
  };
}

/** Compute the X coordinate of the top-right watermark quote marks of a horizontal card (inset like the accent bar). */
function computeWatermarkX(width: number, iconBoxSize: number): number {
  return Math.round(width - iconBoxSize - QUOTE_EDGE_INSET);
}

/**
 * Compute the text column of a quote card. Vertical cards center text between symmetric `padX` insets;
 * Horizontal cards keep the same `QUOTE_TEXT_GAP` to the accent bar on the left and to the watermark
 * ink on the right, so no line (including the first, which shares the watermark's rows) ever runs under it.
 */
function computeQuoteTextColumn(
  layout: QuoteLayout,
  width: number,
  metrics: QuoteMetrics,
  iconBoxSize: number
): QuoteTextColumn {
  if (layout === 'vertical') {
    return { maxWidth: width - metrics.padX * 2, startX: metrics.padX };
  }
  const startX = Math.max(
    MIN_QUOTE_TEXT_START_X,
    Math.round(QUOTE_EDGE_INSET + metrics.barWidth + QUOTE_TEXT_GAP)
  );
  const watermarkInkLeft =
    computeWatermarkX(width, iconBoxSize) + QUOTE_MARK_INK_LEFT * metrics.quoteIconScale;
  return { maxWidth: Math.floor(watermarkInkLeft - QUOTE_TEXT_GAP - startX), startX };
}

/**
 * Shorten `text` until it (plus optional `prefix`/`suffix` decorations and a trailing ellipsis) fits within `maxWidth` pixels, using binary search over its length.
 * Text far longer than any line could hold is first cut to a line-sized prefix (every glyph advances at
 * least `MIN_GLYPH_ADVANCE_RATIO` em), so the ink measurements never lay out thousands of glyphs.
 */
function truncateToWidth(
  text: string,
  maxWidth: number,
  style: TextStyle,
  prefix = '',
  suffix = '',
  hasForcedEllipsis = false
): string {
  const { fontSize, isBold, isItalic } = style;
  const maxFittingLength = Math.ceil(maxWidth / (fontSize * MIN_GLYPH_ADVANCE_RATIO)) + 1;
  const isOverlong = text.length > maxFittingLength;
  if (
    !hasForcedEllipsis &&
    !isOverlong &&
    measureTextWidthUncached(`${prefix}${text}${suffix}`, fontSize, isBold, isItalic) <= maxWidth
  ) {
    return text;
  }
  const searchText = isOverlong ? sliceAtCodePoint(text, maxFittingLength) : text;
  let low = 0;
  let high = searchText.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${prefix}${sliceAtCodePoint(searchText, mid)}${ELLIPSIS}${suffix}`;
    if (measureTextWidthUncached(candidate, fontSize, isBold, isItalic) <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${sliceAtCodePoint(searchText, low).trimEnd()}${ELLIPSIS}`;
}

/** Measure the exact ink width of a wrapped line including the opening (first line) and closing (last line) quote marks. */
function measureQuoteLine(
  line: string,
  isFirst: boolean,
  isLast: boolean,
  context: QuoteWrapContext
): number {
  const decorated = `${isFirst ? context.prefix : ''}${line}${isLast ? context.suffix : ''}`;
  return measureTextWidthUncached(decorated, context.fontSize, context.isBold);
}

/**
 * Make the last line fit once its closing quote mark (and, for cut-off text, an ellipsis) is appended,
 * moving its last word onto a new line when possible and truncating it otherwise.
 */
function finalizeLastLine(lines: string[], isTruncated: boolean, context: QuoteWrapContext): void {
  let lastIndex = lines.length - 1;
  let lastLine = lines[lastIndex];
  if (lastLine === undefined) {
    return;
  }
  const ellipsis = isTruncated && !lastLine.endsWith(ELLIPSIS) ? ELLIPSIS : '';
  while (
    measureQuoteLine(`${lastLine}${ellipsis}`, lastIndex === 0, true, context) > context.maxWidth
  ) {
    const splitIndex = lastLine.lastIndexOf(' ');
    if (isTruncated || splitIndex <= 0 || lines.length >= MAX_QUOTE_LINES) {
      const baseLine = lastLine.endsWith(ELLIPSIS) ? lastLine.slice(0, -ELLIPSIS.length) : lastLine;
      lines[lastIndex] = truncateToWidth(
        baseLine,
        context.maxWidth,
        { fontSize: context.fontSize, isBold: context.isBold, isItalic: false },
        lastIndex === 0 ? context.prefix : '',
        context.suffix,
        true
      );
      return;
    }
    const headLine = lastLine.slice(0, splitIndex);
    lastLine = lastLine.slice(splitIndex + 1);
    lines.splice(lastIndex, 1, headLine, lastLine);
    lastIndex += 1;
  }
  lines[lastIndex] = `${lastLine}${ellipsis}`;
}

/**
 * Wrap a quote text string into at most `MAX_QUOTE_LINES` lines that fit within `context.maxWidth`,
 * including the opening and closing quote marks rendered on the first and last line.
 * Line widths are estimated from cheap per-word advance widths and only measured exactly when an
 * estimate lands within `WRAP_TOLERANCE_RATIO * fontSize` of the limit; Words wider than a full line
 * are shortened with an ellipsis, and an ellipsis marks text cut off after the last line.
 */
function wrapQuoteLines(rawText: string, context: QuoteWrapContext): string[] {
  const { fontSize, isBold, maxWidth } = context;
  const wordStyle: TextStyle = { fontSize, isBold, isItalic: false };
  const maxWordWidth =
    maxWidth - measureTextWidthUncached(`${context.prefix}${context.suffix}`, fontSize, isBold);
  const spaceAdvance = measureTextAdvance(' ', fontSize, isBold);
  const prefixAdvance = measureTextAdvance(context.prefix, fontSize, isBold);
  const tolerance = fontSize * WRAP_TOLERANCE_RATIO;
  const sourceText = rawText.trim() || DEFAULT_QUOTE_TEXT;
  const lines: string[] = [];
  let currentLine = '';
  let currentAdvance = 0;
  let isTruncated = false;

  for (const rawWord of sourceText.split(WORD_SPLIT_RX)) {
    if (rawWord.length > 0) {
      if (lines.length === MAX_QUOTE_LINES) {
        isTruncated = true;
        break;
      }
      let word = rawWord;
      let wordAdvance = measureTextAdvance(rawWord, fontSize, isBold);
      if (wordAdvance > maxWordWidth - tolerance) {
        const linePrefix = lines.length === 0 && currentLine.length === 0 ? context.prefix : '';
        word = truncateToWidth(rawWord, maxWidth, wordStyle, linePrefix);
        wordAdvance = word === rawWord ? wordAdvance : measureTextAdvance(word, fontSize, isBold);
      }

      if (currentLine.length === 0) {
        currentLine = word;
        currentAdvance = wordAdvance;
      } else {
        const candidate = `${currentLine} ${word}`;
        const candidateAdvance = currentAdvance + spaceAdvance + wordAdvance;
        const estimatedWidth = (lines.length === 0 ? prefixAdvance : 0) + candidateAdvance;
        const isOverflowing =
          estimatedWidth > maxWidth + tolerance ||
          (estimatedWidth > maxWidth - tolerance &&
            measureQuoteLine(candidate, lines.length === 0, false, context) > maxWidth);
        if (isOverflowing) {
          lines.push(currentLine);
          isTruncated = lines.length === MAX_QUOTE_LINES;
          currentLine = isTruncated ? '' : word;
          currentAdvance = isTruncated ? 0 : wordAdvance;
        } else {
          currentLine = candidate;
          currentAdvance = candidateAdvance;
        }
      }
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  finalizeLastLine(lines, isTruncated, context);
  return lines;
}

/** Resolve text color, author color, font weight, and `<defs>` gradient markup for a quote card. */
function resolveQuoteStyleTokens(
  variant: BadgeVariant,
  isVertical: boolean,
  color: ThemeColorName,
  palette: ThemePalette
): QuoteStyleTokens {
  const isOnPrimary = variant === '1';
  // Primary cards fill with the theme gradient; horizontal secondary cards paint their accent bar with it:
  const hasThemeGradient = isOnPrimary || (!isVertical && variant === '2');
  return {
    authorColor: resolveForegroundColor(isOnPrimary, palette.accentText),
    gradDefs: renderSurfaceGradientDefs(!isOnPrimary, hasThemeGradient ? [color] : undefined),
    isBoldText: isVertical || isOnPrimary,
    textColor: resolveSurfaceTextColor(variant),
  };
}

/** Render a decorative double quotation mark `<g>` group. */
function renderQuoteMarkGroup(transform: string, paintAttrs: string): string {
  return `<g transform="${transform}" ${paintAttrs}>${QUOTE_MARK_PATHS}</g>`;
}

/** Render the card surface, Kumo 3D top crescent, border ring, and accent bar for a quote card. */
function renderQuoteSurface(context: QuoteCardContext): string {
  const { color, height, metrics, palette, variant, width } = context;
  const surface = renderKumoBoxSurface({ color, height, radius: metrics.radius, variant, width });
  if (context.layout !== 'horizontal') {
    return surface;
  }

  const barY = Math.max(14, metrics.padY - 2);
  const barGeometry = `x="${QUOTE_EDGE_INSET}" y="${barY}" width="${metrics.barWidth}" height="${Math.max(16, height - barY * 2)}" rx="${roundCoord(metrics.barWidth / 2)}"`;
  let barPaint = `fill="${palette.iconColor}" fill-opacity="0.55"`;
  if (variant === '1') {
    barPaint = `fill="${WHITE}" fill-opacity="${PRIMARY_FOREGROUND_OPACITY}"`;
  } else if (variant === '2') {
    barPaint = `fill="url(#${buildThemeGradientId(color)})"`;
  }
  return `${surface}<rect ${barGeometry} ${barPaint} />`;
}

/** Render the inner quote marks, wrapped text lines, and author line for a vertical centered quote card. */
function renderVerticalQuoteContent(context: QuoteCardContext): string {
  const { authorLine, iconBoxSize, lines, metrics, variant, width } = context;
  const { authorFontSize, fontSize, lineHeight, padY, quoteIconScale } = metrics;
  const centerX = roundTenths(width / 2);
  const quoteIconX = roundTenths(centerX - iconBoxSize / 2);
  const quoteFillColor = variant === '1' ? WHITE : context.palette.iconColor;
  const quotePaint = `fill="${quoteFillColor}" fill-opacity="${VERTICAL_QUOTE_OPACITY_BY_VARIANT[variant]}"`;

  let markup = renderQuoteMarkGroup(
    `translate(${quoteIconX}, ${padY}) scale(${quoteIconScale}) rotate(180 12 12)`,
    quotePaint
  );

  const firstLineY = padY + iconBoxSize + VERTICAL_MARK_TOP_GAP + Math.round(fontSize * 0.85);
  for (const [i, line] of lines.entries()) {
    markup += renderTextPathMarkup(line, {
      anchorX: centerX,
      baselineY: firstLineY + i * lineHeight,
      fill: context.textColor,
      fontSize,
      isBold: context.isBoldText,
      isUncached: true,
    });
  }

  const bottomQuoteY = padY + iconBoxSize + VERTICAL_MARK_BOTTOM_GAP + context.textBlockHeight;
  markup += renderQuoteMarkGroup(
    `translate(${quoteIconX}, ${bottomQuoteY}) scale(${quoteIconScale})`,
    quotePaint
  );

  if (authorLine.length > 0) {
    markup += renderTextPathMarkup(authorLine, {
      anchorX: centerX,
      baselineY: bottomQuoteY + iconBoxSize + Math.round(authorFontSize * 1.45),
      fill: context.authorColor,
      fontSize: authorFontSize,
      isBold: true,
      isItalic: true,
      isUncached: true,
    });
  }

  return markup;
}

/** Render the inner watermark, wrapped text lines, and author line for a horizontal quote card. */
function renderHorizontalQuoteContent(context: QuoteCardContext): string {
  const { authorLine, iconBoxSize, lines, metrics, variant, width } = context;
  const { authorFontSize, fontSize, lineHeight, padY, quoteIconScale } = metrics;
  const watermarkX = computeWatermarkX(width, iconBoxSize);
  const watermarkY = Math.max(14, Math.round(padY * 0.72));
  const watermarkStroke = variant === '1' ? WHITE : context.palette.iconColor;

  let markup = renderQuoteMarkGroup(
    `translate(${watermarkX}, ${watermarkY}) scale(${quoteIconScale})`,
    `fill="none" stroke="${watermarkStroke}" stroke-opacity="${WATERMARK_OPACITY_BY_VARIANT[variant]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
  );

  const textStartX = context.textColumn.startX;
  const firstLineY = padY + Math.round(fontSize * 1.05);
  for (let i = 0; i < lines.length; i += 1) {
    const prefix = i === 0 ? OPENING_QUOTE_MARK : '';
    const suffix = i === lines.length - 1 ? CLOSING_QUOTE_MARK : '';
    markup += renderTextPathMarkup(`${prefix}${lines[i]}${suffix}`, {
      align: 'left',
      anchorX: textStartX,
      baselineY: firstLineY + i * lineHeight,
      fill: context.textColor,
      fontSize,
      isBold: context.isBoldText,
      isUncached: true,
    });
  }

  if (authorLine.length > 0) {
    markup += renderTextPathMarkup(authorLine, {
      align: 'left',
      anchorX: textStartX,
      baselineY: padY + context.textBlockHeight + Math.round(authorFontSize * 1.45),
      fill: context.authorColor,
      fontSize: authorFontSize,
      isBold: true,
      isUncached: true,
    });
  }

  return markup;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render a standalone SVG quote card.
 * Supports horizontal and vertical layouts with configurable preset or numeric font sizing and auto-wrapping.
 * @param options   Quote card rendering configuration.
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderQuote(options: QuoteRenderOptions): string {
  const { color } = options;
  const palette = THEMES[color];
  const variant: BadgeVariant = options.variant ?? '2';
  const layout: QuoteLayout = options.layout ?? DEFAULT_QUOTE_LAYOUT;
  const animMode: AnimationMode = options.anim ?? 'default';
  const metrics = resolveQuoteMetrics(options.size, layout);
  const { authorFontSize, authorSpace, fontSize, lineHeight, padY, quoteIconScale } = metrics;

  const isVertical = layout === 'vertical';
  const defaultWidth = isVertical
    ? Math.round(
        DEFAULT_VERTICAL_QUOTE_WIDTH *
          Math.max(1, fontSize / QUOTE_SIZE_MAP[DEFAULT_VERTICAL_QUOTE_SIZE])
      )
    : Math.round(
        QUOTE_WIDTH_RANGE.default *
          Math.max(1, fontSize / QUOTE_SIZE_MAP[DEFAULT_HORIZONTAL_QUOTE_SIZE])
      );
  const width = clampInt(options.width, QUOTE_WIDTH_RANGE, defaultWidth);
  const iconBoxSize = Math.round(24 * quoteIconScale);
  const textColumn = computeQuoteTextColumn(layout, width, metrics, iconBoxSize);

  const { authorColor, gradDefs, isBoldText, textColor } = resolveQuoteStyleTokens(
    variant,
    isVertical,
    color,
    palette
  );
  const lines = wrapQuoteLines(prepareDisplayText(options.text, MAX_QUOTE_TEXT_LENGTH), {
    fontSize,
    isBold: isBoldText,
    maxWidth: textColumn.maxWidth,
    prefix: isVertical ? '' : OPENING_QUOTE_MARK,
    suffix: isVertical ? '' : CLOSING_QUOTE_MARK,
  });
  const author = prepareDisplayText(options.author ?? '', MAX_QUOTE_TEXT_LENGTH).trim();
  const authorLine =
    author.length > 0
      ? truncateToWidth(`— ${author}`, textColumn.maxWidth, {
          fontSize: authorFontSize,
          isBold: true,
          isItalic: isVertical,
        })
      : '';

  const textBlockHeight = lines.length * lineHeight;
  const verticalQuotesSpace = isVertical ? iconBoxSize * 2 + VERTICAL_MARK_BOTTOM_GAP : 0;
  const authorHeightForLayout = isVertical ? Math.round(authorFontSize * 1.65) : authorSpace;
  const effectiveAuthorSpace = authorLine.length > 0 ? authorHeightForLayout : 0;
  const height = padY + verticalQuotesSpace + textBlockHeight + effectiveAuthorSpace + padY;

  const cardContext: QuoteCardContext = {
    authorColor,
    authorLine,
    color,
    height,
    iconBoxSize,
    isBoldText,
    layout,
    lines,
    metrics,
    palette,
    textBlockHeight,
    textColor,
    textColumn,
    variant,
    width,
  };
  const contentMarkup = isVertical
    ? renderVerticalQuoteContent(cardContext)
    : renderHorizontalQuoteContent(cardContext);
  const sheen = renderSheenOverlay({
    animMode,
    height,
    idPrefix: 'quote-sheen',
    radius: metrics.radius,
    width,
  });
  const quoteText = lines.join(' ');

  return renderSvgDocument({
    ariaLabel: authorLine.length > 0 ? `${quoteText} ${authorLine}` : quoteText,
    body: `${renderQuoteSurface(cardContext)}${contentMarkup}${sheen.overlay}`,
    defs: `${gradDefs}${sheen.clipDef}`,
    height,
    width,
  });
}
