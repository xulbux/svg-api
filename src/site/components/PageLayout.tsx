/**
 * Page layout component – Shared responsive HTML document shell (`<PageLayout />`) with FOUC-free color-scheme support, view transitions, social/canonical metadata, header, optional sidebar, footer, and SVG favicon.
 */

import { WHITE } from '@/config/palette';
import { SITE_HOST, SITE_ORIGIN } from '@/config/site';
import { getSiteAssetUrl } from '@/site/assets';
import { Footer } from '@/site/components/Footer';
import { HeaderNav } from '@/site/components/HeaderNav';
import { Sidebar } from '@/site/components/Sidebar';
import { serializeInlineJson, UiSprite } from '@/site/components/UiIcon';
import { raw, renderHtml } from '@/site/jsx';
import type { HtmlFragment, JsxChild } from '@/site/jsx';
import { OG_IMAGE_HEIGHT, OG_IMAGE_PNG_URL, OG_IMAGE_WIDTH } from '@/site/seo';
import { BRAND_GRADIENT_END, BRAND_GRADIENT_START, DARK_BG, LIGHT_BG } from '@/site/styles';
import { resolveIcon } from '@/svg/icons';
import type { NavPageId, PageSidebar, SiteClientConfig } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the `<PageLayout />` document shell component. */
interface PageLayoutProps {
  /** Active top-level navigation tab. */
  readonly activeNav: NavPageId;
  /** Canonical path starting with `/` (omitted on `noindex` error pages). */
  readonly canonicalPath?: string | undefined;
  /** Main content children rendered inside `<main id="main-content">`. */
  readonly children?: JsxChild;
  /** Page meta description for `<meta name="description">` and `og:description`. */
  readonly description: string;
  /** Optional extra body nodes or raw HTML placed before `</body>` (e.g., builder schema JSON and script). */
  readonly extraBody?: JsxChild;
  /** Whether to instruct search engines not to index the page (e.g., `404` responses). */
  readonly isNoIndex?: boolean | undefined;
  /** Optional Schema.org JSON-LD graph or entity object serialized into `<script type="application/ld+json">`. */
  readonly jsonLd?: Readonly<Record<string, unknown>> | undefined;
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
const THEME_COLORS: SiteClientConfig['themeColors'] = { dark: DARK_BG, light: LIGHT_BG };

/** Allowed preview stage background values (`'auto'` follows the page theme and removes `data-preview-bg`). */
const PREVIEW_BG_VALUES: SiteClientConfig['previewBgValues'] = ['auto', 'inverse'];

/** Accessible description of the OpenGraph social preview card. */
const OG_IMAGE_ALT = `${SITE_HOST} – Dynamic SVG graphics and live repository telemetry at the edge.`;

/** Memoized inline `<head>` script body (`undefined` until first accessed). */
let headScriptBodyCache: string | undefined = undefined;

/** Memoized blocking `<head>` script (`undefined` until first rendered). */
let headScriptHtmlCache: string | undefined = undefined;

/** Memoized `#site-config` JSON element (`undefined` until first rendered). */
let siteConfigHtmlCache: string | undefined = undefined;

/** Memoized standalone favicon SVG (`undefined` until first rendered). */
let faviconSvgCache: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Build (once per isolate) the exact JavaScript body inside the `<head>` preference script. */
function buildHeadScriptBody(): string {
  if (headScriptBodyCache === undefined) {
    const previewBgValues = serializeInlineJson(PREVIEW_BG_VALUES);
    const themeColors = serializeInlineJson(THEME_COLORS);
    headScriptBodyCache = `try{var storedScheme=localStorage.getItem('${COLOR_SCHEME_STORAGE_KEY}');if(storedScheme==='dark'||storedScheme==='light'){document.querySelector('meta[name="color-scheme"]').content=storedScheme;document.querySelectorAll('meta[name="theme-color"]').forEach(function(meta){meta.content=${themeColors}[storedScheme];});}var storedPreviewBg=localStorage.getItem('${PREVIEW_BG_STORAGE_KEY}');if(${previewBgValues}.indexOf(storedPreviewBg)>0){document.documentElement.setAttribute('data-preview-bg',storedPreviewBg);}}catch{}`;
  }
  return headScriptBodyCache;
}

/**
 * Render (once per isolate) the render-blocking `<head>` script that applies stored, whitelisted preferences
 * (color scheme incl. the `theme-color` meta tags, preview background) before first paint.
 */
function renderHeadScript(): string {
  headScriptHtmlCache ??= `<script>${buildHeadScriptBody()}</script>`;
  return headScriptHtmlCache;
}

/** Render (once per isolate) the `#site-config` JSON element read by the site script (`SiteClientConfig`). */
function renderSiteConfig(): string {
  if (siteConfigHtmlCache === undefined) {
    const siteConfig: SiteClientConfig = {
      drawerMediaQuery: DRAWER_MEDIA_QUERY,
      previewBgStorageKey: PREVIEW_BG_STORAGE_KEY,
      previewBgValues: PREVIEW_BG_VALUES,
      schemeStorageKey: COLOR_SCHEME_STORAGE_KEY,
      themeColors: THEME_COLORS,
    };
    siteConfigHtmlCache = `<script type="application/json" id="site-config">${serializeInlineJson(siteConfig)}</script>`;
  }
  return siteConfigHtmlCache;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Return (once per isolate) the exact JavaScript body inside the `<head>` color-scheme / preview-bg script
 * (also hashed by the site security test to guard the `Content-Security-Policy` `script-src` SHA-256 allowlist).
 * @returns Inline JavaScript source without surrounding `<script>` tags.
 */
export function getHeadScriptBody(): string {
  return buildHeadScriptBody();
}

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
 * @returns Complete `<!DOCTYPE html><html>…</html>` JSX fragment.
 */
export function PageLayout(props: PageLayoutProps): HtmlFragment {
  const canonicalUrl =
    props.canonicalPath && !props.isNoIndex ? `${SITE_ORIGIN}${props.canonicalPath}` : undefined;
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
          <link
            rel="preload"
            href="/assets/Geist-Regular.ttf"
            as="font"
            type="font/ttf"
            crossorigin="anonymous"
          />
          <link
            rel="preload"
            href="/assets/Geist-Bold.ttf"
            as="font"
            type="font/ttf"
            crossorigin="anonymous"
          />
          <title>{props.title}</title>
          <meta name="description" content={props.description} />
          {props.isNoIndex ? <meta name="robots" content="noindex" /> : undefined}
          {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : undefined}
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
          <meta property="og:type" content="website" />
          <meta property="og:locale" content="en_US" />
          <meta property="og:site_name" content={SITE_HOST} />
          <meta property="og:title" content={props.title} />
          <meta property="og:description" content={props.description} />
          {canonicalUrl ? <meta property="og:url" content={canonicalUrl} /> : undefined}
          <meta property="og:image" content={OG_IMAGE_PNG_URL} />
          <meta property="og:image:type" content="image/png" />
          <meta property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
          <meta property="og:image:height" content={String(OG_IMAGE_HEIGHT)} />
          <meta property="og:image:alt" content={OG_IMAGE_ALT} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={props.title} />
          <meta name="twitter:description" content={props.description} />
          <meta name="twitter:image" content={OG_IMAGE_PNG_URL} />
          <meta name="twitter:image:alt" content={OG_IMAGE_ALT} />
          {props.jsonLd ? (
            <script type="application/ld+json">{raw(serializeInlineJson(props.jsonLd))}</script>
          ) : undefined}
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
