/**
 * Tech stack renderer – Renders single or multi-group grids of Kumo 3D icon tiles (`svg.xul.is/stack/:icons`).
 */

import { THEMES } from '@/config/theme';
import type {
  AnimationMode,
  StackGroup,
  StackRenderOptions,
  ThemeColorName,
  WidgetVariant,
} from '@/types';
import { resolveIcon, resolveStackIconColor, resolveStackIconTitle } from './icons';
import {
  clampInt,
  escapeXml,
  renderDarkBgGradientDef,
  renderKumoBoxSurface,
  renderSheenOverlay,
  renderThemeGradientDef,
} from './shared';

// ---------------------------------------- TYPES ----------------------------------------

/** Computed pixel dimensions and layout metadata for a single resolved `StackGroup`. */
interface MeasuredStackGroup {
  /** Number of columns in this group (`Math.min(icons.length, perLine)`). */
  cols: number;
  /** Total pixel height of this group (`rows * tileSize + (rows - 1) * gap`). */
  height: number;
  /** Validated lowercase icon slugs in this group. */
  icons: string[];
  /** Effective maximum tiles per line for this group. */
  perLine: number;
  /** Number of rows in this group (`Math.ceil(icons.length / perLine)`). */
  rows: number;
  /** Total pixel width of this group (`cols * tileSize + (cols - 1) * gap`). */
  width: number;
}

/** Computed pixel dimensions for a horizontal band of one or more side-by-side `MeasuredStackGroup`s. */
interface MeasuredStackBand {
  /** Side-by-side measured groups in this horizontal band. */
  groups: MeasuredStackGroup[];
  /** Maximum group height in this horizontal band. */
  height: number;
  /** Sum of group widths plus `(groups.length - 1) * groupGap`. */
  width: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default tile width and height in pixels for `/stack/:icons`. */
const DEFAULT_STACK_TILE_SIZE = 42;

/** Minimum allowed tile size in pixels. */
const MIN_STACK_TILE_SIZE = 24;

/** Maximum allowed tile size in pixels. */
const MAX_STACK_TILE_SIZE = 96;

/** Default intra-group gap in pixels between adjacent stack tiles. */
const DEFAULT_STACK_GAP = 8;

/** Minimum allowed intra-group gap in pixels between stack tiles. */
const MIN_STACK_GAP = 2;

/** Maximum allowed intra-group gap in pixels between stack tiles. */
const MAX_STACK_GAP = 24;

/** Minimum allowed inter-group gap in pixels between distinct groups. */
const MIN_STACK_GROUP_GAP = 8;

/** Maximum allowed inter-group gap in pixels between distinct groups. */
const MAX_STACK_GROUP_GAP = 64;

/** Default maximum number of tiles per row when not specified per group. */
const DEFAULT_STACK_PER_LINE = 8;

/** Minimum allowed tiles per row. */
const MIN_STACK_PER_LINE = 1;

/** Maximum allowed tiles per row. */
const MAX_STACK_PER_LINE = 20;

/** Maximum total icons rendered across an entire stack SVG. */
const MAX_STACK_ICONS = 128;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches comma or whitespace separators between icon slugs inside a group. */
const SLUG_SPLIT_RX = /[,\s]+/;

/** Matches an optional trailing `:<perLine>` suffix at the end of a group specification (e.g., `figma,ai,ps:3`). */
const GROUP_PER_LINE_SUFFIX_RX = /^(?<list>[\s\S]+?):(?<cols>\d+)$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Parse a single group token (`icon1,icon2:6`) and return its cleaned icon list and optional `perLine` override. */
function parseSingleGroupToken(
  rawGroup: string,
  fallbackPerLine: number | undefined,
  remainingBudget: number
): StackGroup | undefined {
  const trimmed = rawGroup.trim();
  if (!trimmed || remainingBudget <= 0) {
    return undefined;
  }

  const suffixMatch = GROUP_PER_LINE_SUFFIX_RX.exec(trimmed);
  const iconListPart = suffixMatch?.groups?.list ?? trimmed;
  const inlinePerLine = suffixMatch?.groups?.cols ? Number(suffixMatch.groups.cols) : undefined;

  const slugs: string[] = [];
  for (const part of iconListPart.split(SLUG_SPLIT_RX)) {
    const clean = part.trim().toLowerCase();
    if (clean.length > 0 && slugs.length < remainingBudget) {
      slugs.push(clean);
    }
  }

  if (slugs.length === 0) {
    return undefined;
  }

  return { icons: slugs, perLine: inlinePerLine ?? fallbackPerLine };
}

/**
 * Parse a raw stack DSL string into a 2D array of `StackGroup` bands.
 * - `;` separates vertical group rows (bands stacked top-to-bottom).
 * - `|` separates side-by-side groups placed on the same horizontal band.
 * - `:N` at the end of a group specifies that group's `perLine` column limit (e.g., `figma,ai,blender,ps,pr,ae:3`).
 * - `perLineList` optionally supplies per-group `perLine` values by group index (e.g., from `?perline=8,6,6,4,3,3`).
 * @param rawInput      Raw decoded stack path/query string.
 * @param perLineList   Optional array of per-group `perLine` numbers from `?perline=`.
 * @returns 2D array of `StackGroup` bands (`StackGroup[][]`).
 */
export function parseStackGroups(rawInput: string, perLineList?: number[]): StackGroup[][] {
  const bands: StackGroup[][] = [];
  let totalIcons = 0;
  let groupIndex = 0;

  for (const bandSegment of rawInput.split(';')) {
    const trimmedBand = bandSegment.trim();
    if (trimmedBand.length > 0) {
      const bandGroups: StackGroup[] = [];
      for (const groupSegment of trimmedBand.split('|')) {
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

/** Normalize `StackRenderOptions` (`groups` or `icons`) into a 2D array of measured bands. */
function buildMeasuredBands(
  options: StackRenderOptions,
  tileSize: number,
  gap: number,
  groupGap: number,
  defaultPerLine: number
): { allSlugs: string[]; bands: MeasuredStackBand[] } {
  const rawBands: StackGroup[][] =
    options.groups && options.groups.length > 0
      ? options.groups
      : parseStackGroups((options.icons ?? []).join(','));

  const allSlugs: string[] = [];
  const bands: MeasuredStackBand[] = [];

  for (const rawBand of rawBands) {
    const measuredGroups: MeasuredStackGroup[] = [];
    for (const rawGroup of rawBand) {
      const cleanIcons: string[] = [];
      for (const slug of rawGroup.icons) {
        const clean = slug.trim().toLowerCase();
        if (clean.length > 0 && allSlugs.length < MAX_STACK_ICONS) {
          cleanIcons.push(clean);
          allSlugs.push(clean);
        }
      }
      if (cleanIcons.length > 0) {
        const groupPerLine = clampInt(
          rawGroup.perLine,
          MIN_STACK_PER_LINE,
          MAX_STACK_PER_LINE,
          defaultPerLine
        );
        const cols = Math.min(cleanIcons.length, groupPerLine);
        const rows = Math.ceil(cleanIcons.length / groupPerLine);
        const width = cols * tileSize + (cols - 1) * gap;
        const height = rows * tileSize + (rows - 1) * gap;
        measuredGroups.push({
          cols,
          height,
          icons: cleanIcons,
          perLine: groupPerLine,
          rows,
          width,
        });
      }
    }

    if (measuredGroups.length > 0) {
      let bandWidth = 0;
      let bandHeight = 0;
      for (let i = 0; i < measuredGroups.length; i += 1) {
        bandWidth += measuredGroups[i].width + (i > 0 ? groupGap : 0);
        if (measuredGroups[i].height > bandHeight) {
          bandHeight = measuredGroups[i].height;
        }
      }
      bands.push({ groups: measuredGroups, height: bandHeight, width: bandWidth });
    }
  }

  if (bands.length === 0) {
    allSlugs.push('sparkles');
    bands.push({
      groups: [
        {
          cols: 1,
          height: tileSize,
          icons: ['sparkles'],
          perLine: defaultPerLine,
          rows: 1,
          width: tileSize,
        },
      ],
      height: tileSize,
      width: tileSize,
    });
  }

  return { allSlugs, bands };
}

/** Render a single Kumo 3D stack tile `<g>` with its `<title>` tooltip, surface layers, and centered icon. */
function renderSingleStackTile(
  slug: string,
  tileX: number,
  tileY: number,
  tileSize: number,
  radius: number,
  iconPad: number,
  iconScale: number,
  variant: WidgetVariant,
  colorOverride: ThemeColorName | undefined,
  usedPrimaryColors: Set<ThemeColorName>
): string {
  const iconX = Number((tileX + iconPad).toFixed(2));
  const iconY = Number((tileY + iconPad).toFixed(2));
  const themeColor = resolveStackIconColor(slug, colorOverride);
  const palette = THEMES[themeColor] || THEMES.indigo;
  const gradId = `grad-${themeColor}`;
  if (variant === '1') {
    usedPrimaryColors.add(themeColor);
  }

  const iconData = resolveIcon(slug, true) ?? resolveIcon('code-xml');
  const innerSvg = iconData ? iconData.innerSvg : '<circle cx="12" cy="12" r="9" />';
  const surfaceMarkup = renderKumoBoxSurface(
    tileX,
    tileY,
    tileSize,
    tileSize,
    radius,
    variant,
    palette,
    gradId
  );

  const transformAttr =
    iconScale === 1
      ? `translate(${iconX}, ${iconY})`
      : `translate(${iconX}, ${iconY}) scale(${iconScale})`;
  const iconFillOrStroke = variant === '1' ? '#ffffff' : palette.iconColor;
  const iconMarkup =
    iconData?.type === 'lucide'
      ? `<g transform="${transformAttr}" fill="none" stroke="${iconFillOrStroke}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${innerSvg}</g>`
      : `<g transform="${transformAttr}" fill="${iconFillOrStroke}">${innerSvg}</g>`;
  const titleText = escapeXml(resolveStackIconTitle(slug));

  return `<g><title>${titleText}</title>${surfaceMarkup}${iconMarkup}</g>`;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render a standalone SVG tech stack icon row, grid, or multi-group layout (`svg.xul.is/stack/:icons`).
 * @param options   Stack grid rendering configuration (`icons`, `groups`, `perLine`, `size`, `gap`, `groupGap`, `variant`, `color`, `anim`).
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderStack(options: StackRenderOptions): string {
  const tileSize = clampInt(
    options.size,
    MIN_STACK_TILE_SIZE,
    MAX_STACK_TILE_SIZE,
    DEFAULT_STACK_TILE_SIZE
  );
  const gap = clampInt(options.gap, MIN_STACK_GAP, MAX_STACK_GAP, DEFAULT_STACK_GAP);
  const groupGap = clampInt(
    options.groupGap,
    MIN_STACK_GROUP_GAP,
    MAX_STACK_GROUP_GAP,
    Math.round(gap * 3.25)
  );
  const defaultPerLine = clampInt(
    options.perLine,
    MIN_STACK_PER_LINE,
    MAX_STACK_PER_LINE,
    DEFAULT_STACK_PER_LINE
  );
  const variant: WidgetVariant = options.variant ?? '2';
  const animMode: AnimationMode = options.anim ?? 'default';
  const hasSheen = animMode === 'sheen' || animMode.startsWith('sheen,');

  const { allSlugs, bands } = buildMeasuredBands(options, tileSize, gap, groupGap, defaultPerLine);

  let totalWidth = 0;
  let totalHeight = 0;
  for (let b = 0; b < bands.length; b += 1) {
    if (bands[b].width > totalWidth) {
      totalWidth = bands[b].width;
    }
    totalHeight += bands[b].height + (b > 0 ? groupGap : 0);
  }

  const radius = Math.max(5, Math.round(tileSize * 0.24));
  const iconSize = Math.round(tileSize * (24 / 42));
  const iconScale = Number((iconSize / 24).toFixed(4));
  const iconPad = Number(((tileSize - iconSize) / 2).toFixed(2));

  let tilesMarkup = '';
  let clipRects = '';
  let bandOriginY = 0;
  const usedPrimaryColors = new Set<ThemeColorName>();

  for (const band of bands) {
    const bandOffsetX = Number(((totalWidth - band.width) / 2).toFixed(1));
    let groupOriginX = bandOffsetX;

    for (const group of band.groups) {
      const groupOriginY = bandOriginY + Number(((band.height - group.height) / 2).toFixed(1));

      for (let i = 0; i < group.icons.length; i += 1) {
        const rowIdx = Math.floor(i / group.perLine);
        const colIdx = i % group.perLine;
        const rowCount = Math.min(group.perLine, group.icons.length - rowIdx * group.perLine);
        const rowOffsetX =
          group.rows > 1
            ? Number((((group.cols - rowCount) * (tileSize + gap)) / 2).toFixed(1))
            : 0;

        const tileX = Number((groupOriginX + rowOffsetX + colIdx * (tileSize + gap)).toFixed(1));
        const tileY = Number((groupOriginY + rowIdx * (tileSize + gap)).toFixed(1));

        tilesMarkup += renderSingleStackTile(
          group.icons[i],
          tileX,
          tileY,
          tileSize,
          radius,
          iconPad,
          iconScale,
          variant,
          options.color,
          usedPrimaryColors
        );

        if (hasSheen) {
          clipRects += `<rect x="${tileX}" y="${tileY}" width="${tileSize}" height="${tileSize}" rx="${radius}" />`;
        }
      }

      groupOriginX = Number((groupOriginX + group.width + groupGap).toFixed(1));
    }

    bandOriginY = Number((bandOriginY + band.height + groupGap).toFixed(1));
  }

  let gradientDefs = variant === '1' ? '' : renderDarkBgGradientDef();
  for (const colorName of usedPrimaryColors) {
    gradientDefs += renderThemeGradientDef(`grad-${colorName}`, THEMES[colorName] || THEMES.indigo);
  }

  const sheen = renderSheenOverlay(
    animMode,
    totalWidth,
    totalHeight,
    radius,
    'stack-sheen',
    clipRects
  );
  const ariaLabel = escapeXml(`tech stack: ${allSlugs.join(', ')}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" fill="none" role="img" aria-label="${ariaLabel}">
  <defs>
    ${gradientDefs}
    ${sheen.clipDef}
  </defs>
  ${tilesMarkup}${sheen.overlay}
</svg>`;
}
