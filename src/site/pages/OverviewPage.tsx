/**
 * Getting Started overview page – Renders the `/docs` overview section (`<OverviewSection />`).
 */

import {
  buildCachingRows,
  buildSharedParamRows,
  CACHING_COLUMNS,
  EMBEDDING_CARDS,
  SEGMENT_ENCODING_COLUMNS,
  SEGMENT_ENCODING_ROWS,
  SHARED_PARAM_COLUMNS,
  URL_ANATOMY_PARTS,
} from '@/site/catalog/overview';
import { ENDPOINT_ROUTES } from '@/site/catalog/shared';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import { UrlAnatomy } from '@/site/components/UrlAnatomy';
import type { HtmlFragment } from '@/site/jsx';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the Getting Started (`/docs`) overview section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="overview">` JSX fragment.
 */
export function OverviewSection(): HtmlFragment {
  return (
    <section class="doc-section" id="overview">
      <SectionHeader
        description="Every element is a plain `GET` URL returning an SVG; Public and 100% free with no signup, API keys, or rate limits. Build URLs visually in the **Builder**, or compose them directly below."
        routes={ENDPOINT_ROUTES}
        title="Getting Started"
      />
      <SectionSubhead iconSlug="link" text="URL Anatomy" />
      <UrlAnatomy parts={URL_ANATOMY_PARTS} />
      <SectionSubhead iconSlug="binary" text="Encoding Path Segments" />
      <ParamTable
        rows={SEGMENT_ENCODING_ROWS}
        label="Path segment encoding rules"
        columns={SEGMENT_ENCODING_COLUMNS}
      />
      <SectionSubhead iconSlug="sliders-horizontal" text="Shared Query Parameters" />
      <ParamTable
        rows={buildSharedParamRows()}
        label="Query parameters shared across endpoints"
        columns={SHARED_PARAM_COLUMNS}
      />
      <SectionSubhead iconSlug="code" text="Embedding in READMEs & Docs" />
      <CardGrid cards={EMBEDDING_CARDS} />
      <SectionSubhead iconSlug="timer" text="Edge Caching" />
      <ParamTable
        rows={buildCachingRows()}
        label="Edge cache lifetimes"
        columns={CACHING_COLUMNS}
      />
    </section>
  );
}
