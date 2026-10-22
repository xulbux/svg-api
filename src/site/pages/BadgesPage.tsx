/**
 * Badges documentation page – Renders the `22px` Status Badges (`/docs/badges`) section (`<BadgesSection />` and `renderBadgesSectionHtml`).
 */

import {
  BADGE_VARIANT_DESCRIPTORS,
  buildBadgeParamRows,
  buildBadgeUseCaseCards,
  buildBadgeVariantCards,
} from '@/site/catalog/badges';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import { renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the `22px` Status Badges (`/docs/badges`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="badges">` JSX fragment.
 */
export function BadgesSection(): HtmlFragment {
  return (
    <section class="doc-section" id="badges">
      <SectionHeader
        description={`Two-segment and single-segment 22px badges with pulsing radar dots, inline charts, and ${BADGE_VARIANT_DESCRIPTORS.length} visual hierarchy tiers.`}
        routes={['/badge/:label/:value', '/badge/:label']}
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

/**
 * Render the complete `22px` Status Badges (`/docs/badges`) documentation section HTML.
 * @returns HTML string for the `/docs/badges` documentation and live preview section.
 */
export function renderBadgesSectionHtml(): string {
  return renderHtml(<BadgesSection />);
}
