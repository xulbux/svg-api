/**
 * Shared URL segment encoding & schema lookup helpers – Path segment escaping/decoding and builder schema lookups shared by SSR and browser bundles.
 */

import type {
  BuilderField,
  BuilderOption,
  BuilderSchema,
  BuilderServiceOption,
  BuilderState,
} from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum number of cycling lines accepted by `/typing` and the typing builder. */
export const MAX_TYPING_LINES = 12;

/** Maximum character length per individual typing line before truncation. */
export const MAX_TYPING_LINE_LENGTH = 80;

/** Truthy boolean query tokens accepted by boolean flag parameters in display order. */
export const TRUTHY_FLAG_LIST = ['true', '1', 'yes'] as const;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches comma or whitespace separators in list-style payloads. */
export const LIST_SEPARATOR_RX = /[,\s]+/;

/** Matches percent-escaped characters that stay readable in paths and query values (`,` `:` `;` `@` `|`). */
const READABLE_ESCAPE_RX = /%(?:2C|3A|3B|40|7C)/g;

/** Matches percent-escaped spaces. */
const ESCAPED_SPACE_RX = /%20/g;

/** Matches parentheses (escaped so Markdown link targets never end early). */
const PARENTHESIS_RX = /[()]/g;

/** Matches `+` characters in URL path segments for space decoding. */
const PLUS_SIGN_RX = /\+/g;

/** Matches line breaks (with surrounding spaces) in multi-line builder inputs. */
export const LINE_BREAK_RX = /\s*\n\s*/g;

/** Matches hyphen, underscore, or dot characters stripped from brand icon slugs before lookup. */
export const BRAND_SLUG_CLEAN_RX = /[-_.]/g;

/** Matches `<slug>` and optional trailing `<text>` after an `icon:` prefix in a hint string. */
export const HINT_ICON_REST_RX = /^(?<slug>[^\s:]+)(?:[\s:]+(?<text>[\s\S]*))?$/;

/** Matches hyphen or underscore word separators in icon slugs. */
const SLUG_SEPARATOR_RX = /[-_]/g;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Look up an own (non-inherited) property of a lookup table by a user-supplied key.
 * Prevents keys like `'constructor'` or `'toString'` from resolving to `Object.prototype` members.
 * @param record   Lookup table to read from.
 * @param key      Untrusted lookup key.
 * @returns The own property value, or `undefined` when `key` is not an own property.
 */
export function getOwnValue<V>(record: Readonly<Record<string, V>>, key: string): V | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * Capitalize the first character of a word.
 * @param word   Lowercase word (e.g., `'nudge'`).
 * @returns Capitalized word (e.g., `'Nudge'`).
 */
export function capitalizeWord(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/**
 * Capitalize the first letter of every `-`/`_`-separated slug part and join the parts with `joiner`.
 * @param slug     Hyphen- or underscore-separated slug.
 * @param joiner   Optional separator inserted between capitalized parts.
 * @returns Joined capitalized string.
 */
export function capitalizeSlugParts(slug: string, joiner = ''): string {
  let result = '';
  for (const part of slug.split(SLUG_SEPARATOR_RX)) {
    if (part.length > 0) {
      result += `${result.length > 0 ? joiner : ''}${capitalizeWord(part)}`;
    }
  }
  return result;
}

/**
 * Encode text for a URL path segment the way `decodeSegment` decodes it (spaces become `+`).
 * @param text   Raw segment text.
 * @returns Encoded path segment.
 */
export function encodeSegment(text: string): string {
  return encodeURIComponent(text)
    .replace(ESCAPED_SPACE_RX, '+')
    .replace(READABLE_ESCAPE_RX, decodeURIComponent)
    .replace(PARENTHESIS_RX, (char) => (char === '(' ? '%28' : '%29'));
}

/**
 * Decode a raw (still percent-encoded) URL path segment exactly once, converting `+` into spaces.
 * A literal `+` must be sent as `%2B` and a literal `%` as `%25`.
 * @param raw   Raw path segment as it appears in `URL.pathname`.
 * @returns Decoded segment text (the `+`-decoded raw text when percent-decoding fails).
 */
export function decodeSegment(raw: string): string {
  const withSpaces = raw.replace(PLUS_SIGN_RX, ' ');
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    return withSpaces;
  }
}

/**
 * Decode the raw path parts after a leading route prefix (dropping one trailing empty segment, e.g., `/badge/a/b/` or `/badge/`).
 * @param pathParts   Result of `pathname.split('/')`.
 * @returns Decoded route segments after the prefix.
 */
export function decodeRouteSegments(pathParts: readonly string[]): string[] {
  const segments: string[] = [];
  for (let i = 2; i < pathParts.length; i += 1) {
    segments.push(decodeSegment(pathParts[i] ?? ''));
  }
  if (segments.at(-1) === '') {
    segments.pop();
  }
  return segments;
}

/**
 * Find a service preset of the service badge builder.
 * @param schema   Builder schema.
 * @param key      Service route key.
 * @returns Matching service option, or `undefined`.
 */
export function findService(
  schema: BuilderSchema,
  key: string | undefined
): BuilderServiceOption | undefined {
  for (const service of schema.services ?? []) {
    if (service.key === key) {
      return service;
    }
  }
  return undefined;
}

/**
 * Find the option with a value in an option list.
 * @param options   Option list.
 * @param value     Option value to look up.
 * @returns Matching option, or `undefined`.
 */
export function findOption<T extends BuilderOption>(
  options: readonly T[] | undefined,
  value: string
): T | undefined {
  for (const option of options ?? []) {
    if (option.value === value) {
      return option;
    }
  }
  return undefined;
}

/**
 * Resolve a lowercase token against an option list, matching either canonical `value` or `aliases`.
 * @param options   Option list.
 * @param token     Lowercase token to match.
 * @returns Canonical option `value`, or `undefined` when unmatched.
 */
export function resolveOptionValue(
  options: readonly BuilderOption[] | undefined,
  token: string
): string | undefined {
  for (const option of options ?? []) {
    if (option.value === token || option.aliases?.includes(token)) {
      return option.value;
    }
  }
  return undefined;
}

/**
 * Find a field of a schema by ID.
 * @param schema   Builder schema.
 * @param id       Field ID.
 * @returns Matching field, or `undefined`.
 */
export function findField(schema: BuilderSchema, id: string): BuilderField | undefined {
  for (const field of schema.fields) {
    if (field.id === id) {
      return field;
    }
  }
  return undefined;
}

/**
 * Read a trimmed state value (`''` when unset).
 * @param state   Builder state.
 * @param id      Field ID.
 * @returns Trimmed field value.
 */
export function readState(state: BuilderState, id: string): string {
  return (state[id] ?? '').trim();
}

/**
 * Check whether a normalized lowercase query token is an accepted truthy boolean flag.
 * @param token   Normalized lowercase query token.
 * @returns `true` when `token` matches an entry in `TRUTHY_FLAG_LIST`.
 */
export function isTruthyFlagToken(token: string): boolean {
  return (TRUTHY_FLAG_LIST as readonly string[]).includes(token);
}

/**
 * Normalize the typing lines input into the `;`-separated `/typing` DSL (line breaks become `;`).
 * @param value   Raw lines input value.
 * @returns Normalized `;`-separated lines string.
 */
export function normalizeTypingLinesInput(value: string): string {
  return value.trim().replace(LINE_BREAK_RX, ';');
}
