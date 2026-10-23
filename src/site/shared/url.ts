/**
 * Shared URL builder & parser helpers – Path segment encoding, composite parameter formatting, URL synthesis, and route prefill parsing.
 */

import type {
  BuilderBuildResult,
  BuilderField,
  BuilderOption,
  BuilderSchema,
  BuilderServiceOption,
  BuilderState,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Route prefix, decoded path segments, and query parameters of a parsed SVG URL. */
interface ParsedRoute {
  /** First path segment (route prefix, e.g., `'badge'`). */
  prefix: string;
  /** Parsed query parameters. */
  query: URLSearchParams;
  /** Decoded path segments after the route prefix. */
  segments: string[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum number of columns packed onto a single horizontal `/stack` band when auto-grouping by category. */
const MAX_STACK_BAND_COLUMNS = 8;

/** Maximum per-group column count accepted by `?perline=` when composing `/stack` bands. */
const MAX_PER_LINE_COLUMNS = 20;

/** Query parameter pair appended to reduced-motion previews (stops sheens, icon motions, widgets, and dots). */
const STATIC_ANIM_PAIR = 'anim=none';

/** Normalized `?center=` values treated as truthy layout or alignment flags. */
const CENTER_FLAG_VALUES: ReadonlySet<string> = new Set(['1', 'true', 'yes']);

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches percent-escaped characters that stay readable in paths and query values (`,` `:` `;` `@` `|`). */
const READABLE_ESCAPE_RX = /%(?:2C|3A|3B|40|7C)/g;

/** Matches percent-escaped spaces. */
const ESCAPED_SPACE_RX = /%20/g;

/** Matches parentheses (escaped so Markdown link targets never end early). */
const PARENTHESIS_RX = /[()]/g;

/** Matches `+` characters in URL path segments for space decoding. */
const PLUS_SIGN_RX = /\+/g;

/** Matches comma or whitespace separators in list-style payloads. */
const LIST_SEPARATOR_RX = /[,\s]+/;

/** Matches group separators (`;` and `|`) in the stack DSL. */
const STACK_GROUP_SEPARATOR_RX = /[;|]+/;

/** Matches a trailing `:N` column suffix at the end of a non-empty stack group. */
const COLUMN_SUFFIX_RX = /(?<=.):\d+$/;

/** Matches line breaks (with surrounding spaces) in the stack groups textarea. */
const LINE_BREAK_RX = /\s*\n\s*/g;

/** Matches remaining whitespace in the stack groups textarea. */
const WHITESPACE_RX = /\s+/g;

/** Matches `<slug>` and optional trailing `<text>` after an `icon:` prefix in `?hint=`. */
const HINT_ICON_REST_RX = /^(?<slug>[^\s:]+)(?:[\s:]+(?<text>[\s\S]*))?$/;

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Encode text for a URL path segment the way `decodeSegment` decodes it (spaces become `+`).
 * @param text   Raw segment text.
 * @returns Encoded path segment.
 */
function encodeSegment(text: string): string {
  return encodeURIComponent(text)
    .replace(ESCAPED_SPACE_RX, '+')
    .replace(READABLE_ESCAPE_RX, decodeURIComponent)
    .replace(PARENTHESIS_RX, (char) => (char === '(' ? '%28' : '%29'));
}

/**
 * Decode a raw URL path segment exactly like the Worker (`+` becomes a space).
 * @param raw   Raw path segment.
 * @returns Decoded text.
 */
function decodeSegment(raw: string): string {
  const withSpaces = raw.replace(PLUS_SIGN_RX, ' ');
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    return withSpaces;
  }
}

/**
 * Find a service preset of the service badge builder.
 * @param schema   Builder schema.
 * @param key      Service route key.
 * @returns Matching service option, or `undefined`.
 */
function findService(
  schema: BuilderSchema,
  key: string | undefined
): BuilderServiceOption | undefined {
  for (const service of schema.services ?? []) {
    if (service.key === key) {
      return service;
    }
  }
  return undefined;
}

/**
 * Find the option with a value in an option list.
 * @param options   Option list.
 * @param value     Option value to look up.
 * @returns Matching option, or `undefined`.
 */
function findOption<T extends BuilderOption>(
  options: readonly T[] | undefined,
  value: string
): T | undefined {
  for (const option of options ?? []) {
    if (option.value === value) {
      return option;
    }
  }
  return undefined;
}

/**
 * Find a field of a schema by ID.
 * @param schema   Builder schema.
 * @param id       Field ID.
 * @returns Matching field, or `undefined`.
 */
function findField(schema: BuilderSchema, id: string): BuilderField | undefined {
  for (const field of schema.fields) {
    if (field.id === id) {
      return field;
    }
  }
  return undefined;
}

/**
 * Read a trimmed state value (`''` when unset).
 * @param state   Builder state.
 * @param id      Field ID.
 * @returns Trimmed field value.
 */
function readState(state: BuilderState, id: string): string {
  return (state[id] ?? '').trim();
}

/**
 * Normalize the stack groups textarea into the `/stack` DSL (line breaks start new row bands).
 * @param value   Raw textarea value.
 * @returns Normalized `/stack` DSL string.
 */
function normalizeStackGroups(value: string): string {
  return value.trim().replace(LINE_BREAK_RX, ';').replace(WHITESPACE_RX, '');
}

/**
 * Normalize the typing lines textarea into the `;`-separated `/typing` DSL (line breaks become `;`).
 * @param value   Raw textarea value.
 * @returns Normalized `;`-separated lines string.
 */
function normalizeTypingLinesInput(value: string): string {
  return value.trim().replace(LINE_BREAK_RX, ';');
}

/** Format a candidate horizontal `/stack` band of category groups within `maxBandCols`, or `undefined` when it overflows. */
function formatStackBand(
  bandGroups: readonly (readonly string[])[],
  maxBandCols = MAX_STACK_BAND_COLUMNS
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
  const values: (number | undefined)[] = [];
  for (const part of rawPerLine.trim().split(LIST_SEPARATOR_RX)) {
    const cleaned = part.trim();
    const parsed = cleaned ? Number(cleaned) : Number.NaN;
    const rounded = Math.round(parsed);
    values.push(
      Number.isFinite(parsed) && parsed >= 1
        ? Math.min(MAX_PER_LINE_COLUMNS, Math.max(1, rounded))
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
  const defaultPerLine = perLineValues[0] ?? MAX_STACK_BAND_COLUMNS;
  const explicitBands: string[] = [];
  let bandTokens: string[] = [];
  let bandCols = 0;
  let bandMaxRows = 1;
  let groupIndex = 0;

  for (const group of categoryGroups) {
    const tokens = group.filter(Boolean);
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
        (bandCols + groupCols > MAX_STACK_BAND_COLUMNS ||
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

/** Build a `/<prefix>[/:label[/:value]]` path, omitting empty trailing segments. */
function buildLabelValuePathname(prefix: string, label: string, value: string): string {
  if (!label && !value) {
    return `/${prefix}`;
  }
  return `/${prefix}/${encodeSegment(label)}${value ? `/${encodeSegment(value)}` : ''}`;
}

/** Encode a service target (multi-segment targets, e.g., Go module paths, keep their `/` separators). */
function encodeServiceTarget(service: BuilderServiceOption | undefined, rawTarget: string): string {
  if (!service || service.maxTargetSegments <= 1) {
    return encodeSegment(rawTarget);
  }
  const encodedSegments: string[] = [];
  for (const segment of rawTarget.split('/')) {
    if (segment) {
      encodedSegments.push(encodeSegment(segment));
    }
  }
  return encodedSegments.join('/');
}

/** Build the `/badge/:service/[:owner/]:target/:metric` path of the service badge builder. */
function buildServicePathname(schema: BuilderSchema, state: BuilderState): string {
  const service = findService(schema, readState(state, 'service'));
  const owner = service && service.ownerMode !== 'none' ? readState(state, 'owner') : '';
  const target = encodeServiceTarget(service, readState(state, 'target'));
  const ownerPart = owner ? `${encodeSegment(owner)}/` : '';
  return `/badge/${encodeSegment(readState(state, 'service'))}/${ownerPart}${target}/${encodeSegment(readState(state, 'metric'))}`;
}

/** Build the path segments of an element kind (without the query string). */
function buildPathname(schema: BuilderSchema, state: BuilderState): string {
  switch (schema.kind) {
    case 'badge': {
      return buildLabelValuePathname('badge', readState(state, 'label'), readState(state, 'value'));
    }
    case 'button': {
      return buildLabelValuePathname(
        'button',
        readState(state, 'label'),
        readState(state, 'value')
      );
    }
    case 'icon': {
      const icon = encodeSegment(readState(state, 'icon'));
      return icon ? `/icon/${icon}` : '/icon';
    }
    case 'quote': {
      const author = readState(state, 'author');
      const text = encodeSegment(readState(state, 'text'));
      if (author) {
        return `/quote/${encodeSegment(author)}/${text}`;
      }
      return text ? `/quote/${text}` : '/quote';
    }
    case 'service': {
      return buildServicePathname(schema, state);
    }
    case 'stack': {
      const groups = encodeSegment(normalizeStackGroups(readState(state, 'groups')));
      return groups ? `/stack/${groups}` : '/stack';
    }
    case 'typing': {
      const prefix = readState(state, 'prefix');
      const lines = encodeSegment(normalizeTypingLinesInput(readState(state, 'lines')));
      if (prefix) {
        return `/typing/${encodeSegment(prefix)}/${lines}`;
      }
      return lines ? `/typing/${lines}` : '/typing';
    }
    default: {
      return '/';
    }
  }
}

/**
 * Check whether a typing builder field applies to the currently selected container layout.
 * @param fieldId       Builder field ID.
 * @param layoutValue   Current `layout` field value.
 * @returns `true` when the field applies to the layout.
 */
function isTypingFieldActiveForLayout(fieldId: string, layoutValue: string): boolean {
  const effectiveLayout = layoutValue.trim().toLowerCase() || 'window';
  if (fieldId === 'title') {
    return effectiveLayout === 'window' || effectiveLayout === 'ide';
  }
  if (fieldId === 'hint') {
    return effectiveLayout !== 'none';
  }
  if (fieldId === 'align') {
    return effectiveLayout !== 'browser' && effectiveLayout !== 'ide';
  }
  return true;
}

/** Build the query string of every non-empty query parameter field. */
function buildQuery(schema: BuilderSchema, state: BuilderState): string {
  const pairs: string[] = [];
  const typingLayout = schema.kind === 'typing' ? readState(state, 'layout') : '';
  for (const field of schema.fields) {
    const value = (state[field.id] ?? '').trim();
    const isFieldActive =
      schema.kind !== 'typing' || isTypingFieldActiveForLayout(field.id, typingLayout);
    if (field.param && value && isFieldActive) {
      pairs.push(`${field.param}=${encodeSegment(value)}`);
    }
  }
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

/** Read the first non-empty query parameter of a list of names (empty values fall through like in the Worker). */
function readQueryParam(query: URLSearchParams, names: readonly string[]): string {
  for (const name of names) {
    const value = query.get(name);
    if (value) {
      return value;
    }
  }
  return '';
}

/** Read the first non-empty query fallback (`aliases`) of a path segment field (e.g., `?groups=` for `/stack`). */
function readSegmentFallback(schema: BuilderSchema, query: URLSearchParams, id: string): string {
  return readQueryParam(query, findField(schema, id)?.aliases ?? []);
}

/** Resolve a single motion token against optional `anim` field options (case-insensitive, mapping aliases). */
function resolveAnimOptionToken(
  token: string,
  options: readonly BuilderOption[] | undefined
): string | undefined {
  if (token === 'default') {
    return '';
  }
  if (!options) {
    return token;
  }
  for (const option of options) {
    if (option.value === token || option.aliases?.includes(token)) {
      return option.value;
    }
  }
  return undefined;
}

/**
 * Compose an `?anim=` value from the sheen toggle and up to two icon motions.
 * @param hasSheen   Whether the surface sheen is enabled.
 * @param left       Left (or only) icon motion (`''` for static).
 * @param right      Right icon motion (`''` for static).
 * @returns Serialized `?anim=` value.
 */
function composeAnim(hasSheen: boolean, left: string, right: string): string {
  const tokens: string[] = hasSheen ? ['sheen'] : [];
  if (right) {
    tokens.push(left || 'default', right);
  } else if (left) {
    tokens.push(left);
  }
  return tokens.join(',');
}

/**
 * Split an `?anim=` value into the sheen toggle and icon motions.
 * @param value     Serialized `?anim=` value.
 * @param options   Optional `anim` field options used to canonicalize aliases and reject unknown tokens.
 * @returns Sheen flag and left/right icon motion tokens.
 */
function splitAnim(
  value: string,
  options?: readonly BuilderOption[]
): { hasSheen: boolean; left: string; right: string } {
  const motions: string[] = [];
  let hasSheen = false;
  for (const token of value.trim().toLowerCase().split(LIST_SEPARATOR_RX)) {
    if (token === 'sheen') {
      if (hasSheen && options) {
        return { hasSheen: false, left: '', right: '' };
      }
      hasSheen = true;
    } else if (token) {
      const resolved = resolveAnimOptionToken(token, options);
      if (resolved === undefined) {
        return { hasSheen: false, left: '', right: '' };
      }
      motions.push(resolved);
    }
  }
  if (options && motions.length > 2) {
    return { hasSheen: false, left: '', right: '' };
  }
  const left = motions[0] ?? '';
  const right = motions[1] ?? '';
  if (hasSheen && !right && left === 'none') {
    return { hasSheen, left: '', right: '' };
  }
  return { hasSheen, left, right };
}

/** Normalize a prefilled option value like the Worker parsers: Case-insensitive, aliases map onto their option. */
function normalizeOptionValue(field: BuilderField, raw: string): string {
  if (field.control === 'number') {
    const clean = raw.trim();
    return clean && Number.isFinite(Number(clean)) ? clean : '';
  }
  if (field.control === 'size') {
    const clean = raw.trim().toLowerCase();
    return clean && (findOption(field.options, clean) || Number.isFinite(Number(clean)))
      ? clean
      : '';
  }
  if (field.control === 'anim') {
    const anim = splitAnim(raw, field.options);
    if (field.animScope === 'stack' && anim.right) {
      return '';
    }
    return composeAnim(anim.hasSheen, anim.left, field.animScope === 'pair' ? anim.right : '');
  }
  if (field.control !== 'select' && field.control !== 'color') {
    return raw;
  }
  const clean = raw.trim().toLowerCase();
  for (const option of field.options ?? []) {
    if (option.value === clean || option.aliases?.includes(clean)) {
      return option.value;
    }
  }
  return '';
}

/** Canonicalize a requested service metric like the Worker (case-insensitive, metric aliases). */
function canonicalizeMetric(service: BuilderServiceOption, raw: string): string {
  const clean = raw.trim().toLowerCase();
  const aliases = service.metricAliases;
  return aliases && Object.hasOwn(aliases, clean) ? (aliases[clean] ?? clean) : clean;
}

/** Split a root-relative path or absolute URL into its route prefix, decoded segments, and query. */
function parseRoute(rawPath: string, origin: string): ParsedRoute | undefined {
  if (!URL.canParse(rawPath, origin)) {
    return undefined;
  }
  const url = new URL(rawPath, origin);
  const rawParts = url.pathname.split('/');
  const segments: string[] = [];
  for (const rawSegment of rawParts.slice(2)) {
    segments.push(decodeSegment(rawSegment));
  }
  if (segments.at(-1) === '') {
    segments.pop();
  }
  return { prefix: rawParts[1] ?? '', query: url.searchParams, segments };
}

/** Path segment parsers per element kind; Each one fills `state` and reports whether the route belongs to the builder. */
const PATH_PARSERS: Readonly<
  Record<string, (state: BuilderState, route: ParsedRoute, schema: BuilderSchema) => boolean>
> = {
  badge(state, { prefix, segments }) {
    Object.assign(state, { label: segments[0] ?? '', value: segments[1] ?? '' });
    return prefix === 'badge' && segments.length <= 2;
  },
  button(state, { prefix, segments }) {
    Object.assign(state, { label: segments[0] ?? '', value: segments[1] ?? '' });
    return (prefix === 'button' || prefix === 'btn') && segments.length <= 2;
  },
  icon(state, { prefix, segments }) {
    state.icon = segments[0] ?? '';
    return prefix === 'icon' && segments.length === 1;
  },
  quote(state, { prefix, query, segments }, schema) {
    const hasAuthorSegment = segments.length === 2;
    state.author = hasAuthorSegment
      ? (segments[0] ?? '')
      : readSegmentFallback(schema, query, 'author');
    state.text =
      (hasAuthorSegment ? segments[1] : segments[0]) || readSegmentFallback(schema, query, 'text');
    const layoutField = findField(schema, 'layout');
    const layoutNames = layoutField?.param
      ? [layoutField.param, ...(layoutField.aliases ?? [])]
      : [];
    const center = (query.get('center') ?? '').trim().toLowerCase();
    if (!readQueryParam(query, layoutNames).trim() && CENTER_FLAG_VALUES.has(center)) {
      state.layout = 'vertical';
    }
    return prefix === 'quote' && segments.length <= 2;
  },
  service(state, { prefix, segments }, schema) {
    const service = findService(schema, (segments[0] ?? '').toLowerCase());
    if (prefix !== 'badge' || !service || segments.length < 3) {
      return false;
    }
    const middle = segments.slice(1, -1);
    state.service = service.key;
    state.metric = canonicalizeMetric(service, segments.at(-1) ?? '');
    if (service.maxTargetSegments > 1) {
      const hasOwnerSegment = service.ownerMode === 'required';
      const targetSegments = hasOwnerSegment ? middle.slice(1) : middle;
      state.owner = hasOwnerSegment ? (middle[0] ?? '') : '';
      state.target = targetSegments.join('/');
      return targetSegments.length >= 1 && targetSegments.length <= service.maxTargetSegments;
    }
    if (middle.length === 2) {
      state.owner = middle[0] ?? '';
      state.target = middle[1] ?? '';
      return service.ownerMode !== 'none';
    }
    state.target = middle[0] ?? '';
    return middle.length === 1;
  },
  stack(state, { prefix, query, segments }, schema) {
    state.groups = segments[0] || readSegmentFallback(schema, query, 'groups');
    return prefix === 'stack' && segments.length <= 1;
  },
  typing(state, { prefix, query, segments }, schema) {
    const hasPrefixSegment = segments.length === 2;
    state.prefix = hasPrefixSegment
      ? (segments[0] ?? '')
      : readSegmentFallback(schema, query, 'prefix');
    state.lines =
      (hasPrefixSegment ? segments[1] : segments[0]) || readSegmentFallback(schema, query, 'lines');
    const alignField = findField(schema, 'align');
    const alignNames = alignField?.param ? [alignField.param, ...(alignField.aliases ?? [])] : [];
    const center = (query.get('center') ?? '').trim().toLowerCase();
    if (!readQueryParam(query, alignNames).trim() && CENTER_FLAG_VALUES.has(center)) {
      state.align = 'center';
    }
    return (prefix === 'typing' || prefix === 'type') && segments.length <= 2;
  },
};

/** Join non-empty parts with a separator. */
function joinNonEmpty(parts: readonly string[], separator: string): string {
  let joined = '';
  for (const part of parts) {
    if (part) {
      joined = joined ? `${joined}${separator}${part}` : part;
    }
  }
  return joined;
}

/** Cached compiled regex for `BuilderSchema.redirectValuePattern` (`undefined` until first used). */
let cachedRedirectPatternRx: RegExp | undefined = undefined;
let cachedRedirectPatternSource = '';

/** Build the upstream page URL of a service badge from its metric's redirect template, or `''` when unavailable. */
function buildServiceRedirectUrl(schema: BuilderSchema, state: BuilderState): string {
  const service = findService(schema, readState(state, 'service'));
  const template = findOption(service?.metrics, readState(state, 'metric'))?.redirect;
  if (!service || !template || !schema.redirectValuePattern) {
    return '';
  }
  if (!cachedRedirectPatternRx || schema.redirectValuePattern !== cachedRedirectPatternSource) {
    cachedRedirectPatternSource = schema.redirectValuePattern;
    cachedRedirectPatternRx = new RegExp(schema.redirectValuePattern);
  }
  const valuePattern = cachedRedirectPatternRx;
  const explicitOwner = service.ownerMode === 'none' ? '' : readState(state, 'owner');
  const owner = explicitOwner || service.defaultOwner || '';
  const target = readState(state, 'target');
  const targetSegments = target.split('/');
  if (targetSegments.length > service.maxTargetSegments || (owner && !valuePattern.test(owner))) {
    return '';
  }
  for (const segment of targetSegments) {
    if (!valuePattern.test(segment)) {
      return '';
    }
  }
  return template.replaceAll('{owner}', owner).replaceAll('{target}', target);
}

// -------------------------------------- PUBLIC API -------------------------------------

export {
  composeAnim,
  decodeSegment,
  encodeSegment,
  findField,
  findOption,
  findService,
  isTypingFieldActiveForLayout,
  normalizeStackGroups,
  readState,
  splitAnim,
};

/**
 * Compose an `?icon=` value from its left and right slugs (`none,right` or the `,right` preset shorthand).
 * @param left            Left slug (`''` for none).
 * @param right           Right slug (`''` for none).
 * @param hasPresetIcon   Whether an empty left slug keeps a preset icon.
 * @returns Serialized `?icon=` value.
 */
export function composeIconPair(left: string, right: string, hasPresetIcon: boolean): string {
  const leftSlug = left.trim();
  const rightSlug = right.trim();
  if (!rightSlug) {
    return leftSlug;
  }
  return `${leftSlug || (hasPresetIcon ? '' : 'none')},${rightSlug}`;
}

/**
 * Split an `?icon=` value into its left and right slugs.
 * @param value           Serialized value.
 * @param hasPresetIcon   Whether `none` is meaningful on the left.
 * @returns `[left, right]` icon slugs.
 */
export function splitIconPair(
  value: string,
  hasPresetIcon: boolean
): [left: string, right: string] {
  const commaIndex = value.indexOf(',');
  if (commaIndex === -1) {
    return [value.trim(), ''];
  }
  const left = value.slice(0, commaIndex).trim();
  const right = value.slice(commaIndex + 1).trim();
  return [left === 'none' && !hasPresetIcon ? '' : left, right];
}

/**
 * Compose a `?hint=` value from an optional icon slug and optional label text (`icon:<slug>[ <text>]` or `<text>`).
 * @param icon   Icon slug (`''` for none).
 * @param text   Hint label text (`''` for none).
 * @returns Serialized `?hint=` value.
 */
export function composeHint(icon: string, text: string): string {
  const cleanIcon = icon.trim();
  const cleanText = text.trim();
  if (!cleanIcon || cleanIcon.toLowerCase() === 'none') {
    return cleanText;
  }
  return cleanText ? `icon:${cleanIcon} ${cleanText}` : `icon:${cleanIcon}`;
}

/**
 * Split a `?hint=` value into its optional icon slug and label text.
 * @param value   Serialized `?hint=` value.
 * @returns `{ icon, text }` parts.
 */
export function splitHint(value: string): { icon: string; text: string } {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') {
    return { icon: '', text: '' };
  }
  if (trimmed.slice(0, 5).toLowerCase() === 'icon:') {
    const rest = trimmed.slice(5).trim();
    if (!rest) {
      return { icon: '', text: '' };
    }
    const match = HINT_ICON_REST_RX.exec(rest);
    const icon = (match?.groups?.slug ?? '').trim();
    const text = (match?.groups?.text ?? '').trim();
    return { icon: icon.toLowerCase() === 'none' ? '' : icon, text };
  }
  return { icon: '', text: trimmed };
}

/**
 * Compose a `?special=` value from the widget kind, payload, and modifier.
 * @param kind            Widget kind (`''` for none).
 * @param payload         Widget data.
 * @param modifier        Optional modifier of the kind (e.g., `static`).
 * @param isAutoAllowed   Whether an empty payload emits an automatic widget token.
 * @returns Serialized `?special=` value.
 */
export function composeSpecial(
  kind: string,
  payload: string,
  modifier: string,
  isAutoAllowed = false
): string {
  if (!kind) {
    return '';
  }
  if (kind === 'none') {
    return 'none';
  }
  const cleanPayload = payload.trim();
  if (!cleanPayload) {
    if (!isAutoAllowed) {
      return '';
    }
    return modifier ? `${kind}:${modifier}` : kind;
  }
  return modifier ? `${kind}:${cleanPayload}:${modifier}` : `${kind}:${cleanPayload}`;
}

/**
 * Split a `?special=` value into its widget kind, payload, and modifier (modifiers come from the kind options).
 * @param value     Serialized `?special=` value.
 * @param options   Widget kind options of the `special` field.
 * @returns Parsed `kind`, `modifier`, and `payload`.
 */
export function splitSpecial(
  value: string,
  options: readonly BuilderOption[]
): { kind: string; modifier: string; payload: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { kind: '', modifier: '', payload: '' };
  }
  const lower = trimmed.toLowerCase();
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex === -1) {
    return findOption(options, lower)
      ? { kind: lower, modifier: '', payload: '' }
      : { kind: '', modifier: '', payload: '' };
  }
  if (colonIndex === 0) {
    return { kind: '', modifier: '', payload: '' };
  }
  const kind = trimmed.slice(0, colonIndex).trim().toLowerCase();
  const kindOption = findOption(options, kind);
  if (!kindOption || kind === 'none') {
    return { kind: '', modifier: '', payload: '' };
  }
  let payload = trimmed.slice(colonIndex + 1);
  let modifier = '';
  const { modifiers } = kindOption;
  const trimmedPayloadLower = payload.trim().toLowerCase();
  if (modifiers && trimmedPayloadLower && findOption(modifiers, trimmedPayloadLower)) {
    return { kind, modifier: trimmedPayloadLower, payload: '' };
  }
  const lastColon = payload.lastIndexOf(':');
  if (modifiers && lastColon !== -1) {
    const candidate = payload
      .slice(lastColon + 1)
      .trim()
      .toLowerCase();
    if (candidate && findOption(modifiers, candidate)) {
      modifier = candidate;
      payload = payload.slice(0, lastColon);
    }
  }
  const cleanPayload = payload.trim();
  return { kind, modifier, payload: cleanPayload.toLowerCase() === 'auto' ? '' : cleanPayload };
}

/**
 * Split a `?size=` value into a named preset or a custom number.
 * @param value     Serialized `?size=` value.
 * @param options   Named preset options.
 * @returns Preset token (`'custom'` for numeric values) and custom pixel string.
 */
export function splitSize(
  value: string,
  options: readonly BuilderOption[]
): { custom: string; preset: string } {
  const clean = value.trim().toLowerCase();
  if (!clean) {
    return { custom: '', preset: '' };
  }
  if (findOption(options, clean)) {
    return { custom: '', preset: clean };
  }
  return Number.isFinite(Number(clean))
    ? { custom: clean, preset: 'custom' }
    : { custom: '', preset: '' };
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

  const maxBandCols = perLineValues[0] ?? MAX_STACK_BAND_COLUMNS;
  const bandStrings: string[] = [];
  let currentBand: string[][] = [];

  for (const group of categoryGroups) {
    const tokens = group.filter(Boolean);
    if (tokens.length > 0) {
      if (
        currentBand.length > 0 &&
        formatStackBand([...currentBand, tokens], maxBandCols) === undefined
      ) {
        bandStrings.push(formatStackBand(currentBand, maxBandCols) ?? '');
        currentBand = [tokens];
      } else {
        currentBand.push(tokens);
      }
    }
  }
  if (currentBand.length > 0) {
    bandStrings.push(formatStackBand(currentBand, maxBandCols) ?? '');
  }
  return bandStrings.join(';');
}

/**
 * Build the root-relative URL of the current state, listing required fields that are still empty.
 * @param schema   Builder schema.
 * @param state    Current builder state.
 * @returns Root-relative SVG path and missing required field labels.
 */
export function buildPath(schema: BuilderSchema, state: BuilderState): BuilderBuildResult {
  const missing: string[] = [];
  for (const field of schema.fields) {
    if (field.isRequired && !readState(state, field.id)) {
      missing.push(field.label);
    }
  }
  const service = schema.kind === 'service' ? findService(schema, state.service) : undefined;
  if (service?.ownerMode === 'required' && !readState(state, 'owner')) {
    missing.push('Owner');
  }
  return { missing, path: `${buildPathname(schema, state)}${buildQuery(schema, state)}` };
}

/**
 * Build the preview URL of a path: Reduced motion previews append `anim=none` (an `<img>` keeps playing SMIL).
 * @param path              Root-relative SVG path with an optional query string.
 * @param isReducedMotion   Whether the user prefers reduced motion.
 * @returns Preview image `src` path.
 */
export function buildPreviewPath(path: string, isReducedMotion: boolean): string {
  if (!isReducedMotion || !path) {
    return path;
  }
  const queryIndex = path.indexOf('?');
  const pairs: string[] = [];
  if (queryIndex !== -1) {
    for (const pair of path.slice(queryIndex + 1).split('&')) {
      if (pair && !pair.startsWith('anim=')) {
        pairs.push(pair);
      }
    }
  }
  pairs.push(STATIC_ANIM_PAIR);
  return `${queryIndex === -1 ? path : path.slice(0, queryIndex)}?${pairs.join('&')}`;
}

/**
 * Parse an existing SVG URL (path and query) into builder state ("Open in Builder" and shared links).
 * @param schema    Builder schema.
 * @param rawPath   Root-relative path or absolute URL.
 * @returns State with every field set, or `undefined` when the path belongs to another builder.
 */
export function parsePath(schema: BuilderSchema, rawPath: string): BuilderState | undefined {
  const route = parseRoute(rawPath, schema.origin);
  const parsePathSegments = PATH_PARSERS[schema.kind];
  if (!route || !parsePathSegments) {
    return undefined;
  }
  const state: BuilderState = {};
  for (const field of schema.fields) {
    const raw = field.param
      ? readQueryParam(route.query, [field.param, ...(field.aliases ?? [])])
      : '';
    state[field.id] = normalizeOptionValue(field, raw);
  }
  return parsePathSegments(state, route, schema) ? state : undefined;
}

/**
 * Build the default alt text of the current state.
 * @param schema   Builder schema.
 * @param state    Current builder state.
 * @returns Human-readable default alt text.
 */
export function buildAltText(schema: BuilderSchema, state: BuilderState): string {
  switch (schema.kind) {
    case 'badge': {
      return joinNonEmpty([readState(state, 'label'), readState(state, 'value')], ': ') || 'Badge';
    }
    case 'button': {
      return joinNonEmpty([readState(state, 'label'), readState(state, 'value')], ' ') || 'Button';
    }
    case 'icon': {
      return readState(state, 'icon') || 'Icon';
    }
    case 'quote': {
      return readState(state, 'author') ? `Quote by ${readState(state, 'author')}` : 'Quote';
    }
    case 'service': {
      const service = findService(schema, readState(state, 'service'));
      return (
        readState(state, 'label') ||
        joinNonEmpty(
          [service?.title ?? '', readState(state, 'target'), readState(state, 'metric')],
          ' '
        )
      );
    }
    case 'typing': {
      const firstLine = normalizeTypingLinesInput(readState(state, 'lines')).split(';')[0]?.trim();
      return firstLine || 'Typing Animation';
    }
    default: {
      return 'Tech Stack';
    }
  }
}

/**
 * Build the default link target wrapped around the image when the link field is empty: Service badges link to
 * their upstream page (filled from the metric's redirect template) or, without a template, to their query-free
 * badge path; Other elements stay unlinked.
 * @param schema   Builder schema.
 * @param state    Current builder state.
 * @param url      Absolute SVG URL.
 * @returns Link target (`''` for an unlinked image).
 */
export function buildDefaultLinkTarget(
  schema: BuilderSchema,
  state: BuilderState,
  url: string
): string {
  if (schema.kind !== 'service') {
    return '';
  }
  const upstreamUrl = buildServiceRedirectUrl(schema, state);
  if (upstreamUrl) {
    return upstreamUrl;
  }
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

/**
 * Build a shareable builder URL with the current path, alt text, and link target.
 * @param href   Current builder page URL.
 * @param path   Root-relative SVG path.
 * @param alt    Custom alt text (`''` omits the parameter).
 * @param link   Custom link target (`''` omits the parameter).
 * @returns Shareable builder URL string.
 */
export function buildShareUrl(href: string, path: string, alt: string, link: string): string {
  const shareUrl = new URL(href);
  shareUrl.searchParams.set('path', path);
  for (const [name, value] of Object.entries({ alt, link })) {
    if (value) {
      shareUrl.searchParams.set(name, value);
    } else {
      shareUrl.searchParams.delete(name);
    }
  }
  return shareUrl.href;
}
