/**
 * Color palette – The single source of every fixed color: The Isolux gray scale, Isolux Pro UI neutrals and syntax colors, the website brand indigo, GitHub preview canvases, and the strip widget stages.
 *
 * Mirrors `vscode-theme-isolux` (`theme/palette.ts` for the raw grays, `dist/isolux-pro-*.json` for the
 * resolved syntax colors), shared by the SVG renderers (`src/config/theme.ts`) and the documentation
 * website (`src/preview/styles.ts`). The 22 Tailwind v4 accent scales behind `?color=` are generated
 * from their OKLCH seeds in `src/config/theme.ts`.
 */

import type { SchemeColor } from '@/types';

// -------------------------------------- PUBLIC API -------------------------------------

/** Isolux neutral gray scale (`theme/palette.ts`). */
export const ISOLUX_GRAY = {
  50: '#FAFAFA',
  100: '#E6E6E6',
  200: '#C2C2C2',
  300: '#8A8A8A',
  400: '#646464',
  500: '#3D3D3D',
  600: '#2C2C2C',
  700: '#242424',
  800: '#181818',
  900: '#101010',
  950: '#000000',
} as const;

/** Pure white (the Isolux light background and the foreground on colored fills). */
export const WHITE = '#FFFFFF';

/** Isolux Pro UI neutrals (`ui.*` tokens) as dark / light pairs. */
export const ISOLUX_UI = {
  /** Default border. */
  border: { dark: ISOLUX_GRAY[600], light: ISOLUX_GRAY[100] },
  /** Strong border (inputs, hovered controls). */
  borderStrong: { dark: ISOLUX_GRAY[500], light: '#D3D3D3' },
  /** Small bubbles and toggles. */
  bubble: { dark: ISOLUX_GRAY[700], light: '#F2F2F2' },
  /** Neutral primary button fill (Isolux uses no accent for buttons). */
  button: { dark: '#DCDCDC', light: ISOLUX_GRAY[700] },
  /** Translucent border of primary buttons. */
  buttonBorder: { dark: '#FAFAFA26', light: '#0000000D' },
  /** Text on primary buttons. */
  buttonForeground: { dark: ISOLUX_GRAY[950], light: ISOLUX_GRAY[50] },
  /** Hovered primary button fill. */
  buttonHover: { dark: '#D1D1D1', light: '#2F2F2F' },
  /** Keyboard focus rings and focused input borders. */
  focus: { dark: ISOLUX_GRAY[400], light: '#8E8E8E' },
  /** Primary text. */
  foreground: { dark: ISOLUX_GRAY[100], light: ISOLUX_GRAY[800] },
  /** Muted text (WCAG AA, at least 4.5:1, on the black, gray `900`, white, and gray `50` backgrounds). */
  foregroundMuted: { dark: ISOLUX_GRAY[300], light: ISOLUX_GRAY[400] },
  /** Secondary text. */
  foregroundSecondary: { dark: ISOLUX_GRAY[200], light: ISOLUX_GRAY[500] },
  /** Translucent fill of hovered list items and ghost buttons. */
  hover: { dark: '#FAFAFA0D', light: '#0000000D' },
  /** Raised surfaces (widgets, inputs, inlay hints). */
  raised: { dark: ISOLUX_GRAY[800], light: '#F2F2F2' },
  /** Translucent fill of selected list items, tabs, and options. */
  selected: { dark: '#FAFAFA1A', light: '#0000000D' },
} as const satisfies Readonly<Record<string, SchemeColor>>;

/** Isolux Pro syntax colors (resolved `token.*` colors) as dark / light pairs. */
export const ISOLUX_SYNTAX = {
  /** Numbers, enum members, CSS values. */
  constant: { dark: '#D5ACFF', light: '#8A0BE5' },
  /** Markdown link texts, image alts, and titles. */
  label: { dark: '#BECBFF', light: '#4131CE' },
  /** Operators and symbolic markers. */
  operator: { dark: '#FFA4AA', light: '#C5002B' },
  /** Properties, fields, and keys. */
  property: { dark: '#BCFFF7', light: '#214A4B' },
  /** Punctuation. */
  punctuation: { dark: ISOLUX_GRAY[300], light: ISOLUX_GRAY[400] },
  /** Strings and URLs. */
  string: { dark: '#909FFF', light: '#4F48EC' },
} as const satisfies Readonly<Record<string, SchemeColor>>;

/** Website brand indigo (Tailwind `indigo-400` to `indigo-600`; Brand mark, favicon, links, and primary buttons). */
export const BRAND_INDIGO = { 400: '#818CF8', 500: '#6366F1', 600: '#4F46E5' } as const;

/** GitHub README canvases of both color schemes (the inverted preview stage shows the opposite one). */
export const GITHUB_CANVAS = {
  /** Canvas background. */
  background: { dark: '#0D1117', light: WHITE },
  /** Canvas border. */
  border: { dark: '#30363D', light: '#D0D7DE' },
} as const satisfies Readonly<Record<string, SchemeColor>>;

/** Tailwind `rose-200` (negative tint on solid primary surfaces). */
export const ROSE_200 = '#FECDD3';

/** 10-stage green, lime, yellow, amber, orange, red, and rose strip ticks on dark capsules (Tailwind `400`/`500` shades), from worst (`0`) to best (`9`). */
export const STRIP_DARK_COLORS = {
  0: '#FF4D6D',
  1: '#FF6467',
  2: '#FF8904',
  3: '#FFB900',
  4: '#FDC700',
  5: '#CCDA00',
  6: '#9AE600',
  7: '#52E339',
  8: '#05DF72',
  9: '#00D294',
} as const;

/** 10-stage high-contrast light tints for strip ticks on solid primary capsules (Tailwind `100`–`300` shades). */
export const STRIP_SOLID_COLORS = {
  0: ROSE_200,
  1: '#FCA5A5',
  2: '#FDBA74',
  3: '#FDE68A',
  4: '#FEF08A',
  5: '#ECFCCB',
  6: '#D9F99D',
  7: '#BBF7D0',
  8: '#DCFCE7',
  9: WHITE,
} as const;
