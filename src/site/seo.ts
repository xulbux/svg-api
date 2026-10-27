/**
 * SEO, crawler & AI discoverability – Generates `/robots.txt`, `/sitemap.xml`, `/llms.txt`, Schema.org JSON-LD metadata, and the vector OpenGraph card (`/og.svg`).
 */

import faviconPngBuffer from '@bundles/favicon.png';
import { BRAND_INDIGO, ISOLUX_GRAY, OG_CARD_SURFACE, WHITE } from '@/config/palette';
import { SERVICES_CONFIG } from '@/config/services';
import {
  AUTHOR_GITHUB_URL,
  AUTHOR_NAME,
  REPO_GITHUB_URL,
  SITE_NAME,
  SITE_ORIGIN,
} from '@/config/site';
import { THEME_COLOR_NAMES } from '@/config/theme';
import {
  ACTIVE_ICON_MOTION_TOKENS,
  ANIM_SHEEN_TOKEN,
  SIZE_TOKENS,
  SPECIAL_ELEMENT_KINDS,
  STACK_MOTION_TOKENS,
  VARIANT_TOKENS,
} from '@/routes/params';
import { SVG_ROUTES } from '@/routes/svg';
import { buildServiceRoutePattern, formatServiceMetrics } from '@/site/catalog/services';
import { getEndpointRoutes } from '@/site/catalog/shared';
import { formatBacktickTokens, formatVariantTierSummary } from '@/site/glossary';
import {
  BUILDER_PAGES,
  buildBuilderPath,
  buildDocsPath,
  DEFAULT_BUILDER_KIND,
  DOCS_PAGES,
} from '@/site/navigation';
import { BRAND_GRADIENT_END, BRAND_GRADIENT_START } from '@/site/styles';
import { ALL_ICON_SOURCE_NAMES } from '@/svg/icons';
import { renderTextPathMarkup } from '@/svg/measure';
import { escapeXml } from '@/svg/shared';

// ---------------------------------------- CONSTS ---------------------------------------

export { FAVICON_PNG_SIZE } from '@/config/site';

/** Intrinsic width in pixels of the shared OpenGraph social preview card (`/og.png` and `/og.svg`). */
export const OG_IMAGE_WIDTH = 1200;

/** Intrinsic height in pixels of the shared OpenGraph social preview card (`/og.png` and `/og.svg`). */
export const OG_IMAGE_HEIGHT = 630;

/** Absolute URL of the raster OpenGraph social preview card (`/og.png`). */
export const OG_IMAGE_PNG_URL = `${SITE_ORIGIN}/og.png`;

/** Memoized `/robots.txt` document (`undefined` until first requested). */
let robotsTxtCache: string | undefined = undefined;

/** Memoized `/sitemap.xml` document (`undefined` until first requested). */
let sitemapXmlCache: string | undefined = undefined;

/** Memoized `/llms.txt` document (`undefined` until first requested). */
let llmsTxtCache: string | undefined = undefined;

/** Memoized `/og.svg` image (`undefined` until first requested). */
let ogImageSvgCache: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Encode a binary `ArrayBuffer` into a standard Base64 string. */
function encodeBytesToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Build `[name, path]` breadcrumb tuples for a root section page or one of its subpages. */
function buildSectionBreadcrumbs(
  canonicalPath: string,
  sectionPath: string,
  sectionLabel: string,
  pageLabel: string
): (readonly [string, string])[] {
  return canonicalPath === sectionPath
    ? [
        ['Home', '/'],
        [pageLabel, canonicalPath],
      ]
    : [
        ['Home', '/'],
        [sectionLabel, sectionPath],
        [pageLabel, canonicalPath],
      ];
}

/** Build a Schema.org `BreadcrumbList` node from ordered `[name, path]` pairs. */
function buildBreadcrumbListJsonLd(
  items: readonly (readonly [name: string, path: string])[]
): Readonly<Record<string, unknown>> {
  const itemListElement: Record<string, unknown>[] = [];
  for (const [i, [name, path]] of items.entries()) {
    itemListElement.push({
      '@type': 'ListItem',
      item: `${SITE_ORIGIN}${path}`,
      name,
      position: i + 1,
    });
  }
  return { '@type': 'BreadcrumbList', itemListElement };
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the Schema.org JSON-LD graph (`WebSite` and `WebAPI`) for the `/` homepage.
 * @param description   Homepage meta description.
 * @returns JSON-LD object ready for `<script type="application/ld+json">`.
 */
export function buildHomeJsonLd(description: string): Readonly<Record<string, unknown>> {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        description,
        image: OG_IMAGE_PNG_URL,
        inLanguage: 'en',
        name: SITE_NAME,
        url: SITE_ORIGIN,
      },
      {
        '@type': 'WebAPI',
        description,
        documentation: `${SITE_ORIGIN}/docs`,
        image: OG_IMAGE_PNG_URL,
        inLanguage: 'en',
        name: SITE_NAME,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        provider: { '@type': 'Person', name: AUTHOR_NAME, url: AUTHOR_GITHUB_URL },
        url: SITE_ORIGIN,
      },
    ],
  };
}

/**
 * Build the Schema.org JSON-LD graph (`TechArticle` and `BreadcrumbList`) for a `/docs` or `/docs/:section` page.
 * @param title             Page `<title>` string.
 * @param description       Page meta description.
 * @param canonicalPath     Root-relative canonical path.
 * @param breadcrumbLabel   Short page title for the trailing breadcrumb item.
 * @returns JSON-LD object ready for `<script type="application/ld+json">`.
 */
export function buildDocsJsonLd(
  title: string,
  description: string,
  canonicalPath: string,
  breadcrumbLabel = title
): Readonly<Record<string, unknown>> {
  const breadcrumbs = buildSectionBreadcrumbs(canonicalPath, '/docs', 'Docs', breadcrumbLabel);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        author: { '@type': 'Person', name: AUTHOR_NAME, url: AUTHOR_GITHUB_URL },
        description,
        headline: title,
        image: OG_IMAGE_PNG_URL,
        inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_ORIGIN },
        url: `${SITE_ORIGIN}${canonicalPath}`,
      },
      buildBreadcrumbListJsonLd(breadcrumbs),
    ],
  };
}

/**
 * Build the Schema.org JSON-LD graph (`WebApplication` and `BreadcrumbList`) for a `/builder/:kind` page.
 * @param title             Builder page `<title>` string.
 * @param description       Builder meta description.
 * @param canonicalPath     Root-relative canonical path.
 * @param breadcrumbLabel   Short builder title for the trailing breadcrumb item.
 * @returns JSON-LD object ready for `<script type="application/ld+json">`.
 */
export function buildBuilderJsonLd(
  title: string,
  description: string,
  canonicalPath: string,
  breadcrumbLabel = title
): Readonly<Record<string, unknown>> {
  const breadcrumbs = buildSectionBreadcrumbs(
    canonicalPath,
    buildBuilderPath(DEFAULT_BUILDER_KIND),
    'Builder',
    breadcrumbLabel
  );
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        applicationCategory: 'DeveloperApplication',
        description,
        image: OG_IMAGE_PNG_URL,
        inLanguage: 'en',
        name: title,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        operatingSystem: 'Any',
        url: `${SITE_ORIGIN}${canonicalPath}`,
      },
      buildBreadcrumbListJsonLd(breadcrumbs),
    ],
  };
}

/**
 * Render (once per isolate) `/robots.txt` allowing crawlers across all public routes and pointing to `/sitemap.xml`.
 * @returns Plain-text `robots.txt` body.
 */
export function renderRobotsTxt(): string {
  robotsTxtCache ??= `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
  return robotsTxtCache;
}

/**
 * Render (once per isolate) `/sitemap.xml` listing the canonical homepage, documentation pages, and builder pages.
 * @returns XML sitemap document string.
 */
export function renderSitemapXml(): string {
  if (sitemapXmlCache === undefined) {
    const paths: string[] = ['/'];
    for (const page of DOCS_PAGES) {
      paths.push(buildDocsPath(page.slug));
    }
    for (const page of BUILDER_PAGES) {
      paths.push(buildBuilderPath(page.kind));
    }
    const urlEntries: string[] = [];
    for (const path of paths) {
      urlEntries.push(`  <url><loc>${escapeXml(`${SITE_ORIGIN}${path}`)}</loc></url>`);
    }
    sitemapXmlCache = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urlEntries,
      '</urlset>',
      '',
    ].join('\n');
  }
  return sitemapXmlCache;
}

/**
 * Render (once per isolate) `/llms.txt` documenting endpoints, query parameters, theme colors, and all live service presets for AI assistants.
 * @returns Plain-text Markdown `llms.txt` body.
 */
export function renderLlmsTxt(): string {
  if (llmsTxtCache === undefined) {
    const docsItems: string[] = [];
    for (const page of DOCS_PAGES) {
      docsItems.push(
        `- [${page.title}](${SITE_ORIGIN}${buildDocsPath(page.slug)}): ${page.description}`
      );
    }
    const builderItems: string[] = [];
    for (const page of BUILDER_PAGES) {
      builderItems.push(
        `- [${page.title}](${SITE_ORIGIN}${buildBuilderPath(page.kind)}): ${page.description}`
      );
    }
    const serviceItems: string[] = [];
    for (const [key, service] of Object.entries(SERVICES_CONFIG)) {
      serviceItems.push(
        `- \`${buildServiceRoutePattern(key, service)}\` (${service.docs.title}): ${formatServiceMetrics(service, 'parens')}`
      );
    }
    const aliasRoutes: string[] = [];
    for (const route of SVG_ROUTES) {
      if (route.aliasOf !== undefined) {
        aliasRoutes.push(`\`/${route.prefix}/*\``);
      }
    }
    const iconSetNames = ALL_ICON_SOURCE_NAMES.join(', ');
    const iconMotions = [...ACTIVE_ICON_MOTION_TOKENS, 'none'];
    const stackOnlyMotions: string[] = [];
    for (const token of STACK_MOTION_TOKENS) {
      if (!iconMotions.includes(token)) {
        stackOnlyMotions.push(token);
      }
    }
    llmsTxtCache = [
      `# ${SITE_NAME}`,
      '',
      '> Zero-cold-start edge SVG API for READMEs and documentation: dynamic status badges, live package/forge service metrics, and customizable vector elements. 100% free, no API keys, no signup.',
      '',
      '## Endpoints',
      '',
      `- Base origin: \`${SITE_ORIGIN}\``,
      `- Source repository: ${REPO_GITHUB_URL}`,
      `- Families: ${formatBacktickTokens(getEndpointRoutes(), ', ')}${aliasRoutes.length > 0 ? ` (aliases: ${aliasRoutes.join(', ')})` : ''}`,
      '',
      '## Shared Query Parameters',
      '',
      `- \`?variant=\`: ${formatBacktickTokens(VARIANT_TOKENS)} (${formatVariantTierSummary()})`,
      `- \`?color=\`: ${formatBacktickTokens(THEME_COLOR_NAMES)}`,
      `- \`?size=\`: ${formatBacktickTokens(SIZE_TOKENS)} (or custom pixel number where supported)`,
      `- \`?icon=\`: \`<slug>\` | \`none\` | \`<left>,<right>\` | \`none,<right>\` | \`,<right>\` (${iconSetNames})`,
      '- `?dot=`: `none` | any theme color (pulsing status dot on badges)',
      `- \`?special=\`: ${formatBacktickTokens(SPECIAL_ELEMENT_KINDS)} (\`<kind>:<payload>\`, or bare \`<kind>\` on supported live service metrics)`,
      `- \`?anim=\`: \`${ANIM_SHEEN_TOKEN}\` | ${formatBacktickTokens(iconMotions)} (stacks also support ${formatBacktickTokens(stackOnlyMotions)})`,
      '',
      '## Documentation',
      '',
      ...docsItems,
      '',
      '## Interactive URL Builders',
      '',
      ...builderItems,
      '',
      `## Live Service Presets (${serviceItems.length})`,
      '',
      ...serviceItems,
      '',
    ].join('\n');
  }
  return llmsTxtCache;
}

/**
 * Render (once per isolate) the vector OpenGraph social preview image served at `/og.svg`.
 * Uses pre-converted vector path outlines so text renders identically without external fonts.
 * @returns Standalone `<svg>` XML string.
 */
export function renderOgImageSvg(): string {
  if (ogImageSvgCache === undefined) {
    const brandIconHref = `data:image/png;base64,${encodeBytesToBase64(faviconPngBuffer)}`;
    const ogCapabilities = BUILDER_PAGES.map((page) => page.ogLabel).join(' · ');
    const titleLine1 = renderTextPathMarkup('One Cohesive Edge SVG Engine', {
      align: 'left',
      anchorX: 88,
      baselineY: 274,
      fill: WHITE,
      fontSize: 58,
      isBold: true,
      isUncached: true,
    });
    const titleLine2 = renderTextPathMarkup('for READMEs & Documentation', {
      align: 'left',
      anchorX: 88,
      baselineY: 346,
      fill: BRAND_GRADIENT_START,
      fontSize: 58,
      isBold: true,
      isUncached: true,
    });
    const subtitle = renderTextPathMarkup(ogCapabilities, {
      align: 'left',
      anchorX: 88,
      baselineY: 418,
      fill: ISOLUX_GRAY[200],
      fontSize: 25,
      isBold: false,
      isUncached: true,
    });
    const brandTitle = renderTextPathMarkup(SITE_NAME, {
      align: 'left',
      anchorX: 152,
      baselineY: 136,
      fill: WHITE,
      fontSize: 30,
      isBold: true,
      isUncached: true,
    });
    const urlSample = renderTextPathMarkup(
      `GET ${SITE_ORIGIN}/badge/Status/Operational?dot=green&color=emerald&variant=2`,
      {
        align: 'left',
        anchorX: 112,
        baselineY: 525,
        fill: BRAND_INDIGO[300],
        font: 'mono',
        fontSize: 20,
        isBold: false,
        isUncached: true,
      }
    );

    ogImageSvgCache = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" viewBox="0 0 ${OG_IMAGE_WIDTH} ${OG_IMAGE_HEIGHT}" role="img" aria-label="${SITE_NAME} – Edge SVG Engine for READMEs and Documentation">`,
      '<defs>',
      '<linearGradient id="og-bg" x1="0" y1="0" x2="1" y2="1">',
      `<stop offset="0%" stop-color="${OG_CARD_SURFACE.bgStart}" />`,
      `<stop offset="100%" stop-color="${OG_CARD_SURFACE.bgEnd}" />`,
      '</linearGradient>',
      '<radialGradient id="og-glow" cx="85%" cy="18%" r="65%">',
      `<stop offset="0%" stop-color="${BRAND_GRADIENT_END}" stop-opacity="0.28" />`,
      `<stop offset="100%" stop-color="${BRAND_GRADIENT_END}" stop-opacity="0" />`,
      '</radialGradient>',
      '</defs>',
      `<rect width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" fill="url(#og-bg)" />`,
      `<rect width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" fill="url(#og-glow)" />`,
      `<rect x="40.5" y="40.5" width="${OG_IMAGE_WIDTH - 81}" height="${OG_IMAGE_HEIGHT - 81}" rx="28" fill="none" stroke="${ISOLUX_GRAY[600]}" />`,
      `<image x="88" y="98" width="48" height="48" href="${brandIconHref}" />`,
      brandTitle,
      titleLine1,
      titleLine2,
      subtitle,
      `<rect x="88" y="488" width="${OG_IMAGE_WIDTH - 176}" height="58" rx="14" fill="${OG_CARD_SURFACE.pillBg}" stroke="${ISOLUX_GRAY[600]}" />`,
      urlSample,
      '</svg>',
    ].join('');
  }
  return ogImageSvgCache;
}
