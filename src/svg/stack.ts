/**
 * Tech Stack Renderer
 *
 * Renders single or multi-group grids of Kumo 3D icon tiles.
 */

import { WHITE } from '@/config/palette';
import { resolveStackBrandColor, resolveStackIconTitle } from '@/config/stack';
import { DEFAULT_THEME_COLOR, resolveOptionalColor, THEMES } from '@/config/theme';
import { LIST_SEPARATOR_RX } from '@/site/shared/encoding';
import { splitStackTileColor, STACK_PER_LINE_RANGE } from '@/site/shared/stackDsl';
import {
  DEFAULT_ICON_SLUG,
  MAX_ICON_SLUG_LENGTH,
  PLACEHOLDER_BORDER_OPACITY,
  formatSlugTitle,
  normalizeIconSlug,
  resolveIconLookup,
  resolveStackPlaceholderIcon,
} from '@/svg/icons';
import {
  BRAND_SLUG_CLEAN_RX,
  buildIconBodyId,
  clampInt,
  escapeXml,
  isSheenMode,
  prepareDisplayText,
  renderIconGroup,
  renderInsetRingRect,
  renderKumoBoxSurface,
  renderSheenOverlay,
  renderSurfaceGradientDefs,
  renderSvgDocument,
  resolveForegroundPaint,
  roundCoord,
  roundScale,
  roundTenths,
} from '@/svg/shared';
import type {
  BadgeVariant,
  NumericRange,
  ResolvedIcon,
  StackAnimationMode,
  StackGroup,
  StackRenderOptions,
  StackTileMotion,
  ThemeColorName,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** A single resolved stack tile. */
interface StackTile {
  /** Resolved theme color for this tile (per-tile override, curated meta, brand color, or fallback). */
  color: ThemeColorName;
  /** Inline `@<color>` override on this tile (`undefined` when none). */
  colorOverride: ThemeColorName | undefined;
  /** Resolved icon data (`undefined` for unknown slugs, which render the stack fallback icon). */
  data: ResolvedIcon | undefined;
  /** Raw, unescaped display title (tile `<title>` tooltip and `aria-label` entry). */
  title: string;
}

/** Computed pixel dimensions and layout metadata for a single resolved `StackGroup`. */
interface MeasuredStackGroup {
  /** Number of columns in this group (`Math.min(tiles.length, perLine)`). */
  cols: number;
  /** Total height of this group in pixels (`rows * tileSize + (rows - 1) * gap`). */
  height: number;
  /** Effective maximum tiles per line for this group. */
  perLine: number;
  /** Number of rows in this group (`Math.ceil(tiles.length / perLine)`). */
  rows: number;
  /** Validated tiles in this group. */
  tiles: StackTile[];
  /** Total width of this group in pixels (`cols * tileSize + (cols - 1) * gap`). */
  width: number;
}

/** Computed pixel dimensions for a horizontal band of one or more side-by-side `MeasuredStackGroup`s. */
interface MeasuredStackBand {
  /** Side-by-side measured groups in this horizontal band. */
  groups: MeasuredStackGroup[];
  /** Maximum group height in this horizontal band in pixels. */
  height: number;
  /** Sum of group widths plus `(groups.length - 1) * groupGap` in pixels. */
  width: number;
}

/** Measured bands plus the flat list of rendered tile titles. */
interface MeasuredStackLayout {
  /** Every rendered tile title in reading order (for the `aria-label`). */
  allTitles: string[];
  /** Measured horizontal bands, top to bottom. */
  bands: MeasuredStackBand[];
}

/** Grid spacing used while measuring bands. */
interface StackSpacing {
  /** Default maximum tiles per line for groups without their own `perLine`. */
  defaultPerLine: number;
  /** Intra-group gap between adjacent tiles in pixels. */
  gap: number;
  /** Inter-group gap between side-by-side groups and vertical bands in pixels. */
  groupGap: number;
  /** Tile width and height in pixels. */
  tileSize: number;
}

/** Shared per-render state for drawing stack tiles. */
interface StackTileContext {
  /** Optional uniform theme color override. */
  colorOverride: ThemeColorName | undefined;
  /** Whether at least one non-fallback Kumo surface tile was rendered. */
  hasFilledTile: boolean;
  /** Content-addressed `<defs>` IDs of every icon body emitted so far (collected while rendering). */
  iconBodyIds: Set<string>;
  /** Summed `innerSvg` length in UTF-16 code units of all collected icon bodies. */
  iconBodyLength: number;
  /** `<defs>` markup of the collected icon bodies (each body is emitted exactly once). */
  iconDefs: string;
  /** Scale factor from the `24x24` icon box to the rendered icon size. */
  iconScale: number;
  /** Rendered icon size in pixels. */
  iconSize: number;
  /** Tile corner radius in pixels. */
  radius: number;
  /** Grid step pitch (`tileSize + gap`) in pixels used for staggered motion delays. */
  stepPitch: number;
  /** Active per-tile motion mode. */
  tileMotion: StackTileMotion;
  /** Tile width and height in pixels. */
  tileSize: number;
  /** Primary theme colors whose `<linearGradient>` must be emitted (collected while rendering). */
  usedPrimaryColors: Set<ThemeColorName>;
  /** Tile surface variant. */
  variant: BadgeVariant;
}

/** Icon drawn on a stack tile and the `<defs>` ID of its body. */
interface StackTileIcon {
  /** Content-addressed `<defs>` ID of the icon body (`stack-icon-<hash>`). */
  bodyId: string;
  /** Resolved icon data (bounds, type, and body). */
  data: ResolvedIcon;
  /** Whether the tile is rendering the fallback icon (unknown slug or body budget exceeded). */
  isFallback: boolean;
}

/** Rendered SVG markup and fallback status of a single stack tile. */
interface RenderedStackTile {
  /** Whether the tile rendered the hollow fallback placeholder frame instead of a Kumo surface. */
  isFallback: boolean;
  /** Rendered `<g>` tile markup. */
  markup: string;
}

/** Accumulated tile markup and sheen clip-path `<rect>` fragments across all measured stack bands. */
interface RenderedStackBands {
  /** Sheen `<clipPath>` `<rect>` elements for non-fallback tiles (`''` when sheen is inactive). */
  clipRects: string;
  /** Rendered `<g>` tile elements across all bands and groups. */
  tilesMarkup: string;
}

/** Icon list and optional `:N` column suffix of a single group token. */
interface GroupTokenParts {
  /** Comma/whitespace-separated icon list part. */
  iconList: string;
  /** Inline `perLine` override from a trailing `:N` suffix. */
  perLine: number | undefined;
}

/** Icon slug and optional `@<color>` override of a single tile token. */
interface TileTokenParts {
  /** Inline per-tile theme color override from an `@<color>` suffix. */
  colorOverride: ThemeColorName | undefined;
  /** Raw icon slug part before `@<color>`. */
  slug: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Tile width and height bounds in pixels. */
export const STACK_TILE_SIZE_RANGE: NumericRange = { default: 42, max: 96, min: 24 };

/** Intra-group gap bounds in pixels between adjacent stack tiles. */
export const STACK_GAP_RANGE: NumericRange = { default: 8, max: 24, min: 2 };

/** Inter-group gap bounds in pixels between distinct groups (defaults to `round(gap * GROUP_GAP_RATIO)`, clamped). */
export const STACK_GROUP_GAP_RANGE: NumericRange = { default: 26, max: 64, min: 8 };

/** Ratio of the default inter-group gap to the intra-group gap. */
export const GROUP_GAP_RATIO = 3.25;

/** Default visual hierarchy variant for tech stack grids. */
export const DEFAULT_STACK_VARIANT: BadgeVariant = '2';

/** Maximum total icons rendered across an entire stack SVG. */
const MAX_STACK_ICONS = 128;

/**
 * Maximum summed length in UTF-16 code units of the unique icon bodies in one stack; Further unique icons render the fallback icon.
 * Repeated icons are referenced via `<use>`, so this only caps pathological mixes of the largest brand bodies (up to ~54k code units each).
 */
const MAX_STACK_ICON_BODY_LENGTH = 400_000;

/** Maximum length of a tile `<title>` derived from an uncurated slug. */
const MAX_TILE_TITLE_LENGTH = 64;

/** Maximum length of a single tile token (`<slug>@<color>`) in characters. */
const MAX_STACK_TOKEN_LENGTH = MAX_ICON_SLUG_LENGTH + 16;

/** Theme color of uncurated stack icons without a uniform color override. */
const DEFAULT_STACK_ICON_COLOR: ThemeColorName = DEFAULT_THEME_COLOR;

/** Prefix of the content-addressed stack icon body IDs (`stack-icon-<hash>`). */
const STACK_ICON_ID_PREFIX = 'stack-icon';

/** Stroke width of stroked icons on stack tiles in `24x24` icon units. */
const STACK_ICON_STROKE_WIDTH = 2.1;

/** Cycle duration in seconds for staggered `'wave'` and `'pulse'` tile animations. */
const STACK_WAVE_CYCLE_SECONDS = 2.8;

/** Cycle duration in seconds for continuous staggered `'float'` tile animations. */
const STACK_FLOAT_CYCLE_SECONDS = 3.6;

/** Per-step stagger offset in seconds for `'wave'` and `'pulse'` tile animations. */
const STACK_WAVE_STEP_SECONDS = 0.12;

/** Per-step phase offset in seconds for continuous `'float'` tile animations. */
const STACK_FLOAT_STEP_SECONDS = 0.45;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a string consisting only of ASCII digits. */
const DIGITS_ONLY_RX = /^\d+$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Split an optional `@<color>` suffix off a tile token (e.g., `rust@amber` or `cpu@emerald`). */
function splitTileToken(token: string): TileTokenParts {
  const { colorSuffix, slug } = splitStackTileColor(token);
  return {
    colorOverride: colorSuffix === undefined ? undefined : resolveOptionalColor(colorSuffix),
    slug,
  };
}

/** Resolve the stack tile theme color for a canonical icon key. */
function resolveBrandColorFromKey(canonicalKey: string): ThemeColorName {
  return (
    resolveStackBrandColor(canonicalKey.replace(BRAND_SLUG_CLEAN_RX, '')) ??
    DEFAULT_STACK_ICON_COLOR
  );
}

/** Split an optional trailing `:<perLine>` suffix off a group token (e.g., `figma,ai,ps:3`). */
function splitGroupToken(token: string): GroupTokenParts {
  const colonIndex = token.lastIndexOf(':');
  const suffix = colonIndex > 0 ? token.slice(colonIndex + 1) : '';
  if (!DIGITS_ONLY_RX.test(suffix)) {
    return { iconList: token, perLine: undefined };
  }
  return { iconList: token.slice(0, colonIndex), perLine: Number(suffix) };
}

/**
 * Parse a single group token (`icon1,icon2:6`)
 * and return its cleaned icon list (tokens capped at `MAX_STACK_TOKEN_LENGTH`) and optional `perLine` override.
 */
function parseSingleGroupToken(
  rawGroup: string,
  fallbackPerLine: number | undefined,
  remainingBudget: number
): StackGroup | undefined {
  const trimmed = rawGroup.trim();
  if (!trimmed || remainingBudget <= 0) {
    return undefined;
  }

  const { iconList, perLine } = splitGroupToken(trimmed);
  const slugs: string[] = [];
  for (const part of iconList.split(LIST_SEPARATOR_RX)) {
    if (slugs.length >= remainingBudget) {
      break;
    }
    const clean = part.trim().toLowerCase();
    if (clean.length > 0) {
      slugs.push(clean.slice(0, MAX_STACK_TOKEN_LENGTH));
    }
  }

  if (slugs.length === 0) {
    return undefined;
  }

  return { icons: slugs, perLine: perLine ?? fallbackPerLine };
}

/** Resolve a requested tile token (`<slug>` or `<slug>@<color>`) into a stack tile (`undefined` for blank slugs). */
function buildStackTile(rawToken: string): StackTile | undefined {
  const { colorOverride, slug } = splitTileToken(rawToken);
  const lookup = resolveIconLookup(slug, true);
  if (lookup.key.length === 0) {
    return undefined;
  }
  const cleanKey = lookup.key.replace(BRAND_SLUG_CLEAN_RX, '');
  const color = resolveBrandColorFromKey(lookup.key);
  const title =
    resolveStackIconTitle(cleanKey) ??
    prepareDisplayText(formatSlugTitle(slug.slice(0, MAX_ICON_SLUG_LENGTH)), MAX_TILE_TITLE_LENGTH);
  return { color, colorOverride, data: lookup.data, title };
}

/** Measure `StackGroup` bands into pixel dimensions, capping the total tile count at `MAX_STACK_ICONS`. */
function buildMeasuredBands(
  rawBands: readonly StackGroup[][],
  spacing: StackSpacing
): MeasuredStackLayout {
  const { defaultPerLine, gap, groupGap, tileSize } = spacing;
  const allTitles: string[] = [];
  const bands: MeasuredStackBand[] = [];

  for (const rawBand of rawBands) {
    const measuredGroups: MeasuredStackGroup[] = [];
    for (const rawGroup of rawBand) {
      const tiles: StackTile[] = [];
      for (const slug of rawGroup.icons) {
        // Check the cap first so over-long icon lists are never normalized or resolved:
        if (allTitles.length >= MAX_STACK_ICONS) {
          break;
        }
        const tile = buildStackTile(slug);
        if (tile) {
          tiles.push(tile);
          allTitles.push(tile.title);
        }
      }
      if (tiles.length > 0) {
        const groupPerLine = clampInt(rawGroup.perLine, STACK_PER_LINE_RANGE, defaultPerLine);
        const cols = Math.min(tiles.length, groupPerLine);
        const rows = Math.ceil(tiles.length / groupPerLine);
        measuredGroups.push({
          cols,
          height: rows * tileSize + (rows - 1) * gap,
          perLine: groupPerLine,
          rows,
          tiles,
          width: cols * tileSize + (cols - 1) * gap,
        });
      }
    }

    if (measuredGroups.length > 0) {
      let bandWidth = 0;
      let bandHeight = 0;
      for (const [i, measuredGroup] of measuredGroups.entries()) {
        bandWidth += measuredGroup.width + (i > 0 ? groupGap : 0);
        if (measuredGroup.height > bandHeight) {
          bandHeight = measuredGroup.height;
        }
      }
      bands.push({ groups: measuredGroups, height: bandHeight, width: bandWidth });
    }
  }

  const defaultTile = bands.length === 0 ? buildStackTile(DEFAULT_ICON_SLUG) : undefined;
  if (defaultTile) {
    allTitles.push(defaultTile.title);
    bands.push({
      groups: [
        {
          cols: 1,
          height: tileSize,
          perLine: defaultPerLine,
          rows: 1,
          tiles: [defaultTile],
          width: tileSize,
        },
      ],
      height: tileSize,
      width: tileSize,
    });
  }

  return { allTitles, bands };
}

/**
 * Register a tile's icon body once in the shared `<defs>` under its content-addressed ID,
 * switching to the fallback icon for unknown slugs and once the unique-body length budget (`MAX_STACK_ICON_BODY_LENGTH`) is spent.
 */
function resolveStackTileIcon(tile: StackTile, context: StackTileContext): StackTileIcon {
  let isFallback = tile.data === undefined;
  let data = tile.data ?? resolveStackPlaceholderIcon();
  let bodyId = buildIconBodyId(data, STACK_ICON_ID_PREFIX);
  if (context.iconBodyIds.has(bodyId)) {
    return { bodyId, data, isFallback };
  }
  if (context.iconBodyLength + data.innerSvg.length > MAX_STACK_ICON_BODY_LENGTH) {
    isFallback = true;
    data = resolveStackPlaceholderIcon();
    bodyId = buildIconBodyId(data, STACK_ICON_ID_PREFIX);
    if (context.iconBodyIds.has(bodyId)) {
      return { bodyId, data, isFallback };
    }
  }
  context.iconBodyIds.add(bodyId);
  context.iconBodyLength += data.innerSvg.length;
  context.iconDefs += `<g id="${bodyId}">${data.innerSvg}</g>`;
  return { bodyId, data, isFallback };
}

/** Extract the active per-tile motion token from a `StackAnimationMode`. */
function resolveStackTileMotion(animMode: StackAnimationMode): StackTileMotion {
  const motionPart = animMode.startsWith('sheen,') ? animMode.slice(6) : animMode;
  if (motionPart === 'wave' || motionPart === 'float' || motionPart === 'pulse') {
    return motionPart;
  }
  return motionPart === 'none' ? 'none' : 'default';
}

/** Build the optional `<animateTransform>` vertical translation markup for `'wave'` or `'float'` at `(tileX, tileY)`. */
function buildTileTranslateAnimation(tileMotion: StackTileMotion, diagonalStep: number): string {
  if (tileMotion === 'wave') {
    const beginSec = roundCoord(
      (diagonalStep * STACK_WAVE_STEP_SECONDS) % STACK_WAVE_CYCLE_SECONDS
    );
    return `<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0;0 0" keyTimes="0;0.18;0.38;1" calcMode="spline" keySplines="0.33 0 0.2 1;0.4 0 0.2 1;0 0 1 1" dur="${STACK_WAVE_CYCLE_SECONDS}s" begin="${beginSec}s" repeatCount="indefinite" />`;
  }
  if (tileMotion === 'float') {
    const phaseSec = roundCoord(
      (diagonalStep * STACK_FLOAT_STEP_SECONDS) % STACK_FLOAT_CYCLE_SECONDS
    );
    const beginAttr = phaseSec === 0 ? '0s' : `-${phaseSec}s`;
    return `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0;0 2;0 0" keyTimes="0;0.25;0.5;0.75;1" calcMode="spline" keySplines="0.36 0.66 0.64 1;0.36 0 0.64 0.34;0.36 0.66 0.64 1;0.36 0 0.64 0.34" dur="${STACK_FLOAT_CYCLE_SECONDS}s" begin="${beginAttr}" repeatCount="indefinite" />`;
  }
  return '';
}

/** Wrap a `24x24` `<use>` icon reference in a staggered scale pulse around `(iconCenterX, 12)` when `tileMotion === 'pulse'`. */
function wrapTileIconUse(
  bodyId: string,
  iconData: ResolvedIcon,
  tileMotion: StackTileMotion,
  diagonalStep: number
): string {
  const useMarkup = `<use href="#${bodyId}" />`;
  if (tileMotion !== 'pulse') {
    return useMarkup;
  }
  const beginSec = roundCoord((diagonalStep * STACK_WAVE_STEP_SECONDS) % STACK_WAVE_CYCLE_SECONDS);
  const iconCenterX = roundCoord((iconData.minX + iconData.maxX) / 2);
  return `<g transform="translate(${iconCenterX}, 12)"><g><animateTransform attributeName="transform" type="scale" values="1;1.15;1;1" keyTimes="0;0.18;0.42;1" calcMode="spline" keySplines="0.33 0 0.2 1;0.4 0 0.2 1;0 0 1 1" dur="${STACK_WAVE_CYCLE_SECONDS}s" begin="${beginSec}s" repeatCount="indefinite" /><g transform="translate(${-iconCenterX}, -12)">${useMarkup}</g></g></g>`;
}

/**
 * Render a single Kumo 3D stack tile `<g>` with its `<title>` tooltip, surface layers, and an icon centered
 * by its visible bounds (unknown/fallback tiles draw a hollow transparent frame with a translucent red stroke and standalone red `!` icon).
 */
function renderSingleStackTile(
  tile: StackTile,
  tileX: number,
  tileY: number,
  translateAnimation: string,
  diagonalStep: number,
  context: StackTileContext
): RenderedStackTile {
  const { iconScale, iconSize, radius, tileMotion, tileSize, variant } = context;
  const icon = resolveStackTileIcon(tile, context);
  // Center the icon's visible ink (not its `24x24` box) horizontally inside the tile:
  const visualCenterX = ((icon.data.minX + icon.data.maxX) / 2) * iconScale;
  const iconX = roundCoord(tileX + tileSize / 2 - visualCenterX);
  const iconY = roundCoord(tileY + (tileSize - iconSize) / 2);
  const iconTransform =
    iconScale === 1
      ? `translate(${iconX}, ${iconY})`
      : `translate(${iconX}, ${iconY}) scale(${iconScale})`;
  const innerUseMarkup = wrapTileIconUse(icon.bodyId, icon.data, tileMotion, diagonalStep);

  if (icon.isFallback) {
    const placeholderColor = THEMES.red.iconColor;
    const hollowFrame = renderInsetRingRect(
      tileX,
      tileY,
      tileSize,
      tileSize,
      radius,
      `stroke="${placeholderColor}" stroke-opacity="${PLACEHOLDER_BORDER_OPACITY}"`
    );
    const placeholderIcon = renderIconGroup({
      color: placeholderColor,
      innerSvg: innerUseMarkup,
      strokeWidth: STACK_ICON_STROKE_WIDTH,
      transform: iconTransform,
      type: icon.data.type,
    });
    return {
      isFallback: true,
      markup: `<g><title>${escapeXml(tile.title)}</title>${translateAnimation}${hollowFrame}${placeholderIcon}</g>`,
    };
  }

  context.hasFilledTile = true;
  const themeColor = tile.colorOverride ?? context.colorOverride ?? tile.color;
  const isOnPrimary = variant === '1';
  if (isOnPrimary) {
    context.usedPrimaryColors.add(themeColor);
  }
  const surfaceMarkup = renderKumoBoxSurface({
    boxX: tileX,
    boxY: tileY,
    color: themeColor,
    height: tileSize,
    radius,
    variant,
    width: tileSize,
  });
  let pulseGlowMarkup = '';
  if (tileMotion === 'pulse') {
    const beginSec = roundCoord(
      (diagonalStep * STACK_WAVE_STEP_SECONDS) % STACK_WAVE_CYCLE_SECONDS
    );
    const pulseGlowColor = isOnPrimary ? WHITE : THEMES[themeColor].iconColor;
    pulseGlowMarkup = `<rect x="${roundCoord(tileX + 1)}" y="${roundCoord(tileY + 1)}" width="${tileSize - 2}" height="${tileSize - 2}" rx="${Math.max(1, radius - 1)}" fill="${pulseGlowColor}" opacity="0"><animate attributeName="opacity" values="0;0.14;0;0" keyTimes="0;0.18;0.42;1" calcMode="spline" keySplines="0.33 0 0.2 1;0.4 0 0.2 1;0 0 1 1" dur="${STACK_WAVE_CYCLE_SECONDS}s" begin="${beginSec}s" repeatCount="indefinite" /></rect>`;
  }
  const iconPaint = resolveForegroundPaint(isOnPrimary, THEMES[themeColor].iconColor);
  const iconMarkup = renderIconGroup({
    color: iconPaint.color,
    hasCurrentColor: icon.data.hasCurrentColor,
    innerSvg: innerUseMarkup,
    opacity: iconPaint.opacity,
    strokeWidth: STACK_ICON_STROKE_WIDTH,
    transform: iconTransform,
    type: icon.data.type,
  });

  return {
    isFallback: false,
    markup: `<g><title>${escapeXml(tile.title)}</title>${translateAnimation}${surfaceMarkup}${pulseGlowMarkup}${iconMarkup}</g>`,
  };
}

/** Render every measured band's tile groups and optional sheen clip-path rectangles. */
function renderStackBands(
  bands: readonly MeasuredStackBand[],
  totalWidth: number,
  groupGap: number,
  hasSheen: boolean,
  tileContext: StackTileContext
): RenderedStackBands {
  const { radius, stepPitch, tileMotion, tileSize } = tileContext;
  let tilesMarkup = '';
  let clipRects = '';
  let bandOriginY = 0;

  for (const band of bands) {
    let groupOriginX = roundTenths((totalWidth - band.width) / 2);

    for (const group of band.groups) {
      const groupOriginY = bandOriginY + roundTenths((band.height - group.height) / 2);

      for (const [i, tile] of group.tiles.entries()) {
        const rowIndex = Math.floor(i / group.perLine);
        const columnIndex = i % group.perLine;
        const rowCount = Math.min(group.perLine, group.tiles.length - rowIndex * group.perLine);
        const rowOffsetX =
          group.rows > 1 ? roundTenths(((group.cols - rowCount) * stepPitch) / 2) : 0;

        const tileX = roundTenths(groupOriginX + rowOffsetX + columnIndex * stepPitch);
        const tileY = roundTenths(groupOriginY + rowIndex * stepPitch);
        const diagonalStep = (tileX + tileY) / stepPitch;
        const translateAnimation = buildTileTranslateAnimation(tileMotion, diagonalStep);

        const renderedTile = renderSingleStackTile(
          tile,
          tileX,
          tileY,
          translateAnimation,
          diagonalStep,
          tileContext
        );
        tilesMarkup += renderedTile.markup;

        if (hasSheen && !renderedTile.isFallback) {
          clipRects += translateAnimation
            ? `<rect x="${tileX}" y="${tileY}" width="${tileSize}" height="${tileSize}" rx="${radius}">${translateAnimation}</rect>`
            : `<rect x="${tileX}" y="${tileY}" width="${tileSize}" height="${tileSize}" rx="${radius}" />`;
        }
      }

      groupOriginX = roundTenths(groupOriginX + group.width + groupGap);
    }

    bandOriginY = roundTenths(bandOriginY + band.height + groupGap);
  }

  return { clipRects, tilesMarkup };
}

// -------------------------------------- PUBLIC API -------------------------------------

export { STACK_PER_LINE_RANGE } from '@/site/shared/stackDsl';

/**
 * Resolve the default inter-group gap in pixels for a given intra-group `gap` (clamped to `STACK_GROUP_GAP_RANGE`).
 * @param gap   Effective intra-group gap in pixels.
 * @returns Default inter-group gap in pixels.
 */
export function resolveDefaultStackGroupGap(gap: number): number {
  return clampInt(undefined, STACK_GROUP_GAP_RANGE, Math.round(gap * GROUP_GAP_RATIO));
}

/**
 * Resolve the semantic Tailwind v4 theme color for a tech stack icon slug or `<slug>@<color>` token.
 * @param slug       Raw or canonical icon slug (e.g., `'rust'`, `'py'`, `'ts'`, `'cpu@emerald'`).
 * @param fallback   Optional explicit theme color override.
 * @returns The resolved `ThemeColorName` (`DEFAULT_THEME_COLOR` for uncurated non-brand slugs).
 */
export function resolveStackIconColor(slug: string, fallback?: ThemeColorName): ThemeColorName {
  const { colorOverride, slug: cleanSlug } = splitTileToken(slug);
  if (colorOverride) {
    return colorOverride;
  }
  if (fallback) {
    return fallback;
  }
  return resolveBrandColorFromKey(normalizeIconSlug(cleanSlug, true));
}

/**
 * Parse a raw stack DSL string into a 2D array of `StackGroup` bands.
 * - `;` separates vertical group rows (bands stacked top-to-bottom).
 * - `|` separates side-by-side groups placed on the same horizontal band.
 * - `:N` at the end of a group specifies that group's `perLine` column limit (e.g., `figma,ai,blender,ps,pr,ae:3`).
 * - `perLineList` optionally supplies per-group `perLine` values by group index (e.g., `8,6,6,4,3,3`).
 * @param rawInput      Raw decoded stack path/query string.
 * @param perLineList   Optional positional array of per-group `perLine` numbers (`undefined` holes use the default).
 * @returns 2D array of `StackGroup` bands (`StackGroup[][]`).
 */
export function parseStackGroups(
  rawInput: string,
  perLineList?: readonly (number | undefined)[]
): StackGroup[][] {
  const bands: StackGroup[][] = [];
  let totalIcons = 0;
  let groupIndex = 0;

  for (const bandSegment of rawInput.split(';')) {
    if (totalIcons >= MAX_STACK_ICONS) {
      break;
    }
    const trimmedBand = bandSegment.trim();
    if (trimmedBand.length > 0) {
      const bandGroups: StackGroup[] = [];
      for (const groupSegment of trimmedBand.split('|')) {
        if (totalIcons >= MAX_STACK_ICONS) {
          break;
        }
        const fallbackPerLine =
          perLineList && perLineList.length > 0
            ? perLineList[Math.min(groupIndex, perLineList.length - 1)]
            : undefined;
        const parsedGroup = parseSingleGroupToken(
          groupSegment,
          fallbackPerLine,
          MAX_STACK_ICONS - totalIcons
        );
        if (parsedGroup) {
          bandGroups.push(parsedGroup);
          totalIcons += parsedGroup.icons.length;
          groupIndex += 1;
        }
      }
      if (bandGroups.length > 0) {
        bands.push(bandGroups);
      }
    }
  }

  return bands;
}

/**
 * Render a standalone SVG tech stack icon row, grid, or multi-group layout.
 * @param options   Stack grid rendering configuration.
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderStack(options: StackRenderOptions): string {
  const tileSize = clampInt(options.size, STACK_TILE_SIZE_RANGE);
  const gap = clampInt(options.gap, STACK_GAP_RANGE);
  const groupGap = clampInt(
    options.groupGap,
    STACK_GROUP_GAP_RANGE,
    resolveDefaultStackGroupGap(gap)
  );
  const defaultPerLine = clampInt(options.perLine, STACK_PER_LINE_RANGE);
  const variant: BadgeVariant = options.variant ?? DEFAULT_STACK_VARIANT;
  const animMode: StackAnimationMode = options.anim ?? 'default';
  const tileMotion = resolveStackTileMotion(animMode);
  const hasSheen = isSheenMode(animMode);

  const rawBands =
    options.groups && options.groups.length > 0
      ? options.groups
      : parseStackGroups((options.icons ?? []).join(','));
  const { allTitles, bands } = buildMeasuredBands(rawBands, {
    defaultPerLine,
    gap,
    groupGap,
    tileSize,
  });

  let totalWidth = 0;
  let totalHeight = 0;
  for (let i = 0; i < bands.length; i += 1) {
    const band = bands[i];
    if (band) {
      totalWidth = Math.max(totalWidth, band.width);
      totalHeight += band.height + (i > 0 ? groupGap : 0);
    }
  }

  const radius = Math.max(5, Math.round(tileSize * 0.24));
  const iconSize = Math.round(tileSize * (24 / 42));
  const stepPitch = tileSize + gap;
  const tileContext: StackTileContext = {
    colorOverride: options.color,
    hasFilledTile: false,
    iconBodyIds: new Set<string>(),
    iconBodyLength: 0,
    iconDefs: '',
    iconScale: roundScale(iconSize / 24),
    iconSize,
    radius,
    stepPitch,
    tileMotion,
    tileSize,
    usedPrimaryColors: new Set<ThemeColorName>(),
    variant,
  };

  const { clipRects, tilesMarkup } = renderStackBands(
    bands,
    totalWidth,
    groupGap,
    hasSheen,
    tileContext
  );

  let padY = 0;
  if (tileMotion === 'wave') {
    padY = 3;
  } else if (tileMotion === 'float') {
    padY = 2;
  }
  const svgHeight = totalHeight + padY * 2;
  const viewBox = padY > 0 ? `0 ${-padY} ${totalWidth} ${svgHeight}` : undefined;

  const gradientDefs = renderSurfaceGradientDefs(
    variant !== '1' && tileContext.hasFilledTile,
    tileContext.usedPrimaryColors
  );
  const sheen =
    clipRects.length === 0
      ? { clipDef: '', overlay: '' }
      : renderSheenOverlay({
          animMode,
          clipContent: clipRects,
          height: svgHeight,
          idPrefix: 'stack-sheen',
          radius,
          width: totalWidth,
        });

  return renderSvgDocument({
    ariaLabel: `tech stack: ${allTitles.join(', ')}`,
    body: `${tilesMarkup}${sheen.overlay}`,
    defs: `${gradientDefs}${tileContext.iconDefs}${sheen.clipDef}`,
    height: svgHeight,
    viewBox,
    width: totalWidth,
  });
}
