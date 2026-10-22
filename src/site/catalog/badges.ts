/**
 * Badges documentation catalog – Variant descriptors, inline widget/status-dot/layout/animation showcase cards, and parameter reference rows for `/docs/badges`.
 */

import {
  buildAnimParamRow,
  buildColorParamRow,
  buildDotParamRow,
  buildIconQueryParamRow,
  buildVariantCards,
  buildVariantParamRow,
} from '@/site/catalog/shared';
import type { VariantDescriptor } from '@/site/catalog/shared';
import { formatSpecialExamples } from '@/site/glossary';
import {
  MAX_BARS_POINTS,
  MAX_SPARKLINE_POINTS,
  MAX_STEPS_COUNT,
  MAX_STRIP_TICKS,
} from '@/svg/renderer';
import type { BadgeVariant, ParamTableRow, ShowcaseCardConfig, ShowcaseItem } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Showcase definitions for the 3 badge hierarchy variants (`1`, `2`, `3`). */
export const BADGE_VARIANT_DESCRIPTORS: readonly VariantDescriptor[] = [
  {
    description: '3D brand gradient right cap for primary status and repository metrics.',
    id: '1',
    title: 'variant=1 · Primary Badge (Default)',
  },
  {
    description: 'Tinted dark 3D right cap with a glowing colored border.',
    id: '2',
    title: 'variant=2 · Secondary Badge',
  },
  {
    description: 'Neutral carbon-dark surface with colored icon and muted value text.',
    id: '3',
    title: 'variant=3 · Tertiary Badge',
  },
];

// -------------------------------------- INTERNALS --------------------------------------

/** Build the 4 static badge items for a `22px` badge variant (`1`, `2`, `3`). */
function buildBadgeVariantItems(variant: BadgeVariant): ShowcaseItem[] {
  return [
    { alt: 'Build', path: `/badge/Build/Passing?icon=circle-check&variant=${variant}` },
    { alt: 'Arch', path: `/badge/Arch/Hyprland?icon=archlinux&color=cyan&variant=${variant}` },
    {
      alt: 'Runtime',
      path: `/badge/Runtime/Cloudflare?icon=cloudflare&color=emerald&variant=${variant}`,
    },
    {
      alt: 'Security',
      path: `/badge/Security/Verified?icon=shield-check&color=rose&variant=${variant}`,
    },
  ];
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the variant showcase cards for `/docs/badges`.
 * @returns Showcase card configurations for the 3 badge variants.
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
          path: '/badge/Requests/1.8k%2Fs?icon=layers&color=indigo&special=bars:3,6,5,8,7,9,6',
        },
        {
          alt: 'Progress Bar Widget',
          path: '/badge/Coverage/92%25?icon=shield-check&color=emerald&special=bar:92',
        },
        {
          alt: 'Steps Widget',
          path: '/badge/Onboarding/4%2F5?icon=circle-check&color=teal&special=steps:4/5',
        },
        {
          alt: 'Donut Ring Widget',
          path: '/badge/KV+Quota/84%25?icon=cpu&color=sky&special=ring:84:pulse',
        },
        {
          alt: 'Uptime Strip Widget',
          path: '/badge/Uptime/99.98%25?dot=green&color=emerald&variant=2&special=strip:9987998999',
        },
        {
          alt: 'Delta Trend Pill',
          path: '/badge/Requests/2.4M%2Fd?icon=trending-up&color=violet&special=delta:%2B38%25',
        },
      ],
      subtitle:
        'Embed sparklines, bar histograms, progress bars, step pills, donut rings, 10-stage strips, and delta pills via ?special=.',
      title: 'Inline Data Visualizations (?special=)',
    },
    {
      items: [
        {
          alt: 'Status Operational',
          path: '/badge/Status/Operational?dot=green&color=emerald&variant=2',
        },
        {
          alt: 'Status Degraded',
          path: '/badge/Status/180ms+Latency?dot=amber&color=amber&variant=2',
        },
        {
          alt: 'Status Incident',
          path: '/badge/Status/Queue+Load+94%25?dot=orange&color=orange&variant=2',
        },
        { alt: 'Status Offline', path: '/badge/Status/Unreachable?dot=red&color=rose&variant=2' },
        { alt: 'Status Maintenance', path: '/badge/Status/Scheduled?dot=sky&color=sky&variant=2' },
        { alt: 'Status Beta', path: '/badge/Status/v3+Engine?dot=violet&color=violet&variant=2' },
        { alt: 'Status Standby', path: '/badge/Status/Warm+Spare?dot=slate&color=slate&variant=3' },
      ],
      subtitle:
        'Outward radar ripple, double-beat warning, urgent pulse, breathing, and standby dots across all 22 theme colors via ?dot=.',
      title: 'Pulsing Radar Status Dots (?dot=)',
    },
    {
      items: [
        { alt: 'Single-Part Tag', path: '/badge/XulbuX?icon=sparkles' },
        { alt: 'Secondary Tag', path: '/badge/Verified?icon=shield-check&color=emerald&variant=2' },
        { alt: 'Compact Icon + Value', path: '/badge//100%25?icon=zap&color=amber' },
        { alt: 'Dual-Icon Badge', path: '/badge/Docs/Read?icon=book-open,arrow-right&color=sky' },
        { alt: 'No-Icon Badge', path: '/badge/Platform/Linux?color=rose' },
        { alt: 'Icon-Only Pill', path: '/badge?icon=github&color=neutral&variant=3' },
      ],
      subtitle:
        'Omit label or value segments, or set both left and right icons via ?icon=left,right.',
      title: 'Flexible Structural Layouts (/badge/:label, /badge//:value)',
    },
    {
      items: [
        { alt: 'Sheen Sweep', path: '/badge/Release/v2.0?icon=sparkles&anim=sheen' },
        {
          alt: 'Sheen + Icon Motion',
          path: '/badge/Featured?icon=sparkles&color=amber&anim=sheen,auto',
        },
        {
          alt: 'Icon Spin',
          path: '/badge/Build/Running?icon=loader&color=sky&variant=2&anim=spin',
        },
        {
          alt: 'Icon Pulse',
          path: '/badge/Sponsor/Heart?icon=heart&color=rose&variant=2&anim=pulse',
        },
        {
          alt: 'Icon Nudge',
          path: '/badge/Next/Step?icon=none,arrow-right&color=emerald&variant=2&anim=none,nudge',
        },
        {
          alt: 'Icon Turn',
          path: '/badge/Sync/Active?icon=refresh-cw&color=cyan&variant=3&anim=turn',
        },
        {
          alt: 'Icon Whirl',
          path: '/badge/Orbit/Active?icon=orbit&color=indigo&variant=3&anim=whirl',
        },
        {
          alt: 'Icon Breathe',
          path: '/badge/Aura/Glow?icon=flame&color=orange&variant=3&anim=breathe',
        },
      ],
      subtitle:
        'Surface sheen, icon motion presets (auto/spin/whirl/turn/shake/nudge/pulse/breathe/float), or combined sheen,auto via ?anim=.',
      title: 'SVG Micro-Animations (?anim=)',
    },
  ];
}

/**
 * Build the parameter reference rows for `/badge/*` routes.
 * @returns Parameter table rows.
 */
export function buildBadgeParamRows(): ParamTableRow[] {
  return [
    buildVariantParamRow('1', 'Hierarchy tier'),
    buildColorParamRow(
      'indigo',
      'Tailwind v4 OKLCH accent palette for gradients, borders, and icons.'
    ),
    buildIconQueryParamRow(
      'Leading left icon (icon=name), both left and right icons (icon=left,right), right-only icon (icon=none,right), or none.',
      'circle-check | rocket,arrow-right | none,external-link | none | …'
    ),
    buildDotParamRow('Pulsing radar status dot.'),
    {
      defaultVal: 'none',
      description: `Inline data widget on the right side: sparkline (2 to ${MAX_SPARKLINE_POINTS} comma- or space-separated numbers), bars (2 to ${MAX_BARS_POINTS} numbers as vertical histogram bars), bar or ring percentage (bars shimmer unless :static; rings pulse only with :pulse), steps (done/total up to ${MAX_STEPS_COUNT} discrete pills), strip (up to ${MAX_STRIP_TICKS} ticks from 0 to 9, as digits or comma/space-separated), or a delta pill.`,
      name: '?special=',
      values: formatSpecialExamples(),
    },
    buildAnimParamRow(),
  ];
}
