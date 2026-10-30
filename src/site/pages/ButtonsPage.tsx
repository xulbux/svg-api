/**
 * Buttons Documentation Page
 *
 * Renders the Interactive CTA Buttons (`/docs/buttons`) section (`<ButtonsSection />`).
 */

import { SIZE_TOKENS } from '@/routes/params';
import {
  buildButtonParamRows,
  buildButtonUseCaseCards,
  buildButtonVariantCards,
} from '@/site/catalog/buttons';
import { listRouteAliases } from '@/site/catalog/shared';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import { formatBacktickList } from '@/site/glossary';
import type { HtmlFragment } from '@/site/jsx';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the dedicated CTA Buttons (`/docs/buttons`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="buttons">` JSX fragment.
 */
export function ButtonsSection(): HtmlFragment {
  const prefixes = ['button', ...listRouteAliases('button')];
  const routes: string[] = [];
  for (const suffix of [':label', ':label/:value']) {
    for (const prefix of prefixes) {
      routes.push(`/${prefix}/${suffix}`);
    }
  }
  return (
    <section class="doc-section" id="buttons">
      <SectionHeader
        description={`Action buttons with size presets (${formatBacktickList(SIZE_TOKENS)}), leading and trailing icons, animations, and split compartments.`}
        routes={routes}
        title="Interactive CTA Buttons"
      />
      <ParamTable rows={buildButtonParamRows()} label="Button query parameters" />
      <SectionSubhead iconSlug="layers" text="Visual Hierarchy Variants (`?variant=`)" />
      <CardGrid cards={buildButtonVariantCards()} isThreeColumn={true} />
      <SectionSubhead
        iconSlug="sliders-horizontal"
        text="Size Scale, Trailing Icons, Animations & Split Buttons"
      />
      <CardGrid cards={buildButtonUseCaseCards()} />
    </section>
  );
}
