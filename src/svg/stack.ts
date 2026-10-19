/**
 * Tech stack renderer – Renders single or multi-group grids of Kumo 3D icon tiles (`svg.xul.is/stack/:icons`).
 */

import { THEMES } from '@/config/theme';
import {
  DEFAULT_ICON_SLUG,
  MAX_ICON_SLUG_LENGTH,
  STACK_FALLBACK_ICON_SLUG,
  formatSlugTitle,
  normalizeIconSlug,
  resolveFallbackIcon,
  resolveIconLookup,
} from '@/svg/icons';
import {
  buildIconBodyId,
  clampInt,
  escapeXml,
  getOwnValue,
  isSheenMode,
  renderIconGroup,
  renderKumoBoxSurface,
  renderSheenOverlay,
  renderSurfaceGradientDefs,
  renderSvgDocument,
  resolveForegroundPaint,
  truncateText,
} from '@/svg/shared';
import type {
  AnimationMode,
  BadgeVariant,
  NumericRange,
  ResolvedIcon,
  StackGroup,
  StackRenderOptions,
  ThemeColorName,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Curated semantic theme color and display title for a tech stack icon. */
interface StackIconMeta {
  /** Semantic Tailwind v4 theme color used when no uniform `?color=` override is given. */
  color: ThemeColorName;
  /** Human-readable display title for the tile `<title>` tooltip. */
  title: string;
}

/** A single resolved stack tile. */
interface StackTile {
  /** Resolved icon data (`undefined` for unknown slugs, which render the stack fallback icon). */
  data: ResolvedIcon | undefined;
  /** Curated color and title of the canonical slug (`undefined` for uncurated slugs). */
  meta: StackIconMeta | undefined;
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
}

/** Icon list and optional `:N` column suffix of a single group token. */
interface GroupTokenParts {
  /** Comma/whitespace-separated icon list part. */
  iconList: string;
  /** Inline `perLine` override from a trailing `:N` suffix. */
  perLine: number | undefined;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Tile width and height bounds in pixels for `/stack/:icons?size=`. */
export const STACK_TILE_SIZE_RANGE: NumericRange = { default: 42, max: 96, min: 24 };

/** Intra-group gap bounds in pixels between adjacent stack tiles (`?gap=`). */
export const STACK_GAP_RANGE: NumericRange = { default: 8, max: 24, min: 2 };

/** Inter-group gap bounds in pixels between distinct groups (`?groupgap=`; Defaults to `round(gap * 3.25)`, clamped). */
export const STACK_GROUP_GAP_RANGE: NumericRange = { default: 26, max: 64, min: 8 };

/** Ratio of the default inter-group gap to the intra-group gap. */
export const GROUP_GAP_RATIO = 3.25;

/** Tiles-per-row bounds when not specified per group (`?perline=`). */
export const STACK_PER_LINE_RANGE: NumericRange = { default: 8, max: 20, min: 1 };

/** Maximum total icons rendered across an entire stack SVG. */
const MAX_STACK_ICONS = 128;

/**
 * Maximum summed length in UTF-16 code units of the unique icon bodies in one stack; Further unique
 * icons render the fallback icon. Repeated icons are referenced via `<use>`, so this only caps
 * pathological mixes of the largest brand bodies (up to ~54k code units each).
 */
const MAX_STACK_ICON_BODY_LENGTH = 400_000;

/** Maximum length of a tile `<title>` derived from an uncurated slug. */
const MAX_TILE_TITLE_LENGTH = 64;

/** Theme color of uncurated stack icons without a uniform `?color=` override. */
const DEFAULT_STACK_ICON_COLOR: ThemeColorName = 'indigo';

/** Prefix of the content-addressed stack icon body IDs (`stack-icon-<hash>`). */
const STACK_ICON_ID_PREFIX = 'stack-icon';

/** Stroke width of Lucide icons on stack tiles in `24x24` icon units. */
const STACK_ICON_STROKE_WIDTH = 2.1;

/** Curated semantic Tailwind v4 theme colors and display titles for tech stack icons, keyed by canonical slug. */
const STACK_ICON_META: Readonly<Record<string, StackIconMeta>> = {
  adobeaftereffects: { color: 'violet', title: 'Adobe After Effects' },
  adobeillustrator: { color: 'orange', title: 'Adobe Illustrator' },
  adobephotoshop: { color: 'sky', title: 'Adobe Photoshop' },
  adobepremierepro: { color: 'purple', title: 'Adobe Premiere Pro' },
  amazonwebservices: { color: 'amber', title: 'AWS' },
  archlinux: { color: 'cyan', title: 'Arch Linux' },
  arduino: { color: 'teal', title: 'Arduino' },
  blender: { color: 'orange', title: 'Blender' },
  c: { color: 'blue', title: 'C' },
  cloudflare: { color: 'orange', title: 'Cloudflare' },
  cmake: { color: 'red', title: 'CMake' },
  codepen: { color: 'slate', title: 'CodePen' },
  cplusplus: { color: 'blue', title: 'C++' },
  csharp: { color: 'violet', title: 'C#' },
  css3: { color: 'sky', title: 'CSS3' },
  dart: { color: 'sky', title: 'Dart' },
  deno: { color: 'slate', title: 'Deno' },
  docker: { color: 'sky', title: 'Docker' },
  dotnet: { color: 'purple', title: '.NET' },
  elixir: { color: 'violet', title: 'Elixir' },
  figma: { color: 'pink', title: 'Figma' },
  firebase: { color: 'amber', title: 'Firebase' },
  flutter: { color: 'sky', title: 'Flutter' },
  git: { color: 'orange', title: 'Git' },
  github: { color: 'slate', title: 'GitHub' },
  githubactions: { color: 'blue', title: 'GitHub Actions' },
  gitlab: { color: 'orange', title: 'GitLab' },
  gnubash: { color: 'emerald', title: 'Bash' },
  go: { color: 'cyan', title: 'Go' },
  gtk: { color: 'emerald', title: 'GTK' },
  html5: { color: 'orange', title: 'HTML5' },
  java: { color: 'orange', title: 'Java' },
  javascript: { color: 'yellow', title: 'JavaScript' },
  kotlin: { color: 'violet', title: 'Kotlin' },
  laravel: { color: 'red', title: 'Laravel' },
  latex: { color: 'teal', title: 'LaTeX' },
  linux: { color: 'amber', title: 'Linux' },
  lua: { color: 'indigo', title: 'Lua' },
  markdown: { color: 'slate', title: 'Markdown' },
  microsoftazure: { color: 'sky', title: 'Microsoft Azure' },
  mysql: { color: 'sky', title: 'MySQL' },
  netlify: { color: 'teal', title: 'Netlify' },
  nodedotjs: { color: 'green', title: 'Node.js' },
  notion: { color: 'slate', title: 'Notion' },
  npm: { color: 'red', title: 'npm' },
  obsidian: { color: 'violet', title: 'Obsidian' },
  php: { color: 'indigo', title: 'PHP' },
  pinia: { color: 'yellow', title: 'Pinia' },
  postgresql: { color: 'blue', title: 'PostgreSQL' },
  powershell: { color: 'sky', title: 'PowerShell' },
  pypi: { color: 'sky', title: 'PyPI' },
  python: { color: 'amber', title: 'Python' },
  raspberrypi: { color: 'rose', title: 'Raspberry Pi' },
  react: { color: 'cyan', title: 'React' },
  redis: { color: 'red', title: 'Redis' },
  regex: { color: 'indigo', title: 'RegEx' },
  ruby: { color: 'red', title: 'Ruby' },
  rust: { color: 'orange', title: 'Rust' },
  sass: { color: 'pink', title: 'Sass' },
  sqlite: { color: 'sky', title: 'SQLite' },
  svelte: { color: 'orange', title: 'Svelte' },
  swift: { color: 'orange', title: 'Swift' },
  symfony: { color: 'slate', title: 'Symfony' },
  tailwindcss: { color: 'cyan', title: 'Tailwind CSS' },
  tauri: { color: 'amber', title: 'Tauri' },
  terraform: { color: 'violet', title: 'Terraform' },
  threedotjs: { color: 'slate', title: 'Three.js' },
  typescript: { color: 'blue', title: 'TypeScript' },
  unity: { color: 'slate', title: 'Unity' },
  unrealengine: { color: 'slate', title: 'Unreal Engine' },
  visualstudio: { color: 'purple', title: 'Visual Studio' },
  visualstudiocode: { color: 'sky', title: 'VS Code' },
  vite: { color: 'violet', title: 'Vite' },
  vuedotjs: { color: 'emerald', title: 'Vue.js' },
  windows: { color: 'sky', title: 'Windows' },
  wordpress: { color: 'sky', title: 'WordPress' },
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches comma or whitespace separators between icon slugs inside a group. */
const SLUG_SPLIT_RX = /[,\s]+/;

/** Matches a string consisting only of ASCII digits. */
const DIGITS_ONLY_RX = /^\d+$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Split an optional trailing `:<perLine>` suffix off a group token (e.g., `figma,ai,ps:3`). */
function splitGroupToken(token: string): GroupTokenParts {
  const colonIndex = token.lastIndexOf(':');
  const suffix = colonIndex > 0 ? token.slice(colonIndex + 1) : '';
  if (!DIGITS_ONLY_RX.test(suffix)) {
    return { iconList: token, perLine: undefined };
  }
  return { iconList: token.slice(0, colonIndex), perLine: Number(suffix) };
}

/** Parse a single group token (`icon1,icon2:6`) and return its cleaned icon list (slugs capped at `MAX_ICON_SLUG_LENGTH`) and optional `perLine` override. */
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
  for (const part of iconList.split(SLUG_SPLIT_RX)) {
    if (slugs.length >= remainingBudget) {
      break;
    }
    const clean = part.trim().toLowerCase();
    if (clean.length > 0) {
      slugs.push(clean.slice(0, MAX_ICON_SLUG_LENGTH));
    }
  }

  if (slugs.length === 0) {
    return undefined;
  }

  return { icons: slugs, perLine: perLine ?? fallbackPerLine };
}

/** Resolve a requested slug into a stack tile (`undefined` for blank slugs): Brand-first icon data, curated metadata, and a bounded title. */
function buildStackTile(slug: string): StackTile | undefined {
  const lookup = resolveIconLookup(slug, true);
  if (lookup.key.length === 0) {
    return undefined;
  }
  const meta = getOwnValue(STACK_ICON_META, lookup.key);
  const title =
    meta?.title ??
    truncateText(formatSlugTitle(slug.slice(0, MAX_ICON_SLUG_LENGTH)), MAX_TILE_TITLE_LENGTH);
  return { data: lookup.data, meta, title };
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
        // Check the cap first so over-long icon lists are never normalized or resolved.
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
 * Register a tile's icon body once in the shared `<defs>` under its content-addressed ID, switching to
 * the fallback icon for unknown slugs and once the unique-body length budget (`MAX_STACK_ICON_BODY_LENGTH`) is spent.
 */
function resolveStackTileIcon(tile: StackTile, context: StackTileContext): StackTileIcon {
  let data = tile.data ?? resolveFallbackIcon(STACK_FALLBACK_ICON_SLUG);
  let bodyId = buildIconBodyId(data, STACK_ICON_ID_PREFIX);
  if (context.iconBodyIds.has(bodyId)) {
    return { bodyId, data };
  }
  if (context.iconBodyLength + data.innerSvg.length > MAX_STACK_ICON_BODY_LENGTH) {
    data = resolveFallbackIcon(STACK_FALLBACK_ICON_SLUG);
    bodyId = buildIconBodyId(data, STACK_ICON_ID_PREFIX);
    if (context.iconBodyIds.has(bodyId)) {
      return { bodyId, data };
    }
  }
  context.iconBodyIds.add(bodyId);
  context.iconBodyLength += data.innerSvg.length;
  context.iconDefs += `<g id="${bodyId}">${data.innerSvg}</g>`;
  return { bodyId, data };
}

/** Render a single Kumo 3D stack tile `<g>` with its `<title>` tooltip, surface layers, and an icon centered by its visible bounds. */
function renderSingleStackTile(
  tile: StackTile,
  tileX: number,
  tileY: number,
  context: StackTileContext
): string {
  const { iconScale, iconSize, radius, tileSize, variant } = context;
  const themeColor = context.colorOverride ?? tile.meta?.color ?? DEFAULT_STACK_ICON_COLOR;
  const isOnPrimary = variant === '1';
  if (isOnPrimary) {
    context.usedPrimaryColors.add(themeColor);
  }

  const icon = resolveStackTileIcon(tile, context);
  // Center the icon's visible ink (not its `24x24` box) horizontally inside the tile.
  const visualCenterX = ((icon.data.minX + icon.data.maxX) / 2) * iconScale;
  const iconX = Number((tileX + tileSize / 2 - visualCenterX).toFixed(2));
  const iconY = Number((tileY + (tileSize - iconSize) / 2).toFixed(2));
  const surfaceMarkup = renderKumoBoxSurface({
    boxX: tileX,
    boxY: tileY,
    color: themeColor,
    height: tileSize,
    radius,
    variant,
    width: tileSize,
  });
  const iconPaint = resolveForegroundPaint(isOnPrimary, THEMES[themeColor].iconColor);
  const iconMarkup = renderIconGroup({
    color: iconPaint.color,
    innerSvg: `<use href="#${icon.bodyId}" />`,
    opacity: iconPaint.opacity,
    strokeWidth: STACK_ICON_STROKE_WIDTH,
    transform:
      iconScale === 1
        ? `translate(${iconX}, ${iconY})`
        : `translate(${iconX}, ${iconY}) scale(${iconScale})`,
    type: icon.data.type,
  });

  return `<g><title>${escapeXml(tile.title)}</title>${surfaceMarkup}${iconMarkup}</g>`;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Resolve the semantic Tailwind v4 theme color for a tech stack icon slug.
 * @param slug       Raw or canonical icon slug (e.g., `'rust'`, `'py'`, `'ts'`, `'vue'`).
 * @param fallback   Optional explicit theme color override.
 * @returns The resolved `ThemeColorName` (`'indigo'` for uncurated slugs).
 */
export function resolveStackIconColor(slug: string, fallback?: ThemeColorName): ThemeColorName {
  return (
    fallback ??
    getOwnValue(STACK_ICON_META, normalizeIconSlug(slug))?.color ??
    DEFAULT_STACK_ICON_COLOR
  );
}

/**
 * Parse a raw stack DSL string into a 2D array of `StackGroup` bands.
 * - `;` separates vertical group rows (bands stacked top-to-bottom).
 * - `|` separates side-by-side groups placed on the same horizontal band.
 * - `:N` at the end of a group specifies that group's `perLine` column limit (e.g., `figma,ai,blender,ps,pr,ae:3`).
 * - `perLineList` optionally supplies per-group `perLine` values by group index (e.g., from `?perline=8,6,6,4,3,3`).
 * @param rawInput      Raw decoded stack path/query string.
 * @param perLineList   Optional positional array of per-group `perLine` numbers from `?perline=` (`undefined` holes use the default).
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

/**
 * Render a standalone SVG tech stack icon row, grid, or multi-group layout (`svg.xul.is/stack/:icons`).
 * @param options   Stack grid rendering configuration (`icons`, `groups`, `perLine`, `size`, `gap`, `groupGap`, `variant`, `color`, `anim`).
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderStack(options: StackRenderOptions): string {
  const tileSize = clampInt(options.size, STACK_TILE_SIZE_RANGE);
  const gap = clampInt(options.gap, STACK_GAP_RANGE);
  const groupGap = clampInt(
    options.groupGap,
    STACK_GROUP_GAP_RANGE,
    Math.round(gap * GROUP_GAP_RATIO)
  );
  const defaultPerLine = clampInt(options.perLine, STACK_PER_LINE_RANGE);
  const variant: BadgeVariant = options.variant ?? '2';
  const animMode: AnimationMode = options.anim ?? 'default';
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
  for (const [i, band] of bands.entries()) {
    totalWidth = Math.max(totalWidth, band.width);
    totalHeight += band.height + (i > 0 ? groupGap : 0);
  }

  const radius = Math.max(5, Math.round(tileSize * 0.24));
  const iconSize = Math.round(tileSize * (24 / 42));
  const tileContext: StackTileContext = {
    colorOverride: options.color,
    iconBodyIds: new Set<string>(),
    iconBodyLength: 0,
    iconDefs: '',
    iconScale: Number((iconSize / 24).toFixed(4)),
    iconSize,
    radius,
    tileSize,
    usedPrimaryColors: new Set<ThemeColorName>(),
    variant,
  };

  let tilesMarkup = '';
  let clipRects = '';
  let bandOriginY = 0;

  for (const band of bands) {
    const bandOffsetX = Number(((totalWidth - band.width) / 2).toFixed(1));
    let groupOriginX = bandOffsetX;

    for (const group of band.groups) {
      const groupOriginY = bandOriginY + Number(((band.height - group.height) / 2).toFixed(1));

      for (const [i, tile] of group.tiles.entries()) {
        const rowIndex = Math.floor(i / group.perLine);
        const columnIndex = i % group.perLine;
        const rowCount = Math.min(group.perLine, group.tiles.length - rowIndex * group.perLine);
        const rowOffsetX =
          group.rows > 1
            ? Number((((group.cols - rowCount) * (tileSize + gap)) / 2).toFixed(1))
            : 0;

        const tileX = Number(
          (groupOriginX + rowOffsetX + columnIndex * (tileSize + gap)).toFixed(1)
        );
        const tileY = Number((groupOriginY + rowIndex * (tileSize + gap)).toFixed(1));

        tilesMarkup += renderSingleStackTile(tile, tileX, tileY, tileContext);

        if (hasSheen) {
          clipRects += `<rect x="${tileX}" y="${tileY}" width="${tileSize}" height="${tileSize}" rx="${radius}" />`;
        }
      }

      groupOriginX = Number((groupOriginX + group.width + groupGap).toFixed(1));
    }

    bandOriginY = Number((bandOriginY + band.height + groupGap).toFixed(1));
  }

  const gradientDefs = renderSurfaceGradientDefs(variant !== '1', tileContext.usedPrimaryColors);
  const sheen = renderSheenOverlay({
    animMode,
    clipContent: clipRects,
    height: totalHeight,
    idPrefix: 'stack-sheen',
    radius,
    width: totalWidth,
  });

  return renderSvgDocument({
    ariaLabel: `tech stack: ${allTitles.join(', ')}`,
    body: `${tilesMarkup}${sheen.overlay}`,
    defs: `${gradientDefs}${tileContext.iconDefs}${sheen.clipDef}`,
    height: totalHeight,
    width: totalWidth,
  });
}
