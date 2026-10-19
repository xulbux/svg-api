/**
 * Documentation components – Lucide UI icons, showcase cards with live SVG previews and Markdown code drawers, parameter tables, section headers, route pills, and alias lists.
 *
 * Every preview is rendered from its documented path by the live route dispatcher (`src/routes/svg.ts`).
 */

import { SITE_ORIGIN } from '@/config/site';
import { resolveBuilderTarget } from '@/routes/schema';
import { renderSvgPath, resolveSvgPathRedirectUrl } from '@/routes/svg';
import { resolveIcon } from '@/svg/icons';
import { escapeXml, hashText } from '@/svg/shared';
import type {
  ParamTableRow,
  SectionHeaderOptions,
  ShowcaseCardConfig,
  ShowcaseItem,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Leading and trailing parts of a `main (parenthetical)` string. */
interface TrailingParenthetical {
  /** Text before the trailing parenthetical group. */
  main: string;
  /** Text inside the trailing parenthetical group. */
  paren: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Shared SVG root attributes of every inline UI icon. */
const UI_ICON_SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"';

/** Additional SVG root attributes of Lucide stroke UI icons. */
const LUCIDE_STROKE_ATTRS =
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

/** Memoized inline UI icon HTML keyed by `slug|size|extraClass`. */
const UI_ICON_HTML_CACHE = new Map<string, string>();

/** Default column header labels of parameter reference tables. */
const DEFAULT_PARAM_TABLE_COLUMNS: ParamTableRow = {
  defaultVal: 'Default',
  description: 'Description',
  name: 'Parameter',
  values: 'Values',
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches comma-separated items inside a card title parenthetical. */
const COMMA_SPLIT_RX = /,\s*/;

/** Matches separator tokens (` | `, ` / `, ` to `, `...`) and bracketed alias suffixes (` [l]`) inside parameter code cells. */
const PARAM_CODE_TOKEN_RX = /\s\|\s|\s\/\s|\sto\s|\.\.\.|\s\[[^\]]*\]/g;

/** Matches SVG `id="…"` attributes and their `url(#…)` / `href="#…"` references for per-instance ID scoping. */
const SVG_ID_REFERENCE_RX = /(?<prefix>\sid="|url\(#|href="#)(?<name>[^")]+)/g;

/** Matches runs of characters that are not allowed in generated anchor IDs. */
const SLUG_INVALID_RX = /[^a-z0-9]+/g;

/** Matches a single leading or trailing dash left over after slug normalization. */
const SLUG_EDGE_DASH_RX = /^-|-$/g;

/** Matches inline `` `code` `` markup in section titles, descriptions, and subheads. */
const INLINE_CODE_RX = /`(?<code>[^`]+)`/g;

/** Matches inline `**strong**` markup in section titles and descriptions. */
const INLINE_STRONG_RX = /\*\*(?<strong>[^*]+)\*\*/g;

/** Matches inline markup characters (backticks and double asterisks) for plain-text labels. */
const INLINE_MARKUP_CHARS_RX = /`|\*\*/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Convert free text into a URL-fragment-safe anchor ID (e.g., `'variant=1 · Primary'` -> `'variant-1-primary'`). */
function slugifyText(text: string): string {
  return text.toLowerCase().replace(SLUG_INVALID_RX, '-').replace(SLUG_EDGE_DASH_RX, '');
}

/**
 * Prefix every `id` and internal `url(#…)` / `href="#…"` reference of an inline SVG with a unique scope,
 * so many inlined previews never share element IDs (gradient, clip, and sheen definitions).
 */
function scopeSvgIds(svg: string, scope: string): string {
  return svg.replace(SVG_ID_REFERENCE_RX, `$<prefix>${scope}-$<name>`);
}

/** Escape text and convert inline `` `code` `` and `**strong**` markup into HTML. */
function formatInlineMarkupHtml(text: string): string {
  return escapeXml(text)
    .replace(INLINE_CODE_RX, '<code>$<code></code>')
    .replace(INLINE_STRONG_RX, '<strong>$<strong></strong>');
}

/** Strip inline markup characters for plain-text labels and anchor IDs. */
function stripInlineMarkup(text: string): string {
  return text.replace(INLINE_MARKUP_CHARS_RX, '');
}

/** Render a hover/focus `#` permalink to an in-page anchor. */
function renderAnchorLink(targetId: string, label: string): string {
  return `<a class="anchor-link" href="#${escapeXml(targetId)}" aria-label="Link to “${escapeXml(label)}”">#</a>`;
}

/** Highlight a URL's base path and query parameters (`?key=value&...`) for Markdown code drawers. */
function highlightUrlHtml(rawUrl: string): string {
  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex === -1) {
    return `<span class="hl-url">${escapeXml(rawUrl)}</span>`;
  }

  const basePath = rawUrl.slice(0, queryIndex);
  const pairs = rawUrl.slice(queryIndex + 1).split('&');
  let queryHtml = '';

  for (let i = 0; i < pairs.length; i += 1) {
    if (i > 0) {
      queryHtml += '<span class="hl-op">&amp;</span>';
    }
    const pair = pairs[i];
    const equalsIndex = pair.indexOf('=');
    if (equalsIndex === -1) {
      queryHtml += `<span class="hl-key">${escapeXml(pair)}</span>`;
    } else {
      const key = pair.slice(0, equalsIndex);
      const value = pair.slice(equalsIndex + 1);
      queryHtml += `<span class="hl-key">${escapeXml(key)}</span><span class="hl-op">=</span><span class="hl-val">${escapeXml(value)}</span>`;
    }
  }

  return `<span class="hl-url">${escapeXml(basePath)}</span><span class="hl-op">?</span>${queryHtml}`;
}

/** Format a `ShowcaseItem` into a syntax-highlighted GitHub README Markdown line whose `.textContent` is exact Markdown. */
function formatHighlightedMarkdownSnippet(item: ShowcaseItem): string {
  const fullUrl = `${SITE_ORIGIN}${item.path}`;
  const imageHtml = `<span class="hl-p">![</span><span class="hl-alt">${escapeXml(item.alt)}</span><span class="hl-p">](</span>${highlightUrlHtml(fullUrl)}<span class="hl-p">)</span>`;
  const href = item.href ?? resolveSvgPathRedirectUrl(item.path);
  if (!href) {
    return imageHtml;
  }
  return `<span class="hl-p">[</span>${imageHtml}<span class="hl-p">](</span><span class="hl-href">${escapeXml(href)}</span><span class="hl-p">)</span>`;
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

/**
 * Format a card title string into hierarchical HTML with a primary heading, optional leading code badge, and optional trailing meta/status pills.
 * @param rawTitle   Card title (`code · Text (meta, pill)`, every part optional except `Text`).
 * @returns Inner HTML of the card title heading.
 */
function formatCardTitleHtml(rawTitle: string): string {
  let remainder = rawTitle.trim();
  let trailingPillHtml = '';

  // 1. Extract the trailing parenthetical group first so inner symbols never interfere with ` · ` prefix splitting.
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
        trailingPillHtml += isCodeMeta
          ? `<code class="card-title-meta">${escapeXml(cleanPart)}</code>`
          : `<span class="card-title-pill">${escapeXml(cleanPart)}</span>`;
      }
    }
  }

  // 2. Extract the leading `code · ` prefix if present on the main title text.
  let prefixBadgeHtml = '';
  const dotSeparatorIndex = remainder.indexOf(' · ');
  if (dotSeparatorIndex !== -1) {
    const prefix = remainder.slice(0, dotSeparatorIndex).trim();
    remainder = remainder.slice(dotSeparatorIndex + 3).trim();
    prefixBadgeHtml = `<code class="card-title-code">${escapeXml(prefix)}</code>`;
  }

  return `${prefixBadgeHtml}<span class="card-title-text">${escapeXml(remainder)}</span>${trailingPillHtml}`;
}

/** Render a `<code class="param-code">` block with dimmed, non-selectable separators and alias notes. */
function renderCodeWithDimmedSeparators(rawCode: string): string {
  let innerHtml = '';
  let cursor = 0;
  for (const match of rawCode.matchAll(PARAM_CODE_TOKEN_RX)) {
    const [token] = match;
    innerHtml += escapeXml(rawCode.slice(cursor, match.index));
    innerHtml += token.endsWith(']')
      ? ` <span class="param-alias">(${escapeXml(token.trim().slice(1, -1))})</span>`
      : `<span class="param-sep">${escapeXml(token)}</span>`;
    cursor = match.index + token.length;
  }
  innerHtml += escapeXml(rawCode.slice(cursor));
  return `<code class="param-code">${innerHtml}</code>`;
}

/** Render a single `code` or `code (note)` segment inside a parameter table cell. */
function renderParamSegmentHtml(segment: string): string {
  const trimmed = segment.trim();
  if (trimmed.startsWith('~')) {
    return `<span class="param-note">${escapeXml(trimmed.slice(1).trim())}</span>`;
  }
  const trailing = splitTrailingParenthetical(trimmed);
  if (trailing) {
    return `${renderCodeWithDimmedSeparators(trailing.main)} <span class="param-note">(${escapeXml(trailing.paren)})</span>`;
  }
  return renderCodeWithDimmedSeparators(trimmed);
}

/** Format a parameter table `Values` or `Default` cell with dimmed pipes/ranges and separated explanatory notes. */
function formatParamCellHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.includes(') / ')) {
    return renderParamSegmentHtml(trimmed);
  }
  const renderedParts: string[] = [];
  for (const part of trimmed.split(' / ')) {
    renderedParts.push(renderParamSegmentHtml(part));
  }
  return renderedParts.join(' <span class="param-sep">/</span> ');
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Serialize a value as JSON for an inline `<script>` element (configs and builder schemas).
 * @param value   JSON-serializable value.
 * @returns JSON text with every `<` escaped as `\u003c`, so the payload can never close its `<script>` element.
 */
export function serializeInlineJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', String.raw`\u003c`);
}

/**
 * Render an inline UI icon (`<svg class="ui-icon">`) from `lucide-static` or `@iconify-json/simple-icons`.
 * @param slug         Icon slug (e.g., `'sparkles'`, `'copy'`, `'check'`, `'chevron-right'`, `'github'`).
 * @param size         Width and height in pixels (defaults to `16`).
 * @param extraClass   Optional additional CSS class name(s) appended to `ui-icon`.
 * @returns Inline `<svg>` HTML string, or empty string if the slug is not found.
 */
export function renderUiIcon(slug: string, size = 16, extraClass = ''): string {
  const cacheKey = `${slug}|${size}|${extraClass}`;
  const cached = UI_ICON_HTML_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const resolved = resolveIcon(slug);
  const classAttr = extraClass ? `ui-icon ${extraClass}` : 'ui-icon';
  const paintAttrs = resolved?.type === 'lucide' ? LUCIDE_STROKE_ATTRS : 'fill="currentColor"';
  const iconHtml = resolved
    ? `<svg class="${classAttr}" ${UI_ICON_SVG_ATTRS} width="${size}" height="${size}" ${paintAttrs}>${resolved.innerSvg}</svg>`
    : '';
  UI_ICON_HTML_CACHE.set(cacheKey, iconHtml);
  return iconHtml;
}

/**
 * Render a showcase card containing SVG previews (rendered from each item's documented path through the
 * live route dispatcher, each linking to its prefilled builder) and an expandable `<details>` Markdown drawer.
 * The card gets a deep-link anchor ID derived from its title, and every inlined SVG gets scoped element IDs.
 * @param card   Showcase card configuration with items and titles.
 * @returns HTML string for the card wrapped in a container element.
 */
export function renderShowcaseCard(card: ShowcaseCardConfig): string {
  const cardId = slugifyText(card.title);
  const titleId = `${cardId}-title`;
  const scopePrefix = `p${hashText(cardId)}`;
  let svgsHtml = '';
  const markdownLines: string[] = [];

  for (let i = 0; i < card.items.length; i += 1) {
    const item = card.items[i];
    const svg = scopeSvgIds(renderSvgPath(item.path, item.sample), `${scopePrefix}-${i}`);
    const builderTarget = resolveBuilderTarget(item.path);
    svgsHtml += builderTarget
      ? `<a class="preview-link" href="${escapeXml(builderTarget.href)}" aria-label="Open “${escapeXml(item.alt)}” in the Builder" title="Open in Builder">${svg}</a>\n`
      : `${svg}\n`;
    markdownLines.push(formatHighlightedMarkdownSnippet(item));
  }

  const stageClass = card.isCentered ? 'preview-stage is-centered' : 'preview-stage';
  const subtitleHtml = card.subtitle
    ? `<p class="card-subtitle">${escapeXml(card.subtitle)}</p>`
    : '';
  const escapedTitle = escapeXml(card.title);

  const chevronIcon = renderUiIcon('chevron-right', 14, 'drawer-chevron');
  const leftScrollIcon = renderUiIcon('chevron-left', 14);
  const rightScrollIcon = renderUiIcon('chevron-right', 14);
  const copyIcon = renderUiIcon('copy', 13, 'icon-copy');
  const checkIcon = renderUiIcon('check', 13, 'icon-check');

  return `<div class="card-container" id="${cardId}">
    <div class="card">
      <div class="card-head">
        <div class="card-title-row">
          <h3 class="card-title" id="${titleId}">${formatCardTitleHtml(card.title)}</h3>
          ${renderAnchorLink(cardId, card.title)}
        </div>
        ${subtitleHtml}
      </div>
      <div class="${stageClass}">${svgsHtml}</div>
      <details class="code-drawer">
        <summary>${chevronIcon}<span class="drawer-summary-text">View Markdown</span></summary>
        <div class="code-drawer-body">
          <div class="code-drawer-toolbar">
            <span class="code-drawer-label">Markdown</span>
            <div class="code-toolbar-actions">
              <button type="button" class="scroll-btn scroll-btn-left" aria-label="Scroll code left">${leftScrollIcon}</button>
              <button type="button" class="scroll-btn scroll-btn-right" aria-label="Scroll code right">${rightScrollIcon}</button>
              <button type="button" class="copy-btn" aria-describedby="${titleId}">${copyIcon}${checkIcon}<span class="copy-btn-text" aria-live="polite">Copy</span></button>
            </div>
          </div>
          <div class="code-pre-wrap">
            <pre class="code-pre" tabindex="0" role="region" aria-label="Markdown snippet: ${escapedTitle}"><code>${markdownLines.join('\n')}</code></pre>
          </div>
        </div>
      </details>
    </div>
  </div>`;
}

/**
 * Render a list of showcase cards.
 * @param cards   Showcase card configurations.
 * @returns Concatenated card HTML.
 */
export function renderCardsHtml(cards: readonly ShowcaseCardConfig[]): string {
  let cardsHtml = '';
  for (const card of cards) {
    cardsHtml += renderShowcaseCard(card);
  }
  return cardsHtml;
}

/**
 * Render a list of route pattern pills (`GET /badge/...`).
 * @param patterns   Array of route path strings.
 * @returns HTML string for the route pattern pill strip.
 */
export function renderRoutePills(patterns: readonly string[]): string {
  let pillsHtml = '';
  for (const pattern of patterns) {
    pillsHtml += `<code class="route-pill"><span class="route-method">GET</span><span class="route-path">${escapeXml(pattern)}</span></code>`;
  }
  return `<div class="route-pills">${pillsHtml}</div>`;
}

/**
 * Render a documentation section header (title, lead paragraph, and route pills).
 * @param options   Section header options (`title`, `description`, optional `routes` and `headingLevel`).
 * @returns HTML string for the section header.
 */
export function renderSectionHeader(options: SectionHeaderOptions): string {
  const headingTag = `h${options.headingLevel ?? 1}`;
  const routesHtml = options.routes ? renderRoutePills(options.routes) : '';
  return `<div class="section-header">
      <${headingTag} class="section-title">${formatInlineMarkupHtml(options.title)}</${headingTag}>
      <p class="section-desc">${formatInlineMarkupHtml(options.description)}</p>
      ${routesHtml}
    </div>`;
}

/**
 * Render a section subheading (`<h2>`) with a leading Lucide icon and a hover/focus deep-link anchor.
 * @param iconSlug   Lucide icon slug (e.g., `'layers'`).
 * @param text       Subheading text (supports inline `` `code` `` markup).
 * @returns HTML string for the subheading row.
 */
export function renderSectionSubhead(iconSlug: string, text: string): string {
  const plainText = stripInlineMarkup(text);
  const subheadId = slugifyText(plainText);
  return `<div class="subhead-row" id="${subheadId}">
      <h2 class="section-subhead">${renderUiIcon(iconSlug, 16)}<span class="subhead-text">${formatInlineMarkupHtml(text)}</span></h2>
      ${renderAnchorLink(subheadId, plainText)}
    </div>`;
}

/**
 * Render a responsive, keyboard-scrollable parameter reference table that transforms into labeled cards on narrow containers.
 * @param rows      Array of parameter rows to display.
 * @param label     Accessible table caption and scroll region label (e.g., `'Badge query parameters'`).
 * @param columns   Column header labels (defaults to `Parameter`, `Values`, `Default`, `Description`).
 * @returns HTML string for the responsive table wrapper.
 */
export function renderParamTable(
  rows: readonly ParamTableRow[],
  label: string,
  columns: ParamTableRow = DEFAULT_PARAM_TABLE_COLUMNS
): string {
  let bodyRowsHtml = '';
  for (const row of rows) {
    bodyRowsHtml += `<tr role="row">
      <th scope="row" role="rowheader">${escapeXml(row.name)}</th>
      <td role="cell">${formatParamCellHtml(row.values)}</td>
      <td role="cell">${formatParamCellHtml(row.defaultVal)}</td>
      <td role="cell">${escapeXml(row.description)}</td>
    </tr>`;
  }

  const escapedLabel = escapeXml(label);
  const labelStyleAttr =
    columns === DEFAULT_PARAM_TABLE_COLUMNS
      ? ''
      : ` style="${escapeXml(`--label-2: ${JSON.stringify(columns.values)}; --label-3: ${JSON.stringify(columns.defaultVal)}; --label-4: ${JSON.stringify(columns.description)};`)}"`;
  return `<div class="table-wrapper" tabindex="0" role="region" aria-label="${escapedLabel}">
    <table class="param-table" role="table"${labelStyleAttr}>
      <caption class="visually-hidden">${escapedLabel}</caption>
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">${escapeXml(columns.name)}</th>
          <th scope="col" role="columnheader">${escapeXml(columns.values)}</th>
          <th scope="col" role="columnheader">${escapeXml(columns.defaultVal)}</th>
          <th scope="col" role="columnheader">${escapeXml(columns.description)}</th>
        </tr>
      </thead>
      <tbody role="rowgroup">${bodyRowsHtml}</tbody>
    </table>
  </div>`;
}

/**
 * Render an alphabetically sorted `alias → canonical` list (e.g., icon slug aliases).
 * @param aliases   Alias slugs mapped to their canonical slugs.
 * @param label     Accessible list label (e.g., `'Icon slug aliases'`).
 * @returns HTML string for the alias list.
 */
export function renderAliasList(aliases: Readonly<Record<string, string>>, label: string): string {
  let itemsHtml = '';
  for (const alias of Object.keys(aliases).toSorted()) {
    itemsHtml += `<li class="alias-item"><code class="param-code">${escapeXml(alias)}</code><span class="alias-arrow" aria-hidden="true">→</span><span class="visually-hidden"> resolves to </span><code class="param-code">${escapeXml(aliases[alias])}</code></li>`;
  }
  return `<ul class="alias-list" role="list" aria-label="${escapeXml(label)}">${itemsHtml}</ul>`;
}
