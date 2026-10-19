/**
 * Documentation layout – Shared responsive HTML shell, XulbuX CSS design system, Lucide UI icons, parameter tables, and expandable Markdown code drawers.
 *
 * Page-independent fragments (stylesheet, client script, footer, header with the preview background
 * picker, favicon) are rendered lazily on first use and then reused by every page rendered in the same
 * Worker isolate.
 */

import { SITE_ORIGIN } from '@/config/site';
import { renderSvgPath, resolveSvgPathRedirectUrl } from '@/routes/svg';
import { resolveIcon } from '@/svg/icons';
import { escapeXml } from '@/svg/shared';
import type {
  DocsSectionMeta,
  NavPageId,
  PageLayoutOptions,
  ParamTableRow,
  SectionHeaderOptions,
  ShowcaseCardConfig,
  ShowcaseItem,
} from '@/types';

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

/** Selectable preview stage background (persisted in `localStorage` under `preview-bg`). */
interface PreviewBackgroundOption {
  /** Visible option label. */
  label: string;
  /** Stored value and `data-preview-bg` attribute value on `<html>` (`'auto'` removes the attribute). */
  value: string;
}

/** Leading and trailing parts of a `main (parenthetical)` string. */
interface TrailingParenthetical {
  /** Text before the trailing parenthetical group. */
  main: string;
  /** Text inside the trailing parenthetical group. */
  paren: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/**
 * Documentation sections in navigation and pager order.
 * Single source of truth for the top navigation, the previous/next pager, page titles, and meta descriptions.
 */
export const DOCS_SECTIONS: readonly DocsSectionMeta[] = [
  {
    description:
      'Static and status badges with pulsing radar dots, inline data widgets, icons, and micro-animations, plus the full query parameter reference.',
    navLabel: 'Badges',
    pagerLabel: 'Status Badges',
    slug: 'badges',
    title: 'Status Badges',
  },
  {
    description:
      '3D CTA buttons with size presets, leading and trailing icons, status dots, sheen and icon animations, and split two-segment layouts.',
    navLabel: 'Buttons',
    pagerLabel: 'CTA Buttons',
    slug: 'buttons',
    title: 'CTA Buttons',
  },
  {
    description:
      'Live package registry, CDN, and forge metric badges with edge caching and 302 redirects to the upstream page, generated from the service registry.',
    navLabel: 'Services',
    pagerLabel: 'Live Service Badges',
    slug: 'services',
    title: 'Live Service Badges',
  },
  {
    description:
      'Standalone Lucide UI icons and Simple Icons / Devicon brand logos as tinted SVGs with intrinsic pixel sizing, stroke control, aliases, and animations.',
    navLabel: 'Icons',
    pagerLabel: 'Standalone Icons',
    slug: 'icons',
    title: 'Standalone Icons',
  },
  {
    description:
      'Grouped tech stack icon grids with per-group columns, side-by-side groups, row bands, tile variants, and spacing controls.',
    navLabel: 'Tech Stack',
    pagerLabel: 'Tech Stack Grids',
    slug: 'stack',
    title: 'Tech Stack Grids',
  },
  {
    description:
      'Auto-wrapping README quote cards in horizontal and vertical layouts with size presets, accent colors, surface tiers, and sheen.',
    navLabel: 'Quotes',
    pagerLabel: 'Quote Cards',
    slug: 'quotes',
    title: 'Quote Cards',
  },
  {
    description:
      'Every Tailwind v4 OKLCH theme color token accepted by ?color= across badges, buttons, icons, tech stacks, and quote cards.',
    navLabel: 'Colors',
    pagerLabel: 'Theme Colors',
    slug: 'colors',
    title: 'Theme Color Tokens',
  },
];

/** Page background in the light color scheme (also the light `theme-color`). */
const LIGHT_BG = '#ffffff';

/** Page background in the dark color scheme (also the dark `theme-color`). */
const DARK_BG = '#101010';

/** Start color of the indigo brand gradient (navbar brand mark and favicon). */
const BRAND_GRADIENT_START = '#818cf8';

/** End color of the indigo brand gradient (navbar brand mark and favicon). */
const BRAND_GRADIENT_END = '#4f46e5';

/** Shared SVG root attributes of every inline UI icon. */
const UI_ICON_SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"';

/** Additional SVG root attributes of Lucide stroke UI icons. */
const LUCIDE_STROKE_ATTRS =
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

/** `localStorage` key of the persisted color scheme override (`'dark'` or `'light'`). */
const COLOR_SCHEME_STORAGE_KEY = 'color-scheme';

/** `localStorage` key of the persisted preview stage background. */
const PREVIEW_BG_STORAGE_KEY = 'preview-bg';

/** Preview stage background options; The first option is the default and follows the page theme. */
const PREVIEW_BG_OPTIONS: readonly PreviewBackgroundOption[] = [
  { label: 'Match page', value: 'auto' },
  { label: 'Inverted', value: 'inverse' },
  { label: 'Checker', value: 'checker' },
];

/**
 * Design tokens bound to `--c-*` custom properties for both color schemes.
 * Tokens with identical light and dark values are emitted once.
 */
const THEME_TOKENS: readonly ThemeToken[] = [
  { dark: DARK_BG, isColor: true, light: LIGHT_BG, name: 'bg' },
  { dark: '#000000', isColor: true, light: '#fafafa', name: 'bg-alt' },
  { dark: '#1a1a1a', isColor: true, light: '#f0f0f0', name: 'bg-elv' },
  { dark: '#000000', isColor: true, light: '#fafafa', name: 'bg-soft' },
  { dark: '#262626', isColor: true, light: '#ededed', name: 'divider' },
  { dark: 'rgba(255 255 255 / 0.9)', isColor: true, light: 'rgba(0 0 0 / 0.88)', name: 'text-1' },
  { dark: 'rgba(255 255 255 / 0.6)', isColor: true, light: 'rgba(0 0 0 / 0.6)', name: 'text-2' },
  // WCAG AA (≥ 4.5:1) for small text on both `bg` and `bg-soft`.
  { dark: 'rgba(255 255 255 / 0.5)', isColor: true, light: 'rgba(0 0 0 / 0.55)', name: 'text-3' },
  { dark: BRAND_GRADIENT_START, isColor: true, light: BRAND_GRADIENT_END, name: 'brand-1' },
  { dark: '#6366f1', isColor: true, light: '#6366f1', name: 'brand-2' },
  { dark: BRAND_GRADIENT_END, isColor: true, light: BRAND_GRADIENT_START, name: 'brand-3' },
  {
    dark: `color-mix(in srgb, ${DARK_BG} 64%, transparent)`,
    isColor: true,
    light: `color-mix(in srgb, ${LIGHT_BG} 75%, transparent)`,
    name: 'nav-bg',
  },
  { dark: BRAND_GRADIENT_END, isColor: true, light: BRAND_GRADIENT_END, name: 'btn-brand-bg' },
  { dark: '#ffffff', isColor: true, light: '#ffffff', name: 'btn-brand-text' },
  {
    dark: `color-mix(in srgb, #6366f1, ${BRAND_GRADIENT_END} 50%)`,
    isColor: true,
    light: `color-mix(in srgb, #6366f1, ${BRAND_GRADIENT_END} 50%)`,
    name: 'btn-brand-hover-bg',
  },
  { dark: '#26262a', isColor: true, light: '#f0f0f0', name: 'switch-bg' },
  { dark: '#000000', isColor: true, light: '#ffffff', name: 'switch-thumb-bg' },
  // Inverted preview stage: GitHub's README canvas of the opposite color scheme.
  { dark: '#ffffff', isColor: true, light: '#0d1117', name: 'preview-inverse-bg' },
  { dark: '#d0d7de', isColor: true, light: '#30363d', name: 'preview-inverse-border' },
  // Isolux Pro syntax tokens.
  { dark: '#8a8a8a', isColor: true, light: '#646464', name: 'hl-p' },
  { dark: '#ffa4aa', isColor: true, light: '#c5002b', name: 'hl-op' },
  { dark: '#7ceee3', isColor: true, light: '#2b7676', name: 'hl-alt' },
  { dark: '#909fff', isColor: true, light: '#4f48ec', name: 'hl-url' },
  { dark: '#bcfff7', isColor: true, light: '#214a4b', name: 'hl-key' },
  { dark: '#d5acff', isColor: true, light: '#8a0be5', name: 'hl-val' },
  { dark: '#93f0b0', isColor: true, light: '#367a44', name: 'hl-href' },
  // Theme switch state (non-color tokens, so they never go through `light-dark()`).
  { dark: '18px', isColor: false, light: '0px', name: 'switch-thumb-shift' },
  { dark: 'none', isColor: false, light: 'inline-flex', name: 'theme-light-display' },
  { dark: 'inline-flex', isColor: false, light: 'none', name: 'theme-dark-display' },
];

/** Preferred monospace font stack for code, route pills, and parameter names. */
const MONO_FONT_STACK =
  "'JetBrains Mono NF', 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace";

/** Memoized inline UI icon HTML keyed by `slug|size|extraClass`. */
const UI_ICON_HTML_CACHE = new Map<string, string>();

/** Memoized header HTML keyed by active navigation tab. */
const HEADER_HTML_CACHE = new Map<NavPageId, string>();

/** Memoized `<style>` element (`undefined` until first rendered). */
let stylesheetHtmlCache: string | undefined = undefined;

/** Memoized client `<script>` element (`undefined` until first rendered). */
let clientScriptHtmlCache: string | undefined = undefined;

/** Memoized blocking `<head>` script (`undefined` until first rendered). */
let headScriptHtmlCache: string | undefined = undefined;

/** Memoized footer HTML (`undefined` until first rendered). */
let footerHtmlCache: string | undefined = undefined;

/** Memoized header preview background picker HTML (`undefined` until first rendered). */
let previewBgPickerHtmlCache: string | undefined = undefined;

/** Memoized standalone favicon SVG (`undefined` until first rendered). */
let faviconSvgCache: string | undefined = undefined;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches comma-separated items inside a card title parenthetical. */
const COMMA_SPLIT_RX = /,\s*/;

/** Matches separator tokens (` | `, ` / `, ` to `, `...`) and bracketed alias suffixes (` [l]`) inside parameter code cells. */
const PARAM_CODE_TOKEN_RX = /\s\|\s|\s\/\s|\sto\s|\.\.\.|\s\[[^\]]*\]/g;

/** Matches SVG `id="…"` attributes and their `url(#…)` / `href="#…"` references for per-instance ID scoping. */
const SVG_ID_REFERENCE_RX = /(?<prefix>\sid="|url\(#|href="#)(?<name>[^")]+)/g;

/** Matches runs of characters that are not allowed in generated anchor IDs. */
const SLUG_INVALID_RX = /[^a-z0-9]+/g;

/** Matches a single leading or trailing dash left over after slug normalization. */
const SLUG_EDGE_DASH_RX = /^-|-$/g;

/** Matches inline `` `code` `` markup in section titles, descriptions, and subheads. */
const INLINE_CODE_RX = /`(?<code>[^`]+)`/g;

/** Matches inline `**strong**` markup in section titles and descriptions. */
const INLINE_STRONG_RX = /\*\*(?<strong>[^*]+)\*\*/g;

/** Matches inline markup characters (backticks and double asterisks) for plain-text labels. */
const INLINE_MARKUP_CHARS_RX = /`|\*\*/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Serialize the allowed preview background values as a JSON array literal for the inline scripts. */
function formatPreviewBgValuesJson(): string {
  const values: string[] = [];
  for (const option of PREVIEW_BG_OPTIONS) {
    values.push(option.value);
  }
  return JSON.stringify(values);
}

/**
 * Render an inline UI icon (`<svg class="ui-icon">`) from `lucide-static` or `@iconify-json/simple-icons`.
 * Exported for the catalog and pages; It lives here because the shell itself depends on it (`no-use-before-define`).
 * @param slug         Icon slug (e.g., `'sparkles'`, `'copy'`, `'check'`, `'chevron-right'`, `'github'`).
 * @param size         Width and height in pixels (defaults to `16`).
 * @param extraClass   Optional additional CSS class name(s) appended to `ui-icon`.
 * @returns Inline `<svg>` HTML string, or empty string if the slug is not found.
 */
export function renderUiIcon(slug: string, size = 16, extraClass = ''): string {
  const cacheKey = `${slug}|${size}|${extraClass}`;
  const cached = UI_ICON_HTML_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const resolved = resolveIcon(slug);
  const classAttr = extraClass ? `ui-icon ${extraClass}` : 'ui-icon';
  const paintAttrs = resolved?.type === 'lucide' ? LUCIDE_STROKE_ATTRS : 'fill="currentColor"';
  const iconHtml = resolved
    ? `<svg class="${classAttr}" ${UI_ICON_SVG_ATTRS} width="${size}" height="${size}" ${paintAttrs}>${resolved.innerSvg}</svg>`
    : '';
  UI_ICON_HTML_CACHE.set(cacheKey, iconHtml);
  return iconHtml;
}

/** Convert free text into a URL-fragment-safe anchor ID (e.g., `'variant=1 · Primary'` -> `'variant-1-primary'`). */
function slugifyText(text: string): string {
  return text.toLowerCase().replace(SLUG_INVALID_RX, '-').replace(SLUG_EDGE_DASH_RX, '');
}

/** Hash text into a short, deterministic base-36 token (polynomial rolling hash modulo a 31-bit prime). */
function hashText(text: string): string {
  let hash = 7;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + (text.codePointAt(i) ?? 0)) % 2_147_483_647;
  }
  return hash.toString(36);
}

/**
 * Prefix every `id` and internal `url(#…)` / `href="#…"` reference of an inline SVG with a unique scope,
 * so many inlined previews never share element IDs (gradient, clip, and sheen definitions).
 */
function scopeSvgIds(svg: string, scope: string): string {
  return svg.replace(SVG_ID_REFERENCE_RX, `$<prefix>${scope}-$<name>`);
}

/** Escape text and convert inline `` `code` `` and `**strong**` markup into HTML. */
function formatInlineMarkupHtml(text: string): string {
  return escapeXml(text)
    .replace(INLINE_CODE_RX, '<code>$<code></code>')
    .replace(INLINE_STRONG_RX, '<strong>$<strong></strong>');
}

/** Strip inline markup characters for plain-text labels and anchor IDs. */
function stripInlineMarkup(text: string): string {
  return text.replace(INLINE_MARKUP_CHARS_RX, '');
}

/** Render a hover/focus `#` permalink to an in-page anchor. */
function renderAnchorLink(targetId: string, label: string): string {
  return `<a class="anchor-link" href="#${escapeXml(targetId)}" aria-label="Link to “${escapeXml(label)}”">#</a>`;
}

/** Highlight a URL's base path and query parameters (`?key=value&...`) for Markdown code drawers. */
function highlightUrlHtml(rawUrl: string): string {
  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex === -1) {
    return `<span class="hl-url">${escapeXml(rawUrl)}</span>`;
  }

  const basePath = rawUrl.slice(0, queryIndex);
  const pairs = rawUrl.slice(queryIndex + 1).split('&');
  let queryHtml = '';

  for (let i = 0; i < pairs.length; i += 1) {
    if (i > 0) {
      queryHtml += '<span class="hl-op">&amp;</span>';
    }
    const pair = pairs[i];
    const equalsIndex = pair.indexOf('=');
    if (equalsIndex === -1) {
      queryHtml += `<span class="hl-key">${escapeXml(pair)}</span>`;
    } else {
      const key = pair.slice(0, equalsIndex);
      const value = pair.slice(equalsIndex + 1);
      queryHtml += `<span class="hl-key">${escapeXml(key)}</span><span class="hl-op">=</span><span class="hl-val">${escapeXml(value)}</span>`;
    }
  }

  return `<span class="hl-url">${escapeXml(basePath)}</span><span class="hl-op">?</span>${queryHtml}`;
}

/** Format a `ShowcaseItem` into a syntax-highlighted GitHub README Markdown line whose `.textContent` is exact Markdown. */
function formatHighlightedMarkdownSnippet(item: ShowcaseItem): string {
  const fullUrl = `${SITE_ORIGIN}${item.path}`;
  const imageHtml = `<span class="hl-p">![</span><span class="hl-alt">${escapeXml(item.alt)}</span><span class="hl-p">](</span>${highlightUrlHtml(fullUrl)}<span class="hl-p">)</span>`;
  const href = item.href ?? resolveSvgPathRedirectUrl(item.path);
  if (!href) {
    return imageHtml;
  }
  return `<span class="hl-p">[</span>${imageHtml}<span class="hl-p">](</span><span class="hl-href">${escapeXml(href)}</span><span class="hl-p">)</span>`;
}

/**
 * Split a trailing ` (parenthetical)` group off a string without regex backtracking.
 * @param text   Trimmed input text (e.g., `'Primary Badge (Default)'`).
 * @returns Main text and parenthetical content, or `undefined` when there is no trailing group.
 */
function splitTrailingParenthetical(text: string): TrailingParenthetical | undefined {
  if (!text.endsWith(')')) {
    return undefined;
  }
  const openIndex = text.lastIndexOf(' (');
  if (openIndex <= 0) {
    return undefined;
  }
  const paren = text.slice(openIndex + 2, -1).trim();
  const main = text.slice(0, openIndex).trim();
  if (!paren || !main || paren.includes('(') || paren.includes(')')) {
    return undefined;
  }
  return { main, paren };
}

/**
 * Format a card title string into hierarchical HTML with a primary heading, optional leading code badge, and optional trailing meta/status pills.
 * @param rawTitle   Card title (`code · Text (meta, pill)`, every part optional except `Text`).
 * @returns Inner HTML of the card title heading.
 */
function formatCardTitleHtml(rawTitle: string): string {
  let remainder = rawTitle.trim();
  let trailingPillHtml = '';

  // 1. Extract the trailing parenthetical group first so inner symbols never interfere with ` · ` prefix splitting.
  const trailing = splitTrailingParenthetical(remainder);
  if (trailing) {
    remainder = trailing.main;
    for (const part of trailing.paren.split(COMMA_SPLIT_RX)) {
      const cleanPart = part.trim();
      if (cleanPart.length > 0) {
        const isCodeMeta =
          cleanPart.startsWith('/') ||
          cleanPart.startsWith('?') ||
          cleanPart.startsWith('@') ||
          cleanPart.includes('=');
        trailingPillHtml += isCodeMeta
          ? `<code class="card-title-meta">${escapeXml(cleanPart)}</code>`
          : `<span class="card-title-pill">${escapeXml(cleanPart)}</span>`;
      }
    }
  }

  // 2. Extract the leading `code · ` prefix if present on the main title text.
  let prefixBadgeHtml = '';
  const dotSeparatorIndex = remainder.indexOf(' · ');
  if (dotSeparatorIndex !== -1) {
    const prefix = remainder.slice(0, dotSeparatorIndex).trim();
    remainder = remainder.slice(dotSeparatorIndex + 3).trim();
    prefixBadgeHtml = `<code class="card-title-code">${escapeXml(prefix)}</code>`;
  }

  return `${prefixBadgeHtml}<span class="card-title-text">${escapeXml(remainder)}</span>${trailingPillHtml}`;
}

/** Render a `<code class="param-code">` block with dimmed, non-selectable separators and alias notes. */
function renderCodeWithDimmedSeparators(rawCode: string): string {
  let innerHtml = '';
  let cursor = 0;
  for (const match of rawCode.matchAll(PARAM_CODE_TOKEN_RX)) {
    const [token] = match;
    innerHtml += escapeXml(rawCode.slice(cursor, match.index));
    innerHtml += token.endsWith(']')
      ? ` <span class="param-alias">(${escapeXml(token.trim().slice(1, -1))})</span>`
      : `<span class="param-sep">${escapeXml(token)}</span>`;
    cursor = match.index + token.length;
  }
  innerHtml += escapeXml(rawCode.slice(cursor));
  return `<code class="param-code">${innerHtml}</code>`;
}

/** Render a single `code` or `code (note)` segment inside a parameter table cell. */
function renderParamSegmentHtml(segment: string): string {
  const trimmed = segment.trim();
  if (trimmed.startsWith('~')) {
    return `<span class="param-note">${escapeXml(trimmed.slice(1).trim())}</span>`;
  }
  const trailing = splitTrailingParenthetical(trimmed);
  if (trailing) {
    return `${renderCodeWithDimmedSeparators(trailing.main)} <span class="param-note">(${escapeXml(trailing.paren)})</span>`;
  }
  return renderCodeWithDimmedSeparators(trimmed);
}

/** Format a parameter table `Values` or `Default` cell with dimmed pipes/ranges and separated explanatory notes. */
function formatParamCellHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.includes(') / ')) {
    return renderParamSegmentHtml(trimmed);
  }
  const renderedParts: string[] = [];
  for (const part of trimmed.split(' / ')) {
    renderedParts.push(renderParamSegmentHtml(part));
  }
  return renderedParts.join(' <span class="param-sep">/</span> ');
}

/** Render a single top navigation link. */
function renderNavLink(href: string, label: string, isActive: boolean): string {
  const activeAttrs = isActive
    ? ' class="nav-link is-active" aria-current="page"'
    : ' class="nav-link"';
  return `<a href="${escapeXml(href)}"${activeAttrs}><span class="nav-text">${escapeXml(label)}</span></a>`;
}

/**
 * Render (once per isolate) the header preview background picker: A compact swatch trigger that opens a
 * native popover radio group (Match page / Inverted / Checker), persisted by the client script.
 */
function renderPreviewBgPicker(): string {
  if (previewBgPickerHtmlCache !== undefined) {
    return previewBgPickerHtmlCache;
  }
  let optionsHtml = '';
  for (let i = 0; i < PREVIEW_BG_OPTIONS.length; i += 1) {
    const option = PREVIEW_BG_OPTIONS[i];
    const checkedAttr = i === 0 ? ' checked' : '';
    optionsHtml += `<label class="bg-picker-option"><input class="bg-picker-input" type="radio" name="preview-bg" value="${option.value}"${checkedAttr} /><span class="bg-swatch" data-bg="${option.value}" aria-hidden="true"></span><span class="bg-picker-label">${escapeXml(option.label)}</span>${renderUiIcon('check', 13, 'bg-picker-check')}</label>`;
  }
  const chevronIcon = renderUiIcon('chevron-down', 12, 'bg-picker-chevron');
  previewBgPickerHtmlCache = `<div class="bg-picker">
          <button type="button" class="bg-picker-trigger" id="bg-picker-trigger" popovertarget="bg-picker-menu" aria-label="Preview background" title="Preview background">
            <span class="bg-swatch bg-swatch-current" aria-hidden="true"></span>${chevronIcon}
          </button>
          <div class="bg-picker-menu" id="bg-picker-menu" popover role="radiogroup" aria-labelledby="bg-picker-title">
            <span class="bg-picker-title" id="bg-picker-title">Preview background</span>
            ${optionsHtml}
          </div>
        </div>`;
  return previewBgPickerHtmlCache;
}

/** Render (once per active tab) the sticky top navigation bar matching the VitePress text-link navbar style. */
function renderHeaderNav(activePage: NavPageId): string {
  const cached = HEADER_HTML_CACHE.get(activePage);
  if (cached !== undefined) {
    return cached;
  }

  let navItemsHtml = renderNavLink('/', 'Home', activePage === 'home');
  for (const section of DOCS_SECTIONS) {
    navItemsHtml += renderNavLink(
      `/docs/${section.slug}`,
      section.navLabel,
      section.slug === activePage
    );
  }

  const brandIcon = renderUiIcon('sparkles', 15, 'brand-sparkle');
  const sunIcon = renderUiIcon('sun', 12, 'theme-icon theme-label-light');
  const moonIcon = renderUiIcon('moon', 12, 'theme-icon theme-label-dark');
  const githubIcon = renderUiIcon('github', 20, 'gh-icon');

  const headerHtml = `<header class="site-header">
    <div class="header-inner">
      <a href="/" class="brand-link">
        <span class="brand-mark" aria-hidden="true">${brandIcon}</span>
        <span class="brand-name">svg.xul.is</span>
      </a>
      <nav class="site-nav" aria-label="Documentation sections">${navItemsHtml}</nav>
      <div class="header-actions">
        <span class="header-divider" aria-hidden="true"></span>
        ${renderPreviewBgPicker()}
        <button type="button" class="theme-switch" id="theme-toggle" role="switch" aria-checked="false" aria-label="Dark color scheme" title="Toggle dark color scheme">
          <span class="theme-switch-thumb">
            ${sunIcon}
            ${moonIcon}
          </span>
        </button>
        <span class="header-divider" aria-hidden="true"></span>
        <a href="https://github.com/xulbux" class="gh-link" target="_blank" rel="noopener noreferrer" aria-label="XulbuX on GitHub" title="XulbuX on GitHub">
          ${githubIcon}
        </a>
      </div>
    </div>
  </header>`;
  HEADER_HTML_CACHE.set(activePage, headerHtml);
  return headerHtml;
}

/** Render (once per isolate) the site footer matching the XulbuX documentation aesthetic. */
function renderFooter(): string {
  if (footerHtmlCache !== undefined) {
    return footerHtmlCache;
  }
  const sparkleIcon = renderUiIcon('sparkles', 14, 'footer-sparkle');
  footerHtmlCache = `<footer class="site-footer">
    <div class="footer-inner">
      <p class="footer-feedback">
        Missing a public API service, vector icon, or even a whole new SVG element? Feel free to <a href="mailto:hi@xul.is" class="text-link">send an email to hi@xul.is</a> and let me know!
      </p>
      <div class="footer-meta">
        <p class="footer-license">Released under the MIT License.</p>
        <p class="footer-credit">
          ${sparkleIcon}
          <span class="footer-from">From <a href="https://github.com/xulbux" class="text-link" target="_blank" rel="noopener noreferrer"><b>XulbuX</b></a></span>
          ${sparkleIcon}
        </p>
      </div>
    </div>
  </footer>`;
  return footerHtmlCache;
}

/** Render the `--c-*` bindings of one color scheme (`includeShared` also emits scheme-independent tokens). */
function renderThemeTokenBindings(scheme: 'dark' | 'light', includeShared: boolean): string {
  let css = '';
  for (const token of THEME_TOKENS) {
    if (includeShared || token.light !== token.dark) {
      css += `--c-${token.name}: ${token[scheme]};\n`;
    }
  }
  return css;
}

/** Render the `light-dark()` bindings of every scheme-dependent color token. */
function renderLightDarkTokenBindings(): string {
  let css = '';
  for (const token of THEME_TOKENS) {
    if (token.isColor && token.light !== token.dark) {
      css += `--c-${token.name}: light-dark(${token.light}, ${token.dark});\n`;
    }
  }
  return css;
}

/** Build the `color-scheme` meta selector for an explicit scheme override. */
function buildSchemeOverrideSelector(scheme: 'dark' | 'light'): string {
  return `&:has(> head > meta[name="color-scheme"][content="${scheme}"])`;
}

/** Render (once per isolate) the shared CSS stylesheet using XulbuX surface tokens, indigo accent palette, and layered border hierarchy. */
function renderStylesheet(): string {
  if (stylesheetHtmlCache !== undefined) {
    return stylesheetHtmlCache;
  }
  stylesheetHtmlCache = `<style>
    @view-transition {
      navigation: auto;
    }

    :root {
      interpolate-size: allow-keywords;
      color-scheme: light dark;
      --base-brand: ${BRAND_GRADIENT_END};
      --font-mono: ${MONO_FONT_STACK};

      /* Active Theme Bindings (Default Light) */
      ${renderThemeTokenBindings('light', true)}

      @media (prefers-color-scheme: dark) {
        ${renderThemeTokenBindings('dark', false)}
      }

      ${buildSchemeOverrideSelector('dark')} {
        color-scheme: dark;
        ${renderThemeTokenBindings('dark', false)}
      }

      ${buildSchemeOverrideSelector('light')} {
        color-scheme: light;
        ${renderThemeTokenBindings('light', false)}
      }

      @supports (color: light-dark(white, black)) {
        ${renderLightDarkTokenBindings()}
      }

      /* 3-Tier Border Hierarchy: Outer Divider > Standard Border > Inner Subtle Border */
      --c-border: color-mix(in srgb, var(--c-bg), var(--c-divider) 72%);
      --c-border-subtle: color-mix(in srgb, var(--c-bg), var(--c-divider) 42%);
      --c-code-bg: color-mix(in srgb, var(--c-bg), var(--c-divider) 65%);
      --c-brand-soft: color-mix(in srgb, var(--c-brand-1) 12%, transparent);
      --c-brand-border: color-mix(in srgb, var(--c-brand-1) 36%, transparent);

      accent-color: var(--c-brand-1);
      scrollbar-width: thin;
      scrollbar-color: color-mix(in srgb, var(--c-text-1) 24%, transparent) transparent;
    }

    ::selection {
      background-color: color-mix(in srgb, var(--c-brand-2) 40%, transparent);
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-block-size: 100dvh;
      display: flex;
      flex-direction: column;
      background: var(--c-bg);
      color: var(--c-text-1);
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
      line-height: 1.55;
      transition: background-color 0.2s ease, color 0.2s ease;
    }

    h1, h2, h3, h4, th {
      text-wrap: balance;
      margin-block: 0;
    }

    p, li {
      text-wrap: pretty;
    }

    pre, code {
      font-family: var(--font-mono);
      font-feature-settings: 'calt' 1, 'liga' 1;
      font-variant-ligatures: normal;
    }

    /* Keyboard Focus Rings */
    :where(a, button, summary, [tabindex]):focus-visible {
      outline: 2px solid var(--c-brand-1);
      outline-offset: 2px;
    }

    .page-main:focus-visible {
      outline: none;
    }

    .visually-hidden {
      position: absolute !important;
      inline-size: 1px !important;
      block-size: 1px !important;
      margin: -1px !important;
      padding: 0 !important;
      overflow: hidden !important;
      clip-path: inset(50%) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }

    /* Skip Link: hidden until focused by keyboard */
    .skip-link {
      position: fixed;
      inset-block-start: 10px;
      inset-inline-start: 10px;
      z-index: 50;
      padding: 8px 14px;
      border-radius: 8px;
      background: var(--c-btn-brand-bg);
      color: var(--c-btn-brand-text);
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      translate: 0 calc(-100% - 20px);
    }

    .skip-link:focus-visible {
      translate: 0 0;
    }

    .ui-icon {
      flex-shrink: 0;
      display: inline-block;
      vertical-align: middle;
      user-select: none;
      -webkit-user-select: none;
      pointer-events: none;
    }

    /* Text links: transparent underline by default, fades in to solid currentColor on hover */
    .text-link {
      color: var(--c-text-1);
      text-decoration: none;
      border-block-end: 1px solid transparent;
      transition: border-color 0.2s ease;
    }

    .text-link:hover {
      border-block-end-color: currentColor;
    }

    /* Sticky Header & VitePress-Style Text Navigation */
    .site-header {
      view-transition-name: site-header;
      position: sticky;
      inset-block-start: 0;
      z-index: 20;
      background: var(--c-nav-bg);
      border-block-end: 1px solid var(--c-divider);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      user-select: none;
      -webkit-user-select: none;
    }

    .header-inner {
      max-inline-size: 1180px;
      margin-inline: auto;
      padding: 12px clamp(16px, 3.5vw, 32px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .brand-link {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      text-decoration: none;
      color: var(--c-text-1);
      font-weight: 700;
      font-size: 1rem;
      flex-shrink: 0;
    }

    .brand-mark {
      inline-size: 26px;
      block-size: 26px;
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, ${BRAND_GRADIENT_START} 0%, ${BRAND_GRADIENT_END} 100%);
      color: #ffffff;
    }

    /* Horizontally scrolling navigation with edge fades while more links are hidden (classes set by the client script) */
    .site-nav {
      --nav-fade-start: 0px;
      --nav-fade-end: 0px;
      display: flex;
      align-items: center;
      gap: 2px;
      overflow-x: auto;
      scrollbar-width: none;
      margin-inline-start: auto;
      -webkit-mask-image: linear-gradient(to right, transparent, #000 var(--nav-fade-start), #000 calc(100% - var(--nav-fade-end)), transparent);
      mask-image: linear-gradient(to right, transparent, #000 var(--nav-fade-start), #000 calc(100% - var(--nav-fade-end)), transparent);
    }

    .site-nav.can-scroll-start {
      --nav-fade-start: 32px;
    }

    .site-nav.can-scroll-end {
      --nav-fade-end: 32px;
    }

    .nav-link {
      display: inline-flex;
      align-items: center;
      text-decoration: none;
      color: var(--c-text-1);
      font-size: 0.875rem;
      font-weight: 500;
      padding: 4px 11px;
      border-radius: 6px;
      white-space: nowrap;
      transition: color 0.25s ease;
    }

    .nav-link:focus-visible {
      outline-offset: -2px;
    }

    .nav-link:hover {
      color: var(--c-brand-1);
    }

    .nav-link.is-active {
      color: var(--c-brand-1);
    }

    /* VitePress-Style Theme Switch & Social Link */
    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .theme-switch {
      position: relative;
      display: inline-flex;
      align-items: center;
      inline-size: 40px;
      block-size: 22px;
      flex-shrink: 0;
      border-radius: 11px;
      border: 1px solid var(--c-divider);
      background: var(--c-switch-bg);
      cursor: pointer;
      padding: 0;
      transition: border-color 0.25s ease, background-color 0.25s ease;
    }

    .theme-switch:hover {
      border-color: var(--c-text-3);
    }

    /* The thumb position and sun/moon icon follow the active scheme tokens without requiring JS */
    .theme-switch-thumb {
      position: absolute;
      inset-block-start: 1px;
      inset-inline-start: 1px;
      inline-size: 18px;
      block-size: 18px;
      border-radius: 50%;
      background: var(--c-switch-thumb-bg);
      color: var(--c-text-2);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      translate: var(--c-switch-thumb-shift) 0;
      transition: translate 0.25s ease, background-color 0.25s ease, color 0.25s ease;
    }

    .theme-switch:hover .theme-switch-thumb {
      color: var(--c-text-1);
    }

    .theme-label-light {
      display: var(--c-theme-light-display);
    }

    .theme-label-dark {
      display: var(--c-theme-dark-display);
    }

    .header-divider {
      inline-size: 1px;
      block-size: 24px;
      background: var(--c-divider);
      pointer-events: none;
    }

    .gh-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 32px;
      block-size: 32px;
      border-radius: 6px;
      color: var(--c-text-2);
      text-decoration: none;
      transition: color 0.2s ease;
    }

    .gh-link:hover {
      color: var(--c-text-1);
    }

    /* Header Preview Background Picker (native popover, anchored below its trigger where supported) */
    .bg-picker {
      position: relative;
      display: inline-flex;
    }

    .bg-picker-trigger {
      anchor-name: --bg-picker;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      block-size: 22px;
      padding: 0 5px 0 3px;
      border-radius: 11px;
      border: 1px solid var(--c-divider);
      background: var(--c-switch-bg);
      color: var(--c-text-2);
      cursor: pointer;
      transition: border-color 0.25s ease, color 0.25s ease;
    }

    .bg-picker-trigger:hover,
    .bg-picker:has(.bg-picker-menu:where(:popover-open, .is-open)) .bg-picker-trigger {
      border-color: var(--c-text-3);
      color: var(--c-text-1);
    }

    .bg-picker-chevron {
      transition: rotate 0.2s ease;
    }

    .bg-picker:has(.bg-picker-menu:where(:popover-open, .is-open)) .bg-picker-chevron {
      rotate: 180deg;
    }

    /* Swatches: Options show their own background; The trigger mirrors the active one */
    .bg-swatch {
      inline-size: 14px;
      block-size: 14px;
      flex-shrink: 0;
      border-radius: 50%;
      border: 1px solid var(--c-border);
      background: var(--c-bg);
    }

    .bg-swatch[data-bg="inverse"],
    :root[data-preview-bg="inverse"] .bg-swatch-current {
      background: var(--c-preview-inverse-bg);
      border-color: var(--c-preview-inverse-border);
    }

    .bg-swatch[data-bg="checker"],
    :root[data-preview-bg="checker"] .bg-swatch-current {
      background:
        repeating-conic-gradient(color-mix(in srgb, var(--c-text-1) 24%, transparent) 0 25%, transparent 0 50%) 0 0 / 6px 6px,
        var(--c-bg);
    }

    .bg-picker-menu {
      position: fixed;
      inset: auto;
      margin: 0;
      min-inline-size: 176px;
      padding: 6px;
      border: 1px solid var(--c-divider);
      border-radius: 10px;
      background: var(--c-bg-soft);
      color: var(--c-text-1);
      box-shadow: 0 10px 30px rgba(0 0 0 / 0.18);
      flex-direction: column;
      gap: 2px;
    }

    .bg-picker-menu:where(:popover-open, .is-open) {
      display: flex;
    }

    .bg-picker-menu:not(:where(:popover-open, .is-open)) {
      display: none;
    }

    /* Fallback without the Popover API: The menu stays in flow, so position it below the trigger */
    .bg-picker-menu.is-open {
      position: absolute;
      inset-block-start: calc(100% + 8px);
      inset-inline-end: 0;
    }

    @supports (position-area: block-end) {
      .bg-picker-menu {
        position-anchor: --bg-picker;
        position-area: block-end span-inline-start;
        position-try-fallbacks: flip-inline;
        margin-block-start: 8px;
      }
    }

    .bg-picker-title {
      padding: 4px 8px 6px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--c-text-3);
    }

    .bg-picker-option {
      position: relative;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 0.82rem;
      font-weight: 500;
      color: var(--c-text-2);
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
    }

    .bg-picker-option:hover {
      background: color-mix(in srgb, var(--c-text-1) 6%, transparent);
      color: var(--c-text-1);
    }

    .bg-picker-option:has(:checked) {
      color: var(--c-brand-1);
    }

    .bg-picker-option:has(:focus-visible) {
      outline: 2px solid var(--c-brand-1);
      outline-offset: -2px;
    }

    .bg-picker-input {
      position: absolute;
      inset: 0;
      margin: 0;
      opacity: 0;
      cursor: pointer;
    }

    .bg-picker-label {
      flex: 1;
    }

    .bg-picker-check {
      visibility: hidden;
    }

    .bg-picker-option:has(:checked) .bg-picker-check {
      visibility: visible;
    }

    @media (max-width: 860px) {
      .site-nav {
        order: 3;
        inline-size: 100%;
        margin-inline-start: 0;
        padding-block-start: 8px;
        border-block-start: 1px solid var(--c-border-subtle);
      }

      .header-actions > .header-divider:first-child {
        display: none;
      }
    }

    /* Main Content Container */
    .page-main {
      flex: 1;
      inline-size: 100%;
      max-inline-size: 1180px;
      margin-inline: auto;
      padding: clamp(32px, 5vw, 52px) clamp(16px, 3.5vw, 32px) 84px;
    }

    /* Hero Banner */
    .hero {
      position: relative;
      overflow: hidden;
      background: var(--c-bg-soft);
      border: 1px solid var(--c-divider);
      border-radius: 14px;
      padding: clamp(28px, 4.5vw, 44px);
      margin-block-end: 44px;
    }

    .hero-title {
      position: relative;
      font-size: clamp(1.65rem, 1.2rem + 2vw, 2.45rem);
      font-weight: 800;
      letter-spacing: -0.025em;
      line-height: 1.22;
      margin-block-end: 12px;
      color: var(--c-text-1);
    }

    .hero-gradient-text {
      color: var(--c-brand-1);
    }

    .hero-lead {
      position: relative;
      font-size: clamp(0.95rem, 0.9rem + 0.25vw, 1.05rem);
      color: var(--c-text-2);
      max-inline-size: 66ch;
      margin-block: 0 22px;
    }

    .hero-lead code {
      color: var(--c-brand-1);
      background: var(--c-brand-soft);
      border: 1px solid color-mix(in srgb, var(--c-brand-1) 24%, transparent);
      padding: 1px 6px;
      border-radius: 5px;
      font-size: 0.88em;
    }

    .hero-cta-row {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      user-select: none;
      -webkit-user-select: none;
    }

    .btn-primary, .btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 16px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      user-select: none;
      -webkit-user-select: none;
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
    }

    .btn-primary {
      background: var(--c-btn-brand-bg);
      color: var(--c-btn-brand-text);
      border: 1px solid color-mix(in srgb, var(--c-brand-2), transparent 40%);
    }

    .btn-secondary {
      background: var(--c-border);
      color: var(--c-text-1);
      border: 1px solid var(--c-divider);
    }

    .btn-primary:hover {
      background: var(--c-btn-brand-hover-bg);
      box-shadow: 0 0 14px color-mix(in srgb, var(--base-brand) 32%, transparent);
    }

    .btn-secondary:hover {
      border-color: var(--c-brand-border);
      background: color-mix(in srgb, var(--c-text-1), var(--c-border) 94%);
    }

    /* Feature Highlights Grid (Matching python-lib-xulbux VPFeature) */
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
      gap: 18px;
      margin-block-end: 60px;
    }

    .feature-card {
      background: var(--c-bg-soft);
      border: 1px solid var(--c-border);
      border-radius: 12px;
      padding: 20px 22px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .feature-icon {
      inline-size: fit-content;
      block-size: auto;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      color: var(--c-brand-1);
      margin-block-end: 4px;
    }

    .feature-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--c-text-1);
    }

    .feature-desc {
      margin: 0;
      font-size: 0.84rem;
      color: var(--c-text-2);
      line-height: 1.55;
    }

    /* Section Headers & Spacious Subsections */
    .doc-section {
      margin-block-end: 60px;
      scroll-margin-block-start: 90px;
    }

    .section-header {
      margin-block-end: 28px;
    }

    .section-title {
      font-size: clamp(1.35rem, 1.1rem + 0.8vw, 1.65rem);
      font-weight: 700;
      letter-spacing: -0.015em;
      margin-block-end: 8px;
      color: var(--c-text-1);
    }

    .section-desc {
      margin-block: 0;
      color: var(--c-text-2);
      font-size: 0.925rem;
      max-inline-size: 72ch;
    }

    .section-desc code,
    .section-title code,
    .section-subhead code {
      color: color-mix(in srgb, var(--c-text-2), var(--c-text-1) 50%);
      background: var(--c-code-bg);
      border: 1px solid var(--c-border-subtle);
      padding: 1px 6px;
      border-radius: 5px;
      font-size: 0.86em;
    }

    .subhead-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-block: 52px 18px;
      scroll-margin-block-start: 90px;
    }

    .section-subhead {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--c-text-1);
    }

    .section-subhead .ui-icon {
      color: var(--c-brand-1);
    }

    /* Hover/Focus Deep-Link Anchors */
    .anchor-link {
      flex-shrink: 0;
      padding-inline: 4px;
      border-radius: 4px;
      color: var(--c-text-3);
      font-weight: 600;
      text-decoration: none;
      opacity: 0;
      user-select: none;
      -webkit-user-select: none;
      transition: opacity 0.15s ease, color 0.15s ease;
    }

    .anchor-link:hover {
      color: var(--c-brand-1);
    }

    .subhead-row:hover .anchor-link,
    .card-title-row:hover .anchor-link,
    .anchor-link:focus-visible,
    :target > .anchor-link,
    :target .card-title-row .anchor-link {
      opacity: 1;
    }

    @media (hover: none) {
      .anchor-link {
        opacity: 0.7;
      }
    }

    .route-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-block: 16px 0;
    }

    .route-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: var(--c-bg-soft);
      color: var(--c-text-1);
      border: 1px solid var(--c-border);
      padding: 5px 11px;
      border-radius: 7px;
      font-size: 0.78rem;
      overflow-x: auto;
      max-inline-size: 100%;
    }

    .route-method {
      color: var(--c-brand-1);
      font-weight: 700;
      font-size: 0.7rem;
      user-select: none;
      -webkit-user-select: none;
    }

    /* Responsive Card Grids & Hierarchical Cards */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
      gap: 20px;
    }

    .card-grid-3 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
      gap: 20px;
    }

    .table-wrapper + .card-grid,
    .table-wrapper + .card-grid-3 {
      margin-block-start: 40px;
    }

    .card-grid-3 + .card-grid,
    .card-grid + .card-grid {
      margin-block-start: 20px;
    }

    /* Skip layout and paint of off-screen cards (most of each page's weight is inline SVG previews) */
    .card-container {
      content-visibility: auto;
      contain-intrinsic-block-size: auto 320px;
      scroll-margin-block-start: 90px;
    }

    /* Outer Card: Distinct divider border + soft surface */
    .card {
      background: var(--c-bg-soft);
      border: 1px solid var(--c-divider);
      border-radius: 12px;
      padding: clamp(18px, 2.5vw, 24px);
      display: flex;
      flex-direction: column;
      gap: 16px;
      block-size: 100%;
      transition: border-color 0.2s ease;
    }

    .card-container:target .card {
      border-color: var(--c-brand-border);
    }

    .card-head {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .card-title-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .card-title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
      font-size: 0.94rem;
      font-weight: 700;
      color: var(--c-text-1);
      line-height: 1.35;
    }

    .card-title-text {
      color: var(--c-text-1);
    }

    .card-title-code {
      font-size: 0.76rem;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 6px;
      color: var(--c-brand-1);
      background: var(--c-brand-soft);
      border: 1px solid color-mix(in srgb, var(--c-brand-1) 28%, transparent);
    }

    .card-title-meta {
      font-size: 0.74rem;
      font-weight: 500;
      padding: 1px 7px;
      border-radius: 5px;
      color: var(--c-text-2);
      background: var(--c-bg);
      border: 1px solid var(--c-border-subtle);
    }

    .card-title-pill {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: calc(infinity * 1px);
      color: var(--c-text-2);
      background: var(--c-bg);
      border: 1px solid var(--c-border-subtle);
      user-select: none;
      -webkit-user-select: none;
    }

    .card-subtitle {
      font-size: 0.825rem;
      color: var(--c-text-2);
      margin-block: 0;
      line-height: 1.48;
    }

    /* Inner Preview Stage: Subtle border and non-interactable SVG previews */
    .preview-stage {
      position: relative;
      background: var(--c-bg);
      border: 1px solid var(--c-border-subtle);
      border-radius: 9px;
      padding: 18px 20px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      overflow-x: auto;
      max-inline-size: 100%;
      user-select: none;
      -webkit-user-select: none;
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }

    :root[data-preview-bg="inverse"] .preview-stage {
      background: var(--c-preview-inverse-bg);
      border-color: var(--c-preview-inverse-border);
    }

    :root[data-preview-bg="checker"] .preview-stage {
      background:
        repeating-conic-gradient(color-mix(in srgb, var(--c-text-1) 9%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px,
        var(--c-bg);
    }

    .preview-stage.is-centered {
      justify-content: center;
    }

    .preview-stage svg {
      max-inline-size: 100%;
      block-size: auto;
      flex-shrink: 0;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
    }

    /* Expandable <details> Markdown Code Drawer (Subtle inner hierarchy) */
    details.code-drawer {
      margin-block-start: auto;
    }

    details.code-drawer::details-content {
      block-size: 0;
      opacity: 0;
      overflow: clip;
      transition:
        block-size 0.22s ease,
        opacity 0.18s ease,
        content-visibility 0.22s ease allow-discrete;
    }

    details.code-drawer[open]::details-content {
      block-size: auto;
      opacity: 1;
    }

    details.code-drawer > summary {
      list-style: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.76rem;
      font-weight: 600;
      color: var(--c-text-2);
      user-select: none;
      -webkit-user-select: none;
      padding: 5px 11px;
      border-radius: 7px;
      background: var(--c-bg);
      border: 1px solid var(--c-border-subtle);
      transition: color 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
    }

    details.code-drawer > summary::-webkit-details-marker {
      display: none;
    }

    details.code-drawer > summary:hover {
      color: var(--c-text-1);
      border-color: var(--c-brand-border);
      background: color-mix(in srgb, var(--c-brand-1) 6%, var(--c-bg));
    }

    .drawer-chevron {
      display: inline-flex;
      transition: rotate 0.2s ease;
    }

    details.code-drawer[open] .drawer-chevron {
      rotate: 90deg;
    }

    .code-drawer-body {
      margin-block-start: 10px;
      background: var(--c-bg);
      color: var(--c-text-1);
      border: 1px solid var(--c-border-subtle);
      border-radius: 8px;
      padding: 10px 13px;
      overflow: hidden;
    }

    .code-drawer-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-block-end: 4px;
      padding-block-end: 7px;
      border-block-end: 1px solid var(--c-border-subtle);
      user-select: none;
      -webkit-user-select: none;
    }

    .code-drawer-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--c-text-3);
    }

    .code-toolbar-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .scroll-btn {
      inline-size: 22px;
      block-size: 22px;
      border-radius: 5px;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      color: var(--c-text-2);
      background: var(--c-bg-soft);
      border: 1px solid var(--c-border-subtle);
      padding: 0;
      transition: border-color 0.18s ease, color 0.18s ease, opacity 0.18s ease;
    }

    .scroll-btn.is-visible {
      display: inline-flex;
    }

    .scroll-btn:hover:not(.is-disabled) {
      border-color: var(--c-brand-border);
      color: var(--c-text-1);
    }

    .scroll-btn.is-disabled {
      opacity: 0.35;
      cursor: default;
      pointer-events: none;
    }

    .copy-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: var(--c-bg-soft);
      color: var(--c-text-2);
      border: 1px solid var(--c-border-subtle);
      border-radius: 6px;
      padding: 3px 9px;
      font-size: 0.71rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 0.18s ease, color 0.18s ease, background-color 0.18s ease;
    }

    .copy-btn:hover {
      border-color: var(--c-brand-border);
      color: var(--c-text-1);
    }

    .copy-btn.is-copied {
      border-color: var(--c-brand-border);
      color: var(--c-brand-1);
      background: var(--c-brand-soft);
    }

    .copy-btn.is-failed {
      border-color: color-mix(in srgb, var(--c-hl-op) 40%, transparent);
      color: var(--c-hl-op);
    }

    .copy-btn .icon-check {
      display: none;
    }

    .copy-btn.is-copied .icon-copy {
      display: none;
    }

    .copy-btn.is-copied .icon-check {
      display: inline-block;
    }

    /* Soft-Edge Inner Fade-Out for Code Blocks (Matching python-lib-xulbux website) */
    .code-pre-wrap {
      position: relative;
      overflow: hidden;
      margin-inline: -13px;
      margin-block-end: -10px;
    }

    .code-pre-wrap::after {
      content: '';
      z-index: 2;
      inset: 0;
      position: absolute;
      pointer-events: none;
      box-shadow:
        inset 10px 0 12px -4px var(--c-bg),
        inset -10px 0 12px -4px var(--c-bg);
    }

    .code-pre {
      margin: 0;
      padding: 6px 14px 10px;
      font-size: 0.76rem;
      line-height: 1.55;
      overflow-x: auto;
      white-space: pre;
      color: var(--c-hl-url);
      scrollbar-width: none;
      -webkit-mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 14px,
        black calc(100% - 14px),
        transparent 100%
      );
      mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 14px,
        black calc(100% - 14px),
        transparent 100%
      );
    }

    .code-pre:focus-visible {
      outline-offset: -2px;
      -webkit-mask-image: none;
      mask-image: none;
    }

    .code-pre::-webkit-scrollbar {
      display: none;
    }

    /* Markdown Syntax Highlighting Tokens (Isolux Pro Light & Dark) */
    .hl-p {
      color: var(--c-hl-p);
    }

    .hl-op {
      color: var(--c-hl-op);
    }

    .hl-alt {
      color: var(--c-hl-alt);
    }

    .hl-url {
      color: var(--c-hl-url);
    }

    .hl-key {
      color: var(--c-hl-key);
    }

    .hl-val {
      color: var(--c-hl-val);
    }

    .hl-href {
      color: var(--c-hl-href);
    }

    /* Responsive Parameter Reference Tables (Outer divider, subtle inner rows) */
    .table-wrapper {
      overflow: auto;
      max-inline-size: 100%;
      container-type: inline-size;
      background: var(--c-bg-soft);
      border: 1px solid var(--c-divider);
      border-radius: 12px;
      margin-block-end: 0;
    }

    .table-wrapper:focus-visible {
      outline-offset: -2px;
    }

    .param-table {
      inline-size: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 0.83rem;
      --label-2: "Values";
      --label-3: "Default";
      --label-4: "Description";
    }

    .param-table thead {
      background: var(--c-bg-elv);
      user-select: none;
      -webkit-user-select: none;
    }

    .param-table th, .param-table td {
      text-align: start;
      padding: 10px 15px;
      border-block-end: 1px solid var(--c-border-subtle);
      vertical-align: top;
    }

    .param-table thead th {
      font-size: 0.73rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--c-text-2);
      font-weight: 700;
      border-block-end: 1px solid var(--c-border);
    }

    .param-table tbody tr:last-child th,
    .param-table tbody tr:last-child td {
      border-block-end: none;
    }

    .param-table tbody th {
      font-family: var(--font-mono);
      font-weight: 600;
      color: var(--c-brand-1);
      white-space: nowrap;
      background: var(--c-bg-soft);
    }

    .param-table tbody td {
      color: var(--c-text-2);
    }

    .param-code {
      background: var(--c-bg);
      color: color-mix(in srgb, var(--c-text-2), var(--c-text-1) 65%);
      border: 1px solid var(--c-border-subtle);
      padding: 1px 6px;
      border-radius: 5px;
      font-size: 0.77rem;
    }

    .param-sep {
      color: var(--c-text-3);
      font-weight: 400;
      user-select: none;
      -webkit-user-select: none;
      pointer-events: none;
    }

    .param-alias {
      color: var(--c-text-3);
      font-weight: 400;
    }

    .param-note {
      color: var(--c-text-3);
      font-size: 0.76rem;
      user-select: none;
      -webkit-user-select: none;
      pointer-events: none;
    }

    /* Compact Alias Grid (e.g., icon slug aliases) */
    .alias-list {
      list-style: none;
      margin: 0;
      padding: 16px 18px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr));
      gap: 10px 18px;
      background: var(--c-bg-soft);
      border: 1px solid var(--c-divider);
      border-radius: 12px;
    }

    .alias-item {
      display: flex;
      align-items: center;
      gap: 8px;
      min-inline-size: 0;
      font-size: 0.83rem;
    }

    .alias-arrow {
      color: var(--c-text-3);
      user-select: none;
      -webkit-user-select: none;
    }

    /* Narrow containers: stack rows into labelled cards (explicit ARIA roles keep table semantics) */
    @container (width < 600px) {
      .param-table,
      .param-table thead,
      .param-table tbody,
      .param-table tr,
      .param-table th,
      .param-table td {
        display: block;
      }

      .param-table thead {
        display: none;
      }

      .param-table tbody tr {
        padding: 12px 15px;
        border-block-end: 1px solid var(--c-border-subtle);
      }

      .param-table tbody th {
        padding: 0 0 6px;
        border-block-end: none;
        white-space: normal;
      }

      .param-table td {
        padding: 3px 0;
        border-block-end: none;
      }

      .param-table td:nth-child(2)::before {
        content: var(--label-2) ": " / var(--label-2);
        font-weight: 600;
        color: var(--c-text-1);
      }

      .param-table td:nth-child(3)::before {
        content: var(--label-3) ": " / var(--label-3);
        font-weight: 600;
        color: var(--c-text-1);
      }

      .param-table td:nth-child(4)::before {
        content: var(--label-4) ": " / var(--label-4);
        font-weight: 600;
        color: var(--c-text-1);
      }
    }

    /* Section Footer Pager */
    .pager-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-block-start: 32px;
      padding-block-start: 22px;
      border-block-start: 1px solid var(--c-divider);
      user-select: none;
      -webkit-user-select: none;
    }

    .pager-row.is-end {
      justify-content: flex-end;
    }

    /* Site Footer (Matching python-lib-xulbux) */
    .site-footer {
      border-block-start: 1px solid var(--c-divider);
      background: var(--c-bg-soft);
      padding: 24px clamp(16px, 3.5vw, 32px);
      text-align: center;
    }

    .footer-inner {
      max-inline-size: 1180px;
      margin-inline: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    .footer-feedback {
      margin: 0;
      font-size: 0.82rem;
      color: var(--c-text-2);
      line-height: 1.5;
    }

    .footer-meta {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .footer-license, .footer-credit {
      margin: 0;
      font-size: 0.82rem;
      color: var(--c-text-2);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .footer-sparkle {
      color: var(--c-brand-1);
    }

    /* Reduced Motion: no transitions, CSS animations, or view transitions (SMIL previews are paused by the client script) */
    @media (prefers-reduced-motion: reduce) {
      @view-transition {
        navigation: none;
      }

      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
        scroll-behavior: auto !important;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      details.code-drawer::details-content {
        transition: none !important;
      }
    }
  </style>`;
  return stylesheetHtmlCache;
}

/** Render (once per isolate) the render-blocking `<head>` script that applies stored, whitelisted preferences before first paint. */
function renderHeadScript(): string {
  if (headScriptHtmlCache !== undefined) {
    return headScriptHtmlCache;
  }
  const previewBgValues = formatPreviewBgValuesJson();
  headScriptHtmlCache = `<script>try{var storedScheme=localStorage.getItem('${COLOR_SCHEME_STORAGE_KEY}');if(storedScheme==='dark'||storedScheme==='light'){document.querySelector('meta[name="color-scheme"]').content=storedScheme;}var storedPreviewBg=localStorage.getItem('${PREVIEW_BG_STORAGE_KEY}');if(${previewBgValues}.indexOf(storedPreviewBg)>0){document.documentElement.setAttribute('data-preview-bg',storedPreviewBg);}}catch{}</script>`;
  return headScriptHtmlCache;
}

/** Render (once per isolate) the client-side script for color-scheme toggling, preview backgrounds, reduced motion, nav fades, code scrolling, and clipboard copying. */
function renderClientScript(): string {
  if (clientScriptHtmlCache !== undefined) {
    return clientScriptHtmlCache;
  }
  const previewBgValues = formatPreviewBgValuesJson();
  clientScriptHtmlCache = `<script>
    (function () {
      var SCHEME_STORAGE_KEY = '${COLOR_SCHEME_STORAGE_KEY}';
      var PREVIEW_BG_STORAGE_KEY = '${PREVIEW_BG_STORAGE_KEY}';
      var PREVIEW_BG_VALUES = ${previewBgValues};
      var rootElement = document.documentElement;
      var schemeMeta = document.querySelector('meta[name="color-scheme"]');
      var themeToggle = document.getElementById('theme-toggle');
      var siteNav = document.querySelector('.site-nav');
      var darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      var reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      var copyResetTimers = new WeakMap();

      function readStorage(key) {
        try { return localStorage.getItem(key); } catch { return null; }
      }

      function writeStorage(key, value) {
        try {
          if (value === null) {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, value);
          }
        } catch {}
      }

      /* Color scheme: only 'dark' and 'light' are ever written into the color-scheme meta tag. */
      function sanitizeScheme(value) {
        return value === 'dark' || value === 'light' ? value : null;
      }

      function getSystemScheme() {
        return darkSchemeQuery.matches ? 'dark' : 'light';
      }

      function applyScheme(storedScheme) {
        if (schemeMeta) {
          schemeMeta.content = storedScheme || 'light dark';
        }
        if (themeToggle) {
          themeToggle.setAttribute('aria-checked', String((storedScheme || getSystemScheme()) === 'dark'));
        }
      }

      applyScheme(sanitizeScheme(readStorage(SCHEME_STORAGE_KEY)));

      if (themeToggle) {
        themeToggle.addEventListener('click', function () {
          var renderedScheme = sanitizeScheme(readStorage(SCHEME_STORAGE_KEY)) || getSystemScheme();
          var targetScheme = renderedScheme === 'dark' ? 'light' : 'dark';
          var storedScheme = targetScheme === getSystemScheme() ? null : targetScheme;
          writeStorage(SCHEME_STORAGE_KEY, storedScheme);
          applyScheme(storedScheme);
        });
      }

      darkSchemeQuery.addEventListener('change', function () {
        applyScheme(sanitizeScheme(readStorage(SCHEME_STORAGE_KEY)));
      });

      /* Preview stage background (Match page / Inverted / Checker). */
      function sanitizePreviewBg(value) {
        return PREVIEW_BG_VALUES.indexOf(value) === -1 ? PREVIEW_BG_VALUES[0] : value;
      }

      function applyPreviewBg(previewBg) {
        if (previewBg === PREVIEW_BG_VALUES[0]) {
          rootElement.removeAttribute('data-preview-bg');
        } else {
          rootElement.setAttribute('data-preview-bg', previewBg);
        }
        var radioInputs = document.querySelectorAll('input[name="preview-bg"]');
        for (var i = 0; i < radioInputs.length; i += 1) {
          radioInputs[i].checked = radioInputs[i].value === previewBg;
        }
      }

      applyPreviewBg(sanitizePreviewBg(readStorage(PREVIEW_BG_STORAGE_KEY)));

      document.addEventListener('change', function (event) {
        var input = event.target;
        if (input && input.name === 'preview-bg') {
          var previewBg = sanitizePreviewBg(input.value);
          writeStorage(PREVIEW_BG_STORAGE_KEY, previewBg === PREVIEW_BG_VALUES[0] ? null : previewBg);
          applyPreviewBg(previewBg);
        }
      });

      /* Preview background picker: Native popover with a JS fallback for anchor positioning and the Popover API. */
      var bgPickerTrigger = document.getElementById('bg-picker-trigger');
      var bgPickerMenu = document.getElementById('bg-picker-menu');
      var hasPopoverApi = typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;
      var hasAnchorPositioning = !!(window.CSS && CSS.supports && CSS.supports('position-area', 'block-end'));

      function isBgPickerOpen() {
        if (!bgPickerMenu) return false;
        return hasPopoverApi ? bgPickerMenu.matches(':popover-open') : bgPickerMenu.classList.contains('is-open');
      }

      function closeBgPicker() {
        if (!isBgPickerOpen()) return;
        if (hasPopoverApi) {
          bgPickerMenu.hidePopover();
        } else {
          bgPickerMenu.classList.remove('is-open');
          if (bgPickerTrigger) bgPickerTrigger.setAttribute('aria-expanded', 'false');
        }
      }

      if (bgPickerTrigger && bgPickerMenu) {
        if (hasPopoverApi && !hasAnchorPositioning) {
          bgPickerMenu.addEventListener('beforetoggle', function (event) {
            if (event.newState !== 'open') return;
            var triggerRect = bgPickerTrigger.getBoundingClientRect();
            bgPickerMenu.style.top = (triggerRect.bottom + 8) + 'px';
            bgPickerMenu.style.right = Math.max(8, rootElement.clientWidth - triggerRect.right) + 'px';
          });
        }

        if (!hasPopoverApi) {
          bgPickerTrigger.setAttribute('aria-expanded', 'false');
          bgPickerTrigger.addEventListener('click', function () {
            var isOpen = bgPickerMenu.classList.toggle('is-open');
            bgPickerTrigger.setAttribute('aria-expanded', String(isOpen));
          });
          document.addEventListener('click', function (event) {
            if (!event.target.closest || !event.target.closest('.bg-picker')) closeBgPicker();
          });
          document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && isBgPickerOpen()) {
              closeBgPicker();
              bgPickerTrigger.focus();
            }
          });
        }

        /* Pointer selections close the menu; Keyboard arrow selections (click detail 0) keep it open. */
        bgPickerMenu.addEventListener('click', function (event) {
          if (event.detail > 0 && event.target.closest && event.target.closest('.bg-picker-option')) {
            closeBgPicker();
          }
        });
      }

      window.addEventListener('storage', function (event) {
        if (event.key === SCHEME_STORAGE_KEY) {
          applyScheme(sanitizeScheme(event.newValue));
        } else if (event.key === PREVIEW_BG_STORAGE_KEY) {
          applyPreviewBg(sanitizePreviewBg(event.newValue));
        }
      });

      /* Reduced motion: CSS cannot stop SMIL, so pause every inline preview SVG at its first frame. */
      function syncPreviewAnimations() {
        var previewSvgs = document.querySelectorAll('.preview-stage svg');
        for (var i = 0; i < previewSvgs.length; i += 1) {
          var previewSvg = previewSvgs[i];
          if (typeof previewSvg.pauseAnimations !== 'function') continue;
          if (reducedMotionQuery.matches) {
            previewSvg.pauseAnimations();
            previewSvg.setCurrentTime(0);
          } else {
            previewSvg.unpauseAnimations();
          }
        }
      }

      if (reducedMotionQuery.matches) {
        syncPreviewAnimations();
      }
      reducedMotionQuery.addEventListener('change', syncPreviewAnimations);

      function getScrollBehavior() {
        return reducedMotionQuery.matches ? 'auto' : 'smooth';
      }

      /* Navigation edge fades while links are scrolled out of view. */
      function updateNavFade() {
        if (!siteNav) return;
        var maxScrollLeft = siteNav.scrollWidth - siteNav.clientWidth;
        siteNav.classList.toggle('can-scroll-start', siteNav.scrollLeft > 1);
        siteNav.classList.toggle('can-scroll-end', siteNav.scrollLeft < maxScrollLeft - 1);
      }

      if (siteNav) {
        siteNav.addEventListener('scroll', updateNavFade, { passive: true });
        updateNavFade();
      }

      /* Code drawer scroll buttons. */
      function updateScrollButtons(drawerBody) {
        if (!drawerBody) return;
        var codePre = drawerBody.querySelector('.code-pre');
        var leftButton = drawerBody.querySelector('.scroll-btn-left');
        var rightButton = drawerBody.querySelector('.scroll-btn-right');
        if (!codePre || !leftButton || !rightButton) return;

        var isScrollable = codePre.scrollWidth > codePre.clientWidth + 1;
        leftButton.classList.toggle('is-visible', isScrollable);
        rightButton.classList.toggle('is-visible', isScrollable);
        if (isScrollable) {
          leftButton.classList.toggle('is-disabled', !(codePre.scrollLeft > 0));
          rightButton.classList.toggle('is-disabled', !(codePre.scrollLeft < codePre.scrollWidth - codePre.clientWidth - 1));
        }
      }

      document.addEventListener('toggle', function (event) {
        var drawer = event.target;
        if (drawer && drawer.classList && drawer.classList.contains('code-drawer') && drawer.open) {
          var drawerBody = drawer.querySelector('.code-drawer-body');
          setTimeout(function () { updateScrollButtons(drawerBody); }, 30);
        }
      }, true);

      window.addEventListener('resize', function () {
        updateNavFade();
        var openDrawerBodies = document.querySelectorAll('details.code-drawer[open] .code-drawer-body');
        for (var i = 0; i < openDrawerBodies.length; i += 1) {
          updateScrollButtons(openDrawerBodies[i]);
        }
      });

      document.addEventListener('scroll', function (event) {
        var scrolledElement = event.target;
        if (scrolledElement && scrolledElement.classList && scrolledElement.classList.contains('code-pre')) {
          updateScrollButtons(scrolledElement.closest('.code-drawer-body'));
        }
      }, true);

      /* Clipboard: async Clipboard API with a selection + execCommand fallback and announced feedback. */
      function copyWithSelection(sourceElement) {
        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection) return false;
        var range = document.createRange();
        range.selectNodeContents(sourceElement);
        selection.removeAllRanges();
        selection.addRange(range);
        var isCopied = false;
        try { isCopied = document.execCommand('copy'); } catch { isCopied = false; }
        selection.removeAllRanges();
        return isCopied;
      }

      function showCopyFeedback(copyButton, isCopied) {
        var labelElement = copyButton.querySelector('.copy-btn-text');
        clearTimeout(copyResetTimers.get(copyButton));
        copyButton.classList.toggle('is-copied', isCopied);
        copyButton.classList.toggle('is-failed', !isCopied);
        if (labelElement) labelElement.textContent = isCopied ? 'Copied' : 'Copy failed';
        copyResetTimers.set(copyButton, setTimeout(function () {
          copyButton.classList.remove('is-copied', 'is-failed');
          if (labelElement) labelElement.textContent = 'Copy';
        }, 1500));
      }

      function copySnippet(copyButton, codePre) {
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(codePre.textContent || '').then(function () {
            showCopyFeedback(copyButton, true);
          }, function () {
            showCopyFeedback(copyButton, copyWithSelection(codePre));
          });
        } else {
          showCopyFeedback(copyButton, copyWithSelection(codePre));
        }
      }

      document.addEventListener('click', function (event) {
        var clickTarget = event.target;
        if (!clickTarget || !clickTarget.closest) return;

        var scrollButton = clickTarget.closest('.scroll-btn');
        if (scrollButton) {
          var scrollBody = scrollButton.closest('.code-drawer-body');
          var scrollPre = scrollBody ? scrollBody.querySelector('.code-pre') : null;
          if (scrollPre) {
            var scrollDistance = scrollButton.classList.contains('scroll-btn-left') ? -240 : 240;
            scrollPre.scrollBy({ behavior: getScrollBehavior(), left: scrollDistance });
          }
          return;
        }

        var copyButton = clickTarget.closest('.copy-btn');
        if (!copyButton) return;
        var copyBody = copyButton.closest('.code-drawer-body');
        var copyPre = copyBody ? copyBody.querySelector('.code-pre') : null;
        if (copyPre) copySnippet(copyButton, copyPre);
      });

      document.addEventListener('copy', function (event) {
        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection || selection.isCollapsed || !event.clipboardData) return;
        var anchorNode = selection.anchorNode;
        var anchorElement = anchorNode && anchorNode.nodeType === 1 ? anchorNode : (anchorNode ? anchorNode.parentElement : null);
        if (anchorElement && anchorElement.closest && anchorElement.closest('.code-pre')) {
          event.clipboardData.setData('text/plain', selection.toString().replace(/\\u00a0/g, ' '));
          event.preventDefault();
        }
      });
    })();
  </script>`;
  return clientScriptHtmlCache;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render a showcase card containing SVG previews (rendered from each item's documented path through the
 * live route dispatcher) and an expandable `<details>` Markdown drawer.
 * The card gets a deep-link anchor ID derived from its title, and every inlined SVG gets scoped element IDs.
 * @param card   Showcase card configuration with items and titles.
 * @returns HTML string for the card wrapped in a container element.
 */
export function renderShowcaseCard(card: ShowcaseCardConfig): string {
  const cardId = slugifyText(card.title);
  const titleId = `${cardId}-title`;
  const scopePrefix = `p${hashText(cardId)}`;
  let svgsHtml = '';
  const markdownLines: string[] = [];

  for (let i = 0; i < card.items.length; i += 1) {
    const item = card.items[i];
    svgsHtml += `${scopeSvgIds(renderSvgPath(item.path, item.sample), `${scopePrefix}-${i}`)}\n`;
    markdownLines.push(formatHighlightedMarkdownSnippet(item));
  }

  const stageClass = card.isCentered ? 'preview-stage is-centered' : 'preview-stage';
  const subtitleHtml = card.subtitle
    ? `<p class="card-subtitle">${escapeXml(card.subtitle)}</p>`
    : '';
  const escapedTitle = escapeXml(card.title);

  const chevronIcon = renderUiIcon('chevron-right', 14, 'drawer-chevron');
  const leftScrollIcon = renderUiIcon('chevron-left', 14);
  const rightScrollIcon = renderUiIcon('chevron-right', 14);
  const copyIcon = renderUiIcon('copy', 13, 'icon-copy');
  const checkIcon = renderUiIcon('check', 13, 'icon-check');

  return `<div class="card-container" id="${cardId}">
    <div class="card">
      <div class="card-head">
        <div class="card-title-row">
          <h3 class="card-title" id="${titleId}">${formatCardTitleHtml(card.title)}</h3>
          ${renderAnchorLink(cardId, card.title)}
        </div>
        ${subtitleHtml}
      </div>
      <div class="${stageClass}">${svgsHtml}</div>
      <details class="code-drawer">
        <summary>${chevronIcon}<span class="drawer-summary-text">View Markdown</span></summary>
        <div class="code-drawer-body">
          <div class="code-drawer-toolbar">
            <span class="code-drawer-label">Markdown</span>
            <div class="code-toolbar-actions">
              <button type="button" class="scroll-btn scroll-btn-left" aria-label="Scroll code left">${leftScrollIcon}</button>
              <button type="button" class="scroll-btn scroll-btn-right" aria-label="Scroll code right">${rightScrollIcon}</button>
              <button type="button" class="copy-btn" aria-describedby="${titleId}">${copyIcon}${checkIcon}<span class="copy-btn-text" aria-live="polite">Copy</span></button>
            </div>
          </div>
          <div class="code-pre-wrap">
            <pre class="code-pre" tabindex="0" role="region" aria-label="Markdown snippet: ${escapedTitle}"><code>${markdownLines.join('\n')}</code></pre>
          </div>
        </div>
      </details>
    </div>
  </div>`;
}

/**
 * Render a list of showcase cards.
 * @param cards   Showcase card configurations.
 * @returns Concatenated card HTML.
 */
export function renderCardsHtml(cards: readonly ShowcaseCardConfig[]): string {
  let cardsHtml = '';
  for (const card of cards) {
    cardsHtml += renderShowcaseCard(card);
  }
  return cardsHtml;
}

/**
 * Render a list of route pattern pills (`GET /badge/...`).
 * @param patterns   Array of route path strings.
 * @returns HTML string for the route pattern pill strip.
 */
export function renderRoutePills(patterns: readonly string[]): string {
  let pillsHtml = '';
  for (const pattern of patterns) {
    pillsHtml += `<code class="route-pill"><span class="route-method">GET</span><span class="route-path">${escapeXml(pattern)}</span></code>`;
  }
  return `<div class="route-pills">${pillsHtml}</div>`;
}

/**
 * Render a documentation section header (title, lead paragraph, and route pills).
 * @param options   Section header options (`title`, `description`, optional `routes` and `headingLevel`).
 * @returns HTML string for the section header.
 */
export function renderSectionHeader(options: SectionHeaderOptions): string {
  const headingTag = `h${options.headingLevel ?? 1}`;
  const routesHtml = options.routes ? renderRoutePills(options.routes) : '';
  return `<div class="section-header">
      <${headingTag} class="section-title">${formatInlineMarkupHtml(options.title)}</${headingTag}>
      <p class="section-desc">${formatInlineMarkupHtml(options.description)}</p>
      ${routesHtml}
    </div>`;
}

/**
 * Render a section subheading (`<h2>`) with a leading Lucide icon and a hover/focus deep-link anchor.
 * @param iconSlug   Lucide icon slug (e.g., `'layers'`).
 * @param text       Subheading text (supports inline `` `code` `` markup).
 * @returns HTML string for the subheading row.
 */
export function renderSectionSubhead(iconSlug: string, text: string): string {
  const plainText = stripInlineMarkup(text);
  const subheadId = slugifyText(plainText);
  return `<div class="subhead-row" id="${subheadId}">
      <h2 class="section-subhead">${renderUiIcon(iconSlug, 16)}<span class="subhead-text">${formatInlineMarkupHtml(text)}</span></h2>
      ${renderAnchorLink(subheadId, plainText)}
    </div>`;
}

/**
 * Render a responsive, keyboard-scrollable parameter reference table that transforms into labeled cards on narrow containers.
 * @param rows    Array of parameter rows to display.
 * @param label   Accessible table caption and scroll region label (e.g., `'Badge query parameters'`).
 * @returns HTML string for the responsive table wrapper.
 */
export function renderParamTable(rows: readonly ParamTableRow[], label: string): string {
  let bodyRowsHtml = '';
  for (const row of rows) {
    bodyRowsHtml += `<tr role="row">
      <th scope="row" role="rowheader">${escapeXml(row.name)}</th>
      <td role="cell">${formatParamCellHtml(row.values)}</td>
      <td role="cell">${formatParamCellHtml(row.defaultVal)}</td>
      <td role="cell">${escapeXml(row.description)}</td>
    </tr>`;
  }

  const escapedLabel = escapeXml(label);
  return `<div class="table-wrapper" tabindex="0" role="region" aria-label="${escapedLabel}">
    <table class="param-table" role="table">
      <caption class="visually-hidden">${escapedLabel}</caption>
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">Parameter</th>
          <th scope="col" role="columnheader">Values</th>
          <th scope="col" role="columnheader">Default</th>
          <th scope="col" role="columnheader">Description</th>
        </tr>
      </thead>
      <tbody role="rowgroup">${bodyRowsHtml}</tbody>
    </table>
  </div>`;
}

/**
 * Render an alphabetically sorted `alias → canonical` list (e.g., icon slug aliases).
 * @param aliases   Alias slugs mapped to their canonical slugs.
 * @param label     Accessible list label (e.g., `'Icon slug aliases'`).
 * @returns HTML string for the alias list.
 */
export function renderAliasList(aliases: Readonly<Record<string, string>>, label: string): string {
  let itemsHtml = '';
  for (const alias of Object.keys(aliases).toSorted()) {
    itemsHtml += `<li class="alias-item"><code class="param-code">${escapeXml(alias)}</code><span class="alias-arrow" aria-hidden="true">→</span><span class="visually-hidden"> resolves to </span><code class="param-code">${escapeXml(aliases[alias])}</code></li>`;
  }
  return `<ul class="alias-list" role="list" aria-label="${escapeXml(label)}">${itemsHtml}</ul>`;
}

/**
 * Render (once per isolate) the standalone `32x32` SVG favicon matching the navbar brand mark (indigo gradient squircle with Lucide `sparkles`).
 * @returns Standalone `<svg>` XML string.
 */
export function renderFaviconSvg(): string {
  if (faviconSvgCache !== undefined) {
    return faviconSvgCache;
  }
  const innerSvg = resolveIcon('sparkles')?.innerSvg ?? '';
  faviconSvgCache = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BRAND_GRADIENT_START}" />
      <stop offset="100%" stop-color="${BRAND_GRADIENT_END}" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="8" fill="url(#bg)" />
  <g transform="translate(6 6) scale(0.8333)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${innerSvg}</g>
</svg>`;
  return faviconSvgCache;
}

/**
 * Render the complete HTML document shell with FOUC-free color-scheme support, view transitions, social/canonical meta, and responsive navigation.
 * @param options   Page layout options (`activePage`, `title`, `description`, `canonicalPath`, `bodyHtml`).
 * @returns Complete HTML document string.
 */
export function renderPageLayout(options: PageLayoutOptions): string {
  const title = escapeXml(options.title);
  const description = escapeXml(options.description);
  const canonicalUrl = escapeXml(`${SITE_ORIGIN}${options.canonicalPath}`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  ${renderHeadScript()}
  <link rel="expect" href="#main-content" blocking="render" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <meta name="theme-color" content="${LIGHT_BG}" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="${DARK_BG}" media="(prefers-color-scheme: dark)" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="svg.xul.is" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta name="twitter:card" content="summary" />
  ${renderStylesheet()}
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  ${renderHeaderNav(options.activePage)}
  <main class="page-main" id="main-content" tabindex="-1">
    ${options.bodyHtml}
  </main>
  ${renderFooter()}
  ${renderClientScript()}
</body>
</html>`;
}
