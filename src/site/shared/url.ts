/**
 * Shared URL builder & parser – Synthesizes root-relative SVG paths, alt text, link targets, and shareable links, and parses existing routes into builder state.
 */

import {
  isTypingFieldActiveForLayout,
  normalizeOptionValue,
  normalizeQueryFieldValue,
} from '@/site/shared/defaults';
import {
  decodeSegment,
  encodeSegment,
  findField,
  findOption,
  findService,
  normalizeTypingLinesInput,
  readState,
} from '@/site/shared/encoding';
import { normalizeStackGroups } from '@/site/shared/stackDsl';
import type {
  BuilderBuildResult,
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

/** Normalized `?center=` values treated as truthy layout or alignment flags. */
const CENTER_FLAG_VALUES: ReadonlySet<string> = new Set(['1', 'true', 'yes']);

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

/** Build the query string of every non-default query parameter field. */
function buildQuery(schema: BuilderSchema, state: BuilderState): string {
  const pairs: string[] = [];
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
