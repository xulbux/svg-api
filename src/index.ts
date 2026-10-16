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
  /** Default right-hand special element. */
  special?: BadgeSpecialElement;
  /** Default right-hand value text. */
  value?: string;
  /** Default badge or button variant. */
  variant: BadgeVariant;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default redirect destination for root navigation. */
const ROOT_REDIRECT_URL = 'https://xul.is';

/** Set of valid badge and button variant identifiers. */
const VALID_VARIANTS: ReadonlySet<BadgeVariant> = new Set(['1', '2', '3', 'b1', 'b2', 'b3']);

/** Set of valid animation mode identifiers. */
const VALID_ANIMATION_MODES: ReadonlySet<AnimationMode> = new Set([
  'auto',
  'none',
  'nudge',
  'shake',
  'sheen',
  'spin',
]);

/** Set of valid 10-stage (`'0'`–`'9'`) strip tick characters. */
const VALID_STRIP_STAGES: ReadonlySet<StripTickState> = new Set([
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
]);

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

/**
 * Parse a 10-stage strip payload (`'0'`–`'9'`, e.g., `'9876425789'` or `'9,8,7,5,3,1'`) into `StripTickState[]`.
 */
function parseStripStates(rawPayload: string): StripTickState[] | undefined {
  const trimmed = rawPayload.trim();
  if (!trimmed) {
    return undefined;
  }
  const tokens = LIST_SEPARATOR_RX.test(trimmed) ? trimmed.split(LIST_SEPARATOR_RX) : [...trimmed];
  const states: StripTickState[] = [];
  for (const token of tokens) {
    const clean = token.trim() as StripTickState;
    if (VALID_STRIP_STAGES.has(clean)) {
      states.push(clean);
    }
  }
  return states.length > 0 ? states.slice(0, 10) : undefined;
}

/** Parse a percentage payload with an optional `:pulse` / `:static` modifier (e.g., `'99.4'`, `'78:pulse'`, `'90:static'`). */
function parsePercentageAndPulse(
  rawPayload: string
): { hasPulse?: boolean; value: number } | undefined {
  const colonIdx = rawPayload.indexOf(':');
  const numberPart = colonIdx !== -1 ? rawPayload.slice(0, colonIdx) : rawPayload;
  const modifierPart =
    colonIdx !== -1
      ? rawPayload
          .slice(colonIdx + 1)
          .trim()
          .toLowerCase()
      : '';
  const cleaned = numberPart.trim().replace(TRAILING_PERCENT_RX, '');
  if (!cleaned) {
    return undefined;
  }
  const num = Number(cleaned);
  if (!Number.isFinite(num)) {
    return undefined;
  }
  let hasPulse: boolean | undefined = undefined;
  if (modifierPart === 'pulse') {
    hasPulse = true;
  } else if (modifierPart === 'static') {
    hasPulse = false;
  }
  return { hasPulse, value: num };
}

/** Parse a `<kind>:<payload>` pair into a `BadgeSpecialElement`. */
function parseSpecialKindAndPayload(
  kind: string,
  payload: string
): BadgeSpecialElement | undefined {
  switch (kind) {
    case 'sparkline': {
      const values = parseSparklineNumbers(payload);
      return values ? { type: 'sparkline', values } : undefined;
    }
    case 'bar': {
      const parsed = parsePercentageAndPulse(payload);
      return parsed ? { hasPulse: parsed.hasPulse, type: 'bar', value: parsed.value } : undefined;
    }
    case 'ring': {
      const parsed = parsePercentageAndPulse(payload);
      return parsed ? { hasPulse: parsed.hasPulse, type: 'ring', value: parsed.value } : undefined;
    }
    case 'strip': {
      const states = parseStripStates(payload);
      return states ? { states, type: 'strip' } : undefined;
    }
    case 'delta': {
      return payload.length > 0 ? { type: 'delta', value: payload } : undefined;
    }
    default: {
      return undefined;
    }
  }
}

/**
 * Parse the unified `?special=<type>:<payload>` query parameter into a structured `BadgeSpecialElement`.
 * @param specialRaw   Raw `?special=` query parameter (e.g., `'bar:82'`, `'strip:9876425789'`).
 * @returns Parsed `BadgeSpecialElement`, or `undefined` if none is specified or valid.
 */
export function parseSpecialParam(specialRaw?: string): BadgeSpecialElement | undefined {
  if (!specialRaw) {
    return undefined;
  }
  const trimmed = specialRaw.trim();
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex <= 0) {
    return undefined;
  }
  const kind = trimmed.slice(0, colonIndex).trim().toLowerCase();
  const payload = trimmed.slice(colonIndex + 1).trim();
  return parseSpecialKindAndPayload(kind, payload);
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
 * Resolve the requested `?variant=` query parameter to a valid `BadgeVariant`.
 * @param input      Raw `?variant=` query parameter value (`1`, `2`, `3`, `b1`, `b2`, `b3`).
 * @param fallback   Default variant when `input` is omitted or invalid.
 * @returns Validated `BadgeVariant`.
 */
export function resolveVariant(input?: string, fallback: BadgeVariant = '1'): BadgeVariant {
  if (!input) {
    return fallback;
  }
  const candidate = input.trim().toLowerCase() as BadgeVariant;
  return VALID_VARIANTS.has(candidate) ? candidate : fallback;
}

/**
 * Resolve the requested `?anim=` query parameter to a valid `AnimationMode`.
 * @param input      Raw `?anim=` query parameter value (`auto`, `sheen`, `spin`, `shake`, `nudge`, `none`).
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
  const candidate = input.trim().toLowerCase() as AnimationMode;
  return VALID_ANIMATION_MODES.has(candidate) ? candidate : fallback;
}

/** Resolve a raw `?dot=` query parameter (color name or status preset name like `'online'`, `'maintenance'`, `'standby'`). */
function resolveDotState(input?: string, fallback?: DotState): DotState | undefined {
  if (!input) {
    return fallback;
  }
  const clean = input.trim().toLowerCase();
  if (clean === 'none') {
    return undefined;
  }
  const preset = STATUS_PRESET_MAP[clean];
  if (preset) {
    return preset.dot;
  }
  return clean as DotState;
}

/** Render a badge SVG by merging route defaults with canonical URL query overrides. */
function renderBadgeWithQueryOverrides(
  context: Context<{ Bindings: Env }>,
  defaults: RouteBadgeDefaults
): string {
  const colorParam = context.req.query('color');
  const variantParam = context.req.query('variant');
  const iconParam = context.req.query('icon');
  const labelParam = context.req.query('label');
  const dotParam = context.req.query('dot');
  const animParam = context.req.query('anim');
  const specialParam = context.req.query('special');

  return renderBadge({
    anim: resolveAnimationMode(animParam, 'auto'),
    color: resolveColor(colorParam, defaults.color),
    dot: resolveDotState(dotParam, defaults.dot),
    icon: iconParam ?? defaults.icon,
    label: labelParam !== undefined ? decodeSegment(labelParam) : defaults.label,
    special: parseSpecialParam(specialParam) ?? defaults.special,
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

  const redirectOverride = context.req.query('redirect');
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
    special: result.special,
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
  const redirectParam = context.req.query('redirect');

  if (redirectParam && isDocumentNavigation(context.req.raw)) {
    return context.redirect(redirectParam, 302);
  }

  const preset = STATUS_PRESET_MAP[stateKey] || STATUS_PRESET_MAP.online;
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
  const redirectParam = context.req.query('redirect');
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
  const redirectParam = context.req.query('redirect');
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
