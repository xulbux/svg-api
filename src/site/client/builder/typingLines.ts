/**
 * Typing lines controller – Interactive line-by-line list editor for the `/builder/typing` URL builder.
 */

// ---------------------------------------- TYPES ----------------------------------------

/** Options for initializing the `/builder/typing` interactive line list controller. */
export interface TypingLinesControllerOptions {
  /** `#typing-line-add` button element. */
  addButton: HTMLButtonElement | null;
  /** `#typing-lines-editor` wrapper element. */
  editorElement: HTMLElement | null;
  /** Hidden `#field-lines` input element storing the `;`-separated lines string. */
  hiddenInput: HTMLInputElement | null;
  /** `#typing-lines-list` row container element. */
  listElement: HTMLElement | null;
}

/** Public controller interface returned by `createTypingLinesController`. */
export interface TypingLinesController {
  /** Bind add, remove, keyboard navigation, and multi-line paste listeners. */
  bind: () => void;
  /** Read and serialize the non-empty line inputs into `;`-separated form and sync `#field-lines`. */
  readValue: () => string;
  /** Rebuild the line input rows from a `;`- or newline-separated lines string. */
  syncFromValue: (rawValue: string) => void;
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches `;` or newline separators when splitting a serialized or pasted lines list. */
const LINE_SPLIT_RX = /[\r\n;]+/;

/** Matches pasted text that contains a line break or semicolon separator. */
const MULTI_LINE_PASTE_RX = /[\r\n;]/;

/** Matches stray semicolons inside a single line input so individual rows map 1:1 to cycling lines. */
const SEMICOLON_RX = /;/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Focus the `.typing-line-input` inside a row element and optionally move the caret to the end. */
function focusRowInput(row: HTMLElement | undefined, hasCaretAtEnd = false): void {
  const input = row?.querySelector('.typing-line-input');
  if (input instanceof HTMLInputElement) {
    input.focus();
    if (hasCaretAtEnd) {
      const endOffset = input.value.length;
      input.setSelectionRange(endOffset, endOffset);
    }
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Create the `/builder/typing` interactive line-by-line list controller.
 * @param options   DOM elements for the typing lines editor.
 * @returns Controller with `bind`, `readValue`, and `syncFromValue` methods.
 */
export function createTypingLinesController(
  options: TypingLinesControllerOptions
): TypingLinesController {
  const { addButton, editorElement, hiddenInput, listElement } = options;
  const maxLines = Number(editorElement?.dataset.maxLines) || 12;
  const maxLength = Number(editorElement?.dataset.maxLength) || 80;
  const firstRow = listElement?.querySelector('[data-typing-line-row]');
  const rowTemplate =
    firstRow instanceof HTMLElement ? (firstRow.cloneNode(true) as HTMLElement) : undefined;

  function getRows(): HTMLElement[] {
    if (!listElement) {
      return [];
    }
    const rows: HTMLElement[] = [];
    for (const element of listElement.querySelectorAll('[data-typing-line-row]')) {
      if (element instanceof HTMLElement) {
        rows.push(element);
      }
    }
    return rows;
  }

  function createRow(lineValue: string): HTMLElement | undefined {
    if (!rowTemplate) {
      return undefined;
    }
    const row = rowTemplate.cloneNode(true) as HTMLElement;
    const input = row.querySelector('.typing-line-input');
    if (input instanceof HTMLInputElement) {
      input.value = lineValue.replace(SEMICOLON_RX, ' ').slice(0, maxLength);
    }
    return row;
  }

  function refreshRowMetadata(): void {
    const rows = getRows();
    const isSingleRow = rows.length <= 1;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row) {
        const lineNumber = i + 1;
        const indexBadge = row.querySelector('.typing-line-index');
        if (indexBadge) {
          indexBadge.textContent = String(lineNumber);
        }
        const input = row.querySelector('.typing-line-input');
        if (input instanceof HTMLInputElement) {
          input.placeholder = i === 0 ? 'e.g., Full-Stack Developer' : `Line ${lineNumber}…`;
          input.setAttribute('aria-label', `Line ${lineNumber}`);
        }
        const removeButton = row.querySelector('[data-typing-line-remove]');
        if (removeButton instanceof HTMLButtonElement) {
          removeButton.disabled = isSingleRow;
          removeButton.setAttribute('aria-label', `Remove line ${lineNumber}`);
        }
      }
    }
    if (addButton) {
      addButton.disabled = rows.length >= maxLines;
    }
  }

  function readValue(): string {
    if (!listElement) {
      return hiddenInput?.value ?? '';
    }
    const nonEmptyLines: string[] = [];
    for (const input of listElement.querySelectorAll('.typing-line-input')) {
      if (input instanceof HTMLInputElement) {
        if (input.value.includes(';')) {
          const isFocused = document.activeElement === input;
          const selectionStart = isFocused ? (input.selectionStart ?? undefined) : undefined;
          const selectionEnd = isFocused ? (input.selectionEnd ?? undefined) : undefined;
          input.value = input.value.replace(SEMICOLON_RX, ' ');
          if (isFocused && selectionStart !== undefined && selectionEnd !== undefined) {
            input.setSelectionRange(selectionStart, selectionEnd);
          }
        }
        const trimmedLine = input.value.trim();
        if (trimmedLine) {
          nonEmptyLines.push(trimmedLine);
        }
      }
    }
    const serialized = nonEmptyLines.join(';');
    if (hiddenInput) {
      hiddenInput.value = serialized;
    }
    return serialized;
  }

  function notifyChange(): void {
    readValue();
    hiddenInput?.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function syncFromValue(rawValue: string): void {
    if (!listElement || !rowTemplate) {
      return;
    }
    const parsedLines: string[] = [];
    for (const segment of rawValue.split(LINE_SPLIT_RX)) {
      const trimmedLine = segment.trim();
      if (trimmedLine && parsedLines.length < maxLines) {
        parsedLines.push(trimmedLine);
      }
    }
    if (parsedLines.length === 0) {
      parsedLines.push('');
    }
    const fragment = document.createDocumentFragment();
    for (const lineText of parsedLines) {
      const row = createRow(lineText);
      if (row) {
        fragment.append(row);
      }
    }
    listElement.replaceChildren(fragment);
    refreshRowMetadata();
    readValue();
  }

  function handleKeydown(event: KeyboardEvent): void {
    const input =
      event.target instanceof HTMLInputElement &&
      event.target.classList.contains('typing-line-input')
        ? event.target
        : undefined;
    const row = input?.closest<HTMLElement>('[data-typing-line-row]');
    if (!input || !row) {
      return;
    }
    const rows = getRows();
    const rowIndex = rows.indexOf(row);
    if (event.key === 'Enter') {
      event.preventDefault();
      if (rows.length < maxLines) {
        const newRow = createRow('');
        if (newRow) {
          row.after(newRow);
          refreshRowMetadata();
          focusRowInput(newRow);
        }
      } else if (rowIndex + 1 < rows.length) {
        focusRowInput(rows[rowIndex + 1]);
      }
    } else if (event.key === 'Backspace' && input.value === '' && rows.length > 1) {
      event.preventDefault();
      row.remove();
      refreshRowMetadata();
      const remainingRows = getRows();
      focusRowInput(remainingRows[Math.max(0, rowIndex - 1)], true);
      notifyChange();
    } else if (event.key === 'ArrowUp' && rowIndex > 0) {
      event.preventDefault();
      focusRowInput(rows[rowIndex - 1], true);
    } else if (event.key === 'ArrowDown' && rowIndex + 1 < rows.length) {
      event.preventDefault();
      focusRowInput(rows[rowIndex + 1], true);
    }
  }

  function handlePaste(event: ClipboardEvent): void {
    const input =
      event.target instanceof HTMLInputElement &&
      event.target.classList.contains('typing-line-input')
        ? event.target
        : undefined;
    const row = input?.closest<HTMLElement>('[data-typing-line-row]');
    const pastedText = event.clipboardData?.getData('text') ?? '';
    if (!input || !row || !MULTI_LINE_PASTE_RX.test(pastedText)) {
      return;
    }
    const pastedLines: string[] = [];
    for (const part of pastedText.split(LINE_SPLIT_RX)) {
      const trimmedLine = part.trim();
      if (trimmedLine) {
        pastedLines.push(trimmedLine);
      }
    }
    if (pastedLines.length <= 1) {
      return;
    }
    event.preventDefault();
    input.value = (pastedLines[0] ?? '').slice(0, maxLength);
    let anchorRow: HTMLElement = row;
    let currentRowCount = getRows().length;
    for (let i = 1; i < pastedLines.length && currentRowCount < maxLines; i += 1) {
      const nextRow = createRow(pastedLines[i] ?? '');
      if (nextRow) {
        anchorRow.after(nextRow);
        anchorRow = nextRow;
        currentRowCount += 1;
      }
    }
    refreshRowMetadata();
    focusRowInput(anchorRow, true);
    notifyChange();
  }

  function bind(): void {
    if (!listElement || !rowTemplate) {
      return;
    }
    addButton?.addEventListener('click', () => {
      const rows = getRows();
      if (rows.length >= maxLines) {
        return;
      }
      const newRow = createRow('');
      if (newRow) {
        listElement.append(newRow);
        refreshRowMetadata();
        focusRowInput(newRow);
      }
    });

    listElement.addEventListener('click', (event) => {
      const removeButton =
        event.target instanceof Element
          ? event.target.closest('[data-typing-line-remove]')
          : undefined;
      const row = removeButton?.closest<HTMLElement>('[data-typing-line-row]');
      if (!row) {
        return;
      }
      const rows = getRows();
      if (rows.length <= 1) {
        const singleInput = row.querySelector('.typing-line-input');
        if (singleInput instanceof HTMLInputElement) {
          singleInput.value = '';
          singleInput.focus();
          notifyChange();
        }
        return;
      }
      const rowIndex = rows.indexOf(row);
      row.remove();
      refreshRowMetadata();
      const remainingRows = getRows();
      focusRowInput(remainingRows[Math.min(rowIndex, remainingRows.length - 1)]);
      notifyChange();
    });

    listElement.addEventListener('keydown', (event) => handleKeydown(event as KeyboardEvent));
    listElement.addEventListener('paste', (event) => handlePaste(event as ClipboardEvent));
  }

  return { bind, readValue, syncFromValue };
}
