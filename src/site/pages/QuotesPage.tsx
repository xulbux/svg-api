/**
 * Quotes documentation page – Renders the Styled README Quote Cards (`/docs/quotes`) section (`<QuotesSection />`).
 */

import { QUOTE_LAYOUT_TOKENS, VARIANT_TOKENS } from '@/routes/params';
import {
  buildQuoteParamRows,
  HORIZONTAL_QUOTE_CARDS,
  VERTICAL_QUOTE_CARDS,
} from '@/site/catalog/quotes';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import type { HtmlFragment } from '@/site/jsx';
import { QUOTE_SIZE_MAP } from '@/svg/quote';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the Quote Cards (`/quote/*`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="quotes">` JSX fragment.
 */
export function QuotesSection(): HtmlFragment {
  const layoutCodes = QUOTE_LAYOUT_TOKENS.map((token) => `\`${token}\``).join(' or ');
  return (
    <section class="doc-section" id="quotes">
      <SectionHeader
        description={`Auto-wrapping quote cards in ${layoutCodes} layouts across ${Object.keys(QUOTE_SIZE_MAP).length} text sizes and ${VARIANT_TOKENS.length} surface tiers.`}
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
