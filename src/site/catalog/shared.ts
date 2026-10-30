/**
 * Shared Documentation Catalog Helpers
 *
 * Shared constants, parameter row factories, variant card builders, and icon count helpers.
 */

import { DEFAULT_THEME_COLOR, THEME_COLOR_NAMES } from '@/config/theme';
import { ANIM_SHEEN_TOKEN, ICON_MOTION_TOKENS } from '@/routes/params';
import { SVG_ROUTES } from '@/routes/svg';
import { formatVariantTierSummary, formatVariantValues } from '@/site/glossary';
import { getIconPickerIndex } from '@/svg/icons';
import type {
  BadgeVariant,
  IconSetCounts,
  NumericRange,
  ParamTableRow,
  ShowcaseCardConfig,
  ShowcaseItem,
  ThemeColorName,
  VariantDescriptor,
} from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Representative theme color tokens shown in `?color=` and `?dot=` parameter table rows. */
const SAMPLE_THEME_COLORS: readonly ThemeColorName[] = [
  DEFAULT_THEME_COLOR,
  'cyan',
  'emerald',
  'rose',
  'amber',
];

/** Multi-group tech stack DSL example shared across documentation previews. */
export const STACK_EXAMPLE_GROUPS =
  'c,cpp,cs,rust,py,js,ts,java:4|vue,tailwind,unocss,threejs:2;docker,cloudflare|git,vite|figma,pr;linux,raspberrypi,markdown,latex,obsidian,n8n';

/** URL-encoded sample quote text shared across documentation previews. */
export const ENCODED_CHAOS_QUOTE =
  'Who+says+programmers+are+boring%3F+I+bring+the+humor+to+the+office+while+my+code+brings+the+chaos!';

/** Memoized canonical non-alias endpoint patterns (`undefined` until first requested). */
let endpointRoutesCache: readonly string[] | undefined = undefined;

/** Memoized distinct icon set counts (`undefined` until first requested). */
let iconSetCountsCache: IconSetCounts | undefined = undefined;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * List (once per isolate) the canonical non-alias endpoint wildcard patterns (`'/<prefix>/*'`).
 * @returns Canonical endpoint wildcard patterns in route table order.
 */
export function getEndpointRoutes(): readonly string[] {
  if (endpointRoutesCache === undefined) {
    const routes: string[] = [];
    for (const route of SVG_ROUTES) {
      if (route.aliasOf === undefined) {
        routes.push(`/${route.prefix}/*`);
      }
    }
    endpointRoutesCache = routes;
  }
  return endpointRoutesCache;
}

/**
 * List all alias route prefixes targeting `canonicalPrefix` in `SVG_ROUTES`.
 * @param canonicalPrefix   Canonical SVG route prefix (e.g., `'button'`).
 * @returns Matching alias prefixes in route table order.
 */
export function listRouteAliases(canonicalPrefix: string): string[] {
  const aliases: string[] = [];
  for (const route of SVG_ROUTES) {
    if (route.aliasOf === canonicalPrefix) {
      aliases.push(route.prefix);
    }
  }
  return aliases;
}

/**
 * Format a numeric range as a parameter table value (`'8 to 256'`).
 * @param range   Numeric range with `min` and `max`.
 * @returns Range string (`'min to max'`).
 */
export function formatRange(range: NumericRange): string {
  return `${range.min} to ${range.max}`;
}

/**
 * Format the `?color=` parameter row values from `SAMPLE_THEME_COLORS` and `THEME_COLOR_NAMES`.
 * @returns Formatted color values string.
 */
export function formatColorValues(): string {
  return `${SAMPLE_THEME_COLORS.join(' | ')} | … (${THEME_COLOR_NAMES.length} colors)`;
}

/**
 * Build a `?color=` parameter row.
 * @param defaultVal    Default color value text.
 * @param description   Parameter description.
 * @returns Parameter table row.
 */
export function buildColorParamRow(defaultVal: string, description: string): ParamTableRow {
  return { defaultVal, description, name: '?color=', values: formatColorValues() };
}

/**
 * Build a `?dot=` parameter row accepting any theme color or `none`.
 * @param description   Leading description sentence.
 * @returns Parameter table row.
 */
export function buildDotParamRow(description: string): ParamTableRow {
  return {
    defaultVal: 'none',
    description: `${description} Accepts any theme color or none.`,
    name: '?dot=',
    values: `none | ${formatColorValues()}`,
  };
}

/**
 * Build a `?variant=` parameter row (`'<topic>: 1 = Primary gradient, …'` from the shared tier table).
 * @param defaultVal   Default variant identifier.
 * @param topic        Leading topic label (e.g., `'Hierarchy tier'`).
 * @returns Parameter table row.
 */
export function buildVariantParamRow(defaultVal: BadgeVariant, topic: string): ParamTableRow {
  return {
    defaultVal,
    description: `${topic}: ${formatVariantTierSummary()}.`,
    name: '?variant=',
    values: formatVariantValues(),
  };
}

/**
 * Build a `?icon=` parameter row.
 * @param description   Parameter description.
 * @param values        Sample icon values string.
 * @returns Parameter table row.
 */
export function buildIconQueryParamRow(description: string, values: string): ParamTableRow {
  return { defaultVal: 'none', description, name: '?icon=', values };
}

/**
 * Build the full `?anim=` parameter row for dual-icon SVG endpoints (every motion token from the parser).
 * @returns Parameter table row.
 */
export function buildAnimParamRow(): ParamTableRow {
  return {
    defaultVal: 'default',
    description:
      'Surface sheen, one icon motion (auto picks a motion per icon; default keeps icons static), a per-icon <left>,<right> pair (e.g., shake,nudge or none,nudge), or sheen combined with either; none also stops widget and dot animations.',
    name: '?anim=',
    values: `${ANIM_SHEEN_TOKEN} | ${ICON_MOTION_TOKENS.join(' | ')} | <left>,<right> | ${ANIM_SHEEN_TOKEN},<motion> | ${ANIM_SHEEN_TOKEN},<left>,<right>`,
  };
}

/**
 * Build a sheen-only `?anim=` parameter row for container surfaces.
 * @param description   Parameter description.
 * @returns Parameter table row.
 */
export function buildSheenAnimParamRow(description: string): ParamTableRow {
  return {
    defaultVal: '~static',
    description,
    name: '?anim=',
    values: `${ANIM_SHEEN_TOKEN} | none`,
  };
}

/**
 * Append `' (Default)'` to a showcase card title when `isDefault` is `true`.
 * @param title       Base showcase card title.
 * @param isDefault   Whether the card represents the default option.
 * @returns Card title with optional `' (Default)'` suffix.
 */
export function appendDefaultLabel(title: string, isDefault: boolean): string {
  return isDefault ? `${title} (Default)` : title;
}

/**
 * Build showcase card configurations for a list of variant descriptors.
 * @param descriptors   Variant descriptors in hierarchy order.
 * @param buildItems    Callback returning the showcase items for a given variant.
 * @param isCentered    Whether the preview stage is centered.
 * @returns Showcase card configurations.
 */
export function buildVariantCards(
  descriptors: readonly VariantDescriptor[],
  buildItems: (variant: BadgeVariant) => ShowcaseItem[],
  isCentered = false
): ShowcaseCardConfig[] {
  const cards: ShowcaseCardConfig[] = [];
  for (const descriptor of descriptors) {
    cards.push({
      isCentered,
      items: buildItems(descriptor.id),
      subtitle: descriptor.description,
      title: descriptor.title,
    });
  }
  return cards;
}

/**
 * Count (once per isolate) the distinct icons of the bundled stroke and brand icon sets.
 * @returns Distinct stroke and brand icon counts.
 */
export function getIconSetCounts(): IconSetCounts {
  if (iconSetCountsCache === undefined) {
    const { sets } = getIconPickerIndex();
    iconSetCountsCache = { brand: sets.brands.length, lucide: sets.lucide.length };
  }
  return iconSetCountsCache;
}

/**
 * Format a large count as a rounded-down lower bound (e.g., `1890` -> `'1,800+'`).
 * @param count   Exact count.
 * @returns Human-readable lower bound with a thousands separator.
 */
export function formatCountLowerBound(count: number): string {
  return `${(Math.floor(count / 100) * 100).toLocaleString('en-US')}+`;
}
