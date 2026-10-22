/**
 * URL builder client entry point – Form state synchronization, live SVG preview debouncing, snippet tabs, shareable links, and modular select/icon/stack controllers for `/builder/:kind`.
 */

import {
  buildAltText,
  buildDefaultLinkTarget,
  buildPath,
  buildPreviewPath,
  buildShareUrl,
  buildSnippetTokens,
  composeAnim,
  composeIconPair,
  composeSpecial,
  core,
  findOption,
  findService,
  parsePath,
  readState,
  splitAnim,
  splitIconPair,
  splitSize,
  splitSpecial,
} from '@/site/client/builder/core';
import { createIconPickerController } from '@/site/client/builder/iconPicker';
import {
  bindSelects,
  setSelectOptions,
  syncSelect,
  syncSelects,
} from '@/site/client/builder/select';
import { createStackCatalogController } from '@/site/client/builder/stackCatalog';
import type {
  BuilderBuildResult,
  BuilderField,
  BuilderOption,
  BuilderSchema,
  BuilderState,
  HighlightToken,
  SnippetSet,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Single native form control of a builder field. */
type FieldControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

// ---------------------------------------- CONSTS ---------------------------------------

/** Debounce delay in milliseconds before reloading the live SVG preview and updating `history.replaceState`. */
const PREVIEW_DEBOUNCE_MS = 180;

// -------------------------------------- INTERNALS --------------------------------------

/** Find a part control of a field element. */
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
  const picker = document.getElementById('icon-picker');
  const pickerGrid = document.getElementById('icon-picker-grid');
  const pickerSearch = document.getElementById('icon-picker-search') as HTMLInputElement | null;
  const pickerStatus = document.getElementById('icon-picker-status');
  const pickerNoneButton = document.getElementById('icon-picker-none');
  const glyphTemplates = document.getElementById('icon-glyph-templates');
  const stackCatalog = document.getElementById('stack-catalog');
  const stackCategorySearch = document.getElementById(
    'stack-category-search'
  ) as HTMLInputElement | null;
  const stackCatalogEmpty = document.getElementById('stack-catalog-empty');
  const stackGroupToggle = document.getElementById(
    'stack-group-by-category'
  ) as HTMLInputElement | null;
  const stackGroupToggleLabel = document.querySelector('[data-stack-group-toggle]');
  const stackCategoriesPanel = document.getElementById('stack-panel-categories');
  const stackRawPanel = document.getElementById('stack-panel-raw');
  const stackRawActions = document.querySelector('[data-stack-raw-actions]');
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

  const controlCache = new Map<string, FieldControl | undefined>();

  let state: BuilderState = { ...schema.initialState };
  let snippetFormat: keyof SnippetSet = 'markdown';
  let lastPreviewSrc = '';
  let currentPreviewPath = '';
  let previewTimer = 0;

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

  let stackCatalogController: ReturnType<typeof createStackCatalogController> | undefined =
    undefined;

  const iconPickerController = createIconPickerController({
    form,
    glyphTemplates,
    onIndexLoaded() {
      stackCatalogController?.flushPendingChips();
    },
    picker,
    pickerGrid,
    pickerNoneButton,
    pickerSearch,
    pickerStatus,
    schema,
    site,
  });

  stackCatalogController = createStackCatalogController({
    createGlyph: iconPickerController.createGlyph,
    form,
    getControl,
    getResolver: iconPickerController.getResolver,
    getState() {
      return state;
    },
    loadPage: iconPickerController.loadPage,
    stackCatalog,
    stackCatalogEmpty,
    stackCategoriesPanel,
    stackCategorySearch,
    stackGroupToggle,
    stackGroupToggleLabel,
    stackRawActions,
    stackRawPanel,
  });

  function getActiveAutoSpecials(): readonly string[] {
    if (schema.kind !== 'service') {
      return [];
    }
    const service = findService(schema, state.service);
    const metric = findOption(service?.metrics, state.metric ?? '');
    return metric?.autoSpecials ?? [];
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
        return checked instanceof HTMLInputElement ? checked.value : '';
      }
      case 'icon': {
        return readPartValue('main').trim();
      }
      case 'iconPair': {
        return composeIconPair(readPartValue('left'), readPartValue('right'), hasPresetIcon);
      }
      case 'size': {
        const preset = readPartValue('preset');
        return preset === 'custom' ? readPartValue('custom').trim() : preset;
      }
      case 'special': {
        const kind = readPartValue('kind');
        return composeSpecial(
          kind,
          readPartValue('payload'),
          readPartValue('modifier'),
          Boolean(kind && getActiveAutoSpecials().includes(kind))
        );
      }
      default: {
        return getControl(field.id)?.value ?? '';
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
    if (!kind && schema.kind === 'service') {
      const service = findService(schema, state.service);
      const metric = findOption(service?.metrics, state.metric ?? '');
      if (metric?.defaultSpecial) {
        return `Uses the metric's default ${metric.defaultSpecial} widget; Pick another Auto widget or enter custom Data.`;
      }
      if (getActiveAutoSpecials().length === 0) {
        return 'Optional inline chart, gauge, or delta pill next to the badge value.';
      }
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

  function syncServiceSpecialOptions(): void {
    const specialField = fieldsById.get('special');
    const specialElement = fieldElements.get('special');
    if (!specialField || !specialElement) {
      return;
    }
    const service = findService(schema, state.service);
    const metric = findOption(service?.metrics, state.metric ?? '');
    const autoSpecials = getActiveAutoSpecials();
    const kindSelect = getPart(specialElement, 'kind');
    if (kindSelect instanceof HTMLSelectElement) {
      for (const option of kindSelect.options) {
        if (!option.value) {
          option.text = metric?.defaultSpecial ? `Default (${metric.defaultSpecial})` : 'Default';
        } else if (autoSpecials.includes(option.value)) {
          option.dataset.badge = 'Auto';
        } else {
          delete option.dataset.badge;
        }
      }
      const wrapper = kindSelect.closest('[data-select]');
      if (wrapper) {
        syncSelect(wrapper);
      }
    }
    const modifier = getPart(specialElement, 'modifier')?.value ?? '';
    syncSpecialParts(specialField, specialElement, modifier);
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
      control.toggleAttribute('aria-required', isRequired);
    }
  }

  function syncServiceFields(): void {
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
    syncServiceSpecialOptions();
  }

  function writeFieldValue(field: BuilderField, value: string): void {
    const fieldElement = fieldElements.get(field.id);
    if (!fieldElement) {
      return;
    }

    switch (field.control) {
      case 'anim': {
        const anim = splitAnim(value);
        const sheen = getPart(fieldElement, 'sheen');
        if (sheen instanceof HTMLInputElement) {
          sheen.checked = anim.hasSheen;
        }
        setPartValue(fieldElement, 'left', anim.left);
        setPartValue(fieldElement, 'right', anim.right);
        break;
      }
      case 'color': {
        for (const radio of fieldElement.querySelectorAll('input[type="radio"]')) {
          if (radio instanceof HTMLInputElement) {
            radio.checked = radio.value === value;
          }
        }
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
        const size = splitSize(value, field.options ?? []);
        setPartValue(fieldElement, 'preset', size.preset);
        setPartValue(fieldElement, 'custom', size.custom);
        syncSizeParts(fieldElement);
        break;
      }
      case 'special': {
        const special = splitSpecial(value, field.options ?? []);
        setPartValue(fieldElement, 'kind', special.kind);
        setPartValue(fieldElement, 'payload', special.payload);
        syncSpecialParts(field, fieldElement, special.modifier);
        break;
      }
      default: {
        const control = getControl(field.id);
        if (control instanceof HTMLSelectElement) {
          control.value = value;
          if (control.selectedIndex < 0 && control.options.length > 0) {
            control.selectedIndex = 0;
          }
        } else if (control) {
          control.value = value;
        }
        if (field.control === 'stackGroups') {
          stackCatalogController?.syncFromDsl(value);
        }
      }
    }
  }

  function writeState(): void {
    if (schema.kind === 'service') {
      syncServiceFields();
    }
    for (const field of schema.fields) {
      if (field.id !== 'metric') {
        writeFieldValue(field, state[field.id] ?? '');
      }
    }
  }

  function renderCode(tokens: readonly HighlightToken[]): void {
    if (!codeElement) {
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const [className, text] of tokens) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      fragment.append(span);
    }
    codeElement.replaceChildren(fragment);
  }

  function setStatus(message: string, isWarning = false): void {
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.classList.toggle('is-warning', isWarning);
    }
  }

  function loadPreview(path: string): void {
    currentPreviewPath = path;
    const previewSrc = buildPreviewPath(path, reducedMotionQuery.matches);
    if (!previewImage || previewSrc === lastPreviewSrc) {
      return;
    }
    lastPreviewSrc = previewSrc;
    previewImage.toggleAttribute('hidden', !previewSrc);
    previewPlaceholder?.toggleAttribute('hidden', Boolean(previewSrc));
    if (previewSrc) {
      previewImage.classList.add('is-loading');
      previewImage.src = previewSrc;
    }
  }

  function syncOutputAvailability(result: BuilderBuildResult): void {
    const isComplete = result.missing.length === 0;
    const service = schema.kind === 'service' ? findService(schema, state.service) : undefined;
    for (const field of schema.fields) {
      const isRequired =
        field.isRequired || (field.id === 'owner' && service?.ownerMode === 'required');
      const isMissing = isRequired && !readState(state, field.id);
      fieldElements.get(field.id)?.classList.toggle('is-missing', isMissing);
    }
    if (openLink) {
      if (isComplete) {
        openLink.href = result.path;
        openLink.tabIndex = 0;
        openLink.removeAttribute('aria-disabled');
      } else {
        openLink.removeAttribute('href');
        openLink.tabIndex = -1;
        openLink.setAttribute('aria-disabled', 'true');
      }
    }
    if (copyButton) {
      copyButton.disabled = !isComplete;
    }
    outputElement?.classList.toggle('is-incomplete', !isComplete);
    setStatus(
      isComplete
        ? ''
        : `Required: ${result.missing.join(', ')}. Fill in every required field to preview and copy the snippet.`,
      !isComplete
    );
  }

  function readSnippetOptions(): { alt: string; link: string } {
    return { alt: (altInput?.value ?? '').trim(), link: (linkInput?.value ?? '').trim() };
  }

  function renderOutputs(): void {
    const result = buildPath(schema, state);
    const isComplete = result.missing.length === 0;
    const absoluteUrl = `${schema.origin}${result.path}`;
    const autoAlt = buildAltText(schema, state);
    const options = readSnippetOptions();
    const alt = options.alt || autoAlt;
    if (altInput) {
      altInput.placeholder = autoAlt;
    }
    if (previewImage) {
      previewImage.alt = alt;
    }
    const link = options.link || buildDefaultLinkTarget(schema, state, absoluteUrl);
    renderCode(buildSnippetTokens(absoluteUrl, alt, link)[snippetFormat]);
    syncOutputAvailability(result);

    clearTimeout(previewTimer);
    previewTimer = globalThis.setTimeout(() => {
      loadPreview(isComplete ? result.path : '');
      history.replaceState(
        history.state,
        '',
        buildShareUrl(globalThis.location.href, result.path, options.alt, options.link)
      );
    }, PREVIEW_DEBOUNCE_MS);
  }

  function update(scope: ParentNode): void {
    renderOutputs();
    syncSelects(scope);
    iconPickerController.syncIconSelects(scope);
    iconPickerController.validateIcons(scope);
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
        }
      }
    }
  }

  function syncServiceFieldChange(field: BuilderField): void {
    if (field.id === 'service') {
      syncServiceFields();
    } else if (field.id === 'metric') {
      syncServiceSpecialOptions();
    } else {
      return;
    }
    const specialField = fieldsById.get('special');
    const specialElement = fieldElements.get('special');
    if (specialField && specialElement) {
      state.special = readFieldValue(specialField, specialElement);
    }
  }

  function handleFieldInput(event: Event): void {
    const { target } = event;
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
    state[field.id] = readFieldValue(field, fieldElement);
    stackCatalogController?.syncStackFieldChange(field);
    syncServiceFieldChange(field);
    update(fieldElement);
  }

  function selectTab(tab: HTMLElement): void {
    const { format } = tab.dataset;
    snippetFormat = format === 'html' || format === 'url' ? format : 'markdown';
    for (const otherTab of document.querySelectorAll('.builder-tab')) {
      const isSelected = otherTab === tab;
      otherTab.classList.toggle('is-active', isSelected);
      otherTab.setAttribute('aria-selected', String(isSelected));
      otherTab.setAttribute('tabindex', isSelected ? '0' : '-1');
    }
    document.getElementById('builder-code')?.setAttribute('aria-labelledby', tab.id);
    renderOutputs();
  }

  function syncStateFromForm(): void {
    for (const field of schema.fields) {
      const fieldElement = fieldElements.get(field.id);
      if (fieldElement) {
        state[field.id] = readFieldValue(field, fieldElement);
      }
    }
  }

  function applyState(nextState: BuilderState): void {
    state = { ...nextState };
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
    applyState(parsedState ?? schema.initialState);
    if (sharedPath && !parsedState) {
      setStatus('The shared link belongs to another builder; Showing the example instead.', true);
    }
  }

  function copyShareLink(): void {
    const options = readSnippetOptions();
    if (shareButton) {
      site?.copyText(
        buildShareUrl(
          globalThis.location.href,
          buildPath(schema, state).path,
          options.alt,
          options.link
        ),
        shareButton
      );
    }
  }

  function handleTabKeydown(event: KeyboardEvent): void {
    const offsets: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };
    const offset = offsets[event.key];
    if (offset === undefined) {
      return;
    }
    const tabs = [...document.querySelectorAll('.builder-tab')];
    let current = 0;
    for (const [i, tab] of tabs.entries()) {
      if (tab.getAttribute('aria-selected') === 'true') {
        current = i;
      }
    }
    const next = tabs[(current + offset + tabs.length) % tabs.length];
    if (next instanceof HTMLElement) {
      selectTab(next);
      next.focus();
    }
  }

  function bindBuilderEvents(): void {
    form.addEventListener('input', handleFieldInput);
    form.addEventListener('change', handleFieldInput);
    form.addEventListener('submit', (event) => event.preventDefault());
    altInput?.addEventListener('input', renderOutputs);
    linkInput?.addEventListener('input', renderOutputs);
    if (linkInput && schema.kind === 'service') {
      linkInput.placeholder = 'Upstream page of the service';
    }

    previewImage?.addEventListener('load', () => {
      previewImage.classList.remove('is-loading');
      if (buildPath(schema, state).missing.length === 0) {
        setStatus('');
      }
    });
    previewImage?.addEventListener('error', () => {
      previewImage.classList.remove('is-loading');
      setStatus('The preview could not be loaded; Check the route values.', true);
    });
    reducedMotionQuery.addEventListener('change', () => loadPreview(currentPreviewPath));

    const tabList = outputElement?.querySelector('.builder-tabs');
    tabList?.addEventListener('click', (event) => {
      const tab =
        event.target instanceof Element ? event.target.closest('.builder-tab') : undefined;
      if (tab instanceof HTMLElement) {
        selectTab(tab);
      }
    });
    tabList?.addEventListener('keydown', (event) => handleTabKeydown(event as KeyboardEvent));

    form.addEventListener('click', (event) => {
      const clearButton =
        event.target instanceof Element ? event.target.closest('[data-icon-clear]') : undefined;
      const input = clearButton
        ? document.getElementById(clearButton.getAttribute('data-icon-clear') ?? '')
        : undefined;
      if (input instanceof HTMLInputElement) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const trigger = form.querySelector(`[data-icon-target="${input.id}"]`);
        if (trigger instanceof HTMLElement) {
          trigger.focus();
        }
      }
    });
    bindSelects(form, site);
    bindHelpPopovers();

    resetButton?.addEventListener('click', () => {
      if (altInput) {
        altInput.value = '';
      }
      if (linkInput) {
        linkInput.value = '';
      }
      if (stackCategorySearch && stackCategorySearch.value) {
        stackCategorySearch.value = '';
        stackCatalogController?.filterCatalog();
      }
      applyState({});
    });
    shareButton?.addEventListener('click', copyShareLink);
  }

  initializeState();
  bindBuilderEvents();
  stackCatalogController.bind();
  iconPickerController.bind();
  iconPickerController.loadIndexInBackground();
}

// ----------------------------------------- MAIN ----------------------------------------

if (typeof document === 'undefined') {
  globalThis.svgBuilderCore = core;
} else {
  initBuilderDom();
}
