/**
 * URL builder client entry point – Wires state synchronization, preview/snippet output, and modular field, select, icon, stack, and typing controllers for `/builder/:kind`.
 */

import {
  bindPopoverFocusDismiss,
  buildPath,
  core,
  findService,
  parsePath,
} from '@/site/client/builder/core';
import { createBuilderFieldsController } from '@/site/client/builder/fields';
import { createIconPickerController } from '@/site/client/builder/iconPicker';
import { createKindSyncController } from '@/site/client/builder/kindSync';
import { createBuilderOutputController } from '@/site/client/builder/output';
import { bindSelects, syncSelects } from '@/site/client/builder/select';
import { createStackCatalogController } from '@/site/client/builder/stackCatalog';
import { createTypingLinesController } from '@/site/client/builder/typingLines';
import type { BuilderField, BuilderSchema, BuilderState } from '@/types';

// -------------------------------------- INTERNALS --------------------------------------

/** Initialize the URL builder DOM when running in a browser context. */
function initBuilderDom(): void {
  const site = globalThis.svgSite;
  const schemaElement = document.getElementById('builder-schema');
  const formElement = document.getElementById('builder-form');
  if (!site || !schemaElement || !(formElement instanceof HTMLFormElement)) {
    return;
  }
  const form = formElement;
  const schema = JSON.parse(schemaElement.textContent ?? '{}') as BuilderSchema;
  const hasPresetIcon = schema.fields.some((field) => field.hasPresetValue === true);
  const previewImage = document.getElementById('builder-preview') as HTMLImageElement | null;
  const previewPlaceholder = document.getElementById('builder-placeholder');
  const statusElement = document.getElementById('builder-status');
  const outputElement = document.querySelector('.builder-output');
  const codeElement = document.querySelector('#builder-code code');
  const altInput = document.getElementById('builder-alt') as HTMLInputElement | null;
  const linkInput = document.getElementById('builder-link') as HTMLInputElement | null;
  const openLink = document.getElementById('builder-open') as HTMLAnchorElement | null;
  const copyButton = document.getElementById('builder-copy') as HTMLButtonElement | null;
  const shareButton = document.getElementById('builder-share');
  const resetButton = document.getElementById('builder-reset');
  const stackCategorySearch = document.getElementById(
    'stack-category-search'
  ) as HTMLInputElement | null;
  const stackGroupToggle = document.getElementById(
    'stack-group-by-category'
  ) as HTMLInputElement | null;
  const reducedMotionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');

  const fieldsById = new Map<string, BuilderField>();
  const fieldElements = new Map<string, Element>();
  for (const field of schema.fields) {
    fieldsById.set(field.id, field);
    const fieldElement = form.querySelector(`[data-field="${field.id}"]`);
    if (fieldElement) {
      fieldElements.set(field.id, fieldElement);
    }
  }

  let state: BuilderState = { ...schema.initialState };
  function getState(): BuilderState {
    return state;
  }

  let stackCatalogController: ReturnType<typeof createStackCatalogController> | undefined =
    undefined;

  const typingLinesController = createTypingLinesController({
    addButton: document.getElementById('typing-line-add') as HTMLButtonElement | null,
    editorElement: document.getElementById('typing-lines-editor'),
    hiddenInput: document.getElementById('field-lines') as HTMLInputElement | null,
    listElement: document.getElementById('typing-lines-list'),
  });

  const fieldsController = createBuilderFieldsController({
    fieldElements,
    getState,
    hasPresetIcon,
    schema,
    syncStackFromDsl(value: string) {
      stackCatalogController?.syncFromDsl(value);
    },
    typingLinesController,
  });

  const kindSyncController = createKindSyncController({
    fieldElements,
    fieldsById,
    fieldsController,
    form,
    getState,
    schema,
  });

  const outputController = createBuilderOutputController({
    altInput,
    codeElement,
    copyButton,
    fieldElements,
    getState,
    linkInput,
    openLink,
    outputElement,
    previewImage,
    previewPlaceholder,
    reducedMotionQuery,
    schema,
    shareButton,
    site,
    statusElement,
  });

  const iconPickerController = createIconPickerController({
    form,
    glyphTemplates: document.getElementById('icon-glyph-templates'),
    onIndexLoaded() {
      stackCatalogController?.flushPendingChips();
    },
    picker: document.getElementById('icon-picker'),
    pickerEmpty: document.getElementById('icon-picker-empty'),
    pickerGrid: document.getElementById('icon-picker-grid'),
    pickerSearch: document.getElementById('icon-picker-search') as HTMLInputElement | null,
    pickerStatus: document.getElementById('icon-picker-status'),
    schema,
    site,
  });

  stackCatalogController = createStackCatalogController({
    createGlyph: iconPickerController.createGlyph,
    form,
    getControl: fieldsController.getControl,
    getResolver: iconPickerController.getResolver,
    getState,
    loadPage: iconPickerController.loadPage,
    stackCatalog: document.getElementById('stack-catalog'),
    stackCatalogEmpty: document.getElementById('stack-catalog-empty'),
    stackCategoriesPanel: document.getElementById('stack-panel-categories'),
    stackCategorySearch,
    stackGroupToggle,
    stackGroupToggleLabel: document.querySelector('[data-stack-group-toggle]'),
    stackRawActions: document.querySelector('[data-stack-raw-actions]'),
    stackRawPanel: document.getElementById('stack-panel-raw'),
  });

  function writeState(): void {
    if (schema.kind === 'service') {
      kindSyncController.syncServiceFields();
    } else if (schema.kind === 'typing') {
      kindSyncController.syncTypingFields();
    }
    for (const field of schema.fields) {
      if (field.id !== 'metric') {
        fieldsController.writeFieldValue(field, state[field.id] ?? '');
      }
    }
  }

  function update(scope: ParentNode): void {
    outputController.renderOutputs();
    syncSelects(scope);
    iconPickerController.syncIconSelects(scope);
    iconPickerController.validateIcons(scope);
  }

  function syncStateFromForm(): void {
    for (const field of schema.fields) {
      const fieldElement = fieldElements.get(field.id);
      if (fieldElement) {
        state[field.id] = fieldsController.readFieldValue(field, fieldElement);
      }
    }
  }

  function applyState(nextState: BuilderState): void {
    state = { ...nextState };
    if (schema.kind === 'service' && !findService(schema, state.service)) {
      state.service = schema.services?.[0]?.key ?? '';
    }
    writeState();
    syncStateFromForm();
    update(form);
  }

  function initializeState(): void {
    const pageParams = new URL(globalThis.location.href).searchParams;
    const sharedPath = pageParams.get('path');
    const parsedState = sharedPath ? parsePath(schema, sharedPath) : undefined;
    if (altInput) {
      altInput.value = pageParams.get('alt') ?? '';
    }
    if (linkInput) {
      linkInput.value = pageParams.get('link') ?? '';
    }
    outputController.setCrossBuilderNotice(
      sharedPath && !parsedState
        ? 'The shared link belongs to another builder; Showing the example instead.'
        : ''
    );
    applyState(parsedState ?? schema.initialState);
    if (schema.kind === 'stack' && parsedState) {
      stackCatalogController?.syncModeForPrefill(
        parsedState.groups ?? '',
        parsedState.perline ?? ''
      );
    }
  }

  function bindHelpPopovers(): void {
    for (const trigger of form.querySelectorAll('[data-help-popover]')) {
      if (trigger instanceof HTMLElement) {
        const popoverId = trigger.dataset.helpPopover ?? '';
        const align = trigger.dataset.helpAlign === 'start' ? 'start' : 'end';
        const popover = popoverId ? document.getElementById(popoverId) : undefined;
        if (popover instanceof HTMLElement) {
          popover.addEventListener('toggle', (event) => {
            if ((event as ToggleEvent).newState === 'open') {
              site?.placePopover(popover, trigger, { align, gap: 6 });
            }
          });
          bindPopoverFocusDismiss(popover, site, () => trigger);
        }
      }
    }
  }

  function handleFieldInput(event: Event): void {
    const target = event.target ?? undefined;
    if (
      (event.type === 'change' && !(target instanceof HTMLSelectElement)) ||
      target === stackCategorySearch ||
      target === stackGroupToggle
    ) {
      return;
    }
    const fieldElement = target instanceof Element ? target.closest('[data-field]') : undefined;
    const field = fieldsById.get(fieldElement?.getAttribute('data-field') ?? '');
    if (!fieldElement || !field) {
      return;
    }
    outputController.clearCrossBuilderNotice();
    fieldsController.syncControlPartsOnInput(field, fieldElement, target);
    state[field.id] = fieldsController.readFieldValue(field, fieldElement);
    stackCatalogController?.syncStackFieldChange(field);
    kindSyncController.syncServiceFieldChange(field);
    if (field.id === 'layout') {
      kindSyncController.syncQuoteFields();
      kindSyncController.syncTypingFields();
    } else if (field.id === 'prefix' || field.id === 'icon') {
      kindSyncController.syncTypingFields();
    }
    const hasCrossFieldSync =
      field.id === 'service' ||
      field.id === 'metric' ||
      field.id === 'layout' ||
      field.id === 'prefix' ||
      field.id === 'icon';
    update(hasCrossFieldSync ? form : fieldElement);
  }

  function bindBuilderEvents(): void {
    form.addEventListener('input', handleFieldInput);
    form.addEventListener('change', handleFieldInput);
    form.addEventListener('submit', (event) => event.preventDefault());
    altInput?.addEventListener('input', () => {
      outputController.clearCrossBuilderNotice();
      outputController.renderOutputs();
    });
    linkInput?.addEventListener('input', () => {
      outputController.clearCrossBuilderNotice();
      outputController.renderOutputs();
    });
    if (linkInput && schema.kind === 'service') {
      linkInput.placeholder = 'Upstream page of the service';
    }

    previewImage?.addEventListener('load', () => {
      previewImage.classList.remove('is-loading');
      if (!outputController.getCurrentPreviewPath()) {
        return;
      }
      if (buildPath(schema, state).missing.length === 0) {
        const notice = outputController.getCrossBuilderNotice();
        outputController.setStatus(notice, Boolean(notice));
      }
    });
    previewImage?.addEventListener('error', () => {
      previewImage.classList.remove('is-loading');
      if (!outputController.getCurrentPreviewPath()) {
        return;
      }
      outputController.setStatus('The preview could not be loaded; Check the route values.', true);
    });
    reducedMotionQuery.addEventListener('change', () =>
      outputController.loadPreview(outputController.getCurrentPreviewPath())
    );

    const tabList = outputElement?.querySelector('.builder-tabs');
    tabList?.addEventListener('click', (event) => {
      const tab =
        event.target instanceof Element ? event.target.closest('.builder-tab') : undefined;
      if (tab instanceof HTMLElement) {
        outputController.selectTab(tab);
      }
    });
    tabList?.addEventListener('keydown', (event) =>
      outputController.handleTabKeydown(event as KeyboardEvent)
    );

    form.addEventListener('click', (event) => {
      const clearButton =
        event.target instanceof Element ? event.target.closest('[data-icon-clear]') : undefined;
      const input = clearButton
        ? document.getElementById(clearButton.getAttribute('data-icon-clear') ?? '')
        : undefined;
      if (input instanceof HTMLInputElement) {
        const trigger = form.querySelector(`[data-icon-target="${input.id}"]`);
        const hasPreset = trigger instanceof HTMLElement && Boolean(trigger.dataset.presetIcon);
        input.value = hasPreset ? 'none' : '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        if (trigger instanceof HTMLElement) {
          trigger.focus();
        }
      }
    });
    bindSelects(form, site);
    bindHelpPopovers();

    resetButton?.addEventListener('click', () => {
      outputController.clearCrossBuilderNotice();
      if (altInput) {
        altInput.value = '';
      }
      if (linkInput) {
        linkInput.value = '';
      }
      stackCatalogController?.syncModeForPrefill('', '');
      if (stackCategorySearch && stackCategorySearch.value) {
        stackCategorySearch.value = '';
        stackCatalogController?.filterCatalog();
      }
      applyState({});
    });
    shareButton?.addEventListener('click', outputController.copyShareLink);
  }

  initializeState();
  bindBuilderEvents();
  stackCatalogController.bind();
  typingLinesController.bind();
  iconPickerController.bind();
  iconPickerController.loadIndexInBackground();
}

// ----------------------------------------- MAIN ----------------------------------------

if (typeof document === 'undefined') {
  globalThis.svgBuilderCore = core;
} else {
  initBuilderDom();
}
