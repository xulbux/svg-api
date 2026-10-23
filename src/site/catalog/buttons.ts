/**
 * Buttons documentation catalog – Variant descriptors, size scale / dual-icon / animation / split-button showcase cards, and parameter reference rows for `/docs/buttons`.
 */

import { SITE_ORIGIN } from '@/config/site';
import { DEFAULT_THEME_COLOR } from '@/config/theme';
import { SIZE_TOKENS } from '@/routes/params';
import { DEFAULT_BUTTON_VARIANT } from '@/routes/svg';
import {
  buildAnimParamRow,
  buildColorParamRow,
  buildIconQueryParamRow,
  buildVariantCards,
  buildVariantParamRow,
  formatRange,
} from '@/site/catalog/shared';
import type { VariantDescriptor } from '@/site/catalog/shared';
import { BUTTON_HEIGHT_RANGE, BUTTON_SIZE_PRESETS } from '@/svg/renderer';
import type { BadgeVariant, ParamTableRow, ShowcaseCardConfig, ShowcaseItem } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Showcase definitions for the CTA button hierarchy variants. */
export const BUTTON_VARIANT_DESCRIPTORS: readonly VariantDescriptor[] = [
  {
    description: '3D Kumo brand gradient surface with upper-edge specular highlight.',
    id: '1',
    title: 'variant=1 · Primary Button (Default)',
  },
  {
    description: 'Tinted dark surface with glowing colored border and upper highlight.',
    id: '2',
    title: 'variant=2 · Secondary Button',
  },
  {
    description: 'Neutral carbon-dark surface with subtle border and colored icon.',
    id: '3',
    title: 'variant=3 · Tertiary Button',
  },
];

/** Showcase cards for the dedicated `/docs/buttons` page. */
export const BUTTON_USE_CASE_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      {
        alt: 'Small Button',
        path: `/button/Small+${BUTTON_SIZE_PRESETS.sm.height}px?icon=sparkles&size=sm`,
      },
      {
        alt: 'Medium Button',
        path: `/button/Medium+${BUTTON_SIZE_PRESETS.md.height}px?icon=rocket&size=md&color=emerald`,
      },
      {
        alt: 'Large Button',
        path: `/button/Large+${BUTTON_SIZE_PRESETS.lg.height}px?icon=zap&size=lg&color=cyan`,
      },
      {
        alt: 'XL Hero Button',
        path: `/button/XL+Hero+${BUTTON_SIZE_PRESETS.xl.height}px?icon=flame&size=xl&color=rose`,
      },
    ],
    subtitle: `Scale button height, padding, font size, and icon dimensions with ?size=${SIZE_TOKENS.join('|')} or a custom pixel height (${BUTTON_HEIGHT_RANGE.min} to ${BUTTON_HEIGHT_RANGE.max}).`,
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
        href: 'https://xul.is',
        path: '/button/Open+Website?icon=globe,external-link&color=sky&variant=2',
      },
      { alt: 'Continue', path: '/btn/Continue?icon=none,chevron-right&color=emerald' },
    ],
    subtitle:
      'Set a leading icon (?icon=name), both leading and trailing icons (?icon=left,right), or a trailing icon only (?icon=none,right).',
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
        path: '/button/Launch+App?icon=rocket&color=emerald&variant=2&anim=auto',
      },
      { alt: 'Sponsor', path: '/button/Sponsor?icon=heart&color=rose&variant=2&anim=pulse' },
      {
        alt: 'Next Step',
        path: '/button/Next?icon=sparkles,arrow-right&color=violet&anim=shake,nudge',
      },
    ],
    subtitle:
      'Combine diagonal surface sheen (?anim=sheen), contextual or explicit icon motion (?anim=pulse|auto|…), and per-icon pairs (?anim=shake,nudge).',
    title: 'Surface Sheen & Icon Motion (?anim=)',
  },
  {
    items: [
      { alt: 'Deploy Production', path: '/button/Deploy/Production?icon=rocket' },
      {
        alt: 'Download v1.4.0',
        path: '/button/Download/v1.4.0?icon=download,arrow-right&color=emerald&variant=2',
      },
      {
        alt: 'Discussions Join',
        path: '/btn/Discussions/Join?icon=message-square&color=violet&variant=3',
      },
    ],
    subtitle:
      'Pass a second path segment (/button/:label/:value or /btn/:label/:value) for split action buttons with a vertical divider.',
    title: 'Two-Segment Split Action Buttons (/button/:label/:value)',
  },
];

// -------------------------------------- INTERNALS --------------------------------------

/** Build the CTA button showcase items for a button variant. */
function buildButtonVariantItems(variant: BadgeVariant): ShowcaseItem[] {
  return [
    {
      alt: 'Documentation',
      href: `${SITE_ORIGIN}/docs`,
      path: `/button/Documentation?icon=book-open&variant=${variant}`,
    },
    {
      alt: 'Install Arch',
      path: `/button/Install+Arch?icon=archlinux&color=cyan&variant=${variant}`,
    },
    {
      alt: 'Latest Release',
      path: `/button/Latest+Release?icon=rocket&color=emerald&variant=${variant}`,
    },
    { alt: 'Report Issue', path: `/button/Report+Issue?icon=bug&color=rose&variant=${variant}` },
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
    {
      defaultVal: `md (${BUTTON_SIZE_PRESETS.md.height}px)`,
      description: `Button scale preset (${presetHeights.join(', ')}) or custom pixel height.`,
      name: '?size=',
      values: `${SIZE_TOKENS.join(' | ')} | ${formatRange(BUTTON_HEIGHT_RANGE)}`,
    },
    buildColorParamRow(
      DEFAULT_THEME_COLOR,
      'Tailwind v4 OKLCH accent palette for gradients, borders, and icons.'
    ),
    buildIconQueryParamRow(
      'Leading left icon (icon=name), both left and right icons (icon=left,right), or trailing right icon only (icon=none,right).',
      'rocket | book-open,arrow-right | none,chevron-right | sparkles | …'
    ),
    buildAnimParamRow(),
  ];
}
