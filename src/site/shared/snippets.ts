/**
 * Shared snippet builders – URL syntax highlighting tokenizer and snippet generators across output formats.
 */

import type { HighlightToken, SnippetSet, SnippetTokenSet } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Entity replacements of characters escaped inside double-quoted HTML attribute values. */
const HTML_ENTITIES: Readonly<Record<string, string>> = { '"': '&quot;', '<': '&lt;', '>': '&gt;' };

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches characters escaped with a backslash inside Markdown image alt text. */
const MARKDOWN_ALT_RX = /[[\]\\]/g;

/** Matches characters percent-encoded inside Markdown link destinations. */
const MARKDOWN_DESTINATION_RX = /[ ()<>]/g;

/** Matches characters escaped inside double-quoted HTML attribute values. */
const HTML_ATTR_RX = /["<>]/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Escape a value for a double-quoted HTML attribute (`&quot;`, `&lt;`, `&gt;`). */
function escapeHtmlAttribute(value: string): string {
  return value.replace(HTML_ATTR_RX, (char) => HTML_ENTITIES[char] ?? char);
}

/** Join highlight tokens into their plain text. */
function joinTokens(tokens: readonly HighlightToken[]): string {
  let text = '';
  for (const token of tokens) {
    text += token[1];
  }
  return text;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Percent-encode the characters that would end or break a Markdown link destination (space, `(`, `)`, `<`, `>`).
 * @param text   Raw URL or URL token text.
 * @returns Destination-safe string.
 */
export function encodeMarkdownDestination(text: string): string {
  return text.replace(
    MARKDOWN_DESTINATION_RX,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * Split a URL into highlight tokens (origin + endpoint, path segments, `?key=` / `&key=`, values).
 * @param url   Raw (unescaped) URL.
 * @returns Highlight tokens covering the entire URL.
 */
export function tokenizeUrl(url: string): HighlightToken[] {
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
  for (const [i, pair] of url
    .slice(queryIndex + 1)
    .split('&')
    .entries()) {
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
