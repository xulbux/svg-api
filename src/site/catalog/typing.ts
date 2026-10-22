/**
 * Typing animation documentation catalog – Container layout, variant, cursor, and erase-mode showcase configs and parameter reference rows for `/docs/typing`.
 */

import {
  SIZE_TOKENS,
  TYPING_ALIGN_TOKENS,
  TYPING_CURSOR_TOKENS,
  TYPING_ERASE_TOKENS,
  TYPING_FONT_TOKENS,
  TYPING_LAYOUT_TOKENS,
} from '@/routes/params';
import {
  buildColorParamRow,
  buildSheenAnimParamRow,
  buildVariantParamRow,
  formatRange,
} from '@/site/catalog/shared';
import {
  TYPING_DURATION_RANGE,
  TYPING_FONT_SIZE_RANGE,
  TYPING_PAUSE_RANGE,
  TYPING_SIZE_MAP,
  TYPING_WIDTH_RANGE,
} from '@/svg/typing';
import type { ParamTableRow, ShowcaseCardConfig } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Container layout showcase cards (`window`, `prompt`, `ide`, `browser`, `none`) for `/docs/typing`. */
export const TYPING_LAYOUT_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      {
        alt: 'Terminal Window Typing',
        path: '/typing/Full-Stack+Developer;Design-Driven+Engineering;Edge+Systems+Architect?title=zsh&hint=UTF-8',
      },
    ],
    subtitle:
      'Kumo 3D terminal window with traffic-light controls, centered header title (?title=zsh), rounded pill badge (?hint=UTF-8), and ❯ prompt (Default).',
    title: 'layout=window · Kumo App / Terminal Window (Default)',
  },
  {
    items: [
      {
        alt: 'Prompt Bar Typing',
        path: '/typing/Search+components...;Deploy+to+Cloudflare+Workers;Generate+live+SVG+badges?layout=prompt&color=cyan&icon=sparkles&hint=icon:command+K',
      },
    ],
    subtitle:
      'Command / AI prompt bar with an optional accent squircle icon badge (?icon=sparkles), Geist Sans typography, and recessed 3D keycap badge (?hint=icon:command+K).',
    title: 'layout=prompt · Command / AI Prompt Bar',
  },
  {
    items: [
      {
        alt: 'IDE Code Editor Typing',
        path: '/typing/const/stack+%3D+["TypeScript",+"Rust",+"Cloudflare"];edgeLatency+%3D+"0ms+cold+start"?layout=ide&color=emerald&icon=ts&title=index.ts&hint=TS',
      },
    ],
    subtitle:
      'Code editor window with a seamless active file tab (?icon=ts&title=index.ts), top accent bar, subtle line-number gutter, and JetBrains Mono syntax.',
    title: 'layout=ide · Code Editor Tab & Line Gutter',
  },
  {
    items: [
      {
        alt: 'Browser Omnibox Typing',
        path: '/typing/svg.xul.is%2Ftyping;cloudflare.com%2Fworkers;github.com%2Fxulbux?layout=browser&color=sky&icon=search&hint=icon:corner-down-left',
      },
    ],
    subtitle:
      'Sleek browser toolbar with traffic-light dots, a recessed search / URL omnibox well (?icon=search), and a borderless keycap badge (?hint=icon:corner-down-left).',
    title: 'layout=browser · Browser Search / URL Omnibox',
  },
  {
    isCentered: true,
    items: [
      {
        alt: 'Frameless Typing',
        path: '/typing/Passionate+Coder;UX+Design+Aficionado;Creative+Technologist?layout=none&size=xl&color=indigo',
      },
    ],
    subtitle:
      'Frameless transparent canvas with centered Geist Sans typography (?size=xl), ideal as a drop-in README hero headline.',
    title: 'layout=none · Frameless Transparent Headline',
  },
];

/** Surface variant and cursor style showcase cards for `/docs/typing`. */
export const TYPING_VARIANT_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      {
        alt: 'Primary Brand Typing',
        path: '/typing/Zero+Cold+Starts;Global+Edge+Caching;Pure+SMIL+Vector+Paths?variant=1&color=indigo&title=svg.xul.is',
      },
    ],
    subtitle: 'Vivid primary brand gradient window with crisp white typography and bar cursor.',
    title: 'variant=1 · Primary Brand Gradient',
  },
  {
    items: [
      {
        alt: 'Secondary Tinted Block Cursor',
        path: '/typing/cargo+build+--release;cargo+test+--all-targets?variant=2&color=orange&cursor=block&icon=rust&title=cargo',
      },
    ],
    subtitle:
      'Secondary tinted dark window with glowing orange border, Rust icon in the header bar (?icon=rust), and terminal block cursor (?cursor=block).',
    title: 'variant=2 · Secondary Tinted + Block Cursor',
  },
  {
    items: [
      {
        alt: 'Tertiary Neutral Underscore Cursor',
        path: '/typing/git+commit+-m+"feat:+typing+svg";git+push+origin+main?variant=3&color=sky&cursor=underscore&anim=sheen&title=git',
      },
    ],
    subtitle:
      'Tertiary neutral dark surface with underscore cursor (?cursor=underscore) and periodic diagonal sheen (?anim=sheen) (Default).',
    title: 'variant=3 · Tertiary Neutral + Underscore Cursor (Default)',
  },
];

/** Erase modes and realistic human typo showcase cards for `/docs/typing`. */
export const TYPING_BEHAVIOR_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      {
        alt: 'Select Erase Mode',
        path: '/typing/Select+All+%2B+Clear;Instant+Highlight+Erase;Clean+Transition?layout=prompt&erase=select&color=violet',
      },
    ],
    subtitle:
      'Highlights the whole line with a Cmd+A selection box before clearing simultaneously (?erase=select).',
    title: 'erase=select · Highlight-All & Clear Transition',
  },
  {
    items: [
      {
        alt: 'Fade Erase Mode',
        path: '/typing/Smooth+Whole-Line+Fade;Proportional+Geist+Sans;Subtle+Editorial+Cadence?layout=prompt&erase=fade&color=rose&icon=wand-sparkles',
      },
    ],
    subtitle:
      'Smoothly dissolves the completed line and cursor together before fading into the next line (?erase=fade).',
    title: 'erase=fade · Smooth Whole-Line Dissolve',
  },
  {
    items: [
      {
        alt: 'Realistic Human Typo',
        path: '/typing/Building+resilient+systems;Crafting+delightful+interfaces?typo=true&color=amber&title=human-typing.ts',
      },
    ],
    subtitle:
      'Simulates an occasional QWERTY neighbor key slip, brief human recognition pause, and immediate backspace correction (?typo=true).',
    title: 'typo=true · Realistic Human Keystroke Slip & Correction',
  },
];

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the parameter reference rows for `/typing/*` and `/type/*` routes.
 * @returns Parameter table rows.
 */
export function buildTypingParamRows(): ParamTableRow[] {
  return [
    {
      defaultVal: '~required',
      description:
        'Semicolon-separated (;) lines to type in sequence (+ or %20 for spaces); The two-segment form sets a static prefix before the cycling lines.',
      name: ':prefix / :lines',
      values: '/typing/Line+1;Line+2 | /typing/~/dev+$/npm+test;npm+run+build',
    },
    {
      defaultVal: '~none',
      description:
        'Semicolon-separated lines when no path segment is given (e.g., /typing?lines=Hello;World).',
      name: '?lines= / ?text=',
      values: '~any ;-separated string',
    },
    {
      defaultVal: '❯ (window) / ~none',
      description:
        'Static prompt prefix rendered before the typed text in the accent color; Pass none to hide the default prompt on window.',
      name: '?prefix= / ?prompt=',
      values: '~any string | none',
    },
    {
      defaultVal: 'window',
      description:
        'Container frame style: window (Kumo terminal window), prompt (command / AI prompt bar), ide (code editor tab + line gutter), browser (search / URL omnibox), or none (frameless transparent canvas).',
      name: '?layout= / ?frame= / ?type=',
      values: TYPING_LAYOUT_TOKENS.join(' | '),
    },
    buildVariantParamRow('3', 'Surface tier'),
    buildColorParamRow(
      'indigo',
      'Tailwind v4 OKLCH accent color for surface, border, prompt prefix, and cursor.'
    ),
    {
      defaultVal: 'mono (window, ide) / sans (prompt, browser, none)',
      description:
        'Bundled OpenType font family: mono (JetBrains Mono) or sans (Geist Sans), converted directly into crisp vector <path> outlines with automatic cross-font symbol fallback.',
      name: '?font=',
      values: TYPING_FONT_TOKENS.join(' | '),
    },
    {
      defaultVal: `md (${TYPING_SIZE_MAP.md}px)`,
      description: 'Typography scale preset or custom pixel font size.',
      name: '?size=',
      values: `${SIZE_TOKENS.join(' | ')} | ${formatRange(TYPING_FONT_SIZE_RANGE)}`,
    },
    {
      defaultVal: 'bar',
      description:
        'Caret cursor shape; Stays solid while actively typing or backspacing and blinks smoothly during reading pauses.',
      name: '?cursor=',
      values: TYPING_CURSOR_TOKENS.join(' | '),
    },
    {
      defaultVal: 'backspace',
      description:
        'Line erase transition: backspace (rapid OS key-repeat deletion), select (Cmd+A highlight box + clear), or fade (smooth whole-line dissolve).',
      name: '?erase= / ?delete=',
      values: TYPING_ERASE_TOKENS.join(' | '),
    },
    {
      defaultVal: 'left (framed) / center (none)',
      description:
        'Horizontal text alignment on window, prompt, and none layouts (browser and ide always align left); ?center=true (or 1 / yes) is a shorthand for ?align=center.',
      name: '?align= / ?center=',
      values: TYPING_ALIGN_TOKENS.join(' | '),
    },
    {
      defaultVal: '~false',
      description:
        'When enabled, simulates an occasional QWERTY neighbor key slip followed by a brief pause and backspace correction.',
      name: '?typo=',
      values: 'true | 1 | yes',
    },
    {
      defaultVal: '~none',
      description:
        'Optional Lucide, Simple Icons, or Devicon slug (rendered in the header bar on window, active file tab on ide, squircle badge on prompt, or omnibox on browser).',
      name: '?icon=',
      values: 'terminal | search | sparkles | rust | ts | none',
    },
    {
      defaultVal: '~none (window) / index.ts (ide)',
      description:
        'Centered header bar title on window layout or active file tab name on ide layout.',
      name: '?title=',
      values: '~any string (e.g., zsh, index.ts)',
    },
    {
      defaultVal: '~none',
      description:
        'Optional pill badge in the header bar (window, ide), borderless badge in the omnibox (browser), or recessed 3D keycap badge (prompt); Supports text, an icon (icon:<slug>), or both (icon:<slug>+<text>).',
      name: '?hint=',
      values: 'UTF-8 | icon:corner-down-left | icon:command+K | TS | none',
    },
    {
      defaultVal: String(TYPING_DURATION_RANGE.default),
      description:
        'Target typing duration per line in milliseconds (inter-key intervals follow HCI bigram rollover and word-boundary rhythm).',
      name: '?duration=',
      values: formatRange(TYPING_DURATION_RANGE),
    },
    {
      defaultVal: String(TYPING_PAUSE_RANGE.default),
      description: 'Reading hold pause in milliseconds after each line finishes typing.',
      name: '?pause=',
      values: formatRange(TYPING_PAUSE_RANGE),
    },
    {
      defaultVal: '~auto-fit',
      description:
        'Explicit container width in pixels; Automatically fits the longest line when omitted.',
      name: '?width=',
      values: formatRange(TYPING_WIDTH_RANGE),
    },
    buildSheenAnimParamRow(
      'Periodic diagonal sheen sweep across the container surface, or none for a static reduced-motion snapshot.'
    ),
  ];
}
