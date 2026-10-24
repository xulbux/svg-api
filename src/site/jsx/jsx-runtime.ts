/**
 * Server JSX runtime – Zero-overhead synchronous JSX serializer for server-rendered HTML pages.
 *
 * Evaluates JSX trees directly into escaped HTML strings without VDOM allocations,
 * async promises, or client hydration payloads.
 */

import { escapeXml, getOwnValue } from '@/svg/shared';
import type { HtmlFragment, JsxChild } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

export type { HtmlFragment, JsxChild } from '@/types';

/** Base props accepted by every intrinsic HTML and SVG element. */
export interface IntrinsicElementAttributes {
  /** Children passed to the element. */
  children?: JsxChild;
  /** CSS class name(s). */
  class?: string | undefined;
  /** React-style alias for `class`. */
  className?: string | undefined;
  /** Label target ID (`<label for="…">`). */
  for?: string | undefined;
  /** React-style alias for `for`. */
  htmlFor?: string | undefined;
  /** Element ID. */
  id?: string | undefined;
  /** Inline CSS style string. */
  style?: string | undefined;
  /** Keyboard tab order index. */
  tabindex?: number | string | undefined;
  /** React-style alias for `tabindex`. */
  tabIndex?: number | string | undefined;
  /** Tooltip title text. */
  title?: string | undefined;
  /** Arbitrary HTML, SVG, `aria-*`, and `data-*` attributes. */
  [attribute: string]: unknown;
}

/** Synchronous functional component type. */
export type FunctionComponent<TProps = Record<string, unknown>> = (props: TProps) => HtmlFragment;

// oxlint-disable-next-line typescript/no-namespace -- TypeScript's `react-jsx` transform requires the `JSX` namespace on the runtime module.
export namespace JSX {
  /** Serialized HTML fragment returned by JSX expressions. */
  export type Element = HtmlFragment;
  /** Prop key carrying JSX child nodes. */
  export interface ElementChildrenAttribute {
    /** Child nodes passed inside JSX opening/closing tags. */
    children: Record<string, unknown>;
  }
  /** Attribute map accepted by intrinsic HTML and SVG tags. */
  export type IntrinsicElements = Record<string, IntrinsicElementAttributes>;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** HTML void elements serialized with a self-closing ` />` suffix and no closing tag. */
const VOID_ELEMENT_TAGS: readonly string[] = [
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
];

/** HTML boolean attributes serialized as bare attribute names when enabled and omitted when disabled. */
const BOOLEAN_ATTRIBUTES: readonly string[] = [
  'checked',
  'defer',
  'disabled',
  'hidden',
  'inert',
  'novalidate',
  'open',
  'readonly',
  'required',
  'selected',
];

/** React-style prop names mapped to their canonical HTML attribute names. */
const ATTRIBUTE_ALIASES: Readonly<Record<string, string>> = {
  className: 'class',
  htmlFor: 'for',
  tabIndex: 'tabindex',
};

/** Lazily populated lookup set for `VOID_ELEMENT_TAGS`. */
let voidElementTagsCache: ReadonlySet<string> | undefined = undefined;

/** Lazily populated lookup set for `BOOLEAN_ATTRIBUTES`. */
let booleanAttributesCache: ReadonlySet<string> | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Check whether `tag` is an HTML void element. */
function isVoidElementTag(tag: string): boolean {
  voidElementTagsCache ??= new Set(VOID_ELEMENT_TAGS);
  return voidElementTagsCache.has(tag);
}

/** Check whether `name` is an HTML boolean attribute. */
function isBooleanAttribute(name: string): boolean {
  booleanAttributesCache ??= new Set(BOOLEAN_ATTRIBUTES);
  return booleanAttributesCache.has(name);
}

/** Check whether a value is a pre-escaped `HtmlFragment`. */
function isHtmlFragment(value: unknown): value is HtmlFragment {
  return typeof value === 'object' && value !== null && 'rawHtml' in value;
}

/** Return the pre-escaped HTML of this `HtmlFragment`. */
function fragmentToString(this: HtmlFragment): string {
  return this.rawHtml;
}

/** Wrap a pre-escaped HTML string in an `HtmlFragment` object. */
function createHtmlFragment(html: string): HtmlFragment {
  return { rawHtml: html, toString: fragmentToString };
}

/** Serialize any JSX child or nested child array into escaped HTML. */
function serializeChildren(child: JsxChild): string {
  if (
    child === null ||
    child === undefined ||
    typeof child === 'boolean' ||
    (typeof child === 'string' && child.length === 0)
  ) {
    return '';
  }
  if (typeof child === 'string') {
    return escapeXml(child);
  }
  if (typeof child === 'number') {
    return String(child);
  }
  if (isHtmlFragment(child)) {
    return child.rawHtml;
  }
  if (Array.isArray(child)) {
    let combined = '';
    for (const item of child) {
      combined += serializeChildren(item);
    }
    return combined;
  }
  return '';
}

/** Serialize a single non-null, non-`children` attribute pair (`''` when omitted). */
function serializeSingleAttribute(rawName: string, rawValue: unknown): string {
  if (rawName.startsWith('rawAttrs')) {
    const rawAttrs = String(rawValue).trim();
    return rawAttrs ? ` ${rawAttrs}` : '';
  }
  const name = getOwnValue(ATTRIBUTE_ALIASES, rawName) ?? rawName;
  if (name === 'popover') {
    if (rawValue === true || rawValue === '') {
      return ' popover';
    }
    return rawValue === false ? '' : ` popover="${escapeXml(String(rawValue))}"`;
  }
  if (typeof rawValue === 'boolean') {
    if (name.startsWith('aria-') || name === 'draggable' || name === 'spellcheck') {
      return ` ${name}="${String(rawValue)}"`;
    }
    return rawValue && (isBooleanAttribute(name) || name.startsWith('data-')) ? ` ${name}` : '';
  }
  if (rawValue === '' && isBooleanAttribute(name)) {
    return ` ${name}`;
  }
  return ` ${name}="${escapeXml(String(rawValue))}"`;
}

/** Serialize the attributes of an intrinsic HTML or SVG element. */
function serializeAttributes(props: Readonly<Record<string, unknown>>): string {
  let attrsHtml = '';
  for (const [rawName, rawValue] of Object.entries(props)) {
    if (rawName !== 'children' && rawValue !== undefined && rawValue !== null) {
      attrsHtml += serializeSingleAttribute(rawName, rawValue);
    }
  }
  return attrsHtml;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Mark a trusted HTML or SVG string as pre-escaped so JSX inserts it verbatim.
 * @param html   Trusted HTML or SVG markup.
 * @returns Pre-escaped `HtmlFragment`.
 */
export function raw(html: string): HtmlFragment {
  return createHtmlFragment(html);
}

/**
 * Convert a rendered JSX `HtmlFragment` into a plain `string`.
 * @param fragment   Rendered JSX fragment.
 * @returns Complete HTML string.
 */
export function renderHtml(fragment: HtmlFragment): string {
  return fragment.rawHtml;
}

/**
 * Render a JSX fragment (`<>…</>`) by concatenating its serialized children.
 * @param props   Fragment props containing `children`.
 * @returns Pre-escaped `HtmlFragment`.
 */
export function Fragment(props: { readonly children?: JsxChild }): HtmlFragment {
  return createHtmlFragment(serializeChildren(props.children));
}

/**
 * Render a JSX intrinsic element or functional component.
 * @param tag     Intrinsic tag name (`'div'`, `'svg'`, …) or functional component.
 * @param props   Element attributes and `children`.
 * @returns Pre-escaped `HtmlFragment`.
 */
export function jsx(
  tag: string | FunctionComponent<Record<string, unknown>>,
  props: Readonly<Record<string, unknown>>
): HtmlFragment {
  if (typeof tag === 'function') {
    return tag(props);
  }
  const attrsHtml = serializeAttributes(props);
  if (isVoidElementTag(tag)) {
    return createHtmlFragment(`<${tag}${attrsHtml} />`);
  }
  const childrenHtml = serializeChildren(props.children as JsxChild);
  return createHtmlFragment(`<${tag}${attrsHtml}>${childrenHtml}</${tag}>`);
}

/**
 * Render a JSX element with static multiple children (identical to `jsx` for synchronous SSR).
 * @param tag     Intrinsic tag name or functional component.
 * @param props   Element attributes and `children`.
 * @returns Pre-escaped `HtmlFragment`.
 */
export const jsxs = jsx;
