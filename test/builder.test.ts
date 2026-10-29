/**
 * URL builder tests – Builder schemas, the builder client core (encoding, path building, prefill parsing, snippets, icon slug resolution), icon picker assets, and "Open in Builder" links, verified against the Worker's route parser (`src/routes/schema.ts`, `src/site/pages/BuilderPage.tsx`, `dist/client/builder.client.js`).
 */

import builderScript from '@bundles/builder.client.js';
import { describe, expect, it, vi } from 'vitest';
import { resolveServiceOwnerMode, SERVICES_CONFIG } from '@/config/services';
import { STACK_CATEGORIES } from '@/config/stack';
import { THEME_COLOR_NAMES } from '@/config/theme';
import {
  decodeSegment,
  ICON_MOTION_TOKENS,
  isTruthyFlagParam,
  parseSpecialParam,
  resolveAnimationMode,
  resolveDotState,
  resolveQuoteLayout,
  resolveTypingAlign,
  resolveTypingCursor,
  resolveTypingEraseMode,
  resolveTypingFont,
  resolveTypingLayout,
  resolveVariant,
  SPECIAL_ELEMENT_KINDS,
  STACK_MOTION_TOKENS,
  TYPING_ALIGN_TOKENS,
  TYPING_CURSOR_TOKENS,
  TYPING_ERASE_TOKENS,
  TYPING_FONT_TOKENS,
  TYPING_LAYOUT_TOKENS,
  VARIANT_TOKENS,
} from '@/routes/params';
import { getBuilderSchema, resolveBuilderTarget } from '@/routes/schema';
import {
  DEFAULT_TYPING_VARIANT,
  renderSvgPath,
  resolveSvgPathRedirectUrl,
  resolveSvgRoute,
} from '@/routes/svg';
import { getSiteAsset } from '@/site/assets';
import { BUILDER_PAGES, DOCS_PAGES } from '@/site/navigation';
import { renderBuilderHtml, renderDocsHtml, renderHomeHtml } from '@/site/pages';
import { buildMarkdownSnippetTokens } from '@/site/shared';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  getIconPickerIndex,
  ICON_SLUG_ALIASES,
  MAX_ICON_SLUG_LENGTH,
  resolveIcon,
} from '@/svg/icons';
import { STACK_GAP_RANGE, STACK_PER_LINE_RANGE, STACK_TILE_SIZE_RANGE } from '@/svg/stack';
import type {
  BuilderClientCore,
  BuilderKind,
  BuilderSchema,
  BuilderState,
  IconPickerIndex,
  IconPickerSetId,
  ServiceRequest,
} from '@/types';
import {
  evaluateClientCore,
  evaluateClientDom,
  readClientModuleSources,
  requireDefined,
} from './helpers';

// ---------------------------------------- TYPES ----------------------------------------

/** Minimal synthetic DOM event payload used to drive `createTypingLinesController` in Node. */
interface FakeDomEvent {
  /** Whether the event bubbles up through `parentElement`. */
  bubbles?: boolean;
  /** Mouse button index (`0` for primary button). */
  button?: number;
  /** Pointer vertical viewport coordinate in pixels. */
  clientY?: number;
  /** Pointer identifier. */
  pointerId?: number;
  /** Pointer device kind (`'mouse'`, `'touch'`, or `'pen'`). */
  pointerType?: string;
  /** No-op `preventDefault` hook. */
  preventDefault: () => void;
  /** Originating target node. */
  target?: FakeDomNode;
  /** DOM event type name. */
  type: string;
}

/** Minimal synthetic DOM element supporting pointer capture, layout geometry, and DOM relocation. */
interface FakeDomNode {
  /** Register an event listener for `type`. */
  addEventListener: (type: string, listener: (event: FakeDomEvent) => void) => void;
  /** Append child nodes or fragments. */
  append: (...nodes: (FakeDomFragment | FakeDomNode)[]) => void;
  /** Attribute map. */
  attributes: Map<string, string>;
  /** Insert `nodes` right before this child inside `parentElement`. */
  before: (...nodes: FakeDomNode[]) => void;
  /** Ordered child elements. */
  children: FakeDomNode[];
  /** Minimal `DOMTokenList` implementation. */
  classList: {
    add: (...tokens: string[]) => void;
    contains: (token: string) => boolean;
    remove: (...tokens: string[]) => void;
  };
  /** Deep or shallow clone preserving prototype and subtree structure. */
  cloneNode: (isDeep?: boolean) => FakeDomNode;
  /** Closest ancestor (including self) matching a selector. */
  closest: (selector: string) => FakeDomNode | undefined;
  /** `data-*` camelCase dataset record. */
  dataset: Record<string, string>;
  /** Disabled flag for button controls. */
  disabled: boolean;
  /** Dispatch a synthetic or native `Event` with optional bubbling. */
  dispatchEvent: (event: Event | FakeDomEvent) => boolean;
  /** Move `document.activeElement` to this node. */
  focus: () => void;
  /** Read an attribute value (`undefined` when unset). */
  getAttribute: (name: string) => string | undefined;
  /** Compute layout bounding box from row order inside `#typing-lines-list`. */
  getBoundingClientRect: () => {
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
  };
  /** Check whether `pointerId` is currently captured on this element. */
  hasPointerCapture: (pointerId: number) => boolean;
  /** Node kind tag used when cloning. */
  kind: 'button' | 'div' | 'input';
  /** Optional atomic `moveBefore` hook (relocates without detaching or dropping pointer capture). */
  moveBefore?: (movedNode: FakeDomNode, referenceNode: FakeDomNode | undefined) => void;
  /** Next sibling element (`undefined` at end). */
  readonly nextElementSibling: FakeDomNode | undefined;
  /** Next sibling node (`undefined` at end). */
  readonly nextSibling: FakeDomNode | undefined;
  /** Element pixel height. */
  readonly offsetHeight: number;
  /** Element pixel Y offset relative to `#typing-lines-list`. */
  readonly offsetTop: number;
  /** Parent element (`undefined` when detached). */
  parentElement: FakeDomNode | undefined;
  /** Input placeholder text. */
  placeholder: string;
  /** Previous sibling element (`undefined` at start). */
  readonly previousElementSibling: FakeDomNode | undefined;
  /** First descendant matching `selector`. */
  querySelector: (selector: string) => FakeDomNode | undefined;
  /** All descendants matching `selector` in tree order. */
  querySelectorAll: (selector: string) => FakeDomNode[];
  /** Release pointer capture for `pointerId`. */
  releasePointerCapture: (pointerId: number) => void;
  /** Remove an attribute. */
  removeAttribute: (name: string) => void;
  /** Replace all children with `nodes`. */
  replaceChildren: (...nodes: (FakeDomFragment | FakeDomNode)[]) => void;
  /** Set an attribute value. */
  setAttribute: (name: string, value: string) => void;
  /** Capture `pointerId` on this element. */
  setPointerCapture: (pointerId: number) => void;
  /** Set input caret selection offsets. */
  setSelectionRange: (start: number, end: number) => void;
  /** Minimal inline style object. */
  style: { removeProperty: (property: string) => void; translate: string };
  /** Text content string. */
  textContent: string;
  /** Input value string. */
  value: string;
}

/** Minimal `DocumentFragment` container used by `syncFromValue`. */
interface FakeDomFragment {
  /** Append child elements into the fragment. */
  append: (...nodes: FakeDomNode[]) => void;
  /** Buffered child elements. */
  children: FakeDomNode[];
  /** Discriminator distinguishing fragments from elements. */
  isFragment: true;
}

/** Mounted fake `/builder/typing` line-editor harness and global cleanup callback. */
interface TypingLinesDomHarness {
  /** Simulated `document` object tracking `activeElement`. */
  documentStub: {
    activeElement: FakeDomNode | undefined;
    createDocumentFragment: () => FakeDomFragment;
  };
  /** Install an atomic `moveBefore` hook on `listElement` and return a call-count reader. */
  enableAtomicMoveBefore: () => () => number;
  /** Count of fallback (`before` / `append`) relocations of already-mounted rows. */
  getFallbackMoveCount: () => number;
  /** Hidden `#field-lines` input element. */
  hiddenInput: FakeDomNode;
  /** `#typing-lines-list` row container element. */
  listElement: FakeDomNode;
  /** Read the current `.typing-line-index` badge strings in DOM order. */
  readBadges: () => string[];
  /** Read the current `.typing-line-input` values in DOM order. */
  readInputs: () => string[];
  /** Reset the fallback relocation counter. */
  resetFallbackMoveCount: () => void;
  /** Restore stubbed global constructors. */
  teardown: () => void;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Every builder element kind. */
const BUILDER_KINDS: readonly BuilderKind[] = BUILDER_PAGES.map((page) => page.kind);

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches every "Open in Builder" preview link (`href` with escaped `&`). */
const PREVIEW_LINK_RX = /<a class="preview-link" href="(?<href>[^"]+)"/g;

/** Matches SMIL animation elements in rendered SVGs. */
const SMIL_ANIMATION_RX = /<animate/;

// -------------------------------------- INTERNALS --------------------------------------

const core = evaluateClientCore<BuilderClientCore>(builderScript, 'svgBuilderCore');

/** Collect the decoded `?path=` of every preview link on a page. */
function collectPreviewPaths(html: string): string[] {
  const paths: string[] = [];
  for (const match of html.matchAll(PREVIEW_LINK_RX)) {
    const href = (match.groups?.href ?? '').replaceAll('&amp;', '&');
    paths.push(new URL(href, 'https://svg.xul.is').searchParams.get('path') ?? '');
  }
  return paths;
}

/** Collect the decoded `?path=` of every preview link on the homepage and every docs page. */
function collectAllPreviewPaths(): string[] {
  const paths = collectPreviewPaths(renderHomeHtml());
  for (const page of DOCS_PAGES) {
    paths.push(...collectPreviewPaths(renderDocsHtml(page.slug)));
  }
  return paths;
}

/** Find a field of a builder schema. */
function findField(schema: BuilderSchema, id: string): BuilderSchema['fields'][number] {
  const field = schema.fields.find((candidate) => candidate.id === id);
  if (!field) {
    throw new Error(`Missing builder field ${schema.kind}.${id}`);
  }
  return field;
}

/** Collect the option values of a builder field. */
function collectOptionValues(schema: BuilderSchema, id: string): string[] {
  return (findField(schema, id).options ?? []).map((option) => option.value);
}

/** Map a server-resolved icon onto its picker set. */
function toPickerSet(slug: string, isBrandFirst: boolean): IconPickerSetId | undefined {
  const resolved = resolveIcon(slug, isBrandFirst);
  if (!resolved) {
    return undefined;
  }
  return resolved.type === 'lucide' ? 'lucide' : 'brands';
}

/** Parse a path with a builder, rebuild it, and return both rendered SVGs (prefill must not change the output). */
function renderPrefillRoundTrip(
  kind: BuilderKind,
  path: string
): [original: string, rebuilt: string] {
  const schema = getBuilderSchema(kind);
  const parsed = core.parsePath(schema, path);
  expect(parsed, path).toBeDefined();
  return [renderSvgPath(path), renderSvgPath(core.buildPath(schema, parsed ?? {}).path)];
}

/** Match the subset of selectors queried by `createTypingLinesController`. */
function isMatchingTypingSelector(node: FakeDomNode, selector: string): boolean {
  if (selector === '[data-typing-line-row]') {
    return Object.hasOwn(node.dataset, 'typingLineRow');
  }
  if (selector === '[data-typing-line-handle]') {
    return Object.hasOwn(node.dataset, 'typingLineHandle');
  }
  if (selector === '[data-typing-line-remove]') {
    return Object.hasOwn(node.dataset, 'typingLineRemove');
  }
  if (selector.startsWith('.')) {
    return node.classList.contains(selector.slice(1));
  }
  return false;
}

/** No-op callback for synthetic DOM `preventDefault` and prototype constructors. */
function noopDomAction(): undefined {
  return undefined;
}

/** Prototype constructor for simulated `Element` instances. */
function FakeElement(): undefined {
  return undefined;
}

/** Prototype constructor for simulated `HTMLElement` instances. */
function FakeHTMLElement(): undefined {
  return undefined;
}
FakeHTMLElement.prototype = Object.create(FakeElement.prototype);

/** Prototype constructor for simulated `HTMLInputElement` instances. */
function FakeHTMLInputElement(): undefined {
  return undefined;
}
FakeHTMLInputElement.prototype = Object.create(FakeHTMLElement.prototype);

/** Prototype constructor for simulated `HTMLButtonElement` instances. */
function FakeHTMLButtonElement(): undefined {
  return undefined;
}
FakeHTMLButtonElement.prototype = Object.create(FakeHTMLElement.prototype);

/** Prototype constructor for simulated `HTMLFormElement` instances. */
function FakeHTMLFormElement(): undefined {
  return undefined;
}
FakeHTMLFormElement.prototype = Object.create(FakeHTMLElement.prototype);

/** Prototype constructor for simulated `HTMLSelectElement` instances. */
function FakeHTMLSelectElement(): undefined {
  return undefined;
}
FakeHTMLSelectElement.prototype = Object.create(FakeHTMLElement.prototype);

/** Build a minimal attribute-tracking input stub for `syncOutputAvailability` tests. */
function createLineInputStub(): {
  closest: () => undefined;
  readonly invalidAttr: string | undefined;
  removeAttribute: (name: string) => void;
  setAttribute: (name: string, val: string) => void;
} {
  const attrs = new Map<string, string>();
  return {
    closest: () => undefined,
    get invalidAttr() {
      return attrs.get('aria-invalid');
    },
    removeAttribute(name: string) {
      attrs.delete(name);
    },
    setAttribute(name: string, val: string) {
      attrs.set(name, val);
    },
  };
}

/** Build a minimal attribute- and class-tracking box for builder preview stage DOM tests. */
function createAttributeBox(initialHidden = false): {
  attributes: Map<string, string>;
  classList: {
    contains: (token: string) => boolean;
    toggle: (token: string, force?: boolean) => boolean;
  };
  getAttribute: (name: string) => string | undefined;
  readonly isHidden: boolean;
  removeAttribute: (name: string) => void;
  setAttribute: (name: string, val: string) => void;
  toggleAttribute: (name: string, force?: boolean) => boolean;
} {
  const attributes = new Map<string, string>();
  if (initialHidden) {
    attributes.set('hidden', '');
  }
  const classSet = new Set<string>();
  return {
    attributes,
    classList: {
      contains: (token: string) => classSet.has(token),
      toggle(token: string, force?: boolean) {
        const shouldHave = force ?? !classSet.has(token);
        if (shouldHave) {
          classSet.add(token);
        } else {
          classSet.delete(token);
        }
        return shouldHave;
      },
    },
    getAttribute: (name: string) => attributes.get(name),
    get isHidden() {
      return attributes.has('hidden');
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    },
    setAttribute(name: string, val: string) {
      attributes.set(name, val);
    },
    toggleAttribute(name: string, force?: boolean) {
      const shouldHave = force ?? !attributes.has(name);
      if (shouldHave) {
        attributes.set(name, '');
      } else {
        attributes.delete(name);
      }
      return shouldHave;
    },
  };
}

/** Build and mount a minimal W3C-pointer-capture-compliant DOM harness for `createTypingLinesController`. */
function mountTypingLinesDomHarness(initialLines: string): TypingLinesDomHarness {
  const documentStub = {
    activeElement: undefined as FakeDomNode | undefined,
    createDocumentFragment(): FakeDomFragment {
      const children: FakeDomNode[] = [];
      return {
        append(...nodes: FakeDomNode[]) {
          children.push(...nodes);
        },
        children,
        isFragment: true,
      };
    },
  };

  let fallbackMoveCount = 0;
  const capturedByNode = new WeakMap<FakeDomNode, Set<number>>();

  function getCapturedSet(node: FakeDomNode): Set<number> {
    let set = capturedByNode.get(node);
    if (!set) {
      set = new Set<number>();
      capturedByNode.set(node, set);
    }
    return set;
  }

  // Per the W3C Pointer Events spec, detaching a node releases any pointer capture held inside its subtree:
  function releaseCaptureInDetachedSubtree(subtreeRoot: FakeDomNode): void {
    const captured = capturedByNode.get(subtreeRoot);
    if (captured && captured.size > 0) {
      captured.clear();
      subtreeRoot.dispatchEvent({
        bubbles: false,
        preventDefault: noopDomAction,
        target: subtreeRoot,
        type: 'lostpointercapture',
      });
    }
    for (const child of subtreeRoot.children) {
      releaseCaptureInDetachedSubtree(child);
    }
  }

  function relocateChild(
    parent: FakeDomNode,
    movedNode: FakeDomNode,
    referenceNode: FakeDomNode | undefined,
    isAtomicMove: boolean
  ): FakeDomNode {
    const oldParent = movedNode.parentElement;
    if (oldParent) {
      const existingIndex = oldParent.children.indexOf(movedNode);
      if (existingIndex !== -1) {
        oldParent.children.splice(existingIndex, 1);
      }
      movedNode.parentElement = undefined;
      if (!isAtomicMove) {
        fallbackMoveCount += 1;
        releaseCaptureInDetachedSubtree(movedNode);
      }
    }
    movedNode.parentElement = parent;
    if (!referenceNode) {
      parent.children.push(movedNode);
    } else {
      const refIndex = parent.children.indexOf(referenceNode);
      if (refIndex === -1) {
        parent.children.push(movedNode);
      } else {
        parent.children.splice(refIndex, 0, movedNode);
      }
    }
    return movedNode;
  }

  const listenerStore = new WeakMap<FakeDomNode, Map<string, ((event: FakeDomEvent) => void)[]>>();
  function listenersByTypeOf(node: FakeDomNode, type: string): ((event: FakeDomEvent) => void)[] {
    return listenerStore.get(node)?.get(type) ?? [];
  }

  function createFakeNode(kind: 'button' | 'div' | 'input'): FakeDomNode {
    let prototype = FakeHTMLElement.prototype as object;
    if (kind === 'button') {
      prototype = FakeHTMLButtonElement.prototype as object;
    } else if (kind === 'input') {
      prototype = FakeHTMLInputElement.prototype as object;
    }
    const node = Object.create(prototype) as FakeDomNode;
    const classSet = new Set<string>();
    const listenersByType = new Map<string, ((event: FakeDomEvent) => void)[]>();
    const rowHeight = 36;
    const rowGap = 6;
    const listTop = 100;

    node.attributes = new Map<string, string>();
    node.children = [];
    node.dataset = {};
    node.disabled = false;
    node.kind = kind;
    node.parentElement = undefined;
    node.placeholder = '';
    node.style = {
      removeProperty(property: string) {
        if (property === 'translate') {
          node.style.translate = '';
        }
      },
      translate: '',
    };
    node.textContent = '';
    node.value = '';
    node.classList = {
      add(...tokens: string[]) {
        for (const token of tokens) {
          classSet.add(token);
        }
      },
      contains: (token: string) => classSet.has(token),
      remove(...tokens: string[]) {
        for (const token of tokens) {
          classSet.delete(token);
        }
      },
    };
    node.addEventListener = (type, listener) => {
      const list = listenersByType.get(type) ?? [];
      list.push(listener);
      listenersByType.set(type, list);
    };
    node.dispatchEvent = (rawEvent) => {
      const eventPayload: FakeDomEvent =
        rawEvent instanceof Event
          ? {
              bubbles: rawEvent.bubbles,
              preventDefault: () => rawEvent.preventDefault(),
              target: node,
              type: rawEvent.type,
            }
          : { ...rawEvent, target: rawEvent.target ?? node };
      let current: FakeDomNode | undefined = node;
      while (current) {
        for (const listener of listenersByTypeOf(current, eventPayload.type)) {
          listener(eventPayload);
        }
        current = eventPayload.bubbles ? current.parentElement : undefined;
      }
      return true;
    };
    node.focus = () => {
      documentStub.activeElement = node;
    };
    node.getAttribute = (name) => node.attributes.get(name);
    node.removeAttribute = (name) => {
      node.attributes.delete(name);
    };
    node.setAttribute = (name, value) => {
      node.attributes.set(name, value);
    };
    node.setSelectionRange = noopDomAction;
    node.setPointerCapture = (pointerId) => {
      getCapturedSet(node).add(pointerId);
    };
    node.hasPointerCapture = (pointerId) => getCapturedSet(node).has(pointerId);
    node.releasePointerCapture = (pointerId) => {
      getCapturedSet(node).delete(pointerId);
    };
    node.append = (...items) => {
      for (const item of items) {
        if ('isFragment' in item) {
          for (const child of item.children) {
            relocateChild(node, child, undefined, false);
          }
        } else {
          relocateChild(node, item, undefined, false);
        }
      }
    };
    node.before = (...items) => {
      const parent = node.parentElement;
      if (!parent) {
        return;
      }
      for (const item of items) {
        relocateChild(parent, item, node, false);
      }
    };
    node.replaceChildren = (...items) => {
      for (const existing of node.children) {
        existing.parentElement = undefined;
        releaseCaptureInDetachedSubtree(existing);
      }
      node.children = [];
      node.append(...items);
    };
    node.closest = (selector) => {
      let cursor: FakeDomNode | undefined = node;
      while (cursor) {
        if (isMatchingTypingSelector(cursor, selector)) {
          return cursor;
        }
        cursor = cursor.parentElement;
      }
      return undefined;
    };
    node.querySelectorAll = (selector) => {
      const matches: FakeDomNode[] = [];
      function walk(parent: FakeDomNode): void {
        for (const child of parent.children) {
          if (isMatchingTypingSelector(child, selector)) {
            matches.push(child);
          }
          walk(child);
        }
      }
      walk(node);
      return matches;
    };
    node.querySelector = (selector) => node.querySelectorAll(selector)[0];
    node.cloneNode = (isDeep = false) => {
      const cloned = createFakeNode(node.kind);
      for (const [attrName, attrVal] of node.attributes) {
        cloned.attributes.set(attrName, attrVal);
      }
      for (const token of classSet) {
        cloned.classList.add(token);
      }
      Object.assign(cloned.dataset, node.dataset);
      cloned.disabled = node.disabled;
      cloned.placeholder = node.placeholder;
      cloned.style.translate = node.style.translate;
      cloned.textContent = node.textContent;
      cloned.value = node.value;
      if (isDeep) {
        for (const child of node.children) {
          cloned.append(child.cloneNode(true));
        }
      }
      return cloned;
    };
    node.getBoundingClientRect = () => {
      if (Object.hasOwn(node.dataset, 'typingLineRow')) {
        const index = node.parentElement
          ? Math.max(0, node.parentElement.children.indexOf(node))
          : 0;
        const top = listTop + index * (rowHeight + rowGap);
        return { bottom: top + rowHeight, height: rowHeight, left: 0, right: 320, top, width: 320 };
      }
      const count = node.children.length;
      const height = count > 0 ? count * rowHeight + (count - 1) * rowGap : 0;
      return { bottom: listTop + height, height, left: 0, right: 320, top: listTop, width: 320 };
    };

    Object.defineProperties(node, {
      nextElementSibling: {
        get(): FakeDomNode | undefined {
          if (!node.parentElement) {
            return undefined;
          }
          const idx = node.parentElement.children.indexOf(node);
          return idx !== -1 ? node.parentElement.children[idx + 1] : undefined;
        },
      },
      nextSibling: {
        get(): FakeDomNode | undefined {
          return node.nextElementSibling;
        },
      },
      offsetHeight: {
        get(): number {
          return node.getBoundingClientRect().height;
        },
      },
      offsetTop: {
        get(): number {
          if (!Object.hasOwn(node.dataset, 'typingLineRow') || !node.parentElement) {
            return 0;
          }
          return Math.max(0, node.parentElement.children.indexOf(node)) * (rowHeight + rowGap);
        },
      },
      previousElementSibling: {
        get(): FakeDomNode | undefined {
          if (!node.parentElement) {
            return undefined;
          }
          const idx = node.parentElement.children.indexOf(node);
          return idx > 0 ? node.parentElement.children[idx - 1] : undefined;
        },
      },
    });

    listenerStore.set(node, listenersByType);
    return node;
  }

  vi.stubGlobal('Element', FakeElement);
  vi.stubGlobal('HTMLElement', FakeHTMLElement);
  vi.stubGlobal('HTMLInputElement', FakeHTMLInputElement);
  vi.stubGlobal('HTMLButtonElement', FakeHTMLButtonElement);
  vi.stubGlobal('document', documentStub);

  const editorElement = createFakeNode('div');
  editorElement.dataset.maxLines = '12';
  editorElement.dataset.maxLength = '80';
  const hiddenInput = createFakeNode('input');
  const addButton = createFakeNode('button');
  const listElement = createFakeNode('div');

  const templateRow = createFakeNode('div');
  templateRow.dataset.typingLineRow = '';
  const templateHandle = createFakeNode('button');
  templateHandle.dataset.typingLineHandle = '';
  const templateIndexBadge = createFakeNode('div');
  templateIndexBadge.classList.add('typing-line-index');
  templateHandle.append(templateIndexBadge);
  const templateInput = createFakeNode('input');
  templateInput.classList.add('typing-line-input');
  const templateRemove = createFakeNode('button');
  templateRemove.dataset.typingLineRemove = '';
  templateRow.append(templateHandle, templateInput, templateRemove);
  listElement.append(templateRow);

  const controller = core.createTypingLinesController({
    addButton,
    editorElement,
    hiddenInput,
    listElement,
  });
  controller.syncFromValue(initialLines);
  controller.bind();
  fallbackMoveCount = 0;

  return {
    documentStub,
    enableAtomicMoveBefore() {
      let moveBeforeCallCount = 0;
      listElement.moveBefore = (movedNode, referenceNode) => {
        moveBeforeCallCount += 1;
        relocateChild(listElement, movedNode, referenceNode, true);
      };
      return () => moveBeforeCallCount;
    },
    getFallbackMoveCount: () => fallbackMoveCount,
    hiddenInput,
    listElement,
    readBadges: () =>
      listElement.querySelectorAll('.typing-line-index').map((badge) => badge.textContent),
    readInputs: () =>
      listElement.querySelectorAll('.typing-line-input').map((input) => input.value),
    resetFallbackMoveCount() {
      fallbackMoveCount = 0;
    },
    teardown() {
      vi.unstubAllGlobals();
    },
  };
}

// ----------------------------------------- MAIN ----------------------------------------

/*************************************** Schemas ****************************************/

describe('builder schemas', () => {
  it('reads every option list from the parser and theme (drift guard)', () => {
    const badge = getBuilderSchema('badge');
    const service = getBuilderSchema('service');
    const stack = getBuilderSchema('stack');
    expect(collectOptionValues(badge, 'variant')).toEqual([...VARIANT_TOKENS]);
    expect(collectOptionValues(badge, 'color')).toEqual([...THEME_COLOR_NAMES]);
    expect(collectOptionValues(stack, 'color')).toEqual(['', ...THEME_COLOR_NAMES]);
    expect(collectOptionValues(service, 'color')).toEqual(['', ...THEME_COLOR_NAMES]);
    expect(collectOptionValues(badge, 'dot')).toEqual(['', ...THEME_COLOR_NAMES]);
    expect(collectOptionValues(service, 'dot')).toEqual(['', 'none', ...THEME_COLOR_NAMES]);
    expect(collectOptionValues(badge, 'special')).toEqual(['', ...SPECIAL_ELEMENT_KINDS]);
    expect(collectOptionValues(service, 'special')).toEqual(['none', ...SPECIAL_ELEMENT_KINDS]);
    expect(collectOptionValues(badge, 'anim')).toEqual([
      '',
      ...ICON_MOTION_TOKENS.filter((motion) => motion !== 'default'),
    ]);
    expect(collectOptionValues(getBuilderSchema('icon'), 'anim')).toEqual([
      '',
      ...ICON_MOTION_TOKENS.filter((motion) => motion !== 'default' && motion !== 'none'),
    ]);
    expect(collectOptionValues(stack, 'anim')).toEqual([
      '',
      ...STACK_MOTION_TOKENS.filter((motion) => motion !== 'none'),
    ]);
    expect(collectOptionValues(getBuilderSchema('typing'), 'anim')).toEqual(['', 'none']);
    for (const kind of BUILDER_KINDS) {
      expect(getBuilderSchema(kind).maxIconSlugLength, kind).toBe(MAX_ICON_SLUG_LENGTH);
    }
  });

  it('offers every registered service preset with all of its metrics and owner arity', () => {
    const services = getBuilderSchema('service').services ?? [];
    const registeredServices = Object.entries(SERVICES_CONFIG);
    expect(services.map((service) => service.key)).toEqual(registeredServices.map(([key]) => key));
    for (const [key, definition] of registeredServices) {
      const option = services.find((service) => service.key === key);
      expect(
        option?.metrics.map((metric) => metric.value),
        key
      ).toEqual(Object.keys(definition.metrics));
      expect(option?.ownerMode, key).toBe(resolveServiceOwnerMode(definition));
    }
    expect(services.find((service) => service.key === 'gh')?.ownerMode).toBe('required');
  });

  it('accepts every offered select value and widget modifier in the matching parser', () => {
    const badge = getBuilderSchema('badge');
    for (const variant of collectOptionValues(badge, 'variant').filter(Boolean)) {
      expect(resolveVariant(variant, '1'), variant).toBe(variant);
    }
    for (const dot of collectOptionValues(badge, 'dot').filter(
      (value) => value && value !== 'none'
    )) {
      expect(resolveDotState(dot), dot).toBeDefined();
    }
    for (const motion of collectOptionValues(badge, 'anim').filter(Boolean)) {
      expect(resolveAnimationMode(core.composeAnim(false, motion, ''), 'default'), motion).toBe(
        motion
      );
      expect(
        resolveAnimationMode(core.composeAnim(true, 'shake', motion), 'default'),
        motion
      ).not.toBe('default');
    }
    for (const option of findField(badge, 'special').options ?? []) {
      if (option.value) {
        const special = parseSpecialParam(
          core.composeSpecial(option.value, option.placeholder ?? '', '')
        );
        expect(special?.type, option.value).toBe(option.value);
        for (const modifier of option.modifiers ?? []) {
          if (modifier.value) {
            const modified = parseSpecialParam(
              core.composeSpecial(option.value, option.placeholder ?? '', modifier.value)
            );
            expect(modified, `${option.value}:${modifier.value}`).toMatchObject({
              hasPulse: modifier.value === 'pulse',
            });
          }
        }
      }
    }
  });

  it('declares only layout aliases and center flags the quote parser treats as vertical (drift guard)', () => {
    const layoutField = findField(getBuilderSchema('quote'), 'layout');
    for (const option of layoutField.options ?? []) {
      for (const alias of option.aliases ?? []) {
        expect(resolveQuoteLayout(alias, undefined, undefined), alias).toBe(option.value);
      }
    }
    const quote = getBuilderSchema('quote');
    for (const center of ['1', 'true', 'yes', 'TRUE', ' Yes ', '0', 'no', 'false']) {
      const parsed = core.parsePath(quote, `/quote/Hi?center=${encodeURIComponent(center)}`);
      const expected = resolveQuoteLayout(undefined, undefined, center);
      expect(parsed?.layout || 'horizontal', center).toBe(expected);
    }
  });

  it('declares typing option tokens and aliases that match the parser (drift guard)', () => {
    const typing = getBuilderSchema('typing');
    expect(collectOptionValues(typing, 'layout')).toEqual([...TYPING_LAYOUT_TOKENS]);
    expect(collectOptionValues(typing, 'font')).toEqual([...TYPING_FONT_TOKENS]);
    expect(collectOptionValues(typing, 'cursor')).toEqual([...TYPING_CURSOR_TOKENS]);
    expect(collectOptionValues(typing, 'erase')).toEqual([...TYPING_ERASE_TOKENS]);
    expect(collectOptionValues(typing, 'align')).toEqual([...TYPING_ALIGN_TOKENS]);

    const resolvers: readonly {
      fieldName: string;
      resolve: (alias: string) => string | undefined;
    }[] = [
      { fieldName: 'layout', resolve: resolveTypingLayout },
      { fieldName: 'font', resolve: resolveTypingFont },
      { fieldName: 'cursor', resolve: resolveTypingCursor },
      { fieldName: 'erase', resolve: resolveTypingEraseMode },
      { fieldName: 'align', resolve: resolveTypingAlign },
      { fieldName: 'typo', resolve: (alias) => (isTruthyFlagParam(alias) ? 'true' : '') },
    ];

    for (const { fieldName, resolve } of resolvers) {
      for (const option of findField(typing, fieldName).options ?? []) {
        for (const alias of option.aliases ?? []) {
          expect(resolve(alias), `${fieldName}:${alias}`).toBe(option.value);
        }
      }
    }

    // `title` is only emitted for titled layouts (`window` and `ide`); `hint` is omitted on `none`; `align` is omitted on `browser` and `ide`; redundant defaults are omitted:
    expect(
      core.buildPath(typing, {
        align: 'center',
        hint: 'utf8',
        layout: 'window',
        lines: 'Hi',
        title: 'zsh',
      }).path
    ).toBe('/typing/Hi?align=center&title=zsh&hint=utf8');
    expect(
      core.buildPath(typing, {
        align: 'center',
        hint: 'utf8',
        layout: 'prompt',
        lines: 'Hi',
        title: 'zsh',
      }).path
    ).toBe('/typing/Hi?layout=prompt&align=center&hint=utf8');
    expect(
      core.buildPath(typing, {
        align: 'center',
        hint: 'utf8',
        layout: 'browser',
        lines: 'Hi',
        title: 'zsh',
      }).path
    ).toBe('/typing/Hi?layout=browser&hint=utf8');
    expect(
      core.buildPath(typing, {
        align: 'center',
        hint: 'utf8',
        layout: 'ide',
        lines: 'Hi',
        title: 'index.ts',
      }).path
    ).toBe('/typing/Hi?layout=ide&hint=utf8');
    expect(
      core.buildPath(typing, {
        align: 'center',
        hint: 'utf8',
        layout: 'ide',
        lines: 'Hi',
        title: 'app.ts',
      }).path
    ).toBe('/typing/Hi?layout=ide&title=app.ts&hint=utf8');
    expect(
      core.buildPath(typing, { hint: 'utf8', layout: 'none', lines: 'Hi', title: 'zsh' }).path
    ).toBe('/typing/Hi?layout=none');
  });

  it('derives upstream redirect templates for most service metrics', () => {
    const services = getBuilderSchema('service').services ?? [];
    let metricCount = 0;
    let templateCount = 0;
    for (const service of services) {
      for (const metric of service.metrics) {
        metricCount += 1;
        if (metric.redirect) {
          templateCount += 1;
          expect(metric.redirect, `${service.key}/${metric.value}`).toContain('{target}');
          expect(metric.redirect, `${service.key}/${metric.value}`).toMatch(/^https:\/\//);
        }
      }
    }
    expect(templateCount).toBeGreaterThan(metricCount / 2);
  });

  it('orders builder fields and emitted query parameters consistently from content to appearance, geometry, chrome, and motion', () => {
    const expectedFieldIds: Readonly<Record<BuilderKind, readonly string[]>> = {
      badge: ['label', 'value', 'variant', 'color', 'icon', 'dot', 'special', 'anim'],
      button: ['label', 'value', 'variant', 'color', 'size', 'icon', 'anim'],
      icon: ['icon', 'color', 'size', 'stroke', 'anim'],
      quote: ['text', 'author', 'layout', 'variant', 'color', 'size', 'width', 'anim'],
      service: [
        'service',
        'owner',
        'target',
        'metric',
        'label',
        'variant',
        'color',
        'icon',
        'dot',
        'special',
        'anim',
      ],
      stack: ['groups', 'variant', 'color', 'perline', 'size', 'gap', 'groupgap', 'anim'],
      typing: [
        'lines',
        'prefix',
        'layout',
        'variant',
        'color',
        'font',
        'size',
        'width',
        'align',
        'title',
        'icon',
        'hint',
        'cursor',
        'erase',
        'typo',
        'duration',
        'pause',
        'anim',
      ],
    };

    for (const kind of BUILDER_KINDS) {
      const schema = getBuilderSchema(kind);
      expect(
        schema.fields.map((field) => field.id),
        kind
      ).toEqual(expectedFieldIds[kind]);
    }

    // Verify that `buildPath` emits query parameters in the exact same order as `schema.fields`:
    const nonDefaultStates: Readonly<Record<BuilderKind, BuilderState>> = {
      badge: {
        anim: 'sheen',
        color: 'emerald',
        dot: 'green',
        icon: 'sparkles',
        label: 'Build',
        special: 'bar:80',
        value: 'Passing',
        variant: '2',
      },
      button: {
        anim: 'sheen',
        color: 'emerald',
        icon: 'rocket',
        label: 'Deploy',
        size: 'lg',
        value: 'v2',
        variant: '2',
      },
      icon: { anim: 'spin', color: 'emerald', icon: 'refresh-cw', size: '32', stroke: '1.5' },
      quote: {
        anim: 'sheen',
        author: 'Ada',
        color: 'emerald',
        layout: 'vertical',
        size: 'xl',
        text: 'Code is poetry.',
        variant: '1',
        width: '420',
      },
      service: {
        anim: 'sheen',
        color: 'emerald',
        dot: 'green',
        icon: 'package',
        label: 'pkg',
        metric: 'v',
        service: 'npm',
        special: 'bar:80',
        target: 'hono',
        variant: '2',
      },
      stack: {
        anim: 'wave',
        color: 'emerald',
        gap: '12',
        groupgap: '32',
        groups: 'ts,rust|go,py',
        perline: '2',
        size: '48',
        variant: '1',
      },
      typing: {
        align: 'center',
        anim: 'none',
        color: 'emerald',
        cursor: 'block',
        duration: '1800',
        erase: 'select',
        font: 'mono',
        hint: 'utf8',
        icon: 'terminal',
        layout: 'prompt',
        lines: 'First;Second',
        pause: '900',
        prefix: '$',
        size: 'lg',
        typo: 'true',
        variant: '1',
        width: '520',
      },
    };

    for (const kind of BUILDER_KINDS) {
      const schema = getBuilderSchema(kind);
      const { path } = core.buildPath(schema, nonDefaultStates[kind]);
      const emittedKeys = [...new URL(path, schema.origin).searchParams.keys()];
      const expectedKeys = schema.fields
        .filter((field) => field.param !== undefined && (kind !== 'typing' || field.id !== 'title'))
        .map((field) => field.param ?? '');
      expect(emittedKeys, `${kind}: ${path}`).toEqual(expectedKeys);
    }

    // Also verify `title` sits between `align` and `icon` when emitted on a titled typing layout (`window`):
    const typingSchema = getBuilderSchema('typing');
    const titledTypingPath = core.buildPath(typingSchema, {
      ...nonDefaultStates.typing,
      font: 'sans',
      layout: 'window',
      title: 'zsh',
    }).path;
    expect([...new URL(titledTypingPath, typingSchema.origin).searchParams.keys()]).toEqual([
      'variant',
      'color',
      'font',
      'size',
      'width',
      'align',
      'title',
      'icon',
      'hint',
      'cursor',
      'erase',
      'typo',
      'duration',
      'pause',
      'anim',
    ]);
  });
});

/************************************* Builder core *************************************/

describe('builder client core', () => {
  it('encodes path segments so the Worker decodes them back exactly (incl. +, %, /, parentheses, and Unicode)', () => {
    for (const text of [
      'build status',
      'C++',
      '99.4%',
      '2.4M/d',
      'why?',
      'a&b=c#d',
      '(beta)',
      'c,cpp:4|rust;py',
      'Grüße 👋',
      '',
    ]) {
      const encoded = core.encodeSegment(text);
      expect(decodeSegment(encoded), text).toBe(text);
      expect(core.decodeSegment(encoded), text).toBe(text);
      expect(encoded, text).not.toMatch(/[ ()/?#&]/);
    }
    expect(core.encodeSegment('build status')).toBe('build+status');
    expect(core.encodeSegment('c,cpp:4|rust;py')).toBe('c,cpp:4|rust;py');
  });

  it('builds a URL the Worker routes for the example state of every builder', () => {
    for (const kind of BUILDER_KINDS) {
      const schema = getBuilderSchema(kind);
      const { missing, path } = core.buildPath(schema, { ...schema.initialState });
      expect(missing, kind).toEqual([]);
      expect(resolveSvgRoute(new URL(path, schema.origin)), `${kind}: ${path}`).toBeDefined();
    }
  });

  it('round-trips prefill parsing: parse(build(state)) rebuilds the identical URL', () => {
    const states: [BuilderKind, BuilderState][] = [
      ['badge', { color: 'amber', icon: 'zap', label: '', value: '', variant: '3' }],
      ['badge', { color: 'amber', icon: 'zap', label: '', value: '100%' }],
      ['badge', { dot: 'sky', label: 'Status', value: 'until 18:00', variant: '3' }],
      ['badge', { anim: 'sheen,none,nudge', label: 'C++ (beta)', special: 'ring:84:pulse' }],
      ['button', { icon: 'none,arrow-right', label: 'Read the docs', size: '40', value: 'v2' }],
      ['icon', { anim: 'sheen,spin', icon: 'archlinux', size: '64', stroke: '1.5' }],
      [
        'stack',
        { anim: 'sheen,wave', groupgap: '30', groups: 'c,cpp:2|rust\npy,ts', perline: '8,6' },
      ],
      ['quote', { author: '', layout: 'vertical', text: 'Ship it & smile!', width: '420' }],
      ['service', { icon: ',star', metric: 'v', owner: 'types', service: 'npm', target: 'node' }],
      ['service', { metric: 'v', service: 'go', target: 'github.com/spf13/cobra' }],
    ];
    for (const [kind, state] of states) {
      const schema = getBuilderSchema(kind);
      const { path } = core.buildPath(schema, state);
      const parsed = core.parsePath(schema, path);
      expect(parsed, path).toBeDefined();
      expect(core.buildPath(schema, parsed ?? {}).path, path).toBe(path);
      expect(resolveSvgRoute(new URL(path, schema.origin)), path).toBeDefined();
    }
    const badgeSchema = getBuilderSchema('badge');
    const iconOnlyPath = core.buildPath(badgeSchema, {
      color: 'amber',
      icon: 'zap',
      label: '',
      value: '',
      variant: '3',
    }).path;
    expect(iconOnlyPath).toBe('/badge?variant=3&color=amber&icon=zap');
    expect(
      core
        .buildSnippetTokens(`${badgeSchema.origin}${iconOnlyPath}`, 'Badge', '')
        .url.some(([className]) => className === 'hl-path')
    ).toBe(false);
  });

  it('builds the exact service request the Worker parses (owners, multi-segment targets, metrics)', () => {
    const schema = getBuilderSchema('service');
    const cases: [BuilderState, ServiceRequest][] = [
      [
        { metric: 'v', service: 'npm', target: 'hono' },
        { metric: 'v', service: 'npm', target: 'hono' },
      ],
      [
        { metric: 'dt', owner: 'types', service: 'npm', target: 'node' },
        { metric: 'dt', owner: 'types', service: 'npm', target: 'node' },
      ],
      [
        { metric: 'v', owner: 'ignored', service: 'go', target: 'github.com/spf13/cobra' },
        { metric: 'v', service: 'go', target: 'github.com/spf13/cobra' },
      ],
    ];
    for (const [state, expected] of cases) {
      const { path } = core.buildPath(schema, state);
      const match = resolveSvgRoute(new URL(path, schema.origin));
      expect(match?.kind, path).toBe('service');
      expect(match?.kind === 'service' ? match.request : undefined, path).toEqual(expected);
    }
  });

  it('reports empty required fields instead of building a broken route', () => {
    const badge = getBuilderSchema('badge');
    expect(core.buildPath(badge, { label: '', value: '' }).missing).toEqual([]);
    expect(core.buildPath(getBuilderSchema('button'), { label: '' }).missing).toEqual(['Label']);
    expect(core.buildPath(getBuilderSchema('quote'), { text: ' ' }).missing).toEqual(['Quote']);
  });

  it('rejects paths that belong to another builder or that the Worker rejects (regression: prefix case, extra service segments)', () => {
    const service = getBuilderSchema('service');
    expect(core.parsePath(getBuilderSchema('icon'), '/badge/build/passing')).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('icon'), '/icon')).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('icon'), '/icon/')).toBeUndefined();
    expect(core.parsePath(service, '/badge/build/passing')).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('badge'), '/badge/a/b/c')).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('badge'), '/badge/status/online/up')).toBeUndefined();
    // The Worker's route prefixes are case-sensitive:
    expect(resolveSvgRoute(new URL('https://svg.xul.is/Badge/build/passing'))).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('badge'), '/Badge/build/passing')).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('icon'), '/ICON/rocket')).toBeUndefined();
    // Single-segment targets take 3 or 4 segments; owner-less presets never take an owner segment:
    expect(core.parsePath(service, '/badge/npm/a/b/c/v')).toBeUndefined();
    const ownerless = service.services?.find(
      (option) => option.ownerMode === 'none' && option.maxTargetSegments === 1
    );
    expect(ownerless).toBeDefined();
    expect(core.parsePath(service, `/badge/${ownerless?.key}/owner/target/v`)).toBeUndefined();
    const multiSegment = service.services?.find((option) => option.maxTargetSegments > 1);
    const tooLong = Array.from({ length: (multiSegment?.maxTargetSegments ?? 1) + 1 }, () => 'x');
    expect(
      core.parsePath(service, `/badge/${multiSegment?.key}/${tooLong.join('/')}/v`)
    ).toBeUndefined();
  });

  it('prefills quote layout aliases, type, and center flags like the Worker (regression: vertical aliases lost)', () => {
    const quote = getBuilderSchema('quote');
    for (const query of [
      'layout=center',
      'layout=v',
      'layout=VERTICAL',
      'type=v',
      'type=center',
      'center=true',
      'center=1',
      'center=yes',
      'layout=&type=vertical',
      'layout=foo&center=true',
      'layout=horizontal&center=true',
    ]) {
      const path = `/quote/XulbuX/Hello+world?${query}`;
      const [original, rebuilt] = renderPrefillRoundTrip('quote', path);
      expect(rebuilt, query).toBe(original);
    }
    expect(core.parsePath(quote, '/quote/Hi?type=v')?.layout).toBe('vertical');
    expect(core.parsePath(quote, '/quote/Hi?layout=center')?.layout).toBe('vertical');
    expect(core.parsePath(quote, '/quote/Hi?layout=foo&center=1')?.layout).toBe('');
  });

  it('prefills option values case-insensitively and maps unknown values to the default (regression: Emerald dropped)', () => {
    const badge = getBuilderSchema('badge');
    const path = '/badge/build/passing?color=Emerald&variant=2&dot=GREEN&anim=Sheen';
    expect(core.parsePath(badge, path)).toMatchObject({ color: 'emerald', dot: 'green' });
    expect(core.parsePath(badge, '/badge/a/b?dot=none')?.dot).toBe('');
    expect(core.parsePath(badge, '/badge/a/b?color=notacolor')?.color).toBe('');
    expect(core.parsePath(getBuilderSchema('button'), '/button/Go?size=bogus')?.size).toBe('');
    expect(core.parsePath(getBuilderSchema('icon'), '/icon/rocket?size=bogus')?.size).toBe('');
    for (const [kind, prefillPath] of [
      ['badge', path],
      ['badge', '/badge/a/b?color=notacolor&variant=9'],
      ['button', '/button/Go?size=LG&color=Rose'],
      ['button', '/button/Go?size=bogus'],
      ['quote', '/quote/Hi?size=XL&layout=Vertical'],
    ] as const) {
      const [original, rebuilt] = renderPrefillRoundTrip(kind, prefillPath);
      expect(rebuilt, prefillPath).toBe(original);
    }
  });

  it('canonicalizes stack and badge ?anim= motion aliases and drops unknown tokens (regression: motion aliases failed to prefill)', () => {
    const stack = getBuilderSchema('stack');
    const badge = getBuilderSchema('badge');
    expect(core.parsePath(stack, '/stack/rust,go?anim=bounce')?.anim).toBe('wave');
    expect(core.parsePath(stack, '/stack/rust,go?anim=sheen,bob')?.anim).toBe('sheen,float');
    expect(core.parsePath(stack, '/stack/rust,go?anim=breathe')?.anim).toBe('pulse');
    expect(core.parsePath(stack, '/stack/rust,go?anim=auto')?.anim).toBe('wave');
    expect(core.parsePath(stack, '/stack/rust,go?anim=bogus')?.anim).toBe('');
    expect(core.parsePath(badge, '/badge/a/b?anim=twirl')?.anim).toBe('turn');
    expect(core.parsePath(badge, '/badge/a/b?anim=spin-smooth')?.anim).toBe('whirl');

    for (const prefillPath of [
      '/stack/rust,go?anim=bounce',
      '/stack/rust,go?anim=sheen,bob',
      '/stack/rust,go?anim=breathe',
      '/stack/rust,go?anim=auto',
      '/stack/rust,go?anim=bogus',
    ]) {
      const [original, rebuilt] = renderPrefillRoundTrip('stack', prefillPath);
      expect(rebuilt, prefillPath).toBe(original);
    }
  });

  it('reads path segment fallbacks from the schema aliases in Worker precedence (regression: hard-coded alias order)', () => {
    const stack = getBuilderSchema('stack');
    expect(core.parsePath(stack, '/stack?i=react&icons=vue&groups=svelte')?.groups).toBe('svelte');
    expect(core.parsePath(stack, '/stack?groups=&icons=vue&i=react')?.groups).toBe('vue');
    expect(core.parsePath(stack, '/stack?i=react')?.groups).toBe('react');
    for (const path of ['/stack?i=react&icons=vue&groups=svelte', '/stack?groups=&icons=vue']) {
      const [original, rebuilt] = renderPrefillRoundTrip('stack', path);
      expect(rebuilt, path).toBe(original);
    }
    expect(builderScript).not.toContain("['groups', 'icons', 'i']");
    const quote = getBuilderSchema('quote');
    expect(core.parsePath(quote, '/quote?text=&quote=Hi&author=Me')).toMatchObject({
      author: 'Me',
      text: 'Hi',
    });
  });

  it('canonicalizes service metric aliases and case like the Worker', () => {
    const schema = getBuilderSchema('service');
    const service = schema.services?.find(
      (option) => Object.keys(option.metricAliases ?? {}).length > 0 && option.ownerMode === 'none'
    );
    const [alias, canonical] = Object.entries(service?.metricAliases ?? {})[0] ?? ['', ''];
    expect(alias).not.toBe('');
    const path = `/badge/${service?.key}/target/${alias.toUpperCase()}`;
    expect(core.parsePath(schema, path)?.metric).toBe(canonical);
  });

  it('parses and builds a required owner followed by a multi-segment target', () => {
    const schema: BuilderSchema = {
      ...getBuilderSchema('service'),
      services: [
        {
          key: 'multi',
          maxTargetSegments: 3,
          metrics: [
            {
              defaultColor: 'indigo',
              defaultIcon: 'package',
              defaultLabel: 'v',
              label: 'v',
              value: 'v',
            },
          ],
          ownerMode: 'required',
          ownerName: ':owner',
          targetName: ':path',
          title: 'Multi',
        },
      ],
    };
    const parsed = core.parsePath(schema, '/badge/multi/acme/a/b.c/v');
    expect(parsed).toMatchObject({ metric: 'v', owner: 'acme', service: 'multi', target: 'a/b.c' });
    expect(core.buildPath(schema, parsed ?? {}).path).toBe('/badge/multi/acme/a/b.c/v');
    expect(core.parsePath(schema, '/badge/multi/acme/v')).toBeUndefined();
    expect(core.parsePath(schema, '/badge/multi/acme/a/b/c/d/v')).toBeUndefined();
  });

  it('composes and splits the composite icon, animation, and widget values', () => {
    const specialOptions = findField(getBuilderSchema('badge'), 'special').options ?? [];
    const serviceSpecialOptions = findField(getBuilderSchema('service'), 'special').options ?? [];
    expect(core.composeIconPair('', 'arrow-right', false)).toBe('none,arrow-right');
    expect(core.composeIconPair('', 'star', true)).toBe(',star');
    expect(core.composeIconPair('rocket', '', false)).toBe('rocket');
    expect(core.composeIconPair('rocket', 'none', false)).toBe('rocket');
    expect(core.composeIconPair('none', 'none', false)).toBe('');
    expect(core.splitIconPair('none', false)).toEqual(['', '']);
    expect(core.splitIconPair('none', true)).toEqual(['none', '']);
    expect(core.splitIconPair('none,arrow-right', false)).toEqual(['', 'arrow-right']);
    expect(core.splitIconPair('none,arrow-right', true)).toEqual(['none', 'arrow-right']);
    expect(core.composeAnim(true, '', 'nudge')).toBe('sheen,default,nudge');
    expect(core.splitAnim('sheen,default,nudge')).toEqual({
      hasSheen: true,
      left: '',
      right: 'nudge',
    });
    expect(core.splitSpecial('bar:92:static', specialOptions)).toEqual({
      kind: 'bar',
      modifier: 'static',
      payload: '92',
    });
    expect(core.splitSpecial('bar:92:pulse', specialOptions)).toEqual({
      kind: 'bar',
      modifier: '',
      payload: '92',
    });
    expect(core.splitSpecial('ring:84:static', specialOptions)).toEqual({
      kind: 'ring',
      modifier: '',
      payload: '84',
    });
    expect(core.splitSpecial('delta:+24%', specialOptions)).toEqual({
      kind: 'delta',
      modifier: '',
      payload: '+24%',
    });
    expect(core.splitSpecial('sparkline', serviceSpecialOptions)).toEqual({
      kind: 'sparkline',
      modifier: '',
      payload: '',
    });
    expect(core.splitSpecial('bar:static', serviceSpecialOptions)).toEqual({
      kind: 'bar',
      modifier: 'static',
      payload: '',
    });
    expect(core.splitSpecial('ring:auto:pulse', serviceSpecialOptions)).toEqual({
      kind: 'ring',
      modifier: 'pulse',
      payload: '',
    });
    expect(core.splitSpecial('none', serviceSpecialOptions)).toEqual({
      kind: 'none',
      modifier: '',
      payload: '',
    });
    expect(core.composeSpecial('sparkline', ' ', '')).toBe('');
    expect(core.composeSpecial('sparkline', ' ', '', true)).toBe('sparkline');
    expect(core.composeSpecial('bar', ' ', 'static', true)).toBe('bar:static');
    expect(core.composeSpecial('none', '', '')).toBe('none');
    expect(core.collectStackSlugs('c,cpp:4|rust@amber\n py ; ts:2|cpu@emerald:1')).toEqual([
      'c',
      'cpp',
      'rust',
      'py',
      'ts',
      'cpu',
    ]);
    // Bare trailing `:` (without digits) or mid-group `:N` tokens are not valid group column suffixes and must be flagged as unknown slugs:
    expect(core.collectStackSlugs('nodejs,postgres:|rust:2,go')).toEqual([
      'nodejs',
      'postgres:',
      'rust:2',
      'go',
    ]);
    expect(
      core.composeCategorizedStack(
        [
          ['ts', 'js', 'py', 'rust'],
          ['react', 'vue', 'tailwind'],
          ['docker', 'git', 'linux'],
        ],
        true
      )
    ).toBe('ts,js,py,rust|react,vue,tailwind;docker,git,linux');
    expect(
      core.composeCategorizedStack(
        [['c', 'cpp', 'cs', 'rust', 'go', 'zig', 'py', 'js', 'ts', 'java']],
        true
      )
    ).toBe('c,cpp,cs,rust,go,zig,py,js,ts,java:5');
    expect(
      core.composeCategorizedStack(
        [
          [
            'react',
            'vue',
            'tailwind',
            'unocss',
            'bun',
            'threejs',
            'webgl',
            'greensock',
            'electron',
            'gtk',
          ],
          ['nodejs', 'dotnet', 'laravel'],
          ['docker', 'aws', 'azure', 'cloudflare'],
          ['git', 'vite'],
        ],
        true
      )
    ).toBe(
      'react,vue,tailwind,unocss,bun,threejs,webgl,greensock,electron,gtk:5|nodejs,dotnet,laravel:2;docker,aws,azure,cloudflare|git,vite'
    );
    expect(
      core.composeCategorizedStack(
        [
          [
            'react',
            'vue',
            'tailwind',
            'unocss',
            'bun',
            'threejs',
            'webgl',
            'greensock',
            'electron',
            'gtk',
          ],
          ['nodejs', 'dotnet', 'laravel', 'graphql'],
          ['docker', 'aws', 'azure', 'cloudflare'],
          ['git', 'vite'],
        ],
        true
      )
    ).toBe(
      'react,vue,tailwind,unocss,bun,threejs,webgl,greensock,electron,gtk:5|nodejs,dotnet,laravel,graphql:2;docker,aws,azure,cloudflare|git,vite'
    );
    expect(
      core.composeCategorizedStack(
        [
          ['react', 'vue', 'svelte', 'tailwind', 'unocss', 'threejs'],
          ['nodejs', 'dotnet', 'laravel', 'graphql'],
        ],
        true
      )
    ).toBe('react,vue,svelte,tailwind,unocss,threejs:3|nodejs,dotnet,laravel,graphql:2');
    expect(
      core.composeCategorizedStack(
        [
          ['ts', 'js', 'py', 'rust'],
          ['react', 'vue', 'tailwind'],
          ['docker', 'git', 'linux'],
        ],
        true,
        '6'
      )
    ).toBe('ts,js,py,rust;react,vue,tailwind|docker,git,linux');
    expect(
      core.composeCategorizedStack(
        [
          ['ts', 'js', 'py', 'rust'],
          ['react', 'vue', 'tailwind'],
          ['docker', 'git', 'linux'],
        ],
        true,
        '10'
      )
    ).toBe('ts,js,py,rust|react,vue,tailwind|docker,git,linux');
    expect(
      core.composeCategorizedStack(
        [
          ['ts', 'js', 'py', 'rust'],
          ['react', 'vue', 'tailwind'],
          ['docker', 'git', 'linux'],
        ],
        true,
        '2,2,3'
      )
    ).toBe('ts,js,py,rust|react,vue,tailwind;docker,git,linux');
    expect(
      core.composeCategorizedStack(
        [['c', 'cpp', 'cs', 'rust', 'go', 'zig', 'py', 'js', 'ts', 'java']],
        true,
        '6'
      )
    ).toBe('c,cpp,cs,rust,go,zig,py,js,ts,java:5');
    expect(
      core.composeCategorizedStack(
        [
          [
            'c',
            'cpp',
            'cs',
            'rust',
            'java',
            'py',
            'js',
            'ts',
            'php',
            'lua',
            'bash',
            'powershell',
            'html',
            'css',
            'sass',
            'md',
          ],
          [
            'dotnet',
            'vue',
            'pinia',
            'laravel',
            'symfony',
            'nodejs',
            'threejs',
            'tauri',
            'unity',
            'unreal',
            'tailwind',
            'wordpress',
          ],
          [
            'git',
            'github',
            'githubactions',
            'vscode',
            'visualstudio',
            'npm',
            'vite',
            'cmake',
            'linux',
            'windows',
            'raspberrypi',
            'arduino',
          ],
          ['aws', 'azure', 'cloudflare', 'firebase', 'netlify', 'terraform', 'mysql', 'sqlite'],
          ['figma', 'ai', 'blender', 'ps', 'pr', 'ae'],
          ['obsidian', 'notion', 'codepen', 'gtk', 'latex', 'regex'],
        ],
        true,
        '10'
      )
    ).toBe(
      'c,cpp,cs,rust,java,py,js,ts,php,lua,bash,powershell,html,css,sass,md:8;dotnet,vue,pinia,laravel,symfony,nodejs,threejs,tauri,unity,unreal,tailwind,wordpress:6;git,github,githubactions,vscode,visualstudio,npm,vite,cmake,linux,windows,raspberrypi,arduino:6|aws,azure,cloudflare,firebase,netlify,terraform,mysql,sqlite:4;figma,ai,blender,ps,pr,ae:3|obsidian,notion,codepen,gtk,latex,regex:3'
    );
    expect(
      core.composeCategorizedStack(
        [
          ['ts', 'rust@amber'],
          ['react', 'docker'],
        ],
        false
      )
    ).toBe('ts,rust@amber,react,docker');
  });

  it('builds exact Markdown, HTML, and URL snippets with escaped alt text and links', () => {
    const url = 'https://svg.xul.is/badge/build/passing?icon=circle-check';
    expect(core.buildSnippets(url, 'build [ok]', '')).toEqual({
      html: '<img src="https://svg.xul.is/badge/build/passing?icon=circle-check" alt="build [ok]" />',
      markdown: String.raw`![build \[ok\]](https://svg.xul.is/badge/build/passing?icon=circle-check)`,
      url,
    });
    const linked = core.buildSnippets(url, 'a "quoted" <alt>', 'https://xul.is');
    expect(linked.markdown).toBe(`[![a "quoted" <alt>](${url})](https://xul.is)`);
    expect(linked.html).toBe(
      `<a href="https://xul.is"><img src="${url}" alt="a &quot;quoted&quot; &lt;alt&gt;" /></a>`
    );
    expect(core.buildAltText(getBuilderSchema('badge'), { label: 'build', value: 'passing' })).toBe(
      'build: passing'
    );
  });

  it('percent-encodes Markdown link targets and keeps raw & in HTML snippets (regression: broken snippets)', () => {
    const url = 'https://svg.xul.is/badge/a/b?icon=zap&color=rose';
    const snippets = core.buildSnippets(url, String.raw`a\b`, 'https://example.com/a (b)/<c>');
    expect(snippets.markdown).toBe(
      String.raw`[![a\\b](${url})](https://example.com/a%20%28b%29/%3Cc%3E)`
    );
    expect(snippets.html).toBe(
      `<a href="https://example.com/a (b)/&lt;c&gt;"><img src="https://svg.xul.is/badge/a/b?icon=zap&color=rose" alt="a\\b" /></a>`
    );
    const htmlTokens = core.buildSnippetTokens(url, 'x', '').html;
    expect(htmlTokens).toContainEqual(['hl-path', '/a/b']);
    expect(htmlTokens).toContainEqual(['hl-key', '&color=']);
    expect(htmlTokens).toContainEqual(['hl-val', 'rose']);
  });

  it('builds the same Markdown tokens as the docs code drawers', () => {
    const cases: [url: string, alt: string, href: string | undefined][] = [
      ['https://svg.xul.is/badge/build/passing', 'build', undefined],
      [
        'https://svg.xul.is/badge/a/b?icon=zap&color=rose&flag',
        String.raw`C++ [beta] \ x`,
        'https://xul.is',
      ],
      ['https://svg.xul.is/quote/Hi?text=a b&x=(y)', 'Quote <1>', 'https://example.com/a (b)'],
      ['https://svg.xul.is/stack/c,cpp:4|rust', 'Tech & "Stack"', undefined],
    ];
    for (const [url, alt, href] of cases) {
      expect(core.buildSnippetTokens(url, alt, href ?? '').markdown, url).toEqual(
        buildMarkdownSnippetTokens(url, alt, href)
      );
    }
  });

  it('links service badges to their upstream page like the docs (user decision: no badge URL round trip)', () => {
    const schema = getBuilderSchema('service');
    let upstreamCount = 0;
    for (const path of collectAllPreviewPaths()) {
      if (resolveBuilderTarget(path)?.kind === 'service') {
        const state = core.parsePath(schema, path) ?? {};
        const rebuilt = core.buildPath(schema, state).path;
        const url = `${schema.origin}${rebuilt}`;
        const link = core.buildDefaultLinkTarget(schema, state, url);
        const expected = resolveSvgPathRedirectUrl(path);
        if (link.startsWith(schema.origin)) {
          // No template; the query-free badge path redirects to the same page:
          expect(resolveSvgPathRedirectUrl(new URL(link).pathname), path).toBe(expected);
        } else {
          expect(link, path).toBe(expected);
          upstreamCount += 1;
        }
      }
    }
    expect(upstreamCount).toBeGreaterThan(20);
    for (const kind of BUILDER_KINDS.filter((candidate) => candidate !== 'service')) {
      const kindSchema = getBuilderSchema(kind);
      expect(
        core.buildDefaultLinkTarget(kindSchema, { ...kindSchema.initialState }, schema.origin),
        kind
      ).toBe('');
    }
  });

  it('falls back to the badge path for values outside the verified template characters', () => {
    const schema = getBuilderSchema('service');
    const service = schema.services?.find(
      (option) =>
        option.ownerMode !== 'none' &&
        option.maxTargetSegments === 1 &&
        option.metrics[0]?.redirect !== undefined
    );
    expect(service).toBeDefined();
    const metric = service?.metrics[0]?.value ?? '';
    const state = { metric, owner: 'owner', service: service?.key ?? '', target: 'target' };
    const { path } = core.buildPath(schema, state);
    expect(core.buildDefaultLinkTarget(schema, state, `${schema.origin}${path}`)).toBe(
      resolveSvgPathRedirectUrl(path)
    );
    const unsafeState = { ...state, owner: 'own+er' };
    const unsafePath = core.buildPath(schema, unsafeState).path;
    expect(
      core.buildDefaultLinkTarget(schema, unsafeState, `${schema.origin}${unsafePath}?color=rose`)
    ).toBe(`${schema.origin}${unsafePath}`);
  });

  it('renders reduced-motion previews without SMIL animations (regression: <img> previews kept animating)', () => {
    const animatedPaths = [
      ...BUILDER_KINDS.map((kind) => {
        const schema = getBuilderSchema(kind);
        return core.buildPath(schema, { ...schema.initialState, anim: 'sheen' }).path;
      }),
      '/badge/kv/84%25?special=ring:84:pulse&dot=green&anim=sheen,spin',
      '/badge/coverage/92%25?special=bar:92&icon=loader&anim=spin',
      '/button/Go?icon=heart,arrow-right&anim=sheen,pulse,nudge',
    ];
    for (const path of animatedPaths) {
      const previewPath = core.buildPreviewPath(path, true);
      expect(previewPath, path).toContain('anim=none');
      expect(renderSvgPath(previewPath), previewPath).not.toMatch(SMIL_ANIMATION_RX);
      expect(core.buildPreviewPath(path, false)).toBe(path);
    }
    expect(renderSvgPath('/button/Go?icon=heart,arrow-right&anim=sheen,pulse,nudge')).toMatch(
      SMIL_ANIMATION_RX
    );
    expect(core.buildPreviewPath('', true)).toBe('');
  });

  it('persists alt text and link target in share links', () => {
    const shareUrl = new URL(
      core.buildShareUrl(
        'https://svg.xul.is/builder/badge?path=%2Fold&alt=old',
        '/badge/a/b?color=rose',
        'My alt',
        'https://xul.is'
      )
    );
    expect(shareUrl.searchParams.get('path')).toBe('/badge/a/b?color=rose');
    expect(shareUrl.searchParams.get('alt')).toBe('My alt');
    expect(shareUrl.searchParams.get('link')).toBe('https://xul.is');
    const cleared = new URL(core.buildShareUrl(shareUrl.href, '/badge/a', '', ''));
    expect(cleared.searchParams.has('alt')).toBe(false);
    expect(cleared.searchParams.has('link')).toBe(false);
  });

  it('retries failed loads instead of caching the rejection (regression: failed icon fetches cached forever)', async () => {
    let calls = 0;
    const load = core.createAsyncCache((key) => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error(key)) : Promise.resolve(`${key}-${calls}`);
    });
    await expect(load('page')).rejects.toThrow('page');
    await expect(load('page')).resolves.toBe('page-2');
    await expect(load('page')).resolves.toBe('page-2');
    expect(calls).toBe(2);
  });

  it('moves the picker focus to the first and last match, not the last rendered tile (regression: Home/End)', () => {
    expect(core.computeGridFocusIndex('End', 3, 8, 5000)).toBe(4999);
    expect(core.computeGridFocusIndex('Home', 4000, 8, 5000)).toBe(0);
    expect(core.computeGridFocusIndex('ArrowDown', 4996, 8, 5000)).toBe(4999);
    expect(core.computeGridFocusIndex('ArrowUp', 3, 8, 5000)).toBe(0);
    expect(core.computeGridFocusIndex('ArrowRight', 10, 8, 5000)).toBe(11);
    expect(core.computeGridFocusIndex('Enter', 10, 8, 5000)).toBeUndefined();
    expect(core.computeGridFocusIndex('End', 0, 8, 0)).toBeUndefined();
  });

  it('omits redundant query parameters when fields equal their static, layout, or service metric defaults', () => {
    const badge = getBuilderSchema('badge');
    const button = getBuilderSchema('button');
    const icon = getBuilderSchema('icon');
    const stack = getBuilderSchema('stack');
    const quote = getBuilderSchema('quote');
    const typing = getBuilderSchema('typing');
    const service = getBuilderSchema('service');

    expect(
      core.buildPath(badge, {
        color: 'indigo',
        dot: 'none',
        icon: 'none',
        label: 'Build',
        special: 'none',
        value: 'Passing',
        variant: '1',
      }).path
    ).toBe('/badge/Build/Passing');

    expect(
      core.buildPath(button, {
        anim: 'none',
        color: 'indigo',
        icon: 'none,none',
        label: 'Docs',
        size: 'md',
        variant: '1',
      }).path
    ).toBe('/button/Docs');
    expect(core.buildPath(button, { label: 'Docs', size: '30' }).path).toBe('/button/Docs?size=30');

    expect(
      core.buildPath(icon, {
        color: 'indigo',
        icon: 'rocket',
        size: '24',
        stroke: String(DEFAULT_ICON_STROKE_WIDTH),
      }).path
    ).toBe('/icon/rocket');
    expect(core.buildPath(icon, { icon: 'rocket', stroke: '2' }).path).toBe(
      '/icon/rocket?stroke=2'
    );
    expect(renderSvgPath('/icon/rocket')).toBe(
      renderSvgPath(`/icon/rocket?color=indigo&size=24&stroke=${DEFAULT_ICON_STROKE_WIDTH}`)
    );
    expect(renderSvgPath('/typing/Hi?layout=prompt')).toBe(
      renderSvgPath('/typing/Hi?layout=prompt&font=sans&align=left&cursor=bar&erase=backspace')
    );
    expect(renderSvgPath('/typing/Hi?layout=none')).toBe(
      renderSvgPath('/typing/Hi?layout=none&align=center&font=sans')
    );
    expect(renderSvgPath('/quote/Hi?layout=vertical')).toBe(
      renderSvgPath('/quote/Hi?layout=vertical&size=lg&variant=2')
    );

    expect(
      core.buildPath(stack, {
        gap: String(STACK_GAP_RANGE.default),
        groups: 'rust,go',
        perline: String(STACK_PER_LINE_RANGE.default),
        size: String(STACK_TILE_SIZE_RANGE.default),
        variant: '2',
      }).path
    ).toBe('/stack/rust,go');
    expect(core.buildPath(stack, { groups: 'rust,go', size: '44' }).path).toBe(
      '/stack/rust,go?size=44'
    );
    expect(core.buildPath(stack, { groupgap: '26', groups: 'rust|go' }).path).toBe(
      '/stack/rust|go?groupgap=26'
    );

    expect(
      core.buildPath(quote, { layout: 'horizontal', size: 'md', text: 'Hi', variant: '2' }).path
    ).toBe('/quote/Hi');
    expect(core.buildPath(quote, { layout: 'vertical', size: 'lg', text: 'Hi' }).path).toBe(
      '/quote/Hi?layout=vertical'
    );
    expect(core.buildPath(quote, { layout: 'vertical', size: 'md', text: 'Hi' }).path).toBe(
      '/quote/Hi?layout=vertical&size=md'
    );
    expect(core.buildPath(quote, { text: 'Hi', width: '560' }).path).toBe('/quote/Hi?width=560');

    expect(
      core.buildPath(typing, {
        align: 'left',
        color: 'indigo',
        cursor: 'bar',
        erase: 'backspace',
        font: 'mono',
        hint: 'icon:none',
        icon: 'none',
        layout: 'window',
        lines: 'Hi',
        title: 'none',
        typo: 'false',
        variant: DEFAULT_TYPING_VARIANT,
      }).path
    ).toBe('/typing/Hi');
    expect(core.buildPath(typing, { layout: 'terminal', lines: 'Hi' }).path).toBe('/typing/Hi');
    expect(core.buildPath(typing, { font: 'sans', layout: 'prompt', lines: 'Hi' }).path).toBe(
      '/typing/Hi?layout=prompt'
    );
    expect(core.buildPath(typing, { font: 'mono', layout: 'prompt', lines: 'Hi' }).path).toBe(
      '/typing/Hi?layout=prompt&font=mono'
    );
    expect(core.buildPath(typing, { align: 'center', layout: 'none', lines: 'Hi' }).path).toBe(
      '/typing/Hi?layout=none'
    );
    expect(
      core.buildPath(typing, { align: 'center', layout: 'none', lines: 'Hi', prefix: '$' }).path
    ).toBe('/typing/%24/Hi?layout=none&align=center');
    expect(
      core.buildPath(typing, { align: 'left', layout: 'none', lines: 'Hi', prefix: '$' }).path
    ).toBe('/typing/%24/Hi?layout=none');
    expect(core.buildPath(typing, { layout: 'ide', lines: 'Hi', title: 'none' }).path).toBe(
      '/typing/Hi?layout=ide&title=none'
    );

    const npmVersionMetric = SERVICES_CONFIG.npm?.metrics.v;
    expect(
      core.buildPath(service, {
        color: npmVersionMetric?.defaultColor ?? 'red',
        dot: 'none',
        icon: npmVersionMetric?.defaultIcon ?? 'npm',
        label: npmVersionMetric?.defaultLabel ?? 'npm',
        metric: 'v',
        service: 'npm',
        special: 'none',
        target: 'hono',
        variant: '1',
      }).path
    ).toBe('/badge/npm/hono/v');
    expect(
      core.buildPath(service, { icon: 'none', metric: 'v', service: 'npm', target: 'hono' }).path
    ).toBe('/badge/npm/hono/v?icon=none');
    expect(
      core.buildPath(service, { label: 'NPM', metric: 'v', service: 'npm', target: 'hono' }).path
    ).toBe('/badge/npm/hono/v?label=NPM');
    expect(
      core.buildPath(service, {
        metric: 'c',
        owner: 'honojs',
        service: 'codecov',
        special: 'ring',
        target: 'hono',
      }).path
    ).toBe('/badge/codecov/honojs/hono/c');
    expect(
      core.buildPath(service, {
        color: 'emerald',
        metric: 'c',
        owner: 'honojs',
        service: 'codecov',
        special: 'none',
        target: 'hono',
      }).path
    ).toBe('/badge/codecov/honojs/hono/c?color=emerald&special=none');
    expect(
      core.buildPath(service, {
        dot: 'none',
        metric: 'stage',
        owner: 'gradio',
        service: 'hf-space',
        target: 'hello_world',
      }).path
    ).toBe('/badge/hf-space/gradio/hello_world/stage?dot=none');
    expect(
      core.buildPath(service, {
        icon: 'huggingface',
        metric: 'sdk',
        owner: 'gradio',
        service: 'hf-space',
        target: 'hello_world',
      }).path
    ).toBe('/badge/hf-space/gradio/hello_world/sdk?icon=huggingface');
  });
});

/************************************* Icon picker **************************************/

describe('icon picker index & assets', () => {
  it('resolves slugs exactly like resolveIcon in Lucide-first and brand-first contexts', () => {
    const resolver = core.createIconResolver(getIconPickerIndex(), MAX_ICON_SLUG_LENGTH);
    const index = getIconPickerIndex();
    const samples = [
      ...index.sets.lucide.filter((_slug, position) => position % 9 === 0),
      ...index.sets.brands.filter((_slug, position) => position % 13 === 0),
      ...Object.keys(index.lucideAliases).slice(0, 40),
      ...Object.keys(ICON_SLUG_ALIASES),
      ...Object.keys(index.brandAliases),
      'next.js',
      'socket.io',
      'draw.io',
      'premiere-pro',
      'github',
      'figma',
      'c',
      'cpp',
      'Rocket',
      'arrow_right',
      'not-an-icon-at-all',
      'x'.repeat(MAX_ICON_SLUG_LENGTH + 1),
    ];
    for (const slug of samples) {
      for (const isBrandFirst of [false, true]) {
        expect(resolver.resolve(slug, isBrandFirst), `${slug} (${isBrandFirst})`).toBe(
          toPickerSet(slug, isBrandFirst)
        );
      }
    }
    expect(resolver.resolve('none', false)).toBe('none');
    expect(builderScript).not.toContain('64');
  });

  it('serves the icon index and every body page, and rejects out-of-range pages', () => {
    const indexAsset = getSiteAsset('icons.json');
    const index = JSON.parse(indexAsset?.body ?? '{}') as IconPickerIndex;
    expect(index.sets.lucide.length).toBeGreaterThan(1000);
    expect(index.sets.brands.length).toBeGreaterThan(1000);
    expect(index.lucideTags.cog).toContain('settings');
    expect(index.lucideTags['sliders-horizontal']).toContain('settings');
    expect(index.lucideTags.wrench).toContain('settings');
    for (const set of ['lucide', 'brands'] as const) {
      const pageCount = Math.ceil(index.sets[set].length / index.pageSize);
      const lastPage = getSiteAsset(`icons-${set}-${pageCount - 1}.json`);
      expect(lastPage?.version, set).toBe(indexAsset?.version);
      expect(Object.keys(JSON.parse(lastPage?.body ?? '{}')).length, set).toBeGreaterThan(0);
      expect(getSiteAsset(`icons-${set}-${pageCount}.json`), set).toBeUndefined();
    }
    const firstPage = JSON.parse(getSiteAsset('icons-lucide-0.json')?.body ?? '{}') as Record<
      string,
      string
    >;
    expect(Object.keys(firstPage)).toEqual(index.sets.lucide.slice(0, index.pageSize));
    expect(getSiteAsset('icons-lucide-0001.json')).toBeUndefined();
    expect(getSiteAsset('icons-other-0.json')).toBeUndefined();
  });
});

/************************************ Pages & links *************************************/

describe('builder pages & "Open in Builder" links', () => {
  it('embeds the exact schema, the builder script, and the icon picker on every builder page', () => {
    for (const kind of BUILDER_KINDS) {
      const html = renderBuilderHtml(kind);
      const schemaJson =
        /<script type="application\/json" id="builder-schema">(?<json>[^<]*)<\/script>/.exec(html)
          ?.groups?.json;
      expect(JSON.parse(schemaJson ?? '{}'), kind).toEqual(getBuilderSchema(kind));
      expect(html, kind).toMatch(
        /<script src="\/assets\/builder\.js\?v=[\da-z]+" defer><\/script>/
      );
      expect(html, kind).toContain('id="icon-picker" popover role="dialog"');
      for (const field of getBuilderSchema(kind).fields) {
        expect(html, `${kind}.${field.id}`).toContain(`data-field="${field.id}"`);
      }
    }
  });

  it('keeps the required mark outside the relabeled text and announces color fields once (regressions: wiped asterisk, double label)', () => {
    const serviceHtml = renderBuilderHtml('service');
    expect(serviceHtml).toContain(
      '<span class="builder-label-text">Target</span><span class="builder-required" aria-hidden="true">*</span>'
    );
    expect(serviceHtml).toContain(
      '<span class="builder-label-text">Owner</span><span class="builder-required" aria-hidden="true" hidden>*</span>'
    );
    expect(serviceHtml).toContain(
      '<option value="npm" data-badge="Auto" selected>npm (npm)</option>'
    );
    expect(serviceHtml).toContain(
      'Services and metrics marked Auto offer automatic data widgets from live upstream data.'
    );
    expect(serviceHtml).toContain('<option value="docker">Docker Hub (docker)</option>');
    expect(serviceHtml).toContain('<option value="dl" data-badge="Auto">');
    expect(serviceHtml).toContain('<option value="v" selected>v · npm</option>');
    expect(serviceHtml).toContain('data-preset-icon="npm"');
    expect(serviceHtml).toContain('id="field-icon-left-value" data-placeholder="none">npm</span>');
    expect(serviceHtml).not.toContain('data-icon-clear="field-icon-left" hidden');
    expect(serviceHtml).toContain('data-color-auto="true" hidden');
    expect(serviceHtml).toContain('id="special-help-trigger"');
    expect(serviceHtml).toContain('id="special-syntax-help" popover role="dialog"');
    const builderClientSource = readClientModuleSources('builder');
    expect(builderClientSource).toContain("querySelector('.builder-label-text')");
    expect(builderClientSource).toContain('resolveSpecialHint(');
    expect(builderClientSource).not.toContain('labelElement.textContent');
    const stackHtml = renderBuilderHtml('stack');
    expect(stackHtml).toContain('title="Brand colors"');
    expect(stackHtml).toContain('<span class="visually-hidden">Brand colors</span>');
    const badgeHtml = renderBuilderHtml('badge');
    expect(badgeHtml).toContain('id="special-help-trigger"');
    expect(badgeHtml).toContain('id="special-syntax-help" popover role="dialog"');
    expect(badgeHtml).toMatch(/data-field="color" data-control="color">/);
    expect(badgeHtml).toContain('role="radiogroup" aria-labelledby="field-color-label"');
    expect(badgeHtml).toMatch(/data-field="anim" data-control="anim" role="group"/);
    const iconHtml = renderBuilderHtml('icon');
    expect(iconHtml).not.toContain('id="field-icon-main-label"');
    expect(iconHtml).toContain('aria-labelledby="field-icon-label field-icon-main-value"');
  });

  it('disables Open SVG and copying until the URL is complete, renders a custom checkbox, and places the Reference link next to the page title (regressions)', () => {
    const html = renderBuilderHtml('badge');
    expect(html).toContain(
      'id="builder-open" target="_blank" rel="noopener noreferrer" aria-disabled="true" tabindex="-1"'
    );
    expect(html).toContain(
      '<input class="check-input" type="checkbox" id="field-anim-sheen" data-part="sheen" /><span class="check-box" aria-hidden="true">'
    );
    expect(html).toMatch(
      /<div class="section-title-row"><h1 class="section-title">Badge Builder<\/h1><a class="section-action" href="\/docs\/badges" tabindex="0">/
    );
    expect(html).not.toContain('id="icon-picker-none"');
    expect(html).not.toContain('icon-picker-row');
    expect(html).not.toContain('code-drawer-toolbar');
    expect(html).not.toContain('id="builder-code-label"');
    const actionsHtml = html.slice(
      html.indexOf('<div class="builder-actions">'),
      html.indexOf('</aside>')
    );
    expect(actionsHtml).not.toContain('Reference');
    expect(html).not.toContain('href="#"');
    expect(html).toContain('id="builder-copy" data-copy-target="builder-code"');
    expect(html).toContain(
      '<span id="builder-share-label" data-copy-label aria-live="polite">Copy builder link</span>'
    );
    const builderClientSource = readClientModuleSources('builder');
    expect(builderClientSource).toContain("openLink.removeAttribute('href')");
    expect(builderClientSource).toContain('openLink.tabIndex = 0');
    expect(builderClientSource).toContain('openLink.tabIndex = -1');
    expect(builderClientSource).toContain('copyButton.disabled = !isComplete');
    expect(builderClientSource).toContain('site?.copyText(');
    expect(builderClientSource).not.toContain('navigator.clipboard');
  });

  it('updates the preview alt text, disconnects picker observers, closes menus on focus loss, and measures fallback popovers (regressions)', () => {
    const builderClientSource = readClientModuleSources('builder');
    expect(builderClientSource).toContain('previewImage.alt = alt');
    const disconnectIndex = builderClientSource.indexOf('tileObserver?.disconnect()');
    expect(disconnectIndex).toBeGreaterThan(-1);
    expect(disconnectIndex).toBeLessThan(
      builderClientSource.indexOf('pickerGrid.replaceChildren()')
    );
    expect(builderClientSource).toContain("addEventListener('focusout'");
    expect(builderClientSource).toContain('site?.placePopover(picker, pickerTrigger');
    expect(builderClientSource).not.toMatch(/innerHeight - 420|innerWidth - 380/);
  });

  it('renders the icon picker glyph templates and separate Lucide and Brands tabs without an All tab', () => {
    const html = renderBuilderHtml('stack');
    const builderClientSource = readClientModuleSources('builder');
    expect(html).toContain(
      '<svg data-set="lucide" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg>'
    );
    expect(html).toContain(
      '<svg data-set="brands" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"></svg>'
    );
    expect(html).toContain(
      '<span data-picker-tab-label="lucide" data-label="Lucide">Lucide</span>'
    );
    expect(html).toContain(
      '<span data-picker-tab-label="brands" data-label="Brands">Brands</span>'
    );
    expect(html).not.toContain('name="icon-picker-set" value="all"');
    expect(builderClientSource).toContain('updatePickerTabLabels(');
    expect(builderClientSource).toContain('syncPickerTabForTarget(');
    expect(builderClientSource).not.toContain("'stroke-linecap'");
  });

  it('renders verified developer categories, group-by-category toggle, and DSL syntax popover on /builder/stack', () => {
    const html = renderBuilderHtml('stack');
    const builderClientSource = readClientModuleSources('builder');
    expect(html).toContain('id="stack-tab-categories"');
    expect(html).toContain('id="stack-tab-raw"');
    expect(html).toContain('id="stack-group-by-category" checked');
    expect(html).toContain('id="stack-syntax-help" popover role="dialog"');
    expect(html).toContain('<code class="param-code">rust@amber</code>');
    expect(html).toContain('Use <strong>Raw DSL</strong> for any icon slug or per-tile colors.');
    expect(html).not.toContain('All icons…');
    expect(html.indexOf('data-validation-for="field-groups"')).toBeLessThan(
      html.indexOf('data-stack-raw-actions')
    );
    expect(builderClientSource).toContain("'is-invalid'");
    expect(builderClientSource).toContain("classList.toggle('is-missing', isMissing)");

    const resolver = core.createIconResolver(getIconPickerIndex(), MAX_ICON_SLUG_LENGTH);
    const seenSlugs = new Set<string>();
    for (const category of STACK_CATEGORIES) {
      expect(html, category.id).toContain(`data-stack-category="${category.id}"`);
      for (const item of category.items) {
        expect(seenSlugs.has(item.slug), item.slug).toBe(false);
        seenSlugs.add(item.slug);
        const resolvedSlug = resolveIcon(item.slug, true);
        const resolvedCanonical = resolveIcon(item.canonical, true);
        expect(resolvedSlug, item.slug).toBeDefined();
        expect(resolvedSlug?.innerSvg, item.slug).toBe(resolvedCanonical?.innerSvg);
        expect(resolver.resolve(item.slug, true), item.slug).toBe('brands');
        expect(html, item.slug).toContain(`data-stack-chip="${item.slug}"`);
      }
    }
    expect(seenSlugs.size).toBeGreaterThan(350);
  });

  it('renders the interactive line-by-line list editor on /builder/typing', () => {
    const html = renderBuilderHtml('typing');
    expect(html).toContain('data-field="lines" data-control="typingLines"');
    expect(html).toContain('id="typing-lines-editor" data-max-lines="12" data-max-length="80"');
    expect(html).toContain(
      '<input type="hidden" id="field-lines" value="Full-Stack Developer;Design-Driven Engineering;Edge Systems Architect" />'
    );
    expect(html).toContain('id="typing-lines-list"');
    expect(html).toContain('value="Full-Stack Developer" maxlength="80"');
    expect(html).toContain('value="Design-Driven Engineering" maxlength="80"');
    expect(html).toContain('value="Edge Systems Architect" maxlength="80"');
    expect(html).toContain('id="typing-line-add"');
    expect(html).toContain('data-typing-line-handle');
    expect(html).toContain('href="#ui-grip-vertical"');
    expect(html).toContain('aria-label="Reorder line 1 (drag or use Up and Down arrow keys)"');
    expect(html).toContain('data-field="hint" data-control="hint"');
    expect(html).toContain('id="field-hint-icon" data-part="icon"');
    expect(html).toContain('id="field-hint-text" type="text" data-part="text"');
    expect(core.composeHint('corner-down-left', '')).toBe('icon:corner-down-left');
    expect(core.composeHint('command', 'K')).toBe('icon:command K');
    expect(core.composeHint('', 'utf8')).toBe('utf8');
    expect(core.composeHint('none', '')).toBe('');
    expect(core.splitHint('icon:command K')).toEqual({ icon: 'command', text: 'K' });
    expect(core.splitHint('icon:corner-down-left')).toEqual({ icon: 'corner-down-left', text: '' });
    expect(core.splitHint('utf8')).toEqual({ icon: '', text: 'utf8' });
    const builderClientSource = readClientModuleSources('builder');
    expect(builderClientSource).toContain('createTypingLinesController(');
    expect(builderClientSource).toContain('typingLinesController.syncFromValue(value)');
    expect(builderClientSource).toContain('typingLinesController.readValue()');
    expect(builderClientSource).toContain('setPointerCapture');
  });

  it('reorders a typing line across multiple positions in one continuous pointer drag without losing capture (regression: detaching the captured handle ended the drag after one swap)', () => {
    const initialLines = [
      'Full-Stack Developer',
      'Design-Driven Engineering',
      'Edge Systems Architect',
      'Some Line 4',
      'Some Line 5',
      'Some Line 6',
      'Some Line 7',
      'Some Line 8',
    ].join(';');
    const harness = mountTypingLinesDomHarness(initialLines);
    try {
      const eighthHandle = harness.listElement.querySelectorAll('[data-typing-line-handle]').at(7);
      expect(eighthHandle).toBeDefined();
      if (!eighthHandle) {
        return;
      }

      // [1] Fallback `before` / `append` path (`moveBefore` absent); detaching row 8 on swap 1 must NOT drop pointer capture on `listElement`:
      eighthHandle.dispatchEvent({
        bubbles: true,
        button: 0,
        clientY: 412,
        pointerId: 1,
        pointerType: 'mouse',
        preventDefault: noopDomAction,
        target: eighthHandle,
        type: 'pointerdown',
      });
      expect(harness.listElement.hasPointerCapture(1)).toBe(true);
      expect(harness.listElement.classList.contains('is-reordering')).toBe(true);

      for (const pointerY of [365, 320, 275, 230, 190, 155]) {
        harness.listElement.dispatchEvent({
          bubbles: true,
          clientY: pointerY,
          pointerId: 1,
          pointerType: 'mouse',
          preventDefault: noopDomAction,
          target: harness.listElement,
          type: 'pointermove',
        });
        expect(harness.listElement.hasPointerCapture(1), `clientY=${pointerY}`).toBe(true);
      }

      harness.listElement.dispatchEvent({
        bubbles: true,
        clientY: 155,
        pointerId: 1,
        pointerType: 'mouse',
        preventDefault: noopDomAction,
        target: harness.listElement,
        type: 'pointerup',
      });

      expect(harness.getFallbackMoveCount()).toBe(6);
      expect(harness.listElement.hasPointerCapture(1)).toBe(false);
      expect(harness.listElement.classList.contains('is-reordering')).toBe(false);
      expect(harness.documentStub.activeElement).toBe(eighthHandle);
      expect(harness.readBadges()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
      expect(harness.readInputs()).toEqual([
        'Full-Stack Developer',
        'Some Line 8',
        'Design-Driven Engineering',
        'Edge Systems Architect',
        'Some Line 4',
        'Some Line 5',
        'Some Line 6',
        'Some Line 7',
      ]);
      expect(harness.hiddenInput.value).toBe(
        'Full-Stack Developer;Some Line 8;Design-Driven Engineering;Edge Systems Architect;Some Line 4;Some Line 5;Some Line 6;Some Line 7'
      );

      // [2] Atomic `moveBefore` path when supported by the browser; relocates across 4 slots without fallback detaches:
      harness.resetFallbackMoveCount();
      const getMoveBeforeCallCount = harness.enableAtomicMoveBefore();

      eighthHandle.dispatchEvent({
        bubbles: true,
        button: 0,
        clientY: 160,
        pointerId: 2,
        pointerType: 'mouse',
        preventDefault: noopDomAction,
        target: eighthHandle,
        type: 'pointerdown',
      });
      harness.listElement.dispatchEvent({
        bubbles: true,
        clientY: 332,
        pointerId: 2,
        pointerType: 'mouse',
        preventDefault: noopDomAction,
        target: harness.listElement,
        type: 'pointermove',
      });
      harness.listElement.dispatchEvent({
        bubbles: true,
        clientY: 332,
        pointerId: 2,
        pointerType: 'mouse',
        preventDefault: noopDomAction,
        target: harness.listElement,
        type: 'pointerup',
      });

      expect(getMoveBeforeCallCount()).toBe(4);
      expect(harness.getFallbackMoveCount()).toBe(0);
      expect(harness.readInputs().at(5)).toBe('Some Line 8');
    } finally {
      harness.teardown();
    }
  });

  it('links every docs preview to a builder whose prefill renders the identical SVG', () => {
    let linkCount = 0;
    for (const path of collectAllPreviewPaths()) {
      const target = resolveBuilderTarget(path);
      expect(target, path).toBeDefined();
      const schema = getBuilderSchema(target?.kind ?? 'badge');
      const parsed = core.parsePath(schema, path);
      expect(parsed, path).toBeDefined();
      const rebuilt = core.buildPath(schema, parsed ?? {}).path;
      expect(renderSvgPath(rebuilt), `${path} -> ${rebuilt}`).toBe(renderSvgPath(path));
      linkCount += 1;
    }
    expect(linkCount).toBeGreaterThan(100);
  });

  it('resolves builder targets per route family and skips invalid or mismatched-arity paths', () => {
    expect(resolveBuilderTarget('/badge/build/passing')?.kind).toBe('badge');
    expect(resolveBuilderTarget('/badge/status/online/up')).toBeUndefined();
    expect(resolveBuilderTarget('/badge/pypi/xulbux/v')?.kind).toBe('service');
    expect(resolveBuilderTarget('/badge/pypi/owner/pkg/v')).toBeUndefined();
    expect(resolveBuilderTarget('/badge/gh/xulbux/svg-api/stars')?.kind).toBe('service');
    expect(resolveBuilderTarget('/badge/gh/svg-api/stars')).toBeUndefined();
    expect(resolveBuilderTarget('/badge/go/github.com/spf13/cobra/v')?.kind).toBe('service');
    expect(resolveBuilderTarget('/badge/go/a/b/c/d/e/f/g/h/i/v')).toBeUndefined();
    expect(resolveBuilderTarget('/badge/terraform/terraform-aws-modules/vpc/aws/v')?.kind).toBe(
      'service'
    );
    expect(resolveBuilderTarget('/badge/terraform/terraform-aws-modules/vpc/v')).toBeUndefined();
    expect(resolveBuilderTarget('/badge/gitlab/gitlab-org/gitlab-runner/stars')?.kind).toBe(
      'service'
    );
    expect(resolveBuilderTarget('/badge/gitlab/gitlab-runner/stars')).toBeUndefined();
    expect(resolveBuilderTarget('/btn/Go')?.kind).toBe('button');
    expect(resolveBuilderTarget('/icon/a/b')).toBeUndefined();
    expect(resolveBuilderTarget('/badge/a/b/c/d')).toBeUndefined();
    expect(resolveBuilderTarget('/favicon.png')).toBeUndefined();
    expect(resolveBuilderTarget('/quote/Hi?layout=vertical')?.href).toBe(
      `/builder/quote?path=${encodeURIComponent('/quote/Hi?layout=vertical')}`
    );
  });

  it('exposes pure icon catalog filtering, icon select display resolution, and ambiguous HTML character-reference escaping (regressions: &amp; in alt text broke HTML5 img snippets)', () => {
    const index = getIconPickerIndex();
    const emptyFilter = core.filterIconCatalog(index, index.sets, 'lucide', '   ');
    expect(emptyFilter.counts).toBeUndefined();
    expect(emptyFilter.matches).toHaveLength(index.sets.lucide.length);

    const filteredBrands = core.filterIconCatalog(index, index.sets, 'brands', 'typescript');
    expect(filteredBrands.counts?.brands).toBeGreaterThanOrEqual(1);
    expect(filteredBrands.matches.some((match) => match.slug === 'typescript')).toBe(true);

    const webLucide = core.filterIconCatalog(index, index.sets, 'lucide', 'web');
    expect(webLucide.matches.some((match) => match.slug === 'globe')).toBe(true);
    const docsLucide = core.filterIconCatalog(index, index.sets, 'lucide', 'docs');
    expect(docsLucide.matches.some((match) => match.slug === 'book-open')).toBe(true);
    const dottedNextBrands = core.filterIconCatalog(index, index.sets, 'brands', 'next.js');
    expect(dottedNextBrands.matches.some((match) => match.slug === 'nextdotjs')).toBe(true);
    const hyphenatedGhaBrands = core.filterIconCatalog(
      index,
      index.sets,
      'brands',
      'github-actions'
    );
    expect(hyphenatedGhaBrands.matches.some((match) => match.slug === 'githubactions')).toBe(true);

    expect(core.resolveIconSelectDisplay('', 'Select icon')).toEqual({
      displayLabel: 'Select icon',
      glyphSlug: '',
      isPlaceholder: true,
    });
    expect(core.resolveIconSelectDisplay('', 'Select icon', 'npm', false)).toEqual({
      displayLabel: 'npm',
      glyphSlug: 'npm',
      isPlaceholder: false,
    });
    expect(core.resolveIconSelectDisplay('', 'Select icon', 'circle-check', true)).toEqual({
      displayLabel: 'Auto',
      glyphSlug: 'circle-check',
      isPlaceholder: false,
    });
    expect(core.resolveIconSelectDisplay('none', 'Select icon', 'npm')).toEqual({
      displayLabel: 'Select icon',
      glyphSlug: '',
      isPlaceholder: true,
    });
    expect(core.resolveIconSelectDisplay(' TS ', 'Select icon')).toEqual({
      displayLabel: 'TS',
      glyphSlug: 'TS',
      isPlaceholder: false,
    });

    const snippets = core.buildSnippets(
      'https://svg.xul.is/badge/a/b?color=sky&copy=1',
      'A &amp; B',
      ''
    );
    expect(snippets.html).toContain('src="https://svg.xul.is/badge/a/b?color=sky&copy=1"');
    expect(snippets.html).toContain('alt="A &amp;amp; B"');
  });

  it('guards Object.prototype keys in client icon lookup/search, matches clean brand slugs, and enforces service owner and minTargetSegments in builder URLs (regressions: Object.prototype key crash, client clean brand slug parity, missing owner and minTargetSegments in service builder)', () => {
    const index = getIconPickerIndex();
    const resolver = core.createIconResolver(index, MAX_ICON_SLUG_LENGTH);
    for (const protoKey of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(resolver.resolve(protoKey, false), protoKey).toBeUndefined();
      expect(resolver.resolve(protoKey, true), protoKey).toBeUndefined();
      expect(resolver.locate(protoKey, false), protoKey).toBeUndefined();
    }
    const syntheticIndex = { ...index, sets: { brands: ['3d-model'], lucide: ['constructor'] } };
    expect(() =>
      core.filterIconCatalog(syntheticIndex, syntheticIndex.sets, 'lucide', ' fallback ')
    ).not.toThrow();
    const syntheticResolver = core.createIconResolver(syntheticIndex, MAX_ICON_SLUG_LENGTH);
    expect(syntheticResolver.locate('3dmodel', true)).toEqual({
      page: 0,
      set: 'brands',
      slug: '3d-model',
    });

    const serviceSchema = getBuilderSchema('service');
    expect(
      core.parsePath(serviceSchema, '/badge/terraform/terraform-aws-modules/vpc/v')
    ).toBeUndefined();
    expect(
      core.parsePath(serviceSchema, '/badge/terraform/terraform-aws-modules/vpc/aws/v')
    ).toMatchObject({
      metric: 'v',
      owner: '',
      service: 'terraform',
      target: 'terraform-aws-modules/vpc/aws',
    });
    expect(core.parsePath(serviceSchema, '/badge/gh/hono/stars')).toBeUndefined();
    expect(core.parsePath(serviceSchema, '/badge/npm/hono/not-a-metric')).toBeUndefined();
    expect(core.parsePath(serviceSchema, '/badge/gh//hono/stars')).toBeUndefined();

    expect(
      core.buildDefaultLinkTarget(
        serviceSchema,
        { metric: 'stars', owner: '', service: 'gh', target: 'hono' },
        'https://svg.xul.is/badge/gh/hono/stars'
      )
    ).toBe('https://svg.xul.is/badge/gh/hono/stars');
    expect(
      core.buildDefaultLinkTarget(
        serviceSchema,
        { metric: 'v', owner: '', service: 'terraform', target: 'terraform-aws-modules/vpc' },
        'https://svg.xul.is/badge/terraform/terraform-aws-modules/vpc/v'
      )
    ).toBe('https://svg.xul.is/badge/terraform/terraform-aws-modules/vpc/v');
    expect(
      core.buildDefaultLinkTarget(
        serviceSchema,
        { metric: 'v', owner: '', service: 'terraform', target: 'terraform-aws-modules/vpc/aws' },
        'https://svg.xul.is/badge/terraform/terraform-aws-modules/vpc/aws/v'
      )
    ).toBe('https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws');
  });

  it('preserves sheen,none on /typing, strips frameless sheen, guards empty text/lines with author/prefix, and validates service builder targets (regressions: sheen,none dropped none, frameless sheen emitted, author/prefix swapped into empty body segment, invalid service metric linked to builder)', () => {
    const typingSchema = getBuilderSchema('typing');
    const quoteSchema = getBuilderSchema('quote');
    const typingAnimOptions = findField(typingSchema, 'anim').options ?? [];

    expect(core.splitAnim('sheen,none', typingAnimOptions)).toEqual({
      hasSheen: true,
      left: 'none',
      right: '',
    });
    const [originalSheenNone, rebuiltSheenNone] = renderPrefillRoundTrip(
      'typing',
      '/typing/Hello;World?anim=sheen,none'
    );
    expect(rebuiltSheenNone).toBe(originalSheenNone);

    expect(
      core.buildPath(typingSchema, { anim: 'sheen', layout: 'none', lines: 'Hello' }).path
    ).toBe('/typing/Hello?layout=none');
    expect(
      core.buildPath(typingSchema, { anim: 'sheen,none', layout: 'none', lines: 'Hello' }).path
    ).toBe('/typing/Hello?layout=none&anim=none');

    const emptyQuoteResult = core.buildPath(quoteSchema, { author: 'Ada', text: '' });
    expect(emptyQuoteResult.missing).toContain('Quote');
    expect(emptyQuoteResult.path).toBe('/quote?author=Ada');

    const emptyTypingResult = core.buildPath(typingSchema, { lines: '', prefix: '$' });
    expect(emptyTypingResult.missing).toContain('Typed lines');
    expect(emptyTypingResult.path).toBe('/typing?prefix=%24');

    expect(core.parsePath(typingSchema, '/typing/Hello?align=bogus&center=true')?.align).toBe(
      'center'
    );
    expect(core.parsePath(typingSchema, '/typing/Hello?align=left&center=true')?.align).toBe(
      'left'
    );

    expect(resolveBuilderTarget('/badge/NPM/hono/v')?.kind).toBe('service');
    expect(resolveBuilderTarget('/badge/npm/hono/not-a-metric')).toBeUndefined();
  });

  it('hides the sheen checkbox on frameless /builder/typing and auto-selects Raw DSL on /builder/stack when prefill is not losslessly representable by Categories (regressions: frameless sheen toggle stayed visible, custom stack prefill hid non-catalog DSL)', () => {
    const clientSource = readClientModuleSources('builder');

    // [1] Frameless `/builder/typing` sheen stripping & visibility sync:
    const typingSchema = getBuilderSchema('typing');
    expect(
      core.buildPath(typingSchema, { anim: 'sheen', layout: 'none', lines: 'Hello' }).path
    ).toBe('/typing/Hello?layout=none');
    expect(
      core.buildPath(typingSchema, { anim: 'sheen,none', layout: 'none', lines: 'Hello' }).path
    ).toBe('/typing/Hello?layout=none&anim=none');
    expect(
      core.buildPath(typingSchema, { anim: 'sheen', layout: 'window', lines: 'Hello' }).path
    ).toBe('/typing/Hello?anim=sheen');
    expect(clientSource).toContain('syncFramelessTypingSheen');
    expect(clientSource).toContain(
      "sheenInput?.closest('.builder-check')?.toggleAttribute('hidden', isFrameless)"
    );

    // [2] `/builder/stack` mode tab selection during prefill and reset:
    const categoryGroups = [
      ['js', 'ts'],
      ['react', 'vue'],
    ] as const;

    expect(core.resolveStackPrefillMode('', categoryGroups, false)).toEqual({
      isGroupedByCategory: true,
      mode: 'categories',
    });
    expect(core.resolveStackPrefillMode('js,ts|react,vue', categoryGroups, false)).toEqual({
      isGroupedByCategory: true,
      mode: 'categories',
    });
    expect(core.resolveStackPrefillMode('js,ts,react,vue', categoryGroups, false)).toEqual({
      isGroupedByCategory: false,
      mode: 'categories',
    });
    expect(
      core.resolveStackPrefillMode(
        'js,ts,py:2;react,vue',
        [
          ['js', 'ts', 'py'],
          ['react', 'vue'],
        ],
        false,
        '2'
      )
    ).toEqual({ isGroupedByCategory: true, mode: 'categories' });

    for (const customDsl of [
      'js,ts:2',
      'js,ts,react,vue:3',
      'js,ts;react,vue',
      'js@amber,ts',
      'ts,js',
    ]) {
      expect(core.resolveStackPrefillMode(customDsl, categoryGroups, false), customDsl).toEqual({
        isGroupedByCategory: undefined,
        mode: 'raw',
      });
    }
    expect(core.resolveStackPrefillMode('rocket,ts', [['ts'], []], true)).toEqual({
      isGroupedByCategory: undefined,
      mode: 'raw',
    });
    expect(clientSource).toContain('syncModeForPrefill');
  });

  it('cycles custom dropdown typeahead across matching options, returns focus to search on ArrowUp/Backspace, and marks only row 0 aria-invalid on empty typingLines (regressions: non-cycling select typeahead, trapped listbox focus, all optional typing rows marked aria-invalid)', () => {
    interface SandboxItem {
      append: (...nodes: SandboxItem[]) => void;
      children: SandboxItem[];
      className: string;
      dataset: Record<string, string>;
      focus: () => void;
      id: string;
      scrollIntoView: () => void;
      setAttribute: () => void;
      style: { setProperty: () => void };
      tabIndex: number;
      textContent: string;
    }

    const activeTracker = {
      activeElement: undefined as unknown,
      createDocumentFragment() {
        const items: SandboxItem[] = [];
        return {
          append(...nodes: SandboxItem[]) {
            items.push(...nodes);
          },
          get childElementCount() {
            return items.length;
          },
          items,
        };
      },
      createElement() {
        const created = Object.assign(Object.create(FakeHTMLElement.prototype) as object, {
          append(...nodes: SandboxItem[]) {
            for (const child of nodes) {
              created.children.push(child);
              created.textContent += child.textContent;
            }
          },
          children: [] as SandboxItem[],
          className: '',
          dataset: {} as Record<string, string>,
          focus() {
            activeTracker.activeElement = created;
          },
          id: '',
          scrollIntoView: noopDomAction,
          setAttribute: noopDomAction,
          style: { setProperty: noopDomAction },
          tabIndex: 0,
          textContent: '',
        });
        return created;
      },
    };

    const menuListeners = new Map<string, ((event: unknown) => void)[]>();
    const searchInput = Object.assign(Object.create(FakeHTMLInputElement.prototype) as object, {
      addEventListener: noopDomAction,
      focus() {
        activeTracker.activeElement = searchInput;
      },
      value: '',
    });

    let renderedOptions: SandboxItem[] = [];
    const listBox = Object.assign(Object.create(FakeHTMLElement.prototype) as object, {
      hidden: false,
      querySelectorAll: () => renderedOptions,
      replaceChildren(fragment: { items: SandboxItem[] }) {
        renderedOptions = fragment.items;
      },
    });

    const menuElement = Object.assign(Object.create(FakeHTMLElement.prototype) as object, {
      addEventListener(type: string, listener: (event: unknown) => void) {
        const list = menuListeners.get(type) ?? [];
        list.push(listener);
        menuListeners.set(type, list);
      },
    });

    const selectOptions = [
      { dataset: {}, index: 0, text: 'Indigo', value: 'indigo' },
      { dataset: {}, index: 1, text: 'Sky', value: 'sky' },
      { dataset: {}, index: 2, text: 'Slate', value: 'slate' },
    ];
    const selectElement = Object.assign(Object.create(FakeHTMLSelectElement.prototype) as object, {
      dispatchEvent: () => true,
      id: 'field-color',
      options: selectOptions,
      selectedOptions: [selectOptions[0]],
      value: 'indigo',
    });

    const triggerElement = Object.assign(Object.create(FakeHTMLButtonElement.prototype) as object, {
      addEventListener: noopDomAction,
      querySelector: () => undefined,
    });

    const selectWrapper = Object.assign(Object.create(FakeHTMLElement.prototype) as object, {
      querySelector(selector: string) {
        if (selector === '.select-options') {
          return listBox;
        }
        if (selector === '.select-menu') {
          return menuElement;
        }
        if (selector === '.select-search-input') {
          return searchInput;
        }
        if (selector === 'select') {
          return selectElement;
        }
        if (selector === '.select-trigger') {
          return triggerElement;
        }
        if (selector === '.select-option') {
          return renderedOptions[0];
        }
        return undefined;
      },
      querySelectorAll(selector: string) {
        return selector === '.select-option' ? renderedOptions : [];
      },
    });

    const row0 = createLineInputStub();
    const row1 = createLineInputStub();
    const row2 = createLineInputStub();
    let linesFieldElement:
      | {
          classList: { toggle: () => void };
          closest: (selector: string) => unknown;
          getAttribute: (name: string) => string | undefined;
          querySelector: (selector: string) => unknown;
          querySelectorAll: (selector: string) => unknown[];
        }
      | undefined = undefined;
    const hiddenLinesInput = Object.assign(
      Object.create(FakeHTMLInputElement.prototype) as object,
      {
        closest: () => linesFieldElement,
        getAttribute: (name: string) => (name === 'data-field' ? 'lines' : undefined),
        id: 'field-lines',
        value: '',
      }
    );
    linesFieldElement = Object.assign(Object.create(FakeElement.prototype) as object, {
      classList: { toggle: noopDomAction },
      closest: (selector: string) => (selector === '[data-field]' ? linesFieldElement : undefined),
      getAttribute: (name: string) => (name === 'data-field' ? 'lines' : undefined),
      querySelector: (selector: string) =>
        selector === 'input, textarea, select' ? hiddenLinesInput : undefined,
      querySelectorAll: (selector: string) =>
        selector === '.builder-input:not(.select-trigger)' ? [row0, row1, row2] : [],
    });

    const formListeners = new Map<string, ((event: unknown) => void)[]>();
    const formStub = Object.assign(Object.create(FakeHTMLFormElement.prototype) as object, {
      addEventListener(type: string, listener: (event: unknown) => void) {
        const list = formListeners.get(type) ?? [];
        list.push(listener);
        formListeners.set(type, list);
      },
      querySelector(selector: string) {
        return selector === '[data-field="lines"]' ? linesFieldElement : undefined;
      },
      querySelectorAll(selector: string) {
        return selector === '[data-select]' ? [selectWrapper] : [];
      },
    });

    const schemaJson = JSON.stringify({
      ...getBuilderSchema('typing'),
      initialState: { lines: '' },
    });

    const fakeDocument = {
      get activeElement() {
        return activeTracker.activeElement;
      },
      createDocumentFragment: activeTracker.createDocumentFragment,
      createElement: activeTracker.createElement,
      getElementById(id: string) {
        if (id === 'builder-schema') {
          return { textContent: schemaJson };
        }
        if (id === 'builder-form') {
          return formStub;
        }
        if (id === 'field-lines') {
          return hiddenLinesInput;
        }
        return undefined;
      },
      querySelector: () => undefined,
      querySelectorAll: () => [],
    };

    const fakeGlobal = {
      clearTimeout: noopDomAction,
      fetch: () => Promise.resolve(new Response('{}')),
      location: { href: 'https://svg.xul.is/builder/typing' },
      matchMedia: () => ({ addEventListener: noopDomAction, matches: false }),
      setTimeout: () => 0,
      svgSite: {
        closePopover: noopDomAction,
        copyText: noopDomAction,
        isPopoverOpen: () => false,
        openPopover: noopDomAction,
        placePopover: noopDomAction,
      },
    };

    evaluateClientDom(builderScript, {
      Element: FakeElement,
      HTMLButtonElement: FakeHTMLButtonElement,
      HTMLElement: FakeHTMLElement,
      HTMLFormElement: FakeHTMLFormElement,
      HTMLInputElement: FakeHTMLInputElement,
      HTMLSelectElement: FakeHTMLSelectElement,
      HTMLTextAreaElement: FakeHTMLElement,
      document: fakeDocument,
      globalThis: fakeGlobal,
      history: { replaceState: noopDomAction, state: undefined },
    });

    // [1] Initial state has `lines: ''` (missing); only row 0 of `typingLines` receives `aria-invalid="true"`:
    expect(row0.invalidAttr).toBe('true');
    expect(row1.invalidAttr).toBeUndefined();
    expect(row2.invalidAttr).toBeUndefined();

    // Entering a line clears `aria-invalid` on row 0:
    hiddenLinesInput.value = 'Hello world';
    for (const inputListener of formListeners.get('input') ?? []) {
      inputListener({ target: hiddenLinesInput, type: 'input' });
    }
    expect(row0.invalidAttr).toBeUndefined();
    expect(row1.invalidAttr).toBeUndefined();
    expect(row2.invalidAttr).toBeUndefined();

    // [2] `bindSelects` cycling typeahead & `ArrowUp` / `Backspace` search return:
    for (const toggleListener of menuListeners.get('toggle') ?? []) {
      toggleListener({ newState: 'open' });
    }
    expect(renderedOptions).toHaveLength(3);
    expect(activeTracker.activeElement).toBe(searchInput);

    function dispatchMenuKey(key: string, target: unknown): void {
      for (const keyListener of menuListeners.get('keydown') ?? []) {
        keyListener({
          ctrlKey: false,
          isComposing: false,
          key,
          metaKey: false,
          preventDefault: noopDomAction,
          target,
        });
      }
    }

    const opt0 = requireDefined(renderedOptions[0], 'option 0');
    const opt1 = requireDefined(renderedOptions[1], 'option 1');
    const opt2 = requireDefined(renderedOptions[2], 'option 2');

    dispatchMenuKey('ArrowDown', searchInput);
    expect(activeTracker.activeElement).toBe(opt0);
    dispatchMenuKey('s', opt0);
    expect(activeTracker.activeElement).toBe(opt1);
    dispatchMenuKey('s', opt1);
    expect(activeTracker.activeElement).toBe(opt2);
    dispatchMenuKey('s', opt2);
    expect(activeTracker.activeElement).toBe(opt1);

    dispatchMenuKey('Backspace', opt1);
    expect(activeTracker.activeElement).toBe(searchInput);

    dispatchMenuKey('ArrowDown', searchInput);
    expect(activeTracker.activeElement).toBe(opt0);
    dispatchMenuKey('ArrowUp', opt0);
    expect(activeTracker.activeElement).toBe(searchInput);
  });

  it('shows the empty-stage loading indicator until load when no previous preview is visible, dims existing previews on update, and hides broken images on error (regression: blank builder stage while loading after Clear)', () => {
    const previewStage = createAttributeBox();
    const previewImageBox = createAttributeBox(true);
    const previewListeners = new Map<string, (() => void)[]>();
    const previewImage = Object.assign(Object.create(FakeHTMLElement.prototype) as object, {
      addEventListener(type: string, listener: () => void) {
        const list = previewListeners.get(type) ?? [];
        list.push(listener);
        previewListeners.set(type, list);
      },
      alt: 'Live preview',
      classList: previewImageBox.classList,
      closest: (selector: string) => (selector === '.builder-stage' ? previewStage : undefined),
      dispatch(type: 'error' | 'load') {
        for (const listener of previewListeners.get(type) ?? []) {
          listener();
        }
      },
      getAttribute: previewImageBox.getAttribute,
      removeAttribute: previewImageBox.removeAttribute,
      toggleAttribute: previewImageBox.toggleAttribute,
    }) as {
      addEventListener: (type: string, listener: () => void) => void;
      alt: string;
      classList: {
        contains: (token: string) => boolean;
        toggle: (token: string, force?: boolean) => boolean;
      };
      closest: (selector: string) => unknown;
      dispatch: (type: 'error' | 'load') => void;
      getAttribute: (name: string) => string | undefined;
      removeAttribute: (name: string) => void;
      src: string;
      toggleAttribute: (name: string, force?: boolean) => boolean;
    };
    Object.defineProperty(previewImage, 'src', {
      get: () => previewImageBox.attributes.get('src') ?? '',
      set(val: string) {
        previewImageBox.attributes.set('src', val);
      },
    });

    const previewLoading = createAttributeBox(true);
    const previewPlaceholderBox = createAttributeBox(false);
    const previewPlaceholder = {
      closest: (selector: string) => (selector === '.builder-stage' ? previewStage : undefined),
      textContent: 'Fill in the required fields to see a preview.',
      toggleAttribute: previewPlaceholderBox.toggleAttribute,
    };
    const statusBox = createAttributeBox();
    const statusElement = { classList: statusBox.classList, textContent: '' };

    const altListeners: (() => void)[] = [];
    const altInput = Object.assign(Object.create(FakeHTMLInputElement.prototype) as object, {
      addEventListener(type: string, listener: () => void) {
        if (type === 'input') {
          altListeners.push(listener);
        }
      },
      placeholder: '',
      value: '',
    });

    const resetListeners: (() => void)[] = [];
    const resetButton = Object.assign(Object.create(FakeHTMLButtonElement.prototype) as object, {
      addEventListener(type: string, listener: () => void) {
        if (type === 'click') {
          resetListeners.push(listener);
        }
      },
    });

    let labelFieldElement:
      | {
          classList: { toggle: () => void };
          closest: (selector: string) => unknown;
          getAttribute: (name: string) => string | undefined;
          querySelector: () => undefined;
          querySelectorAll: (selector: string) => unknown[];
        }
      | undefined = undefined;
    const labelInput = Object.assign(Object.create(FakeHTMLInputElement.prototype) as object, {
      closest: (selector: string) => (selector === '[data-field]' ? labelFieldElement : undefined),
      id: 'field-label',
      removeAttribute: noopDomAction,
      setAttribute: noopDomAction,
      value: '',
    });
    labelFieldElement = Object.assign(Object.create(FakeElement.prototype) as object, {
      classList: { toggle: noopDomAction },
      closest: (selector: string) => (selector === '[data-field]' ? labelFieldElement : undefined),
      getAttribute: (name: string) => (name === 'data-field' ? 'label' : undefined),
      querySelector: () => undefined,
      querySelectorAll: (selector: string) =>
        selector === '.builder-input:not(.select-trigger)' ? [labelInput] : [],
    });

    const formListeners = new Map<string, ((event: unknown) => void)[]>();
    const formStub = Object.assign(Object.create(FakeHTMLFormElement.prototype) as object, {
      addEventListener(type: string, listener: (event: unknown) => void) {
        const list = formListeners.get(type) ?? [];
        list.push(listener);
        formListeners.set(type, list);
      },
      querySelector: (selector: string) =>
        selector === '[data-field="label"]' ? labelFieldElement : undefined,
      querySelectorAll: () => [],
    });

    let pendingTimer: (() => void) | undefined = undefined;
    function flushDebounce(): void {
      const callback = pendingTimer;
      pendingTimer = undefined;
      callback?.();
    }

    const schemaJson = JSON.stringify({
      ...getBuilderSchema('button'),
      initialState: { label: 'Launch' },
    });
    evaluateClientDom(builderScript, {
      Element: FakeElement,
      HTMLButtonElement: FakeHTMLButtonElement,
      HTMLElement: FakeHTMLElement,
      HTMLFormElement: FakeHTMLFormElement,
      HTMLInputElement: FakeHTMLInputElement,
      HTMLSelectElement: FakeHTMLSelectElement,
      HTMLTextAreaElement: FakeHTMLElement,
      document: {
        createDocumentFragment: () => ({ append: noopDomAction }),
        createElement: () => ({ className: '', textContent: '' }),
        getElementById(id: string) {
          if (id === 'builder-schema') {
            return { textContent: schemaJson };
          }
          if (id === 'builder-form') {
            return formStub;
          }
          if (id === 'field-label') {
            return labelInput;
          }
          if (id === 'builder-preview') {
            return previewImage;
          }
          if (id === 'builder-loading') {
            return previewLoading;
          }
          if (id === 'builder-placeholder') {
            return previewPlaceholder;
          }
          if (id === 'builder-status') {
            return statusElement;
          }
          if (id === 'builder-alt') {
            return altInput;
          }
          if (id === 'builder-reset') {
            return resetButton;
          }
          return undefined;
        },
        querySelector: () => undefined,
        querySelectorAll: () => [],
      },
      globalThis: {
        clearTimeout() {
          pendingTimer = undefined;
        },
        fetch: () => Promise.resolve(new Response('{}')),
        location: { href: 'https://svg.xul.is/builder/button' },
        matchMedia: () => ({ addEventListener: noopDomAction, matches: false }),
        setTimeout(callback: () => void) {
          pendingTimer = callback;
          return 1;
        },
        svgSite: {
          closePopover: noopDomAction,
          copyText: noopDomAction,
          isPopoverOpen: () => false,
          openPopover: noopDomAction,
          placePopover: noopDomAction,
        },
      },
      history: { replaceState: noopDomAction, state: undefined },
    });

    // [1] Cold load before first SVG finishes loading; stage shows `#builder-loading` and keeps `<img>` hidden:
    expect(previewImageBox.isHidden).toBe(true);
    expect(previewLoading.isHidden).toBe(false);
    expect(previewPlaceholderBox.isHidden).toBe(true);
    expect(previewStage.getAttribute('aria-busy')).toBe('true');

    flushDebounce();
    expect(previewImage.src).toContain('/button/');
    expect(previewImageBox.isHidden).toBe(true);
    expect(previewLoading.isHidden).toBe(false);

    // [2] First `load` reveals `#builder-preview` and hides `#builder-loading`:
    previewImage.dispatch('load');
    expect(previewImageBox.isHidden).toBe(false);
    expect(previewImage.classList.contains('is-loading')).toBe(false);
    expect(previewLoading.isHidden).toBe(true);
    expect(previewPlaceholderBox.isHidden).toBe(true);
    expect(previewStage.getAttribute('aria-busy')).toBeUndefined();

    // [3] Updating an already-visible preview dims `#builder-preview` instead of swapping back to `#builder-loading`:
    labelInput.value = 'Deploy';
    for (const inputListener of formListeners.get('input') ?? []) {
      inputListener({ target: labelInput, type: 'input' });
    }
    expect(previewImageBox.isHidden).toBe(false);
    expect(previewImage.classList.contains('is-loading')).toBe(true);
    expect(previewLoading.isHidden).toBe(true);
    expect(previewStage.getAttribute('aria-busy')).toBe('true');

    flushDebounce();
    expect(previewImage.src).toBe('/button/Deploy');
    previewImage.dispatch('load');
    expect(previewImage.classList.contains('is-loading')).toBe(false);
    expect(previewStage.getAttribute('aria-busy')).toBeUndefined();

    // Editing snippet-only alt text does not re-trigger preview loading:
    altInput.value = 'Custom alt';
    for (const listener of altListeners) {
      listener();
    }
    expect(previewImage.classList.contains('is-loading')).toBe(false);
    expect(previewStage.getAttribute('aria-busy')).toBeUndefined();

    // [4] Clicking `Clear` resets the stage immediately; filling `label` again shows `#builder-loading` right away:
    for (const listener of resetListeners) {
      listener();
    }
    expect(previewImageBox.isHidden).toBe(true);
    expect(previewImage.src).toBe('');
    expect(previewLoading.isHidden).toBe(true);
    expect(previewPlaceholderBox.isHidden).toBe(false);
    expect(previewPlaceholder.textContent).toBe('Fill in the required fields to see a preview.');
    expect(statusElement.textContent).toContain('Required: Label.');

    labelInput.value = 'SlowTarget';
    for (const inputListener of formListeners.get('input') ?? []) {
      inputListener({ target: labelInput, type: 'input' });
    }
    expect(statusElement.textContent).toBe('');
    expect(previewImageBox.isHidden).toBe(true);
    expect(previewLoading.isHidden).toBe(false);
    expect(previewPlaceholderBox.isHidden).toBe(true);
    expect(previewStage.getAttribute('aria-busy')).toBe('true');

    flushDebounce();
    expect(previewImage.src).toBe('/button/SlowTarget');
    expect(previewImageBox.isHidden).toBe(true);
    expect(previewLoading.isHidden).toBe(false);

    // [5] Network `error` keeps broken `<img>` hidden, shows fallback placeholder + warning status, and recovers on edit:
    previewImage.dispatch('error');
    expect(previewImageBox.isHidden).toBe(true);
    expect(previewImage.src).toBe('');
    expect(previewLoading.isHidden).toBe(true);
    expect(previewPlaceholderBox.isHidden).toBe(false);
    expect(previewPlaceholder.textContent).toBe('Preview unavailable.');
    expect(statusElement.textContent).toBe(
      'The preview could not be loaded; Check the route values.'
    );
    expect(statusElement.classList.contains('is-warning')).toBe(true);
    expect(previewStage.getAttribute('aria-busy')).toBeUndefined();

    labelInput.value = 'Recovered';
    for (const inputListener of formListeners.get('input') ?? []) {
      inputListener({ target: labelInput, type: 'input' });
    }
    expect(statusElement.textContent).toBe('');
    expect(previewLoading.isHidden).toBe(false);
    expect(previewPlaceholderBox.isHidden).toBe(true);
  });
});
