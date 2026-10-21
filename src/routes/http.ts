/**
 * HTTP helpers – Request classification, entity tags, redirect validation, the preview kill switch, and shared response headers of the Worker router.
 */

import { hashText } from '@/svg/shared';

// ---------------------------------------- CONSTS ---------------------------------------

/** `X-Content-Type-Options` header attached to every HTML, asset, and SVG response. */
export const NOSNIFF_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
};

/** Security headers attached to every HTML documentation response. */
export const HTML_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  ...NOSNIFF_HEADERS,
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/**
 * Restrictive `Content-Security-Policy` for SVG responses (defense in depth against SVG XSS when a
 * badge is opened directly): No scripts or external resources; Inline style attributes and SMIL
 * animations keep working.
 */
const SVG_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'";

/** `Vary` header of service preset badges (document navigations redirect, image requests get the SVG). */
export const SERVICE_VARY_HEADER = 'Sec-Fetch-Dest, Accept';

/** Static headers shared by every SVG response (CORS, CSP, content type, and `nosniff`). */
const SVG_BASE_HEADERS: Readonly<Record<string, string>> = {
  ...NOSNIFF_HEADERS,
  'Access-Control-Allow-Origin': '*',
  'Content-Security-Policy': SVG_CONTENT_SECURITY_POLICY,
  'Content-Type': 'image/svg+xml; charset=utf-8',
};

/** Browser cache lifetime in seconds of SVG responses (the shared edge TTL varies per route). */
const SVG_BROWSER_MAX_AGE_SECONDS = 60;

/** Window in seconds during which shared caches may serve a stale SVG while revalidating. */
const SVG_STALE_WHILE_REVALIDATE_SECONDS = 600;

/** Normalized `ALLOW_PREVIEW_IN_PROD` values that disable the homepage, docs, builder, and assets. */
const DISABLED_FLAG_TOKENS: ReadonlySet<string> = new Set(['0', 'false']);

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches any control character (tabs and line breaks would be silently stripped by the URL parser). */
const CONTROL_CHAR_RX = /\p{Cc}/u;

// -------------------------------------- INTERNALS --------------------------------------

/** Strip the weak validator prefix (`W/`) so entity tags compare weakly (RFC 9110 `If-None-Match`). */
function stripWeakPrefix(etag: string): string {
  return etag.startsWith('W/') ? etag.slice(2) : etag;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Determine whether an incoming HTTP request is a top-level browser document navigation
 * rather than an embedded `<img src="…">` request.
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

/**
 * Compute a weak entity tag (`W/"<hash>-<length>"`, both base-36) for a document.
 * @param content   Complete response body.
 * @returns Weak `ETag` header value.
 */
export function computeEtag(content: string): string {
  return `W/"${hashText(content)}-${content.length.toString(36)}"`;
}

/**
 * Check whether an `If-None-Match` request header matches `etag` (weak comparison, `*` matches any).
 * @param ifNoneMatch   Raw `If-None-Match` request header.
 * @param etag          Current entity tag of the resource.
 * @returns `true` when the client's cached copy is still current (answer with `304`).
 */
export function isEtagMatch(ifNoneMatch: string | undefined, etag: string): boolean {
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

/**
 * Validate an absolute HTTP(S) redirect URL.
 * @param rawUrl   Untrusted redirect target.
 * @returns Trimmed URL, or `undefined` when it does not parse or uses another protocol (e.g., `javascript:`).
 */
export function sanitizeRedirectUrl(rawUrl: string): string | undefined {
  const trimmed = rawUrl.trim();
  if (CONTROL_CHAR_RX.test(trimmed)) {
    return undefined;
  }
  const parsed = URL.parse(trimmed);
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    return undefined;
  }
  return trimmed;
}

/**
 * Check whether an `ALLOW_PREVIEW_IN_PROD` binding disables the preview pages (`false` or `0`, case-insensitive).
 * @param rawFlag   Raw environment variable value (`undefined` keeps the pages enabled).
 * @returns `true` when the homepage, docs, builder, and assets must not be served.
 */
export function isPreviewDisabledFlag(rawFlag: string | undefined): boolean {
  return DISABLED_FLAG_TOKENS.has((rawFlag ?? '').trim().toLowerCase());
}

/**
 * Build the `Cache-Control` header of an SVG response.
 * @param ttl   Shared edge cache TTL in seconds.
 * @returns `Cache-Control` header value.
 */
export function buildSvgCacheControl(ttl: number): string {
  return `public, max-age=${SVG_BROWSER_MAX_AGE_SECONDS}, s-maxage=${ttl}, stale-while-revalidate=${SVG_STALE_WHILE_REVALIDATE_SECONDS}`;
}

/**
 * Build an HTTP `200` SVG response with edge cache and security headers.
 * @param svg            Complete SVG markup.
 * @param ttl            Shared edge cache TTL in seconds.
 * @param extraHeaders   Optional additional headers (e.g., `Vary`).
 * @returns SVG `Response`.
 */
export function buildSvgResponse(
  svg: string,
  ttl: number,
  extraHeaders?: Readonly<Record<string, string>>
): Response {
  return new Response(svg, {
    headers: { ...SVG_BASE_HEADERS, 'Cache-Control': buildSvgCacheControl(ttl), ...extraHeaders },
    status: 200,
  });
}
