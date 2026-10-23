/**
 * 404 Not Found page – Branded `noindex` HTML error page (`<NotFoundPage />` and `renderNotFoundHtml`) for unknown documentation, builder, and site paths.
 */

import { SITE_HOST } from '@/config/site';
import { PageLayout } from '@/site/components/PageLayout';
import { UiIcon } from '@/site/components/UiIcon';
import { renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';
import { buildBuilderPath, buildDocsPath, DEFAULT_BUILDER_KIND } from '@/site/navigation';

// ---------------------------------------- CONSTS ---------------------------------------

/** Memoized `404` HTML document (`undefined` until first rendered). */
let notFoundHtmlCache: string | undefined = undefined;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the branded `404 Not Found` HTML page as a JSX component.
 * @returns Complete `<PageLayout />` JSX document fragment marked `noindex`.
 */
export function NotFoundPage(): HtmlFragment {
  const builderPath = buildBuilderPath(DEFAULT_BUILDER_KIND);
  const docsPath = buildDocsPath('overview');
  return (
    <PageLayout
      activeNav="none"
      description={`The requested page could not be found on ${SITE_HOST}.`}
      isNoIndex={true}
      title={`404 Not Found · ${SITE_HOST}`}>
      <section class="hero">
        <h1 class="hero-title">
          404 <span class="hero-accent">Page Not Found</span>
        </h1>
        <p class="hero-lead">
          That documentation section or URL does not exist. Open the interactive URL Builder or
          browse the endpoint documentation below.
        </p>
        <div class="hero-cta-row">
          <a href={builderPath} class="btn-primary" tabindex="0">
            <UiIcon slug="wand-sparkles" size={16} />
            Open URL Builder
            <UiIcon slug="arrow-right" size={16} />
          </a>
          <a href={docsPath} class="btn-secondary" tabindex="0">
            <UiIcon slug="book-open" size={16} />
            Browse Documentation
          </a>
        </div>
      </section>
    </PageLayout>
  );
}

/**
 * Render (once per isolate) the branded `404 Not Found` HTML document.
 * @returns Complete HTML document string.
 */
export function renderNotFoundHtml(): string {
  notFoundHtmlCache ??= renderHtml(<NotFoundPage />);
  return notFoundHtmlCache;
}
