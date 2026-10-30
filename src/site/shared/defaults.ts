/**
 * Effective Builder Defaults & Query Normalization
 *
 * Resolves context-dependent field defaults and omits redundant query parameters.
 */

import {
  findField,
  findOption,
  findService,
  readState,
  resolveOptionValue,
} from '@/site/shared/encoding';
import {
  composeAnim,
  composeHint,
  composeIconPair,
  composeSpecial,
  splitAnim,
  splitHint,
  splitIconPair,
  splitSpecial,
} from '@/site/shared/fields';
import type {
  ActiveServiceMetric,
  BadgeSpecialKind,
  BuilderField,
  BuilderOption,
  BuilderSchema,
  BuilderServiceMetric,
  BuilderState,
} from '@/types';

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve the active service and metric options for a `service` builder state. */
function resolveServiceMetricSelection(
  schema: BuilderSchema,
  state: BuilderState
): ActiveServiceMetric {
  const service = findService(schema, readState(state, 'service')) ?? schema.services?.[0];
  const metric = findOption(service?.metrics, readState(state, 'metric')) ?? service?.metrics[0];
  return { metric, service };
}

/** Resolve a metric-dependent field default (`undefined` when `metric` is unset or `fieldId` is unrelated). */
function resolveMetricFieldDefault(
  metric: BuilderServiceMetric | undefined,
  fieldId: string
): string | undefined {
  if (!metric) {
    return undefined;
  }
  switch (fieldId) {
    case 'color': {
      return metric.hasDynamicColor ? '' : metric.defaultColor;
    }
    case 'dot': {
      return metric.hasDynamicDot ? '' : 'none';
    }
    case 'label': {
      return metric.defaultLabel;
    }
    case 'metric': {
      return metric.value;
    }
    case 'special': {
      return metric.defaultSpecial ?? 'none';
    }
    default: {
      return undefined;
    }
  }
}

/** Resolve metric-dependent defaults on `/builder/service` (`undefined` when `field` uses its static default). */
function resolveServiceFieldDefault(
  schema: BuilderSchema,
  state: BuilderState,
  field: BuilderField
): string | undefined {
  if (field.id === 'service') {
    return resolveServiceMetricSelection(schema, state).service?.key ?? '';
  }
  if (
    field.id === 'color' ||
    field.id === 'dot' ||
    field.id === 'label' ||
    field.id === 'metric' ||
    field.id === 'special'
  ) {
    return resolveMetricFieldDefault(resolveServiceMetricSelection(schema, state).metric, field.id);
  }
  return undefined;
}

/** Resolve layout-dependent defaults on `/builder/quote` and `/builder/typing`. */
function resolveLayoutFieldDefault(
  schema: BuilderSchema,
  state: BuilderState,
  field: BuilderField
): string | undefined {
  const effectiveLayout =
    readState(state, 'layout').toLowerCase() || (findField(schema, 'layout')?.defaultValue ?? '');
  if (schema.kind === 'typing' && field.id === 'align') {
    const rawPrefix = readState(state, 'prefix').toLowerCase();
    const hasPrefix = Boolean(rawPrefix && rawPrefix !== 'none');
    const rawIcon = readState(state, 'icon').toLowerCase();
    const hasIcon = Boolean(rawIcon && rawIcon !== 'none');
    return effectiveLayout === 'none' && !hasPrefix && !hasIcon
      ? 'center'
      : (field.defaultValue ?? 'left');
  }
  if (field.layoutDefaults && Object.hasOwn(field.layoutDefaults, effectiveLayout)) {
    return field.layoutDefaults[effectiveLayout] ?? field.defaultValue ?? '';
  }
  return undefined;
}

/** Normalize an `iconPair` query field value, omitting redundant static preset icons on `/builder/service`. */
function normalizeIconPairFieldValue(
  schema: BuilderSchema,
  state: BuilderState,
  field: BuilderField,
  rawValue: string
): string {
  const hasPresetIcon = Boolean(field.hasPresetValue);
  const [rawLeft, right] = splitIconPair(rawValue, hasPresetIcon);
  if (schema.kind !== 'service') {
    return composeIconPair(rawLeft, right, hasPresetIcon);
  }
  const { metric } = resolveServiceMetricSelection(schema, state);
  const isRedundantPresetLeft =
    Boolean(metric && !metric.hasDynamicIcon) &&
    rawLeft.toLowerCase() === (metric?.defaultIcon ?? '').toLowerCase();
  return composeIconPair(isRedundantPresetLeft ? '' : rawLeft, right, hasPresetIcon);
}

/** Check whether `lowerValue` matches the option or aliases of `lowerDefault` in `options`. */
function isMatchingDefaultOptionAlias(
  options: readonly BuilderOption[] | undefined,
  lowerValue: string,
  lowerDefault: string
): boolean {
  if (!options) {
    return false;
  }
  for (const option of options) {
    if (option.value.toLowerCase() === lowerDefault) {
      return (
        lowerValue === lowerDefault ||
        Boolean(option.aliases?.some((alias) => alias.toLowerCase() === lowerValue))
      );
    }
  }
  return false;
}

/** Check whether `value` matches `effectiveDefault` under the comparison semantics of `field`. */
function isValueEqualToEffectiveDefault(
  field: BuilderField,
  value: string,
  effectiveDefault: string
): boolean {
  const lowerValue = value.toLowerCase();
  const lowerDefault = effectiveDefault.toLowerCase();
  if (isMatchingDefaultOptionAlias(field.options, lowerValue, lowerDefault)) {
    return true;
  }
  if (!effectiveDefault) {
    return false;
  }
  if (field.control === 'number' || field.id === 'perline') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue === Number(effectiveDefault);
  }
  if (field.control === 'text' || field.control === 'textarea') {
    return value === effectiveDefault;
  }
  return lowerValue === lowerDefault;
}

/**
 * Normalize typing-specific query edge cases (`anim` on `layout=none` and `title=none` on `layout=window`),
 * or `undefined` when standard normalization applies.
 */
function normalizeTypingQueryOverride(
  state: BuilderState,
  field: BuilderField,
  rawValue: string,
  effectiveDefault: string
): string | undefined {
  const effectiveLayout = readState(state, 'layout').toLowerCase() || 'window';
  if (field.control === 'anim' && effectiveLayout === 'none') {
    const anim = splitAnim(rawValue, field.options);
    const framelessAnim = composeAnim(false, anim.left, '');
    if (!framelessAnim) {
      return '';
    }
    return isValueEqualToEffectiveDefault(field, framelessAnim, effectiveDefault)
      ? ''
      : framelessAnim;
  }
  if (field.id === 'title' && effectiveLayout === 'window' && rawValue.toLowerCase() === 'none') {
    return '';
  }
  return undefined;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Resolve the active service preset and metric option for a `service` builder state.
 * @param schema   Builder schema.
 * @param state    Current builder state.
 * @returns Active `service` and `metric` options (`undefined` when unavailable).
 */
export function resolveActiveServiceMetric(
  schema: BuilderSchema,
  state: BuilderState
): ActiveServiceMetric {
  if (schema.kind !== 'service') {
    return { metric: undefined, service: undefined };
  }
  return resolveServiceMetricSelection(schema, state);
}

/**
 * Check whether a typing builder field applies to the currently selected container layout.
 * @param fieldId       Builder field ID.
 * @param layoutValue   Current `layout` field value.
 * @returns `true` when the field applies to the layout.
 */
export function isTypingFieldActiveForLayout(fieldId: string, layoutValue: string): boolean {
  const effectiveLayout = layoutValue.trim().toLowerCase() || 'window';
  if (fieldId === 'title') {
    return effectiveLayout === 'window' || effectiveLayout === 'ide';
  }
  if (fieldId === 'hint') {
    return effectiveLayout !== 'none';
  }
  if (fieldId === 'align') {
    return effectiveLayout !== 'browser' && effectiveLayout !== 'ide';
  }
  return true;
}

/**
 * Resolve the effective default value of `field` under the current `state` (including service metric and layout defaults).
 * @param schema   Builder schema.
 * @param state    Current builder state.
 * @param field    Target builder field.
 * @returns Effective default value (`''` when empty/auto is the default).
 */
export function resolveEffectiveFieldDefault(
  schema: BuilderSchema,
  state: BuilderState,
  field: BuilderField
): string {
  if (schema.kind === 'service') {
    const serviceDefault = resolveServiceFieldDefault(schema, state, field);
    if (serviceDefault !== undefined) {
      return serviceDefault;
    }
  }
  if (schema.kind === 'quote' || schema.kind === 'typing') {
    const layoutDefault = resolveLayoutFieldDefault(schema, state, field);
    if (layoutDefault !== undefined) {
      return layoutDefault;
    }
  }
  return field.defaultValue ?? '';
}

/**
 * Normalize a `?special=` field value against `schema` and `state` (validating payloads and service metric `autoSpecials`),
 * without stripping values equal to `effectiveDefault`.
 * @param schema     Builder schema.
 * @param state      Current builder state.
 * @param field      `special` builder field.
 * @param rawValue   Raw `?special=` value.
 * @returns Canonicalized `?special=` value (`''` when invalid or unsupported).
 */
export function normalizeSpecialFieldValue(
  schema: BuilderSchema,
  state: BuilderState,
  field: BuilderField,
  rawValue: string
): string {
  const special = splitSpecial(rawValue, field.options ?? []);
  if (!special.kind) {
    return '';
  }
  if (special.kind === 'none') {
    return field.hasPresetValue ? 'none' : '';
  }
  let isAutoAllowed = false;
  if (schema.kind === 'service') {
    const { metric } = resolveServiceMetricSelection(schema, state);
    isAutoAllowed =
      metric?.defaultSpecial === special.kind ||
      Boolean(metric?.autoSpecials?.includes(special.kind as BadgeSpecialKind));
  }
  return composeSpecial(special.kind, special.payload, special.modifier, isAutoAllowed);
}

/**
 * Normalize a query parameter field value and return `''` when it is redundant with the effective default.
 * @param schema     Builder schema.
 * @param state      Current builder state.
 * @param field      Target builder field.
 * @param rawValue   Raw field value.
 * @returns Normalized query parameter value (`''` when omitted).
 */
export function normalizeQueryFieldValue(
  schema: BuilderSchema,
  state: BuilderState,
  field: BuilderField,
  rawValue: string
): string {
  const lowerValue = rawValue.toLowerCase();
  if (field.control === 'iconPair') {
    return normalizeIconPairFieldValue(schema, state, field, rawValue);
  }
  if (field.control === 'icon') {
    return lowerValue === 'none' ? '' : rawValue;
  }
  if (field.control === 'hint') {
    const parsedHint = splitHint(rawValue);
    return composeHint(parsedHint.icon, parsedHint.text);
  }
  if (field.control === 'special') {
    const normalizedSpecial = normalizeSpecialFieldValue(schema, state, field, rawValue);
    if (!normalizedSpecial) {
      return '';
    }
    const effectiveSpecialDefault = resolveEffectiveFieldDefault(schema, state, field);
    return isValueEqualToEffectiveDefault(field, normalizedSpecial, effectiveSpecialDefault)
      ? ''
      : normalizedSpecial;
  }
  if (
    field.control === 'anim' &&
    schema.kind === 'button' &&
    (lowerValue === 'none' || lowerValue === 'none,none')
  ) {
    return '';
  }
  const effectiveDefault = resolveEffectiveFieldDefault(schema, state, field);
  if (schema.kind === 'typing') {
    const typingOverride = normalizeTypingQueryOverride(state, field, rawValue, effectiveDefault);
    if (typingOverride !== undefined) {
      return typingOverride;
    }
  }
  return isValueEqualToEffectiveDefault(field, rawValue, effectiveDefault) ? '' : rawValue;
}

/**
 * Normalize a prefilled option value like the Worker parsers: Case-insensitive, aliases map onto their option.
 * @param field   Target builder field.
 * @param raw     Raw query parameter string.
 * @returns Canonicalized builder state value.
 */
export function normalizeOptionValue(field: BuilderField, raw: string): string {
  if (field.control === 'number') {
    const clean = raw.trim();
    return clean && Number.isFinite(Number(clean)) ? clean : '';
  }
  if (field.control === 'size') {
    const clean = raw.trim().toLowerCase();
    return clean && (findOption(field.options, clean) || Number.isFinite(Number(clean)))
      ? clean
      : '';
  }
  if (field.control === 'anim') {
    const anim = splitAnim(raw, field.options);
    if (field.animScope === 'stack' && anim.right) {
      return '';
    }
    return composeAnim(anim.hasSheen, anim.left, field.animScope === 'pair' ? anim.right : '');
  }
  if (field.control === 'special') {
    const special = splitSpecial(raw, field.options ?? []);
    return composeSpecial(
      special.kind,
      special.payload,
      special.modifier,
      Boolean(field.hasPresetValue)
    );
  }
  if (field.control !== 'select' && field.control !== 'color') {
    return raw;
  }
  return resolveOptionValue(field.options, raw.trim().toLowerCase()) ?? '';
}
