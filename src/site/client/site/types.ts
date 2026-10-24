/**
 * Browser client types – Shared global and helper interfaces for the site and builder client scripts.
 */

import type { BuilderClientCore, PopoverPlacementOptions, SiteClientCore } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

export type {
  BuilderClientCore,
  PopoverAnchorRect,
  PopoverPlacement,
  PopoverPlacementOptions,
  PopoverSize,
  SiteClientConfig,
  SiteClientCore,
} from '@/types';

/** Currently open fallback-positioned popover tracked for scroll and resize repositioning. */
export interface ActivePopoverState {
  /** Trigger or anchor element. */
  anchor: Element;
  /** Placement options used when opening the popover. */
  options: PopoverPlacementOptions;
  /** Open popover element. */
  popover: HTMLElement;
}

/** Popover and clipboard helpers exposed by the site script for page scripts (`svgSite`). */
export interface SiteClientHelpers {
  /** Close a popover element (native Popover API or the `.is-open` fallback). */
  closePopover: (popover: HTMLElement) => void;
  /** Copy text (Clipboard API with a selection fallback) and announce the result on a button's `[data-copy-label]`. */
  copyText: (text: string, button: Element) => void;
  /** Check whether a popover element is open. */
  isPopoverOpen: (popover: Element) => boolean;
  /** Open a popover element (native Popover API or the `.is-open` fallback). */
  openPopover: (popover: HTMLElement) => void;
  /** Position an open popover next to its anchor, clamped to the viewport. */
  placePopover: (popover: HTMLElement, anchor: Element, options?: PopoverPlacementOptions) => void;
}

/** Alias for `SiteClientHelpers` (`globalThis.svgSite`). */
export type SvgSite = SiteClientHelpers;

declare global {
  // oxlint-disable-next-line no-var, vars-on-top -- Ambient `globalThis` properties require `var`.
  var svgSite: SiteClientHelpers | undefined;
  // oxlint-disable-next-line no-var, vars-on-top -- Ambient `globalThis` properties require `var`.
  var svgSiteCore: SiteClientCore | undefined;
  // oxlint-disable-next-line no-var, vars-on-top -- Ambient `globalThis` properties require `var`.
  var svgBuilderCore: BuilderClientCore | undefined;
}
