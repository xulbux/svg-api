/**
 * Builder preview & snippet output controller – Manages live SVG preview debouncing, required-field status notices, syntax-highlighted code tabs, and shareable builder URLs.
 */

import {
  buildAltText,
  buildDefaultLinkTarget,
  buildPath,
  buildPreviewPath,
  buildShareUrl,
  buildSnippetTokens,
  findService,
  readState,
} from '@/site/client/builder/core';
import type { SvgSite } from '@/site/client/site/types';
import type {
  BuilderBuildResult,
  BuilderSchema,
  BuilderState,
  HighlightToken,
  SnippetSet,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Options for initializing the builder preview and snippet output controller. */
export interface BuilderOutputOptions {
  /** Custom alt-text `<input>` element. */
  altInput: HTMLInputElement | null;
  /** `#builder-code code` output element. */
  codeElement: Element | null;
  /** `#builder-copy` copy snippet button element. */
  copyButton: HTMLButtonElement | null;
  /** Field wrapper elements keyed by field ID. */
  fieldElements: ReadonlyMap<string, Element>;
  /** Returns the active builder state object. */
  getState: () => BuilderState;
  /** Custom click-through link `<input>` element. */
  linkInput: HTMLInputElement | null;
  /** `#builder-open` "Open SVG" anchor element. */
  openLink: HTMLAnchorElement | null;
  /** `.builder-output` aside container element. */
  outputElement: Element | null;
  /** `#builder-preview` live SVG `<img>` element. */
  previewImage: HTMLImageElement | null;
  /** `#builder-placeholder` empty preview placeholder element. */
  previewPlaceholder: HTMLElement | null;
  /** `(prefers-reduced-motion: reduce)` media query list. */
  reducedMotionQuery: MediaQueryList;
  /** Active builder schema. */
  schema: BuilderSchema;
  /** `#builder-share` copy shareable link button element. */
  shareButton: HTMLElement | null;
  /** Shared site client utilities. */
  site: SvgSite | undefined;
  /** `#builder-status` status message element. */
  statusElement: HTMLElement | null;
}

/** Public controller interface returned by `createBuilderOutputController`. */
export interface BuilderOutputController {
  /** Clear any active cross-builder prefill notice. */
  clearCrossBuilderNotice: () => void;
  /** Copy the shareable builder URL to the clipboard. */
  copyShareLink: () => void;
  /** Return the active cross-builder prefill notice (`''` when none). */
  getCrossBuilderNotice: () => string;
  /** Return the most recently requested preview SVG path. */
  getCurrentPreviewPath: () => string;
  /** Handle roving-tabindex arrow/Home/End keys on `.builder-tabs`. */
  handleTabKeydown: (event: KeyboardEvent) => void;
  /** Update the live preview `<img>` source (honoring reduced motion). */
  loadPreview: (path: string) => void;
  /** Recompute snippets, missing-field state, debounced preview, and browser history URL. */
  renderOutputs: () => void;
  /** Switch the active snippet format tab (`markdown`, `html`, or `url`). */
  selectTab: (tab: HTMLElement) => void;
  /** Set a cross-builder prefill notice string. */
  setCrossBuilderNotice: (notice: string) => void;
  /** Set `#builder-status` text and warning styling. */
  setStatus: (message: string, isWarning?: boolean) => void;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Debounce delay in milliseconds before reloading the live SVG preview and updating `history.replaceState`. */
const PREVIEW_DEBOUNCE_MS = 180;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Create the builder preview, status bar, snippet code renderer, and share-link controller.
 * @param options   DOM elements, schema, media query, state accessor, and shared site utilities.
 */
export function createBuilderOutputController(
  options: BuilderOutputOptions
): BuilderOutputController {
  const {
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
  } = options;

  let snippetFormat: keyof SnippetSet = 'markdown';
  let lastPreviewSrc = '';
  let currentPreviewPath = '';
  let crossBuilderNotice = '';
  let previewTimer = 0;

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
    const state = getState();
    const service = schema.kind === 'service' ? findService(schema, state.service) : undefined;
    for (const field of schema.fields) {
      const isRequired =
        field.isRequired || (field.id === 'owner' && service?.ownerMode === 'required');
      const isMissing = isRequired && !readState(state, field.id);
      const fieldElement = fieldElements.get(field.id);
      if (fieldElement) {
        fieldElement.classList.toggle('is-missing', isMissing);
        for (const control of fieldElement.querySelectorAll(
          '.builder-input:not(.select-trigger)'
        )) {
          if (isMissing) {
            control.setAttribute('aria-invalid', 'true');
          } else if (!control.closest('.is-invalid')) {
            control.removeAttribute('aria-invalid');
          }
        }
      }
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
        ? crossBuilderNotice
        : `Required: ${result.missing.join(', ')}. Fill in every required field to preview and copy the snippet.`,
      !isComplete || Boolean(crossBuilderNotice)
    );
  }

  function readSnippetOptions(): { alt: string; link: string } {
    return { alt: (altInput?.value ?? '').trim(), link: (linkInput?.value ?? '').trim() };
  }

  function renderOutputs(): void {
    const state = getState();
    const result = buildPath(schema, state);
    const isComplete = result.missing.length === 0;
    const absoluteUrl = `${schema.origin}${result.path}`;
    const autoAlt = buildAltText(schema, state);
    const snippetOptions = readSnippetOptions();
    const alt = snippetOptions.alt || autoAlt;
    if (altInput) {
      altInput.placeholder = autoAlt;
    }
    if (previewImage) {
      previewImage.alt = alt;
    }
    const link = snippetOptions.link || buildDefaultLinkTarget(schema, state, absoluteUrl);
    renderCode(buildSnippetTokens(absoluteUrl, alt, link)[snippetFormat]);
    syncOutputAvailability(result);

    clearTimeout(previewTimer);
    previewTimer = globalThis.setTimeout(() => {
      loadPreview(isComplete ? result.path : '');
      history.replaceState(
        history.state,
        '',
        buildShareUrl(
          globalThis.location.href,
          result.path,
          snippetOptions.alt,
          snippetOptions.link
        )
      );
    }, PREVIEW_DEBOUNCE_MS);
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

  function handleTabKeydown(event: KeyboardEvent): void {
    const tabs = [...document.querySelectorAll('.builder-tab')];
    if (tabs.length === 0) {
      return;
    }
    let current = 0;
    for (const [i, tab] of tabs.entries()) {
      if (tab.getAttribute('aria-selected') === 'true') {
        current = i;
      }
    }
    let nextIndex: number | undefined = undefined;
    if (event.key === 'ArrowLeft') {
      nextIndex = (current - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'ArrowRight') {
      nextIndex = (current + 1) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }
    const next = nextIndex !== undefined ? tabs[nextIndex] : undefined;
    if (next instanceof HTMLElement) {
      event.preventDefault();
      selectTab(next);
      next.focus();
    }
  }

  function copyShareLink(): void {
    const snippetOptions = readSnippetOptions();
    if (shareButton) {
      const currentPath = buildPath(schema, getState()).path;
      site?.copyText(
        buildShareUrl(
          globalThis.location.href,
          currentPath,
          snippetOptions.alt,
          snippetOptions.link
        ),
        shareButton
      );
    }
  }

  return {
    clearCrossBuilderNotice() {
      crossBuilderNotice = '';
    },
    copyShareLink,
    getCrossBuilderNotice() {
      return crossBuilderNotice;
    },
    getCurrentPreviewPath() {
      return currentPreviewPath;
    },
    handleTabKeydown,
    loadPreview,
    renderOutputs,
    selectTab,
    setCrossBuilderNotice(notice: string) {
      crossBuilderNotice = notice;
    },
    setStatus,
  };
}
