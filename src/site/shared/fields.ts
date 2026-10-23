/**
 * Composite builder parameter codecs – Composes and splits multi-part query DSL values (`?icon=`, `?hint=`, `?anim=`, `?special=`, and `?size=`).
 */

import { findOption } from '@/site/shared/encoding';
import type { BuilderOption } from '@/types';

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches comma or whitespace separators in list-style payloads. */
export const LIST_SEPARATOR_RX = /[,\s]+/;

/** Matches `<slug>` and optional trailing `<text>` after an `icon:` prefix in `?hint=`. */
const HINT_ICON_REST_RX = /^(?<slug>[^\s:]+)(?:[\s:]+(?<text>[\s\S]*))?$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve a single motion token against optional `anim` field options (case-insensitive, mapping aliases). */
function resolveAnimOptionToken(
  token: string,
  options: readonly BuilderOption[] | undefined
): string | undefined {
  if (token === 'default') {
    return '';
  }
  if (!options) {
    return token;
  }
  for (const option of options) {
    if (option.value === token || option.aliases?.includes(token)) {
      return option.value;
    }
  }
  return undefined;
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
export function splitHint(value: string): { icon: string; text: string } {
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
export function splitAnim(
  value: string,
  options?: readonly BuilderOption[]
): { hasSheen: boolean; left: string; right: string } {
  const motions: string[] = [];
  let hasSheen = false;
  for (const token of value.trim().toLowerCase().split(LIST_SEPARATOR_RX)) {
    if (token === 'sheen') {
      if (hasSheen && options) {
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
  if (options && motions.length > 2) {
    return { hasSheen: false, left: '', right: '' };
  }
  const left = motions[0] ?? '';
  const right = motions[1] ?? '';
  if (hasSheen && !right && left === 'none') {
    return { hasSheen, left: '', right: '' };
  }
  return { hasSheen, left, right };
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
  return modifier ? `${kind}:${cleanPayload}:${modifier}` : `${kind}:${cleanPayload}`;
}

/**
 * Split a `?special=` value into its widget kind, payload, and modifier (modifiers come from the kind options).
 * @param value     Serialized `?special=` value.
 * @param options   Widget kind options of the `special` field.
 * @returns Parsed `kind`, `modifier`, and `payload`.
 */
export function splitSpecial(
  value: string,
  options: readonly BuilderOption[]
): { kind: string; modifier: string; payload: string } {
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
  if (modifiers && trimmedPayloadLower && findOption(modifiers, trimmedPayloadLower)) {
    return { kind, modifier: trimmedPayloadLower, payload: '' };
  }
  const lastColon = payload.lastIndexOf(':');
  if (modifiers && lastColon !== -1) {
    const candidate = payload
      .slice(lastColon + 1)
      .trim()
      .toLowerCase();
    if (candidate && findOption(modifiers, candidate)) {
      modifier = candidate;
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
export function splitSize(
  value: string,
  options: readonly BuilderOption[]
): { custom: string; preset: string } {
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
