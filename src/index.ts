/**
 * Worker entrypoint – Hono router for `svg.xul.is`: documentation and builder pages, versioned static assets, SVG routes (`/badge/*`, `/button/*`, `/btn/*`, `/icon/*`, `/stack/*`, `/quote/*`), smart document redirects, and Tier-2 SVG edge caching.
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { DEFAULT_ENV, FALLBACK_REDIRECT_URL } from '@/config/site';
import { getSiteAsset } from '@/preview/assets';
import { renderBuilderHtml } from '@/preview/builder';
import { renderFaviconSvg } from '@/preview/layout';
import { buildBuilderPath, DEFAULT_BUILDER_KIND, isBuilderKind } from '@/preview/navigation';
import { isDocsSectionSlug, renderDocsHtml, renderHomeHtml } from '@/preview/page';
import {
  renderServiceBadge,
  resolveSvgRoute,
  SERVICE_ERROR_TTL_SECONDS,
  SERVICE_TTL_SECONDS,
} from '@/routes/svg';
import { getEdgeCache, putInEdgeCache } from '@/services/edgeCache';
import { resolveServiceMetric, resolveServiceRedirectUrl } from '@/services/fetcher';
import type { Env, ServiceRequest, WaitUntilContext } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Hono request context with Worker bindings. */
type AppContext = Context<{ Bindings: Env }>;

/** Memoized documentation page with its precomputed entity tag. */
interface MemoizedHtmlPage {
  /** Weak `ETag` header value computed once from `html`. */
  etag: string;
  /** Complete HTML document. */
  html: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Route prefixes served by the SVG dispatcher (`/<prefix>` and `/<prefix>/*`). */
const SVG_ROUTE_PREFIXES: readonly string[] = ['badge', 'btn', 'button', 'icon', 'quote', 'stack'];

/** `Cache-Control` header for the deterministic, memoized documentation HTML pages. */
const HTML_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600';

/** `Cache-Control` header for static assets requested with their current content version (`?v=`). */
const IMMUTABLE_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Security headers attached to every HTML documentation response. */
const HTML_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * Restrictive `Content-Security-Policy` for SVG responses (defense in depth against SVG XSS when a
 * badge is opened directly): No scripts or external resources; Inline style attributes and SMIL
 * animations keep working.
 */
const SVG_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'";

/** Shared edge cache TTL in seconds for the favicon. */
const FAVICON_TTL_SECONDS = 86_400;

/** Multiplier of the polynomial rolling hash used for entity tags. */
const ETAG_HASH_MULTIPLIER = 31;

/** Modulus of the polynomial rolling hash (largest prime below `2^32`; Keeps every step a safe integer). */
const ETAG_HASH_MODULUS = 4_294_967_291;

/** Memoized documentation pages and their entity tags keyed by page id (`home`, `docs/<section>`). */
const HTML_PAGE_CACHE = new Map<string, MemoizedHtmlPage>();

/** Lazily rendered favicon SVG markup (rendered once per isolate). */
let faviconSvg: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Build an HTTP `200` SVG response with edge cache and security headers. */
function buildSvgResponse(svg: string, ttlSeconds: number): Response {
  return new Response(svg, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=60, s-maxage=${ttlSeconds}, stale-while-revalidate=600`,
      'Content-Security-Policy': SVG_CONTENT_SECURITY_POLICY,
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
    status: 200,
  });
}

/** Compute a weak entity tag (`W/"<hash>-<length>"`) for a document with a polynomial rolling hash. */
function computeEtag(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash * ETAG_HASH_MULTIPLIER + content.charCodeAt(i)) % ETAG_HASH_MODULUS;
  }
  return `W/"${hash.toString(16)}-${content.length.toString(16)}"`;
}

/** Strip the weak validator prefix (`W/`) so entity tags compare weakly (RFC 9110 `If-None-Match`). */
function stripWeakPrefix(etag: string): string {
  return etag.startsWith('W/') ? etag.slice(2) : etag;
}

/** Check whether an `If-None-Match` request header matches `etag`. */
function isEtagMatch(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) {
    return false;
  }
  const opaqueTag = stripWeakPrefix(etag);
  for (const candidate of ifNoneMatch.split(',')) {
    const trimmed = candidate.trim();
    if (trimmed === '*' || stripWeakPrefix(trimmed) === opaqueTag) {
      return true;
    }
  }
  return false;
}

/** Resolve a memoized documentation page, computing its entity tag only once. */
function getMemoizedPage(pageId: string, render: () => string): MemoizedHtmlPage {
  let page = HTML_PAGE_CACHE.get(pageId);
  if (!page) {
    const html = render();
    page = { etag: computeEtag(html), html };
    HTML_PAGE_CACHE.set(pageId, page);
  }
  return page;
}

/** Serve a memoized documentation page with security headers, answering matching revalidations with `304`. */
function buildHtmlResponse(context: AppContext, pageId: string, render: () => string): Response {
  const page = getMemoizedPage(pageId, render);
  const headers = {
    ...HTML_SECURITY_HEADERS,
    'Cache-Control': HTML_CACHE_CONTROL,
    ETag: page.etag,
  };
  if (isEtagMatch(context.req.header('If-None-Match'), page.etag)) {
    return new Response(undefined, { headers, status: 304 });
  }
  return context.html(page.html, 200, headers);
}

/** Safely retrieve the Hono `executionCtx` when running inside Cloudflare Workers. */
function getSafeExecutionContext(context: AppContext): WaitUntilContext | undefined {
  try {
    return context.executionCtx;
  } catch {
    return undefined;
  }
}

/** Validate and return an HTTP/HTTPS redirect URL, or `undefined` if unsafe/invalid. */
function sanitizeRedirectUrl(rawUrl: string): string | undefined {
  const trimmed = rawUrl.trim();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://') ? trimmed : undefined;
}

/** Check whether the homepage and documentation pages are disabled in production. */
function isPreviewDisabled(context: AppContext): boolean {
  return context.env?.ALLOW_PREVIEW_IN_PROD === 'false';
}

/**
 * Extract the raw (still percent-encoded) pathname Hono routes on. The SVG dispatcher decodes every
 * segment itself, and Hono's default decoded path made wildcard routes miss line terminators
 * (`%0A`, `%0D`, `%E2%80%A8`), turning such badges into `404`s.
 */
function getRawPathname(request: Request): string {
  const { url } = request;
  const pathStart = url.indexOf('/', url.indexOf('://') + 3);
  if (pathStart === -1) {
    return '/';
  }
  const queryStart = url.indexOf('?', pathStart);
  return queryStart === -1 ? url.slice(pathStart) : url.slice(pathStart, queryStart);
}

// -------------------------------------- PUBLIC API -------------------------------------

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
  const accept = request.headers.get('Accept') ?? '';
  return accept.includes('text/html') && !accept.startsWith('image/');
}

// ----------------------------------------- MAIN ----------------------------------------

/** Handle a service preset badge: redirect document navigations, otherwise serve from the edge cache or upstream. */
async function handleServiceRoute(
  context: AppContext,
  url: URL,
  request: ServiceRequest
): Promise<Response> {
  const env = context.env ?? DEFAULT_ENV;

  // Document navigations only need the redirect target; Skip the upstream fetch entirely.
  if (isDocumentNavigation(context.req.raw)) {
    const redirectUrl = sanitizeRedirectUrl(resolveServiceRedirectUrl(request, env));
    if (redirectUrl) {
      return context.redirect(redirectUrl, 302);
    }
  }

  // Tier-2 rendered SVG cache lookup (fast path for `<img src="...">` requests).
  const edgeCache = getEdgeCache();
  const cacheKey = new Request(url.toString());
  if (edgeCache) {
    const cachedSvg = await edgeCache.match(cacheKey);
    if (cachedSvg) {
      return cachedSvg;
    }
  }

  const executionCtx = getSafeExecutionContext(context);
  const { result, status } = await resolveServiceMetric(request, env, executionCtx);
  const isSuccess = status === 200;
  const response = buildSvgResponse(
    renderServiceBadge(result, url.searchParams),
    isSuccess ? SERVICE_TTL_SECONDS : SERVICE_ERROR_TTL_SECONDS
  );
  if (edgeCache && isSuccess) {
    await putInEdgeCache(edgeCache, cacheKey, response.clone(), executionCtx);
  }
  return response;
}

/** Handle every SVG route (`/badge/*`, `/button/*`, `/btn/*`, `/icon/*`, `/stack/*`, `/quote/*`). */
function handleSvgRoute(context: AppContext): Response | Promise<Response> {
  const url = new URL(context.req.url);
  const match = resolveSvgRoute(url);
  if (!match) {
    return context.notFound();
  }
  if (match.kind === 'service') {
    return handleServiceRoute(context, url, match.request);
  }
  return buildSvgResponse(match.svg, match.ttlSeconds);
}

/** Handle `/favicon.svg` and `/favicon.ico` routes with the memoized brand SVG mark. */
function handleFaviconRoute(): Response {
  faviconSvg ??= renderFaviconSvg();
  return buildSvgResponse(faviconSvg, FAVICON_TTL_SECONDS);
}

/** Handle the `/` homepage route (redirects to `FALLBACK_REDIRECT_URL` when preview pages are disabled). */
function handleRootRoute(context: AppContext): Response {
  if (isPreviewDisabled(context)) {
    return context.redirect(FALLBACK_REDIRECT_URL, 302);
  }
  return buildHtmlResponse(context, 'home', renderHomeHtml);
}

/** Handle `/docs`: The Getting Started overview page. */
function handleDocsIndexRoute(context: AppContext): Response {
  if (isPreviewDisabled(context)) {
    return context.redirect(FALLBACK_REDIRECT_URL, 302);
  }
  return buildHtmlResponse(context, 'docs', () => renderDocsHtml('overview'));
}

/** Handle the legacy `/preview` route by redirecting to the documentation overview. */
function handlePreviewRoute(context: AppContext): Response {
  return context.redirect(isPreviewDisabled(context) ? FALLBACK_REDIRECT_URL : '/docs', 302);
}

/** Handle the `/docs/:section` documentation subpage route (unknown sections redirect to `/docs`). */
function handleDocsSectionRoute(context: AppContext): Response {
  if (isPreviewDisabled(context)) {
    return context.redirect(FALLBACK_REDIRECT_URL, 302);
  }
  const section = (context.req.param('section') ?? '').trim().toLowerCase();
  if (!isDocsSectionSlug(section)) {
    return context.redirect('/docs', 302);
  }
  return buildHtmlResponse(context, `docs/${section}`, () => renderDocsHtml(section));
}

/** Handle `/builder` and unknown `/builder/:kind` slugs by redirecting to the default builder. */
function handleBuilderIndexRoute(context: AppContext): Response {
  if (isPreviewDisabled(context)) {
    return context.redirect(FALLBACK_REDIRECT_URL, 302);
  }
  return context.redirect(buildBuilderPath(DEFAULT_BUILDER_KIND), 302);
}

/** Handle the `/builder/:kind` URL builder pages. */
function handleBuilderRoute(context: AppContext): Response {
  const kind = (context.req.param('kind') ?? '').trim().toLowerCase();
  if (isPreviewDisabled(context) || !isBuilderKind(kind)) {
    return handleBuilderIndexRoute(context);
  }
  return buildHtmlResponse(context, `builder/${kind}`, () => renderBuilderHtml(kind));
}

/** Handle the versioned `/assets/:name` stylesheet, scripts, and icon picker data (immutable when `?v=` matches the deployed version). */
function handleAssetRoute(context: AppContext): Response | Promise<Response> {
  if (isPreviewDisabled(context)) {
    return context.notFound();
  }
  const name = context.req.param('name') ?? '';
  const asset = getSiteAsset(name);
  if (!asset) {
    return context.notFound();
  }
  // The version is a content hash, so it doubles as a weak entity tag (scoped to this URL).
  const etag = `W/"${asset.version}"`;
  const headers = {
    'Cache-Control':
      context.req.query('v') === asset.version ? IMMUTABLE_ASSET_CACHE_CONTROL : HTML_CACHE_CONTROL,
    'Content-Type': asset.contentType,
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  };
  if (isEtagMatch(context.req.header('If-None-Match'), etag)) {
    return new Response(undefined, { headers, status: 304 });
  }
  return new Response(asset.body, { headers, status: 200 });
}

const app = new Hono<{ Bindings: Env }>({ getPath: getRawPathname });

// 1. Homepage, documentation & builder pages, static assets & favicon.
app.get('/', handleRootRoute);
app.get('/favicon.svg', handleFaviconRoute);
app.get('/favicon.ico', handleFaviconRoute);
app.get('/docs', handleDocsIndexRoute);
app.get('/docs/:section', handleDocsSectionRoute);
app.get('/preview', handlePreviewRoute);
app.get('/builder', handleBuilderIndexRoute);
app.get('/builder/:kind', handleBuilderRoute);
app.get('/assets/:name', handleAssetRoute);

// 2. SVG routes (badges, service presets, buttons, icons, stacks & quotes).
for (const prefix of SVG_ROUTE_PREFIXES) {
  app.get(`/${prefix}/*`, handleSvgRoute);
}

export default app;
