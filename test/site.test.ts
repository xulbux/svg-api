/**
 * Documentation website tests – HTML validity, accessibility, head metadata, navigation, static assets, client behavior guards, and docs drift guards for the homepage, `/docs`, `/docs/:section`, and `/builder/:kind` pages (`src/site/`).
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import siteScript from '@bundles/site.client.js';
import { decodePngToRgba, encodeRgbaPng } from '@scripts/og/png';
import { rasterizeOgSvgToPng, rasterizeSvgToRgbaPng } from '@scripts/og/rasterizer';
import { evaluatePaint, flattenSvgPath, parseGradientDefs } from '@scripts/og/svgParser';
import { beforeAll, describe, expect, it } from 'vitest';
import { ISOLUX_GRAY, ISOLUX_SYNTAX, ISOLUX_UI } from '@/config/palette';
import { SERVICES_CONFIG } from '@/config/services';
import {
  AUTHOR_WEBSITE_URL,
  BRAND_ICON_PNG_SIZE,
  FALLBACK_REDIRECT_URL,
  REPO_GITHUB_URL,
  SERVICE_USER_AGENT,
  SITE_HOST,
  SITE_NAME,
  SITE_ORIGIN,
} from '@/config/site';
import { THEME_COLOR_NAMES } from '@/config/theme';
import app from '@/index';
import { HTML_SECURITY_HEADERS } from '@/routes/http';
import {
  ICON_MOTION_TOKENS,
  QUOTE_LAYOUT_TOKENS,
  SIZE_TOKENS,
  SPECIAL_ELEMENT_KINDS,
  VARIANT_TOKENS,
} from '@/routes/params';
import { findSvgRoute, renderSvgPath, resolveSvgRequest, SVG_ROUTES } from '@/routes/svg';
import { URL_PLACEHOLDER_RX } from '@/services/endpoint';
import {
  DEFAULT_METRIC_ALIASES,
  listServiceMetricAliases,
  MAX_UPSTREAM_BYTES,
} from '@/services/fetcher';
import { DOWNLOAD_PERIODS } from '@/services/metrics';
import { getSiteAsset, getSiteAssetUrl } from '@/site/assets';
import {
  buildServicePresetCards,
  formatCountLowerBound,
  getEndpointRoutes,
  getIconSetCounts,
  listRouteAliases,
  SERVICE_ROUTE_PATTERN,
  STACK_EXAMPLE_GROUPS,
} from '@/site/catalog';
import { formatInlineMarkupHtml, getHeadScriptBody, renderParamTable } from '@/site/components';
import { formatSpecialExamples, formatVariantTierSummary } from '@/site/glossary';
import { jsx } from '@/site/jsx/jsx-runtime';
import { BUILDER_PAGES, buildBuilderPath, buildDocsPath, DOCS_PAGES } from '@/site/navigation';
import {
  renderBuilderHtml,
  renderDocsHtml,
  renderHomeHtml,
  renderNotFoundHtml,
  renderServerErrorHtml,
} from '@/site/pages';
import { FAVICON_PNG_SIZE, renderLlmsTxt, renderOgImageSvg } from '@/site/seo';
import { DARK_BG, getSiteStylesheet, LIGHT_BG } from '@/site/styles';
import {
  ALL_ICON_SOURCE_NAMES,
  FALLBACK_ICON_SLUG,
  ICON_SLUG_ALIASES,
  resolveIcon,
} from '@/svg/icons';
import {
  ICON_SIZE_RANGE,
  ICON_STROKE_RANGE,
  MAX_SPARKLINE_POINTS,
  MAX_STRIP_TICKS,
} from '@/svg/renderer';
import { escapeXml } from '@/svg/shared';
import { GROUP_GAP_RATIO, STACK_GROUP_GAP_RANGE } from '@/svg/stack';
import {
  TYPING_DURATION_RANGE,
  TYPING_FONT_SIZE_RANGE,
  TYPING_PAUSE_RANGE,
  TYPING_WIDTH_RANGE,
} from '@/svg/typing';
import type {
  DocsPageSlug,
  DownloadMetricKey,
  PopoverPlacementOptions,
  SiteClientCore,
} from '@/types';
import {
  countOccurrences,
  evaluateClientCore,
  evaluateClientDom,
  readClientModuleSources,
  requireDefined,
  TEST_ENV,
} from './helpers';

// ---------------------------------------- TYPES ----------------------------------------

/** Rendered documentation page with its canonical path. */
interface RenderedPage {
  /** Complete HTML document. */
  html: string;
  /** Canonical path (`/`, `/docs`, `/docs/:section`, or `/builder/:kind`). */
  path: string;
}

/** Metrics and metric aliases listed in a services table row. */
interface ListedMetrics {
  /** Listed metric aliases. */
  aliases: string[];
  /** Listed canonical metrics. */
  metrics: string[];
}

/** Minimal attribute-backed switch element used in Node client-bundle tests. */
interface FakeSwitchElement {
  /** Register an event listener for `type`. */
  addEventListener: (type: string, listener: () => void) => void;
  /** Read an attribute value (`undefined` when absent). */
  getAttribute: (name: string) => string | undefined;
  /** Set an attribute value. */
  setAttribute: (name: string, value: string) => void;
}

/** Subset of `package.json` verified against repository documentation and templates. */
interface RepoPackageJson {
  /** Issue tracker metadata. */
  bugs: { url: string };
  /** Production dependencies. */
  dependencies: Record<string, string>;
  /** Runtime engine constraints. */
  engines: { node: string };
  /** Canonical project website URL. */
  homepage: string;
  /** SPDX license identifier. */
  license: string;
  /** Package identifier. */
  name: string;
  /** Source repository metadata. */
  repository: { url: string };
  /** Developer and CI scripts. */
  scripts: Record<string, string>;
  /** Semantic package version. */
  version: string;
}

/** Parsed row of the `## Endpoints` table in `README.md`. */
interface ReadmeEndpointRow {
  /** Description cell text. */
  description: string;
  /** Linked documentation URL. */
  docsUrl: string;
  /** Bold endpoint label. */
  label: string;
  /** Route pattern cell code text. */
  route: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Canonical documentation page slugs mapped from each non-alias `SVG_ROUTES` prefix. */
const ROUTE_PREFIX_DOCS_SLUGS: Readonly<Record<string, readonly DocsPageSlug[]>> = {
  badge: ['badges', 'services'],
  button: ['buttons'],
  icon: ['icons'],
  quote: ['quotes'],
  stack: ['stack'],
  typing: ['typing'],
};

/** Exported module identifiers referenced in prose inside `CONTRIBUTING.md` and `SECURITY.md`. */
const PROSE_REFERENCED_EXPORTS: readonly {
  readonly doc: 'contributing' | 'security';
  readonly modulePath: string;
  readonly symbols: readonly string[];
}[] = [
  { doc: 'contributing', modulePath: '@/config/services', symbols: ['SERVICES_CONFIG'] },
  { doc: 'contributing', modulePath: '@/config/stack', symbols: ['STACK_CATEGORIES'] },
  { doc: 'contributing', modulePath: '@/routes/http', symbols: ['HTML_SECURITY_HEADERS'] },
  { doc: 'security', modulePath: '@/routes/http', symbols: ['sanitizeRedirectUrl'] },
  {
    doc: 'contributing',
    modulePath: '@/services/endpoint',
    symbols: [
      'NPM_PACKAGE_ROUTE',
      'OWNER_REPO_ROUTE',
      'PACKAGE_ROUTE',
      'createEndpoint',
      'pickFields',
      'projectFirstEntry',
    ],
  },
  { doc: 'contributing', modulePath: '@/services/fetcher', symbols: ['DEFAULT_METRIC_ALIASES'] },
  {
    doc: 'contributing',
    modulePath: '@/services/metrics',
    symbols: ['formatCount', 'formatLicense', 'formatVersion', 'readFiniteNumber', 'readText'],
  },
  {
    doc: 'contributing',
    modulePath: '@/site/catalog/services',
    symbols: ['buildServicePresetCards'],
  },
  {
    doc: 'contributing',
    modulePath: '@/site/components/PageLayout',
    symbols: ['getHeadScriptBody'],
  },
  { doc: 'contributing', modulePath: '@/svg/icons', symbols: ['ICON_SLUG_ALIASES'] },
  {
    doc: 'contributing',
    modulePath: '@/svg/shared',
    symbols: ['createLruCache', 'prepareDisplayText'],
  },
];

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches every `id="…"` attribute. */
const ID_ATTRIBUTE_RX = /\sid="(?<id>[^"]+)"/g;

/** Matches every in-page fragment reference (`url(#…)` and `href="#…"`). */
const FRAGMENT_REFERENCE_RX = /(?:url\(#|href="#)(?<id>[^")]+)/g;

/** Matches every `aria-labelledby` / `aria-describedby` ID reference. */
const ARIA_ID_REFERENCE_RX = /aria-(?:labelledby|describedby)="(?<id>[^"]+)"/g;

/** Matches every opening heading tag. */
const HEADING_TAG_RX = /<h(?<level>[1-6])[\s>]/g;

/** Matches HTML tags. */
const HTML_TAG_RX = /<[^>]+>/g;

/** Matches every top navigation link (`href` and active state). */
const NAV_LINK_RX = /<a href="(?<href>[^"]+)" class="nav-link(?<active> is-active)?"/g;

/** Matches every primary or secondary call-to-action link (`href` and button kind). */
const CTA_LINK_RX =
  /<a href="(?<href>[^"]+)" class="(?<kind>btn-primary|btn-secondary)" tabindex="0">/g;

/** Matches every sidebar link (`href`, active state, and label). */
const SIDEBAR_LINK_RX =
  /<a href="(?<href>[^"]+)" class="sidebar-link(?<active> is-active)?"[^>]*>(?<label>[^<]+)<\/a>/g;

/** Matches the header's sidebar drawer toggle and its current page label. */
const SIDEBAR_TOGGLE_RX =
  /<button type="button" class="sidebar-toggle" popovertarget="sidebar-drawer"[^>]*>[\s\S]*?<span class="sidebar-toggle-label"[^>]*>(?<label>[^<]*)<\/span>/;

/** Matches class names that were removed from the markup because no stylesheet or script uses them. */
const DEAD_CLASS_RX =
  /class="(?:[^"]*\s)?(?:nav-text|brand-name|brand-sparkle|theme-icon|gh-icon|footer-from|btn-label|btn-icon-left|btn-icon-right|drawer-summary-text|route-path|sidebar-group-label|subhead-text|sidebar-nav|card-grid-3|hero-gradient-text|stack-chip-label|feature-icon|builder-panel-inner)[\s"]/;

/** Matches every `var(--c-…)` custom property reference. */
const COLOR_TOKEN_USAGE_RX = /var\((?<name>--c-[\w-]+)/g;

/** Matches every `--c-…:` custom property definition. */
const COLOR_TOKEN_DEFINITION_RX = /(?<name>--c-[\w-]+):/g;

/** Matches concrete SVG endpoint paths inside inline `<code>…</code>` spans. */
const INLINE_SVG_ROUTE_CODE_RX =
  /<code[^>]*>(?<path>\/(?:badge|btn|button|icon|quote|stack|type|typing)\/[^<\s]+)<\/code>/g;

/** Matches level-2 Markdown headings carrying an anchored `svg.xul.is/icon/<slug>` image. */
const MD_H2_ICON_HEADING_RX =
  /^## <a href="#(?<anchor>[\w-]+)"><img src="https:\/\/svg\.xul\.is\/icon\/(?<icon>[\w-]+)\?[^"]*" align="left" \/><\/a>(?<title>.+)$/gm;

/** Matches every level-2 Markdown heading line. */
const MD_H2_LINE_RX = /^## .+$/gm;

/** Matches in-document anchor links inside a Markdown Table of Contents bullet list. */
const MD_TOC_ANCHOR_RX = /^- {3}\[[^\]]+\]\(#(?<anchor>[\w-]+)\)$/gm;

/** Matches `pnpm run <script>` invocations inside Markdown and YAML files. */
const MD_PNPM_SCRIPT_RX = /\bpnpm run (?<script>[\w:-]+)/g;

/** Matches concrete repository file or directory paths inside backtick code spans. */
const MD_REPO_PATH_SPAN_RX =
  /`(?<relPath>(?:assets|src|test|scripts|\.github|\.agents)(?:\/[\w.-]+)+\/?)`/g;

/** Matches badge `<img … src="https://svg.xul.is/badge/…" />` tags inside the `README.md` hero block. */
const README_HERO_BADGE_IMG_RX =
  /<img\s+(?<attrs>[^>]*\bsrc="https:\/\/svg\.xul\.is\/badge\/[^"]+"[^>]*)\/>/g;

/** Matches named `import { … } from '@/…'` statements inside Markdown code examples. */
const MD_TS_IMPORT_RX = /import\s*\{(?<specifiers>[^}]+)\}\s*from\s*'(?<modulePath>@\/[\w/-]+)';/g;

/** Matches punctuation stripped when GitHub generates a heading anchor slug. */
const HEADING_PUNCT_RX = /[^\w\s-]/g;

/** Matches an `as` alias separator inside a named import specifier (`foo as bar`). */
const IMPORT_ALIAS_SPLIT_RX = /\s+as\s+/;

/** Matches every route pattern rendered inside a documentation header `<RoutePills />` strip. */
const ROUTE_PILL_PATTERN_RX =
  /<code class="route-pill"><span class="route-method">GET<\/span>(?<pattern>[^<]+)<\/code>/g;

/** Matches a colon-prefixed route segment placeholder (`/:label`, `/[:owner/]`). */
const PATH_PARAM_PLACEHOLDER_RX = /\/\[?:[a-z]/;

/** Matches every parameter table `<th scope="row" role="rowheader">` cell. */
const ROW_HEADER_CELL_RX = /<th scope="row" role="rowheader">(?<cell>[\s\S]*?)<\/th>/g;

/** Matches every `?<param>=` query parameter token inside a parameter table header cell. */
const QUERY_PARAM_TOKEN_RX = /\?(?<param>[a-z][\w-]*)=/g;

/** Matches a data row inside the `## Endpoints` Markdown table of `README.md`. */
const MD_ENDPOINT_ROW_RX =
  /^\| \[\*\*(?<label>[^*]+)\*\*\]\((?<docsUrl>https:\/\/[^)]+)\) \| `(?<route>\/[^`]+)` \| (?<description>[^|]+) \|$/gm;

/** Matches a backticked `/<alias>/*` wildcard route alias inside Markdown prose. */
const MD_ROUTE_ALIAS_WILDCARD_RX = /`(?<wildcard>\/[\w-]+\/\*)`/g;

/** Matches backticked identifier tokens inside a Markdown table cell. */
const MD_INLINE_CODE_TOKEN_RX = /`(?<token>[\w-]+)`/g;

/** Matches every `https://svg.xul.is` URL across Markdown and YAML files. */
const MD_SITE_URL_RX = /(?<url>https:\/\/svg\.xul\.is[^\s"')<>]*)/g;

/** Matches `blob/main/<path>[#<anchor>]` repository file URLs. */
const MD_REPO_BLOB_URL_RX =
  /https:\/\/github\.com\/xulbux\/svg-api\/blob\/main\/(?<relPath>[\w./-]+)(?:#(?<anchor>[\w-]+))?/g;

/** Matches the `**Node.js:**` version constraint line in `CONTRIBUTING.md`. */
const MD_NODE_PREREQ_RX = /^- {3}\*\*Node\.js:\*\* `(?<engine>[^`]+)`$/m;

/** Matches inline download metric period items (`` `dd` (`/day`) ``) in `CONTRIBUTING.md`. */
const MD_DOWNLOAD_KEY_ITEM_RX = /`(?<key>[\w-]+)` \((?<detail>[^)]+)\)/g;

/** Matches backticked `{placeholder}` tokens in `CONTRIBUTING.md`. */
const MD_PLACEHOLDER_TOKEN_RX = /`\{(?<name>[\w-]+)\}`/g;

/** Matches bundled icon library bullets (`-   **Name** (\`pkg\`) – …`) in `CONTRIBUTING.md`. */
const MD_ICON_SOURCE_BULLET_RX = /^- {3}\*\*(?<name>[^*]+)\*\* \(`(?<pkg>[^`]+)`\) – /gm;

/** Matches the named placeholder alternation inside `URL_PLACEHOLDER_RX.source`. */
const URL_PLACEHOLDER_GROUP_RX = /\(\?<placeholder>(?<names>[^)]+)\)/;

/** Matches a GitHub Actions `if:` conditional referencing the disallowed `secrets` context. */
const YAML_IF_SECRETS_RX = /^\s*if:.*\bsecrets\./m;

/** Matches every `uses:` step line in a GitHub Actions workflow. */
const YAML_USES_LINE_RX = /^\s*-?\s*uses:\s+.+$/gm;

/** Matches a `uses:` step line pinned to an immutable 40-character commit SHA with a version comment. */
const YAML_SHA_PINNED_USES_RX =
  /^\s*-?\s*uses:\s+[\w.-]+\/[\w.-]+@[\da-f]{40}\s+#\s+v\d+(?:\.\d+){0,2}$/gm;

// -------------------------------------- INTERNALS --------------------------------------

/** Linearize a single 8-bit sRGB channel (`0`–`255`) per WCAG 2.x relative luminance. */
function linearizeSrgbChannel(channelByte: number): number {
  const srgb = channelByte / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** Compute the WCAG 2.x relative luminance (`0`–`1`) of a `#RRGGBB` hex color. */
function computeRelativeLuminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * linearizeSrgbChannel(red) +
    0.7152 * linearizeSrgbChannel(green) +
    0.0722 * linearizeSrgbChannel(blue)
  );
}

/** Compute the WCAG 2.x contrast ratio (`1`–`21`) between two `#RRGGBB` hex colors. */
function computeContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const lumA = computeRelativeLuminance(foregroundHex);
  const lumB = computeRelativeLuminance(backgroundHex);
  return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
}

/** Collect repeated entries from `items` in encounter order (`O(n)`). */
function findDuplicateStrings(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const item of items) {
    if (seen.has(item)) {
      duplicates.push(item);
    } else {
      seen.add(item);
    }
  }
  return duplicates;
}

/** Memoized rendered site pages across tests in this suite. */
let renderedPagesCache: RenderedPage[] | undefined = undefined;

/** Render the homepage, every documentation page, and every builder page (memoized). */
function renderAllPages(): RenderedPage[] {
  if (renderedPagesCache) {
    return renderedPagesCache;
  }
  const pages: RenderedPage[] = [{ html: renderHomeHtml(), path: '/' }];
  for (const page of DOCS_PAGES) {
    pages.push({ html: renderDocsHtml(page.slug), path: buildDocsPath(page.slug) });
  }
  for (const page of BUILDER_PAGES) {
    pages.push({ html: renderBuilderHtml(page.kind), path: buildBuilderPath(page.kind) });
  }
  renderedPagesCache = pages;
  return pages;
}

/** Read the site client TypeScript module sources for structural source assertions. */
function readSiteScript(): string {
  return readClientModuleSources('site');
}

/** Evaluate the site script without a DOM and return its exposed pure helpers. */
function loadSiteCore(): SiteClientCore {
  return evaluateClientCore<SiteClientCore>(siteScript, 'svgSiteCore');
}

/** Collect a named capture group of every match. */
function collectGroups(html: string, pattern: RegExp, groupName: string): string[] {
  const values: string[] = [];
  for (const match of html.matchAll(pattern)) {
    values.push(match.groups?.[groupName] ?? '');
  }
  return values;
}

/** Extract the service reference table row of a service key (`<tr>…</tr>`). */
function extractServiceRow(servicesHtml: string, key: string): string {
  const rowStart = servicesHtml.indexOf(`<th scope="row" role="rowheader">/badge/${key}/`);
  expect(rowStart, key).toBeGreaterThan(-1);
  return servicesHtml.slice(rowStart, servicesHtml.indexOf('</tr>', rowStart));
}

/** Parse the metrics and `metric (alias, alias)` notes listed in a services table row's `Values` cell. */
function collectListedMetrics(row: string): ListedMetrics {
  const valuesCell = (row.split('<td role="cell">')[1] ?? '').replace(HTML_TAG_RX, '').trim();
  const listed: ListedMetrics = { aliases: [], metrics: [] };
  for (const token of valuesCell.split(' | ')) {
    const aliasIndex = token.indexOf(' (');
    if (aliasIndex === -1) {
      listed.metrics.push(token);
    } else {
      listed.metrics.push(token.slice(0, aliasIndex));
      listed.aliases.push(...token.slice(aliasIndex + 2, -1).split(', '));
    }
  }
  return listed;
}

/** Build an attribute-backed fake toggle `<button>` element with click listener dispatch. */
function createFakeSwitchButton(): {
  click: () => void;
  element: FakeSwitchElement;
  getChecked: () => string | undefined;
} {
  const attributes = new Map<string, string>([['aria-checked', 'false']]);
  const clickListeners: (() => void)[] = [];
  const element: FakeSwitchElement = {
    addEventListener(type: string, listener: () => void) {
      if (type === 'click') {
        clickListeners.push(listener);
      }
    },
    getAttribute: (name: string) => attributes.get(name),
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
  };
  return {
    click() {
      for (const listener of clickListeners) {
        listener();
      }
    },
    element,
    getChecked: () => attributes.get('aria-checked'),
  };
}

/** Minimal `ResizeObserver` constructor stub for evaluating `site.client.js` in Node. */
function createFakeResizeObserver(): { observe: () => void; unobserve: () => void } {
  return { observe: () => undefined, unobserve: () => undefined };
}

/** Prototype constructor for simulated `Node` instances. */
function FakeNode(): undefined {
  return undefined;
}

/** Prototype constructor for simulated `Element` instances. */
function FakeElement(): undefined {
  return undefined;
}
FakeElement.prototype = Object.create(FakeNode.prototype);

/** Prototype constructor for simulated `HTMLElement` instances. */
function FakeHtmlElement(): undefined {
  return undefined;
}
FakeHtmlElement.prototype = Object.create(FakeElement.prototype);

/** Read a UTF-8 text file relative to the repository root. */
function readRepoFile(repoRoot: string, relPath: string): string {
  return readFileSync(path.resolve(repoRoot, relPath), 'utf8');
}

/** Convert a Markdown heading title into GitHub's generated anchor slug. */
function toGitHubHeadingSlug(title: string): string {
  return title.toLowerCase().replace(HEADING_PUNCT_RX, '').trim().replaceAll(' ', '-');
}

/** Verify every icon-bearing `##` heading in `markdown` resolves its icon and matches GitHub's anchor slug. */
function collectIconHeadingAnchors(docName: string, markdown: string): string[] {
  const iconHeadings = [...markdown.matchAll(MD_H2_ICON_HEADING_RX)];
  expect(iconHeadings.length, docName).toBeGreaterThan(0);
  const headingAnchors: string[] = [];
  for (const match of iconHeadings) {
    const anchor = match.groups?.anchor ?? '';
    const iconSlug = match.groups?.icon ?? '';
    const title = (match.groups?.title ?? '').trim();
    expect(anchor, `${docName}: ${title}`).toBe(toGitHubHeadingSlug(title));
    expect(resolveIcon(iconSlug), `${docName} icon: ${iconSlug}`).toBeDefined();
    headingAnchors.push(anchor);
  }
  return headingAnchors;
}

/** Verify every `##` heading in `CONTRIBUTING.md` carries a valid icon, matches GitHub's anchor slug, and aligns with the ToC. */
function assertContributingHeadingsAndToc(contributingMd: string): ReadonlySet<string> {
  const allH2Lines = contributingMd.match(MD_H2_LINE_RX) ?? [];
  const headingAnchors = collectIconHeadingAnchors('CONTRIBUTING.md', contributingMd);
  expect(headingAnchors).toHaveLength(allH2Lines.length);
  const tocAnchors = collectGroups(contributingMd, MD_TOC_ANCHOR_RX, 'anchor');
  expect(tocAnchors).toEqual(headingAnchors.slice(1));
  return new Set(headingAnchors);
}

/** Derive the compact bracketed route pattern of an endpoint directly from its `/docs/:slug` `<RoutePills />`. */
function deriveCompactEndpointRoute(slug: DocsPageSlug, aliasSet: ReadonlySet<string>): string {
  const rawPills = collectGroups(renderDocsHtml(slug), ROUTE_PILL_PATTERN_RX, 'pattern');
  const canonicalPatterns = rawPills.filter(
    (pattern) =>
      !pattern.includes('?') &&
      !pattern.includes('//') &&
      PATH_PARAM_PLACEHOLDER_RX.test(pattern) &&
      !aliasSet.has(pattern.split('/')[1] ?? '')
  );
  if (canonicalPatterns.length === 1) {
    return requireDefined(canonicalPatterns[0], `${slug} single route`);
  }
  expect(canonicalPatterns, slug).toHaveLength(2);
  const [shortPattern = '', longPattern = ''] = canonicalPatterns.toSorted(
    (left, right) => left.length - right.length
  );
  const [prefix = '', singleSegment = ''] = shortPattern.slice(1).split('/');
  const [, firstSegment = '', secondSegment = ''] = longPattern.slice(1).split('/');
  return singleSegment === firstSegment
    ? `/${prefix}/${firstSegment}[/${secondSegment}]`
    : `/${prefix}/[${firstSegment}/]${secondSegment}`;
}

/** Parse the `## Endpoints` Markdown table rows from `README.md`. */
function parseReadmeEndpointRows(readmeMd: string): ReadmeEndpointRow[] {
  const rows: ReadmeEndpointRow[] = [];
  for (const match of readmeMd.matchAll(MD_ENDPOINT_ROW_RX)) {
    const groups = requireDefined(match.groups, 'README endpoint row');
    rows.push({
      description: requireDefined(groups.description, 'description'),
      docsUrl: requireDefined(groups.docsUrl, 'docsUrl'),
      label: requireDefined(groups.label, 'label'),
      route: requireDefined(groups.route, 'route'),
    });
  }
  return rows;
}

/** Verify the `## Endpoints` table in `README.md` matches canonical order, routes, aliases, and widget tokens. */
function assertReadmeEndpointsTable(readmeMd: string): void {
  const endpointDocsPages = DOCS_PAGES.filter(
    (page) => page.group === 'badges' || page.group === 'elements'
  );
  expect(BUILDER_PAGES.map((page) => page.docsSlug)).toEqual(
    endpointDocsPages.map((page) => page.slug)
  );

  const rows = parseReadmeEndpointRows(readmeMd);
  expect(rows).toHaveLength(endpointDocsPages.length);

  const aliasSet = new Set(
    SVG_ROUTES.filter((route) => route.aliasOf !== undefined).map((route) => route.prefix)
  );
  const seenPrefixes = new Set<string>();

  for (let i = 0; i < endpointDocsPages.length; i += 1) {
    const docsPage = requireDefined(endpointDocsPages[i], `docsPage ${i}`);
    const builderPage = requireDefined(BUILDER_PAGES[i], `builderPage ${i}`);
    const row = requireDefined(rows[i], `README row ${i}`);

    expect(row.docsUrl, docsPage.slug).toBe(`${SITE_ORIGIN}${buildDocsPath(docsPage.slug)}`);
    expect([docsPage.navLabel, builderPage.ogLabel], docsPage.slug).toContain(row.label);
    expect(row.route, docsPage.slug).toBe(deriveCompactEndpointRoute(docsPage.slug, aliasSet));

    const canonicalPrefix = requireDefined(row.route.split('/')[1], `${docsPage.slug} prefix`);
    seenPrefixes.add(canonicalPrefix);

    const expectedAliases =
      docsPage.slug === 'services'
        ? []
        : listRouteAliases(canonicalPrefix).map((alias) => `/${alias}/*`);
    const actualAliases = collectGroups(row.description, MD_ROUTE_ALIAS_WILDCARD_RX, 'wildcard');
    expect(actualAliases, `${docsPage.slug} aliases`).toEqual(expectedAliases);
  }

  expect([...seenPrefixes].toSorted()).toEqual(
    getEndpointRoutes()
      .map((pattern) => pattern.split('/')[1] ?? '')
      .toSorted()
  );
  expect(rows[1]?.route).toBe(SERVICE_ROUTE_PATTERN);

  const badgeRow = requireDefined(rows[0], 'badges row');
  expect(collectGroups(badgeRow.description, MD_INLINE_CODE_TOKEN_RX, 'token')).toEqual([
    ...SPECIAL_ELEMENT_KINDS,
  ]);
  expect(VARIANT_TOKENS).toHaveLength(3);
  expect(rows[2]?.description).toContain('three hierarchy variants');
  expect(rows[6]?.description).toContain(`${QUOTE_LAYOUT_TOKENS.join(' and ')} layouts`);
}

/** Collect every sorted `?<param>=` query parameter documented across `slugs` parameter tables. */
function collectDocumentedQueryParams(slugs: readonly DocsPageSlug[]): string[] {
  const params = new Set<string>();
  for (const slug of slugs) {
    for (const rawCell of collectGroups(renderDocsHtml(slug), ROW_HEADER_CELL_RX, 'cell')) {
      const plainCell = rawCell.replace(HTML_TAG_RX, '');
      for (const param of collectGroups(plainCell, QUERY_PARAM_TOKEN_RX, 'param')) {
        params.add(param);
      }
    }
  }
  return [...params].toSorted();
}

/** Verify `CONTRIBUTING.md` standard & download metric keys, global aliases, and `createEndpoint()` placeholders. */
function assertContributingDownloadAndPlaceholderSpecs(contributingMd: string): void {
  const standardKeysStart = contributingMd.indexOf('-   **Standard Metric Keys:**');
  const downloadsStart = contributingMd.indexOf('-   **Download Metric Keys:**');
  const placeholdersStart = contributingMd.indexOf('-   **URL Placeholders:**');
  const iconsSectionStart = contributingMd.indexOf('<br>', placeholdersStart);
  expect(standardKeysStart).toBeGreaterThan(-1);
  expect(downloadsStart).toBeGreaterThan(standardKeysStart);
  expect(placeholdersStart).toBeGreaterThan(downloadsStart);
  expect(iconsSectionStart).toBeGreaterThan(placeholdersStart);

  const standardKeysLine = contributingMd.slice(standardKeysStart, downloadsStart);
  const downloadsLine = contributingMd.slice(downloadsStart, placeholdersStart);
  const documentedItems = new Map<string, string>();
  for (const match of downloadsLine.matchAll(MD_DOWNLOAD_KEY_ITEM_RX)) {
    const groups = requireDefined(match.groups, 'download item');
    documentedItems.set(
      requireDefined(groups.key, 'download key'),
      requireDefined(groups.detail, 'download detail')
    );
  }
  expect([...documentedItems.keys()].toSorted()).toEqual(Object.keys(DOWNLOAD_PERIODS).toSorted());

  for (const [key, detail] of documentedItems) {
    const spec = DOWNLOAD_PERIODS[key as DownloadMetricKey];
    if (spec.suffix.length > 0) {
      expect(detail, key).toContain(`\`${spec.suffix}\``);
    } else {
      expect(detail, key).not.toMatch(/`\/\w+`/);
    }
  }
  for (const [alias, canonical] of Object.entries(DEFAULT_METRIC_ALIASES)) {
    if (Object.hasOwn(DOWNLOAD_PERIODS, canonical)) {
      expect(documentedItems.get(canonical), `${alias} -> ${canonical}`).toContain(`\`${alias}\``);
    } else {
      expect(standardKeysLine, `${alias} -> ${canonical}`).toContain(`\`${canonical}\``);
      expect(standardKeysLine, `${alias} -> ${canonical}`).toContain(`\`${alias}\``);
    }
  }

  const placeholdersBlock = contributingMd.slice(placeholdersStart, iconsSectionStart);
  const documentedPlaceholders = collectGroups(placeholdersBlock, MD_PLACEHOLDER_TOKEN_RX, 'name');
  const expectedPlaceholders = (
    URL_PLACEHOLDER_GROUP_RX.exec(URL_PLACEHOLDER_RX.source)?.groups?.names ?? ''
  ).split('|');
  expect([...new Set(documentedPlaceholders)].toSorted()).toEqual(expectedPlaceholders.toSorted());
}

/** Verify `CONTRIBUTING.md` clone URL, Node engine, core commands, payload cap, and icon libraries. */
function assertContributingScriptsEngineAndIcons(
  contributingMd: string,
  serviceRequestYml: string,
  packageJson: RepoPackageJson
): void {
  expect(contributingMd).toContain(`git clone ${REPO_GITHUB_URL}.git`);
  expect(contributingMd).toContain('pnpm run dev');
  expect(contributingMd).toContain('pnpm run check');

  const documentedNodeEngine = MD_NODE_PREREQ_RX.exec(contributingMd)?.groups?.engine ?? '';
  expect(documentedNodeEngine.replaceAll(' ', '')).toBe(
    packageJson.engines.node.replaceAll(' ', '')
  );

  const maxUpstreamMb = `${MAX_UPSTREAM_BYTES / (1024 * 1024)} MB`;
  expect(contributingMd).toContain(`above \`${maxUpstreamMb}\``);
  expect(serviceRequestYml).toContain(`\`<= ${maxUpstreamMb}\``);
  expect(contributingMd).toContain(`\`${SERVICE_ROUTE_PATTERN}\``);

  const iconSourceNames: string[] = [];
  const iconPackages: string[] = [];
  for (const match of contributingMd.matchAll(MD_ICON_SOURCE_BULLET_RX)) {
    const groups = requireDefined(match.groups, 'icon source bullet');
    iconSourceNames.push(requireDefined(groups.name, 'icon source name'));
    iconPackages.push(requireDefined(groups.pkg, 'icon package'));
  }
  expect(iconSourceNames).toEqual([...ALL_ICON_SOURCE_NAMES]);
  const expectedIconPackages = Object.keys(packageJson.dependencies)
    .filter((dep) => dep === 'lucide-static' || dep.startsWith('@iconify-json/'))
    .toSorted();
  expect(iconPackages.toSorted()).toEqual(expectedIconPackages);
}

/** Verify every `pnpm run <script>` and concrete repository path across docs, workflows, and agent rules exists. */
function assertReferencedScriptsAndPathsExist(
  repoRoot: string,
  docsWithNames: readonly (readonly [name: string, text: string])[],
  packageScripts: Readonly<Record<string, string>>
): void {
  let checkedScripts = 0;
  let checkedPaths = 0;
  for (const [docName, docText] of docsWithNames) {
    for (const scriptName of collectGroups(docText, MD_PNPM_SCRIPT_RX, 'script')) {
      checkedScripts += 1;
      expect(Object.hasOwn(packageScripts, scriptName), `${docName} script: ${scriptName}`).toBe(
        true
      );
    }
    for (const relPath of collectGroups(docText, MD_REPO_PATH_SPAN_RX, 'relPath')) {
      checkedPaths += 1;
      expect(existsSync(path.resolve(repoRoot, relPath)), `${docName} path: ${relPath}`).toBe(true);
    }
  }
  expect(checkedScripts).toBeGreaterThan(0);
  expect(checkedPaths).toBeGreaterThan(0);
}

/** Request a `https://svg.xul.is` non-SVG page URL, following a single `301` canonical redirect when present. */
async function resolveSitePageResponse(
  rawUrl: string
): Promise<{ fragment: string; html: string; rawUrl: string; status: number }> {
  const parsedUrl = new URL(rawUrl);
  let response = await app.request(`${parsedUrl.pathname}${parsedUrl.search}`, {}, TEST_ENV);
  if (response.status === 301) {
    const redirectLocation = requireDefined(
      response.headers.get('Location') ?? undefined,
      `${rawUrl} 301 Location`
    );
    response = await app.request(redirectLocation, {}, TEST_ENV);
  }
  return {
    fragment: parsedUrl.hash.slice(1),
    html: await response.text(),
    rawUrl,
    status: response.status,
  };
}

/** Verify every `https://svg.xul.is` SVG/page URL and `${REPO_GITHUB_URL}/blob/main/…` link resolves cleanly. */
async function assertSiteAndRepoUrlsResolve(
  repoRoot: string,
  docsWithNames: readonly (readonly [name: string, text: string])[],
  anchorsByFile: ReadonlyMap<string, ReadonlySet<string>>
): Promise<void> {
  const uniquePageUrls = new Set<string>();
  for (const [docName, docText] of docsWithNames) {
    for (const rawUrl of collectGroups(docText, MD_SITE_URL_RX, 'url')) {
      if (!rawUrl.includes('...')) {
        const parsedUrl = new URL(rawUrl);
        if (resolveSvgRequest(parsedUrl)) {
          const svgMarkup = renderSvgPath(`${parsedUrl.pathname}${parsedUrl.search}`, 'MIT');
          expect(svgMarkup, `${docName}: ${rawUrl}`).toContain('<svg ');
          if (parsedUrl.pathname.startsWith('/icon/')) {
            const iconSlug = decodeURIComponent(parsedUrl.pathname.slice('/icon/'.length));
            expect(resolveIcon(iconSlug), `${docName} icon: ${iconSlug}`).toBeDefined();
          }
        } else {
          uniquePageUrls.add(rawUrl);
        }
      }
    }
    for (const match of docText.matchAll(MD_REPO_BLOB_URL_RX)) {
      const relPath = match.groups?.relPath ?? '';
      const anchor = match.groups?.anchor;
      expect(existsSync(path.resolve(repoRoot, relPath)), `${docName} blob: ${relPath}`).toBe(true);
      if (anchor) {
        expect(anchorsByFile.get(relPath)?.has(anchor), `${docName} #${anchor}`).toBe(true);
      }
    }
  }

  expect(uniquePageUrls.size).toBeGreaterThan(0);
  const pageResponses = await Promise.all([...uniquePageUrls].map(resolveSitePageResponse));
  for (const { fragment, html, rawUrl, status } of pageResponses) {
    expect(status, rawUrl).toBe(200);
    if (fragment.length > 0) {
      expect(html, `${rawUrl} #${fragment}`).toContain(`id="${fragment}"`);
    }
  }
}

/** Verify every `import { … } from '@/…'` inside a Markdown code block imports real module exports. */
async function assertMarkdownModuleImports(markdown: string): Promise<void> {
  const importMatches = [...markdown.matchAll(MD_TS_IMPORT_RX)];
  expect(importMatches.length).toBeGreaterThan(0);
  const loadedModules = await Promise.all(
    importMatches.map(async (match) => {
      const modulePath = match.groups?.modulePath ?? '';
      const importedModule = (await import(modulePath)) as Record<string, unknown>;
      return { importedModule, modulePath, rawSpecifiers: match.groups?.specifiers ?? '' };
    })
  );
  for (const { importedModule, modulePath, rawSpecifiers } of loadedModules) {
    for (const rawSpecifier of rawSpecifiers.split(',')) {
      const bindingName = rawSpecifier.trim().split(IMPORT_ALIAS_SPLIT_RX)[0]?.trim() ?? '';
      if (bindingName.length > 0) {
        expect(importedModule[bindingName], `${modulePath} export: ${bindingName}`).toBeDefined();
      }
    }
  }
}

/** Verify prose-referenced exported identifiers in `CONTRIBUTING.md` and `SECURITY.md` exist on their modules. */
async function assertProseModuleExports(contributingMd: string, securityMd: string): Promise<void> {
  const loadedEntries = await Promise.all(
    PROSE_REFERENCED_EXPORTS.map(async (entry) => ({
      entry,
      importedModule: (await import(entry.modulePath)) as Record<string, unknown>,
    }))
  );
  for (const { entry, importedModule } of loadedEntries) {
    const markdown = entry.doc === 'contributing' ? contributingMd : securityMd;
    for (const symbolName of entry.symbols) {
      expect(markdown, `${entry.doc} mentions ${symbolName}`).toContain(`\`${symbolName}`);
      expect(importedModule[symbolName], `${entry.modulePath} export: ${symbolName}`).toBeDefined();
    }
  }
}

/** Decompress the concatenated `IDAT` scanline payload from an encoded PNG buffer. */
function inflateIdatScanlines(pngBuffer: Buffer): Buffer {
  const idatChunks: Buffer[] = [];
  let offset = 8; // Skip 8-byte PNG signature.
  while (offset + 8 <= pngBuffer.length) {
    const chunkLength = pngBuffer.readUInt32BE(offset);
    const chunkType = pngBuffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (chunkType === 'IDAT') {
      idatChunks.push(pngBuffer.subarray(offset + 8, offset + 8 + chunkLength));
    }
    offset += 12 + chunkLength;
  }
  if (idatChunks.length === 0) {
    throw new Error('Missing IDAT chunk in PNG buffer');
  }
  return inflateSync(Buffer.concat(idatChunks));
}

/** Verify `assets/icon.png` is the single SSOT brand asset across `LICENSE`, font licenses, `README.md`, `/favicon.*`, and `/og.*`. */
function assertBrandAssetsAndLicenseParity(
  repoRoot: string,
  readmeMd: string,
  licenseTxt: string
): void {
  expect(readdirSync(path.resolve(repoRoot, 'assets'))).toEqual(['icon.png']);
  expect(existsSync(path.resolve(repoRoot, 'src', 'assets', 'og.png'))).toBe(false);

  const brandIconBytes = readFileSync(path.resolve(repoRoot, 'assets', 'icon.png'));
  const decodedBrandIcon = decodePngToRgba(brandIconBytes);
  expect(decodedBrandIcon.width).toBe(BRAND_ICON_PNG_SIZE);
  expect(decodedBrandIcon.height).toBe(BRAND_ICON_PNG_SIZE);
  expect(decodedBrandIcon.pixels[3]).toBe(0); // Transparent `(0, 0)` squircle corner.

  const faviconPngBuffer = readFileSync(path.resolve(repoRoot, 'dist', 'client', 'favicon.png'));
  const decodedFavicon = decodePngToRgba(faviconPngBuffer);
  expect(decodedFavicon.width).toBe(FAVICON_PNG_SIZE);
  expect(decodedFavicon.height).toBe(FAVICON_PNG_SIZE);
  expect(decodedFavicon.pixels[3]).toBe(0);
  const faviconExpectedDigest = createHash('sha256').update(brandIconBytes).digest('hex');
  expect(faviconPngBuffer.toString('latin1')).toContain(
    `Comment\0src-sha256=${faviconExpectedDigest}`
  );

  const ogSvg = renderOgImageSvg();
  expect(ogSvg).toContain(
    `<image x="88" y="98" width="48" height="48" href="data:image/png;base64,${faviconPngBuffer.toString('base64')}" />`
  );

  const ogPngBuffer = readFileSync(path.resolve(repoRoot, 'dist', 'client', 'og.png'));
  const ogExpectedDigest = createHash('sha256').update(ogSvg).digest('hex');
  expect(ogPngBuffer.toString('latin1')).toContain(`Comment\0src-sha256=${ogExpectedDigest}`);

  const repoSlug = REPO_GITHUB_URL.slice('https://github.com/'.length);
  const rawBrandUrl = `https://raw.githubusercontent.com/${repoSlug}/main/assets/icon.png`;
  expect(readmeMd).toContain(`<img height="96" src="${rawBrandUrl}" />`);
  expect(readmeMd).toContain('/badge/License/MIT*?variant=3&color=neutral&icon=scale');

  const readmeHeroBlock = readmeMd.slice(0, readmeMd.indexOf('</h1>'));
  const heroBadgeAttrs = collectGroups(readmeHeroBlock, README_HERO_BADGE_IMG_RX, 'attrs');
  expect(heroBadgeAttrs).toHaveLength(5);
  for (const attrs of heroBadgeAttrs) {
    expect(attrs).toMatch(/\balt="[^"]+"/);
  }

  expect(licenseTxt).toContain('MIT License');
  expect(licenseTxt).toContain('Artwork & Branding Notice:');
  expect(licenseTxt).toContain('`assets/`');

  const fontLicenseTxt = readRepoFile(repoRoot, 'src/assets/fonts/LICENSE');
  expect(fontLicenseTxt).toContain('SIL OPEN FONT LICENSE Version 1.1');
  expect(fontLicenseTxt).toContain('The Geist Project Authors');
  expect(fontLicenseTxt).toContain('The JetBrains Mono Project Authors');
}

// ----------------------------------------- MAIN ----------------------------------------

/************************************ HTML validity *************************************/

describe('documentation pages – HTML validity', () => {
  beforeAll(() => {
    renderAllPages();
  });

  it('never repeats an element ID on a page (regression: inlined previews duplicated bg-dark, grad-*, sheen-*)', () => {
    for (const page of renderAllPages()) {
      const ids = collectGroups(page.html, ID_ATTRIBUTE_RX, 'id');
      expect(findDuplicateStrings(ids), page.path).toEqual([]);
      expect(ids.length, page.path).toBeGreaterThan(0);
    }
  });

  it('resolves every url(#…), href="#…", and ARIA ID reference to an element on the same page', () => {
    for (const page of renderAllPages()) {
      const ids = new Set(collectGroups(page.html, ID_ATTRIBUTE_RX, 'id'));
      for (const reference of collectGroups(page.html, FRAGMENT_REFERENCE_RX, 'id')) {
        expect(ids.has(reference), `${page.path} #${reference}`).toBe(true);
      }
      // ARIA references are space-separated ID lists (e.g., a dropdown labeled by its field label and value):
      for (const references of collectGroups(page.html, ARIA_ID_REFERENCE_RX, 'id')) {
        for (const reference of references.split(' ')) {
          expect(ids.has(reference), `${page.path} aria → ${reference}`).toBe(true);
        }
      }
    }
  });

  it('scopes inline preview SVG IDs per card instance instead of rewriting the renderers', () => {
    const colorsHtml = renderDocsHtml('colors');
    expect(colorsHtml).not.toContain('id="bg-dark"');
    expect(colorsHtml).not.toContain('url(#bg-dark)');
    expect(colorsHtml).toMatch(/id="p[\da-z]+-\d+-bg-dark"/);
  });

  it('renders exactly one <h1> per page and never skips a heading level', () => {
    for (const page of renderAllPages()) {
      const levels = collectGroups(page.html, HEADING_TAG_RX, 'level').map(Number);
      expect(
        levels.filter((level) => level === 1),
        page.path
      ).toHaveLength(1);
      expect(levels[0], page.path).toBe(1);
      for (const [i, level] of levels.entries()) {
        const previousLevel = levels[i - 1];
        if (previousLevel !== undefined) {
          expect(level - previousLevel, `${page.path} heading ${i}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('escapes parameter table content and renders alias and note micro-syntax', () => {
    const tableHtml = renderParamTable(
      [
        {
          defaultVal: 'round(gap × 3.25) (groupgap)',
          description: '<script>alert(1)</script>',
          name: '?x= / ?y=',
          values: 'v | license [l] | 1 to 4',
        },
      ],
      'Test <parameters>'
    );
    expect(tableHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(tableHtml).not.toContain('<script>');
    expect(tableHtml).toContain('aria-label="Test &lt;parameters&gt;"');
    expect(tableHtml).toContain(
      '<th scope="row" role="rowheader">?x=<span class="param-sep"> / </span>?y=</th>'
    );
    expect(tableHtml).toContain('license <span class="param-alias">(l)</span>');
    expect(tableHtml).toContain('1<span class="param-sep"> to </span>4');
    expect(tableHtml).toContain(
      '<code class="param-code">round(gap × 3.25)</code> <span class="param-note">(groupgap)</span>'
    );
  });
});

/************************************ Accessibility *************************************/

describe('documentation pages – accessibility', () => {
  it('exposes the theme switch state via aria-checked, starts the body with a skip link, and puts every link in the Tab order (incl. Vivaldi/Safari)', () => {
    for (const page of renderAllPages()) {
      expect(page.html, page.path).toMatch(/role="switch" aria-checked="(?:true|false)"/);
      expect(page.html, page.path).toMatch(
        /<body(?: class="has-sidebar")?>\s*<a class="skip-link" href="#main-content" tabindex="0">/
      );
      expect(page.html, page.path).toContain('id="main-content" tabindex="-1"');
      for (const match of page.html.matchAll(/<a\s[^>]+>/g)) {
        if (match[0].includes('href=')) {
          expect(match[0], `${page.path}: ${match[0]}`).toContain('tabindex="0"');
        }
      }
    }
  });

  it('makes every scrollable code block and parameter table keyboard-focusable with an accessible name', () => {
    const badgesHtml = renderDocsHtml('badges');
    const codeBlockCount = countOccurrences(badgesHtml, '<pre class="code-pre"');
    expect(codeBlockCount).toBeGreaterThan(0);
    expect(
      countOccurrences(badgesHtml, '<pre class="code-pre" tabindex="0" role="region" aria-label="')
    ).toBe(codeBlockCount);
    expect(badgesHtml).toContain(
      '<div class="table-wrapper" tabindex="0" role="region" aria-label="'
    );
  });

  it('announces copy feedback and describes each copy button by its card title', () => {
    const buttonsHtml = renderDocsHtml('buttons');
    expect(buttonsHtml).toMatch(/class="copy-btn" aria-describedby="[\w-]+-title"/);
    expect(buttonsHtml).toContain(
      '<span class="visually-hidden" data-copy-label aria-live="polite">Copy</span>'
    );
    expect(buttonsHtml).not.toContain('code-drawer-toolbar');
    expect(buttonsHtml).not.toContain('code-drawer-label');
  });

  it('adds deep-link anchors to section subheads and cards', () => {
    const badgesHtml = renderDocsHtml('badges');
    expect(badgesHtml).toContain(
      '<div class="subhead-row" id="visual-hierarchy-variants-variant">'
    );
    expect(badgesHtml).toContain('href="#visual-hierarchy-variants-variant"');
    expect(badgesHtml).toContain(
      '<div class="card-container" id="variant-1-primary-badge-default">'
    );
    expect(badgesHtml).toContain('href="#variant-1-primary-badge-default"');
  });

  it('keeps Isolux website text and error tokens at WCAG AA contrast across dark and light surfaces and keeps footer text selectable', () => {
    const css = getSiteStylesheet();
    expect(css).toContain(`--c-bg: light-dark(${LIGHT_BG}, ${DARK_BG});`);
    expect(css).toContain(`--c-bg-soft: light-dark(${ISOLUX_GRAY[50]}, ${ISOLUX_GRAY[950]});`);
    expect(css).toContain(
      `--c-bg-elv: light-dark(${ISOLUX_UI.raised.light}, ${ISOLUX_UI.raised.dark});`
    );
    expect(css).toContain(
      `--c-divider: light-dark(${ISOLUX_UI.border.light}, ${ISOLUX_UI.border.dark});`
    );
    expect(css).toContain(
      `--c-border-strong: light-dark(${ISOLUX_UI.borderStrong.light}, ${ISOLUX_UI.borderStrong.dark});`
    );
    expect(css).toContain(
      `--c-switch-bg: light-dark(${ISOLUX_UI.bubble.light}, ${ISOLUX_UI.bubble.dark});`
    );
    expect(css).toContain(
      `--c-danger: light-dark(${ISOLUX_UI.error.light}, ${ISOLUX_UI.error.dark});`
    );
    expect(css).toContain(
      `--c-text-3: light-dark(${ISOLUX_UI.foregroundMuted.light}, ${ISOLUX_UI.foregroundMuted.dark});`
    );

    const readableTokens = [
      ISOLUX_UI.foreground,
      ISOLUX_UI.foregroundSecondary,
      ISOLUX_UI.foregroundMuted,
      ISOLUX_UI.error,
      ...Object.values(ISOLUX_SYNTAX),
    ];
    for (const token of readableTokens) {
      for (const darkSurface of [DARK_BG, ISOLUX_GRAY[950], ISOLUX_UI.raised.dark]) {
        expect(
          computeContrastRatio(token.dark, darkSurface),
          `${token.dark} on ${darkSurface}`
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const lightSurface of [LIGHT_BG, ISOLUX_GRAY[50], ISOLUX_UI.raised.light]) {
        expect(
          computeContrastRatio(token.light, lightSurface),
          `${token.light} on ${lightSurface}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    expect(css).not.toMatch(/\.site-footer \{[^}]*user-select/);
    expect(css).toMatch(/:where\(a, button, summary, \[tabindex\]\):focus-visible/);
  });

  it('stops all CSS motion and pauses SMIL previews at their readable rest frame under prefers-reduced-motion', () => {
    expect(getSiteStylesheet()).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^]*?\*,\s*\*::before,\s*\*::after \{\s*transition: none !important;\s*animation: none !important;/
    );
    const script = readSiteScript();
    expect(script).toContain('previewSvg.pauseAnimations()');
    expect(script).toContain('previewSvg.dataset.restTime');
    expect(script).toContain("reducedMotionQuery.matches ? 'auto' : 'smooth'");
    expect(renderHomeHtml()).toContain('data-rest-time="');
  });

  it('wires builder hints and validation messages via aria-describedby, aria-invalid, and valid aria-required attributes', () => {
    const badgeBuilderHtml = renderBuilderHtml('badge');
    expect(badgeBuilderHtml).toContain('id="field-value-hint"');
    expect(badgeBuilderHtml).toContain('aria-describedby="field-value-hint"');
    expect(badgeBuilderHtml).toContain('id="field-icon-left-validation"');
    expect(badgeBuilderHtml).toContain('aria-describedby="field-icon-left-validation"');
    expect(renderBuilderHtml('icon')).toContain('aria-describedby="field-icon-main-validation"');
    expect(renderBuilderHtml('typing')).toContain(
      'aria-describedby="field-icon-main-validation field-icon-hint"'
    );
    expect(badgeBuilderHtml).toContain(
      'class="select-empty" data-select-empty role="status" aria-live="polite" hidden'
    );

    const stackBuilderHtml = renderBuilderHtml('stack');
    expect(stackBuilderHtml).toContain('aria-describedby="field-groups-validation"');
    expect(stackBuilderHtml).toContain(
      'class="select-empty stack-catalog-empty" id="stack-catalog-empty" role="status" aria-live="polite" hidden'
    );

    const builderJs = readClientModuleSources('builder');
    expect(builderJs).toContain("setAttribute('aria-required', 'true')");
    expect(builderJs).toContain("removeAttribute('aria-required')");
    expect(builderJs).not.toContain("toggleAttribute('aria-required'");
    expect(builderJs).toContain("setAttribute('aria-invalid', 'true')");
    expect(builderJs).toContain("removeAttribute('aria-invalid')");
    expect(builderJs).toContain("key === 'Home'");
    expect(builderJs).toContain("key === 'End'");
  });
});

/********************************* Head & client script *********************************/

describe('documentation pages – head metadata & client script', () => {
  it('renders a canonical URL, raster OpenGraph card, font preloads, BreadcrumbList JSON-LD, and a unique meta description per page', () => {
    const descriptions = new Set<string>();
    for (const page of renderAllPages()) {
      expect(page.html, page.path).toContain(
        `<link rel="canonical" href="${SITE_ORIGIN}${page.path}" />`
      );
      expect(page.html, page.path).toContain(
        '<link rel="sitemap" type="application/xml" href="/sitemap.xml" />'
      );
      const pngFaviconTag = `<link rel="icon" type="image/png" sizes="${FAVICON_PNG_SIZE}x${FAVICON_PNG_SIZE}" href="/favicon.png" />`;
      expect(page.html, page.path).toContain(pngFaviconTag);
      expect(page.html, page.path).not.toContain('/favicon.svg');
      expect(page.html, page.path).toContain(
        `<link rel="apple-touch-icon" sizes="${FAVICON_PNG_SIZE}x${FAVICON_PNG_SIZE}" href="/favicon.png" />`
      );
      expect(page.html, page.path).toContain(
        `<img src="/favicon.png" alt="" width="26" height="26" class="brand-mark" />${SITE_NAME}</a>`
      );
      expect(page.html, page.path).toContain(
        `<meta property="og:site_name" content="${SITE_NAME}" />`
      );
      const pageTitle = /<title>(?<title>[^<]+)<\/title>/.exec(page.html)?.groups?.title ?? '';
      expect(pageTitle, page.path).toContain(SITE_NAME);
      expect(pageTitle, page.path).not.toContain(SITE_HOST);
      expect(page.html, page.path).toContain(
        `<link rel="preload" href="${getSiteAssetUrl('Geist-Regular.ttf')}" as="font" type="font/ttf" crossorigin="anonymous" />`
      );
      expect(page.html, page.path).toContain(
        `<link rel="preload" href="${getSiteAssetUrl('Geist-Bold.ttf')}" as="font" type="font/ttf" crossorigin="anonymous" />`
      );
      expect(page.html, page.path).toContain(
        `<meta property="og:url" content="${SITE_ORIGIN}${page.path}" />`
      );
      expect(page.html, page.path).toContain('<meta property="og:locale" content="en_US" />');
      expect(page.html, page.path).toContain('<meta property="og:title" content="');
      expect(page.html, page.path).toContain(
        `<meta property="og:image" content="${SITE_ORIGIN}/og.png" />`
      );
      expect(page.html, page.path).toContain(
        '<meta property="og:image:type" content="image/png" />'
      );
      expect(page.html, page.path).toContain(
        `<meta name="twitter:image" content="${SITE_ORIGIN}/og.png" />`
      );
      expect(page.html, page.path).toContain(
        '<meta name="twitter:card" content="summary_large_image" />'
      );
      expect(page.html, page.path).toContain('media="(prefers-color-scheme: dark)"');
      const jsonLd =
        /<script type="application\/ld\+json">(?<json>[^<]+)<\/script>/.exec(page.html)?.groups
          ?.json ?? '';
      expect(jsonLd, page.path).toContain('"@context":"https://schema.org"');
      if (page.path !== '/') {
        expect(jsonLd, page.path).toContain('"@type":"BreadcrumbList"');
      }
      expect(() => JSON.parse(jsonLd) as unknown, page.path).not.toThrow();
      const description = /<meta name="description" content="(?<content>[^"]+)"/.exec(page.html)
        ?.groups?.content;
      expect(description, page.path).toMatch(/\S/);
      descriptions.add(description ?? '');
    }
    expect(descriptions.size).toBe(DOCS_PAGES.length + BUILDER_PAGES.length + 1);
    expect(renderDocsHtml('badges')).not.toContain('Interactive SVG preview studio');
  });

  it('keeps the HTML Content-Security-Policy SHA-256 hash synchronized with the inline head script and renders accessible 404 and 500 status pages without canonical metadata (drift guard)', async () => {
    const scriptBytes = new TextEncoder().encode(getHeadScriptBody());
    const digestBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
    const digestBase64 = btoa(String.fromCodePoint(...new Uint8Array(digestBuffer)));
    expect(HTML_SECURITY_HEADERS['Content-Security-Policy']).toContain(`'sha256-${digestBase64}'`);

    const statusPages: readonly [html: string, titleHeading: string][] = [
      [renderNotFoundHtml(), '<span class="hero-accent">404</span> Page Not Found'],
      [renderServerErrorHtml(), '<span class="hero-accent">500</span> Internal Server Error'],
    ];
    for (const [statusHtml, titleHeading] of statusPages) {
      expect(statusHtml).toContain(titleHeading);
      expect(statusHtml).toContain('Back to Home');
      expect(statusHtml).toContain('<meta name="robots" content="noindex" />');
      expect(statusHtml).not.toContain('rel="canonical"');
      expect(statusHtml).not.toContain('property="og:url"');
      expect(statusHtml).not.toContain('<script type="application/ld+json">');
      const ctaLinks = collectGroups(statusHtml, CTA_LINK_RX, 'href');
      expect(ctaLinks).toEqual(['/']);
      const ids = collectGroups(statusHtml, ID_ATTRIBUTE_RX, 'id');
      expect(findDuplicateStrings(ids)).toEqual([]);
      for (const anchorMatch of statusHtml.matchAll(/<a\s[^>]*href="[^"]+"[^>]*>/g)) {
        expect(anchorMatch[0]).toContain('tabindex="0"');
      }
    }
  });

  it('only applies whitelisted stored color schemes and preview backgrounds (regression: any localStorage value reached the meta tag)', () => {
    const html = renderHomeHtml();
    const script = readSiteScript();
    expect(html).not.toContain('localStorage.getItem("color-scheme")??');
    expect(html).toContain("if(storedScheme==='dark'||storedScheme==='light')");
    expect(script).toContain("return value === 'dark' || value === 'light' ? value : undefined;");
    expect(script).toContain(
      "typeof value === 'string' && siteConfig.previewBgValues.includes(value)"
    );
    expect(script).not.toContain('event.newValue ||');
    expect(html).not.toContain('<script blocking="render">');
  });

  it('renders one persisted preview background toggle switch per page in the header', () => {
    for (const page of renderAllPages()) {
      const headerHtml = page.html.slice(
        page.html.indexOf('<header class="site-header">'),
        page.html.indexOf('</header>')
      );
      expect(countOccurrences(headerHtml, 'id="preview-bg-toggle"'), page.path).toBe(1);
      expect(headerHtml, page.path).toContain(
        'class="bg-toggle" id="preview-bg-toggle" role="switch" aria-checked="false"'
      );
      expect(headerHtml, page.path).toContain('<span class="bg-swatch" aria-hidden="true"></span>');
      expect(headerHtml, page.path).not.toContain('id="bg-picker-menu"');
      expect(page.html, page.path).toContain('"previewBgValues":["auto","inverse"]');
    }
  });

  it('inverts the checker preview stage and Edit chip relative to the page scheme instead of offering redundant fixed dark/light stages', () => {
    const css = getSiteStylesheet();
    expect(css).toContain(`--c-preview-inverse-bg: light-dark(${DARK_BG}, ${LIGHT_BG});`);
    expect(css).toContain(
      `--c-preview-inverse-btn-bg: light-dark(${ISOLUX_UI.button.dark}, ${ISOLUX_UI.button.light});`
    );
    expect(css).toContain(
      `--c-preview-inverse-btn-text: light-dark(${ISOLUX_UI.buttonForeground.dark}, ${ISOLUX_UI.buttonForeground.light});`
    );
    expect(css).toContain('--c-preview-inverse-checker: light-dark(');
    expect(css).toMatch(
      /:root\[data-preview-bg=['"]inverse['"]\] \.preview-stage \{\s*--c-btn-bg: var\(--c-preview-inverse-btn-bg\);\s*--c-btn-text: var\(--c-preview-inverse-btn-text\);\s*--stage-bg: var\(--c-preview-inverse-bg\);\s*--stage-checker: var\(--c-preview-inverse-checker\);/
    );
    expect(css).not.toMatch(/data-preview-bg=['"]checker['"]/);
    expect(css).not.toMatch(/data-preview-bg=['"]dark['"]/);
    expect(css).not.toMatch(/data-preview-bg=['"]light['"]/);
  });

  it('memoizes rendered pages per isolate', () => {
    expect(renderDocsHtml('stack')).toBe(renderDocsHtml('stack'));
    expect(renderHomeHtml()).toBe(renderHomeHtml());
  });
});

/********************************* Navigation & assets **********************************/

describe('documentation pages – navigation & static assets', () => {
  it('makes the Builder the primary homepage call to action and the docs the secondary one (regression: docs-first hero)', () => {
    const html = renderHomeHtml();
    const heroHtml = html.slice(html.indexOf('class="hero-cta-row"'), html.indexOf('</section>'));
    const endHtml = html.slice(html.indexOf('class="pager-row is-end"'));
    for (const ctaHtml of [heroHtml, endHtml]) {
      const links: string[] = [];
      for (const match of ctaHtml.matchAll(CTA_LINK_RX)) {
        links.push(`${match.groups?.kind ?? ''} ${match.groups?.href ?? ''}`);
      }
      expect(links).toContain(`btn-primary ${buildBuilderPath('badge')}`);
      expect(links).toContain(`btn-secondary ${buildDocsPath('overview')}`);
      expect(links.filter((link) => link.startsWith('btn-primary'))).toHaveLength(1);
    }
  });

  it('renders highlight cards right below the hero, hides their detail text on narrow screens, and keeps live endpoint previews above the bottom CTA row', () => {
    const html = renderHomeHtml();
    const heroIndex = html.indexOf('<section class="hero">');
    const highlightsIndex = html.indexOf('<section class="feature-grid" aria-label="Highlights">');
    const endpointsIndex = html.indexOf('<section class="doc-section" id="endpoints">');
    const pagerIndex = html.indexOf('<div class="pager-row is-end">');
    expect(heroIndex).toBeGreaterThan(-1);
    expect(highlightsIndex).toBeGreaterThan(heroIndex);
    expect(endpointsIndex).toBeGreaterThan(highlightsIndex);
    expect(pagerIndex).toBeGreaterThan(endpointsIndex);
    expect(
      countOccurrences(html, '<h2 class="feature-title"><svg class="ui-icon"')
    ).toBeGreaterThanOrEqual(4);
    expect(html).not.toContain('feature-icon');
    expect(getSiteStylesheet()).toMatch(
      /@media \(max-width: 640px\) \{[\s\S]*?\.feature-desc \{\s*display: none;\s*\}/
    );
  });

  it('renders exactly three header tabs and marks the active one with aria-current', () => {
    const expectedActive: Readonly<Record<string, string>> = {
      '/': '/',
      '/builder/badge': '/builder/badge',
      '/builder/typing': '/builder/badge',
      '/docs': '/docs',
      '/docs/colors': '/docs',
    };
    for (const page of renderAllPages()) {
      const headerHtml = page.html.slice(0, page.html.indexOf('</header>'));
      const navHrefs = collectGroups(headerHtml, NAV_LINK_RX, 'href');
      expect(navHrefs, page.path).toEqual(['/', '/builder/badge', '/docs']);
      const activeHrefs: string[] = [];
      for (const match of headerHtml.matchAll(NAV_LINK_RX)) {
        if (match.groups?.active) {
          activeHrefs.push(match.groups.href ?? '');
        }
      }
      expect(activeHrefs, page.path).toHaveLength(1);
      const expected = expectedActive[page.path];
      if (expected) {
        expect(activeHrefs[0], page.path).toBe(expected);
      }
      expect(headerHtml, page.path).toContain('<a href="/docs" class="nav-link');
    }
  });

  it('lists every docs page and builder page exactly once in its grouped sidebar with one active link', () => {
    const docsHrefs = DOCS_PAGES.map((page) => buildDocsPath(page.slug));
    const builderHrefs = BUILDER_PAGES.map((page) => buildBuilderPath(page.kind));
    const [firstPage, ...sidebarPages] = renderAllPages();
    const homePage = requireDefined(firstPage, 'the homepage');
    expect(collectGroups(homePage.html, SIDEBAR_LINK_RX, 'href')).toEqual([]);
    expect(homePage.html).not.toContain('class="has-sidebar"');
    expect(homePage.html).not.toContain('popovertarget="sidebar-drawer"');

    for (const page of sidebarPages) {
      const sidebarHrefs = collectGroups(page.html, SIDEBAR_LINK_RX, 'href');
      const expectedHrefs = page.path.startsWith('/builder') ? builderHrefs : docsHrefs;
      expect(sidebarHrefs.toSorted(), page.path).toEqual(expectedHrefs.toSorted());
      const activeMatches = [...page.html.matchAll(SIDEBAR_LINK_RX)].filter(
        (match) => match.groups?.active
      );
      expect(activeMatches, page.path).toHaveLength(1);
      expect(activeMatches[0]?.groups?.href, page.path).toBe(page.path);
      expect(page.html, page.path).toContain('<body class="has-sidebar">');
      // The drawer toggle lives in the sticky header and shows the active page title:
      const headerHtml = page.html.slice(0, page.html.indexOf('</header>'));
      const toggleLabel = SIDEBAR_TOGGLE_RX.exec(headerHtml)?.groups?.label;
      expect(toggleLabel, page.path).toBe(activeMatches[0]?.groups?.label);
    }
  });

  it('chains the docs pager in sidebar order without Home buttons at the ends', () => {
    for (const [i, page] of DOCS_PAGES.entries()) {
      const html = renderDocsHtml(page.slug);
      const pagerHtml = html.slice(html.indexOf('<nav class="pager-row'));
      const previousPage = DOCS_PAGES[i - 1];
      const nextPage = DOCS_PAGES[i + 1];
      if (previousPage) {
        expect(pagerHtml, page.slug).toContain(
          `<a href="${buildDocsPath(previousPage.slug)}" class="btn-secondary" rel="prev" tabindex="0">`
        );
      } else {
        expect(pagerHtml, page.slug).not.toContain('rel="prev"');
        expect(pagerHtml, page.slug).toContain('<nav class="pager-row is-end"');
      }
      if (nextPage) {
        expect(pagerHtml, page.slug).toContain(
          `<a href="${buildDocsPath(nextPage.slug)}" class="btn-primary" rel="next" tabindex="0">`
        );
      } else {
        expect(pagerHtml, page.slug).not.toContain('rel="next"');
      }
    }
  });

  it('references the versioned stylesheet and site script and keeps template placeholders out of the assets', () => {
    const css = getSiteAsset('site.css');
    const script = getSiteAsset('site.js');
    const builderBundle = getSiteAsset('builder.js');
    expect(css?.body.replaceAll(/\?v=[\da-z]+/g, '')).toBe(getSiteStylesheet());
    expect(script?.body).not.toContain('/**');
    expect(builderBundle?.body).not.toContain('/**');
    for (const page of renderAllPages()) {
      expect(page.html, page.path).toContain(
        `<link rel="stylesheet" href="/assets/site.css?v=${css?.version}" />`
      );
      expect(page.html, page.path).toContain(
        `<script src="/assets/site.js?v=${script?.version}" defer></script>`
      );
      expect(page.html, page.path).toContain('<script type="application/json" id="site-config">');
      expect(page.html, page.path).not.toContain('<style>');
    }
    expect(css?.body).not.toContain('${');
    expect(css?.body).toContain('.brand-mark {');
    expect(css?.body).not.toContain('--brand-gradient-start');
    expect(getSiteAsset('__proto__')).toBeUndefined();
  });

  it('serves every bundled Geist and JetBrains Mono NF @font-face binary referenced by the stylesheet', () => {
    const css = getSiteStylesheet();
    expect(css).toContain("--font-sans: 'Geist',");
    expect(css).toContain("--font-mono: 'JetBrains Mono NF',");
    expect(css).toContain('font-variant-ligatures: none;');
    expect(css).not.toContain("'liga' 1");
    expect(css).toMatch(/body \{[^}]*font-family: var\(--font-sans\);/);
    const fontNames = collectGroups(css, /url\(['"]\/assets\/(?<name>[\w-]+\.ttf)['"]\)/g, 'name');
    expect(fontNames).toEqual([
      'Geist-Regular.ttf',
      'Geist-Medium.ttf',
      'Geist-SemiBold.ttf',
      'Geist-SemiBoldItalic.ttf',
      'Geist-Bold.ttf',
      'JetBrainsMono-Regular.ttf',
      'JetBrainsMono-Bold.ttf',
    ]);
    const servedCss = getSiteAsset('site.css')?.body ?? '';
    for (const fontName of fontNames) {
      const asset = getSiteAsset(fontName);
      expect(asset?.contentType, fontName).toBe('font/ttf');
      expect(asset?.body, fontName).toBeInstanceOf(ArrayBuffer);
      expect((asset?.body as ArrayBuffer | undefined)?.byteLength, fontName).toBeGreaterThan(
        100_000
      );
      expect(servedCss, fontName).toContain(`/assets/${fontName}?v=${asset?.version}`);
    }
    expect(getSiteAsset('JetBrainsMono-Italic.ttf')).toBeUndefined();
    expect(getSiteAsset('JetBrainsMono-BoldItalic.ttf')).toBeUndefined();
  });
});

/********************************** Docs drift guards ***********************************/

describe('documentation drift guards', () => {
  it('lists every metric and metric alias of every registered service in the generated services table', () => {
    const servicesHtml = renderDocsHtml('services');
    for (const [key, service] of Object.entries(SERVICES_CONFIG)) {
      const listed = collectListedMetrics(extractServiceRow(servicesHtml, key));
      expect(listed.metrics.toSorted(), key).toEqual(Object.keys(service.metrics).toSorted());
      expect(listed.aliases.toSorted(), key).toEqual(
        listServiceMetricAliases(service)
          .map(([alias]) => alias)
          .toSorted()
      );
    }
  });

  it('documents and showcases pulsing status dots (?dot=) and all theme colors', () => {
    const badgesHtml = renderDocsHtml('badges');
    for (const dotColor of ['green', 'amber', 'orange', 'red', 'sky', 'violet', 'slate']) {
      expect(badgesHtml, dotColor).toContain(
        `<span class="hl-key">&amp;dot=</span><span class="hl-val">${dotColor}</span>`
      );
    }
    expect(badgesHtml).toContain(`(${THEME_COLOR_NAMES.length} colors)`);
    expect(badgesHtml).toContain('Accepts any theme color or none');
  });

  it('documents the full ?anim= grammar and ?special= limits read from the parser', () => {
    const badgesHtml = renderDocsHtml('badges');
    for (const token of ICON_MOTION_TOKENS) {
      expect(badgesHtml, token).toContain(`<span class="param-sep"> | </span>${token}`);
    }
    expect(badgesHtml).toContain('&lt;left&gt;,&lt;right&gt;');
    expect(badgesHtml).toContain('sheen,&lt;left&gt;,&lt;right&gt;');
    expect(badgesHtml).toContain(`2 to ${MAX_SPARKLINE_POINTS} comma- or space-separated numbers`);
    expect(badgesHtml).toContain(`up to ${MAX_STRIP_TICKS} ticks`);
    expect(badgesHtml).toContain('bar:92:static');
  });

  it('documents every icon slug alias and the unknown-icon fallback', () => {
    const iconsHtml = renderDocsHtml('icons');
    for (const [alias, canonical] of Object.entries(ICON_SLUG_ALIASES)) {
      expect(iconsHtml, alias).toContain(
        `<code class="param-code">${alias}</code><span class="alias-arrow" aria-hidden="true">→</span><span class="visually-hidden"> resolves to </span><code class="param-code">${canonical}</code>`
      );
    }
    expect(iconsHtml).toContain(`unknown slugs fall back to ${FALLBACK_ICON_SLUG}`);
    expect(iconsHtml).toContain('Per-icon pairs apply their first motion');
  });

  it('documents stack query aliases, ?anim=, the computed group gap default, and shares the homepage stack example', () => {
    const stackHtml = renderDocsHtml('stack');
    expect(stackHtml).toContain(
      ':groups<span class="param-sep"> / </span>?groups=<span class="param-sep"> / </span>?icons=<span class="param-sep"> / </span>?i='
    );
    expect(stackHtml).toContain(
      '?gap=<span class="param-sep"> / </span>?groupgap=<span class="param-sep"> / </span>?ggap='
    );
    expect(stackHtml).toContain(`round(gap × ${GROUP_GAP_RATIO})`);
    expect(stackHtml).toMatch(/<th scope="row" role="rowheader">\?anim=<\/th>/);
    expect(stackHtml).toContain(
      `<span class="hl-url">${SITE_ORIGIN}/stack</span><span class="hl-path">/${STACK_EXAMPLE_GROUPS}</span>`
    );
    expect(renderHomeHtml()).toContain(
      `<span class="hl-url">${SITE_ORIGIN}/stack</span><span class="hl-path">/${STACK_EXAMPLE_GROUPS}</span>`
    );
  });

  it('documents quote text/author aliases, layout aliases, ?anim=, and the single-segment route in unified parameter order', () => {
    const quotesHtml = renderDocsHtml('quotes');
    const orderedRows = [
      '?text=<span class="param-sep"> / </span>?quote=',
      '?author=',
      '?layout=<span class="param-sep"> / </span>?type=',
      '?center=',
      '?variant=',
      '?color=',
      '?size=',
      '?width=',
      '?anim=',
    ];
    let lastRowIndex = -1;
    for (const name of orderedRows) {
      const marker = `<th scope="row" role="rowheader">${name}</th>`;
      const rowIndex = quotesHtml.indexOf(marker);
      expect(rowIndex, name).toBeGreaterThan(lastRowIndex);
      lastRowIndex = rowIndex;
    }
    expect(quotesHtml).toContain('<span class="route-method">GET</span>/quote/:text</code>');
  });

  it('documents typing query aliases, container layouts, cursor shapes, erase modes, and the two-segment route in unified parameter order', () => {
    const typingHtml = renderDocsHtml('typing');
    const orderedRows = [
      ':prefix<span class="param-sep"> / </span>:lines',
      '?lines=<span class="param-sep"> / </span>?text=',
      '?prefix=<span class="param-sep"> / </span>?prompt=',
      '?layout=<span class="param-sep"> / </span>?frame=<span class="param-sep"> / </span>?type=',
      '?variant=',
      '?color=',
      '?font=',
      '?size=',
      '?width=',
      '?align=<span class="param-sep"> / </span>?center=',
      '?title=',
      '?icon=',
      '?hint=',
      '?cursor=',
      '?erase=<span class="param-sep"> / </span>?delete=',
      '?typo=',
      '?duration=',
      '?pause=',
      '?anim=',
    ];
    let lastRowIndex = -1;
    for (const name of orderedRows) {
      const marker = `<th scope="row" role="rowheader">${name}</th>`;
      const rowIndex = typingHtml.indexOf(marker);
      expect(rowIndex, name).toBeGreaterThan(lastRowIndex);
      lastRowIndex = rowIndex;
    }
    expect(typingHtml).toContain(
      '<span class="route-method">GET</span>/typing/:prefix/:lines</code>'
    );
  });

  it('computes every headline count instead of hard-coding it and keeps internal jargon out of user-facing copy', () => {
    const homeHtml = renderHomeHtml();
    const iconCounts = getIconSetCounts();
    expect(iconCounts.lucide).toBeGreaterThan(1000);
    expect(iconCounts.brand).toBeGreaterThan(1000);
    expect(homeHtml).toContain(`${THEME_COLOR_NAMES.length} Theme Colors`);
    expect(homeHtml).toContain(`${formatCountLowerBound(iconCounts.lucide)} UI icons`);
    expect(homeHtml).toContain(
      `${formatCountLowerBound(iconCounts.lucide + iconCounts.brand)} Icons`
    );
    expect(homeHtml).toContain(`${Object.keys(SERVICES_CONFIG).length} Live Services`);
    expect(homeHtml).toContain('Six Unified Endpoints');
    expect(countOccurrences(homeHtml, '<span class="route-method">GET</span>')).toBe(
      getEndpointRoutes().length
    );
    expect(homeHtml).not.toContain('OKLCH');
    expect(homeHtml).not.toContain('Simple Icons');
    expect(renderDocsHtml('icons')).toContain(
      `${formatCountLowerBound(iconCounts.brand)} brand &amp; technology logos`
    );
    expect(formatCountLowerBound(1890)).toBe('1,800+');
  });

  it('uses path-only route pills on every page', () => {
    for (const page of renderAllPages()) {
      expect(page.html, page.path).not.toMatch(
        /<span class="route-method">GET<\/span>(?:https?:\/\/|svg\.xul\.is)/
      );
    }
  });
});

/********************************* Website regressions **********************************/

describe('website client scripts & markup regressions', () => {
  it('places fallback popovers from their measured size inside the viewport (regression: hard-coded 420/380 sizes)', () => {
    const { computePopoverPlacement } = loadSiteCore();
    const viewport = { height: 700, width: 1000 };
    const anchor = { bottom: 630, left: 900, right: 960, top: 600, width: 60 };
    expect(computePopoverPlacement(anchor, { height: 452, width: 384 }, viewport, {})).toEqual({
      left: 608,
      minWidth: undefined,
      top: 140,
    });
    expect(
      computePopoverPlacement(anchor, { height: 200, width: 176 }, viewport, { align: 'end' })
    ).toEqual({ left: 784, minWidth: undefined, top: 392 });
    const lowAnchor = { bottom: 40, left: 10, right: 210, top: 10, width: 200 };
    expect(
      computePopoverPlacement(lowAnchor, { height: 120, width: 150 }, viewport, {
        gap: 4,
        isWidthMatched: true,
      })
    ).toEqual({ left: 10, minWidth: 200, top: 44 });
    expect(computePopoverPlacement(lowAnchor, { height: 690, width: 150 }, viewport, {}).top).toBe(
      8
    );
    const wideAnchor = { bottom: 40, left: 4, right: 396, top: 10, width: 392 };
    expect(
      computePopoverPlacement(
        wideAnchor,
        { height: 120, width: 392 },
        { height: 600, width: 320 },
        { isWidthMatched: true }
      ).minWidth
    ).toBe(304);
  });

  it('keeps the theme-color meta tags in sync with the manual scheme override (regression: system color only)', () => {
    const html = renderHomeHtml();
    const script = readSiteScript();
    const config = JSON.parse(
      /<script type="application\/json" id="site-config">(?<json>[^<]*)<\/script>/.exec(html)
        ?.groups?.json ?? '{}'
    ) as { drawerMediaQuery?: string; themeColors?: Record<string, string> };
    expect(config.themeColors).toEqual({ dark: DARK_BG, light: LIGHT_BG });
    expect(html.indexOf('name="theme-color"')).toBeLessThan(html.indexOf('<script>try{'));
    expect(html).toContain(
      `document.querySelectorAll('meta[name="theme-color"]').forEach(function(meta){meta.content=`
    );
    expect(script).toContain(
      'themeColorMeta.content = siteConfig.themeColors[storedScheme ?? mediaScheme]'
    );
  });

  it('keeps the sidebar keyboard-focusable on wide screens, turns it into a popover drawer on narrow screens, and restores focus on close (regressions)', () => {
    const html = renderDocsHtml('badges');
    const drawerHtml = html.slice(html.indexOf('<aside class="sidebar" id="sidebar-drawer">'));
    expect(drawerHtml).toMatch(
      /^<aside class="sidebar" id="sidebar-drawer">\s*<button type="button" class="sidebar-close" popovertarget="sidebar-drawer" popovertargetaction="hide" aria-label="Close /
    );
    expect(html).toContain(
      'class="sidebar-toggle" popovertarget="sidebar-drawer" aria-expanded="false"'
    );
    expect(html).not.toContain('<aside class="sidebar" id="sidebar-drawer" popover>');
    expect(html).toContain('"drawerMediaQuery":"(max-width: 960px)"');
    const script = readSiteScript();
    expect(script).toContain("sidebarDrawer.setAttribute('popover', '')");
    expect(script).toContain("sidebarDrawer.removeAttribute('popover')");
    expect(script).toContain("drawerQuery.addEventListener('change', syncSidebarDrawer)");
    expect(script).toContain("element.toggleAttribute('inert', isInert)");
    expect(script).toContain("sidebarToggle?.setAttribute('aria-expanded'");
    expect(script).toContain('sidebarToggle.focus()');
    expect(getSiteStylesheet()).toContain('body:has(.sidebar:where(:popover-open, .is-open))');
    expect(getSiteStylesheet()).not.toContain('content-visibility: auto');
  });

  it('disables code scroll buttons natively and follows drawer width changes without window listeners (regressions)', () => {
    const script = readSiteScript();
    expect(script).toContain('leftButton.disabled =');
    expect(script).toContain('rightButton.disabled =');
    expect(script).not.toContain('is-disabled');
    expect(script).toContain('new ResizeObserver(');
    expect(script).not.toContain("addEventListener('resize'");
    expect(script).not.toContain('setTimeout(() => updateScrollButtons');
    expect(script).not.toContain('.code-output');
    expect(script).not.toContain('`null` when unavailable');
  });

  it('exposes the shared clipboard and popover helpers for the builder script', () => {
    const script = readSiteScript();
    expect(script).toMatch(
      /globalThis\.svgSite = \{\s*closePopover,\s*copyText,\s*isPopoverOpen,\s*openPopover,\s*placePopover,?\s*\};/
    );
    expect(script).toContain("button.querySelector('[data-copy-label]')");
    expect(script).not.toContain('hasAnchorPositioning');
  });

  it('emits repeated UI icons once per page as sprite symbols referenced with <use>', () => {
    for (const page of renderAllPages()) {
      expect(countOccurrences(page.html, '<svg class="ui-sprite"'), page.path).toBe(1);
      expect(countOccurrences(page.html, '<symbol id="ui-copy"'), page.path).toBe(1);
    }
    const badgesHtml = renderDocsHtml('badges');
    expect(countOccurrences(badgesHtml, '<use href="#ui-copy"></use>')).toBeGreaterThan(5);
    expect(countOccurrences(badgesHtml, '<use href="#ui-chevron-right"></use>')).toBeGreaterThan(5);
  });

  it('drops unstyled class names from the markup and uses the shared popover and grid classes', () => {
    for (const page of renderAllPages()) {
      expect(page.html, page.path).not.toMatch(DEAD_CLASS_RX);
    }
    const docsHtml = renderDocsHtml('buttons');
    expect(docsHtml).toContain('<div class="card-grid is-3col">');
    const builderHtml = renderBuilderHtml('badge');
    expect(builderHtml).toContain('class="popover-panel select-menu"');
    expect(builderHtml).toContain('class="popover-panel icon-picker"');
    expect(renderBuilderHtml('stack')).toContain('class="popover-panel stack-help-popover"');
  });

  it('documents variant tiers, widget examples, sizes, quote widths, and alias rules from shared sources (docs drift)', () => {
    const badgesHtml = renderDocsHtml('badges');
    expect(badgesHtml).toContain(`Hierarchy tier: ${formatVariantTierSummary()}.`);
    for (const example of formatSpecialExamples().split(' | ')) {
      expect(badgesHtml, example).toContain(escapeXml(example));
    }
    const buttonsHtml = renderDocsHtml('buttons');
    expect(buttonsHtml).toContain(`Button Size Scale (?size=${SIZE_TOKENS.join('|')})`);
    expect(buttonsHtml).toContain('Open “Discussions Join” in the Builder');
    const quotesHtml = renderDocsHtml('quotes');
    expect(quotesHtml).toContain('The default grows proportionally with text sizes');
    expect(quotesHtml).toContain('Only read when ?layout= and ?type= are empty.');
    const stackHtml = renderDocsHtml('stack');
    expect(stackHtml).toContain('then ?groups=, ?icons=, and ?i= (empty values fall through)');
    expect(renderDocsHtml('overview')).toContain('Unknown query parameters are ignored per route');
  });

  it('renders the homepage and every documentation page containing variants, service registries, and syntax-highlighted Markdown snippets', () => {
    const homeHtml = renderHomeHtml();
    const docsBySlug = new Map(DOCS_PAGES.map((page) => [page.slug, renderDocsHtml(page.slug)]));

    for (const html of [homeHtml, ...docsBySlug.values()]) {
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).not.toContain('<span>');
      expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(html).toContain(
        'Found a bug, have a suggestion, or missing a service preset? Open an'
      );
      expect(html).toContain(`href="${REPO_GITHUB_URL}"`);
      expect(html).toContain(`href="${REPO_GITHUB_URL}/issues"`);
      expect(html).toContain(`href="${REPO_GITHUB_URL}/pulls"`);
      expect(html).toContain(`href="${REPO_GITHUB_URL}/blob/main/LICENSE"`);
      expect(html).toContain(`href="${AUTHOR_WEBSITE_URL}"`);
      expect(html).not.toContain('mailto:');
    }

    expect(docsBySlug.get('badges')).toContain(
      '<code class="card-title-code">variant=1</code><span class="card-title-text">Primary Badge</span><span class="card-title-pill">Default</span>'
    );
    expect(docsBySlug.get('buttons')).toContain(
      '<code class="card-title-code">variant=3</code><span class="card-title-text">Tertiary Button</span>'
    );
    expect(docsBySlug.get('services')).toContain(
      '<span class="card-title-text">PyPI &amp; ClickPy</span><code class="card-title-meta">/badge/pypi/:pkg/:metric</code>'
    );
    expect(docsBySlug.get('services')).toContain(
      '<span class="card-title-text">npm Registry</span><code class="card-title-meta">/badge/npm/:pkg/:metric</code>'
    );
    expect(docsBySlug.get('services')).toContain(
      '<span class="card-title-text">Open VSX Registry</span><code class="card-title-meta">/badge/ovsx/:namespace/:ext/:metric</code>'
    );
    expect(docsBySlug.get('services')).toContain(
      '<span class="card-title-text">Crates.io, docs.rs &amp; Docker Hub</span><code class="card-title-meta">/badge/crates/*</code><code class="card-title-meta">/badge/docsrs/*</code><code class="card-title-meta">/badge/docker/*</code>'
    );
    expect(docsBySlug.get('icons')).toContain(
      '<span class="route-method">GET</span>/icon/:icon</code>'
    );
    expect(docsBySlug.get('stack')).toContain(
      '<span class="route-method">GET</span>/stack/:groups</code>'
    );
    expect(docsBySlug.get('typing')).toContain(
      '<span class="route-method">GET</span>/typing/:lines</code>'
    );
    expect(docsBySlug.get('quotes')).toContain(
      '<span class="route-method">GET</span>/quote/:author/:text</code>'
    );
    expect(docsBySlug.get('colors')).toContain(`${THEME_COLOR_NAMES.length} Theme Colors`);
  });

  it('documents the exact numeric ranges enforced by the renderers', () => {
    const iconsHtml = renderDocsHtml('icons');
    expect(iconsHtml).toContain(
      `${ICON_SIZE_RANGE.min}<span class="param-sep"> to </span>${ICON_SIZE_RANGE.max}`
    );
    expect(iconsHtml).toContain(`${ICON_STROKE_RANGE.default}</code>`);
    const stackHtml = renderDocsHtml('stack');
    expect(stackHtml).toContain(
      `${STACK_GROUP_GAP_RANGE.min}<span class="param-sep"> to </span>${STACK_GROUP_GAP_RANGE.max}`
    );
    const typingHtml = renderDocsHtml('typing');
    for (const range of [
      TYPING_FONT_SIZE_RANGE,
      TYPING_DURATION_RANGE,
      TYPING_PAUSE_RANGE,
      TYPING_WIDTH_RANGE,
    ]) {
      expect(typingHtml).toContain(`${range.min}<span class="param-sep"> to </span>${range.max}`);
    }
  });
});

/*********************************** Site stylesheet ************************************/

describe('site stylesheet', () => {
  it('only references defined --c-* tokens (regression: .brand-mark used the undefined --c-btn-brand-text)', () => {
    const css = getSiteStylesheet();
    const defined = new Set(collectGroups(css, COLOR_TOKEN_DEFINITION_RX, 'name'));
    const undefinedTokens = collectGroups(css, COLOR_TOKEN_USAGE_RX, 'name').filter(
      (name) => !defined.has(name)
    );
    expect(undefinedTokens).toEqual([]);
    expect(css).toMatch(/\.brand-mark \{[^}]*inline-size: 26px;[^}]*block-size: 26px;/);
    expect(css).not.toContain('--c-btn-brand-text');
  });

  it('drops the removed tokens and unused legacy brand gradient stops', () => {
    const css = getSiteStylesheet();
    for (const removed of [
      '--c-bg-alt',
      '--c-brand-3',
      '--base-brand',
      '--c-border-subtle',
      '--brand-gradient-start',
      '--brand-gradient-end',
    ]) {
      expect(css, removed).not.toContain(removed);
    }
  });

  it('hides [hidden] elements with exactly one global rule', () => {
    const css = getSiteStylesheet();
    expect(countOccurrences(css, '[hidden]')).toBe(1);
    expect(css).toMatch(/\[hidden\] \{\s*display: none !important;\s*\}/);
  });

  it('offsets in-page anchors below the sticky header with root scroll padding instead of per-element scroll margins', () => {
    const css = getSiteStylesheet();
    expect(css).not.toContain('scroll-margin-block-start');
    expect(css).toMatch(
      /:root \{[^}]*scroll-padding-block-start: calc\(var\(--header-height\) \+ 32px\);/
    );
  });

  it('shares one elevated popover panel base for every popover', () => {
    const css = getSiteStylesheet();
    expect(css).toMatch(
      /\.popover-panel \{[^}]*background: color-mix\(in srgb, var\(--c-bg-elv\) 78%, transparent\);[^}]*backdrop-filter: blur\(16px\);/
    );
    expect(css).toContain('.popover-panel:where(:popover-open, .is-open) {');
    expect(css).toContain('.popover-panel:not(:where(:popover-open, .is-open)) {');
    for (const popover of ['.select-menu', '.icon-picker', '.stack-help-popover']) {
      expect(css, popover).not.toContain(`${popover}:where(:popover-open, .is-open) {`);
    }
  });

  it('colors errors, validation messages, and invalid input borders with --c-danger and keeps --c-hl-path for syntax highlighting', () => {
    const css = getSiteStylesheet();
    expect(css).toContain(
      `--c-danger: light-dark(${ISOLUX_UI.error.light}, ${ISOLUX_UI.error.dark});`
    );
    expect(css).toContain(
      `--c-hl-path: light-dark(${ISOLUX_SYNTAX.stringLifted.light}, ${ISOLUX_SYNTAX.stringLifted.dark});`
    );
    expect(css).toContain(
      `--c-hl-key: light-dark(${ISOLUX_SYNTAX.function.light}, ${ISOLUX_SYNTAX.function.dark});`
    );
    expect(css).toContain(
      `--c-hl-val: light-dark(${ISOLUX_SYNTAX.property.light}, ${ISOLUX_SYNTAX.property.dark});`
    );
    expect(css).toContain(
      `--c-hl-href: light-dark(${ISOLUX_SYNTAX.label.light}, ${ISOLUX_SYNTAX.label.dark});`
    );
    expect(css).not.toContain('--c-warning');
    expect(css).toMatch(
      /\.copy-btn\.is-failed,\s*\.btn-secondary\.is-failed \{[^}]*color: var\(--c-danger\);/
    );
    expect(css).toMatch(/\.builder-hint\.is-warning \{\s*color: var\(--c-danger\);/);
    expect(css).toMatch(/\.builder-status\.is-warning \{\s*color: var\(--c-danger\);/);
    expect(css).toMatch(
      /\.icon-input\.is-invalid \.icon-select-trigger,\s*\.builder-field:is\(\.is-invalid, \.is-missing\) :is\(\.builder-input, \.stack-catalog-wrap\) \{\s*border-color: var\(--c-danger\);/
    );
    expect(countOccurrences(css, 'var(--c-hl-path)')).toBe(1);
    expect(css).toMatch(/\.hl-path \{\s*color: var\(--c-hl-path\);/);
  });

  it('turns the 3-column card grid into an .is-3col modifier and styles native disabled scroll buttons', () => {
    const css = getSiteStylesheet();
    expect(css).not.toContain('.card-grid-3');
    expect(css).toContain('.card-grid.is-3col {');
    expect(css).not.toContain('.is-disabled');
    expect(css).not.toContain('.code-drawer-body:focus-within');
    expect(css).toMatch(
      /\.scroll-btn:disabled,\s*\.copy-btn:disabled \{[^}]*backdrop-filter: blur\(5px\);/
    );
  });

  it('merges every reduced-motion override into a single media block', () => {
    expect(countOccurrences(getSiteStylesheet(), '@media (prefers-reduced-motion: reduce)')).toBe(
      1
    );
  });

  it('keeps preview hover effects and color swatch focus rings working across touchscreen laptops (regressions: @media (hover: hover), pointer-events: none, invisible swatch focus)', () => {
    const css = getSiteStylesheet();
    expect(css).not.toContain('@media (hover:');
    expect(css).not.toContain('@media (any-hover:');
    expect(css).not.toMatch(/\.preview-stage svg \{[^}]*pointer-events: none;/);
    expect(css).toMatch(
      /\.preview-link:hover::after,\s*\.preview-link:focus-visible::after \{\s*opacity: 1;\s*\}/
    );
    expect(css).toMatch(
      /\.preview-stage:has\(\.preview-link:hover\) \.preview-link:not\(:hover\),\s*\.preview-stage:has\(\.preview-link:focus-visible\) \.preview-link:not\(:focus-visible\) \{\s*opacity: 0\.45;\s*\}/
    );
    expect(css).toMatch(
      /\.swatch-grid:has\(\.swatch-input:focus-visible\) \.swatch-input:not\(:checked\) \+ \.swatch-dot \{/
    );
    expect(css).toMatch(/\.section-title-row \{[^}]*justify-content: space-between;/);
  });

  it('meets WCAG 2.2 AA 24px minimum target sizes, preserves High Contrast swatches, and keeps mobile anchor links at full contrast', () => {
    const css = getSiteStylesheet();
    expect(css).toMatch(/\.theme-switch \{[^}]*inline-size: 42px;\s*block-size: 24px;/);
    expect(css).toMatch(/\.gh-link \{[^}]*inline-size: 24px;\s*block-size: 24px;/);
    expect(css).toMatch(/\.bg-toggle \{[^}]*inline-size: 24px;\s*block-size: 24px;/);
    expect(css).toMatch(/\.anchor-link \{[^}]*min-inline-size: 24px;\s*min-block-size: 24px;/);
    expect(css).toMatch(
      /@media \(max-width: 640px\) \{\s*\.anchor-link \{\s*opacity: 1;\s*\}\s*\}/
    );
    expect(css).toMatch(
      /\.scroll-btn \{\s*display: none;\s*inline-size: 18px;\s*block-size: 18px;\s*border-radius: 5px;/
    );
    expect(css).toMatch(/\.scroll-btn::before \{[^}]*inset: -3px;/);
    expect(css).toMatch(/\.scroll-btn-left \{\s*inset-inline-start: 5px;\s*\}/);
    expect(css).toMatch(/\.scroll-btn-right \{\s*inset-inline-start: 29px;\s*\}/);
    expect(css).toMatch(
      /\.typing-line-handle \{[^}]*-webkit-user-select: none;\s*user-select: none;/
    );
    expect(css).toMatch(/\.swatch-dot \{\s*inline-size: 24px;\s*block-size: 24px;/);
    expect(css).toMatch(/\.help-btn::before \{[^}]*inset: -3px;/);
    expect(css).toMatch(
      /@media \(forced-colors: active\) \{\s*\.swatch-dot,\s*\.select-swatch,\s*\.anatomy-swatch,\s*\.bg-swatch \{\s*forced-color-adjust: none;\s*\}\s*\}/
    );
  });

  it('pins a compact focus-free live preview above the form on single-column builder viewports while keeping snippets below', () => {
    const css = getSiteStylesheet();
    expect(css).toMatch(
      /@media \(max-width: 1200px\) \{[\s\S]*?\.builder-grid \{[\s\S]*?grid-template-areas:\s*'preview'\s*'form'\s*'output';/
    );
    expect(css).toMatch(
      /\.builder-preview-dock \{[^}]*position: sticky;\s*inset-block-start: var\(--header-height\);[^}]*container-name: builder-preview;\s*container-type: scroll-state;/
    );
    expect(css).toContain('@container builder-preview scroll-state(stuck: top) {');
    expect(css).toContain('max-block-size: min(22dvh, 148px);');

    for (const page of BUILDER_PAGES) {
      const html = renderBuilderHtml(page.kind);
      const dockMatch =
        /<div class="builder-preview-dock">(?<dock>[\s\S]*?)<\/div>\s*<div class="builder-output">/.exec(
          html
        );
      const dockHtml = requireDefined(dockMatch?.groups?.dock, `${page.kind} preview dock`);
      expect(dockHtml, page.kind).toContain('id="builder-preview"');
      expect(dockHtml, page.kind).toContain('id="builder-status"');
      // Keep the visually reordered preview dock free of focusable elements so Tab order stays top-to-bottom:
      expect(dockHtml, page.kind).not.toMatch(/<(?:a|button|input|select|textarea)\b|tabindex=/);
    }
  });

  it('protects asterisks inside inline code spans, serializes string popover attributes, marks variant=3 as the /docs/typing default, and rasterizes <circle> inside <g> (regressions: code-span asterisks became <strong>, string popover coerced to bare popover, /docs/typing wrong variant marked default, missing sparkles <circle> in og.png)', () => {
    expect(formatInlineMarkupHtml('Match `**glob**` with **care**')).toBe(
      'Match <code>**glob**</code> with <strong>care</strong>'
    );

    expect(jsx('div', { popover: 'manual' }).rawHtml).toBe('<div popover="manual"></div>');
    expect(jsx('div', { popover: true }).rawHtml).toBe('<div popover></div>');
    expect(jsx('div', { popover: false }).rawHtml).toBe('<div></div>');

    const typingDocsHtml = renderDocsHtml('typing');
    expect(typingDocsHtml).toContain(
      '<span class="card-title-text">Tertiary Neutral + Underscore Cursor</span><span class="card-title-pill">Default</span>'
    );
    expect(typingDocsHtml).not.toContain(
      '<span class="card-title-text">Secondary Tinted + Block Cursor</span><span class="card-title-pill">Default</span>'
    );
    expect(typingDocsHtml).not.toContain(
      '<span class="card-title-text">Primary Brand Gradient</span><span class="card-title-pill">Default</span>'
    );

    // `<circle>` inside `<g>` must paint onto the OG canvas instead of being ignored:
    const emptyGroupPng = rasterizeOgSvgToPng(
      '<svg width="16" height="16"><rect width="16" height="16" fill="#000000" /><g transform="translate(2, 2)" stroke="#FFFFFF" stroke-width="2"></g></svg>',
      16,
      16,
      '00'
    );
    const circleGroupPng = rasterizeOgSvgToPng(
      '<svg width="16" height="16"><rect width="16" height="16" fill="#000000" /><g transform="translate(2, 2)" stroke="#FFFFFF" stroke-width="2"><circle cx="6" cy="6" r="4" /></g></svg>',
      16,
      16,
      '00'
    );
    expect(circleGroupPng.equals(emptyGroupPng)).toBe(false);

    // `rasterizeSvgToRgbaPng` preserves alpha transparency outside painted shapes while painting opaque fills:
    const centeredCircleRgba = rasterizeSvgToRgbaPng(
      '<svg width="16" height="16" viewBox="0 0 32 32"><circle cx="16" cy="16" r="8" fill="#00E5FF" /></svg>',
      16,
      16,
      '00'
    );
    const cornerCircleRgba = rasterizeSvgToRgbaPng(
      '<svg width="16" height="16" viewBox="0 0 32 32"><circle cx="0" cy="0" r="8" fill="#00E5FF" /></svg>',
      16,
      16,
      '00'
    );
    expect(centeredCircleRgba[25]).toBe(6); // RGBA color type.
    expect(inflateIdatScanlines(centeredCircleRgba)[4]).toBe(0);
    expect(inflateIdatScanlines(cornerCircleRgba)[4]).toBe(255);

    // `rasterizeOgSvgToPng` composites inline `data:image/png;base64,…` `<image>` primitives onto the canvas:
    const tinyCyanPng = encodeRgbaPng(
      2,
      2,
      new Uint8Array([0, 229, 255, 255, 0, 229, 255, 255, 0, 229, 255, 255, 0, 229, 255, 255]),
      '00'
    );
    const compositedPng = rasterizeOgSvgToPng(
      `<svg width="8" height="8"><rect width="8" height="8" fill="#000000" /><image x="2" y="2" width="4" height="4" href="data:image/png;base64,${tinyCyanPng.toString('base64')}" /></svg>`,
      8,
      8,
      '00'
    );
    const decodedComposited = decodePngToRgba(compositedPng);
    expect(decodedComposited.pixels[0]).toBe(0);
    expect(decodedComposited.pixels[(3 * 8 + 3) * 4 + 1]).toBeGreaterThan(200);

    // Multi-stop `<linearGradient>` interpolates intermediate stops instead of skipping straight from first to last:
    const gradients = parseGradientDefs(
      '<defs><linearGradient id="g" x1="0" y1="0" x2="100" y2="0"><stop offset="0%" stop-color="#000000" /><stop offset="50%" stop-color="#FF0000" /><stop offset="100%" stop-color="#000000" /></linearGradient></defs>'
    );
    const midpointPaint = evaluatePaint('url(#g)', gradients, 50, 0);
    expect(midpointPaint?.[0]).toBeGreaterThan(200);
    expect(midpointPaint?.[1]).toBe(0);

    // Smooth curves (`S`, `T`) and packed arc flags (`a5 5 0 015 5`) flatten without dropping segments:
    const flattened = flattenSvgPath('M0 0 C2 0 4 2 6 2 S10 0 12 0 Q14 2 16 0 T20 0 a5 5 0 015 5');
    expect(flattened[0]?.points.length).toBeGreaterThan(20);
  });

  it('preserves string values on HTML boolean-capable attributes, guards prototype attribute names, scopes legacy color overrides under @supports not, and uses concise BreadcrumbList item names (regressions: boolean attribute dropped string value, :root:has overrode light-dark())', () => {
    expect(jsx('div', { hidden: 'until-found' }).rawHtml).toBe('<div hidden="until-found"></div>');
    expect(jsx('div', { hidden: true }).rawHtml).toBe('<div hidden></div>');
    expect(jsx('div', { hidden: '' }).rawHtml).toBe('<div hidden></div>');
    expect(jsx('div', { hidden: false }).rawHtml).toBe('<div></div>');
    expect(jsx('div', { draggable: true }).rawHtml).toBe('<div draggable="true"></div>');
    expect(jsx('div', { constructor: 'safe' }).rawHtml).toBe('<div constructor="safe"></div>');

    const css = getSiteStylesheet();
    expect(css).toContain('@supports not (color: light-dark(white, black)) {');
    const beforeSupportsIndex = css.indexOf('@supports (color: light-dark(white, black))');
    expect(beforeSupportsIndex).toBeGreaterThan(0);
    expect(css.slice(0, beforeSupportsIndex)).not.toContain('--c-text-3:');

    const badgesDocsHtml = renderDocsHtml('badges');
    expect(badgesDocsHtml).toContain('"name":"Static Badges","position":3');
    const badgeBuilderHtml = renderBuilderHtml('badge');
    expect(badgeBuilderHtml).toContain('"name":"Badge Builder","position":2');
  });

  it('resolves every concrete SVG example path in docs, resets closed OG subpaths after Z, and toggles theme/preview switches when localStorage is blocked (regressions: 3-segment /typing example returned 404, post-closepath coordinates polluted closed subpath, blocked localStorage froze theme and preview toggles)', () => {
    // [1] Every concrete `/badge/…`, `/typing/…`, etc. code example in docs resolves without `404`:
    let checkedExamples = 0;
    for (const page of DOCS_PAGES) {
      const html = renderDocsHtml(page.slug);
      for (const match of html.matchAll(INLINE_SVG_ROUTE_CODE_RX)) {
        const rawCodePath = (match.groups?.path ?? '').replaceAll('&amp;', '&');
        const pathnamePart = rawCodePath.split('?')[0] ?? '';
        const isPlaceholderPattern =
          pathnamePart.includes(':') ||
          pathnamePart.includes('*') ||
          pathnamePart.includes('[') ||
          pathnamePart.includes('<') ||
          rawCodePath.includes('<');
        if (!isPlaceholderPattern) {
          checkedExamples += 1;
          expect(
            resolveSvgRequest(new URL(rawCodePath, SITE_ORIGIN)),
            `${page.slug}: ${rawCodePath}`
          ).toBeDefined();
        }
      }
    }
    expect(checkedExamples).toBeGreaterThan(0);

    // [2] `flattenSvgPath` resets `command` and `currentSubpath` after `Z` instead of mutating the closed polygon:
    const closedWithStrayCoords = flattenSvgPath('M0 0 H10 V10 Z 20 20');
    expect(closedWithStrayCoords).toHaveLength(1);
    expect(closedWithStrayCoords[0]?.points).toHaveLength(4);

    const closedPlusLine = flattenSvgPath('M0 0 H10 V10 Z L30 20');
    expect(closedPlusLine).toHaveLength(2);
    expect(closedPlusLine[0]?.isClosed).toBe(true);
    expect(closedPlusLine[0]?.points).toHaveLength(4);
    expect(closedPlusLine[1]?.isClosed).toBe(false);
    expect(closedPlusLine[1]?.points).toEqual([
      [0, 0],
      [30, 20],
    ]);

    // [3] Theme and preview-bg switches keep toggling back and forth when `localStorage` throws:
    const schemeMeta = { content: 'light dark' };
    const themeToggle = createFakeSwitchButton();
    const previewBgToggle = createFakeSwitchButton();
    const rootAttributes = new Map<string, string>();
    const fakeRoot = {
      clientWidth: 1280,
      getAttribute: (name: string) => rootAttributes.get(name),
      hasAttribute: (name: string) => rootAttributes.has(name),
      removeAttribute: (name: string) => {
        rootAttributes.delete(name);
      },
      setAttribute: (name: string, value: string) => {
        rootAttributes.set(name, value);
      },
    };
    const fakeMediaQuery = { addEventListener: () => undefined, matches: false };
    const siteConfigJson = JSON.stringify({
      drawerMediaQuery: '(max-width: 960px)',
      previewBgStorageKey: 'preview-bg',
      previewBgValues: ['auto', 'inverse'],
      schemeStorageKey: 'color-scheme',
      themeColors: { dark: DARK_BG, light: LIGHT_BG },
    });
    const throwingStorage = {
      getItem() {
        throw new Error('SecurityError');
      },
      removeItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('SecurityError');
      },
    };
    const fakeDocument = {
      addEventListener: () => undefined,
      documentElement: fakeRoot,
      getElementById(id: string) {
        if (id === 'site-config') {
          return { textContent: siteConfigJson };
        }
        if (id === 'theme-toggle') {
          return themeToggle.element;
        }
        if (id === 'preview-bg-toggle') {
          return previewBgToggle.element;
        }
        return undefined;
      },
      querySelector: (selector: string) =>
        selector === 'meta[name="color-scheme"]' ? schemeMeta : undefined,
      querySelectorAll: () => [],
    };
    const fakeGlobal = {
      addEventListener: () => undefined,
      innerHeight: 800,
      matchMedia: () => fakeMediaQuery,
    };

    evaluateClientDom(siteScript, {
      HTMLElement: { prototype: {} },
      ResizeObserver: createFakeResizeObserver,
      document: fakeDocument,
      globalThis: fakeGlobal,
      localStorage: throwingStorage,
    });

    expect(themeToggle.getChecked()).toBe('false');
    themeToggle.click();
    expect(schemeMeta.content).toBe('dark');
    expect(themeToggle.getChecked()).toBe('true');
    themeToggle.click();
    expect(schemeMeta.content).toBe('light dark');
    expect(themeToggle.getChecked()).toBe('false');
    themeToggle.click();
    expect(schemeMeta.content).toBe('dark');
    expect(themeToggle.getChecked()).toBe('true');

    expect(previewBgToggle.getChecked()).toBe('false');
    previewBgToggle.click();
    expect(rootAttributes.get('data-preview-bg')).toBe('inverse');
    expect(previewBgToggle.getChecked()).toBe('true');
    previewBgToggle.click();
    expect(rootAttributes.has('data-preview-bg')).toBe(false);
    expect(previewBgToggle.getChecked()).toBe('false');
  });

  it('formats /llms.txt token lists, /docs/quotes layout prose, /docs/typing ?align= defaults, HTML5 boolean attributes, and OG #RGB/scale(<path>) primitives cleanly (regressions: formatBacktickList separator misuse, inaccurate ?align= default, incomplete JSX boolean table, OG #RGB shorthand and scaled <path>)', () => {
    const llmsTxt = renderLlmsTxt();
    expect(llmsTxt).not.toContain(', ,');
    expect(llmsTxt).not.toContain(',  |');
    expect(llmsTxt).toContain('`1` | `2` | `3`');
    expect(llmsTxt).toContain(
      '`/badge/*`, `/button/*`, `/icon/*`, `/quote/*`, `/stack/*`, `/typing/*`'
    );
    expect(llmsTxt).toContain(
      '`sparkline` | `bars` | `bar` | `steps` | `ring` | `strip` | `delta`'
    );

    const quotesHtml = renderDocsHtml('quotes');
    expect(quotesHtml).toContain('<code>horizontal</code> or <code>vertical</code>');
    expect(quotesHtml).not.toContain('  or  ');

    const typingHtml = renderDocsHtml('typing');
    expect(typingHtml.replace(HTML_TAG_RX, '')).toContain(
      'left (framed, or none with prefix/icon) / center (none)'
    );

    for (const booleanAttr of [
      'async',
      'controls',
      'loop',
      'multiple',
      'playsinline',
      'reversed',
    ]) {
      expect(jsx('video', { [booleanAttr]: true }).rawHtml).toBe(`<video ${booleanAttr}></video>`);
      expect(jsx('video', { [booleanAttr]: false }).rawHtml).toBe('<video></video>');
    }
    expect(jsx('div', { contenteditable: true }).rawHtml).toBe(
      '<div contenteditable="true"></div>'
    );
    expect(jsx('div', { contenteditable: 'plaintext-only' }).rawHtml).toBe(
      '<div contenteditable="plaintext-only"></div>'
    );

    expect(evaluatePaint('#f80', new Map(), 0, 0)).toEqual([255, 136, 0, 1]);

    const unscaledPathPng = rasterizeOgSvgToPng(
      '<svg width="24" height="24"><rect width="24" height="24" fill="#000000" /><path d="M1 1 H5 V5 H1 Z" fill="#FFFFFF" /></svg>',
      24,
      24,
      '00'
    );
    const scaledPathPng = rasterizeOgSvgToPng(
      '<svg width="24" height="24"><rect width="24" height="24" fill="#000000" /><path transform="scale(4)" d="M1 1 H5 V5 H1 Z" fill="#FFFFFF" /></svg>',
      24,
      24,
      '00'
    );
    expect(scaledPathPng.equals(unscaledPathPng)).toBe(false);
  });

  it('honors event.defaultPrevented on fallback popovers, clears stale min-width on non-width-matched popovers, and sanitizes backward .code-pre copies without hijacking cross-element selections (regressions: icon picker switcher dismissed fallback popover, stale min-width persisted across popovers, backward code selection missed NBSP sanitizer)', () => {
    const documentListeners = new Map<string, ((event: Record<string, unknown>) => void)[]>();

    const openClasses = new Set<string>(['is-open']);
    const removedStyles: string[] = [];
    const fakePopover = Object.assign(Object.create(FakeHtmlElement.prototype) as object, {
      classList: {
        add: (token: string) => openClasses.add(token),
        contains: (token: string) => openClasses.has(token),
        remove: (token: string) => openClasses.delete(token),
      },
      contains: () => false,
      dispatchEvent: () => true,
      getBoundingClientRect: () => ({ height: 120, width: 200 }),
      hasAttribute: (name: string) => name === 'popover',
      id: 'icon-picker',
      style: {
        left: '',
        minWidth: '',
        removeProperty(prop: string) {
          if (prop === 'min-width') {
            this.minWidth = '';
            removedStyles.push(prop);
          }
        },
        top: '',
      },
    });

    const fakeAnchor = Object.assign(Object.create(FakeElement.prototype) as object, {
      getBoundingClientRect: () => ({ bottom: 60, left: 40, right: 180, top: 28, width: 140 }),
      hasAttribute: () => false,
      setAttribute: () => undefined,
    });

    const codePreElement: { closest: (selector: string) => unknown } = Object.assign(
      Object.create(FakeElement.prototype) as object,
      { closest: (selector: string) => (selector === '.code-pre' ? codePreElement : undefined) }
    );
    const outsideElement = Object.assign(Object.create(FakeElement.prototype) as object, {
      closest: () => undefined,
    });
    const backwardCodeTextNode = Object.assign(Object.create(FakeNode.prototype) as object, {
      parentElement: codePreElement,
    });

    let activeSelection: Record<string, unknown> | undefined = undefined;
    const fakeGlobal: {
      addEventListener: () => void;
      getSelection: () => Record<string, unknown> | undefined;
      innerHeight: number;
      matchMedia: () => { addEventListener: () => void; matches: boolean };
      svgSite?: {
        placePopover: (
          popover: unknown,
          anchor: unknown,
          options?: PopoverPlacementOptions
        ) => void;
      };
    } = {
      addEventListener: () => undefined,
      getSelection: () => activeSelection,
      innerHeight: 800,
      matchMedia: () => ({ addEventListener: () => undefined, matches: false }),
    };

    const fakeDocument = {
      addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
        const list = documentListeners.get(type) ?? [];
        list.push(listener);
        documentListeners.set(type, list);
      },
      documentElement: {
        clientWidth: 1280,
        getAttribute: () => undefined,
        hasAttribute: () => false,
        removeAttribute: () => undefined,
        setAttribute: () => undefined,
      },
      getElementById: (id: string) =>
        id === 'site-config'
          ? {
              textContent: JSON.stringify({
                drawerMediaQuery: '(max-width: 960px)',
                previewBgStorageKey: 'preview-bg',
                previewBgValues: ['auto', 'inverse'],
                schemeStorageKey: 'color-scheme',
                themeColors: { dark: DARK_BG, light: LIGHT_BG },
              }),
            }
          : undefined,
      querySelector: () => undefined,
      querySelectorAll: (selector: string) => (selector === '[popover]' ? [fakePopover] : []),
    };

    evaluateClientDom(siteScript, {
      Element: FakeElement,
      HTMLElement: FakeHtmlElement,
      Node: FakeNode,
      document: fakeDocument,
      globalThis: fakeGlobal,
      localStorage: {
        getItem: () => undefined,
        removeItem: () => undefined,
        setItem: () => undefined,
      },
    });

    const svgSite = requireDefined(fakeGlobal.svgSite, 'svgSite helpers');
    svgSite.placePopover(fakePopover, fakeAnchor, { isWidthMatched: true });
    expect(fakePopover.style.minWidth).toBe('140px');
    svgSite.placePopover(fakePopover, fakeAnchor, {});
    expect(fakePopover.style.minWidth).toBe('');
    expect(removedStyles).toContain('min-width');

    // [1] `event.defaultPrevented = true` on a click (e.g., switching icon picker triggers) must NOT dismiss fallback popovers:
    const clickListeners = documentListeners.get('click') ?? [];
    for (const listener of clickListeners) {
      listener({ defaultPrevented: true, target: outsideElement });
    }
    expect(openClasses.has('is-open')).toBe(true);

    // Non-prevented outside clicks still close fallback popovers:
    for (const listener of clickListeners) {
      listener({ defaultPrevented: false, target: outsideElement });
    }
    expect(openClasses.has('is-open')).toBe(false);

    // [2] Backward selection inside `.code-pre` (resolved via `getRangeAt(0).commonAncestorContainer`) strips NBSP:
    const copyListeners = documentListeners.get('copy') ?? [];
    let copiedText: string | undefined = undefined;
    let isCopyPrevented = false;
    activeSelection = {
      anchorNode: outsideElement,
      getRangeAt: () => ({ commonAncestorContainer: backwardCodeTextNode }),
      isCollapsed: false,
      rangeCount: 1,
      toString: () => '![Badge]\u00A0(url)',
    };
    for (const listener of copyListeners) {
      listener({
        clipboardData: {
          setData(_mime: string, text: string) {
            copiedText = text;
          },
        },
        preventDefault() {
          isCopyPrevented = true;
        },
      });
    }
    expect(isCopyPrevented).toBe(true);
    expect(copiedText).toBe('![Badge] (url)');

    // Cross-element selection (`commonAncestorContainer` outside `.code-pre`) is left untouched even if `anchorNode` is inside `.code-pre`:
    copiedText = undefined;
    isCopyPrevented = false;
    activeSelection = {
      anchorNode: backwardCodeTextNode,
      getRangeAt: () => ({ commonAncestorContainer: outsideElement }),
      isCollapsed: false,
      rangeCount: 1,
      toString: () => 'Code\u00A0and\u00A0prose',
    };
    for (const listener of copyListeners) {
      listener({
        clipboardData: {
          setData(_mime: string, text: string) {
            copiedText = text;
          },
        },
        preventDefault() {
          isCopyPrevented = true;
        },
      });
    }
    expect(isCopyPrevented).toBe(false);
    expect(copiedText).toBeUndefined();
  });
});

/******************************* Repository drift guards ********************************/

describe('repository & OSS Markdown drift guards', () => {
  it('keeps SVG_ROUTES query parameters and SERVICES_CONFIG showcase cards in bidirectional parity with documentation pages (drift guard)', () => {
    const canonicalPrefixes: string[] = [];
    for (const route of SVG_ROUTES) {
      if (route.aliasOf !== undefined) {
        expect(route.queryParams, route.prefix).toEqual(findSvgRoute(route.aliasOf)?.queryParams);
      } else {
        canonicalPrefixes.push(route.prefix);
        const docsSlugs = requireDefined(ROUTE_PREFIX_DOCS_SLUGS[route.prefix], route.prefix);
        expect([...route.queryParams], route.prefix).toEqual(
          collectDocumentedQueryParams(docsSlugs)
        );
      }
    }
    expect(canonicalPrefixes).toEqual(Object.keys(ROUTE_PREFIX_DOCS_SLUGS).toSorted());

    const showcasedServices = new Set<string>();
    for (const card of buildServicePresetCards()) {
      for (const item of card.items) {
        const [, serviceKey] = item.path.slice(1).split('/');
        if (serviceKey) {
          showcasedServices.add(serviceKey);
        }
      }
    }
    expect([...showcasedServices].toSorted()).toEqual(Object.keys(SERVICES_CONFIG).toSorted());
  });

  it('keeps README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, .github/*, .vscode/*, and .agents/* synchronized with routes, order, presets, icons, scripts, limits, URLs, and exports (drift guard)', async () => {
    const repoRoot = path.resolve(import.meta.dirname, '..');
    const packageJson = JSON.parse(readRepoFile(repoRoot, 'package.json')) as RepoPackageJson;
    const pnpmWorkspaceYml = readRepoFile(repoRoot, 'pnpm-workspace.yaml');
    const gitattributesTxt = readRepoFile(repoRoot, '.gitattributes');
    const editorconfigTxt = readRepoFile(repoRoot, '.editorconfig');
    const gitignoreTxt = readRepoFile(repoRoot, '.gitignore');
    const vscodeSettings = JSON.parse(readRepoFile(repoRoot, '.vscode/settings.json')) as {
      'editor.defaultFormatter': string;
    };
    const vscodeExtensions = JSON.parse(readRepoFile(repoRoot, '.vscode/extensions.json')) as {
      recommendations: string[];
    };
    const licenseTxt = readRepoFile(repoRoot, 'LICENSE');
    const readmeMd = readRepoFile(repoRoot, 'README.md');
    const contributingMd = readRepoFile(repoRoot, 'CONTRIBUTING.md');
    const codeOfConductMd = readRepoFile(repoRoot, 'CODE_OF_CONDUCT.md');
    const securityMd = readRepoFile(repoRoot, 'SECURITY.md');
    const prTemplateMd = readRepoFile(repoRoot, '.github/PULL_REQUEST_TEMPLATE.md');
    const ciYml = readRepoFile(repoRoot, '.github/workflows/ci.yaml');
    const dependabotYml = readRepoFile(repoRoot, '.github/dependabot.yml');
    const fundingYml = readRepoFile(repoRoot, '.github/FUNDING.yml');
    const codeownersTxt = readRepoFile(repoRoot, '.github/CODEOWNERS');
    const issueConfigYml = readRepoFile(repoRoot, '.github/ISSUE_TEMPLATE/config.yml');
    const bugReportYml = readRepoFile(repoRoot, '.github/ISSUE_TEMPLATE/bug_report.yml');
    const featureRequestYml = readRepoFile(repoRoot, '.github/ISSUE_TEMPLATE/feature_request.yml');
    const serviceRequestYml = readRepoFile(repoRoot, '.github/ISSUE_TEMPLATE/service_request.yml');
    const agentsMd = readRepoFile(repoRoot, '.agents/AGENTS.md');
    const buildSkillMd = readRepoFile(repoRoot, '.agents/skills/build/SKILL.md');
    const testSkillMd = readRepoFile(repoRoot, '.agents/skills/test/SKILL.md');

    // [1] Repository, editor/git LF hygiene, funding, CODEOWNERS, CI secret & dependency-review scope, and `/llms.txt` metadata parity:
    const repoSlug = REPO_GITHUB_URL.slice('https://github.com/'.length);
    const authorHandle = repoSlug.slice(0, repoSlug.indexOf('/'));
    expect(packageJson.homepage).toBe(SITE_ORIGIN);
    expect(packageJson.repository.url).toBe(REPO_GITHUB_URL);
    expect(packageJson.bugs.url).toBe(`${REPO_GITHUB_URL}/issues`);
    expect(packageJson.license).toBe('MIT');
    expect('maintainers' in packageJson).toBe(false);
    expect(SERVICE_USER_AGENT).toBe(`${packageJson.name}/${packageJson.version} (${SITE_ORIGIN})`);
    expect(FALLBACK_REDIRECT_URL).toBe(AUTHOR_WEBSITE_URL);
    expect(pnpmWorkspaceYml).toContain('engineStrict: true');
    expect(existsSync(path.resolve(repoRoot, 'LICENSE'))).toBe(true);
    expect(gitattributesTxt).toContain('* text=auto eol=lf');
    expect(editorconfigTxt).toContain('end_of_line = lf');
    expect(gitignoreTxt).toContain('/.dev.vars*');
    expect(vscodeExtensions.recommendations).toContain(vscodeSettings['editor.defaultFormatter']);
    expect(fundingYml.trim()).toBe(`github: [${authorHandle}]`);
    expect(codeownersTxt.trim()).toBe(`* @${authorHandle}`);
    expect(readmeMd).toContain(`https://github.com/sponsors/${authorHandle}`);
    expect(issueConfigYml).toContain(`${REPO_GITHUB_URL}/security/advisories/new`);
    expect(securityMd).toContain(`${REPO_GITHUB_URL}/security/advisories/new`);
    expect(ciYml).toContain('permissions: {}');
    expect(ciYml).toContain('persist-credentials: false');
    expect(ciYml).toContain('actions/dependency-review-action@');
    expect(ciYml).toContain('!github.event.repository.private');
    expect(ciYml).toContain(`github.repository == '${repoSlug}'`);
    expect(ciYml).not.toMatch(YAML_IF_SECRETS_RX);
    expect(ciYml).not.toContain('HAS_CLOUDFLARE_TOKEN');
    expect(ciYml.slice(0, ciYml.indexOf('- name: Deploy to Cloudflare Workers'))).not.toContain(
      'CLOUDFLARE_API_TOKEN'
    );
    const allUsesLines = ciYml.match(YAML_USES_LINE_RX) ?? [];
    const shaPinnedUsesLines = ciYml.match(YAML_SHA_PINNED_USES_RX) ?? [];
    expect(allUsesLines.length).toBeGreaterThan(0);
    expect(shaPinnedUsesLines).toEqual(allUsesLines);
    expect(dependabotYml).toContain("package-ecosystem: 'npm'");
    expect(dependabotYml).toContain("package-ecosystem: 'github-actions'");
    expect(countOccurrences(dependabotYml, 'cooldown:')).toBe(2);
    expect(dependabotYml).toContain("'lucide-static'");
    expect(dependabotYml).toContain("'@iconify-json/*'");
    expect(agentsMd).toContain('`CONTRIBUTING.md`');
    const llmsTxt = renderLlmsTxt();
    expect(llmsTxt.startsWith(`# ${SITE_NAME}\n`)).toBe(true);
    expect(llmsTxt).toContain(`- Source repository: ${REPO_GITHUB_URL}`);
    expect(contributingMd).toContain(`[**${SITE_NAME}**](${SITE_ORIGIN})`);
    expect(codeOfConductMd).toContain(`[**${SITE_NAME}**](${SITE_ORIGIN})`);
    expect(securityMd).toContain(`[**${SITE_NAME}**](${SITE_ORIGIN})`);
    expect(contributingMd).not.toContain(`(${SITE_HOST})`);
    expect(contributingMd).not.toContain(`([**${SITE_HOST}**]`);
    assertBrandAssetsAndLicenseParity(repoRoot, readmeMd, licenseTxt);

    // [2] Heading icons, anchors, ToC, and `README.md` `## Endpoints` table order, routes, aliases, and widgets:
    const readmeAnchors = new Set(collectIconHeadingAnchors('README.md', readmeMd));
    const contributingAnchors = assertContributingHeadingsAndToc(contributingMd);
    const codeOfConductAnchors = collectIconHeadingAnchors('CODE_OF_CONDUCT.md', codeOfConductMd);
    expect(codeOfConductAnchors).toHaveLength((codeOfConductMd.match(MD_H2_LINE_RX) ?? []).length);
    const securityAnchors = collectIconHeadingAnchors('SECURITY.md', securityMd);
    expect(securityAnchors).toHaveLength((securityMd.match(MD_H2_LINE_RX) ?? []).length);
    assertReadmeEndpointsTable(readmeMd);

    // [3] `CONTRIBUTING.md` download period keys, URL placeholders, Node engine, scripts, limits, and icon sets:
    assertContributingDownloadAndPlaceholderSpecs(contributingMd);
    assertContributingScriptsEngineAndIcons(contributingMd, serviceRequestYml, packageJson);

    // [4] Scripts, concrete file/directory paths, live `svg.xul.is` URLs, and GitHub blob links across all OSS files:
    assertReferencedScriptsAndPathsExist(
      repoRoot,
      [
        ['CONTRIBUTING.md', contributingMd],
        ['.github/PULL_REQUEST_TEMPLATE.md', prTemplateMd],
        ['.github/workflows/ci.yaml', ciYml],
        ['.agents/AGENTS.md', agentsMd],
        ['.agents/skills/build/SKILL.md', buildSkillMd],
        ['.agents/skills/test/SKILL.md', testSkillMd],
      ],
      packageJson.scripts
    );
    await assertSiteAndRepoUrlsResolve(
      repoRoot,
      [
        ['README.md', readmeMd],
        ['CONTRIBUTING.md', contributingMd],
        ['CODE_OF_CONDUCT.md', codeOfConductMd],
        ['SECURITY.md', securityMd],
        ['.github/ISSUE_TEMPLATE/config.yml', issueConfigYml],
        ['.github/ISSUE_TEMPLATE/bug_report.yml', bugReportYml],
        ['.github/ISSUE_TEMPLATE/feature_request.yml', featureRequestYml],
        ['.github/ISSUE_TEMPLATE/service_request.yml', serviceRequestYml],
      ],
      new Map<string, ReadonlySet<string>>([
        ['CODE_OF_CONDUCT.md', new Set(codeOfConductAnchors)],
        ['CONTRIBUTING.md', contributingAnchors],
        ['README.md', readmeAnchors],
        ['SECURITY.md', new Set(securityAnchors)],
      ])
    );

    // [5] Code example imports and prose-referenced module exports:
    await assertMarkdownModuleImports(contributingMd);
    await assertProseModuleExports(contributingMd, securityMd);
  });
});
