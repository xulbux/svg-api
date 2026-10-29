/**
 * Worker entrypoint – Hono router for documentation, builder, and error pages, crawler/social discovery documents, versioned static assets, registered SVG routes, smart document redirects, and Tier-2 SVG edge caching.
 */

import faviconPngBuffer from '@bundles/favicon.png';
import ogImagePngBuffer from '@bundles/og.png';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DEFAULT_ENV, SITE_ORIGIN } from '@/config/site';
import {
  buildConditionalBodyResponse,
  buildSvgCacheControl,
  buildSvgHeaders,
  buildSvgResponse,
  computeBytesEtag,
  computeEtag,
  HTML_SECURITY_HEADERS,
  isDocumentNavigation,
  MAX_REQUEST_URL_LENGTH,
  NOSNIFF_HEADERS,
  sanitizeRedirectUrl,
  SERVICE_VARY_HEADER,
  toConditionalResponse,
} from '@/routes/http';
import { resolveBuilderTarget } from '@/routes/schema';
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
import { buildBuilderPath, DEFAULT_BUILDER_KIND, isBuilderKind } from '@/site/navigation';
import {
  isDocsSectionSlug,
  renderBuilderHtml,
  renderDocsHtml,
  renderHomeHtml,
  renderNotFoundHtml,
  renderServerErrorHtml,
} from '@/site/pages';
import {
  getOgImageVersion,
  renderLlmsTxt,
  renderOgImageSvg,
  renderRobotsTxt,
  renderSitemapXml,
} from '@/site/seo';
import { buildShareUrl, resolvePathBuilderKind } from '@/site/shared';
import type { Env, ServiceRequest, WaitUntilContext } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Hono request context with Worker bindings. */
type AppContext = Context<{ Bindings: Env }>;

/** Memoized static document with its precomputed entity tag. */
interface MemoizedDocument {
  /** Complete text/HTML/SVG document body. */
  body: string;
  /** Weak `ETag` header value computed once from `body`. */
  etag: string;
}

/** Freshly rendered SVG and its Tier-2 edge cache policy. */
interface SvgRenderResult {
  /** Optional additional response headers (e.g., `Vary` on service preset badges). */
  extraHeaders?: Readonly<Record<string, string>>;
  /** `true` when the rendered SVG may be stored in the Tier-2 edge cache. */
  isCacheable: boolean;
  /** Complete SVG markup. */
  svg: string;
  /** Shared edge cache TTL in seconds. */
  ttl: number;
}

/** Rendered SVG with precomputed entity tag and headers shared across coalesced callers. */
interface PreparedSvgRender {
  /** Weak `ETag` header value computed from `svg`. */
  etag: string;
  /** Response headers (already containing `ETag`). */
  headers: Record<string, string>;
  /** Complete SVG markup. */
  svg: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** `Cache-Control` header for the deterministic, memoized documentation HTML pages. */
const HTML_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600';

/** `Cache-Control` header for `404` responses (briefly edge-cached to absorb random-path scans). */
const NOT_FOUND_CACHE_CONTROL = 'public, max-age=60, s-maxage=300';

/** `Cache-Control` header for plain-text and XML crawler discovery documents. */
const CRAWLER_FILE_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400';

/** `Cache-Control` header for static assets requested with their current content version (`?v=`). */
const IMMUTABLE_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Shared edge cache TTL in seconds for the favicon and social preview assets. */
const FAVICON_TTL_SECONDS = 86_400;

/** Maximum distinct uncached SVG renders coalesced concurrently per Worker isolate. */
const MAX_IN_FLIGHT_SVG_RENDERS = 64;

/** Extra headers of `/og.svg` allowing its embedded `data:image/png;base64,…` brand icon to render when opened directly. */
const OG_SVG_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
};

/** Extra headers of service preset badge SVGs (the same URL redirects document navigations). */
const SERVICE_SVG_HEADERS: Readonly<Record<string, string>> = { Vary: SERVICE_VARY_HEADER };

/** Headers of service preset document redirects (never cached, so image requests keep getting the SVG). */
const SERVICE_REDIRECT_HEADERS: Readonly<Record<string, string>> = {
  ...NOSNIFF_HEADERS,
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  Vary: SERVICE_VARY_HEADER,
};

/** Headers of memoized documentation and builder HTML pages. */
const HTML_DOCUMENT_HEADERS: Readonly<Record<string, string>> = {
  ...HTML_SECURITY_HEADERS,
  'Cache-Control': HTML_CACHE_CONTROL,
  'Content-Type': 'text/html; charset=utf-8',
};

/** Headers of prefilled `/builder/<svg-path>` HTML pages (`noindex` avoids duplicate-content indexing). */
const PREFILLED_BUILDER_HTML_HEADERS: Readonly<Record<string, string>> = {
  ...HTML_DOCUMENT_HEADERS,
  'X-Robots-Tag': 'noindex',
};

/** Headers of the branded `404` HTML error page. */
const NOT_FOUND_HTML_HEADERS: Readonly<Record<string, string>> = {
  ...HTML_SECURITY_HEADERS,
  'Cache-Control': NOT_FOUND_CACHE_CONTROL,
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex',
};

/** Headers of the branded `500` HTML error page for failed site routes. */
const SERVER_ERROR_HTML_HEADERS: Readonly<Record<string, string>> = {
  ...HTML_SECURITY_HEADERS,
  'Cache-Control': 'no-store',
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex',
};

/** Extra headers for unexpected `500` error badges on static SVG routes (`noindex` so transient error badges are never indexed). */
const ERROR_SVG_HEADERS: Readonly<Record<string, string>> = { 'X-Robots-Tag': 'noindex' };

/** Extra headers for unexpected `500` error badges on `/badge/*` service routes (`Vary` + `noindex`). */
const ERROR_SERVICE_SVG_HEADERS: Readonly<Record<string, string>> = {
  ...SERVICE_SVG_HEADERS,
  'X-Robots-Tag': 'noindex',
};

/** Headers of uncached plain-text error responses (`414` and `500`). */
const PLAIN_ERROR_HEADERS: Readonly<Record<string, string>> = {
  ...NOSNIFF_HEADERS,
  'Cache-Control': 'no-store',
  'Content-Type': 'text/plain; charset=utf-8',
  'X-Robots-Tag': 'noindex',
};

/** Non-HTML root routes (favicons, social cards, and crawler documents) that keep plain-text error responses. */
const NON_HTML_ROOT_PATHS: readonly string[] = [
  '/favicon.ico',
  '/favicon.png',
  '/favicon.svg',
  '/llms.txt',
  '/og.png',
  '/og.svg',
  '/robots.txt',
  '/sitemap.xml',
];

/** Headers of the plain-text `404` response for unmatched SVG and static asset routes. */
const PLAIN_NOT_FOUND_HEADERS: Readonly<Record<string, string>> = {
  ...NOSNIFF_HEADERS,
  'Cache-Control': NOT_FOUND_CACHE_CONTROL,
  'Content-Type': 'text/plain; charset=utf-8',
  'X-Robots-Tag': 'noindex',
};

/** Trailing-slash variants of the documentation and builder routes (redirected to their canonical paths). */
const TRAILING_SLASH_PATHS: readonly string[] = [
  '/builder/',
  '/builder/:kind/',
  '/docs/',
  '/docs/:section/',
];

/** Memoized HTML, crawler, and brand SVG documents and their entity tags keyed by internal identifier. */
const DOCUMENT_CACHE = new Map<string, MemoizedDocument>();

/** Pending uncached SVG renders keyed by normalized cache key so concurrent identical misses render once. */
const IN_FLIGHT_SVG_RENDERS = new Map<string, Promise<PreparedSvgRender>>();

/** Lazily computed entity tag of the bundled `/favicon.png` raster icon. */
let faviconPngEtag: string | undefined = undefined;

/** Lazily computed entity tag of the bundled `/og.png` social card. */
let ogImagePngEtag: string | undefined = undefined;

/** Lazily populated lookup set for `NON_HTML_ROOT_PATHS`. */
let nonHtmlRootPathsCache: ReadonlySet<string> | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Check whether `pathname` is a non-HTML root discovery or asset endpoint. */
function isNonHtmlRootPath(pathname: string): boolean {
  nonHtmlRootPathsCache ??= new Set(NON_HTML_ROOT_PATHS);
  return nonHtmlRootPathsCache.has(pathname);
}

/** Extract the first path segment after the leading slash without allocating an array. */
function extractFirstPathSegment(pathname: string): string {
  const nextSlash = pathname.indexOf('/', 1);
  return nextSlash === -1 ? pathname.slice(1) : pathname.slice(1, nextSlash);
}

/** Reject oversized request URLs before routing, query parsing, or upstream work. */
function guardRequestUrlLength(
  context: AppContext,
  next: Next
): ReturnType<MiddlewareHandler<{ Bindings: Env }>> {
  if (context.req.url.length > MAX_REQUEST_URL_LENGTH) {
    return Promise.resolve(
      new Response('URI Too Long', { headers: PLAIN_ERROR_HEADERS, status: 414 })
    );
  }
  return next();
}

/** Resolve a memoized static document, computing its entity tag only once per isolate. */
function getMemoizedDocument(documentId: string, render: () => string): MemoizedDocument {
  let doc = DOCUMENT_CACHE.get(documentId);
  if (!doc) {
    const body = render();
    doc = { body, etag: computeEtag(body) };
    DOCUMENT_CACHE.set(documentId, doc);
  }
  return doc;
}

/** Serve a memoized documentation page with security headers, answering matching revalidations with `304`. */
function buildHtmlResponse(
  context: AppContext,
  pageId: string,
  render: () => string,
  headers: Readonly<Record<string, string>> = HTML_DOCUMENT_HEADERS
): Response {
  const page = getMemoizedDocument(pageId, render);
  return buildConditionalBodyResponse(
    page.body,
    page.etag,
    context.req.header('If-None-Match'),
    headers
  );
}

/** Serve the memoized branded `404` HTML page with `noindex` metadata and security headers. */
function buildNotFoundHtmlResponse(): Response {
  const page = getMemoizedDocument('404', renderNotFoundHtml);
  return new Response(page.body, {
    headers: { ...NOT_FOUND_HTML_HEADERS, ETag: page.etag },
    status: 404,
  });
}

/** Build a `301 Moved Permanently` redirect response with `nosniff` and edge caching. */
function buildPermanentRedirectResponse(
  location: string,
  cacheControl: string = HTML_CACHE_CONTROL
): Response {
  return new Response(undefined, {
    headers: { ...NOSNIFF_HEADERS, 'Cache-Control': cacheControl, Location: location },
    status: 301,
  });
}

/** Serve a memoized plain-text or XML crawler discovery document. */
function buildCrawlerFileResponse(
  context: AppContext,
  pageId: string,
  contentType: string,
  render: () => string
): Response {
  const page = getMemoizedDocument(pageId, render);
  return buildConditionalBodyResponse(page.body, page.etag, context.req.header('If-None-Match'), {
    ...NOSNIFF_HEADERS,
    'Cache-Control': CRAWLER_FILE_CACHE_CONTROL,
    'Content-Type': contentType,
  });
}

/** Safely retrieve the Hono `executionCtx` when running inside Cloudflare Workers. */
function getSafeExecutionContext(context: AppContext): WaitUntilContext | undefined {
  try {
    return context.executionCtx;
  } catch {
    return undefined;
  }
}

/**
 * Extract the raw (still percent-encoded) pathname Hono routes on, stripping any query or `#fragment`.
 * The SVG dispatcher decodes every segment itself, and Hono's default decoded path made wildcard routes
 * miss line terminators (`%0A`, `%0D`, `%E2%80%A8`), turning such badges into `404`s.
 */
function getRawPathname(request: Request): string {
  const { url } = request;
  const schemeIndex = url.indexOf('://');
  const pathStart = url.indexOf('/', schemeIndex === -1 ? 0 : schemeIndex + 3);
  if (pathStart === -1) {
    return '/';
  }
  const queryStart = url.indexOf('?', pathStart);
  const hashStart = url.indexOf('#', pathStart);
  let pathEnd = url.length;
  if (queryStart !== -1 && queryStart < pathEnd) {
    pathEnd = queryStart;
  }
  if (hashStart !== -1 && hashStart < pathEnd) {
    pathEnd = hashStart;
  }
  return url.slice(pathStart, pathEnd);
}

/** Extract the raw `?query` string (excluding any `#fragment`) without allocating `new URL(…)`. */
function getRawSearch(request: Request): string {
  const { url } = request;
  const queryStart = url.indexOf('?');
  const hashStart = url.indexOf('#');
  if (queryStart === -1 || (hashStart !== -1 && hashStart < queryStart)) {
    return '';
  }
  const search = hashStart === -1 ? url.slice(queryStart) : url.slice(queryStart, hashStart);
  return search === '?' ? '' : search;
}

/** Serve an SVG from the Tier-2 edge cache, or coalesce concurrent misses, render once, and store cacheable responses. */
async function respondWithEdgeCache(
  cacheKeyUrl: string,
  coalesceKey: string,
  ifNoneMatch: string | undefined,
  executionCtx: WaitUntilContext | undefined,
  buildSvg: () => SvgRenderResult | Promise<SvgRenderResult>
): Promise<Response> {
  const edgeCache = getEdgeCache();
  const cacheKey = edgeCache ? new Request(cacheKeyUrl) : undefined;
  if (edgeCache && cacheKey) {
    const cachedResponse = await edgeCache.match(cacheKey);
    if (cachedResponse) {
      return toConditionalResponse(cachedResponse, ifNoneMatch);
    }
  }

  const existingRender = IN_FLIGHT_SVG_RENDERS.get(coalesceKey);
  if (existingRender) {
    const prepared = await existingRender;
    return buildConditionalBodyResponse(prepared.svg, prepared.etag, ifNoneMatch, prepared.headers);
  }

  const renderPromise = (async (): Promise<PreparedSvgRender> => {
    const { extraHeaders, isCacheable, svg, ttl } = await buildSvg();
    const etag = computeEtag(svg);
    const headers = buildSvgHeaders(ttl, etag, extraHeaders);
    if (edgeCache && cacheKey && isCacheable) {
      await putInEdgeCache(
        edgeCache,
        cacheKey,
        new Response(svg, { headers, status: 200 }),
        executionCtx
      );
    }
    return { etag, headers, svg };
  })();

  if (IN_FLIGHT_SVG_RENDERS.size >= MAX_IN_FLIGHT_SVG_RENDERS) {
    const prepared = await renderPromise;
    return buildConditionalBodyResponse(prepared.svg, prepared.etag, ifNoneMatch, prepared.headers);
  }

  IN_FLIGHT_SVG_RENDERS.set(coalesceKey, renderPromise);
  try {
    const prepared = await renderPromise;
    return buildConditionalBodyResponse(prepared.svg, prepared.etag, ifNoneMatch, prepared.headers);
  } finally {
    IN_FLIGHT_SVG_RENDERS.delete(coalesceKey);
  }
}

/** Handle a service preset badge: redirect document navigations, otherwise serve from the edge cache or upstream. */
async function handleServiceRoute(
  context: AppContext,
  url: URL,
  cacheKeyUrl: string,
  request: ServiceRequest
): Promise<Response> {
  const env = context.env ?? DEFAULT_ENV;

  // Document navigations only need the redirect target; skip the upstream fetch entirely:
  if (isDocumentNavigation(context.req.raw)) {
    const redirectUrl = sanitizeRedirectUrl(resolveServiceRedirectUrl(request));
    if (redirectUrl) {
      return new Response(undefined, {
        headers: { ...SERVICE_REDIRECT_HEADERS, Location: redirectUrl },
        status: 302,
      });
    }
  }

  const executionCtx = getSafeExecutionContext(context);
  const coalesceKey = env.GITHUB_TOKEN ? `${env.GITHUB_TOKEN}\0${cacheKeyUrl}` : cacheKeyUrl;
  return respondWithEdgeCache(
    cacheKeyUrl,
    coalesceKey,
    context.req.header('If-None-Match'),
    executionCtx,
    async () => {
      const { result, status } = await resolveServiceMetric(request, env, executionCtx);
      const isSuccess = status === 200;
      return {
        extraHeaders: SERVICE_SVG_HEADERS,
        isCacheable: isSuccess,
        svg: renderServiceBadge(result, url.searchParams),
        ttl: isSuccess ? SERVICE_TTL_SECONDS : SERVICE_ERROR_TTL_SECONDS,
      };
    }
  );
}

/** Handle every registered SVG route via `SVG_ROUTES`. */
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
  return respondWithEdgeCache(
    cacheKey,
    cacheKey,
    context.req.header('If-None-Match'),
    getSafeExecutionContext(context),
    () => ({ isCacheable: true, svg: match.render(), ttl: match.ttl })
  );
}

/** Serve a bundled binary PNG asset (e.g., `/favicon.png` or `/og.png`) with `ETag` revalidation. */
function buildBundledPngResponse(
  context: AppContext,
  pngBuffer: ArrayBuffer,
  etag: string,
  cacheControl: string = buildSvgCacheControl(FAVICON_TTL_SECONDS)
): Response {
  return buildConditionalBodyResponse(pngBuffer, etag, context.req.header('If-None-Match'), {
    ...NOSNIFF_HEADERS,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': cacheControl,
    'Content-Security-Policy': "default-src 'none'",
    'Content-Type': 'image/png',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
}

/** Handle `/favicon.png` with the rasterized RGBA brand icon. */
function handleFaviconPngRoute(context: AppContext): Response {
  faviconPngEtag ??= computeBytesEtag(faviconPngBuffer);
  return buildBundledPngResponse(context, faviconPngBuffer, faviconPngEtag);
}

/** Permanently redirect legacy favicon paths to `/favicon.png` with edge caching. */
function handleFaviconRedirectRoute(): Response {
  return buildPermanentRedirectResponse(
    '/favicon.png',
    `public, max-age=${FAVICON_TTL_SECONDS}, s-maxage=${FAVICON_TTL_SECONDS}`
  );
}

/** Handle `/og.svg` with the memoized vector OpenGraph social card. */
function handleOgImageRoute(context: AppContext): Response {
  const doc = getMemoizedDocument('og.svg', renderOgImageSvg);
  return buildConditionalBodyResponse(
    doc.body,
    doc.etag,
    context.req.header('If-None-Match'),
    buildSvgHeaders(FAVICON_TTL_SECONDS, doc.etag, OG_SVG_HEADERS)
  );
}

/** Handle `/og.png` with the bundled raster OpenGraph social card (immutable when `?v=` matches the live version). */
function handleOgImagePngRoute(context: AppContext): Response {
  ogImagePngEtag ??= computeBytesEtag(ogImagePngBuffer);
  const cacheControl =
    context.req.query('v') === getOgImageVersion()
      ? IMMUTABLE_ASSET_CACHE_CONTROL
      : buildSvgCacheControl(FAVICON_TTL_SECONDS);
  return buildBundledPngResponse(context, ogImagePngBuffer, ogImagePngEtag, cacheControl);
}

/** Handle `/robots.txt` crawler directives. */
function handleRobotsTxtRoute(context: AppContext): Response {
  return buildCrawlerFileResponse(
    context,
    'robots.txt',
    'text/plain; charset=utf-8',
    renderRobotsTxt
  );
}

/** Handle `/sitemap.xml` search engine sitemap. */
function handleSitemapXmlRoute(context: AppContext): Response {
  return buildCrawlerFileResponse(
    context,
    'sitemap.xml',
    'application/xml; charset=utf-8',
    renderSitemapXml
  );
}

/** Handle `/llms.txt` AI assistant documentation summary. */
function handleLlmsTxtRoute(context: AppContext): Response {
  return buildCrawlerFileResponse(context, 'llms.txt', 'text/plain; charset=utf-8', renderLlmsTxt);
}

/** Handle the `/` homepage route. */
function handleRootRoute(context: AppContext): Response {
  return buildHtmlResponse(context, 'home', renderHomeHtml);
}

/** Handle `/docs`: The Getting Started overview page. */
function handleDocsIndexRoute(context: AppContext): Response {
  return buildHtmlResponse(context, 'docs', () => renderDocsHtml('overview'));
}

/** Permanently redirect the legacy `/preview` route to `/docs` (preserving query parameters). */
function handlePreviewRoute(context: AppContext): Response {
  return buildPermanentRedirectResponse(`/docs${getRawSearch(context.req.raw)}`);
}

/** Handle the `/docs/:section` documentation subpage route (unknown sections return `404`). */
function handleDocsSectionRoute(context: AppContext): Response {
  const section = (context.req.param('section') ?? '').trim().toLowerCase();
  if (!isDocsSectionSlug(section)) {
    return buildNotFoundHtmlResponse();
  }
  return buildHtmlResponse(context, `docs/${section}`, () => renderDocsHtml(section));
}

/** Permanently redirect `/builder` to the canonical `/builder/<svg-path>` route for legacy `?path=` links (or the default builder page). */
function handleBuilderIndexRoute(context: AppContext): Response {
  const rawPath = context.req.query('path') ?? '';
  if (rawPath && resolveBuilderTarget(rawPath)) {
    const shareUrl = new URL(
      buildShareUrl(
        SITE_ORIGIN,
        rawPath,
        context.req.query('alt') ?? '',
        context.req.query('link') ?? ''
      )
    );
    return buildPermanentRedirectResponse(`${shareUrl.pathname}${shareUrl.search}`);
  }
  return buildPermanentRedirectResponse(
    `${buildBuilderPath(DEFAULT_BUILDER_KIND)}${getRawSearch(context.req.raw)}`
  );
}

/** Handle the `/builder/:kind` URL builder pages (redirecting SVG alias prefixes and answering unknown kinds with `404`). */
function handleBuilderRoute(context: AppContext): Response {
  const kind = (context.req.param('kind') ?? '').trim().toLowerCase();
  const rawSearch = getRawSearch(context.req.raw);
  if (isBuilderKind(kind)) {
    return buildHtmlResponse(
      context,
      `builder/${kind}`,
      () => renderBuilderHtml(kind),
      rawSearch ? PREFILLED_BUILDER_HTML_HEADERS : HTML_DOCUMENT_HEADERS
    );
  }
  const aliasTarget = findSvgRoute(kind)?.aliasOf;
  if (aliasTarget) {
    return buildPermanentRedirectResponse(`/builder/${aliasTarget}${rawSearch}`);
  }
  return buildNotFoundHtmlResponse();
}

/** Handle deep `/builder/<svg-path>` prefill URLs, redirecting route aliases and serving the matching builder page with `noindex`. */
function handleBuilderPrefillRoute(context: AppContext): Response {
  const rawSvgPathname = getRawPathname(context.req.raw).slice('/builder'.length);
  const rawSearch = getRawSearch(context.req.raw);
  const route = findSvgRoute(extractFirstPathSegment(rawSvgPathname));
  if (!route) {
    return buildNotFoundHtmlResponse();
  }
  if (route.aliasOf) {
    return buildPermanentRedirectResponse(
      `/builder/${route.aliasOf}${rawSvgPathname.slice(route.prefix.length + 1)}${rawSearch}`
    );
  }
  const kind = resolvePathBuilderKind(`${rawSvgPathname}${rawSearch}`, SITE_ORIGIN);
  if (!kind) {
    return buildNotFoundHtmlResponse();
  }
  return buildHtmlResponse(
    context,
    `builder/${kind}`,
    () => renderBuilderHtml(kind),
    PREFILLED_BUILDER_HTML_HEADERS
  );
}

/** Permanently redirect a trailing-slash documentation or builder path (e.g., `/docs/badges/`) to its canonical path. */
function handleTrailingSlashRoute(context: AppContext): Response {
  // Every `TRAILING_SLASH_PATHS` pattern ends in exactly one slash:
  const canonicalPath = getRawPathname(context.req.raw).slice(0, -1);
  return buildPermanentRedirectResponse(`${canonicalPath}${getRawSearch(context.req.raw)}`);
}

/** Handle versioned `/assets/:name` static assets (immutable when `?v=` matches or for font binaries). */
function handleAssetRoute(context: AppContext): Response | Promise<Response> {
  const name = context.req.param('name') ?? '';
  const asset = getSiteAsset(name);
  if (!asset) {
    return context.notFound();
  }
  // The version is a content hash, so it doubles as a weak entity tag (scoped to this URL):
  const etag = `W/"${asset.version}"`;
  const isImmutable = context.req.query('v') === asset.version || asset.contentType === 'font/ttf';
  return buildConditionalBodyResponse(asset.body, etag, context.req.header('If-None-Match'), {
    ...NOSNIFF_HEADERS,
    'Cache-Control': isImmutable ? IMMUTABLE_ASSET_CACHE_CONTROL : HTML_CACHE_CONTROL,
    'Content-Type': asset.contentType,
    'X-Robots-Tag': 'noindex',
  });
}

/** Answer unmatched asset and SVG routes with a compact plain-text `404` and site routes with the branded `404` HTML page. */
function handleNotFound(context: AppContext): Response {
  const prefix = extractFirstPathSegment(getRawPathname(context.req.raw));
  if (prefix === 'assets' || findSvgRoute(prefix)) {
    return new Response('404 Not Found', { headers: PLAIN_NOT_FOUND_HEADERS, status: 404 });
  }
  return buildNotFoundHtmlResponse();
}

/** Log an unexpected failure and answer SVG routes with an error badge, site pages with a branded `500` HTML page, and assets/crawler endpoints with a plain `500`. */
function handleAppError(error: Error, context: AppContext): Response {
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  // oxlint-disable-next-line no-console -- Surface unexpected failures in Workers Logs (observability).
  console.error(`Unhandled ${context.req.method} ${context.req.url}:`, error);
  const pathname = getRawPathname(context.req.raw);
  const prefix = extractFirstPathSegment(pathname);
  if (findSvgRoute(prefix)) {
    try {
      return buildSvgResponse(
        renderInternalErrorBadge(),
        SERVICE_ERROR_TTL_SECONDS,
        prefix === 'badge' ? ERROR_SERVICE_SVG_HEADERS : ERROR_SVG_HEADERS
      );
    } catch {
      // Rendering the error badge failed as well; fall back to the plain-text response below.
    }
  } else if (prefix !== 'assets' && !isNonHtmlRootPath(pathname)) {
    try {
      const page = getMemoizedDocument('500', renderServerErrorHtml);
      return new Response(page.body, { headers: SERVER_ERROR_HTML_HEADERS, status: 500 });
    } catch {
      // Rendering the error page failed as well; fall back to the plain-text response below.
    }
  }
  return new Response('Internal Server Error', { headers: PLAIN_ERROR_HEADERS, status: 500 });
}

// ----------------------------------------- MAIN ----------------------------------------

const app = new Hono<{ Bindings: Env }>({ getPath: getRawPathname });

// [1] Reject oversized request URLs early:
app.use('*', guardRequestUrlLength);

// [2] Website pages, discovery metadata, and static assets:
app.get('/', handleRootRoute);
app.get('/favicon.png', handleFaviconPngRoute);
app.get('/favicon.ico', handleFaviconRedirectRoute);
app.get('/favicon.svg', handleFaviconRedirectRoute);
app.get('/og.png', handleOgImagePngRoute);
app.get('/og.svg', handleOgImageRoute);
app.get('/robots.txt', handleRobotsTxtRoute);
app.get('/sitemap.xml', handleSitemapXmlRoute);
app.get('/llms.txt', handleLlmsTxtRoute);
app.get('/docs', handleDocsIndexRoute);
app.get('/docs/:section', handleDocsSectionRoute);
app.get('/preview', handlePreviewRoute);
app.get('/builder', handleBuilderIndexRoute);
app.get('/builder/:kind', handleBuilderRoute);
app.get('/assets/:name', handleAssetRoute);
for (const path of TRAILING_SLASH_PATHS) {
  app.get(path, handleTrailingSlashRoute);
}
app.get('/builder/*', handleBuilderPrefillRoute);

// [3] Registered SVG routes from `SVG_ROUTES`:
for (const route of SVG_ROUTES) {
  app.get(`/${route.prefix}/*`, handleSvgRoute);
}

// [4] Unmatched routes and unexpected failures:
app.notFound(handleNotFound);
app.onError(handleAppError);

export default app;
