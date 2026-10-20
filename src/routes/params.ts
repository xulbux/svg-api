/**
 * Route parameter parsing – Decodes path segments and resolves the readable query DSL (`?variant=`, `?anim=`, `?dot=`, `?special=`, `?size=`, ...) into typed render options.
 */

import { STATUS_PRESET_MAP } from '@/config/services';
import { isThemeColorName } from '@/config/theme';
import {
  MAX_BARS_POINTS,
  MAX_SPARKLINE_POINTS,
  MAX_STEPS_COUNT,
  MAX_STRIP_TICKS,
} from '@/svg/renderer';
import { getOwnValue, isIconMotionMode, isStripTickState } from '@/svg/shared';
import type {
  AnimationMode,
  BadgeSpecialElement,
  BadgeVariant,
  DotState,
  QuoteLayout,
  SizePreset,
  StripTickState,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Percentage of a `bar:` or `ring:` payload with its optional pulse modifier. */
interface ParsedPercentage {
  /** `true` for `:pulse`, `false` for `:static`, `undefined` when no modifier is given. */
  hasPulse?: boolean;
  /** Parsed percentage (unclamped; The renderer clamps it to `0`–`100`). */
  value: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Valid badge, button, stack, and quote variant identifiers in hierarchy order (also listed by the docs and the builder). */
export const VARIANT_TOKENS: readonly BadgeVariant[] = ['1', '2', '3'];

/** Set of valid variant identifiers (derived from `VARIANT_TOKENS`). */
const VALID_VARIANTS: ReadonlySet<string> = new Set<string>(VARIANT_TOKENS);

/** Inline data widget kinds accepted by `?special=<kind>:<payload>` in display order (also listed by the builder). */
export const SPECIAL_ELEMENT_KINDS: readonly BadgeSpecialElement['type'][] = [
  'sparkline',
  'bars',
  'bar',
  'steps',
  'ring',
  'strip',
  'delta',
];

/** Valid named size presets for buttons and quote cards in ascending size order (also listed by the docs and the builder). */
export const SIZE_TOKENS: readonly SizePreset[] = ['sm', 'md', 'lg', 'xl'];

/** Set of valid named size presets (derived from `SIZE_TOKENS`). */
const VALID_SIZE_TOKENS: ReadonlySet<string> = new Set<string>(SIZE_TOKENS);

/** Valid per-icon motion tokens for `?anim=`, sorted alphabetically (also listed by the docs; Defined once in `src/svg/shared.ts`). */
export { ICON_MOTION_TOKENS } from '@/svg/shared';

/** Maximum number of comma/whitespace-separated `?anim=` tokens (`sheen,<left>,<right>`). */
const MAX_ANIMATION_TOKENS = 3;

/** Maximum trimmed `?anim=` length in characters; Longer inputs cannot be valid and are rejected before splitting. */
const MAX_ANIMATION_INPUT_LENGTH = 64;

/** Normalized `?center=` values that switch quote cards to the vertical layout. */
const TRUTHY_FLAG_TOKENS: ReadonlySet<string> = new Set(['1', 'true', 'yes']);

/** Normalized `?layout=` / `?type=` values that select the vertical quote layout. */
const VERTICAL_LAYOUT_TOKENS: ReadonlySet<string> = new Set(['center', 'v', 'vertical']);

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches `+` characters in URL path segments for space decoding. */
const PLUS_SIGN_RX = /\+/g;

/** Matches comma or whitespace separators in list-style payloads. */
const LIST_SEPARATOR_RX = /[,\s]+/;

/** Matches a single comma or whitespace separator character. */
const SEPARATOR_CHAR_RX = /[,\s]/;

/** Matches a trailing `%` sign on percentage strings. */
const TRAILING_PERCENT_RX = /%$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Trim and lower-case a raw query parameter value (`''` when missing). */
function normalizeQueryToken(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

/** Check whether an optional `?anim=` token is a valid per-icon motion token. */
function isIconMotionToken(token: string | undefined): token is string {
  return token !== undefined && isIconMotionMode(token);
}

/** Parse a trimmed, comma-separated list of numbers (at least `minPoints`, at most `maxPoints`). */
function parseSeriesNumbers(
  rawPayload: string,
  minPoints: number,
  maxPoints: number
): number[] | undefined {
  const values: number[] = [];
  for (const part of rawPayload.split(LIST_SEPARATOR_RX)) {
    if (part.length > 0) {
      const value = Number(part);
      if (Number.isFinite(value)) {
        values.push(value);
        if (values.length >= maxPoints) {
          break;
        }
      }
    }
  }
  return values.length >= minPoints ? values : undefined;
}

/** Parse a `<done>/<total>` step progress payload (e.g., `'4/5'`, `'3/8'`). */
function parseStepsPayload(rawPayload: string): { done: number; total: number } | undefined {
  const slashIndex = rawPayload.indexOf('/');
  if (slashIndex <= 0) {
    return undefined;
  }
  const doneRaw = rawPayload.slice(0, slashIndex).trim();
  const totalRaw = rawPayload.slice(slashIndex + 1).trim();
  if (!doneRaw || !totalRaw) {
    return undefined;
  }
  const parsedDone = Number(doneRaw);
  const parsedTotal = Number(totalRaw);
  if (!Number.isFinite(parsedDone) || !Number.isFinite(parsedTotal)) {
    return undefined;
  }
  const roundedTotal = Math.round(parsedTotal);
  if (roundedTotal < 1) {
    return undefined;
  }
  const total = Math.min(MAX_STEPS_COUNT, roundedTotal);
  const done = Math.min(total, Math.max(0, Math.round(parsedDone)));
  return { done, total };
}

/**
 * Parse a trimmed 10-stage strip payload (`'0'`–`'9'`, e.g., `'9876425789'` or `'9,8,7,5,3,1'`) into
 * `StripTickState[]` in a single pass: Separated payloads keep only single-digit tokens; Compact
 * payloads keep every digit character.
 */
function parseStripStates(rawPayload: string): StripTickState[] | undefined {
  const isSeparated = LIST_SEPARATOR_RX.test(rawPayload);
  const states: StripTickState[] = [];
  let pendingState: StripTickState | undefined = undefined;
  let tokenLength = 0;
  for (const char of rawPayload) {
    if (states.length >= MAX_STRIP_TICKS) {
      break;
    }
    if (!isSeparated) {
      if (isStripTickState(char)) {
        states.push(char);
      }
    } else if (SEPARATOR_CHAR_RX.test(char)) {
      if (tokenLength === 1 && pendingState !== undefined) {
        states.push(pendingState);
      }
      tokenLength = 0;
      pendingState = undefined;
    } else {
      tokenLength += 1;
      pendingState = isStripTickState(char) ? char : undefined;
    }
  }
  if (tokenLength === 1 && pendingState !== undefined && states.length < MAX_STRIP_TICKS) {
    states.push(pendingState);
  }
  return states.length > 0 ? states : undefined;
}

/** Parse a percentage payload with an optional `:pulse` / `:static` modifier (e.g., `'99.4'`, `'78:pulse'`, `'90:static'`). */
function parsePercentageAndPulse(rawPayload: string): ParsedPercentage | undefined {
  const colonIndex = rawPayload.indexOf(':');
  const numberPart = colonIndex === -1 ? rawPayload : rawPayload.slice(0, colonIndex);
  const modifierPart =
    colonIndex === -1
      ? ''
      : rawPayload
          .slice(colonIndex + 1)
          .trim()
          .toLowerCase();
  const cleaned = numberPart.trim().replace(TRAILING_PERCENT_RX, '');
  const value = cleaned ? Number(cleaned) : Number.NaN;
  if (!Number.isFinite(value)) {
    return undefined;
  }
  let hasPulse: boolean | undefined = undefined;
  if (modifierPart === 'pulse') {
    hasPulse = true;
  } else if (modifierPart === 'static') {
    hasPulse = false;
  }
  return { hasPulse, value };
}

/** Parse a `<kind>:<payload>` pair into a `BadgeSpecialElement`. */
function parseSpecialKindAndPayload(
  kind: string,
  payload: string
): BadgeSpecialElement | undefined {
  switch (kind) {
    case 'sparkline': {
      const values = parseSeriesNumbers(payload, 2, MAX_SPARKLINE_POINTS);
      return values ? { type: 'sparkline', values } : undefined;
    }
    case 'bars': {
      const values = parseSeriesNumbers(payload, 2, MAX_BARS_POINTS);
      return values ? { type: 'bars', values } : undefined;
    }
    case 'bar':
    case 'ring': {
      const parsed = parsePercentageAndPulse(payload);
      return parsed ? { hasPulse: parsed.hasPulse, type: kind, value: parsed.value } : undefined;
    }
    case 'steps': {
      const parsed = parseStepsPayload(payload);
      return parsed ? { done: parsed.done, total: parsed.total, type: 'steps' } : undefined;
    }
    case 'strip': {
      const states = parseStripStates(payload);
      return states ? { states, type: 'strip' } : undefined;
    }
    case 'delta': {
      return payload.length > 0 ? { type: 'delta', value: payload } : undefined;
    }
    default: {
      return undefined;
    }
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

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
 * Parse an optional finite number query parameter (e.g., `?size=24`, `?stroke=2.25`).
 * @param raw   Raw query parameter value.
 * @returns Parsed number, or `undefined` when missing or not a finite number.
 */
export function parseOptionalNumber(raw: string | null | undefined): number | undefined {
  const cleaned = (raw ?? '').trim();
  if (!cleaned) {
    return undefined;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Parse the unified `?special=<type>:<payload>` query parameter into a structured `BadgeSpecialElement`.
 * @param specialRaw   Raw `?special=` query parameter (e.g., `'bar:82'`, `'strip:9876425789'`).
 * @returns Parsed `BadgeSpecialElement`, or `undefined` if none is specified or valid.
 */
export function parseSpecialParam(
  specialRaw: string | null | undefined
): BadgeSpecialElement | undefined {
  const trimmed = (specialRaw ?? '').trim();
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex <= 0) {
    return undefined;
  }
  const kind = trimmed.slice(0, colonIndex).trim().toLowerCase();
  const payload = trimmed.slice(colonIndex + 1).trim();
  return parseSpecialKindAndPayload(kind, payload);
}

/**
 * Resolve the requested `?variant=` query parameter to a valid variant (`'1'`, `'2'`, `'3'`).
 * Shared by badges, buttons, stacks, and quote cards (all use `BadgeVariant`).
 * @param input      Raw `?variant=` query parameter value.
 * @param fallback   Default variant when `input` is omitted or invalid.
 * @returns Validated variant.
 */
export function resolveVariant(
  input: string | null | undefined,
  fallback: BadgeVariant = '1'
): BadgeVariant {
  const candidate = (input ?? '').trim();
  return VALID_VARIANTS.has(candidate) ? (candidate as BadgeVariant) : fallback;
}

/**
 * Resolve the requested `?anim=` query parameter to a valid `AnimationMode`.
 * Supports single modes (`sheen`, `auto`, `spin`, `shake`, `nudge`, `pulse`, `float`, `none`),
 * per-icon pairs (`none,nudge`, `shake,nudge`), and combined sheen (`sheen,auto`, `sheen,none,nudge`).
 * @param input      Raw `?anim=` query parameter value.
 * @param fallback   Default animation mode when `input` is omitted or invalid.
 * @returns Validated `AnimationMode`.
 */
export function resolveAnimationMode(
  input: string | null | undefined,
  fallback: AnimationMode = 'default'
): AnimationMode {
  const normalized = normalizeQueryToken(input);
  if (normalized.length > MAX_ANIMATION_INPUT_LENGTH) {
    return fallback;
  }
  let hasSheen = false;
  let tokenCount = 0;
  const motionTokens: string[] = [];
  for (const token of normalized.split(LIST_SEPARATOR_RX)) {
    if (token.length > 0) {
      tokenCount += 1;
      if (tokenCount > MAX_ANIMATION_TOKENS) {
        return fallback;
      }
      if (token === 'sheen') {
        if (hasSheen) {
          return fallback;
        }
        hasSheen = true;
      } else {
        motionTokens.push(token);
      }
    }
  }

  if (motionTokens.length === 0) {
    return hasSheen ? 'sheen' : fallback;
  }
  const [firstMotion, secondMotion] = motionTokens;
  if (motionTokens.length === 1 && isIconMotionToken(firstMotion)) {
    if (hasSheen && (firstMotion === 'none' || firstMotion === 'default')) {
      return 'sheen';
    }
    return (hasSheen ? `sheen,${firstMotion}` : firstMotion) as AnimationMode;
  }
  if (
    motionTokens.length === 2 &&
    isIconMotionToken(firstMotion) &&
    isIconMotionToken(secondMotion)
  ) {
    const pair = `${firstMotion},${secondMotion}`;
    return (hasSheen ? `sheen,${pair}` : pair) as AnimationMode;
  }
  return fallback;
}

/**
 * Resolve a raw `?dot=` query parameter (color name or status preset name like `'online'`, `'maintenance'`).
 * @param input      Raw `?dot=` query parameter value (`'none'` removes a preset dot).
 * @param fallback   Default dot state when `input` is omitted or unknown.
 * @returns Resolved `DotState`, or `undefined` for no dot.
 */
export function resolveDotState(
  input: string | null | undefined,
  fallback?: DotState
): DotState | undefined {
  const clean = normalizeQueryToken(input);
  if (!clean) {
    return fallback;
  }
  if (clean === 'none') {
    return undefined;
  }
  const preset = getOwnValue(STATUS_PRESET_MAP, clean);
  if (preset) {
    return preset.dot;
  }
  return isThemeColorName(clean) ? clean : fallback;
}

/**
 * Resolve a named size preset (`'sm'`, `'md'`, `'lg'`, `'xl'`) or a custom numeric size from `?size=`.
 * @param raw   Raw `?size=` query parameter value.
 * @returns Size token, custom number, or `undefined` when missing or invalid.
 */
export function resolveSizeToken(raw: string | null | undefined): SizePreset | number | undefined {
  const clean = normalizeQueryToken(raw);
  if (VALID_SIZE_TOKENS.has(clean)) {
    return clean as SizePreset;
  }
  return parseOptionalNumber(clean);
}

/**
 * Parse a single number or comma-separated list of numbers for `?perline=` (e.g., `8` or `8,6,6,4,3,3`).
 * Entries keep their group positions: Invalid entries (`0`, `x`) become `undefined` holes, so that
 * group falls back to the default instead of shifting later values onto the wrong groups.
 * @param raw   Raw `?perline=` query parameter value.
 * @returns Positional list of positive integers and holes (trailing holes dropped), or `undefined` when no entry is valid.
 */
export function parsePerLineList(
  raw: string | null | undefined
): (number | undefined)[] | undefined {
  const values: (number | undefined)[] = [];
  for (const part of (raw ?? '').trim().split(LIST_SEPARATOR_RX)) {
    const parsed = parseOptionalNumber(part);
    values.push(parsed !== undefined && parsed >= 1 ? Math.round(parsed) : undefined);
  }
  // Drop trailing holes, so the last valid value keeps applying to every remaining group.
  while (values.length > 0 && values.at(-1) === undefined) {
    values.pop();
  }
  return values.length > 0 ? values : undefined;
}

/**
 * Resolve the quote card layout (`'horizontal'` or `'vertical'`) from `?layout=`, `?type=`, or `?center=`.
 * Empty aliases fall through (`?layout=&type=vertical`); `?center=` (`true`, `1`, `yes`) is only
 * consulted when both `?layout=` and `?type=` are empty.
 * @param layoutParam   Raw `?layout=` query parameter value.
 * @param typeParam     Raw `?type=` alias query parameter value.
 * @param centerParam   Raw `?center=` boolean query parameter value.
 * @returns Resolved quote layout.
 */
export function resolveQuoteLayout(
  layoutParam: string | null | undefined,
  typeParam: string | null | undefined,
  centerParam: string | null | undefined
): QuoteLayout {
  const candidate = normalizeQueryToken(layoutParam) || normalizeQueryToken(typeParam);
  const isVertical = candidate
    ? VERTICAL_LAYOUT_TOKENS.has(candidate)
    : TRUTHY_FLAG_TOKENS.has(normalizeQueryToken(centerParam));
  return isVertical ? 'vertical' : 'horizontal';
}

/**
 * Resolve `?icon=` query overrides, preserving `defaultIcon` on the left when the `,right` shorthand is used.
 * @param iconParam     Raw `?icon=` query parameter value (empty keeps `defaultIcon`; `none` removes it).
 * @param defaultIcon   Preset icon slug (e.g., from a service preset).
 * @returns Effective icon specification.
 */
export function resolveIconQueryParam(
  iconParam: string | null | undefined,
  defaultIcon?: string
): string | undefined {
  const trimmed = (iconParam ?? '').trim();
  if (!trimmed) {
    return defaultIcon;
  }
  return trimmed.startsWith(',') && defaultIcon ? `${defaultIcon}${trimmed}` : trimmed;
}
