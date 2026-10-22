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
  HighlightToken,
  ParamTableRow,
  SectionHeaderOptions,
  ShowcaseCardConfig,
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

/** SVG paint attributes of Lucide stroke icons (UI icons and the builder's icon picker glyphs). */
export const LUCIDE_STROKE_ATTRS =
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

/** SVG paint attributes of filled brand icons (UI icons and the builder's icon picker glyphs). */
export const BRAND_FILL_ATTRS = 'fill="currentColor"';

/** Shared SVG root attributes of every inline UI icon. */
const UI_ICON_SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"';

/** UI icons repeated on most pages: Emitted once per page as `<symbol>` elements and referenced with `<use>`. */
const UI_SPRITE_ICON_SLUGS: ReadonlySet<string> = new Set([
  'check',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'copy',
  'layout-grid',
  'sparkles',
  'x',
]);

/** Memoized inline UI icon HTML keyed by `slug|size|extraClass`. */
const UI_ICON_HTML_CACHE = new Map<string, string>();

/** Memoized UI icon sprite (`undefined` until first rendered). */
let uiSpriteHtmlCache: string | undefined = undefined;

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

/** Matches separator tokens (` | `, ` / `, `, `, ` to `, `…`) and bracketed alias suffixes (` [l]`) inside parameter code cells. */
const PARAM_CODE_TOKEN_RX = /\s\|\s|\s\/\s|,\s|\sto\s|…|\s\[[^\]]*\]/g;

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

/** Matches characters escaped with a backslash inside Markdown image alt text (same rule as the builder client). */
const MARKDOWN_ALT_RX = /[[\]\\]/g;

/** Matches characters percent-encoded inside Markdown link destinations (same rule as the builder client). */
const MARKDOWN_DESTINATION_RX = /[ ()<>]/g;

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
  return `<a class="anchor-link" href="#${escapeXml(targetId)}" aria-label="Link to “${escapeXml(label)}”" tabindex="0">#</a>`;
}

/**
 * Split a URL into highlight tokens (origin + endpoint, path segments, `?key=` / `&key=`, values); Same algorithm
 * as `tokenizeUrl` in the builder client (`src/preview/scripts/builder.client.js`), guarded by a parity test.
 */
function tokenizeUrl(url: string): HighlightToken[] {
  const queryIndex = url.indexOf('?');
  const base = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const schemeEnd = base.indexOf('://');
  const endpointSlash = schemeEnd === -1 ? base.indexOf('/') : base.indexOf('/', schemeEnd + 3);
  const pathSlash = endpointSlash === -1 ? -1 : base.indexOf('/', endpointSlash + 1);
  const tokens: HighlightToken[] =
    pathSlash === -1
      ? [['hl-url', base]]
      : [
          ['hl-url', base.slice(0, pathSlash)],
          ['hl-path', base.slice(pathSlash)],
        ];
  if (queryIndex === -1) {
    return tokens;
  }
  for (const [i, pair] of url
    .slice(queryIndex + 1)
    .split('&')
    .entries()) {
    const prefix = i === 0 ? '?' : '&';
    const equalsIndex = pair.indexOf('=');
    if (equalsIndex === -1) {
      tokens.push(['hl-key', `${prefix}${pair}`]);
    } else {
      tokens.push(['hl-key', `${prefix}${pair.slice(0, equalsIndex + 1)}`]);
      const value = pair.slice(equalsIndex + 1);
      if (value) {
        tokens.push(['hl-val', value]);
      }
    }
  }
  return tokens;
}

/** Percent-encode the characters that would end or break a Markdown link destination (space, `(`, `)`, `<`, `>`). */
function encodeMarkdownDestination(text: string): string {
  return text.replace(
    MARKDOWN_DESTINATION_RX,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/** Render highlight tokens as escaped `<span class="hl-*">` HTML (its text content is the exact snippet). */
function renderHighlightTokensHtml(tokens: readonly HighlightToken[]): string {
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

/** Format a parameter code string with dimmed, non-selectable separators and alias notes. */
function formatCodeTokensHtml(rawCode: string): string {
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
  return innerHtml + escapeXml(rawCode.slice(cursor));
}

/** Render a `<code class="param-code">` block with dimmed, non-selectable separators and alias notes. */
function renderCodeWithDimmedSeparators(rawCode: string): string {
  return `<code class="param-code">${formatCodeTokensHtml(rawCode)}</code>`;
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

/** Render a list of route pattern pills (`GET /badge/…`). */
function renderRoutePills(patterns: readonly string[]): string {
  let pillsHtml = '';
  for (const pattern of patterns) {
    pillsHtml += `<code class="route-pill"><span class="route-method">GET</span>${escapeXml(pattern)}</code>`;
  }
  return `<div class="route-pills">${pillsHtml}</div>`;
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
 * Build the highlight tokens of a (linked) Markdown image snippet with the same escaping rules as the builder
 * client's `buildSnippetTokens` (alt text escapes `[`, `]`, `\`; Destinations percent-encode space, `(`, `)`, `<`, `>`).
 * @param url    Absolute image URL.
 * @param alt    Alt text.
 * @param href   Optional link target (`undefined` for an unlinked image).
 * @returns Tokens whose joined text is the exact Markdown snippet.
 */
export function buildMarkdownSnippetTokens(
  url: string,
  alt: string,
  href: string | undefined
): HighlightToken[] {
  const tokens: HighlightToken[] = href ? [['hl-p', '[']] : [];
  tokens.push(
    ['hl-p', '!['],
    ['hl-alt', alt.replace(MARKDOWN_ALT_RX, String.raw`\$&`)],
    ['hl-p', '](']
  );
  for (const [className, text] of tokenizeUrl(url)) {
    tokens.push([className, encodeMarkdownDestination(text)]);
  }
  tokens.push(['hl-p', ')']);
  if (href) {
    tokens.push(['hl-p', ']('], ['hl-href', encodeMarkdownDestination(href)], ['hl-p', ')']);
  }
  return tokens;
}

/**
 * Render (once per isolate) the hidden UI icon sprite: One `<symbol id="ui-<slug>">` per repeated UI icon,
 * referenced by `renderUiIcon` with `<use href>`; Every page layout emits it once.
 * @returns Hidden inline `<svg>` sprite HTML.
 */
export function renderUiSprite(): string {
  if (uiSpriteHtmlCache === undefined) {
    let symbolsHtml = '';
    for (const slug of UI_SPRITE_ICON_SLUGS) {
      symbolsHtml += `<symbol id="ui-${slug}" viewBox="0 0 24 24">${resolveIcon(slug)?.innerSvg ?? ''}</symbol>`;
    }
    uiSpriteHtmlCache = `<svg class="ui-sprite" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${symbolsHtml}</svg>`;
  }
  return uiSpriteHtmlCache;
}

/**
 * Render an inline UI icon (`<svg class="ui-icon">`) from `lucide-static` or `@iconify-json/simple-icons`;
 * Repeated icons (`UI_SPRITE_ICON_SLUGS`) reference the page's UI sprite instead of repeating their paths.
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
  const paintAttrs = resolved?.type === 'lucide' ? LUCIDE_STROKE_ATTRS : BRAND_FILL_ATTRS;
  const bodyHtml = UI_SPRITE_ICON_SLUGS.has(slug)
    ? `<use href="#ui-${slug}"></use>`
    : (resolved?.innerSvg ?? '');
  const iconHtml = resolved
    ? `<svg class="${classAttr}" ${UI_ICON_SVG_ATTRS} width="${size}" height="${size}" ${paintAttrs}>${bodyHtml}</svg>`
    : '';
  UI_ICON_HTML_CACHE.set(cacheKey, iconHtml);
  return iconHtml;
}

/**
 * Render an icon-only copy button (copy and check icons plus a polite live label announced by the site script).
 * @param extraAttrs   Additional button attributes (e.g., `'data-copy-target="builder-code"'`).
 * @returns Copy button HTML.
 */
export function renderCopyButton(extraAttrs: string): string {
  return `<button type="button" class="copy-btn" ${extraAttrs}>${renderUiIcon('copy', 15, 'icon-copy')}${renderUiIcon('check', 15, 'icon-check')}<span class="visually-hidden" data-copy-label aria-live="polite">Copy</span></button>`;
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

  for (const [i, item] of card.items.entries()) {
    const svg = scopeSvgIds(renderSvgPath(item.path, item.sample), `${scopePrefix}-${i}`);
    const builderTarget = resolveBuilderTarget(item.path);
    svgsHtml += builderTarget
      ? `<a class="preview-link" href="${escapeXml(builderTarget.href)}" aria-label="Open “${escapeXml(item.alt)}” in the Builder" title="Open in Builder" tabindex="0">${svg}</a>\n`
      : `${svg}\n`;
    const href = item.href ?? resolveSvgPathRedirectUrl(item.path);
    markdownLines.push(
      renderHighlightTokensHtml(
        buildMarkdownSnippetTokens(`${SITE_ORIGIN}${item.path}`, item.alt, href)
      )
    );
  }

  const stageClass = card.isCentered ? 'preview-stage is-centered' : 'preview-stage';
  const subtitleHtml = card.subtitle
    ? `<p class="card-subtitle">${escapeXml(card.subtitle)}</p>`
    : '';
  const escapedTitle = escapeXml(card.title);

  const chevronIcon = renderUiIcon('chevron-right', 14, 'drawer-chevron');
  const leftScrollIcon = renderUiIcon('chevron-left', 12);
  const rightScrollIcon = renderUiIcon('chevron-right', 12);

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
        <summary>${chevronIcon}View Markdown</summary>
        <div class="code-drawer-body">
          <button type="button" class="scroll-btn scroll-btn-left" aria-label="Scroll code left">${leftScrollIcon}</button>
          <button type="button" class="scroll-btn scroll-btn-right" aria-label="Scroll code right">${rightScrollIcon}</button>
          ${renderCopyButton(`aria-describedby="${titleId}"`)}
          <pre class="code-pre" tabindex="0" role="region" aria-label="Markdown snippet: ${escapedTitle}"><code>${markdownLines.join('\n')}</code></pre>
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
 * Render a documentation section header (title, optional header action, lead paragraph, and route pills).
 * @param options   Section header options (`title`, `description`, optional `actionHtml`, `routes`, and `headingLevel`).
 * @returns HTML string for the section header.
 */
export function renderSectionHeader(options: SectionHeaderOptions): string {
  const headingTag = `h${options.headingLevel ?? 1}`;
  const titleHtml = `<${headingTag} class="section-title">${formatInlineMarkupHtml(options.title)}</${headingTag}>`;
  const headerTopHtml = options.actionHtml
    ? `<div class="section-title-row">${titleHtml}${options.actionHtml}</div>`
    : titleHtml;
  const routesHtml = options.routes ? renderRoutePills(options.routes) : '';
  return `<div class="section-header">
      ${headerTopHtml}
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
      <h2 class="section-subhead">${renderUiIcon(iconSlug, 16)}<span class="section-subhead-text">${formatInlineMarkupHtml(text)}</span></h2>
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
      <th scope="row" role="rowheader">${formatCodeTokensHtml(row.name)}</th>
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
  for (const [alias, canonical] of Object.entries(aliases).toSorted(([left], [right]) =>
    left < right ? -1 : 1
  )) {
    itemsHtml += `<li class="alias-item"><code class="param-code">${escapeXml(alias)}</code><span class="alias-arrow" aria-hidden="true">→</span><span class="visually-hidden"> resolves to </span><code class="param-code">${escapeXml(canonical)}</code></li>`;
  }
  return `<ul class="alias-list" role="list" aria-label="${escapeXml(label)}">${itemsHtml}</ul>`;
}
