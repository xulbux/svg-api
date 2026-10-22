/**
 * Page layout component – Shared responsive HTML document shell (`<PageLayout />`) with FOUC-free color-scheme support, view transitions, social/canonical metadata, header, optional sidebar, footer, and SVG favicon.
 */

import { WHITE } from '@/config/palette';
import { SITE_ORIGIN } from '@/config/site';
import { getSiteAssetUrl } from '@/site/assets';
import { Footer } from '@/site/components/Footer';
import { HeaderNav } from '@/site/components/HeaderNav';
import { Sidebar } from '@/site/components/Sidebar';
import { serializeInlineJson, UiSprite } from '@/site/components/UiIcon';
import { raw, renderHtml } from '@/site/jsx';
import type { HtmlFragment, JsxChild } from '@/site/jsx';
import { BRAND_GRADIENT_END, BRAND_GRADIENT_START, DARK_BG, LIGHT_BG } from '@/site/styles';
import { resolveIcon } from '@/svg/icons';
import type { NavPageId, PageLayoutOptions, PageSidebar } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the `<PageLayout />` document shell component. */
export interface PageLayoutProps {
  /** Active top-level navigation tab (`'home'`, `'builder'`, or `'docs'`). */
  readonly activeNav: NavPageId;
  /** Canonical path starting with `/` (e.g., `'/'`, `'/docs'`, `'/docs/badges'`, `'/builder/badge'`). */
  readonly canonicalPath: string;
  /** Main content children rendered inside `<main id="main-content">`. */
  readonly children?: JsxChild;
  /** Page meta description for `<meta name="description">` and `og:description`. */
  readonly description: string;
  /** Optional extra body nodes or raw HTML placed before `</body>` (e.g., builder schema JSON and script). */
  readonly extraBody?: JsxChild;
  /** Optional grouped left sidebar configuration (renders a full-width page when omitted). */
  readonly sidebar?: PageSidebar | undefined;
  /** Full `<title>` and `og:title` text. */
  readonly title: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** `localStorage` key of the persisted color scheme override (`'dark'` or `'light'`). */
const COLOR_SCHEME_STORAGE_KEY = 'color-scheme';

/** `localStorage` key of the persisted preview stage background. */
const PREVIEW_BG_STORAGE_KEY = 'preview-bg';

/** Media query under which the sidebar becomes a popover drawer (keep in sync with the `960px` breakpoint in `layout.css`). */
const DRAWER_MEDIA_QUERY = '(max-width: 960px)';

/** Page background per color scheme (`theme-color` meta tags, also following the manual scheme override). */
const THEME_COLORS: Readonly<Record<'dark' | 'light', string>> = { dark: DARK_BG, light: LIGHT_BG };

/** Allowed preview stage background values (`'auto'` follows the page theme and removes `data-preview-bg`). */
const PREVIEW_BG_VALUES: readonly string[] = ['auto', 'inverse'];

/** Memoized blocking `<head>` script (`undefined` until first rendered). */
let headScriptHtmlCache: string | undefined = undefined;

/** Memoized `#site-config` JSON element (`undefined` until first rendered). */
let siteConfigHtmlCache: string | undefined = undefined;

/** Memoized standalone favicon SVG (`undefined` until first rendered). */
let faviconSvgCache: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Render (once per isolate) the render-blocking `<head>` script that applies stored, whitelisted preferences
 * (color scheme incl. the `theme-color` meta tags, preview background) before first paint.
 */
function renderHeadScript(): string {
  if (headScriptHtmlCache === undefined) {
    const previewBgValues = serializeInlineJson(PREVIEW_BG_VALUES);
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
    previewBgValues: PREVIEW_BG_VALUES,
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
  faviconSvgCache ??= renderHtml(
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color={BRAND_GRADIENT_START} />
          <stop offset="100%" stop-color={BRAND_GRADIENT_END} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#bg)" />
      <g
        transform="translate(6 6) scale(0.8333)"
        fill="none"
        stroke={WHITE}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round">
        {raw(resolveIcon('sparkles')?.innerSvg ?? '')}
      </g>
    </svg>
  );
  return faviconSvgCache;
}

/**
 * Render the complete HTML document shell as a JSX component.
 * @param props   Page layout props.
 * @returns Complete `<!DOCTYPE html><html>...</html>` JSX fragment.
 */
export function PageLayout(props: PageLayoutProps): HtmlFragment {
  const canonicalUrl = `${SITE_ORIGIN}${props.canonicalPath}`;
  return (
    <>
      {raw('<!DOCTYPE html>\n')}
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta name="color-scheme" content="light dark" />
          <meta
            name="theme-color"
            content={THEME_COLORS.light}
            media="(prefers-color-scheme: light)"
          />
          <meta
            name="theme-color"
            content={THEME_COLORS.dark}
            media="(prefers-color-scheme: dark)"
          />
          {raw(renderHeadScript())}
          <link rel="expect" href="#main-content" blocking="render" />
          <title>{props.title}</title>
          <meta name="description" content={props.description} />
          <link rel="canonical" href={canonicalUrl} />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="svg.xul.is" />
          <meta property="og:title" content={props.title} />
          <meta property="og:description" content={props.description} />
          <meta property="og:url" content={canonicalUrl} />
          <meta name="twitter:card" content="summary" />
          <link rel="stylesheet" href={getSiteAssetUrl('site.css')} />
          <script src={getSiteAssetUrl('site.js')} defer={true}></script>
        </head>
        <body class={props.sidebar ? 'has-sidebar' : undefined}>
          <a class="skip-link" href="#main-content" tabindex="0">
            Skip to content
          </a>
          <UiSprite />
          <HeaderNav activeNav={props.activeNav} sidebar={props.sidebar} />
          <div class="page-shell">
            {props.sidebar ? <Sidebar {...props.sidebar} /> : undefined}
            <main class="page-main" id="main-content" tabindex="-1">
              {props.children}
            </main>
          </div>
          <Footer />
          {raw(renderSiteConfig())}
          {props.extraBody}
        </body>
      </html>
    </>
  );
}

/**
 * Render the complete HTML document shell with FOUC-free color-scheme support, view transitions, social/canonical meta, the header, and an optional sidebar.
 * @param options   Page layout options (`activeNav`, `title`, `description`, `canonicalPath`, `bodyHtml`, optional `sidebar` and `extraBodyHtml`).
 * @returns Complete HTML document string.
 */
export function renderPageLayout(options: PageLayoutOptions): string {
  return renderHtml(
    <PageLayout
      activeNav={options.activeNav}
      canonicalPath={options.canonicalPath}
      description={options.description}
      extraBody={options.extraBodyHtml ? raw(options.extraBodyHtml) : undefined}
      sidebar={options.sidebar}
      title={options.title}>
      {raw(options.bodyHtml)}
    </PageLayout>
  );
}
