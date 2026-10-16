/**
 * Worker entrypoint – Hono router, readable query DSL, smart document redirects, and Tier-2 SVG edge caching.
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { STATUS_PRESET_MAP } from '@/config/services';
import { resolveColor } from '@/config/theme';
import { renderPreviewHtml } from '@/preview/page';
import { resolveServiceMetric } from '@/services/fetcher';
import { renderBadge } from '@/svg/renderer';
import type {
  AnimationMode,
  BadgeSpecialElement,
  BadgeVariant,
  DotState,
  Env,
  StripTickState,
  ThemeColorName,
  WaitUntilContext,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Default fallback values for a route before applying URL query overrides. */
interface RouteBadgeDefaults {
  /** Default theme color token. */
  color?: ThemeColorName;
  /** Default status dot state. */
  dot?: DotState;
  /** Default icon slug. */
  icon?: string;
  /** Default left-hand label text. */
  label: string;
  /** Default redirect destination URL on document navigation. */
  redirectUrl?: string;
  /** Default right-hand special element (or sparkline array). */
  sparkline?: number[];
  /** Default right-hand value text. */
  value?: string;
  /** Default badge or button variant. */
  variant: BadgeVariant;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default redirect destination for root navigation. */
const ROOT_REDIRECT_URL = 'https://xul.is';

/** Map of canonical and readable variant identifiers to `BadgeVariant`. */
const VARIANT_ALIASES: Readonly<Record<string, BadgeVariant>> = {
  '1': '1',
  '2': '2',
  '3': '3',
  b1: 'b1',
  b2: 'b2',
  b3: 'b3',
  button: 'b1',
  'button-primary': 'b1',
  'button-secondary': 'b2',
  'button-tertiary': 'b3',
  primary: '1',
  secondary: '2',
  tertiary: '3',
};

/** Map of animation query parameter values to `AnimationMode`. */
const ANIMATION_ALIASES: Readonly<Record<string, AnimationMode>> = {
  auto: 'auto',
  false: 'none',
  glint: 'sheen',
  none: 'none',
  nudge: 'nudge',
  off: 'none',
  shake: 'shake',
  sheen: 'sheen',
  spin: 'spin',
  wiggle: 'shake',
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches `+` characters in URL path segments for space decoding. */
const PLUS_SIGN_RX = /\+/g;

/** Matches comma or whitespace separators in list-style special payloads. */
const LIST_SEPARATOR_RX = /[,\s]+/;

/** Matches trailing `%` sign on percentage strings. */
const TRAILING_PERCENT_RX = /%$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Safely decode a URL segment, converting `+` into spaces and handling already-decoded `%` characters. */
function decodeSegment(raw: string): string {
  const withSpaces = raw.replace(PLUS_SIGN_RX, ' ');
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    return withSpaces;
  }
}

/** Read the first defined query parameter from a priority list of parameter names. */
function getFirstQueryParam(
  context: Context<{ Bindings: Env }>,
  names: readonly string[]
): string | undefined {
  for (const name of names) {
    const val = context.req.query(name);
    if (val !== undefined) {
      return val;
    }
  }
  return undefined;
}

/** Parse a comma-separated list of numbers for a sparkline. */
function parseSparklineNumbers(rawPayload: string): number[] | undefined {
  const parts = rawPayload.trim().split(LIST_SEPARATOR_RX);
  const values: number[] = [];
  for (const part of parts) {
    if (part.length > 0) {
      const num = Number(part);
      if (Number.isFinite(num)) {
        values.push(num);
      }
    }
  }
  return values.length >= 2 ? values : undefined;
}

/** Parse a single character or token into a `StripTickState`. */
function toStripTickState(token: string): StripTickState | undefined {
  const clean = token.trim().toLowerCase();
  if (clean === '1' || clean === 'up' || clean === 'ok' || clean === 'green' || clean === 'pass') {
    return 'up';
  }
  if (
    clean === '2' ||
    clean === 'warn' ||
    clean === 'degraded' ||
    clean === 'amber' ||
    clean === 'slow'
  ) {
    return 'warn';
  }
  if (
    clean === '0' ||
    clean === 'down' ||
    clean === 'err' ||
    clean === 'red' ||
    clean === 'fail' ||
    clean === 'offline'
  ) {
    return 'down';
  }
  return undefined;
}

/** Parse a strip payload (`1,1,2,1` or compact `11112111` or `up,up,warn,down`) into `StripTickState[]`. */
function parseStripStates(rawPayload: string): StripTickState[] | undefined {
  const trimmed = rawPayload.trim();
  if (!trimmed) {
    return undefined;
  }
  const tokens = LIST_SEPARATOR_RX.test(trimmed) ? trimmed.split(LIST_SEPARATOR_RX) : [...trimmed];
  const states: StripTickState[] = [];
  for (const token of tokens) {
    const mapped = toStripTickState(token);
    if (mapped) {
      states.push(mapped);
    }
  }
  return states.length > 0 ? states.slice(0, 10) : undefined;
}

/** Parse a numeric percentage string (e.g., `'99.4'` or `'99.4%'`) into a finite number. */
function parsePercentageNumber(rawPayload: string): number | undefined {
  const cleaned = rawPayload.trim().replace(TRAILING_PERCENT_RX, '');
  if (!cleaned) {
    return undefined;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

/** Parse a `<kind>:<payload>` pair into a `BadgeSpecialElement`. */
function parseSpecialKindAndPayload(
  kind: string,
  payload: string
): BadgeSpecialElement | undefined {
  if (kind === 'sparkline' || kind === 'spark') {
    const values = parseSparklineNumbers(payload);
    return values ? { type: 'sparkline', values } : undefined;
  }
  if (kind === 'bar' || kind === 'progress') {
    const pct = parsePercentageNumber(payload);
    return pct !== undefined ? { type: 'bar', value: pct } : undefined;
  }
  if (kind === 'ring' || kind === 'donut' || kind === 'gauge') {
    const pct = parsePercentageNumber(payload);
    return pct !== undefined ? { type: 'ring', value: pct } : undefined;
  }
  if (kind === 'strip' || kind === 'uptime' || kind === 'health') {
    const states = parseStripStates(payload);
    return states ? { states, type: 'strip' } : undefined;
  }
  if (kind === 'delta' || kind === 'trend') {
    return payload.length > 0 ? { type: 'delta', value: payload } : undefined;
  }
  return undefined;
}

/** Check direct shorthand query parameters (`?bar=`, `?ring=`, `?strip=`, `?delta=`, `?sparkline=`). */
function parseShorthandSpecialFromContext(
  context: Context<{ Bindings: Env }>
): BadgeSpecialElement | undefined {
  const shorthandKinds = ['bar', 'ring', 'strip', 'delta', 'sparkline', 'spark'] as const;
  for (const kind of shorthandKinds) {
    const rawVal = context.req.query(kind);
    if (rawVal !== undefined) {
      const parsed = parseSpecialKindAndPayload(kind, rawVal.trim());
      if (parsed) {
        return parsed;
      }
    }
  }
  return undefined;
}

/**
 * Parse a unified `?special=<type>:<payload>` query parameter (or shorthand special query params)
 * into a structured `BadgeSpecialElement`.
 * @param specialRaw   Raw `?special=` or `?s=` query parameter (e.g., `'bar:99.4'`, `'strip:11112111'`).
 * @param context      Optional Hono request context to check shorthand fallback params (`?bar=`, `?ring=`, etc.).
 * @returns Parsed `BadgeSpecialElement`, or `undefined` if none is specified or valid.
 */
export function parseSpecialParam(
  specialRaw?: string,
  context?: Context<{ Bindings: Env }>
): BadgeSpecialElement | undefined {
  if (specialRaw && specialRaw.trim().length > 0) {
    const trimmed = specialRaw.trim();
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const kind = trimmed.slice(0, colonIndex).trim().toLowerCase();
      const payload = trimmed.slice(colonIndex + 1).trim();
      const parsed = parseSpecialKindAndPayload(kind, payload);
      if (parsed) {
        return parsed;
      }
    }
  }
  return context ? parseShorthandSpecialFromContext(context) : undefined;
}

/**
 * Determine whether an incoming HTTP request is a top-level browser document navigation
 * rather than an embedded `<img src="...">` request.
 * @param request   Incoming Fetch API `Request`.
 * @returns `true` when the request should trigger a `302` redirect if a destination URL exists.
 */
export function isDocumentNavigation(request: Request): boolean {
  const fetchDest = request.headers.get('Sec-Fetch-Dest');
  if (fetchDest === 'document' || fetchDest === 'iframe') {
    return true;
  }
  if (fetchDest === 'image') {
    return false;
  }
  const accept = request.headers.get('Accept') || '';
  return accept.includes('text/html') && !accept.startsWith('image/');
}

/**
 * Resolve the requested `?variant=` / `?v=` query parameter to a valid `BadgeVariant`.
 * Supports both compact (`1`, `b1`) and readable (`primary`, `button-secondary`) names.
 * @param input      Raw `?variant=` or `?v=` query parameter value.
 * @param fallback   Default variant when `input` is omitted or invalid.
 * @returns Validated `BadgeVariant`.
 */
export function resolveVariant(input?: string, fallback: BadgeVariant = '1'): BadgeVariant {
  if (!input) {
    return fallback;
  }
  const mapped = VARIANT_ALIASES[input.trim().toLowerCase()];
  return mapped ?? fallback;
}

/**
 * Resolve the requested `?anim=` / `?animate=` / `?a=` query parameter to a valid `AnimationMode`.
 * @param input      Raw animation query parameter value.
 * @param fallback   Default animation mode when `input` is omitted or invalid.
 * @returns Validated `AnimationMode`.
 */
export function resolveAnimationMode(
  input?: string,
  fallback: AnimationMode = 'auto'
): AnimationMode {
  if (!input) {
    return fallback;
  }
  const mapped = ANIMATION_ALIASES[input.trim().toLowerCase()];
  return mapped ?? fallback;
}

/** Render a badge SVG by merging route defaults with readable and compact URL query overrides. */
function renderBadgeWithQueryOverrides(
  context: Context<{ Bindings: Env }>,
  defaults: RouteBadgeDefaults
): string {
  const colorParam = getFirstQueryParam(context, ['color', 'c']);
  const variantParam = getFirstQueryParam(context, ['variant', 'v']);
  const iconParam = getFirstQueryParam(context, ['icon', 'i']);
  const labelParam = getFirstQueryParam(context, ['label', 'l']);
  const dotParam = getFirstQueryParam(context, ['dot', 'd']) as DotState | undefined;
  const animParam = getFirstQueryParam(context, ['anim', 'animate', 'a']);
  const sheenParam = context.req.query('sheen');
  const specialParam = getFirstQueryParam(context, ['special', 's']);

  const resolvedAnim =
    sheenParam === 'true' || sheenParam === '1' ? 'sheen' : resolveAnimationMode(animParam, 'auto');

  return renderBadge({
    anim: resolvedAnim,
    color: resolveColor(colorParam, defaults.color),
    dot: dotParam ?? defaults.dot,
    icon: iconParam ?? defaults.icon,
    label: labelParam !== undefined ? decodeSegment(labelParam) : defaults.label,
    sparkline: defaults.sparkline,
    special: parseSpecialParam(specialParam, context),
    value: defaults.value,
    variant: resolveVariant(variantParam, defaults.variant),
  });
}

/** Build an HTTP `200` SVG response with edge cache headers. */
function buildSvgResponse(svg: string, ttlSeconds = 600): Response {
  return new Response(svg, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=300, s-maxage=${ttlSeconds}, stale-while-revalidate=86400`,
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
    status: 200,
  });
}

/** Retrieve the Cloudflare Workers default edge cache if available. */
function getEdgeCache(): Cache | undefined {
  if (typeof caches !== 'undefined' && 'default' in caches) {
    return caches.default;
  }
  return undefined;
}

/** Safely retrieve the Hono `executionCtx` when running inside Cloudflare Workers. */
function getSafeExecutionContext(
  context: Context<{ Bindings: Env }>
): WaitUntilContext | undefined {
  try {
    return context.executionCtx;
  } catch {
    return undefined;
  }
}

/** Handle 3-segment and 4-segment external service preset routes (`/gh/*`, `/pypi/*`). */
async function handleServicePreset(
  context: Context<{ Bindings: Env }>,
  service: string,
  owner: string | undefined,
  target: string,
  metric: string
): Promise<Response> {
  const executionCtx = getSafeExecutionContext(context);
  const envBindings: Env = context.env ?? { DEFAULT_GH_OWNER: 'xulbux' };

  const { result } = await resolveServiceMetric(
    service,
    owner,
    target,
    metric,
    envBindings,
    executionCtx
  );

  const redirectOverride = getFirstQueryParam(context, ['redirect', 'r']);
  const finalRedirect = redirectOverride || result.redirectUrl;
  if (isDocumentNavigation(context.req.raw) && finalRedirect) {
    return context.redirect(finalRedirect, 302);
  }

  // Tier 2 Rendered SVG Cache Lookup.
  const edgeCache = getEdgeCache();
  const cacheKey = new Request(context.req.url, { method: 'GET' });
  if (edgeCache) {
    const cachedSvg = await edgeCache.match(cacheKey);
    if (cachedSvg) {
      return cachedSvg;
    }
  }

  const svg = renderBadgeWithQueryOverrides(context, {
    color: result.color,
    dot: result.dot,
    icon: result.icon,
    label: result.label,
    sparkline: result.sparkline,
    value: result.value,
    variant: '1',
  });

  const response = buildSvgResponse(svg, 600);
  if (edgeCache) {
    const putPromise = edgeCache.put(cacheKey, response.clone());
    if (executionCtx) {
      executionCtx.waitUntil(putPromise);
    } else {
      await putPromise;
    }
  }
  return response;
}

/** Handle root `/` redirect. */
function handleRootRoute(context: Context<{ Bindings: Env }>): Response {
  return context.redirect(ROOT_REDIRECT_URL, 302);
}

/** Handle `/preview` SSOT Live Preview Studio route. */
function handlePreviewRoute(context: Context<{ Bindings: Env }>): Response {
  if (context.env?.ALLOW_PREVIEW_IN_PROD === 'false') {
    return context.redirect(ROOT_REDIRECT_URL, 302);
  }
  return context.html(renderPreviewHtml());
}

/** Handle `/status/:state/:text` status preset route. */
function handleStatusRoute(context: Context<{ Bindings: Env }>): Response {
  const stateKey = (context.req.param('state') ?? '').toLowerCase();
  const text = decodeSegment(context.req.param('text') ?? '');
  const redirectParam = getFirstQueryParam(context, ['redirect', 'r']);

  if (redirectParam && isDocumentNavigation(context.req.raw)) {
    return context.redirect(redirectParam, 302);
  }

  const preset = STATUS_PRESET_MAP[stateKey] || STATUS_PRESET_MAP.green;
  const svg = renderBadgeWithQueryOverrides(context, {
    color: preset.color,
    dot: preset.dot,
    label: preset.defaultLabel,
    value: text,
    variant: '2',
  });

  return buildSvgResponse(svg, 300);
}

/** Handle 3-segment service route `/:service{gh|pypi}/:target/:metric`. */
function handleDefaultOwnerServiceRoute(context: Context<{ Bindings: Env }>): Promise<Response> {
  return handleServicePreset(
    context,
    context.req.param('service') ?? '',
    undefined,
    context.req.param('target') ?? '',
    context.req.param('metric') ?? ''
  );
}

/** Handle 4-segment service route `/:service{gh|pypi}/:owner/:target/:metric`. */
function handleExplicitOwnerServiceRoute(context: Context<{ Bindings: Env }>): Promise<Response> {
  return handleServicePreset(
    context,
    context.req.param('service') ?? '',
    context.req.param('owner'),
    context.req.param('target') ?? '',
    context.req.param('metric') ?? ''
  );
}

/** Handle generic static 2-segment badge route `/:label/:value`. */
function handleTwoSegmentBadgeRoute(context: Context<{ Bindings: Env }>): Response {
  const redirectParam = getFirstQueryParam(context, ['redirect', 'r']);
  if (redirectParam && isDocumentNavigation(context.req.raw)) {
    return context.redirect(redirectParam, 302);
  }

  const svg = renderBadgeWithQueryOverrides(context, {
    color: 'indigo',
    label: decodeSegment(context.req.param('label') ?? ''),
    value: decodeSegment(context.req.param('value') ?? ''),
    variant: '1',
  });

  return buildSvgResponse(svg, 3600);
}

/** Handle generic static 1-segment button/badge route `/:label`. */
function handleSingleSegmentBadgeRoute(context: Context<{ Bindings: Env }>): Response {
  const redirectParam = getFirstQueryParam(context, ['redirect', 'r']);
  if (redirectParam && isDocumentNavigation(context.req.raw)) {
    return context.redirect(redirectParam, 302);
  }

  const svg = renderBadgeWithQueryOverrides(context, {
    color: 'indigo',
    label: decodeSegment(context.req.param('label') ?? ''),
    variant: 'b1',
  });

  return buildSvgResponse(svg, 3600);
}

// ----------------------------------------- MAIN ----------------------------------------

const app = new Hono<{ Bindings: Env }>();

// 1. Root Redirect.
app.get('/', handleRootRoute);

// 2. SSOT Live Preview Studio.
app.get('/preview', handlePreviewRoute);

// 3. Status Preset Route: /status/:state/:text.
app.get('/status/:state/:text', handleStatusRoute);

// 4. Service Preset Routes (3 segments = default owner, 4 segments = explicit owner).
app.get('/:service{gh|pypi}/:target/:metric', handleDefaultOwnerServiceRoute);
app.get('/:service{gh|pypi}/:owner/:target/:metric', handleExplicitOwnerServiceRoute);

// 5. Generic Static 2-Segment Badge: /:label/:value.
app.get('/:label/:value', handleTwoSegmentBadgeRoute);

// 6. Generic Static 1-Segment Button/Badge: /:label.
app.get('/:label', handleSingleSegmentBadgeRoute);

export default app;
