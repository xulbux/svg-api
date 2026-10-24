/**
 * Quotes documentation page – Renders the Styled README Quote Cards (`/docs/quotes`) section (`<QuotesSection />`).
 */

import { QUOTE_LAYOUT_TOKENS } from '@/routes/params';
import {
  buildQuoteParamRows,
  HORIZONTAL_QUOTE_CARDS,
  VERTICAL_QUOTE_CARDS,
} from '@/site/catalog/quotes';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import { formatBacktickList } from '@/site/glossary';
import type { HtmlFragment } from '@/site/jsx';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the Quote Cards (`/quote/*`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="quotes">` JSX fragment.
 */
export function QuotesSection(): HtmlFragment {
  return (
    <section class="doc-section" id="quotes">
      <SectionHeader
        description={`Auto-wrapping quote cards in ${formatBacktickList(QUOTE_LAYOUT_TOKENS, ' or ')} layouts with customizable width, text size, and accent color.`}
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
