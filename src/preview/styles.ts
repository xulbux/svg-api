/**
 * Website styles – XulbuX design tokens and the shared `svg.xul.is` stylesheet (served at `/assets/site.css`).
 *
 * Scheme-dependent `--c-*` color tokens are built from the palette (`src/config/palette.ts`) and emitted
 * as light, dark, explicit override, and `light-dark()` bindings; Every static rule lives in a plain
 * `.css` file under `src/preview/styles/`, bundled as text by Wrangler (see `rules` in `wrangler.jsonc`).
 */

import {
  BRAND_INDIGO,
  GITHUB_CANVAS,
  ISOLUX_GRAY,
  ISOLUX_SYNTAX,
  ISOLUX_UI,
  STRIP_DARK_COLORS,
  WHITE,
} from '@/config/palette';
import type { SchemeColor } from '@/types';
import baseCss from '@/preview/styles/base.css';
import builderCss from '@/preview/styles/builder.css';
import componentsCss from '@/preview/styles/components.css';
import homeCss from '@/preview/styles/home.css';
import layoutCss from '@/preview/styles/layout.css';

// ---------------------------------------- TYPES ----------------------------------------

/** Light and dark values of a single `--c-*` design token. */
interface ThemeToken {
  /** Value in the dark color scheme. */
  dark: string;
  /** Whether the value is a color and can therefore be combined with `light-dark()`. */
  isColor: boolean;
  /** Value in the light color scheme. */
  light: string;
  /** Token name without the `--c-` prefix (e.g., `'bg'`, `'text-1'`). */
  name: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Page background in the light color scheme (also the light `theme-color`). */
export const LIGHT_BG = WHITE;

/** Page background in the dark color scheme (Isolux gray `900`, also the dark `theme-color`). */
export const { 900: DARK_BG } = ISOLUX_GRAY;

/** Start (`indigo-400`) and end (`indigo-600`) color of the indigo brand gradient (navbar brand mark and favicon). */
export const { 400: BRAND_GRADIENT_START, 600: BRAND_GRADIENT_END } = BRAND_INDIGO;

/** Preferred monospace font stack for code, route pills, and parameter names. */
const MONO_FONT_STACK =
  "'JetBrains Mono NF', 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace";

/** Recessed surfaces (cards, tables, code drawers) below the page background. */
const SOFT_SURFACE: SchemeColor = { dark: ISOLUX_GRAY[950], light: ISOLUX_GRAY[50] };

/**
 * Warning text: The amber strip tick (`#FFB900`, at least 11:1 on the dark surfaces), mixed half with
 * black in the light scheme (`#805C00`, at least 5.8:1 on white and gray `50`).
 */
const WARNING_COLOR: SchemeColor = {
  dark: STRIP_DARK_COLORS[3],
  light: `color-mix(in srgb, ${STRIP_DARK_COLORS[3]}, ${ISOLUX_GRAY[950]} 50%)`,
};

/** Static stylesheets in cascade order. */
const STATIC_STYLESHEETS: readonly string[] = [
  baseCss,
  layoutCss,
  componentsCss,
  homeCss,
  builderCss,
];

/** Memoized design tokens (`undefined` until first built). */
let themeTokensCache: readonly ThemeToken[] | undefined = undefined;

/** Memoized complete stylesheet (`undefined` until first rendered). */
let siteStylesheetCache: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Build a color design token from a palette color. */
function buildColorToken(name: string, color: SchemeColor): ThemeToken {
  return { dark: color.dark, isColor: true, light: color.light, name };
}

/**
 * Build a scheme-independent color token derived from other `--c-*` tokens; It is emitted once, and
 * its `var()` references resolve against whichever scheme bindings are active on `:root`.
 */
function buildDerivedToken(name: string, expression: string): ThemeToken {
  return { dark: expression, isColor: true, light: expression, name };
}

/** Swap the dark and light variant of a palette color (e.g., the inverted preview stage). */
function invertScheme(color: SchemeColor): SchemeColor {
  return { dark: color.light, light: color.dark };
}

/**
 * Build (once per isolate) the design tokens bound to `--c-*` custom properties for both color schemes.
 * Every color comes from `src/config/palette.ts`; Tokens with identical light and dark values are emitted once.
 */
function getThemeTokens(): readonly ThemeToken[] {
  themeTokensCache ??= [
    buildColorToken('bg', { dark: DARK_BG, light: LIGHT_BG }),
    buildColorToken('bg-elv', ISOLUX_UI.raised),
    buildColorToken('bg-soft', SOFT_SURFACE),
    buildColorToken('divider', ISOLUX_UI.border),
    // 3-tier border hierarchy: Outer divider > standard border > inner subtle border.
    buildDerivedToken('border', 'color-mix(in srgb, var(--c-bg), var(--c-divider) 72%)'),
    buildDerivedToken('border-subtle', 'color-mix(in srgb, var(--c-bg), var(--c-divider) 42%)'),
    buildDerivedToken('code-bg', 'color-mix(in srgb, var(--c-bg), var(--c-divider) 65%)'),
    buildColorToken('text-1', ISOLUX_UI.foreground),
    buildColorToken('text-2', ISOLUX_UI.foregroundSecondary),
    // WCAG AA (= 4.5:1) for small text on both `bg` and `bg-soft`.
    buildColorToken('text-3', ISOLUX_UI.foregroundMuted),
    buildColorToken('brand-1', { dark: BRAND_GRADIENT_START, light: BRAND_GRADIENT_END }),
    buildColorToken('brand-2', { dark: BRAND_INDIGO[500], light: BRAND_INDIGO[500] }),
    buildDerivedToken('brand-soft', 'color-mix(in srgb, var(--c-brand-1) 12%, transparent)'),
    buildDerivedToken('brand-border', 'color-mix(in srgb, var(--c-brand-1) 36%, transparent)'),
    // Status colors (WCAG AA for small text on both `bg` and `bg-soft`); Danger keeps the Isolux operator red.
    buildColorToken('danger', ISOLUX_SYNTAX.operator),
    buildColorToken('warning', WARNING_COLOR),
    buildColorToken('nav-bg', {
      dark: `color-mix(in srgb, ${DARK_BG} 64%, transparent)`,
      light: `color-mix(in srgb, ${LIGHT_BG} 75%, transparent)`,
    }),
    buildColorToken('on-brand', { dark: WHITE, light: WHITE }),
    // Neutral interactive states (Isolux keeps buttons, selections, and focus rings free of the accent).
    buildColorToken('btn-bg', ISOLUX_UI.button),
    buildColorToken('btn-hover-bg', ISOLUX_UI.buttonHover),
    buildColorToken('btn-text', ISOLUX_UI.buttonForeground),
    buildColorToken('btn-border', ISOLUX_UI.buttonBorder),
    buildColorToken('border-strong', ISOLUX_UI.borderStrong),
    buildColorToken('focus', ISOLUX_UI.focus),
    buildColorToken('hover', ISOLUX_UI.hover),
    buildColorToken('selected', ISOLUX_UI.selected),
    buildColorToken('switch-bg', ISOLUX_UI.bubble),
    buildColorToken('switch-thumb-bg', { dark: ISOLUX_GRAY[950], light: WHITE }),
    // Inverted preview stage: GitHub's README canvas of the opposite color scheme.
    buildColorToken('preview-inverse-bg', invertScheme(GITHUB_CANVAS.background)),
    buildColorToken('preview-inverse-border', invertScheme(GITHUB_CANVAS.border)),
    // Isolux Pro Markdown roles: punctuation, operators, alt text (label), URLs and link targets (string), query keys and values.
    buildColorToken('hl-p', ISOLUX_SYNTAX.punctuation),
    buildColorToken('hl-op', ISOLUX_SYNTAX.operator),
    buildColorToken('hl-alt', ISOLUX_SYNTAX.label),
    buildColorToken('hl-url', ISOLUX_SYNTAX.string),
    buildColorToken('hl-key', ISOLUX_SYNTAX.property),
    buildColorToken('hl-val', ISOLUX_SYNTAX.constant),
    buildColorToken('hl-href', ISOLUX_SYNTAX.string),
    // Theme switch state (non-color tokens, so they never go through `light-dark()`).
    { dark: '18px', isColor: false, light: '0px', name: 'switch-thumb-shift' },
    { dark: 'none', isColor: false, light: 'inline-flex', name: 'theme-light-display' },
    { dark: 'inline-flex', isColor: false, light: 'none', name: 'theme-dark-display' },
  ];
  return themeTokensCache;
}

/** Render the `--c-*` bindings of one color scheme (`hasShared` also emits scheme-independent tokens). */
function renderThemeTokenBindings(scheme: 'dark' | 'light', hasShared: boolean): string {
  let css = '';
  for (const token of getThemeTokens()) {
    if (hasShared || token.light !== token.dark) {
      css += `  --c-${token.name}: ${token[scheme]};\n`;
    }
  }
  return css;
}

/** Render the `light-dark()` bindings of every scheme-dependent color token. */
function renderLightDarkTokenBindings(): string {
  let css = '';
  for (const token of getThemeTokens()) {
    if (token.isColor && token.light !== token.dark) {
      css += `  --c-${token.name}: light-dark(${token.light}, ${token.dark});\n`;
    }
  }
  return css;
}

/** Build the `color-scheme` meta selector for an explicit scheme override. */
function buildSchemeOverrideSelector(scheme: 'dark' | 'light'): string {
  return `:root:has(> head > meta[name="color-scheme"][content="${scheme}"])`;
}

/** Render the generated design token rules (brand constants, light/dark bindings, explicit overrides, `light-dark()`). */
function renderTokenCss(): string {
  return `/* Generated Design Tokens (src/config/palette.ts via src/preview/styles.ts) */
:root {
  --brand-gradient-start: ${BRAND_GRADIENT_START};
  --brand-gradient-end: ${BRAND_GRADIENT_END};
  --font-mono: ${MONO_FONT_STACK};
${renderThemeTokenBindings('light', true)}}

@media (prefers-color-scheme: dark) {
  :root {
${renderThemeTokenBindings('dark', false)}  }
}

${buildSchemeOverrideSelector('dark')} {
  color-scheme: dark;
${renderThemeTokenBindings('dark', false)}}

${buildSchemeOverrideSelector('light')} {
  color-scheme: light;
${renderThemeTokenBindings('light', false)}}

@supports (color: light-dark(white, black)) {
  :root {
${renderLightDarkTokenBindings()}  }
}
`;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build (once per isolate) the complete website stylesheet: generated design tokens followed by every static stylesheet.
 * @returns Complete CSS source served at `/assets/site.css`.
 */
export function getSiteStylesheet(): string {
  siteStylesheetCache ??= [renderTokenCss(), ...STATIC_STYLESHEETS].join('\n');
  return siteStylesheetCache;
}
