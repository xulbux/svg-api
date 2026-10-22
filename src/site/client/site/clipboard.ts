/**
 * Clipboard controller – Async Clipboard API with selection-based `execCommand('copy')` fallback and accessible polite live-region feedback.
 */

// ---------------------------------------- CONSTS ---------------------------------------

/** Duration in milliseconds before copy feedback resets. */
const COPY_FEEDBACK_MS = 1500;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches non-breaking spaces in copied code selections. */
const NBSP_RX = /\u00A0/g;

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Copy text by selecting a temporary off-screen element and running the legacy `copy` command.
 * @param text   Text to copy.
 * @returns Whether the copy command succeeded.
 */
function copyWithSelection(text: string): boolean {
  const selection = globalThis.getSelection();
  if (!selection) {
    return false;
  }
  const scratch = document.createElement('pre');
  scratch.textContent = text;
  scratch.style.cssText = 'position:fixed;inset:0 auto auto 0;opacity:0;pointer-events:none;';
  document.body.append(scratch);
  const range = document.createRange();
  range.selectNodeContents(scratch);
  selection.removeAllRanges();
  selection.addRange(range);
  let isCopied = false;
  try {
    // oxlint-disable-next-line typescript/no-deprecated -- Fallback for insecure contexts without the Clipboard API.
    isCopied = document.execCommand('copy');
  } catch {
    isCopied = false;
  }
  selection.removeAllRanges();
  scratch.remove();
  return isCopied;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Create the clipboard copy function with per-button feedback timer state.
 * @returns `copyText(text, button)` helper.
 */
export function createClipboardController(): (text: string, button: Element) => void {
  const copyResetTimers = new WeakMap<Element, number>();

  /**
   * Announce copy success or failure in a button's `[data-copy-label]` element (a polite live region),
   * resetting after `COPY_FEEDBACK_MS`; `data-copied-label` / `data-failed-label` override the texts.
   */
  function showCopyFeedback(button: Element, isCopied: boolean): void {
    const labelElement = button.querySelector('[data-copy-label]');
    if (!(button instanceof HTMLElement) || !(labelElement instanceof HTMLElement)) {
      return;
    }
    labelElement.dataset.defaultLabel ??= labelElement.textContent ?? '';
    clearTimeout(copyResetTimers.get(button));
    button.classList.toggle('is-copied', isCopied);
    button.classList.toggle('is-failed', !isCopied);
    labelElement.textContent = isCopied
      ? (button.dataset.copiedLabel ?? 'Copied')
      : (button.dataset.failedLabel ?? 'Copy failed');
    copyResetTimers.set(
      button,
      globalThis.setTimeout(() => {
        button.classList.remove('is-copied', 'is-failed');
        labelElement.textContent = labelElement.dataset.defaultLabel ?? '';
      }, COPY_FEEDBACK_MS)
    );
  }

  /**
   * Copy text with the async Clipboard API (falling back to a selection copy) and show feedback on a button.
   */
  function copyText(text: string, button: Element): void {
    if (navigator.clipboard && globalThis.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        () => showCopyFeedback(button, true),
        () => showCopyFeedback(button, copyWithSelection(text))
      );
    } else {
      showCopyFeedback(button, copyWithSelection(text));
    }
  }

  return copyText;
}

/**
 * Resolve the copy source of a copy button: `data-copy-target` (an element ID) or the code drawer's `<pre>`.
 * @param copyButton   `.copy-btn` element.
 * @returns Source element whose `textContent` should be copied, or `undefined`.
 */
export function resolveCopySource(copyButton: Element): Element | undefined {
  const targetId = copyButton.getAttribute('data-copy-target');
  if (targetId) {
    return document.getElementById(targetId) ?? undefined;
  }
  return copyButton.closest('.code-drawer-body')?.querySelector('.code-pre') ?? undefined;
}

/**
 * Bind the document `copy` listener so copying from `.code-pre` blocks replaces non-breaking spaces with regular spaces.
 */
export function bindCodeCopySanitizer(): void {
  document.addEventListener('copy', (event) => {
    const selection = globalThis.getSelection();
    if (!selection || selection.isCollapsed || !event.clipboardData) {
      return;
    }
    const { anchorNode } = selection;
    const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    if (anchorElement?.closest('.code-pre')) {
      event.clipboardData.setData('text/plain', selection.toString().replace(NBSP_RX, ' '));
      event.preventDefault();
    }
  });
}
