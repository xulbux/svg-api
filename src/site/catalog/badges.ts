/**
 * Badges documentation catalog – Variant descriptors, inline widget/status-dot/layout/animation showcase cards, and parameter reference rows for `/docs/badges`.
 */

import { DEFAULT_THEME_COLOR, THEME_COLOR_NAMES } from '@/config/theme';
import { ACTIVE_ICON_MOTION_TOKENS } from '@/routes/params';
import { DEFAULT_BADGE_VARIANT } from '@/routes/svg';
import {
  buildAnimParamRow,
  buildColorParamRow,
  buildDotParamRow,
  buildIconQueryParamRow,
  buildVariantCards,
  buildVariantParamRow,
} from '@/site/catalog/shared';
import { formatSpecialExamples } from '@/site/glossary';
import {
  MAX_BARS_POINTS,
  MAX_SPARKLINE_POINTS,
  MAX_STEPS_COUNT,
  MAX_STRIP_TICKS,
  MIN_SERIES_POINTS,
  STRIP_TICK_MAX_STATE,
} from '@/svg/renderer';
import type {
  BadgeVariant,
  ParamTableRow,
  ShowcaseCardConfig,
  ShowcaseItem,
  VariantDescriptor,
} from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Showcase definitions for the badge hierarchy variants. */
export const BADGE_VARIANT_DESCRIPTORS: readonly VariantDescriptor[] = [
  {
    description: 'Gradient right cap for primary status and metrics.',
    id: '1',
    title: 'variant=1 · Primary Badge (Default)',
  },
  {
    description: 'Tinted dark right cap with a colored border.',
    id: '2',
    title: 'variant=2 · Secondary Badge',
  },
  {
    description: 'Neutral dark surface with colored icon and muted value.',
    id: '3',
    title: 'variant=3 · Tertiary Badge',
  },
];

// -------------------------------------- INTERNALS --------------------------------------

/** Build the static badge showcase items for a badge variant. */
function buildBadgeVariantItems(variant: BadgeVariant): ShowcaseItem[] {
  return [
    { alt: 'Build', path: `/badge/Build/Passing?variant=${variant}&icon=circle-check` },
    { alt: 'Arch', path: `/badge/Arch/Hyprland?variant=${variant}&color=cyan&icon=archlinux` },
    {
      alt: 'Runtime',
      path: `/badge/Runtime/Cloudflare?variant=${variant}&color=emerald&icon=cloudflare`,
    },
    {
      alt: 'Security',
      path: `/badge/Security/Verified?variant=${variant}&color=rose&icon=shield-check`,
    },
  ];
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the variant showcase cards for `/docs/badges`.
 * @returns Showcase card configurations for the badge variants.
 */
export function buildBadgeVariantCards(): ShowcaseCardConfig[] {
  return buildVariantCards(BADGE_VARIANT_DESCRIPTORS, buildBadgeVariantItems);
}

/**
 * Build the showcase cards for inline data widgets, pulsing status dots, structural layouts, and micro-animations.
 * @returns Showcase card configurations.
 */
export function buildBadgeUseCaseCards(): ShowcaseCardConfig[] {
  return [
    {
      items: [
        {
          alt: 'Sparkline Widget',
          path: '/badge/Latency/14ms?icon=activity&special=sparkline:22,19,21,17,15,16,14',
        },
        {
          alt: 'Bars Widget',
          path: '/badge/Requests/1.8k%2Fs?color=indigo&icon=layers&special=bars:3,6,5,8,7,9,6',
        },
        {
          alt: 'Progress Bar Widget',
          path: '/badge/Coverage/92%25?color=emerald&icon=shield-check&special=bar:92',
        },
        {
          alt: 'Steps Widget',
          path: '/badge/Onboarding/4%2F5?color=teal&icon=circle-check&special=steps:4/5',
        },
        {
          alt: 'Donut Ring Widget',
          path: '/badge/KV+Quota/84%25?color=sky&icon=cpu&special=ring:84:pulse',
        },
        {
          alt: 'Uptime Strip Widget',
          path: '/badge/Uptime/99.98%25?variant=2&color=emerald&dot=green&special=strip:9987998999',
        },
        {
          alt: 'Delta Trend Pill',
          path: '/badge/Requests/2.4M%2Fd?color=violet&icon=trending-up&special=delta:%2B38%25',
        },
      ],
      subtitle: `Sparklines, bar charts, progress bars, step pills, donut rings, ${STRIP_TICK_MAX_STATE + 1}-stage strips, and delta pills via ?special=.`,
      title: 'Inline Data Visualizations (?special=)',
    },
    {
      items: [
        {
          alt: 'Status Operational',
          path: '/badge/Status/Operational?variant=2&color=emerald&dot=green',
        },
        {
          alt: 'Status Degraded',
          path: '/badge/Status/180ms+Latency?variant=2&color=amber&dot=amber',
        },
        {
          alt: 'Status Incident',
          path: '/badge/Status/Queue+Load+94%25?variant=2&color=orange&dot=orange',
        },
        { alt: 'Status Offline', path: '/badge/Status/Unreachable?variant=2&color=rose&dot=red' },
        { alt: 'Status Maintenance', path: '/badge/Status/Scheduled?variant=2&color=sky&dot=sky' },
        { alt: 'Status Beta', path: '/badge/Status/v3+Engine?variant=2&color=violet&dot=violet' },
        { alt: 'Status Standby', path: '/badge/Status/Warm+Spare?variant=3&color=slate&dot=slate' },
      ],
      subtitle: `Animated status dots across all ${THEME_COLOR_NAMES.length} theme colors via ?dot=.`,
      title: 'Pulsing Status Dots (?dot=)',
    },
    {
      items: [
        { alt: 'Single-Part Tag', path: '/badge/XulbuX?icon=sparkles' },
        { alt: 'Secondary Tag', path: '/badge/Verified?variant=2&color=emerald&icon=shield-check' },
        { alt: 'Compact Icon + Value', path: '/badge//100%25?color=amber&icon=zap' },
        { alt: 'Dual-Icon Badge', path: '/badge/Docs/Read?color=sky&icon=book-open,arrow-right' },
        { alt: 'No-Icon Badge', path: '/badge/Platform/Linux?color=rose' },
        { alt: 'Icon-Only Pill', path: '/badge?variant=3&color=neutral&icon=github' },
      ],
      subtitle:
        'Omit the label or value segment, or set left and right icons via ?icon=left,right.',
      title: 'Flexible Layouts (/badge/:label, /badge//:value)',
    },
    {
      items: [
        { alt: 'Sheen Sweep', path: '/badge/Release/v2.0?icon=sparkles&anim=sheen' },
        {
          alt: 'Sheen + Icon Motion',
          path: '/badge/Featured?color=amber&icon=sparkles&anim=sheen,auto',
        },
        {
          alt: 'Icon Spin',
          path: '/badge/Build/Running?variant=2&color=sky&icon=loader&anim=spin',
        },
        {
          alt: 'Icon Pulse',
          path: '/badge/Sponsor/Heart?variant=2&color=rose&icon=heart&anim=pulse',
        },
        {
          alt: 'Icon Nudge',
          path: '/badge/Next/Step?variant=2&color=emerald&icon=none,arrow-right&anim=none,nudge',
        },
        {
          alt: 'Icon Turn',
          path: '/badge/Sync/Active?variant=3&color=cyan&icon=refresh-cw&anim=turn',
        },
        {
          alt: 'Icon Whirl',
          path: '/badge/Orbit/Active?variant=3&color=indigo&icon=orbit&anim=whirl',
        },
        {
          alt: 'Icon Breathe',
          path: '/badge/Aura/Glow?variant=3&color=orange&icon=flame&anim=breathe',
        },
      ],
      subtitle: `Surface sheen, icon motions (${ACTIVE_ICON_MOTION_TOKENS.join('/')}), or combined sheen,auto via ?anim=.`,
      title: 'Micro-Animations (?anim=)',
    },
  ];
}

/**
 * Build the parameter reference rows for `/badge/*` routes.
 * @returns Parameter table rows.
 */
export function buildBadgeParamRows(): ParamTableRow[] {
  return [
    buildVariantParamRow(DEFAULT_BADGE_VARIANT, 'Hierarchy tier'),
    buildColorParamRow(DEFAULT_THEME_COLOR, 'Theme color for gradients, borders, and icons.'),
    buildIconQueryParamRow(
      'Leading icon (icon=name), left and right icons (icon=left,right), right-only icon (icon=none,right), or none.',
      'circle-check | rocket,arrow-right | none,external-link | none | …'
    ),
    buildDotParamRow('Pulsing status dot.'),
    {
      defaultVal: 'none',
      description: `Inline right-side widget: sparkline (${MIN_SERIES_POINTS} to ${MAX_SPARKLINE_POINTS} comma- or space-separated numbers), bars (${MIN_SERIES_POINTS} to ${MAX_BARS_POINTS} numbers), bar or ring percentage (:static disables bar shimmer; :pulse pulses rings), steps (done/total up to ${MAX_STEPS_COUNT}), strip (up to ${MAX_STRIP_TICKS} ticks from 0 to ${STRIP_TICK_MAX_STATE}), or delta.`,
      name: '?special=',
      values: formatSpecialExamples(),
    },
    buildAnimParamRow(),
  ];
}
