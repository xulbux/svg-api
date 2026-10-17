/**
 * Quote card renderer – Renders Kumo 3D horizontal and vertical quote cards (`svg.xul.is/quote/...`).
 */

import { BASE_DARK, THEMES } from '@/config/theme';
import type {
  AnimationMode,
  QuoteLayout,
  QuoteRenderOptions,
  QuoteSize,
  ThemePalette,
  WidgetVariant,
} from '@/types';
import { measureTextWidth } from './measure';
import {
  clampInt,
  clampNumber,
  escapeXml,
  renderDarkBgGradientDef,
  renderKumoBoxSurface,
  renderSheenOverlay,
  renderThemeGradientDef,
  SYSTEM_FONT_STACK,
} from './shared';

// ---------------------------------------- TYPES ----------------------------------------

/** Resolved typography and spacing dimensions for a quote card. */
interface QuoteMetrics {
  /** Author font size in pixels. */
  authorFontSize: number;
  /** Vertical space reserved for the author line in pixels. */
  authorSpace: number;
  /** Width of the vertical accent bar in horizontal layout. */
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

// ---------------------------------------- CONSTS ---------------------------------------

/** Default card width in pixels for horizontal `/quote/...` cards. */
const DEFAULT_HORIZONTAL_QUOTE_WIDTH = 560;

/** Default card width in pixels for vertical centered `/quote/...` cards. */
const DEFAULT_VERTICAL_QUOTE_WIDTH = 380;

/** Minimum allowed quote card width in pixels. */
const MIN_QUOTE_WIDTH = 240;

/** Maximum allowed quote card width in pixels. */
const MAX_QUOTE_WIDTH = 900;

/** Minimum allowed custom numeric quote font size in pixels. */
const MIN_QUOTE_FONT_SIZE = 11;

/** Maximum allowed custom numeric quote font size in pixels. */
const MAX_QUOTE_FONT_SIZE = 28;

/** Maximum number of wrapped text lines rendered in a quote card. */
const MAX_QUOTE_LINES = 10;

/** Inner `24x24` SVG paths for double quotation marks. */
const QUOTE_MARK_PATHS =
  '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>';

/** Preset font sizes in pixels for named `QuoteSize` tokens. */
const QUOTE_SIZE_MAP: Readonly<Record<QuoteSize, number>> = { lg: 17.5, md: 15, sm: 13.5, xl: 20 };

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches one or more whitespace characters for word splitting. */
const WORD_SPLIT_RX = /\s+/;

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve `QuoteMetrics` from the requested `size` option and `layout`. */
function resolveQuoteMetrics(
  sizeOption: QuoteSize | number | undefined,
  layout: QuoteLayout
): QuoteMetrics {
  const defaultPreset: QuoteSize = layout === 'vertical' ? 'lg' : 'md';
  let fontSize = QUOTE_SIZE_MAP[defaultPreset];
  if (typeof sizeOption === 'number') {
    fontSize = clampNumber(sizeOption, MIN_QUOTE_FONT_SIZE, MAX_QUOTE_FONT_SIZE, fontSize);
  } else if (typeof sizeOption === 'string' && sizeOption in QUOTE_SIZE_MAP) {
    fontSize = QUOTE_SIZE_MAP[sizeOption];
  }

  const scale = fontSize / 15;
  const authorFontSize = Number((fontSize * 0.84).toFixed(1));
  const lineHeight = Math.round(fontSize * 1.56);
  const padX = Math.round(36 * scale);
  const padY = Math.round((layout === 'vertical' ? 30 : 21) * scale);
  const authorSpace = Math.round(28 * scale);
  const barWidth = Number(Math.max(3, 3.5 * scale).toFixed(1));
  const quoteIconScale = Number((1.05 * scale).toFixed(2));
  const radius = Math.max(10, Math.round(11 * scale));

  return {
    authorFontSize,
    authorSpace,
    barWidth,
    fontSize,
    lineHeight,
    padX,
    padY,
    quoteIconScale,
    radius,
  };
}

/** Wrap a quote text string into lines that fit within `maxWidthPx` at `fontSize`. */
function wrapQuoteLines(
  rawText: string,
  maxWidthPx: number,
  fontSize: number,
  isBold: boolean
): string[] {
  const words = rawText.trim().split(WORD_SPLIT_RX);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (word.length > 0) {
      const candidate = currentLine.length > 0 ? `${currentLine} ${word}` : word;
      if (currentLine.length > 0 && measureTextWidth(candidate, fontSize, isBold) > maxWidthPx) {
        lines.push(currentLine);
        currentLine = word;
        if (lines.length >= MAX_QUOTE_LINES - 1) {
          break;
        }
      } else {
        currentLine = candidate;
      }
    }
  }

  if (currentLine.length > 0 && lines.length < MAX_QUOTE_LINES) {
    lines.push(currentLine);
  }
  if (lines.length === 0) {
    lines.push('Always creating more cool stuff for you.');
  }
  return lines;
}

/** Render the card surface, Kumo 3D top crescent, border ring, and accent bar for a quote card. */
function renderQuoteSurface(
  width: number,
  height: number,
  radius: number,
  variant: WidgetVariant,
  layout: QuoteLayout,
  palette: ThemePalette,
  gradId: string,
  barWidth: number,
  padY: number
): string {
  let layers = renderKumoBoxSurface(0, 0, width, height, radius, variant, palette, gradId);

  if (layout === 'horizontal') {
    const barY = Math.max(14, padY - 2);
    const barHeight = Math.max(16, height - barY * 2);
    const barRx = Number((barWidth / 2).toFixed(2));
    if (variant === '1') {
      layers += `<rect x="18" y="${barY}" width="${barWidth}" height="${barHeight}" rx="${barRx}" fill="#ffffff" fill-opacity="0.86" />`;
    } else if (variant === '2') {
      layers += `<rect x="18" y="${barY}" width="${barWidth}" height="${barHeight}" rx="${barRx}" fill="url(#${gradId})" />`;
    } else {
      layers += `<rect x="18" y="${barY}" width="${barWidth}" height="${barHeight}" rx="${barRx}" fill="${palette.iconColor}" fill-opacity="0.55" />`;
    }
  }

  return layers;
}

/** Render the inner quote marks, wrapped text lines, and author line for a vertical centered quote card. */
function renderVerticalQuoteContent(
  width: number,
  lines: string[],
  authorText: string,
  textColor: string,
  authorColor: string,
  palette: ThemePalette,
  variant: WidgetVariant,
  metrics: QuoteMetrics,
  iconBoxSize: number,
  textBlockHeight: number
): string {
  const { authorFontSize, fontSize, lineHeight, padY, quoteIconScale } = metrics;
  const centerX = Number((width / 2).toFixed(1));
  const quoteIconX = Number((centerX - iconBoxSize / 2).toFixed(1));
  const topQuoteY = padY;
  const quoteFillColor = variant === '1' ? '#ffffff' : palette.iconColor;
  const quoteFillOpacity = variant === '3' ? '0.6' : '0.92';

  let markup = `<g transform="translate(${quoteIconX}, ${topQuoteY}) scale(${quoteIconScale}) rotate(180 12 12)" fill="${quoteFillColor}" fill-opacity="${quoteFillOpacity}">${QUOTE_MARK_PATHS}</g>`;

  const firstLineY = topQuoteY + iconBoxSize + 10 + Math.round(fontSize * 0.85);
  for (let i = 0; i < lines.length; i += 1) {
    const lineY = firstLineY + i * lineHeight;
    markup += `<text x="${centerX}" y="${lineY}" text-anchor="middle" fill="${textColor}" class="q-txt">${escapeXml(lines[i])}</text>`;
  }

  const bottomQuoteY = topQuoteY + iconBoxSize + 14 + textBlockHeight;
  markup += `<g transform="translate(${quoteIconX}, ${bottomQuoteY}) scale(${quoteIconScale})" fill="${quoteFillColor}" fill-opacity="${quoteFillOpacity}">${QUOTE_MARK_PATHS}</g>`;

  if (authorText.length > 0) {
    const authorY = bottomQuoteY + iconBoxSize + Math.round(authorFontSize * 1.45);
    markup += `<text x="${centerX}" y="${authorY}" text-anchor="middle" fill="${authorColor}" class="q-author">— ${escapeXml(authorText)}</text>`;
  }

  return markup;
}

/** Watermark stroke opacity by quote card variant (`'1'`, `'2'`, `'3'`). */
const WATERMARK_OPACITY_BY_VARIANT: Readonly<Record<WidgetVariant, string>> = {
  '1': '0.24',
  '2': '0.18',
  '3': '0.14',
};

/** Resolve text color, author color, font weight, and `<defs>` gradient markup for a quote card. */
function resolveQuoteStyleTokens(
  variant: WidgetVariant,
  isVertical: boolean,
  gradId: string,
  palette: ThemePalette
): { authorColor: string; gradDefs: string; textColor: string; textWeight: number } {
  let textColor = BASE_DARK.textPrimary;
  if (variant === '1') {
    textColor = '#ffffff';
  } else if (variant === '3') {
    textColor = BASE_DARK.textMuted;
  }

  const authorColor = variant === '1' ? 'rgba(255, 255, 255, 0.88)' : palette.accentText;
  const textWeight = isVertical || variant === '1' ? 600 : 500;
  const darkGradDef = variant === '1' ? '' : renderDarkBgGradientDef();
  const themeGradDef =
    variant === '1' || (!isVertical && variant === '2')
      ? renderThemeGradientDef(gradId, palette)
      : '';

  return { authorColor, gradDefs: `${darkGradDef}${themeGradDef}`, textColor, textWeight };
}

/** Render the inner watermark, wrapped text lines, and author line for a horizontal quote card. */
function renderHorizontalQuoteContent(
  width: number,
  lines: string[],
  authorText: string,
  textColor: string,
  authorColor: string,
  palette: ThemePalette,
  variant: WidgetVariant,
  metrics: QuoteMetrics,
  iconBoxSize: number,
  textBlockHeight: number
): string {
  const { authorFontSize, barWidth, fontSize, lineHeight, padY, quoteIconScale } = metrics;
  const watermarkX = Math.round(width - iconBoxSize - 18);
  const watermarkY = Math.max(14, Math.round(padY * 0.72));
  const watermarkStroke = variant === '1' ? '#ffffff' : palette.iconColor;
  const watermarkOpacity = WATERMARK_OPACITY_BY_VARIANT[variant];

  let markup = `<g transform="translate(${watermarkX}, ${watermarkY}) scale(${quoteIconScale})" fill="none" stroke="${watermarkStroke}" stroke-opacity="${watermarkOpacity}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${QUOTE_MARK_PATHS}</g>`;

  const textStartX = Math.max(34, Math.round(22 + barWidth + 12));
  const firstLineY = padY + Math.round(fontSize * 1.05);
  for (let i = 0; i < lines.length; i += 1) {
    const lineY = firstLineY + i * lineHeight;
    const prefix = i === 0 ? '“' : '';
    const suffix = i === lines.length - 1 ? '”' : '';
    markup += `<text x="${textStartX}" y="${lineY}" fill="${textColor}" class="q-txt">${escapeXml(`${prefix}${lines[i]}${suffix}`)}</text>`;
  }

  if (authorText.length > 0) {
    const authorY = padY + textBlockHeight + Math.round(authorFontSize * 1.45);
    markup += `<text x="${textStartX}" y="${authorY}" fill="${authorColor}" class="q-author">— ${escapeXml(authorText)}</text>`;
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
  const palette = THEMES[options.color] || THEMES.indigo;
  const variant: WidgetVariant = options.variant ?? '2';
  const layout: QuoteLayout = options.layout ?? 'horizontal';
  const animMode: AnimationMode = options.anim ?? 'auto';
  const metrics = resolveQuoteMetrics(options.size, layout);
  const {
    authorFontSize,
    authorSpace,
    barWidth,
    fontSize,
    lineHeight,
    padX,
    padY,
    quoteIconScale,
    radius,
  } = metrics;

  const isVertical = layout === 'vertical';
  const defaultWidth = isVertical
    ? Math.round(DEFAULT_VERTICAL_QUOTE_WIDTH * Math.max(1, fontSize / 17.5))
    : Math.round(DEFAULT_HORIZONTAL_QUOTE_WIDTH * Math.max(1, fontSize / 15));
  const width = clampInt(options.width, MIN_QUOTE_WIDTH, MAX_QUOTE_WIDTH, defaultWidth);

  const maxTextWidth = isVertical ? width - padX * 2 : width - (padX + 42);
  const lines = wrapQuoteLines(options.text, maxTextWidth, fontSize, isVertical);
  const authorText = (options.author ?? '').trim();
  const hasAuthor = authorText.length > 0;

  const textBlockHeight = lines.length * lineHeight;
  const iconBoxSize = Math.round(24 * quoteIconScale);
  const verticalQuotesSpace = isVertical ? iconBoxSize * 2 + 24 : 0;
  const authorHeightForLayout = isVertical ? authorSpace + 8 : authorSpace;
  const effectiveAuthorSpace = hasAuthor ? authorHeightForLayout : 0;
  const height = padY + verticalQuotesSpace + textBlockHeight + effectiveAuthorSpace + padY;

  const gradId = `quote-grad-${options.color}`;
  const { authorColor, gradDefs, textColor, textWeight } = resolveQuoteStyleTokens(
    variant,
    isVertical,
    gradId,
    palette
  );

  const surfaceLayers = renderQuoteSurface(
    width,
    height,
    radius,
    variant,
    layout,
    palette,
    gradId,
    barWidth,
    padY
  );

  const contentMarkup = isVertical
    ? renderVerticalQuoteContent(
        width,
        lines,
        authorText,
        textColor,
        authorColor,
        palette,
        variant,
        metrics,
        iconBoxSize,
        textBlockHeight
      )
    : renderHorizontalQuoteContent(
        width,
        lines,
        authorText,
        textColor,
        authorColor,
        palette,
        variant,
        metrics,
        iconBoxSize,
        textBlockHeight
      );

  const sheen = renderSheenOverlay(animMode, width, height, radius, 'quote-sheen');
  const ariaLabel = escapeXml(hasAuthor ? `${lines.join(' ')} — ${authorText}` : lines.join(' '));
  const authorStyle = isVertical ? 'font-style: italic;' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-label="${ariaLabel}">
  <defs>
    ${gradDefs}
    ${sheen.clipDef}
  </defs>
  <style>
    .q-txt {
      font-family: ${SYSTEM_FONT_STACK};
      font-size: ${fontSize}px;
      font-weight: ${textWeight};
      letter-spacing: -0.01em;
    }
    .q-author {
      font-family: ${SYSTEM_FONT_STACK};
      font-size: ${authorFontSize}px;
      font-weight: 600;
      letter-spacing: -0.01em;
      ${authorStyle}
    }
  </style>
  ${surfaceLayers}
  ${contentMarkup}
  ${sheen.overlay}
</svg>`;
}
