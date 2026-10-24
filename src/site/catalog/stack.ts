/**
 * Tech stack documentation catalog – Variant descriptors, showcase cards, and parameter reference rows for `/docs/stack`.
 */

import {
  ACTIVE_STACK_MOTION_TOKENS,
  STACK_MOTION_ALIASES,
  STACK_MOTION_TOKENS,
} from '@/routes/params';
import { DEFAULT_STACK_VARIANT } from '@/routes/svg';
import {
  buildColorParamRow,
  buildVariantCards,
  buildVariantParamRow,
  formatRange,
  STACK_EXAMPLE_GROUPS,
} from '@/site/catalog/shared';
import { collectAliasesForTarget, formatConjunctionList } from '@/site/glossary';
import {
  GROUP_GAP_RATIO,
  STACK_GAP_RANGE,
  STACK_GROUP_GAP_RANGE,
  STACK_PER_LINE_RANGE,
  STACK_TILE_SIZE_RANGE,
} from '@/svg/stack';
import type {
  BadgeVariant,
  ParamTableRow,
  ShowcaseCardConfig,
  ShowcaseItem,
  StackTileMotion,
  VariantDescriptor,
} from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Showcase definitions for the tech stack tile variants. */
export const STACK_VARIANT_DESCRIPTORS: readonly VariantDescriptor[] = [
  {
    description: 'Brand gradient tiles with white icons.',
    id: '1',
    title: 'variant=1 · Primary Brand Gradient Stack',
  },
  {
    description: 'Tinted dark tiles with colored borders and brand-colored icons.',
    id: '2',
    title: 'variant=2 · Secondary Tinted Dark Stack (Default)',
  },
  {
    description: 'Neutral dark tiles with subtle borders and brand-colored icons.',
    id: '3',
    title: 'variant=3 · Tertiary Neutral Dark Stack',
  },
];

// -------------------------------------- INTERNALS --------------------------------------

/** Format the sorted shorthand aliases of a stack tile motion (`'auto, bounce, ripple'`). */
function formatStackMotionAliases(motion: StackTileMotion): string {
  return collectAliasesForTarget(STACK_MOTION_ALIASES, motion).join(', ');
}

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

/** Showcase cards demonstrating staggered per-tile animations on `/docs/stack`. */
export const STACK_ANIMATION_CARDS: readonly ShowcaseCardConfig[] = [
  {
    isCentered: true,
    items: [
      {
        alt: 'Tech Stack Wave',
        path: '/stack/rust,go,ts,py,docker,cloudflare,vite,linux:8?anim=wave',
      },
    ],
    subtitle: `Left-to-right staggered bounce across tiles (aliases: ${formatStackMotionAliases('wave')}).`,
    title: 'anim=wave · Staggered Wave',
  },
  {
    isCentered: true,
    items: [
      {
        alt: 'Tech Stack Sheen Float',
        path: '/stack/rust,go,ts,py,docker,cloudflare,vite,linux:8?variant=1&anim=sheen,float',
      },
    ],
    subtitle: `Gentle phase-shifted bobbing with a diagonal sheen (aliases: ${formatStackMotionAliases('float')}).`,
    title: 'anim=sheen,float · Ambient Float',
  },
  {
    isCentered: true,
    items: [
      {
        alt: 'Tech Stack Pulse',
        path: '/stack/rust,go,ts,py,docker,cloudflare,vite,linux:8?anim=pulse',
      },
    ],
    subtitle: `Staggered border glow and subtle icon scale (aliases: ${formatStackMotionAliases('pulse')}).`,
    title: 'anim=pulse · Breathing Glow',
  },
];

/**
 * Build the variant showcase cards for `/docs/stack`.
 * @returns Showcase card configurations for the stack variants.
 */
export function buildStackVariantCards(): ShowcaseCardConfig[] {
  return buildVariantCards(STACK_VARIANT_DESCRIPTORS, buildStackVariantItems, true);
}

/**
 * Build the parameter reference rows for `/stack/:groups` routes.
 * @returns Parameter table rows.
 */
export function buildStackParamRows(): ParamTableRow[] {
  const motionSummaries = ACTIVE_STACK_MOTION_TOKENS.map(
    (token) => `${token} [${formatStackMotionAliases(token)}]`
  );
  return [
    {
      defaultVal: '~required',
      description:
        'Icon slugs with optional @color per-tile overrides, :N columns per group, | side-by-side groups, and ; row bands; Read from the path segment, then ?groups=, ?icons=, and ?i= (empty values fall through).',
      name: ':groups / ?groups= / ?icons= / ?i=',
      values: 'c,cpp,cs,rust@amber:4 | aws,cloudflare:2 ; figma,blender:2',
    },
    buildVariantParamRow(DEFAULT_STACK_VARIANT, 'Tile hierarchy'),
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
    {
      defaultVal: '~static',
      description: `Diagonal sheen sweep, staggered per-tile motion (${formatConjunctionList(motionSummaries, 'or')}), sheen combined with any motion (sheen,<motion>), or none.`,
      name: '?anim=',
      values: `sheen | ${STACK_MOTION_TOKENS.join(' | ')} | sheen,<motion>`,
    },
  ];
}
