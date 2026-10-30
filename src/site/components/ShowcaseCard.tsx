/**
 * Showcase Card Components
 *
 * Live SVG preview cards (`<ShowcaseCard />`) and grids (`<CardGrid />`) with scoped inline SVG IDs,
 * builder links, and syntax-highlighted Markdown code drawers.
 */

import { SITE_ORIGIN } from '@/config/site';
import { resolveBuilderTarget } from '@/routes/schema';
import { renderSvgPath, resolveSvgPathRedirectUrl } from '@/routes/svg';
import { AnchorLink, CopyButton, slugifyText, UiIcon } from '@/site/components/UiIcon';
import { raw } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';
import { buildMarkdownSnippetTokens } from '@/site/shared/snippets';
import { escapeXml, hashText } from '@/svg/shared';
import type { HighlightToken, ShowcaseCardConfig, TrailingParenthetical } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the `<CardGrid />` component. */
interface CardGridProps {
  /** Showcase card configurations to render inside the grid. */
  readonly cards: readonly ShowcaseCardConfig[];
  /** Whether to use the 3-column variant grid modifier (`is-3col`). */
  readonly isThreeColumn?: boolean | undefined;
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches comma-separated items inside a card title parenthetical. */
const COMMA_SPLIT_RX = /,\s*/;

/** Matches SVG `id="…"` attributes and their `url(#…)` / `href="#…"` references for per-instance ID scoping. */
const SVG_ID_REFERENCE_RX = /(?<prefix>\sid="|url\(#|href="#)(?<name>[^")]+)/g;

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Prefix every `id` and internal `url(#…)` / `href="#…"` reference of an inline SVG with a unique scope,
 * so many inlined previews never share element IDs (gradient, clip, and sheen definitions).
 */
function scopeSvgIds(svg: string, scope: string): string {
  return svg.replace(SVG_ID_REFERENCE_RX, `$<prefix>${scope}-$<name>`);
}

/** Serialize highlight tokens into `<span class="hl-*">` HTML (their text content is the exact snippet). */
function serializeHighlightTokenLine(tokens: readonly HighlightToken[]): string {
  let html = '';
  for (const [className, text] of tokens) {
    html += `<span class="${className}">${escapeXml(text)}</span>`;
  }
  return html;
}

/**
 * Split a trailing ` (parenthetical)` group off a string without regex backtracking.
 * @param text   Trimmed input text (e.g., `'Primary Badge (Default)'`).
 * @returns Main text and parenthetical content, or `undefined` when there is no trailing group.
 */
function splitTrailingParenthetical(text: string): TrailingParenthetical | undefined {
  if (!text.endsWith(')')) {
    return undefined;
  }
  const openIndex = text.lastIndexOf(' (');
  if (openIndex <= 0) {
    return undefined;
  }
  const paren = text.slice(openIndex + 2, -1).trim();
  const main = text.slice(0, openIndex).trim();
  if (!paren || !main || paren.includes('(') || paren.includes(')')) {
    return undefined;
  }
  return { main, paren };
}

/** Format a card title string into hierarchical JSX with a primary heading, optional leading code badge, and optional trailing meta/status pills. */
function renderCardTitleChildren(rawTitle: string): HtmlFragment {
  let remainder = rawTitle.trim();
  const trailingPills: HtmlFragment[] = [];

  // [1] Extract the trailing parenthetical group first so inner symbols never interfere with ` · ` prefix splitting:
  const trailing = splitTrailingParenthetical(remainder);
  if (trailing) {
    remainder = trailing.main;
    for (const part of trailing.paren.split(COMMA_SPLIT_RX)) {
      const cleanPart = part.trim();
      if (cleanPart.length > 0) {
        const isCodeMeta =
          cleanPart.startsWith('/') ||
          cleanPart.startsWith('?') ||
          cleanPart.startsWith('@') ||
          cleanPart.includes('=');
        trailingPills.push(
          isCodeMeta ? (
            <code class="card-title-meta">{cleanPart}</code>
          ) : (
            <span class="card-title-pill">{cleanPart}</span>
          )
        );
      }
    }
  }

  // [2] Extract the leading `code · ` prefix if present on the main title text:
  let prefixBadge: HtmlFragment | undefined = undefined;
  const dotSeparatorIndex = remainder.indexOf(' · ');
  if (dotSeparatorIndex !== -1) {
    const prefix = remainder.slice(0, dotSeparatorIndex).trim();
    remainder = remainder.slice(dotSeparatorIndex + 3).trim();
    prefixBadge = <code class="card-title-code">{prefix}</code>;
  }

  return (
    <>
      {prefixBadge}
      {remainder}
      {trailingPills}
    </>
  );
}

// -------------------------------------- PUBLIC API -------------------------------------

export { splitTrailingParenthetical };

/**
 * Render a showcase card containing SVG previews (rendered from each item's documented path through the live route dispatcher,
 * each linking to its prefilled builder) and an expandable `<details>` Markdown drawer.
 * @param card   Showcase card configuration with items and titles.
 * @returns Rendered `<div class="card-container">` JSX fragment.
 */
export function ShowcaseCard(card: ShowcaseCardConfig): HtmlFragment {
  const cardId = slugifyText(card.title);
  const titleId = `${cardId}-title`;
  const scopePrefix = `p${hashText(cardId)}`;
  const previewNodes: HtmlFragment[] = [];
  const markdownLines: string[] = [];

  for (let i = 0; i < card.items.length; i += 1) {
    const item = card.items[i];
    if (item) {
      const svg = scopeSvgIds(renderSvgPath(item.path, item.sample), `${scopePrefix}-${i}`);
      const builderTarget = resolveBuilderTarget(item.path);
      previewNodes.push(
        builderTarget ? (
          <>
            <a
              class="preview-link"
              href={builderTarget.href}
              rel="nofollow"
              aria-label={`Open “${item.alt}” in the Builder`}
              title="Open in Builder"
              tabindex="0">
              {raw(svg)}
            </a>
            {'\n'}
          </>
        ) : (
          <>
            {raw(svg)}
            {'\n'}
          </>
        )
      );
      const href = item.href ?? resolveSvgPathRedirectUrl(item.path);
      const snippetTokens = buildMarkdownSnippetTokens(
        `${SITE_ORIGIN}${item.path}`,
        item.alt,
        href
      );
      markdownLines.push(serializeHighlightTokenLine(snippetTokens));
    }
  }

  const stageClass = card.isCentered ? 'preview-stage is-centered' : 'preview-stage';

  return (
    <div class="card-container" id={cardId}>
      <div class="card">
        <div class="card-head">
          <div class="card-title-row">
            <h3 class="card-title" id={titleId}>
              {renderCardTitleChildren(card.title)}
            </h3>
            <AnchorLink targetId={cardId} label={card.title} />
          </div>
          {card.subtitle ? <p class="card-subtitle">{card.subtitle}</p> : undefined}
        </div>
        <div class={stageClass}>{previewNodes}</div>
        <details class="code-drawer">
          <summary>
            <UiIcon slug="chevron-right" size={14} extraClass="drawer-chevron" />
            View Markdown
          </summary>
          <div class="code-drawer-body">
            <button type="button" class="scroll-btn scroll-btn-left" aria-label="Scroll code left">
              <UiIcon slug="chevron-left" size={12} />
            </button>
            <button
              type="button"
              class="scroll-btn scroll-btn-right"
              aria-label="Scroll code right">
              <UiIcon slug="chevron-right" size={12} />
            </button>
            <CopyButton ariaDescribedBy={titleId} />
            <pre
              class="code-pre"
              tabindex="0"
              role="region"
              aria-label={`Markdown snippet: ${card.title}`}>
              <code>{raw(markdownLines.join('\n'))}</code>
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
}

/**
 * Render a `<div class="card-grid">` wrapping a list of showcase cards.
 * @param props   Card grid props (`cards` and optional `isThreeColumn`).
 * @returns Rendered `<div class="card-grid">` JSX fragment.
 */
export function CardGrid(props: CardGridProps): HtmlFragment {
  const cardFragments: HtmlFragment[] = [];
  for (const card of props.cards) {
    cardFragments.push(<ShowcaseCard {...card} />);
  }
  const gridClass = props.isThreeColumn ? 'card-grid is-3col' : 'card-grid';
  return <div class={gridClass}>{cardFragments}</div>;
}
