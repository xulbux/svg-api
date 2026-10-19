/**
 * SVG route dispatcher – Maps `/badge/*`, `/button/*`, `/btn/*`, `/icon/*`, `/stack/*`, and `/quote/*` URLs onto the SSOT renderers.
 *
 * Shared by the Worker router (`src/index.ts`) and the documentation previews (`src/preview/`), so
 * every documented Markdown snippet is rendered by exactly the same parsing path as a live request.
 */

import { SERVICES_CONFIG, STATUS_PRESET_MAP } from '@/config/services';
import { DEFAULT_ENV, SITE_ORIGIN } from '@/config/site';
import { resolveColor } from '@/config/theme';
import {
  decodeSegment,
  parseOptionalNumber,
  parsePerLineList,
  parseSpecialParam,
  resolveAnimationMode,
  resolveDotState,
  resolveIconQueryParam,
  resolveQuoteLayout,
  resolveSizeToken,
  resolveVariant,
} from '@/routes/params';
import { resolveServicePreview, resolveServiceRedirectUrl } from '@/services/fetcher';
import { renderQuote } from '@/svg/quote';
import { renderBadge, renderButton, renderIcon } from '@/svg/renderer';
import { getOwnValue } from '@/svg/shared';
import { parseStackGroups, renderStack } from '@/svg/stack';
import type {
  BadgeSpecialElement,
  BadgeVariant,
  DotState,
  MetricResult,
  ServicePreviewSample,
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
  /** Default right-hand value text. */
  value?: string;
  /** Default badge variant (`1`, `2`, `3`). */
  variant: BadgeVariant;
}

/** Route prefix and decoded path segments of a request URL. */
interface RoutePathParts {
  /** First path segment (e.g., `'badge'`, `'icon'`). */
  prefix: string;
  /** Decoded segments after the prefix (one trailing empty segment dropped). */
  segments: string[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Shared edge cache TTL in seconds for static SVG routes. */
const STATIC_TTL_SECONDS = 3600;

/** Shared edge cache TTL in seconds for status preset badges. */
const STATUS_TTL_SECONDS = 300;

// -------------------------------------- INTERNALS --------------------------------------

/** Split a raw URL pathname into its route prefix and decoded segments (dropping one trailing slash). */
function splitRoutePath(pathname: string): RoutePathParts {
  const parts = pathname.split('/');
  const segments: string[] = [];
  for (let i = 2; i < parts.length; i += 1) {
    segments.push(decodeSegment(parts[i]));
  }
  if (segments.length > 1 && segments.at(-1) === '') {
    segments.pop();
  }
  return { prefix: parts[1] ?? '', segments };
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
    color: resolveColor(query.get('color'), defaults.color ?? 'indigo'),
    dot: resolveDotState(query.get('dot'), defaults.dot),
    icon: resolveIconQueryParam(query.get('icon'), defaults.icon),
    label: labelParam ?? defaults.label,
    special: parseSpecialParam(query.get('special')) ?? defaults.special,
    value: defaults.value,
    variant: resolveVariant(query.get('variant'), defaults.variant),
  });
}

/** Dispatch `/badge/*` segments onto static, status preset, or service preset badges. */
function resolveBadgeRoute(segments: string[], query: URLSearchParams): SvgRouteMatch | undefined {
  const [first = '', second, third, fourth] = segments;
  const firstLower = first.toLowerCase();

  if (segments.length <= 2) {
    const svg = renderBadgeFromQuery(
      query,
      { color: 'indigo', label: first, value: second, variant: '1' },
      false
    );
    return { kind: 'static', svg, ttlSeconds: STATIC_TTL_SECONDS };
  }

  if (segments.length === 3 && firstLower === 'status') {
    const preset =
      getOwnValue(STATUS_PRESET_MAP, (second ?? '').toLowerCase()) ?? STATUS_PRESET_MAP.online;
    const svg = renderBadgeFromQuery(
      query,
      {
        color: preset.color,
        dot: preset.dot,
        label: preset.defaultLabel,
        value: third,
        variant: '2',
      },
      false
    );
    return { kind: 'static', svg, ttlSeconds: STATUS_TTL_SECONDS };
  }

  const service = getOwnValue(SERVICES_CONFIG, firstLower);
  if (!service) {
    return undefined;
  }
  if ((service.maxTargetSegments ?? 1) > 1) {
    // Multi-segment targets (e.g., Go module paths): Every middle segment belongs to the target.
    return {
      kind: 'service',
      request: {
        metric: segments.at(-1) ?? '',
        service: firstLower,
        target: segments.slice(1, -1).join('/'),
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

/** Render a `/button/:label[/:value]` or `/btn/:label[/:value]` CTA button. */
function renderButtonRoute(segments: string[], query: URLSearchParams): string {
  const [label = '', value] = segments;
  return renderButton({
    anim: resolveAnimationMode(query.get('anim')),
    color: resolveColor(query.get('color')),
    dot: resolveDotState(query.get('dot')),
    icon: resolveIconQueryParam(query.get('icon')),
    label,
    size: resolveSizeToken(query.get('size')),
    value,
    variant: resolveVariant(query.get('variant')),
  });
}

/** Render a `/icon/:icon` standalone icon. */
function renderIconRoute(icon: string, query: URLSearchParams): string {
  return renderIcon({
    anim: resolveAnimationMode(query.get('anim')),
    color: resolveColor(query.get('color')),
    icon,
    size: parseOptionalNumber(query.get('size')),
    strokeWidth: parseOptionalNumber(query.get('stroke')),
  });
}

/** Render a `/stack/:icons` (or `/stack?icons=`) tech stack grid. */
function renderStackRoute(pathIcons: string | undefined, query: URLSearchParams): string {
  const rawIcons = pathIcons ?? query.get('icons') ?? query.get('i') ?? query.get('groups') ?? '';
  const perLineList = parsePerLineList(query.get('perline'));
  const colorParam = query.get('color');
  return renderStack({
    anim: resolveAnimationMode(query.get('anim')),
    color: colorParam ? resolveColor(colorParam) : undefined,
    gap: parseOptionalNumber(query.get('gap')),
    groupGap: parseOptionalNumber(query.get('groupgap') ?? query.get('ggap')),
    groups: parseStackGroups(rawIcons, perLineList),
    perLine: perLineList?.[0],
    size: parseOptionalNumber(query.get('size')),
    variant: resolveVariant(query.get('variant'), '2'),
  });
}

/** Render a `/quote/:author/:text`, `/quote/:text`, or `/quote?text=` quote card. */
function renderQuoteRoute(segments: string[], query: URLSearchParams): string {
  const hasAuthorSegment = segments.length === 2;
  const pathText = hasAuthorSegment ? segments[1] : segments[0];
  return renderQuote({
    anim: resolveAnimationMode(query.get('anim')),
    author: (hasAuthorSegment ? segments[0] : query.get('author')) ?? undefined,
    color: resolveColor(query.get('color')),
    layout: resolveQuoteLayout(query.get('layout'), query.get('type'), query.get('center')),
    size: resolveSizeToken(query.get('size')),
    text: pathText || query.get('text') || query.get('quote') || '',
    variant: resolveVariant(query.get('variant'), '2'),
    width: parseOptionalNumber(query.get('width')),
  });
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Resolve a request URL onto an SVG route.
 * @param url   Request URL (raw percent-encoded pathname and query string).
 * @returns Static SVG or service preset match, or `undefined` when no SVG route matches.
 */
export function resolveSvgRoute(url: URL): SvgRouteMatch | undefined {
  const { prefix, segments } = splitRoutePath(url.pathname);
  const query = url.searchParams;

  switch (prefix) {
    case 'badge': {
      return resolveBadgeRoute(segments, query);
    }
    case 'btn':
    case 'button': {
      return segments.length <= 2
        ? {
            kind: 'static',
            svg: renderButtonRoute(segments, query),
            ttlSeconds: STATIC_TTL_SECONDS,
          }
        : undefined;
    }
    case 'icon': {
      return segments.length === 1
        ? {
            kind: 'static',
            svg: renderIconRoute(segments[0], query),
            ttlSeconds: STATIC_TTL_SECONDS,
          }
        : undefined;
    }
    case 'stack': {
      return segments.length <= 1
        ? {
            kind: 'static',
            svg: renderStackRoute(segments[0], query),
            ttlSeconds: STATIC_TTL_SECONDS,
          }
        : undefined;
    }
    case 'quote': {
      return segments.length <= 2
        ? { kind: 'static', svg: renderQuoteRoute(segments, query), ttlSeconds: STATIC_TTL_SECONDS }
        : undefined;
    }
    default: {
      return undefined;
    }
  }
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
      value: result.value,
      variant: '1',
    },
    true
  );
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
    return match.svg;
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
