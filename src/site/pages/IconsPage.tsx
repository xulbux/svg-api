/**
 * Icons documentation page – Renders the Standalone Icons (`/docs/icons`) section (`<IconsSection />`).
 */

import { buildIconParamRows, ICON_CARDS } from '@/site/catalog/icons';
import { formatCountLowerBound, getIconSetCounts } from '@/site/catalog/shared';
import { AliasList, ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import { formatConjunctionList } from '@/site/glossary';
import type { HtmlFragment } from '@/site/jsx';
import { ICON_SLUG_ALIASES, ICON_SOURCE_SETS } from '@/svg/icons';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the Standalone Icons (`/icon/:icon`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="icons">` JSX fragment.
 */
export function IconsSection(): HtmlFragment {
  const iconCounts = getIconSetCounts();
  return (
    <section class="doc-section" id="icons">
      <SectionHeader
        description={`${formatCountLowerBound(iconCounts.lucide)} ${ICON_SOURCE_SETS.stroke[0]} stroke icons and ${formatCountLowerBound(iconCounts.brand)} ${formatConjunctionList(ICON_SOURCE_SETS.brand)} brand marks with intrinsic pixel dimensions baked into the root \`<svg>\`.`}
        routes={['/icon/:icon']}
        title="Standalone UI & Brand Icons"
      />
      <ParamTable rows={buildIconParamRows()} label="Icon route segment and query parameters" />
      <SectionSubhead iconSlug="shapes" text="Icon Examples" />
      <CardGrid cards={ICON_CARDS} />
      <SectionSubhead iconSlug="link" text="Slug Aliases" />
      <AliasList aliases={ICON_SLUG_ALIASES} label="Icon slug aliases" />
    </section>
  );
}
