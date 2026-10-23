/**
 * Route parameter parsing – Decodes path segments and resolves query parameters into typed render options.
 */

import { isThemeColorName } from '@/config/theme';
import { DEFAULT_QUOTE_LAYOUT } from '@/svg/quote';
import {
  MAX_BARS_POINTS,
  MAX_SPARKLINE_POINTS,
  MAX_STEPS_COUNT,
  MAX_STRIP_TICKS,
  MIN_SERIES_POINTS,
} from '@/svg/renderer';
import { getOwnValue, isIconMotionMode, isStripTickState } from '@/svg/shared';
import { DEFAULT_TYPING_CURSOR, DEFAULT_TYPING_ERASE, DEFAULT_TYPING_LAYOUT } from '@/svg/typing';
import type {
  AnimationMode,
  BadgeSpecialElement,
  BadgeSpecialKind,
  BadgeSpecialMap,
  BadgeVariant,
  DotState,
  IconMotionMode,
  QuoteLayout,
  SizePreset,
  StackAnimationMode,
  StackTileMotion,
  StripTickState,
  TypingAlign,
  TypingCursor,
  TypingEraseMode,
  TypingFont,
  TypingLayout,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Parsed automatic `?special=<kind>[:<modifier>]` request without a manual data payload. */
interface AutoSpecialRequest {
  /** `true` for `:pulse`, `false` for `:static`, `undefined` when no modifier is given. */
  hasPulse?: boolean;
  /** Requested inline data widget kind. */
  kind: BadgeSpecialKind;
}

/** Percentage of a `bar:` or `ring:` payload with its optional pulse modifier. */
interface ParsedPercentage {
  /** `true` for `:pulse`, `false` for `:static`, `undefined` when no modifier is given. */
  hasPulse?: boolean;
  /** Parsed percentage (unclamped; The renderer clamps it to its valid range). */
  value: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Valid visual hierarchy variant identifiers in tier order. */
export const VARIANT_TOKENS: readonly BadgeVariant[] = ['1', '2', '3'];

/** Set of valid variant identifiers (derived from `VARIANT_TOKENS`). */
const VALID_VARIANTS: ReadonlySet<string> = new Set<string>(VARIANT_TOKENS);

/** Inline data widget kinds accepted by `?special=<kind>[:<payload>]` in display order. */
export const SPECIAL_ELEMENT_KINDS: readonly BadgeSpecialKind[] = [
  'sparkline',
  'bars',
  'bar',
  'steps',
  'ring',
  'strip',
  'delta',
];

/** Set of valid inline data widget kinds (derived from `SPECIAL_ELEMENT_KINDS`). */
const VALID_SPECIAL_KINDS: ReadonlySet<string> = new Set<string>(SPECIAL_ELEMENT_KINDS);

/** Valid named size presets in ascending size order. */
export const SIZE_TOKENS: readonly SizePreset[] = ['sm', 'md', 'lg', 'xl'];

/** Set of valid named size presets (derived from `SIZE_TOKENS`). */
const VALID_SIZE_TOKENS: ReadonlySet<string> = new Set<string>(SIZE_TOKENS);

/** Valid per-icon motion tokens, sorted alphabetically. */
export { ICON_MOTION_TOKENS } from '@/svg/shared';

/** Shorthand aliases mapped to their canonical per-icon motion tokens. */
export const ICON_MOTION_ALIASES: Readonly<Record<string, IconMotionMode>> = {
  grow: 'breathe',
  scale: 'breathe',
  'spin-smooth': 'whirl',
  twirl: 'turn',
};

/** Valid per-tile stack motion tokens in display order. */
export const STACK_MOTION_TOKENS: readonly StackTileMotion[] = ['wave', 'float', 'pulse', 'none'];

/** Set of valid per-tile stack motion tokens (including `'default'`). */
const VALID_STACK_MOTIONS: ReadonlySet<string> = new Set<string>([
  'default',
  ...STACK_MOTION_TOKENS,
]);

/** Shorthand aliases mapped to their canonical per-tile stack motion tokens. */
export const STACK_MOTION_ALIASES: Readonly<Record<string, StackTileMotion>> = {
  auto: 'wave',
  bob: 'float',
  bounce: 'wave',
  breathe: 'pulse',
  grow: 'pulse',
  hover: 'float',
  ripple: 'wave',
  scale: 'pulse',
};

/** Maximum trimmed `?anim=` length in characters; Longer inputs cannot be valid and are rejected before splitting. */
const MAX_ANIMATION_INPUT_LENGTH = 64;

/** Truthy boolean query tokens accepted by boolean flag parameters in display order. */
export const TRUTHY_FLAG_LIST = ['true', '1', 'yes'] as const;

/** Falsy boolean query tokens accepted as explicit disable aliases in builder forms. */
export const FALSY_FLAG_LIST = ['0', 'false', 'no'] as const;

/** Normalized boolean flag values treated as truthy (derived from `TRUTHY_FLAG_LIST`). */
const TRUTHY_FLAG_TOKENS: ReadonlySet<string> = new Set<string>(TRUTHY_FLAG_LIST);

/** Canonical quote card layout tokens in display order. */
export const QUOTE_LAYOUT_TOKENS: readonly QuoteLayout[] = ['horizontal', 'vertical'];

/** Normalized `?layout=` / `?type=` values that select the vertical quote layout. */
export const VERTICAL_LAYOUT_TOKENS: ReadonlySet<string> = new Set(['center', 'v', 'vertical']);

/** Valid typing container layouts in display order. */
export const TYPING_LAYOUT_TOKENS: readonly TypingLayout[] = [
  'window',
  'prompt',
  'ide',
  'browser',
  'none',
];

/** Valid typing cursor styles in display order. */
export const TYPING_CURSOR_TOKENS: readonly TypingCursor[] = ['bar', 'block', 'underscore'];

/** Valid typing line erase modes in display order. */
export const TYPING_ERASE_TOKENS: readonly TypingEraseMode[] = ['backspace', 'select', 'fade'];

/** Valid typing font family tokens in display order. */
export const TYPING_FONT_TOKENS: readonly TypingFont[] = ['mono', 'sans'];

/** Valid typing horizontal alignment tokens in display order. */
export const TYPING_ALIGN_TOKENS: readonly TypingAlign[] = ['left', 'center'];

/** Alias map resolving `?layout=` / `?frame=` / `?type=` values to canonical `TypingLayout` tokens. */
export const TYPING_LAYOUT_MAP: Readonly<Record<string, TypingLayout>> = {
  address: 'browser',
  ai: 'prompt',
  app: 'window',
  assistant: 'prompt',
  bar: 'prompt',
  bare: 'none',
  browser: 'browser',
  bubble: 'prompt',
  chat: 'prompt',
  code: 'ide',
  command: 'prompt',
  editor: 'ide',
  ide: 'ide',
  mac: 'window',
  message: 'prompt',
  minimal: 'none',
  none: 'none',
  omnibox: 'browser',
  palette: 'prompt',
  plain: 'none',
  popup: 'prompt',
  prompt: 'prompt',
  raycast: 'prompt',
  search: 'browser',
  spotlight: 'prompt',
  tab: 'ide',
  terminal: 'window',
  transparent: 'none',
  url: 'browser',
  window: 'window',
  zsh: 'window',
};

/** Alias map resolving `?cursor=` values to canonical `TypingCursor` tokens. */
export const TYPING_CURSOR_MAP: Readonly<Record<string, TypingCursor>> = {
  bar: 'bar',
  beam: 'bar',
  block: 'block',
  box: 'block',
  line: 'bar',
  pipe: 'bar',
  under: 'underscore',
  underline: 'underscore',
  underscore: 'underscore',
};

/** Alias map resolving `?erase=` / `?delete=` values to canonical `TypingEraseMode` tokens. */
export const TYPING_ERASE_MAP: Readonly<Record<string, TypingEraseMode>> = {
  backspace: 'backspace',
  clear: 'select',
  del: 'backspace',
  delete: 'backspace',
  dissolve: 'fade',
  fade: 'fade',
  highlight: 'select',
  select: 'select',
  type: 'backspace',
};

/** Alias map resolving `?font=` values to canonical `TypingFont` tokens. */
export const TYPING_FONT_MAP: Readonly<Record<string, TypingFont>> = {
  code: 'mono',
  fira: 'mono',
  geist: 'sans',
  jetbrains: 'mono',
  mono: 'mono',
  monospace: 'mono',
  proportional: 'sans',
  sans: 'sans',
  ui: 'sans',
};

/** Alias map resolving `?align=` values to canonical `TypingAlign` tokens. */
export const TYPING_ALIGN_MAP: Readonly<Record<string, TypingAlign>> = {
  center: 'center',
  left: 'left',
  middle: 'center',
  start: 'left',
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

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
 * Parse a trimmed strip payload (e.g., `'9876425789'` or `'9,8,7,5,3,1'`) into `StripTickState[]`
 * in a single pass: Separated payloads keep only single-digit tokens; Compact payloads keep every valid character.
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
      const values = parseSeriesNumbers(payload, MIN_SERIES_POINTS, MAX_SPARKLINE_POINTS);
      return values ? { type: 'sparkline', values } : undefined;
    }
    case 'bars': {
      const values = parseSeriesNumbers(payload, MIN_SERIES_POINTS, MAX_BARS_POINTS);
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
      return payload.length > 0 && payload.toLowerCase() !== 'auto'
        ? { type: 'delta', value: payload }
        : undefined;
    }
    default: {
      return undefined;
    }
  }
}

/** Parse a bare or modifier-only `?special=` value requesting automatic upstream widget data. */
function parseAutoSpecialRequest(trimmed: string): AutoSpecialRequest | undefined {
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex === -1) {
    const kind = trimmed.toLowerCase();
    return VALID_SPECIAL_KINDS.has(kind) ? { kind: kind as BadgeSpecialKind } : undefined;
  }
  if (colonIndex === 0) {
    return undefined;
  }
  const kind = trimmed.slice(0, colonIndex).trim().toLowerCase();
  if (!VALID_SPECIAL_KINDS.has(kind)) {
    return undefined;
  }
  const rest = trimmed
    .slice(colonIndex + 1)
    .trim()
    .toLowerCase();
  if (rest === '' || rest === 'auto') {
    return { kind: kind as BadgeSpecialKind };
  }
  if (kind === 'bar' || kind === 'ring') {
    if (rest === 'pulse' || rest === ':pulse' || rest === 'auto:pulse') {
      return { hasPulse: true, kind };
    }
    if (rest === 'static' || rest === ':static' || rest === 'auto:static') {
      return { hasPulse: false, kind };
    }
  }
  return undefined;
}

// -------------------------------------- PUBLIC API -------------------------------------

export { decodeSegment } from '@/site/shared';

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
 * Resolve `?special=` query overrides, supporting manual `<kind>:<payload>` values, `'none'` to hide a
 * preset widget, and bare `<kind>` (or `<kind>:static` / `<kind>:pulse`) to select automatic upstream
 * widget data from a service preset.
 * @param specialRaw       Raw `?special=` query parameter value.
 * @param defaultSpecial   Default preset widget rendered when `?special=` is omitted.
 * @param autoSpecials     Candidate automatic widgets derived from upstream service data.
 * @returns Resolved `BadgeSpecialElement`, or `undefined` when none is active.
 */
export function resolveSpecialParam(
  specialRaw: string | null | undefined,
  defaultSpecial?: BadgeSpecialElement,
  autoSpecials?: BadgeSpecialMap
): BadgeSpecialElement | undefined {
  const trimmed = (specialRaw ?? '').trim();
  if (!trimmed) {
    return defaultSpecial;
  }
  if (trimmed.toLowerCase() === 'none') {
    return undefined;
  }
  const manual = parseSpecialParam(trimmed);
  if (manual) {
    return manual;
  }
  const autoRequest = parseAutoSpecialRequest(trimmed);
  if (!autoRequest) {
    return defaultSpecial;
  }
  const candidate =
    (autoSpecials ? getOwnValue(autoSpecials, autoRequest.kind) : undefined) ??
    (defaultSpecial?.type === autoRequest.kind ? defaultSpecial : undefined);
  if (!candidate) {
    return defaultSpecial;
  }
  if (
    autoRequest.hasPulse !== undefined &&
    (candidate.type === 'bar' || candidate.type === 'ring')
  ) {
    return { ...candidate, hasPulse: autoRequest.hasPulse };
  }
  return candidate;
}

/**
 * Resolve the requested `?variant=` query parameter to a valid `BadgeVariant`.
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
 * Resolve the requested `?anim=` query parameter to a valid `AnimationMode` (single motion, per-icon pair, `sheen`, or combined `sheen,…`).
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
  const motionTokens: string[] = [];
  for (const token of normalized.split(LIST_SEPARATOR_RX)) {
    if (token.length > 0) {
      if (token === 'sheen') {
        if (hasSheen) {
          return fallback;
        }
        hasSheen = true;
      } else {
        const motion = getOwnValue(ICON_MOTION_ALIASES, token) ?? token;
        if (!isIconMotionMode(motion) || motionTokens.length >= 2) {
          return fallback;
        }
        motionTokens.push(motion);
      }
    }
  }

  if (motionTokens.length === 0) {
    return hasSheen ? 'sheen' : fallback;
  }
  if (
    hasSheen &&
    motionTokens.length === 1 &&
    (motionTokens[0] === 'none' || motionTokens[0] === 'default')
  ) {
    return 'sheen';
  }

  const joined = motionTokens.join(',');
  return (hasSheen ? `sheen,${joined}` : joined) as AnimationMode;
}

/**
 * Resolve the requested `?anim=` query parameter for stack grids to a valid `StackAnimationMode`.
 * @param input      Raw `?anim=` query parameter value.
 * @param fallback   Default stack animation mode when `input` is omitted or invalid.
 * @returns Validated `StackAnimationMode`.
 */
export function resolveStackAnimationMode(
  input: string | null | undefined,
  fallback: StackAnimationMode = 'default'
): StackAnimationMode {
  const normalized = normalizeQueryToken(input);
  if (normalized.length > MAX_ANIMATION_INPUT_LENGTH) {
    return fallback;
  }

  let hasSheen = false;
  let motionToken: StackTileMotion | undefined = undefined;
  for (const token of normalized.split(LIST_SEPARATOR_RX)) {
    if (token.length > 0) {
      if (token === 'sheen') {
        if (hasSheen) {
          return fallback;
        }
        hasSheen = true;
      } else {
        const motion = getOwnValue(STACK_MOTION_ALIASES, token) ?? token;
        if (!VALID_STACK_MOTIONS.has(motion) || motionToken !== undefined) {
          return fallback;
        }
        motionToken = motion as StackTileMotion;
      }
    }
  }

  if (motionToken === undefined) {
    return hasSheen ? 'sheen' : fallback;
  }
  if (hasSheen && (motionToken === 'none' || motionToken === 'default')) {
    return 'sheen';
  }
  return (hasSheen ? `sheen,${motionToken}` : motionToken) as StackAnimationMode;
}

/**
 * Resolve a raw `?dot=` query parameter to a valid theme color name (`'none'` removes a preset dot).
 * @param input      Raw `?dot=` query parameter value.
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
  return isThemeColorName(clean) ? clean : fallback;
}

/**
 * Resolve a named `SizePreset` token or a custom numeric size from `?size=`.
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
  // Drop trailing holes, so the last valid value keeps applying to every remaining group:
  while (values.length > 0 && values.at(-1) === undefined) {
    values.pop();
  }
  return values.length > 0 ? values : undefined;
}

/**
 * Resolve the quote card layout from `?layout=`, `?type=`, or `?center=`.
 * Empty aliases fall through (`?layout=&type=vertical`); `?center=` is only consulted when both `?layout=` and `?type=` are empty.
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
  return isVertical ? 'vertical' : DEFAULT_QUOTE_LAYOUT;
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

/**
 * Resolve the typing container layout from `?layout=`, `?frame=`, or `?type=`.
 * @param layoutParam   Raw `?layout=` query parameter value.
 * @param frameParam    Raw `?frame=` alias query parameter value.
 * @param typeParam     Raw `?type=` alias query parameter value.
 * @returns Resolved `TypingLayout`.
 */
export function resolveTypingLayout(
  layoutParam: string | null | undefined,
  frameParam?: string | null,
  typeParam?: string | null
): TypingLayout {
  const candidate =
    normalizeQueryToken(layoutParam) ||
    normalizeQueryToken(frameParam) ||
    normalizeQueryToken(typeParam);
  return getOwnValue(TYPING_LAYOUT_MAP, candidate) ?? DEFAULT_TYPING_LAYOUT;
}

/**
 * Resolve the typing cursor style from `?cursor=`.
 * @param cursorParam   Raw `?cursor=` query parameter value.
 * @returns Resolved `TypingCursor`.
 */
export function resolveTypingCursor(cursorParam: string | null | undefined): TypingCursor {
  return getOwnValue(TYPING_CURSOR_MAP, normalizeQueryToken(cursorParam)) ?? DEFAULT_TYPING_CURSOR;
}

/**
 * Resolve the typing line erase mode from `?erase=` or `?delete=`.
 * @param eraseParam    Raw `?erase=` query parameter value.
 * @param deleteParam   Raw `?delete=` alias query parameter value.
 * @returns Resolved `TypingEraseMode`.
 */
export function resolveTypingEraseMode(
  eraseParam: string | null | undefined,
  deleteParam?: string | null
): TypingEraseMode {
  const candidate = normalizeQueryToken(eraseParam) || normalizeQueryToken(deleteParam);
  return getOwnValue(TYPING_ERASE_MAP, candidate) ?? DEFAULT_TYPING_ERASE;
}

/**
 * Resolve the typing font family from `?font=`.
 * Returns `undefined` when omitted or unrecognized so `renderTyping` can apply its layout-aware default.
 * @param fontParam   Raw `?font=` query parameter value.
 * @returns Resolved `TypingFont`, or `undefined`.
 */
export function resolveTypingFont(fontParam: string | null | undefined): TypingFont | undefined {
  return getOwnValue(TYPING_FONT_MAP, normalizeQueryToken(fontParam));
}

/**
 * Resolve the typing text alignment from `?align=` or `?center=`.
 * Returns `undefined` when neither is specified so `renderTyping` can apply its layout-aware default.
 * @param alignParam    Raw `?align=` query parameter value.
 * @param centerParam   Raw `?center=` boolean query parameter value.
 * @returns Resolved `TypingAlign`, or `undefined`.
 */
export function resolveTypingAlign(
  alignParam: string | null | undefined,
  centerParam?: string | null
): TypingAlign | undefined {
  const mappedAlign = getOwnValue(TYPING_ALIGN_MAP, normalizeQueryToken(alignParam));
  if (mappedAlign) {
    return mappedAlign;
  }
  if (TRUTHY_FLAG_TOKENS.has(normalizeQueryToken(centerParam))) {
    return 'center';
  }
  return undefined;
}

/**
 * Check whether an optional boolean query parameter is set to a truthy flag token.
 * @param raw   Raw query parameter value.
 * @returns `true` when `raw` is a truthy flag token.
 */
export function isTruthyFlagParam(raw: string | null | undefined): boolean {
  return TRUTHY_FLAG_TOKENS.has(normalizeQueryToken(raw));
}
