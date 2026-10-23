/**
 * Badges documentation page – Renders the Status Badges (`/docs/badges`) section (`<BadgesSection />`).
 */

import { VARIANT_TOKENS } from '@/routes/params';
import {
  buildBadgeParamRows,
  buildBadgeUseCaseCards,
  buildBadgeVariantCards,
} from '@/site/catalog/badges';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import type { HtmlFragment } from '@/site/jsx';
import { BADGE_HEIGHT } from '@/svg/renderer';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the Status Badges (`/docs/badges`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="badges">` JSX fragment.
 */
export function BadgesSection(): HtmlFragment {
  return (
    <section class="doc-section" id="badges">
      <SectionHeader
        description={`Two-segment, single-segment, value-only, and icon-only ${BADGE_HEIGHT}px badges with pulsing radar dots, inline charts, and ${VARIANT_TOKENS.length} visual hierarchy tiers.`}
        routes={['/badge/:label/:value', '/badge/:label', '/badge//:value', '/badge']}
        title="Status & Metadata Badges"
      />
      <ParamTable rows={buildBadgeParamRows()} label="Badge route segments and query parameters" />
      <SectionSubhead iconSlug="layers" text="Visual Hierarchy Variants (`?variant=`)" />
      <CardGrid cards={buildBadgeVariantCards()} isThreeColumn={true} />
      <SectionSubhead iconSlug="zap" text="Inline Widgets, Status Dots & Layouts" />
      <CardGrid cards={buildBadgeUseCaseCards()} />
    </section>
  );
}
