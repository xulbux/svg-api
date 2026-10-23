/**
 * Homepage – Renders the public homepage (`/`) with the hero section, dynamically computed feature highlight cards, and unified endpoint showcase cards.
 */

import { SERVICES_CONFIG } from '@/config/services';
import { SITE_HOST, SITE_ORIGIN } from '@/config/site';
import { THEME_COLOR_NAMES } from '@/config/theme';
import {
  ENCODED_CHAOS_QUOTE,
  ENDPOINT_ROUTES,
  formatCountLowerBound,
  getIconSetCounts,
  STACK_EXAMPLE_GROUPS,
} from '@/site/catalog/shared';
import { PageLayout } from '@/site/components/PageLayout';
import { SectionHeader } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import { UiIcon } from '@/site/components/UiIcon';
import { formatConjunctionList } from '@/site/glossary';
import { renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';
import { buildBuilderPath, buildDocsPath, DEFAULT_BUILDER_KIND } from '@/site/navigation';
import { buildHomeJsonLd } from '@/site/seo';
import { ICON_SOURCE_SETS } from '@/svg/icons';
import { BADGE_HEIGHT } from '@/svg/renderer';
import type { ShowcaseCardConfig } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Feature highlight card displayed on the `/` homepage. */
interface FeatureCardItem {
  /** Short feature explanation. */
  readonly details: string;
  /** Lucide icon slug. */
  readonly icon: string;
  /** Feature headline. */
  readonly title: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

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
      {
        alt: 'Status Operational',
        path: '/badge/Status/Operational?dot=green&color=emerald&variant=2',
      },
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
    subtitle: `Static ${BADGE_HEIGHT}px badges, live package metrics, inline data widgets, and 3D CTA buttons.`,
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
    subtitle: `${ICON_SOURCE_SETS.stroke[0]} stroke icons and ${formatConjunctionList(ICON_SOURCE_SETS.brand)} brand logos with OKLCH colors, custom sizing, and SMIL motions.`,
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
      {
        alt: 'Typing Animation',
        path: '/typing/Full-Stack+Developer;Design-Driven+Engineering;Edge+Systems+Architect?title=zsh&hint=UTF-8',
      },
    ],
    subtitle:
      'Human-cadence typing animations in Kumo 3D terminal windows, command / AI prompt bars, code editors, browser bars, or frameless headlines.',
    title: 'Typing Animations (/typing/:lines)',
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

/** Memoized homepage HTML (`undefined` until first rendered). */
let homeHtmlCache: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Format a small count as a capitalized English word (`5` -> `'Five'`), falling back to digits. */
function formatCountWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

/** Build the homepage feature highlight cards (every count is computed from the code it describes). */
function buildHomeFeatures(): FeatureCardItem[] {
  const publicServiceTitles: string[] = [];
  for (const service of Object.values(SERVICES_CONFIG)) {
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
      details: `All SVG endpoints share ${THEME_COLOR_NAMES.length} Tailwind v4 OKLCH color tokens.`,
      icon: 'palette',
      title: 'Unified OKLCH Palette',
    },
    {
      details: `Combine ${formatCountLowerBound(iconCounts.lucide)} ${ICON_SOURCE_SETS.stroke[0]} stroke icons with ${formatCountLowerBound(iconCounts.brand)} ${formatConjunctionList(ICON_SOURCE_SETS.brand)} brand logos.`,
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

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the homepage as a JSX component.
 * @returns Complete homepage JSX document fragment.
 */
export function HomePage(): HtmlFragment {
  const docsPath = buildDocsPath('overview');
  const builderPath = buildBuilderPath(DEFAULT_BUILDER_KIND);
  const featureCards: HtmlFragment[] = [];
  for (const feature of buildHomeFeatures()) {
    featureCards.push(
      <div class="feature-card">
        <div class="feature-icon">
          <UiIcon slug={feature.icon} size={20} />
        </div>
        <h2 class="feature-title">{feature.title}</h2>
        <p class="feature-desc">{feature.details}</p>
      </div>
    );
  }

  const homeDescription = `Zero-cold-start dynamic SVG graphics and live repository telemetry engine at the edge for ${SITE_HOST}.`;

  return (
    <PageLayout
      activeNav="home"
      canonicalPath="/"
      description={homeDescription}
      jsonLd={buildHomeJsonLd(homeDescription)}
      title={`${SITE_HOST} · Edge SVG Graphics & Live Telemetry Engine`}>
      <section class="hero">
        <h1 class="hero-title">
          One Cohesive <span class="hero-accent">Edge SVG Engine</span> for READMEs & Docs
        </h1>
        <p class="hero-lead">
          Dynamic status badges, interactive vector graphics, and live upstream metrics: Every
          element is a plain URL, composed visually in seconds and rendered at the edge; 100% free
          for everyone, with no signup, no API keys, and no rate limits.
        </p>
        <div class="hero-cta-row">
          <a href={builderPath} class="btn-primary" tabindex="0">
            <UiIcon slug="wand-sparkles" size={16} />
            Start Building
            <UiIcon slug="arrow-right" size={16} />
          </a>
          <a href={docsPath} class="btn-secondary" tabindex="0">
            <UiIcon slug="book-open" size={16} />
            Explore Docs & Previews
          </a>
        </div>
      </section>
      <section class="feature-grid" aria-label="Highlights">
        {featureCards}
      </section>
      <section class="doc-section" id="endpoints">
        <SectionHeader
          description="Expand **View Markdown** on any card to inspect and copy its live snippet, or click a preview to customize it in the Builder."
          headingLevel={2}
          routes={ENDPOINT_ROUTES}
          title={`${formatCountWord(ENDPOINT_ROUTES.length)} Unified Endpoints`}
        />
        <CardGrid cards={HOME_OVERVIEW_CARDS} />
        <div class="pager-row is-end">
          <a href={docsPath} class="btn-secondary" tabindex="0">
            <UiIcon slug="book-open" size={16} />
            Browse Documentation
          </a>
          <a href={builderPath} class="btn-primary" tabindex="0">
            <UiIcon slug="wand-sparkles" size={16} />
            Start Building
            <UiIcon slug="arrow-right" size={16} />
          </a>
        </div>
      </section>
    </PageLayout>
  );
}

/**
 * Render (once per isolate) the homepage introducing the API, showcasing live examples, and linking to documentation.
 * @returns Complete HTML document string for the homepage.
 */
export function renderHomeHtml(): string {
  homeHtmlCache ??= renderHtml(<HomePage />);
  return homeHtmlCache;
}
