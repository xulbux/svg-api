/**
 * SVG route dispatcher – Maps `/badge/*`, `/button/*`, `/btn/*`, `/icon/*`, `/stack/*`, and `/quote/*` URLs onto the SSOT renderers.
 *
 * Shared by the Worker router (`src/index.ts`) and the documentation previews (`src/site/`), so
 * every documented Markdown snippet is rendered by exactly the same parsing path as a live request.
 * The `SVG_ROUTES` table is the single source of the route prefixes, their segment limits, and the
 * query parameters each route reads (which also form its normalized edge cache key).
 */

import { SERVICES_CONFIG } from '@/config/services';
import { DEFAULT_ENV, SITE_ORIGIN } from '@/config/site';
import { resolveColor, resolveOptionalColor } from '@/config/theme';
import {
  decodeSegment,
  parseOptionalNumber,
  parsePerLineList,
  resolveAnimationMode,
  resolveDotState,
  resolveIconQueryParam,
  resolveQuoteLayout,
  resolveSizeToken,
  resolveSpecialParam,
  resolveVariant,
} from '@/routes/params';
import { resolveServicePreview, resolveServiceRedirectUrl } from '@/services/fetcher';
import { renderQuote } from '@/svg/quote';
import { renderBadge, renderButton, renderIcon } from '@/svg/renderer';
import { getOwnValue } from '@/svg/shared';
import { parseStackGroups, renderStack } from '@/svg/stack';
import type {
  BadgeSpecialElement,
  BadgeSpecialMap,
  BadgeVariant,
  DotState,
  MetricResult,
  ResolvedSvgRequest,
  ServicePreviewSample,
  StaticSvgRouteMatch,
  SvgRouteDefinition,
  SvgRouteMatch,
  ThemeColorName,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Default values for a badge route before applying URL query overrides. */
interface RouteBadgeDefaults {
  /** Default theme color token. */
  color?: ThemeColorName;
  /** Default status dot state. */
  dot?: DotState;
  /** Default icon slug. */
  icon?: string;
  /** Default left-hand label text. */
  label: string;
  /** Default right-hand special element. */
  special?: BadgeSpecialElement;
  /** Candidate automatic right-hand special elements from upstream service data. */
  specials?: BadgeSpecialMap;
  /** Default right-hand value text. */
  value?: string;
  /** Default badge variant (`1`, `2`, `3`). */
  variant: BadgeVariant;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Shared edge cache TTL in seconds for static SVG routes. */
export const STATIC_TTL_SECONDS = 3600;

/** Shared edge cache TTL in seconds for successfully resolved service preset badges. */
export const SERVICE_TTL_SECONDS = 600;

/** Shared edge cache TTL in seconds for failed, pending, or invalid service preset badges. */
export const SERVICE_ERROR_TTL_SECONDS = 60;

/** Query parameters read by `/badge/*` routes (static and service preset badges), sorted. */
const BADGE_QUERY_PARAMS: readonly string[] = [
  'anim',
  'color',
  'dot',
  'icon',
  'label',
  'special',
  'variant',
];

/** Query parameters read by `/button/*` and `/btn/*` routes, sorted. */
const BUTTON_QUERY_PARAMS: readonly string[] = ['anim', 'color', 'icon', 'size', 'variant'];

/** Query parameters read by `/icon/*` routes, sorted. */
const ICON_QUERY_PARAMS: readonly string[] = ['anim', 'color', 'size', 'stroke'];

/** Query parameters read by `/quote/*` routes, sorted. */
const QUOTE_QUERY_PARAMS: readonly string[] = [
  'anim',
  'author',
  'center',
  'color',
  'layout',
  'quote',
  'size',
  'text',
  'type',
  'variant',
  'width',
];

/** Query parameters read by `/stack/*` routes, sorted. */
const STACK_QUERY_PARAMS: readonly string[] = [
  'anim',
  'color',
  'gap',
  'ggap',
  'groupgap',
  'groups',
  'i',
  'icons',
  'perline',
  'size',
  'variant',
];

// -------------------------------------- INTERNALS --------------------------------------

/** Build a deferred static SVG route match. */
function buildStaticMatch(
  render: () => string,
  ttl: number = STATIC_TTL_SECONDS
): StaticSvgRouteMatch {
  return { kind: 'static', render, ttl };
}

/** Decode the raw path parts after the route prefix (dropping one trailing empty segment, e.g., `/badge/a/b/` or `/badge/`). */
function decodeRouteSegments(pathParts: readonly string[]): string[] {
  const segments: string[] = [];
  for (const rawSegment of pathParts.slice(2)) {
    segments.push(decodeSegment(rawSegment));
  }
  if (segments.at(-1) === '') {
    segments.pop();
  }
  return segments;
}

/** Copy only the first value of each recognized query parameter (already sorted by name) into a fresh query. */
function pickQueryParams(query: URLSearchParams, names: readonly string[]): URLSearchParams {
  const picked = new URLSearchParams();
  for (const name of names) {
    const value = query.get(name);
    if (value !== null) {
      picked.append(name, value);
    }
  }
  return picked;
}

/** Apply canonical badge query overrides (`color`, `variant`, `icon`, `dot`, `anim`, `special`, optional `label`) and render. */
function renderBadgeFromQuery(
  query: URLSearchParams,
  defaults: RouteBadgeDefaults,
  hasLabelOverride: boolean
): string {
  const labelParam = hasLabelOverride ? query.get('label') : undefined;
  return renderBadge({
    anim: resolveAnimationMode(query.get('anim')),
    color: resolveColor(query.get('color'), defaults.color),
    dot: resolveDotState(query.get('dot'), defaults.dot),
    icon: resolveIconQueryParam(query.get('icon'), defaults.icon),
    label: labelParam ?? defaults.label,
    special: resolveSpecialParam(query.get('special'), defaults.special, defaults.specials),
    value: defaults.value,
    variant: resolveVariant(query.get('variant'), defaults.variant),
  });
}

/** Dispatch `/badge/*` segments onto static or service preset badges. */
function resolveBadgeRoute(
  segments: readonly string[],
  query: URLSearchParams
): SvgRouteMatch | undefined {
  const [first = '', second, third, fourth] = segments;
  const firstLower = first.toLowerCase();

  if (segments.length <= 2) {
    return buildStaticMatch(() =>
      renderBadgeFromQuery(query, { label: first, value: second, variant: '1' }, false)
    );
  }

  const service = getOwnValue(SERVICES_CONFIG, firstLower);
  if (!service) {
    return undefined;
  }
  if ((service.route.target.maxSegments ?? 1) > 1) {
    // Multi-segment targets (e.g., Go module paths): Every middle segment belongs to the target,
    // except a leading required owner segment.
    const hasOwnerSegment = service.route.owner?.isRequired === true;
    return {
      kind: 'service',
      request: {
        metric: segments.at(-1) ?? '',
        owner: hasOwnerSegment ? second : undefined,
        service: firstLower,
        target: segments.slice(hasOwnerSegment ? 2 : 1, -1).join('/'),
      },
    };
  }
  if (segments.length === 3) {
    return {
      kind: 'service',
      request: { metric: third ?? '', service: firstLower, target: second ?? '' },
    };
  }
  if (segments.length === 4) {
    return {
      kind: 'service',
      request: { metric: fourth ?? '', owner: second, service: firstLower, target: third ?? '' },
    };
  }
  return undefined;
}

/** Resolve a `/button/:label[/:value]` or `/btn/:label[/:value]` CTA button. */
function resolveButtonRoute(segments: readonly string[], query: URLSearchParams): SvgRouteMatch {
  const [label = '', value] = segments;
  return buildStaticMatch(() =>
    renderButton({
      anim: resolveAnimationMode(query.get('anim')),
      color: resolveColor(query.get('color')),
      icon: resolveIconQueryParam(query.get('icon')),
      label,
      size: resolveSizeToken(query.get('size')),
      value,
      variant: resolveVariant(query.get('variant')),
    })
  );
}

/** Resolve a `/icon/:icon` standalone icon (exactly one segment). */
function resolveIconRoute(
  segments: readonly string[],
  query: URLSearchParams
): SvgRouteMatch | undefined {
  const [icon] = segments;
  if (icon === undefined) {
    return undefined;
  }
  return buildStaticMatch(() =>
    renderIcon({
      anim: resolveAnimationMode(query.get('anim')),
      color: resolveColor(query.get('color')),
      icon,
      size: parseOptionalNumber(query.get('size')),
      strokeWidth: parseOptionalNumber(query.get('stroke')),
    })
  );
}

/** Resolve a `/stack/:groups` (or `/stack?groups=` / `?icons=` / `?i=`) tech stack grid. */
function resolveStackRoute(segments: readonly string[], query: URLSearchParams): SvgRouteMatch {
  return buildStaticMatch(() => {
    // `||` (not `??`): Empty aliases (`/stack/?icons=react`, `?groupgap=&ggap=12`) fall through.
    const rawGroups =
      segments[0] || query.get('groups') || query.get('icons') || query.get('i') || '';
    const perLineList = parsePerLineList(query.get('perline'));
    return renderStack({
      anim: resolveAnimationMode(query.get('anim')),
      // Invalid colors keep the per-icon brand palettes instead of forcing the indigo fallback.
      color: resolveOptionalColor(query.get('color')),
      gap: parseOptionalNumber(query.get('gap')),
      groupGap: parseOptionalNumber(query.get('groupgap') || query.get('ggap')),
      groups: parseStackGroups(rawGroups, perLineList),
      perLine: perLineList?.[0],
      size: parseOptionalNumber(query.get('size')),
      variant: resolveVariant(query.get('variant'), '2'),
    });
  });
}

/** Resolve a `/quote/:author/:text`, `/quote/:text`, or `/quote?text=` quote card. */
function resolveQuoteRoute(segments: readonly string[], query: URLSearchParams): SvgRouteMatch {
  const hasAuthorSegment = segments.length === 2;
  const pathText = hasAuthorSegment ? segments[1] : segments[0];
  return buildStaticMatch(() =>
    renderQuote({
      anim: resolveAnimationMode(query.get('anim')),
      author: (hasAuthorSegment ? segments[0] : query.get('author')) ?? undefined,
      color: resolveColor(query.get('color')),
      layout: resolveQuoteLayout(query.get('layout'), query.get('type'), query.get('center')),
      size: resolveSizeToken(query.get('size')),
      text: pathText || query.get('text') || query.get('quote') || '',
      variant: resolveVariant(query.get('variant'), '2'),
      width: parseOptionalNumber(query.get('width')),
    })
  );
}

// -------------------------------------- PUBLIC API -------------------------------------

/** SVG route table sorted by prefix: The single source of the Hono registrations, the dispatcher, and the edge cache keys. */
export const SVG_ROUTES: readonly SvgRouteDefinition[] = [
  { prefix: 'badge', queryParams: BADGE_QUERY_PARAMS, resolve: resolveBadgeRoute },
  { maxSegments: 2, prefix: 'btn', queryParams: BUTTON_QUERY_PARAMS, resolve: resolveButtonRoute },
  {
    maxSegments: 2,
    prefix: 'button',
    queryParams: BUTTON_QUERY_PARAMS,
    resolve: resolveButtonRoute,
  },
  { maxSegments: 1, prefix: 'icon', queryParams: ICON_QUERY_PARAMS, resolve: resolveIconRoute },
  { maxSegments: 2, prefix: 'quote', queryParams: QUOTE_QUERY_PARAMS, resolve: resolveQuoteRoute },
  { maxSegments: 1, prefix: 'stack', queryParams: STACK_QUERY_PARAMS, resolve: resolveStackRoute },
];

/**
 * Find the SVG route table entry for a raw route prefix (the first path segment).
 * @param prefix   Raw first path segment (e.g., `'badge'`).
 * @returns Matching route definition, or `undefined` when the prefix is no SVG route.
 */
export function findSvgRoute(prefix: string): SvgRouteDefinition | undefined {
  for (const route of SVG_ROUTES) {
    if (route.prefix === prefix) {
      return route;
    }
  }
  return undefined;
}

/**
 * Resolve a request URL onto an SVG route together with its normalized edge cache key.
 * Only the route's recognized query parameters reach the renderers, so the cache key (origin, raw
 * pathname, and those parameters sorted by name) always determines the rendered SVG.
 * @param url   Request URL (raw percent-encoded pathname and query string).
 * @returns Route match and cache key, or `undefined` when no SVG route matches.
 */
export function resolveSvgRequest(url: URL): ResolvedSvgRequest | undefined {
  const pathParts = url.pathname.split('/');
  const route = findSvgRoute(pathParts[1] ?? '');
  if (!route) {
    return undefined;
  }
  const segments = decodeRouteSegments(pathParts);
  if (route.maxSegments !== undefined && segments.length > route.maxSegments) {
    return undefined;
  }
  const query = pickQueryParams(url.searchParams, route.queryParams);
  const match = route.resolve(segments, query);
  if (!match) {
    return undefined;
  }
  const pathname =
    url.pathname.length > 1 && url.pathname.endsWith('/')
      ? url.pathname.slice(0, -1)
      : url.pathname;
  const queryString = query.toString();
  return { cacheKey: `${url.origin}${pathname}${queryString ? `?${queryString}` : ''}`, match };
}

/**
 * Resolve a request URL onto an SVG route.
 * @param url   Request URL (raw percent-encoded pathname and query string).
 * @returns Static SVG or service preset match, or `undefined` when no SVG route matches.
 */
export function resolveSvgRoute(url: URL): SvgRouteMatch | undefined {
  return resolveSvgRequest(url)?.match;
}

/**
 * Render a service preset badge from a resolved metric result, applying the canonical query overrides (incl. `?label=`).
 * @param result   Resolved metric result (upstream data, sample preview, or error badge).
 * @param query    Request query parameters.
 * @returns Complete badge SVG markup.
 */
export function renderServiceBadge(result: MetricResult, query: URLSearchParams): string {
  return renderBadgeFromQuery(
    query,
    {
      color: result.color,
      dot: result.dot,
      icon: result.icon,
      label: result.label,
      special: result.special,
      specials: result.specials,
      value: result.value,
      variant: '1',
    },
    true
  );
}

/**
 * Render the generic error badge served when a request fails unexpectedly (`app.onError`).
 * @returns Complete badge SVG markup.
 */
export function renderInternalErrorBadge(): string {
  return renderBadge({
    color: 'red',
    icon: 'triangle-alert',
    label: 'error',
    value: 'internal error',
    variant: '1',
  });
}

/**
 * Render the SVG for a documented path exactly as the live Worker would (service presets use `sample`).
 * @param path     Path and query string on `svg.xul.is` (e.g., `'/badge/build/passing?icon=circle-check'`).
 * @param sample   Sample value or upstream payload for service preset badges (no network access).
 * @returns Complete SVG markup.
 * @throws {Error} When `path` does not match any SVG route (guards the docs against broken snippets).
 */
export function renderSvgPath(path: string, sample: ServicePreviewSample = 'n/a'): string {
  const url = new URL(path, SITE_ORIGIN);
  const match = resolveSvgRoute(url);
  if (!match) {
    throw new Error(`No SVG route matches the documented path: ${path}`);
  }
  if (match.kind === 'static') {
    return match.render();
  }
  return renderServiceBadge(
    resolveServicePreview(match.request, DEFAULT_ENV, sample),
    url.searchParams
  );
}

/**
 * Resolve the click-through destination of a documented service preset path (its upstream page).
 * @param path   Path and query string on `svg.xul.is`.
 * @returns Upstream redirect URL for service preset paths, or `undefined` for static SVG routes.
 */
export function resolveSvgPathRedirectUrl(path: string): string | undefined {
  const match = resolveSvgRoute(new URL(path, SITE_ORIGIN));
  return match?.kind === 'service'
    ? resolveServiceRedirectUrl(match.request, DEFAULT_ENV)
    : undefined;
}
