/**
 * Builder field controls – Reads, writes, and normalizes scalar and composite DOM form controls (`anim`, `color`, `hint`, `icon`, `iconPair`, `size`, `special`, `stackGroups`, and `typingLines`).
 */

import {
  composeAnim,
  composeHint,
  composeIconPair,
  composeSpecial,
  findOption,
  resolveActiveServiceMetric,
  resolveEffectiveFieldDefault,
  splitAnim,
  splitHint,
  splitIconPair,
  splitSize,
  splitSpecial,
} from '@/site/client/builder/core';
import { setSelectOptions } from '@/site/client/builder/select';
import type {
  BuilderField,
  BuilderOption,
  BuilderSchema,
  BuilderServiceMetric,
  BuilderState,
  TypingLinesController,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Single native form control of a builder field. */
export type FieldControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Options for initializing the builder field DOM reader/writer controller. */
export interface BuilderFieldsOptions {
  /** Field wrapper elements keyed by field ID. */
  fieldElements: ReadonlyMap<string, Element>;
  /** Returns the active builder state object. */
  getState: () => BuilderState;
  /** Whether an empty left icon keeps a preset icon. */
  hasPresetIcon: boolean;
  /** Active builder schema. */
  schema: BuilderSchema;
  /** Synchronizes the `/builder/stack` chip catalog from a raw DSL value. */
  syncStackFromDsl: (value: string) => void;
  /** Interactive `/builder/typing` line list editor controller. */
  typingLinesController: TypingLinesController;
}

/** Public controller interface returned by `createBuilderFieldsController`. */
export interface BuilderFieldsController {
  /** Return the active auto-supported widget kinds for the selected service metric. */
  getActiveAutoSpecials: () => readonly string[];
  /** Return the currently selected service metric option on `/builder/service`. */
  getActiveServiceMetric: () => BuilderServiceMetric | undefined;
  /** Look up and memoize `#field-<id>` as a native form control. */
  getControl: (id: string) => FieldControl | undefined;
  /** Omit values that match the effective default of `field` under the current state. */
  normalizeDefaultSelection: (
    field: BuilderField,
    rawValue: string,
    isCustomSize?: boolean
  ) => string;
  /** Serialize the current DOM state of `field` into a builder state string. */
  readFieldValue: (field: BuilderField, fieldElement: Element) => string;
  /** Keep interdependent sub-controls synchronized right after user input on `fieldElement`. */
  syncControlPartsOnInput: (
    field: BuilderField,
    fieldElement: Element,
    target: EventTarget | undefined
  ) => void;
  /** Synchronize the payload input, modifier select, and hint text of a `special` field. */
  syncSpecialParts: (field: BuilderField, fieldElement: Element, modifier: string) => void;
  /** Write a builder state string into the DOM control(s) of `field`. */
  writeFieldValue: (field: BuilderField, value: string) => void;
}

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Find a `[data-part="<part>"]` control inside a composite field wrapper element.
 * @param fieldElement   Composite field wrapper element.
 * @param part           Sub-control `data-part` name.
 * @returns Matching form control, or `undefined`.
 */
function getPart(fieldElement: Element, part: string): FieldControl | undefined {
  const control = fieldElement.querySelector<FieldControl>(`[data-part="${part}"]`);
  return control ?? undefined;
}

/** Set the value of a part control of a field element (no-op when the part does not exist). */
function setPartValue(fieldElement: Element, part: string, value: string): void {
  const control = getPart(fieldElement, part);
  if (control) {
    control.value = value;
  }
}

/** Show the custom pixel input of a `size` field only for the `Custom…` preset. */
function syncSizeParts(fieldElement: Element): void {
  const isCustom = getPart(fieldElement, 'preset')?.value === 'custom';
  fieldElement.querySelector('[data-size-part="custom"]')?.toggleAttribute('hidden', !isCustom);
}

/** Check the radio input matching `value` inside `fieldElement`. */
function setRadioGroupValue(fieldElement: Element, value: string): void {
  for (const radio of fieldElement.querySelectorAll('input[type="radio"]')) {
    if (radio instanceof HTMLInputElement) {
      radio.checked = radio.value === value;
    }
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

export { getPart };

/**
 * Create the builder field DOM reader, writer, and composite-part synchronizer.
 * @param options   Schema, field element map, state accessor, and sub-controllers.
 */
export function createBuilderFieldsController(
  options: BuilderFieldsOptions
): BuilderFieldsController {
  const {
    fieldElements,
    getState,
    hasPresetIcon,
    schema,
    syncStackFromDsl,
    typingLinesController,
  } = options;
  const controlCache = new Map<string, FieldControl | undefined>();

  function getControl(id: string): FieldControl | undefined {
    if (!controlCache.has(id)) {
      const element = document.getElementById(`field-${id}`);
      controlCache.set(
        id,
        element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
          ? element
          : undefined
      );
    }
    return controlCache.get(id);
  }

  function getActiveServiceMetric(): BuilderServiceMetric | undefined {
    return resolveActiveServiceMetric(schema, getState())?.metric;
  }

  function getActiveAutoSpecials(): readonly string[] {
    return getActiveServiceMetric()?.autoSpecials ?? [];
  }

  function normalizeDefaultSelection(
    field: BuilderField,
    rawValue: string,
    isCustomSize = false
  ): string {
    if (!field.param || isCustomSize) {
      return rawValue;
    }
    const effectiveDefault = resolveEffectiveFieldDefault(schema, getState(), field);
    return rawValue.toLowerCase() === effectiveDefault.toLowerCase() ? '' : rawValue;
  }

  function readFieldValue(field: BuilderField, fieldElement: Element): string {
    function readPartValue(part: string): string {
      return getPart(fieldElement, part)?.value ?? '';
    }
    switch (field.control) {
      case 'anim': {
        const sheen = getPart(fieldElement, 'sheen');
        return composeAnim(
          sheen instanceof HTMLInputElement && sheen.checked,
          readPartValue('left'),
          readPartValue('right')
        );
      }
      case 'color': {
        const checked = fieldElement.querySelector('input:checked');
        const checkedValue = checked instanceof HTMLInputElement ? checked.value : '';
        return normalizeDefaultSelection(field, checkedValue);
      }
      case 'hint': {
        return composeHint(readPartValue('icon'), readPartValue('text'));
      }
      case 'icon': {
        return readPartValue('main').trim();
      }
      case 'iconPair': {
        return composeIconPair(readPartValue('left'), readPartValue('right'), hasPresetIcon);
      }
      case 'size': {
        const preset = readPartValue('preset');
        const rawSize = preset === 'custom' ? readPartValue('custom').trim() : preset;
        return normalizeDefaultSelection(field, rawSize, preset === 'custom');
      }
      case 'special': {
        const kind = readPartValue('kind');
        const composedSpecial = composeSpecial(
          kind,
          readPartValue('payload'),
          readPartValue('modifier'),
          Boolean(kind && getActiveAutoSpecials().includes(kind))
        );
        return normalizeDefaultSelection(field, composedSpecial);
      }
      case 'typingLines': {
        return typingLinesController.readValue();
      }
      default: {
        const rawValue = getControl(field.id)?.value ?? '';
        return field.control === 'select' ? normalizeDefaultSelection(field, rawValue) : rawValue;
      }
    }
  }

  function resolveSpecialHint(
    field: BuilderField,
    kind: string,
    kindOption: BuilderOption | undefined,
    isAuto: boolean
  ): string {
    const baseHint = kindOption?.description ?? field.description ?? '';
    if (kind && kind !== 'none') {
      return isAuto
        ? `Uses live upstream data when Data is left empty; Manual: ${baseHint}`
        : baseHint;
    }
    if (schema.kind === 'service') {
      const metric = getActiveServiceMetric();
      if (metric?.defaultSpecial) {
        return `Hides the default ${metric.defaultSpecial} widget of this metric.`;
      }
      if (getActiveAutoSpecials().length > 0) {
        return 'Auto-marked widgets use live upstream data when Data is left empty.';
      }
      return 'Optional inline chart, gauge, or delta pill next to the badge value.';
    }
    return baseHint;
  }

  function syncSpecialParts(field: BuilderField, fieldElement: Element, modifier: string): void {
    const kind = getPart(fieldElement, 'kind')?.value ?? '';
    const kindOption = findOption(field.options, kind);
    const modifiers = kindOption?.modifiers ?? [];
    const payload = getPart(fieldElement, 'payload');
    const modifierSelect = getPart(fieldElement, 'modifier');
    const isAuto = Boolean(kind && getActiveAutoSpecials().includes(kind));
    if (payload instanceof HTMLInputElement) {
      const example = kindOption?.placeholder ?? '';
      let autoPlaceholder = example;
      if (isAuto) {
        autoPlaceholder = example ? `auto (or e.g., ${example})` : 'auto';
      }
      payload.placeholder = autoPlaceholder;
    }
    if (modifierSelect instanceof HTMLSelectElement) {
      setSelectOptions(modifierSelect, modifiers, modifier);
    }
    const hint = fieldElement.querySelector('.builder-hint');
    if (hint) {
      hint.textContent = resolveSpecialHint(field, kind, kindOption, isAuto);
    }
    fieldElement
      .querySelector('[data-special-part="payload"]')
      ?.toggleAttribute('hidden', !kind || kind === 'none');
    fieldElement
      .querySelector('[data-special-part="modifier"]')
      ?.toggleAttribute('hidden', modifiers.length === 0);
  }

  function resolveWritableEffectiveValue(field: BuilderField, value: string): string {
    if (value) {
      return value;
    }
    const isSelectableDefault =
      Boolean(field.param) &&
      (field.control === 'select' ||
        field.control === 'color' ||
        field.control === 'size' ||
        field.control === 'special');
    return isSelectableDefault ? resolveEffectiveFieldDefault(schema, getState(), field) : '';
  }

  function writeScalarOrSelectControl(
    field: BuilderField,
    value: string,
    effectiveValue: string
  ): void {
    const control = getControl(field.id);
    if (control instanceof HTMLSelectElement) {
      control.value = effectiveValue;
      if (control.selectedIndex < 0 && control.options.length > 0) {
        control.selectedIndex = 0;
      }
    } else if (control) {
      control.value = value;
    }
    if (field.control === 'stackGroups') {
      syncStackFromDsl(value);
    }
  }

  function writeFieldValue(field: BuilderField, value: string): void {
    const fieldElement = fieldElements.get(field.id);
    if (!fieldElement) {
      return;
    }
    const effectiveValue = resolveWritableEffectiveValue(field, value);

    switch (field.control) {
      case 'anim': {
        const anim = splitAnim(value, field.options);
        const sheen = getPart(fieldElement, 'sheen');
        if (sheen instanceof HTMLInputElement) {
          sheen.checked = anim.hasSheen;
        }
        setPartValue(fieldElement, 'left', anim.left);
        setPartValue(fieldElement, 'right', anim.right);
        break;
      }
      case 'color': {
        setRadioGroupValue(fieldElement, effectiveValue);
        break;
      }
      case 'hint': {
        const hint = splitHint(value);
        setPartValue(fieldElement, 'icon', hint.icon);
        setPartValue(fieldElement, 'text', hint.text);
        break;
      }
      case 'icon': {
        setPartValue(fieldElement, 'main', value);
        break;
      }
      case 'iconPair': {
        const [left, right] = splitIconPair(value, hasPresetIcon);
        setPartValue(fieldElement, 'left', left);
        setPartValue(fieldElement, 'right', right);
        break;
      }
      case 'size': {
        const size = splitSize(effectiveValue, field.options ?? []);
        setPartValue(fieldElement, 'preset', size.preset);
        setPartValue(fieldElement, 'custom', size.custom);
        syncSizeParts(fieldElement);
        break;
      }
      case 'special': {
        const special = splitSpecial(effectiveValue, field.options ?? []);
        setPartValue(fieldElement, 'kind', special.kind);
        setPartValue(fieldElement, 'payload', special.payload);
        syncSpecialParts(field, fieldElement, special.modifier);
        break;
      }
      case 'typingLines': {
        typingLinesController.syncFromValue(value);
        break;
      }
      default: {
        writeScalarOrSelectControl(field, value, effectiveValue);
      }
    }
  }

  function syncControlPartsOnInput(
    field: BuilderField,
    fieldElement: Element,
    target: EventTarget | undefined
  ): void {
    if (field.control === 'anim' && field.animScope !== 'pair' && target instanceof Element) {
      const sheen = getPart(fieldElement, 'sheen');
      const left = getPart(fieldElement, 'left');
      if (
        target.matches('[data-part="left"]') &&
        left?.value === 'none' &&
        sheen instanceof HTMLInputElement
      ) {
        sheen.checked = false;
      } else if (
        target.matches('[data-part="sheen"]') &&
        sheen instanceof HTMLInputElement &&
        sheen.checked &&
        left?.value === 'none'
      ) {
        left.value = '';
      }
    }
    if (
      field.control === 'special' &&
      target instanceof Element &&
      target.matches('[data-part="kind"]')
    ) {
      syncSpecialParts(field, fieldElement, '');
    }
    if (field.control === 'size') {
      syncSizeParts(fieldElement);
    }
  }

  return {
    getActiveAutoSpecials,
    getActiveServiceMetric,
    getControl,
    normalizeDefaultSelection,
    readFieldValue,
    syncControlPartsOnInput,
    syncSpecialParts,
    writeFieldValue,
  };
}
