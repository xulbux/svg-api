/**
 * Typing animation documentation page – Renders the Realistic SVG Typing Animations (`/docs/typing`) section (`<TypingSection />`).
 */

import {
  TYPING_CURSOR_TOKENS,
  TYPING_ERASE_TOKENS,
  TYPING_LAYOUT_TOKENS,
  VARIANT_TOKENS,
} from '@/routes/params';
import { listRouteAliases } from '@/site/catalog/shared';
import {
  buildTypingParamRows,
  TYPING_BEHAVIOR_CARDS,
  TYPING_LAYOUT_CARDS,
  TYPING_VARIANT_CARDS,
} from '@/site/catalog/typing';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import { formatBacktickList } from '@/site/glossary';
import type { HtmlFragment } from '@/site/jsx';
import { DEFAULT_TYPING_ERASE } from '@/svg/typing';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the Typing Animations (`/docs/typing`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="typing">` JSX fragment.
 */
export function TypingSection(): HtmlFragment {
  const alternateEraseTokens = TYPING_ERASE_TOKENS.filter(
    (token) => token !== DEFAULT_TYPING_ERASE
  ).join('|');
  const routes = ['/typing/:lines', '/typing/:prefix/:lines'];
  for (const alias of listRouteAliases('typing')) {
    routes.push(`/${alias}/:lines`);
  }
  return (
    <section class="doc-section" id="typing">
      <SectionHeader
        description={`Natural typing animations across ${TYPING_LAYOUT_TOKENS.length} container layouts (${formatBacktickList(TYPING_LAYOUT_TOKENS)}) with customizable cursors, erase transitions, and fonts.`}
        routes={routes}
        title="Realistic SVG Typing Animations"
      />
      <ParamTable
        rows={buildTypingParamRows()}
        label="Typing animation route segments and query parameters"
      />
      <SectionSubhead
        iconSlug="terminal"
        text={`Container Layouts (\`?layout=${TYPING_LAYOUT_TOKENS.join('|')}\`)`}
      />
      <CardGrid cards={TYPING_LAYOUT_CARDS} />
      <SectionSubhead
        iconSlug="layers"
        text={`Surface Variants & Caret Cursors (\`?variant=${VARIANT_TOKENS.join('|')}\`, \`?cursor=${TYPING_CURSOR_TOKENS.join('|')}\`)`}
      />
      <CardGrid cards={TYPING_VARIANT_CARDS} isThreeColumn={true} />
      <SectionSubhead
        iconSlug="keyboard"
        text={`Erase Modes & Human Keystroke Dynamics (\`?erase=${alternateEraseTokens}\`, \`?typo=true\`)`}
      />
      <CardGrid cards={TYPING_BEHAVIOR_CARDS} isThreeColumn={true} />
    </section>
  );
}
