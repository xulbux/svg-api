/**
 * SEO, Crawler & AI Discoverability
 *
 * Generates `/robots.txt`, `/sitemap.xml`, `/llms.txt`, Schema.org JSON-LD metadata, and the vector OpenGraph card (`/og.svg`).
 */

import faviconPngBuffer from '@bundles/favicon.png';
import { ISOLUX_GRAY, ISOLUX_SYNTAX, OG_CARD_SURFACE, WHITE } from '@/config/palette';
import { SERVICES_CONFIG } from '@/config/services';
import {
  AUTHOR_NAME,
  AUTHOR_WEBSITE_URL,
  REPO_GITHUB_URL,
  SITE_DESCRIPTION,
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
import { SEGMENT_ENCODING_ROWS } from '@/site/catalog/overview';
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
import { renderTextPathMarkup, resolveCharGlyph } from '@/svg/measure';
import { escapeXml, hashText } from '@/svg/shared';

// ---------------------------------------- CONSTS ---------------------------------------

/** Intrinsic width in pixels of the shared OpenGraph social preview card (`/og.png` and `/og.svg`). */
export const OG_IMAGE_WIDTH = 1280;

/** Intrinsic height in pixels of the shared OpenGraph social preview card (`/og.png` and `/og.svg`). */
export const OG_IMAGE_HEIGHT = 640;

/** First headline line rendered on the OpenGraph social preview card. */
const OG_HEADLINE_LINE_1 = 'One Cohesive Dynamic SVG API';

/** Second headline line rendered on the OpenGraph social preview card. */
const OG_HEADLINE_LINE_2 = 'for READMEs & Documentation';

/** Canonical primary headline shared by the homepage `<title>` / `og:title` and the OpenGraph card. */
export const SITE_HEADLINE = `${OG_HEADLINE_LINE_1} ${OG_HEADLINE_LINE_2}`;

/** Accessible description of the OpenGraph social preview card (`/og.png` and `/og.svg`). */
export const OG_IMAGE_ALT = `${SITE_NAME} – ${SITE_HEADLINE}`;

/** Canonical Schema.org `@id` of the root `WebSite` entity. */
const WEBSITE_JSON_LD_ID = `${SITE_ORIGIN}/#website`;

/** Shared Schema.org `Person` entity for the project author. */
const AUTHOR_PERSON_JSON_LD: Readonly<Record<string, string>> = {
  '@type': 'Person',
  name: AUTHOR_NAME,
  url: AUTHOR_WEBSITE_URL,
};

/** Shared Schema.org free `Offer` entity for public API and builder surfaces. */
const FREE_OFFER_JSON_LD: Readonly<Record<string, string>> = {
  '@type': 'Offer',
  price: '0',
  priceCurrency: 'USD',
};

/** Shared Schema.org `isPartOf` reference linking child pages back to the root `WebSite`. */
const WEBSITE_PART_OF_JSON_LD: Readonly<Record<string, string>> = {
  '@id': WEBSITE_JSON_LD_ID,
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_ORIGIN,
};

/** Byte slice size used when converting binary buffers into Base64 strings. */
const BASE64_CHUNK_SIZE = 8192;

/** Syntax-highlighted monospace URL segments rendered inside the OpenGraph card's bottom code pill. */
const OG_URL_TOKENS: readonly (readonly [text: string, fill: string, isBold?: boolean])[] = [
  ['GET ', ISOLUX_SYNTAX.punctuation.dark, true],
  [SITE_ORIGIN, ISOLUX_SYNTAX.punctuation.dark],
  ['/badge', ISOLUX_SYNTAX.string.dark],
  ['/Status/Operational', ISOLUX_SYNTAX.stringLifted.dark],
  ['?dot=', ISOLUX_SYNTAX.function.dark],
  ['green', ISOLUX_SYNTAX.property.dark],
  ['&color=', ISOLUX_SYNTAX.function.dark],
  ['emerald', ISOLUX_SYNTAX.property.dark],
  ['&variant=', ISOLUX_SYNTAX.function.dark],
  ['2', ISOLUX_SYNTAX.property.dark],
];

/** Memoized `/robots.txt` document (`undefined` until first requested). */
let robotsTxtCache: string | undefined = undefined;

/** Memoized `/sitemap.xml` document (`undefined` until first requested). */
let sitemapXmlCache: string | undefined = undefined;

/** Memoized `/llms.txt` document (`undefined` until first requested). */
let llmsTxtCache: string | undefined = undefined;

/** Memoized `/og.svg` image (`undefined` until first requested). */
let ogImageSvgCache: string | undefined = undefined;

/** Memoized content version of `/og.png` (`undefined` until first requested). */
let ogImageVersionCache: string | undefined = undefined;

/** Memoized versioned absolute URL of `/og.png` (`undefined` until first requested). */
let ogImagePngUrlCache: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Encode a binary `ArrayBuffer` into a standard Base64 string. */
function encodeBytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

/** Build a Schema.org `BreadcrumbList` node from ordered `[name, path]` pairs. */
function buildBreadcrumbListJsonLd(
  items: readonly (readonly [name: string, path: string])[]
): Readonly<Record<string, unknown>> {
  const itemListElement: Record<string, unknown>[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const entry = items[i];
    if (entry) {
      itemListElement.push({
        '@type': 'ListItem',
        item: `${SITE_ORIGIN}${entry[1]}`,
        name: entry[0],
        position: i + 1,
      });
    }
  }
  return { '@type': 'BreadcrumbList', itemListElement };
}

// -------------------------------------- PUBLIC API -------------------------------------

export { FAVICON_PNG_SIZE } from '@/config/site';

/**
 * Render (once per isolate) the vector OpenGraph social preview image served at `/og.svg`.
 * Uses pre-converted vector path outlines so text renders identically without external fonts.
 * @returns Standalone `<svg>` XML string.
 */
export function renderOgImageSvg(): string {
  if (ogImageSvgCache === undefined) {
    const brandIconHref = `data:image/png;base64,${encodeBytesToBase64(faviconPngBuffer)}`;
    const ogLabels: string[] = [];
    for (const page of BUILDER_PAGES) {
      ogLabels.push(page.ogLabel);
    }
    const ogCapabilities = ogLabels.join(' · ');
    const titleLine1 = renderTextPathMarkup(OG_HEADLINE_LINE_1, {
      align: 'left',
      anchorX: 88,
      baselineY: 274,
      fill: WHITE,
      fontSize: 58,
      isBold: true,
      isUncached: true,
    });
    const titleLine2 = renderTextPathMarkup(OG_HEADLINE_LINE_2, {
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
    const monoStepAdvance = resolveCharGlyph(' ', 20, false, 'mono').advance;
    const urlSampleParts: string[] = [];
    let urlCursorX = 112;
    for (const [segmentText, segmentFill, isSegmentBold = false] of OG_URL_TOKENS) {
      urlSampleParts.push(
        renderTextPathMarkup(segmentText, {
          align: 'origin',
          anchorX: urlCursorX,
          baselineY: 525,
          fill: segmentFill,
          font: 'mono',
          fontSize: 20,
          isBold: isSegmentBold,
          isUncached: true,
        })
      );
      urlCursorX += segmentText.length * monoStepAdvance;
    }

    ogImageSvgCache = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" viewBox="0 0 ${OG_IMAGE_WIDTH} ${OG_IMAGE_HEIGHT}" role="img" aria-label="${escapeXml(OG_IMAGE_ALT)}">`,
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
      ...urlSampleParts,
      '</svg>',
    ].join('');
  }
  return ogImageSvgCache;
}

/**
 * Return (once per isolate) the content-hash version token of the OpenGraph social preview card.
 * @returns Base-36 content hash derived from `renderOgImageSvg()`.
 */
export function getOgImageVersion(): string {
  ogImageVersionCache ??= hashText(renderOgImageSvg());
  return ogImageVersionCache;
}

/**
 * Return (once per isolate) the versioned absolute URL of the raster OpenGraph social preview card (`/og.png?v=<hash>`).
 * @returns Versioned absolute `/og.png` URL for OpenGraph/Twitter tags and Schema.org JSON-LD.
 */
export function getOgImagePngUrl(): string {
  ogImagePngUrlCache ??= `${SITE_ORIGIN}/og.png?v=${getOgImageVersion()}`;
  return ogImagePngUrlCache;
}

/**
 * Build the Schema.org JSON-LD graph (`WebSite`, `WebAPI`, and `WebApplication`) for the `/` homepage.
 * @param description   Homepage meta description.
 * @returns JSON-LD object ready for `<script type="application/ld+json">`.
 */
export function buildHomeJsonLd(description: string): Readonly<Record<string, unknown>> {
  const ogImageUrl = getOgImagePngUrl();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@id': WEBSITE_JSON_LD_ID,
        '@type': 'WebSite',
        description,
        image: ogImageUrl,
        inLanguage: 'en',
        name: SITE_NAME,
        sameAs: [REPO_GITHUB_URL],
        url: SITE_ORIGIN,
      },
      {
        '@type': 'WebAPI',
        description,
        documentation: `${SITE_ORIGIN}/docs`,
        image: ogImageUrl,
        inLanguage: 'en',
        name: SITE_NAME,
        offers: FREE_OFFER_JSON_LD,
        provider: AUTHOR_PERSON_JSON_LD,
        url: SITE_ORIGIN,
      },
      {
        '@type': 'WebApplication',
        applicationCategory: 'DeveloperApplication',
        author: AUTHOR_PERSON_JSON_LD,
        description,
        image: ogImageUrl,
        inLanguage: 'en',
        isPartOf: { '@id': WEBSITE_JSON_LD_ID },
        name: `${SITE_NAME} URL Builder`,
        offers: FREE_OFFER_JSON_LD,
        operatingSystem: 'Any',
        url: `${SITE_ORIGIN}${buildBuilderPath(DEFAULT_BUILDER_KIND)}`,
      },
    ],
  };
}

/**
 * Build the Schema.org JSON-LD graph (`TechArticle` and `BreadcrumbList`) for a `/docs` or `/docs/:section` page.
 * @param headline          Clean article headline.
 * @param description       Page meta description.
 * @param canonicalPath     Root-relative canonical path.
 * @param breadcrumbLabel   Short page title for the trailing breadcrumb item.
 * @returns JSON-LD object ready for `<script type="application/ld+json">`.
 */
export function buildDocsJsonLd(
  headline: string,
  description: string,
  canonicalPath: string,
  breadcrumbLabel = headline
): Readonly<Record<string, unknown>> {
  const breadcrumbs: readonly (readonly [string, string])[] =
    canonicalPath === '/docs'
      ? [
          ['Home', '/'],
          [breadcrumbLabel, canonicalPath],
        ]
      : [
          ['Home', '/'],
          ['Docs', '/docs'],
          [breadcrumbLabel, canonicalPath],
        ];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        author: AUTHOR_PERSON_JSON_LD,
        description,
        headline,
        image: getOgImagePngUrl(),
        inLanguage: 'en',
        isPartOf: WEBSITE_PART_OF_JSON_LD,
        url: `${SITE_ORIGIN}${canonicalPath}`,
      },
      buildBreadcrumbListJsonLd(breadcrumbs),
    ],
  };
}

/**
 * Build the Schema.org JSON-LD graph (`WebApplication` and `BreadcrumbList`) for a `/builder/:kind` page.
 * @param name              Clean builder application name.
 * @param description       Builder meta description.
 * @param canonicalPath     Root-relative canonical path.
 * @param breadcrumbLabel   Short builder title for the trailing breadcrumb item.
 * @returns JSON-LD object ready for `<script type="application/ld+json">`.
 */
export function buildBuilderJsonLd(
  name: string,
  description: string,
  canonicalPath: string,
  breadcrumbLabel = name
): Readonly<Record<string, unknown>> {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        applicationCategory: 'DeveloperApplication',
        author: AUTHOR_PERSON_JSON_LD,
        description,
        image: getOgImagePngUrl(),
        inLanguage: 'en',
        isPartOf: WEBSITE_PART_OF_JSON_LD,
        name,
        offers: FREE_OFFER_JSON_LD,
        operatingSystem: 'Any',
        url: `${SITE_ORIGIN}${canonicalPath}`,
      },
      buildBreadcrumbListJsonLd([
        ['Home', '/'],
        [breadcrumbLabel, canonicalPath],
      ]),
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
    const endpointParamItems: string[] = [];
    for (const route of SVG_ROUTES) {
      if (route.aliasOf !== undefined) {
        aliasRoutes.push(`\`/${route.prefix}/*\``);
      } else {
        const queryTokens: string[] = [];
        for (const param of route.queryParams) {
          queryTokens.push(`?${param}=`);
        }
        endpointParamItems.push(
          `- \`/${route.prefix}/*\`: ${formatBacktickTokens(queryTokens, ', ')}`
        );
      }
    }
    const encodingItems: string[] = [];
    for (const row of SEGMENT_ENCODING_ROWS) {
      encodingItems.push(
        `- ${row.name}: write as \`${row.values}\` (e.g., \`${row.defaultVal}\`) – ${row.description}`
      );
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
      `> ${SITE_DESCRIPTION} 100% free, no API keys, no signup.`,
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
      '## Per-Endpoint Query Parameters',
      '',
      ...endpointParamItems,
      '',
      '## Path Segment Encoding',
      '',
      ...encodingItems,
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
