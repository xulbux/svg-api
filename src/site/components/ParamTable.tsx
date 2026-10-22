/**
 * Parameter table & alias list components – Responsive reference tables (`<ParamTable />`) with dimmed separator/alias micro-syntax and sorted alias lists (`<AliasList />`).
 */

import { splitTrailingParenthetical } from '@/site/components/ShowcaseCard';
import { raw, renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';
import { escapeXml } from '@/svg/shared';
import type { ParamTableRow } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the `<ParamTable />` component. */
export interface ParamTableProps {
  /** Column header labels (defaults to `Parameter`, `Values`, `Default`, `Description`). */
  readonly columns?: ParamTableRow | undefined;
  /** Accessible table caption and scroll region label (e.g., `'Badge query parameters'`). */
  readonly label: string;
  /** Array of parameter rows to display. */
  readonly rows: readonly ParamTableRow[];
}

/** Props for the `<AliasList />` component. */
export interface AliasListProps {
  /** Alias slugs mapped to their canonical slugs. */
  readonly aliases: Readonly<Record<string, string>>;
  /** Accessible list label (e.g., `'Icon slug aliases'`). */
  readonly label: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default column header labels of parameter reference tables. */
const DEFAULT_PARAM_TABLE_COLUMNS: ParamTableRow = {
  defaultVal: 'Default',
  description: 'Description',
  name: 'Parameter',
  values: 'Values',
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches separator tokens (` | `, ` / `, `, `, ` to `, `…`) and bracketed alias suffixes (` [l]`) inside parameter code cells. */
const PARAM_CODE_TOKEN_RX = /\s\|\s|\s\/\s|,\s|\sto\s|…|\s\[[^\]]*\]/g;

// -------------------------------------- INTERNALS --------------------------------------

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
function formatParamCellHtml(rawText: string): string {
  const trimmed = rawText.trim();
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
 * Render a responsive, keyboard-scrollable parameter reference table that transforms into labeled cards on narrow containers.
 * @param props   Parameter table props (`rows`, `label`, and optional `columns`).
 * @returns Rendered `<div class="table-wrapper">` JSX fragment.
 */
export function ParamTable(props: ParamTableProps): HtmlFragment {
  const columns = props.columns ?? DEFAULT_PARAM_TABLE_COLUMNS;
  const bodyRows: HtmlFragment[] = [];
  for (const row of props.rows) {
    bodyRows.push(
      <tr role="row">
        <th scope="row" role="rowheader">
          {raw(formatCodeTokensHtml(row.name))}
        </th>
        <td role="cell">{raw(formatParamCellHtml(row.values))}</td>
        <td role="cell">{raw(formatParamCellHtml(row.defaultVal))}</td>
        <td role="cell">{row.description}</td>
      </tr>
    );
  }

  const labelStyle =
    columns === DEFAULT_PARAM_TABLE_COLUMNS
      ? undefined
      : `--label-2: ${JSON.stringify(columns.values)}; --label-3: ${JSON.stringify(columns.defaultVal)}; --label-4: ${JSON.stringify(columns.description)};`;

  return (
    <div class="table-wrapper" tabindex="0" role="region" aria-label={props.label}>
      <table class="param-table" role="table" style={labelStyle}>
        <caption class="visually-hidden">{props.label}</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">
              {columns.name}
            </th>
            <th scope="col" role="columnheader">
              {columns.values}
            </th>
            <th scope="col" role="columnheader">
              {columns.defaultVal}
            </th>
            <th scope="col" role="columnheader">
              {columns.description}
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">{bodyRows}</tbody>
      </table>
    </div>
  );
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
  return renderHtml(<ParamTable rows={rows} label={label} columns={columns} />);
}

/**
 * Render an alphabetically sorted `alias → canonical` list (e.g., icon slug aliases) as a JSX component.
 * @param props   Alias list props (`aliases` and `label`).
 * @returns Rendered `<ul class="alias-list">` JSX fragment.
 */
export function AliasList(props: AliasListProps): HtmlFragment {
  const items: HtmlFragment[] = [];
  for (const [alias, canonical] of Object.entries(props.aliases).toSorted(([left], [right]) =>
    left < right ? -1 : 1
  )) {
    items.push(
      <li class="alias-item">
        <code class="param-code">{alias}</code>
        <span class="alias-arrow" aria-hidden="true">
          →
        </span>
        <span class="visually-hidden"> resolves to </span>
        <code class="param-code">{canonical}</code>
      </li>
    );
  }
  return (
    <ul class="alias-list" role="list" aria-label={props.label}>
      {items}
    </ul>
  );
}

/**
 * Render an alphabetically sorted `alias → canonical` list (e.g., icon slug aliases).
 * @param aliases   Alias slugs mapped to their canonical slugs.
 * @param label     Accessible list label (e.g., `'Icon slug aliases'`).
 * @returns HTML string for the alias list.
 */
export function renderAliasList(aliases: Readonly<Record<string, string>>, label: string): string {
  return renderHtml(<AliasList aliases={aliases} label={label} />);
}
