/**
 * Documentation Pages
 *
 * Renders the Getting Started overview (`/docs`) and the dedicated element documentation pages (`/docs/:section`).
 *
 * Every page is deterministic, so each one is rendered once per Worker isolate and then served from memory.
 */

import { SITE_NAME } from '@/config/site';
import { DocsPager } from '@/site/components/DocsPager';
import { PageLayout } from '@/site/components/PageLayout';
import { renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';
import { buildDocsPath, buildDocsSidebar, getDocsPageMeta } from '@/site/navigation';
import { BadgesSection } from '@/site/pages/BadgesPage';
import { ButtonsSection } from '@/site/pages/ButtonsPage';
import { ColorsSection } from '@/site/pages/ColorsPage';
import { IconsSection } from '@/site/pages/IconsPage';
import { OverviewSection } from '@/site/pages/OverviewPage';
import { QuotesSection } from '@/site/pages/QuotesPage';
import { ServicesSection } from '@/site/pages/ServicesPage';
import { StackSection } from '@/site/pages/StackPage';
import { TypingSection } from '@/site/pages/TypingPage';
import { buildDocsJsonLd } from '@/site/seo';
import type { DocsPageSlug, DocsSectionSlug } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the `<DocsPage />` component. */
interface DocsPageProps {
  /** Target documentation page slug (`'overview'` for `/docs`, or a `DocsSectionSlug`). */
  readonly slug?: DocsPageSlug;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Section JSX components keyed by documentation page slug. */
const PAGE_SECTIONS: Readonly<Record<DocsPageSlug, () => HtmlFragment>> = {
  badges: BadgesSection,
  buttons: ButtonsSection,
  colors: ColorsSection,
  icons: IconsSection,
  overview: OverviewSection,
  quotes: QuotesSection,
  services: ServicesSection,
  stack: StackSection,
  typing: TypingSection,
};

/** Memoized documentation pages keyed by slug. */
const DOCS_HTML_CACHE: Partial<Record<DocsPageSlug, string>> = {};

// -------------------------------------- INTERNALS --------------------------------------

/** Render a documentation page (`<PageLayout />` wrapping the section and `<DocsPager />`) as a JSX component. */
function DocsPage(props: DocsPageProps): HtmlFragment {
  const slug = props.slug ?? 'overview';
  const meta = getDocsPageMeta(slug);
  const canonicalPath = buildDocsPath(slug);
  const pageTitle = `${meta.title} · ${SITE_NAME}`;
  const SectionComponent = PAGE_SECTIONS[slug];
  return (
    <PageLayout
      activeNav="docs"
      canonicalPath={canonicalPath}
      description={meta.description}
      jsonLd={buildDocsJsonLd(meta.title, meta.description, canonicalPath)}
      sidebar={buildDocsSidebar(slug)}
      title={pageTitle}>
      <SectionComponent />
      <DocsPager slug={slug} />
    </PageLayout>
  );
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Check whether a raw slug is a valid documentation section (`/docs/:section`; The overview lives at `/docs`).
 * @param slug   Raw, lowercased `/docs/:section` slug.
 * @returns `true` when `slug` is a known `DocsSectionSlug`.
 */
export function isDocsSectionSlug(slug: string): slug is DocsSectionSlug {
  return slug !== 'overview' && Object.hasOwn(PAGE_SECTIONS, slug);
}

/**
 * Render (once per isolate) a documentation page: The Getting Started overview or a dedicated element section.
 * @param slug   Target documentation page slug.
 * @returns Complete HTML document string.
 */
export function renderDocsHtml(slug: DocsPageSlug = 'overview'): string {
  const cached = DOCS_HTML_CACHE[slug];
  if (cached !== undefined) {
    return cached;
  }

  const html = renderHtml(<DocsPage slug={slug} />);
  DOCS_HTML_CACHE[slug] = html;
  return html;
}
