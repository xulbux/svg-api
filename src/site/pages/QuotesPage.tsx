/**
 * Quotes documentation page – Renders the Styled README Quote Cards (`/docs/quotes`) section (`<QuotesSection />` and `renderQuotesSectionHtml`).
 */

import { BADGE_VARIANT_DESCRIPTORS } from '@/site/catalog/badges';
import {
  buildQuoteParamRows,
  HORIZONTAL_QUOTE_CARDS,
  VERTICAL_QUOTE_CARDS,
} from '@/site/catalog/quotes';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import { renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';
import { QUOTE_SIZE_MAP } from '@/svg/quote';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the Quote Cards (`/quote/*`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="quotes">` JSX fragment.
 */
export function QuotesSection(): HtmlFragment {
  return (
    <section class="doc-section" id="quotes">
      <SectionHeader
        description={`Auto-wrapping quote cards in \`vertical\` centered or \`horizontal\` left-bar layouts across ${Object.keys(QUOTE_SIZE_MAP).length} text sizes and ${BADGE_VARIANT_DESCRIPTORS.length} surface tiers.`}
        routes={['/quote/:author/:text', '/quote/:text', '/quote?text=:text&author=:author']}
        title="Styled README Quote Cards"
      />
      <ParamTable
        rows={buildQuoteParamRows()}
        label="Quote card route segments and query parameters"
      />
      <SectionSubhead iconSlug="rectangle-vertical" text="Vertical Layout (`?layout=vertical`)" />
      <CardGrid cards={VERTICAL_QUOTE_CARDS} isThreeColumn={true} />
      <SectionSubhead
        iconSlug="rectangle-horizontal"
        text="Horizontal Layout (`?layout=horizontal`)"
      />
      <CardGrid cards={HORIZONTAL_QUOTE_CARDS} />
    </section>
  );
}

/**
 * Render the Quote Cards (`/quote/*`) documentation section HTML.
 * @returns HTML string for the `/quote/*` documentation and live preview section.
 */
export function renderQuotesSectionHtml(): string {
  return renderHtml(<QuotesSection />);
}
