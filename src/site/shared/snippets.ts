/**
 * Shared Snippet Builders & Importer
 *
 * URL syntax highlighting tokenizer, snippet generators across output formats, and pasted URL/embed parser.
 */

import { getOwnValue } from '@/site/shared/encoding';
import { resolvePathBuilderKind, stripBuilderMetaQuery } from '@/site/shared/url';
import type { HighlightToken, ImportedBuilderSnippet, SnippetSet, SnippetTokenSet } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Normalized allowed origin entry for validating pasted URLs and bare-host inputs. */
interface AllowedOriginEntry {
  /** Lowercase `host` (`hostname[:port]`) of the origin. */
  hostLower: string;
  /** Canonical origin string (`protocol + '//' + host`). */
  origin: string;
  /** Origin protocol including trailing colon (e.g., `'https:'`). */
  protocol: string;
}

/** Raw image URL and optional metadata extracted from a Markdown, HTML, or plain URL input. */
interface ExtractedSnippetSource {
  /** Unescaped alt text (`''` when absent). */
  alt: string;
  /** Unescaped link target (`''` when absent). */
  link: string;
  /** Raw SVG or builder URL/path before origin and route validation. */
  targetUrl: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Entity replacements of characters escaped inside double-quoted HTML attribute values. */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '"': '&quot;',
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

/** Named HTML character references unescaped when parsing HTML snippet attributes. */
const HTML_NAMED_UNESCAPES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

/** Maximum accepted length in characters for an imported URL or snippet. */
const MAX_IMPORT_SNIPPET_LENGTH = 8192;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches characters escaped with a backslash inside Markdown image alt text. */
const MARKDOWN_ALT_RX = /[[\]\\]/g;

/** Matches characters percent-encoded inside Markdown link destinations. */
const MARKDOWN_DESTINATION_RX = /[ ()<>]/g;

/** Matches percent-encoded Markdown destination characters (`%20`, `%28`, `%29`, `%3C`, `%3E`). */
const MARKDOWN_ENCODED_CHAR_RX = /%(?:20|28|29|3[cCeE])/g;

/** Matches an optional trailing CommonMark link title (`"…"` or `'…'`) after an unbracketed URL. */
const MARKDOWN_TITLE_SUFFIX_RX = /\s+(?:"[^"]*"|'[^']*')$/;

/** Matches `"`, `<`, `>`, and `&` starting an HTML character reference inside double-quoted attributes. */
const HTML_ATTR_RX = /&(?=#\d|#x[\da-fA-F]|[a-zA-Z][\da-zA-Z]*(?:;|(?![=\da-zA-Z])))|["<>]/g;

/** Matches named (`&amp;`, `&apos;`, `&gt;`, `&lt;`, `&quot;`) and numeric (`&#…;`, `&#x…;`) HTML character references. */
const HTML_UNESCAPE_RX = /&(?:(?<named>amp|apos|gt|lt|quot)|#(?<dec>\d+)|#x(?<hex>[\da-fA-F]+));/gi;

/** Matches an HTML `<img` tag opening token. */
const HTML_IMG_TAG_RX = /<img\b/i;

/** Matches an HTML `<img>` tag with optional attributes. */
const HTML_IMG_SNIPPET_RX = /<img\b(?<imgAttrs>(?:[^>"']|"[^"]*"|'[^']*')*)\/?>/i;

/** Matches an HTML `<a>` tag wrapping an `<img>` tag. */
const HTML_LINKED_IMG_SNIPPET_RX =
  /<a\b(?<anchorAttrs>(?:[^>"']|"[^"]*"|'[^']*')*)>\s*<img\b(?<imgAttrs>(?:[^>"']|"[^"]*"|'[^']*')*)\/?>\s*<\/a>/i;

/** Matches quoted or unquoted HTML attributes inside an opening tag attribute list. */
const HTML_TAG_ATTR_RX =
  /(?:\s|^)(?<name>[a-zA-Z][\w:-]*)\s*=\s*(?:"(?<dq>[^"]*)"|'(?<sq>[^']*)'|(?<uq>[^\s"'=<>`]+))/g;

/** Matches a leading URI scheme prefix (`scheme:`). */
const URL_SCHEME_RX = /^(?<scheme>[a-zA-Z][a-zA-Z\d+.-]*):/;

// -------------------------------------- INTERNALS --------------------------------------

/** Escape a value for a double-quoted HTML attribute (`&quot;`, `&lt;`, `&gt;`, and ambiguous `&amp;`). */
function escapeHtmlAttribute(value: string): string {
  return value.replace(HTML_ATTR_RX, (char) => HTML_ENTITIES[char] ?? char);
}

/** Unescape HTML character references inside a single- or double-quoted attribute value. */
function unescapeHtmlAttribute(value: string): string {
  return value.replace(HTML_UNESCAPE_RX, (match, named?: string, dec?: string, hex?: string) => {
    if (named) {
      return getOwnValue(HTML_NAMED_UNESCAPES, named.toLowerCase()) ?? match;
    }
    let codePoint = Number.NaN;
    if (dec) {
      codePoint = Number.parseInt(dec, 10);
    } else if (hex) {
      codePoint = Number.parseInt(hex, 16);
    }
    if (
      Number.isInteger(codePoint) &&
      codePoint >= 1 &&
      codePoint <= 0x10_ff_ff &&
      (codePoint < 0xd8_00 || codePoint > 0xdf_ff)
    ) {
      return String.fromCodePoint(codePoint);
    }
    return match;
  });
}

/** Read and unescape a single attribute value from an HTML tag's attribute string. */
function readHtmlAttribute(rawAttrs: string, targetName: string): string {
  for (const match of rawAttrs.matchAll(HTML_TAG_ATTR_RX)) {
    if (match.groups?.name?.toLowerCase() === targetName) {
      return unescapeHtmlAttribute(match.groups.dq ?? match.groups.sq ?? match.groups.uq ?? '');
    }
  }
  return '';
}

/** Parse a standalone HTML `<img>` or linked `<a><img /></a>` snippet into its source URL and metadata. */
function parseHtmlSnippet(text: string): ExtractedSnippetSource | undefined {
  const linkedMatch = HTML_LINKED_IMG_SNIPPET_RX.exec(text);
  const imgAttrs = linkedMatch
    ? (linkedMatch.groups?.imgAttrs ?? '')
    : (HTML_IMG_SNIPPET_RX.exec(text)?.groups?.imgAttrs ?? undefined);
  if (imgAttrs === undefined) {
    return undefined;
  }
  const targetUrl = readHtmlAttribute(imgAttrs, 'src').trim();
  if (!targetUrl) {
    return undefined;
  }
  return {
    alt: readHtmlAttribute(imgAttrs, 'alt'),
    link: linkedMatch ? readHtmlAttribute(linkedMatch.groups?.anchorAttrs ?? '', 'href') : '',
    targetUrl,
  };
}

/** Unwrap angle brackets, strip optional CommonMark titles, and decode Markdown destination escapes. */
function decodeMarkdownDestination(rawDestination: string): string {
  const trimmed = rawDestination.trim();
  const unwrapped =
    trimmed.startsWith('<') && trimmed.endsWith('>')
      ? trimmed.slice(1, -1).trim()
      : trimmed.replace(MARKDOWN_TITLE_SUFFIX_RX, '').trim();
  return unwrapped.replace(MARKDOWN_ENCODED_CHAR_RX, (match) =>
    String.fromCharCode(Number.parseInt(match.slice(1), 16))
  );
}

/** Read the content inside balanced `(…)` starting at `openIndex` (`text[openIndex] === '('`). */
function readParenthesized(
  text: string,
  openIndex: number
): { content: string; nextIndex: number } | undefined {
  if (text[openIndex] !== '(') {
    return undefined;
  }
  let depth = 1;
  let i = openIndex + 1;
  while (i < text.length && depth > 0) {
    const char = text[i];
    if (char === '\\') {
      i += 2;
    } else {
      if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
      }
      i += 1;
    }
  }
  return depth === 0 ? { content: text.slice(openIndex + 1, i - 1), nextIndex: i } : undefined;
}

/** Parse a Markdown `![alt](url)` or `[![alt](url)](href)` snippet in linear time without backtracking. */
function parseMarkdownSnippet(text: string): ExtractedSnippetSource | undefined {
  const linkedStart = text.indexOf('[![');
  const isLinked = linkedStart !== -1;
  const start = isLinked ? linkedStart : text.indexOf('![');
  if (start === -1) {
    return undefined;
  }
  let alt = '';
  let hasClosingBracket = false;
  let i = start + (isLinked ? 3 : 2);
  while (i < text.length) {
    const char = text[i] ?? '';
    if (char === '\\' && i + 1 < text.length) {
      alt += text[i + 1] ?? '';
      i += 2;
    } else if (char === ']') {
      hasClosingBracket = true;
      i += 1;
      break;
    } else {
      alt += char;
      i += 1;
    }
  }
  const imageTarget = hasClosingBracket ? readParenthesized(text, i) : undefined;
  if (!imageTarget) {
    return undefined;
  }
  const targetUrl = decodeMarkdownDestination(imageTarget.content);
  if (!isLinked) {
    return { alt, link: '', targetUrl };
  }
  if (text[imageTarget.nextIndex] !== ']') {
    return undefined;
  }
  const linkTarget = readParenthesized(text, imageTarget.nextIndex + 1);
  return linkTarget
    ? { alt, link: decodeMarkdownDestination(linkTarget.content), targetUrl }
    : undefined;
}

/** Normalize deduplicated allowed origin strings into parsed origin lookup entries. */
function parseAllowedOrigins(allowedOrigins: readonly string[]): AllowedOriginEntry[] {
  const entries: AllowedOriginEntry[] = [];
  const seenOrigins = new Set<string>();
  for (const rawOrigin of allowedOrigins) {
    if (rawOrigin && URL.canParse(rawOrigin)) {
      const parsed = new URL(rawOrigin);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        !seenOrigins.has(parsed.origin)
      ) {
        seenOrigins.add(parsed.origin);
        entries.push({
          hostLower: parsed.host.toLowerCase(),
          origin: parsed.origin,
          protocol: parsed.protocol,
        });
      }
    }
  }
  return entries;
}

/** Resolve a root-relative path, bare-host URL, or full URL against `allowedOrigins`, rejecting external hosts. */
function resolveAllowedUrl(
  rawUrl: string,
  allowedOrigins: readonly AllowedOriginEntry[]
): URL | undefined {
  const [primary] = allowedOrigins;
  if (!rawUrl || rawUrl.startsWith('//') || !primary) {
    return undefined;
  }
  if (rawUrl.startsWith('/')) {
    if (!URL.canParse(rawUrl, primary.origin)) {
      return undefined;
    }
    const resolved = new URL(rawUrl, primary.origin);
    return resolved.origin === primary.origin ? resolved : undefined;
  }
  const lower = rawUrl.toLowerCase();
  for (const entry of allowedOrigins) {
    if (lower.startsWith(`${entry.hostLower}/`)) {
      const candidate = `${entry.protocol}//${rawUrl}`;
      if (URL.canParse(candidate)) {
        const resolved = new URL(candidate);
        if (resolved.origin === entry.origin) {
          return resolved;
        }
      }
    }
  }
  if (URL_SCHEME_RX.test(rawUrl)) {
    if (!URL.canParse(rawUrl)) {
      return undefined;
    }
    const resolved = new URL(rawUrl);
    return allowedOrigins.some((entry) => entry.origin === resolved.origin) ? resolved : undefined;
  }
  return undefined;
}

/** Check whether an imported link target is empty, relative, or an explicit `http:` / `https:` URL. */
function isSafeImportedLink(rawLink: string): boolean {
  if (!rawLink) {
    return true;
  }
  if (rawLink.startsWith('//')) {
    return false;
  }
  const schemeMatch = URL_SCHEME_RX.exec(rawLink);
  if (!schemeMatch) {
    return true;
  }
  const scheme = schemeMatch.groups?.scheme?.toLowerCase();
  return (scheme === 'http' || scheme === 'https') && URL.canParse(rawLink);
}

/** Check whether `pathname` points at `/builder` or `/builder/:kind`. */
function isBuilderPathname(pathname: string): boolean {
  return pathname === '/builder' || pathname.startsWith('/builder/');
}

/** Extract the raw target URL and optional metadata from Markdown, HTML, or plain text. */
function extractSnippetSource(trimmed: string): ExtractedSnippetSource | undefined {
  if (HTML_IMG_TAG_RX.test(trimmed)) {
    const htmlSource = parseHtmlSnippet(trimmed);
    if (htmlSource) {
      return htmlSource;
    }
  }
  if (trimmed.includes('![')) {
    return parseMarkdownSnippet(trimmed);
  }
  return { alt: '', link: '', targetUrl: trimmed };
}

/** Resolve the inner SVG URL from a legacy `/builder?path=…` query parameter. */
function unwrapLegacyBuilderPathParam(parsedUrl: URL): URL | undefined {
  const sharedPath = (parsedUrl.searchParams.get('path') ?? '').trim();
  if (
    !sharedPath.startsWith('/') ||
    sharedPath.startsWith('//') ||
    !URL.canParse(sharedPath, parsedUrl.origin)
  ) {
    return undefined;
  }
  const innerUrl = new URL(sharedPath, parsedUrl.origin);
  return innerUrl.origin === parsedUrl.origin && !isBuilderPathname(innerUrl.pathname)
    ? innerUrl
    : undefined;
}

/** Unwrap a `/builder/<svg-path>` or legacy `/builder?path=…` share URL into its inner SVG URL and metadata. */
function unwrapBuilderShareUrl(
  parsedUrl: URL,
  initialAlt: string,
  initialLink: string
): { alt: string; link: string; svgUrl: URL } | undefined {
  if (!isBuilderPathname(parsedUrl.pathname)) {
    return { alt: initialAlt, link: initialLink, svgUrl: parsedUrl };
  }
  let alt = initialAlt;
  let link = initialLink;
  alt ||= (parsedUrl.searchParams.get('alt') ?? '').trim();
  link ||= (parsedUrl.searchParams.get('link') ?? '').trim();
  if (parsedUrl.searchParams.has('path')) {
    const innerUrl = unwrapLegacyBuilderPathParam(parsedUrl);
    return innerUrl ? { alt, link, svgUrl: innerUrl } : undefined;
  }
  const innerPathname = parsedUrl.pathname.slice('/builder'.length);
  if (!innerPathname || innerPathname === '/' || isBuilderPathname(innerPathname)) {
    return undefined;
  }
  const innerSearch = stripBuilderMetaQuery(parsedUrl.search);
  const secondSlash = innerPathname.indexOf('/', 1);
  const hasDeepSegment = secondSlash !== -1 && secondSlash < innerPathname.length - 1;
  if (!hasDeepSegment && !innerSearch) {
    return undefined;
  }
  return { alt, link, svgUrl: new URL(`${innerPathname}${innerSearch}`, parsedUrl.origin) };
}

/** Join highlight tokens into their plain text. */
function joinTokens(tokens: readonly HighlightToken[]): string {
  let text = '';
  for (const token of tokens) {
    text += token[1];
  }
  return text;
}

/** Percent-encode the characters that would end or break a Markdown link destination (space, `(`, `)`, `<`, `>`). */
function encodeMarkdownDestination(text: string): string {
  return text.replace(
    MARKDOWN_DESTINATION_RX,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/** Split a URL into highlight tokens (origin + endpoint, path segments, `?key=` / `&key=`, values). */
function tokenizeUrl(url: string): HighlightToken[] {
  const queryIndex = url.indexOf('?');
  const base = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const schemeEnd = base.indexOf('://');
  const endpointSlash = schemeEnd === -1 ? base.indexOf('/') : base.indexOf('/', schemeEnd + 3);
  const pathSlash = endpointSlash === -1 ? -1 : base.indexOf('/', endpointSlash + 1);
  const tokens: HighlightToken[] =
    pathSlash === -1
      ? [['hl-url', base]]
      : [
          ['hl-url', base.slice(0, pathSlash)],
          ['hl-path', base.slice(pathSlash)],
        ];
  if (queryIndex === -1) {
    return tokens;
  }
  const queryPairs = url.slice(queryIndex + 1).split('&');
  for (const [i, pair] of queryPairs.entries()) {
    const prefix = i === 0 ? '?' : '&';
    const equalsIndex = pair.indexOf('=');
    if (equalsIndex === -1) {
      tokens.push(['hl-key', `${prefix}${pair}`]);
    } else {
      tokens.push(['hl-key', `${prefix}${pair.slice(0, equalsIndex + 1)}`]);
      const value = pair.slice(equalsIndex + 1);
      if (value) {
        tokens.push(['hl-val', value]);
      }
    }
  }
  return tokens;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the highlight tokens of a (linked) Markdown image snippet (alt text escapes `[`, `]`, `\`;
 * Destinations percent-encode space, `(`, `)`, `<`, `>`).
 * @param url    Absolute image URL.
 * @param alt    Alt text.
 * @param href   Optional link target (`undefined` or `''` for an unlinked image).
 * @returns Tokens whose joined text is the exact Markdown snippet.
 */
export function buildMarkdownSnippetTokens(
  url: string,
  alt: string,
  href: string | undefined
): HighlightToken[] {
  const tokens: HighlightToken[] = href ? [['hl-p', '[']] : [];
  tokens.push(
    ['hl-p', '!['],
    ['hl-alt', alt.replace(MARKDOWN_ALT_RX, String.raw`\$&`)],
    ['hl-p', '](']
  );
  for (const [className, text] of tokenizeUrl(url)) {
    tokens.push([className, encodeMarkdownDestination(text)]);
  }
  tokens.push(['hl-p', ')']);
  if (href) {
    tokens.push(['hl-p', ']('], ['hl-href', encodeMarkdownDestination(href)], ['hl-p', ')']);
  }
  return tokens;
}

/**
 * Build the highlight tokens of every snippet format (their joined text is the exact snippet):
 * The raw URL is tokenized first, then each token is escaped for its format.
 * @param url    Absolute SVG URL.
 * @param alt    Alt text.
 * @param link   Optional link target (`''` for an unlinked image).
 * @returns Token lists for `html`, `markdown`, and `url`.
 */
export function buildSnippetTokens(url: string, alt: string, link: string): SnippetTokenSet {
  const urlTokens = tokenizeUrl(url);
  const markdown = buildMarkdownSnippetTokens(url, alt, link || undefined);
  const html: HighlightToken[] = link
    ? [
        ['hl-p', '<a href="'],
        ['hl-href', escapeHtmlAttribute(link)],
        ['hl-p', '">'],
      ]
    : [];
  html.push(['hl-p', '<img src="']);
  for (const [className, text] of urlTokens) {
    html.push([className, escapeHtmlAttribute(text)]);
  }
  html.push(['hl-p', '" alt="'], ['hl-alt', escapeHtmlAttribute(alt)], ['hl-p', '" />']);
  if (link) {
    html.push(['hl-p', '</a>']);
  }
  return { html, markdown, url: urlTokens };
}

/**
 * Build the plain-text snippets of every format.
 * @param url    Absolute SVG URL.
 * @param alt    Alt text.
 * @param link   Optional link target.
 * @returns Plain-text `html`, `markdown`, and `url` snippets.
 */
export function buildSnippets(url: string, alt: string, link: string): SnippetSet {
  const tokens = buildSnippetTokens(url, alt, link);
  return {
    html: joinTokens(tokens.html),
    markdown: joinTokens(tokens.markdown),
    url: joinTokens(tokens.url),
  };
}

/**
 * Parse a pasted SVG URL, root-relative path, bare-host URL, builder share link, Markdown embed,
 * or HTML `<img>` / `<a><img /></a>` snippet into its target builder kind, SVG path, and metadata.
 * @param rawInput         Raw user-pasted URL or snippet text.
 * @param allowedOrigins   Permitted origin strings (e.g., `[schema.origin, location.origin]`).
 * @returns Extracted builder kind, SVG path, and optional `alt` / `link`, or `undefined` when invalid.
 */
export function parseImportedSnippet(
  rawInput: string,
  allowedOrigins: readonly string[]
): ImportedBuilderSnippet | undefined {
  const trimmed = rawInput.trim();
  if (!trimmed || trimmed.length > MAX_IMPORT_SNIPPET_LENGTH) {
    return undefined;
  }
  const extracted = extractSnippetSource(trimmed);
  if (!extracted?.targetUrl) {
    return undefined;
  }
  const parsedUrl = resolveAllowedUrl(extracted.targetUrl, parseAllowedOrigins(allowedOrigins));
  if (!parsedUrl) {
    return undefined;
  }
  const unwrapped = unwrapBuilderShareUrl(parsedUrl, extracted.alt.trim(), extracted.link.trim());
  if (!unwrapped || !isSafeImportedLink(unwrapped.link)) {
    return undefined;
  }
  const svgPath = `${unwrapped.svgUrl.pathname}${unwrapped.svgUrl.search}`;
  const kind = resolvePathBuilderKind(svgPath, unwrapped.svgUrl.origin);
  return kind ? { alt: unwrapped.alt, kind, link: unwrapped.link, path: svgPath } : undefined;
}
