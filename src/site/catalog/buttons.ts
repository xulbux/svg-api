/**
 * Buttons documentation catalog – Variant descriptors, size scale / dual-icon / animation / split-button showcase cards,
 * and parameter reference rows for `/docs/buttons`.
 */

import { AUTHOR_WEBSITE_URL, SITE_ORIGIN } from '@/config/site';
import { DEFAULT_THEME_COLOR } from '@/config/theme';
import { SIZE_TOKENS } from '@/routes/params';
import { DEFAULT_BUTTON_VARIANT } from '@/routes/svg';
import {
  appendDefaultLabel,
  buildAnimParamRow,
  buildColorParamRow,
  buildIconQueryParamRow,
  buildVariantCards,
  buildVariantParamRow,
  formatRange,
} from '@/site/catalog/shared';
import { BUTTON_HEIGHT_RANGE, BUTTON_SIZE_PRESETS, DEFAULT_BUTTON_SIZE } from '@/svg/renderer';
import type {
  BadgeVariant,
  ParamTableRow,
  ShowcaseCardConfig,
  ShowcaseItem,
  VariantDescriptor,
} from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Showcase definitions for the CTA button hierarchy variants. */
const BUTTON_VARIANT_DESCRIPTORS: readonly VariantDescriptor[] = [
  {
    description: 'Gradient surface with an upper-edge highlight.',
    id: '1',
    title: appendDefaultLabel('variant=1 · Primary Button', DEFAULT_BUTTON_VARIANT === '1'),
  },
  {
    description: 'Tinted dark surface with a colored border.',
    id: '2',
    title: appendDefaultLabel('variant=2 · Secondary Button', DEFAULT_BUTTON_VARIANT === '2'),
  },
  {
    description: 'Neutral dark surface with a subtle border and colored icon.',
    id: '3',
    title: appendDefaultLabel('variant=3 · Tertiary Button', DEFAULT_BUTTON_VARIANT === '3'),
  },
];

/** Showcase cards for the dedicated `/docs/buttons` page. */
export const BUTTON_USE_CASE_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      {
        alt: 'Small Button',
        path: `/button/Small+${BUTTON_SIZE_PRESETS.sm.height}px?size=sm&icon=sparkles`,
      },
      {
        alt: 'Medium Button',
        path: `/button/Medium+${BUTTON_SIZE_PRESETS.md.height}px?color=emerald&size=md&icon=rocket`,
      },
      {
        alt: 'Large Button',
        path: `/button/Large+${BUTTON_SIZE_PRESETS.lg.height}px?color=cyan&size=lg&icon=zap`,
      },
      {
        alt: 'XL Hero Button',
        path: `/button/XL+Hero+${BUTTON_SIZE_PRESETS.xl.height}px?color=rose&size=xl&icon=flame`,
      },
    ],
    subtitle: `Scale button height, padding, font size, and icons with ?size=${SIZE_TOKENS.join('|')} or a pixel height (${BUTTON_HEIGHT_RANGE.min} to ${BUTTON_HEIGHT_RANGE.max}).`,
    title: `Button Size Scale (?size=${SIZE_TOKENS.join('|')})`,
  },
  {
    items: [
      {
        alt: 'Explore Docs',
        href: `${SITE_ORIGIN}/docs`,
        path: '/button/Explore+Docs?icon=book-open,arrow-right&anim=nudge',
      },
      {
        alt: 'Open Website',
        href: AUTHOR_WEBSITE_URL,
        path: '/button/Open+Website?variant=2&color=sky&icon=globe,external-link',
      },
      { alt: 'Continue', path: '/btn/Continue?color=emerald&icon=none,chevron-right' },
    ],
    subtitle:
      'Leading icon (?icon=name), leading and trailing icons (?icon=left,right), or trailing icon only (?icon=none,right).',
    title: 'Leading & Trailing Icons (?icon=left,right)',
  },
  {
    items: [
      {
        alt: 'Get Started',
        href: `${SITE_ORIGIN}/docs`,
        path: '/button/Get+Started?icon=sparkles,arrow-right&anim=sheen',
      },
      {
        alt: 'Launch App',
        path: '/button/Launch+App?variant=2&color=emerald&icon=rocket&anim=auto',
      },
      { alt: 'Sponsor', path: '/button/Sponsor?variant=2&color=rose&icon=heart&anim=pulse' },
      {
        alt: 'Next Step',
        path: '/button/Next?color=violet&icon=sparkles,arrow-right&anim=shake,nudge',
      },
    ],
    subtitle:
      'Combine surface sheen (?anim=sheen), icon motions (?anim=pulse|auto|…), and per-icon pairs (?anim=shake,nudge).',
    title: 'Surface Sheen & Icon Motion (?anim=)',
  },
  {
    items: [
      { alt: 'Deploy Production', path: '/button/Deploy/Production?icon=rocket' },
      {
        alt: 'Download v1.4.0',
        path: '/button/Download/v1.4.0?variant=2&color=emerald&icon=download,arrow-right',
      },
      {
        alt: 'Discussions Join',
        path: '/btn/Discussions/Join?variant=3&color=violet&icon=message-square',
      },
    ],
    subtitle:
      'Add a second path segment (/button/:label/:value or /btn/:label/:value) for a split button.',
    title: 'Split Action Buttons (/button/:label/:value)',
  },
];

// -------------------------------------- INTERNALS --------------------------------------

/** Build the CTA button showcase items for a button variant. */
function buildButtonVariantItems(variant: BadgeVariant): ShowcaseItem[] {
  return [
    {
      alt: 'Documentation',
      href: `${SITE_ORIGIN}/docs`,
      path: `/button/Documentation?variant=${variant}&icon=book-open`,
    },
    {
      alt: 'Install Arch',
      path: `/button/Install+Arch?variant=${variant}&color=cyan&icon=archlinux`,
    },
    {
      alt: 'Latest Release',
      path: `/button/Latest+Release?variant=${variant}&color=emerald&icon=rocket`,
    },
    { alt: 'Report Issue', path: `/button/Report+Issue?variant=${variant}&color=rose&icon=bug` },
  ];
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the variant showcase cards for `/docs/buttons`.
 * @returns Showcase card configurations for the button variants.
 */
export function buildButtonVariantCards(): ShowcaseCardConfig[] {
  return buildVariantCards(BUTTON_VARIANT_DESCRIPTORS, buildButtonVariantItems);
}

/**
 * Build the parameter reference rows for `/button/*` and `/btn/*` routes.
 * @returns Parameter table rows.
 */
export function buildButtonParamRows(): ParamTableRow[] {
  const presetHeights: string[] = [];
  for (const [presetName, preset] of Object.entries(BUTTON_SIZE_PRESETS)) {
    presetHeights.push(`${presetName}=${preset.height}px`);
  }
  return [
    buildVariantParamRow(DEFAULT_BUTTON_VARIANT, 'Surface tier'),
    buildColorParamRow(DEFAULT_THEME_COLOR, 'Theme color for gradients, borders, and icons.'),
    {
      defaultVal: `${DEFAULT_BUTTON_SIZE} (${BUTTON_SIZE_PRESETS[DEFAULT_BUTTON_SIZE].height}px)`,
      description: `Button scale preset (${presetHeights.join(', ')}) or custom pixel height.`,
      name: '?size=',
      values: `${SIZE_TOKENS.join(' | ')} | ${formatRange(BUTTON_HEIGHT_RANGE)}`,
    },
    buildIconQueryParamRow(
      'Leading icon (icon=name), left and right icons (icon=left,right), or trailing icon only (icon=none,right).',
      'rocket | book-open,arrow-right | none,chevron-right | sparkles | …'
    ),
    buildAnimParamRow(),
  ];
}
