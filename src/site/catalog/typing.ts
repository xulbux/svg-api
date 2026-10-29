/**
 * Typing animation documentation catalog – Container layout, variant, cursor, and erase-mode showcase configs and parameter reference rows for `/docs/typing`.
 */

import { SITE_HOST, SITE_NAME } from '@/config/site';
import { DEFAULT_THEME_COLOR } from '@/config/theme';
import {
  SIZE_TOKENS,
  TRUTHY_FLAG_LIST,
  TYPING_ALIGN_TOKENS,
  TYPING_CURSOR_TOKENS,
  TYPING_ERASE_TOKENS,
  TYPING_FONT_TOKENS,
  TYPING_LAYOUT_TOKENS,
} from '@/routes/params';
import { DEFAULT_TYPING_VARIANT } from '@/routes/svg';
import {
  appendDefaultLabel,
  buildColorParamRow,
  buildSheenAnimParamRow,
  buildVariantParamRow,
  formatRange,
} from '@/site/catalog/shared';
import {
  DEFAULT_IDE_TITLE,
  DEFAULT_LAYOUT_FONTS,
  DEFAULT_TYPING_ALIGN,
  DEFAULT_TYPING_CURSOR,
  DEFAULT_TYPING_ERASE,
  DEFAULT_TYPING_LAYOUT,
  DEFAULT_TYPING_SIZE,
  DEFAULT_WINDOW_PROMPT,
  TYPING_DURATION_RANGE,
  TYPING_FONT_SIZE_RANGE,
  TYPING_PAUSE_RANGE,
  TYPING_SIZE_MAP,
  TYPING_WIDTH_RANGE,
} from '@/svg/typing';
import type { ParamTableRow, ShowcaseCardConfig } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Container layout showcase cards for `/docs/typing`. */
export const TYPING_LAYOUT_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      {
        alt: 'Terminal Window Typing',
        path: '/typing/Full-Stack+Developer;Design-Driven+Engineering;Edge+Systems+Architect?title=zsh&hint=UTF-8',
      },
    ],
    subtitle: `Terminal window with traffic-light dots, centered title (?title=zsh), header pill (?hint=UTF-8), and ${DEFAULT_WINDOW_PROMPT} prompt.`,
    title: appendDefaultLabel(
      'layout=window · Terminal Window',
      DEFAULT_TYPING_LAYOUT === 'window'
    ),
  },
  {
    items: [
      {
        alt: 'Prompt Bar Typing',
        path: '/typing/Search+components%E2%80%A6;Deploy+to+Cloudflare+Workers;Generate+live+SVG+badges?layout=prompt&color=cyan&icon=sparkles&hint=icon:command+K',
      },
    ],
    subtitle:
      'Command or AI prompt bar with an accent icon badge (?icon=sparkles) and keycap hint (?hint=icon:command+K).',
    title: appendDefaultLabel(
      'layout=prompt · Command / AI Prompt Bar',
      DEFAULT_TYPING_LAYOUT === 'prompt'
    ),
  },
  {
    items: [
      {
        alt: 'IDE Code Editor Typing',
        path: `/typing/const/stack+%3D+["TypeScript",+"Rust",+"Cloudflare"];edgeLatency+%3D+"0ms+cold+start"?layout=ide&color=emerald&title=${DEFAULT_IDE_TITLE}&icon=ts&hint=TS`,
      },
    ],
    subtitle: `Code editor frame with an active file tab (?icon=ts&title=${DEFAULT_IDE_TITLE}) and line-number gutter.`,
    title: appendDefaultLabel(
      'layout=ide · Code Editor Tab & Line Gutter',
      DEFAULT_TYPING_LAYOUT === 'ide'
    ),
  },
  {
    items: [
      {
        alt: 'Browser Omnibox Typing',
        path: `/typing/${SITE_HOST}%2Ftyping;cloudflare.com%2Fworkers;github.com%2Fxulbux?layout=browser&color=sky&icon=search&hint=icon:corner-down-left`,
      },
    ],
    subtitle:
      'Browser toolbar with traffic-light dots, recessed URL bar (?icon=search), and keycap hint (?hint=icon:corner-down-left).',
    title: appendDefaultLabel(
      'layout=browser · Browser Search / URL Omnibox',
      DEFAULT_TYPING_LAYOUT === 'browser'
    ),
  },
  {
    isCentered: true,
    items: [
      {
        alt: 'Frameless Typing',
        path: '/typing/Passionate+Coder;UX+Design+Aficionado;Creative+Technologist?layout=none&color=indigo&size=xl',
      },
    ],
    subtitle:
      'Frameless transparent canvas (?size=xl), ready to drop in as a README hero headline.',
    title: appendDefaultLabel(
      'layout=none · Frameless Transparent Headline',
      DEFAULT_TYPING_LAYOUT === 'none'
    ),
  },
];

/** Surface variant and cursor style showcase cards for `/docs/typing`. */
export const TYPING_VARIANT_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      {
        alt: 'Primary Brand Typing',
        path: `/typing/Zero+Cold+Starts;Global+Edge+Caching;Crisp+Vector+Typography?variant=1&color=indigo&title=${SITE_NAME.replaceAll(' ', '+')}`,
      },
    ],
    subtitle: 'Primary gradient window with white text and bar cursor.',
    title: appendDefaultLabel('variant=1 · Primary Brand Gradient', DEFAULT_TYPING_VARIANT === '1'),
  },
  {
    items: [
      {
        alt: 'Secondary Tinted Block Cursor',
        path: '/typing/cargo+build+--release;cargo+test+--all-targets?variant=2&color=orange&title=cargo&icon=rust&cursor=block',
      },
    ],
    subtitle:
      'Tinted dark window with orange border, header icon (?icon=rust), and block cursor (?cursor=block).',
    title: appendDefaultLabel(
      'variant=2 · Secondary Tinted + Block Cursor',
      DEFAULT_TYPING_VARIANT === '2'
    ),
  },
  {
    items: [
      {
        alt: 'Tertiary Neutral Underscore Cursor',
        path: '/typing/git+commit+-m+"feat:+typing+svg";git+push+origin+main?variant=3&color=sky&title=git&cursor=underscore&anim=sheen',
      },
    ],
    subtitle:
      'Neutral dark surface with underscore cursor (?cursor=underscore) and diagonal sheen (?anim=sheen).',
    title: appendDefaultLabel(
      'variant=3 · Tertiary Neutral + Underscore Cursor',
      DEFAULT_TYPING_VARIANT === '3'
    ),
  },
];

/** Erase modes and realistic human typo showcase cards for `/docs/typing`. */
export const TYPING_BEHAVIOR_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      {
        alt: 'Select Erase Mode',
        path: '/typing/Select+All+%2B+Clear;Instant+Highlight+Erase;Clean+Transition?layout=prompt&color=violet&erase=select',
      },
    ],
    subtitle: 'Highlights the whole line before clearing all at once.',
    title: 'erase=select · Select & Clear',
  },
  {
    items: [
      {
        alt: 'Fade Erase Mode',
        path: '/typing/Smooth+Whole-Line+Fade;Proportional+Geist+Sans;Subtle+Editorial+Cadence?layout=prompt&color=rose&icon=wand-sparkles&erase=fade',
      },
    ],
    subtitle: 'Smoothly fades out the finished line before typing the next.',
    title: 'erase=fade · Whole-Line Dissolve',
  },
  {
    items: [
      {
        alt: 'Realistic Human Typo',
        path: '/typing/Building+resilient+systems;Crafting+delightful+interfaces?color=amber&title=human-typing.ts&typo=true',
      },
    ],
    subtitle: 'Occasionally slips onto a neighboring key, pauses briefly, and backspaces.',
    title: 'typo=true · Human Keystroke Slip',
  },
];

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the parameter reference rows for `/typing/*` and `/type/*` routes.
 * @returns Parameter table rows.
 */
export function buildTypingParamRows(): ParamTableRow[] {
  const fontDefaultParts: string[] = [];
  for (const font of TYPING_FONT_TOKENS) {
    const matchingLayouts: string[] = [];
    for (const layout of TYPING_LAYOUT_TOKENS) {
      if (DEFAULT_LAYOUT_FONTS[layout] === font) {
        matchingLayouts.push(layout);
      }
    }
    fontDefaultParts.push(`${font} (${matchingLayouts.join(', ')})`);
  }
  const fontDefaults = fontDefaultParts.join(' / ');
  return [
    {
      defaultVal: '~required',
      description:
        'Semicolon-separated (;) lines to type in sequence (+ or %20 for spaces); The two-segment form sets a static prefix before the cycling lines.',
      name: ':prefix / :lines',
      values: '/typing/Line+1;Line+2 | /typing/~%2Fdev+$/npm+test;npm+run+build',
    },
    {
      defaultVal: '~none',
      description:
        'Semicolon-separated lines when no path segment is given (e.g., /typing?lines=Hello;World).',
      name: '?lines= / ?text=',
      values: '~any ;-separated string',
    },
    {
      defaultVal: `${DEFAULT_WINDOW_PROMPT} (${DEFAULT_TYPING_LAYOUT}) / ~none`,
      description: `Static prompt prefix rendered before the typed text in the accent color; Pass none to hide the default prompt on ${DEFAULT_TYPING_LAYOUT}.`,
      name: '?prefix= / ?prompt=',
      values: '~any string | none',
    },
    {
      defaultVal: DEFAULT_TYPING_LAYOUT,
      description:
        'Frame style: window (terminal), prompt (command / AI bar), ide (editor tab + gutter), browser (URL bar), or none (frameless).',
      name: '?layout= / ?frame= / ?type=',
      values: TYPING_LAYOUT_TOKENS.join(' | '),
    },
    buildVariantParamRow(DEFAULT_TYPING_VARIANT, 'Surface tier'),
    buildColorParamRow(
      DEFAULT_THEME_COLOR,
      'Theme color for surface, border, prompt prefix, and cursor.'
    ),
    {
      defaultVal: fontDefaults,
      description: 'Typeface: mono (JetBrains Mono) or sans (Geist Sans).',
      name: '?font=',
      values: TYPING_FONT_TOKENS.join(' | '),
    },
    {
      defaultVal: `${DEFAULT_TYPING_SIZE} (${TYPING_SIZE_MAP[DEFAULT_TYPING_SIZE]}px)`,
      description: 'Typography scale preset or custom pixel font size.',
      name: '?size=',
      values: `${SIZE_TOKENS.join(' | ')} | ${formatRange(TYPING_FONT_SIZE_RANGE)}`,
    },
    {
      defaultVal: '~auto-fit',
      description:
        'Explicit container width in pixels; Automatically fits the longest line when omitted.',
      name: '?width=',
      values: formatRange(TYPING_WIDTH_RANGE),
    },
    {
      defaultVal: `${DEFAULT_TYPING_ALIGN} (framed, or none with prefix/icon) / center (none)`,
      description: `Horizontal text alignment on window, prompt, and none layouts (browser and ide always align ${DEFAULT_TYPING_ALIGN}; none defaults to ${DEFAULT_TYPING_ALIGN} when a prefix or leading icon is present); ?center=${TRUTHY_FLAG_LIST[0]} (or ${TRUTHY_FLAG_LIST.slice(1).join(' / ')}) is a shorthand for ?align=center.`,
      name: '?align= / ?center=',
      values: TYPING_ALIGN_TOKENS.join(' | '),
    },
    {
      defaultVal: `~none (window) / ${DEFAULT_IDE_TITLE} (ide)`,
      description:
        'Centered header bar title on window layout or active file tab name on ide layout.',
      name: '?title=',
      values: `~any string (e.g., zsh, ${DEFAULT_IDE_TITLE})`,
    },
    {
      defaultVal: '~none',
      description:
        'Optional UI or brand icon slug (header bar on window, file tab on ide, badge on prompt, URL bar on browser, or leading icon on none).',
      name: '?icon=',
      values: 'terminal | search | sparkles | rust | ts | none',
    },
    {
      defaultVal: '~none',
      description:
        'Optional header pill (window, ide), URL badge (browser), or keycap (prompt); Accepts text, icon:<slug>, or icon:<slug>+<text>.',
      name: '?hint=',
      values: 'UTF-8 | icon:corner-down-left | icon:command+K | TS | none',
    },
    {
      defaultVal: DEFAULT_TYPING_CURSOR,
      description: 'Caret cursor shape; Stays solid while typing and blinks during pauses.',
      name: '?cursor=',
      values: TYPING_CURSOR_TOKENS.join(' | '),
    },
    {
      defaultVal: DEFAULT_TYPING_ERASE,
      description:
        'Line erase style: backspace (rapid key-repeat), select (select-all + clear), or fade (whole-line dissolve).',
      name: '?erase= / ?delete=',
      values: TYPING_ERASE_TOKENS.join(' | '),
    },
    {
      defaultVal: '~false',
      description:
        'Simulates an occasional neighboring-key slip with a brief pause and backspace fix.',
      name: '?typo=',
      values: TRUTHY_FLAG_LIST.join(' | '),
    },
    {
      defaultVal: String(TYPING_DURATION_RANGE.default),
      description: 'Target typing duration per line in milliseconds.',
      name: '?duration=',
      values: formatRange(TYPING_DURATION_RANGE),
    },
    {
      defaultVal: String(TYPING_PAUSE_RANGE.default),
      description: 'Reading hold pause in milliseconds after each line finishes typing.',
      name: '?pause=',
      values: formatRange(TYPING_PAUSE_RANGE),
    },
    buildSheenAnimParamRow(
      'Diagonal sheen sweep across the container, or none for a static snapshot.'
    ),
  ];
}
