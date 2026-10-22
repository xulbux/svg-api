/**
 * Tech stack documentation catalog – Variant descriptors, showcase cards, icon count helper, and parameter reference rows for `/docs/stack`.
 */

import {
  buildColorParamRow,
  buildSheenAnimParamRow,
  buildVariantCards,
  buildVariantParamRow,
  formatRange,
  STACK_EXAMPLE_GROUPS,
} from '@/site/catalog/shared';
import type { VariantDescriptor } from '@/site/catalog/shared';
import {
  GROUP_GAP_RATIO,
  parseStackGroups,
  STACK_GAP_RANGE,
  STACK_GROUP_GAP_RANGE,
  STACK_PER_LINE_RANGE,
  STACK_TILE_SIZE_RANGE,
} from '@/svg/stack';
import type { BadgeVariant, ParamTableRow, ShowcaseCardConfig, ShowcaseItem } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Showcase definitions for the 3 tech stack tile variants (`1`, `2`, `3`). */
export const STACK_VARIANT_DESCRIPTORS: readonly VariantDescriptor[] = [
  {
    description: 'Filled 3D brand gradient tiles with crisp white icons.',
    id: '1',
    title: 'variant=1 · Primary Brand Gradient Stack',
  },
  {
    description: 'Tinted carbon-dark surface with glowing colored borders and brand-colored icons.',
    id: '2',
    title: 'variant=2 · Secondary Tinted Dark Stack (Default)',
  },
  {
    description: 'Neutral carbon-dark tiles with subtle borders and brand-colored icons.',
    id: '3',
    title: 'variant=3 · Tertiary Neutral Dark Stack',
  },
];

// -------------------------------------- INTERNALS --------------------------------------

/** Build the single stack example for a stack variant. */
function buildStackVariantItems(variant: BadgeVariant): ShowcaseItem[] {
  return [
    {
      alt: `Tech Stack (Variant ${variant})`,
      path: `/stack/${STACK_EXAMPLE_GROUPS}?variant=${variant}`,
    },
  ];
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Count the icons of the stack showcase example through the live stack DSL parser.
 * @returns Total icon count in `STACK_EXAMPLE_GROUPS`.
 */
export function countStackExampleIcons(): number {
  let iconCount = 0;
  for (const band of parseStackGroups(STACK_EXAMPLE_GROUPS)) {
    for (const group of band) {
      iconCount += group.icons.length;
    }
  }
  return iconCount;
}

/**
 * Build the variant showcase cards for `/docs/stack`.
 * @returns Showcase card configurations for the 3 stack variants.
 */
export function buildStackVariantCards(): ShowcaseCardConfig[] {
  return buildVariantCards(STACK_VARIANT_DESCRIPTORS, buildStackVariantItems, true);
}

/**
 * Build the parameter reference rows for `/stack/:groups` routes.
 * @returns Parameter table rows.
 */
export function buildStackParamRows(): ParamTableRow[] {
  return [
    {
      defaultVal: '~required',
      description:
        'Icon slugs with optional @color per-tile overrides, :N columns per group, | side-by-side groups, and ; row bands; Read from the path segment, then ?groups=, ?icons=, and ?i= (empty values fall through).',
      name: ':groups / ?groups= / ?icons= / ?i=',
      values: 'c,cpp,cs,rust@amber:4 | aws,cloudflare:2 ; figma,blender:2',
    },
    buildVariantParamRow('2', 'Tile hierarchy'),
    buildColorParamRow(
      '~per-icon brand color',
      'Uniform theme color override applied to all tiles.'
    ),
    {
      defaultVal: String(STACK_PER_LINE_RANGE.default),
      description:
        'Fallback column count per row, or a comma-separated list per group; Invalid list entries keep their position and use the group default.',
      name: '?perline=',
      values: `${formatRange(STACK_PER_LINE_RANGE)} (or 8,6,6,4,3,3)`,
    },
    {
      defaultVal: `${STACK_TILE_SIZE_RANGE.default} (px)`,
      description: 'Width and height of each rounded square tile in pixels.',
      name: '?size=',
      values: formatRange(STACK_TILE_SIZE_RANGE),
    },
    {
      defaultVal: `${STACK_GAP_RANGE.default} (gap) / round(gap × ${GROUP_GAP_RATIO}) (groupgap)`,
      description:
        'Tile spacing in pixels (?gap= within groups, ?groupgap= or its ?ggap= alias between groups).',
      name: '?gap= / ?groupgap= / ?ggap=',
      values: `${formatRange(STACK_GAP_RANGE)} / ${formatRange(STACK_GROUP_GAP_RANGE)}`,
    },
    buildSheenAnimParamRow('Diagonal sheen sweep across every tile, or none.'),
  ];
}
