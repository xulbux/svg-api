/**
 * Colors documentation page – Renders the Tailwind v4 OKLCH Theme Colors (`/docs/colors`) section (`<ColorsSection />`).
 */

import { THEME_COLOR_NAMES } from '@/config/theme';
import { buildColorSwatchCards } from '@/site/catalog/colors';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import type { HtmlFragment } from '@/site/jsx';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the Tailwind v4 OKLCH Theme Colors (`/docs/colors`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="colors">` JSX fragment.
 */
export function ColorsSection(): HtmlFragment {
  const colorCount = THEME_COLOR_NAMES.length;
  return (
    <section class="doc-section" id="colors">
      <SectionHeader
        description={`Every endpoint accepts any of the ${colorCount} harmonically balanced OKLCH color names below.`}
        title={`${colorCount} Tailwind v4 OKLCH Theme Colors (\`?color=\`)`}
      />
      <SectionSubhead iconSlug="swatch-book" text="Color Swatches by Variant" />
      <CardGrid cards={buildColorSwatchCards()} />
    </section>
  );
}
