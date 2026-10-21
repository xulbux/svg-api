/**
 * Shared SVG primitives – XML escaping, display text normalization and truncation, numeric clamping, prototype-safe record lookups, bounded LRU caches, content hashing, foreground paints, Kumo 3D top-edge crescent geometry, surface layers, gradient defs, sweep animations, icon groups, specular sheen overlays, and the root `<svg>` document template.
 */

import { STRIP_DARK_COLORS, WHITE } from '@/config/palette';
import { BASE_DARK, THEMES } from '@/config/theme';
import type {
  AnimationMode,
  BadgeVariant,
  BandStop,
  ForegroundPaint,
  IconMotionMode,
  IconType,
  LruCache,
  NumericRange,
  ResolvedIcon,
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
  animMode: AnimationMode;
  /** Optional custom inner SVG elements for the `<clipPath>` (e.g., multiple tile `<rect>`s); Defaults to one rounded rectangle. */
  clipContent?: string;
  /** Total SVG height in pixels. */
  height: number;
  /** Prefix for the `<clipPath>` and `<linearGradient>` IDs (defaults to `'sheen'`). */
  idPrefix?: string;
  /** Outer corner radius in pixels (used when `clipContent` is omitted). */
  radius: number;
  /** Total SVG width in pixels. */
  width: number;
}

/** Options for `renderKumoBoxSurface`. */
interface KumoSurfaceOptions {
  /** Left X coordinate in pixels (defaults to `0`). */
  boxX?: number;
  /** Top Y coordinate in pixels (defaults to `0`). */
  boxY?: number;
  /** Theme color token whose palette and `grad-<color>` gradient paint the surface. */
  color: ThemeColorName;
  /** Box height in pixels. */
  height: number;
  /** Outer corner radius in pixels. */
  radius: number;
  /**
   * Optional X coordinate in pixels where the accented right capsule of a split badge starts; The
   * `variant = '2'` tint and 3D top crescent then cover only that capsule (defaults to the full box).
   */
  rightCapsuleStartX?: number;
  /** Optional X coordinate in pixels of an internal vertical divider (split micro-buttons and badges). */
  splitLineX?: number;
  /** Surface hierarchy tier (`'1'`, `'2'`, or `'3'`). */
  variant: BadgeVariant;
  /** Box width in pixels. */
  width: number;
}

/** Options for `renderIconGroup`. */
interface IconGroupOptions {
  /** Stroke (Lucide) or fill (Simple Icons) color. */
  color: string;
  /** Inner SVG markup of the icon (optionally wrapped in animation groups). */
  innerSvg: string;
  /** Optional group opacity (`0`–`1`; Omitted when `>= 1`). */
  opacity?: number;
  /** Stroke width in `24x24` icon units (Lucide icons only). */
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
  /** Root paint attributes (defaults to `fill="none"`). */
  paintAttrs?: string;
  /** Root `viewBox` (defaults to `0 0 <width> <height>`). */
  viewBox?: string;
  /** Rendered width in pixels. */
  width: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** ID of the shared dark-slate surface `<linearGradient>`. */
const BG_DARK_ID = 'bg-dark';

/** Font size in pixels of `22px` badge labels and values (also the default text measurement size). */
export const BADGE_FONT_SIZE = 11;

/**
 * Opacity of white foreground elements drawn on vivid primary (`variant=1`) surfaces: Icons, delta
 * arrows, gauge fills, sparkline strokes, accent bars, and secondary text (author lines, split
 * button values, neutral delta readouts); Primary text (labels, values, quotes) stays fully white.
 */
export const PRIMARY_FOREGROUND_OPACITY = 0.85;

/** Opacity of the white split divider line on vivid primary (`variant=1`) surfaces. */
const PRIMARY_DIVIDER_OPACITY = 0.28;

/** Ellipsis appended to truncated text. */
export const ELLIPSIS = '…';

/** Valid per-icon motion tokens inside an `AnimationMode`, sorted alphabetically (everything except the `'sheen'` surface token). */
export const ICON_MOTION_TOKENS: readonly IconMotionMode[] = [
  'auto',
  'default',
  'float',
  'none',
  'nudge',
  'pulse',
  'shake',
  'spin',
];

/** Timing of the diagonal surface sheen sweep (also the base timing of the standalone icon sheen). */
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

/** Set of valid per-icon motion tokens (derived from `ICON_MOTION_TOKENS`). */
const ICON_MOTION_MODES: ReadonlySet<string> = new Set<string>(ICON_MOTION_TOKENS);

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

/** Lazily built constant markup strings. */
const LAZY_MARKUP: LazyMarkupCache = {};

/** Memoized `<linearGradient id="grad-<color>">` definitions by theme color. */
const THEME_GRADIENT_DEF_CACHE = new Map<ThemeColorName, string>();

/** Memoized content hashes of icon bodies (released together with the resolved icon). */
const ICON_BODY_HASH_CACHE = new WeakMap<ResolvedIcon, string>();

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches XML markup characters (`&`, `<`, `>`, `"`, `'`), control characters, lone surrogates, and the noncharacters `U+FFFE`/`U+FFFF` in a single pass. */
const XML_ESCAPE_RX = /[&<>"'\p{Cc}\p{Cs}\uFFFE\uFFFF]/gu;

/** Matches runs of control and invisible format characters (Geist draws them as visible `.notdef` boxes). */
const INVISIBLE_CHARS_RX = /[\p{Cc}\p{Cf}]+/gu;

// -------------------------------------- INTERNALS --------------------------------------

/** Map a single matched character to its XML entity, keep XML-legal whitespace controls, and strip XML-illegal characters. */
function replaceXmlChar(char: string): string {
  return XML_REPLACEMENT_MAP[char] ?? '';
}

/** Render a `1px` vertical divider `<line>` at `lineX` from `topY` to `bottomY`. */
function renderDividerLine(lineX: number, topY: number, bottomY: number, stroke: string): string {
  return `<line x1="${lineX}" y1="${topY}" x2="${lineX}" y2="${bottomY}" stroke="${stroke}" stroke-width="1" />`;
}

/**
 * Build the ID of the vertical theme `<linearGradient>` for a color (`'grad-<color>'`).
 * @param color   Theme color token.
 * @returns Gradient element ID.
 */
function buildThemeGradientId(color: ThemeColorName): string {
  return `grad-${color}`;
}

/**
 * Render a top-to-bottom two-stop `<linearGradient>` definition.
 * @param id              Gradient element ID.
 * @param topColor        Color of the top (`0%`) stop.
 * @param bottomColor     Color of the bottom (`100%`) stop.
 * @param topOpacity      Optional `stop-opacity` of the top stop (omitted when `undefined`).
 * @param bottomOpacity   Optional `stop-opacity` of the bottom stop (omitted when `undefined`).
 * @returns `<linearGradient>` SVG string.
 */
function renderVerticalGradientDef(
  id: string,
  topColor: string,
  bottomColor: string,
  topOpacity?: number,
  bottomOpacity?: number
): string {
  const topOpacityAttr = topOpacity === undefined ? '' : ` stop-opacity="${topOpacity}"`;
  const bottomOpacityAttr = bottomOpacity === undefined ? '' : ` stop-opacity="${bottomOpacity}"`;
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${topColor}"${topOpacityAttr} /><stop offset="100%" stop-color="${bottomColor}"${bottomOpacityAttr} /></linearGradient>`;
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
  let gradientDef = THEME_GRADIENT_DEF_CACHE.get(color);
  if (gradientDef === undefined) {
    const palette = THEMES[color];
    gradientDef = renderVerticalGradientDef(
      buildThemeGradientId(color),
      palette.gradStart,
      palette.gradEnd
    );
    THEME_GRADIENT_DEF_CACHE.set(color, gradientDef);
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
  const innerRadius = radius - 1;
  const innerRadiusY = innerRadius - 1;
  const rightArcStart = endX - 1 - innerRadius;
  const rightTangentX = endX - 1;
  const outerTopY = topY + 1;
  const innerTopY = topY + 2;
  const cornerEndY = outerTopY + innerRadius;

  if (!hasRoundedLeftCorner) {
    const leftEdgeX = startX + 0.5;
    return `M ${leftEdgeX} ${outerTopY} H ${rightArcStart} A ${innerRadius} ${innerRadius} 0 0 1 ${rightTangentX} ${cornerEndY} A ${innerRadius} ${innerRadiusY} 0 0 0 ${rightArcStart} ${innerTopY} H ${leftEdgeX} Z`;
  }

  const leftTangentX = startX + 1;
  const leftArcEnd = startX + 1 + innerRadius;
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
  const bottomY = topY + height;
  const cornerX = startX + radius;
  return `M ${endX} ${topY} H ${cornerX} A ${radius} ${radius} 0 0 0 ${startX} ${topY + radius} V ${bottomY - radius} A ${radius} ${radius} 0 0 0 ${cornerX} ${bottomY} H ${endX}${isClosed ? ' Z' : ''}`;
}

/** Build the SVG `<path>` `d` attribute for the right capsule of a split badge (square left edge, rounded right corners). */
function buildRightCapsulePath(
  startX: number,
  endX: number,
  height: number,
  radius: number,
  topY = 0
): string {
  const bottomY = topY + height;
  return `M ${startX} ${topY} H ${endX - radius} A ${radius} ${radius} 0 0 1 ${endX} ${topY + radius} V ${bottomY - radius} A ${radius} ${radius} 0 0 1 ${endX - radius} ${bottomY} H ${startX} Z`;
}

// -------------------------------------- PUBLIC API -------------------------------------

export { buildThemeGradientId, renderVerticalGradientDef };

/**
 * Look up an own (non-inherited) property of a lookup table by a user-supplied key.
 * Prevents keys like `'constructor'` or `'toString'` from resolving to `Object.prototype` members.
 * @param record   Lookup table to read from.
 * @param key      Untrusted lookup key.
 * @returns The own property value, or `undefined` when `key` is not an own property.
 */
export function getOwnValue<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
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
 * Check whether an optional token is a valid per-icon motion token (anything in `ICON_MOTION_TOKENS`).
 * @param token   Candidate animation token.
 * @returns `true` when `token` is an `IconMotionMode`.
 */
export function isIconMotionMode(token: string | undefined): token is IconMotionMode {
  return token !== undefined && ICON_MOTION_MODES.has(token);
}

/**
 * Check whether an untrusted string is a valid 10-stage strip tick (`'0'`–`'9'`, an own key of `STRIP_DARK_COLORS`).
 * @param state   Candidate tick character or token.
 * @returns `true` when `state` is a `StripTickState`.
 */
export function isStripTickState(state: string): state is StripTickState {
  return hasOwnKey(STRIP_DARK_COLORS, state);
}

/**
 * Check whether an animation mode enables the diagonal specular sheen sweep (`'sheen'` or `'sheen,<mode>'`).
 * @param animMode   Active animation mode.
 * @returns `true` when the sheen overlay should be rendered.
 */
export function isSheenMode(animMode: AnimationMode): boolean {
  return animMode === 'sheen' || animMode.startsWith('sheen,');
}

/**
 * Check whether an animation mode disables status dot and data widget animations (`'none'`, `'none,none'`,
 * or `'sheen,none,none'`).
 * @param animMode   Active animation mode.
 * @returns `true` when status dots and data widgets must be static.
 */
export function isAnimationDisabled(animMode: AnimationMode): boolean {
  return animMode === 'none' || animMode === 'none,none' || animMode === 'sheen,none,none';
}

/**
 * Split an animation mode into its per-icon motion tokens, dropping the `'sheen'` surface token.
 * @param animMode   Active animation mode (e.g., `'sheen,shake,nudge'`).
 * @returns Ordered icon motion tokens (e.g., `['shake', 'nudge']`).
 */
export function resolveIconMotionTokens(animMode: AnimationMode): IconMotionMode[] {
  const tokens: IconMotionMode[] = [];
  for (const token of animMode.split(',')) {
    if (isIconMotionMode(token)) {
      tokens.push(token);
    }
  }
  return tokens;
}

/**
 * Round a finite number to 1 decimal place (`0.1` precision) without string allocation.
 * @param value   Number to round.
 * @returns Number rounded to the nearest tenth.
 */
export function roundTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Round a finite number to 2 decimal places (`0.01` precision) without string allocation.
 * @param value   Number to round.
 * @returns Number rounded to the nearest hundredth.
 */
export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Round a finite scale factor to 4 decimal places (`0.0001` precision) without string allocation.
 * @param value   Number to round.
 * @returns Number rounded to the nearest ten-thousandth.
 */
export function roundScale(value: number): number {
  return Math.round(value * 10_000) / 10_000;
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
 * Escape XML markup characters (`&`, `<`, `>`, `"`, `'`) and strip XML-illegal characters (control characters
 * except Tab/LF/CR, lone surrogates, `U+FFFE`, `U+FFFF`) in a single pass for safe inclusion in SVG/HTML text and attributes.
 * @param unsafe   Raw unescaped string.
 * @returns XML-safe escaped string.
 */
export function escapeXml(unsafe: string): string {
  return unsafe.replace(XML_ESCAPE_RX, replaceXmlChar);
}

/**
 * Hash text into a short, deterministic base-36 token (polynomial rolling hash over UTF-16 code units
 * modulo a 32-bit prime). Used for content-addressed SVG IDs, per-card SVG ID scopes, static asset
 * versions, and ETags; Not a cryptographic hash.
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
 * Build a content-addressed `<defs>` ID for an icon body (`<prefix>-<hash of innerSvg>`), hashing each
 * resolved icon only once; Equal IDs always carry identical bodies, even across inlined SVGs.
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
 * Return the first `end` UTF-16 code units of `text`, backing off by one unit so a surrogate pair is never split.
 * @param text   Source string.
 * @param end    Desired exclusive end index in UTF-16 code units (`<= 0` yields `''`).
 * @returns Prefix of `text` that ends on a code point boundary.
 */
export function sliceAtCodePoint(text: string, end: number): string {
  if (end <= 0) {
    return '';
  }
  const lastCode = text.charCodeAt(end - 1);
  const isHighSurrogate = lastCode >= 0xd8_00 && lastCode <= 0xdb_ff;
  return text.slice(0, isHighSurrogate ? end - 1 : end);
}

/**
 * Cap `text` at `maxLength` UTF-16 code units, replacing the overflow with a trailing ellipsis (`…`).
 * @param text        Raw text.
 * @param maxLength   Maximum length in UTF-16 code units, including the ellipsis.
 * @returns `text` unchanged when it fits, otherwise its truncated prefix plus `…`.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${sliceAtCodePoint(text, maxLength - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`;
}

/**
 * Prepare user-supplied text for outline rendering: Replace runs of control and invisible format
 * characters (e.g., `\n`, `\t`, `U+200B`) with one space, then cap it at `maxLength` with an ellipsis.
 * @param text        Raw text.
 * @param maxLength   Maximum length in UTF-16 code units, including the ellipsis.
 * @returns Renderable display text.
 */
export function prepareDisplayText(text: string, maxLength: number): string {
  return truncateText(text.replace(INVISIBLE_CHARS_RX, ' '), maxLength);
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
 * Store a value as most recently used, evicting least recently used entries until both the entry count
 * and the summed weight fit; Values heavier than `maxWeight` on their own are never cached.
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
 * Resolve the primary text color on a surface tier: White on vivid primary surfaces, muted on tertiary
 * (`variant=3`) surfaces, and bright otherwise (e.g., the dark left compartment of a split primary badge).
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
 * Resolve the paint of a foreground element drawn as a group (icons, delta arrows): White at
 * `PRIMARY_FOREGROUND_OPACITY` on vivid primary surfaces, the opaque accent color otherwise.
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
 * Resolve the single paint color of a foreground element without a group opacity (gauge fills,
 * sparkline strokes, secondary text): White with `PRIMARY_FOREGROUND_OPACITY` baked in on vivid
 * primary surfaces, the accent color otherwise.
 * @param isOnPrimary   Whether the element sits on a vivid primary surface.
 * @param accentColor   Color used on dark surfaces (e.g., `palette.accentText`).
 * @returns Paint color.
 */
export function resolveForegroundColor(isOnPrimary: boolean, accentColor: string): string {
  return isOnPrimary ? PRIMARY_FOREGROUND_COLOR : accentColor;
}

/**
 * Render the `<defs>` gradients referenced by Kumo surfaces: The dark-slate fill and one vivid theme
 * gradient per primary color (shared by badges, buttons, stacks, and quote cards).
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
 * Render the paint attributes for an icon: Round-capped strokes for Lucide icons, a solid fill for brand icons.
 * @param type          Icon source type.
 * @param color         Stroke or fill color.
 * @param strokeWidth   Stroke width in `24x24` icon units (Lucide icons only).
 * @returns Space-separated SVG presentation attributes.
 */
export function renderIconPaintAttrs(type: IconType, color: string, strokeWidth: number): string {
  return type === 'lucide'
    ? `fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="${color}"`;
}

/**
 * Render a positioned, painted icon `<g>` group for a resolved Lucide or brand icon.
 * @param options   Icon group configuration (`innerSvg`, `type`, `transform`, `color`, `strokeWidth`, `opacity`).
 * @returns `<g>` SVG element string.
 */
export function renderIconGroup(options: IconGroupOptions): string {
  const opacityAttr =
    options.opacity !== undefined && options.opacity < 1 ? ` opacity="${options.opacity}"` : '';
  const paintAttrs = renderIconPaintAttrs(options.type, options.color, options.strokeWidth);
  return `<g transform="${options.transform}" ${paintAttrs}${opacityAttr}>${options.innerSvg}</g>`;
}

/**
 * Render the unified 3-variant Cloudflare Kumo 3D rectangular/pill/tile surface, upper-edge crescent,
 * optional split divider, and outer border ring.
 * - `variant = '1'` (Primary): vivid brand gradient fill (`url(#grad-<color>)`) + `palette.emphasisBg` top crescent + `palette.emphasisRing` border.
 * - `variant = '2'` (Secondary): dark slate fill (`url(#bg-dark)`) + `palette.tintBg` overlay + `palette.borderColor` (`0.45`) top crescent + `palette.borderColor` border.
 * - `variant = '3'` (Tertiary): dark slate fill (`url(#bg-dark)`) + subtle `#FFFFFF` (`0.045`) top crescent + `BASE_DARK.borderNeutral` border.
 * With `rightCapsuleStartX` (split `variant = '2'` badges), the tint and the 3D top crescent only cover the
 * right capsule, like split primary badges; Tertiary dividers stop short of the edges, so their crescent spans both halves.
 * @param options   Surface geometry, variant, color, and optional split/right capsule positions.
 * @returns Concatenated SVG surface, crescent, divider, and border `<rect>`/`<path>`/`<line>` elements.
 */
export function renderKumoBoxSurface(options: KumoSurfaceOptions): string {
  const {
    boxX = 0,
    boxY = 0,
    height,
    radius,
    rightCapsuleStartX,
    splitLineX,
    variant,
    width,
  } = options;
  const palette = THEMES[options.color];
  const positionAttrs = boxX === 0 && boxY === 0 ? '' : `x="${boxX}" y="${boxY}" `;
  const ringGeometry = `x="${boxX + 0.5}" y="${boxY + 0.5}" width="${width - 1}" height="${height - 1}" rx="${radius - 0.5}"`;
  const crescentPath = buildTopCrescentPath(boxX, boxX + width, radius, true, boxY);
  const bottomY = boxY + height;

  const isRightCapsuleOnly = rightCapsuleStartX !== undefined;
  const rightEdgeX = boxX + width;

  if (variant === '1') {
    if (isRightCapsuleOnly) {
      const innerRadius = radius - 0.5;
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
      return (
        `<path d="${leftFillPath}" fill="url(#${BG_DARK_ID})" />` +
        `<path d="${leftBorderPath}" stroke="${BASE_DARK.borderNeutral}" stroke-width="1" />` +
        `<path d="${rightFillPath}" fill="url(#${buildThemeGradientId(options.color)})" />` +
        `<path d="${rightCrescentPath}" fill="${palette.emphasisBg}" />` +
        `<path d="${rightRingPath}" stroke="${palette.emphasisRing}" stroke-width="1" />`
      );
    }
    const gradientBody = `<rect ${positionAttrs}width="${width}" height="${height}" rx="${radius}" fill="url(#${buildThemeGradientId(options.color)})" />`;
    const topCrescent = `<path d="${crescentPath}" fill="${palette.emphasisBg}" />`;
    const splitDivider =
      splitLineX === undefined
        ? ''
        : renderDividerLine(splitLineX, boxY + 5, bottomY - 5, PRIMARY_DIVIDER_COLOR);
    const outerRing = `<rect ${ringGeometry} stroke="${palette.emphasisRing}" stroke-width="1" />`;
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
    const topCrescent = `<path d="${secondaryCrescentPath}" fill="${palette.borderColor}" fill-opacity="0.45" />`;
    const splitDivider =
      splitLineX === undefined
        ? ''
        : renderDividerLine(splitLineX, boxY + 1, bottomY - 1, palette.borderColor);
    const outerRing = `<rect ${ringGeometry} stroke="${palette.borderColor}" stroke-width="1" />`;
    return `${darkBody}${tintBody}${topCrescent}${splitDivider}${outerRing}`;
  }

  const topCrescent = `<path d="${crescentPath}" fill="${WHITE}" fill-opacity="0.045" />`;
  const splitDivider =
    splitLineX === undefined
      ? ''
      : renderDividerLine(splitLineX, boxY + 4, bottomY - 4, BASE_DARK.borderNeutral);
  const outerRing = `<rect ${ringGeometry} stroke="${BASE_DARK.borderNeutral}" stroke-width="1" />`;
  return `${darkBody}${topCrescent}${splitDivider}${outerRing}`;
}

/**
 * Render the optional periodic diagonal specular sheen overlay (`?anim=sheen`) for rectangular/pill surfaces and tile grids.
 * Accounts for the horizontal displacement of `skewX(-22)` (`tan(22°) ≈ 0.404`, rounded up to `0.45` for a safety margin)
 * over the full band height so the skewed highlight band completely clears the bottom-right corner before pausing.
 * IDs are content-addressed (custom clip content is hashed), so equal IDs always carry identical definitions.
 * @param options   Sheen configuration (`animMode`, `width`, `height`, `radius`, `idPrefix`, `clipContent`).
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
  const label = escapeXml(options.ariaLabel);
  const defsMarkup = options.defs ? `<defs>${options.defs}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" ${paintAttrs} role="img" aria-label="${label}"><title>${label}</title>${defsMarkup}${options.body}</svg>`;
}
