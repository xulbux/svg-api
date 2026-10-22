/**
 * Stack catalog controller – Interactive `/builder/stack` category chip picker, mode tabs (`Categories` / `Raw DSL`), filter search, and lazy chip glyph rendering.
 */

import {
  BRAND_SLUG_CLEAN_RX,
  collectStackTileTokens,
  composeCategorizedStack,
  readState,
  stripStackTileColor,
} from '@/site/client/builder/core';
import type {
  BuilderField,
  BuilderState,
  IconLocation,
  IconPickerSetId,
  IconResolver,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Options for initializing the `/builder/stack` category picker controller. */
export interface StackCatalogOptions {
  /** Create an inline glyph `<svg>` for an icon body. */
  createGlyph: (set: IconPickerSetId, innerSvg: string) => SVGSVGElement;
  /** Builder `<form>` element. */
  form: HTMLFormElement;
  /** Look up a field control by ID. */
  getControl: (
    id: string
  ) => HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | undefined;
  /** Return the loaded icon slug resolver, or `undefined` before the index loads. */
  getResolver: () => IconResolver | undefined;
  /** Return the current builder form state. */
  getState: () => BuilderState;
  /** Load (once per page, retried after failures) an icon body page. */
  loadPage: (iconLocation: IconLocation) => Promise<Record<string, string>>;
  /** `#stack-catalog` container element. */
  stackCatalog: HTMLElement | null;
  /** `#stack-catalog-empty` empty state element. */
  stackCatalogEmpty: HTMLElement | null;
  /** `#stack-panel-categories` tab panel element. */
  stackCategoriesPanel: HTMLElement | null;
  /** `#stack-category-search` input element. */
  stackCategorySearch: HTMLInputElement | null;
  /** `#stack-group-by-category` checkbox element. */
  stackGroupToggle: HTMLInputElement | null;
  /** `[data-stack-group-toggle]` label element. */
  stackGroupToggleLabel: Element | null;
  /** `[data-stack-raw-actions]` actions bar element. */
  stackRawActions: Element | null;
  /** `#stack-panel-raw` tab panel element. */
  stackRawPanel: HTMLElement | null;
}

/** Public controller interface returned by `createStackCatalogController`. */
export interface StackCatalogController {
  /** Bind the `/builder/stack` interactive category picker, mode tabs, and filter search. */
  bind: () => void;
  /** Filter the category chips and category sections by the search query. */
  filterCatalog: () => void;
  /** Fill any category chips that became visible before the icon index finished loading. */
  flushPendingChips: () => void;
  /** Sync the `aria-pressed` state of every category chip and custom token list from a `/stack` DSL string. */
  syncFromDsl: (dslValue: string) => void;
  /** Sync the category chips or recompute `#field-groups` when a stack field changes. */
  syncStackFieldChange: (field: BuilderField) => void;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Create the `/builder/stack` category picker controller.
 * @param options   DOM elements and callbacks.
 */
export function createStackCatalogController(options: StackCatalogOptions): StackCatalogController {
  const {
    createGlyph,
    form,
    getControl,
    getResolver,
    getState,
    loadPage,
    stackCatalog,
    stackCatalogEmpty,
    stackCategoriesPanel,
    stackCategorySearch,
    stackGroupToggle,
    stackGroupToggleLabel,
    stackRawActions,
    stackRawPanel,
  } = options;

  let chipObserver: IntersectionObserver | undefined = undefined;
  const stackChips: HTMLButtonElement[] = [];
  const stackChipBySlug = new Map<string, HTMLButtonElement>();
  const stackChipsByCategory: HTMLButtonElement[][] = [];
  const stackTokenOverrides = new Map<string, string>();
  let customStackTokens: string[] = [];
  const pendingVisibleChips = new Set<HTMLButtonElement>();
  let isComposingStackFromCatalog = false;

  function indexStackCatalog(): void {
    if (!stackCatalog || stackChips.length > 0) {
      return;
    }
    for (const section of stackCatalog.querySelectorAll('[data-stack-category]')) {
      const categoryChips: HTMLButtonElement[] = [];
      for (const button of section.querySelectorAll('[data-stack-chip]')) {
        if (button instanceof HTMLButtonElement) {
          const chipSlug = button.dataset.stackChip ?? '';
          const canonicalSlug = button.dataset.stackCanonical ?? chipSlug;
          stackChips.push(button);
          categoryChips.push(button);
          if (chipSlug) {
            stackChipBySlug.set(chipSlug, button);
          }
          if (canonicalSlug) {
            stackChipBySlug.set(canonicalSlug, button);
          }
        }
      }
      if (categoryChips.length > 0) {
        stackChipsByCategory.push(categoryChips);
      }
    }
  }

  function findStackChip(slug: string): HTMLButtonElement | undefined {
    const clean = slug.trim().toLowerCase();
    return (
      stackChipBySlug.get(clean) ?? stackChipBySlug.get(clean.replace(BRAND_SLUG_CLEAN_RX, ''))
    );
  }

  function syncStackCatalogFromDsl(dslValue: string): void {
    indexStackCatalog();
    if (stackChips.length === 0) {
      return;
    }
    stackTokenOverrides.clear();
    customStackTokens = [];
    const selectedChips = new Set<HTMLButtonElement>();

    for (const tileToken of collectStackTileTokens(dslValue)) {
      const baseSlug = stripStackTileColor(tileToken).toLowerCase();
      if (baseSlug) {
        const chip = findStackChip(baseSlug);
        if (chip) {
          selectedChips.add(chip);
          const chipSlug = chip.dataset.stackChip ?? baseSlug;
          const atIndex = tileToken.lastIndexOf('@');
          stackTokenOverrides.set(
            chipSlug,
            atIndex > 0 ? `${chipSlug}${tileToken.slice(atIndex).toLowerCase()}` : chipSlug
          );
        } else if (!customStackTokens.includes(tileToken)) {
          customStackTokens.push(tileToken);
        }
      }
    }

    for (const chip of stackChips) {
      chip.setAttribute('aria-pressed', String(selectedChips.has(chip)));
    }
  }

  function readSelectedCategoryGroups(): string[][] {
    const categoryGroups: string[][] = [];
    for (const categoryChips of stackChipsByCategory) {
      const groupTokens: string[] = [];
      for (const chip of categoryChips) {
        if (chip.getAttribute('aria-pressed') === 'true') {
          const chipSlug = chip.dataset.stackChip ?? '';
          if (chipSlug) {
            groupTokens.push(stackTokenOverrides.get(chipSlug) ?? chipSlug);
          }
        }
      }
      if (groupTokens.length > 0) {
        categoryGroups.push(groupTokens);
      }
    }
    if (customStackTokens.length > 0) {
      categoryGroups.push([...customStackTokens]);
    }
    return categoryGroups;
  }

  function writeStackGroupsFromCatalog(): HTMLTextAreaElement | undefined {
    const textarea = getControl('groups');
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return undefined;
    }
    const state = getState();
    const isGroupedByCategory = stackGroupToggle ? stackGroupToggle.checked : true;
    textarea.value = composeCategorizedStack(
      readSelectedCategoryGroups(),
      isGroupedByCategory,
      readState(state, 'perline')
    );
    state.groups = textarea.value;
    return textarea;
  }

  function applyStackCatalogSelection(): void {
    const textarea = writeStackGroupsFromCatalog();
    if (!textarea) {
      return;
    }
    isComposingStackFromCatalog = true;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    isComposingStackFromCatalog = false;
  }

  function fillStackChip(chip: HTMLButtonElement): void {
    if (chip.dataset.filled) {
      return;
    }
    const iconResolver = getResolver();
    if (!iconResolver) {
      pendingVisibleChips.add(chip);
      return;
    }
    const glyphContainer = chip.querySelector('.stack-chip-glyph');
    const chipLocation = iconResolver.locate(chip.dataset.stackChip ?? '', true);
    if (!(glyphContainer instanceof HTMLElement) || !chipLocation) {
      return;
    }
    chip.dataset.filled = 'true';
    loadPage(chipLocation).then(
      (bodies) => {
        const body = bodies[chipLocation.slug];
        if (body) {
          glyphContainer.replaceChildren(createGlyph(chipLocation.set, body));
        }
      },
      () => {
        delete chip.dataset.filled;
      }
    );
  }

  function flushPendingStackChips(): void {
    if (!getResolver() || pendingVisibleChips.size === 0) {
      return;
    }
    for (const chip of pendingVisibleChips) {
      fillStackChip(chip);
    }
    pendingVisibleChips.clear();
  }

  function filterStackCatalog(): void {
    if (!stackCatalog) {
      return;
    }
    const query = (stackCategorySearch?.value ?? '').trim().toLowerCase();
    let visibleCategories = 0;

    for (const section of stackCatalog.querySelectorAll('[data-stack-category]')) {
      let visibleChips = 0;
      for (const button of section.querySelectorAll('[data-stack-chip]')) {
        if (button instanceof HTMLButtonElement) {
          const slug = button.dataset.stackChip ?? '';
          const canonical = button.dataset.stackCanonical ?? '';
          const label = (button.textContent ?? '').toLowerCase();
          const isMatch =
            !query || slug.includes(query) || canonical.includes(query) || label.includes(query);
          button.hidden = !isMatch;
          if (isMatch) {
            visibleChips += 1;
          }
        }
      }
      if (section instanceof HTMLElement) {
        section.hidden = visibleChips === 0;
      }
      if (visibleChips > 0) {
        visibleCategories += 1;
      }
    }

    stackCatalogEmpty?.toggleAttribute('hidden', visibleCategories > 0);
  }

  function selectStackModeTab(tab: HTMLElement): void {
    const isCategories = tab.dataset.stackMode !== 'raw';
    for (const otherTab of form.querySelectorAll('.stack-mode-tab')) {
      const isSelected = otherTab === tab;
      otherTab.classList.toggle('is-active', isSelected);
      otherTab.setAttribute('aria-selected', String(isSelected));
      otherTab.setAttribute('tabindex', isSelected ? '0' : '-1');
    }
    stackCategoriesPanel?.toggleAttribute('hidden', !isCategories);
    stackRawPanel?.toggleAttribute('hidden', isCategories);
    stackRawActions?.toggleAttribute('hidden', isCategories);
    stackGroupToggleLabel?.toggleAttribute('hidden', !isCategories);
  }

  function bindStackCatalog(): void {
    if (!stackCatalog) {
      return;
    }
    indexStackCatalog();
    chipObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLButtonElement) {
            fillStackChip(entry.target);
            chipObserver?.unobserve(entry.target);
          }
        }
      },
      { root: stackCatalog, rootMargin: '120px 0px' }
    );
    for (const chip of stackChips) {
      chipObserver.observe(chip);
    }

    stackCatalog.addEventListener('click', (event) => {
      const chip =
        event.target instanceof Element ? event.target.closest('[data-stack-chip]') : undefined;
      if (chip instanceof HTMLButtonElement) {
        const isPressed = chip.getAttribute('aria-pressed') === 'true';
        chip.setAttribute('aria-pressed', String(!isPressed));
        applyStackCatalogSelection();
      }
    });

    stackCategorySearch?.addEventListener('input', filterStackCatalog);
    stackGroupToggle?.addEventListener('change', applyStackCatalogSelection);

    const modeTabList = form.querySelector('.stack-mode-tabs');
    modeTabList?.addEventListener('click', (event) => {
      const tab =
        event.target instanceof Element ? event.target.closest('.stack-mode-tab') : undefined;
      if (tab instanceof HTMLElement) {
        selectStackModeTab(tab);
      }
    });
    modeTabList?.addEventListener('keydown', (event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key !== 'ArrowLeft' && keyEvent.key !== 'ArrowRight') {
        return;
      }
      const tabs = [...modeTabList.querySelectorAll('.stack-mode-tab')];
      const next = tabs.find((candidate) => candidate.getAttribute('aria-selected') !== 'true');
      if (next instanceof HTMLElement) {
        keyEvent.preventDefault();
        selectStackModeTab(next);
        next.focus();
      }
    });
  }

  function syncStackFieldChange(field: BuilderField): void {
    const state = getState();
    if (field.control === 'stackGroups' && !isComposingStackFromCatalog) {
      syncStackCatalogFromDsl(state[field.id] ?? '');
    } else if (field.id === 'perline' && stackCategoriesPanel && !stackCategoriesPanel.hidden) {
      writeStackGroupsFromCatalog();
    }
  }

  return {
    bind: bindStackCatalog,
    filterCatalog: filterStackCatalog,
    flushPendingChips: flushPendingStackChips,
    syncFromDsl: syncStackCatalogFromDsl,
    syncStackFieldChange,
  };
}
