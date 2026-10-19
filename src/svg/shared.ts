/**
 * Shared SVG primitives – XML escaping, display text normalization and truncation, numeric clamping, prototype-safe record lookups, bounded LRU caches, content hashing, Kumo 3D top-edge crescent geometry, surface layers, gradient defs, icon groups, specular sheen overlays, and the root `<svg>` document template.
 */

import { WHITE } from '@/config/palette';
import { BASE_DARK, THEMES } from '@/config/theme';
import type {
  AnimationMode,
  BadgeVariant,
  BandStop,
  IconMotionMode,
  IconType,
  LruCache,
  NumericRange,
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
  /** Raw, unescaped accessible label (escaped by `renderSvgDocument`). */
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
export const BG_DARK_ID = 'bg-dark';

/** Opacity of white foreground accents (icons, arrows, bars) drawn on vivid primary (`variant=1`) surfaces. */
export const PRIMARY_FOREGROUND_OPACITY = 0.82;

/** Ellipsis appended to truncated text. */
export const ELLIPSIS = '…';

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

/** Valid per-icon motion tokens inside an `AnimationMode` (everything except the `'sheen'` surface token). */
const ICON_MOTION_MODES: ReadonlySet<string> = new Set<IconMotionMode>([
  'auto',
  'default',
  'float',
  'none',
  'nudge',
  'pulse',
  'shake',
  'spin',
]);

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

/** Check whether an `AnimationMode` token is a per-icon motion token (anything except `'sheen'` and empty tokens). */
function isIconMotionMode(token: string): token is IconMotionMode {
  return ICON_MOTION_MODES.has(token);
}

/** Compute a deterministic, content-addressed base-36 hash of a string (polynomial rolling hash modulo a 32-bit prime). */
function hashContent(text: string): string {
  let hash = HASH_SEED;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * HASH_MULTIPLIER + text.charCodeAt(i)) % HASH_MODULUS;
  }
  return hash.toString(36);
}

// -------------------------------------- PUBLIC API -------------------------------------

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
 * Check whether an animation mode enables the diagonal specular sheen sweep (`'sheen'` or `'sheen,<mode>'`).
 * @param animMode   Active animation mode.
 * @returns `true` when the sheen overlay should be rendered.
 */
export function isSheenMode(animMode: AnimationMode): boolean {
  return animMode === 'sheen' || animMode.startsWith('sheen,');
}

/**
 * Check whether an animation mode disables every animation, including status dots and data widgets
 * (`'none'`, or the per-icon pair `'none,none'`).
 * @param animMode   Active animation mode.
 * @returns `true` when the SVG must be completely static.
 */
export function isAnimationDisabled(animMode: AnimationMode): boolean {
  return animMode === 'none' || animMode === 'none,none';
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
 * Hash text into a short, deterministic base-36 token (polynomial rolling hash modulo a 31-bit prime).
 * Used for per-card SVG ID scopes and static asset versions; Not a cryptographic hash.
 * @param text   Text to hash.
 * @returns Base-36 hash token (e.g., `'1x2k9f'`).
 */
export function hashText(text: string): string {
  let hash = 7;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + (text.codePointAt(i) ?? 0)) % 2_147_483_647;
  }
  return hash.toString(36);
}

/**
 * Return the first `end` UTF-16 code units of `text`, backing off by one unit so a surrogate pair is never split.
 * @param text   Source string.
 * @param end    Desired exclusive end index in UTF-16 code units.
 * @returns Prefix of `text` that ends on a code point boundary.
 */
export function sliceAtCodePoint(text: string, end: number): string {
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
 * Build the ID of the vertical theme `<linearGradient>` for a color (`'grad-<color>'`).
 * @param color   Theme color token.
 * @returns Gradient element ID.
 */
export function buildThemeGradientId(color: ThemeColorName): string {
  return `grad-${color}`;
}

/**
 * Render the shared `<linearGradient id="bg-dark">` definition for dark-slate surfaces (built once per isolate).
 * @returns `<linearGradient>` SVG string.
 */
export function renderDarkBgGradientDef(): string {
  LAZY_MARKUP.darkBgGradientDef ??= `<linearGradient id="${BG_DARK_ID}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${BASE_DARK.bgTop}" /><stop offset="100%" stop-color="${BASE_DARK.bgBottom}" /></linearGradient>`;
  return LAZY_MARKUP.darkBgGradientDef;
}

/**
 * Render the vertical theme `<linearGradient id="grad-<color>">` definition (from `gradStart` to `gradEnd`), memoized per color.
 * @param color   Theme color token.
 * @returns `<linearGradient>` SVG string.
 */
export function renderThemeGradientDef(color: ThemeColorName): string {
  let gradientDef = THEME_GRADIENT_DEF_CACHE.get(color);
  if (gradientDef === undefined) {
    const palette = THEMES[color];
    gradientDef = `<linearGradient id="${buildThemeGradientId(color)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${palette.gradStart}" /><stop offset="100%" stop-color="${palette.gradEnd}" /></linearGradient>`;
    THEME_GRADIENT_DEF_CACHE.set(color, gradientDef);
  }
  return gradientDef;
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
 * Build the SVG `<path>` `d` attribute for Cloudflare Kumo's upper-edge 3D highlight crescent.
 * Uses a circular outer arc (`A r r`) and an elliptical inner return arc (`A r (r - 1)`) so the
 * highlight is `1px` thick along the top straight edge and tapers smoothly to `0px` around the
 * top corner curve without extending down the vertical sides.
 * @param startX                 Left X coordinate of the capsule or tile.
 * @param endX                   Right X coordinate of the capsule or tile.
 * @param radiusX                Outer border radius in pixels.
 * @param hasRoundedLeftCorner   Whether the left edge is rounded (`true` for full pills/tiles, `false` for split right capsules).
 * @param topY                   Top Y coordinate of the capsule or tile (defaults to `0`).
 * @returns SVG `<path>` `d` attribute string.
 */
export function buildTopCrescentPath(
  startX: number,
  endX: number,
  radiusX: number,
  hasRoundedLeftCorner: boolean,
  topY = 0
): string {
  const innerR = radiusX - 1;
  const innerRy = innerR - 1;
  const rightArcStart = endX - 1 - innerR;
  const rightTangentX = endX - 1;
  const outerTopY = topY + 1;
  const innerTopY = topY + 2;
  const cornerEndY = outerTopY + innerR;

  if (!hasRoundedLeftCorner) {
    const leftEdgeX = startX + 1;
    return `M ${leftEdgeX} ${outerTopY} H ${rightArcStart} A ${innerR} ${innerR} 0 0 1 ${rightTangentX} ${cornerEndY} A ${innerR} ${innerRy} 0 0 0 ${rightArcStart} ${innerTopY} H ${leftEdgeX} Z`;
  }

  const leftTangentX = startX + 1;
  const leftArcEnd = startX + 1 + innerR;
  return `M ${leftTangentX} ${cornerEndY} A ${innerR} ${innerR} 0 0 1 ${leftArcEnd} ${outerTopY} H ${rightArcStart} A ${innerR} ${innerR} 0 0 1 ${rightTangentX} ${cornerEndY} A ${innerR} ${innerRy} 0 0 0 ${rightArcStart} ${innerTopY} H ${leftArcEnd} A ${innerR} ${innerRy} 0 0 0 ${leftTangentX} ${cornerEndY} Z`;
}

/**
 * Build the SVG `<path>` `d` attribute for the right capsule of a split badge (square left edge, rounded right corners).
 * @param startX    Left X coordinate of the capsule (the split position).
 * @param endX      Right X coordinate of the capsule.
 * @param height    Capsule height in pixels.
 * @param radiusX   Outer corner radius in pixels.
 * @param topY      Top Y coordinate of the capsule (defaults to `0`).
 * @returns SVG `<path>` `d` attribute string.
 */
export function buildRightCapsulePath(
  startX: number,
  endX: number,
  height: number,
  radiusX: number,
  topY = 0
): string {
  const bottomY = topY + height;
  return `M ${startX} ${topY} H ${endX - radiusX} A ${radiusX} ${radiusX} 0 0 1 ${endX} ${topY + radiusX} V ${bottomY - radiusX} A ${radiusX} ${radiusX} 0 0 1 ${endX - radiusX} ${bottomY} H ${startX} Z`;
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
  const posAttr = boxX === 0 && boxY === 0 ? '' : `x="${boxX}" y="${boxY}" `;
  const ringGeometry = `x="${boxX + 0.5}" y="${boxY + 0.5}" width="${width - 1}" height="${height - 1}" rx="${radius - 0.5}"`;
  const crescentD = buildTopCrescentPath(boxX, boxX + width, radius, true, boxY);

  if (variant === '1') {
    const gradientBody = `<rect ${posAttr}width="${width}" height="${height}" rx="${radius}" fill="url(#${buildThemeGradientId(options.color)})" />`;
    const topCrescent = `<path d="${crescentD}" fill="${palette.emphasisBg}" />`;
    const splitDivider =
      splitLineX === undefined
        ? ''
        : `<line x1="${splitLineX}" y1="${boxY + 5}" x2="${splitLineX}" y2="${boxY + height - 5}" stroke="rgba(255,255,255,0.28)" stroke-width="1" />`;
    const outerRing = `<rect ${ringGeometry} stroke="${palette.emphasisRing}" stroke-width="1" />`;
    return `${gradientBody}${topCrescent}${splitDivider}${outerRing}`;
  }

  const darkBody = `<rect ${posAttr}width="${width}" height="${height}" rx="${radius}" fill="url(#${BG_DARK_ID})" />`;

  if (variant === '2') {
    const isRightCapsuleOnly = rightCapsuleStartX !== undefined;
    const tintBody = isRightCapsuleOnly
      ? `<path d="${buildRightCapsulePath(rightCapsuleStartX, boxX + width, height, radius, boxY)}" fill="${palette.tintBg}" />`
      : `<rect ${posAttr}width="${width}" height="${height}" rx="${radius}" fill="${palette.tintBg}" />`;
    const secondaryCrescentD = isRightCapsuleOnly
      ? buildTopCrescentPath(rightCapsuleStartX, boxX + width, radius, false, boxY)
      : crescentD;
    const topCrescent = `<path d="${secondaryCrescentD}" fill="${palette.borderColor}" fill-opacity="0.45" />`;
    const splitDivider =
      splitLineX === undefined
        ? ''
        : `<line x1="${splitLineX}" y1="${boxY}" x2="${splitLineX}" y2="${boxY + height}" stroke="${palette.borderColor}" stroke-width="1" />`;
    const outerRing = `<rect ${ringGeometry} stroke="${palette.borderColor}" stroke-width="1" />`;
    return `${darkBody}${tintBody}${topCrescent}${splitDivider}${outerRing}`;
  }

  const topCrescent = `<path d="${crescentD}" fill="${WHITE}" fill-opacity="0.045" />`;
  const splitDivider =
    splitLineX === undefined
      ? ''
      : `<line x1="${splitLineX}" y1="${boxY + 4}" x2="${splitLineX}" y2="${boxY + height - 4}" stroke="${BASE_DARK.borderNeutral}" stroke-width="1" />`;
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
  const contentKey = clipContent === undefined ? String(radius) : hashContent(clipContent);
  const idSuffix = `${width}-${height}-${contentKey}`;
  const clipId = `${idPrefix}-clip-${idSuffix}`;
  const gradId = `${idPrefix}-grad-${idSuffix}`;
  const bandHeight = height + 12;
  const skewOffset = Math.ceil(bandHeight * 0.45);
  const endTranslate = width + 68 + skewOffset;
  const clipInner = clipContent ?? `<rect width="${width}" height="${height}" rx="${radius}" />`;
  LAZY_MARKUP.sheenBandStops ??= renderWhiteBandStops(SHEEN_BAND_STOPS);
  const clipDef = `<clipPath id="${clipId}">${clipInner}</clipPath><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">${LAZY_MARKUP.sheenBandStops}</linearGradient>`;
  const overlay = `<g clip-path="url(#${clipId})"><g><animateTransform attributeName="transform" type="translate" values="0 0;${endTranslate} 0;${endTranslate} 0" keyTimes="0;0.34;1" calcMode="spline" keySplines="0.42 0 0.25 1;0 0 1 1" dur="4s" repeatCount="indefinite" /><rect x="-52" y="-6" width="40" height="${bandHeight}" transform="skewX(-22)" fill="url(#${gradId})" /></g></g>`;
  return { clipDef, overlay };
}

/**
 * Render the compact single-line root `<svg>` document shared by every renderer.
 * @param options   Document size, accessible label, paint attributes, `<defs>`, and body markup.
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderSvgDocument(options: SvgDocumentOptions): string {
  const { height, width } = options;
  const viewBox = options.viewBox ?? `0 0 ${width} ${height}`;
  const paintAttrs = options.paintAttrs ?? 'fill="none"';
  const defsMarkup = options.defs ? `<defs>${options.defs}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" ${paintAttrs} role="img" aria-label="${escapeXml(options.ariaLabel)}">${defsMarkup}${options.body}</svg>`;
}
