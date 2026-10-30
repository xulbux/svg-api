/**
 * Shared SVG Primitives
 *
 * Escaping, display text normalization, numeric clamping, bounded LRU caches, content hashing,
 * Kumo 3D surfaces, sheen overlays, and the root `<svg>` document template.
 */

import { STRIP_DARK_COLORS, WHITE } from '@/config/palette';
import { BASE_DARK, THEMES } from '@/config/theme';
import { sliceCodeUnitSafe } from '@/site/shared/encoding';
import type {
  ActiveStackMotion,
  AnimationMode,
  BadgeVariant,
  BandStop,
  ForegroundPaint,
  IconMotionMode,
  IconType,
  LruCache,
  NumericRange,
  ResolvedIcon,
  StackAnimationMode,
  StackTileMotion,
  StripTickState,
  SweepTiming,
  ThemeColorName,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Lazily built constant markup strings shared by every render. */
interface LazyMarkupCache {
  /** `<linearGradient id="bg-dark">` definition. */
  darkBgGradientDef?: string;
  /** White `<stop>` elements of the diagonal sheen band. */
  sheenBandStops?: string;
}

/** `<defs>` and overlay markup for the optional specular sheen sweep. */
interface SheenOverlay {
  /** `<clipPath>` and `<linearGradient>` definitions for `<defs>` (`''` when inactive). */
  clipDef: string;
  /** Animated overlay group for the top SVG layer (`''` when inactive). */
  overlay: string;
}

/** Options for `renderSheenOverlay`. */
interface SheenOverlayOptions {
  /** Active animation mode. */
  animMode: AnimationMode | StackAnimationMode;
  /** Optional custom inner SVG elements for the `<clipPath>` (e.g., multiple tile `<rect>`s); Defaults to one rounded rectangle. */
  clipContent?: string;
  /** Total SVG height in pixels. */
  height: number;
  /** Prefix for the `<clipPath>` and `<linearGradient>` IDs. */
  idPrefix?: string;
  /** Outer corner radius in pixels (used when `clipContent` is omitted). */
  radius: number;
  /** Total SVG width in pixels. */
  width: number;
}

/** Options for `renderKumoBoxSurface`. */
interface KumoSurfaceOptions {
  /** Left X coordinate in pixels. */
  boxX?: number;
  /** Top Y coordinate in pixels. */
  boxY?: number;
  /** Theme color token whose palette and `grad-<color>` gradient paint the surface. */
  color: ThemeColorName;
  /** Box height in pixels. */
  height: number;
  /** Outer corner radius in pixels. */
  radius: number;
  /**
   * Optional X coordinate in pixels where the accented right capsule of a split badge starts;
   * The secondary tint and 3D top crescent then cover only that capsule (defaults to the full box).
   */
  rightCapsuleStartX?: number;
  /** Optional X coordinate in pixels of an internal vertical divider (split micro-buttons and badges). */
  splitLineX?: number;
  /** Surface hierarchy tier. */
  variant: BadgeVariant;
  /** Box width in pixels. */
  width: number;
}

/** Options for `renderIconGroup`. */
interface IconGroupOptions {
  /** Stroke or fill color. */
  color: string;
  /** Whether the icon body contains `currentColor` sub-elements requiring a CSS `color` attribute. */
  hasCurrentColor?: boolean;
  /** Inner SVG markup of the icon (optionally wrapped in animation groups). */
  innerSvg: string;
  /** Whether the icon is a placeholder fallback for an unknown slug (painted in red, with a dark disc backdrop on primary surfaces). */
  isFallback?: boolean;
  /** Whether the icon sits on a vivid primary surface (adds a dark disc backdrop behind fallback icons). */
  isOnPrimary?: boolean;
  /** Optional group opacity (`0`–`1`; Omitted when `>= 1` or when `isFallback` is `true`). */
  opacity?: number;
  /** Stroke width in `24x24` icon units (stroked icons only). */
  strokeWidth: number;
  /** SVG `transform` attribute value positioning and scaling the `24x24` icon box. */
  transform: string;
  /** Icon source type deciding between stroke and fill painting. */
  type: IconType;
}

/** Options for `renderSvgDocument`. */
interface SvgDocumentOptions {
  /** Raw, unescaped accessible label (escaped by `renderSvgDocument`; Also rendered as the `<title>`). */
  ariaLabel: string;
  /** Visible SVG body markup. */
  body: string;
  /** Optional `<defs>` content (the `<defs>` element is omitted when empty). */
  defs?: string;
  /** Rendered height in pixels. */
  height: number;
  /** Root paint attributes. */
  paintAttrs?: string;
  /** Optional SMIL resting timestamp in seconds (`data-rest-time`), used to pause reduced-motion previews on a readable frame. */
  restTime?: number;
  /** Root `viewBox` attribute value. */
  viewBox?: string;
  /** Rendered width in pixels. */
  width: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** ID of the shared dark-slate surface `<linearGradient>`. */
const BG_DARK_ID = 'bg-dark';

/** Default font size in pixels for standard badge labels and values. */
export const BADGE_FONT_SIZE = 11;

/** Opacity of white foreground accents and secondary text drawn on vivid primary surfaces; Primary display text stays fully white. */
export const PRIMARY_FOREGROUND_OPACITY = 0.85;

/** Opacity of the white split divider line on vivid primary surfaces. */
const PRIMARY_DIVIDER_OPACITY = 0.28;

/** Ellipsis appended to truncated text. */
export const ELLIPSIS = '…';

/** Maximum badge/button label, value, delta, and quote author length in UTF-16 code units before ellipsis truncation. */
export const MAX_LABEL_LENGTH = 128;

/** Valid per-icon motion tokens inside an `AnimationMode`, sorted alphabetically (everything except the `'sheen'` surface token). */
export const ICON_MOTION_TOKENS: readonly IconMotionMode[] = [
  'auto',
  'breathe',
  'default',
  'float',
  'none',
  'nudge',
  'pulse',
  'shake',
  'spin',
  'turn',
  'whirl',
];

/** Active per-icon motion tokens excluding static and default sentinel modes. */
export const ACTIVE_ICON_MOTION_TOKENS: readonly Exclude<IconMotionMode, 'default' | 'none'>[] = [
  'auto',
  'breathe',
  'float',
  'nudge',
  'pulse',
  'shake',
  'spin',
  'turn',
  'whirl',
];

/** Valid per-tile stack motion tokens in display order. */
export const STACK_MOTION_TOKENS: readonly StackTileMotion[] = ['wave', 'float', 'pulse', 'none'];

/** Active per-tile stack motion tokens excluding static and default sentinel modes. */
export const ACTIVE_STACK_MOTION_TOKENS: readonly ActiveStackMotion[] = ['wave', 'float', 'pulse'];

/** Timing of the diagonal surface sheen sweep. */
export const SHEEN_SWEEP_TIMING: Readonly<SweepTiming> = {
  duration: '4s',
  easing: '0.42 0 0.25 1',
  sweepEnd: 0.34,
};

/** White paint of secondary foreground text on vivid primary surfaces (`PRIMARY_FOREGROUND_OPACITY` baked into the color). */
const PRIMARY_FOREGROUND_COLOR = `rgba(255,255,255,${PRIMARY_FOREGROUND_OPACITY})`;

/** White paint of the split divider line on vivid primary surfaces. */
const PRIMARY_DIVIDER_COLOR = `rgba(255,255,255,${PRIMARY_DIVIDER_OPACITY})`;

/** Single-pass XML replacements: entities for markup characters; Tab, LF, and CR are kept; Every other match is stripped. */
const XML_REPLACEMENT_MAP: Readonly<Record<string, string>> = {
  '\t': '\t',
  '\n': '\n',
  '\r': '\r',
  '"': '&quot;',
  '&': '&amp;',
  "'": '&#039;',
  '<': '&lt;',
  '>': '&gt;',
};

/** Lazily built set of valid per-icon motion tokens (`undefined` until first lookup). */
let iconMotionModesCache: ReadonlySet<string> | undefined = undefined;

/** Lazily built set of valid per-tile stack motion tokens (`undefined` until first lookup). */
let stackMotionModesCache: ReadonlySet<string> | undefined = undefined;

/** Default empty theme color list for surfaces without a vivid theme gradient. */
const NO_THEME_COLORS: readonly ThemeColorName[] = [];

/** White highlight stops of the diagonal surface sheen band. */
const SHEEN_BAND_STOPS: readonly BandStop[] = [
  [0, '0'],
  [28, '0.06'],
  [50, '0.28'],
  [72, '0.06'],
  [100, '0'],
];

/** Initial value of the polynomial content hash. */
const HASH_SEED = 5381;

/** Multiplier of the polynomial content hash. */
const HASH_MULTIPLIER = 33;

/** Modulus of the polynomial content hash (largest prime below `2^32`). */
const HASH_MODULUS = 4_294_967_291;

/** Minimum `innerSvg` character length above which duplicate icon slots share a `<defs>` entry even without internal `id` attributes. */
const SHARED_ICON_DEF_MIN_LENGTH = 128;

/** Lazily built constant markup strings. */
const LAZY_MARKUP: LazyMarkupCache = {};

/** Memoized `<linearGradient id="grad-<color>">` definitions by theme color. */
const THEME_GRADIENT_DEF_CACHE: Partial<Record<ThemeColorName, string>> = {};

/** Memoized content hashes of icon bodies (released together with the resolved icon). */
const ICON_BODY_HASH_CACHE = new WeakMap<ResolvedIcon, string>();

// ------------------------------------ REGEX PATTERNS -----------------------------------

/**
 * Matches XML markup characters (`&`, `<`, `>`, `"`, `'`), control characters, lone surrogates,
 * and the noncharacters `U+FFFE`/`U+FFFF` in a single pass.
 */
const XML_ESCAPE_RX = /[&<>"'\p{Cc}\p{Cs}\uFFFE\uFFFF]/gu;

/** Matches runs of control and invisible format characters (Geist draws them as visible `.notdef` boxes). */
const INVISIBLE_CHARS_RX = /[\p{Cc}\p{Cf}]+/gu;

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Round a finite number to 1 decimal place (`0.1` precision) without string allocation.
 * @param value   Number to round.
 * @returns Number rounded to the nearest tenth.
 */
function roundTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Round a finite number to 2 decimal places (`0.01` precision) without string allocation.
 * @param value   Number to round.
 * @returns Number rounded to the nearest hundredth.
 */
function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Round a finite scale factor to 4 decimal places (`0.0001` precision) without string allocation.
 * @param value   Number to round.
 * @returns Number rounded to the nearest ten-thousandth.
 */
function roundScale(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Map a single matched character to its XML entity, keep XML-legal whitespace controls, and strip XML-illegal characters. */
function replaceXmlChar(char: string): string {
  return XML_REPLACEMENT_MAP[char] ?? '';
}

/** Render a `1px` vertical divider `<line>` at `lineX` from `topY` to `bottomY`. */
function renderDividerLine(lineX: number, topY: number, bottomY: number, stroke: string): string {
  const roundedX = roundCoord(lineX);
  return `<line x1="${roundedX}" y1="${roundCoord(topY)}" x2="${roundedX}" y2="${roundCoord(bottomY)}" stroke="${stroke}" stroke-width="1" />`;
}

/**
 * Build the ID of the vertical theme `<linearGradient>` for a color (`'grad-<color>'`).
 * @param color   Theme color token.
 * @returns Gradient element ID.
 */
function buildThemeGradientId(color: ThemeColorName): string {
  return `grad-${color}`;
}

/** Render a solid top-to-bottom two-stop `<linearGradient>` definition. */
function renderVerticalGradientDef(id: string, topColor: string, bottomColor: string): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${topColor}" /><stop offset="100%" stop-color="${bottomColor}" /></linearGradient>`;
}

/** Render the shared `<linearGradient id="bg-dark">` definition for dark-slate surfaces (built once per isolate). */
function renderDarkBgGradientDef(): string {
  LAZY_MARKUP.darkBgGradientDef ??= renderVerticalGradientDef(
    BG_DARK_ID,
    BASE_DARK.bgTop,
    BASE_DARK.bgBottom
  );
  return LAZY_MARKUP.darkBgGradientDef;
}

/** Render the vertical theme `<linearGradient id="grad-<color>">` definition (from `gradStart` to `gradEnd`), memoized per color. */
function renderThemeGradientDef(color: ThemeColorName): string {
  let gradientDef = THEME_GRADIENT_DEF_CACHE[color];
  if (gradientDef === undefined) {
    const palette = THEMES[color];
    gradientDef = renderVerticalGradientDef(
      buildThemeGradientId(color),
      palette.gradStart,
      palette.gradEnd
    );
    THEME_GRADIENT_DEF_CACHE[color] = gradientDef;
  }
  return gradientDef;
}

/**
 * Build the SVG `<path>` `d` attribute for Cloudflare Kumo's upper-edge 3D highlight crescent.
 * Uses a circular outer arc (`A r r`) and an elliptical inner return arc (`A r (r - 1)`) so the
 * highlight is `1px` thick along the top straight edge and tapers smoothly to `0px` around the
 * top corner curve without extending down the vertical sides.
 */
function buildTopCrescentPath(
  startX: number,
  endX: number,
  radius: number,
  hasRoundedLeftCorner: boolean,
  topY = 0
): string {
  const innerRadius = roundCoord(radius - 1);
  if (innerRadius <= 0) {
    return '';
  }
  const innerRadiusY = Math.max(0, roundCoord(innerRadius - 1));
  const rightArcStart = roundCoord(endX - 1 - innerRadius);
  const rightTangentX = roundCoord(endX - 1);
  const outerTopY = roundCoord(topY + 1);
  const innerTopY = roundCoord(topY + 2);
  const cornerEndY = roundCoord(outerTopY + innerRadius);

  if (!hasRoundedLeftCorner) {
    const leftEdgeX = roundCoord(startX + 0.5);
    return `M ${leftEdgeX} ${outerTopY} H ${rightArcStart} A ${innerRadius} ${innerRadius} 0 0 1 ${rightTangentX} ${cornerEndY} A ${innerRadius} ${innerRadiusY} 0 0 0 ${rightArcStart} ${innerTopY} H ${leftEdgeX} Z`;
  }

  const leftTangentX = roundCoord(startX + 1);
  const leftArcEnd = roundCoord(startX + 1 + innerRadius);
  return `M ${leftTangentX} ${cornerEndY} A ${innerRadius} ${innerRadius} 0 0 1 ${leftArcEnd} ${outerTopY} H ${rightArcStart} A ${innerRadius} ${innerRadius} 0 0 1 ${rightTangentX} ${cornerEndY} A ${innerRadius} ${innerRadiusY} 0 0 0 ${rightArcStart} ${innerTopY} H ${leftArcEnd} A ${innerRadius} ${innerRadiusY} 0 0 0 ${leftTangentX} ${cornerEndY} Z`;
}

/** Build the SVG `<path>` `d` attribute for the left capsule of a split badge (rounded left corners, square right edge). */
function buildLeftCapsulePath(
  startX: number,
  endX: number,
  height: number,
  radius: number,
  topY = 0,
  isClosed = true
): string {
  const roundedStartX = roundCoord(startX);
  const roundedEndX = roundCoord(endX);
  const roundedTopY = roundCoord(topY);
  const roundedBottomY = roundCoord(topY + height);
  const roundedRadius = roundCoord(radius);
  const cornerX = roundCoord(startX + radius);
  const topArcEndY = roundCoord(topY + radius);
  const bottomArcStartY = roundCoord(roundedBottomY - radius);
  return `M ${roundedEndX} ${roundedTopY} H ${cornerX} A ${roundedRadius} ${roundedRadius} 0 0 0 ${roundedStartX} ${topArcEndY} V ${bottomArcStartY} A ${roundedRadius} ${roundedRadius} 0 0 0 ${cornerX} ${roundedBottomY} H ${roundedEndX}${isClosed ? ' Z' : ''}`;
}

/** Build the SVG `<path>` `d` attribute for the right capsule of a split badge (square left edge, rounded right corners). */
function buildRightCapsulePath(
  startX: number,
  endX: number,
  height: number,
  radius: number,
  topY = 0
): string {
  const roundedStartX = roundCoord(startX);
  const roundedEndX = roundCoord(endX);
  const roundedTopY = roundCoord(topY);
  const roundedBottomY = roundCoord(topY + height);
  const roundedRadius = roundCoord(radius);
  const arcStartX = roundCoord(endX - radius);
  const topArcEndY = roundCoord(topY + radius);
  const bottomArcStartY = roundCoord(roundedBottomY - radius);
  return `M ${roundedStartX} ${roundedTopY} H ${arcStartX} A ${roundedRadius} ${roundedRadius} 0 0 1 ${roundedEndX} ${topArcEndY} V ${bottomArcStartY} A ${roundedRadius} ${roundedRadius} 0 0 1 ${arcStartX} ${roundedBottomY} H ${roundedStartX} Z`;
}

// -------------------------------------- PUBLIC API -------------------------------------

export {
  BRAND_SLUG_CLEAN_RX,
  capitalizeSlugParts,
  getOwnValue,
  HINT_ICON_REST_RX,
  sliceCodeUnitSafe as sliceAtCodePoint,
} from '@/site/shared/encoding';
export { buildThemeGradientId, roundCoord, roundScale, roundTenths };

/**
 * Build the SVG `<path>` `d` attribute for a lower-edge 3D keycap crescent.
 * Uses a circular outer arc (`A r r`) and an elliptical inner return arc (`A r (r - 1)`) so the
 * crescent is `1px` thick along the bottom straight edge and tapers smoothly to `0px` around the
 * bottom corner curves without extending up the vertical sides.
 * @param startX    Left X coordinate of the box in pixels.
 * @param endX      Right X coordinate of the box in pixels.
 * @param radius    Outer corner radius in pixels.
 * @param bottomY   Bottom Y coordinate of the box in pixels.
 * @returns SVG `<path>` `d` string (`''` when `radius <= 1`).
 */
export function buildBottomCrescentPath(
  startX: number,
  endX: number,
  radius: number,
  bottomY: number
): string {
  const innerRadius = roundCoord(radius - 1);
  if (innerRadius <= 0) {
    return '';
  }
  const innerRadiusY = Math.max(0, roundCoord(innerRadius - 1));
  const leftTangentX = roundCoord(startX + 1);
  const leftArcEnd = roundCoord(startX + 1 + innerRadius);
  const rightArcStart = roundCoord(endX - 1 - innerRadius);
  const rightTangentX = roundCoord(endX - 1);
  const outerBottomY = roundCoord(bottomY - 1);
  const innerBottomY = roundCoord(bottomY - 2);
  const cornerStartY = roundCoord(outerBottomY - innerRadius);
  return `M ${leftTangentX} ${cornerStartY} A ${innerRadius} ${innerRadius} 0 0 0 ${leftArcEnd} ${outerBottomY} H ${rightArcStart} A ${innerRadius} ${innerRadius} 0 0 0 ${rightTangentX} ${cornerStartY} A ${innerRadius} ${innerRadiusY} 0 0 1 ${rightArcStart} ${innerBottomY} H ${leftArcEnd} A ${innerRadius} ${innerRadiusY} 0 0 1 ${leftTangentX} ${cornerStartY} Z`;
}

/**
 * Check whether a user-supplied key is an own (non-inherited) property of a lookup table.
 * @param record   Lookup table to check.
 * @param key      Untrusted lookup key.
 * @returns `true` when `key` is an own property of `record`.
 */
export function hasOwnKey<K extends string>(
  record: Readonly<Record<K, unknown>>,
  key: string
): key is K {
  return Object.hasOwn(record, key);
}

/**
 * Check whether an optional token is a valid per-icon motion mode.
 * @param token   Candidate animation token.
 * @returns `true` when `token` is an `IconMotionMode`.
 */
export function isIconMotionMode(token: string | undefined): token is IconMotionMode {
  if (token === undefined) {
    return false;
  }
  iconMotionModesCache ??= new Set<string>(ICON_MOTION_TOKENS);
  return iconMotionModesCache.has(token);
}

/**
 * Check whether an optional token is a valid per-tile stack motion mode.
 * @param token   Candidate animation token.
 * @returns `true` when `token` is a `StackTileMotion`.
 */
export function isStackMotionMode(token: string | undefined): token is StackTileMotion {
  if (token === undefined) {
    return false;
  }
  stackMotionModesCache ??= new Set<string>(['default', ...STACK_MOTION_TOKENS]);
  return stackMotionModesCache.has(token);
}

/**
 * Check whether an untrusted string is a valid strip tick state (an own key of `STRIP_DARK_COLORS`).
 * @param state   Candidate tick character or token.
 * @returns `true` when `state` is a `StripTickState`.
 */
export function isStripTickState(state: string): state is StripTickState {
  return hasOwnKey(STRIP_DARK_COLORS, state);
}

/**
 * Check whether an animation mode enables the diagonal specular sheen sweep.
 * @param animMode   Active animation mode.
 * @returns `true` when the sheen overlay should be rendered.
 */
export function isSheenMode(animMode: AnimationMode | StackAnimationMode): boolean {
  return animMode === 'sheen' || animMode.startsWith('sheen,');
}

/**
 * Check whether an animation mode explicitly disables element and widget animations.
 * @param animMode   Active animation mode.
 * @returns `true` when animated elements must render statically.
 */
export function isAnimationDisabled(animMode: AnimationMode): boolean {
  return (
    animMode === 'none' ||
    animMode === 'none,none' ||
    animMode === 'sheen,none' ||
    animMode === 'sheen,none,none'
  );
}

/**
 * Split an animation mode into its per-icon motion tokens, dropping the `'sheen'` surface token.
 * @param animMode   Active animation mode (e.g., `'sheen,shake,nudge'`).
 * @returns Ordered icon motion tokens (e.g., `['shake', 'nudge']`).
 */
export function resolveIconMotionTokens(animMode: AnimationMode): IconMotionMode[] {
  const tokens: IconMotionMode[] = [];
  let start = 0;
  while (start <= animMode.length) {
    const commaIndex = animMode.indexOf(',', start);
    const token = commaIndex === -1 ? animMode.slice(start) : animMode.slice(start, commaIndex);
    if (isIconMotionMode(token)) {
      tokens.push(token);
    }
    if (commaIndex === -1) {
      break;
    }
    start = commaIndex + 1;
  }
  return tokens;
}

/**
 * Clamp a numeric option to `[range.min, range.max]`, substituting `fallback` when `value` is `undefined` or non-finite.
 * @param value      Candidate numeric value.
 * @param range      Allowed bounds and default value.
 * @param fallback   Fallback value when `value` is `undefined` or `NaN`, also clamped (defaults to `range.default`).
 * @returns Clamped number.
 */
export function clampNumber(
  value: number | undefined,
  range: NumericRange,
  fallback = range.default
): number {
  const candidate = value !== undefined && Number.isFinite(value) ? value : fallback;
  return Math.min(range.max, Math.max(range.min, candidate));
}

/**
 * Clamp and round an integer option to `[range.min, range.max]`, substituting `fallback` when `value` is `undefined` or non-finite.
 * @param value      Candidate numeric value.
 * @param range      Allowed integer bounds and default value.
 * @param fallback   Fallback value when `value` is `undefined` or `NaN`, also clamped (defaults to `range.default`).
 * @returns Clamped integer.
 */
export function clampInt(
  value: number | undefined,
  range: NumericRange,
  fallback = range.default
): number {
  return Math.round(clampNumber(value, range, fallback));
}

/**
 * Measure the rendered horizontal ink width in pixels of a resolved icon (`(maxX - minX) * (iconSize / 24)`).
 * @param iconData   Resolved icon geometry (`undefined` returns `0`).
 * @param iconSize   Target square icon box size in pixels.
 * @returns Rendered horizontal ink width in pixels, rounded to 2 decimal places.
 */
export function measureIconVisualWidth(
  iconData: ResolvedIcon | undefined,
  iconSize: number
): number {
  if (!iconData) {
    return 0;
  }
  return roundCoord((iconData.maxX - iconData.minX) * (iconSize / 24));
}

/**
 * Compute the `translate(x, …)` X coordinate so a `24x24` icon's leftmost visible ink pixel lands at `visualStartX`.
 * @param visualStartX   Target leftmost visible X coordinate in pixels.
 * @param iconData       Resolved icon geometry.
 * @param scaleNum       Unrounded scale factor (`iconSize / 24`).
 * @returns Rounded `translate` X coordinate in pixels.
 */
export function computeIconTranslateX(
  visualStartX: number,
  iconData: ResolvedIcon,
  scaleNum: number
): number {
  return roundCoord(visualStartX - iconData.minX * scaleNum);
}

/**
 * Resolve a font size in pixels from a named preset token or custom numeric size option.
 * @param sizeOption      Optional preset token or custom pixel size.
 * @param presetMap       Font sizes in pixels keyed by preset token.
 * @param range           Allowed custom numeric font size bounds.
 * @param defaultPreset   Fallback preset token when `sizeOption` is omitted or invalid.
 * @returns Resolved font size in pixels.
 */
export function resolveScaledFontSize<Preset extends string>(
  sizeOption: Preset | number | undefined,
  presetMap: Readonly<Record<Preset, number>>,
  range: NumericRange,
  defaultPreset: Preset
): number {
  const fallback = presetMap[defaultPreset];
  if (typeof sizeOption === 'number') {
    return clampNumber(sizeOption, range, fallback);
  }
  if (typeof sizeOption === 'string' && hasOwnKey(presetMap, sizeOption)) {
    return presetMap[sizeOption];
  }
  return fallback;
}

/**
 * Escape XML markup characters (`&`, `<`, `>`, `"`, `'`) and strip XML-illegal characters (control characters
 * except Tab/LF/CR, lone surrogates, `U+FFFE`, `U+FFFF`) in a single pass for safe inclusion in SVG/HTML text and attributes.
 * @param unsafe   Raw unescaped string.
 * @returns XML-safe escaped string.
 */
export function escapeXml(unsafe: string): string {
  return unsafe.replace(XML_ESCAPE_RX, replaceXmlChar);
}

/**
 * Hash text into a short, deterministic base-36 token (polynomial rolling hash over UTF-16 code units modulo a 32-bit prime).
 * Used for content-addressed SVG IDs, cache-busting asset versions, and ETags; Not a cryptographic hash.
 * @param text   Text to hash.
 * @returns Base-36 hash token (e.g., `'1x2k9f'`).
 */
export function hashText(text: string): string {
  let hash = HASH_SEED;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * HASH_MULTIPLIER + text.charCodeAt(i)) % HASH_MODULUS;
  }
  return hash.toString(36);
}

/**
 * Hash raw binary bytes into a short, deterministic base-36 token using the same polynomial rolling hash
 * as `hashText` (used once per bundled binary asset such as `.ttf` fonts; Not a cryptographic hash).
 * @param buffer   Binary buffer to hash.
 * @returns Base-36 hash token (e.g., `'1x2k9f'`).
 */
export function hashBytes(buffer: ArrayBuffer): string {
  let hash = HASH_SEED;
  for (const byte of new Uint8Array(buffer)) {
    hash = (hash * HASH_MULTIPLIER + byte) % HASH_MODULUS;
  }
  return hash.toString(36);
}

/**
 * Build a content-addressed `<defs>` ID for an icon body (`<prefix>-<hash of innerSvg>`), hashing each resolved icon only once;
 * Equal IDs always carry identical bodies, even across inlined SVGs.
 * @param icon     Resolved icon whose body is referenced via `<use>`.
 * @param prefix   ID prefix (e.g., `'stack-icon'`, `'icon-body'`).
 * @returns Element ID (e.g., `'stack-icon-1x2k9f'`).
 */
export function buildIconBodyId(icon: ResolvedIcon, prefix: string): string {
  let bodyHash = ICON_BODY_HASH_CACHE.get(icon);
  if (bodyHash === undefined) {
    bodyHash = hashText(icon.innerSvg);
    ICON_BODY_HASH_CACHE.set(icon, bodyHash);
  }
  return `${prefix}-${bodyHash}`;
}

/**
 * Check whether an icon body repeated across multiple slots in the same SVG should be deduplicated
 * into `<defs>` + `<use>` (required whenever the body carries internal `id` attributes, and worthwhile
 * for non-trivial bodies longer than `SHARED_ICON_DEF_MIN_LENGTH`).
 * @param icon         Resolved icon candidate.
 * @param isFallback   Whether the slot fell back to the placeholder icon.
 * @returns `true` when deduplicating into `<defs>` + `<use>` avoids duplicate XML IDs or saves bytes.
 */
export function isSharedIconDefNeeded(icon: ResolvedIcon, isFallback = false): boolean {
  return (
    !isFallback &&
    (icon.innerSvg.includes('id="') || icon.innerSvg.length > SHARED_ICON_DEF_MIN_LENGTH)
  );
}

/**
 * Prepare user-supplied text for outline rendering:
 * Replace runs of control and invisible format characters (e.g., `\n`, `\t`, `U+200B`) with one space, then cap it at `maxLength` with an ellipsis.
 * @param text        Raw text.
 * @param maxLength   Maximum length in UTF-16 code units, including the ellipsis.
 * @returns Renderable display text.
 */
export function prepareDisplayText(text: string, maxLength: number): string {
  const scanLimit = Math.max(256, maxLength * 8);
  const bounded = text.length > scanLimit ? sliceCodeUnitSafe(text, scanLimit) : text;
  const cleaned = bounded.replace(INVISIBLE_CHARS_RX, ' ');
  return cleaned.length <= maxLength
    ? cleaned
    : `${sliceCodeUnitSafe(cleaned, maxLength - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`;
}

/**
 * Create an empty bounded LRU cache.
 * @param maxEntries   Maximum number of entries.
 * @param weigh        Optional weight of a value (e.g., its serialized size); Defaults to `0` for every value.
 * @param maxWeight    Maximum summed weight of all entries (defaults to unbounded).
 * @returns Empty LRU cache state.
 */
export function createLruCache<V>(
  maxEntries: number,
  weigh: (value: V) => number = () => 0,
  maxWeight = Number.POSITIVE_INFINITY
): LruCache<V> {
  return { entries: new Map<string, V>(), maxEntries, maxWeight, totalWeight: 0, weigh };
}

/**
 * Read a cached value and mark it as most recently used.
 * @param cache   LRU cache state.
 * @param key     Cache key.
 * @returns Cached value, or `undefined` when `key` is not cached.
 */
export function readLruCache<V>(cache: LruCache<V>, key: string): V | undefined {
  const value = cache.entries.get(key);
  if (value !== undefined) {
    cache.entries.delete(key);
    cache.entries.set(key, value);
  }
  return value;
}

/**
 * Remove a cached value (no-op when `key` is not cached).
 * @param cache   LRU cache state.
 * @param key     Cache key.
 */
export function deleteLruEntry<V>(cache: LruCache<V>, key: string): void {
  const value = cache.entries.get(key);
  if (value !== undefined) {
    cache.totalWeight -= cache.weigh(value);
    cache.entries.delete(key);
  }
}

/**
 * Store a value as most recently used, evicting least recently used entries until both the entry count and the summed weight fit;
 * Values heavier than `maxWeight` on their own are never cached.
 * @param cache   LRU cache state.
 * @param key     Cache key.
 * @param value   Value to store (never `undefined`).
 */
export function writeLruCache<V>(cache: LruCache<V>, key: string, value: V): void {
  deleteLruEntry(cache, key);
  const weight = cache.weigh(value);
  if (weight > cache.maxWeight) {
    return;
  }
  cache.entries.set(key, value);
  cache.totalWeight += weight;
  for (const oldestKey of cache.entries.keys()) {
    if (cache.entries.size <= cache.maxEntries && cache.totalWeight <= cache.maxWeight) {
      break;
    }
    deleteLruEntry(cache, oldestKey);
  }
}

/**
 * Remove every cached value.
 * @param cache   LRU cache state.
 */
export function clearLruCache<V>(cache: LruCache<V>): void {
  cache.entries.clear();
  cache.totalWeight = 0;
}

/**
 * Resolve the primary text color on a surface tier:
 * White on vivid primary surfaces, muted on tertiary surfaces, and bright otherwise (e.g., the dark left compartment of a split primary badge).
 * @param variant       Surface hierarchy tier.
 * @param isOnPrimary   Whether the text sits on a vivid primary surface (defaults to `variant === '1'`).
 * @returns Text color.
 */
export function resolveSurfaceTextColor(
  variant: BadgeVariant,
  isOnPrimary = variant === '1'
): string {
  if (isOnPrimary) {
    return WHITE;
  }
  return variant === '3' ? BASE_DARK.textMuted : BASE_DARK.textPrimary;
}

/**
 * Resolve the paint of a foreground element drawn as a group:
 * White at `PRIMARY_FOREGROUND_OPACITY` on vivid primary surfaces, the opaque accent color otherwise.
 * @param isOnPrimary   Whether the element sits on a vivid primary surface.
 * @param accentColor   Color used on dark surfaces (e.g., `palette.iconColor`).
 * @returns Color and optional group opacity.
 */
export function resolveForegroundPaint(isOnPrimary: boolean, accentColor: string): ForegroundPaint {
  return isOnPrimary
    ? { color: WHITE, opacity: PRIMARY_FOREGROUND_OPACITY }
    : { color: accentColor, opacity: undefined };
}

/**
 * Resolve the single paint color of a foreground element without a group opacity:
 * White with `PRIMARY_FOREGROUND_OPACITY` baked in on vivid primary surfaces, the accent color otherwise.
 * @param isOnPrimary   Whether the element sits on a vivid primary surface.
 * @param accentColor   Color used on dark surfaces (e.g., `palette.accentText`).
 * @returns Paint color.
 */
export function resolveForegroundColor(isOnPrimary: boolean, accentColor: string): string {
  return isOnPrimary ? PRIMARY_FOREGROUND_COLOR : accentColor;
}

/**
 * Render the `<defs>` gradients referenced by Kumo surfaces: The dark-slate fill and one vivid theme gradient per active primary color.
 * @param hasDarkBg     Whether any surface uses the dark-slate fill (`url(#bg-dark)`).
 * @param themeColors   Theme colors whose `grad-<color>` gradient is referenced (defaults to none).
 * @returns Concatenated `<linearGradient>` SVG strings.
 */
export function renderSurfaceGradientDefs(
  hasDarkBg: boolean,
  themeColors: Iterable<ThemeColorName> = NO_THEME_COLORS
): string {
  let defs = hasDarkBg ? renderDarkBgGradientDef() : '';
  for (const color of themeColors) {
    defs += renderThemeGradientDef(color);
  }
  return defs;
}

/**
 * Render the white `<stop>` elements of a highlight band gradient (sheens and shimmers).
 * @param stops   Ordered `[offset in percent, stop-opacity]` pairs.
 * @returns Concatenated `<stop>` SVG elements.
 */
export function renderWhiteBandStops(stops: readonly BandStop[]): string {
  let markup = '';
  for (const [offsetPercent, opacity] of stops) {
    markup += `<stop offset="${offsetPercent}%" stop-color="${WHITE}" stop-opacity="${opacity}" />`;
  }
  return markup;
}

/**
 * Render a periodic SMIL highlight sweep: Eases from `from` to `to`, then holds `to` until the cycle repeats.
 * @param element       SMIL element name (`'animate'` for attributes, `'animateTransform'` for transforms).
 * @param targetAttrs   Target attributes (e.g., `'attributeName="x1"'`).
 * @param from          Start value of the sweep.
 * @param to            End value of the sweep (held during the pause).
 * @param timing        Sweep duration, easing, and end fraction.
 * @returns SMIL animation element string.
 */
export function renderSweepAnimation(
  element: 'animate' | 'animateTransform',
  targetAttrs: string,
  from: string,
  to: string,
  timing: Readonly<SweepTiming>
): string {
  return `<${element} ${targetAttrs} values="${from};${to};${to}" keyTimes="0;${timing.sweepEnd};1" calcMode="spline" keySplines="${timing.easing};0 0 1 1" dur="${timing.duration}" repeatCount="indefinite" />`;
}

/**
 * Render a `1px`-stroked rounded `<rect>` inset by `0.5px` inside `(boxX, boxY, width, height)` so its
 * stroke stays crisp inside the outer pixel bounds without clipping.
 * @param boxX          Left X coordinate of the outer box in pixels.
 * @param boxY          Top Y coordinate of the outer box in pixels.
 * @param width         Outer box width in pixels.
 * @param height        Outer box height in pixels.
 * @param radius        Outer corner radius in pixels.
 * @param strokeAttrs   Stroke presentation attributes (e.g., `'stroke="#3D3D3D"'`).
 * @returns `<rect>` SVG element string.
 */
export function renderInsetRingRect(
  boxX: number,
  boxY: number,
  width: number,
  height: number,
  radius: number,
  strokeAttrs: string
): string {
  return `<rect x="${roundCoord(boxX + 0.5)}" y="${roundCoord(boxY + 0.5)}" width="${roundCoord(width - 1)}" height="${roundCoord(height - 1)}" rx="${Math.max(0, roundCoord(radius - 0.5))}" ${strokeAttrs} stroke-width="1" />`;
}

/**
 * Render the paint attributes for an icon: Round-capped strokes for stroked icons, a solid fill for brand icons.
 * Appends `color` when `hasCurrentColor` is set so embedded `currentColor` sub-elements inherit the resolved paint.
 * @param type              Icon source type.
 * @param color             Stroke or fill color.
 * @param strokeWidth       Stroke width in `24x24` icon units (stroked icons only).
 * @param hasCurrentColor   Whether the icon body contains `currentColor` sub-elements.
 * @returns Space-separated SVG presentation attributes.
 */
export function renderIconPaintAttrs(
  type: IconType,
  color: string,
  strokeWidth: number,
  hasCurrentColor = false
): string {
  const colorAttr = hasCurrentColor && !color.startsWith('url(') ? ` color="${color}"` : '';
  return type === 'lucide'
    ? `fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${colorAttr}`
    : `fill="${color}"${colorAttr}`;
}

/**
 * Render a positioned, painted icon `<g>` group for a resolved icon.
 * @param options   Icon group configuration.
 * @returns `<g>` SVG element string.
 */
export function renderIconGroup(options: IconGroupOptions): string {
  const isFallback = options.isFallback === true;
  const color = isFallback ? THEMES.red.iconColor : options.color;
  const effectiveOpacity = isFallback ? undefined : options.opacity;
  const opacityAttr =
    effectiveOpacity !== undefined && effectiveOpacity < 1 ? ` opacity="${effectiveOpacity}"` : '';
  const paintAttrs = renderIconPaintAttrs(
    options.type,
    color,
    options.strokeWidth,
    options.hasCurrentColor
  );
  const innerSvg =
    isFallback && options.isOnPrimary
      ? `<circle cx="12" cy="12" r="10" fill="${BASE_DARK.bgBottom}" stroke="none" />${options.innerSvg}`
      : options.innerSvg;
  return `<g transform="${options.transform}" ${paintAttrs}${opacityAttr}>${innerSvg}</g>`;
}

/**
 * Render the unified Cloudflare Kumo 3D rectangular/pill/tile surface, upper-edge crescent,
 * optional split divider, and outer border ring across primary, secondary, and tertiary surface tiers.
 * With `rightCapsuleStartX` (split secondary badges), the tint and the 3D top crescent only cover the right capsule, like split primary badges;
 * Tertiary dividers stop short of the edges, so their crescent spans both halves.
 * @param options   Surface geometry, variant, color, and optional split/right capsule positions.
 * @returns Concatenated SVG surface, crescent, divider, and border `<rect>`/`<path>`/`<line>` elements.
 */
export function renderKumoBoxSurface(options: KumoSurfaceOptions): string {
  const { rightCapsuleStartX, splitLineX, variant } = options;
  const boxX = roundCoord(options.boxX ?? 0);
  const boxY = roundCoord(options.boxY ?? 0);
  const width = roundCoord(options.width);
  const height = roundCoord(options.height);
  const radius = roundCoord(options.radius);
  const palette = THEMES[options.color];
  const rightEdgeX = roundCoord(boxX + width);
  const isRightCapsuleOnly = rightCapsuleStartX !== undefined;

  if (variant === '1' && isRightCapsuleOnly) {
    const innerRadius = Math.max(0, roundCoord(radius - 0.5));
    const leftFillPath = buildLeftCapsulePath(boxX, rightCapsuleStartX, height, radius, boxY);
    const leftBorderPath = buildLeftCapsulePath(
      boxX + 0.5,
      rightCapsuleStartX,
      height - 1,
      innerRadius,
      boxY + 0.5,
      false
    );
    const rightFillPath = buildRightCapsulePath(
      rightCapsuleStartX,
      rightEdgeX,
      height,
      radius,
      boxY
    );
    const rightCrescentPath = buildTopCrescentPath(
      rightCapsuleStartX,
      rightEdgeX,
      radius,
      false,
      boxY
    );
    const rightRingPath = buildRightCapsulePath(
      rightCapsuleStartX + 0.5,
      rightEdgeX - 0.5,
      height - 1,
      innerRadius,
      boxY + 0.5
    );
    const rightCrescent = rightCrescentPath
      ? `<path d="${rightCrescentPath}" fill="${palette.emphasisBg}" />`
      : '';
    return (
      `<path d="${leftFillPath}" fill="url(#${BG_DARK_ID})" />` +
      `<path d="${leftBorderPath}" stroke="${BASE_DARK.borderNeutral}" stroke-width="1" />` +
      `<path d="${rightFillPath}" fill="url(#${buildThemeGradientId(options.color)})" />${
        rightCrescent
      }<path d="${rightRingPath}" stroke="${palette.emphasisRing}" stroke-width="1" />`
    );
  }

  const positionAttrs = boxX === 0 && boxY === 0 ? '' : `x="${boxX}" y="${boxY}" `;
  const crescentPath = buildTopCrescentPath(boxX, rightEdgeX, radius, true, boxY);
  const bottomY = roundCoord(boxY + height);

  if (variant === '1') {
    const gradientBody = `<rect ${positionAttrs}width="${width}" height="${height}" rx="${radius}" fill="url(#${buildThemeGradientId(options.color)})" />`;
    const topCrescent = crescentPath
      ? `<path d="${crescentPath}" fill="${palette.emphasisBg}" />`
      : '';
    const splitDivider =
      splitLineX === undefined
        ? ''
        : renderDividerLine(splitLineX, boxY + 5, bottomY - 5, PRIMARY_DIVIDER_COLOR);
    const outerRing = renderInsetRingRect(
      boxX,
      boxY,
      width,
      height,
      radius,
      `stroke="${palette.emphasisRing}"`
    );
    return `${gradientBody}${topCrescent}${splitDivider}${outerRing}`;
  }

  const darkBody = `<rect ${positionAttrs}width="${width}" height="${height}" rx="${radius}" fill="url(#${BG_DARK_ID})" />`;

  if (variant === '2') {
    const tintBody = isRightCapsuleOnly
      ? `<path d="${buildRightCapsulePath(rightCapsuleStartX, rightEdgeX, height, radius, boxY)}" fill="${palette.tintBg}" />`
      : `<rect ${positionAttrs}width="${width}" height="${height}" rx="${radius}" fill="${palette.tintBg}" />`;
    const secondaryCrescentPath = isRightCapsuleOnly
      ? buildTopCrescentPath(rightCapsuleStartX, rightEdgeX, radius, false, boxY)
      : crescentPath;
    const topCrescent = secondaryCrescentPath
      ? `<path d="${secondaryCrescentPath}" fill="${palette.borderColor}" fill-opacity="0.45" />`
      : '';
    const splitDivider =
      splitLineX === undefined
        ? ''
        : renderDividerLine(splitLineX, boxY + 1, bottomY - 1, palette.borderColor);
    const outerRing = renderInsetRingRect(
      boxX,
      boxY,
      width,
      height,
      radius,
      `stroke="${palette.borderColor}"`
    );
    return `${darkBody}${tintBody}${topCrescent}${splitDivider}${outerRing}`;
  }

  const topCrescent = crescentPath
    ? `<path d="${crescentPath}" fill="${WHITE}" fill-opacity="0.045" />`
    : '';
  const splitDivider =
    splitLineX === undefined
      ? ''
      : renderDividerLine(splitLineX, boxY + 4, bottomY - 4, BASE_DARK.borderNeutral);
  const outerRing = renderInsetRingRect(
    boxX,
    boxY,
    width,
    height,
    radius,
    `stroke="${BASE_DARK.borderNeutral}"`
  );
  return `${darkBody}${topCrescent}${splitDivider}${outerRing}`;
}

/**
 * Render the optional periodic diagonal specular sheen overlay for rectangular/pill surfaces and tile grids.
 * Accounts for the horizontal displacement of `skewX(-22)` (`tan(22°) ≈ 0.404`, rounded up to `0.45` for a safety margin)
 * over the full band height so the skewed highlight band completely clears the bottom-right corner before pausing.
 * IDs are content-addressed (custom clip content is hashed), so equal IDs always carry identical definitions.
 * @param options   Sheen overlay configuration.
 * @returns `clipDef` (for `<defs>`) and `overlay` (for the top SVG layer).
 */
export function renderSheenOverlay(options: SheenOverlayOptions): SheenOverlay {
  if (!isSheenMode(options.animMode)) {
    return { clipDef: '', overlay: '' };
  }
  const { clipContent, height, idPrefix = 'sheen', radius, width } = options;
  const contentKey = clipContent === undefined ? String(radius) : hashText(clipContent);
  const idSuffix = `${width}-${height}-${contentKey}`;
  const clipId = `${idPrefix}-clip-${idSuffix}`;
  const gradId = `${idPrefix}-grad-${idSuffix}`;
  const bandHeight = height + 12;
  const skewOffset = Math.ceil(bandHeight * 0.45);
  const endTranslate = width + 68 + skewOffset;
  const clipInner = clipContent ?? `<rect width="${width}" height="${height}" rx="${radius}" />`;
  LAZY_MARKUP.sheenBandStops ??= renderWhiteBandStops(SHEEN_BAND_STOPS);
  const clipDef = `<clipPath id="${clipId}">${clipInner}</clipPath><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">${LAZY_MARKUP.sheenBandStops}</linearGradient>`;
  const sweep = renderSweepAnimation(
    'animateTransform',
    'attributeName="transform" type="translate"',
    '0 0',
    `${endTranslate} 0`,
    SHEEN_SWEEP_TIMING
  );
  const overlay = `<g clip-path="url(#${clipId})"><g>${sweep}<rect x="-52" y="-6" width="40" height="${bandHeight}" transform="skewX(-22)" fill="url(#${gradId})" /></g></g>`;
  return { clipDef, overlay };
}

/**
 * Render the compact single-line root `<svg>` document shared by every renderer, with the accessible
 * label as both `aria-label` and the first-child `<title>` (tooltip and fallback for assistive tech).
 * @param options   Document size, accessible label, paint attributes, `<defs>`, and body markup.
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderSvgDocument(options: SvgDocumentOptions): string {
  const { height, width } = options;
  const viewBox = options.viewBox ?? `0 0 ${width} ${height}`;
  const paintAttrs = options.paintAttrs ?? 'fill="none"';
  const restAttr = options.restTime === undefined ? '' : ` data-rest-time="${options.restTime}"`;
  const label = escapeXml(options.ariaLabel);
  const defsMarkup = options.defs ? `<defs>${options.defs}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" ${paintAttrs} role="img" aria-label="${label}"${restAttr}><title>${label}</title>${defsMarkup}${options.body}</svg>`;
}
