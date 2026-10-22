/**
 * Shared documentation catalog helpers – Shared constants, parameter row factories, variant card builders, and icon count helpers used across the documentation sections.
 */

import { THEME_COLOR_NAMES } from '@/config/theme';
import { ICON_MOTION_TOKENS } from '@/routes/params';
import { formatVariantTierSummary, formatVariantValues } from '@/site/glossary';
import { getIconPickerIndex } from '@/svg/icons';
import type {
  BadgeVariant,
  IconSetCounts,
  NumericRange,
  ParamTableRow,
  ShowcaseCardConfig,
  ShowcaseItem,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Descriptor for a badge, button, stack, or quote variant showcase card. */
export interface VariantDescriptor {
  /** Short explanation of the visual hierarchy tier. */
  readonly description: string;
  /** Variant query parameter identifier (`1`, `2`, `3`). */
  readonly id: BadgeVariant;
  /** Display title for the variant card. */
  readonly title: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Public endpoint families listed on the `/` homepage (`/btn/*` is an alias of `/button/*`, `/type/*` is an alias of `/typing/*`). */
export const ENDPOINT_ROUTES: readonly string[] = [
  '/badge/*',
  '/button/*',
  '/icon/*',
  '/stack/*',
  '/typing/*',
  '/quote/*',
];

/** Multi-group tech stack DSL example shared by the `/` homepage and `/docs/stack` previews. */
export const STACK_EXAMPLE_GROUPS =
  'c,cpp,cs,rust,py,js,ts,java:4|vue,tailwind,unocss,threejs:2;docker,cloudflare|git,vite|figma,pr;linux,raspberrypi,markdown,latex,obsidian,n8n';

/** URL-encoded sample quote text shared by the `/` homepage and `/docs/quotes` previews. */
export const ENCODED_CHAOS_QUOTE =
  'Who+says+programmers+are+boring%3F+I+bring+the+humor+to+the+office+while+my+code+brings+the+chaos!';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Format a numeric range as a parameter table value (`'8 to 256'`).
 * @param range   Numeric range with `min` and `max`.
 * @returns Range string (`'min to max'`).
 */
export function formatRange(range: NumericRange): string {
  return `${range.min} to ${range.max}`;
}

/**
 * Format the `?color=` parameter row values.
 * @returns Formatted color values string.
 */
export function formatColorValues(): string {
  return `indigo | cyan | emerald | rose | amber | … (${THEME_COLOR_NAMES.length} colors)`;
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
 * Build a `?icon=` parameter row for badges and buttons.
 * @param description   Parameter description.
 * @param values        Sample icon values string.
 * @returns Parameter table row.
 */
export function buildIconQueryParamRow(description: string, values: string): ParamTableRow {
  return { defaultVal: 'none', description, name: '?icon=', values };
}

/**
 * Build the full `?anim=` parameter row for badges and buttons (every motion token from the parser).
 * @returns Parameter table row.
 */
export function buildAnimParamRow(): ParamTableRow {
  return {
    defaultVal: 'default',
    description:
      'Surface sheen, one icon motion (auto picks a motion per icon; default keeps icons static), a per-icon <left>,<right> pair (e.g., shake,nudge or none,nudge), or sheen combined with either; none also stops widget and dot animations.',
    name: '?anim=',
    values: `sheen | ${ICON_MOTION_TOKENS.join(' | ')} | <left>,<right> | sheen,<motion> | sheen,<left>,<right>`,
  };
}

/**
 * Build a sheen-only `?anim=` parameter row for stacks and quote cards.
 * @param description   Parameter description.
 * @returns Parameter table row.
 */
export function buildSheenAnimParamRow(description: string): ParamTableRow {
  return { defaultVal: '~static', description, name: '?anim=', values: 'sheen | none' };
}

/**
 * Build showcase card configurations for a list of variant descriptors.
 * @param descriptors   Variant descriptors (`1`, `2`, `3`).
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
 * Count (once per isolate) the distinct icons of the bundled Lucide, Simple Icons, Devicon Plain, and File Icons sets.
 * @returns Distinct Lucide and brand icon counts.
 */
export function getIconSetCounts(): IconSetCounts {
  const { sets } = getIconPickerIndex();
  return { brand: sets.brands.length, lucide: sets.lucide.length };
}

/**
 * Format a large count as a rounded-down lower bound (e.g., `1890` -> `'1,800+'`).
 * @param count   Exact count.
 * @returns Human-readable lower bound with a thousands separator.
 */
export function formatCountLowerBound(count: number): string {
  return `${(Math.floor(count / 100) * 100).toLocaleString('en-US')}+`;
}
