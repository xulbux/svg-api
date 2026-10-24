/**
 * Icons documentation catalog – Standalone UI/brand icon showcase cards and parameter reference rows for `/docs/icons`.
 */

import { DEFAULT_THEME_COLOR } from '@/config/theme';
import { ACTIVE_ICON_MOTION_TOKENS, ICON_MOTION_TOKENS } from '@/routes/params';
import { buildColorParamRow, formatRange } from '@/site/catalog/shared';
import { FALLBACK_ICON_SLUG } from '@/svg/icons';
import { ICON_SIZE_RANGE, ICON_STROKE_RANGE } from '@/svg/renderer';
import type { ParamTableRow, ShowcaseCardConfig } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Showcase cards for the dedicated `/docs/icons` page. */
export const ICON_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      { alt: 'Website', path: '/icon/globe-code?size=16&stroke=2.5' },
      { alt: 'Code', path: '/icon/code-xml?size=16&stroke=2.5' },
      { alt: 'Docs', path: '/icon/square-text?size=16&stroke=2.5' },
      { alt: 'Worm', path: '/icon/snake?size=16' },
      { alt: 'Terminal', path: '/icon/square-terminal?color=sky&size=20' },
      { alt: 'Package', path: '/icon/package?color=emerald' },
      { alt: 'Quick Start', path: '/icon/zap?color=amber&size=28' },
      { alt: 'Feedback', path: '/icon/heart-handshake?color=rose&size=28' },
    ],
    subtitle: 'Crisp stroke icons for section headers (size=28) and inline lists (size=16).',
    title: 'UI Stroke Icons (size=16 to 28)',
  },
  {
    items: [
      { alt: 'Arch Linux', path: '/icon/archlinux?color=cyan&size=28' },
      { alt: 'Python', path: '/icon/python?color=amber&size=28' },
      { alt: 'Rust', path: '/icon/rust?color=orange&size=28' },
      { alt: 'TypeScript', path: '/icon/ts?color=blue&size=28' },
      { alt: 'Cloudflare', path: '/icon/cloudflare?color=orange&size=28' },
      { alt: 'GitHub', path: '/icon/github?color=slate&size=28' },
    ],
    subtitle: 'Technology, language, and platform logos tinted with any theme color.',
    title: 'Brand & Tech Logos',
  },
  {
    items: [
      { alt: 'Sheen', path: '/icon/sparkles?color=amber&size=28&anim=sheen' },
      { alt: 'Auto Motion', path: '/icon/loader?color=sky&size=28&anim=auto' },
      { alt: 'Turn', path: '/icon/compass?color=cyan&size=28&anim=turn' },
      { alt: 'Whirl', path: '/icon/orbit?color=indigo&size=28&anim=whirl' },
      { alt: 'Breathe', path: '/icon/flame?color=orange&size=28&anim=breathe' },
      { alt: 'Pulse', path: '/icon/heart?color=rose&size=28&anim=pulse' },
      { alt: 'Sheen + Float', path: '/icon/rocket?color=violet&size=28&anim=sheen,float' },
      { alt: 'Unknown Icon', path: '/icon/not-a-real-icon?color=slate&size=28' },
    ],
    subtitle: `Diagonal sheen, icon motions (${ACTIVE_ICON_MOTION_TOKENS.join('/')}), or sheen,<motion>; Unknown slugs render the fallback icon.`,
    title: 'Animations & Fallback (?anim=)',
  },
];

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the parameter reference rows for `/icon/:icon` routes.
 * @returns Parameter table rows.
 */
export function buildIconParamRows(): ParamTableRow[] {
  return [
    {
      defaultVal: `~required (unknown slugs fall back to ${FALLBACK_ICON_SLUG})`,
      description: 'Icon slug from the picker, or any alias listed below.',
      name: ':icon',
      values: 'rocket | star | python | rust | archlinux | …',
    },
    buildColorParamRow(DEFAULT_THEME_COLOR, 'Theme color applied to the icon.'),
    {
      defaultVal: `${ICON_SIZE_RANGE.default} (px)`,
      description: 'Intrinsic SVG width and height in pixels.',
      name: '?size=',
      values: formatRange(ICON_SIZE_RANGE),
    },
    {
      defaultVal: String(ICON_STROKE_RANGE.default),
      description: 'Stroke width for UI stroke icons (ignored on brand logos).',
      name: '?stroke=',
      values: `${formatRange(ICON_STROKE_RANGE)} (e.g., 1.5, 2.5)`,
    },
    {
      defaultVal: 'default',
      description:
        'Diagonal sheen, an icon motion (auto picks per icon), or sheen,<motion>; Per-icon pairs apply their first motion.',
      name: '?anim=',
      values: `sheen | ${ICON_MOTION_TOKENS.join(' | ')} | sheen,<motion>`,
    },
  ];
}
