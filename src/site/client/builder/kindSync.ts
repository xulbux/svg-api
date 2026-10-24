/**
 * Kind-specific builder form sync – Updates dependent fields, placeholders, and defaults for `/builder/service`, `/builder/quote`, and `/builder/typing`.
 */

import {
  findOption,
  findService,
  isTypingFieldActiveForLayout,
  resolveEffectiveFieldDefault,
} from '@/site/client/builder/core';
import { getPart } from '@/site/client/builder/fields';
import type { BuilderFieldsController } from '@/site/client/builder/fields';
import { setSelectOptions, syncSelect } from '@/site/client/builder/select';
import type { BuilderField, BuilderOption, BuilderSchema, BuilderState } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Options for initializing the kind-specific form field synchronizer. */
export interface KindSyncOptions {
  /** Field wrapper elements keyed by field ID. */
  fieldElements: ReadonlyMap<string, Element>;
  /** Schema field definitions keyed by field ID. */
  fieldsById: ReadonlyMap<string, BuilderField>;
  /** Field DOM reader/writer controller. */
  fieldsController: BuilderFieldsController;
  /** Builder `<form>` element. */
  form: HTMLFormElement;
  /** Returns the active builder state object. */
  getState: () => BuilderState;
  /** Active builder schema. */
  schema: BuilderSchema;
}

/** Public controller interface returned by `createKindSyncController`. */
export interface KindSyncController {
  /** Sync size defaults after a layout change on `/builder/quote`. */
  syncQuoteFields: () => void;
  /** Sync dependent service/metric controls after `service` or `metric` changes. */
  syncServiceFieldChange: (field: BuilderField) => void;
  /** Sync owner/target labels, metric options, and preset presentation on `/builder/service`. */
  syncServiceFields: () => void;
  /** Sync layout-dependent field visibility, placeholders, and defaults on `/builder/typing`. */
  syncTypingFields: () => void;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Sync the custom dropdown wrapper surrounding a native `<select>` control when present. */
function syncSelectForControl(control: Element | undefined): void {
  const wrapper = control?.closest('[data-select]');
  if (wrapper) {
    syncSelect(wrapper);
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Create the kind-specific builder presentation synchronizer.
 * @param options   Schema, field lookup maps, form element, state accessor, and field controller.
 * @returns Kind-specific field sync controller.
 */
export function createKindSyncController(options: KindSyncOptions): KindSyncController {
  const { fieldElements, fieldsById, fieldsController, form, getState, schema } = options;
  const {
    getActiveAutoSpecials,
    getActiveServiceMetric,
    getControl,
    normalizeDefaultSelection,
    readFieldValue,
    syncSpecialParts,
    writeFieldValue,
  } = fieldsController;

  function syncServiceSpecialOptions(): void {
    const specialField = fieldsById.get('special');
    const specialElement = fieldElements.get('special');
    if (!specialField || !specialElement) {
      return;
    }
    const autoSpecials = getActiveAutoSpecials();
    const kindSelect = getPart(specialElement, 'kind');
    if (kindSelect instanceof HTMLSelectElement) {
      for (const option of kindSelect.options) {
        if (option.value && autoSpecials.includes(option.value)) {
          option.dataset.badge = 'Auto';
        } else {
          delete option.dataset.badge;
        }
      }
    }
    const state = getState();
    if (!state.special) {
      writeFieldValue(specialField, '');
    } else {
      const modifier = getPart(specialElement, 'modifier')?.value ?? '';
      syncSpecialParts(specialField, specialElement, modifier);
    }
    syncSelectForControl(kindSelect);
  }

  function syncServiceDotOptions(hasDynamicDot: boolean): void {
    const dotField = fieldsById.get('dot');
    const dotControl = getControl('dot');
    if (!dotField || !(dotControl instanceof HTMLSelectElement)) {
      return;
    }
    const dotOptions: BuilderOption[] = [];
    for (const option of dotField.options ?? []) {
      if (hasDynamicDot || option.value !== '') {
        dotOptions.push(option);
      }
    }
    const state = getState();
    const targetDotValue = state.dot || resolveEffectiveFieldDefault(schema, state, dotField);
    setSelectOptions(dotControl, dotOptions, targetDotValue);
    state.dot = normalizeDefaultSelection(dotField, dotControl.value);
  }

  function syncServicePresetIconTrigger(
    defaultIcon: string | undefined,
    hasDynamicIcon: boolean
  ): void {
    const leftIconTrigger = form.querySelector('[data-icon-target="field-icon-left"]');
    if (!(leftIconTrigger instanceof HTMLElement)) {
      return;
    }
    if (defaultIcon) {
      leftIconTrigger.dataset.presetIcon = defaultIcon;
    } else {
      delete leftIconTrigger.dataset.presetIcon;
    }
    if (hasDynamicIcon) {
      leftIconTrigger.dataset.presetDynamic = 'true';
    } else {
      delete leftIconTrigger.dataset.presetDynamic;
    }
  }

  function syncServiceMetricPresentation(): void {
    const metric = getActiveServiceMetric();
    const labelControl = getControl('label');
    if (labelControl instanceof HTMLInputElement) {
      labelControl.placeholder = metric?.defaultLabel || 'preset label';
    }

    fieldElements
      .get('color')
      ?.querySelector('[data-color-auto]')
      ?.toggleAttribute('hidden', !metric?.hasDynamicColor);
    const colorField = fieldsById.get('color');
    const state = getState();
    if (colorField && !state.color) {
      writeFieldValue(colorField, '');
    }

    syncServiceDotOptions(Boolean(metric?.hasDynamicDot));
    syncServicePresetIconTrigger(metric?.defaultIcon, Boolean(metric?.hasDynamicIcon));
    syncServiceSpecialOptions();
  }

  function labelServiceSegment(
    id: string,
    label: string,
    segmentName: string,
    placeholder: string,
    isRequired: boolean
  ): void {
    const fieldElement = fieldElements.get(id);
    const textElement = fieldElement?.querySelector('.builder-label-text');
    if (textElement) {
      textElement.textContent = `${label} ${segmentName}`.trim();
    }
    fieldElement?.querySelector('.builder-required')?.toggleAttribute('hidden', !isRequired);
    const control = getControl(id);
    if (control instanceof HTMLInputElement) {
      control.placeholder = placeholder;
      if (isRequired) {
        control.setAttribute('aria-required', 'true');
      } else {
        control.removeAttribute('aria-required');
      }
    }
  }

  function syncServiceFields(): void {
    const state = getState();
    const service = findService(schema, state.service);
    if (!service) {
      return;
    }
    fieldElements.get('owner')?.toggleAttribute('hidden', service.ownerMode === 'none');
    labelServiceSegment(
      'owner',
      'Owner',
      service.ownerName ?? '',
      service.ownerHint ?? '',
      service.ownerMode === 'required'
    );
    labelServiceSegment(
      'target',
      'Target',
      service.targetName,
      service.targetName.replace(':', ''),
      true
    );
    const metricControl = getControl('metric');
    const { metrics } = service;
    if (!findOption(metrics, state.metric ?? '')) {
      state.metric = metrics[0]?.value ?? '';
    }
    if (metricControl instanceof HTMLSelectElement) {
      setSelectOptions(metricControl, metrics, state.metric ?? '');
    }
    syncServiceMetricPresentation();
  }

  function syncQuoteFields(): void {
    if (schema.kind !== 'quote') {
      return;
    }
    const sizeField = fieldsById.get('size');
    if (sizeField && !getState().size) {
      writeFieldValue(sizeField, '');
    }
  }

  function syncFramelessTypingSheen(state: BuilderState, isFrameless: boolean): void {
    const animElement = fieldElements.get('anim');
    const sheenInput = animElement ? getPart(animElement, 'sheen') : undefined;
    sheenInput?.closest('.builder-check')?.toggleAttribute('hidden', isFrameless);
    if (!isFrameless) {
      return;
    }
    const rawAnim = (state.anim ?? '').trim().toLowerCase();
    if (rawAnim === 'sheen') {
      state.anim = '';
    } else if (rawAnim === 'sheen,none' || rawAnim === 'none,sheen') {
      state.anim = 'none';
    }
    if (sheenInput instanceof HTMLInputElement && sheenInput.checked) {
      sheenInput.checked = false;
      const animField = fieldsById.get('anim');
      if (animField && animElement) {
        state.anim = readFieldValue(animField, animElement);
      }
    }
  }

  function syncTypingPlaceholders(effectiveLayout: string, defaultLayout: string): void {
    const titleControl = getControl('title');
    if (titleControl instanceof HTMLInputElement) {
      titleControl.placeholder =
        effectiveLayout === 'ide' ? 'index.ts (ide default)' : 'optional (e.g., zsh)';
    }
    const prefixControl = getControl('prefix');
    if (prefixControl instanceof HTMLInputElement) {
      prefixControl.placeholder =
        effectiveLayout === defaultLayout ? `❯ (${defaultLayout} default)` : 'optional';
    }
    const hintElement = fieldElements.get('hint');
    const hintTextControl = hintElement ? getPart(hintElement, 'text') : undefined;
    if (hintTextControl instanceof HTMLInputElement) {
      hintTextControl.placeholder =
        effectiveLayout === 'prompt' ? 'optional (e.g., K)' : 'optional (e.g., UTF-8)';
    }
  }

  function syncTypingFields(): void {
    if (schema.kind !== 'typing') {
      return;
    }
    const state = getState();
    const defaultLayout = fieldsById.get('layout')?.defaultValue ?? 'window';
    const effectiveLayout = (state.layout ?? '').trim().toLowerCase() || defaultLayout;

    for (const fieldId of ['title', 'hint', 'align']) {
      fieldElements
        .get(fieldId)
        ?.toggleAttribute('hidden', !isTypingFieldActiveForLayout(fieldId, effectiveLayout));
    }
    syncFramelessTypingSheen(state, effectiveLayout === 'none');
    syncTypingPlaceholders(effectiveLayout, defaultLayout);

    for (const fieldId of ['font', 'align']) {
      const field = fieldsById.get(fieldId);
      if (field && !state[fieldId]) {
        writeFieldValue(field, '');
      }
    }
  }

  function syncServiceFieldChange(field: BuilderField): void {
    if (field.id === 'service') {
      syncServiceFields();
    } else if (field.id === 'metric') {
      syncServiceMetricPresentation();
    } else {
      return;
    }
    const specialField = fieldsById.get('special');
    const specialElement = fieldElements.get('special');
    const state = getState();
    if (specialField && specialElement) {
      state.special = readFieldValue(specialField, specialElement);
      if (!state.special) {
        writeFieldValue(specialField, '');
        syncSelectForControl(getPart(specialElement, 'kind'));
      }
    }
  }

  return { syncQuoteFields, syncServiceFieldChange, syncServiceFields, syncTypingFields };
}
