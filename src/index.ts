/**
 * Worker entrypoint – Hono router for `svg.xul.is` (`/badge/*`, `/icon/*`, `/stack/*`, `/quote/*`), readable query DSL, smart document redirects, and Tier-2 SVG edge caching.
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { STATUS_PRESET_MAP } from '@/config/services';
import { DOT_COLORS, resolveColor } from '@/config/theme';
import { renderPreviewHtml } from '@/preview/page';
import { getEdgeCache, putInEdgeCache, resolveServiceMetric } from '@/services/fetcher';
import {
  parseStackGroups,
  renderBadge,
  renderIcon,
  renderQuote,
  renderStack,
} from '@/svg/renderer';
import type {
  AnimationMode,
  BadgeSpecialElement,
  BadgeVariant,
  DotState,
  Env,
  QuoteLayout,
  QuoteSize,
  StripTickState,
  ThemeColorName,
  WaitUntilContext,
  WidgetVariant,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Default fallback values for a badge route before applying URL query overrides. */
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

/** Set of valid standalone widget variants (`'1'`, `'2'`, `'3'`). */
const VALID_WIDGET_VARIANTS: ReadonlySet<WidgetVariant> = new Set(['1', '2', '3']);

/** Set of valid animation mode identifiers. */
const VALID_ANIMATION_MODES: ReadonlySet<AnimationMode> = new Set([
  'auto',
  'float',
  'none',
  'nudge',
  'pulse',
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

/** Matches comma or whitespace separators in list-style payloads. */
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

/** Parse an optional finite number query parameter (e.g., `?size=24`, `?stroke=2.25`). */
function parseOptionalNumber(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const cleaned = raw.trim();
  if (!cleaned) {
    return undefined;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  if (clean in DOT_COLORS) {
    return clean as DotState;
  }
  return fallback;
}

/** Resolve a raw `?variant=` query parameter for stack/quote widgets (`'1'`, `'2'`, `'3'`). */
function resolveWidgetVariant(input?: string, fallback: WidgetVariant = '2'): WidgetVariant {
  if (!input) {
    return fallback;
  }
  const candidate = input.trim() as WidgetVariant;
  return VALID_WIDGET_VARIANTS.has(candidate) ? candidate : fallback;
}

/** Parse a single number or comma-separated list of numbers for `?perline=` (e.g., `?perline=8` or `?perline=8,6,6,4,3,3`). */
function parsePerLineList(raw?: string): number[] | undefined {
  if (!raw) {
    return undefined;
  }
  const values: number[] = [];
  for (const part of raw.split(LIST_SEPARATOR_RX)) {
    const parsed = Number(part.trim());
    if (Number.isFinite(parsed) && parsed >= 1) {
      values.push(Math.round(parsed));
    }
  }
  return values.length > 0 ? values : undefined;
}

/** Resolve the quote card layout (`'horizontal'` or `'vertical'`) from `?layout=`, `?type=`, or `?center=`. */
function resolveQuoteLayout(
  layoutParam?: string,
  typeParam?: string,
  centerParam?: string
): QuoteLayout {
  const candidate = (layoutParam ?? typeParam ?? '').trim().toLowerCase();
  if (candidate === 'vertical' || candidate === 'center' || candidate === 'v') {
    return 'vertical';
  }
  if (centerParam === 'true' || centerParam === '1') {
    return 'vertical';
  }
  return 'horizontal';
}

/** Resolve the quote card size preset (`'sm'`, `'md'`, `'lg'`, `'xl'`) or custom pixel font size from `?size=`. */
function resolveQuoteSize(raw?: string): QuoteSize | number | undefined {
  if (!raw) {
    return undefined;
  }
  const clean = raw.trim().toLowerCase();
  if (clean === 'sm' || clean === 'md' || clean === 'lg' || clean === 'xl') {
    return clean;
  }
  const numeric = Number(clean);
  return Number.isFinite(numeric) ? numeric : undefined;
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

/** Validate and return an HTTP/HTTPS redirect URL, or `undefined` if unsafe/invalid. */
function sanitizeRedirectUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) {
    return undefined;
  }
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  return undefined;
}

// -------------------------------------- PUBLIC API -------------------------------------

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
 * @param input      Raw `?anim=` query parameter value (`auto`, `sheen`, `spin`, `shake`, `nudge`, `pulse`, `float`, `none`).
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

// ----------------------------------------- MAIN ----------------------------------------

/** Return a `302` redirect response if the request is a document navigation and a valid redirect URL exists. */
function tryRedirectOnDocumentNav(
  context: Context<{ Bindings: Env }>,
  fallbackUrl?: string
): Response | undefined {
  if (!isDocumentNavigation(context.req.raw)) {
    return undefined;
  }
  const redirectUrl =
    sanitizeRedirectUrl(context.req.query('redirect')) || sanitizeRedirectUrl(fallbackUrl);
  return redirectUrl ? context.redirect(redirectUrl, 302) : undefined;
}

/** Apply canonical query overrides (`color`, `variant`, `icon`, `label`, `dot`, `anim`, `special`) and render a badge SVG. */
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

  const color = resolveColor(colorParam, defaults.color ?? 'indigo');
  const variant = resolveVariant(variantParam, defaults.variant);
  const icon = iconParam ?? defaults.icon;
  const label = labelParam ? decodeSegment(labelParam) : defaults.label;
  const dot = resolveDotState(dotParam, defaults.dot);
  const anim = resolveAnimationMode(animParam, 'auto');
  const special = parseSpecialParam(specialParam) ?? defaults.special;

  return renderBadge({ anim, color, dot, icon, label, special, value: defaults.value, variant });
}

/** Handle 3-segment and 4-segment external service preset routes (`/badge/gh/*`, `/badge/pypi/*`, `/badge/ovsx/*`). */
async function handleServicePreset(
  context: Context<{ Bindings: Env }>,
  service: string,
  owner: string | undefined,
  target: string,
  metric: string
): Promise<Response> {
  const isDocNav = isDocumentNavigation(context.req.raw);
  const edgeCache = getEdgeCache();
  const cacheKey = new Request(context.req.url, { method: 'GET' });

  // Tier 2 Rendered SVG Cache Lookup (fast path for `<img src="...">` requests).
  if (!isDocNav && edgeCache) {
    const cachedSvg = await edgeCache.match(cacheKey);
    if (cachedSvg) {
      return cachedSvg;
    }
  }

  const executionCtx = getSafeExecutionContext(context);
  const envBindings: Env = context.env ?? { DEFAULT_GH_OWNER: 'xulbux' };

  const { result, status } = await resolveServiceMetric(
    service,
    owner,
    target,
    metric,
    envBindings,
    executionCtx
  );

  const redirectResponse = tryRedirectOnDocumentNav(context, result.redirectUrl);
  if (redirectResponse) {
    return redirectResponse;
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

  const ttlSeconds = status === 200 ? 600 : 60;
  const response = buildSvgResponse(svg, ttlSeconds);
  if (edgeCache && status === 200) {
    await putInEdgeCache(edgeCache, cacheKey, response.clone(), executionCtx);
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

/** Handle `/badge/status/:state/:text` status preset route. */
function handleStatusRoute(context: Context<{ Bindings: Env }>): Response {
  const redirectResponse = tryRedirectOnDocumentNav(context);
  if (redirectResponse) {
    return redirectResponse;
  }

  const stateKey = (context.req.param('state') ?? '').toLowerCase();
  const text = decodeSegment(context.req.param('text') ?? '');
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

/** Handle 3-segment service route `/badge/:service{gh|pypi|ovsx}/:target/:metric`. */
function handleDefaultOwnerServiceRoute(context: Context<{ Bindings: Env }>): Promise<Response> {
  return handleServicePreset(
    context,
    context.req.param('service') ?? '',
    undefined,
    context.req.param('target') ?? '',
    context.req.param('metric') ?? ''
  );
}

/** Handle 4-segment service route `/badge/:service{gh|pypi|ovsx}/:owner/:target/:metric`. */
function handleExplicitOwnerServiceRoute(context: Context<{ Bindings: Env }>): Promise<Response> {
  return handleServicePreset(
    context,
    context.req.param('service') ?? '',
    context.req.param('owner'),
    context.req.param('target') ?? '',
    context.req.param('metric') ?? ''
  );
}

/** Handle static 2-segment badge route `/badge/:label/:value`. */
function handleTwoSegmentBadgeRoute(context: Context<{ Bindings: Env }>): Response {
  const redirectResponse = tryRedirectOnDocumentNav(context);
  if (redirectResponse) {
    return redirectResponse;
  }

  const svg = renderBadgeWithQueryOverrides(context, {
    color: 'indigo',
    label: decodeSegment(context.req.param('label') ?? ''),
    value: decodeSegment(context.req.param('value') ?? ''),
    variant: '1',
  });

  return buildSvgResponse(svg, 3600);
}

/** Handle 1-segment micro-button / badge route `/badge/:label`. */
function handleSingleSegmentBadgeRoute(context: Context<{ Bindings: Env }>): Response {
  const redirectResponse = tryRedirectOnDocumentNav(context);
  if (redirectResponse) {
    return redirectResponse;
  }

  const svg = renderBadgeWithQueryOverrides(context, {
    color: 'indigo',
    label: decodeSegment(context.req.param('label') ?? ''),
    variant: 'b1',
  });

  return buildSvgResponse(svg, 3600);
}

/** Handle standalone icon route `/icon/:icon`. */
function handleStandaloneIconRoute(context: Context<{ Bindings: Env }>): Response {
  const redirectResponse = tryRedirectOnDocumentNav(context);
  if (redirectResponse) {
    return redirectResponse;
  }

  const colorParam = context.req.query('color');
  const sizeParam = context.req.query('size');
  const strokeParam = context.req.query('stroke');
  const animParam = context.req.query('anim');

  const svg = renderIcon({
    anim: resolveAnimationMode(animParam, 'auto'),
    color: resolveColor(colorParam, 'indigo'),
    icon: decodeSegment(context.req.param('icon') ?? ''),
    size: parseOptionalNumber(sizeParam),
    strokeWidth: parseOptionalNumber(strokeParam),
  });

  return buildSvgResponse(svg, 3600);
}

/** Handle tech stack icon row/grid/multi-group route `/stack/:icons` and `/stack`. */
function handleStackRoute(context: Context<{ Bindings: Env }>): Response {
  const redirectResponse = tryRedirectOnDocumentNav(context);
  if (redirectResponse) {
    return redirectResponse;
  }

  const rawIcons =
    context.req.param('icons') ??
    context.req.query('icons') ??
    context.req.query('i') ??
    context.req.query('groups') ??
    '';
  const decodedIcons = decodeSegment(rawIcons);
  const perLineList = parsePerLineList(context.req.query('perline'));
  const groups = parseStackGroups(decodedIcons, perLineList);
  const colorParam = context.req.query('color');
  const groupGapParam = context.req.query('groupgap') ?? context.req.query('ggap');

  const svg = renderStack({
    anim: resolveAnimationMode(context.req.query('anim'), 'auto'),
    color: colorParam ? resolveColor(colorParam, 'indigo') : undefined,
    gap: parseOptionalNumber(context.req.query('gap')),
    groupGap: parseOptionalNumber(groupGapParam),
    groups,
    perLine: perLineList?.[0],
    size: parseOptionalNumber(context.req.query('size')),
    variant: resolveWidgetVariant(context.req.query('variant'), '2'),
  });

  return buildSvgResponse(svg, 3600);
}

/** Handle quote card route `/quote/:author/:text`, `/quote/:text`, and `/quote`. */
function handleQuoteRoute(context: Context<{ Bindings: Env }>): Response {
  const redirectResponse = tryRedirectOnDocumentNav(context);
  if (redirectResponse) {
    return redirectResponse;
  }

  const rawAuthor = context.req.param('author') ?? context.req.query('author');
  const pathText = context.req.param('text');
  const queryText = context.req.query('text') ?? context.req.query('quote') ?? '';

  const text = pathText ? decodeSegment(pathText) : decodeSegment(queryText);
  const author = rawAuthor ? decodeSegment(rawAuthor) : undefined;
  const layout = resolveQuoteLayout(
    context.req.query('layout'),
    context.req.query('type'),
    context.req.query('center')
  );
  const size = resolveQuoteSize(context.req.query('size'));

  const svg = renderQuote({
    anim: resolveAnimationMode(context.req.query('anim'), 'auto'),
    author,
    color: resolveColor(context.req.query('color'), 'indigo'),
    layout,
    size,
    text,
    variant: resolveWidgetVariant(context.req.query('variant'), '2'),
    width: parseOptionalNumber(context.req.query('width')),
  });

  return buildSvgResponse(svg, 3600);
}

const app = new Hono<{ Bindings: Env }>();

// 1. Root Redirect & SSOT Live Preview Studio.
app.get('/', handleRootRoute);
app.get('/preview', handlePreviewRoute);

// 2. Badge & Micro-Button Routes (/badge/*).
app.get('/badge/status/:state/:text', handleStatusRoute);
app.get('/badge/:service{gh|pypi|ovsx}/:target/:metric', handleDefaultOwnerServiceRoute);
app.get('/badge/:service{gh|pypi|ovsx}/:owner/:target/:metric', handleExplicitOwnerServiceRoute);
app.get('/badge/:label/:value', handleTwoSegmentBadgeRoute);
app.get('/badge/:label', handleSingleSegmentBadgeRoute);

// 3. Standalone Icon Route (/icon/:icon).
app.get('/icon/:icon', handleStandaloneIconRoute);

// 4. Tech Stack Icon Grid Routes (/stack/:icons & /stack).
app.get('/stack/:icons', handleStackRoute);
app.get('/stack', handleStackRoute);

// 5. Quote Card Routes (/quote/:author/:text, /quote/:text, & /quote).
app.get('/quote/:author/:text', handleQuoteRoute);
app.get('/quote/:text', handleQuoteRoute);
app.get('/quote', handleQuoteRoute);

export default app;
