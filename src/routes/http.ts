/**
 * HTTP helpers – Request classification, entity tags, redirect validation, and shared response headers of the Worker router.
 */

import { hashText } from '@/svg/shared';

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum accepted raw request URL length in characters (`414 URI Too Long` defense against CPU/cache abuse). */
export const MAX_REQUEST_URL_LENGTH = 8192;

/** `X-Content-Type-Options` header attached to every HTML, asset, and SVG response. */
export const NOSNIFF_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
};

/**
 * `Content-Security-Policy` for HTML documentation and builder responses:
 * Self-hosted assets, inline style attributes, `data:` images, and the SHA-256 hash of the head theme script.
 */
const HTML_CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'sha256-Pz/SIIcjOe8SrIdxZBwGPhr6Pp2zVCiFgAGUtA6zDMo='; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

/** Security headers attached to every HTML documentation response. */
export const HTML_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  ...NOSNIFF_HEADERS,
  'Content-Security-Policy': HTML_CONTENT_SECURITY_POLICY,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

/**
 * Restrictive `Content-Security-Policy` for SVG responses (defense in depth against SVG XSS when a badge is opened directly):
 * No scripts or external resources; Inline style attributes and SMIL animations keep working.
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

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches any control character (tabs and line breaks would be silently stripped by the URL parser). */
const CONTROL_CHAR_RX = /\p{Cc}/u;

// -------------------------------------- INTERNALS --------------------------------------

/** Strip the weak validator prefix (`W/`) so entity tags compare weakly (RFC 9110 `If-None-Match`). */
function stripWeakPrefix(etag: string): string {
  return etag.startsWith('W/') ? etag.slice(2) : etag;
}

/** Check whether an `If-None-Match` request header matches `etag` (weak comparison, `*` matches any). */
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

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Determine whether an incoming HTTP request is a top-level browser
 * document navigation rather than an embedded `<img src="…">` request.
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
 * Build the `Cache-Control` header of an SVG response.
 * @param ttl   Shared edge cache TTL in seconds.
 * @returns `Cache-Control` header value.
 */
export function buildSvgCacheControl(ttl: number): string {
  return `public, max-age=${SVG_BROWSER_MAX_AGE_SECONDS}, s-maxage=${ttl}, stale-while-revalidate=${SVG_STALE_WHILE_REVALIDATE_SECONDS}`;
}

/**
 * Build the response headers of an SVG document.
 * @param ttl            Shared edge cache TTL in seconds.
 * @param etag           Entity tag of the SVG body.
 * @param extraHeaders   Optional additional headers (e.g., `Vary`).
 * @returns Merged SVG response headers.
 */
export function buildSvgHeaders(
  ttl: number,
  etag: string,
  extraHeaders?: Readonly<Record<string, string>>
): Record<string, string> {
  return {
    ...SVG_BASE_HEADERS,
    'Cache-Control': buildSvgCacheControl(ttl),
    ETag: etag,
    ...extraHeaders,
  };
}

/**
 * Build an HTTP `200` SVG response with entity tag, edge cache, and security headers.
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
    headers: buildSvgHeaders(ttl, computeEtag(svg), extraHeaders),
    status: 200,
  });
}

/**
 * Build an HTTP `200` response carrying `etag`, or a bodiless `304 Not Modified` response when `ifNoneMatch` matches.
 * @param body          Complete response body.
 * @param etag          Entity tag of `body`.
 * @param ifNoneMatch   Incoming `If-None-Match` request header value.
 * @param headers       Response headers (merged with `ETag: etag`).
 * @returns `304` `Response` without a body when current, otherwise `200` `Response`.
 */
export function buildConditionalBodyResponse(
  body: BodyInit,
  etag: string,
  ifNoneMatch: string | undefined,
  headers: Readonly<Record<string, string>>
): Response {
  const responseHeaders = { ...headers, ETag: etag };
  if (isEtagMatch(ifNoneMatch, etag)) {
    return new Response(undefined, { headers: responseHeaders, status: 304 });
  }
  return new Response(body, { headers: responseHeaders, status: 200 });
}

/**
 * Convert a `200` response carrying an `ETag` header into a `304 Not Modified` response when `ifNoneMatch` matches.
 * @param response      Built or edge-cached `Response`.
 * @param ifNoneMatch   Incoming `If-None-Match` request header value.
 * @returns `304` `Response` without a body when current, otherwise `response` unchanged.
 */
export function toConditionalResponse(
  response: Response,
  ifNoneMatch: string | undefined
): Response {
  if (response.status !== 200 || !ifNoneMatch) {
    return response;
  }
  const etag = response.headers.get('ETag');
  if (!etag || !isEtagMatch(ifNoneMatch, etag)) {
    return response;
  }
  return new Response(undefined, { headers: response.headers, status: 304 });
}
