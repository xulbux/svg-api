/**
 * SVG renderer – Single Source of Truth generator for all 6 badge/button variants, micro-animations, and special elements.
 */

import { BASE_DARK, DOT_COLORS, THEMES } from '@/config/theme';
import type {
  AnimationMode,
  BadgeRenderOptions,
  BadgeSpecialElement,
  BadgeVariant,
  DotState,
  ResolvedIcon,
  StripTickState,
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
  /** Measured width of the left-side label text in pixels. */
  labelWidth: number;
  /** Width of the left segment in pixels. */
  leftWidth: number;
  /** Width of the right segment in pixels. */
  rightWidth: number;
  /** Horizontal space reserved for the right-hand special element (including gap). */
  specialSpace: number;
  /** Width of the right-hand special element box in pixels. */
  specialWidth: number;
  /** Total width of the badge SVG in pixels. */
  totalWidth: number;
  /** Measured width of the right-side value text in pixels. */
  valueWidth: number;
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

/** Icons that automatically receive a smooth 360-degree continuous rotation in `'auto'` mode. */
const AUTO_SPIN_ICONS: ReadonlySet<string> = new Set([
  'cog',
  'compass',
  'disc',
  'fan',
  'loader',
  'loader-circle',
  'orbit',
  'refresh-ccw',
  'refresh-cw',
  'rotate-ccw',
  'rotate-cw',
  'settings',
]);

/** Icons that automatically scale up briefly and shake back-and-forth while scaled up in `'auto'` mode. */
const AUTO_SHAKE_ICONS: ReadonlySet<string> = new Set([
  'alert-triangle',
  'bell',
  'bug',
  'flame',
  'heart',
  'party-popper',
  'shield-alert',
  'sparkles',
  'star',
  'triangle-alert',
  'trophy',
  'wand-sparkles',
  'zap',
]);

/** Directional nudge vectors (`[dx, dy]` in 24x24 icon units) for action icons in `'auto'` mode. */
const AUTO_NUDGE_VECTORS: Readonly<Record<string, readonly [dx: number, dy: number]>> = {
  'arrow-down': [0, 2.2],
  'arrow-right': [2.2, 0],
  'arrow-up': [0, -2.2],
  'arrow-up-right': [1.8, -1.8],
  'chevron-down': [0, 2.2],
  'chevron-right': [2.2, 0],
  'chevron-up': [0, -2.2],
  download: [0, 2.2],
  'external-link': [1.8, -1.8],
  'fast-forward': [2.2, 0],
  'log-in': [2.2, 0],
  play: [2, 0],
  rocket: [1.8, -1.8],
  send: [2, -1.5],
  terminal: [1.8, 0],
  'trending-up': [1.8, -1.8],
  upload: [0, -2.2],
};

/** Critical dot color states that use an urgent fast outward radar beacon. */
const CRITICAL_DOT_STATES: ReadonlySet<DotState> = new Set(['fuchsia', 'pink', 'red', 'rose']);

/** Warning dot color states that use a medium double-pulse outward radar ripple. */
const WARNING_DOT_STATES: ReadonlySet<DotState> = new Set(['amber', 'orange', 'yellow']);

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
 * Normalize `BadgeRenderOptions` into a single active right-compartment `BadgeSpecialElement` (if any).
 */
export function resolveSpecialElement(
  options: BadgeRenderOptions
): BadgeSpecialElement | undefined {
  if (options.special) {
    return options.special;
  }
  if (Array.isArray(options.sparkline) && options.sparkline.length >= 2) {
    return { type: 'sparkline', values: options.sparkline };
  }
  if (typeof options.bar === 'number' && Number.isFinite(options.bar)) {
    return { type: 'bar', value: options.bar };
  }
  if (typeof options.ring === 'number' && Number.isFinite(options.ring)) {
    return { type: 'ring', value: options.ring };
  }
  if (Array.isArray(options.strip) && options.strip.length > 0) {
    return { states: options.strip, type: 'strip' };
  }
  if (typeof options.delta === 'string' && options.delta.trim().length > 0) {
    return { type: 'delta', value: options.delta.trim() };
  }
  return undefined;
}

/** Check whether a delta string is a bare direction keyword without a numeric label. */
function isDirectionKeywordOnly(deltaValue: string): boolean {
  const lower = deltaValue.toLowerCase();
  return lower === 'up' || lower === 'down' || lower === 'flat';
}

/** Measure the horizontal width in pixels required by the active special element. */
function measureSpecialElementWidth(
  special: BadgeSpecialElement | undefined,
  fontSize: number
): number {
  if (!special) {
    return 0;
  }
  switch (special.type) {
    case 'sparkline': {
      return special.values.length >= 2 ? 36 : 0;
    }
    case 'bar': {
      return 32;
    }
    case 'ring': {
      return 12;
    }
    case 'strip': {
      const tickCount = Math.min(10, Math.max(1, special.states.length));
      return Math.ceil(tickCount * 2.5 + (tickCount - 1) * 2);
    }
    case 'delta': {
      return isDirectionKeywordOnly(special.value)
        ? 10
        : 13 + measureTextWidth(special.value, fontSize - 0.5, true);
    }
    default: {
      return 0;
    }
  }
}

/**
 * Compute SVG `<polyline>` and closed `<polygon>` area coordinate pairs for an inline sparkline.
 * Centers the `height - 2` stroke range vertically inside the `height` box (`startY + 1` to `startY + height - 1`).
 */
function buildSparklineGeometry(
  values: number[],
  startX: number,
  startY: number,
  width: number,
  height: number
): SparklineGeometry | undefined {
  if (values.length < 2) {
    return undefined;
  }
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const strokeHeight = height - 2;
  const strokeTopY = startY + 1;
  const coordinates: string[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const val = values[i];
    const pointX = startX + (i / (values.length - 1)) * width;
    const pointY = strokeTopY + strokeHeight - ((val - minVal) / range) * strokeHeight;
    coordinates.push(`${pointX.toFixed(1)},${pointY.toFixed(1)}`);
  }

  const linePoints = coordinates.join(' ');
  const baselineY = (startY + height).toFixed(1);
  const startXFormatted = startX.toFixed(1);
  const endXFormatted = (startX + width).toFixed(1);
  const areaPoints = `${startXFormatted},${baselineY} ${linePoints} ${endXFormatted},${baselineY}`;

  return { areaPoints, linePoints };
}

/** Resolve the right-hand value text color for a badge variant. */
function resolveValueColor(variant: BadgeVariant, palette: ThemePalette): string {
  return variant === '1' || variant === 'b1' ? '#ffffff' : palette.accentText;
}

/** Resolve the left-side label text color for the active variant. */
function resolveLabelColor(variant: BadgeVariant, isPrimarySolid: boolean): string {
  if (isPrimarySolid) {
    return '#ffffff';
  }
  if (variant === '3' || variant === 'b3') {
    return BASE_DARK.textMuted;
  }
  return BASE_DARK.textPrimary;
}

/** Wrap inner icon SVG paths with contextual or explicit SMIL micro-animation elements. */
function wrapIconWithAnimation(
  innerSvg: string,
  iconSlug: string | undefined,
  animMode: AnimationMode
): string {
  if (animMode === 'none') {
    return innerSvg;
  }
  const cleanSlug = (iconSlug ?? '').trim().toLowerCase();
  const isAuto = animMode === 'auto' || animMode === 'sheen';

  if (animMode === 'spin' || (isAuto && AUTO_SPIN_ICONS.has(cleanSlug))) {
    return `<g><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="3s" repeatCount="indefinite" />${innerSvg}</g>`;
  }

  if (animMode === 'shake' || (isAuto && AUTO_SHAKE_ICONS.has(cleanSlug))) {
    return `<g transform="translate(12, 12)"><g><animateTransform attributeName="transform" type="scale" values="1;1;1.15;1.15;1.15;1.15;1;1" keyTimes="0;0.62;0.70;0.76;0.82;0.88;0.95;1" dur="3.2s" repeatCount="indefinite" /><animateTransform attributeName="transform" type="rotate" values="0;0;-11;11;-9;7;0;0" keyTimes="0;0.62;0.70;0.76;0.82;0.88;0.95;1" dur="3.2s" additive="sum" repeatCount="indefinite" /><g transform="translate(-12, -12)">${innerSvg}</g></g></g>`;
  }

  const nudgeVector = AUTO_NUDGE_VECTORS[cleanSlug];
  if (animMode === 'nudge' || (isAuto && nudgeVector !== undefined)) {
    const [dx, dy] = nudgeVector ?? [2.2, 0];
    return `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 0;${dx} ${dy};0 0;0 0" keyTimes="0;0.65;0.78;0.92;1" dur="2.8s" repeatCount="indefinite" />${innerSvg}</g>`;
  }

  return innerSvg;
}

/** Render the SVG `<g>` markup for a resolved Lucide or Simple Icons icon. */
function renderIconMarkup(
  iconData: ResolvedIcon | undefined,
  iconSlug: string | undefined,
  iconX: number,
  iconY: number,
  iconSize: number,
  iconColor: string,
  animMode: AnimationMode
): string {
  if (!iconData) {
    return '';
  }
  const scale = (iconSize / 24).toFixed(4);
  const animatedInner = wrapIconWithAnimation(iconData.innerSvg, iconSlug, animMode);
  return iconData.type === 'lucide'
    ? `<g transform="translate(${iconX}, ${iconY}) scale(${scale})" fill="none" stroke="${iconColor}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${animatedInner}</g>`
    : `<g transform="translate(${iconX}, ${iconY}) scale(${scale})" fill="${iconColor}">${animatedInner}</g>`;
}

/**
 * Render the SVG markup for an animated status indicator dot with an outward-only radar ripple
 * whose cadence adapts to status severity.
 */
function renderDotMarkup(
  dot: DotState | undefined,
  dotCx: number,
  centerY: number,
  animMode: AnimationMode
): string {
  if (!dot || !(dot in DOT_COLORS)) {
    return '';
  }
  const dotHex = DOT_COLORS[dot];
  if (animMode === 'none') {
    return `<circle cx="${dotCx}" cy="${centerY}" r="3" fill="${dotHex}" />`;
  }

  if (CRITICAL_DOT_STATES.has(dot)) {
    return `
      <circle cx="${dotCx}" cy="${centerY}" r="2.6" fill="${dotHex}" opacity="0">
        <animate attributeName="r" values="2.6;7.2" dur="1.15s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.75;0" dur="1.15s" repeatCount="indefinite" />
      </circle>
      <circle cx="${dotCx}" cy="${centerY}" r="3" fill="${dotHex}">
        <animate attributeName="opacity" values="1;0.55;1" dur="1.15s" repeatCount="indefinite" />
      </circle>
    `;
  }

  if (WARNING_DOT_STATES.has(dot)) {
    return `
      <circle cx="${dotCx}" cy="${centerY}" r="2.6" fill="${dotHex}" opacity="0">
        <animate attributeName="r" values="2.6;6.4;2.6;6.8" keyTimes="0;0.45;0.46;1" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.65;0;0.5;0" keyTimes="0;0.45;0.46;1" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="${dotCx}" cy="${centerY}" r="3" fill="${dotHex}" />
    `;
  }

  return `
      <circle cx="${dotCx}" cy="${centerY}" r="2.6" fill="${dotHex}" opacity="0">
        <animate attributeName="r" values="2.6;6.8" dur="2.3s" calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0" dur="2.3s" calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1" repeatCount="indefinite" />
      </circle>
      <circle cx="${dotCx}" cy="${centerY}" r="3" fill="${dotHex}" />
    `;
}

/** Render an inline horizontal progress/capacity bar. */
function renderBarWidgetMarkup(
  percentValue: number,
  isSolidCapsule: boolean,
  palette: ThemePalette,
  specialX: number,
  height: number,
  specialWidth: number
): string {
  const clampedPct = Math.min(100, Math.max(0, percentValue));
  const barY = (height - 6) / 2;
  const trackFill = isSolidCapsule ? 'rgba(0,0,0,0.26)' : 'rgba(255,255,255,0.12)';
  const barFill = isSolidCapsule ? '#ffffff' : palette.accentText;
  const fillWidth =
    clampedPct <= 0 ? 0 : Math.max(4, Number(((clampedPct / 100) * specialWidth).toFixed(1)));
  const fillRect =
    fillWidth > 0
      ? `<rect x="${specialX}" y="${barY}" width="${fillWidth}" height="6" rx="3" fill="${barFill}" />`
      : '';
  return `<rect x="${specialX}" y="${barY}" width="${specialWidth}" height="6" rx="3" fill="${trackFill}" />${fillRect}`;
}

/** Render an inline `12x12px` circular ring/donut gauge. */
function renderRingWidgetMarkup(
  percentValue: number,
  isSolidCapsule: boolean,
  palette: ThemePalette,
  specialX: number,
  height: number
): string {
  const clampedPct = Math.min(100, Math.max(0, percentValue));
  const ringCx = specialX + 6;
  const ringCy = height / 2;
  const circumference = 28.27;
  const arcLength = Number(((clampedPct / 100) * circumference).toFixed(2));
  const trackStroke = isSolidCapsule ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.16)';
  const arcStroke = isSolidCapsule ? '#ffffff' : palette.accentText;
  return `<circle cx="${ringCx}" cy="${ringCy}" r="4.5" stroke="${trackStroke}" stroke-width="2" /><circle cx="${ringCx}" cy="${ringCy}" r="4.5" stroke="${arcStroke}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${arcLength} ${circumference}" transform="rotate(-90 ${ringCx} ${ringCy})" />`;
}

/** Resolve the fill color for a single tick in a segmented uptime strip. */
function resolveStripTickColor(state: StripTickState, isSolidCapsule: boolean): string {
  if (state === 'warn') {
    return isSolidCapsule ? '#fde68a' : THEMES.amber.accentText;
  }
  if (state === 'down') {
    return isSolidCapsule ? '#fecdd3' : THEMES.rose.accentText;
  }
  return isSolidCapsule ? '#ffffff' : THEMES.emerald.accentText;
}

/** Render a segmented uptime/health history strip. */
function renderStripWidgetMarkup(
  rawStates: StripTickState[],
  isSolidCapsule: boolean,
  specialX: number,
  height: number,
  animMode: AnimationMode
): string {
  const states = rawStates.slice(0, 10);
  const tickY = (height - 10) / 2;
  let ticksMarkup = '';
  for (let i = 0; i < states.length; i += 1) {
    const tickX = (specialX + i * 4.5).toFixed(1);
    const tickColor = resolveStripTickColor(states[i], isSolidCapsule);
    const isAnimatedLast = i === states.length - 1 && animMode !== 'none';
    ticksMarkup += isAnimatedLast
      ? `<rect x="${tickX}" y="${tickY}" width="2.5" height="10" rx="1.25" fill="${tickColor}"><animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" /></rect>`
      : `<rect x="${tickX}" y="${tickY}" width="2.5" height="10" rx="1.25" fill="${tickColor}" />`;
  }
  return ticksMarkup;
}

/** Render an inline trend delta arrow and optional delta label. */
function renderDeltaWidgetMarkup(
  rawValue: string,
  isSolidCapsule: boolean,
  specialX: number,
  height: number,
  fontSize: number,
  textY: number,
  specialWidth: number
): string {
  const rawDelta = rawValue.trim();
  const lower = rawDelta.toLowerCase();
  const isNegative = rawDelta.startsWith('-') || lower === 'down';
  const isFlat = rawDelta === '0' || rawDelta === '0%' || lower === 'flat';

  let deltaColor = isSolidCapsule ? '#ffffff' : THEMES.emerald.accentText;
  let arrowPath = 'M2.5 7.5L7.5 2.5M4 2.5H7.5V6';
  if (isNegative) {
    deltaColor = isSolidCapsule ? '#fecdd3' : THEMES.rose.accentText;
    arrowPath = 'M2.5 2.5L7.5 7.5M4 7.5H7.5V4';
  } else if (isFlat) {
    deltaColor = isSolidCapsule ? 'rgba(255,255,255,0.85)' : BASE_DARK.textMuted;
    arrowPath = 'M2 5H8M5.5 2.5L8 5L5.5 7.5';
  }

  const arrowY = (height - 10) / 2;
  const arrowMarkup = `<g transform="translate(${specialX}, ${arrowY})" fill="none" stroke="${deltaColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${arrowPath}" /></g>`;
  if (isDirectionKeywordOnly(rawDelta)) {
    return arrowMarkup;
  }
  const textWidth = specialWidth - 13;
  const textCenterX = Number((specialX + 13 + textWidth / 2).toFixed(2));
  const deltaFontSize = fontSize - 0.5;
  return `${arrowMarkup}<text x="${textCenterX}" y="${textY}" text-anchor="middle" fill="${deltaColor}" class="val" style="font-size:${deltaFontSize}px">${escapeXml(rawDelta)}</text>`;
}

/** Render the active right-compartment special element (`sparkline`, `bar`, `ring`, `strip`, or `delta`). */
function renderSpecialElementMarkup(
  special: BadgeSpecialElement | undefined,
  variant: BadgeVariant,
  color: BadgeRenderOptions['color'],
  palette: ThemePalette,
  specialX: number,
  height: number,
  fontSize: number,
  textY: number,
  specialWidth: number,
  animMode: AnimationMode
): string {
  if (!special || specialWidth <= 0) {
    return '';
  }
  const isSolidCapsule = variant === '1' || variant === 'b1';

  switch (special.type) {
    case 'sparkline': {
      const sparkY = (height - 11) / 2;
      const geometry = buildSparklineGeometry(special.values, specialX, sparkY, specialWidth, 11);
      if (!geometry) {
        return '';
      }
      const sparkStroke = isSolidCapsule ? 'rgba(255,255,255,0.92)' : palette.accentText;
      const sparkGradId = isSolidCapsule ? 'spark-fill-white' : `spark-fill-${color}`;
      return `<polygon points="${geometry.areaPoints}" fill="url(#${sparkGradId})" /><polyline points="${geometry.linePoints}" fill="none" stroke="${sparkStroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`;
    }
    case 'bar': {
      return renderBarWidgetMarkup(
        special.value,
        isSolidCapsule,
        palette,
        specialX,
        height,
        specialWidth
      );
    }
    case 'ring': {
      return renderRingWidgetMarkup(special.value, isSolidCapsule, palette, specialX, height);
    }
    case 'strip': {
      return renderStripWidgetMarkup(special.states, isSolidCapsule, specialX, height, animMode);
    }
    case 'delta': {
      return renderDeltaWidgetMarkup(
        special.value,
        isSolidCapsule,
        specialX,
        height,
        fontSize,
        textY,
        specialWidth
      );
    }
    default: {
      return '';
    }
  }
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

/**
 * Build the SVG `<path>` for Cloudflare Kumo's upper-edge 3D highlight crescent.
 * Uses a circular outer arc (`A r r`) and an elliptical inner return arc (`A r (r - 1)`) so the
 * highlight is `1px` thick along the top straight edge and tapers smoothly to `0px` around the
 * top corner curve without extending down the vertical sides.
 */
function buildTopCrescentPath(
  startX: number,
  endX: number,
  radiusX: number,
  hasRoundedLeftCorner: boolean
): string {
  const innerR = radiusX - 1;
  const innerRy = innerR - 1;
  const rightArcStart = endX - 1 - innerR;
  const rightTangentX = endX - 1;
  const cornerEndY = 1 + innerR;

  if (!hasRoundedLeftCorner) {
    const leftEdgeX = startX + 1;
    return `M ${leftEdgeX} 1 H ${rightArcStart} A ${innerR} ${innerR} 0 0 1 ${rightTangentX} ${cornerEndY} A ${innerR} ${innerRy} 0 0 0 ${rightArcStart} 2 H ${leftEdgeX} Z`;
  }

  const leftTangentX = startX + 1;
  const leftArcEnd = startX + 1 + innerR;
  return `M ${leftTangentX} ${cornerEndY} A ${innerR} ${innerR} 0 0 1 ${leftArcEnd} 1 H ${rightArcStart} A ${innerR} ${innerR} 0 0 1 ${rightTangentX} ${cornerEndY} A ${innerR} ${innerRy} 0 0 0 ${rightArcStart} 2 H ${leftArcEnd} A ${innerR} ${innerRy} 0 0 0 ${leftTangentX} ${cornerEndY} Z`;
}

/**
 * Render all background fills, upper-edge 3D Kumo crescents (on `v=b1`, `v=b2`, and the colored
 * part of `v=1`), and outer border rings for the active variant and split state.
 */
function renderSurfaceAndBorderLayers(
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

  // 1. Full-pill 3D Kumo Primary surface (v=b1 buttons and single-part v=1 badges).
  if (variant === 'b1' || (variant === '1' && !isSplit)) {
    const gradientBody = `<rect width="${totalWidth}" height="${height}" rx="${radiusX}" fill="${themeGradUrl}" />`;
    const topCrescent = `<path d="${buildTopCrescentPath(0, totalWidth, radiusX, true)}" fill="${palette.emphasisBg}" />`;
    const splitDivider = isSplit
      ? `<line x1="${leftWidth}" y1="5" x2="${leftWidth}" y2="${height - 5}" stroke="rgba(255,255,255,0.28)" stroke-width="1" />`
      : '';
    const outerRing = `<rect x="0.5" y="0.5" width="${totalWidth - 1}" height="${height - 1}" rx="${radiusX - 0.5}" stroke="${palette.emphasisRing}" stroke-width="1" />`;
    return `${gradientBody}${topCrescent}${splitDivider}${outerRing}`;
  }

  // 2. Split Primary Badge (v=1): flat dark slate left compartment + 3D Kumo colored right capsule.
  if (variant === '1' && isSplit) {
    const leftFillPath = `M ${leftWidth} 0 H ${radiusX} A ${radiusX} ${radiusX} 0 0 0 0 ${radiusX} V ${height - radiusX} A ${radiusX} ${radiusX} 0 0 0 ${radiusX} ${height} H ${leftWidth} Z`;
    const leftBorderPath = `M ${leftWidth} 0.5 H ${radiusX} A ${radiusX - 0.5} ${radiusX - 0.5} 0 0 0 0.5 ${radiusX} V ${height - radiusX} A ${radiusX - 0.5} ${radiusX - 0.5} 0 0 0 ${radiusX} ${height - 0.5} H ${leftWidth}`;

    const rightFillPath = `M ${leftWidth} 0 H ${totalWidth - radiusX} A ${radiusX} ${radiusX} 0 0 1 ${totalWidth} ${radiusX} V ${height - radiusX} A ${radiusX} ${radiusX} 0 0 1 ${totalWidth - radiusX} ${height} H ${leftWidth} Z`;
    const rightCrescentPath = buildTopCrescentPath(leftWidth, totalWidth, radiusX, false);
    const rightRingPath = `M ${leftWidth + 0.5} 0.5 H ${totalWidth - radiusX} A ${radiusX - 0.5} ${radiusX - 0.5} 0 0 1 ${totalWidth - 0.5} ${radiusX} V ${height - radiusX} A ${radiusX - 0.5} ${radiusX - 0.5} 0 0 1 ${totalWidth - radiusX} ${height - 0.5} H ${leftWidth + 0.5} Z`;

    return (
      `<path d="${leftFillPath}" fill="url(#bg-dark)" />` +
      `<path d="${leftBorderPath}" stroke="${BASE_DARK.borderNeutral}" stroke-width="1" />` +
      `<path d="${rightFillPath}" fill="${themeGradUrl}" />` +
      `<path d="${rightCrescentPath}" fill="${palette.emphasisBg}" />` +
      `<path d="${rightRingPath}" stroke="${palette.emphasisRing}" stroke-width="1" />`
    );
  }

  // 3. Secondary Button (v=b2): tinted dark surface + subtle Kumo upper-edge crescent + glowing border.
  if (variant === 'b2') {
    let layers = `<rect width="${totalWidth}" height="${height}" rx="${radiusX}" fill="url(#bg-dark)" />`;
    layers += `<rect width="${totalWidth}" height="${height}" rx="${radiusX}" fill="${palette.tintBg}" />`;
    layers += `<path d="${buildTopCrescentPath(0, totalWidth, radiusX, true)}" fill="${palette.borderColor}" />`;
    if (isSplit) {
      layers += `<line x1="${leftWidth}" y1="0" x2="${leftWidth}" y2="${height}" stroke="${palette.borderColor}" stroke-width="1" />`;
    }
    layers += `<rect x="0.5" y="0.5" width="${totalWidth - 1}" height="${height - 1}" rx="${radiusX - 0.5}" stroke="${palette.borderColor}" stroke-width="1" />`;
    return layers;
  }

  // 4. Flat Secondary Badge (v=2), Tertiary Badge (v=3), and Tertiary Button (v=b3).
  let layers = `<rect width="${totalWidth}" height="${height}" rx="${radiusX}" fill="url(#bg-dark)" />`;
  const outerBorder = variant === '2' ? palette.borderColor : BASE_DARK.borderNeutral;

  if (variant === '2' && !isSplit) {
    layers += `<rect width="${totalWidth}" height="${height}" rx="${radiusX}" fill="${palette.tintBg}" />`;
  } else if (isSplit) {
    if (variant === '2') {
      const rightCapsulePath = `M ${leftWidth} 0 H ${totalWidth - radiusX} A ${radiusX} ${radiusX} 0 0 1 ${totalWidth} ${radiusX} V ${height - radiusX} A ${radiusX} ${radiusX} 0 0 1 ${totalWidth - radiusX} ${height} H ${leftWidth} Z`;
      layers += `<path d="${rightCapsulePath}" fill="${palette.tintBg}" />`;
      layers += `<line x1="${leftWidth}" y1="0" x2="${leftWidth}" y2="${height}" stroke="${palette.borderColor}" stroke-width="1" />`;
    } else {
      layers += `<line x1="${leftWidth}" y1="4" x2="${leftWidth}" y2="${height - 4}" stroke="${BASE_DARK.borderNeutral}" stroke-width="1" />`;
    }
  }

  layers += `<rect x="0.5" y="0.5" width="${totalWidth - 1}" height="${height - 1}" rx="${radiusX - 0.5}" stroke="${outerBorder}" stroke-width="1" />`;
  return layers;
}

/** Render the optional periodic diagonal specular sheen overlay (`?anim=sheen`). */
function renderSheenOverlay(
  animMode: AnimationMode,
  totalWidth: number,
  height: number,
  radiusX: number
): { clipDef: string; overlay: string } {
  if (animMode !== 'sheen') {
    return { clipDef: '', overlay: '' };
  }
  const clipId = `sheen-clip-${totalWidth}-${height}`;
  const endTranslate = totalWidth + 50;
  const clipDef = `<clipPath id="${clipId}"><rect width="${totalWidth}" height="${height}" rx="${radiusX}" /></clipPath>`;
  const overlay = `<g clip-path="url(#${clipId})"><polygon points="-32,0 -12,0 -24,${height} -44,${height}" fill="rgba(255,255,255,0.22)"><animateTransform attributeName="transform" type="translate" values="0 0;${endTranslate} 0;${endTranslate} 0" keyTimes="0;0.22;1" dur="4.5s" repeatCount="indefinite" /></polygon></g>`;
  return { clipDef, overlay };
}

/** Compute horizontal compartment widths and spacing offsets for a badge or button. */
function computeBadgeLayout(
  labelText: string,
  valueText: string,
  hasDot: boolean,
  hasIcon: boolean,
  specialWidth: number,
  metrics: VariantMetrics,
  isButton: boolean
): BadgeLayout {
  const { fontSize, iconSize, padX } = metrics;
  const hasLabel = labelText.length > 0;
  const hasValue = valueText.length > 0;
  const hasSpecial = specialWidth > 0;

  const dotGap = hasIcon || hasLabel ? 6 : 0;
  const dotSpace = hasDot ? 7 + dotGap : 0;
  const iconGap = hasLabel ? 6 : 0;
  const iconSpace = hasIcon ? iconSize + iconGap : 0;

  const specialGap = hasValue ? 7 : 0;
  const specialSpace = hasSpecial ? specialWidth + specialGap : 0;

  const hasLeftContent = hasDot || hasIcon || hasLabel;
  const hasRightContent = hasValue || hasSpecial;

  const labelWidth = hasLabel ? measureTextWidth(labelText, fontSize, isButton) : 0;
  const leftWidth = hasLeftContent ? padX + dotSpace + iconSpace + labelWidth + padX : 0;

  const valueWidth = hasValue ? measureTextWidth(valueText, fontSize, true) : 0;
  const rightWidth = hasRightContent ? padX + specialSpace + valueWidth + padX : 0;
  const totalWidth = leftWidth + rightWidth || padX * 2;
  const isSplit = leftWidth > 0 && rightWidth > 0;

  return {
    dotSpace,
    iconSpace,
    isSplit,
    labelWidth,
    leftWidth,
    rightWidth,
    specialSpace,
    specialWidth,
    totalWidth,
    valueWidth,
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
 * @param options   Badge rendering configuration (label, value, color, variant, icon, dot, special, anim).
 * @returns Complete SVG markup string.
 */
export function renderBadge(options: BadgeRenderOptions): string {
  const palette = THEMES[options.color] || THEMES.indigo;
  const animMode: AnimationMode = options.anim ?? 'auto';
  const isButton = options.variant.startsWith('b');
  const metrics = isButton ? BUTTON_METRICS : BADGE_METRICS;
  const { fontSize, fontWeight, height, iconSize, padX, radiusX } = metrics;

  const labelText = options.label;
  const valueText = options.value ?? '';
  const hasLabel = labelText.length > 0;
  const hasValue = valueText.length > 0;

  const iconData = resolveIcon(options.icon);
  const dotMarkup = renderDotMarkup(options.dot, padX + 3.5, height / 2, animMode);
  const specialElement = resolveSpecialElement(options);
  const specialWidth = measureSpecialElementWidth(specialElement, fontSize);

  const layout = computeBadgeLayout(
    labelText,
    valueText,
    dotMarkup.length > 0,
    Boolean(iconData),
    specialWidth,
    metrics,
    isButton
  );
  const {
    dotSpace,
    iconSpace,
    isSplit,
    labelWidth,
    leftWidth,
    rightWidth,
    specialSpace,
    totalWidth,
    valueWidth,
  } = layout;

  const centerY = height / 2;
  const textY = Math.round(centerY + fontSize * 0.35);

  const iconX = padX + dotSpace;
  const iconY = (height - iconSize) / 2;
  const labelX = padX + dotSpace + iconSpace;
  const labelCenterX = Number((labelX + labelWidth / 2).toFixed(2));
  const specialX = leftWidth + padX;
  const valueX = leftWidth + padX + specialSpace;
  const valueCenterX = Number((valueX + valueWidth / 2).toFixed(2));

  const isPrimarySolid = options.variant === 'b1' || (options.variant === '1' && !isSplit);
  const iconStrokeOrFill = isPrimarySolid ? '#ffffff' : palette.iconColor;
  const labelColor = resolveLabelColor(options.variant, isPrimarySolid);
  const valueColor = resolveValueColor(options.variant, palette);
  const gradId = `grad-${options.color}`;

  const iconMarkup = renderIconMarkup(
    iconData,
    options.icon,
    iconX,
    iconY,
    iconSize,
    iconStrokeOrFill,
    animMode
  );
  const specialMarkup = renderSpecialElementMarkup(
    specialElement,
    options.variant,
    options.color,
    palette,
    specialX,
    height,
    fontSize,
    textY,
    specialWidth,
    animMode
  );
  const hasSparkline = specialElement?.type === 'sparkline' && specialElement.values.length >= 2;
  const sparkGradDef = renderSparklineGradientDef(
    hasSparkline,
    options.variant,
    options.color,
    palette
  );
  const surfaceAndBorderLayers = renderSurfaceAndBorderLayers(
    options.variant,
    options.color,
    palette,
    totalWidth,
    leftWidth,
    rightWidth,
    height,
    radiusX
  );
  const sheen = renderSheenOverlay(animMode, totalWidth, height, radiusX);
  const labelMarkup = hasLabel
    ? `<text x="${labelCenterX}" y="${textY}" text-anchor="middle" fill="${labelColor}" class="txt">${escapeXml(labelText)}</text>`
    : '';
  const valueMarkup = hasValue
    ? `<text x="${valueCenterX}" y="${textY}" text-anchor="middle" fill="${valueColor}" class="val">${escapeXml(valueText)}</text>`
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
    ${sparkGradDef}
    ${sheen.clipDef}
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
  ${surfaceAndBorderLayers}
  ${dotMarkup}${iconMarkup}${labelMarkup}${specialMarkup}${valueMarkup}${sheen.overlay}
</svg>`;
}
