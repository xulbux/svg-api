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

// ------------------------------------ REGEX PATTERNS -----------------------------------

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
 * Capitalize the first letter of every `-`/`_`-separated slug part and join the parts with `joiner`.
 * @param slug     Hyphen- or underscore-separated slug.
 * @param joiner   Optional separator inserted between capitalized parts.
 * @returns Joined capitalized string.
 */
export function capitalizeSlugParts(slug: string, joiner = ''): string {
  let result = '';
  for (const part of slug.split(SLUG_SEPARATOR_RX)) {
    if (part.length > 0) {
      result += `${result.length > 0 ? joiner : ''}${part.charAt(0).toUpperCase()}${part.slice(1)}`;
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
 * Normalize the typing lines input into the `;`-separated `/typing` DSL (line breaks become `;`).
 * @param value   Raw lines input value.
 * @returns Normalized `;`-separated lines string.
 */
export function normalizeTypingLinesInput(value: string): string {
  return value.trim().replace(LINE_BREAK_RX, ';');
}
