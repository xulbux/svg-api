/**
 * Route parameter parsing – Decodes path segments and resolves the readable query DSL (`?variant=`, `?anim=`, `?dot=`, `?special=`, `?size=`, ...) into typed render options.
 */

import { STATUS_PRESET_MAP } from '@/config/services';
import { DOT_COLORS } from '@/config/theme';
import { MAX_SPARKLINE_POINTS, MAX_STRIP_TICKS } from '@/svg/renderer';
import { getOwnValue, hasOwnKey } from '@/svg/shared';
import type {
  AnimationMode,
  BadgeSpecialElement,
  BadgeVariant,
  DotState,
  IconMotionMode,
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

/** Set of valid badge, button, stack, and quote variant identifiers (`'1'`, `'2'`, `'3'`). */
const VALID_VARIANTS: ReadonlySet<string> = new Set<BadgeVariant>(['1', '2', '3']);

/** Set of valid named size presets for buttons and quote cards. */
const VALID_SIZE_TOKENS: ReadonlySet<string> = new Set(['lg', 'md', 'sm', 'xl']);

/** Valid per-icon motion tokens for `?anim=`, sorted alphabetically (also listed by the docs). */
export const ICON_MOTION_TOKENS: readonly IconMotionMode[] = [
  'auto',
  'default',
  'float',
  'none',
  'nudge',
  'pulse',
  'shake',
  'spin',
];

/** Set of valid per-icon motion tokens for `?anim=` (derived from `ICON_MOTION_TOKENS`). */
const VALID_ICON_MOTIONS: ReadonlySet<string> = new Set<string>(ICON_MOTION_TOKENS);

/** Set of valid 10-stage (`'0'`–`'9'`) strip tick characters. */
const VALID_STRIP_STAGES: ReadonlySet<string> = new Set<StripTickState>([
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
]);

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches `+` characters in URL path segments for space decoding. */
const PLUS_SIGN_RX = /\+/g;

/** Matches comma or whitespace separators in list-style payloads. */
const LIST_SEPARATOR_RX = /[,\s]+/;

/** Matches a trailing `%` sign on percentage strings. */
const TRAILING_PERCENT_RX = /%$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Parse a comma-separated list of numbers for a sparkline (at least 2, at most `MAX_SPARKLINE_POINTS`). */
function parseSparklineNumbers(rawPayload: string): number[] | undefined {
  const values: number[] = [];
  for (const part of rawPayload.trim().split(LIST_SEPARATOR_RX)) {
    if (part.length > 0 && values.length < MAX_SPARKLINE_POINTS) {
      const num = Number(part);
      if (Number.isFinite(num)) {
        values.push(num);
      }
    }
  }
  return values.length >= 2 ? values : undefined;
}

/** Parse a 10-stage strip payload (`'0'`–`'9'`, e.g., `'9876425789'` or `'9,8,7,5,3,1'`) into `StripTickState[]`. */
function parseStripStates(rawPayload: string): StripTickState[] | undefined {
  const trimmed = rawPayload.trim();
  if (!trimmed) {
    return undefined;
  }
  const tokens = LIST_SEPARATOR_RX.test(trimmed) ? trimmed.split(LIST_SEPARATOR_RX) : [...trimmed];
  const states: StripTickState[] = [];
  for (const token of tokens) {
    const clean = token.trim();
    if (VALID_STRIP_STAGES.has(clean) && states.length < MAX_STRIP_TICKS) {
      states.push(clean as StripTickState);
    }
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
  const num = cleaned ? Number(cleaned) : Number.NaN;
  if (!Number.isFinite(num)) {
    return undefined;
  }
  let hasPulse: boolean | undefined = undefined;
  if (modifierPart === 'pulse') {
    hasPulse = true;
  } else if (modifierPart === 'static') {
    hasPulse = false;
  }
  return { hasPulse, value: num };
}

/** Parse a `<kind>:<payload>` pair into a `BadgeSpecialElement`. */
function parseSpecialKindAndPayload(
  kind: string,
  payload: string
): BadgeSpecialElement | undefined {
  switch (kind) {
    case 'sparkline': {
      const values = parseSparklineNumbers(payload);
      return values ? { type: 'sparkline', values } : undefined;
    }
    case 'bar':
    case 'ring': {
      const parsed = parsePercentageAndPulse(payload);
      return parsed ? { hasPulse: parsed.hasPulse, type: kind, value: parsed.value } : undefined;
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
  let hasSheen = false;
  const motionTokens: string[] = [];
  for (const token of (input ?? '').trim().toLowerCase().split(LIST_SEPARATOR_RX)) {
    if (token === 'sheen') {
      hasSheen = true;
    } else if (token.length > 0) {
      motionTokens.push(token);
    }
  }

  if (motionTokens.length === 0) {
    return hasSheen ? 'sheen' : fallback;
  }
  const [firstMotion, secondMotion] = motionTokens;
  if (motionTokens.length === 1 && VALID_ICON_MOTIONS.has(firstMotion)) {
    if (hasSheen && (firstMotion === 'none' || firstMotion === 'default')) {
      return 'sheen';
    }
    return (hasSheen ? `sheen,${firstMotion}` : firstMotion) as AnimationMode;
  }
  if (
    motionTokens.length === 2 &&
    VALID_ICON_MOTIONS.has(firstMotion) &&
    VALID_ICON_MOTIONS.has(secondMotion)
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
  const clean = (input ?? '').trim().toLowerCase();
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
  return hasOwnKey(DOT_COLORS, clean) ? clean : fallback;
}

/**
 * Resolve a named size preset (`'sm'`, `'md'`, `'lg'`, `'xl'`) or a custom numeric size from `?size=`.
 * @param raw   Raw `?size=` query parameter value.
 * @returns Size token, custom number, or `undefined` when missing or invalid.
 */
export function resolveSizeToken(raw: string | null | undefined): SizePreset | number | undefined {
  const clean = (raw ?? '').trim().toLowerCase();
  if (VALID_SIZE_TOKENS.has(clean)) {
    return clean as SizePreset;
  }
  return parseOptionalNumber(clean);
}

/**
 * Parse a single number or comma-separated list of numbers for `?perline=` (e.g., `8` or `8,6,6,4,3,3`).
 * @param raw   Raw `?perline=` query parameter value.
 * @returns Positive integer list, or `undefined` when missing or invalid.
 */
export function parsePerLineList(raw: string | null | undefined): number[] | undefined {
  const values: number[] = [];
  for (const part of (raw ?? '').split(LIST_SEPARATOR_RX)) {
    const parsed = parseOptionalNumber(part);
    if (parsed !== undefined && parsed >= 1) {
      values.push(Math.round(parsed));
    }
  }
  return values.length > 0 ? values : undefined;
}

/**
 * Resolve the quote card layout (`'horizontal'` or `'vertical'`) from `?layout=`, `?type=`, or `?center=`.
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
  const candidate = (layoutParam ?? typeParam ?? '').trim().toLowerCase();
  const isVertical =
    candidate === 'vertical' ||
    candidate === 'center' ||
    candidate === 'v' ||
    centerParam === 'true' ||
    centerParam === '1';
  return isVertical ? 'vertical' : 'horizontal';
}

/**
 * Resolve `?icon=` query overrides, preserving `defaultIcon` on the left when the `,right` shorthand is used.
 * @param iconParam     Raw `?icon=` query parameter value.
 * @param defaultIcon   Preset icon slug (e.g., from a service preset).
 * @returns Effective icon specification.
 */
export function resolveIconQueryParam(
  iconParam: string | null | undefined,
  defaultIcon?: string
): string | undefined {
  if (iconParam === undefined || iconParam === null) {
    return defaultIcon;
  }
  const trimmed = iconParam.trim();
  return trimmed.startsWith(',') && defaultIcon ? `${defaultIcon}${trimmed}` : trimmed;
}
