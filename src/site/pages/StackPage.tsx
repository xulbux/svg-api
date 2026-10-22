/**
 * Tech stack documentation page – Renders the Grouped Tech Stack Icon Grids (`/docs/stack`) section (`<StackSection />` and `renderStackSectionHtml`).
 */

import {
  buildStackParamRows,
  buildStackVariantCards,
  countStackExampleIcons,
} from '@/site/catalog/stack';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import { renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the Tech Stack Grids (`/stack/:groups`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="stack">` JSX fragment.
 */
export function StackSection(): HtmlFragment {
  return (
    <section class="doc-section" id="stack">
      <SectionHeader
        description={`Combine multiple technology groups into one SVG using \`icon@color\` for per-tile colors, \`:N\` for columns, \`|\` for side-by-side groups, and \`;\` for row bands. Every example below renders the same ${countStackExampleIcons()}-icon profile.`}
        routes={[
          '/stack/:groups',
          '/stack?groups=:groups',
          '/stack/c,cpp,cs,rust:4|aws,cloudflare,docker,linux:2;figma,blender,ps:3',
        ]}
        title="Grouped Tech Stack Icon Grids"
      />
      <ParamTable
        rows={buildStackParamRows()}
        label="Tech stack route segment and query parameters"
      />
      <SectionSubhead iconSlug="layers" text="Visual Hierarchy Variants (`?variant=`)" />
      <CardGrid cards={buildStackVariantCards()} />
    </section>
  );
}

/**
 * Render the Tech Stack Grids (`/stack/:groups`) documentation section HTML.
 * @returns HTML string for the `/stack/*` documentation and live preview section.
 */
export function renderStackSectionHtml(): string {
  return renderHtml(<StackSection />);
}
