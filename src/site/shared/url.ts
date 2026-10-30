/**
 * Shared URL Builder & Parser
 *
 * Synthesizes root-relative SVG paths, alt text, link targets, and shareable links, and parses existing routes into builder state.
 */

import {
  isTypingFieldActiveForLayout,
  normalizeOptionValue,
  normalizeQueryFieldValue,
  normalizeSpecialFieldValue,
} from '@/site/shared/defaults';
import {
  decodeRouteSegments,
  encodeSegment,
  findField,
  findOption,
  findService,
  getOwnValue,
  isTruthyFlagToken,
  normalizeTypingLinesInput,
  readState,
} from '@/site/shared/encoding';
import { normalizeStackGroups } from '@/site/shared/stackDsl';
import type {
  BuilderBuildResult,
  BuilderKind,
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

/** Query parameter pair appended to reduced-motion previews (stops sheens, icon motions, widgets, and dots). */
const STATIC_ANIM_PAIR = 'anim=none';

/** Isomorphic map of short SVG route alias prefixes to their canonical route prefixes (verified against `SVG_ROUTES` in tests). */
export const ROUTE_PREFIX_ALIASES: Readonly<Record<string, string>> = {
  btn: 'button',
  type: 'typing',
};

/** Cached compiled regex for `BuilderSchema.redirectValuePattern` (`undefined` until first used). */
let cachedRedirectPatternRx: RegExp | undefined = undefined;

/** Source pattern currently compiled in `cachedRedirectPatternRx`. */
let cachedRedirectPatternSource = '';

// -------------------------------------- INTERNALS --------------------------------------

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
      if (author && text) {
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
      if (prefix && lines) {
        return `/typing/${encodeSegment(prefix)}/${lines}`;
      }
      return lines ? `/typing/${lines}` : '/typing';
    }
    default: {
      return '/';
    }
  }
}

/** Build the query string of every non-default query parameter field. */
function buildQuery(schema: BuilderSchema, state: BuilderState): string {
  const pairs: string[] = [];
  if (schema.kind === 'quote' && !readState(state, 'text')) {
    const author = readState(state, 'author');
    if (author) {
      pairs.push(`author=${encodeSegment(author)}`);
    }
  } else if (schema.kind === 'typing' && !normalizeTypingLinesInput(readState(state, 'lines'))) {
    const prefix = readState(state, 'prefix');
    if (prefix) {
      pairs.push(`prefix=${encodeSegment(prefix)}`);
    }
  }
  const typingLayout = schema.kind === 'typing' ? readState(state, 'layout') : '';
  for (const field of schema.fields) {
    const rawValue = (state[field.id] ?? '').trim();
    const isFieldActive =
      schema.kind !== 'typing' || isTypingFieldActiveForLayout(field.id, typingLayout);
    if (field.param && rawValue && isFieldActive) {
      const normalizedValue = normalizeQueryFieldValue(schema, state, field, rawValue);
      if (normalizedValue) {
        pairs.push(`${field.param}=${encodeSegment(normalizedValue)}`);
      }
    }
  }
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

/** Read the first non-whitespace query parameter of a list of names (blank values fall through like in the Worker). */
function readQueryParam(query: URLSearchParams, names: readonly string[]): string {
  for (const name of names) {
    const value = query.get(name);
    if (value && value.trim()) {
      return value;
    }
  }
  return '';
}

/** Read the first non-empty query fallback (`aliases`) of a path segment field (e.g., `?groups=` for `/stack`). */
function readSegmentFallback(schema: BuilderSchema, query: URLSearchParams, id: string): string {
  return readQueryParam(query, findField(schema, id)?.aliases ?? []);
}

/** Check whether `?center=` carries a truthy boolean flag token. */
function hasTruthyCenterFlag(query: URLSearchParams): boolean {
  return isTruthyFlagToken((query.get('center') ?? '').trim().toLowerCase());
}

/** Populate an optional leading segment (`author` or `prefix`) and primary body segment (`text` or `lines`). */
function parseOptionalLeadingPair(
  state: BuilderState,
  schema: BuilderSchema,
  route: ParsedRoute,
  leadingId: string,
  primaryId: string
): void {
  const hasLeadingSegment = route.segments.length === 2;
  state[leadingId] = hasLeadingSegment
    ? (route.segments[0] ?? '')
    : readSegmentFallback(schema, route.query, leadingId);
  state[primaryId] =
    (hasLeadingSegment ? route.segments[1] : route.segments[0]) ||
    readSegmentFallback(schema, route.query, primaryId);
}

/** Canonicalize a requested service metric like the Worker (case-insensitive, metric aliases). */
function canonicalizeMetric(service: BuilderServiceOption, raw: string): string {
  const clean = raw.trim().toLowerCase();
  return (service.metricAliases ? getOwnValue(service.metricAliases, clean) : undefined) ?? clean;
}

/** Split a root-relative path or absolute URL into its route prefix, decoded segments, and query. */
function parseRoute(rawPath: string, origin: string): ParsedRoute | undefined {
  if (!URL.canParse(rawPath, origin)) {
    return undefined;
  }
  const url = new URL(rawPath, origin);
  const rawParts = url.pathname.split('/');
  return {
    prefix: rawParts[1] ?? '',
    query: url.searchParams,
    segments: decodeRouteSegments(rawParts),
  };
}

/** Parse service badge path segments into `state` and report whether they match `service`'s route arity. */
function parseServiceSegments(
  state: BuilderState,
  { prefix, segments }: ParsedRoute,
  schema: BuilderSchema
): boolean {
  const service = findService(schema, (segments[0] ?? '').toLowerCase());
  if (prefix !== 'badge' || !service || segments.length < 3) {
    return false;
  }
  const middle = segments.slice(1, -1);
  const metric = canonicalizeMetric(service, segments.at(-1) ?? '');
  if (middle.includes('') || !findOption(service.metrics, metric)) {
    return false;
  }
  state.service = service.key;
  state.metric = metric;
  const minTargetSegments = service.minTargetSegments ?? 1;
  if (service.maxTargetSegments > 1) {
    const hasOwnerSegment = service.ownerMode === 'required';
    const targetSegments = hasOwnerSegment ? middle.slice(1) : middle;
    state.owner = hasOwnerSegment ? (middle[0] ?? '') : '';
    state.target = targetSegments.join('/');
    return (
      targetSegments.length >= minTargetSegments &&
      targetSegments.length <= service.maxTargetSegments
    );
  }
  if (middle.length === 2) {
    state.owner = middle[0] ?? '';
    state.target = middle[1] ?? '';
    return service.ownerMode !== 'none';
  }
  state.target = middle[0] ?? '';
  return middle.length === 1 && service.ownerMode !== 'required';
}

/** Populate quote path segments and `?center=` fallback. */
function parseQuoteSegments(state: BuilderState, schema: BuilderSchema, route: ParsedRoute): void {
  parseOptionalLeadingPair(state, schema, route, 'author', 'text');
  const layoutField = findField(schema, 'layout');
  const rawLayout = layoutField?.param
    ? readQueryParam(route.query, [layoutField.param, ...(layoutField.aliases ?? [])])
    : '';
  if (!rawLayout && hasTruthyCenterFlag(route.query)) {
    state.layout = 'vertical';
  }
}

/** Populate typing path segments and `?center=` fallback. */
function parseTypingSegments(state: BuilderState, schema: BuilderSchema, route: ParsedRoute): void {
  parseOptionalLeadingPair(state, schema, route, 'prefix', 'lines');
  if (!state.align && hasTruthyCenterFlag(route.query)) {
    state.align = 'center';
  }
}

/** Resolve the builder element kind matching `route`'s prefix and decoded segment count. */
function resolveRouteBuilderKind(route: ParsedRoute): BuilderKind | undefined {
  const { segments } = route;
  const canonicalPrefix = getOwnValue(ROUTE_PREFIX_ALIASES, route.prefix) ?? route.prefix;
  switch (canonicalPrefix) {
    case 'badge': {
      return segments.length <= 2 ? 'badge' : 'service';
    }
    case 'button': {
      return segments.length <= 2 ? 'button' : undefined;
    }
    case 'icon': {
      return segments.length === 1 ? 'icon' : undefined;
    }
    case 'quote': {
      return segments.length <= 2 ? 'quote' : undefined;
    }
    case 'stack': {
      return segments.length <= 1 ? 'stack' : undefined;
    }
    case 'typing': {
      return segments.length <= 2 ? 'typing' : undefined;
    }
    default: {
      return undefined;
    }
  }
}

/** Populate path-derived `state` fields and report whether `route` belongs to `schema.kind`. */
function parsePathSegments(
  state: BuilderState,
  route: ParsedRoute,
  schema: BuilderSchema
): boolean {
  if (resolveRouteBuilderKind(route) !== schema.kind) {
    return false;
  }
  const { query, segments } = route;
  switch (schema.kind) {
    case 'badge':
    case 'button': {
      state.label = segments[0] ?? '';
      state.value = segments[1] ?? '';
      return true;
    }
    case 'icon': {
      state.icon = segments[0] ?? '';
      return true;
    }
    case 'quote': {
      parseQuoteSegments(state, schema, route);
      return true;
    }
    case 'service': {
      return parseServiceSegments(state, route, schema);
    }
    case 'stack': {
      state.groups = segments[0] || readSegmentFallback(schema, query, 'groups');
      return true;
    }
    case 'typing': {
      parseTypingSegments(state, schema, route);
      return true;
    }
    default: {
      return false;
    }
  }
}

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
  if (service.ownerMode === 'required' && !explicitOwner) {
    return '';
  }
  const owner = explicitOwner || service.defaultOwner || '';
  const target = readState(state, 'target');
  const targetSegments = target.split('/');
  const minTargetSegments = service.minTargetSegments ?? 1;
  if (
    targetSegments.length < minTargetSegments ||
    targetSegments.length > service.maxTargetSegments ||
    (owner && !valuePattern.test(owner))
  ) {
    return '';
  }
  for (const segment of targetSegments) {
    if (!valuePattern.test(segment)) {
      return '';
    }
  }
  return template.replaceAll('{owner}', owner).replaceAll('{target}', target);
}

/** Set a non-empty query parameter or delete it when empty. */
function setOptionalSearchParam(params: URLSearchParams, name: string, value: string): void {
  if (value) {
    params.set(name, value);
  } else {
    params.delete(name);
  }
}

/** Replace route alias prefixes with their canonical SVG route prefixes. */
function canonicalizeSvgPathPrefix(rawPath: string): string {
  for (const [alias, canonical] of Object.entries(ROUTE_PREFIX_ALIASES)) {
    const aliasPrefix = `/${alias}`;
    if (
      rawPath === aliasPrefix ||
      rawPath.startsWith(`${aliasPrefix}/`) ||
      rawPath.startsWith(`${aliasPrefix}?`)
    ) {
      return `/${canonical}${rawPath.slice(aliasPrefix.length)}`;
    }
  }
  return rawPath;
}

/** Check whether `query` contains at least one non-blank parameter recognized by `schema`. */
function hasSchemaQueryParam(query: URLSearchParams, schema: BuilderSchema): boolean {
  if ((schema.kind === 'quote' || schema.kind === 'typing') && readQueryParam(query, ['center'])) {
    return true;
  }
  for (const field of schema.fields) {
    const names = field.param ? [field.param, ...(field.aliases ?? [])] : (field.aliases ?? []);
    if (names.length > 0 && readQueryParam(query, names)) {
      return true;
    }
  }
  return false;
}

// -------------------------------------- PUBLIC API -------------------------------------

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
 * Resolve the builder element kind matching an existing SVG path and query string.
 * @param rawPath   Root-relative path or absolute URL.
 * @param origin    Base origin used to parse `rawPath`.
 * @returns Matching builder kind, or `undefined` when `rawPath` is not a valid SVG route.
 */
export function resolvePathBuilderKind(rawPath: string, origin: string): BuilderKind | undefined {
  const route = parseRoute(rawPath, origin);
  return route ? resolveRouteBuilderKind(route) : undefined;
}

/**
 * Parse an existing SVG URL (path and query) into builder state (preview edit links and shared builder URLs).
 * @param schema    Builder schema.
 * @param rawPath   Root-relative path or absolute URL.
 * @returns State with every field set, or `undefined` when the path belongs to another builder.
 */
export function parsePath(schema: BuilderSchema, rawPath: string): BuilderState | undefined {
  const route = parseRoute(rawPath, schema.origin);
  if (!route) {
    return undefined;
  }
  const state: BuilderState = {};
  for (const field of schema.fields) {
    const raw = field.param
      ? readQueryParam(route.query, [field.param, ...(field.aliases ?? [])])
      : '';
    state[field.id] = normalizeOptionValue(field, raw);
  }
  if (!parsePathSegments(state, route, schema)) {
    return undefined;
  }
  if (schema.kind === 'service' && state.special) {
    const specialField = findField(schema, 'special');
    if (specialField) {
      state.special = normalizeSpecialFieldValue(schema, state, specialField, state.special);
    }
  }
  return state;
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
 * Build the default link target wrapped around the image when the link field is empty:
 * Service badges link to their upstream page (filled from the metric's redirect template) or, without a template, to their query-free badge path;
 * Other elements stay unlinked.
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
 * Strip builder-only query parameters (`alt`, `link`, `path`) while preserving raw SVG query pairs.
 * @param rawSearch   Raw query string with or without a leading `?`.
 * @returns Filtered `?…` query string (`''` when no SVG parameters remain).
 */
export function stripBuilderMetaQuery(rawSearch: string): string {
  const body = rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch;
  if (!body) {
    return '';
  }
  const kept: string[] = [];
  for (const pair of body.split('&')) {
    const equalsIndex = pair.indexOf('=');
    const key = equalsIndex === -1 ? pair : pair.slice(0, equalsIndex);
    if (key && key !== 'alt' && key !== 'link' && key !== 'path') {
      kept.push(pair);
    }
  }
  return kept.length > 0 ? `?${kept.join('&')}` : '';
}

/**
 * Extract the prefilled root-relative SVG path from a builder page URL (`/builder/<svg-path>` or legacy `?path=…`).
 * @param href     Current builder page URL.
 * @param schema   Active builder schema.
 * @returns Root-relative SVG path (`''` on a clean `/builder/:kind` landing URL).
 */
export function extractBuilderPrefillPath(href: string, schema: BuilderSchema): string {
  if (!URL.canParse(href)) {
    return '';
  }
  const locationUrl = new URL(href);
  const legacyPath = locationUrl.searchParams.get('path') ?? '';
  if (legacyPath) {
    return legacyPath;
  }
  if (!locationUrl.pathname.startsWith('/builder/')) {
    return '';
  }
  const svgPathname = locationUrl.pathname.slice('/builder'.length);
  const svgSearch = stripBuilderMetaQuery(locationUrl.search);
  const secondSlash = svgPathname.indexOf('/', 1);
  if (secondSlash !== -1 && secondSlash < svgPathname.length - 1) {
    return `${svgPathname}${svgSearch}`;
  }
  if (
    svgSearch &&
    resolvePathBuilderKind(svgPathname, schema.origin) === schema.kind &&
    hasSchemaQueryParam(locationUrl.searchParams, schema)
  ) {
    return `${svgPathname}${svgSearch}`;
  }
  return '';
}

/**
 * Build a shareable `/builder/<svg-path>` URL with the current path, alt text, and link target.
 * @param href   Current builder page URL.
 * @param path   Root-relative SVG path (`''` keeps `href`'s pathname).
 * @param alt    Custom alt text (`''` omits the parameter).
 * @param link   Custom link target (`''` omits the parameter).
 * @returns Shareable builder URL string.
 */
export function buildShareUrl(href: string, path: string, alt: string, link: string): string {
  const parsed = new URL(href);
  let basePathname = parsed.pathname;
  let svgSearch = '';
  if (path) {
    const canonicalPath = canonicalizeSvgPathPrefix(path);
    const queryIndex = canonicalPath.indexOf('?');
    const svgPathname = queryIndex === -1 ? canonicalPath : canonicalPath.slice(0, queryIndex);
    svgSearch = queryIndex === -1 ? '' : stripBuilderMetaQuery(canonicalPath.slice(queryIndex));
    basePathname = `/builder${svgPathname}`;
  }
  const metaParams = new URLSearchParams();
  setOptionalSearchParam(metaParams, 'alt', alt);
  setOptionalSearchParam(metaParams, 'link', link);
  const metaQuery = metaParams.toString();
  let combinedQuery = svgSearch;
  if (metaQuery) {
    combinedQuery = combinedQuery ? `${combinedQuery}&${metaQuery}` : `?${metaQuery}`;
  }
  return `${parsed.origin}${basePathname}${combinedQuery}`;
}
