/**
 * Documentation Pager Component
 *
 * Bottom previous/next navigation links (`<DocsPager />`) between documentation pages in sidebar order.
 */

import { UiIcon } from '@/site/components/UiIcon';
import type { HtmlFragment } from '@/site/jsx';
import { buildDocsPath, DOCS_PAGES } from '@/site/navigation';
import type { DocsPageSlug } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the `<DocsPager />` component. */
interface DocsPagerProps {
  /** Current documentation page slug. */
  readonly slug: DocsPageSlug;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Find the index of a documentation page in sidebar order (`-1` when unknown). */
function findDocsPageIndex(slug: DocsPageSlug): number {
  return DOCS_PAGES.findIndex((meta) => meta.slug === slug);
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the bottom navigation links between documentation pages (in sidebar order) as a JSX component.
 * @param props   Docs pager props (`slug`).
 * @returns Rendered `<nav class="pager-row">` JSX fragment.
 */
export function DocsPager(props: DocsPagerProps): HtmlFragment {
  const pageIndex = findDocsPageIndex(props.slug);
  const prev = DOCS_PAGES[pageIndex - 1];
  const next = DOCS_PAGES[pageIndex + 1];
  return (
    <nav class={prev ? 'pager-row' : 'pager-row is-end'} aria-label="Documentation pagination">
      {prev ? (
        <a href={buildDocsPath(prev.slug)} class="btn-secondary" rel="prev" tabindex="0">
          <UiIcon slug="arrow-left" size={16} extraClass="btn-arrow-left" />
          {prev.pagerLabel}
        </a>
      ) : undefined}
      {next ? (
        <a href={buildDocsPath(next.slug)} class="btn-primary" rel="next" tabindex="0">
          {next.pagerLabel}
          <UiIcon slug="arrow-right" size={16} extraClass="btn-arrow-right" />
        </a>
      ) : undefined}
    </nav>
  );
}
