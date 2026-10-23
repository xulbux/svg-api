/**
 * Custom dropdown controller – Lazy option rendering, search filtering, keyboard navigation, and native `<select>` synchronization for `[data-select]` controls.
 */

import type { SvgSite } from '@/site/client/site/types';
import type { BuilderOption } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Cached elements of a custom dropdown (`[data-select]`). */
export interface SelectParts {
  /** Empty-state notice element outside `role="listbox"` (`[data-select-empty]`). */
  empty: HTMLElement | null;
  /** Options container (`.select-options`). */
  list: HTMLElement | null;
  /** Popover menu (`.select-menu`). */
  menu: HTMLElement | null;
  /** Optional search input (`.select-search-input`). */
  search: HTMLInputElement | null;
  /** Underlying native `<select>`. */
  select: HTMLSelectElement | null;
  /** Trigger button (`.select-trigger`). */
  trigger: HTMLButtonElement | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Cached dropdown part lookups keyed by `[data-select]` wrapper element. */
const selectPartsCache = new WeakMap<Element, SelectParts>();

// -------------------------------------- INTERNALS --------------------------------------

/** Find (once) the parts of a custom dropdown (`[data-select]`). */
function getSelectParts(wrapper: Element): SelectParts {
  let parts = selectPartsCache.get(wrapper);
  if (!parts) {
    parts = {
      empty: wrapper.querySelector('[data-select-empty]'),
      list: wrapper.querySelector('.select-options'),
      menu: wrapper.querySelector('.select-menu'),
      search: wrapper.querySelector('.select-search-input'),
      select: wrapper.querySelector('select'),
      trigger: wrapper.querySelector('.select-trigger'),
    };
    selectPartsCache.set(wrapper, parts);
  }
  return parts;
}

/** Create a color swatch dot (dropdown options with a `data-swatch` color). */
function createSwatch(color: string): HTMLSpanElement {
  const swatch = document.createElement('span');
  swatch.className = 'select-swatch';
  swatch.setAttribute('aria-hidden', 'true');
  swatch.style.setProperty('--swatch', color);
  return swatch;
}

/**
 * Render the listbox options of a custom dropdown from its native `<select>`, filtered by the search query
 * (only while the menu is open).
 */
function renderSelectOptions(wrapper: Element): void {
  const { empty, list, search, select } = getSelectParts(wrapper);
  if (!list || !select) {
    return;
  }
  const query = (search?.value ?? '').trim().toLowerCase();
  const fragment = document.createDocumentFragment();
  for (const option of select.options) {
    const isMatch =
      !query || option.text.toLowerCase().includes(query) || option.value.includes(query);
    if (isMatch) {
      const item = document.createElement('div');
      item.className = 'select-option';
      item.id = `${select.id}-option-${option.index}`;
      item.dataset.value = option.value;
      item.tabIndex = -1;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.value === select.value));
      if (option.dataset.swatch) {
        item.append(createSwatch(option.dataset.swatch));
      }
      const label = document.createElement('span');
      label.className = 'select-option-label';
      label.textContent = option.text;
      item.append(label);
      if (option.dataset.badge) {
        const badge = document.createElement('span');
        badge.className = 'select-option-badge';
        badge.textContent = option.dataset.badge;
        item.append(badge);
      }
      fragment.append(item);
    }
  }
  const hasMatches = fragment.childElementCount > 0;
  list.replaceChildren(fragment);
  list.hidden = !hasMatches;
  if (empty) {
    empty.hidden = hasMatches;
  }
}

/** Move the focus between the options of an open custom dropdown. */
function moveOptionFocus(wrapper: Element, offset: number): void {
  const items = [...wrapper.querySelectorAll('.select-option')];
  const current = items.indexOf(document.activeElement ?? wrapper);
  let targetIndex = current + offset;
  if (current === -1 || !Number.isFinite(targetIndex)) {
    targetIndex =
      offset > 0
        ? Math.min(offset, items.length) - 1
        : items.length + Math.max(offset, -items.length);
  }
  const next = items[Math.max(0, Math.min(items.length - 1, targetIndex))];
  if (next instanceof HTMLElement) {
    next.focus();
  }
}

/** Focus the first rendered option whose label starts with a typed character (typeahead). */
function focusTypeaheadOption(wrapper: Element, key: string): void {
  for (const item of wrapper.querySelectorAll('.select-option')) {
    if (
      item instanceof HTMLElement &&
      (item.textContent ?? '').trim().toLowerCase().startsWith(key)
    ) {
      item.focus();
      return;
    }
  }
}

/**
 * Sync a custom dropdown trigger (label and swatch) and its rendered options with the native `<select>`.
 * @param wrapper   `[data-select]` element.
 */
function syncSelect(wrapper: Element): void {
  const { list, select, trigger } = getSelectParts(wrapper);
  if (!select || !trigger) {
    return;
  }
  const [option] = select.selectedOptions;
  const valueElement = trigger.querySelector('.select-value');
  if (valueElement) {
    valueElement.textContent = option?.text ?? '';
  }
  const swatch = trigger.querySelector('.select-swatch');
  if (swatch instanceof HTMLElement) {
    const color = option?.dataset.swatch;
    swatch.hidden = !color;
    swatch.style.setProperty('--swatch', color ?? 'transparent');
  }
  for (const item of list?.querySelectorAll('.select-option') ?? []) {
    item.setAttribute(
      'aria-selected',
      String(item instanceof HTMLElement && item.dataset.value === select.value)
    );
  }
}

/** Choose a custom dropdown option: Update the native `<select>`, notify the form, and close the menu. */
function chooseSelectOption(wrapper: Element, value: string, site: SvgSite | undefined): void {
  const { menu, select, trigger } = getSelectParts(wrapper);
  if (!select) {
    return;
  }
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  syncSelect(wrapper);
  if (menu) {
    site?.closePopover(menu);
  }
  trigger?.focus();
}

/** Handle keys inside an open custom dropdown (arrows, `Home`/`End`, `Enter`/`Space`, and typeahead). */
function handleSelectKeydown(
  event: KeyboardEvent,
  wrapper: Element,
  site: SvgSite | undefined
): void {
  const { target } = event;
  const offsets: Readonly<Record<string, number>> = {
    ArrowDown: 1,
    ArrowUp: -1,
    End: Infinity,
    Home: -Infinity,
  };
  const offset = offsets[event.key];
  const isSearch = target instanceof HTMLInputElement;
  if (offset !== undefined && !(isSearch && (event.key === 'Home' || event.key === 'End'))) {
    event.preventDefault();
    moveOptionFocus(wrapper, offset);
  } else if (event.key === 'Enter' || (event.key === ' ' && !isSearch)) {
    event.preventDefault();
    const item = isSearch ? wrapper.querySelector('.select-option') : target;
    if (item instanceof HTMLElement && item.dataset.value !== undefined) {
      chooseSelectOption(wrapper, item.dataset.value, site);
    }
  } else if (!isSearch && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
    focusTypeaheadOption(wrapper, event.key.toLowerCase());
  }
}

/**
 * Prepare a custom dropdown menu when it opens: Reset the search, render the options, position the menu
 * without anchor positioning, and focus the search or the selected option.
 */
function openSelectMenu(wrapper: Element, site: SvgSite | undefined): void {
  const { menu, search, trigger } = getSelectParts(wrapper);
  if (search) {
    search.value = '';
  }
  renderSelectOptions(wrapper);
  if (menu && trigger) {
    site?.placePopover(menu, trigger, { gap: 4, isWidthMatched: true });
  }
  const selected = wrapper.querySelector('.select-option[aria-selected="true"]');
  const focusTarget = search ?? selected ?? wrapper.querySelector('.select-option');
  if (focusTarget instanceof HTMLElement) {
    focusTarget.focus();
  }
  if (selected instanceof HTMLElement) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

export { syncSelect };

/**
 * Sync every custom dropdown inside a scope with its native `<select>`.
 * @param scope   Changed field element or the whole form.
 */
export function syncSelects(scope: ParentNode): void {
  for (const wrapper of scope.querySelectorAll('[data-select]')) {
    syncSelect(wrapper);
  }
}

/**
 * Replace the options of a native `<select>` and sync its custom dropdown trigger.
 * @param select          Target `<select>` element.
 * @param options         Option definitions.
 * @param selectedValue   Currently selected value.
 */
export function setSelectOptions(
  select: HTMLSelectElement,
  options: readonly BuilderOption[],
  selectedValue: string
): void {
  select.replaceChildren();
  for (const option of options) {
    const optionElement = new Option(
      option.label,
      option.value,
      false,
      option.value === selectedValue
    );
    if (option.swatch) {
      optionElement.dataset.swatch = option.swatch;
    }
    if (option.autoSpecials && option.autoSpecials.length > 0) {
      optionElement.dataset.badge = 'Auto';
    }
    select.add(optionElement);
  }
  const wrapper = select.closest('[data-select]');
  if (wrapper) {
    syncSelect(wrapper);
  }
}

/**
 * Bind every custom dropdown: Lazy option rendering, clicks, keyboard navigation, search, focus loss, and arrow keys.
 * @param form   Builder `<form>` element.
 * @param site   Shared site client utilities.
 */
export function bindSelects(form: HTMLFormElement | null, site: SvgSite | undefined): void {
  for (const wrapper of form?.querySelectorAll('[data-select]') ?? []) {
    const { menu, search, trigger } = getSelectParts(wrapper);
    menu?.addEventListener('toggle', (event) => {
      if ((event as ToggleEvent).newState === 'open') {
        openSelectMenu(wrapper, site);
      }
    });
    menu?.addEventListener('click', (event) => {
      const item =
        event.target instanceof Element ? event.target.closest('.select-option') : undefined;
      if (item instanceof HTMLElement && item.dataset.value !== undefined) {
        chooseSelectOption(wrapper, item.dataset.value, site);
      }
    });
    menu?.addEventListener('keydown', (event) => handleSelectKeydown(event, wrapper, site));
    // Keyboard focus leaving the dropdown (e.g., `Tab`) closes the menu; pointer dismissal is native:
    menu?.addEventListener('focusout', (event) => {
      if (event.relatedTarget instanceof Node && !wrapper.contains(event.relatedTarget)) {
        site?.closePopover(menu);
      }
    });
    search?.addEventListener('input', () => renderSelectOptions(wrapper));
    trigger?.addEventListener('keydown', (event) => {
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && menu) {
        event.preventDefault();
        site?.openPopover(menu);
      }
    });
  }
}
