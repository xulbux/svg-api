/**
 * Shared SVG primitives – XML escaping, numeric clamping, Kumo 3D top-edge crescent geometry, surface layers, gradient defs, and specular sheen overlays.
 */

import { BASE_DARK } from '@/config/theme';
import type { AnimationMode, ThemePalette, WidgetVariant } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Shared system sans-serif font stack used across badges, buttons, and quote cards. */
export const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Lookup table for single-pass XML character escaping. */
const XML_ENTITY_MAP: Readonly<Record<string, string>> = {
  '"': '&quot;',
  '&': '&amp;',
  "'": '&#039;',
  '<': '&lt;',
  '>': '&gt;',
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches any XML special character (`&`, `<`, `>`, `"`, `'`) in a single pass. */
const XML_SPECIAL_RX = /[&<>"']/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Map a single matched XML special character to its entity string. */
function replaceXmlChar(char: string): string {
  return XML_ENTITY_MAP[char] ?? char;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Clamp a numeric option to `[min, max]`, returning `fallback` when `value` is `undefined` or non-finite.
 * @param value      Candidate numeric value.
 * @param min        Minimum allowed value.
 * @param max        Maximum allowed value.
 * @param fallback   Fallback value when `value` is `undefined` or `NaN`.
 * @returns Clamped number.
 */
export function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamp and round an integer option to `[min, max]`, returning `fallback` when `value` is `undefined` or non-finite.
 * @param value      Candidate numeric value.
 * @param min        Minimum allowed integer.
 * @param max        Maximum allowed integer.
 * @param fallback   Fallback integer when `value` is `undefined` or `NaN`.
 * @returns Clamped integer.
 */
export function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Escape special characters (`&`, `<`, `>`, `"`, `'`) in a single pass for safe inclusion in SVG XML text and attributes.
 * @param unsafe   Raw unescaped string.
 * @returns XML-safe escaped string.
 */
export function escapeXml(unsafe: string): string {
  return unsafe.includes('&') ||
    unsafe.includes('<') ||
    unsafe.includes('>') ||
    unsafe.includes('"') ||
    unsafe.includes("'")
    ? unsafe.replace(XML_SPECIAL_RX, replaceXmlChar)
    : unsafe;
}

/**
 * Render the standard `<linearGradient id="bg-dark">` definition for dark-slate surfaces.
 * @param id   Optional custom gradient ID (defaults to `'bg-dark'`).
 * @returns `<linearGradient>` SVG string.
 */
export function renderDarkBgGradientDef(id = 'bg-dark'): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${BASE_DARK.bgTop}" /><stop offset="100%" stop-color="${BASE_DARK.bgBottom}" /></linearGradient>`;
}

/**
 * Render a vertical theme `<linearGradient>` definition (`palette.gradStart` -> `palette.gradEnd`).
 * @param id        Gradient element ID (e.g., `'grad-indigo'`).
 * @param palette   Resolved `ThemePalette`.
 * @returns `<linearGradient>` SVG string.
 */
export function renderThemeGradientDef(id: string, palette: ThemePalette): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${palette.gradStart}" /><stop offset="100%" stop-color="${palette.gradEnd}" /></linearGradient>`;
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
 * Render the unified 3-variant Cloudflare Kumo 3D rectangular/pill/tile surface, upper-edge crescent,
 * optional split divider, and outer border ring.
 * - `variant = '1'` (Primary): vivid brand gradient fill (`url(#${themeGradId})`) + `palette.emphasisBg` top crescent + `palette.emphasisRing` border.
 * - `variant = '2'` (Secondary): dark slate fill (`url(#bg-dark)`) + `palette.tintBg` overlay + `palette.borderColor` (`0.45`) top crescent + `palette.borderColor` border.
 * - `variant = '3'` (Tertiary): dark slate fill (`url(#bg-dark)`) + subtle `#ffffff` (`0.045`) top crescent + `BASE_DARK.borderNeutral` border.
 * @param x             Left X coordinate in pixels.
 * @param y             Top Y coordinate in pixels.
 * @param width         Box width in pixels.
 * @param height        Box height in pixels.
 * @param radius        Outer corner radius in pixels.
 * @param variant       Surface hierarchy tier (`'1'`, `'2'`, or `'3'`).
 * @param palette       Resolved `ThemePalette`.
 * @param themeGradId   ID of the `<linearGradient>` for `variant = '1'`.
 * @param splitLineX    Optional X coordinate for an internal vertical divider (used on split micro-buttons).
 * @returns Concatenated SVG surface, crescent, divider, and border `<rect>`/`<path>`/`<line>` elements.
 */
export function renderKumoBoxSurface(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  variant: WidgetVariant,
  palette: ThemePalette,
  themeGradId: string,
  splitLineX?: number
): string {
  const posAttr = x === 0 && y === 0 ? '' : `x="${x}" y="${y}" `;
  const borderX = x + 0.5;
  const borderY = y + 0.5;
  const innerWidth = width - 1;
  const innerHeight = height - 1;
  const innerRadius = radius - 0.5;
  const crescentD = buildTopCrescentPath(x, x + width, radius, true, y);

  if (variant === '1') {
    const gradientBody = `<rect ${posAttr}width="${width}" height="${height}" rx="${radius}" fill="url(#${themeGradId})" />`;
    const topCrescent = `<path d="${crescentD}" fill="${palette.emphasisBg}" />`;
    const splitDivider =
      splitLineX !== undefined
        ? `<line x1="${splitLineX}" y1="${y + 5}" x2="${splitLineX}" y2="${y + height - 5}" stroke="rgba(255,255,255,0.28)" stroke-width="1" />`
        : '';
    const outerRing = `<rect x="${borderX}" y="${borderY}" width="${innerWidth}" height="${innerHeight}" rx="${innerRadius}" stroke="${palette.emphasisRing}" stroke-width="1" />`;
    return `${gradientBody}${topCrescent}${splitDivider}${outerRing}`;
  }

  const darkBody = `<rect ${posAttr}width="${width}" height="${height}" rx="${radius}" fill="url(#bg-dark)" />`;

  if (variant === '2') {
    const tintBody = `<rect ${posAttr}width="${width}" height="${height}" rx="${radius}" fill="${palette.tintBg}" />`;
    const topCrescent = `<path d="${crescentD}" fill="${palette.borderColor}" fill-opacity="0.45" />`;
    const splitDivider =
      splitLineX !== undefined
        ? `<line x1="${splitLineX}" y1="${y}" x2="${splitLineX}" y2="${y + height}" stroke="${palette.borderColor}" stroke-width="1" />`
        : '';
    const outerRing = `<rect x="${borderX}" y="${borderY}" width="${innerWidth}" height="${innerHeight}" rx="${innerRadius}" stroke="${palette.borderColor}" stroke-width="1" />`;
    return `${darkBody}${tintBody}${topCrescent}${splitDivider}${outerRing}`;
  }

  const topCrescent = `<path d="${crescentD}" fill="#ffffff" fill-opacity="0.045" />`;
  const splitDivider =
    splitLineX !== undefined
      ? `<line x1="${splitLineX}" y1="${y + 4}" x2="${splitLineX}" y2="${y + height - 4}" stroke="${BASE_DARK.borderNeutral}" stroke-width="1" />`
      : '';
  const outerRing = `<rect x="${borderX}" y="${borderY}" width="${innerWidth}" height="${innerHeight}" rx="${innerRadius}" stroke="${BASE_DARK.borderNeutral}" stroke-width="1" />`;
  return `${darkBody}${topCrescent}${splitDivider}${outerRing}`;
}

/**
 * Render the optional periodic diagonal specular sheen overlay (`?anim=sheen`) for rectangular/pill surfaces and tile grids.
 * Accounts for the horizontal displacement of `skewX(-22)` (`tan(22°) ≈ 0.404`) over the full height so the
 * skewed highlight band completely clears the bottom-right corner before pausing.
 * @param animMode          Active animation mode.
 * @param totalWidth        Total SVG width in pixels.
 * @param height            Total SVG height in pixels.
 * @param radiusX           Outer corner radius in pixels (used when `customClipInner` is omitted).
 * @param idPrefix          Optional prefix for `<clipPath>` and `<linearGradient>` IDs (defaults to `'sheen'`).
 * @param customClipInner   Optional custom inner SVG elements for `<clipPath>` (e.g., multiple tile `<rect>`s).
 * @returns Object containing `clipDef` (for `<defs>`) and `overlay` (for the top SVG layer).
 */
export function renderSheenOverlay(
  animMode: AnimationMode,
  totalWidth: number,
  height: number,
  radiusX: number,
  idPrefix = 'sheen',
  customClipInner?: string
): { clipDef: string; overlay: string } {
  if (animMode !== 'sheen' && !animMode.startsWith('sheen,')) {
    return { clipDef: '', overlay: '' };
  }
  const clipId = `${idPrefix}-clip-${totalWidth}-${height}`;
  const gradId = `${idPrefix}-grad-${totalWidth}-${height}`;
  const bandHeight = height + 12;
  const skewOffset = Math.ceil(bandHeight * 0.45);
  const endTranslate = totalWidth + 68 + skewOffset;
  const clipContent =
    customClipInner ?? `<rect width="${totalWidth}" height="${height}" rx="${radiusX}" />`;
  const clipDef =
    `<clipPath id="${clipId}">${clipContent}</clipPath>` +
    `<linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0" />` +
    `<stop offset="28%" stop-color="#ffffff" stop-opacity="0.06" />` +
    `<stop offset="50%" stop-color="#ffffff" stop-opacity="0.28" />` +
    `<stop offset="72%" stop-color="#ffffff" stop-opacity="0.06" />` +
    `<stop offset="100%" stop-color="#ffffff" stop-opacity="0" />` +
    `</linearGradient>`;
  const overlay = `<g clip-path="url(#${clipId})"><g><animateTransform attributeName="transform" type="translate" values="0 0;${endTranslate} 0;${endTranslate} 0" keyTimes="0;0.34;1" calcMode="spline" keySplines="0.42 0 0.25 1;0 0 1 1" dur="4s" repeatCount="indefinite" /><rect x="-52" y="-6" width="40" height="${bandHeight}" transform="skewX(-22)" fill="url(#${gradId})" /></g></g>`;
  return { clipDef, overlay };
}
