/**
 * SVG renderer – Single Source of Truth generator for badges, micro-buttons, standalone icons, tech stacks, and quote cards (`svg.xul.is`).
 */

import { BASE_DARK, DOT_COLORS, THEMES } from '@/config/theme';
import type {
  AnimationMode,
  BadgeRenderOptions,
  BadgeSpecialElement,
  BadgeVariant,
  ButtonRenderOptions,
  ButtonSize,
  DotState,
  IconRenderOptions,
  ResolvedIcon,
  StripTickState,
  ThemePalette,
} from '@/types';
import { resolveIcon } from './icons';
import { measureTextWidth } from './measure';
import {
  buildTopCrescentPath,
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

/** Base size dimensions for a badge (`22px`) or a CTA button (`26px`–`42px`). */
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

/** Horizontal layout dimensions and coordinates for left and right badge segments. */
interface BadgeLayout {
  /** Center X coordinate of the pulsing status dot. */
  dotCx: number;
  /** Whether the badge is split into both a left and a right compartment. */
  isSplit: boolean;
  /** Center X coordinate of the left-side label text. */
  labelCenterX: number;
  /** Visual starting X coordinate of the leading icon. */
  leftIconX: number;
  /** Width of the left segment in pixels. */
  leftWidth: number;
  /** Visual starting X coordinate of the trailing icon. */
  rightIconX: number;
  /** Width of the right segment in pixels. */
  rightWidth: number;
  /** Width of the right-hand special element box in pixels. */
  specialWidth: number;
  /** Starting X coordinate of the right-hand special element. */
  specialX: number;
  /** Total width of the badge SVG in pixels. */
  totalWidth: number;
  /** Center X coordinate of the right-side value text. */
  valueCenterX: number;
}

/** Horizontal layout dimensions and coordinates for a CTA button. */
interface ButtonLayout {
  /** Center X coordinate of the pulsing status dot. */
  dotCx: number;
  /** Whether the button is split into both a left and a right compartment. */
  isSplit: boolean;
  /** Center X coordinate of the left-side label text. */
  labelCenterX: number;
  /** Visual starting X coordinate of the leading icon. */
  leftIconX: number;
  /** Width of the left segment in pixels. */
  leftWidth: number;
  /** Visual starting X coordinate of the trailing icon. */
  rightIconX: number;
  /** Total width of the button SVG in pixels. */
  totalWidth: number;
  /** Center X coordinate of the right-side value text. */
  valueCenterX: number;
}

/** Resolved left and right icon pair from `?icon=name`, `?icon=left,right`, or `?icon=none,right`. */
interface ResolvedIconPair {
  /** Resolved leading left-hand icon data. */
  leftData: ResolvedIcon | undefined;
  /** Leading left-hand icon slug. */
  leftSlug: string | undefined;
  /** Resolved trailing right-hand icon data. */
  rightData: ResolvedIcon | undefined;
  /** Trailing right-hand icon slug. */
  rightSlug: string | undefined;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default rendered size in pixels for standalone SVG icons (`svg.xul.is/icon/:icon`). */
const DEFAULT_ICON_SIZE = 24;

/** Minimum allowed size in pixels for standalone SVG icons. */
const MIN_ICON_SIZE = 8;

/** Maximum allowed size in pixels for standalone SVG icons. */
const MAX_ICON_SIZE = 256;

/** Default stroke width in 24x24 viewBox units for standalone Lucide SVG icons. */
const DEFAULT_ICON_STROKE_WIDTH = 2.25;

/** Minimum allowed stroke width for standalone Lucide SVG icons. */
const MIN_ICON_STROKE_WIDTH = 1;

/** Maximum allowed stroke width for standalone Lucide SVG icons. */
const MAX_ICON_STROKE_WIDTH = 4;

/** Size metrics for standard `22px` badges (`variant=1`, `variant=2`, `variant=3`). */
const BADGE_METRICS: VariantMetrics = {
  fontSize: 11,
  fontWeight: 500,
  height: 22,
  iconSize: 13,
  padX: 9,
  radiusX: 6,
};

/** Named size scale presets for CTA buttons (`/button/*` and `/btn/*`). */
const BUTTON_SIZE_PRESETS: Readonly<Record<ButtonSize, VariantMetrics>> = {
  lg: { fontSize: 14, fontWeight: 600, height: 36, iconSize: 17, padX: 18, radiusX: 11 },
  md: { fontSize: 12.5, fontWeight: 600, height: 30, iconSize: 15, padX: 14, radiusX: 9 },
  sm: { fontSize: 11.5, fontWeight: 600, height: 26, iconSize: 14, padX: 12, radiusX: 7 },
  xl: { fontSize: 15.5, fontWeight: 600, height: 42, iconSize: 19, padX: 22, radiusX: 13 },
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
  'party-popper',
  'shield-alert',
  'sparkles',
  'star',
  'triangle-alert',
  'trophy',
  'wand-sparkles',
  'zap',
]);

/** Icons that automatically receive a double-beat heartbeat scale pulse in `'auto'` mode. */
const AUTO_PULSE_ICONS: ReadonlySet<string> = new Set([
  'activity',
  'heart',
  'heart-handshake',
  'podcast',
  'radio',
  'wifi',
]);

/** Icons that automatically receive a smooth vertical levitation bob in `'auto'` mode. */
const AUTO_FLOAT_ICONS: ReadonlySet<string> = new Set([
  'box',
  'cloud',
  'feather',
  'ghost',
  'layers',
  'package',
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
const CRITICAL_DOT_STATES: ReadonlySet<DotState> = new Set(['red', 'rose']);

/** High-load / incident dot color states that use a fast double-pulse outward ripple + core pulse. */
const INCIDENT_DOT_STATES: ReadonlySet<DotState> = new Set(['orange']);

/** Warning dot color states that use a medium double-pulse outward radar ripple. */
const WARNING_DOT_STATES: ReadonlySet<DotState> = new Set(['amber', 'yellow']);

/** Active work / maintenance / deploying dot color states that use a smooth breathing core + soft halo. */
const ACTIVE_WORK_DOT_STATES: ReadonlySet<DotState> = new Set(['blue', 'cyan', 'indigo', 'sky']);

/** Standby / paused / idle dot color states that use a calm deep-sleep core breath without a radar ring. */
const STANDBY_DOT_STATES: ReadonlySet<DotState> = new Set([
  'gray',
  'neutral',
  'slate',
  'stone',
  'zinc',
]);

/** 10-stage smooth green -> lime -> yellow -> amber -> orange -> red -> rose palette for dark strip capsules. */
const STRIP_DARK_COLORS: Readonly<Record<StripTickState, string>> = {
  '0': '#ff4d6d',
  '1': '#ff6467',
  '2': '#ff8904',
  '3': '#ffb900',
  '4': '#fdc700',
  '5': '#ccda00',
  '6': '#9ae600',
  '7': '#52e339',
  '8': '#05df72',
  '9': '#00d294',
};

/** 10-stage high-contrast light tint palette for solid primary (`v=1`, `v=b1`) strip capsules. */
const STRIP_SOLID_COLORS: Readonly<Record<StripTickState, string>> = {
  '0': '#fecdd3',
  '1': '#fca5a5',
  '2': '#fdba74',
  '3': '#fde68a',
  '4': '#fef08a',
  '5': '#ecfccb',
  '6': '#d9f99d',
  '7': '#bbf7d0',
  '8': '#dcfce7',
  '9': '#ffffff',
};

// -------------------------------------- INTERNALS --------------------------------------

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
      return 13 + measureTextWidth(special.value, fontSize - 0.5, true);
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

/** Resolve the right-hand value text color for a badge or button variant. */
function resolveValueColor(variant: BadgeVariant, palette: ThemePalette): string {
  return variant === '1' ? '#ffffff' : palette.accentText;
}

/** Resolve the left-side label text color for the active variant. */
function resolveLabelColor(variant: BadgeVariant, isPrimarySolid: boolean): string {
  if (isPrimarySolid) {
    return '#ffffff';
  }
  if (variant === '3') {
    return BASE_DARK.textMuted;
  }
  return BASE_DARK.textPrimary;
}

/** Resolve the contextual motion preset for an icon slug when `auto` is requested. */
function resolveAutoIconMotion(cleanSlug: string): string | undefined {
  if (AUTO_SPIN_ICONS.has(cleanSlug)) {
    return 'spin';
  }
  if (AUTO_SHAKE_ICONS.has(cleanSlug)) {
    return 'shake';
  }
  if (AUTO_NUDGE_VECTORS[cleanSlug] !== undefined) {
    return 'nudge';
  }
  if (AUTO_PULSE_ICONS.has(cleanSlug)) {
    return 'pulse';
  }
  if (AUTO_FLOAT_ICONS.has(cleanSlug)) {
    return 'float';
  }
  return undefined;
}

/** Wrap inner icon SVG paths with contextual or explicit SMIL micro-animation elements. */
function wrapIconWithAnimation(
  innerSvg: string,
  iconSlug: string | undefined,
  iconMotion: string
): string {
  if (iconMotion === 'none' || iconMotion === 'default' || iconMotion === 'sheen') {
    return innerSvg;
  }
  const rawMode = iconMotion.startsWith('sheen,') ? iconMotion.slice(6) : iconMotion;
  const cleanSlug = (iconSlug ?? '').trim().toLowerCase();
  const motion = rawMode === 'auto' ? resolveAutoIconMotion(cleanSlug) : rawMode;

  switch (motion) {
    case 'spin': {
      return `<g><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="3s" repeatCount="indefinite" />${innerSvg}</g>`;
    }
    case 'shake': {
      return `<g transform="translate(12, 12)"><g><animateTransform attributeName="transform" type="scale" values="1;1;1.15;1.15;1.15;1.15;1;1" keyTimes="0;0.62;0.70;0.76;0.82;0.88;0.95;1" dur="3.2s" repeatCount="indefinite" /><animateTransform attributeName="transform" type="rotate" values="0;0;-11;11;-9;7;0;0" keyTimes="0;0.62;0.70;0.76;0.82;0.88;0.95;1" dur="3.2s" additive="sum" repeatCount="indefinite" /><g transform="translate(-12, -12)">${innerSvg}</g></g></g>`;
    }
    case 'nudge': {
      const [dx, dy] = AUTO_NUDGE_VECTORS[cleanSlug] ?? [2.2, 0];
      return `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 0;${dx} ${dy};0 0;0 0" keyTimes="0;0.65;0.78;0.92;1" dur="2.8s" repeatCount="indefinite" />${innerSvg}</g>`;
    }
    case 'pulse': {
      return `<g transform="translate(12, 12)"><g><animateTransform attributeName="transform" type="scale" values="1;1;1.18;0.96;1.14;1;1" keyTimes="0;0.58;0.68;0.76;0.84;0.94;1" dur="2.6s" repeatCount="indefinite" /><g transform="translate(-12, -12)">${innerSvg}</g></g></g>`;
    }
    case 'float': {
      return `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -1.5;0 0;0 1.2;0 0" keyTimes="0;0.28;0.55;0.80;1" dur="3.4s" repeatCount="indefinite" />${innerSvg}</g>`;
    }
    default: {
      return innerSvg;
    }
  }
}

/**
 * Resolve independent left and right icon motion tokens from `animMode`.
 * Supports explicit per-icon pairs (`anim="none,nudge"`, `anim="sheen,shake,nudge"`) as well as
 * smart single-token targeting when two icons are present (e.g., `icon="book-open,arrow-right"` with
 * `anim="nudge"` animates only the directional `arrow-right` icon).
 */
function resolveIconAnimationPair(
  animMode: AnimationMode,
  leftSlug: string | undefined,
  rightSlug: string | undefined,
  hasLeftIcon: boolean,
  hasRightIcon: boolean
): { leftMotion: string; rightMotion: string } {
  if (animMode === 'none' || animMode === 'default' || animMode === 'sheen') {
    return { leftMotion: 'none', rightMotion: 'none' };
  }
  const tokens = animMode
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t !== 'sheen');

  if (tokens.length === 0) {
    return { leftMotion: 'none', rightMotion: 'none' };
  }
  const [firstToken, secondToken] = tokens;
  if (tokens.length >= 2) {
    return { leftMotion: firstToken, rightMotion: secondToken };
  }

  if (firstToken === 'auto' || !hasLeftIcon || !hasRightIcon) {
    return { leftMotion: firstToken, rightMotion: firstToken };
  }

  const leftNatural = resolveAutoIconMotion((leftSlug ?? '').trim().toLowerCase());
  const rightNatural = resolveAutoIconMotion((rightSlug ?? '').trim().toLowerCase());
  if (rightNatural === firstToken && leftNatural !== firstToken) {
    return { leftMotion: 'none', rightMotion: firstToken };
  }
  if (leftNatural === firstToken && rightNatural !== firstToken) {
    return { leftMotion: firstToken, rightMotion: 'none' };
  }
  return firstToken === 'nudge'
    ? { leftMotion: 'none', rightMotion: firstToken }
    : { leftMotion: firstToken, rightMotion: 'none' };
}

/** Parse an icon specification (`'name'`, `'left,right'`, or `'none,right'`) into resolved left and right icons. */
function resolveIconPair(iconSpec: string | undefined): ResolvedIconPair {
  if (!iconSpec) {
    return { leftData: undefined, leftSlug: undefined, rightData: undefined, rightSlug: undefined };
  }
  const commaIdx = iconSpec.indexOf(',');
  if (commaIdx === -1) {
    const leftSlug = iconSpec.trim();
    return {
      leftData: resolveIcon(leftSlug),
      leftSlug,
      rightData: undefined,
      rightSlug: undefined,
    };
  }
  const leftSlug = iconSpec.slice(0, commaIdx).trim() || 'none';
  const rightSlug = iconSpec.slice(commaIdx + 1).trim() || 'none';
  return {
    leftData: resolveIcon(leftSlug),
    leftSlug,
    rightData: resolveIcon(rightSlug),
    rightSlug,
  };
}

/** Measure the true rendered horizontal width in pixels of a resolved icon (`(maxX - minX) * (iconSize / 24)`). */
function measureIconVisualWidth(iconData: ResolvedIcon | undefined, iconSize: number): number {
  if (!iconData) {
    return 0;
  }
  return Number(((iconData.maxX - iconData.minX) * (iconSize / 24)).toFixed(2));
}

/** Render the SVG `<g>` markup for a resolved Lucide or Simple Icons icon, aligned so its leftmost visible pixel starts at `visualStartX`. */
function renderIconMarkup(
  iconData: ResolvedIcon | undefined,
  iconSlug: string | undefined,
  visualStartX: number,
  iconY: number,
  iconSize: number,
  iconColor: string,
  iconMotion: string,
  opacity?: number
): string {
  if (!iconData) {
    return '';
  }
  const scaleNum = iconSize / 24;
  const scale = Number(scaleNum.toFixed(4));
  const translateX = Number((visualStartX - iconData.minX * scaleNum).toFixed(2));
  const opacityAttr = opacity !== undefined && opacity < 1 ? ` opacity="${opacity}"` : '';
  const animatedInner = wrapIconWithAnimation(iconData.innerSvg, iconSlug, iconMotion);
  return iconData.type === 'lucide'
    ? `<g transform="translate(${translateX}, ${iconY}) scale(${scale})" fill="none" stroke="${iconColor}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"${opacityAttr}>${animatedInner}</g>`
    : `<g transform="translate(${translateX}, ${iconY}) scale(${scale})" fill="${iconColor}"${opacityAttr}>${animatedInner}</g>`;
}

/**
 * Render the SVG markup for an animated status indicator dot with an outward-only radar ripple
 * or breathing pattern tailored to the status state.
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

  // 1. Critical / Offline (red, rose): urgent 1.15s outward beacon + core pulse.
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

  // 2. Incident / Overloaded (orange): faster 1.45s double-beat outward ripple + subtle core pulse.
  if (INCIDENT_DOT_STATES.has(dot)) {
    return `
      <circle cx="${dotCx}" cy="${centerY}" r="2.6" fill="${dotHex}" opacity="0">
        <animate attributeName="r" values="2.6;6.6;2.6;7.0" keyTimes="0;0.44;0.45;1" dur="1.45s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.72;0;0.55;0" keyTimes="0;0.44;0.45;1" dur="1.45s" repeatCount="indefinite" />
      </circle>
      <circle cx="${dotCx}" cy="${centerY}" r="3" fill="${dotHex}">
        <animate attributeName="opacity" values="1;0.68;1" dur="1.45s" repeatCount="indefinite" />
      </circle>
    `;
  }

  // 3. Degraded / Warning (amber, yellow): 1.8s double-beat outward radar ripple.
  if (WARNING_DOT_STATES.has(dot)) {
    return `
      <circle cx="${dotCx}" cy="${centerY}" r="2.6" fill="${dotHex}" opacity="0">
        <animate attributeName="r" values="2.6;6.4;2.6;6.8" keyTimes="0;0.45;0.46;1" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.65;0;0.5;0" keyTimes="0;0.45;0.46;1" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="${dotCx}" cy="${centerY}" r="3" fill="${dotHex}" />
    `;
  }

  // 4. Maintenance / Deploying / Syncing (sky, blue, cyan, indigo): active-work breathing core + soft outward halo.
  if (ACTIVE_WORK_DOT_STATES.has(dot)) {
    return `
      <circle cx="${dotCx}" cy="${centerY}" r="2.6" fill="${dotHex}" opacity="0">
        <animate attributeName="r" values="2.6;5.8" dur="2s" calcMode="spline" keyTimes="0;1" keySplines="0.25 1 0.5 1" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0" dur="2s" calcMode="spline" keyTimes="0;1" keySplines="0.25 1 0.5 1" repeatCount="indefinite" />
      </circle>
      <circle cx="${dotCx}" cy="${centerY}" r="3" fill="${dotHex}">
        <animate attributeName="r" values="2.4;3.2;2.4" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.75;1;0.75" dur="2s" repeatCount="indefinite" />
      </circle>
    `;
  }

  // 5. Standby / Paused / Idle (slate, gray, zinc, neutral, stone): calm 3.4s deep-sleep core breath without radar ring.
  if (STANDBY_DOT_STATES.has(dot)) {
    return `
      <circle cx="${dotCx}" cy="${centerY}" r="3" fill="${dotHex}">
        <animate attributeName="opacity" values="0.9;0.32;0.9" dur="3.4s" repeatCount="indefinite" />
      </circle>
    `;
  }

  // 6. Operational / Online & Beta / Preview (green, emerald, violet, purple, etc.): calm 2.3s outward spline wave.
  return `
      <circle cx="${dotCx}" cy="${centerY}" r="2.6" fill="${dotHex}" opacity="0">
        <animate attributeName="r" values="2.6;6.8" dur="2.3s" calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0" dur="2.3s" calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1" repeatCount="indefinite" />
      </circle>
      <circle cx="${dotCx}" cy="${centerY}" r="3" fill="${dotHex}" />
    `;
}

/**
 * Render an inline horizontal progress/capacity bar.
 * The empty track uses a dark translucent accent color, and the rightward shimmer wave is applied
 * directly as a fill on the filled `<rect>` so it can never enter the empty part of the bar.
 */
function renderBarWidgetMarkup(
  percentValue: number,
  hasPulse: boolean,
  isSolidCapsule: boolean,
  palette: ThemePalette,
  specialX: number,
  height: number,
  specialWidth: number
): string {
  const clampedPct = Math.min(100, Math.max(0, percentValue));
  const barY = (height - 6) / 2;
  const trackAttrs = isSolidCapsule
    ? 'fill="rgba(0,0,0,0.28)"'
    : `fill="${palette.accentText}" fill-opacity="0.20"`;
  const barFill = isSolidCapsule ? 'rgba(255,255,255,0.82)' : palette.accentText;
  const fillWidth =
    clampedPct <= 0 ? 0 : Math.max(4, Number(((clampedPct / 100) * specialWidth).toFixed(1)));
  if (fillWidth <= 0) {
    return `<rect x="${specialX}" y="${barY}" width="${specialWidth}" height="6" rx="3" ${trackAttrs} />`;
  }

  const baseRect = `<rect x="${specialX}" y="${barY}" width="${specialWidth}" height="6" rx="3" ${trackAttrs} /><rect x="${specialX}" y="${barY}" width="${fillWidth}" height="6" rx="3" fill="${barFill}" />`;
  if (!hasPulse) {
    return baseRect;
  }

  const gradId = `bar-shimmer-${specialX}-${isSolidCapsule ? 'w' : 'c'}`;
  const shimmerPeak = isSolidCapsule ? '0.95' : '0.52';
  const shimmerDef = `<defs><linearGradient id="${gradId}" x1="-0.75" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="#ffffff" stop-opacity="0" /><stop offset="50%" stop-color="#ffffff" stop-opacity="${shimmerPeak}" /><stop offset="100%" stop-color="#ffffff" stop-opacity="0" /><animate attributeName="x1" values="-0.75;1.05;1.05" keyTimes="0;0.54;1" calcMode="spline" keySplines="0.4 0 0.2 1;0 0 1 1" dur="2.3s" repeatCount="indefinite" /><animate attributeName="x2" values="0;1.8;1.8" keyTimes="0;0.54;1" calcMode="spline" keySplines="0.4 0 0.2 1;0 0 1 1" dur="2.3s" repeatCount="indefinite" /></linearGradient></defs>`;
  const shimmerRect = `<rect x="${specialX}" y="${barY}" width="${fillWidth}" height="6" rx="3" fill="url(#${gradId})" />`;
  return `${baseRect}${shimmerDef}${shimmerRect}`;
}

/**
 * Render an inline `12x12px` circular ring/donut gauge with a dark translucent accent track
 * and optional pulse.
 */
function renderRingWidgetMarkup(
  percentValue: number,
  hasPulse: boolean,
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
  const trackAttrs = isSolidCapsule
    ? 'stroke="rgba(0,0,0,0.28)"'
    : `stroke="${palette.accentText}" stroke-opacity="0.24"`;
  const arcStroke = isSolidCapsule ? 'rgba(255,255,255,0.85)' : palette.accentText;
  const pulseAnim = hasPulse
    ? '<animate attributeName="opacity" values="1;0.45;1" dur="2s" repeatCount="indefinite" />'
    : '';
  return `<circle cx="${ringCx}" cy="${ringCy}" r="4.5" ${trackAttrs} stroke-width="2" /><circle cx="${ringCx}" cy="${ringCy}" r="4.5" stroke="${arcStroke}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${arcLength} ${circumference}" transform="rotate(-90 ${ringCx} ${ringCy})">${pulseAnim}</circle>`;
}

/** Resolve the fill color for a single tick in a 10-stage (`0`–`9` or `down`/`warn`/`up`) segmented strip. */
function resolveStripTickColor(state: StripTickState, isSolidCapsule: boolean): string {
  return isSolidCapsule
    ? (STRIP_SOLID_COLORS[state] ?? '#ffffff')
    : (STRIP_DARK_COLORS[state] ?? THEMES.emerald.accentText);
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

/** Render an inline trend delta arrow and delta readout. */
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
  const isNegative = rawDelta.startsWith('-');
  const isFlat = rawDelta === '0' || rawDelta === '0%' || rawDelta === '+0%';

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
  const arrowOpacityAttr = isSolidCapsule ? ' opacity="0.82"' : '';
  const arrowMarkup = `<g transform="translate(${specialX}, ${arrowY})" fill="none" stroke="${deltaColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${arrowOpacityAttr}><path d="${arrowPath}" /></g>`;
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
  const isSolidCapsule = variant === '1';

  switch (special.type) {
    case 'sparkline': {
      const sparkY = (height - 11) / 2;
      const geometry = buildSparklineGeometry(special.values, specialX, sparkY, specialWidth, 11);
      if (!geometry) {
        return '';
      }
      const sparkStroke = isSolidCapsule ? 'rgba(255,255,255,0.86)' : palette.accentText;
      const sparkGradId = isSolidCapsule ? 'spark-fill-white' : `spark-fill-${color}`;
      return `<polygon points="${geometry.areaPoints}" fill="url(#${sparkGradId})" /><polyline points="${geometry.linePoints}" fill="none" stroke="${sparkStroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`;
    }
    case 'bar': {
      const hasBarShimmer = animMode !== 'none' && special.hasPulse !== false;
      return renderBarWidgetMarkup(
        special.value,
        hasBarShimmer,
        isSolidCapsule,
        palette,
        specialX,
        height,
        specialWidth
      );
    }
    case 'ring': {
      const hasRingPulse = animMode !== 'none' && Boolean(special.hasPulse);
      return renderRingWidgetMarkup(
        special.value,
        hasRingPulse,
        isSolidCapsule,
        palette,
        specialX,
        height
      );
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
  const isSolidCapsule = variant === '1';
  const sparkGradId = isSolidCapsule ? 'spark-fill-white' : `spark-fill-${color}`;
  const stopColor = isSolidCapsule ? '#ffffff' : palette.accentText;
  const topOpacity = isSolidCapsule ? '0.32' : '0.38';
  return `<linearGradient id="${sparkGradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${stopColor}" stop-opacity="${topOpacity}" />
      <stop offset="100%" stop-color="${stopColor}" stop-opacity="0" />
    </linearGradient>`;
}

/**
 * Render all background fills, upper-edge 3D Kumo crescents, and outer border rings for a `22px` badge.
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
  const themeGradId = `grad-${color}`;
  const isSplit = leftWidth > 0 && rightWidth > 0;
  const splitLineX = isSplit ? leftWidth : undefined;

  // 1. Single-part Primary badge (v=1): Kumo 3D brand gradient surface.
  if (variant === '1' && !isSplit) {
    return renderKumoBoxSurface(
      0,
      0,
      totalWidth,
      height,
      radiusX,
      '1',
      palette,
      themeGradId,
      splitLineX
    );
  }

  // 2. Split Primary Badge (v=1): neutral dark left compartment + 3D Kumo colored right capsule.
  if (variant === '1' && isSplit) {
    const leftFillPath = `M ${leftWidth} 0 H ${radiusX} A ${radiusX} ${radiusX} 0 0 0 0 ${radiusX} V ${height - radiusX} A ${radiusX} ${radiusX} 0 0 0 ${radiusX} ${height} H ${leftWidth} Z`;
    const leftBorderPath = `M ${leftWidth} 0.5 H ${radiusX} A ${radiusX - 0.5} ${radiusX - 0.5} 0 0 0 0.5 ${radiusX} V ${height - radiusX} A ${radiusX - 0.5} ${radiusX - 0.5} 0 0 0 ${radiusX} ${height - 0.5} H ${leftWidth}`;

    const rightFillPath = `M ${leftWidth} 0 H ${totalWidth - radiusX} A ${radiusX} ${radiusX} 0 0 1 ${totalWidth} ${radiusX} V ${height - radiusX} A ${radiusX} ${radiusX} 0 0 1 ${totalWidth - radiusX} ${height} H ${leftWidth} Z`;
    const rightCrescentPath = buildTopCrescentPath(leftWidth, totalWidth, radiusX, false);
    const rightRingPath = `M ${leftWidth + 0.5} 0.5 H ${totalWidth - radiusX} A ${radiusX - 0.5} ${radiusX - 0.5} 0 0 1 ${totalWidth - 0.5} ${radiusX} V ${height - radiusX} A ${radiusX - 0.5} ${radiusX - 0.5} 0 0 1 ${totalWidth - radiusX} ${height - 0.5} H ${leftWidth + 0.5} Z`;

    return (
      `<path d="${leftFillPath}" fill="url(#bg-dark)" />` +
      `<path d="${leftBorderPath}" stroke="${BASE_DARK.borderNeutral}" stroke-width="1" />` +
      `<path d="${rightFillPath}" fill="url(#${themeGradId})" />` +
      `<path d="${rightCrescentPath}" fill="${palette.emphasisBg}" />` +
      `<path d="${rightRingPath}" stroke="${palette.emphasisRing}" stroke-width="1" />`
    );
  }

  // 3. Flat Secondary and Tertiary Badges (v=2, v=3).
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

/** Resolve button geometry metrics (`height`, `fontSize`, `iconSize`, `padX`, `radiusX`) from `size`. */
function resolveButtonMetrics(sizeOption: ButtonSize | number | undefined): VariantMetrics {
  if (typeof sizeOption === 'string' && sizeOption in BUTTON_SIZE_PRESETS) {
    return BUTTON_SIZE_PRESETS[sizeOption];
  }
  if (typeof sizeOption === 'number' && Number.isFinite(sizeOption)) {
    const height = clampInt(sizeOption, 22, 48, 30);
    return {
      fontSize: Number((height * 0.415).toFixed(1)),
      fontWeight: 600,
      height,
      iconSize: Math.round(height * 0.5),
      padX: Math.round(height * 0.47),
      radiusX: Math.round(height * 0.3),
    };
  }
  return BUTTON_SIZE_PRESETS.md;
}

/** Pack non-zero item widths with `gap` between adjacent items and optical edge padding (`leftPad`, `rightPad`). */
function packCompartment(
  itemWidths: readonly number[],
  gap: number,
  leftPad: number,
  rightPad = leftPad,
  extraFirstGap = 0
): { offsets: number[]; width: number } {
  let rawWidth = 0;
  let activeCount = 0;
  for (const w of itemWidths) {
    if (w > 0) {
      if (activeCount > 0) {
        rawWidth += gap;
      }
      rawWidth += w;
      activeCount += 1;
    }
  }
  if (itemWidths[0] > 0 && activeCount > 1) {
    rawWidth += extraFirstGap;
  }
  if (activeCount === 0) {
    return { offsets: itemWidths.map(() => leftPad), width: 0 };
  }
  const width = Math.round(leftPad + rawWidth + rightPad);
  const roundDelta = (width - (leftPad + rawWidth + rightPad)) / 2;
  let cursor = leftPad + roundDelta;
  const offsets: number[] = [];
  for (let idx = 0; idx < itemWidths.length; idx += 1) {
    const w = itemWidths[idx];
    offsets.push(Number(cursor.toFixed(2)));
    if (w > 0) {
      cursor += w + gap + (idx === 0 ? extraFirstGap : 0);
    }
  }
  return { offsets, width };
}

/** Compute horizontal compartment widths and coordinate offsets for a `22px` badge. */
function computeBadgeLayout(
  labelText: string,
  valueText: string,
  hasDot: boolean,
  leftIconWidth: number,
  rightIconWidth: number,
  specialWidth: number,
  metrics: VariantMetrics
): BadgeLayout {
  const { fontSize, padX } = metrics;
  const innerGap = 6;
  const labelWidth = labelText.length > 0 ? measureTextWidth(labelText, fontSize, false) : 0;
  const valueWidth = valueText.length > 0 ? measureTextWidth(valueText, fontSize, true) : 0;
  const hasRightCompartment = valueWidth > 0 || specialWidth > 0;

  const leftPack = packCompartment(
    [hasDot ? 7 : 0, leftIconWidth, labelWidth, hasRightCompartment ? 0 : rightIconWidth],
    innerGap,
    padX,
    hasRightCompartment ? padX - 0.5 : padX
  );

  const rightPack = packCompartment(
    hasRightCompartment ? [specialWidth, valueWidth, rightIconWidth] : [0, 0, 0],
    innerGap,
    padX,
    padX,
    1
  );

  const leftWidth = leftPack.width;
  const rightWidth = rightPack.width;
  const totalWidth = leftWidth + rightWidth || padX * 2;
  const isSplit = leftWidth > 0 && rightWidth > 0;

  return {
    dotCx: Number((leftPack.offsets[0] + 3.5).toFixed(2)),
    isSplit,
    labelCenterX: Number((leftPack.offsets[2] + labelWidth / 2).toFixed(2)),
    leftIconX: leftPack.offsets[1],
    leftWidth,
    rightIconX: hasRightCompartment
      ? Number((leftWidth + rightPack.offsets[2]).toFixed(2))
      : leftPack.offsets[3],
    rightWidth,
    specialWidth,
    specialX: Number((leftWidth + rightPack.offsets[0]).toFixed(2)),
    totalWidth,
    valueCenterX: Number((leftWidth + rightPack.offsets[1] + valueWidth / 2).toFixed(2)),
  };
}

/** Compute horizontal compartment widths and coordinate offsets for a CTA button. */
function computeButtonLayout(
  labelText: string,
  valueText: string,
  hasDot: boolean,
  leftIconWidth: number,
  rightIconWidth: number,
  metrics: VariantMetrics
): ButtonLayout {
  const { fontSize, height, padX } = metrics;
  const isSplit = valueText.length > 0;
  const innerGap = Math.max(6, Math.round(height * 0.24));
  const labelWidth = labelText.length > 0 ? measureTextWidth(labelText, fontSize, true) : 0;
  const valueWidth = isSplit ? measureTextWidth(valueText, fontSize, true) : 0;

  const leftPack = packCompartment(
    [hasDot ? 7 : 0, leftIconWidth, labelWidth, isSplit ? 0 : rightIconWidth],
    innerGap,
    padX,
    padX
  );
  const leftWidth = leftPack.width || padX * 2;

  const rightPack = packCompartment(
    isSplit ? [valueWidth, rightIconWidth] : [0, 0],
    innerGap,
    padX,
    padX
  );
  const totalWidth = leftWidth + rightPack.width;

  return {
    dotCx: Number((leftPack.offsets[0] + 3.5).toFixed(2)),
    isSplit,
    labelCenterX: Number((leftPack.offsets[2] + labelWidth / 2).toFixed(2)),
    leftIconX: leftPack.offsets[1],
    leftWidth,
    rightIconX: isSplit
      ? Number((leftWidth + rightPack.offsets[1]).toFixed(2))
      : leftPack.offsets[3],
    totalWidth,
    valueCenterX: Number((leftWidth + rightPack.offsets[0] + valueWidth / 2).toFixed(2)),
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
 * Render a complete `22px` badge SVG string from `BadgeRenderOptions`.
 * @param options   Badge rendering configuration (label, value, color, variant, icon, dot, special, anim).
 * @returns Complete SVG markup string.
 */
export function renderBadge(options: BadgeRenderOptions): string {
  const palette = THEMES[options.color] || THEMES.indigo;
  const animMode: AnimationMode = options.anim ?? 'default';
  const metrics = BADGE_METRICS;
  const { fontSize, fontWeight, height, iconSize, radiusX } = metrics;

  const labelText = options.label;
  const valueText = options.value ?? '';
  const hasLabel = labelText.length > 0;
  const hasValue = valueText.length > 0;

  const { leftData, leftSlug, rightData, rightSlug } = resolveIconPair(options.icon);
  const leftIconWidth = measureIconVisualWidth(leftData, iconSize);
  const rightIconWidth = measureIconVisualWidth(rightData, iconSize);
  const hasDot = Boolean(options.dot && options.dot in DOT_COLORS);
  const specialElement = options.special;
  const specialWidth = measureSpecialElementWidth(specialElement, fontSize);

  const layout = computeBadgeLayout(
    labelText,
    valueText,
    hasDot,
    leftIconWidth,
    rightIconWidth,
    specialWidth,
    metrics
  );
  const {
    dotCx,
    isSplit,
    labelCenterX,
    leftIconX,
    leftWidth,
    rightIconX,
    rightWidth,
    specialX,
    totalWidth,
    valueCenterX,
  } = layout;

  const centerY = height / 2;
  const textY = Math.round(centerY + fontSize * 0.35);
  const iconY = (height - iconSize) / 2;
  const dotMarkup = renderDotMarkup(options.dot, dotCx, centerY, animMode);

  const isPrimarySolid = options.variant === '1' && !isSplit;
  const leftIconColor = isPrimarySolid ? '#ffffff' : palette.iconColor;
  const rightIconColor = options.variant === '1' ? '#ffffff' : palette.iconColor;
  const leftIconOpacity = isPrimarySolid ? 0.82 : undefined;
  const rightIconOpacity = options.variant === '1' ? 0.82 : undefined;
  const labelColor = resolveLabelColor(options.variant, isPrimarySolid);
  const valueColor = resolveValueColor(options.variant, palette);
  const gradId = `grad-${options.color}`;
  const { leftMotion, rightMotion } = resolveIconAnimationPair(
    animMode,
    leftSlug,
    rightSlug,
    Boolean(leftData),
    Boolean(rightData)
  );

  const leftIconMarkup = renderIconMarkup(
    leftData,
    leftSlug,
    leftIconX,
    iconY,
    iconSize,
    leftIconColor,
    leftMotion,
    leftIconOpacity
  );
  const rightIconMarkup = renderIconMarkup(
    rightData,
    rightSlug,
    rightIconX,
    iconY,
    iconSize,
    rightIconColor,
    rightMotion,
    rightIconOpacity
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
  const ariaLabel = buildAriaLabel(labelText, valueText, leftSlug || rightSlug || options.dot);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" fill="none" role="img" aria-label="${ariaLabel}">
  <defs>
    ${renderDarkBgGradientDef()}
    ${renderThemeGradientDef(gradId, palette)}
    ${sparkGradDef}
    ${sheen.clipDef}
  </defs>
  <style>
    .txt {
      font-family: ${SYSTEM_FONT_STACK};
      font-size: ${fontSize}px;
      font-weight: ${fontWeight};
      letter-spacing: -0.01em;
    }
    .val {
      font-family: ${SYSTEM_FONT_STACK};
      font-size: ${fontSize}px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
  </style>
  ${surfaceAndBorderLayers}
  ${dotMarkup}${leftIconMarkup}${labelMarkup}${specialMarkup}${valueMarkup}${rightIconMarkup}${sheen.overlay}
</svg>`;
}

/**
 * Render a CTA button SVG string (`svg.xul.is/button/*` and `svg.xul.is/btn/*`) from `ButtonRenderOptions`.
 * Supports size presets (`sm`, `md`, `lg`, `xl` or custom pixel height), unified `icon` (`'left'`, `'left,right'`, `'none,right'`),
 * status `dot`, optional 2-segment split `value`, and 3 Kumo 3D variants (`1`, `2`, `3`).
 * @param options   Button rendering configuration.
 * @returns Complete SVG markup string.
 */
export function renderButton(options: ButtonRenderOptions): string {
  const palette = THEMES[options.color] || THEMES.indigo;
  const animMode: AnimationMode = options.anim ?? 'default';
  const metrics = resolveButtonMetrics(options.size);
  const { fontSize, fontWeight, height, iconSize, radiusX } = metrics;

  const labelText = options.label;
  const valueText = options.value ?? '';
  const { leftData, leftSlug, rightData, rightSlug } = resolveIconPair(options.icon);
  const leftIconWidth = measureIconVisualWidth(leftData, iconSize);
  const rightIconWidth = measureIconVisualWidth(rightData, iconSize);
  const hasDot = Boolean(options.dot && options.dot in DOT_COLORS);

  const layout = computeButtonLayout(
    labelText,
    valueText,
    hasDot,
    leftIconWidth,
    rightIconWidth,
    metrics
  );
  const {
    dotCx,
    isSplit,
    labelCenterX,
    leftIconX,
    leftWidth,
    rightIconX,
    totalWidth,
    valueCenterX,
  } = layout;

  const textY = Math.round(height / 2 + fontSize * 0.35);
  const iconY = Number(((height - iconSize) / 2).toFixed(2));
  const dotMarkup = renderDotMarkup(options.dot, dotCx, height / 2, animMode);
  const isPrimary = options.variant === '1';
  const iconColor = isPrimary ? '#ffffff' : palette.iconColor;
  const iconOpacity = isPrimary ? 0.82 : undefined;
  const labelColor = resolveLabelColor(options.variant, isPrimary);
  const valueColor =
    isPrimary && isSplit ? 'rgba(255,255,255,0.88)' : resolveValueColor(options.variant, palette);
  const gradId = `grad-${options.color}`;
  const { leftMotion, rightMotion } = resolveIconAnimationPair(
    animMode,
    leftSlug,
    rightSlug,
    Boolean(leftData),
    Boolean(rightData)
  );

  const leftIconMarkup = renderIconMarkup(
    leftData,
    leftSlug,
    leftIconX,
    iconY,
    iconSize,
    iconColor,
    leftMotion,
    iconOpacity
  );
  const rightIconMarkup = renderIconMarkup(
    rightData,
    rightSlug,
    rightIconX,
    iconY,
    iconSize,
    iconColor,
    rightMotion,
    iconOpacity
  );
  const surfaceLayers = renderKumoBoxSurface(
    0,
    0,
    totalWidth,
    height,
    radiusX,
    options.variant,
    palette,
    gradId,
    isSplit ? leftWidth : undefined
  );
  const sheen = renderSheenOverlay(animMode, totalWidth, height, radiusX);
  const textClass = `btn-txt-${height}`;
  const labelMarkup =
    labelText.length > 0
      ? `<text x="${labelCenterX}" y="${textY}" text-anchor="middle" fill="${labelColor}" class="${textClass}">${escapeXml(labelText)}</text>`
      : '';
  const valueMarkup =
    valueText.length > 0
      ? `<text x="${valueCenterX}" y="${textY}" text-anchor="middle" fill="${valueColor}" class="${textClass}">${escapeXml(valueText)}</text>`
      : '';
  const ariaLabel = buildAriaLabel(labelText, valueText, leftSlug || rightSlug || options.dot);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" fill="none" role="img" aria-label="${ariaLabel}">
  <defs>
    ${renderDarkBgGradientDef()}
    ${renderThemeGradientDef(gradId, palette)}
    ${sheen.clipDef}
  </defs>
  <style>
    .${textClass} {
      font-family: ${SYSTEM_FONT_STACK};
      font-size: ${fontSize}px;
      font-weight: ${fontWeight};
      letter-spacing: -0.01em;
    }
  </style>
  ${surfaceLayers}
  ${dotMarkup}${leftIconMarkup}${labelMarkup}${valueMarkup}${rightIconMarkup}${sheen.overlay}
</svg>`;
}

/**
 * Render a standalone SVG icon string (`svg.xul.is/icon/:icon`).
 * Uses a padded `-3 -3 30 30` viewBox centered at `(12, 12)` so rotation, scale, and translation
 * micro-animations never clip on any of the four sides.
 * @param options   Standalone icon rendering configuration (`icon`, `color`, `size`, `strokeWidth`, `anim`).
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderIcon(options: IconRenderOptions): string {
  const palette = THEMES[options.color] || THEMES.indigo;
  const { iconColor } = palette;
  const animMode: AnimationMode = options.anim ?? 'default';
  const size = clampInt(options.size, MIN_ICON_SIZE, MAX_ICON_SIZE, DEFAULT_ICON_SIZE);
  const strokeWidth = Number(
    clampNumber(
      options.strokeWidth,
      MIN_ICON_STROKE_WIDTH,
      MAX_ICON_STROKE_WIDTH,
      DEFAULT_ICON_STROKE_WIDTH
    ).toFixed(2)
  );

  const cleanSlug = options.icon.trim().toLowerCase() || 'sparkles';
  const iconData = resolveIcon(cleanSlug) ?? resolveIcon('circle-help');
  const rawInner = iconData ? iconData.innerSvg : '<circle cx="12" cy="12" r="9" />';
  const ariaLabel = escapeXml(cleanSlug);

  const hasSheen = animMode === 'sheen' || animMode.startsWith('sheen,');
  const sheenId = `icon-sheen-${cleanSlug}-${options.color}-${size}`;
  const sheenDefs = hasSheen
    ? `<defs><linearGradient id="${sheenId}" gradientUnits="userSpaceOnUse" x1="-58" y1="0" x2="-32" y2="26"><stop offset="0%" stop-color="#ffffff" stop-opacity="0" /><stop offset="24%" stop-color="#ffffff" stop-opacity="0.12" /><stop offset="50%" stop-color="#ffffff" stop-opacity="0.45" /><stop offset="76%" stop-color="#ffffff" stop-opacity="0.12" /><stop offset="100%" stop-color="#ffffff" stop-opacity="0" /><animate attributeName="x1" values="-58;58;58" keyTimes="0;0.38;1" calcMode="spline" keySplines="0.42 0 0.25 1;0 0 1 1" dur="4s" repeatCount="indefinite" /><animate attributeName="x2" values="-32;84;84" keyTimes="0;0.38;1" calcMode="spline" keySplines="0.42 0 0.25 1;0 0 1 1" dur="4s" repeatCount="indefinite" /></linearGradient></defs>`
    : '';

  if (iconData?.type === 'simple') {
    const combinedSimple = hasSheen
      ? `${rawInner}<g fill="url(#${sheenId})">${rawInner}</g>`
      : rawInner;
    const animatedSimple = wrapIconWithAnimation(combinedSimple, cleanSlug, animMode);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-3 -3 30 30" fill="${iconColor}" role="img" aria-label="${ariaLabel}">${sheenDefs}${animatedSimple}</svg>`;
  }

  const combinedLucide = hasSheen
    ? `${rawInner}<g stroke="url(#${sheenId})">${rawInner}</g>`
    : rawInner;
  const animatedLucide = wrapIconWithAnimation(combinedLucide, cleanSlug, animMode);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-3 -3 30 30" fill="none" stroke="${iconColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${ariaLabel}">${sheenDefs}${animatedLucide}</svg>`;
}

export { renderQuote } from './quote';
export { parseStackGroups, renderStack } from './stack';
