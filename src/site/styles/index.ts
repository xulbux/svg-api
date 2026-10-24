/**
 * Website styles – Design tokens and composite stylesheet assembly for `/assets/site.css`.
 *
 * Scheme-dependent `--c-*` color tokens are built from the color palette and emitted as light,
 * dark, explicit override, and `light-dark()` bindings ahead of the static `.css` modules.
 */

import {
  BRAND_INDIGO,
  ISOLUX_GRAY,
  ISOLUX_SYNTAX,
  ISOLUX_UI,
  STRIP_DARK_COLORS,
  WHITE,
} from '@/config/palette';
import type { SchemeColor } from '@/types';
import baseCss from '@/site/styles/base.css';
import builderCss from '@/site/styles/builder.css';
import componentsCss from '@/site/styles/components.css';
import homeCss from '@/site/styles/home.css';
import layoutCss from '@/site/styles/layout.css';

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

/** Viewport width in pixels at and below which the left sidebar collapses into a popover drawer. */
export const DRAWER_BREAKPOINT_PX = 960;

/** Preferred sans-serif font stack for UI text and headings. */
const SANS_FONT_STACK =
  "'Geist', -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif";

/** Preferred monospace font stack for code, route pills, and parameter names. */
const MONO_FONT_STACK =
  "'JetBrains Mono NF', 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace";

/** Recessed surfaces (cards, tables, code drawers) below the page background. */
const SOFT_SURFACE: SchemeColor = { dark: ISOLUX_GRAY[950], light: ISOLUX_GRAY[50] };

/**
 * Error and validation status color: The red strip tick (`#FF6467`, at least 6.6:1 on the dark surfaces)
 * and the Isolux operator red (`#C5002B`, at least 5.8:1 on white and gray `50`) in the light scheme.
 */
const DANGER_COLOR: SchemeColor = {
  dark: STRIP_DARK_COLORS[1],
  light: ISOLUX_SYNTAX.operator.light,
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
 * Tokens with identical light and dark values are emitted once.
 */
function getThemeTokens(): readonly ThemeToken[] {
  themeTokensCache ??= [
    buildColorToken('bg', { dark: DARK_BG, light: LIGHT_BG }),
    buildColorToken('bg-elv', ISOLUX_UI.raised),
    buildColorToken('bg-soft', SOFT_SURFACE),
    buildColorToken('divider', ISOLUX_UI.border),
    // 2-tier border hierarchy; outer shell/card divider (`--c-divider`) > inner border (`--c-border`):
    buildDerivedToken('border', 'color-mix(in srgb, var(--c-bg), var(--c-divider) 72%)'),
    buildDerivedToken('code-bg', 'color-mix(in srgb, var(--c-bg), var(--c-divider) 65%)'),
    buildColorToken('text-1', ISOLUX_UI.foreground),
    buildColorToken('text-2', ISOLUX_UI.foregroundSecondary),
    // WCAG AA (`= 4.5:1`) for small text on both `bg` and `bg-soft`:
    buildColorToken('text-3', ISOLUX_UI.foregroundMuted),
    buildColorToken('brand-1', { dark: BRAND_GRADIENT_START, light: BRAND_GRADIENT_END }),
    buildColorToken('brand-2', { dark: BRAND_INDIGO[500], light: BRAND_INDIGO[500] }),
    buildDerivedToken('brand-soft', 'color-mix(in srgb, var(--c-brand-1) 12%, transparent)'),
    buildDerivedToken('brand-border', 'color-mix(in srgb, var(--c-brand-1) 36%, transparent)'),
    // Error status color (WCAG AA for small text and invalid input borders on both `bg` and `bg-soft`):
    buildColorToken('danger', DANGER_COLOR),
    buildColorToken('nav-bg', {
      dark: `color-mix(in srgb, ${DARK_BG} 64%, transparent)`,
      light: `color-mix(in srgb, ${LIGHT_BG} 75%, transparent)`,
    }),
    buildColorToken('on-brand', { dark: WHITE, light: WHITE }),
    // Neutral interactive states (Isolux keeps buttons, selections, and focus rings free of the accent):
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
    // Inverted preview stage; GitHub's README canvas and `Edit` chip of the opposite color scheme:
    buildColorToken('stage-checker', {
      dark: 'color-mix(in srgb, var(--c-text-1) 5%, transparent)',
      light: 'color-mix(in srgb, var(--c-text-1) 4%, transparent)',
    }),
    buildColorToken('preview-inverse-bg', { dark: LIGHT_BG, light: DARK_BG }),
    buildColorToken('preview-inverse-checker', {
      dark: 'color-mix(in srgb, var(--c-bg) 4%, transparent)',
      light: 'color-mix(in srgb, var(--c-bg) 5%, transparent)',
    }),
    buildColorToken('preview-inverse-border', invertScheme(ISOLUX_UI.border)),
    buildColorToken('preview-inverse-btn-bg', invertScheme(ISOLUX_UI.button)),
    buildColorToken('preview-inverse-btn-text', invertScheme(ISOLUX_UI.buttonForeground)),
    // Isolux Pro Markdown roles; punctuation, path segments (lifted string indigo), alt text and link targets (label), URLs (string), query keys (function cyan), and query values (property cyan):
    buildColorToken('hl-p', ISOLUX_SYNTAX.punctuation),
    buildColorToken('hl-path', ISOLUX_SYNTAX.constant),
    buildColorToken('hl-alt', ISOLUX_SYNTAX.label),
    buildColorToken('hl-url', ISOLUX_SYNTAX.string),
    buildColorToken('hl-key', ISOLUX_SYNTAX.function),
    buildColorToken('hl-val', ISOLUX_SYNTAX.property),
    buildColorToken('hl-href', ISOLUX_SYNTAX.label),
    // Elevation shadows and theme switch state (non-color tokens, so they never go through `light-dark()`):
    {
      dark: '0 0 3px rgb(0 0 0 / 0.65)',
      isColor: false,
      light: '0 0 2px rgb(0 0 0 / 0.12)',
      name: 'shadow-sm',
    },
    {
      dark: '0 14px 38px rgb(0 0 0 / 0.78), 0 4px 14px rgb(0 0 0 / 0.55)',
      isColor: false,
      light: '0 10px 30px rgb(0 0 0 / 0.18)',
      name: 'shadow-popover',
    },
    {
      dark: '0 20px 52px rgb(0 0 0 / 0.85), 0 6px 18px rgb(0 0 0 / 0.6)',
      isColor: false,
      light: '0 16px 40px rgb(0 0 0 / 0.22)',
      name: 'shadow-dialog',
    },
    { dark: '18px', isColor: false, light: '0px', name: 'switch-thumb-shift' },
    { dark: 'none', isColor: false, light: 'inline-flex', name: 'theme-light-display' },
    { dark: 'inline-flex', isColor: false, light: 'none', name: 'theme-dark-display' },
  ];
  return themeTokensCache;
}

/** Render scheme-independent and non-color `--c-*` bindings for `scheme` (`hasShared` includes shared tokens). */
function renderBaseTokenBindings(
  scheme: 'dark' | 'light',
  hasShared: boolean,
  indent = '  '
): string {
  let css = '';
  for (const token of getThemeTokens()) {
    if (
      (hasShared && token.light === token.dark) ||
      (!token.isColor && token.light !== token.dark)
    ) {
      css += `${indent}--c-${token.name}: ${token[scheme]};\n`;
    }
  }
  return css;
}

/** Render legacy scheme-dependent color `--c-*` bindings for browsers without `light-dark()`. */
function renderLegacyColorTokenBindings(scheme: 'dark' | 'light', indent = '    '): string {
  let css = '';
  for (const token of getThemeTokens()) {
    if (token.isColor && token.light !== token.dark) {
      css += `${indent}--c-${token.name}: ${token[scheme]};\n`;
    }
  }
  return css;
}

/** Render the `light-dark()` bindings of every scheme-dependent color token. */
function renderLightDarkTokenBindings(): string {
  let css = '';
  for (const token of getThemeTokens()) {
    if (token.isColor && token.light !== token.dark) {
      css += `    --c-${token.name}: light-dark(${token.light}, ${token.dark});\n`;
    }
  }
  return css;
}

/** Build the `color-scheme` meta selector for an explicit scheme override. */
function buildSchemeOverrideSelector(scheme: 'dark' | 'light'): string {
  return `:root:has(> head > meta[name="color-scheme"][content="${scheme}"])`;
}

/** Render the generated design token rules (`light-dark()` with `@supports not` legacy color fallbacks). */
function renderTokenCss(): string {
  const darkOverrideSelector = buildSchemeOverrideSelector('dark');
  const lightOverrideSelector = buildSchemeOverrideSelector('light');
  return `/* Generated Design Tokens */
:root {
  --brand-gradient-start: ${BRAND_GRADIENT_START};
  --brand-gradient-end: ${BRAND_GRADIENT_END};
  --font-sans: ${SANS_FONT_STACK};
  --font-mono: ${MONO_FONT_STACK};
${renderBaseTokenBindings('light', true)}}

@media (prefers-color-scheme: dark) {
  :root {
${renderBaseTokenBindings('dark', false, '    ')}  }
}

${darkOverrideSelector} {
  color-scheme: dark;
${renderBaseTokenBindings('dark', false)}}

${lightOverrideSelector} {
  color-scheme: light;
${renderBaseTokenBindings('light', false)}}

@supports (color: light-dark(white, black)) {
  :root {
${renderLightDarkTokenBindings()}  }
}

@supports not (color: light-dark(white, black)) {
  :root {
${renderLegacyColorTokenBindings('light')}  }

  @media (prefers-color-scheme: dark) {
    :root {
${renderLegacyColorTokenBindings('dark', '      ')}    }
  }

  ${darkOverrideSelector} {
${renderLegacyColorTokenBindings('dark')}  }

  ${lightOverrideSelector} {
${renderLegacyColorTokenBindings('light')}  }
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
