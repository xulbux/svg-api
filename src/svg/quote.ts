/**
 * Quote card renderer – Renders Kumo 3D horizontal and vertical quote cards (`svg.xul.is/quote/...`).
 */

import { WHITE } from '@/config/palette';
import { THEMES } from '@/config/theme';
import { measureTextAdvance, measureTextWidthUncached, renderTextPathMarkup } from '@/svg/measure';
import {
  ELLIPSIS,
  PRIMARY_FOREGROUND_OPACITY,
  buildThemeGradientId,
  clampInt,
  clampNumber,
  hasOwnKey,
  renderDarkBgGradientDef,
  renderKumoBoxSurface,
  renderSheenOverlay,
  renderSvgDocument,
  renderThemeGradientDef,
  sliceAtCodePoint,
  prepareDisplayText,
  resolveSurfaceTextColor,
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
  /** Horizontal inner padding in pixels. */
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
  /** Whether the text is rendered with semi-bold (`600`) weight. */
  isBold: boolean;
  /** Whether the text is rendered with semi-bold italic (`600` italic) style. */
  isItalic: boolean;
}

/** Typography and quote mark decoration used while wrapping quote lines. */
interface QuoteWrapContext {
  /** Quote body font size in pixels. */
  fontSize: number;
  /** Whether the text is rendered with semi-bold (`600`) weight. */
  isBold: boolean;
  /** Maximum rendered line width in pixels. */
  maxWidthPx: number;
  /** Opening quote mark rendered before the first line (`''` for none). */
  prefix: string;
  /** Closing quote mark rendered after the last line (`''` for none). */
  suffix: string;
}

/** Variant-dependent colors, font weight, and `<defs>` gradients of a quote card. */
interface QuoteStyleTokens {
  /** Author line color. */
  authorColor: string;
  /** `<defs>` gradient markup required by the card. */
  gradDefs: string;
  /** Whether the quote body uses semi-bold (`600`) weight. */
  isBoldText: boolean;
  /** Quote body text color. */
  textColor: string;
}

/** Fully resolved layout and style state shared by the quote surface and content renderers. */
interface QuoteCardContext {
  /** Author line color. */
  authorColor: string;
  /** Width-truncated author line including its leading em dash (`''` when no author is given). */
  authorLine: string;
  /** Theme color token of the card accent. */
  color: ThemeColorName;
  /** Total card height in pixels. */
  height: number;
  /** Rendered size of a decorative quote mark icon in pixels. */
  iconBoxSize: number;
  /** Whether the quote body uses semi-bold (`600`) weight. */
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
  /** Card surface variant. */
  variant: BadgeVariant;
  /** Total card width in pixels. */
  width: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Card width bounds in pixels (`?width=`; The default applies to horizontal cards). */
export const QUOTE_WIDTH_RANGE: NumericRange = { default: 560, max: 900, min: 240 };

/** Default card width in pixels for vertical centered `/quote/...` cards. */
export const DEFAULT_VERTICAL_QUOTE_WIDTH = 380;

/** Custom numeric quote font size bounds in pixels (`?size=<px>`; Defaults to the `md` preset). */
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

/** Vertical quote mark fill opacity by quote card variant (`'1'`, `'2'`, `'3'`). */
const VERTICAL_QUOTE_OPACITY_BY_VARIANT: Readonly<Record<BadgeVariant, string>> = {
  '1': '0.74',
  '2': '0.78',
  '3': '0.52',
};

/** Watermark stroke opacity by quote card variant (`'1'`, `'2'`, `'3'`). */
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
  const defaultPreset: SizePreset = layout === 'vertical' ? 'lg' : 'md';
  let fontSize = QUOTE_SIZE_MAP[defaultPreset];
  if (typeof sizeOption === 'number') {
    fontSize = clampNumber(sizeOption, QUOTE_FONT_SIZE_RANGE, fontSize);
  } else if (typeof sizeOption === 'string' && hasOwnKey(QUOTE_SIZE_MAP, sizeOption)) {
    fontSize = QUOTE_SIZE_MAP[sizeOption];
  }

  const scale = fontSize / 15;
  return {
    authorFontSize: Number((fontSize * 0.84).toFixed(1)),
    authorSpace: Math.round(28 * scale),
    barWidth: Number(Math.max(3, 3.5 * scale).toFixed(1)),
    fontSize,
    lineHeight: Math.round(fontSize * 1.56),
    padX: Math.round(36 * scale),
    padY: Math.round((layout === 'vertical' ? 30 : 21) * scale),
    quoteIconScale: Number((1.05 * scale).toFixed(2)),
    radius: Math.max(10, Math.round(11 * scale)),
  };
}

/**
 * Shorten `text` until it (plus a trailing ellipsis) fits within `maxWidthPx`, using binary search over its length.
 * Text far longer than any line could hold is first cut to a line-sized prefix (every glyph advances at
 * least `MIN_GLYPH_ADVANCE_RATIO` em), so the ink measurements never lay out thousands of glyphs.
 */
function truncateToWidth(text: string, maxWidthPx: number, style: TextStyle): string {
  const { fontSize, isBold, isItalic } = style;
  const maxFittingLength = Math.ceil(maxWidthPx / (fontSize * MIN_GLYPH_ADVANCE_RATIO)) + 1;
  const isOverlong = text.length > maxFittingLength;
  if (!isOverlong && measureTextWidthUncached(text, fontSize, isBold, isItalic) <= maxWidthPx) {
    return text;
  }
  const searchText = isOverlong ? sliceAtCodePoint(text, maxFittingLength) : text;
  let low = 0;
  let high = searchText.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${sliceAtCodePoint(searchText, mid)}${ELLIPSIS}`;
    if (measureTextWidthUncached(candidate, fontSize, isBold, isItalic) <= maxWidthPx) {
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
  const ellipsis = isTruncated ? ELLIPSIS : '';
  let lastIndex = lines.length - 1;
  while (
    measureQuoteLine(`${lines[lastIndex]}${ellipsis}`, lastIndex === 0, true, context) >
    context.maxWidthPx
  ) {
    const splitIndex = lines[lastIndex].lastIndexOf(' ');
    if (isTruncated || splitIndex <= 0 || lines.length >= MAX_QUOTE_LINES) {
      const decorationWidth = measureTextWidthUncached(
        `${lastIndex === 0 ? context.prefix : ''}${context.suffix}`,
        context.fontSize,
        context.isBold
      );
      lines[lastIndex] = truncateToWidth(
        `${lines[lastIndex]}${ellipsis}`,
        context.maxWidthPx - decorationWidth,
        { fontSize: context.fontSize, isBold: context.isBold, isItalic: false }
      );
      return;
    }
    const lastLine = lines[lastIndex];
    lines.splice(lastIndex, 1, lastLine.slice(0, splitIndex), lastLine.slice(splitIndex + 1));
    lastIndex += 1;
  }
  lines[lastIndex] = `${lines[lastIndex]}${ellipsis}`;
}

/**
 * Wrap a quote text string into at most `MAX_QUOTE_LINES` lines that fit within `context.maxWidthPx`,
 * including the opening and closing quote marks rendered on the first and last line.
 * Line widths are estimated from cheap per-word advance widths and only measured exactly when an
 * estimate lands within `WRAP_TOLERANCE_RATIO * fontSize` of the limit; Words wider than a full line
 * are shortened with an ellipsis, and an ellipsis marks text cut off after the last line.
 */
function wrapQuoteLines(rawText: string, context: QuoteWrapContext): string[] {
  const { fontSize, isBold, maxWidthPx } = context;
  const wordStyle: TextStyle = { fontSize, isBold, isItalic: false };
  const maxWordWidth =
    maxWidthPx - measureTextWidthUncached(`${context.prefix}${context.suffix}`, fontSize, isBold);
  const spaceAdvance = measureTextAdvance(' ', fontSize, isBold);
  const prefixAdvance = measureTextAdvance(context.prefix, fontSize, isBold);
  const tolerance = fontSize * WRAP_TOLERANCE_RATIO;
  const lines: string[] = [];
  let currentLine = '';
  let currentAdvance = 0;
  let isTruncated = false;

  for (const rawWord of rawText.trim().split(WORD_SPLIT_RX)) {
    if (rawWord.length > 0) {
      if (lines.length === MAX_QUOTE_LINES) {
        isTruncated = true;
        break;
      }
      let word = rawWord;
      let wordAdvance = measureTextAdvance(rawWord, fontSize, isBold);
      if (wordAdvance > maxWordWidth - tolerance) {
        word = truncateToWidth(rawWord, maxWordWidth, wordStyle);
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
          estimatedWidth > maxWidthPx + tolerance ||
          (estimatedWidth > maxWidthPx - tolerance &&
            measureQuoteLine(candidate, lines.length === 0, false, context) > maxWidthPx);
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
  if (lines.length === 0) {
    lines.push(DEFAULT_QUOTE_TEXT);
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
  const textColor = resolveSurfaceTextColor(variant);

  const authorColor =
    variant === '1' ? `rgba(255, 255, 255, ${PRIMARY_FOREGROUND_OPACITY})` : palette.accentText;
  const isBoldText = isVertical || variant === '1';
  const darkGradDef = variant === '1' ? '' : renderDarkBgGradientDef();
  const themeGradDef =
    variant === '1' || (!isVertical && variant === '2') ? renderThemeGradientDef(color) : '';

  return { authorColor, gradDefs: `${darkGradDef}${themeGradDef}`, isBoldText, textColor };
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
  const barGeometry = `x="18" y="${barY}" width="${metrics.barWidth}" height="${Math.max(16, height - barY * 2)}" rx="${Number((metrics.barWidth / 2).toFixed(2))}"`;
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
  const centerX = Number((width / 2).toFixed(1));
  const quoteIconX = Number((centerX - iconBoxSize / 2).toFixed(1));
  const quoteFillColor = variant === '1' ? WHITE : context.palette.iconColor;
  const quotePaint = `fill="${quoteFillColor}" fill-opacity="${VERTICAL_QUOTE_OPACITY_BY_VARIANT[variant]}"`;

  let markup = renderQuoteMarkGroup(
    `translate(${quoteIconX}, ${padY}) scale(${quoteIconScale}) rotate(180 12 12)`,
    quotePaint
  );

  const firstLineY = padY + iconBoxSize + 10 + Math.round(fontSize * 0.85);
  for (let i = 0; i < lines.length; i += 1) {
    markup += renderTextPathMarkup(lines[i], {
      anchorX: centerX,
      baselineY: firstLineY + i * lineHeight,
      fill: context.textColor,
      fontSize,
      isBold: true,
    });
  }

  const bottomQuoteY = padY + iconBoxSize + 14 + context.textBlockHeight;
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
    });
  }

  return markup;
}

/** Render the inner watermark, wrapped text lines, and author line for a horizontal quote card. */
function renderHorizontalQuoteContent(context: QuoteCardContext): string {
  const { authorLine, iconBoxSize, lines, metrics, variant, width } = context;
  const { authorFontSize, barWidth, fontSize, lineHeight, padY, quoteIconScale } = metrics;
  const watermarkX = Math.round(width - iconBoxSize - 18);
  const watermarkY = Math.max(14, Math.round(padY * 0.72));
  const watermarkStroke = variant === '1' ? WHITE : context.palette.iconColor;

  let markup = renderQuoteMarkGroup(
    `translate(${watermarkX}, ${watermarkY}) scale(${quoteIconScale})`,
    `fill="none" stroke="${watermarkStroke}" stroke-opacity="${WATERMARK_OPACITY_BY_VARIANT[variant]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
  );

  const textStartX = Math.max(34, Math.round(22 + barWidth + 12));
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
    });
  }

  return markup;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render a standalone SVG quote card (`svg.xul.is/quote/...`).
 * Supports both horizontal callout cards (`layout='horizontal'`) and vertical centered profile README
 * quote cards (`layout='vertical'`) with configurable `size` (`'sm'`, `'md'`, `'lg'`, `'xl'`, or pixel number).
 * @param options   Quote card rendering configuration (`text`, `author`, `color`, `variant`, `layout`, `size`, `width`, `anim`).
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderQuote(options: QuoteRenderOptions): string {
  const { color } = options;
  const palette = THEMES[color];
  const variant: BadgeVariant = options.variant ?? '2';
  const layout: QuoteLayout = options.layout ?? 'horizontal';
  const animMode: AnimationMode = options.anim ?? 'default';
  const metrics = resolveQuoteMetrics(options.size, layout);
  const { authorFontSize, authorSpace, fontSize, lineHeight, padX, padY, quoteIconScale } = metrics;

  const isVertical = layout === 'vertical';
  const defaultWidth = isVertical
    ? Math.round(DEFAULT_VERTICAL_QUOTE_WIDTH * Math.max(1, fontSize / QUOTE_SIZE_MAP.lg))
    : Math.round(QUOTE_WIDTH_RANGE.default * Math.max(1, fontSize / QUOTE_SIZE_MAP.md));
  const width = clampInt(options.width, QUOTE_WIDTH_RANGE, defaultWidth);

  const maxTextWidth = isVertical ? width - padX * 2 : width - (padX + 42);
  const { authorColor, gradDefs, isBoldText, textColor } = resolveQuoteStyleTokens(
    variant,
    isVertical,
    color,
    palette
  );
  const lines = wrapQuoteLines(prepareDisplayText(options.text, MAX_QUOTE_TEXT_LENGTH), {
    fontSize,
    isBold: isBoldText,
    maxWidthPx: maxTextWidth,
    prefix: isVertical ? '' : OPENING_QUOTE_MARK,
    suffix: isVertical ? '' : CLOSING_QUOTE_MARK,
  });
  const author = prepareDisplayText(options.author ?? '', MAX_QUOTE_TEXT_LENGTH).trim();
  const authorLine =
    author.length > 0
      ? truncateToWidth(`— ${author}`, maxTextWidth, {
          fontSize: authorFontSize,
          isBold: true,
          isItalic: isVertical,
        })
      : '';

  const textBlockHeight = lines.length * lineHeight;
  const iconBoxSize = Math.round(24 * quoteIconScale);
  const verticalQuotesSpace = isVertical ? iconBoxSize * 2 + 24 : 0;
  const authorHeightForLayout = isVertical ? authorSpace + 8 : authorSpace;
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
