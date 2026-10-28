/**
 * Builder preview & snippet output controller – Manages live SVG preview debouncing, required-field status notices, syntax-highlighted code tabs, and shareable builder URLs.
 */

import {
  activateRovingTab,
  buildAltText,
  buildDefaultLinkTarget,
  buildPath,
  buildPreviewPath,
  buildShareUrl,
  buildSnippetTokens,
  findService,
  handleRovingTabKeydown,
  readState,
} from '@/site/client/builder/core';
import type { SvgSite } from '@/site/client/site/types';
import type {
  BuilderBuildResult,
  BuilderField,
  BuilderSchema,
  BuilderState,
  HighlightToken,
  SnippetSet,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Options for initializing the builder preview and snippet output controller. */
interface BuilderOutputOptions {
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
  /** `#builder-loading` empty-stage loading indicator element. */
  previewLoading: HTMLElement | null;
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
interface BuilderOutputController {
  /** Clear any active cross-builder prefill notice. */
  clearCrossBuilderNotice: () => void;
  /** Copy the shareable builder URL to the clipboard. */
  copyShareLink: () => void;
  /** Return the most recently requested preview SVG path. */
  getCurrentPreviewPath: () => string;
  /** Handle `error` events on `#builder-preview`. */
  handlePreviewError: () => void;
  /** Handle `load` events on `#builder-preview`. */
  handlePreviewLoad: () => void;
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
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Debounce delay in milliseconds before reloading the live SVG preview and updating `history.replaceState`. */
const PREVIEW_DEBOUNCE_MS = 180;

/** Default `#builder-placeholder` message when required fields are incomplete. */
const DEFAULT_EMPTY_PLACEHOLDER_TEXT = 'Fill in the required fields to see a preview.';

/** Fallback `#builder-placeholder` message when the live SVG preview fails to load. */
const ERROR_PLACEHOLDER_TEXT = 'Preview unavailable.';

/** Warning `#builder-status` message when the live SVG preview fails to load. */
const PREVIEW_ERROR_STATUS = 'The preview could not be loaded; Check the route values.';

// -------------------------------------- INTERNALS --------------------------------------

/** Synchronize `.is-missing` and `aria-invalid` across a field wrapper and its interactive inputs. */
function syncFieldMissingState(
  fieldElement: Element,
  field: BuilderField,
  isMissing: boolean
): void {
  fieldElement.classList.toggle('is-missing', isMissing);
  const controls = fieldElement.querySelectorAll('.builder-input:not(.select-trigger)');
  for (let i = 0; i < controls.length; i += 1) {
    const control = controls[i];
    if (control) {
      const isControlMissing = isMissing && (field.control !== 'typingLines' || i === 0);
      if (isControlMissing) {
        control.setAttribute('aria-invalid', 'true');
      } else if (!control.closest('.is-invalid')) {
        control.removeAttribute('aria-invalid');
      }
    }
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Create the builder preview, status bar, snippet code renderer, and share-link controller.
 * @param options   DOM elements, schema, media query, state accessor, and shared site utilities.
 * @returns Preview and snippet output controller.
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
    previewLoading,
    previewPlaceholder,
    reducedMotionQuery,
    schema,
    shareButton,
    site,
    statusElement,
  } = options;

  const previewStage =
    previewImage?.closest?.('.builder-stage') ?? previewPlaceholder?.closest?.('.builder-stage');
  const emptyPlaceholderText =
    previewPlaceholder?.textContent?.trim() || DEFAULT_EMPTY_PLACEHOLDER_TEXT;

  let snippetFormat: keyof SnippetSet = 'markdown';
  let lastPreviewSrc = '';
  let currentPreviewPath = '';
  let crossBuilderNotice = '';
  let previewTimer = 0;
  let isFetchingPreview = false;
  let hasVisiblePreview = false;
  let hasPreviewError = false;

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

  function syncPreviewStage(isLoading: boolean): void {
    const isShowingLoadingIndicator = !hasVisiblePreview && isLoading;
    const isShowingTextPlaceholder = !hasVisiblePreview && !isLoading;
    previewImage?.toggleAttribute('hidden', !hasVisiblePreview);
    previewImage?.classList.toggle('is-loading', hasVisiblePreview && isLoading);
    previewLoading?.toggleAttribute('hidden', !isShowingLoadingIndicator);
    if (previewPlaceholder) {
      if (isShowingTextPlaceholder) {
        previewPlaceholder.textContent = hasPreviewError
          ? ERROR_PLACEHOLDER_TEXT
          : emptyPlaceholderText;
      }
      previewPlaceholder.toggleAttribute('hidden', !isShowingTextPlaceholder);
    }
    if (isLoading) {
      previewStage?.setAttribute('aria-busy', 'true');
    } else {
      previewStage?.removeAttribute('aria-busy');
    }
  }

  function clearPreview(): void {
    currentPreviewPath = '';
    lastPreviewSrc = '';
    isFetchingPreview = false;
    hasVisiblePreview = false;
    hasPreviewError = false;
    previewImage?.removeAttribute('src');
    syncPreviewStage(false);
  }

  function readPendingPreviewSrc(): { isComplete: boolean; pendingSrc: string } {
    const result = buildPath(schema, getState());
    const isComplete = result.missing.length === 0;
    return {
      isComplete,
      pendingSrc: isComplete ? buildPreviewPath(result.path, reducedMotionQuery.matches) : '',
    };
  }

  function loadPreview(path: string): void {
    if (!path) {
      clearPreview();
      return;
    }
    currentPreviewPath = path;
    const previewSrc = buildPreviewPath(path, reducedMotionQuery.matches);
    if (!previewImage || previewSrc === lastPreviewSrc) {
      return;
    }
    lastPreviewSrc = previewSrc;
    isFetchingPreview = true;
    hasPreviewError = false;
    syncPreviewStage(true);
    previewImage.src = previewSrc;
  }

  function handlePreviewLoad(): void {
    if (!currentPreviewPath || !isFetchingPreview) {
      return;
    }
    isFetchingPreview = false;
    hasVisiblePreview = true;
    hasPreviewError = false;
    const { isComplete, pendingSrc } = readPendingPreviewSrc();
    syncPreviewStage(Boolean(pendingSrc && pendingSrc !== lastPreviewSrc));
    if (isComplete) {
      setStatus(crossBuilderNotice, Boolean(crossBuilderNotice));
    }
  }

  function handlePreviewError(): void {
    if (!currentPreviewPath || !isFetchingPreview) {
      return;
    }
    isFetchingPreview = false;
    hasVisiblePreview = false;
    previewImage?.removeAttribute('src');
    const { isComplete, pendingSrc } = readPendingPreviewSrc();
    const hasPendingRetry = Boolean(pendingSrc && pendingSrc !== lastPreviewSrc);
    hasPreviewError = !hasPendingRetry;
    syncPreviewStage(hasPendingRetry);
    if (isComplete && !hasPendingRetry) {
      setStatus(PREVIEW_ERROR_STATUS, true);
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
        syncFieldMissingState(fieldElement, field, isMissing);
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
    if (!isComplete) {
      setStatus(
        `Required: ${result.missing.join(', ')}. Fill in every required field to preview and copy the snippet.`,
        true
      );
    } else if (hasPreviewError) {
      setStatus(PREVIEW_ERROR_STATUS, true);
    } else {
      setStatus(crossBuilderNotice, Boolean(crossBuilderNotice));
    }
  }

  function readSnippetOptions(): { alt: string; link: string } {
    return { alt: (altInput?.value ?? '').trim(), link: (linkInput?.value ?? '').trim() };
  }

  function renderOutputs(): void {
    const state = getState();
    const result = buildPath(schema, state);
    const isComplete = result.missing.length === 0;
    const nextPreviewSrc = isComplete
      ? buildPreviewPath(result.path, reducedMotionQuery.matches)
      : '';
    if (!isComplete) {
      clearPreview();
    } else {
      if (hasPreviewError && nextPreviewSrc !== lastPreviewSrc) {
        hasPreviewError = false;
        lastPreviewSrc = '';
      }
      syncPreviewStage(isFetchingPreview || nextPreviewSrc !== lastPreviewSrc);
    }

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
      if (isComplete) {
        loadPreview(result.path);
      }
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
    activateRovingTab(document.querySelectorAll('.builder-tab'), tab);
    document.getElementById('builder-code')?.setAttribute('aria-labelledby', tab.id);
    renderOutputs();
  }

  function handleTabKeydown(event: KeyboardEvent): void {
    handleRovingTabKeydown(event, [...document.querySelectorAll('.builder-tab')], selectTab);
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
    getCurrentPreviewPath() {
      return currentPreviewPath;
    },
    handlePreviewError,
    handlePreviewLoad,
    handleTabKeydown,
    loadPreview,
    renderOutputs,
    selectTab,
    setCrossBuilderNotice(notice: string) {
      crossBuilderNotice = notice;
    },
  };
}
