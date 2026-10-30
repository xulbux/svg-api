/**
 * Composite Builder Parameter Codecs
 *
 * Composes and splits multi-part query DSL values (`?icon=`, `?hint=`, `?anim=`, `?special=`, and `?size=`).
 */

import {
  findOption,
  HINT_ICON_REST_RX,
  LIST_SEPARATOR_RX,
  MAX_ANIMATION_INPUT_LENGTH,
  MAX_TYPING_LINES,
  resolveOptionValue,
} from '@/site/shared/encoding';
import type {
  AnimSplitParts,
  BuilderOption,
  HintSplitParts,
  IconSelectDisplay,
  SizeSplitParts,
  SpecialSplitParts,
} from '@/types';

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a trailing percent sign on numeric `bar:` / `ring:` widget payloads. */
const TRAILING_PERCENT_RX = /%$/;

/** Matches `;` or newline separators when splitting a serialized or pasted typing lines list. */
export const TYPING_LINE_SPLIT_RX = /[\r\n;]+/;

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve a single motion token against optional `anim` field options (case-insensitive, mapping aliases). */
function resolveAnimOptionToken(
  token: string,
  options: readonly BuilderOption[] | undefined
): string | undefined {
  if (token === 'default') {
    return 'default';
  }
  return options ? resolveOptionValue(options, token) : token;
}

/** Check whether `rawPayload` contains at least `minPoints` finite numbers separated by commas or whitespace. */
function hasMinSeriesPoints(rawPayload: string, minPoints: number): boolean {
  let count = 0;
  for (const part of rawPayload.split(LIST_SEPARATOR_RX)) {
    if (part.length > 0 && Number.isFinite(Number(part))) {
      count += 1;
      if (count >= minPoints) {
        return true;
      }
    }
  }
  return false;
}

/** Check whether `rawPayload` contains at least one valid `'0'`–`'9'` status strip tick state. */
function hasValidStripTick(rawPayload: string): boolean {
  if (LIST_SEPARATOR_RX.test(rawPayload)) {
    for (const part of rawPayload.split(LIST_SEPARATOR_RX)) {
      if (part.length === 1 && part >= '0' && part <= '9') {
        return true;
      }
    }
    return false;
  }
  for (let i = 0; i < rawPayload.length; i += 1) {
    const code = rawPayload.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      return true;
    }
  }
  return false;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Compose an `?icon=` value from its left and right slugs (`none,right` or the `,right` preset shorthand).
 * @param left            Left slug (`''` for none).
 * @param right           Right slug (`''` for none).
 * @param hasPresetIcon   Whether an empty left slug keeps a preset icon.
 * @returns Serialized `?icon=` value.
 */
export function composeIconPair(left: string, right: string, hasPresetIcon: boolean): string {
  const rawLeft = left.trim();
  const rawRight = right.trim();
  const leftSlug = !hasPresetIcon && rawLeft.toLowerCase() === 'none' ? '' : rawLeft;
  const rightSlug = rawRight.toLowerCase() === 'none' ? '' : rawRight;
  if (!rightSlug) {
    return leftSlug;
  }
  return `${leftSlug || (hasPresetIcon ? '' : 'none')},${rightSlug}`;
}

/**
 * Split an `?icon=` value into its left and right slugs.
 * @param value           Serialized value.
 * @param hasPresetIcon   Whether `none` is meaningful on the left.
 * @returns `[left, right]` icon slugs.
 */
export function splitIconPair(
  value: string,
  hasPresetIcon: boolean
): [left: string, right: string] {
  const commaIndex = value.indexOf(',');
  if (commaIndex === -1) {
    const single = value.trim();
    return [!hasPresetIcon && single.toLowerCase() === 'none' ? '' : single, ''];
  }
  const rawLeft = value.slice(0, commaIndex).trim();
  const rawRight = value.slice(commaIndex + 1).trim();
  const left = !hasPresetIcon && rawLeft.toLowerCase() === 'none' ? '' : rawLeft;
  const right = rawRight.toLowerCase() === 'none' ? '' : rawRight;
  return [left, right];
}

/**
 * Compose a `?hint=` value from an optional icon slug and optional label text (`icon:<slug>[ <text>]` or `<text>`).
 * @param icon   Icon slug (`''` for none).
 * @param text   Hint label text (`''` for none).
 * @returns Serialized `?hint=` value.
 */
export function composeHint(icon: string, text: string): string {
  const cleanIcon = icon.trim();
  const cleanText = text.trim();
  if (!cleanIcon || cleanIcon.toLowerCase() === 'none') {
    return cleanText;
  }
  return cleanText ? `icon:${cleanIcon} ${cleanText}` : `icon:${cleanIcon}`;
}

/**
 * Split a `?hint=` value into its optional icon slug and label text.
 * @param value   Serialized `?hint=` value.
 * @returns `{ icon, text }` parts.
 */
export function splitHint(value: string): HintSplitParts {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') {
    return { icon: '', text: '' };
  }
  if (trimmed.slice(0, 5).toLowerCase() === 'icon:') {
    const rest = trimmed.slice(5).trim();
    if (!rest) {
      return { icon: '', text: '' };
    }
    const match = HINT_ICON_REST_RX.exec(rest);
    const icon = (match?.groups?.slug ?? '').trim();
    const text = (match?.groups?.text ?? '').trim();
    return { icon: icon.toLowerCase() === 'none' ? '' : icon, text };
  }
  return { icon: '', text: trimmed };
}

/**
 * Compose an `?anim=` value from the sheen toggle and up to two icon motions.
 * @param hasSheen   Whether the surface sheen is enabled.
 * @param left       Left (or only) icon motion (`''` for static).
 * @param right      Right icon motion (`''` for static).
 * @returns Serialized `?anim=` value.
 */
export function composeAnim(hasSheen: boolean, left: string, right: string): string {
  const tokens: string[] = hasSheen ? ['sheen'] : [];
  if (right) {
    tokens.push(left || 'default', right);
  } else if (left) {
    tokens.push(left);
  }
  return tokens.join(',');
}

/**
 * Split an `?anim=` value into the sheen toggle and icon motions.
 * @param value     Serialized `?anim=` value.
 * @param options   Optional `anim` field options used to canonicalize aliases and reject unknown tokens.
 * @returns Sheen flag and left/right icon motion tokens.
 */
export function splitAnim(value: string, options?: readonly BuilderOption[]): AnimSplitParts {
  const trimmed = value.trim();
  if (trimmed.length > MAX_ANIMATION_INPUT_LENGTH) {
    return { hasSheen: false, left: '', right: '' };
  }
  const motions: string[] = [];
  let hasSheen = false;
  for (const token of trimmed.toLowerCase().split(LIST_SEPARATOR_RX)) {
    if (token === 'sheen') {
      if (hasSheen) {
        return { hasSheen: false, left: '', right: '' };
      }
      hasSheen = true;
    } else if (token) {
      const resolved = resolveAnimOptionToken(token, options);
      if (resolved === undefined) {
        return { hasSheen: false, left: '', right: '' };
      }
      motions.push(resolved);
    }
  }
  if (motions.length > 2) {
    return { hasSheen: false, left: '', right: '' };
  }
  const rawLeft = motions[0] ?? '';
  const rawRight = motions[1] ?? '';
  if (motions.length <= 1) {
    return { hasSheen, left: rawLeft === 'default' ? '' : rawLeft, right: '' };
  }
  if (rawLeft === 'default' && rawRight === 'default') {
    return { hasSheen, left: '', right: '' };
  }
  return {
    hasSheen,
    left: rawLeft === 'default' ? '' : rawLeft,
    right: rawRight === 'default' ? 'none' : rawRight,
  };
}

/**
 * Check whether a non-empty manual `?special=` payload is valid for `kind` under the Worker parser rules.
 * @param kind      Widget kind token.
 * @param payload   Trimmed widget payload string.
 * @returns `true` when `payload` parses into a renderable widget for `kind`.
 */
export function isValidSpecialPayload(kind: string, payload: string): boolean {
  const cleanPayload = payload.trim();
  if (!cleanPayload) {
    return false;
  }
  switch (kind) {
    case 'sparkline':
    case 'bars': {
      return hasMinSeriesPoints(cleanPayload, 2);
    }
    case 'bar':
    case 'ring': {
      const colonIndex = cleanPayload.indexOf(':');
      const numberPart = colonIndex === -1 ? cleanPayload : cleanPayload.slice(0, colonIndex);
      const cleaned = numberPart.trim().replace(TRAILING_PERCENT_RX, '');
      return Boolean(cleaned) && Number.isFinite(Number(cleaned));
    }
    case 'steps': {
      const slashIndex = cleanPayload.indexOf('/');
      if (slashIndex <= 0) {
        return false;
      }
      const doneRaw = cleanPayload.slice(0, slashIndex).trim();
      const totalRaw = cleanPayload.slice(slashIndex + 1).trim();
      if (!doneRaw || !totalRaw) {
        return false;
      }
      const parsedDone = Number(doneRaw);
      const parsedTotal = Number(totalRaw);
      return (
        Number.isFinite(parsedDone) && Number.isFinite(parsedTotal) && Math.round(parsedTotal) >= 1
      );
    }
    case 'strip': {
      return hasValidStripTick(cleanPayload);
    }
    case 'delta': {
      return cleanPayload.toLowerCase() !== 'auto';
    }
    default: {
      return false;
    }
  }
}

/**
 * Compose a `?special=` value from the widget kind, payload, and modifier.
 * @param kind            Widget kind (`''` for none).
 * @param payload         Widget data.
 * @param modifier        Optional modifier of the kind (e.g., `static`).
 * @param isAutoAllowed   Whether an empty payload emits an automatic widget token.
 * @returns Serialized `?special=` value.
 */
export function composeSpecial(
  kind: string,
  payload: string,
  modifier: string,
  isAutoAllowed = false
): string {
  if (!kind) {
    return '';
  }
  if (kind === 'none') {
    return 'none';
  }
  const cleanPayload = payload.trim();
  if (!cleanPayload) {
    if (!isAutoAllowed) {
      return '';
    }
    return modifier ? `${kind}:${modifier}` : kind;
  }
  if (!isValidSpecialPayload(kind, cleanPayload)) {
    return '';
  }
  return modifier ? `${kind}:${cleanPayload}:${modifier}` : `${kind}:${cleanPayload}`;
}

/**
 * Split a `?special=` value into its widget kind, payload, and modifier (modifiers come from the kind options).
 * @param value     Serialized `?special=` value.
 * @param options   Widget kind options of the `special` field.
 * @returns Parsed `kind`, `modifier`, and `payload`.
 */
export function splitSpecial(value: string, options: readonly BuilderOption[]): SpecialSplitParts {
  const trimmed = value.trim();
  if (!trimmed) {
    return { kind: '', modifier: '', payload: '' };
  }
  const lower = trimmed.toLowerCase();
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex === -1) {
    return findOption(options, lower)
      ? { kind: lower, modifier: '', payload: '' }
      : { kind: '', modifier: '', payload: '' };
  }
  if (colonIndex === 0) {
    return { kind: '', modifier: '', payload: '' };
  }
  const kind = trimmed.slice(0, colonIndex).trim().toLowerCase();
  const kindOption = findOption(options, kind);
  if (!kindOption || kind === 'none') {
    return { kind: '', modifier: '', payload: '' };
  }
  let payload = trimmed.slice(colonIndex + 1);
  let modifier = '';
  const { modifiers } = kindOption;
  const trimmedPayloadLower = payload.trim().toLowerCase();
  const bareModifier =
    modifiers && trimmedPayloadLower
      ? resolveOptionValue(modifiers, trimmedPayloadLower)
      : undefined;
  if (bareModifier !== undefined) {
    return { kind, modifier: bareModifier, payload: '' };
  }
  const lastColon = payload.lastIndexOf(':');
  if (modifiers && lastColon !== -1) {
    const candidate = payload
      .slice(lastColon + 1)
      .trim()
      .toLowerCase();
    const resolvedModifier = candidate ? resolveOptionValue(modifiers, candidate) : undefined;
    if (resolvedModifier !== undefined) {
      modifier = resolvedModifier;
      payload = payload.slice(0, lastColon);
    }
  }
  const cleanPayload = payload.trim();
  return { kind, modifier, payload: cleanPayload.toLowerCase() === 'auto' ? '' : cleanPayload };
}

/**
 * Split a `?size=` value into a named preset or a custom number.
 * @param value     Serialized `?size=` value.
 * @param options   Named preset options.
 * @returns Preset token (`'custom'` for numeric values) and custom pixel string.
 */
export function splitSize(value: string, options: readonly BuilderOption[]): SizeSplitParts {
  const clean = value.trim().toLowerCase();
  if (!clean) {
    return { custom: '', preset: '' };
  }
  if (findOption(options, clean)) {
    return { custom: '', preset: clean };
  }
  return Number.isFinite(Number(clean))
    ? { custom: clean, preset: 'custom' }
    : { custom: '', preset: '' };
}

/**
 * Resolve the display label, glyph slug, and placeholder state of an icon selector trigger.
 * @param rawSlug           Raw hidden input value.
 * @param placeholder       Fallback placeholder text.
 * @param presetIcon        Optional preset icon slug when `rawSlug` is empty.
 * @param isPresetDynamic   Whether `presetIcon` varies dynamically at runtime (`'Auto'` label).
 * @returns Display label, glyph slug, and placeholder state flag.
 */
export function resolveIconSelectDisplay(
  rawSlug: string,
  placeholder: string,
  presetIcon?: string,
  isPresetDynamic = false
): IconSelectDisplay {
  const trimmed = rawSlug.trim();
  if (trimmed.toLowerCase() === 'none') {
    return { displayLabel: placeholder, glyphSlug: '', isPlaceholder: true };
  }
  if (trimmed) {
    return { displayLabel: trimmed, glyphSlug: trimmed, isPlaceholder: false };
  }
  const cleanPreset = (presetIcon ?? '').trim();
  if (cleanPreset) {
    return {
      displayLabel: isPresetDynamic ? 'Auto' : cleanPreset,
      glyphSlug: cleanPreset,
      isPlaceholder: false,
    };
  }
  return { displayLabel: placeholder, glyphSlug: '', isPlaceholder: true };
}

/**
 * Split a serialized `;`- or newline-separated typing lines string into up to `maxLines` trimmed rows (at least `['']`).
 * @param rawValue   Serialized typing lines value.
 * @param maxLines   Maximum number of non-empty lines to retain.
 * @returns Non-empty list of trimmed line strings (or `['']` when none).
 */
export function splitTypingLines(rawValue: string, maxLines = MAX_TYPING_LINES): string[] {
  const lines: string[] = [];
  for (const segment of rawValue.split(TYPING_LINE_SPLIT_RX)) {
    const trimmedLine = segment.trim();
    if (trimmedLine && lines.length < maxLines) {
      lines.push(trimmedLine);
    }
  }
  if (lines.length === 0) {
    lines.push('');
  }
  return lines;
}
