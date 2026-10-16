/**
 * SVG renderer – Single Source of Truth generator for all 6 badge/button variants and special elements.
 */

import { BASE_DARK, DOT_COLORS, THEMES } from '@/config/theme';
import type {
  BadgeRenderOptions,
  BadgeVariant,
  DotState,
  ResolvedIcon,
  ThemePalette,
} from '@/types';
import { resolveIcon } from './icons';
import { measureTextWidth } from './measure';

// ---------------------------------------- TYPES ----------------------------------------

/** Base size dimensions for either a badge (`22px`) or a micro-button (`26px`). */
interface VariantMetrics {
  /** Font size in pixels. */
  fontSize: number;
  /** Font weight for the left-side label. */
  fontWeight: number;
  /** Total height of the SVG in pixels. */
  height: number;
  /** Width and height of the icon in pixels. */
  iconSize: number;
  /** Horizontal padding in pixels. */
  padX: number;
  /** Corner border radius in pixels. */
  radiusX: number;
}

/** Sparkline polyline and closed area polygon coordinate strings. */
interface SparklineGeometry {
  /** Closed polygon points for the vertical area gradient fill under the sparkline. */
  areaPoints: string;
  /** Polyline points for the top stroke of the sparkline. */
  linePoints: string;
}

/** Horizontal layout dimensions for left and right badge segments. */
interface BadgeLayout {
  /** Horizontal space reserved for the pulsing status dot. */
  dotSpace: number;
  /** Horizontal space reserved for the icon. */
  iconSpace: number;
  /** Whether the badge is split into both a left and a right compartment. */
  isSplit: boolean;
  /** Width of the left segment in pixels. */
  leftWidth: number;
  /** Width of the right segment in pixels. */
  rightWidth: number;
  /** Horizontal space reserved for the sparkline. */
  sparkSpace: number;
  /** Width of the sparkline box in pixels. */
  sparkWidth: number;
  /** Total width of the badge SVG in pixels. */
  totalWidth: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Size metrics for standard `22px` badges (`v=1`, `v=2`, `v=3`). */
const BADGE_METRICS: VariantMetrics = {
  fontSize: 11,
  fontWeight: 500,
  height: 22,
  iconSize: 13,
  padX: 9,
  radiusX: 6,
};

/** Size metrics for `26px` micro-buttons (`v=b1`, `v=b2`, `v=b3`). */
const BUTTON_METRICS: VariantMetrics = {
  fontSize: 11.5,
  fontWeight: 600,
  height: 26,
  iconSize: 14,
  padX: 11,
  radiusX: 7,
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches `&` for XML escaping. */
const AMP_RX = /&/g;

/** Matches `<` for XML escaping. */
const LT_RX = /</g;

/** Matches `>` for XML escaping. */
const GT_RX = />/g;

/** Matches `"` for XML escaping. */
const QUOT_RX = /"/g;

/** Matches `'` for XML escaping. */
const APOS_RX = /'/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Escape special characters for safe inclusion in SVG XML text and attributes. */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(AMP_RX, '&amp;')
    .replace(LT_RX, '&lt;')
    .replace(GT_RX, '&gt;')
    .replace(QUOT_RX, '&quot;')
    .replace(APOS_RX, '&#039;');
}

/**
 * Compute SVG `<polyline>` and closed `<polygon>` area coordinate pairs for an inline sparkline.
 * @param values   Numeric series points (at least 2 values).
 * @param startX   Left X offset of the sparkline box.
 * @param startY   Top Y offset of the sparkline box.
 * @param width    Width of the sparkline box in pixels.
 * @param height   Total height of the sparkline box in pixels.
 * @returns Polyline and closed polygon coordinate strings, or `undefined` if fewer than 2 points.
 */
function buildSparklineGeometry(
  values: number[] | undefined,
  startX: number,
  startY: number,
  width: number,
  height: number
): SparklineGeometry | undefined {
  if (!Array.isArray(values) || values.length < 2) {
    return undefined;
  }
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const strokeHeight = height - 2;
  const coordinates: string[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const val = values[i];
    const pointX = startX + (i / (values.length - 1)) * width;
    const pointY = startY + strokeHeight - ((val - minVal) / range) * strokeHeight;
    coordinates.push(`${pointX.toFixed(1)},${pointY.toFixed(1)}`);
  }

  const linePoints = coordinates.join(' ');
  const baselineY = (startY + height).toFixed(1);
  const startXFormatted = startX.toFixed(1);
  const endXFormatted = (startX + width).toFixed(1);
  const areaPoints = `${startXFormatted},${baselineY} ${linePoints} ${endXFormatted},${baselineY}`;

  return { areaPoints, linePoints };
}

/** Resolve the outer 1px border stroke color for a badge variant. */
function resolveOuterBorder(
  variant: BadgeVariant,
  palette: ThemePalette,
  isPrimarySolid: boolean
): string {
  if (isPrimarySolid) {
    return 'rgba(255,255,255,0.22)';
  }
  if (variant === '2' || variant === 'b2') {
    return palette.borderColor;
  }
  return BASE_DARK.borderNeutral;
}

/** Resolve the right-hand value text color for a badge variant. */
function resolveValueColor(variant: BadgeVariant, palette: ThemePalette): string {
  return variant === '1' || variant === 'b1' ? '#ffffff' : palette.accentText;
}

/** Render the SVG `<g>` markup for a resolved Lucide or Simple Icons icon. */
function renderIconMarkup(
  iconData: ResolvedIcon | undefined,
  iconX: number,
  iconY: number,
  iconSize: number,
  iconColor: string
): string {
  if (!iconData) {
    return '';
  }
  const scale = (iconSize / 24).toFixed(4);
  return iconData.type === 'lucide'
    ? `<g transform="translate(${iconX}, ${iconY}) scale(${scale})" fill="none" stroke="${iconColor}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${iconData.innerSvg}</g>`
    : `<g transform="translate(${iconX}, ${iconY}) scale(${scale})" fill="${iconColor}">${iconData.innerSvg}</g>`;
}

/** Render the SVG markup for an animated pulsing status indicator dot. */
function renderDotMarkup(dot: DotState | undefined, dotCx: number, centerY: number): string {
  if (!dot || !(dot in DOT_COLORS)) {
    return '';
  }
  const dotHex = DOT_COLORS[dot];
  return `
      <circle cx="${dotCx}" cy="${centerY}" r="3.5" fill="${dotHex}" opacity="0.35">
        <animate attributeName="r" values="3.5;6.5;3.5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.45;0;0.45" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="${dotCx}" cy="${centerY}" r="3" fill="${dotHex}" />
    `;
}

/** Render the SVG `<polygon>` area fill and `<polyline>` stroke for an inline mini-sparkline. */
function renderSparklineMarkup(
  sparkline: number[] | undefined,
  variant: BadgeVariant,
  color: BadgeRenderOptions['color'],
  palette: ThemePalette,
  sparkX: number,
  sparkY: number,
  sparkWidth: number
): string {
  const geometry = buildSparklineGeometry(sparkline, sparkX, sparkY, sparkWidth, 11);
  if (!geometry) {
    return '';
  }
  const isSolidCapsule = variant === '1' || variant === 'b1';
  const sparkStroke = isSolidCapsule ? 'rgba(255,255,255,0.92)' : palette.accentText;
  const sparkGradId = isSolidCapsule ? 'spark-fill-white' : `spark-fill-${color}`;
  return `<polygon points="${geometry.areaPoints}" fill="url(#${sparkGradId})" /><polyline points="${geometry.linePoints}" fill="none" stroke="${sparkStroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`;
}

/** Render the `<linearGradient>` definition for the sparkline area fill when active. */
function renderSparklineGradientDef(
  hasSparkline: boolean,
  variant: BadgeVariant,
  color: BadgeRenderOptions['color'],
  palette: ThemePalette
): string {
  if (!hasSparkline) {
    return '';
  }
  const isSolidCapsule = variant === '1' || variant === 'b1';
  const sparkGradId = isSolidCapsule ? 'spark-fill-white' : `spark-fill-${color}`;
  const stopColor = isSolidCapsule ? '#ffffff' : palette.accentText;
  return `<linearGradient id="${sparkGradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${stopColor}" stop-opacity="0.38" />
      <stop offset="100%" stop-color="${stopColor}" stop-opacity="0" />
    </linearGradient>`;
}

/** Render background pill and right-hand value capsule SVG layers for the active variant. */
function renderBackgroundLayers(
  variant: BadgeVariant,
  color: BadgeRenderOptions['color'],
  palette: ThemePalette,
  totalWidth: number,
  leftWidth: number,
  rightWidth: number,
  height: number,
  radiusX: number
): string {
  const themeGradUrl = `url(#grad-${color})`;
  const isSplit = leftWidth > 0 && rightWidth > 0;

  if (variant === 'b1' || (variant === '1' && !isSplit)) {
    const baseRect = `<rect width="${totalWidth}" height="${height}" rx="${radiusX}" fill="${themeGradUrl}" />`;
    return isSplit
      ? `${baseRect}<line x1="${leftWidth}" y1="5" x2="${leftWidth}" y2="${height - 5}" stroke="rgba(255,255,255,0.28)" stroke-width="1" />`
      : baseRect;
  }

  let bgLayers = `<rect width="${totalWidth}" height="${height}" rx="${radiusX}" fill="url(#bg-dark)" />`;

  if (variant === 'b2' || (variant === '2' && !isSplit)) {
    bgLayers += `<rect width="${totalWidth}" height="${height}" rx="${radiusX}" fill="${palette.tintBg}" />`;
    if (isSplit) {
      bgLayers += `<line x1="${leftWidth}" y1="0" x2="${leftWidth}" y2="${height}" stroke="${palette.borderColor}" stroke-width="1" />`;
    }
    return bgLayers;
  }

  if (!isSplit) {
    return bgLayers;
  }

  const rightCapsulePath = `M ${leftWidth} 0 H ${totalWidth - radiusX} A ${radiusX} ${radiusX} 0 0 1 ${totalWidth} ${radiusX} V ${height - radiusX} A ${radiusX} ${radiusX} 0 0 1 ${totalWidth - radiusX} ${height} H ${leftWidth} Z`;

  if (variant === '1') {
    bgLayers += `<path d="${rightCapsulePath}" fill="${themeGradUrl}" />`;
  } else if (variant === '2') {
    bgLayers += `<path d="${rightCapsulePath}" fill="${palette.tintBg}" />`;
    bgLayers += `<line x1="${leftWidth}" y1="0" x2="${leftWidth}" y2="${height}" stroke="${palette.borderColor}" stroke-width="1" />`;
  } else {
    bgLayers += `<line x1="${leftWidth}" y1="4" x2="${leftWidth}" y2="${height - 4}" stroke="${BASE_DARK.borderNeutral}" stroke-width="1" />`;
  }

  return bgLayers;
}

/** Resolve the left-side label text color for the active variant and split state. */
function resolveLabelColor(
  variant: BadgeVariant,
  isPrimarySolid: boolean,
  isSplit: boolean
): string {
  if (isPrimarySolid) {
    return '#ffffff';
  }
  if (variant === '3' && isSplit) {
    return BASE_DARK.textMuted;
  }
  return BASE_DARK.textPrimary;
}

/** Compute horizontal compartment widths and spacing offsets for a badge or button. */
function computeBadgeLayout(
  labelText: string,
  valueText: string,
  hasDot: boolean,
  hasIcon: boolean,
  hasSparkline: boolean,
  metrics: VariantMetrics,
  isButton: boolean
): BadgeLayout {
  const { fontSize, iconSize, padX } = metrics;
  const hasLabel = labelText.length > 0;
  const hasValue = valueText.length > 0;

  const dotGap = hasIcon || hasLabel ? 6 : 0;
  const dotSpace = hasDot ? 7 + dotGap : 0;
  const iconGap = hasLabel ? 6 : 0;
  const iconSpace = hasIcon ? iconSize + iconGap : 0;

  const sparkWidth = hasSparkline ? 36 : 0;
  const sparkGap = hasValue ? 8 : 0;
  const sparkSpace = hasSparkline ? sparkWidth + sparkGap : 0;

  const hasLeftContent = hasDot || hasIcon || hasLabel;
  const hasRightContent = hasValue || hasSparkline;

  const labelWidth = hasLabel ? measureTextWidth(labelText, fontSize, isButton) : 0;
  const leftWidth = hasLeftContent ? padX + dotSpace + iconSpace + labelWidth + padX : 0;

  const valueWidth = hasValue ? measureTextWidth(valueText, fontSize, true) : 0;
  const rightWidth = hasRightContent ? padX + sparkSpace + valueWidth + padX : 0;
  const totalWidth = leftWidth + rightWidth || padX * 2;
  const isSplit = leftWidth > 0 && rightWidth > 0;

  return {
    dotSpace,
    iconSpace,
    isSplit,
    leftWidth,
    rightWidth,
    sparkSpace,
    sparkWidth,
    totalWidth,
  };
}

/** Build the accessible `aria-label` string for the rendered SVG element. */
function buildAriaLabel(
  labelText: string,
  valueText: string,
  fallbackName: string | undefined
): string {
  if (labelText.length > 0 && valueText.length > 0) {
    return `${escapeXml(labelText)}: ${escapeXml(valueText)}`;
  }
  if (labelText.length > 0) {
    return escapeXml(labelText);
  }
  if (valueText.length > 0) {
    return escapeXml(valueText);
  }
  return escapeXml(fallbackName || 'badge');
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render a complete badge or micro-button SVG string from `BadgeRenderOptions`.
 * @param options   Badge rendering configuration (label, value, color, variant, icon, dot, sparkline).
 * @returns Complete SVG markup string.
 */
export function renderBadge(options: BadgeRenderOptions): string {
  const palette = THEMES[options.color] || THEMES.indigo;
  const isButton = options.variant.startsWith('b');
  const metrics = isButton ? BUTTON_METRICS : BADGE_METRICS;
  const { fontSize, fontWeight, height, iconSize, padX, radiusX } = metrics;

  const labelText = options.label;
  const valueText = options.value ?? '';
  const hasLabel = labelText.length > 0;
  const hasValue = valueText.length > 0;

  const iconData = resolveIcon(options.icon);
  const dotMarkup = renderDotMarkup(options.dot, padX + 3.5, height / 2);
  const hasSparkline = Array.isArray(options.sparkline) && options.sparkline.length >= 2;

  const layout = computeBadgeLayout(
    labelText,
    valueText,
    dotMarkup.length > 0,
    Boolean(iconData),
    hasSparkline,
    metrics,
    isButton
  );
  const {
    dotSpace,
    iconSpace,
    isSplit,
    leftWidth,
    rightWidth,
    sparkSpace,
    sparkWidth,
    totalWidth,
  } = layout;

  const centerY = height / 2;
  const textY = Math.round(centerY + fontSize * 0.35);

  const iconX = padX + dotSpace;
  const iconY = (height - iconSize) / 2;
  const labelX = padX + dotSpace + iconSpace;
  const sparkX = leftWidth + padX;
  const sparkY = (height - 11) / 2;
  const valueX = leftWidth + padX + sparkSpace;

  const isPrimarySolid = options.variant === 'b1' || (options.variant === '1' && !isSplit);
  const iconStrokeOrFill = isPrimarySolid ? '#ffffff' : palette.iconColor;
  const labelColor = resolveLabelColor(options.variant, isPrimarySolid, isSplit);
  const valueColor = resolveValueColor(options.variant, palette);
  const outerBorder = resolveOuterBorder(options.variant, palette, isPrimarySolid);
  const bevelHighlight = isPrimarySolid ? BASE_DARK.bevelHighlight : BASE_DARK.innerHighlight;
  const gradId = `grad-${options.color}`;
  const bevelId = isPrimarySolid ? 'bevel-pri' : 'bevel-sec';

  const iconMarkup = renderIconMarkup(iconData, iconX, iconY, iconSize, iconStrokeOrFill);
  const positionedSparkMarkup = renderSparklineMarkup(
    options.sparkline,
    options.variant,
    options.color,
    palette,
    sparkX,
    sparkY,
    sparkWidth
  );
  const sparkGradDef = renderSparklineGradientDef(
    hasSparkline,
    options.variant,
    options.color,
    palette
  );
  const bgLayers = renderBackgroundLayers(
    options.variant,
    options.color,
    palette,
    totalWidth,
    leftWidth,
    rightWidth,
    height,
    radiusX
  );
  const labelMarkup = hasLabel
    ? `<text x="${labelX}" y="${textY}" fill="${labelColor}" class="txt">${escapeXml(labelText)}</text>`
    : '';
  const valueMarkup = hasValue
    ? `<text x="${valueX}" y="${textY}" fill="${valueColor}" class="val">${escapeXml(valueText)}</text>`
    : '';
  const ariaLabel = buildAriaLabel(labelText, valueText, options.icon || options.dot);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" fill="none" role="img" aria-label="${ariaLabel}">
  <defs>
    <linearGradient id="bg-dark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BASE_DARK.bgTop}" />
      <stop offset="100%" stop-color="${BASE_DARK.bgBottom}" />
    </linearGradient>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.gradStart}" />
      <stop offset="100%" stop-color="${palette.gradEnd}" />
    </linearGradient>
    <linearGradient id="${bevelId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bevelHighlight}" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </linearGradient>
    ${sparkGradDef}
  </defs>
  <style>
    .txt {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: ${fontSize}px;
      font-weight: ${fontWeight};
      letter-spacing: -0.01em;
    }
    .val {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: ${fontSize}px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
  </style>
  ${bgLayers}
  <rect x="0.5" y="0.5" width="${totalWidth - 1}" height="${height - 1}" rx="${radiusX - 0.5}" stroke="url(#${bevelId})" stroke-width="1" />
  <rect x="0.5" y="0.5" width="${totalWidth - 1}" height="${height - 1}" rx="${radiusX - 0.5}" stroke="${outerBorder}" stroke-width="1" />
  ${dotMarkup}${iconMarkup}${labelMarkup}${positionedSparkMarkup}${valueMarkup}
</svg>`;
}
