/**
 * Browser script types – Global JSDoc types shared by the `*.client.js` scripts (type-checked by `tsconfig.client.json`).
 */

/** Site-wide client configuration rendered into the `#site-config` JSON element. */
interface SiteClientConfig {
  /** Media query under which the sidebar is a popover drawer (e.g., `'(max-width: 960px)'`). */
  drawerMediaQuery: string;
  /** `localStorage` key of the persisted preview stage background. */
  previewBgStorageKey: string;
  /** Allowed preview stage background values (the first one is the default and removes the attribute; never empty). */
  previewBgValues: [string, ...string[]];
  /** `localStorage` key of the persisted color scheme override. */
  schemeStorageKey: string;
  /** Page background per color scheme, written into the `theme-color` meta tags. */
  themeColors: Record<'dark' | 'light', string>;
}

/** Bounding rectangle of a popover anchor (a `DOMRect` subset). */
interface PopoverAnchorRect {
  /** Bottom edge in viewport pixels. */
  bottom: number;
  /** Left edge in viewport pixels. */
  left: number;
  /** Right edge in viewport pixels. */
  right: number;
  /** Top edge in viewport pixels. */
  top: number;
  /** Width in pixels. */
  width: number;
}

/** Width and height of a popover or the viewport. */
interface PopoverSize {
  /** Height in pixels. */
  height: number;
  /** Width in pixels. */
  width: number;
}

/** Options of a fallback popover placement. */
interface PopoverPlacementOptions {
  /** Horizontal alignment with the anchor (`'start'` aligns left edges, `'end'` right edges; defaults to `'start'`). */
  align?: 'end' | 'start';
  /** Distance in pixels between anchor and popover (defaults to `8`). */
  gap?: number;
  /** Whether the popover is at least as wide as its anchor (dropdown menus). */
  isWidthMatched?: boolean;
}

/** Computed fallback popover position. */
interface PopoverPlacement {
  /** Left edge in viewport pixels. */
  left: number;
  /** Minimum width in pixels (`undefined` unless the width matches the anchor). */
  minWidth: number | undefined;
  /** Top edge in viewport pixels. */
  top: number;
}

/** Popover and clipboard helpers exposed by the site script for page scripts (`svgSite`). */
interface SiteClientHelpers {
  /** Close a popover element (native Popover API or the `.is-open` fallback). */
  closePopover: (popover: HTMLElement) => void;
  /** Copy text (Clipboard API with a selection fallback) and announce the result on a button's `[data-copy-label]`. */
  copyText: (text: string, button: Element) => void;
  /** Check whether a popover element is open. */
  isPopoverOpen: (popover: Element) => boolean;
  /** Position an open popover next to its anchor, clamped to the viewport. */
  placePopover: (popover: HTMLElement, anchor: Element, options?: PopoverPlacementOptions) => void;
}

/** Popover and clipboard helpers of the site script (loaded before every page script). */
// oxlint-disable-next-line no-var, vars-on-top, no-implicit-globals -- Ambient `globalThis` properties must be declared with `var`.
declare var svgSite: SiteClientHelpers | undefined;

/** Pure site helpers exposed for the test suite when the site script runs without a DOM. */
// oxlint-disable-next-line no-var, vars-on-top, no-implicit-globals -- Ambient `globalThis` properties must be declared with `var`.
declare var svgSiteCore: unknown;

/** Pure URL builder helpers exposed for the test suite when the builder script runs without a DOM. */
// oxlint-disable-next-line no-var, vars-on-top, no-implicit-globals -- Ambient `globalThis` properties must be declared with `var`.
declare var svgBuilderCore: unknown;
