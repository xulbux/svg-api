/**
 * Documentation and preview catalog: Single Source of Truth showcase items, Markdown URLs, and parameter tables for `svg.xul.is`.
 */

import { THEME_COLOR_NAMES } from '@/config/theme';
import type { ParamTableRow, ShowcaseCardConfig, ShowcaseItem } from '@/preview/layout';
import {
  renderParamTable,
  renderRoutePills,
  renderShowcaseCard,
  renderUiIcon,
} from '@/preview/layout';
import { renderBadge, renderButton, renderIcon, renderQuote, renderStack } from '@/svg/renderer';
import type { BadgeVariant } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Descriptor for a badge or button variant showcase card. */
interface VariantDescriptor {
  /** Short explanation of the visual hierarchy tier. */
  description: string;
  /** Variant query parameter identifier (`1`, `2`, `3`). */
  id: BadgeVariant;
  /** Display title for the variant card. */
  title: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Showcase definitions for the 3 badge hierarchy variants (`1`, `2`, `3`). */
const BADGE_VARIANT_DESCRIPTORS: readonly VariantDescriptor[] = [
  {
    description: '3D brand gradient right cap for primary status and repository metrics.',
    id: '1',
    title: 'variant=1 · Primary Badge (Default)',
  },
  {
    description: 'Tinted dark right cap with a glowing colored border.',
    id: '2',
    title: 'variant=2 · Secondary Badge',
  },
  {
    description: 'Neutral carbon-dark surface with colored icon and muted value text.',
    id: '3',
    title: 'variant=3 · Tertiary Badge',
  },
];

/** Showcase definitions for the 3 CTA button hierarchy variants (`1`, `2`, `3`). */
const BUTTON_VARIANT_DESCRIPTORS: readonly VariantDescriptor[] = [
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

/** Parameter reference rows for `/badge/*` routes. */
export const BADGE_PARAM_ROWS: readonly ParamTableRow[] = [
  {
    defaultVal: '1',
    description:
      'Hierarchy tier: 1 = Primary gradient, 2 = Secondary tinted dark, 3 = Tertiary neutral dark.',
    name: '?variant=',
    values: '1 | 2 | 3',
  },
  {
    defaultVal: 'indigo',
    description: 'Tailwind v4 OKLCH accent palette for gradients, borders, and icons.',
    name: '?color=',
    values: 'indigo | cyan | emerald | rose | amber | ... (22 colors)',
  },
  {
    defaultVal: 'none',
    description: 'Left-hand Lucide stroke icon or Simple Icons / Devicon slug (none to hide).',
    name: '?icon=',
    values: 'circle-check | rocket | archlinux | cloudflare | none | ...',
  },
  {
    defaultVal: 'none',
    description: 'Pulsing radar status dot by color or preset state name.',
    name: '?dot=',
    values: 'green | online | degraded | incident | offline | maintenance | beta | standby',
  },
  {
    defaultVal: 'none',
    description: 'Appends an inline data widget on the right side of the badge.',
    name: '?special=',
    values: 'sparkline:n,n,... | bar:85 | ring:85:pulse | strip:998799 | delta:+24%',
  },
  {
    defaultVal: '~static',
    description:
      'Surface sheen, icon motion (auto/spin/shake/nudge/pulse/float), combined sheen,<mode>, or none.',
    name: '?anim=',
    values: 'sheen | auto | spin | shake | nudge | pulse | float | sheen,auto | none',
  },
];

/** Parameter reference rows for `/button/*` and `/btn/*` routes. */
export const BUTTON_PARAM_ROWS: readonly ParamTableRow[] = [
  {
    defaultVal: '1',
    description:
      'Surface tier: 1 = Primary 3D gradient, 2 = Secondary tinted dark, 3 = Tertiary neutral dark.',
    name: '?variant=',
    values: '1 | 2 | 3',
  },
  {
    defaultVal: 'md (30px)',
    description: 'Button scale preset (sm=26px, md=30px, lg=36px, xl=42px) or custom pixel height.',
    name: '?size=',
    values: 'sm | md | lg | xl | 22 to 48',
  },
  {
    defaultVal: 'indigo',
    description: 'Tailwind v4 OKLCH accent palette for gradients, borders, and icons.',
    name: '?color=',
    values: 'indigo | cyan | emerald | rose | amber | ... (22 colors)',
  },
  {
    defaultVal: 'none',
    description: 'Leading left-hand Lucide stroke icon or Simple Icons / Devicon brand slug.',
    name: '?icon=',
    values: 'rocket | book-open | sparkles | github | ...',
  },
  {
    defaultVal: 'none',
    description: 'Trailing right-hand icon slug for directional CTAs and external links.',
    name: '?icon_right=',
    values: 'arrow-right | external-link | chevron-right | ...',
  },
  {
    defaultVal: 'none',
    description: 'Leading pulsing radar status dot by color or preset state name.',
    name: '?dot=',
    values: 'green | online | degraded | incident | offline | maintenance | beta | standby',
  },
  {
    defaultVal: '~static',
    description:
      'Surface sheen, icon motion (auto/spin/shake/nudge/pulse/float), combined sheen,<mode>, or none.',
    name: '?anim=',
    values: 'sheen | auto | spin | shake | nudge | pulse | float | sheen,auto | none',
  },
];

/** Route and metric reference rows for `/docs/services` public registry presets. */
export const SERVICE_PARAM_ROWS: readonly ParamTableRow[] = [
  {
    defaultVal: 'variant=1 (preset)',
    description: 'PyPI version, ClickPy total/monthly downloads, required Python, and license.',
    name: '/badge/pypi/:pkg/:metric',
    values: 'v | dt | dl | py | license',
  },
  {
    defaultVal: 'variant=1 (preset)',
    description: 'npm package version, monthly/weekly/yearly downloads, license, and TS types.',
    name: '/badge/npm/:pkg/:metric',
    values: 'v | dl | dw | dt | license | types',
  },
  {
    defaultVal: 'variant=1 (preset)',
    description: 'Scoped npm package metrics (e.g. /badge/npm/@iconify-json/simple-icons/v).',
    name: '/badge/npm/:scope/:pkg/:metric',
    values: 'v | dl | dw | dt | license | types',
  },
  {
    defaultVal: 'variant=1 (preset)',
    description: 'Open VSX extension version, total downloads, and average star rating.',
    name: '/badge/ovsx/:owner/:ext/:metric',
    values: 'v | dt | dl | rating',
  },
  {
    defaultVal: 'variant=1 (preset)',
    description: 'Rust crates.io latest stable version, total/90-day downloads, and license.',
    name: '/badge/crates/:crate/:metric',
    values: 'v | dt | dl | license',
  },
  {
    defaultVal: 'library (official)',
    description: 'Docker Hub image pulls and stars (omit :owner for official library images).',
    name: '/badge/docker/:owner/:repo/:metric',
    values: 'pulls | stars | dt | dl',
  },
  {
    defaultVal: '~service preset',
    description: 'Overrides the default left-hand label text on any service badge.',
    name: '?label=',
    values: '~any string',
  },
  {
    defaultVal: '~service preset',
    description: 'All standard badge query params (?variant=, ?color=, ?icon=, ?anim=) apply.',
    name: '?variant= / ?color= / ...',
    values: '1 | 2 | 3 (and 22 colors)',
  },
];

/** Parameter reference rows for `/icon/:icon` routes. */
export const ICON_PARAM_ROWS: readonly ParamTableRow[] = [
  {
    defaultVal: '~required',
    description: 'Lucide stroke slug, Simple Icons slug, Devicon Plain slug, or alias.',
    name: ':icon',
    values: 'rocket | star | python | rust | archlinux | ...',
  },
  {
    defaultVal: 'indigo',
    description: 'Tailwind v4 OKLCH theme color applied to the icon stroke or fill.',
    name: '?color=',
    values: 'indigo | cyan | emerald | rose | amber | ... (22 colors)',
  },
  {
    defaultVal: '24 (px)',
    description: 'Intrinsic SVG width and height in pixels.',
    name: '?size=',
    values: '12 to 128',
  },
  {
    defaultVal: '2',
    description: 'Stroke width for Lucide stroke icons.',
    name: '?stroke=',
    values: '1 to 3 (e.g. 2.25, 2.5)',
  },
  {
    defaultVal: '~static',
    description:
      'Diagonal sheen, icon motion (auto/spin/shake/nudge/pulse/float), combined sheen,<mode>, or none.',
    name: '?anim=',
    values: 'sheen | auto | spin | shake | nudge | pulse | float | sheen,auto | none',
  },
];

/** Parameter reference rows for `/stack/:icons` routes. */
export const STACK_PARAM_ROWS: readonly ParamTableRow[] = [
  {
    defaultVal: '~required',
    description: 'Icon slugs with :N columns per group, | side-by-side groups, and ; row bands.',
    name: ':icons / ?i=',
    values: 'c,cpp,cs,rust:4 | aws,cloudflare:2 ; figma,blender:2',
  },
  {
    defaultVal: '2',
    description:
      'Tile hierarchy: 1 = Primary gradient, 2 = Secondary tinted, 3 = Tertiary neutral.',
    name: '?variant=',
    values: '1 | 2 | 3',
  },
  {
    defaultVal: '~per-icon brand color',
    description: 'Uniform theme color override applied to all tiles.',
    name: '?color=',
    values: 'indigo | cyan | emerald | rose | amber | ... (22 colors)',
  },
  {
    defaultVal: '8',
    description: 'Fallback column count per row (or comma-separated list per group).',
    name: '?perline=',
    values: '1 to 20 (or 8,6,6,4,3,3)',
  },
  {
    defaultVal: '42 (px)',
    description: 'Width and height of each rounded square tile in pixels.',
    name: '?size=',
    values: '24 to 96',
  },
  {
    defaultVal: '8 (gap) / 38 (groupgap)',
    description: 'Tile spacing (?gap= within groups, ?groupgap= between groups).',
    name: '?gap= / ?groupgap=',
    values: '2 to 24 / 12 to 80',
  },
];

/** Parameter reference rows for `/quote/:author/:text` routes. */
export const QUOTE_PARAM_ROWS: readonly ParamTableRow[] = [
  {
    defaultVal: '~required',
    description: 'Quote body text (+ or %20 for spaces) and optional author attribution.',
    name: ':author / :text',
    values: '/quote/XulbuX/Your+quote+here | /quote/Your+quote?author=XulbuX',
  },
  {
    defaultVal: '2',
    description: 'Surface tier: 1 = Primary gradient, 2 = Secondary tinted, 3 = Tertiary neutral.',
    name: '?variant=',
    values: '1 | 2 | 3',
  },
  {
    defaultVal: 'horizontal',
    description: 'Layout mode: horizontal (left accent bar) or vertical (centered watermarks).',
    name: '?layout=',
    values: 'horizontal | vertical',
  },
  {
    defaultVal: 'md (15px) / lg (vert)',
    description: 'Typography scale preset (sm, md, lg, xl) or custom pixel size.',
    name: '?size=',
    values: 'sm | md | lg | xl | 11 to 28',
  },
  {
    defaultVal: 'indigo',
    description: 'Tailwind v4 OKLCH accent color for surface, border, and quote marks.',
    name: '?color=',
    values: 'indigo | cyan | emerald | rose | amber | ... (22 colors)',
  },
  {
    defaultVal: '560 (horiz) / 380 (vert)',
    description: 'Card width in pixels; height adapts automatically to wrapped lines.',
    name: '?width=',
    values: '240 to 900',
  },
];

/** Multi-group tech stack DSL matching the full 60-icon profile layout. */
export const FULL_PROFILE_GROUPS_DSL = [
  'c,cpp,cs,rust,java,py,js,ts,php,lua,bash,powershell,html,css,sass,md:8',
  'dotnet,vue,pinia,laravel,symfony,nodejs,threejs,tauri,unity,unreal,tailwind,wordpress:6',
  'git,github,githubactions,vscode,visualstudio,npm,vite,cmake,linux,windows,raspberrypi,arduino:6|aws,azure,cloudflare,firebase,netlify,terraform,mysql,sqlite:4',
  'figma,ai,blender,ps,pr,ae:3|obsidian,notion,codepen,gtk,latex,regex:3',
].join(';');

// -------------------------------------- INTERNALS --------------------------------------

/** Build the 4 static badge items for a `22px` badge variant (`1`, `2`, `3`). */
function buildBadgeVariantItems(variant: BadgeVariant): ShowcaseItem[] {
  return [
    {
      alt: 'build',
      path: `/badge/build/passing?icon=circle-check&variant=${variant}`,
      svg: renderBadge({
        color: 'indigo',
        icon: 'circle-check',
        label: 'build',
        value: 'passing',
        variant,
      }),
    },
    {
      alt: 'arch',
      path: `/badge/arch/hyprland?icon=archlinux&color=cyan&variant=${variant}`,
      svg: renderBadge({
        color: 'cyan',
        icon: 'archlinux',
        label: 'arch',
        value: 'hyprland',
        variant,
      }),
    },
    {
      alt: 'runtime',
      path: `/badge/runtime/cloudflare?icon=cloudflare&color=emerald&variant=${variant}`,
      svg: renderBadge({
        color: 'emerald',
        icon: 'cloudflare',
        label: 'runtime',
        value: 'cloudflare',
        variant,
      }),
    },
    {
      alt: 'security',
      path: `/badge/security/verified?icon=shield-check&color=rose&variant=${variant}`,
      svg: renderBadge({
        color: 'rose',
        icon: 'shield-check',
        label: 'security',
        value: 'verified',
        variant,
      }),
    },
  ];
}

/** Build the 4 CTA button items for a `30px` button variant (`1`, `2`, `3`). */
function buildButtonVariantItems(variant: BadgeVariant): ShowcaseItem[] {
  return [
    {
      alt: 'Documentation',
      href: 'https://svg.xul.is/docs/badges',
      path: `/button/Documentation?icon=book-open&variant=${variant}`,
      svg: renderButton({ color: 'indigo', icon: 'book-open', label: 'Documentation', variant }),
    },
    {
      alt: 'Install Arch',
      path: `/button/Install+Arch?icon=archlinux&color=cyan&variant=${variant}`,
      svg: renderButton({ color: 'cyan', icon: 'archlinux', label: 'Install Arch', variant }),
    },
    {
      alt: 'Latest Release',
      path: `/button/Latest+Release?icon=rocket&color=emerald&variant=${variant}`,
      svg: renderButton({ color: 'emerald', icon: 'rocket', label: 'Latest Release', variant }),
    },
    {
      alt: 'Report Issue',
      path: `/button/Report+Issue?icon=bug&color=rose&variant=${variant}`,
      svg: renderButton({ color: 'rose', icon: 'bug', label: 'Report Issue', variant }),
    },
  ];
}

/** Build the showcase cards for inline data widgets, status presets, structural layouts, and micro-animations. */
function buildBadgeUseCaseCards(): ShowcaseCardConfig[] {
  return [
    {
      items: [
        {
          alt: 'Sparkline Widget',
          path: '/badge/latency/14ms?icon=activity&special=sparkline:22,19,21,17,15,16,14',
          svg: renderBadge({
            color: 'indigo',
            icon: 'activity',
            label: 'latency',
            special: { type: 'sparkline', values: [22, 19, 21, 17, 15, 16, 14] },
            value: '14ms',
            variant: '1',
          }),
        },
        {
          alt: 'Progress Bar Widget',
          path: '/badge/coverage/92%25?icon=shield-check&color=emerald&special=bar:92',
          svg: renderBadge({
            color: 'emerald',
            icon: 'shield-check',
            label: 'coverage',
            special: { type: 'bar', value: 92 },
            value: '92%',
            variant: '1',
          }),
        },
        {
          alt: 'Donut Ring Widget',
          path: '/badge/kv+quota/84%25?icon=cpu&color=sky&special=ring:84:pulse',
          svg: renderBadge({
            color: 'sky',
            icon: 'cpu',
            label: 'kv quota',
            special: { hasPulse: true, type: 'ring', value: 84 },
            value: '84%',
            variant: '1',
          }),
        },
        {
          alt: 'Uptime Strip Widget',
          path: '/badge/status/online/99.98%25?special=strip:9987998999',
          svg: renderBadge({
            color: 'emerald',
            dot: 'green',
            label: 'status',
            special: { states: ['9', '9', '8', '7', '9', '9', '8', '9', '9', '9'], type: 'strip' },
            value: '99.98%',
            variant: '2',
          }),
        },
        {
          alt: 'Delta Trend Pill',
          path: '/badge/requests/2.4M%2Fd?icon=trending-up&color=violet&special=delta:%2B38%25',
          svg: renderBadge({
            color: 'violet',
            icon: 'trending-up',
            label: 'requests',
            special: { type: 'delta', value: '+38%' },
            value: '2.4M/d',
            variant: '1',
          }),
        },
      ],
      subtitle:
        'Embed sparklines, progress bars, donut rings, 10-stage strips, and delta pills via ?special=.',
      title: 'Inline Data Visualizations (?special=)',
    },
    {
      items: [
        {
          alt: 'Status Online',
          path: '/badge/status/online/operational',
          svg: renderBadge({
            color: 'emerald',
            dot: 'green',
            label: 'status',
            value: 'operational',
            variant: '2',
          }),
        },
        {
          alt: 'Status Degraded',
          path: '/badge/status/degraded/180ms+latency',
          svg: renderBadge({
            color: 'amber',
            dot: 'amber',
            label: 'status',
            value: '180ms latency',
            variant: '2',
          }),
        },
        {
          alt: 'Status Incident',
          path: '/badge/status/incident/queue+load+94%25',
          svg: renderBadge({
            color: 'orange',
            dot: 'orange',
            label: 'status',
            value: 'queue load 94%',
            variant: '2',
          }),
        },
        {
          alt: 'Status Offline',
          path: '/badge/status/offline/unreachable',
          svg: renderBadge({
            color: 'rose',
            dot: 'red',
            label: 'status',
            value: 'unreachable',
            variant: '2',
          }),
        },
        {
          alt: 'Status Maintenance',
          path: '/badge/status/maintenance/scheduled',
          svg: renderBadge({
            color: 'sky',
            dot: 'sky',
            label: 'status',
            value: 'scheduled',
            variant: '2',
          }),
        },
        {
          alt: 'Status Beta',
          path: '/badge/status/beta/v3+engine',
          svg: renderBadge({
            color: 'violet',
            dot: 'violet',
            label: 'status',
            value: 'v3 engine',
            variant: '2',
          }),
        },
      ],
      subtitle: 'Outward radar ripple dots via /badge/status/:state/:text or ?dot=.',
      title: 'Pulsing Radar Status Presets (/badge/status/:state/:text)',
    },
    {
      items: [
        {
          alt: 'Single-Part Tag',
          path: '/badge/xulbux?icon=sparkles',
          svg: renderBadge({ color: 'indigo', icon: 'sparkles', label: 'xulbux', variant: '1' }),
        },
        {
          alt: 'Secondary Tag',
          path: '/badge/verified?icon=shield-check&color=emerald&variant=2',
          svg: renderBadge({
            color: 'emerald',
            icon: 'shield-check',
            label: 'verified',
            variant: '2',
          }),
        },
        {
          alt: 'Compact Icon + Value',
          path: '/badge//100%25?icon=zap',
          svg: renderBadge({
            color: 'indigo',
            icon: 'zap',
            label: '',
            value: '100%',
            variant: '1',
          }),
        },
        {
          alt: 'Icon-Only Pill',
          path: '/badge/?icon=github',
          svg: renderBadge({ color: 'indigo', icon: 'github', label: '', variant: '1' }),
        },
        {
          alt: 'No-Icon Badge',
          path: '/badge/platform/linux',
          svg: renderBadge({ color: 'indigo', label: 'platform', value: 'linux', variant: '1' }),
        },
      ],
      subtitle:
        'Omit label or value segments for compact icon+value pills, single-part tags, or icon-only badges.',
      title: 'Flexible Structural Layouts (/badge/:label, /badge//:value)',
    },
    {
      items: [
        {
          alt: 'Sheen Sweep',
          path: '/badge/Release/v2.0?icon=sparkles&anim=sheen',
          svg: renderBadge({
            anim: 'sheen',
            color: 'indigo',
            icon: 'sparkles',
            label: 'Release',
            value: 'v2.0',
            variant: '1',
          }),
        },
        {
          alt: 'Sheen + Icon Motion',
          path: '/badge/Featured?icon=sparkles&anim=sheen,auto',
          svg: renderBadge({
            anim: 'sheen,auto',
            color: 'indigo',
            icon: 'sparkles',
            label: 'Featured',
            variant: '1',
          }),
        },
        {
          alt: 'Icon Spin',
          path: '/badge/build/running?icon=loader&color=sky&anim=spin',
          svg: renderBadge({
            anim: 'spin',
            color: 'sky',
            icon: 'loader',
            label: 'build',
            value: 'running',
            variant: '2',
          }),
        },
        {
          alt: 'Icon Pulse',
          path: '/badge/sponsor/heart?icon=heart&color=rose&anim=pulse',
          svg: renderBadge({
            anim: 'pulse',
            color: 'rose',
            icon: 'heart',
            label: 'sponsor',
            value: 'heart',
            variant: '2',
          }),
        },
        {
          alt: 'Icon Nudge',
          path: '/badge/next/step?icon=arrow-right&anim=nudge',
          svg: renderBadge({
            anim: 'nudge',
            color: 'indigo',
            icon: 'arrow-right',
            label: 'next',
            value: 'step',
            variant: '1',
          }),
        },
      ],
      subtitle:
        'Surface sheen, icon motion presets (auto/spin/shake/nudge/pulse/float), or combined sheen,auto via ?anim=.',
      title: 'SVG Micro-Animations (?anim=)',
    },
  ];
}

/** Build the showcase cards for the dedicated `/docs/buttons` page. */
function buildButtonUseCaseCards(): ShowcaseCardConfig[] {
  return [
    {
      items: [
        {
          alt: 'Small Button',
          path: '/button/Small+26px?icon=sparkles&size=sm',
          svg: renderButton({
            color: 'indigo',
            icon: 'sparkles',
            label: 'Small 26px',
            size: 'sm',
            variant: '1',
          }),
        },
        {
          alt: 'Medium Button',
          path: '/button/Medium+30px?icon=rocket&size=md',
          svg: renderButton({
            color: 'indigo',
            icon: 'rocket',
            label: 'Medium 30px',
            size: 'md',
            variant: '1',
          }),
        },
        {
          alt: 'Large Button',
          path: '/button/Large+36px?icon=zap&size=lg&color=cyan',
          svg: renderButton({
            color: 'cyan',
            icon: 'zap',
            label: 'Large 36px',
            size: 'lg',
            variant: '1',
          }),
        },
        {
          alt: 'XL Hero Button',
          path: '/button/XL+Hero+42px?icon=flame&size=xl&color=rose',
          svg: renderButton({
            color: 'rose',
            icon: 'flame',
            label: 'XL Hero 42px',
            size: 'xl',
            variant: '1',
          }),
        },
      ],
      subtitle:
        'Scale button height, padding, font size, and icon dimensions with ?size=sm|md|lg|xl or a custom pixel height (22 to 48).',
      title: 'Button Size Scale (?size=sm|md|lg|xl)',
    },
    {
      items: [
        {
          alt: 'Explore Docs',
          href: 'https://svg.xul.is/docs/badges',
          path: '/button/Explore+Docs?icon=book-open&icon_right=arrow-right&anim=nudge',
          svg: renderButton({
            anim: 'nudge',
            color: 'indigo',
            icon: 'book-open',
            iconRight: 'arrow-right',
            label: 'Explore Docs',
            variant: '1',
          }),
        },
        {
          alt: 'Open Website',
          href: 'https://xul.is',
          path: '/button/Open+Website?icon=globe&icon_right=external-link&color=sky&variant=2',
          svg: renderButton({
            color: 'sky',
            icon: 'globe',
            iconRight: 'external-link',
            label: 'Open Website',
            variant: '2',
          }),
        },
        {
          alt: 'Continue',
          path: '/btn/Continue?icon_right=chevron-right&color=emerald',
          svg: renderButton({
            color: 'emerald',
            iconRight: 'chevron-right',
            label: 'Continue',
            variant: '1',
          }),
        },
      ],
      subtitle:
        'Add a trailing right-hand directional or external-link icon alongside or instead of a leading icon via ?icon_right=.',
      title: 'Trailing Icons & Directional CTAs (?icon_right=)',
    },
    {
      items: [
        {
          alt: 'Get Started',
          href: 'https://svg.xul.is/docs/badges',
          path: '/button/Get+Started?icon=sparkles&icon_right=arrow-right&anim=sheen',
          svg: renderButton({
            anim: 'sheen',
            color: 'indigo',
            icon: 'sparkles',
            iconRight: 'arrow-right',
            label: 'Get Started',
            variant: '1',
          }),
        },
        {
          alt: 'Live Demo',
          path: '/button/Live+Demo?dot=online&color=emerald&variant=2',
          svg: renderButton({ color: 'emerald', dot: 'green', label: 'Live Demo', variant: '2' }),
        },
        {
          alt: 'Sponsor',
          path: '/button/Sponsor?icon=heart&color=rose&variant=2&anim=pulse',
          svg: renderButton({
            anim: 'pulse',
            color: 'rose',
            icon: 'heart',
            label: 'Sponsor',
            variant: '2',
          }),
        },
      ],
      subtitle:
        'Combine diagonal surface sheen (?anim=sheen), pulsing status dots (?dot=), and icon motion (?anim=pulse|auto|...).',
      title: 'Surface Sheen, Status Dots & Icon Motion (?anim= & ?dot=)',
    },
    {
      items: [
        {
          alt: 'Deploy Production',
          path: '/button/Deploy/Production?icon=rocket',
          svg: renderButton({
            color: 'indigo',
            icon: 'rocket',
            label: 'Deploy',
            value: 'Production',
            variant: '1',
          }),
        },
        {
          alt: 'Download v1.4.0',
          path: '/button/Download/v1.4.0?icon=download&icon_right=arrow-right&color=emerald&variant=2',
          svg: renderButton({
            color: 'emerald',
            icon: 'download',
            iconRight: 'arrow-right',
            label: 'Download',
            value: 'v1.4.0',
            variant: '2',
          }),
        },
        {
          alt: 'Discussions Open',
          path: '/btn/Discussions/Join?icon=message-square&color=violet&variant=3',
          svg: renderButton({
            color: 'violet',
            icon: 'message-square',
            label: 'Discussions',
            value: 'Join',
            variant: '3',
          }),
        },
      ],
      subtitle:
        'Pass a second path segment (/button/:label/:value or /btn/:label/:value) for split action buttons with a vertical divider.',
      title: 'Two-Segment Split Action Buttons (/button/:label/:value)',
    },
  ];
}

/** Build the showcase cards for the dedicated `/docs/services` page. */
function buildServicePresetCards(): ShowcaseCardConfig[] {
  return [
    {
      items: [
        {
          alt: 'PyPI Version',
          href: 'https://pypi.org/project/xulbux/',
          path: '/badge/pypi/xulbux/v',
          svg: renderBadge({
            color: 'sky',
            icon: 'pypi',
            label: 'pypi',
            value: 'v1.4.0',
            variant: '1',
          }),
        },
        {
          alt: 'PyPI Total Downloads',
          href: 'https://clickpy.clickhouse.com/dashboard/xulbux',
          path: '/badge/pypi/xulbux/dt',
          svg: renderBadge({
            color: 'indigo',
            icon: 'download',
            label: 'downloads',
            value: '86.8k',
            variant: '1',
          }),
        },
        {
          alt: 'PyPI Monthly Downloads',
          href: 'https://clickpy.clickhouse.com/dashboard/xulbux',
          path: '/badge/pypi/xulbux/dl',
          svg: renderBadge({
            color: 'emerald',
            icon: 'download',
            label: 'downloads',
            value: '3.3k/mo',
            variant: '1',
          }),
        },
        {
          alt: 'Python Version',
          href: 'https://pypi.org/project/xulbux/',
          path: '/badge/pypi/xulbux/py',
          svg: renderBadge({
            color: 'amber',
            icon: 'python',
            label: 'python',
            value: '>=3.10',
            variant: '1',
          }),
        },
        {
          alt: 'PyPI License',
          href: 'https://pypi.org/project/xulbux/',
          path: '/badge/pypi/xulbux/license',
          svg: renderBadge({
            color: 'slate',
            icon: 'scale',
            label: 'license',
            value: 'MIT',
            variant: '1',
          }),
        },
      ],
      subtitle:
        'Live package version, required Python, license, and ClickHouse ClickPy download stats.',
      title: 'PyPI & ClickPy (/badge/pypi/:pkg/:metric)',
    },
    {
      items: [
        {
          alt: 'npm Version',
          href: 'https://www.npmjs.com/package/hono',
          path: '/badge/npm/hono/v',
          svg: renderBadge({
            color: 'rose',
            icon: 'npm',
            label: 'npm',
            value: 'v4.13.13',
            variant: '1',
          }),
        },
        {
          alt: 'npm Monthly Downloads',
          href: 'https://www.npmjs.com/package/hono',
          path: '/badge/npm/hono/dl',
          svg: renderBadge({
            color: 'emerald',
            icon: 'download',
            label: 'downloads',
            value: '4.2M/mo',
            variant: '1',
          }),
        },
        {
          alt: 'npm Weekly Downloads',
          href: 'https://www.npmjs.com/package/hono',
          path: '/badge/npm/hono/dw',
          svg: renderBadge({
            color: 'sky',
            icon: 'download',
            label: 'downloads',
            value: '1.1M/wk',
            variant: '1',
          }),
        },
        {
          alt: 'TypeScript Types',
          href: 'https://www.npmjs.com/package/hono',
          path: '/badge/npm/hono/types',
          svg: renderBadge({
            color: 'blue',
            icon: 'ts',
            label: 'types',
            value: 'included',
            variant: '1',
          }),
        },
        {
          alt: 'Scoped npm Version',
          href: 'https://www.npmjs.com/package/@iconify-json/simple-icons',
          path: '/badge/npm/@iconify-json/simple-icons/v',
          svg: renderBadge({
            color: 'rose',
            icon: 'npm',
            label: 'npm',
            value: 'v1.2.100',
            variant: '1',
          }),
        },
      ],
      subtitle:
        'Supports both unscoped (/badge/npm/:pkg/:metric) and scoped (/badge/npm/:scope/:pkg/:metric) packages.',
      title: 'npm Registry (/badge/npm/:pkg/:metric)',
    },
    {
      items: [
        {
          alt: 'Open VSX Version',
          href: 'https://open-vsx.org/extension/xulbux/color-tracr',
          path: '/badge/ovsx/xulbux/color-tracr/v',
          svg: renderBadge({
            color: 'indigo',
            icon: 'puzzle',
            label: 'open vsx',
            value: 'v1.2.3',
            variant: '1',
          }),
        },
        {
          alt: 'Open VSX Downloads',
          href: 'https://open-vsx.org/extension/xulbux/color-tracr',
          path: '/badge/ovsx/xulbux/color-tracr/dt',
          svg: renderBadge({
            color: 'violet',
            icon: 'download',
            label: 'downloads',
            value: '2.5k',
            variant: '1',
          }),
        },
        {
          alt: 'Open VSX Rating',
          href: 'https://open-vsx.org/extension/xulbux/color-tracr',
          path: '/badge/ovsx/xulbux/color-tracr/rating',
          svg: renderBadge({
            color: 'amber',
            icon: 'star',
            label: 'rating',
            value: '5.0/5',
            variant: '1',
          }),
        },
      ],
      subtitle: 'Version, total downloads, and average star rating for any Open VSX extension.',
      title: 'Open VSX Registry (/badge/ovsx/:owner/:ext/:metric)',
    },
    {
      items: [
        {
          alt: 'Crates.io Version',
          href: 'https://crates.io/crates/serde',
          path: '/badge/crates/serde/v',
          svg: renderBadge({
            color: 'orange',
            icon: 'rust',
            label: 'crates.io',
            value: 'v1.0.219',
            variant: '1',
          }),
        },
        {
          alt: 'Crates.io Total Downloads',
          href: 'https://crates.io/crates/serde',
          path: '/badge/crates/serde/dt',
          svg: renderBadge({
            color: 'indigo',
            icon: 'download',
            label: 'downloads',
            value: '490M',
            variant: '1',
          }),
        },
        {
          alt: 'Crates.io Recent Downloads',
          href: 'https://crates.io/crates/serde',
          path: '/badge/crates/serde/dl',
          svg: renderBadge({
            color: 'emerald',
            icon: 'download',
            label: 'downloads',
            value: '68.4M/90d',
            variant: '1',
          }),
        },
        {
          alt: 'Docker Pulls',
          href: 'https://hub.docker.com/_/alpine',
          path: '/badge/docker/alpine/pulls',
          svg: renderBadge({
            color: 'sky',
            icon: 'docker',
            label: 'docker pulls',
            value: '1B',
            variant: '1',
          }),
        },
        {
          alt: 'Docker Stars',
          href: 'https://hub.docker.com/_/postgres',
          path: '/badge/docker/postgres/stars',
          svg: renderBadge({
            color: 'amber',
            icon: 'star',
            label: 'docker stars',
            value: '14.2k',
            variant: '1',
          }),
        },
      ],
      subtitle: 'Rust crates.io package metrics and Docker Hub container pull/star counters.',
      title: 'Crates.io & Docker Hub (/badge/crates/*, /badge/docker/*)',
    },
  ];
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the complete `22px` Status Badges (`/docs/badges`) documentation section HTML.
 * @returns HTML string for the `/docs/badges` documentation and live preview section.
 */
export function renderBadgesSectionHtml(): string {
  let variantCardsHtml = '';
  for (const descriptor of BADGE_VARIANT_DESCRIPTORS) {
    variantCardsHtml += renderShowcaseCard({
      items: buildBadgeVariantItems(descriptor.id),
      subtitle: descriptor.description,
      title: descriptor.title,
    });
  }

  const useCaseCards = buildBadgeUseCaseCards();
  let useCaseCardsHtml = '';
  for (const card of useCaseCards) {
    useCaseCardsHtml += renderShowcaseCard(card);
  }

  const layersSubIcon = renderUiIcon('layers', 16);
  const zapSubIcon = renderUiIcon('zap', 16);

  return `<section class="doc-section" id="badges">
    <div class="section-header">
      <h2 class="section-title">Status &amp; Metadata Badges</h2>
      <p class="section-desc">Two-segment and single-segment 22px badges with pulsing radar dots, inline charts, and 3 visual hierarchy tiers.</p>
      ${renderRoutePills(['/badge/:label/:value', '/badge/:label', '/badge/status/:state/:text'])}
    </div>
    ${renderParamTable(BADGE_PARAM_ROWS)}
    <h3 class="section-subhead">${layersSubIcon}<span class="subhead-text">Visual Hierarchy Variants (<code>?variant=</code>)</span></h3>
    <div class="card-grid-3">${variantCardsHtml}</div>
    <h3 class="section-subhead">${zapSubIcon}<span class="subhead-text">Inline Widgets, Status Presets &amp; Layouts</span></h3>
    <div class="card-grid">${useCaseCardsHtml}</div>
  </section>`;
}

/**
 * Render the dedicated CTA Buttons (`/docs/buttons`) documentation section HTML.
 * @returns HTML string for the `/docs/buttons` documentation and live preview section.
 */
export function renderButtonsSectionHtml(): string {
  let variantCardsHtml = '';
  for (const descriptor of BUTTON_VARIANT_DESCRIPTORS) {
    variantCardsHtml += renderShowcaseCard({
      items: buildButtonVariantItems(descriptor.id),
      subtitle: descriptor.description,
      title: descriptor.title,
    });
  }

  const useCaseCards = buildButtonUseCaseCards();
  let useCaseCardsHtml = '';
  for (const card of useCaseCards) {
    useCaseCardsHtml += renderShowcaseCard(card);
  }

  const layersSubIcon = renderUiIcon('layers', 16);
  const slidersSubIcon = renderUiIcon('sliders-horizontal', 16);

  return `<section class="doc-section" id="buttons">
    <div class="section-header">
      <h2 class="section-title">Interactive CTA Buttons</h2>
      <p class="section-desc">Dedicated 3D Kumo action buttons with configurable size presets (<code>sm</code>, <code>md</code>, <code>lg</code>, <code>xl</code>), trailing icons, status dots, and split compartments.</p>
      ${renderRoutePills([
        '/button/:label',
        '/btn/:label',
        '/button/:label/:value',
        '/btn/:label/:value',
      ])}
    </div>
    ${renderParamTable(BUTTON_PARAM_ROWS)}
    <h3 class="section-subhead">${layersSubIcon}<span class="subhead-text">Visual Hierarchy Variants (<code>?variant=</code>)</span></h3>
    <div class="card-grid-3">${variantCardsHtml}</div>
    <h3 class="section-subhead">${slidersSubIcon}<span class="subhead-text">Size Scale, Trailing Icons, Animations &amp; Split Buttons</span></h3>
    <div class="card-grid">${useCaseCardsHtml}</div>
  </section>`;
}

/**
 * Render the dedicated Public Service Badges (`/docs/services`) documentation section HTML.
 * @returns HTML string for the `/docs/services` documentation and live preview section.
 */
export function renderServicesSectionHtml(): string {
  const serviceCards = buildServicePresetCards();
  let cardsHtml = '';
  for (const card of serviceCards) {
    cardsHtml += renderShowcaseCard(card);
  }

  return `<section class="doc-section" id="services">
    <div class="section-header">
      <h2 class="section-title">Live Service Badges</h2>
      <p class="section-desc">Auto-fetched metrics for PyPI, npm, Open VSX, crates.io, and Docker Hub with dual-layer edge caching and smart 302 redirects when opened in a browser tab.</p>
      ${renderRoutePills([
        '/badge/pypi/:pkg/:metric',
        '/badge/npm/:pkg/:metric',
        '/badge/ovsx/:owner/:ext/:metric',
        '/badge/crates/:crate/:metric',
        '/badge/docker/:owner/:repo/:metric',
      ])}
    </div>
    ${renderParamTable(SERVICE_PARAM_ROWS)}
    <div class="card-grid">${cardsHtml}</div>
  </section>`;
}

/**
 * Render the Standalone Icons (`/icon/:icon`) documentation section HTML.
 * @returns HTML string for the `/icon/*` documentation and live preview section.
 */
export function renderIconsSectionHtml(): string {
  const inlineUiCard: ShowcaseCardConfig = {
    items: [
      {
        alt: 'Website',
        path: '/icon/globe-code?size=16&stroke=2.5',
        svg: renderIcon({ color: 'indigo', icon: 'globe-code', size: 16, strokeWidth: 2.5 }),
      },
      {
        alt: 'Code',
        path: '/icon/code-xml?size=16&stroke=2.5',
        svg: renderIcon({ color: 'indigo', icon: 'code-xml', size: 16, strokeWidth: 2.5 }),
      },
      {
        alt: 'Docs',
        path: '/icon/square-text?size=16&stroke=2.5',
        svg: renderIcon({ color: 'indigo', icon: 'square-text', size: 16, strokeWidth: 2.5 }),
      },
      {
        alt: 'Python',
        path: '/icon/snake?size=16',
        svg: renderIcon({ color: 'indigo', icon: 'snake', size: 16 }),
      },
      {
        alt: 'Terminal',
        path: '/icon/square-terminal?color=sky&size=20',
        svg: renderIcon({ color: 'sky', icon: 'square-terminal', size: 20 }),
      },
      {
        alt: 'Package',
        path: '/icon/package?color=emerald',
        svg: renderIcon({ color: 'emerald', icon: 'package', size: 24 }),
      },
      {
        alt: 'Quick Start',
        path: '/icon/zap?color=amber&size=28',
        svg: renderIcon({ color: 'amber', icon: 'zap', size: 28 }),
      },
      {
        alt: 'Feedback',
        path: '/icon/heart-handshake?color=rose&size=28',
        svg: renderIcon({ color: 'rose', icon: 'heart-handshake', size: 28 }),
      },
    ],
    subtitle: 'For README section headers (size=28 or 40) and inline lists (size=16).',
    title: 'Lucide UI Stroke Icons (size=16 to 28)',
  };

  const brandIconsCard: ShowcaseCardConfig = {
    items: [
      {
        alt: 'Arch Linux',
        path: '/icon/archlinux?color=cyan&size=28',
        svg: renderIcon({ color: 'cyan', icon: 'archlinux', size: 28 }),
      },
      {
        alt: 'Python',
        path: '/icon/python?color=amber&size=28',
        svg: renderIcon({ color: 'amber', icon: 'python', size: 28 }),
      },
      {
        alt: 'Rust',
        path: '/icon/rust?color=orange&size=28',
        svg: renderIcon({ color: 'orange', icon: 'rust', size: 28 }),
      },
      {
        alt: 'TypeScript',
        path: '/icon/ts?color=blue&size=28',
        svg: renderIcon({ color: 'blue', icon: 'ts', size: 28 }),
      },
      {
        alt: 'Cloudflare',
        path: '/icon/cloudflare?color=orange&size=28',
        svg: renderIcon({ color: 'orange', icon: 'cloudflare', size: 28 }),
      },
      {
        alt: 'GitHub',
        path: '/icon/github?color=slate&size=28',
        svg: renderIcon({ color: 'slate', icon: 'github', size: 28 }),
      },
    ],
    subtitle: '3,300+ Simple Icons and Devicon Plain vector logos tinted with any OKLCH color.',
    title:
      'Brand & Technology Vector Icons (@iconify-json/simple-icons, @iconify-json/devicon-plain)',
  };

  return `<section class="doc-section" id="icons">
    <div class="section-header">
      <h2 class="section-title">Standalone UI &amp; Brand Icons</h2>
      <p class="section-desc">1,500+ Lucide stroke icons and 3,300+ Simple Icons / Devicon brand marks with intrinsic pixel dimensions baked into the root <code>&lt;svg&gt;</code>.</p>
      ${renderRoutePills(['svg.xul.is/icon/:icon'])}
    </div>
    ${renderParamTable(ICON_PARAM_ROWS)}
    <div class="card-grid">
      ${renderShowcaseCard(inlineUiCard)}
      ${renderShowcaseCard(brandIconsCard)}
    </div>
  </section>`;
}

/**
 * Render the Tech Stack Grids (`/stack/:icons`) documentation section HTML.
 * @returns HTML string for the `/stack/*` documentation and live preview section.
 */
export function renderStackSectionHtml(): string {
  const stackCards: ShowcaseCardConfig[] = [
    {
      isCentered: true,
      items: [
        {
          alt: 'Tech Stack (Variant 1)',
          path: `/stack/${FULL_PROFILE_GROUPS_DSL}?variant=1`,
          svg: renderStack({ icons: [FULL_PROFILE_GROUPS_DSL], variant: '1' }),
        },
      ],
      subtitle: 'Filled 3D brand gradient tiles with crisp white icons.',
      title: 'variant=1 · Primary Brand Gradient Stack (60 Icons)',
    },
    {
      isCentered: true,
      items: [
        {
          alt: 'Tech Stack (Variant 2)',
          path: `/stack/${FULL_PROFILE_GROUPS_DSL}?variant=2`,
          svg: renderStack({ icons: [FULL_PROFILE_GROUPS_DSL], variant: '2' }),
        },
      ],
      subtitle: 'Tinted carbon-dark surface with glowing colored borders and brand-colored icons.',
      title: 'variant=2 · Secondary Tinted Dark Stack (Default)',
    },
    {
      isCentered: true,
      items: [
        {
          alt: 'Tech Stack (Variant 3)',
          path: `/stack/${FULL_PROFILE_GROUPS_DSL}?variant=3`,
          svg: renderStack({ icons: [FULL_PROFILE_GROUPS_DSL], variant: '3' }),
        },
      ],
      subtitle: 'Neutral carbon-dark tiles with subtle borders and brand-colored icons.',
      title: 'variant=3 · Tertiary Neutral Dark Stack',
    },
  ];

  let cardsHtml = '';
  for (const card of stackCards) {
    cardsHtml += renderShowcaseCard(card);
  }

  return `<section class="doc-section" id="stack">
    <div class="section-header">
      <h2 class="section-title">Grouped Tech Stack Icon Grids</h2>
      <p class="section-desc">Combine multiple technology groups into one SVG using <code>:N</code> for columns, <code>|</code> for side-by-side groups, and <code>;</code> for row bands.</p>
      ${renderRoutePills([
        'svg.xul.is/stack/:groups',
        '/stack/c,cpp,cs,rust:4|aws,cloudflare,docker,linux:2;figma,blender,ps:3',
      ])}
    </div>
    ${renderParamTable(STACK_PARAM_ROWS)}
    <div class="card-grid">${cardsHtml}</div>
  </section>`;
}

/**
 * Render the Quote Cards (`/quote/:author/:text`) documentation section HTML.
 * @returns HTML string for the `/quote/*` documentation and live preview section.
 */
export function renderQuotesSectionHtml(): string {
  const quoteTextChaos =
    'Who says programmers are boring? I bring the humor to the office while my code brings the chaos!';
  const quoteTextEdge =
    'Always creating more cool stuff for you, with balanced OKLCH colors and zero cold starts at the edge.';
  const encodedChaos =
    'Who+says+programmers+are+boring%3F+I+bring+the+humor+to+the+office+while+my+code+brings+the+chaos!';
  const encodedEdge =
    'Always+creating+more+cool+stuff+for+you%2C+with+balanced+OKLCH+colors+and+zero+cold+starts+at+the+edge.';

  const verticalCards: ShowcaseCardConfig[] = [
    {
      isCentered: true,
      items: [
        {
          alt: "XulbuX's Quote",
          path: `/quote/XulbuX/${encodedChaos}?layout=vertical&variant=1&color=blue`,
          svg: renderQuote({
            author: 'XulbuX',
            color: 'blue',
            layout: 'vertical',
            text: quoteTextChaos,
            variant: '1',
          }),
        },
      ],
      subtitle: 'Primary brand gradient card in vertical layout with quote watermarks.',
      title: 'variant=1 · Vertical Primary Brand Quote',
    },
    {
      isCentered: true,
      items: [
        {
          alt: "XulbuX's Quote",
          path: `/quote/XulbuX/${encodedChaos}?layout=vertical&variant=2`,
          svg: renderQuote({
            author: 'XulbuX',
            color: 'indigo',
            layout: 'vertical',
            text: quoteTextChaos,
            variant: '2',
          }),
        },
      ],
      subtitle: 'Secondary tinted dark card with glowing indigo border (Default).',
      title: 'variant=2 · Vertical Secondary Tinted Quote (Default)',
    },
    {
      isCentered: true,
      items: [
        {
          alt: "XulbuX's Quote",
          path: `/quote/XulbuX/${encodedChaos}?layout=vertical&variant=3&color=cyan`,
          svg: renderQuote({
            author: 'XulbuX',
            color: 'cyan',
            layout: 'vertical',
            text: quoteTextChaos,
            variant: '3',
          }),
        },
      ],
      subtitle: 'Tertiary neutral dark card with subtle border and cyan watermarks.',
      title: 'variant=3 · Vertical Tertiary Neutral Quote',
    },
  ];

  const horizontalCards: ShowcaseCardConfig[] = [
    {
      items: [
        {
          alt: "XulbuX's Quote",
          path: `/quote/XulbuX/${encodedChaos}?variant=1`,
          svg: renderQuote({
            author: 'XulbuX',
            color: 'indigo',
            text: quoteTextChaos,
            variant: '1',
          }),
        },
      ],
      subtitle: 'Horizontal layout with left accent bar and primary gradient fill.',
      title: 'variant=1 · Horizontal Primary Brand Quote',
    },
    {
      items: [
        {
          alt: "XulbuX's Quote",
          path: `/quote/XulbuX/${encodedChaos}?variant=2&color=cyan`,
          svg: renderQuote({ author: 'XulbuX', color: 'cyan', text: quoteTextChaos, variant: '2' }),
        },
      ],
      subtitle: 'Horizontal layout with glowing cyan border and left accent bar.',
      title: 'variant=2 · Horizontal Secondary Tinted Quote (Default)',
    },
    {
      items: [
        {
          alt: "XulbuX's Quote",
          path: `/quote/XulbuX/${encodedEdge}?variant=3`,
          svg: renderQuote({
            author: 'XulbuX',
            color: 'indigo',
            text: quoteTextEdge,
            variant: '3',
          }),
        },
      ],
      subtitle: 'Horizontal layout with neutral dark surface and indigo accent bar.',
      title: 'variant=3 · Horizontal Tertiary Neutral Quote',
    },
  ];

  let vertHtml = '';
  for (const card of verticalCards) {
    vertHtml += renderShowcaseCard(card);
  }

  let horizHtml = '';
  for (const card of horizontalCards) {
    horizHtml += renderShowcaseCard(card);
  }

  return `<section class="doc-section" id="quotes">
    <div class="section-header">
      <h2 class="section-title">Styled README Quote Cards</h2>
      <p class="section-desc">Auto-wrapping quote cards in <code>vertical</code> centered or <code>horizontal</code> left-bar layouts across 4 text sizes and 3 surface tiers.</p>
      ${renderRoutePills([
        'svg.xul.is/quote/:author/:text',
        '/quote/:text?author=XulbuX&layout=vertical',
      ])}
    </div>
    ${renderParamTable(QUOTE_PARAM_ROWS)}
    <div class="card-grid-3">${vertHtml}</div>
    <div class="card-grid">${horizHtml}</div>
  </section>`;
}

/**
 * Render the 22 Tailwind v4 OKLCH Theme Colors (`/docs/colors`) documentation section HTML.
 * @returns HTML string for the color palette showcase section.
 */
export function renderColorsSectionHtml(): string {
  const v1Items: ShowcaseItem[] = [];
  const v2Items: ShowcaseItem[] = [];

  for (const colorName of THEME_COLOR_NAMES) {
    v1Items.push({
      alt: `${colorName} primary`,
      path: `/badge/color/${colorName}?icon=sparkles&color=${colorName}&variant=1`,
      svg: renderBadge({
        color: colorName,
        icon: 'sparkles',
        label: 'color',
        value: colorName,
        variant: '1',
      }),
    });
    v2Items.push({
      alt: `${colorName} secondary`,
      path: `/badge/theme/${colorName}?icon=sparkles&color=${colorName}&variant=2`,
      svg: renderBadge({
        color: colorName,
        icon: 'sparkles',
        label: 'theme',
        value: colorName,
        variant: '2',
      }),
    });
  }

  return `<section class="doc-section" id="colors">
    <div class="section-header">
      <h2 class="section-title">22 Tailwind v4 OKLCH Theme Colors (<code>?color=</code>)</h2>
      <p class="section-desc">Every endpoint accepts any of the 22 harmonically balanced OKLCH color names below.</p>
    </div>
    <div class="card-grid">
      ${renderShowcaseCard({
        items: v1Items,
        subtitle: 'All 22 color tokens rendered with variant=1 (3D brand gradient right cap).',
        title: 'Primary Gradient Swatches (?variant=1)',
      })}
      ${renderShowcaseCard({
        items: v2Items,
        subtitle: 'All 22 color tokens rendered with variant=2 (tinted dark surface + border).',
        title: 'Secondary Tinted Swatches (?variant=2)',
      })}
    </div>
  </section>`;
}
