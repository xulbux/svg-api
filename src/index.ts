/**
 * Worker entrypoint – Hono router for `svg.xul.is`: documentation and builder pages, versioned static assets, SVG routes (`/badge/*`, `/button/*`, `/btn/*`, `/icon/*`, `/stack/*`, `/quote/*`), smart document redirects, and Tier-2 SVG edge caching.
 */

import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DEFAULT_ENV, FALLBACK_REDIRECT_URL } from '@/config/site';
import {
  buildSvgResponse,
  computeEtag,
  HTML_SECURITY_HEADERS,
  isDocumentNavigation,
  isEtagMatch,
  isPreviewDisabledFlag,
  NOSNIFF_HEADERS,
  sanitizeRedirectUrl,
  SERVICE_VARY_HEADER,
} from '@/routes/http';
import {
  findSvgRoute,
  renderInternalErrorBadge,
  renderServiceBadge,
  resolveSvgRequest,
  SERVICE_ERROR_TTL_SECONDS,
  SERVICE_TTL_SECONDS,
  SVG_ROUTES,
} from '@/routes/svg';
import { getEdgeCache, putInEdgeCache } from '@/services/edgeCache';
import { resolveServiceMetric, resolveServiceRedirectUrl } from '@/services/fetcher';
import { getSiteAsset } from '@/site/assets';
import { renderFaviconSvg } from '@/site/components';
import { buildBuilderPath, DEFAULT_BUILDER_KIND, isBuilderKind } from '@/site/navigation';
import { isDocsSectionSlug, renderBuilderHtml, renderDocsHtml, renderHomeHtml } from '@/site/pages';
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

/** Freshly built SVG response and whether it may be stored in the edge cache. */
interface CacheableResponse {
  /** `true` when `response` may be written to the edge cache (e.g., no upstream error badge). */
  isCacheable: boolean;
  /** Complete SVG response. */
  response: Response;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** `Cache-Control` header for the deterministic, memoized documentation HTML pages. */
const HTML_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600';

/** `Cache-Control` header for static assets requested with their current content version (`?v=`). */
const IMMUTABLE_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Shared edge cache TTL in seconds for the favicon. */
const FAVICON_TTL_SECONDS = 86_400;

/** Extra headers of service preset badge SVGs (the same URL redirects document navigations). */
const SERVICE_SVG_HEADERS: Readonly<Record<string, string>> = { Vary: SERVICE_VARY_HEADER };

/** Headers of service preset document redirects (never cached, so image requests keep getting the SVG). */
const SERVICE_REDIRECT_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'private, no-store',
  Vary: SERVICE_VARY_HEADER,
};

/** Headers of the plain-text `500` response for failed non-SVG requests. */
const INTERNAL_ERROR_HEADERS: Readonly<Record<string, string>> = {
  ...HTML_SECURITY_HEADERS,
  'Cache-Control': 'no-store',
  'Content-Type': 'text/plain; charset=utf-8',
};

/** Route patterns of the homepage, documentation, and builder pages (redirected when previews are disabled). */
const PREVIEW_PAGE_PATHS: readonly string[] = ['/', '/builder/*', '/docs/*', '/preview'];

/** Trailing-slash variants of the documentation and builder routes (redirected to their canonical paths). */
const TRAILING_SLASH_PATHS: readonly string[] = [
  '/builder/',
  '/builder/:kind/',
  '/docs/',
  '/docs/:section/',
];

/** Memoized documentation pages and their entity tags keyed by page id (`home`, `docs/<section>`). */
const HTML_PAGE_CACHE = new Map<string, MemoizedHtmlPage>();

/** Lazily rendered favicon SVG markup (rendered once per isolate). */
let faviconSvg: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

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

/** Check whether the homepage, documentation, builder, and asset routes are disabled in production. */
function isPreviewDisabled(context: AppContext): boolean {
  return isPreviewDisabledFlag(context.env?.ALLOW_PREVIEW_IN_PROD);
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

/** Middleware: Redirect the homepage, documentation, and builder pages to `FALLBACK_REDIRECT_URL` when previews are disabled. */
function guardPreviewPages(context: AppContext, next: Next): Promise<Response> | ReturnType<Next> {
  return isPreviewDisabled(context)
    ? Promise.resolve(context.redirect(FALLBACK_REDIRECT_URL, 302))
    : next();
}

/** Middleware: Answer static asset requests with `404` when previews are disabled. */
function guardPreviewAssets(context: AppContext, next: Next): Promise<Response> | ReturnType<Next> {
  return isPreviewDisabled(context) ? Promise.resolve(context.notFound()) : next();
}

/** Serve an SVG from the Tier-2 edge cache, or build it and store cacheable responses (skipped when no cache exists, e.g., in tests). */
async function respondWithEdgeCache(
  cacheKeyUrl: string,
  executionCtx: WaitUntilContext | undefined,
  buildResponse: () => CacheableResponse | Promise<CacheableResponse>
): Promise<Response> {
  const edgeCache = getEdgeCache();
  if (!edgeCache) {
    const { response } = await buildResponse();
    return response;
  }
  const cacheKey = new Request(cacheKeyUrl);
  const cachedResponse = await edgeCache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }
  const { isCacheable, response } = await buildResponse();
  if (isCacheable) {
    await putInEdgeCache(edgeCache, cacheKey, response.clone(), executionCtx);
  }
  return response;
}

/** Handle a service preset badge: redirect document navigations, otherwise serve from the edge cache or upstream. */
async function handleServiceRoute(
  context: AppContext,
  url: URL,
  cacheKeyUrl: string,
  request: ServiceRequest
): Promise<Response> {
  const env = context.env ?? DEFAULT_ENV;

  // Document navigations only need the redirect target; Skip the upstream fetch entirely.
  if (isDocumentNavigation(context.req.raw)) {
    const redirectUrl = sanitizeRedirectUrl(resolveServiceRedirectUrl(request, env));
    if (redirectUrl) {
      return new Response(undefined, {
        headers: { ...SERVICE_REDIRECT_HEADERS, Location: redirectUrl },
        status: 302,
      });
    }
  }

  const executionCtx = getSafeExecutionContext(context);
  return respondWithEdgeCache(cacheKeyUrl, executionCtx, async () => {
    const { result, status } = await resolveServiceMetric(request, env, executionCtx);
    const isSuccess = status === 200;
    return {
      isCacheable: isSuccess,
      response: buildSvgResponse(
        renderServiceBadge(result, url.searchParams),
        isSuccess ? SERVICE_TTL_SECONDS : SERVICE_ERROR_TTL_SECONDS,
        SERVICE_SVG_HEADERS
      ),
    };
  });
}

/** Handle every SVG route (`/badge/*`, `/button/*`, `/btn/*`, `/icon/*`, `/stack/*`, `/quote/*`). */
function handleSvgRoute(context: AppContext): Response | Promise<Response> {
  const url = new URL(context.req.url);
  const resolved = resolveSvgRequest(url);
  if (!resolved) {
    return context.notFound();
  }
  const { cacheKey, match } = resolved;
  if (match.kind === 'service') {
    return handleServiceRoute(context, url, cacheKey, match.request);
  }
  return respondWithEdgeCache(cacheKey, getSafeExecutionContext(context), () => ({
    isCacheable: true,
    response: buildSvgResponse(match.render(), match.ttl),
  }));
}

/** Handle `/favicon.svg` and `/favicon.ico` routes with the memoized brand SVG mark. */
function handleFaviconRoute(): Response {
  faviconSvg ??= renderFaviconSvg();
  return buildSvgResponse(faviconSvg, FAVICON_TTL_SECONDS);
}

/** Handle the `/` homepage route. */
function handleRootRoute(context: AppContext): Response {
  return buildHtmlResponse(context, 'home', renderHomeHtml);
}

/** Handle `/docs`: The Getting Started overview page. */
function handleDocsIndexRoute(context: AppContext): Response {
  return buildHtmlResponse(context, 'docs', () => renderDocsHtml('overview'));
}

/** Handle the legacy `/preview` route by redirecting to the documentation overview. */
function handlePreviewRoute(context: AppContext): Response {
  return context.redirect('/docs', 302);
}

/** Handle the `/docs/:section` documentation subpage route (unknown sections redirect to `/docs`). */
function handleDocsSectionRoute(context: AppContext): Response {
  const section = (context.req.param('section') ?? '').trim().toLowerCase();
  if (!isDocsSectionSlug(section)) {
    return context.redirect('/docs', 302);
  }
  return buildHtmlResponse(context, `docs/${section}`, () => renderDocsHtml(section));
}

/** Handle `/builder` and unknown `/builder/:kind` slugs by redirecting to the default builder. */
function handleBuilderIndexRoute(context: AppContext): Response {
  return context.redirect(buildBuilderPath(DEFAULT_BUILDER_KIND), 302);
}

/** Handle the `/builder/:kind` URL builder pages. */
function handleBuilderRoute(context: AppContext): Response {
  const kind = (context.req.param('kind') ?? '').trim().toLowerCase();
  if (!isBuilderKind(kind)) {
    return handleBuilderIndexRoute(context);
  }
  return buildHtmlResponse(context, `builder/${kind}`, () => renderBuilderHtml(kind));
}

/** Permanently redirect a trailing-slash documentation or builder path (e.g., `/docs/badges/`) to its canonical path. */
function handleTrailingSlashRoute(context: AppContext): Response {
  // Every `TRAILING_SLASH_PATHS` pattern ends in exactly one slash.
  const canonicalPath = getRawPathname(context.req.raw).slice(0, -1);
  return context.redirect(`${canonicalPath}${new URL(context.req.url).search}`, 301);
}

/** Handle the versioned `/assets/:name` stylesheet, scripts, fonts, and icon picker data (immutable when `?v=` matches or for font binaries). */
function handleAssetRoute(context: AppContext): Response | Promise<Response> {
  const name = context.req.param('name') ?? '';
  const asset = getSiteAsset(name);
  if (!asset) {
    return context.notFound();
  }
  // The version is a content hash, so it doubles as a weak entity tag (scoped to this URL).
  const etag = `W/"${asset.version}"`;
  const isImmutable = context.req.query('v') === asset.version || asset.contentType === 'font/ttf';
  const headers = {
    ...NOSNIFF_HEADERS,
    'Cache-Control': isImmutable ? IMMUTABLE_ASSET_CACHE_CONTROL : HTML_CACHE_CONTROL,
    'Content-Type': asset.contentType,
    ETag: etag,
  };
  if (isEtagMatch(context.req.header('If-None-Match'), etag)) {
    return new Response(undefined, { headers, status: 304 });
  }
  return new Response(asset.body, { headers, status: 200 });
}

/** Log an unexpected failure and answer SVG routes with an error badge (embeds stay intact) and other routes with a plain `500`. */
function handleAppError(error: Error, context: AppContext): Response {
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  // oxlint-disable-next-line no-console -- Surface unexpected failures in Workers Logs (observability).
  console.error(`Unhandled ${context.req.method} ${context.req.url}:`, error);
  const prefix = getRawPathname(context.req.raw).split('/')[1] ?? '';
  if (findSvgRoute(prefix)) {
    try {
      return buildSvgResponse(renderInternalErrorBadge(), SERVICE_ERROR_TTL_SECONDS);
    } catch {
      // Rendering the error badge failed as well; Fall back to the plain-text response below.
    }
  }
  return new Response('Internal Server Error', { headers: INTERNAL_ERROR_HEADERS, status: 500 });
}

// ----------------------------------------- MAIN ----------------------------------------

const app = new Hono<{ Bindings: Env }>({ getPath: getRawPathname });

// 1. Preview kill switch (`ALLOW_PREVIEW_IN_PROD=false`) for the website routes.
for (const path of PREVIEW_PAGE_PATHS) {
  app.use(path, guardPreviewPages);
}
app.use('/assets/*', guardPreviewAssets);

// 2. Homepage, documentation & builder pages, static assets & favicon.
app.get('/', handleRootRoute);
app.get('/favicon.svg', handleFaviconRoute);
app.get('/favicon.ico', handleFaviconRoute);
app.get('/docs', handleDocsIndexRoute);
app.get('/docs/:section', handleDocsSectionRoute);
app.get('/preview', handlePreviewRoute);
app.get('/builder', handleBuilderIndexRoute);
app.get('/builder/:kind', handleBuilderRoute);
app.get('/assets/:name', handleAssetRoute);
for (const path of TRAILING_SLASH_PATHS) {
  app.get(path, handleTrailingSlashRoute);
}

// 3. SVG routes (badges, service presets, buttons, icons, stacks & quotes) from the route table.
for (const route of SVG_ROUTES) {
  app.get(`/${route.prefix}/*`, handleSvgRoute);
}

// 4. Unexpected failures.
app.onError(handleAppError);

export default app;
