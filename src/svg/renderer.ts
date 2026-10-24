/**
 * SVG renderer – Single Source of Truth generator for badges, micro-buttons, and standalone icons.
 */

import { ROSE_200, STRIP_DARK_COLORS, STRIP_SOLID_COLORS, WHITE } from '@/config/palette';
import { BASE_DARK, DOT_COLORS, THEMES } from '@/config/theme';
import {
  DEFAULT_ICON_SLUG,
  DEFAULT_ICON_STROKE_WIDTH,
  FALLBACK_ICON_SLUG,
  resolveIconLookup,
  resolvePlaceholderIcon,
} from '@/svg/icons';
import { computeCenteredBaselineY, measureTextWidth, renderTextPathMarkup } from '@/svg/measure';
import {
  BADGE_FONT_SIZE,
  PRIMARY_FOREGROUND_OPACITY,
  SHEEN_SWEEP_TIMING,
  buildIconBodyId,
  clampInt,
  clampNumber,
  computeIconTranslateX,
  getOwnValue,
  hasOwnKey,
  isAnimationDisabled,
  isSheenMode,
  isStripTickState,
  measureIconVisualWidth,
  prepareDisplayText,
  renderIconGroup,
  renderIconPaintAttrs,
  renderKumoBoxSurface,
  renderSheenOverlay,
  renderSurfaceGradientDefs,
  renderSvgDocument,
  renderSweepAnimation,
  renderVerticalGradientDef,
  renderWhiteBandStops,
  resolveForegroundColor,
  resolveForegroundPaint,
  resolveIconMotionTokens,
  resolveSurfaceTextColor,
  roundCoord,
  roundScale,
  roundTenths,
} from '@/svg/shared';
import type {
  AnimationMode,
  BadgeRenderOptions,
  BadgeSpecialElement,
  BadgeVariant,
  BandStop,
  ButtonRenderOptions,
  DotState,
  ForegroundPaint,
  IconLookup,
  IconMotionMode,
  IconRenderOptions,
  NumericRange,
  SizePreset,
  StripTickState,
  SweepTiming,
  ThemeColorName,
  ThemePalette,
  VariantMetrics,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Sparkline polyline and closed area polygon coordinate strings. */
interface SparklinePoints {
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
  /** Whether a single-segment capsule with a status dot places only the dot in the left compartment and `[leftIcon, label, rightIcon]` in the right compartment. */
  isDotAloneInLeftCap?: boolean;
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
  /** Whether only the status dot occupies the left compartment while `[leftIcon, label, rightIcon]` sit in the right compartment. */
  isDotOnlyLeft: boolean;
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

/** A requested icon slot of a badge or button (resolved data, canonical key, and requested slug). */
interface IconSlot extends IconLookup {
  /** Whether the slot fell back to the placeholder icon because the requested slug was unknown. */
  isFallback?: boolean;
  /** Trimmed requested slug (used as the accessible fallback name). */
  slug: string;
}

/** Resolved left and right icon slots of a badge or button. */
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
  /** Rendered icon size in pixels. */
  iconSize: number;
  /** Top Y coordinate of the icon box. */
  iconY: number;
  /** Whether the icon sits on a vivid primary (`variant=1`) surface. */
  isOnPrimary: boolean;
  /** Micro-animation applied to the icon. */
  motion: IconMotionMode;
  /** Stroke or fill color and optional group opacity. */
  paint: ForegroundPaint;
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
  isOnPrimary: boolean;
  /** Resolved theme palette of `color`. */
  palette: ThemePalette;
  /** Width of the special element box in pixels. */
  specialWidth: number;
  /** Starting X coordinate of the special element box. */
  specialX: number;
}

/** Rendered special element: Root `<defs>` content and visible markup. */
interface SpecialElementMarkup {
  /** Gradient definitions for the root `<defs>` (`''` when none are needed). */
  defs: string;
  /** Visible SVG markup inserted between the label and the value. */
  markup: string;
}

/** Geometry of the `bar:` progress widget. */
interface BarWidgetGeometry {
  /** Track and fill height in pixels (the corner radius is half of it). */
  height: number;
  /** Minimum width in pixels of a non-empty fill. */
  minFillWidth: number;
  /** Track width in pixels. */
  width: number;
}

/** Geometry of the `bars:` vertical bar histogram widget. */
interface BarsWidgetGeometry {
  /** Horizontal gap between adjacent bars in pixels. */
  barGap: number;
  /** Bar width in pixels (the corner radius is half of it). */
  barWidth: number;
  /** Maximum bar height in pixels. */
  maxHeight: number;
  /** Minimum bar height in pixels. */
  minHeight: number;
}

/** Geometry of the `ring:` gauge widget. */
interface RingWidgetGeometry {
  /** Ring radius in pixels. */
  radius: number;
  /** Square box size in pixels. */
  size: number;
  /** Track and arc stroke width in pixels. */
  strokeWidth: number;
}

/** Geometry of the `steps:` discrete step progress pills widget. */
interface StepsWidgetGeometry {
  /** Horizontal gap between adjacent step pills in pixels. */
  pillGap: number;
  /** Pill height in pixels (the corner radius is half of it). */
  pillHeight: number;
  /** Pill width in pixels. */
  pillWidth: number;
}

/** Geometry of the `strip:` history widget. */
interface StripWidgetGeometry {
  /** Horizontal gap between adjacent ticks in pixels. */
  tickGap: number;
  /** Tick height in pixels. */
  tickHeight: number;
  /** Tick width in pixels (the corner radius is half of it). */
  tickWidth: number;
}

/** Geometry of the `delta:` trend widget. */
interface DeltaWidgetGeometry {
  /** Square arrow box size in `px` (`10x10` arrow paths). */
  arrowSize: number;
  /** Arrow stroke width in pixels. */
  arrowStrokeWidth: number;
  /** Amount in pixels by which the readout font is smaller than the badge font. */
  fontSizeReduction: number;
  /** Horizontal offset in pixels of the readout from the widget start. */
  textOffset: number;
}

/** Geometry of the `sparkline:` trend widget. */
interface SparklineWidgetGeometry {
  /** Box height in pixels. */
  height: number;
  /** Polyline stroke width in pixels. */
  strokeWidth: number;
  /** Box width in pixels. */
  width: number;
}

/** Geometry of every right-compartment special widget (shared by measurement and rendering). */
interface SpecialWidgetGeometry {
  /** `bar:` progress widget. */
  bar: BarWidgetGeometry;
  /** `bars:` vertical bar histogram widget. */
  bars: BarsWidgetGeometry;
  /** `delta:` trend widget. */
  delta: DeltaWidgetGeometry;
  /** `ring:` gauge widget. */
  ring: RingWidgetGeometry;
  /** `sparkline:` trend widget. */
  sparkline: SparklineWidgetGeometry;
  /** `steps:` discrete step progress pills widget. */
  steps: StepsWidgetGeometry;
  /** `strip:` history widget. */
  strip: StripWidgetGeometry;
}

/** Lazily built bar shimmer `<linearGradient>` definitions by surface kind. */
interface BarShimmerDefCache {
  /** White shimmer on vivid primary capsules. */
  solid?: string;
  /** Softer shimmer on dark capsules. */
  tinted?: string;
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
  radius: number;
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
  /** Whether the label uses the bold font weight. */
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

/** Visible texts and fallbacks that make up the accessible name of a badge or button. */
interface AriaLabelParts {
  /** Optional status dot state (named when nothing else is visible). */
  dot: DotState | undefined;
  /** Generic name used when nothing is visible (`'badge'` or `'button'`). */
  fallbackName: string;
  /** Resolved icon slots (the first visible icon is named when there is no text). */
  icons: ResolvedIconPair;
  /** Label text. */
  labelText: string;
  /** Short text form of the special element (`''` for none). */
  specialText: string;
  /** Value text. */
  valueText: string;
}

/** Nudge vector shape (`[deltaX, deltaY]` in `24x24` icon units). */
type NudgeVector = readonly [deltaX: number, deltaY: number];

/** Status dot animation family selected by semantic dot color. */
type DotAnimationKind = 'active' | 'critical' | 'incident' | 'standby' | 'warning';

/** Minimum, maximum, and span of a finite numeric series. */
interface SeriesBounds {
  /** Largest value in the series. */
  maxValue: number;
  /** Smallest value in the series. */
  minValue: number;
  /** Span (`maxValue - minValue`). */
  range: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Rendered size bounds in pixels for standalone SVG icons. */
export const ICON_SIZE_RANGE: NumericRange = { default: 24, max: 256, min: 8 };

/** Stroke width bounds in `24x24` viewBox units for standalone stroked SVG icons. */
export const ICON_STROKE_RANGE: NumericRange = {
  default: DEFAULT_ICON_STROKE_WIDTH,
  max: 4,
  min: 1,
};

/** Custom pixel height bounds for CTA buttons. */
export const BUTTON_HEIGHT_RANGE: NumericRange = { default: 30, max: 48, min: 22 };

/** Maximum badge/button label, value, and delta length in UTF-16 code units before ellipsis truncation. */
export const MAX_LABEL_LENGTH = 128;

/** Minimum number of data points required by `sparkline:` and `bars:` series widgets. */
export const MIN_SERIES_POINTS = 2;

/** Maximum number of bars in a `bars:` special element. */
export const MAX_BARS_POINTS = 10;

/** Maximum number of discrete step pills in a `steps:` special element. */
export const MAX_STEPS_COUNT = 10;

/** Maximum number of ticks in a `strip:` special element. */
export const MAX_STRIP_TICKS = 10;

/** Maximum single-digit tick state accepted by `strip:` history widgets (derived from the strip color scale). */
export const STRIP_TICK_MAX_STATE = Object.keys(STRIP_DARK_COLORS).length - 1;

/** Maximum number of points in a `sparkline:` special element. */
export const MAX_SPARKLINE_POINTS = 64;

/** Bounds of `bar:` and `ring:` gauge percentages. */
export const PERCENT_RANGE: NumericRange = { default: 0, max: 100, min: 0 };

/** Bounds of `steps:` total step count. */
const STEPS_TOTAL_RANGE: NumericRange = { default: 1, max: MAX_STEPS_COUNT, min: 1 };

/**
 * Largest absolute sparkline value; Keeps `max - min` finite (`1e308 - -1e308` overflows to `Infinity`
 * and would turn every point into `NaN`).
 */
const MAX_SPARKLINE_MAGNITUDE = 1e12;

/** Default size preset for CTA buttons when `size` is omitted or unrecognized. */
export const DEFAULT_BUTTON_SIZE: SizePreset = 'md';

/** Named size scale presets for CTA buttons. */
export const BUTTON_SIZE_PRESETS: Readonly<Record<SizePreset, VariantMetrics>> = {
  lg: { fontSize: 14, height: 36, iconSize: 17, padX: 18, radius: 11 },
  md: { fontSize: 12.5, height: 30, iconSize: 15, padX: 14, radius: 9 },
  sm: { fontSize: 11.5, height: 26, iconSize: 14, padX: 12, radius: 7 },
  xl: { fontSize: 15.5, height: 42, iconSize: 19, padX: 22, radius: 13 },
};

/** Fixed height in pixels of standard status and service badges. */
export const BADGE_HEIGHT = 22;

/** Size metrics for standard badges across every visual variant. */
const BADGE_METRICS: VariantMetrics = {
  fontSize: BADGE_FONT_SIZE,
  height: BADGE_HEIGHT,
  iconSize: 13,
  padX: 9,
  radius: 6,
};

/** Geometry of every right-compartment special widget (single source for measurement and rendering). */
const SPECIAL_WIDGET_GEOMETRY: Readonly<SpecialWidgetGeometry> = {
  bar: { height: 6, minFillWidth: 4, width: 32 },
  bars: { barGap: 1.5, barWidth: 2.5, maxHeight: 11, minHeight: 2 },
  delta: { arrowSize: 10, arrowStrokeWidth: 1.6, fontSizeReduction: 0.5, textOffset: 13 },
  ring: { radius: 4.5, size: 12, strokeWidth: 2 },
  sparkline: { height: 11, strokeWidth: 1.5, width: 36 },
  steps: { pillGap: 2, pillHeight: 6, pillWidth: 5 },
  strip: { tickGap: 2, tickHeight: 10, tickWidth: 2.5 },
};

/** Stroke width of stroked icons inside badges and buttons in `24x24` icon units. */
const CAPSULE_ICON_STROKE_WIDTH = DEFAULT_ICON_STROKE_WIDTH;

/** Horizontal slot width in pixels reserved for the status dot. */
const DOT_SLOT_WIDTH = 7;

/** Radius in pixels of the solid status dot core. */
const DOT_CORE_RADIUS = 3;

/** Start radius in pixels of the outward status dot ripple. */
const DOT_RIPPLE_START_RADIUS = 2.6;

/** Center coordinate of the `24x24` icon box (pivot of rotations and scale pulses). */
const ICON_CENTER = 12;

/** Paint of the empty gauge track on vivid primary capsules (a dark translucent groove). */
const PRIMARY_GAUGE_TRACK_COLOR = 'rgba(0,0,0,0.28)';

/** Prefix of the content-addressed standalone icon body ID referenced by the sheen pass. */
const ICON_BODY_ID_PREFIX = 'icon-body';

/** Empty icon slot for missing left/right icons. */
const EMPTY_ICON_SLOT: Readonly<IconSlot> = { data: undefined, key: '', slug: '' };

/** Rendered special element without definitions or markup. */
const EMPTY_SPECIAL_ELEMENT: Readonly<SpecialElementMarkup> = { defs: '', markup: '' };

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

/** Timing of the standalone icon sheen sweep (the surface sheen timing with a slightly longer sweep). */
const ICON_SHEEN_SWEEP_TIMING: Readonly<SweepTiming> = { ...SHEEN_SWEEP_TIMING, sweepEnd: 0.38 };

/** Timing of the rightward `bar:` shimmer wave. */
const BAR_SHIMMER_SWEEP_TIMING: Readonly<SweepTiming> = {
  duration: '2.3s',
  easing: '0.4 0 0.2 1',
  sweepEnd: 0.54,
};

/** Contextual non-directional motion presets keyed by canonical icon slug in `'auto'` mode. */
const AUTO_ICON_MOTIONS: Readonly<Record<string, IconMotionMode>> = {
  activity: 'pulse',
  'alert-triangle': 'shake',
  bell: 'shake',
  box: 'float',
  bug: 'shake',
  cloud: 'float',
  cog: 'spin',
  compass: 'spin',
  disc: 'spin',
  fan: 'spin',
  feather: 'float',
  flame: 'shake',
  ghost: 'float',
  heart: 'pulse',
  'heart-handshake': 'pulse',
  layers: 'float',
  loader: 'spin',
  'loader-circle': 'spin',
  orbit: 'spin',
  package: 'float',
  'party-popper': 'shake',
  podcast: 'pulse',
  radio: 'pulse',
  'refresh-ccw': 'spin',
  'refresh-cw': 'spin',
  'rotate-ccw': 'spin',
  'rotate-cw': 'spin',
  settings: 'spin',
  'shield-alert': 'shake',
  sparkles: 'shake',
  star: 'shake',
  'triangle-alert': 'shake',
  trophy: 'shake',
  'wand-sparkles': 'shake',
  wifi: 'pulse',
  zap: 'shake',
};

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

/** Semantic status dot animation families keyed by dot color (unlisted colors use the default calm wave). */
const DOT_ANIMATION_KINDS: Readonly<Partial<Record<DotState, DotAnimationKind>>> = {
  amber: 'warning',
  blue: 'active',
  cyan: 'active',
  gray: 'standby',
  indigo: 'active',
  neutral: 'standby',
  orange: 'incident',
  red: 'critical',
  rose: 'critical',
  sky: 'active',
  slate: 'standby',
  stone: 'standby',
  yellow: 'warning',
  zinc: 'standby',
};

/** Symmetric 4-segment sine-wave SMIL timing shared by continuous `'breathe'` and `'float'` icon motions. */
const SINE_WAVE_TIMING =
  'keyTimes="0;0.25;0.5;0.75;1" calcMode="spline" keySplines="0.36 0.66 0.64 1;0.36 0 0.64 0.34;0.36 0.66 0.64 1;0.36 0 0.64 0.34" dur="3.4s"';

/** Symmetric 2-segment ease-in-out SMIL spline attributes for breathing status dots and soft widget pulses. */
const SMOOTH_BREATH_SPLINES =
  'calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"';

/** Lazily built bar shimmer `<linearGradient>` definitions (one per surface kind). */
const BAR_SHIMMER_DEFS: BarShimmerDefCache = {};

/** Memoized standalone icon sheen `<linearGradient>` definitions by icon coordinate scale (one entry per icon set scale). */
const ICON_SHEEN_DEF_CACHE = new Map<number, string>();

/** Memoized sparkline area `<linearGradient>` definitions by gradient ID (white plus one per theme color). */
const SPARKLINE_GRADIENT_DEF_CACHE = new Map<string, string>();

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches percent signs, plus signs, and whitespace that decorate a numeric delta readout. */
const DELTA_DECORATION_RX = /[%+\s]/g;

/** Matches the Unicode minus sign (`U+2212`), normalized to an ASCII hyphen before parsing deltas. */
const UNICODE_MINUS_RX = /\u2212/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Compute the rounded pixel span of `n` repeated segments of `itemWidth` separated by `gap`. */
function measureSegmentedSpan(n: number, itemWidth: number, gap: number): number {
  return n <= 0 ? 0 : Math.ceil(n * itemWidth + (n - 1) * gap);
}

/** Compute the minimum, maximum, and span of a non-empty numeric series. */
function computeSeriesBounds(values: readonly number[]): SeriesBounds {
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < minValue) {
      minValue = value;
    }
    if (value > maxValue) {
      maxValue = value;
    }
  }
  return { maxValue, minValue, range: maxValue - minValue };
}

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
      return special.values.length >= 2 ? SPECIAL_WIDGET_GEOMETRY.sparkline.width : 0;
    }
    case 'bars': {
      const { barGap, barWidth } = SPECIAL_WIDGET_GEOMETRY.bars;
      return special.values.length < 2
        ? 0
        : measureSegmentedSpan(special.values.length, barWidth, barGap);
    }
    case 'bar': {
      return SPECIAL_WIDGET_GEOMETRY.bar.width;
    }
    case 'steps': {
      const { pillGap, pillWidth } = SPECIAL_WIDGET_GEOMETRY.steps;
      return measureSegmentedSpan(special.total, pillWidth, pillGap);
    }
    case 'ring': {
      return SPECIAL_WIDGET_GEOMETRY.ring.size;
    }
    case 'strip': {
      const { tickGap, tickWidth } = SPECIAL_WIDGET_GEOMETRY.strip;
      return measureSegmentedSpan(special.states.length, tickWidth, tickGap);
    }
    case 'delta': {
      const { fontSizeReduction, textOffset } = SPECIAL_WIDGET_GEOMETRY.delta;
      return textOffset + measureTextWidth(special.value, fontSize - fontSizeReduction, true);
    }
    default: {
      return 0;
    }
  }
}

/** Keep the finite series values (at most `maxPoints`), clamped to `±MAX_SPARKLINE_MAGNITUDE`. */
function sanitizeSeriesValues(values: readonly number[], maxPoints: number): number[] {
  const sanitized: number[] = [];
  for (const value of values) {
    if (Number.isFinite(value) && sanitized.length < maxPoints) {
      sanitized.push(Math.min(MAX_SPARKLINE_MAGNITUDE, Math.max(-MAX_SPARKLINE_MAGNITUDE, value)));
    }
  }
  return sanitized;
}

/** Keep the valid strip tick states, at most `MAX_STRIP_TICKS`. */
function sanitizeStripStates(states: readonly string[]): StripTickState[] {
  const sanitized: StripTickState[] = [];
  for (const state of states) {
    if (sanitized.length >= MAX_STRIP_TICKS) {
      break;
    }
    if (isStripTickState(state)) {
      sanitized.push(state);
    }
  }
  return sanitized;
}

/**
 * Sanitize a special element before layout, whatever its source (query DSL or upstream JSON): Series
 * values become finite and bounded, gauge percentages are clamped to `PERCENT_RANGE` (`NaN` becomes `0`),
 * step pills clamp `total` and `done`, strips keep at most `MAX_STRIP_TICKS` valid ticks, and delta text
 * is normalized, trimmed, and capped (an empty delta renders no special element).
 */
function sanitizeSpecialElement(
  special: BadgeSpecialElement | undefined
): BadgeSpecialElement | undefined {
  switch (special?.type) {
    case 'sparkline': {
      return {
        type: 'sparkline',
        values: sanitizeSeriesValues(special.values, MAX_SPARKLINE_POINTS),
      };
    }
    case 'bars': {
      return { type: 'bars', values: sanitizeSeriesValues(special.values, MAX_BARS_POINTS) };
    }
    case 'bar':
    case 'ring': {
      return { ...special, value: clampNumber(special.value, PERCENT_RANGE) };
    }
    case 'steps': {
      if (!Number.isFinite(special.total) || Math.round(special.total) < 1) {
        return undefined;
      }
      const total = clampInt(special.total, STEPS_TOTAL_RANGE);
      const done = clampInt(special.done, { default: 0, max: total, min: 0 }, 0);
      return { done, total, type: 'steps' };
    }
    case 'strip': {
      return { states: sanitizeStripStates(special.states), type: 'strip' };
    }
    case 'delta': {
      const deltaText = prepareDisplayText(special.value, MAX_LABEL_LENGTH).trim();
      return deltaText.length > 0 ? { type: 'delta', value: deltaText } : undefined;
    }
    default: {
      return undefined;
    }
  }
}

/**
 * Describe a rendered (sanitized, non-empty) special element in a few words for the `aria-label`
 * (e.g., `'85%'`, `'+14%'`, `'4/5'`, `'5 checks'`, `'histogram'`, `'trend'`); Bar/ring gauges and
 * step pills are omitted (`''`) when the value already states the percentage or fraction.
 */
function describeSpecialElement(special: BadgeSpecialElement, valueText: string): string {
  switch (special.type) {
    case 'sparkline': {
      return 'trend';
    }
    case 'bars': {
      return 'histogram';
    }
    case 'bar':
    case 'ring': {
      return valueText.includes('%') ? '' : `${Math.round(special.value)}%`;
    }
    case 'steps': {
      return valueText.includes('/') ? '' : `${special.done}/${special.total}`;
    }
    case 'strip': {
      return `${special.states.length} ${special.states.length === 1 ? 'check' : 'checks'}`;
    }
    case 'delta': {
      return special.value;
    }
    default: {
      return '';
    }
  }
}

/**
 * Compute SVG `<polyline>` and closed `<polygon>` area coordinate pairs for an inline sparkline.
 * Centers the `height - 2` stroke range vertically inside the `height` box (`startY + 1` to `startY + height - 1`).
 */
function buildSparklinePoints(
  values: number[],
  startX: number,
  startY: number,
  width: number,
  height: number
): SparklinePoints | undefined {
  if (values.length < 2) {
    return undefined;
  }
  const { minValue, range } = computeSeriesBounds(values);
  const strokeHeight = height - 2;
  const strokeTopY = startY + 1;
  let linePoints = '';

  for (const [i, value] of values.entries()) {
    const pointX = startX + (i / (values.length - 1)) * width;
    // Flat series (all values equal) are drawn through the vertical center instead of the bottom edge:
    const normalized = range > 0 ? (value - minValue) / range : 0.5;
    const pointY = strokeTopY + strokeHeight - normalized * strokeHeight;
    linePoints += `${i > 0 ? ' ' : ''}${pointX.toFixed(1)},${pointY.toFixed(1)}`;
  }

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
  return (
    getOwnValue(AUTO_ICON_MOTIONS, iconKey) ??
    (hasOwnKey(AUTO_NUDGE_VECTORS, iconKey) ? 'nudge' : undefined)
  );
}

/** Wrap inner icon SVG with SMIL animations that pivot around the `24x24` box center (scale pulses and shakes). */
function wrapCenteredAnimation(innerSvg: string, animations: string): string {
  return `<g transform="translate(${ICON_CENTER}, ${ICON_CENTER})"><g>${animations}<g transform="translate(-${ICON_CENTER}, -${ICON_CENTER})">${innerSvg}</g></g></g>`;
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
      return `<g><animateTransform attributeName="transform" type="rotate" from="0 ${ICON_CENTER} ${ICON_CENTER}" to="360 ${ICON_CENTER} ${ICON_CENTER}" dur="3s" repeatCount="indefinite" />${innerSvg}</g>`;
    }
    case 'whirl': {
      return `<g><animateTransform attributeName="transform" type="rotate" values="0 ${ICON_CENTER} ${ICON_CENTER};360 ${ICON_CENTER} ${ICON_CENTER}" keyTimes="0;1" calcMode="spline" keySplines="0.42 0.15 0.58 0.85" dur="2.2s" repeatCount="indefinite" />${innerSvg}</g>`;
    }
    case 'turn': {
      return `<g><animateTransform attributeName="transform" type="rotate" values="0 ${ICON_CENTER} ${ICON_CENTER};0 ${ICON_CENTER} ${ICON_CENTER};360 ${ICON_CENTER} ${ICON_CENTER}" keyTimes="0;0.58;1" calcMode="spline" keySplines="0 0 1 1;0.42 0 0.2 1" dur="3s" repeatCount="indefinite" />${innerSvg}</g>`;
    }
    case 'shake': {
      return wrapCenteredAnimation(
        innerSvg,
        '<animateTransform attributeName="transform" type="scale" values="1;1;1.15;1.15;1.15;1.15;1;1" keyTimes="0;0.62;0.70;0.76;0.82;0.88;0.95;1" calcMode="spline" keySplines="0 0 1 1;0.34 0 0.2 1;0 0 1 1;0 0 1 1;0 0 1 1;0.4 0 0.2 1;0 0 1 1" dur="3.2s" repeatCount="indefinite" /><animateTransform attributeName="transform" type="rotate" values="0;0;-11;11;-9;7;0;0" keyTimes="0;0.62;0.70;0.76;0.82;0.88;0.95;1" calcMode="spline" keySplines="0 0 1 1;0.36 0 0.24 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.36 0 0.2 1;0 0 1 1" dur="3.2s" additive="sum" repeatCount="indefinite" />'
      );
    }
    case 'nudge': {
      const [deltaX, deltaY] = getOwnValue(AUTO_NUDGE_VECTORS, iconKey) ?? DEFAULT_NUDGE_VECTOR;
      return `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 0;${deltaX} ${deltaY};0 0;0 0" keyTimes="0;0.62;0.76;0.92;1" calcMode="spline" keySplines="0 0 1 1;0.34 0 0.2 1;0.4 0 0.2 1;0 0 1 1" dur="2.8s" repeatCount="indefinite" />${innerSvg}</g>`;
    }
    case 'pulse': {
      return wrapCenteredAnimation(
        innerSvg,
        '<animateTransform attributeName="transform" type="scale" values="1;1;1.18;0.96;1.14;1;1" keyTimes="0;0.56;0.67;0.76;0.85;0.96;1" calcMode="spline" keySplines="0 0 1 1;0.34 0 0.22 1;0.42 0 0.58 1;0.42 0 0.58 1;0.4 0 0.2 1;0 0 1 1" dur="2.6s" repeatCount="indefinite" />'
      );
    }
    case 'breathe': {
      return wrapCenteredAnimation(
        innerSvg,
        `<animateTransform attributeName="transform" type="scale" values="1;1.11;1;0.89;1" ${SINE_WAVE_TIMING} repeatCount="indefinite" />`
      );
    }
    case 'float': {
      return `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -1.5;0 0;0 1.5;0 0" ${SINE_WAVE_TIMING} repeatCount="indefinite" />${innerSvg}</g>`;
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
  const [firstToken, secondToken] = resolveIconMotionTokens(animMode);
  if (firstToken === undefined) {
    return STATIC_ICON_MOTIONS;
  }
  if (secondToken !== undefined) {
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

/** Resolve a single requested icon slug into an icon slot (empty slugs become `'none'`, unknown slugs render the red placeholder icon). */
function resolveIconSlot(rawSlug: string): IconSlot {
  const slug = rawSlug.trim() || 'none';
  if (slug === 'none') {
    return EMPTY_ICON_SLOT;
  }
  const lookup = resolveIconLookup(slug);
  if (!lookup.data) {
    return {
      data: resolvePlaceholderIcon(),
      isFallback: true,
      key: FALLBACK_ICON_SLUG,
      slug: prepareDisplayText(slug, MAX_LABEL_LENGTH),
    };
  }
  return { data: lookup.data, key: lookup.key, slug };
}

/** Parse an icon specification (`'name'`, `'left,right'`, or `'none,right'`) into resolved left and right icon slots. */
function resolveIconPair(iconSpec: string | undefined): ResolvedIconPair {
  if (!iconSpec) {
    return { left: EMPTY_ICON_SLOT, right: EMPTY_ICON_SLOT };
  }
  const commaIndex = iconSpec.indexOf(',');
  if (commaIndex === -1) {
    return { left: resolveIconSlot(iconSpec), right: EMPTY_ICON_SLOT };
  }
  return {
    left: resolveIconSlot(iconSpec.slice(0, commaIndex)),
    right: resolveIconSlot(iconSpec.slice(commaIndex + 1)),
  };
}

/** Render the SVG `<g>` markup for a resolved icon slot, aligned so its leftmost visible pixel starts at `visualStartX`. */
function renderIconMarkup(options: IconMarkupOptions): string {
  const iconData = options.slot.data;
  if (!iconData) {
    return '';
  }
  const scaleNum = options.iconSize / 24;
  const scale = roundScale(scaleNum);
  const translateX = computeIconTranslateX(options.visualStartX, iconData, scaleNum);
  return renderIconGroup({
    color: options.paint.color,
    innerSvg: wrapIconWithAnimation(iconData.innerSvg, options.slot.key, options.motion),
    isFallback: options.slot.isFallback === true,
    isOnPrimary: options.isOnPrimary,
    opacity: options.paint.opacity,
    strokeWidth: CAPSULE_ICON_STROKE_WIDTH,
    transform: `translate(${translateX}, ${options.iconY}) scale(${scale})`,
    type: iconData.type,
  });
}

/** Check whether a status dot state is renderable. */
function isRenderableDot(dot: DotState | undefined): dot is DotState {
  return dot !== undefined && hasOwnKey(DOT_COLORS, dot);
}

/** Render an indefinitely repeating status dot `<animate>` element (`timingAttrs` holds `dur` and optional `keyTimes`/spline attributes). */
function renderDotAnimate(
  attributeName: 'opacity' | 'r',
  values: string,
  timingAttrs: string
): string {
  return `<animate attributeName="${attributeName}" values="${values}" ${timingAttrs} repeatCount="indefinite" />`;
}

/** Render the outward-expanding, fading status dot ripple ring. */
function renderDotRipple(
  position: string,
  color: string,
  radiusValues: string,
  opacityValues: string,
  timingAttrs: string
): string {
  return `<circle ${position} r="${DOT_RIPPLE_START_RADIUS}" fill="${color}" opacity="0">${renderDotAnimate('r', radiusValues, timingAttrs)}${renderDotAnimate('opacity', opacityValues, timingAttrs)}</circle>`;
}

/** Render the solid status dot core, optionally animated. */
function renderDotCore(position: string, color: string, animations = ''): string {
  return animations
    ? `<circle ${position} r="${DOT_CORE_RADIUS}" fill="${color}">${animations}</circle>`
    : `<circle ${position} r="${DOT_CORE_RADIUS}" fill="${color}" />`;
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
  const staticCore = renderDotCore(position, dotHex);
  if (isAnimationDisabled(animMode)) {
    return staticCore;
  }

  switch (DOT_ANIMATION_KINDS[dot]) {
    // [1] Critical / offline state; urgent outward beacon and core pulse:
    case 'critical': {
      return `${renderDotRipple(position, dotHex, '2.6;7.2', '0.75;0', 'dur="1.15s" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"')}${renderDotCore(position, dotHex, renderDotAnimate('opacity', '1;0.55;1', `dur="1.15s" ${SMOOTH_BREATH_SPLINES}`))}`;
    }
    // [2] Incident / overloaded state; fast double-beat outward ripple and core pulse:
    case 'incident': {
      return `${renderDotRipple(position, dotHex, '2.6;6.6;2.6;7.0', '0.72;0;0.55;0', 'keyTimes="0;0.44;0.441;1" calcMode="spline" keySplines="0.22 1 0.36 1;0 0 1 1;0.22 1 0.36 1" dur="1.45s"')}${renderDotCore(position, dotHex, renderDotAnimate('opacity', '1;0.68;1', `dur="1.45s" ${SMOOTH_BREATH_SPLINES}`))}`;
    }
    // [3] Degraded / warning state; double-beat outward radar ripple:
    case 'warning': {
      return `${renderDotRipple(position, dotHex, '2.6;6.4;2.6;6.8', '0.65;0;0.5;0', 'keyTimes="0;0.45;0.451;1" calcMode="spline" keySplines="0.22 1 0.36 1;0 0 1 1;0.22 1 0.36 1" dur="1.8s"')}${staticCore}`;
    }
    // [4] Active work / deploying state; breathing core and soft outward halo:
    case 'active': {
      const breathing = `${renderDotAnimate('r', '2.4;3.2;2.4', `dur="2s" ${SMOOTH_BREATH_SPLINES}`)}${renderDotAnimate('opacity', '0.75;1;0.75', `dur="2s" ${SMOOTH_BREATH_SPLINES}`)}`;
      return `${renderDotRipple(position, dotHex, '2.6;5.8', '0.5;0', 'dur="2s" calcMode="spline" keyTimes="0;1" keySplines="0.25 1 0.5 1"')}${renderDotCore(position, dotHex, breathing)}`;
    }
    // [5] Standby / idle state; calm core breath without a radar ring:
    case 'standby': {
      return renderDotCore(
        position,
        dotHex,
        renderDotAnimate('opacity', '0.9;0.32;0.9', `dur="3.4s" ${SMOOTH_BREATH_SPLINES}`)
      );
    }
    // [6] Operational / default state; calm outward spline wave:
    default: {
      return `${renderDotRipple(position, dotHex, '2.6;6.8', '0.6;0', 'dur="2.3s" calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1"')}${staticCore}`;
    }
  }
}

/** Render a smooth ease-in-out opacity pulse `<animate>` element for inline data widgets. */
function renderSoftPulseAnimate(values: string, dur = '2s'): string {
  return `<animate attributeName="opacity" values="${values}" dur="${dur}" ${SMOOTH_BREATH_SPLINES} repeatCount="indefinite" />`;
}

/** Resolve the empty-track and active paint of a bar (`fill`) or ring (`stroke`) gauge. */
function resolveGaugePaint(
  paintAttr: 'fill' | 'stroke',
  trackOpacity: string,
  context: SpecialElementContext
): GaugePaint {
  const { accentText } = context.palette;
  return {
    activeColor: resolveForegroundColor(context.isOnPrimary, accentText),
    trackAttrs: context.isOnPrimary
      ? `${paintAttr}="${PRIMARY_GAUGE_TRACK_COLOR}"`
      : `${paintAttr}="${accentText}" ${paintAttr}-opacity="${trackOpacity}"`,
  };
}

/** Build the ID of the bar shimmer `<linearGradient>` (`bar-shimmer-w` on primary capsules, `bar-shimmer-c` otherwise). */
function buildBarShimmerId(isOnPrimary: boolean): string {
  return `bar-shimmer-${isOnPrimary ? 'w' : 'c'}`;
}

/** Render (once per surface kind) the animated bar shimmer `<linearGradient>` (white band on primary capsules, softer otherwise). */
function renderBarShimmerDef(isOnPrimary: boolean): string {
  const cacheKey = isOnPrimary ? 'solid' : 'tinted';
  const cached = BAR_SHIMMER_DEFS[cacheKey];
  if (cached !== undefined) {
    return cached;
  }
  const shimmerStops = renderWhiteBandStops([
    [0, '0'],
    [50, isOnPrimary ? '0.95' : '0.52'],
    [100, '0'],
  ]);
  const sweepX1 = renderSweepAnimation(
    'animate',
    'attributeName="x1"',
    '-0.75',
    '1.05',
    BAR_SHIMMER_SWEEP_TIMING
  );
  const sweepX2 = renderSweepAnimation(
    'animate',
    'attributeName="x2"',
    '0',
    '1.8',
    BAR_SHIMMER_SWEEP_TIMING
  );
  const shimmerDef = `<linearGradient id="${buildBarShimmerId(isOnPrimary)}" x1="-0.75" y1="0" x2="0" y2="0">${shimmerStops}${sweepX1}${sweepX2}</linearGradient>`;
  BAR_SHIMMER_DEFS[cacheKey] = shimmerDef;
  return shimmerDef;
}

/**
 * Render an inline horizontal progress/capacity bar from a sanitized percentage.
 * The empty track uses a dark translucent accent color, and the rightward shimmer wave is applied
 * directly as a fill on the filled `<rect>` so it can never enter the empty part of the bar; Its
 * gradient definition goes into the root `<defs>`.
 */
function renderBarWidget(
  percentValue: number,
  hasPulse: boolean,
  context: SpecialElementContext
): SpecialElementMarkup {
  const { isOnPrimary, specialWidth, specialX } = context;
  const { height: barHeight, minFillWidth } = SPECIAL_WIDGET_GEOMETRY.bar;
  const barY = (context.height - barHeight) / 2;
  const barRadius = barHeight / 2;
  const paint = resolveGaugePaint('fill', '0.20', context);
  const trackRect = `<rect x="${specialX}" y="${barY}" width="${specialWidth}" height="${barHeight}" rx="${barRadius}" ${paint.trackAttrs} />`;
  const fillWidth =
    percentValue <= 0
      ? 0
      : Math.max(minFillWidth, roundTenths((percentValue / 100) * specialWidth));
  if (fillWidth <= 0) {
    return { defs: '', markup: trackRect };
  }

  const fillGeometry = `x="${specialX}" y="${barY}" width="${fillWidth}" height="${barHeight}" rx="${barRadius}"`;
  const filledRect = `<rect ${fillGeometry} fill="${paint.activeColor}" />`;
  if (!hasPulse) {
    return { defs: '', markup: `${trackRect}${filledRect}` };
  }
  const shimmerRect = `<rect ${fillGeometry} fill="url(#${buildBarShimmerId(isOnPrimary)})" />`;
  return {
    defs: renderBarShimmerDef(isOnPrimary),
    markup: `${trackRect}${filledRect}${shimmerRect}`,
  };
}

/** Render a mini vertical bar histogram (sanitized to at most `MAX_BARS_POINTS` finite values), bottom-aligned in its widget box. */
function renderBarsWidgetMarkup(values: number[], context: SpecialElementContext): string {
  const { barGap, barWidth, maxHeight, minHeight } = SPECIAL_WIDGET_GEOMETRY.bars;
  const { maxValue, minValue, range } = computeSeriesBounds(values);
  const bottomY = (context.height + maxHeight) / 2;
  const barRadius = barWidth / 2;
  const activeColor = resolveForegroundColor(context.isOnPrimary, context.palette.accentText);
  const isAnimated = !isAnimationDisabled(context.animMode);
  let barsMarkup = '';

  for (const [i, value] of values.entries()) {
    let normalized = 0.5;
    if (minValue >= 0) {
      normalized = maxValue > 0 ? value / maxValue : 0;
    } else if (range > 0) {
      normalized = (value - minValue) / range;
    }
    const barHeight = roundTenths(minHeight + normalized * (maxHeight - minHeight));
    const barX = (context.specialX + i * (barWidth + barGap)).toFixed(1);
    const barY = roundTenths(bottomY - barHeight);
    const isLastBar = i === values.length - 1;
    const opacityAttr = isLastBar ? '' : ' fill-opacity="0.72"';
    const barGeometry = `x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="${barRadius}" fill="${activeColor}"${opacityAttr}`;
    barsMarkup +=
      isAnimated && isLastBar
        ? `<rect ${barGeometry}>${renderSoftPulseAnimate('1;0.45;1')}</rect>`
        : `<rect ${barGeometry} />`;
  }

  return barsMarkup;
}

/** Render discrete step progress pills (`done` filled pills out of `total`). */
function renderStepsWidgetMarkup(
  done: number,
  total: number,
  context: SpecialElementContext
): string {
  const { pillGap, pillHeight, pillWidth } = SPECIAL_WIDGET_GEOMETRY.steps;
  const pillY = (context.height - pillHeight) / 2;
  const pillRadius = pillHeight / 2;
  const paint = resolveGaugePaint('fill', '0.22', context);
  const isAnimated = !isAnimationDisabled(context.animMode) && done > 0 && done < total;
  let pillsMarkup = '';

  for (let i = 0; i < total; i += 1) {
    const pillX = (context.specialX + i * (pillWidth + pillGap)).toFixed(1);
    const isFilled = i < done;
    const pillGeometry = `x="${pillX}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="${pillRadius}"`;
    if (isFilled) {
      pillsMarkup +=
        isAnimated && i === done - 1
          ? `<rect ${pillGeometry} fill="${paint.activeColor}">${renderSoftPulseAnimate('1;0.45;1')}</rect>`
          : `<rect ${pillGeometry} fill="${paint.activeColor}" />`;
    } else {
      pillsMarkup += `<rect ${pillGeometry} ${paint.trackAttrs} />`;
    }
  }

  return pillsMarkup;
}

/** Render an inline circular ring/donut gauge from a sanitized percentage with a dark translucent accent track and optional pulse. */
function renderRingWidgetMarkup(
  percentValue: number,
  hasPulse: boolean,
  context: SpecialElementContext
): string {
  const { radius, size, strokeWidth } = SPECIAL_WIDGET_GEOMETRY.ring;
  const ringCx = context.specialX + size / 2;
  const ringCy = context.height / 2;
  const circumference = roundCoord(2 * Math.PI * radius);
  const arcLength = roundCoord((percentValue / 100) * circumference);
  const paint = resolveGaugePaint('stroke', '0.24', context);
  const circleGeometry = `cx="${ringCx}" cy="${ringCy}" r="${radius}"`;
  const trackCircle = `<circle ${circleGeometry} ${paint.trackAttrs} stroke-width="${strokeWidth}" />`;
  if (arcLength <= 0) {
    // A zero-length dash with a round line cap would still draw a dot:
    return trackCircle;
  }
  const pulseAnim = hasPulse ? renderSoftPulseAnimate('1;0.45;1') : '';
  return `${trackCircle}<circle ${circleGeometry} stroke="${paint.activeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${arcLength} ${circumference}" transform="rotate(-90 ${ringCx} ${ringCy})">${pulseAnim}</circle>`;
}

/** Resolve the fill color for a single sanitized tick in a segmented strip. */
function resolveStripTickColor(state: StripTickState, isOnPrimary: boolean): string {
  return isOnPrimary
    ? (getOwnValue(STRIP_SOLID_COLORS, state) ?? WHITE)
    : (getOwnValue(STRIP_DARK_COLORS, state) ?? THEMES.emerald.accentText);
}

/** Render a segmented uptime/health history strip (sanitized to at most `MAX_STRIP_TICKS` valid ticks). */
function renderStripWidgetMarkup(states: StripTickState[], context: SpecialElementContext): string {
  const { tickGap, tickHeight, tickWidth } = SPECIAL_WIDGET_GEOMETRY.strip;
  const tickGeometry = `y="${(context.height - tickHeight) / 2}" width="${tickWidth}" height="${tickHeight}" rx="${tickWidth / 2}"`;
  const isAnimated = !isAnimationDisabled(context.animMode);
  let ticksMarkup = '';
  for (const [i, state] of states.entries()) {
    const tickX = (context.specialX + i * (tickWidth + tickGap)).toFixed(1);
    const tickColor = resolveStripTickColor(state, context.isOnPrimary);
    const isAnimatedLast = isAnimated && i === states.length - 1;
    ticksMarkup += isAnimatedLast
      ? `<rect x="${tickX}" ${tickGeometry} fill="${tickColor}">${renderSoftPulseAnimate('1;0.4;1')}</rect>`
      : `<rect x="${tickX}" ${tickGeometry} fill="${tickColor}" />`;
  }
  return ticksMarkup;
}

/**
 * Render an inline trend delta arrow and readout from sanitized delta text: Up for positive, down for
 * negative, and flat for zero or non-numeric readouts (e.g., `'-0%'`, `'0.0'`, `'n/a'`). On primary
 * capsules the arrow carries the single foreground opacity, and a flat readout is secondary text.
 */
function renderDeltaWidgetMarkup(deltaText: string, context: SpecialElementContext): string {
  const { height, isOnPrimary, specialX } = context;
  const { arrowSize, arrowStrokeWidth, fontSizeReduction, textOffset } =
    SPECIAL_WIDGET_GEOMETRY.delta;
  const magnitude = Number.parseFloat(
    deltaText.replace(UNICODE_MINUS_RX, '-').replace(DELTA_DECORATION_RX, '')
  );
  const isFlat = magnitude === 0 || !Number.isFinite(magnitude);
  const isNegative = !isFlat && magnitude < 0;

  let trendColor = isOnPrimary ? WHITE : THEMES.emerald.accentText;
  let arrowPath = 'M2.5 7.5L7.5 2.5M4 2.5H7.5V6';
  if (isNegative) {
    trendColor = isOnPrimary ? ROSE_200 : THEMES.rose.accentText;
    arrowPath = 'M2.5 2.5L7.5 7.5M4 7.5H7.5V4';
  } else if (isFlat) {
    trendColor = isOnPrimary ? WHITE : BASE_DARK.textMuted;
    arrowPath = 'M2 5H8M5.5 2.5L8 5L5.5 7.5';
  }

  const arrowY = (height - arrowSize) / 2;
  const arrowOpacityAttr = isOnPrimary ? ` opacity="${PRIMARY_FOREGROUND_OPACITY}"` : '';
  const arrowMarkup = `<g transform="translate(${specialX}, ${arrowY})" fill="none" stroke="${trendColor}" stroke-width="${arrowStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"${arrowOpacityAttr}><path d="${arrowPath}" /></g>`;
  const textWidth = context.specialWidth - textOffset;
  const deltaFontSize = context.fontSize - fontSizeReduction;
  const deltaTextMarkup = renderTextPathMarkup(deltaText, {
    anchorX: roundCoord(specialX + textOffset + textWidth / 2),
    baselineY: computeCenteredBaselineY(height, deltaFontSize),
    fill: isFlat ? resolveForegroundColor(isOnPrimary, trendColor) : trendColor,
    fontSize: deltaFontSize,
    isBold: true,
  });
  return `${arrowMarkup}${deltaTextMarkup}`;
}

/** Resolve the ID of the sparkline area-fill `<linearGradient>` (white on primary capsules, accent-colored otherwise). */
function resolveSparklineGradientId(isOnPrimary: boolean, color: ThemeColorName): string {
  return isOnPrimary ? 'spark-fill-white' : `spark-fill-${color}`;
}

/** Render (memoized per gradient ID) the `<linearGradient>` definition for the sparkline area fill. */
function renderSparklineGradientDef(isOnPrimary: boolean, color: ThemeColorName): string {
  const gradientId = resolveSparklineGradientId(isOnPrimary, color);
  let gradientDef = SPARKLINE_GRADIENT_DEF_CACHE.get(gradientId);
  if (gradientDef === undefined) {
    const stopColor = isOnPrimary ? WHITE : THEMES[color].accentText;
    gradientDef = renderVerticalGradientDef(
      gradientId,
      stopColor,
      stopColor,
      isOnPrimary ? 0.32 : 0.38,
      0
    );
    SPARKLINE_GRADIENT_DEF_CACHE.set(gradientId, gradientDef);
  }
  return gradientDef;
}

/** Render an inline trend sparkline with a vertical area gradient fill (its gradient goes into the root `<defs>`). */
function renderSparklineWidget(
  values: number[],
  context: SpecialElementContext
): SpecialElementMarkup {
  const { height: sparkHeight, strokeWidth } = SPECIAL_WIDGET_GEOMETRY.sparkline;
  const points = buildSparklinePoints(
    values,
    context.specialX,
    (context.height - sparkHeight) / 2,
    context.specialWidth,
    sparkHeight
  );
  if (!points) {
    return EMPTY_SPECIAL_ELEMENT;
  }
  const sparkStroke = resolveForegroundColor(context.isOnPrimary, context.palette.accentText);
  const sparkGradId = resolveSparklineGradientId(context.isOnPrimary, context.color);
  return {
    defs: renderSparklineGradientDef(context.isOnPrimary, context.color),
    markup: `<polygon points="${points.areaPoints}" fill="url(#${sparkGradId})" /><polyline points="${points.linePoints}" fill="none" stroke="${sparkStroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`,
  };
}

/** Render the active right-compartment special element and its `<defs>`. */
function renderSpecialElement(
  special: BadgeSpecialElement | undefined,
  context: SpecialElementContext
): SpecialElementMarkup {
  if (!special || context.specialWidth <= 0) {
    return EMPTY_SPECIAL_ELEMENT;
  }
  switch (special.type) {
    case 'sparkline': {
      return renderSparklineWidget(special.values, context);
    }
    case 'bars': {
      return { defs: '', markup: renderBarsWidgetMarkup(special.values, context) };
    }
    case 'bar': {
      const hasBarShimmer = !isAnimationDisabled(context.animMode) && special.hasPulse !== false;
      return renderBarWidget(special.value, hasBarShimmer, context);
    }
    case 'steps': {
      return { defs: '', markup: renderStepsWidgetMarkup(special.done, special.total, context) };
    }
    case 'ring': {
      const hasRingPulse = !isAnimationDisabled(context.animMode) && Boolean(special.hasPulse);
      return { defs: '', markup: renderRingWidgetMarkup(special.value, hasRingPulse, context) };
    }
    case 'strip': {
      return { defs: '', markup: renderStripWidgetMarkup(special.states, context) };
    }
    case 'delta': {
      return { defs: '', markup: renderDeltaWidgetMarkup(special.value, context) };
    }
    default: {
      return EMPTY_SPECIAL_ELEMENT;
    }
  }
}

/** Render all background fills, upper-edge Kumo 3D crescents, dividers, and outer border rings for a badge. */
function renderBadgeSurface(options: BadgeSurfaceOptions): string {
  const { color, height, layout, radius, variant } = options;
  const { isSplit, leftWidth, totalWidth } = layout;
  const splitX = isSplit ? leftWidth : undefined;
  return renderKumoBoxSurface({
    color,
    height,
    radius,
    rightCapsuleStartX: splitX,
    splitLineX: splitX,
    variant,
    width: totalWidth,
  });
}

/** Resolve button geometry metrics (`height`, `fontSize`, `iconSize`, `padX`, `radius`) from `size`. */
function resolveButtonMetrics(sizeOption: SizePreset | number | undefined): VariantMetrics {
  if (typeof sizeOption === 'string' && hasOwnKey(BUTTON_SIZE_PRESETS, sizeOption)) {
    return BUTTON_SIZE_PRESETS[sizeOption];
  }
  if (typeof sizeOption === 'number' && Number.isFinite(sizeOption)) {
    const height = clampInt(sizeOption, BUTTON_HEIGHT_RANGE);
    return {
      fontSize: roundTenths(height * 0.415),
      height,
      iconSize: Math.round(height * 0.5),
      padX: Math.round(height * 0.47),
      radius: Math.round(height * 0.3),
    };
  }
  return BUTTON_SIZE_PRESETS[DEFAULT_BUTTON_SIZE];
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
  const [firstItemWidth = 0] = itemWidths;
  if (firstItemWidth > 0 && activeCount > 1) {
    rawWidth += extraFirstGap;
  }
  // Empty compartments collapse to zero width; their offsets all stay at the left padding:
  const paddedWidth = leftPad + rawWidth + rightPad;
  const width = activeCount === 0 ? 0 : Math.round(paddedWidth);
  let cursor = activeCount === 0 ? leftPad : leftPad + (width - paddedWidth) / 2;
  const offsets: number[] = [];
  for (const [i, itemWidth] of itemWidths.entries()) {
    offsets.push(roundCoord(cursor));
    if (itemWidth > 0) {
      cursor += itemWidth + gap + (i === 0 ? extraFirstGap : 0);
    }
  }
  return { offsets, width };
}

/**
 * Build the split capsule layout when a primary single-segment badge places only its status dot in the
 * dark left compartment and keeps `[leftIcon, label, rightIcon]` together in the primary right compartment.
 */
function buildDotSplitLayout(
  rightContentPack: PackedCompartment,
  labelWidth: number,
  padX: number
): CapsuleLayout {
  const [, leftIconX = 0, labelX = 0, trailingIconX = 0] = rightContentPack.offsets;
  const leftWidth = padX * 2 + DOT_SLOT_WIDTH;
  const rightWidth = rightContentPack.width;
  return {
    dotCx: roundCoord(padX + DOT_SLOT_WIDTH / 2),
    isDotOnlyLeft: true,
    isSplit: true,
    labelCenterX: roundCoord(leftWidth + labelX + labelWidth / 2),
    leftIconX: roundCoord(leftWidth + leftIconX),
    leftWidth,
    rightIconX: roundCoord(leftWidth + trailingIconX),
    rightWidth,
    specialX: leftWidth + padX,
    totalWidth: leftWidth + rightWidth,
    valueCenterX: leftWidth + padX,
  };
}

/**
 * Compute horizontal compartment widths and coordinate offsets for a badge or button.
 * The left compartment packs `[dot, leftIcon, label, rightIcon]` (the trailing icon moves right when a
 * right compartment exists), and the right compartment packs `[special, value, rightIcon]`.
 * When `isDotAloneInLeftCap` is set on a single-segment capsule with a status dot, only `dot` is packed
 * into the dark left compartment while `[leftIcon, label, rightIcon]` stay together in the right compartment.
 */
function computeCapsuleLayout(input: CapsuleLayoutInput): CapsuleLayout {
  const { gap, labelWidth, padX, rightIconWidth, specialWidth, valueWidth } = input;
  const hasRightCompartment = valueWidth > 0 || specialWidth > 0;
  if (input.isDotAloneInLeftCap && input.hasDot && !hasRightCompartment) {
    const rightContentPack = packCompartment(
      [0, input.leftIconWidth, labelWidth, rightIconWidth],
      gap,
      padX
    );
    if (rightContentPack.width > 0) {
      return buildDotSplitLayout(rightContentPack, labelWidth, padX);
    }
  }

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
  // `packCompartment` returns one offset per item, so the defaults never apply:
  const [dotX = 0, leftIconX = 0, labelX = 0, trailingIconX = 0] = leftPack.offsets;
  const [specialOffsetX = 0, valueOffsetX = 0, rightIconOffsetX = 0] = rightPack.offsets;

  const leftWidth = leftPack.width > 0 ? leftPack.width : input.minLeftWidth;
  const rightWidth = rightPack.width;
  return {
    dotCx: roundCoord(dotX + DOT_SLOT_WIDTH / 2),
    isDotOnlyLeft: false,
    isSplit: leftWidth > 0 && rightWidth > 0,
    labelCenterX: roundCoord(labelX + labelWidth / 2),
    leftIconX,
    leftWidth,
    rightIconX: hasRightCompartment ? roundCoord(leftWidth + rightIconOffsetX) : trailingIconX,
    rightWidth,
    specialX: roundCoord(leftWidth + specialOffsetX),
    totalWidth: leftWidth + rightWidth || padX * 2,
    valueCenterX: roundCoord(leftWidth + valueOffsetX + valueWidth / 2),
  };
}

/** Render the dot, icons, label, special element, and value of a badge or button in paint order. */
function renderCapsuleBody(options: CapsuleBodyOptions): string {
  const { animMode, icons, layout, metrics, palette } = options;
  const { fontSize, height, iconSize } = metrics;
  const textY = computeCenteredBaselineY(height, fontSize);
  const iconY = roundCoord((height - iconSize) / 2);
  const { leftMotion, rightMotion } = resolveIconAnimationPair(animMode, icons);

  const dotMarkup = renderDotMarkup(options.dot, layout.dotCx, height / 2, animMode);
  const leftIconMarkup = renderIconMarkup({
    iconSize,
    iconY,
    isOnPrimary: options.isLeftOnPrimary,
    motion: leftMotion,
    paint: resolveForegroundPaint(options.isLeftOnPrimary, palette.iconColor),
    slot: icons.left,
    visualStartX: layout.leftIconX,
  });
  const rightIconMarkup = renderIconMarkup({
    iconSize,
    iconY,
    isOnPrimary: options.isRightOnPrimary,
    motion: rightMotion,
    paint: resolveForegroundPaint(options.isRightOnPrimary, palette.iconColor),
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

/**
 * Build the raw accessible `aria-label` text: `label: <special> <value>`, either side alone, or the
 * first visible icon/dot name, falling back to the generic element name (`'badge'` or `'button'`).
 * Exact duplicates between the special description and `valueText` are skipped (e.g., `delta:+5%` next to `'+5%'`).
 */
function buildAriaLabel(parts: AriaLabelParts): string {
  const { labelText, valueText } = parts;
  const specialText = valueText === parts.specialText ? '' : parts.specialText;
  const rightText =
    specialText.length > 0 && valueText.length > 0
      ? `${specialText} ${valueText}`
      : specialText || valueText;
  if (labelText.length > 0 && rightText.length > 0) {
    return `${labelText}: ${rightText}`;
  }
  if (labelText.length > 0 || rightText.length > 0) {
    return labelText || rightText;
  }
  if (parts.icons.left.data) {
    return parts.icons.left.slug;
  }
  if (parts.icons.right.data) {
    return parts.icons.right.slug;
  }
  return parts.dot ?? parts.fallbackName;
}

/** Build the content-addressed ID of the standalone icon sheen gradient (`'icon-sheen'`, or suffixed for scaled icon bodies). */
function buildIconSheenId(coordScale: number): string {
  return coordScale === 1 ? 'icon-sheen' : `icon-sheen-s${Math.round(1000 / coordScale)}`;
}

/**
 * Render (memoized per coordinate scale) the standalone icon sheen `<linearGradient>`.
 * The gradient uses `userSpaceOnUse` coordinates of the painted paths, so icon bodies drawn in a scaled
 * coordinate space get an inverse `gradientTransform` to sweep the full `24x24` box.
 */
function renderIconSheenGradientDef(coordScale: number): string {
  let gradientDef = ICON_SHEEN_DEF_CACHE.get(coordScale);
  if (gradientDef === undefined) {
    const transformAttr =
      coordScale === 1 ? '' : ` gradientTransform="scale(${roundScale(1 / coordScale)})"`;
    const sweepX1 = renderSweepAnimation(
      'animate',
      'attributeName="x1"',
      '-58',
      '58',
      ICON_SHEEN_SWEEP_TIMING
    );
    const sweepX2 = renderSweepAnimation(
      'animate',
      'attributeName="x2"',
      '-32',
      '84',
      ICON_SHEEN_SWEEP_TIMING
    );
    gradientDef = `<linearGradient id="${buildIconSheenId(coordScale)}" gradientUnits="userSpaceOnUse" x1="-58" y1="0" x2="-32" y2="26"${transformAttr}>${renderWhiteBandStops(ICON_SHEEN_BAND_STOPS)}${sweepX1}${sweepX2}</linearGradient>`;
    ICON_SHEEN_DEF_CACHE.set(coordScale, gradientDef);
  }
  return gradientDef;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render a complete badge SVG string from `BadgeRenderOptions`.
 * @param options   Badge rendering configuration.
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderBadge(options: BadgeRenderOptions): string {
  const { color, variant } = options;
  const palette = THEMES[color];
  const animMode: AnimationMode = options.anim ?? 'default';
  const metrics = BADGE_METRICS;
  const { fontSize, height, iconSize, padX, radius } = metrics;

  const labelText = prepareDisplayText(options.label, MAX_LABEL_LENGTH);
  const valueText = prepareDisplayText(options.value ?? '', MAX_LABEL_LENGTH);
  const special = sanitizeSpecialElement(options.special);
  const icons = resolveIconPair(options.icon);
  const specialWidth = measureSpecialElementWidth(special, fontSize);
  const validDot = isRenderableDot(options.dot) ? options.dot : undefined;
  const hasDot = validDot !== undefined;
  const layout = computeCapsuleLayout({
    gap: 6,
    hasDot,
    isDotAloneInLeftCap: variant === '1',
    labelWidth: measureTextWidth(labelText, fontSize, false),
    leftIconWidth: measureIconVisualWidth(icons.left.data, iconSize),
    minLeftWidth: 0,
    padX,
    rightIconWidth: measureIconVisualWidth(icons.right.data, iconSize),
    specialWidth,
    valueWidth: measureTextWidth(valueText, fontSize, true),
  });

  // A dot-only badge with no text or right compartment also uses the dark carbon surface so status dots never sit on a primary gradient:
  const surfaceVariant: BadgeVariant = hasDot && !layout.isSplit && variant === '1' ? '3' : variant;
  const isOnPrimary = surfaceVariant === '1';
  const specialElement = renderSpecialElement(special, {
    animMode,
    color,
    fontSize,
    height,
    isOnPrimary,
    palette,
    specialWidth,
    specialX: layout.specialX,
  });
  const body = renderCapsuleBody({
    animMode,
    dot: validDot,
    icons,
    isLabelBold: false,
    isLeftOnPrimary: isOnPrimary && (!layout.isSplit || layout.isDotOnlyLeft),
    isRightOnPrimary: isOnPrimary,
    labelText,
    layout,
    metrics,
    palette,
    specialMarkup: specialElement.markup,
    valueColor: resolveValueColor(surfaceVariant, palette),
    valueText,
    variant: surfaceVariant,
  });
  const surface = renderBadgeSurface({ color, height, layout, radius, variant: surfaceVariant });
  const sheen = renderSheenOverlay({ animMode, height, radius, width: layout.totalWidth });
  const surfaceDefs = renderSurfaceGradientDefs(
    !isOnPrimary || layout.isSplit,
    isOnPrimary ? [color] : undefined
  );

  return renderSvgDocument({
    ariaLabel: buildAriaLabel({
      dot: validDot,
      fallbackName: 'badge',
      icons,
      labelText,
      specialText: special && specialWidth > 0 ? describeSpecialElement(special, valueText) : '',
      valueText,
    }),
    body: `${surface}${body}${sheen.overlay}`,
    defs: `${surfaceDefs}${specialElement.defs}${sheen.clipDef}`,
    height,
    width: layout.totalWidth,
  });
}

/**
 * Render a CTA button SVG string from `ButtonRenderOptions`.
 * Supports named size presets or custom pixel heights, leading/trailing icons, optional split values, and Kumo 3D variants.
 * @param options   Button rendering configuration.
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderButton(options: ButtonRenderOptions): string {
  const { color, variant } = options;
  const palette = THEMES[color];
  const animMode: AnimationMode = options.anim ?? 'default';
  const metrics = resolveButtonMetrics(options.size);
  const { fontSize, height, iconSize, padX, radius } = metrics;

  const labelText = prepareDisplayText(options.label, MAX_LABEL_LENGTH);
  const valueText = prepareDisplayText(options.value ?? '', MAX_LABEL_LENGTH);
  const icons = resolveIconPair(options.icon);
  const layout = computeCapsuleLayout({
    gap: Math.max(6, Math.round(height * 0.24)),
    hasDot: false,
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
    dot: undefined,
    icons,
    isLabelBold: true,
    isLeftOnPrimary: isPrimary,
    isRightOnPrimary: isPrimary,
    labelText,
    layout,
    metrics,
    palette,
    specialMarkup: '',
    // The value of a split primary button is secondary text next to the fully white label:
    valueColor:
      isPrimary && layout.isSplit
        ? resolveForegroundColor(true, palette.accentText)
        : resolveValueColor(variant, palette),
    valueText,
    variant,
  });
  const surface = renderKumoBoxSurface({
    color,
    height,
    radius,
    splitLineX: layout.isSplit ? layout.leftWidth : undefined,
    variant,
    width: layout.totalWidth,
  });
  const sheen = renderSheenOverlay({ animMode, height, radius, width: layout.totalWidth });
  const surfaceDefs = renderSurfaceGradientDefs(!isPrimary, isPrimary ? [color] : undefined);

  return renderSvgDocument({
    ariaLabel: buildAriaLabel({
      dot: undefined,
      fallbackName: 'button',
      icons,
      labelText,
      specialText: '',
      valueText,
    }),
    body: `${surface}${body}${sheen.overlay}`,
    defs: `${surfaceDefs}${sheen.clipDef}`,
    height,
    width: layout.totalWidth,
  });
}

/**
 * Render a standalone SVG icon string.
 * Uses a padded `-3 -3 30 30` viewBox so rotation, scale, and translation micro-animations never clip.
 * Unknown slugs draw the placeholder icon and are labeled `unknown icon: <slug>`.
 * @param options   Standalone icon rendering configuration.
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderIcon(options: IconRenderOptions): string {
  const animMode: AnimationMode = options.anim ?? 'default';
  const size = clampInt(options.size, ICON_SIZE_RANGE);
  const strokeWidth = roundCoord(clampNumber(options.strokeWidth, ICON_STROKE_RANGE));

  const slug = options.icon.trim().toLowerCase() || DEFAULT_ICON_SLUG;
  const lookup = resolveIconLookup(slug);
  const iconData = lookup.data ?? resolvePlaceholderIcon();
  const iconColor = lookup.data ? THEMES[options.color].iconColor : THEMES.red.iconColor;
  const slot: IconSlot = { data: iconData, key: lookup.key, slug };
  // Per-icon pairs (e.g., `nudge,shake`) apply their first motion to the single standalone icon:
  const { leftMotion } = resolveIconAnimationPair(animMode, { left: slot, right: EMPTY_ICON_SLOT });

  let sheenDef = '';
  let body = iconData.innerSvg;
  if (isSheenMode(animMode)) {
    // The sheen and body IDs depend only on content, never on the (untrusted) slug:
    const sheenId = buildIconSheenId(iconData.coordScale);
    const bodyId = buildIconBodyId(iconData, ICON_BODY_ID_PREFIX);
    const sheenPaint =
      iconData.type === 'lucide' ? `stroke="url(#${sheenId})"` : `fill="url(#${sheenId})"`;
    sheenDef = renderIconSheenGradientDef(iconData.coordScale);
    // Reference the body instead of inlining it twice (bodies may carry their own `id` attributes):
    body = `<g id="${bodyId}">${iconData.innerSvg}</g><use href="#${bodyId}" ${sheenPaint} />`;
  }

  return renderSvgDocument({
    ariaLabel: prepareDisplayText(lookup.data ? slug : `unknown icon: ${slug}`, MAX_LABEL_LENGTH),
    body: wrapIconWithAnimation(body, slot.key, leftMotion),
    defs: sheenDef,
    height: size,
    paintAttrs: renderIconPaintAttrs(iconData.type, iconColor, strokeWidth),
    viewBox: '-3 -3 30 30',
    width: size,
  });
}
