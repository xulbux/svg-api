/**
 * Effective builder defaults & query normalization – Resolves context-dependent field defaults and omits redundant query parameters.
 */

import { findField, findOption, findService, readState } from '@/site/shared/encoding';
import {
  composeAnim,
  composeHint,
  composeIconPair,
  splitAnim,
  splitHint,
  splitIconPair,
} from '@/site/shared/fields';
import type {
  BuilderField,
  BuilderOption,
  BuilderSchema,
  BuilderServiceMetric,
  BuilderServiceOption,
  BuilderState,
} from '@/types';

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve the active service and metric options for a `service` builder state. */
function resolveActiveServiceMetric(
  schema: BuilderSchema,
  state: BuilderState
): { metric: BuilderServiceMetric | undefined; service: BuilderServiceOption | undefined } {
  const service = findService(schema, readState(state, 'service')) ?? schema.services?.[0];
  const metric = findOption(service?.metrics, readState(state, 'metric')) ?? service?.metrics[0];
  return { metric, service };
}

/** Resolve metric-dependent defaults on `/builder/service` (`undefined` when `field` uses its static default). */
function resolveServiceFieldDefault(
  schema: BuilderSchema,
  state: BuilderState,
  field: BuilderField
): string | undefined {
  const { metric, service } = resolveActiveServiceMetric(schema, state);
  if (field.id === 'service') {
    return service?.key ?? '';
  }
  if (!metric) {
    return undefined;
  }
  const metricDefaults: Readonly<Record<string, string>> = {
    color: metric.hasDynamicColor ? '' : metric.defaultColor,
    dot: metric.hasDynamicDot ? '' : 'none',
    label: metric.defaultLabel,
    metric: metric.value,
    special: metric.defaultSpecial ?? 'none',
  };
  return Object.hasOwn(metricDefaults, field.id) ? metricDefaults[field.id] : undefined;
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
    const hasPrefix = Boolean(readState(state, 'prefix'));
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
  const { metric } = resolveActiveServiceMetric(schema, state);
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

// -------------------------------------- PUBLIC API -------------------------------------

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
  if (field.control === 'special' && !field.hasPresetValue && lowerValue === 'none') {
    return '';
  }
  if (
    field.control === 'anim' &&
    schema.kind === 'button' &&
    (lowerValue === 'none' || lowerValue === 'none,none')
  ) {
    return '';
  }
  if (
    schema.kind === 'typing' &&
    field.id === 'title' &&
    (readState(state, 'layout').toLowerCase() || 'window') === 'window' &&
    lowerValue === 'none'
  ) {
    return '';
  }
  const effectiveDefault = resolveEffectiveFieldDefault(schema, state, field);
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
  if (field.control !== 'select' && field.control !== 'color') {
    return raw;
  }
  const clean = raw.trim().toLowerCase();
  for (const option of field.options ?? []) {
    if (option.value === clean || option.aliases?.includes(clean)) {
      return option.value;
    }
  }
  return '';
}
