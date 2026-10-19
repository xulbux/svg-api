/**
 * SVG renderer – Single Source of Truth generator for badges, micro-buttons, and standalone icons (`svg.xul.is`).
 */

import { ROSE_200, STRIP_DARK_COLORS, STRIP_SOLID_COLORS, WHITE } from '@/config/palette';
import { BASE_DARK, DOT_COLORS, THEMES } from '@/config/theme';
import {
  FALLBACK_ICON_SLUG,
  normalizeIconSlug,
  resolveIcon,
  resolveIconWithFallback,
} from '@/svg/icons';
import { computeCenteredBaselineY, measureTextWidth, renderTextPathMarkup } from '@/svg/measure';
import {
  BG_DARK_ID,
  PRIMARY_FOREGROUND_OPACITY,
  buildRightCapsulePath,
  buildThemeGradientId,
  buildTopCrescentPath,
  clampInt,
  clampNumber,
  getOwnValue,
  hasOwnKey,
  isAnimationDisabled,
  isSheenMode,
  prepareDisplayText,
  renderDarkBgGradientDef,
  renderIconGroup,
  renderIconPaintAttrs,
  renderKumoBoxSurface,
  renderSheenOverlay,
  renderSvgDocument,
  renderThemeGradientDef,
  renderWhiteBandStops,
  resolveIconMotionTokens,
  resolveSurfaceTextColor,
  truncateText,
} from '@/svg/shared';
import type {
  AnimationMode,
  BadgeRenderOptions,
  BadgeSpecialElement,
  BadgeVariant,
  BandStop,
  ButtonRenderOptions,
  DotState,
  IconMotionMode,
  IconRenderOptions,
  NumericRange,
  ResolvedIcon,
  SizePreset,
  StripTickState,
  ThemeColorName,
  ThemePalette,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Base size dimensions for a badge (`22px`) or a CTA button (`26px`–`42px`). */
interface VariantMetrics {
  /** Font size in pixels. */
  fontSize: number;
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

/** Measured content widths that drive the horizontal capsule layout of badges and buttons. */
interface CapsuleLayoutInput {
  /** Gap between adjacent items inside a compartment in pixels. */
  gap: number;
  /** Whether a status dot is rendered. */
  hasDot: boolean;
  /** Measured label ink width in pixels. */
  labelWidth: number;
  /** Measured leading icon width in pixels. */
  leftIconWidth: number;
  /** Minimum left compartment width in pixels (`0` lets an empty left compartment collapse). */
  minLeftWidth: number;
  /** Horizontal edge padding of each compartment in pixels. */
  padX: number;
  /** Measured trailing icon width in pixels. */
  rightIconWidth: number;
  /** Width of the right-hand special element in pixels (`0` for buttons). */
  specialWidth: number;
  /** Measured value ink width in pixels. */
  valueWidth: number;
}

/** Horizontal layout dimensions and coordinates for the left and right compartments of a badge or button. */
interface CapsuleLayout {
  /** Center X coordinate of the pulsing status dot. */
  dotCx: number;
  /** Whether the capsule is split into both a left and a right compartment. */
  isSplit: boolean;
  /** Center X coordinate of the left-side label text. */
  labelCenterX: number;
  /** Visual starting X coordinate of the leading icon. */
  leftIconX: number;
  /** Width of the left compartment in pixels. */
  leftWidth: number;
  /** Visual starting X coordinate of the trailing icon. */
  rightIconX: number;
  /** Width of the right compartment in pixels. */
  rightWidth: number;
  /** Starting X coordinate of the right-hand special element. */
  specialX: number;
  /** Total width of the SVG in pixels. */
  totalWidth: number;
  /** Center X coordinate of the right-side value text. */
  valueCenterX: number;
}

/** Item offsets and total width of a packed compartment. */
interface PackedCompartment {
  /** Visual start X coordinate of every item (zero-width items share the next item's offset). */
  offsets: number[];
  /** Rounded total compartment width in pixels (`0` when every item is empty). */
  width: number;
}

/** A requested icon slot of a badge or button. */
interface IconSlot {
  /** Resolved icon data (`undefined` for `'none'`, empty, or unknown slugs). */
  data: ResolvedIcon | undefined;
  /** Canonical (alias-resolved) slug used for contextual animation lookups. */
  key: string;
  /** Trimmed requested slug (used as the accessible fallback name). */
  slug: string;
}

/** Resolved left and right icon slots from `?icon=name`, `?icon=left,right`, or `?icon=none,right`. */
interface ResolvedIconPair {
  /** Leading left-hand icon slot. */
  left: Readonly<IconSlot>;
  /** Trailing right-hand icon slot. */
  right: Readonly<IconSlot>;
}

/** Independent micro-animation tokens for the left and right icons. */
interface IconAnimationPair {
  /** Motion applied to the leading icon. */
  leftMotion: IconMotionMode;
  /** Motion applied to the trailing icon. */
  rightMotion: IconMotionMode;
}

/** Options for `renderIconMarkup`. */
interface IconMarkupOptions {
  /** Stroke or fill color. */
  color: string;
  /** Rendered icon size in pixels. */
  iconSize: number;
  /** Top Y coordinate of the icon box. */
  iconY: number;
  /** Micro-animation applied to the icon. */
  motion: IconMotionMode;
  /** Optional group opacity (`0`–`1`). */
  opacity: number | undefined;
  /** Icon slot to render. */
  slot: Readonly<IconSlot>;
  /** X coordinate where the icon's leftmost visible pixel starts. */
  visualStartX: number;
}

/** Track and active paint of a bar or ring gauge. */
interface GaugePaint {
  /** Color of the filled (active) part. */
  activeColor: string;
  /** Paint attributes of the empty track. */
  trackAttrs: string;
}

/** Shared geometry and style state for rendering a right-compartment special element. */
interface SpecialElementContext {
  /** Active animation mode. */
  animMode: AnimationMode;
  /** Theme color token of the badge. */
  color: ThemeColorName;
  /** Badge font size in pixels. */
  fontSize: number;
  /** Badge height in pixels. */
  height: number;
  /** Whether the element sits on a vivid primary (`variant=1`) capsule. */
  isSolidCapsule: boolean;
  /** Resolved theme palette of `color`. */
  palette: ThemePalette;
  /** Width of the special element box in pixels. */
  specialWidth: number;
  /** Starting X coordinate of the special element box. */
  specialX: number;
}

/** Options for `renderBadgeSurface`. */
interface BadgeSurfaceOptions {
  /** Theme color token. */
  color: ThemeColorName;
  /** Badge height in pixels. */
  height: number;
  /** Computed capsule layout. */
  layout: CapsuleLayout;
  /** Corner radius in pixels. */
  radiusX: number;
  /** Visual variant. */
  variant: BadgeVariant;
}

/** Options for `renderCapsuleBody`, shared by badges and buttons. */
interface CapsuleBodyOptions {
  /** Active animation mode. */
  animMode: AnimationMode;
  /** Optional status dot state. */
  dot: DotState | undefined;
  /** Resolved icon slots. */
  icons: ResolvedIconPair;
  /** Whether the label uses semi-bold (`600`) weight. */
  isLabelBold: boolean;
  /** Whether the leading icon and label sit on a vivid primary surface. */
  isLeftOnPrimary: boolean;
  /** Whether the trailing icon sits on a vivid primary surface. */
  isRightOnPrimary: boolean;
  /** Label text. */
  labelText: string;
  /** Computed capsule layout. */
  layout: CapsuleLayout;
  /** Size metrics. */
  metrics: VariantMetrics;
  /** Resolved theme palette. */
  palette: ThemePalette;
  /** Special element markup inserted between the label and the value (`''` for none). */
  specialMarkup: string;
  /** Value text color. */
  valueColor: string;
  /** Value text. */
  valueText: string;
  /** Visual variant. */
  variant: BadgeVariant;
}

/** Nudge vector shape (`[deltaX, deltaY]` in `24x24` icon units). */
type NudgeVector = readonly [deltaX: number, deltaY: number];

// ---------------------------------------- CONSTS ---------------------------------------

/** Rendered size bounds in pixels for standalone SVG icons (`svg.xul.is/icon/:icon?size=`). */
export const ICON_SIZE_RANGE: NumericRange = { default: 24, max: 256, min: 8 };

/** Stroke width bounds in `24x24` viewBox units for standalone Lucide SVG icons (`?stroke=`). */
export const ICON_STROKE_RANGE: NumericRange = { default: 2.25, max: 4, min: 1 };

/** Custom pixel height bounds for CTA buttons (`/button/*?size=<px>`; Defaults to the `md` preset). */
export const BUTTON_HEIGHT_RANGE: NumericRange = { default: 30, max: 48, min: 22 };

/** Maximum badge/button label, value, and delta length in UTF-16 code units before ellipsis truncation. */
export const MAX_LABEL_LENGTH = 128;

/** Maximum number of ticks in a `strip:` special element. */
export const MAX_STRIP_TICKS = 10;

/** Maximum number of points in a `sparkline:` special element. */
export const MAX_SPARKLINE_POINTS = 64;

/** Bounds of `bar:` and `ring:` gauge percentages. */
const PERCENT_RANGE: NumericRange = { default: 0, max: 100, min: 0 };

/**
 * Largest absolute sparkline value; Keeps `max - min` finite (`1e308 - -1e308` overflows to `Infinity`
 * and would turn every point into `NaN`).
 */
const MAX_SPARKLINE_MAGNITUDE = 1e12;

/** Named size scale presets for CTA buttons (`/button/*` and `/btn/*`). */
export const BUTTON_SIZE_PRESETS: Readonly<Record<SizePreset, VariantMetrics>> = {
  lg: { fontSize: 14, height: 36, iconSize: 17, padX: 18, radiusX: 11 },
  md: { fontSize: 12.5, height: 30, iconSize: 15, padX: 14, radiusX: 9 },
  sm: { fontSize: 11.5, height: 26, iconSize: 14, padX: 12, radiusX: 7 },
  xl: { fontSize: 15.5, height: 42, iconSize: 19, padX: 22, radiusX: 13 },
};

/** Size metrics for standard `22px` badges (`variant=1`, `variant=2`, `variant=3`). */
const BADGE_METRICS: VariantMetrics = {
  fontSize: 11,
  height: 22,
  iconSize: 13,
  padX: 9,
  radiusX: 6,
};

/** Stroke width of Lucide icons inside badges and buttons in `24x24` icon units. */
const CAPSULE_ICON_STROKE_WIDTH = ICON_STROKE_RANGE.default;

/** Horizontal slot width in pixels reserved for the status dot. */
const DOT_SLOT_WIDTH = 7;

/** Slug rendered by standalone `/icon/` requests with an empty slug. */
const DEFAULT_STANDALONE_ICON_SLUG = 'sparkles';

/** ID of the standalone icon body group referenced by the sheen pass (`<use href="#icon-body">`). */
const ICON_BODY_ID = 'icon-body';

/** Empty icon slot for missing left/right icons. */
const EMPTY_ICON_SLOT: Readonly<IconSlot> = { data: undefined, key: '', slug: '' };

/** Static (non-animated) icon motion pair. */
const STATIC_ICON_MOTIONS: Readonly<IconAnimationPair> = {
  leftMotion: 'none',
  rightMotion: 'none',
};

/** White highlight stops of the standalone icon sheen band. */
const ICON_SHEEN_BAND_STOPS: readonly BandStop[] = [
  [0, '0'],
  [24, '0.12'],
  [50, '0.45'],
  [76, '0.12'],
  [100, '0'],
];

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

/** Directional nudge vectors for action icons in `'auto'` mode. */
const AUTO_NUDGE_VECTORS: Readonly<Record<string, NudgeVector>> = {
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

/** Rightward nudge vector for icons without a directional entry in `AUTO_NUDGE_VECTORS`. */
const DEFAULT_NUDGE_VECTOR: NudgeVector = [2.2, 0];

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

/** Memoized bar shimmer `<defs>` blocks keyed by surface kind (`'solid'` or `'tinted'`). */
const BAR_SHIMMER_DEF_CACHE = new Map<string, string>();

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches percent signs, plus signs, and whitespace that decorate a numeric delta readout. */
const DELTA_DECORATION_RX = /[%+\s]/g;

/** Matches the Unicode minus sign (`U+2212`), normalized to an ASCII hyphen before parsing deltas. */
const UNICODE_MINUS_RX = /\u2212/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Measure the horizontal width in pixels required by the active (sanitized) special element. */
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
      const tickCount = special.states.length;
      return tickCount === 0 ? 0 : Math.ceil(tickCount * 2.5 + (tickCount - 1) * 2);
    }
    case 'delta': {
      return 13 + measureTextWidth(special.value, fontSize - 0.5, true);
    }
    default: {
      return 0;
    }
  }
}

/** Keep the finite sparkline values (at most `MAX_SPARKLINE_POINTS`), clamped to `±MAX_SPARKLINE_MAGNITUDE`. */
function sanitizeSparklineValues(values: readonly number[]): number[] {
  const sanitized: number[] = [];
  for (const value of values) {
    if (Number.isFinite(value) && sanitized.length < MAX_SPARKLINE_POINTS) {
      sanitized.push(Math.min(MAX_SPARKLINE_MAGNITUDE, Math.max(-MAX_SPARKLINE_MAGNITUDE, value)));
    }
  }
  return sanitized;
}

/**
 * Sanitize a special element before layout, whatever its source (query DSL or upstream JSON): Sparkline
 * values become finite and bounded, gauge percentages are clamped to `0`–`100` (`NaN` becomes `0`),
 * strips keep at most `MAX_STRIP_TICKS` ticks, and delta text is normalized, trimmed, and capped.
 */
function sanitizeSpecialElement(
  special: BadgeSpecialElement | undefined
): BadgeSpecialElement | undefined {
  switch (special?.type) {
    case 'sparkline': {
      return { type: 'sparkline', values: sanitizeSparklineValues(special.values) };
    }
    case 'bar':
    case 'ring': {
      return { ...special, value: clampNumber(special.value, PERCENT_RANGE) };
    }
    case 'strip': {
      return special.states.length <= MAX_STRIP_TICKS
        ? special
        : { states: special.states.slice(0, MAX_STRIP_TICKS), type: 'strip' };
    }
    case 'delta': {
      return { type: 'delta', value: prepareDisplayText(special.value, MAX_LABEL_LENGTH).trim() };
    }
    default: {
      return undefined;
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
  let [minValue] = values;
  let maxValue = minValue;
  for (const value of values) {
    minValue = Math.min(minValue, value);
    maxValue = Math.max(maxValue, value);
  }
  const range = maxValue - minValue;
  const strokeHeight = height - 2;
  const strokeTopY = startY + 1;
  const coordinates: string[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const pointX = startX + (i / (values.length - 1)) * width;
    // Flat series (all values equal) are drawn through the vertical center instead of the bottom edge.
    const normalized = range > 0 ? (values[i] - minValue) / range : 0.5;
    const pointY = strokeTopY + strokeHeight - normalized * strokeHeight;
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
  return variant === '1' ? WHITE : palette.accentText;
}

/** Resolve the contextual motion preset for a canonical icon slug when `auto` is requested. */
function resolveAutoIconMotion(iconKey: string): IconMotionMode | undefined {
  if (AUTO_SPIN_ICONS.has(iconKey)) {
    return 'spin';
  }
  if (AUTO_SHAKE_ICONS.has(iconKey)) {
    return 'shake';
  }
  if (hasOwnKey(AUTO_NUDGE_VECTORS, iconKey)) {
    return 'nudge';
  }
  if (AUTO_PULSE_ICONS.has(iconKey)) {
    return 'pulse';
  }
  if (AUTO_FLOAT_ICONS.has(iconKey)) {
    return 'float';
  }
  return undefined;
}

/** Wrap inner icon SVG paths with contextual or explicit SMIL micro-animation elements. */
function wrapIconWithAnimation(
  innerSvg: string,
  iconKey: string,
  iconMotion: IconMotionMode
): string {
  if (iconMotion === 'none' || iconMotion === 'default') {
    return innerSvg;
  }
  const motion = iconMotion === 'auto' ? resolveAutoIconMotion(iconKey) : iconMotion;

  switch (motion) {
    case 'spin': {
      return `<g><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="3s" repeatCount="indefinite" />${innerSvg}</g>`;
    }
    case 'shake': {
      return `<g transform="translate(12, 12)"><g><animateTransform attributeName="transform" type="scale" values="1;1;1.15;1.15;1.15;1.15;1;1" keyTimes="0;0.62;0.70;0.76;0.82;0.88;0.95;1" dur="3.2s" repeatCount="indefinite" /><animateTransform attributeName="transform" type="rotate" values="0;0;-11;11;-9;7;0;0" keyTimes="0;0.62;0.70;0.76;0.82;0.88;0.95;1" dur="3.2s" additive="sum" repeatCount="indefinite" /><g transform="translate(-12, -12)">${innerSvg}</g></g></g>`;
    }
    case 'nudge': {
      const [deltaX, deltaY] = getOwnValue(AUTO_NUDGE_VECTORS, iconKey) ?? DEFAULT_NUDGE_VECTOR;
      return `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 0;${deltaX} ${deltaY};0 0;0 0" keyTimes="0;0.65;0.78;0.92;1" dur="2.8s" repeatCount="indefinite" />${innerSvg}</g>`;
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
  icons: ResolvedIconPair
): IconAnimationPair {
  if (animMode === 'none' || animMode === 'default' || animMode === 'sheen') {
    return STATIC_ICON_MOTIONS;
  }
  const tokens = resolveIconMotionTokens(animMode);
  if (tokens.length === 0) {
    return STATIC_ICON_MOTIONS;
  }
  const [firstToken, secondToken] = tokens;
  if (tokens.length >= 2) {
    return { leftMotion: firstToken, rightMotion: secondToken };
  }

  if (firstToken === 'auto' || !icons.left.data || !icons.right.data) {
    return { leftMotion: firstToken, rightMotion: firstToken };
  }

  const leftNatural = resolveAutoIconMotion(icons.left.key);
  const rightNatural = resolveAutoIconMotion(icons.right.key);
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

/** Resolve a single requested icon slug into an icon slot (empty slugs become `'none'`). */
function resolveIconSlot(rawSlug: string): IconSlot {
  const slug = rawSlug.trim() || 'none';
  return { data: resolveIcon(slug), key: normalizeIconSlug(slug), slug };
}

/** Parse an icon specification (`'name'`, `'left,right'`, or `'none,right'`) into resolved left and right icon slots. */
function resolveIconPair(iconSpec: string | undefined): ResolvedIconPair {
  if (!iconSpec) {
    return { left: EMPTY_ICON_SLOT, right: EMPTY_ICON_SLOT };
  }
  const commaIdx = iconSpec.indexOf(',');
  if (commaIdx === -1) {
    return { left: resolveIconSlot(iconSpec), right: EMPTY_ICON_SLOT };
  }
  return {
    left: resolveIconSlot(iconSpec.slice(0, commaIdx)),
    right: resolveIconSlot(iconSpec.slice(commaIdx + 1)),
  };
}

/** Measure the true rendered horizontal width in pixels of a resolved icon (`(maxX - minX) * (iconSize / 24)`). */
function measureIconVisualWidth(iconData: ResolvedIcon | undefined, iconSize: number): number {
  if (!iconData) {
    return 0;
  }
  return Number(((iconData.maxX - iconData.minX) * (iconSize / 24)).toFixed(2));
}

/** Render the SVG `<g>` markup for a resolved icon slot, aligned so its leftmost visible pixel starts at `visualStartX`. */
function renderIconMarkup(options: IconMarkupOptions): string {
  const iconData = options.slot.data;
  if (!iconData) {
    return '';
  }
  const scaleNum = options.iconSize / 24;
  const scale = Number(scaleNum.toFixed(4));
  const translateX = Number((options.visualStartX - iconData.minX * scaleNum).toFixed(2));
  return renderIconGroup({
    color: options.color,
    innerSvg: wrapIconWithAnimation(iconData.innerSvg, options.slot.key, options.motion),
    opacity: options.opacity,
    strokeWidth: CAPSULE_ICON_STROKE_WIDTH,
    transform: `translate(${translateX}, ${options.iconY}) scale(${scale})`,
    type: iconData.type,
  });
}

/** Check whether a status dot state is renderable. */
function isRenderableDot(dot: DotState | undefined): dot is DotState {
  return dot !== undefined && hasOwnKey(DOT_COLORS, dot);
}

/** Render an animated status indicator dot with an outward-only radar ripple or breathing pattern tailored to the status state. */
function renderDotMarkup(
  dot: DotState | undefined,
  dotCx: number,
  centerY: number,
  animMode: AnimationMode
): string {
  if (!isRenderableDot(dot)) {
    return '';
  }
  const dotHex = DOT_COLORS[dot];
  const position = `cx="${dotCx}" cy="${centerY}"`;
  const staticCore = `<circle ${position} r="3" fill="${dotHex}" />`;
  if (isAnimationDisabled(animMode)) {
    return staticCore;
  }

  // 1. Critical / Offline (red, rose): urgent 1.15s outward beacon + core pulse.
  if (CRITICAL_DOT_STATES.has(dot)) {
    return `<circle ${position} r="2.6" fill="${dotHex}" opacity="0"><animate attributeName="r" values="2.6;7.2" dur="1.15s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.75;0" dur="1.15s" repeatCount="indefinite" /></circle><circle ${position} r="3" fill="${dotHex}"><animate attributeName="opacity" values="1;0.55;1" dur="1.15s" repeatCount="indefinite" /></circle>`;
  }

  // 2. Incident / Overloaded (orange): faster 1.45s double-beat outward ripple + subtle core pulse.
  if (INCIDENT_DOT_STATES.has(dot)) {
    return `<circle ${position} r="2.6" fill="${dotHex}" opacity="0"><animate attributeName="r" values="2.6;6.6;2.6;7.0" keyTimes="0;0.44;0.45;1" dur="1.45s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.72;0;0.55;0" keyTimes="0;0.44;0.45;1" dur="1.45s" repeatCount="indefinite" /></circle><circle ${position} r="3" fill="${dotHex}"><animate attributeName="opacity" values="1;0.68;1" dur="1.45s" repeatCount="indefinite" /></circle>`;
  }

  // 3. Degraded / Warning (amber, yellow): 1.8s double-beat outward radar ripple.
  if (WARNING_DOT_STATES.has(dot)) {
    return `<circle ${position} r="2.6" fill="${dotHex}" opacity="0"><animate attributeName="r" values="2.6;6.4;2.6;6.8" keyTimes="0;0.45;0.46;1" dur="1.8s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.65;0;0.5;0" keyTimes="0;0.45;0.46;1" dur="1.8s" repeatCount="indefinite" /></circle>${staticCore}`;
  }

  // 4. Maintenance / Deploying / Syncing (sky, blue, cyan, indigo): active-work breathing core + soft outward halo.
  if (ACTIVE_WORK_DOT_STATES.has(dot)) {
    return `<circle ${position} r="2.6" fill="${dotHex}" opacity="0"><animate attributeName="r" values="2.6;5.8" dur="2s" calcMode="spline" keyTimes="0;1" keySplines="0.25 1 0.5 1" repeatCount="indefinite" /><animate attributeName="opacity" values="0.5;0" dur="2s" calcMode="spline" keyTimes="0;1" keySplines="0.25 1 0.5 1" repeatCount="indefinite" /></circle><circle ${position} r="3" fill="${dotHex}"><animate attributeName="r" values="2.4;3.2;2.4" dur="2s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.75;1;0.75" dur="2s" repeatCount="indefinite" /></circle>`;
  }

  // 5. Standby / Paused / Idle (slate, gray, zinc, neutral, stone): calm 3.4s deep-sleep core breath without radar ring.
  if (STANDBY_DOT_STATES.has(dot)) {
    return `<circle ${position} r="3" fill="${dotHex}"><animate attributeName="opacity" values="0.9;0.32;0.9" dur="3.4s" repeatCount="indefinite" /></circle>`;
  }

  // 6. Operational / Online & Beta / Preview (green, emerald, violet, purple, etc.): calm 2.3s outward spline wave.
  return `<circle ${position} r="2.6" fill="${dotHex}" opacity="0"><animate attributeName="r" values="2.6;6.8" dur="2.3s" calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1" repeatCount="indefinite" /><animate attributeName="opacity" values="0.6;0" dur="2.3s" calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1" repeatCount="indefinite" /></circle>${staticCore}`;
}

/** Resolve the empty-track and active paint of a bar (`fill`) or ring (`stroke`) gauge. */
function resolveGaugePaint(
  paintAttr: 'fill' | 'stroke',
  trackOpacity: string,
  activeOpacity: number,
  context: SpecialElementContext
): GaugePaint {
  return context.isSolidCapsule
    ? {
        activeColor: `rgba(255,255,255,${activeOpacity})`,
        trackAttrs: `${paintAttr}="rgba(0,0,0,0.28)"`,
      }
    : {
        activeColor: context.palette.accentText,
        trackAttrs: `${paintAttr}="${context.palette.accentText}" ${paintAttr}-opacity="${trackOpacity}"`,
      };
}

/** Build the ID of the bar shimmer `<linearGradient>` (`bar-shimmer-w` on primary capsules, `bar-shimmer-c` otherwise). */
function buildBarShimmerId(isSolidCapsule: boolean): string {
  return `bar-shimmer-${isSolidCapsule ? 'w' : 'c'}`;
}

/** Render (once per surface kind) the animated bar shimmer `<defs>` block (white band on primary capsules, softer otherwise). */
function renderBarShimmerDef(isSolidCapsule: boolean): string {
  const cacheKey = isSolidCapsule ? 'solid' : 'tinted';
  const cached = BAR_SHIMMER_DEF_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const shimmerStops = renderWhiteBandStops([
    [0, '0'],
    [50, isSolidCapsule ? '0.95' : '0.52'],
    [100, '0'],
  ]);
  const shimmerDef = `<defs><linearGradient id="${buildBarShimmerId(isSolidCapsule)}" x1="-0.75" y1="0" x2="0" y2="0">${shimmerStops}<animate attributeName="x1" values="-0.75;1.05;1.05" keyTimes="0;0.54;1" calcMode="spline" keySplines="0.4 0 0.2 1;0 0 1 1" dur="2.3s" repeatCount="indefinite" /><animate attributeName="x2" values="0;1.8;1.8" keyTimes="0;0.54;1" calcMode="spline" keySplines="0.4 0 0.2 1;0 0 1 1" dur="2.3s" repeatCount="indefinite" /></linearGradient></defs>`;
  BAR_SHIMMER_DEF_CACHE.set(cacheKey, shimmerDef);
  return shimmerDef;
}

/**
 * Render an inline horizontal progress/capacity bar from a sanitized `0`–`100` percentage.
 * The empty track uses a dark translucent accent color, and the rightward shimmer wave is applied
 * directly as a fill on the filled `<rect>` so it can never enter the empty part of the bar.
 */
function renderBarWidgetMarkup(
  percentValue: number,
  hasPulse: boolean,
  context: SpecialElementContext
): string {
  const { isSolidCapsule, specialWidth, specialX } = context;
  const barY = (context.height - 6) / 2;
  const paint = resolveGaugePaint('fill', '0.20', PRIMARY_FOREGROUND_OPACITY, context);
  const trackRect = `<rect x="${specialX}" y="${barY}" width="${specialWidth}" height="6" rx="3" ${paint.trackAttrs} />`;
  const fillWidth =
    percentValue <= 0 ? 0 : Math.max(4, Number(((percentValue / 100) * specialWidth).toFixed(1)));
  if (fillWidth <= 0) {
    return trackRect;
  }

  const filledRect = `<rect x="${specialX}" y="${barY}" width="${fillWidth}" height="6" rx="3" fill="${paint.activeColor}" />`;
  if (!hasPulse) {
    return `${trackRect}${filledRect}`;
  }
  const shimmerRect = `<rect x="${specialX}" y="${barY}" width="${fillWidth}" height="6" rx="3" fill="url(#${buildBarShimmerId(isSolidCapsule)})" />`;
  return `${trackRect}${filledRect}${renderBarShimmerDef(isSolidCapsule)}${shimmerRect}`;
}

/** Render an inline `12x12px` circular ring/donut gauge (sanitized `0`–`100` percentage) with a dark translucent accent track and optional pulse. */
function renderRingWidgetMarkup(
  percentValue: number,
  hasPulse: boolean,
  context: SpecialElementContext
): string {
  const ringCx = context.specialX + 6;
  const ringCy = context.height / 2;
  const circumference = 28.27;
  const arcLength = Number(((percentValue / 100) * circumference).toFixed(2));
  const paint = resolveGaugePaint('stroke', '0.24', 0.85, context);
  const trackCircle = `<circle cx="${ringCx}" cy="${ringCy}" r="4.5" ${paint.trackAttrs} stroke-width="2" />`;
  if (arcLength <= 0) {
    // A zero-length dash with a round line cap would still draw a dot.
    return trackCircle;
  }
  const pulseAnim = hasPulse
    ? '<animate attributeName="opacity" values="1;0.45;1" dur="2s" repeatCount="indefinite" />'
    : '';
  return `${trackCircle}<circle cx="${ringCx}" cy="${ringCy}" r="4.5" stroke="${paint.activeColor}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${arcLength} ${circumference}" transform="rotate(-90 ${ringCx} ${ringCy})">${pulseAnim}</circle>`;
}

/** Resolve the fill color for a single tick (`'0'`–`'9'`) in a 10-stage segmented strip. */
function resolveStripTickColor(state: StripTickState, isSolidCapsule: boolean): string {
  return isSolidCapsule
    ? (STRIP_SOLID_COLORS[state] ?? WHITE)
    : (STRIP_DARK_COLORS[state] ?? THEMES.emerald.accentText);
}

/** Render a segmented uptime/health history strip (sanitized to at most `MAX_STRIP_TICKS` ticks). */
function renderStripWidgetMarkup(states: StripTickState[], context: SpecialElementContext): string {
  const tickY = (context.height - 10) / 2;
  const isAnimated = !isAnimationDisabled(context.animMode);
  let ticksMarkup = '';
  for (let i = 0; i < states.length; i += 1) {
    const tickX = (context.specialX + i * 4.5).toFixed(1);
    const tickColor = resolveStripTickColor(states[i], context.isSolidCapsule);
    const isAnimatedLast = isAnimated && i === states.length - 1;
    ticksMarkup += isAnimatedLast
      ? `<rect x="${tickX}" y="${tickY}" width="2.5" height="10" rx="1.25" fill="${tickColor}"><animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" /></rect>`
      : `<rect x="${tickX}" y="${tickY}" width="2.5" height="10" rx="1.25" fill="${tickColor}" />`;
  }
  return ticksMarkup;
}

/**
 * Render an inline trend delta arrow and readout from sanitized delta text: Up for positive, down for
 * negative, and flat for zero or non-numeric readouts (e.g., `'-0%'`, `'0.0'`, `'n/a'`).
 */
function renderDeltaWidgetMarkup(deltaText: string, context: SpecialElementContext): string {
  const { height, isSolidCapsule, specialX } = context;
  const magnitude = Number.parseFloat(
    deltaText.replace(UNICODE_MINUS_RX, '-').replace(DELTA_DECORATION_RX, '')
  );
  const isFlat = magnitude === 0 || !Number.isFinite(magnitude);
  const isNegative = !isFlat && magnitude < 0;

  let deltaColor = isSolidCapsule ? WHITE : THEMES.emerald.accentText;
  let arrowPath = 'M2.5 7.5L7.5 2.5M4 2.5H7.5V6';
  if (isNegative) {
    deltaColor = isSolidCapsule ? ROSE_200 : THEMES.rose.accentText;
    arrowPath = 'M2.5 2.5L7.5 7.5M4 7.5H7.5V4';
  } else if (isFlat) {
    deltaColor = isSolidCapsule ? 'rgba(255,255,255,0.85)' : BASE_DARK.textMuted;
    arrowPath = 'M2 5H8M5.5 2.5L8 5L5.5 7.5';
  }

  const arrowY = (height - 10) / 2;
  const arrowOpacityAttr = isSolidCapsule ? ` opacity="${PRIMARY_FOREGROUND_OPACITY}"` : '';
  const arrowMarkup = `<g transform="translate(${specialX}, ${arrowY})" fill="none" stroke="${deltaColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${arrowOpacityAttr}><path d="${arrowPath}" /></g>`;
  const textWidth = context.specialWidth - 13;
  const deltaFontSize = context.fontSize - 0.5;
  const deltaTextMarkup = renderTextPathMarkup(deltaText, {
    anchorX: Number((specialX + 13 + textWidth / 2).toFixed(2)),
    baselineY: computeCenteredBaselineY(height, deltaFontSize),
    fill: deltaColor,
    fontSize: deltaFontSize,
    isBold: true,
  });
  return `${arrowMarkup}${deltaTextMarkup}`;
}

/** Resolve the ID of the sparkline area-fill `<linearGradient>` (white on primary capsules, accent-colored otherwise). */
function resolveSparklineGradientId(isSolidCapsule: boolean, color: ThemeColorName): string {
  return isSolidCapsule ? 'spark-fill-white' : `spark-fill-${color}`;
}

/** Render an inline trend sparkline with a vertical area gradient fill. */
function renderSparklineWidgetMarkup(values: number[], context: SpecialElementContext): string {
  const sparkY = (context.height - 11) / 2;
  const geometry = buildSparklineGeometry(
    values,
    context.specialX,
    sparkY,
    context.specialWidth,
    11
  );
  if (!geometry) {
    return '';
  }
  const sparkStroke = context.isSolidCapsule
    ? 'rgba(255,255,255,0.86)'
    : context.palette.accentText;
  const sparkGradId = resolveSparklineGradientId(context.isSolidCapsule, context.color);
  return `<polygon points="${geometry.areaPoints}" fill="url(#${sparkGradId})" /><polyline points="${geometry.linePoints}" fill="none" stroke="${sparkStroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`;
}

/** Render the active right-compartment special element (`sparkline`, `bar`, `ring`, `strip`, or `delta`). */
function renderSpecialElementMarkup(
  special: BadgeSpecialElement | undefined,
  context: SpecialElementContext
): string {
  if (!special || context.specialWidth <= 0) {
    return '';
  }
  switch (special.type) {
    case 'sparkline': {
      return renderSparklineWidgetMarkup(special.values, context);
    }
    case 'bar': {
      const hasBarShimmer = !isAnimationDisabled(context.animMode) && special.hasPulse !== false;
      return renderBarWidgetMarkup(special.value, hasBarShimmer, context);
    }
    case 'ring': {
      const hasRingPulse = !isAnimationDisabled(context.animMode) && Boolean(special.hasPulse);
      return renderRingWidgetMarkup(special.value, hasRingPulse, context);
    }
    case 'strip': {
      return renderStripWidgetMarkup(special.states, context);
    }
    case 'delta': {
      return renderDeltaWidgetMarkup(special.value, context);
    }
    default: {
      return '';
    }
  }
}

/** Render the `<linearGradient>` definition for the sparkline area fill. */
function renderSparklineGradientDef(isSolidCapsule: boolean, color: ThemeColorName): string {
  const stopColor = isSolidCapsule ? WHITE : THEMES[color].accentText;
  const topOpacity = isSolidCapsule ? '0.32' : '0.38';
  return `<linearGradient id="${resolveSparklineGradientId(isSolidCapsule, color)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${stopColor}" stop-opacity="${topOpacity}" /><stop offset="100%" stop-color="${stopColor}" stop-opacity="0" /></linearGradient>`;
}

/** Render all background fills, upper-edge Kumo 3D crescents, dividers, and outer border rings for a `22px` badge. */
function renderBadgeSurface(options: BadgeSurfaceOptions): string {
  const { color, height, layout, radiusX, variant } = options;
  const { isSplit, leftWidth, totalWidth } = layout;

  // Split Primary badge (v=1): neutral dark left compartment + 3D Kumo colored right capsule.
  if (variant === '1' && isSplit) {
    const palette = THEMES[color];
    const innerRadius = radiusX - 0.5;
    const leftFillPath = `M ${leftWidth} 0 H ${radiusX} A ${radiusX} ${radiusX} 0 0 0 0 ${radiusX} V ${height - radiusX} A ${radiusX} ${radiusX} 0 0 0 ${radiusX} ${height} H ${leftWidth} Z`;
    const leftBorderPath = `M ${leftWidth} 0.5 H ${radiusX} A ${innerRadius} ${innerRadius} 0 0 0 0.5 ${radiusX} V ${height - radiusX} A ${innerRadius} ${innerRadius} 0 0 0 ${radiusX} ${height - 0.5} H ${leftWidth}`;
    const rightFillPath = buildRightCapsulePath(leftWidth, totalWidth, height, radiusX);
    const rightCrescentPath = buildTopCrescentPath(leftWidth, totalWidth, radiusX, false);
    const rightRingPath = buildRightCapsulePath(
      leftWidth + 0.5,
      totalWidth - 0.5,
      height - 1,
      innerRadius,
      0.5
    );

    return (
      `<path d="${leftFillPath}" fill="url(#${BG_DARK_ID})" />` +
      `<path d="${leftBorderPath}" stroke="${BASE_DARK.borderNeutral}" stroke-width="1" />` +
      `<path d="${rightFillPath}" fill="url(#${buildThemeGradientId(color)})" />` +
      `<path d="${rightCrescentPath}" fill="${palette.emphasisBg}" />` +
      `<path d="${rightRingPath}" stroke="${palette.emphasisRing}" stroke-width="1" />`
    );
  }

  // Single-part Primary and all Secondary/Tertiary badges share the Kumo surface; Split v2 badges tint
  // and 3D-highlight only the right capsule (split v3 dividers stop short of the edges, so v3 keeps its full crescent).
  const splitX = isSplit ? leftWidth : undefined;
  return renderKumoBoxSurface({
    color,
    height,
    radius: radiusX,
    rightCapsuleStartX: splitX,
    splitLineX: splitX,
    variant,
    width: totalWidth,
  });
}

/** Render the `<defs>` gradients a badge or button surface references. */
function renderSurfaceGradientDefs(
  color: ThemeColorName,
  hasDarkBg: boolean,
  hasThemeGradient: boolean
): string {
  return `${hasDarkBg ? renderDarkBgGradientDef() : ''}${hasThemeGradient ? renderThemeGradientDef(color) : ''}`;
}

/** Resolve button geometry metrics (`height`, `fontSize`, `iconSize`, `padX`, `radiusX`) from `size`. */
function resolveButtonMetrics(sizeOption: SizePreset | number | undefined): VariantMetrics {
  if (typeof sizeOption === 'string' && hasOwnKey(BUTTON_SIZE_PRESETS, sizeOption)) {
    return BUTTON_SIZE_PRESETS[sizeOption];
  }
  if (typeof sizeOption === 'number' && Number.isFinite(sizeOption)) {
    const height = clampInt(sizeOption, BUTTON_HEIGHT_RANGE);
    return {
      fontSize: Number((height * 0.415).toFixed(1)),
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
): PackedCompartment {
  let rawWidth = 0;
  let activeCount = 0;
  for (const itemWidth of itemWidths) {
    if (itemWidth > 0) {
      if (activeCount > 0) {
        rawWidth += gap;
      }
      rawWidth += itemWidth;
      activeCount += 1;
    }
  }
  if (itemWidths[0] > 0 && activeCount > 1) {
    rawWidth += extraFirstGap;
  }
  // Empty compartments collapse to zero width; Their offsets all stay at the left padding.
  const paddedWidth = leftPad + rawWidth + rightPad;
  const width = activeCount === 0 ? 0 : Math.round(paddedWidth);
  let cursor = activeCount === 0 ? leftPad : leftPad + (width - paddedWidth) / 2;
  const offsets: number[] = [];
  for (let i = 0; i < itemWidths.length; i += 1) {
    const itemWidth = itemWidths[i];
    offsets.push(Number(cursor.toFixed(2)));
    if (itemWidth > 0) {
      cursor += itemWidth + gap + (i === 0 ? extraFirstGap : 0);
    }
  }
  return { offsets, width };
}

/**
 * Compute horizontal compartment widths and coordinate offsets for a badge or button.
 * The left compartment packs `[dot, leftIcon, label, rightIcon]` (the trailing icon moves right when a
 * right compartment exists), and the right compartment packs `[special, value, rightIcon]`.
 */
function computeCapsuleLayout(input: CapsuleLayoutInput): CapsuleLayout {
  const { gap, labelWidth, padX, rightIconWidth, specialWidth, valueWidth } = input;
  const hasRightCompartment = valueWidth > 0 || specialWidth > 0;

  const leftPack = packCompartment(
    [
      input.hasDot ? DOT_SLOT_WIDTH : 0,
      input.leftIconWidth,
      labelWidth,
      hasRightCompartment ? 0 : rightIconWidth,
    ],
    gap,
    padX
  );
  const rightPack = packCompartment(
    hasRightCompartment ? [specialWidth, valueWidth, rightIconWidth] : [0, 0, 0],
    gap,
    padX,
    padX,
    1
  );

  const leftWidth = leftPack.width > 0 ? leftPack.width : input.minLeftWidth;
  const rightWidth = rightPack.width;
  return {
    dotCx: Number((leftPack.offsets[0] + DOT_SLOT_WIDTH / 2).toFixed(2)),
    isSplit: leftWidth > 0 && rightWidth > 0,
    labelCenterX: Number((leftPack.offsets[2] + labelWidth / 2).toFixed(2)),
    leftIconX: leftPack.offsets[1],
    leftWidth,
    rightIconX: hasRightCompartment
      ? Number((leftWidth + rightPack.offsets[2]).toFixed(2))
      : leftPack.offsets[3],
    rightWidth,
    specialX: Number((leftWidth + rightPack.offsets[0]).toFixed(2)),
    totalWidth: leftWidth + rightWidth || padX * 2,
    valueCenterX: Number((leftWidth + rightPack.offsets[1] + valueWidth / 2).toFixed(2)),
  };
}

/** Render the dot, icons, label, special element, and value of a badge or button in paint order. */
function renderCapsuleBody(options: CapsuleBodyOptions): string {
  const { animMode, icons, layout, metrics, palette } = options;
  const { fontSize, height, iconSize } = metrics;
  const textY = computeCenteredBaselineY(height, fontSize);
  const iconY = Number(((height - iconSize) / 2).toFixed(2));
  const { leftMotion, rightMotion } = resolveIconAnimationPair(animMode, icons);

  const dotMarkup = renderDotMarkup(options.dot, layout.dotCx, height / 2, animMode);
  const leftIconMarkup = renderIconMarkup({
    color: options.isLeftOnPrimary ? WHITE : palette.iconColor,
    iconSize,
    iconY,
    motion: leftMotion,
    opacity: options.isLeftOnPrimary ? PRIMARY_FOREGROUND_OPACITY : undefined,
    slot: icons.left,
    visualStartX: layout.leftIconX,
  });
  const rightIconMarkup = renderIconMarkup({
    color: options.isRightOnPrimary ? WHITE : palette.iconColor,
    iconSize,
    iconY,
    motion: rightMotion,
    opacity: options.isRightOnPrimary ? PRIMARY_FOREGROUND_OPACITY : undefined,
    slot: icons.right,
    visualStartX: layout.rightIconX,
  });
  const labelMarkup = renderTextPathMarkup(options.labelText, {
    anchorX: layout.labelCenterX,
    baselineY: textY,
    fill: resolveSurfaceTextColor(options.variant, options.isLeftOnPrimary),
    fontSize,
    isBold: options.isLabelBold,
  });
  const valueMarkup = renderTextPathMarkup(options.valueText, {
    anchorX: layout.valueCenterX,
    baselineY: textY,
    fill: options.valueColor,
    fontSize,
    isBold: true,
  });
  return `${dotMarkup}${leftIconMarkup}${labelMarkup}${options.specialMarkup}${valueMarkup}${rightIconMarkup}`;
}

/** Build the raw accessible `aria-label` text (`label: value`, either part alone, or the first visible icon/dot name). */
function buildAriaLabel(
  labelText: string,
  valueText: string,
  icons: ResolvedIconPair,
  dot: DotState | undefined
): string {
  if (labelText.length > 0 && valueText.length > 0) {
    return `${labelText}: ${valueText}`;
  }
  if (labelText.length > 0 || valueText.length > 0) {
    return labelText || valueText;
  }
  if (icons.left.data) {
    return icons.left.slug;
  }
  if (icons.right.data) {
    return icons.right.slug;
  }
  return dot ?? 'badge';
}

/** Build the content-addressed ID of the standalone icon sheen gradient (`'icon-sheen'`, or suffixed for scaled icon bodies). */
function buildIconSheenId(coordScale: number): string {
  return coordScale === 1 ? 'icon-sheen' : `icon-sheen-s${Math.round(1000 / coordScale)}`;
}

/**
 * Render the standalone icon sheen `<linearGradient>`.
 * The gradient uses `userSpaceOnUse` coordinates of the painted paths, so icon bodies drawn in a scaled
 * coordinate space (Devicon's `128x128` grid) get an inverse `gradientTransform` to sweep the full `24x24` box.
 */
function renderIconSheenGradientDef(sheenId: string, coordScale: number): string {
  const transformAttr =
    coordScale === 1 ? '' : ` gradientTransform="scale(${Number((1 / coordScale).toFixed(4))})"`;
  return `<linearGradient id="${sheenId}" gradientUnits="userSpaceOnUse" x1="-58" y1="0" x2="-32" y2="26"${transformAttr}>${renderWhiteBandStops(ICON_SHEEN_BAND_STOPS)}<animate attributeName="x1" values="-58;58;58" keyTimes="0;0.38;1" calcMode="spline" keySplines="0.42 0 0.25 1;0 0 1 1" dur="4s" repeatCount="indefinite" /><animate attributeName="x2" values="-32;84;84" keyTimes="0;0.38;1" calcMode="spline" keySplines="0.42 0 0.25 1;0 0 1 1" dur="4s" repeatCount="indefinite" /></linearGradient>`;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render a complete `22px` badge SVG string from `BadgeRenderOptions`.
 * @param options   Badge rendering configuration (label, value, color, variant, icon, dot, special, anim).
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderBadge(options: BadgeRenderOptions): string {
  const { color, variant } = options;
  const palette = THEMES[color];
  const animMode: AnimationMode = options.anim ?? 'default';
  const metrics = BADGE_METRICS;
  const { fontSize, height, iconSize, padX, radiusX } = metrics;

  const labelText = prepareDisplayText(options.label, MAX_LABEL_LENGTH);
  const valueText = prepareDisplayText(options.value ?? '', MAX_LABEL_LENGTH);
  const special = sanitizeSpecialElement(options.special);
  const icons = resolveIconPair(options.icon);
  const specialWidth = measureSpecialElementWidth(special, fontSize);
  const layout = computeCapsuleLayout({
    gap: 6,
    hasDot: isRenderableDot(options.dot),
    labelWidth: measureTextWidth(labelText, fontSize, false),
    leftIconWidth: measureIconVisualWidth(icons.left.data, iconSize),
    minLeftWidth: 0,
    padX,
    rightIconWidth: measureIconVisualWidth(icons.right.data, iconSize),
    specialWidth,
    valueWidth: measureTextWidth(valueText, fontSize, true),
  });

  const isSolidCapsule = variant === '1';
  const hasSparkline = special?.type === 'sparkline' && special.values.length >= 2;
  const specialMarkup = renderSpecialElementMarkup(special, {
    animMode,
    color,
    fontSize,
    height,
    isSolidCapsule,
    palette,
    specialWidth,
    specialX: layout.specialX,
  });
  const body = renderCapsuleBody({
    animMode,
    dot: options.dot,
    icons,
    isLabelBold: false,
    isLeftOnPrimary: isSolidCapsule && !layout.isSplit,
    isRightOnPrimary: isSolidCapsule,
    labelText,
    layout,
    metrics,
    palette,
    specialMarkup,
    valueColor: resolveValueColor(variant, palette),
    valueText,
    variant,
  });
  const surface = renderBadgeSurface({ color, height, layout, radiusX, variant });
  const sheen = renderSheenOverlay({ animMode, height, radius: radiusX, width: layout.totalWidth });
  const surfaceDefs = renderSurfaceGradientDefs(
    color,
    !isSolidCapsule || layout.isSplit,
    isSolidCapsule
  );
  const sparkGradDef = hasSparkline ? renderSparklineGradientDef(isSolidCapsule, color) : '';

  return renderSvgDocument({
    ariaLabel: buildAriaLabel(labelText, valueText, icons, options.dot),
    body: `${surface}${body}${sheen.overlay}`,
    defs: `${surfaceDefs}${sparkGradDef}${sheen.clipDef}`,
    height,
    width: layout.totalWidth,
  });
}

/**
 * Render a CTA button SVG string (`svg.xul.is/button/*` and `svg.xul.is/btn/*`) from `ButtonRenderOptions`.
 * Supports size presets (`sm`, `md`, `lg`, `xl` or custom pixel height), unified `icon` (`'left'`, `'left,right'`, `'none,right'`),
 * status `dot`, optional 2-segment split `value`, and 3 Kumo 3D variants (`1`, `2`, `3`).
 * @param options   Button rendering configuration.
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderButton(options: ButtonRenderOptions): string {
  const { color, variant } = options;
  const palette = THEMES[color];
  const animMode: AnimationMode = options.anim ?? 'default';
  const metrics = resolveButtonMetrics(options.size);
  const { fontSize, height, iconSize, padX, radiusX } = metrics;

  const labelText = prepareDisplayText(options.label, MAX_LABEL_LENGTH);
  const valueText = prepareDisplayText(options.value ?? '', MAX_LABEL_LENGTH);
  const icons = resolveIconPair(options.icon);
  const layout = computeCapsuleLayout({
    gap: Math.max(6, Math.round(height * 0.24)),
    hasDot: isRenderableDot(options.dot),
    labelWidth: measureTextWidth(labelText, fontSize, true),
    leftIconWidth: measureIconVisualWidth(icons.left.data, iconSize),
    minLeftWidth: padX * 2,
    padX,
    rightIconWidth: measureIconVisualWidth(icons.right.data, iconSize),
    specialWidth: 0,
    valueWidth: measureTextWidth(valueText, fontSize, true),
  });

  const isPrimary = variant === '1';
  const body = renderCapsuleBody({
    animMode,
    dot: options.dot,
    icons,
    isLabelBold: true,
    isLeftOnPrimary: isPrimary,
    isRightOnPrimary: isPrimary,
    labelText,
    layout,
    metrics,
    palette,
    specialMarkup: '',
    valueColor:
      isPrimary && layout.isSplit ? 'rgba(255,255,255,0.88)' : resolveValueColor(variant, palette),
    valueText,
    variant,
  });
  const surface = renderKumoBoxSurface({
    color,
    height,
    radius: radiusX,
    splitLineX: layout.isSplit ? layout.leftWidth : undefined,
    variant,
    width: layout.totalWidth,
  });
  const sheen = renderSheenOverlay({ animMode, height, radius: radiusX, width: layout.totalWidth });

  return renderSvgDocument({
    ariaLabel: buildAriaLabel(labelText, valueText, icons, options.dot),
    body: `${surface}${body}${sheen.overlay}`,
    defs: `${renderSurfaceGradientDefs(color, !isPrimary, isPrimary)}${sheen.clipDef}`,
    height,
    width: layout.totalWidth,
  });
}

/**
 * Render a standalone SVG icon string (`svg.xul.is/icon/:icon`).
 * Uses a padded `-3 -3 30 30` viewBox centered at `(12, 12)` so rotation, scale, and translation
 * micro-animations never clip on any of the four sides.
 * @param options   Standalone icon rendering configuration (`icon`, `color`, `size`, `strokeWidth`, `anim`).
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderIcon(options: IconRenderOptions): string {
  const { iconColor } = THEMES[options.color];
  const animMode: AnimationMode = options.anim ?? 'default';
  const size = clampInt(options.size, ICON_SIZE_RANGE);
  const strokeWidth = Number(clampNumber(options.strokeWidth, ICON_STROKE_RANGE).toFixed(2));

  const slug = options.icon.trim().toLowerCase() || DEFAULT_STANDALONE_ICON_SLUG;
  const iconData = resolveIconWithFallback(slug, FALLBACK_ICON_SLUG);
  const slot: IconSlot = { data: iconData, key: normalizeIconSlug(slug), slug };
  // Per-icon pairs (e.g., `nudge,shake`) apply their first motion to the single standalone icon.
  const { leftMotion } = resolveIconAnimationPair(animMode, { left: slot, right: EMPTY_ICON_SLOT });

  let sheenDef = '';
  let body = iconData.innerSvg;
  if (isSheenMode(animMode)) {
    // The sheen ID depends only on the gradient content, never on the (untrusted) slug.
    const sheenId = buildIconSheenId(iconData.coordScale);
    const sheenPaint =
      iconData.type === 'lucide' ? `stroke="url(#${sheenId})"` : `fill="url(#${sheenId})"`;
    sheenDef = renderIconSheenGradientDef(sheenId, iconData.coordScale);
    // Reference the body instead of inlining it twice (bodies may carry their own `id` attributes).
    body = `<g id="${ICON_BODY_ID}">${iconData.innerSvg}</g><use href="#${ICON_BODY_ID}" ${sheenPaint} />`;
  }

  return renderSvgDocument({
    ariaLabel: truncateText(slug, MAX_LABEL_LENGTH),
    body: wrapIconWithAnimation(body, slot.key, leftMotion),
    defs: sheenDef,
    height: size,
    paintAttrs: renderIconPaintAttrs(iconData.type, iconColor, strokeWidth),
    viewBox: '-3 -3 30 30',
    width: size,
  });
}
