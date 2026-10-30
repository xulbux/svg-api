/**
 * Tech Stack Documentation Page
 *
 * Renders the Grouped Tech Stack Icon Grids (`/docs/stack`) section (`<StackSection />`).
 */

import { ACTIVE_STACK_MOTION_TOKENS } from '@/routes/params';
import {
  buildStackAnimationCards,
  buildStackParamRows,
  buildStackVariantCards,
} from '@/site/catalog/stack';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import type { HtmlFragment } from '@/site/jsx';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the Tech Stack Grids (`/stack/:groups`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="stack">` JSX fragment.
 */
export function StackSection(): HtmlFragment {
  const activeMotions = ACTIVE_STACK_MOTION_TOKENS.join('|');
  return (
    <section class="doc-section" id="stack">
      <SectionHeader
        description="Arrange technology icons into grouped grids using `:N` columns, `|` side-by-side groups, `;` row bands, and `@color` per-tile overrides."
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
      <SectionSubhead
        iconSlug="sparkles"
        text={`Tile Micro-Animations (\`?anim=${activeMotions}\`)`}
      />
      <CardGrid cards={buildStackAnimationCards()} isThreeColumn={true} />
    </section>
  );
}
