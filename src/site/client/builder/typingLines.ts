/**
 * Typing lines controller – Interactive line-by-line list editor for the `/builder/typing` URL builder.
 */

import { MAX_TYPING_LINE_LENGTH, MAX_TYPING_LINES } from '@/site/shared';
import type { TypingLinesController, TypingLinesMountOptions } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Parent element with optional atomic `moveBefore` DOM relocation support. */
interface AtomicMoveParent {
  /** Atomically relocate a child node without detaching it when supported by the browser. */
  moveBefore?: (movedNode: Node, referenceNode: Node | null) => void;
}

/** Untransformed vertical layout box of a typing-line row in viewport coordinates. */
interface RowLayoutBox {
  /** Untransformed row height in pixels. */
  height: number;
  /** Untransformed row top coordinate in pixels. */
  top: number;
}

/** Snapshot of a row's layout and visual vertical coordinates prior to a DOM reorder. */
interface RowFlipSnapshot {
  /** Untransformed layout top coordinate before the DOM mutation. */
  layoutTop: number;
  /** Visual top coordinate (including any in-flight animation) before the DOM mutation. */
  visualTop: number;
}

/** Options for initializing the `/builder/typing` interactive line list controller. */
export type TypingLinesControllerOptions = TypingLinesMountOptions<
  HTMLButtonElement,
  HTMLElement,
  HTMLInputElement
>;

// ---------------------------------------- CONSTS ---------------------------------------

/** In-flight Web Animations API glides keyed by row element so overlapping moves cancel cleanly. */
const ACTIVE_ROW_ANIMATIONS = new WeakMap<HTMLElement, Animation>();

/** Duration in milliseconds for FLIP neighbor glide animations when reordering rows. */
const REORDER_FLIP_DURATION_MS = 180;

/** Deceleration curve for FLIP neighbor glide animations when reordering rows. */
const REORDER_FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

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

/** Relocate `row` before `referenceNode` inside `parent`, preserving state when `moveBefore` exists. */
function moveRowBefore(
  parent: HTMLElement,
  row: HTMLElement,
  referenceNode: ChildNode | null
): void {
  const atomicParent = parent as HTMLElement & AtomicMoveParent;
  if (typeof atomicParent.moveBefore === 'function') {
    atomicParent.moveBefore(row, referenceNode);
    return;
  }
  if (referenceNode) {
    referenceNode.before(row);
    return;
  }
  parent.append(row);
}

/** Report whether the user prefers reduced motion. */
function hasReducedMotionPreference(): boolean {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** Cancel any active WAAPI glide and strip transient motion classes from `row`. */
function cancelRowAnimation(row: HTMLElement): void {
  const activeAnimation = ACTIVE_ROW_ANIMATIONS.get(row);
  if (activeAnimation) {
    ACTIVE_ROW_ANIMATIONS.delete(row);
    activeAnimation.cancel();
  }
  row.classList.remove('is-entering', 'is-settling');
}

/** Smoothly glide `row` from `fromTranslate` back to `'0 0'`, cancelling any prior animation on `row`. */
function animateRowTranslate(row: HTMLElement, fromTranslate: string, isSettling = false): void {
  cancelRowAnimation(row);
  if (typeof row.animate !== 'function' || hasReducedMotionPreference()) {
    return;
  }
  if (isSettling) {
    row.classList.add('is-settling');
  }
  const animation = row.animate([{ translate: fromTranslate }, { translate: '0 0' }], {
    duration: REORDER_FLIP_DURATION_MS,
    easing: REORDER_FLIP_EASING,
  }) as Animation | undefined;
  if (animation) {
    ACTIVE_ROW_ANIMATIONS.set(row, animation);
    animation.addEventListener?.('finish', () => {
      if (ACTIVE_ROW_ANIMATIONS.get(row) === animation) {
        ACTIVE_ROW_ANIMATIONS.delete(row);
        row.classList.remove('is-settling');
      }
    });
  } else {
    row.classList.remove('is-settling');
  }
}

/** Measure the untransformed viewport layout box of `row`, ignoring active `translate` animations. */
function getRowLayoutBox(parentTop: number, row: HTMLElement): RowLayoutBox {
  if (
    typeof row.offsetHeight === 'number' &&
    row.offsetHeight > 0 &&
    typeof row.offsetTop === 'number'
  ) {
    return { height: row.offsetHeight, top: parentTop + row.offsetTop };
  }
  const rect = row.getBoundingClientRect();
  return { height: rect.height, top: rect.top };
}

/** Swap `draggedRow` with an adjacent row when `visualCenterY` crosses its untransformed layout midpoint. */
function trySwapDraggedRowOnce(draggedRow: HTMLElement, visualCenterY: number): boolean {
  const parent = draggedRow.parentElement;
  if (!parent) {
    return false;
  }
  const parentTop = parent.getBoundingClientRect().top;
  const previousSibling = draggedRow.previousElementSibling;
  if (previousSibling instanceof HTMLElement) {
    const previousBox = getRowLayoutBox(parentTop, previousSibling);
    if (visualCenterY < previousBox.top + previousBox.height / 2) {
      moveRowBefore(parent, draggedRow, previousSibling);
      return true;
    }
  }
  const nextSibling = draggedRow.nextElementSibling;
  if (nextSibling instanceof HTMLElement) {
    const nextBox = getRowLayoutBox(parentTop, nextSibling);
    if (visualCenterY > nextBox.top + nextBox.height / 2) {
      moveRowBefore(parent, draggedRow, nextSibling.nextSibling);
      return true;
    }
  }
  return false;
}

/** Split pasted clipboard text into non-empty trimmed lines. */
function splitPastedLines(pastedText: string): string[] {
  const pastedLines: string[] = [];
  for (const part of pastedText.split(LINE_SPLIT_RX)) {
    const trimmedLine = part.trim();
    if (trimmedLine) {
      pastedLines.push(trimmedLine);
    }
  }
  return pastedLines;
}

/** Run `mutateDom` inside `parent` and FLIP-animate only non-excluded rows whose layout slot changed. */
function runWithRowFlip(
  parent: HTMLElement,
  mutateDom: () => boolean,
  excludedRow?: HTMLElement
): boolean {
  const isAnimating = !hasReducedMotionPreference();
  const parentBeforeTop = isAnimating ? parent.getBoundingClientRect().top : 0;
  const snapshots = new Map<HTMLElement, RowFlipSnapshot>();
  if (isAnimating) {
    for (const sibling of parent.querySelectorAll('[data-typing-line-row]')) {
      if (
        sibling instanceof HTMLElement &&
        sibling !== excludedRow &&
        typeof sibling.animate === 'function'
      ) {
        snapshots.set(sibling, {
          layoutTop: getRowLayoutBox(parentBeforeTop, sibling).top,
          visualTop: sibling.getBoundingClientRect().top,
        });
      }
    }
  }
  const hasMoved = mutateDom();
  if (hasMoved && snapshots.size > 0) {
    const parentAfterTop = parent.getBoundingClientRect().top;
    for (const [sibling, snapshot] of snapshots) {
      const afterLayoutTop = getRowLayoutBox(parentAfterTop, sibling).top;
      if (Math.round(snapshot.layoutTop - afterLayoutTop) !== 0) {
        const deltaY = Math.round(snapshot.visualTop - afterLayoutTop);
        if (deltaY !== 0) {
          animateRowTranslate(sibling, `0 ${deltaY}px`);
        } else {
          cancelRowAnimation(sibling);
        }
      }
    }
  }
  return hasMoved;
}

/** Swap `draggedRow` across any crossed neighbor midpoints and report whether DOM order changed. */
function swapDraggedRowWithNeighbors(draggedRow: HTMLElement, visualCenterY: number): boolean {
  const parent = draggedRow.parentElement;
  if (!parent) {
    return false;
  }
  return runWithRowFlip(
    parent,
    () => {
      let hasSwapped = false;
      let isCheckingNeighbors = true;
      while (isCheckingNeighbors) {
        isCheckingNeighbors = trySwapDraggedRowOnce(draggedRow, visualCenterY);
        if (isCheckingNeighbors) {
          hasSwapped = true;
        }
      }
      return hasSwapped;
    },
    draggedRow
  );
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
  const maxLines = Number(editorElement?.dataset.maxLines) || MAX_TYPING_LINES;
  const maxLength = Number(editorElement?.dataset.maxLength) || MAX_TYPING_LINE_LENGTH;
  const firstRow = listElement?.querySelector('[data-typing-line-row]');
  const isEditorRequired =
    firstRow?.querySelector('.typing-line-input')?.getAttribute('aria-required') === 'true';
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

  function createRow(lineValue: string, isEntering = false): HTMLElement | undefined {
    if (!rowTemplate) {
      return undefined;
    }
    const row = rowTemplate.cloneNode(true) as HTMLElement;
    row.classList.remove('is-dragging', 'is-entering', 'is-settling');
    const input = row.querySelector('.typing-line-input');
    if (input instanceof HTMLInputElement) {
      input.value = lineValue.replace(SEMICOLON_RX, ' ').slice(0, maxLength);
    }
    if (isEntering && !hasReducedMotionPreference()) {
      row.classList.add('is-entering');
      row.addEventListener('transitionend', (event) => {
        if (event.target === row) {
          row.classList.remove('is-entering');
        }
      });
    }
    return row;
  }

  function refreshRowMetadata(): void {
    const rows = getRows();
    const isSingleRow = rows.length <= 1;
    const isFieldMissing = Boolean(listElement?.closest('.is-missing'));
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row) {
        const lineNumber = i + 1;
        const indexBadge = row.querySelector('.typing-line-index');
        if (indexBadge) {
          indexBadge.textContent = String(lineNumber);
        }
        const dragHandle = row.querySelector('[data-typing-line-handle]');
        if (dragHandle instanceof HTMLButtonElement) {
          dragHandle.disabled = isSingleRow;
          dragHandle.setAttribute(
            'aria-label',
            `Reorder line ${lineNumber} (drag or use Up and Down arrow keys)`
          );
        }
        const input = row.querySelector('.typing-line-input');
        if (input instanceof HTMLInputElement) {
          input.placeholder = i === 0 ? 'e.g., Full-Stack Developer' : `Line ${lineNumber}…`;
          input.setAttribute('aria-label', `Line ${lineNumber}`);
          if (isEditorRequired && i === 0) {
            input.setAttribute('aria-required', 'true');
          } else {
            input.removeAttribute('aria-required');
          }
          if (isFieldMissing && i === 0) {
            input.setAttribute('aria-invalid', 'true');
          } else if (!input.closest('.is-invalid')) {
            input.removeAttribute('aria-invalid');
          }
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

  function moveRowToIndex(
    row: HTMLElement,
    targetIndex: number,
    focusTarget: 'handle' | 'input'
  ): void {
    if (!listElement) {
      return;
    }
    const rows = getRows();
    const currentIndex = rows.indexOf(row);
    const clampedIndex = Math.max(0, Math.min(rows.length - 1, targetIndex));
    const referenceRow = rows[clampedIndex];
    if (currentIndex === -1 || currentIndex === clampedIndex || !referenceRow) {
      return;
    }
    runWithRowFlip(listElement, () => {
      moveRowBefore(
        listElement,
        row,
        clampedIndex < currentIndex ? referenceRow : referenceRow.nextSibling
      );
      return true;
    });
    refreshRowMetadata();
    if (focusTarget === 'handle') {
      const handle = row.querySelector('[data-typing-line-handle]');
      if (handle instanceof HTMLButtonElement) {
        handle.focus();
      }
    } else {
      focusRowInput(row, true);
    }
    notifyChange();
  }

  function handleDragHandleKeydown(event: KeyboardEvent, handle: HTMLButtonElement): void {
    const handleRow = handle.closest<HTMLElement>('[data-typing-line-row]');
    if (!handleRow) {
      return;
    }
    const rows = getRows();
    const rowIndex = rows.indexOf(handleRow);
    const targetByKey: Readonly<Record<string, number>> = {
      ArrowDown: rowIndex + 1,
      ArrowUp: rowIndex - 1,
      End: rows.length - 1,
      Home: 0,
    };
    if (Object.hasOwn(targetByKey, event.key)) {
      event.preventDefault();
      moveRowToIndex(handleRow, targetByKey[event.key] ?? rowIndex, 'handle');
    }
  }

  function handleLineInputKeydown(event: KeyboardEvent, input: HTMLInputElement): void {
    const row = input.closest<HTMLElement>('[data-typing-line-row]');
    if (!row) {
      return;
    }
    const rows = getRows();
    const rowIndex = rows.indexOf(row);
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      moveRowToIndex(row, rowIndex + (event.key === 'ArrowUp' ? -1 : 1), 'input');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (rows.length < maxLines) {
        const newRow = createRow('', true);
        if (newRow) {
          if (listElement) {
            runWithRowFlip(
              listElement,
              () => {
                row.after(newRow);
                return true;
              },
              newRow
            );
          } else {
            row.after(newRow);
          }
          refreshRowMetadata();
          focusRowInput(newRow);
        }
      } else if (rowIndex + 1 < rows.length) {
        focusRowInput(rows[rowIndex + 1]);
      }
    } else if (event.key === 'Backspace' && input.value === '' && rows.length > 1) {
      event.preventDefault();
      if (listElement) {
        runWithRowFlip(
          listElement,
          () => {
            row.remove();
            return true;
          },
          row
        );
      } else {
        row.remove();
      }
      refreshRowMetadata();
      focusRowInput(getRows()[Math.max(0, rowIndex - 1)], true);
      notifyChange();
    } else if (event.key === 'ArrowUp' && rowIndex > 0) {
      event.preventDefault();
      focusRowInput(rows[rowIndex - 1], true);
    } else if (event.key === 'ArrowDown' && rowIndex + 1 < rows.length) {
      event.preventDefault();
      focusRowInput(rows[rowIndex + 1], true);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.isComposing) {
      return;
    }
    const handle =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-typing-line-handle]')
        : undefined;
    if (handle) {
      handleDragHandleKeydown(event, handle);
      return;
    }
    if (
      event.target instanceof HTMLInputElement &&
      event.target.classList.contains('typing-line-input')
    ) {
      handleLineInputKeydown(event, event.target);
    }
  }

  function appendPastedRows(
    anchorRow: HTMLElement,
    pastedLines: readonly string[],
    insertCount: number,
    afterSelection: string
  ): HTMLElement {
    let lastRow = anchorRow;
    function insertRows(): boolean {
      let hasInserted = false;
      for (let i = 1; i <= insertCount; i += 1) {
        const segmentText =
          i === insertCount ? `${pastedLines[i] ?? ''}${afterSelection}` : (pastedLines[i] ?? '');
        const nextRow = createRow(segmentText.trim(), true);
        if (nextRow) {
          lastRow.after(nextRow);
          lastRow = nextRow;
          hasInserted = true;
        }
      }
      return hasInserted;
    }
    if (listElement && insertCount > 0) {
      runWithRowFlip(listElement, insertRows);
    } else {
      insertRows();
    }
    return lastRow;
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
    const pastedLines = splitPastedLines(pastedText);
    if (pastedLines.length <= 1) {
      return;
    }
    event.preventDefault();
    const startOffset = input.selectionStart ?? input.value.length;
    const endOffset = input.selectionEnd ?? startOffset;
    const beforeSelection = input.value.slice(0, startOffset);
    const afterSelection = input.value.slice(endOffset);
    const insertCount = Math.min(pastedLines.length - 1, Math.max(0, maxLines - getRows().length));
    const firstMerged = `${beforeSelection}${pastedLines[0] ?? ''}${insertCount === 0 ? afterSelection : ''}`;
    input.value = firstMerged.replace(SEMICOLON_RX, ' ').trim().slice(0, maxLength);
    const lastRow = appendPastedRows(row, pastedLines, insertCount, afterSelection);
    refreshRowMetadata();
    focusRowInput(lastRow, true);
    notifyChange();
  }

  let activeDragRow: HTMLElement | undefined = undefined;
  let activeDragHandle: HTMLButtonElement | undefined = undefined;
  let activePointerId: number | undefined = undefined;
  let dragInitialIndex = -1;
  let dragGrabOffsetY = 0;

  function finishPointerDrag(): void {
    if (!activeDragRow || !listElement) {
      return;
    }
    const finishedRow = activeDragRow;
    const finishedHandle = activeDragHandle;
    const finishedPointerId = activePointerId;
    const releaseTranslate = finishedRow.style.translate;
    activeDragRow = undefined;
    activeDragHandle = undefined;
    activePointerId = undefined;

    finishedRow.classList.remove('is-dragging', 'is-entering');
    finishedRow.style.removeProperty('translate');
    listElement.classList.remove('is-reordering');
    if (releaseTranslate && releaseTranslate !== '0 0px' && releaseTranslate !== '0px') {
      animateRowTranslate(finishedRow, releaseTranslate, true);
    }

    if (finishedPointerId !== undefined && listElement.hasPointerCapture(finishedPointerId)) {
      listElement.releasePointerCapture(finishedPointerId);
    }
    refreshRowMetadata();
    if (finishedHandle && !finishedHandle.disabled && document.activeElement !== finishedHandle) {
      finishedHandle.focus({ preventScroll: true });
    }
    if (getRows().indexOf(finishedRow) !== dragInitialIndex) {
      notifyChange();
    }
    dragInitialIndex = -1;
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!listElement || activeDragRow || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    const handle =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-typing-line-handle]')
        : undefined;
    const row = handle?.closest<HTMLElement>('[data-typing-line-row]');
    if (!handle || handle.disabled || !row) {
      return;
    }
    const rows = getRows();
    if (rows.length <= 1) {
      return;
    }
    event.preventDefault();
    handle.focus();
    listElement.setPointerCapture(event.pointerId);

    const visualTop = row.getBoundingClientRect().top;
    cancelRowAnimation(row);
    const naturalTop = getRowLayoutBox(listElement.getBoundingClientRect().top, row).top;
    const initialOffsetY = Math.round(visualTop - naturalTop);

    activeDragRow = row;
    activeDragHandle = handle;
    activePointerId = event.pointerId;
    dragInitialIndex = rows.indexOf(row);
    dragGrabOffsetY = event.clientY - visualTop;

    listElement.classList.add('is-reordering');
    row.classList.add('is-dragging');
    if (initialOffsetY !== 0) {
      row.style.translate = `0 ${initialOffsetY}px`;
    }
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!listElement || !activeDragRow || event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    const rowHeight = activeDragRow.offsetHeight;
    const desiredTop = event.clientY - dragGrabOffsetY;
    const visualCenterY = desiredTop + rowHeight / 2;
    if (swapDraggedRowWithNeighbors(activeDragRow, visualCenterY)) {
      refreshRowMetadata();
    }

    const listRect = listElement.getBoundingClientRect();
    const minTop = listRect.top;
    const maxTop = Math.max(minTop, listRect.bottom - rowHeight);
    const clampedTop = Math.max(minTop, Math.min(maxTop, desiredTop));
    const naturalTop = getRowLayoutBox(listRect.top, activeDragRow).top;
    activeDragRow.style.translate = `0 ${Math.round(clampedTop - naturalTop)}px`;
  }

  function handlePointerUp(event: PointerEvent): void {
    if (event.pointerId === activePointerId) {
      finishPointerDrag();
    }
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
      const newRow = createRow('', true);
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
      runWithRowFlip(
        listElement,
        () => {
          row.remove();
          return true;
        },
        row
      );
      refreshRowMetadata();
      const remainingRows = getRows();
      focusRowInput(remainingRows[Math.min(rowIndex, remainingRows.length - 1)]);
      notifyChange();
    });

    listElement.addEventListener('pointerdown', (event) =>
      handlePointerDown(event as PointerEvent)
    );
    listElement.addEventListener('pointermove', (event) =>
      handlePointerMove(event as PointerEvent)
    );
    listElement.addEventListener('pointerup', (event) => handlePointerUp(event as PointerEvent));
    listElement.addEventListener('pointercancel', (event) =>
      handlePointerUp(event as PointerEvent)
    );
    listElement.addEventListener('lostpointercapture', finishPointerDrag);
    listElement.addEventListener('keydown', (event) => handleKeydown(event as KeyboardEvent));
    listElement.addEventListener('paste', (event) => handlePaste(event as ClipboardEvent));
  }

  return { bind, readValue, syncFromValue };
}
