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
import { renderUiIcon, renderUiSprite, serializeInlineJson } from '@/preview/components';
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
  { href: '/builder', id: 'builder', label: 'Builder' },
  { href: '/docs', id: 'docs', label: 'Docs' },
];

/** `localStorage` key of the persisted color scheme override (`'dark'` or `'light'`). */
const COLOR_SCHEME_STORAGE_KEY = 'color-scheme';

/** `localStorage` key of the persisted preview stage background. */
const PREVIEW_BG_STORAGE_KEY = 'preview-bg';

/** Media query under which the sidebar becomes a popover drawer (keep in sync with the `960px` breakpoint in `layout.css`). */
const DRAWER_MEDIA_QUERY = '(max-width: 960px)';

/** Page background per color scheme (`theme-color` meta tags, also following the manual scheme override). */
const THEME_COLORS: Readonly<Record<'dark' | 'light', string>> = { dark: DARK_BG, light: LIGHT_BG };

/** Preview stage background options; The first option is the default and follows the page theme. */
const PREVIEW_BG_OPTIONS: readonly PreviewBackgroundOption[] = [
  { label: 'Match page', value: 'auto' },
  { label: 'Inverted', value: 'inverse' },
];

/** Memoized header HTML keyed by active navigation tab and active sidebar path. */
const HEADER_HTML_CACHE = new Map<string, string>();

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
  return `<a href="${escapeXml(href)}"${activeAttrs} tabindex="0">${escapeXml(label)}</a>`;
}

/**
 * Render (once per isolate) the header preview background picker: A compact swatch trigger that opens a
 * native popover radio group (Match page / Inverted), persisted by the client script.
 */
function renderPreviewBgPicker(): string {
  if (previewBgPickerHtmlCache === undefined) {
    let optionsHtml = '';
    for (const [i, option] of PREVIEW_BG_OPTIONS.entries()) {
      const checkedAttr = i === 0 ? ' checked' : '';
      optionsHtml += `<label class="bg-picker-option"><input class="bg-picker-input" type="radio" name="preview-bg" value="${option.value}"${checkedAttr} /><span class="bg-swatch" data-bg="${option.value}" aria-hidden="true"></span><span class="bg-picker-label">${escapeXml(option.label)}</span>${renderUiIcon('check', 13, 'bg-picker-check')}</label>`;
    }
    const chevronIcon = renderUiIcon('chevron-down', 12, 'bg-picker-chevron');
    previewBgPickerHtmlCache = `<div class="bg-picker">
          <button type="button" class="bg-picker-trigger" id="bg-picker-trigger" popovertarget="bg-picker-menu" aria-label="Preview background" title="Preview background">
            <span class="bg-swatch bg-swatch-current" aria-hidden="true"></span>${chevronIcon}
          </button>
          <div class="popover-panel bg-picker-menu" id="bg-picker-menu" popover role="radiogroup" aria-labelledby="bg-picker-title">
            <span class="bg-picker-title" id="bg-picker-title">Preview background</span>
            ${optionsHtml}
          </div>
        </div>`;
  }
  return previewBgPickerHtmlCache;
}

/** Find the label of the active sidebar link (empty when no link matches the active path). */
function findActiveSidebarLabel(sidebar: PageSidebar): string {
  for (const group of sidebar.groups) {
    for (const link of group.links) {
      if (link.href === sidebar.activeHref) {
        return link.label;
      }
    }
  }
  return '';
}

/**
 * Render the narrow-screen sidebar drawer toggle shown in the header nav row: A panel icon followed by the
 * current page title (hidden on wide screens, where the sidebar is a sticky column).
 */
function renderSidebarToggle(sidebar: PageSidebar): string {
  const openLabel = escapeXml(`Open ${sidebar.label}`);
  const activeLabel = escapeXml(findActiveSidebarLabel(sidebar));
  return `<button type="button" class="sidebar-toggle" popovertarget="sidebar-drawer" aria-label="${openLabel}" title="${openLabel}">${renderUiIcon('panel-left', 16)}<span class="sidebar-toggle-label" aria-hidden="true">${activeLabel}</span></button>`;
}

/**
 * Render (once per active tab and sidebar page) the sticky top navigation bar matching the VitePress text-link
 * navbar style; On narrow screens, the nav row wraps below the brand and holds the sidebar drawer toggle.
 */
function renderHeaderNav(activeNav: NavPageId, sidebar: PageSidebar | undefined): string {
  // Sidebar pages are a fixed set, so the cache stays bounded by the number of pages.
  const cacheKey = `${activeNav}|${sidebar?.activeHref ?? ''}`;
  const cached = HEADER_HTML_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let navItemsHtml = '';
  for (const tab of NAV_TABS) {
    navItemsHtml += renderNavLink(tab.href, tab.label, tab.id === activeNav);
  }

  const brandIcon = renderUiIcon('sparkles', 15);
  const sunIcon = renderUiIcon('sun', 12, 'theme-label-light');
  const moonIcon = renderUiIcon('moon', 12, 'theme-label-dark');
  const githubIcon = renderUiIcon('github', 20);
  const sidebarToggleHtml = sidebar ? renderSidebarToggle(sidebar) : '';

  const headerHtml = `<header class="site-header">
    <div class="header-inner">
      <a href="/" class="brand-link" tabindex="0">
        <span class="brand-mark" aria-hidden="true">${brandIcon}</span>
        svg.xul.is
      </a>
      <div class="header-nav-row">
        ${sidebarToggleHtml}
        <nav class="site-nav" aria-label="Main">${navItemsHtml}</nav>
      </div>
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
        <a href="https://github.com/xulbux" class="gh-link" target="_blank" rel="noopener noreferrer" aria-label="XulbuX on GitHub" title="XulbuX on GitHub" tabindex="0">
          ${githubIcon}
        </a>
      </div>
    </div>
  </header>`;
  HEADER_HTML_CACHE.set(cacheKey, headerHtml);
  return headerHtml;
}

/**
 * Render the grouped left sidebar (a sticky column on wide screens and a popover drawer with a close button on
 * narrow screens, opened by the header's sidebar toggle).
 */
function renderSidebar(sidebar: PageSidebar): string {
  let groupsHtml = '';
  for (const [i, group] of sidebar.groups.entries()) {
    const titleId = `sidebar-group-${i}`;
    let linksHtml = '';
    for (const link of group.links) {
      const activeAttrs =
        link.href === sidebar.activeHref
          ? ' class="sidebar-link is-active" aria-current="page"'
          : ' class="sidebar-link"';
      linksHtml += `<li><a href="${escapeXml(link.href)}"${activeAttrs} tabindex="0">${escapeXml(link.label)}</a></li>`;
    }
    groupsHtml += `<section class="sidebar-group">
          <p class="sidebar-group-title" id="${titleId}">${renderUiIcon(group.icon, 14)}${escapeXml(group.title)}</p>
          <ul class="sidebar-list" aria-labelledby="${titleId}">${linksHtml}</ul>
        </section>`;
  }
  const closeLabel = escapeXml(`Close ${sidebar.label}`);
  return `<aside class="sidebar" id="sidebar-drawer">
      <button type="button" class="sidebar-close" popovertarget="sidebar-drawer" popovertargetaction="hide" aria-label="${closeLabel}" title="${closeLabel}">${renderUiIcon('x', 16)}</button>
      <nav aria-label="${escapeXml(sidebar.label)}">
        ${groupsHtml}
      </nav>
    </aside>`;
}

/** Render (once per isolate) the site footer matching the XulbuX documentation aesthetic. */
function renderFooter(): string {
  if (footerHtmlCache === undefined) {
    const sparkleIcon = renderUiIcon('sparkles', 14, 'footer-sparkle');
    footerHtmlCache = `<footer class="site-footer">
    <div class="footer-inner">
      <p class="footer-feedback">
        Missing a public API service, vector icon, or even a whole new SVG element? Feel free to <a href="mailto:hi@xul.is" class="text-link" tabindex="0">send an email to hi@xul.is</a> and let me know!
      </p>
      <div class="footer-meta">
        <p class="footer-license">Released under the MIT License.</p>
        <p class="footer-credit">
          ${sparkleIcon}
          From <a href="https://github.com/xulbux" class="text-link" target="_blank" rel="noopener noreferrer" tabindex="0"><b>XulbuX</b></a>
          ${sparkleIcon}
        </p>
      </div>
    </div>
  </footer>`;
  }
  return footerHtmlCache;
}

/**
 * Render (once per isolate) the render-blocking `<head>` script that applies stored, whitelisted preferences
 * (color scheme incl. the `theme-color` meta tags, preview background) before first paint.
 */
function renderHeadScript(): string {
  if (headScriptHtmlCache === undefined) {
    const previewBgValues = serializeInlineJson(collectPreviewBgValues());
    const themeColors = serializeInlineJson(THEME_COLORS);
    headScriptHtmlCache = `<script>try{var storedScheme=localStorage.getItem('${COLOR_SCHEME_STORAGE_KEY}');if(storedScheme==='dark'||storedScheme==='light'){document.querySelector('meta[name="color-scheme"]').content=storedScheme;document.querySelectorAll('meta[name="theme-color"]').forEach(function(meta){meta.content=${themeColors}[storedScheme];});}var storedPreviewBg=localStorage.getItem('${PREVIEW_BG_STORAGE_KEY}');if(${previewBgValues}.indexOf(storedPreviewBg)>0){document.documentElement.setAttribute('data-preview-bg',storedPreviewBg);}}catch{}</script>`;
  }
  return headScriptHtmlCache;
}

/** Render (once per isolate) the `#site-config` JSON element read by the site script (`SiteClientConfig`). */
function renderSiteConfig(): string {
  siteConfigHtmlCache ??= `<script type="application/json" id="site-config">${serializeInlineJson({
    drawerMediaQuery: DRAWER_MEDIA_QUERY,
    previewBgStorageKey: PREVIEW_BG_STORAGE_KEY,
    previewBgValues: collectPreviewBgValues(),
    schemeStorageKey: COLOR_SCHEME_STORAGE_KEY,
    themeColors: THEME_COLORS,
  })}</script>`;
  return siteConfigHtmlCache;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render (once per isolate) the standalone `32x32` SVG favicon matching the navbar brand mark (indigo gradient squircle with Lucide `sparkles`).
 * @returns Standalone `<svg>` XML string.
 */
export function renderFaviconSvg(): string {
  faviconSvgCache ??= `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BRAND_GRADIENT_START}" />
      <stop offset="100%" stop-color="${BRAND_GRADIENT_END}" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="8" fill="url(#bg)" />
  <g transform="translate(6 6) scale(0.8333)" fill="none" stroke="${WHITE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${resolveIcon('sparkles')?.innerSvg ?? ''}</g>
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
  <meta name="theme-color" content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)" />
  ${renderHeadScript()}
  <link rel="expect" href="#main-content" blocking="render" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
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
  <a class="skip-link" href="#main-content" tabindex="0">Skip to content</a>
  ${renderUiSprite()}
  ${renderHeaderNav(options.activeNav, options.sidebar)}
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
