/**
 * Preview and documentation pages: Renders the `svg.xul.is` homepage (`/`) and dedicated element documentation pages (`/docs/:section`).
 */

import {
  renderBadgesSectionHtml,
  renderButtonsSectionHtml,
  renderColorsSectionHtml,
  renderIconsSectionHtml,
  renderQuotesSectionHtml,
  renderServicesSectionHtml,
  renderStackSectionHtml,
} from '@/preview/catalog';
import type { ShowcaseCardConfig } from '@/preview/layout';
import {
  renderPageLayout,
  renderRoutePills,
  renderShowcaseCard,
  renderUiIcon,
} from '@/preview/layout';
import { renderBadge, renderButton, renderIcon, renderQuote, renderStack } from '@/svg/renderer';

// ---------------------------------------- TYPES ----------------------------------------

/** Supported documentation section slugs on `/docs/:section`. */
export type DocsSectionSlug =
  | 'badges'
  | 'buttons'
  | 'colors'
  | 'icons'
  | 'quotes'
  | 'services'
  | 'stack';

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

/** Feature highlight cards displayed below the homepage hero. */
const HOME_FEATURES: readonly FeatureCardItem[] = [
  {
    details:
      'Deterministic SVG rendering on Cloudflare Workers with dual-layer edge and KV caching.',
    icon: 'zap',
    title: 'Zero Cold Starts',
  },
  {
    details:
      'All badges, buttons, icons, stacks, and quotes share 22 Tailwind v4 OKLCH color tokens.',
    icon: 'palette',
    title: 'Unified OKLCH Palette',
  },
  {
    details: 'Combine 1,500+ Lucide stroke icons with 3,300+ Simple Icons and Devicon brand logos.',
    icon: 'layers',
    title: '4,800+ Vector Icons',
  },
  {
    details:
      'Auto-fetches PyPI, npm, Open VSX, crates.io, and Docker Hub metrics with smart 302 redirects.',
    icon: 'cpu',
    title: 'Live Service Presets',
  },
];

// -------------------------------------- INTERNALS --------------------------------------

/** Render the 4 feature highlight cards on the `/` homepage. */
function renderHomeFeaturesHtml(): string {
  let cardsHtml = '';
  for (const feature of HOME_FEATURES) {
    const iconSvg = renderUiIcon(feature.icon, 20);
    cardsHtml += `<div class="feature-card">
      <div class="feature-icon">${iconSvg}</div>
      <div class="feature-title">${feature.title}</div>
      <p class="feature-desc">${feature.details}</p>
    </div>`;
  }
  return `<div class="feature-grid">${cardsHtml}</div>`;
}

/** Build the 4 quickstart overview cards displayed on the `/` homepage. */
function buildHomeOverviewCards(): ShowcaseCardConfig[] {
  return [
    {
      items: [
        {
          alt: 'Build Passing',
          path: '/badge/build/passing?icon=circle-check',
          svg: renderBadge({
            color: 'indigo',
            icon: 'circle-check',
            label: 'build',
            value: 'passing',
            variant: '1',
          }),
        },
        {
          alt: 'PyPI Downloads',
          href: 'https://clickpy.clickhouse.com/dashboard/xulbux',
          path: '/badge/pypi/xulbux/dt',
          svg: renderBadge({
            color: 'indigo',
            icon: 'download',
            label: 'downloads',
            value: '86.8k',
            variant: '1',
          }),
        },
        {
          alt: 'Coverage',
          path: '/badge/coverage/99.4%25?icon=shield-check&color=emerald&variant=2&special=bar:99.4',
          svg: renderBadge({
            color: 'emerald',
            icon: 'shield-check',
            label: 'coverage',
            special: { type: 'bar', value: 99.4 },
            value: '99.4%',
            variant: '2',
          }),
        },
        {
          alt: 'Edge Latency',
          path: '/badge/latency/11ms?icon=zap&color=cyan&dot=green&variant=2&special=sparkline:19,16,18,15,14,15,12,11',
          svg: renderBadge({
            color: 'cyan',
            dot: 'green',
            icon: 'zap',
            label: 'latency',
            special: { type: 'sparkline', values: [19, 16, 18, 15, 14, 15, 12, 11] },
            value: '11ms',
            variant: '2',
          }),
        },
        {
          alt: 'Explore Docs',
          href: 'https://svg.xul.is/docs/buttons',
          path: '/button/Explore+Docs?icon=rocket,arrow-right&anim=sheen',
          svg: renderButton({
            anim: 'sheen',
            color: 'indigo',
            icon: 'rocket,arrow-right',
            label: 'Explore Docs',
            variant: '1',
          }),
        },
      ],
      subtitle:
        'Static 22px badges, live package metrics, inline data widgets, and 3D CTA buttons.',
      title: 'Badges & CTA Buttons (/badge/*, /button/*)',
    },
    {
      items: [
        {
          alt: 'Info',
          path: '/icon/circle-info?size=32',
          svg: renderIcon({ color: 'indigo', icon: 'circle-info', size: 32 }),
        },
        {
          alt: 'Terminal',
          path: '/icon/square-terminal?size=32&color=sky',
          svg: renderIcon({ color: 'sky', icon: 'square-terminal', size: 32 }),
        },
        {
          alt: 'Quick Start',
          path: '/icon/zap?size=32&color=amber',
          svg: renderIcon({ color: 'amber', icon: 'zap', size: 32 }),
        },
        {
          alt: 'Arch Linux',
          path: '/icon/archlinux?size=32&color=cyan',
          svg: renderIcon({ color: 'cyan', icon: 'archlinux', size: 32 }),
        },
        {
          alt: 'Rust',
          path: '/icon/rust?size=32&color=orange',
          svg: renderIcon({ color: 'orange', icon: 'rust', size: 32 }),
        },
        {
          alt: 'Cloudflare',
          path: '/icon/cloudflare?size=32&color=orange',
          svg: renderIcon({ color: 'orange', icon: 'cloudflare', size: 32 }),
        },
      ],
      subtitle:
        'Lucide stroke icons and Simple Icons / Devicon brand logos with intrinsic pixel sizing.',
      title: 'Standalone Icons (/icon/:icon)',
    },
    {
      isCentered: true,
      items: [
        {
          alt: 'Tech Stack',
          path: '/stack/c,cpp,cs,rust,py,ts:6|docker,cloudflare,linux,git:4',
          svg: renderStack({
            icons: ['c,cpp,cs,rust,py,ts:6|docker,cloudflare,linux,git:4'],
            variant: '2',
          }),
        },
      ],
      subtitle:
        'Multi-group icon grids with per-group columns (:N), side-by-side groups (|), and row bands (;).',
      title: 'Grouped Tech Stacks (/stack/:groups)',
    },
    {
      isCentered: true,
      items: [
        {
          alt: "XulbuX's Quote",
          path: '/quote/XulbuX/Who+says+programmers+are+boring%3F+I+bring+the+humor+to+the+office+while+my+code+brings+the+chaos!?layout=vertical',
          svg: renderQuote({
            author: 'XulbuX',
            color: 'indigo',
            layout: 'vertical',
            text: 'Who says programmers are boring? I bring the humor to the office while my code brings the chaos!',
            variant: '2',
          }),
        },
      ],
      subtitle:
        'Vertical and horizontal pull-quote cards with automatic word-wrapping and watermarks.',
      title: 'Quote Cards (/quote/:author/:text)',
    },
  ];
}

/** Render the bottom navigation links between documentation subpages. */
function renderDocsPager(section: DocsSectionSlug): string {
  const leftArrow = renderUiIcon('arrow-left', 16, 'btn-icon-left');
  const rightArrow = renderUiIcon('arrow-right', 16, 'btn-icon-right');

  const order: readonly { href: string; label: string; slug: DocsSectionSlug }[] = [
    { href: '/docs/badges', label: 'Status Badges', slug: 'badges' },
    { href: '/docs/buttons', label: 'CTA Buttons', slug: 'buttons' },
    { href: '/docs/services', label: 'Live Service Badges', slug: 'services' },
    { href: '/docs/icons', label: 'Standalone Icons', slug: 'icons' },
    { href: '/docs/stack', label: 'Tech Stack Grids', slug: 'stack' },
    { href: '/docs/quotes', label: 'Quote Cards', slug: 'quotes' },
    { href: '/docs/colors', label: 'Theme Colors', slug: 'colors' },
  ];

  let idx = 0;
  for (let i = 0; i < order.length; i += 1) {
    if (order[i].slug === section) {
      idx = i;
      break;
    }
  }

  const prev = idx > 0 ? order[idx - 1] : { href: '/', label: 'Home' };
  const next = idx < order.length - 1 ? order[idx + 1] : { href: '/', label: 'Home' };

  return `<div class="pager-row">
    <a href="${prev.href}" class="btn-secondary">${leftArrow}<span class="btn-label">${prev.label}</span></a>
    <a href="${next.href}" class="btn-primary"><span class="btn-label">${next.label}</span>${rightArrow}</a>
  </div>`;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the `svg.xul.is` homepage (`/`) introducing the API, showcasing live examples, and linking to documentation.
 * @returns Complete HTML document string for the homepage.
 */
export function renderHomeHtml(): string {
  const overviewCards = buildHomeOverviewCards();
  let overviewCardsHtml = '';
  for (const card of overviewCards) {
    overviewCardsHtml += renderShowcaseCard(card);
  }

  const bookIcon = renderUiIcon('book-open', 16);
  const rightArrow = renderUiIcon('arrow-right', 16, 'btn-icon-right');
  const activityIcon = renderUiIcon('activity', 16);

  const bodyHtml = `<section class="hero">
    <h1 class="hero-title">One Cohesive <span class="hero-gradient-text">Edge SVG Engine</span> for READMEs &amp; Docs</h1>
    <p class="hero-lead">
      Dynamic badges, CTA buttons, icons, tech stacks, and quote cards rendered at the edge in a unified 3D Kumo and Tailwind v4 OKLCH design system.
    </p>
    <div class="hero-cta-row">
      <a href="/docs/badges" class="btn-primary">${bookIcon}<span class="btn-label">Explore Docs &amp; Previews</span>${rightArrow}</a>
      <a href="/docs/services" class="btn-secondary">${activityIcon}<span class="btn-label">Live Service Badges</span></a>
    </div>
  </section>

  ${renderHomeFeaturesHtml()}

  <section class="doc-section">
    <div class="section-header">
      <h2 class="section-title">Five Unified Endpoints</h2>
      <p class="section-desc">Expand <strong>View Markdown</strong> on any card to inspect and copy its live snippet.</p>
      ${renderRoutePills([
        'https://svg.xul.is/badge/*',
        'https://svg.xul.is/button/*',
        'https://svg.xul.is/icon/*',
        'https://svg.xul.is/stack/*',
        'https://svg.xul.is/quote/*',
      ])}
    </div>
    <div class="card-grid">${overviewCardsHtml}</div>
    <div class="pager-row" style="justify-content:flex-end;">
      <a href="/docs/badges" class="btn-primary">${bookIcon}<span class="btn-label">Browse Documentation</span>${rightArrow}</a>
    </div>
  </section>`;

  return renderPageLayout({
    activePage: 'home',
    bodyHtml,
    description:
      'Zero-cold-start dynamic SVG badge, CTA button, icon, tech stack, and quote card engine for svg.xul.is.',
    title: 'svg.xul.is · Edge SVG Badge, Button, Icon, Tech Stack & Quote API',
  });
}

/**
 * Render the documentation and interactive preview page for a dedicated element section.
 * @param section   Target section slug (`'badges'`, `'buttons'`, `'services'`, `'icons'`, `'stack'`, `'quotes'`, `'colors'`).
 * @returns Complete HTML document string.
 */
export function renderDocsHtml(section: DocsSectionSlug = 'badges'): string {
  let sectionHtml = '';
  let pageTitle = 'Status Badges · svg.xul.is Documentation';

  switch (section) {
    case 'buttons': {
      sectionHtml = renderButtonsSectionHtml();
      pageTitle = 'CTA Buttons · svg.xul.is Documentation';
      break;
    }
    case 'services': {
      sectionHtml = renderServicesSectionHtml();
      pageTitle = 'Live Service Badges · svg.xul.is Documentation';
      break;
    }
    case 'icons': {
      sectionHtml = renderIconsSectionHtml();
      pageTitle = 'Standalone Icons · svg.xul.is Documentation';
      break;
    }
    case 'stack': {
      sectionHtml = renderStackSectionHtml();
      pageTitle = 'Tech Stack Grids · svg.xul.is Documentation';
      break;
    }
    case 'quotes': {
      sectionHtml = renderQuotesSectionHtml();
      pageTitle = 'Quote Cards · svg.xul.is Documentation';
      break;
    }
    case 'colors': {
      sectionHtml = renderColorsSectionHtml();
      pageTitle = 'Theme Color Tokens · svg.xul.is Documentation';
      break;
    }
    default: {
      sectionHtml = renderBadgesSectionHtml();
      break;
    }
  }

  return renderPageLayout({
    activePage: section,
    bodyHtml: `${sectionHtml}${renderDocsPager(section)}`,
    description: 'Interactive SVG preview studio and parameter reference for svg.xul.is.',
    title: pageTitle,
  });
}
