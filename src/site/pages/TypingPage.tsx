/**
 * Typing animation documentation page – Renders the Realistic SVG Typing Animations (`/docs/typing`) section (`<TypingSection />` and `renderTypingSectionHtml`).
 */

import {
  TYPING_CURSOR_TOKENS,
  TYPING_ERASE_TOKENS,
  TYPING_FONT_TOKENS,
  TYPING_LAYOUT_TOKENS,
} from '@/routes/params';
import { BADGE_VARIANT_DESCRIPTORS } from '@/site/catalog/badges';
import {
  buildTypingParamRows,
  TYPING_BEHAVIOR_CARDS,
  TYPING_LAYOUT_CARDS,
  TYPING_VARIANT_CARDS,
} from '@/site/catalog/typing';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import { renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the Typing Animations (`/typing/*` and `/type/*`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="typing">` JSX fragment.
 */
export function TypingSection(): HtmlFragment {
  return (
    <section class="doc-section" id="typing">
      <SectionHeader
        description={`Human-cadence typing animations in ${TYPING_LAYOUT_TOKENS.length} container frames (\`window\`, \`prompt\`, \`ide\`, \`browser\`, \`none\`), ${BADGE_VARIANT_DESCRIPTORS.length} surface tiers, ${TYPING_CURSOR_TOKENS.length} cursor styles, ${TYPING_ERASE_TOKENS.length} erase modes, and ${TYPING_FONT_TOKENS.length} bundled vector fonts (\`JetBrains Mono\` and \`Geist Sans\`).`}
        routes={['/typing/:lines', '/typing/:prefix/:lines', '/type/:lines']}
        title="Realistic SVG Typing Animations"
      />
      <ParamTable
        rows={buildTypingParamRows()}
        label="Typing animation route segments and query parameters"
      />
      <SectionSubhead
        iconSlug="terminal"
        text="Container Layouts (`?layout=window|prompt|ide|browser|none`)"
      />
      <CardGrid cards={TYPING_LAYOUT_CARDS} />
      <SectionSubhead
        iconSlug="layers"
        text="Surface Variants & Caret Cursors (`?variant=1|2|3`, `?cursor=bar|block|underscore`)"
      />
      <CardGrid cards={TYPING_VARIANT_CARDS} isThreeColumn={true} />
      <SectionSubhead
        iconSlug="keyboard"
        text="Erase Modes & Human Keystroke Dynamics (`?erase=select|fade`, `?typo=true`)"
      />
      <CardGrid cards={TYPING_BEHAVIOR_CARDS} isThreeColumn={true} />
    </section>
  );
}

/**
 * Render the Typing Animations (`/typing/*`) documentation section HTML.
 * @returns HTML string for the `/typing/*` documentation and live preview section.
 */
export function renderTypingSectionHtml(): string {
  return renderHtml(<TypingSection />);
}
