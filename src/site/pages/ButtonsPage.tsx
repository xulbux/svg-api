/**
 * Buttons documentation page – Renders the Interactive CTA Buttons (`/docs/buttons`) section (`<ButtonsSection />` and `renderButtonsSectionHtml`).
 */

import { SIZE_TOKENS } from '@/routes/params';
import {
  buildButtonParamRows,
  buildButtonVariantCards,
  BUTTON_USE_CASE_CARDS,
} from '@/site/catalog/buttons';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import { renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the dedicated CTA Buttons (`/docs/buttons`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="buttons">` JSX fragment.
 */
export function ButtonsSection(): HtmlFragment {
  const sizePresetCodes: string[] = [];
  for (const presetName of SIZE_TOKENS) {
    sizePresetCodes.push(`\`${presetName}\``);
  }
  const sizePresetsMarkup = sizePresetCodes.join(', ');
  return (
    <section class="doc-section" id="buttons">
      <SectionHeader
        description={`Dedicated 3D Kumo action buttons with configurable size presets (${sizePresetsMarkup}), trailing icons, and split compartments.`}
        routes={['/button/:label', '/btn/:label', '/button/:label/:value', '/btn/:label/:value']}
        title="Interactive CTA Buttons"
      />
      <ParamTable rows={buildButtonParamRows()} label="Button query parameters" />
      <SectionSubhead iconSlug="layers" text="Visual Hierarchy Variants (`?variant=`)" />
      <CardGrid cards={buildButtonVariantCards()} isThreeColumn={true} />
      <SectionSubhead
        iconSlug="sliders-horizontal"
        text="Size Scale, Trailing Icons, Animations & Split Buttons"
      />
      <CardGrid cards={BUTTON_USE_CASE_CARDS} />
    </section>
  );
}

/**
 * Render the dedicated CTA Buttons (`/docs/buttons`) documentation section HTML.
 * @returns HTML string for the `/docs/buttons` documentation and live preview section.
 */
export function renderButtonsSectionHtml(): string {
  return renderHtml(<ButtonsSection />);
}
