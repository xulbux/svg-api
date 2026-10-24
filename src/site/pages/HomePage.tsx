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
import { renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';
import { buildBuilderPath, buildDocsPath, DEFAULT_BUILDER_KIND } from '@/site/navigation';
import { buildHomeJsonLd } from '@/site/seo';
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
        path: '/badge/Status/Operational?variant=2&color=emerald&dot=green',
      },
      { alt: 'PyPI Downloads', path: '/badge/pypi/xulbux/dt', sample: '86.8k' },
      {
        alt: 'Coverage',
        path: '/badge/Coverage/99.4%25?variant=2&color=emerald&icon=shield-check&special=bar:99.4',
      },
      {
        alt: 'Edge Latency',
        path: '/badge/Latency/11ms?variant=2&color=cyan&icon=zap&special=sparkline:19,16,18,15,14,15,12,11',
      },
      {
        alt: 'Uptime',
        path: '/badge/Uptime/99.98%25?variant=3&color=violet&icon=activity&special=strip:9998997999',
      },
      {
        alt: 'Explore Docs',
        href: `${SITE_ORIGIN}/docs/buttons`,
        path: '/button/Explore+Docs?icon=book-open,arrow-right&anim=sheen,none,nudge',
      },
    ],
    subtitle: 'Status badges, live package metrics, inline charts, and action buttons.',
    title: 'Badges & CTA Buttons (/badge/*, /button/*)',
  },
  {
    items: [
      { alt: 'Loading', path: '/icon/loader?color=sky&size=32&anim=spin' },
      { alt: 'Heart', path: '/icon/heart?color=rose&size=32&anim=pulse' },
      { alt: 'Notifications', path: '/icon/bell?color=amber&size=32&anim=shake' },
      { alt: 'Launch', path: '/icon/rocket?color=indigo&size=32&anim=nudge' },
      { alt: 'Cloud', path: '/icon/cloud?color=cyan&size=32&anim=float' },
      { alt: 'Rust', path: '/icon/rust?color=orange&size=32&anim=sheen' },
      { alt: 'TypeScript', path: '/icon/ts?color=blue&size=32' },
      { alt: 'Vue.js', path: '/icon/vue?color=emerald&size=32' },
    ],
    subtitle: 'UI icons and brand logos with custom colors, pixel sizing, and animations.',
    title: 'Standalone Icons (/icon/:icon)',
  },
  {
    isCentered: true,
    items: [{ alt: 'Tech Stack', path: `/stack/${STACK_EXAMPLE_GROUPS}` }],
    subtitle: 'Grouped technology icon grids with custom columns, row bands, and tile animations.',
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
      'Realistic typing animations in terminal, prompt, code editor, browser, or frameless layouts.',
    title: 'Typing Animations (/typing/:lines)',
  },
  {
    isCentered: true,
    items: [
      { alt: "XulbuX's Quote", path: `/quote/XulbuX/${ENCODED_CHAOS_QUOTE}?layout=vertical` },
    ],
    subtitle: 'Auto-wrapping quote cards in vertical and horizontal layouts.',
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
  const serviceCount = Object.keys(SERVICES_CONFIG).length;
  const iconCounts = getIconSetCounts();
  return [
    {
      details:
        'Instant edge rendering and global caching for fast loads in any README or docs site.',
      icon: 'zap',
      title: 'Zero Cold Starts',
    },
    {
      details:
        'One balanced color palette shared across every badge, button, icon, stack, and card.',
      icon: 'palette',
      title: `${THEME_COLOR_NAMES.length} Theme Colors`,
    },
    {
      details: `${formatCountLowerBound(iconCounts.lucide)} UI icons and ${formatCountLowerBound(iconCounts.brand)} brand & tech logos ready to use by slug.`,
      icon: 'layers',
      title: `${formatCountLowerBound(iconCounts.lucide + iconCounts.brand)} Icons`,
    },
    {
      details:
        'Auto-fetched versions, downloads, stars, and health metrics from public registries and forges.',
      icon: 'cpu',
      title: `${serviceCount} Live Services`,
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
        <h2 class="feature-title">
          <UiIcon slug={feature.icon} size={18} />
          <span class="feature-title-text">{feature.title}</span>
        </h2>
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
          Dynamic badges, live service metrics, and animated SVG cards from plain URLs. Public and
          100% free for everyone, with no signup, API keys, or rate limits.
        </p>
        <div class="hero-cta-row">
          <a href={builderPath} class="btn-primary" tabindex="0">
            <UiIcon slug="wand-sparkles" size={16} />
            Start Building
            <UiIcon slug="arrow-right" size={16} />
          </a>
          <a href={docsPath} class="btn-secondary" tabindex="0">
            <UiIcon slug="book-open" size={16} />
            Explore Docs
          </a>
        </div>
      </section>
      <section class="feature-grid" aria-label="Highlights">
        {featureCards}
      </section>
      <section class="doc-section" id="endpoints">
        <SectionHeader
          description="Click any preview to customize it in the **Builder**, or expand **View Markdown** to copy its snippet."
          headingLevel={2}
          routes={ENDPOINT_ROUTES}
          title={`${formatCountWord(ENDPOINT_ROUTES.length)} Unified Endpoints`}
        />
        <CardGrid cards={HOME_OVERVIEW_CARDS} />
      </section>
      <div class="pager-row is-end">
        <a href={docsPath} class="btn-secondary" tabindex="0">
          <UiIcon slug="book-open" size={16} />
          Explore Docs
        </a>
        <a href={builderPath} class="btn-primary" tabindex="0">
          <UiIcon slug="wand-sparkles" size={16} />
          Start Building
          <UiIcon slug="arrow-right" size={16} />
        </a>
      </div>
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
