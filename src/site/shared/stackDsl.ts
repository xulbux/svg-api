/**
 * Stack DSL parser & band composer – Parses `/stack` tile tokens and packs categorized icon selections into balanced multi-band DSL strings.
 */

import { LINE_BREAK_RX, LIST_SEPARATOR_RX } from '@/site/shared/encoding';
import type { NumericRange, StackPrefillModeResult } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Tiles-per-row bounds when not specified per group. */
export const STACK_PER_LINE_RANGE: NumericRange = { default: 8, max: 20, min: 1 };

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches group separators (`;` and `|`) in the stack DSL. */
const STACK_GROUP_SEPARATOR_RX = /[;|]+/;

/** Matches a trailing `:N` column suffix at the end of a non-empty stack group. */
const COLUMN_SUFFIX_RX = /(?<=.):\d+$/;

/** Matches remaining whitespace in the stack groups textarea. */
const WHITESPACE_RX = /\s+/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Collect non-empty icon tokens from a category group. */
function collectNonEmptyTokens(group: readonly string[]): string[] {
  const tokens: string[] = [];
  for (const token of group) {
    if (token) {
      tokens.push(token);
    }
  }
  return tokens;
}

/** Format a candidate horizontal `/stack` band of category groups within `maxBandCols`, or `undefined` when it overflows. */
function formatStackBand(
  bandGroups: readonly (readonly string[])[],
  maxBandCols = STACK_PER_LINE_RANGE.default
): string | undefined {
  let bandRows = 1;
  let totalCount = 0;
  let minGroupCount = Infinity;
  let maxGroupCount = 0;
  for (const group of bandGroups) {
    bandRows = Math.max(bandRows, Math.ceil(group.length / maxBandCols));
    totalCount += group.length;
    minGroupCount = Math.min(minGroupCount, group.length);
    maxGroupCount = Math.max(maxGroupCount, group.length);
  }
  if (
    bandRows === 1 &&
    bandGroups.length === 2 &&
    totalCount > maxBandCols &&
    maxGroupCount >= 6 &&
    minGroupCount >= 3
  ) {
    bandRows = 2;
  }
  if (bandRows > 1 && bandGroups.length > 2) {
    return undefined;
  }
  const groupStrings: string[] = [];
  let totalCols = 0;
  for (const group of bandGroups) {
    const count = group.length;
    const maxGroupRows = count < 3 ? 1 : Math.ceil(count / 2);
    const rows = Math.max(Math.ceil(count / maxBandCols), Math.min(bandRows, maxGroupRows));
    const cols = Math.ceil(count / rows);
    totalCols += cols;
    groupStrings.push(cols < count ? `${group.join(',')}:${cols}` : group.join(','));
  }
  return bandGroups.length > 1 && totalCols > maxBandCols ? undefined : groupStrings.join('|');
}

/** Parse a `?perline=` input into a positional array of clamped column counts, dropping trailing holes. */
function parsePerLineValues(rawPerLine: string): (number | undefined)[] {
  const trimmed = rawPerLine.trim();
  if (!trimmed) {
    return [];
  }
  const values: (number | undefined)[] = [];
  for (const part of trimmed.split(LIST_SEPARATOR_RX)) {
    const cleaned = part.trim();
    const parsed = cleaned ? Number(cleaned) : Number.NaN;
    const rounded = Math.round(parsed);
    values.push(
      Number.isFinite(parsed) && parsed >= STACK_PER_LINE_RANGE.min
        ? Math.min(STACK_PER_LINE_RANGE.max, Math.max(STACK_PER_LINE_RANGE.min, rounded))
        : undefined
    );
  }
  while (values.length > 0 && values.at(-1) === undefined) {
    values.pop();
  }
  return values;
}

/** Compose a categorized `/stack` DSL string when `?perline=` has multiple per-group column limits. */
function composeStackWithExplicitPerLine(
  categoryGroups: readonly (readonly string[])[],
  perLineValues: readonly (number | undefined)[]
): string {
  const defaultPerLine = perLineValues[0] ?? STACK_PER_LINE_RANGE.default;
  const explicitBands: string[] = [];
  let bandTokens: string[] = [];
  let bandCols = 0;
  let bandMaxRows = 1;
  let groupIndex = 0;

  for (const group of categoryGroups) {
    const tokens = collectNonEmptyTokens(group);
    if (tokens.length > 0) {
      const groupPerLine =
        perLineValues[Math.min(groupIndex, perLineValues.length - 1)] ?? defaultPerLine;
      const groupRows = Math.ceil(tokens.length / groupPerLine);
      const groupCols = Math.ceil(tokens.length / groupRows);
      const groupToken =
        groupCols < tokens.length && groupCols !== groupPerLine
          ? `${tokens.join(',')}:${groupCols}`
          : tokens.join(',');
      const nextMaxRows = Math.max(bandMaxRows, groupRows);
      if (
        bandTokens.length > 0 &&
        (bandCols + groupCols > STACK_PER_LINE_RANGE.default ||
          (nextMaxRows > 1 && bandTokens.length >= 2))
      ) {
        explicitBands.push(bandTokens.join('|'));
        bandTokens = [groupToken];
        bandCols = groupCols;
        bandMaxRows = groupRows;
      } else {
        bandTokens.push(groupToken);
        bandCols += groupCols;
        bandMaxRows = nextMaxRows;
      }
      groupIndex += 1;
    }
  }
  if (bandTokens.length > 0) {
    explicitBands.push(bandTokens.join('|'));
  }
  return explicitBands.join(';');
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Normalize the stack groups textarea into the `/stack` DSL (line breaks start new row bands).
 * @param value   Raw textarea value.
 * @returns Normalized `/stack` DSL string.
 */
export function normalizeStackGroups(value: string): string {
  return value.trim().replace(LINE_BREAK_RX, ';').replace(WHITESPACE_RX, '');
}

/**
 * Collect the individual tile tokens (`<slug>` or `<slug>@<color>`) of a `/stack` DSL string,
 * stripping only a valid group-trailing `:<digits>` column suffix at the end of each `;` / `|` group.
 * @param groups   Stack DSL.
 * @returns Individual tile tokens.
 */
export function collectStackTileTokens(groups: string): string[] {
  const tokens: string[] = [];
  for (const rawGroup of normalizeStackGroups(groups).split(STACK_GROUP_SEPARATOR_RX)) {
    const iconList = rawGroup.replace(COLUMN_SUFFIX_RX, '');
    for (const token of iconList.split(',')) {
      if (token) {
        tokens.push(token);
      }
    }
  }
  return tokens;
}

/**
 * Strip an optional `@<color>` suffix off a stack tile token.
 * @param token   Tile token.
 * @returns Base icon slug without `@<color>`.
 */
export function stripStackTileColor(token: string): string {
  const atIndex = token.lastIndexOf('@');
  return atIndex > 0 ? token.slice(0, atIndex) : token;
}

/**
 * Collect the icon slugs of a `/stack` DSL string (without `@<color>` overrides or group-trailing `:N` column suffixes).
 * @param groups   Stack DSL.
 * @returns Icon slugs in appearance order.
 */
export function collectStackSlugs(groups: string): string[] {
  const slugs: string[] = [];
  for (const token of collectStackTileTokens(groups)) {
    const slug = stripStackTileColor(token);
    if (slug) {
      slugs.push(slug);
    }
  }
  return slugs;
}

/**
 * Compose a `/stack` DSL string from categorized icon token lists.
 * @param categoryGroups        Icon tokens grouped by category in display order.
 * @param isGroupedByCategory   Whether to group by category (`true`) or emit a flat list (`false`).
 * @param rawPerLine            Optional `#field-perline` value (e.g., `'10'` or `'8,6,4'`).
 * @returns Composed `/stack` DSL string.
 */
export function composeCategorizedStack(
  categoryGroups: readonly (readonly string[])[],
  isGroupedByCategory: boolean,
  rawPerLine = ''
): string {
  if (!isGroupedByCategory) {
    const flatTokens: string[] = [];
    for (const group of categoryGroups) {
      for (const token of group) {
        if (token) {
          flatTokens.push(token);
        }
      }
    }
    return flatTokens.join(',');
  }

  const perLineValues = parsePerLineValues(rawPerLine);
  if (perLineValues.length > 1) {
    return composeStackWithExplicitPerLine(categoryGroups, perLineValues);
  }

  const maxBandCols = perLineValues[0] ?? STACK_PER_LINE_RANGE.default;
  const bandStrings: string[] = [];
  let currentBand: string[][] = [];
  let currentBandString = '';

  for (const group of categoryGroups) {
    const tokens = collectNonEmptyTokens(group);
    if (tokens.length > 0) {
      currentBand.push(tokens);
      const candidateBand = formatStackBand(currentBand, maxBandCols);
      if (candidateBand !== undefined) {
        currentBandString = candidateBand;
      } else {
        currentBand.pop();
        if (currentBandString) {
          bandStrings.push(currentBandString);
        }
        currentBand = [tokens];
        currentBandString = formatStackBand(currentBand, maxBandCols) ?? '';
      }
    }
  }
  if (currentBandString) {
    bandStrings.push(currentBandString);
  }
  return bandStrings.join(';');
}

/**
 * Determine whether a prefilled `/stack` DSL string can be represented losslessly by `Categories` mode
 * (grouped or flat) or requires switching to `Raw DSL`.
 * @param dslValue          Raw `/stack` groups DSL string.
 * @param categoryGroups    Selected catalog icon tokens grouped by category in display order.
 * @param hasCustomTokens   Whether `dslValue` contains non-catalog icon slugs.
 * @param rawPerLine        Optional `#field-perline` value.
 * @returns Target mode (`'categories'` or `'raw'`) and optional `Group by category` toggle state.
 */
export function resolveStackPrefillMode(
  dslValue: string,
  categoryGroups: readonly (readonly string[])[],
  hasCustomTokens: boolean,
  rawPerLine = ''
): StackPrefillModeResult {
  const normalizedDsl = normalizeStackGroups(dslValue).toLowerCase();
  if (!normalizedDsl) {
    return { isGroupedByCategory: true, mode: 'categories' };
  }
  if (hasCustomTokens || normalizedDsl.includes('@')) {
    return { isGroupedByCategory: undefined, mode: 'raw' };
  }
  if (normalizedDsl === composeCategorizedStack(categoryGroups, true, rawPerLine).toLowerCase()) {
    return { isGroupedByCategory: true, mode: 'categories' };
  }
  if (normalizedDsl === composeCategorizedStack(categoryGroups, false, rawPerLine).toLowerCase()) {
    return { isGroupedByCategory: false, mode: 'categories' };
  }
  return { isGroupedByCategory: undefined, mode: 'raw' };
}
