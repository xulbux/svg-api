/**
 * Icon picker controller – Lazy icon index & body page loading, inline glyph rendering, input slug validation, and chunked grid navigation.
 */

import {
  bindPopoverFocusDismiss,
  collectStackSlugs,
  computeGridFocusIndex,
  createAsyncCache,
  createIconResolver,
  getOwnValue,
} from '@/site/client/builder/core';
import {
  createIconGlyph,
  filterIconCatalog,
  insertPickedSlugAtCursor,
  resolveIconSelectDisplay,
  resolveTriggerEffectiveSlug,
} from '@/site/client/builder/iconSearch';
import type { SvgSite } from '@/site/client/site/types';
import type {
  BuilderSchema,
  IconLocation,
  IconMatch,
  IconPickerIndex,
  IconPickerSetId,
  IconResolver,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Options for initializing the builder icon picker controller. */
interface IconPickerOptions {
  /** Builder `<form>` element. */
  form: HTMLFormElement;
  /** `<template id="icon-glyph-templates">` element holding per-set `<svg>` shells. */
  glyphTemplates: HTMLElement | null;
  /** Callback invoked when the icon index finishes loading. */
  onIndexLoaded: () => void;
  /** `#icon-picker` dialog element. */
  picker: HTMLElement | null;
  /** `#icon-picker-empty` empty-state notice element outside `role="listbox"`. */
  pickerEmpty: HTMLElement | null;
  /** `#icon-picker-grid` element. */
  pickerGrid: HTMLElement | null;
  /** `#icon-picker-search` input element. */
  pickerSearch: HTMLInputElement | null;
  /** `#icon-picker-status` footer status element. */
  pickerStatus: HTMLElement | null;
  /** Active builder schema. */
  schema: BuilderSchema;
  /** Shared site client utilities. */
  site: SvgSite | undefined;
}

/** Public controller interface returned by `createIconPickerController`. */
interface IconPickerController {
  /** Bind the icon picker popover events when `#icon-picker` and `#icon-picker-grid` exist. */
  bind: () => void;
  /** Create an inline glyph `<svg>` for an icon body from the page's glyph templates. */
  createGlyph: (set: IconPickerSetId, innerSvg: string) => SVGSVGElement;
  /** Return the loaded icon slug resolver, or `undefined` before the index loads. */
  getResolver: () => IconResolver | undefined;
  /** Start loading the icon index in the background. */
  loadIndexInBackground: () => void;
  /** Load (once per page, retried after failures) an icon body page. */
  loadPage: (iconLocation: IconLocation) => Promise<Record<string, string>>;
  /** Sync every icon selector inside a scope with its hidden input. */
  syncIconSelects: (scope: ParentNode) => void;
  /** Validate every icon input and the stack groups inside a scope. */
  validateIcons: (scope: ParentNode) => void;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Number of icon tiles appended to the picker grid per chunk. */
const PICKER_CHUNK_SIZE = 72;

/** Maximum number of unknown icon slugs listed explicitly in a validation hint. */
const MAX_LISTED_UNKNOWN_ICONS = 3;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Create the builder icon picker, glyph loader, and icon input validator controller.
 * @param options   DOM elements, schema, and callbacks.
 * @returns Icon picker controller.
 */
export function createIconPickerController(options: IconPickerOptions): IconPickerController {
  const {
    form,
    glyphTemplates,
    onIndexLoaded,
    picker,
    pickerEmpty,
    pickerGrid,
    pickerSearch,
    pickerStatus,
    schema,
    site,
  } = options;

  const iconIndexUrl = picker?.dataset.indexUrl ?? '/assets/icons.json';
  const iconVersion = new URL(iconIndexUrl, globalThis.location.href).searchParams.get('v') ?? '';

  let iconIndex: IconPickerIndex | undefined = undefined;
  let iconResolver: IconResolver | undefined = undefined;
  let pickerCatalog: Record<IconPickerSetId, string[]> | undefined = undefined;

  let pickerTarget: HTMLElement | undefined = undefined;
  let pickerTrigger: HTMLElement | undefined = undefined;
  let isPickerInsertMode = false;
  let pickerMatches: IconMatch[] = [];
  let pickerRendered = 0;
  let pickerSelectedSlug = '';
  let pickerSearchFrame = 0;
  let tileObserver: IntersectionObserver | undefined = undefined;
  let sentinelObserver: IntersectionObserver | undefined = undefined;

  const loadIconIndexOnce = createAsyncCache(() =>
    fetch(iconIndexUrl).then((response) => {
      if (!response.ok) {
        throw new Error(`Icon index request failed (${response.status})`);
      }
      return response.json() as Promise<IconPickerIndex>;
    })
  );

  const loadIconPageOnce = createAsyncCache((key) =>
    fetch(`/assets/icons-${key}.json?v=${iconVersion}`).then((response) => {
      if (!response.ok) {
        throw new Error(`Icon page request failed (${response.status})`);
      }
      return response.json() as Promise<Record<string, string>>;
    })
  );

  function loadIconIndex(): Promise<IconPickerIndex> {
    return loadIconIndexOnce('').then((index) => {
      if (!iconIndex) {
        const resolver = createIconResolver(index, schema.maxIconSlugLength);
        const catalog: Record<IconPickerSetId, string[]> = { brands: [], lucide: [] };
        for (const set of ['lucide', 'brands'] as const) {
          for (const slug of index.sets[set]) {
            // Only offer icons that render as shown (e.g., Lucide wins slug collisions outside tech stacks):
            if (resolver.resolve(slug, schema.isBrandFirst) === set) {
              catalog[set].push(slug);
            }
          }
        }
        iconIndex = index;
        iconResolver = resolver;
        pickerCatalog = catalog;
      }
      return index;
    });
  }

  function loadIconPage(iconLocation: IconLocation): Promise<Record<string, string>> {
    return loadIconPageOnce(`${iconLocation.set}-${iconLocation.page}`);
  }

  function createGlyph(set: IconPickerSetId, innerSvg: string): SVGSVGElement {
    return createIconGlyph(glyphTemplates, set, innerSvg);
  }

  function renderInputGlyph(container: HTMLElement, slug: string): void {
    const glyphLocation = iconResolver?.locate(slug, schema.isBrandFirst);
    container.replaceChildren();
    if (!glyphLocation) {
      return;
    }
    loadIconPage(glyphLocation).then(
      (bodies) => {
        const body = getOwnValue(bodies, glyphLocation.slug);
        if (body && container.dataset.slug === slug) {
          container.replaceChildren(createGlyph(glyphLocation.set, body));
        }
      },
      () => {
        // Render again on the next change (the failed page is retried then):
        delete container.dataset.slug;
      }
    );
  }

  function validateIconInput(hint: Element, resolver: IconResolver): void {
    const inputId = hint.getAttribute('data-validation-for') ?? '';
    const input = document.getElementById(inputId);
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
      return;
    }
    const value = input.value.trim();
    const slugs = input instanceof HTMLTextAreaElement ? collectStackSlugs(value) : [value];
    const unknown: string[] = [];
    for (const slug of slugs) {
      if (slug && resolver.resolve(slug, schema.isBrandFirst) === undefined) {
        unknown.push(slug);
      }
    }
    const hasUnknown = unknown.length > 0;
    const more = unknown.length > MAX_LISTED_UNKNOWN_ICONS ? ', …' : '';
    hint.textContent = hasUnknown
      ? `Unknown icon${unknown.length > 1 ? 's' : ''}: ${unknown.slice(0, MAX_LISTED_UNKNOWN_ICONS).join(', ')}${more} (renders a fallback).`
      : '';
    hint.classList.toggle('is-warning', hasUnknown);
    const invalidContainer = hint.closest('.icon-input') ?? hint.closest('[data-field]');
    invalidContainer?.classList.toggle('is-invalid', hasUnknown);
    const interactiveControl =
      input instanceof HTMLInputElement && input.type === 'hidden'
        ? form.querySelector(`[data-icon-target="${inputId}"]`)
        : input;
    if (interactiveControl instanceof HTMLElement) {
      if (hasUnknown) {
        interactiveControl.setAttribute('aria-invalid', 'true');
      } else if (!interactiveControl.closest('.is-missing')) {
        interactiveControl.removeAttribute('aria-invalid');
      }
    }
  }

  function syncIconSelects(scope: ParentNode): void {
    for (const trigger of scope.querySelectorAll('.icon-select-trigger')) {
      const triggerElement = trigger instanceof HTMLElement ? trigger : undefined;
      const inputId = triggerElement?.dataset.iconTarget ?? '';
      const input = document.getElementById(inputId);
      const valueElement = trigger.querySelector('.icon-select-value');
      if (input instanceof HTMLInputElement && valueElement instanceof HTMLElement) {
        const display = resolveIconSelectDisplay(
          triggerElement,
          input.value,
          valueElement.dataset.placeholder ?? ''
        );
        valueElement.textContent = display.displayLabel;
        valueElement.classList.toggle('is-placeholder', display.isPlaceholder);
        form
          .querySelector(`[data-icon-clear="${inputId}"]`)
          ?.toggleAttribute('hidden', display.isPlaceholder);
        const glyph = trigger.querySelector('[data-glyph-for]');
        // Glyphs need the icon index; they are rendered again once it has loaded:
        if (
          glyph instanceof HTMLElement &&
          iconResolver &&
          glyph.dataset.slug !== display.glyphSlug
        ) {
          glyph.dataset.slug = display.glyphSlug;
          renderInputGlyph(glyph, display.glyphSlug);
        }
      }
    }
  }

  function validateIcons(scope: ParentNode): void {
    const resolver = iconResolver;
    if (resolver) {
      for (const hint of scope.querySelectorAll('[data-validation-for]')) {
        validateIconInput(hint, resolver);
      }
    }
  }

  function updatePickerTabLabels(counts: Record<IconPickerSetId, number> | undefined): void {
    for (const labelSpan of picker?.querySelectorAll('[data-picker-tab-label]') ?? []) {
      if (labelSpan instanceof HTMLElement) {
        const setId = labelSpan.dataset.pickerTabLabel;
        const baseLabel = labelSpan.dataset.label ?? '';
        labelSpan.textContent =
          counts && (setId === 'lucide' || setId === 'brands')
            ? `${baseLabel} (${counts[setId].toLocaleString('en-US')})`
            : baseLabel;
      }
    }
  }

  function computePickerMatches(
    index: IconPickerIndex,
    catalog: Record<IconPickerSetId, string[]>
  ): IconMatch[] {
    const checkedTab = picker?.querySelector('input[name="icon-picker-set"]:checked');
    const activeSet: IconPickerSetId =
      checkedTab instanceof HTMLInputElement && checkedTab.value === 'brands' ? 'brands' : 'lucide';
    const { counts, matches } = filterIconCatalog(
      index,
      catalog,
      activeSet,
      pickerSearch?.value ?? ''
    );
    updatePickerTabLabels(counts);
    return matches;
  }

  function fillTile(tile: HTMLElement): void {
    const tileLocation = iconResolver?.locate(tile.dataset.slug ?? '', schema.isBrandFirst);
    if (!tileLocation || tile.dataset.filled) {
      return;
    }
    tile.dataset.filled = 'true';
    loadIconPage(tileLocation).then(
      (bodies) => {
        const body = getOwnValue(bodies, tileLocation.slug);
        if (body) {
          tile.replaceChildren(createGlyph(tileLocation.set, body));
        }
      },
      () => {
        delete tile.dataset.filled;
      }
    );
  }

  function renderPickerChunk(): void {
    if (!pickerGrid) {
      return;
    }
    const fragment = document.createDocumentFragment();
    const end = Math.min(pickerMatches.length, pickerRendered + PICKER_CHUNK_SIZE);
    for (let i = pickerRendered; i < end; i += 1) {
      const match = pickerMatches[i];
      if (match === undefined) {
        break;
      }
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'icon-tile';
      tile.dataset.index = String(i);
      tile.dataset.slug = match.slug;
      tile.setAttribute('role', 'option');
      tile.setAttribute('aria-label', match.slug);
      tile.setAttribute('aria-selected', String(match.slug === pickerSelectedSlug));
      tile.title = match.slug;
      tile.tabIndex = -1;
      fragment.append(tile);
      tileObserver?.observe(tile);
    }
    pickerGrid.querySelector('.icon-picker-sentinel')?.remove();
    pickerGrid.append(fragment);
    pickerRendered = end;
    if (pickerRendered < pickerMatches.length) {
      const sentinel = document.createElement('div');
      sentinel.className = 'icon-picker-sentinel';
      sentinel.setAttribute('aria-hidden', 'true');
      sentinel.setAttribute('role', 'presentation');
      pickerGrid.append(sentinel);
      sentinelObserver?.observe(sentinel);
    }
  }

  function renderPickerUntil(index: number): void {
    while (pickerRendered <= index && pickerRendered < pickerMatches.length) {
      renderPickerChunk();
    }
  }

  function getTileAt(index: number): HTMLElement | undefined {
    const tile = pickerGrid?.children[index];
    return tile instanceof HTMLElement && tile.classList.contains('icon-tile') ? tile : undefined;
  }

  function setRovingTile(tile: HTMLElement, isFocused: boolean): void {
    for (const otherTile of pickerGrid?.querySelectorAll('.icon-tile[tabindex="0"]') ?? []) {
      if (otherTile instanceof HTMLElement) {
        otherTile.tabIndex = -1;
      }
    }
    tile.tabIndex = 0;
    if (isFocused) {
      tile.focus();
    }
  }

  function renderPickerEmpty(): void {
    if (!pickerEmpty) {
      return;
    }
    pickerEmpty.replaceChildren('No icons found.');
    if (pickerSearch?.value.trim()) {
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'text-btn';
      clearButton.dataset.pickerClear = 'true';
      clearButton.textContent = 'Clear search';
      pickerEmpty.append(' ', clearButton);
    }
    pickerEmpty.hidden = false;
  }

  function findSelectedMatchIndex(): number {
    if (!pickerSelectedSlug) {
      return -1;
    }
    return pickerMatches.findIndex((match) => match.slug === pickerSelectedSlug);
  }

  function renderPicker(isOpening: boolean): void {
    if (!iconIndex || !pickerCatalog || !pickerGrid) {
      return;
    }
    pickerSearchFrame = 0;
    const rawSlug =
      !isPickerInsertMode && pickerTarget instanceof HTMLInputElement ? pickerTarget.value : '';
    const activeSlug = resolveTriggerEffectiveSlug(pickerTrigger, rawSlug, false);
    pickerSelectedSlug = iconResolver?.locate(activeSlug, schema.isBrandFirst)?.slug ?? '';
    pickerMatches = computePickerMatches(iconIndex, pickerCatalog);
    pickerRendered = 0;
    // Disconnect before dropping the old tiles, so detached tiles are never kept alive by the observers:
    tileObserver?.disconnect();
    sentinelObserver?.disconnect();
    pickerGrid.replaceChildren();
    pickerGrid.scrollTop = 0;
    const hasMatches = pickerMatches.length > 0;
    pickerGrid.hidden = !hasMatches;
    if (!hasMatches) {
      renderPickerEmpty();
    } else {
      if (pickerEmpty) {
        pickerEmpty.hidden = true;
        pickerEmpty.replaceChildren();
      }
      const selectedIndex = isOpening ? findSelectedMatchIndex() : -1;
      renderPickerUntil(Math.max(0, selectedIndex));
      const rovingTile = getTileAt(Math.max(0, selectedIndex));
      if (rovingTile) {
        setRovingTile(rovingTile, false);
        if (selectedIndex > 0) {
          rovingTile.scrollIntoView({ block: 'center' });
        }
      }
    }
    if (pickerStatus) {
      pickerStatus.textContent =
        pickerMatches.length === 0
          ? 'No icons found.'
          : `${pickerMatches.length.toLocaleString('en-US')} icon${pickerMatches.length === 1 ? '' : 's'}`;
    }
  }

  function scheduleRenderPicker(): void {
    cancelAnimationFrame(pickerSearchFrame);
    pickerSearchFrame = requestAnimationFrame(() => renderPicker(false));
  }

  function resolveStaticPresetCanonical(): string {
    const presetIcon = pickerTrigger?.dataset.presetIcon?.trim() ?? '';
    if (!presetIcon || pickerTrigger?.dataset.presetDynamic === 'true') {
      return '';
    }
    return iconResolver?.locate(presetIcon, schema.isBrandFirst)?.slug ?? presetIcon.toLowerCase();
  }

  function applyPickedSlug(slug: string): void {
    const target = pickerTarget;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }
    if (isPickerInsertMode) {
      insertPickedSlugAtCursor(target, slug);
    } else {
      const presetCanonical = resolveStaticPresetCanonical();
      target.value = presetCanonical && slug.toLowerCase() === presetCanonical ? '' : slug;
    }
    target.dispatchEvent(new Event('input', { bubbles: true }));
    if (picker) {
      site?.closePopover(picker);
    }
    (target instanceof HTMLTextAreaElement ? target : (pickerTrigger ?? target)).focus();
  }

  function getPickerColumns(): number {
    if (!pickerGrid) {
      return 1;
    }
    return Math.max(1, getComputedStyle(pickerGrid).gridTemplateColumns.split(' ').length);
  }

  function targetPicker(button: HTMLElement): void {
    pickerTarget = document.getElementById(button.dataset.iconTarget ?? '') ?? undefined;
    pickerTrigger = button;
    isPickerInsertMode = button.dataset.iconInsert === 'true';
  }

  function syncPickerTabForTarget(): void {
    const rawSlug =
      !isPickerInsertMode && pickerTarget instanceof HTMLInputElement ? pickerTarget.value : '';
    const currentSlug = resolveTriggerEffectiveSlug(pickerTrigger, rawSlug, true);
    const targetSet =
      iconResolver?.locate(currentSlug, schema.isBrandFirst)?.set ??
      (schema.isBrandFirst ? 'brands' : 'lucide');
    const tabInput = picker?.querySelector(`input[name="icon-picker-set"][value="${targetSet}"]`);
    if (tabInput instanceof HTMLInputElement) {
      tabInput.checked = true;
    }
  }

  function handleIndexReady(shouldSyncTab: boolean): void {
    syncIconSelects(form);
    validateIcons(form);
    onIndexLoaded();
    if (picker && site?.isPopoverOpen(picker)) {
      if (shouldSyncTab) {
        syncPickerTabForTarget();
      }
      renderPicker(true);
    }
  }

  function openPicker(): void {
    if (picker && pickerTrigger) {
      site?.placePopover(picker, pickerTrigger, { gap: 6 });
    }
    if (pickerSearch) {
      pickerSearch.value = '';
      pickerSearch.focus();
    }
    syncPickerTabForTarget();
    if (iconIndex) {
      renderPicker(true);
      return;
    }
    if (pickerStatus) {
      pickerStatus.textContent = 'Loading icons…';
    }
    loadIconIndex().then(
      () => handleIndexReady(true),
      () => {
        if (pickerStatus) {
          pickerStatus.textContent = 'Icons could not be loaded; Reopen the picker to retry.';
        }
      }
    );
  }

  function handlePickerSearchKeydown(event: KeyboardEvent): void {
    if (event.isComposing) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault();
      if (pickerSearchFrame) {
        cancelAnimationFrame(pickerSearchFrame);
        renderPicker(false);
      }
      if (event.key === 'ArrowDown') {
        const rovingTile = pickerGrid?.querySelector('.icon-tile[tabindex="0"]');
        if (rovingTile instanceof HTMLElement) {
          rovingTile.focus();
        }
      } else {
        const [firstMatch] = pickerMatches;
        if (firstMatch) {
          applyPickedSlug(firstMatch.slug);
        }
      }
    }
  }

  function handlePickerGridKeydown(event: KeyboardEvent): void {
    const tile =
      event.target instanceof HTMLElement ? event.target.closest('.icon-tile') : undefined;
    if (!(tile instanceof HTMLElement)) {
      return;
    }
    const targetIndex = computeGridFocusIndex(
      event.key,
      Number(tile.dataset.index ?? 0),
      getPickerColumns(),
      pickerMatches.length
    );
    if (targetIndex === undefined) {
      return;
    }
    event.preventDefault();
    renderPickerUntil(targetIndex);
    const targetTile = getTileAt(targetIndex);
    if (targetTile) {
      setRovingTile(targetTile, true);
    }
  }

  function showTileSlug(event: Event): void {
    const tile = event.target instanceof Element ? event.target.closest('.icon-tile') : undefined;
    if (tile instanceof HTMLElement && pickerStatus) {
      pickerStatus.textContent = tile.dataset.slug ?? '';
    }
  }

  function bindIconPicker(pickerElement: HTMLElement, gridElement: HTMLElement): void {
    tileObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            fillTile(entry.target);
            tileObserver?.unobserve(entry.target);
          }
        }
      },
      { root: gridElement, rootMargin: '160px 0px' }
    );
    sentinelObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            renderPickerChunk();
            return;
          }
        }
      },
      { root: gridElement, rootMargin: '240px 0px' }
    );

    document.addEventListener(
      'click',
      (event) => {
        const button =
          event.target instanceof Element ? event.target.closest('[data-icon-target]') : undefined;
        if (button instanceof HTMLElement) {
          const isSwitchingOpenTarget =
            Boolean(site?.isPopoverOpen(pickerElement)) && button !== pickerTrigger;
          targetPicker(button);
          if (isSwitchingOpenTarget) {
            event.preventDefault();
            openPicker();
          }
        }
      },
      true
    );
    pickerElement.addEventListener('toggle', (event) => {
      if ((event as ToggleEvent).newState === 'open') {
        openPicker();
      } else if (pickerSearchFrame) {
        cancelAnimationFrame(pickerSearchFrame);
        pickerSearchFrame = 0;
      }
    });
    bindPopoverFocusDismiss(pickerElement, site, () => pickerTrigger);
    pickerElement.addEventListener('change', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.name === 'icon-picker-set') {
        renderPicker(false);
      }
    });
    pickerSearch?.addEventListener('input', scheduleRenderPicker);
    pickerSearch?.addEventListener('keydown', handlePickerSearchKeydown);

    pickerElement.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (target?.closest('[data-picker-clear]') && pickerSearch) {
        pickerSearch.value = '';
        pickerSearch.focus();
        renderPicker(false);
      }
    });
    gridElement.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : undefined;
      const tile = target?.closest('.icon-tile');
      if (tile instanceof HTMLElement && tile.dataset.slug) {
        applyPickedSlug(tile.dataset.slug);
      }
    });
    gridElement.addEventListener('keydown', handlePickerGridKeydown);
    gridElement.addEventListener('focusin', showTileSlug);
    gridElement.addEventListener('pointerover', showTileSlug);
  }

  return {
    bind() {
      if (picker && pickerGrid) {
        bindIconPicker(picker, pickerGrid);
      }
    },
    createGlyph,
    getResolver() {
      return iconResolver;
    },
    loadIndexInBackground() {
      loadIconIndex().then(
        () => handleIndexReady(false),
        () => undefined
      );
    },
    loadPage: loadIconPage,
    syncIconSelects,
    validateIcons,
  };
}
