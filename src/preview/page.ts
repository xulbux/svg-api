/**
 * Documentation pages – Renders the `svg.xul.is` homepage (`/`), the Getting Started overview (`/docs`), and the dedicated element documentation pages (`/docs/:section`).
 *
 * Every page is deterministic, so each one is rendered once per Worker isolate and then served from memory.
 */

import { listPublicServices } from '@/config/services';
import { SITE_ORIGIN } from '@/config/site';
import { THEME_COLOR_NAMES } from '@/config/theme';
import {
  ENCODED_CHAOS_QUOTE,
  ENDPOINT_ROUTES,
  formatCountLowerBound,
  getIconSetCounts,
  renderBadgesSectionHtml,
  renderButtonsSectionHtml,
  renderColorsSectionHtml,
  renderIconsSectionHtml,
  renderOverviewSectionHtml,
  renderQuotesSectionHtml,
  renderServicesSectionHtml,
  renderStackSectionHtml,
  STACK_EXAMPLE_GROUPS,
} from '@/preview/catalog';
import { renderCardsHtml, renderSectionHeader, renderUiIcon } from '@/preview/components';
import { renderPageLayout } from '@/preview/layout';
import {
  buildBuilderPath,
  buildDocsPath,
  buildDocsSidebar,
  DEFAULT_BUILDER_KIND,
  DOCS_PAGES,
  getDocsPageMeta,
} from '@/preview/navigation';
import { escapeXml } from '@/svg/shared';
import type { DocsPageSlug, DocsSectionSlug, ShowcaseCardConfig } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Feature highlight card displayed on the `/` homepage. */
interface FeatureCardItem {
  /** Short feature explanation. */
  details: string;
  /** Lucide icon slug. */
  icon: string;
  /** Feature headline. */
  title: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Section HTML renderers keyed by documentation page slug. */
const PAGE_RENDERERS: Readonly<Record<DocsPageSlug, () => string>> = {
  badges: renderBadgesSectionHtml,
  buttons: renderButtonsSectionHtml,
  colors: renderColorsSectionHtml,
  icons: renderIconsSectionHtml,
  overview: renderOverviewSectionHtml,
  quotes: renderQuotesSectionHtml,
  services: renderServicesSectionHtml,
  stack: renderStackSectionHtml,
};

/** English number words for small headline counts (index = count). */
const COUNT_WORDS: readonly string[] = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
];

/** Quickstart overview cards displayed on the `/` homepage. */
const HOME_OVERVIEW_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      { alt: 'Status Online', path: '/badge/status/online/Operational' },
      { alt: 'PyPI Downloads', path: '/badge/pypi/xulbux/dt', sample: '86.8k' },
      {
        alt: 'Coverage',
        path: '/badge/Coverage/99.4%25?icon=shield-check&color=emerald&variant=2&special=bar:99.4',
      },
      {
        alt: 'Edge Latency',
        path: '/badge/Latency/11ms?icon=zap&color=cyan&variant=2&special=sparkline:19,16,18,15,14,15,12,11',
      },
      {
        alt: 'Uptime',
        path: '/badge/Uptime/99.98%25?icon=activity&color=violet&variant=3&special=strip:9998997999',
      },
      {
        alt: 'Explore Docs',
        href: `${SITE_ORIGIN}/docs/buttons`,
        path: '/button/Explore+Docs?icon=book-open,arrow-right&anim=sheen,none,nudge',
      },
    ],
    subtitle: 'Static 22px badges, live package metrics, inline data widgets, and 3D CTA buttons.',
    title: 'Badges & CTA Buttons (/badge/*, /button/*)',
  },
  {
    items: [
      { alt: 'Loading', path: '/icon/loader?size=32&color=sky&anim=spin' },
      { alt: 'Heart', path: '/icon/heart?size=32&color=rose&anim=pulse' },
      { alt: 'Notifications', path: '/icon/bell?size=32&color=amber&anim=shake' },
      { alt: 'Launch', path: '/icon/rocket?size=32&color=indigo&anim=nudge' },
      { alt: 'Cloud', path: '/icon/cloud?size=32&color=cyan&anim=float' },
      { alt: 'Rust', path: '/icon/rust?size=32&color=orange&anim=sheen' },
      { alt: 'TypeScript', path: '/icon/ts?size=32&color=blue' },
      { alt: 'Vue.js', path: '/icon/vue?size=32&color=emerald' },
    ],
    subtitle:
      'Lucide stroke icons and Simple Icons / Devicon brand logos with OKLCH colors, custom sizing, and SMIL motions.',
    title: 'Standalone Icons (/icon/:icon)',
  },
  {
    isCentered: true,
    items: [{ alt: 'Tech Stack', path: `/stack/${STACK_EXAMPLE_GROUPS}` }],
    subtitle:
      'Multi-group icon grids with per-group columns (:N), side-by-side groups (|), and row bands (;).',
    title: 'Grouped Tech Stacks (/stack/:groups)',
  },
  {
    isCentered: true,
    items: [
      { alt: "XulbuX's Quote", path: `/quote/XulbuX/${ENCODED_CHAOS_QUOTE}?layout=vertical` },
    ],
    subtitle:
      'Vertical and horizontal pull-quote cards with automatic word-wrapping and watermarks.',
    title: 'Quote Cards (/quote/:author/:text)',
  },
];

/** Memoized documentation pages keyed by slug. */
const DOCS_HTML_CACHE = new Map<DocsPageSlug, string>();

/** Memoized homepage HTML (`undefined` until first rendered). */
let homeHtmlCache: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Format a small count as a capitalized English word (`5` -> `'Five'`), falling back to digits. */
function formatCountWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

/** Find the index of a documentation page in sidebar order (`-1` when unknown). */
function findDocsPageIndex(slug: DocsPageSlug): number {
  return DOCS_PAGES.findIndex((meta) => meta.slug === slug);
}

/** Build the homepage feature highlight cards (every count is computed from the code it describes). */
function buildHomeFeatures(): FeatureCardItem[] {
  const publicServiceTitles: string[] = [];
  for (const [, service] of listPublicServices()) {
    publicServiceTitles.push(service.docs.title);
  }
  const iconCounts = getIconSetCounts();
  return [
    {
      details:
        'Deterministic SVG rendering on Cloudflare Workers with in-isolate memoization and multi-tier edge caching.',
      icon: 'zap',
      title: 'Zero Cold Starts',
    },
    {
      details: `All badges, buttons, icons, stacks, and quotes share ${THEME_COLOR_NAMES.length} Tailwind v4 OKLCH color tokens.`,
      icon: 'palette',
      title: 'Unified OKLCH Palette',
    },
    {
      details: `Combine ${formatCountLowerBound(iconCounts.lucide)} Lucide stroke icons with ${formatCountLowerBound(iconCounts.brand)} Simple Icons and Devicon brand logos.`,
      icon: 'layers',
      title: `${formatCountLowerBound(iconCounts.lucide + iconCounts.brand)} Vector Icons`,
    },
    {
      details: `Live metrics from ${publicServiceTitles.length} public registries and forges (${publicServiceTitles.slice(0, 4).join(', ')}, …) with smart 302 redirects.`,
      icon: 'cpu',
      title: 'Live Service Presets',
    },
  ];
}

/** Render the feature highlight cards on the `/` homepage. */
function renderHomeFeaturesHtml(): string {
  let cardsHtml = '';
  for (const feature of buildHomeFeatures()) {
    cardsHtml += `<div class="feature-card">
      <div class="feature-icon">${renderUiIcon(feature.icon, 20)}</div>
      <h2 class="feature-title">${escapeXml(feature.title)}</h2>
      <p class="feature-desc">${escapeXml(feature.details)}</p>
    </div>`;
  }
  return `<div class="feature-grid">${cardsHtml}</div>`;
}

/** Render the bottom navigation links between documentation pages (in sidebar order). */
function renderDocsPager(slug: DocsPageSlug): string {
  const pageIndex = findDocsPageIndex(slug);
  const prev = DOCS_PAGES[pageIndex - 1];
  const next = DOCS_PAGES[pageIndex + 1];
  const prevHtml = prev
    ? `<a href="${escapeXml(buildDocsPath(prev.slug))}" class="btn-secondary" rel="prev" tabindex="0">${renderUiIcon('arrow-left', 16)}${escapeXml(prev.pagerLabel)}</a>`
    : '';
  const nextHtml = next
    ? `<a href="${escapeXml(buildDocsPath(next.slug))}" class="btn-primary" rel="next" tabindex="0">${escapeXml(next.pagerLabel)}${renderUiIcon('arrow-right', 16)}</a>`
    : '';
  const pagerClass = prev ? 'pager-row' : 'pager-row is-end';

  return `<nav class="${pagerClass}" aria-label="Documentation pages">
    ${prevHtml}
    ${nextHtml}
  </nav>`;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Check whether a raw slug is a valid documentation section (`/docs/:section`; The overview lives at `/docs`).
 * @param slug   Raw, lowercased `/docs/:section` slug.
 * @returns `true` when `slug` is a known `DocsSectionSlug`.
 */
export function isDocsSectionSlug(slug: string): slug is DocsSectionSlug {
  return slug !== 'overview' && Object.hasOwn(PAGE_RENDERERS, slug);
}

/**
 * Render (once per isolate) the `svg.xul.is` homepage introducing the API, showcasing live examples, and linking to documentation.
 * @returns Complete HTML document string for the homepage.
 */
export function renderHomeHtml(): string {
  if (homeHtmlCache === undefined) {
    const bookIcon = renderUiIcon('book-open', 16);
    const rightArrow = renderUiIcon('arrow-right', 16);
    const builderIcon = renderUiIcon('wand-sparkles', 16);
    const docsPath = buildDocsPath('overview');
    const builderPath = buildBuilderPath(DEFAULT_BUILDER_KIND);

    const bodyHtml = `<section class="hero">
    <h1 class="hero-title">One Cohesive <span class="hero-accent">Edge SVG Engine</span> for READMEs &amp; Docs</h1>
    <p class="hero-lead">
      Dynamic badges, CTA buttons, icons, tech stacks, and quote cards: Every element is a plain URL, composed visually in seconds and rendered at the edge; 100% free for everyone, with no signup, no API keys, and no rate limits.
    </p>
    <div class="hero-cta-row">
      <a href="${builderPath}" class="btn-primary" tabindex="0">${builderIcon}Start Building${rightArrow}</a>
      <a href="${docsPath}" class="btn-secondary" tabindex="0">${bookIcon}Explore Docs &amp; Previews</a>
    </div>
  </section>

  ${renderHomeFeaturesHtml()}

  <section class="doc-section" id="endpoints">
    ${renderSectionHeader({
      description:
        'Expand **View Markdown** on any card to inspect and copy its live snippet, or click a preview to customize it in the Builder.',
      headingLevel: 2,
      routes: ENDPOINT_ROUTES,
      title: `${formatCountWord(ENDPOINT_ROUTES.length)} Unified Endpoints`,
    })}
    <div class="card-grid">${renderCardsHtml(HOME_OVERVIEW_CARDS)}</div>
    <div class="pager-row is-end">
      <a href="${docsPath}" class="btn-secondary" tabindex="0">${bookIcon}Browse Documentation</a>
      <a href="${builderPath}" class="btn-primary" tabindex="0">${builderIcon}Start Building${rightArrow}</a>
    </div>
  </section>`;

    homeHtmlCache = renderPageLayout({
      activeNav: 'home',
      bodyHtml,
      canonicalPath: '/',
      description:
        'Zero-cold-start dynamic SVG badge, CTA button, icon, tech stack, and quote card engine for svg.xul.is.',
      title: 'svg.xul.is · Edge SVG Badge, Button, Icon, Tech Stack & Quote API',
    });
  }
  return homeHtmlCache;
}

/**
 * Render (once per isolate) a documentation page: The Getting Started overview or a dedicated element section.
 * @param slug   Target page slug (`'overview'`, `'badges'`, `'buttons'`, `'services'`, `'icons'`, `'stack'`, `'quotes'`, `'colors'`).
 * @returns Complete HTML document string.
 */
export function renderDocsHtml(slug: DocsPageSlug = 'overview'): string {
  const cached = DOCS_HTML_CACHE.get(slug);
  if (cached !== undefined) {
    return cached;
  }

  const meta = getDocsPageMeta(slug);
  const html = renderPageLayout({
    activeNav: 'docs',
    bodyHtml: `${PAGE_RENDERERS[slug]()}${renderDocsPager(slug)}`,
    canonicalPath: buildDocsPath(slug),
    description: meta.description,
    sidebar: buildDocsSidebar(slug),
    title: `${meta.title} · svg.xul.is Documentation`,
  });
  DOCS_HTML_CACHE.set(slug, html);
  return html;
}
