/**
 * Worker entrypoint – Hono router, smart document redirects, and Tier-2 SVG edge caching.
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { STATUS_PRESET_MAP } from '@/config/services';
import { resolveColor } from '@/config/theme';
import { renderPreviewHtml } from '@/preview/page';
import { resolveServiceMetric } from '@/services/fetcher';
import { renderBadge } from '@/svg/renderer';
import type { BadgeVariant, DotState, Env, WaitUntilContext } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Default redirect destination for root navigation. */
const ROOT_REDIRECT_URL = 'https://xul.is';

/** All supported visual badge and button variants. */
const VALID_VARIANTS: ReadonlySet<BadgeVariant> = new Set(['1', '2', '3', 'b1', 'b2', 'b3']);

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches `+` characters in URL path segments for space decoding. */
const PLUS_SIGN_RX = /\+/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Decode a URL segment, converting `+` and percent-encoded sequences into characters. */
function decodeSegment(raw: string): string {
  return decodeURIComponent(raw.replace(PLUS_SIGN_RX, ' '));
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
 * Resolve the requested `?v=` query parameter to a valid `BadgeVariant`.
 * @param input      Raw `?v=` query parameter value.
 * @param fallback   Default variant when `input` is omitted or invalid.
 * @returns Validated `BadgeVariant`.
 */
export function resolveVariant(input?: string, fallback: BadgeVariant = '1'): BadgeVariant {
  if (input && VALID_VARIANTS.has(input as BadgeVariant)) {
    return input as BadgeVariant;
  }
  return fallback;
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

  const finalRedirect = context.req.query('r') || result.redirectUrl;
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

  const labelOverride = context.req.query('l');
  const dotOverride = context.req.query('dot') as DotState | undefined;
  const svg = renderBadge({
    color: resolveColor(context.req.query('c'), result.color),
    dot: dotOverride ?? result.dot,
    icon: context.req.query('i') ?? result.icon,
    label: labelOverride !== undefined ? decodeSegment(labelOverride) : result.label,
    sparkline: result.sparkline,
    value: result.value,
    variant: resolveVariant(context.req.query('v'), '1'),
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
  const redirectParam = context.req.query('r');

  if (redirectParam && isDocumentNavigation(context.req.raw)) {
    return context.redirect(redirectParam, 302);
  }

  const preset = STATUS_PRESET_MAP[stateKey] || STATUS_PRESET_MAP.green;
  const labelOverride = context.req.query('l');
  const svg = renderBadge({
    color: resolveColor(context.req.query('c'), preset.color),
    dot: preset.dot,
    icon: context.req.query('i'),
    label: labelOverride !== undefined ? decodeSegment(labelOverride) : preset.defaultLabel,
    value: text,
    variant: resolveVariant(context.req.query('v'), '2'),
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
  const redirectParam = context.req.query('r');
  if (redirectParam && isDocumentNavigation(context.req.raw)) {
    return context.redirect(redirectParam, 302);
  }

  const labelOverride = context.req.query('l');
  const svg = renderBadge({
    color: resolveColor(context.req.query('c'), 'indigo'),
    dot: context.req.query('dot') as DotState | undefined,
    icon: context.req.query('i'),
    label:
      labelOverride !== undefined
        ? decodeSegment(labelOverride)
        : decodeSegment(context.req.param('label') ?? ''),
    value: decodeSegment(context.req.param('value') ?? ''),
    variant: resolveVariant(context.req.query('v'), '1'),
  });

  return buildSvgResponse(svg, 3600);
}

/** Handle generic static 1-segment button/badge route `/:label`. */
function handleSingleSegmentBadgeRoute(context: Context<{ Bindings: Env }>): Response {
  const redirectParam = context.req.query('r');
  if (redirectParam && isDocumentNavigation(context.req.raw)) {
    return context.redirect(redirectParam, 302);
  }

  const labelOverride = context.req.query('l');
  const svg = renderBadge({
    color: resolveColor(context.req.query('c'), 'indigo'),
    dot: context.req.query('dot') as DotState | undefined,
    icon: context.req.query('i'),
    label:
      labelOverride !== undefined
        ? decodeSegment(labelOverride)
        : decodeSegment(context.req.param('label') ?? ''),
    variant: resolveVariant(context.req.query('v'), 'b1'),
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
