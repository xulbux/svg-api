/**
 * Documentation layout – Shared responsive HTML document shell: Header with the 3-tab navigation, preview background picker, and theme switch, the grouped sidebar, footer, and favicon.
 *
 * Page-independent fragments (header per tab, footer, head script, preview background picker, favicon)
 * are rendered lazily on first use and then reused by every page rendered in the same Worker isolate.
 * Styles and the site script are served as cached static assets (`src/preview/assets.ts`).
 */

import { WHITE } from '@/config/palette';
import { SITE_ORIGIN } from '@/config/site';
import { getSiteAssetUrl } from '@/preview/assets';
import { renderUiIcon, serializeInlineJson } from '@/preview/components';
import { BRAND_GRADIENT_END, BRAND_GRADIENT_START, DARK_BG, LIGHT_BG } from '@/preview/styles';
import { resolveIcon } from '@/svg/icons';
import { escapeXml } from '@/svg/shared';
import type { NavPageId, PageLayoutOptions, PageSidebar } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Selectable preview stage background (persisted in `localStorage` under `preview-bg`). */
interface PreviewBackgroundOption {
  /** Visible option label. */
  label: string;
  /** Stored value and `data-preview-bg` attribute value on `<html>` (`'auto'` removes the attribute). */
  value: string;
}

/** Top navigation tab. */
interface NavTab {
  /** Link target path. */
  href: string;
  /** Tab identifier. */
  id: NavPageId;
  /** Visible label. */
  label: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Top navigation tabs in display order. */
const NAV_TABS: readonly NavTab[] = [
  { href: '/', id: 'home', label: 'Home' },
  { href: '/docs', id: 'docs', label: 'Docs' },
  { href: '/builder', id: 'builder', label: 'Builder' },
];

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

/** Memoized header HTML keyed by active navigation tab. */
const HEADER_HTML_CACHE = new Map<NavPageId, string>();

/** Memoized blocking `<head>` script (`undefined` until first rendered). */
let headScriptHtmlCache: string | undefined = undefined;

/** Memoized `#site-config` JSON element (`undefined` until first rendered). */
let siteConfigHtmlCache: string | undefined = undefined;

/** Memoized footer HTML (`undefined` until first rendered). */
let footerHtmlCache: string | undefined = undefined;

/** Memoized header preview background picker HTML (`undefined` until first rendered). */
let previewBgPickerHtmlCache: string | undefined = undefined;

/** Memoized standalone favicon SVG (`undefined` until first rendered). */
let faviconSvgCache: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Collect the allowed preview background values (the first one is the default). */
function collectPreviewBgValues(): string[] {
  const values: string[] = [];
  for (const option of PREVIEW_BG_OPTIONS) {
    values.push(option.value);
  }
  return values;
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
function renderHeaderNav(activeNav: NavPageId): string {
  const cached = HEADER_HTML_CACHE.get(activeNav);
  if (cached !== undefined) {
    return cached;
  }

  let navItemsHtml = '';
  for (const tab of NAV_TABS) {
    navItemsHtml += renderNavLink(tab.href, tab.label, tab.id === activeNav);
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
      <nav class="site-nav" aria-label="Main">${navItemsHtml}</nav>
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
  HEADER_HTML_CACHE.set(activeNav, headerHtml);
  return headerHtml;
}

/**
 * Render the grouped left sidebar (a sticky column on wide screens and a popover drawer on narrow screens)
 * and the narrow-screen local navigation bar that opens it.
 */
function renderSidebar(sidebar: PageSidebar): string {
  let activeLabel = '';
  let groupsHtml = '';
  for (let i = 0; i < sidebar.groups.length; i += 1) {
    const group = sidebar.groups[i];
    const titleId = `sidebar-group-${i}`;
    let linksHtml = '';
    for (const link of group.links) {
      const isActive = link.href === sidebar.activeHref;
      if (isActive) {
        activeLabel = link.label;
      }
      const activeAttrs = isActive
        ? ' class="sidebar-link is-active" aria-current="page"'
        : ' class="sidebar-link"';
      linksHtml += `<li><a href="${escapeXml(link.href)}"${activeAttrs}>${escapeXml(link.label)}</a></li>`;
    }
    groupsHtml += `<section class="sidebar-group">
          <p class="sidebar-group-title" id="${titleId}">${renderUiIcon(group.icon, 14)}<span class="sidebar-group-label">${escapeXml(group.title)}</span></p>
          <ul class="sidebar-list" aria-labelledby="${titleId}">${linksHtml}</ul>
        </section>`;
  }
  const escapedLabel = escapeXml(sidebar.label);
  return `<div class="local-nav">
      <button type="button" class="local-nav-toggle" popovertarget="sidebar-drawer" aria-label="Open ${escapedLabel}">${renderUiIcon('panel-left', 15)}<span class="local-nav-label">Menu</span></button>
      <span class="local-nav-current">${escapeXml(activeLabel)}</span>
    </div>
    <aside class="sidebar" id="sidebar-drawer" popover>
      <nav class="sidebar-nav" aria-label="${escapedLabel}">
        ${groupsHtml}
      </nav>
    </aside>`;
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

/** Render (once per isolate) the render-blocking `<head>` script that applies stored, whitelisted preferences before first paint. */
function renderHeadScript(): string {
  if (headScriptHtmlCache !== undefined) {
    return headScriptHtmlCache;
  }
  const previewBgValues = serializeInlineJson(collectPreviewBgValues());
  headScriptHtmlCache = `<script>try{var storedScheme=localStorage.getItem('${COLOR_SCHEME_STORAGE_KEY}');if(storedScheme==='dark'||storedScheme==='light'){document.querySelector('meta[name="color-scheme"]').content=storedScheme;}var storedPreviewBg=localStorage.getItem('${PREVIEW_BG_STORAGE_KEY}');if(${previewBgValues}.indexOf(storedPreviewBg)>0){document.documentElement.setAttribute('data-preview-bg',storedPreviewBg);}}catch{}</script>`;
  return headScriptHtmlCache;
}

/** Render (once per isolate) the `#site-config` JSON element read by the site script (`SiteClientConfig`). */
function renderSiteConfig(): string {
  siteConfigHtmlCache ??= `<script type="application/json" id="site-config">${serializeInlineJson({
    previewBgStorageKey: PREVIEW_BG_STORAGE_KEY,
    previewBgValues: collectPreviewBgValues(),
    schemeStorageKey: COLOR_SCHEME_STORAGE_KEY,
  })}</script>`;
  return siteConfigHtmlCache;
}

// -------------------------------------- PUBLIC API -------------------------------------

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
  <g transform="translate(6 6) scale(0.8333)" fill="none" stroke="${WHITE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${innerSvg}</g>
</svg>`;
  return faviconSvgCache;
}

/**
 * Render the complete HTML document shell with FOUC-free color-scheme support, view transitions, social/canonical meta, the header, and an optional sidebar.
 * @param options   Page layout options (`activeNav`, `title`, `description`, `canonicalPath`, `bodyHtml`, optional `sidebar` and `extraBodyHtml`).
 * @returns Complete HTML document string.
 */
export function renderPageLayout(options: PageLayoutOptions): string {
  const title = escapeXml(options.title);
  const description = escapeXml(options.description);
  const canonicalUrl = escapeXml(`${SITE_ORIGIN}${options.canonicalPath}`);
  const bodyClassAttr = options.sidebar ? ' class="has-sidebar"' : '';
  const sidebarHtml = options.sidebar ? renderSidebar(options.sidebar) : '';
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
  <link rel="stylesheet" href="${getSiteAssetUrl('site.css')}" />
  <script src="${getSiteAssetUrl('site.js')}" defer></script>
</head>
<body${bodyClassAttr}>
  <a class="skip-link" href="#main-content">Skip to content</a>
  ${renderHeaderNav(options.activeNav)}
  <div class="page-shell">
    ${sidebarHtml}
    <main class="page-main" id="main-content" tabindex="-1">
      ${options.bodyHtml}
    </main>
  </div>
  ${renderFooter()}
  ${renderSiteConfig()}
  ${options.extraBodyHtml ?? ''}
</body>
</html>`;
}
