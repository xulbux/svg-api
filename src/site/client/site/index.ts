/**
 * Site client entry point – Initializes theme/background switches, reduced-motion SMIL pausing, mobile sidebar drawer, code drawer scrolling, popovers, and clipboard copying across site pages.
 */

import {
  bindCodeCopySanitizer,
  createClipboardController,
  resolveCopySource,
} from '@/site/client/site/clipboard';
import { initCodeDrawers, updateScrollButtons } from '@/site/client/site/drawers';
import { computePopoverPlacement } from '@/site/client/site/popover';
import { initSidebarDrawer } from '@/site/client/site/sidebar';
import { initThemeAndMotion } from '@/site/client/site/theme';
import type { PopoverPlacementOptions, SiteClientConfig } from '@/site/client/site/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Currently open fallback-positioned popover tracked for scroll and resize repositioning. */
interface ActivePopoverState {
  /** Trigger or anchor element. */
  anchor: Element;
  /** Placement options used when opening the popover. */
  options: PopoverPlacementOptions;
  /** Open popover element. */
  popover: HTMLElement;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Dispatch a synthetic `toggle` event for non-Popover-API fallback listeners. */
function dispatchFallbackToggle(popover: HTMLElement, newState: 'closed' | 'open'): void {
  popover.dispatchEvent(Object.assign(new Event('toggle'), { newState }));
}

/** Parse and normalize `#site-config` JSON into a complete `SiteClientConfig` with safe defaults. */
function readSiteClientConfig(): SiteClientConfig {
  let parsed: Partial<SiteClientConfig> = {};
  try {
    const raw: unknown = JSON.parse(document.getElementById('site-config')?.textContent ?? '{}');
    if (raw && typeof raw === 'object') {
      parsed = raw as Partial<SiteClientConfig>;
    }
  } catch {
    // Malformed inline JSON falls back to safe defaults.
  }
  return {
    drawerMediaQuery:
      typeof parsed.drawerMediaQuery === 'string' ? parsed.drawerMediaQuery : '(max-width: 960px)',
    previewBgStorageKey:
      typeof parsed.previewBgStorageKey === 'string' ? parsed.previewBgStorageKey : 'preview-bg',
    previewBgValues:
      Array.isArray(parsed.previewBgValues) && parsed.previewBgValues.length > 0
        ? parsed.previewBgValues
        : ['auto', 'inverse'],
    schemeStorageKey:
      typeof parsed.schemeStorageKey === 'string' ? parsed.schemeStorageKey : 'color-scheme',
    themeColors:
      parsed.themeColors && typeof parsed.themeColors === 'object'
        ? parsed.themeColors
        : { dark: '#000000', light: '#ffffff' },
  };
}

// ----------------------------------------- MAIN ----------------------------------------

/** Initialize the site client in the browser, or expose `svgSiteCore` when evaluated in Node/Vitest without a DOM. */
function initSiteClient(): void {
  if (typeof document === 'undefined') {
    globalThis.svgSiteCore = { computePopoverPlacement };
    return;
  }

  const siteConfig = readSiteClientConfig();
  const rootElement = document.documentElement;
  const reducedMotionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  const drawerQuery = globalThis.matchMedia(siteConfig.drawerMediaQuery);
  const sidebarDrawer = document.getElementById('sidebar-drawer');

  /** Whether the browser supports the Popover API (otherwise popovers toggle an `.is-open` class). */
  const hasPopoverApi = 'popover' in HTMLElement.prototype;

  let activePopover: ActivePopoverState | undefined = undefined;
  const activeTriggers = new WeakMap<HTMLElement, Element>();

  /** Track the trigger element that opened `popover`, resetting any superseded trigger's `aria-expanded`. */
  function rememberPopoverTrigger(popover: HTMLElement, trigger: Element): void {
    const previousTrigger = activeTriggers.get(popover);
    if (previousTrigger && previousTrigger !== trigger) {
      previousTrigger.setAttribute('aria-expanded', 'false');
    }
    activeTriggers.set(popover, trigger);
  }

  /** Resolve the active trigger element controlling `popover`. */
  function resolvePopoverTrigger(popover: HTMLElement): Element | undefined {
    return (
      activeTriggers.get(popover) ??
      (popover.id
        ? (document.querySelector(
            `[popovertarget="${popover.id}"]:not([popovertargetaction="hide"])`
          ) ?? undefined)
        : undefined)
    );
  }

  /** Sync `aria-expanded` on the trigger controlling `popover`. */
  function syncPopoverExpanded(popover: HTMLElement, isOpen: boolean): void {
    resolvePopoverTrigger(popover)?.setAttribute('aria-expanded', String(isOpen));
  }

  /** Check whether a popover element is open (native `:popover-open` or the `.is-open` fallback class). */
  function isPopoverOpen(popover: Element): boolean {
    return hasPopoverApi ? popover.matches(':popover-open') : popover.classList.contains('is-open');
  }

  /** Open a popover element and sync its fallback trigger state. */
  function openPopover(popover: HTMLElement): void {
    if (isPopoverOpen(popover)) {
      return;
    }
    if (hasPopoverApi) {
      popover.showPopover();
      return;
    }
    popover.classList.add('is-open');
    syncPopoverExpanded(popover, true);
    dispatchFallbackToggle(popover, 'open');
  }

  /** Close a popover element and sync its fallback trigger state. */
  function closePopover(popover: HTMLElement): void {
    if (!isPopoverOpen(popover)) {
      return;
    }
    if (activePopover?.popover === popover) {
      activePopover = undefined;
    }
    if (hasPopoverApi) {
      popover.hidePopover();
      return;
    }
    popover.classList.remove('is-open');
    syncPopoverExpanded(popover, false);
    dispatchFallbackToggle(popover, 'closed');
  }

  /** Position an open popover next to its anchor, clamped to the viewport. */
  function placePopover(
    popover: HTMLElement,
    anchor: Element,
    options: PopoverPlacementOptions = {}
  ): void {
    activePopover = { anchor, options, popover };
    if (anchor.hasAttribute('popovertarget') || anchor.hasAttribute('aria-expanded')) {
      rememberPopoverTrigger(popover, anchor);
      if (isPopoverOpen(popover)) {
        anchor.setAttribute('aria-expanded', 'true');
      }
    }
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    // Read untransformed layout dimensions first so `@starting-style` `scale` never shrinks measured size:
    const popoverSize = {
      height: popover.offsetHeight || popoverRect.height,
      width: popover.offsetWidth || popoverRect.width,
    };
    const placement = computePopoverPlacement(
      anchorRect,
      popoverSize,
      { height: globalThis.innerHeight, width: rootElement.clientWidth },
      options
    );
    const renderedWidth =
      placement.minWidth === undefined
        ? popoverSize.width
        : Math.max(popoverSize.width, placement.minWidth);
    const originX = Math.round(
      Math.max(0, Math.min(renderedWidth, anchorRect.left + anchorRect.width / 2 - placement.left))
    );
    let originY = '0px';
    if (placement.top + popoverSize.height <= anchorRect.top) {
      originY = '100%';
    } else if (placement.top < anchorRect.bottom) {
      originY = `${Math.round(Math.max(0, Math.min(popoverSize.height, anchorRect.top + anchorRect.height / 2 - placement.top)))}px`;
    }
    popover.style.top = `${placement.top}px`;
    popover.style.left = `${placement.left}px`;
    popover.style.transformOrigin = `${originX}px ${originY}`;
    if (placement.minWidth !== undefined) {
      popover.style.minWidth = `${placement.minWidth}px`;
    } else {
      popover.style.removeProperty('min-width');
    }
  }

  const copyText = createClipboardController();
  globalThis.svgSite = { closePopover, copyText, isPopoverOpen, openPopover, placePopover };

  initThemeAndMotion(siteConfig, rootElement, reducedMotionQuery);

  document.addEventListener(
    'toggle',
    (event) => {
      const popover = event.target;
      if (popover instanceof HTMLElement && popover.hasAttribute('popover')) {
        const isOpen = (event as ToggleEvent).newState === 'open';
        if (!isOpen && activePopover?.popover === popover) {
          activePopover = undefined;
        }
        syncPopoverExpanded(popover, isOpen);
      }
    },
    true
  );

  // Popovers (mobile sidebar drawer, builder menus); native popovers with a class-toggle fallback:
  if (hasPopoverApi) {
    document.addEventListener(
      'click',
      (event) => {
        const trigger =
          event.target instanceof Element
            ? event.target.closest('[popovertarget]:not([popovertargetaction="hide"])')
            : undefined;
        const targetId = trigger?.getAttribute('popovertarget');
        const popover = targetId ? document.getElementById(targetId) : undefined;
        if (trigger && popover instanceof HTMLElement) {
          rememberPopoverTrigger(popover, trigger);
        }
      },
      true
    );
  } else {
    for (const trigger of document.querySelectorAll(
      '[popovertarget]:not([popovertargetaction="hide"])'
    )) {
      trigger.setAttribute('aria-expanded', 'false');
    }
    function handleFallbackTriggerClick(
      popover: HTMLElement,
      trigger: Element,
      action: string | undefined
    ): void {
      if (action === 'hide') {
        closePopover(popover);
        return;
      }
      const previousTrigger = activeTriggers.get(popover);
      const isOpen = isPopoverOpen(popover);
      if (action === 'show') {
        rememberPopoverTrigger(popover, trigger);
        if (isOpen) {
          syncPopoverExpanded(popover, true);
          dispatchFallbackToggle(popover, 'open');
        } else {
          openPopover(popover);
        }
      } else if (isOpen && (!previousTrigger || previousTrigger === trigger)) {
        closePopover(popover);
      } else {
        rememberPopoverTrigger(popover, trigger);
        if (isOpen) {
          syncPopoverExpanded(popover, true);
          dispatchFallbackToggle(popover, 'open');
        } else {
          openPopover(popover);
        }
      }
    }
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented) {
        return;
      }
      const { target } = event;
      const trigger = target instanceof Element ? target.closest('[popovertarget]') : undefined;
      const action = trigger?.getAttribute('popovertargetaction') ?? undefined;
      for (const popover of document.querySelectorAll('[popover]')) {
        if (popover instanceof HTMLElement) {
          if (trigger && trigger.getAttribute('popovertarget') === popover.id) {
            handleFallbackTriggerClick(popover, trigger, action);
          } else if (!(target instanceof Node && popover.contains(target))) {
            closePopover(popover);
          }
        }
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }
      for (const popover of document.querySelectorAll('[popover]')) {
        if (popover instanceof HTMLElement && isPopoverOpen(popover)) {
          const trigger = resolvePopoverTrigger(popover);
          closePopover(popover);
          if (trigger instanceof HTMLElement) {
            trigger.focus();
          }
        }
      }
    });
  }

  initSidebarDrawer(sidebarDrawer, drawerQuery, isPopoverOpen, closePopover);
  initCodeDrawers(reducedMotionQuery, copyText, resolveCopySource);

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (activePopover && isPopoverOpen(activePopover.popover)) {
        placePopover(activePopover.popover, activePopover.anchor, activePopover.options);
      }
    }).observe(rootElement);
  }

  document.addEventListener(
    'scroll',
    (event) => {
      const scrolledElement = event.target;
      if (scrolledElement instanceof Element && scrolledElement.classList.contains('code-pre')) {
        updateScrollButtons(scrolledElement.closest('.code-drawer-body'));
      } else if (
        activePopover &&
        isPopoverOpen(activePopover.popover) &&
        !(scrolledElement instanceof Node && activePopover.popover.contains(scrolledElement))
      ) {
        placePopover(activePopover.popover, activePopover.anchor, activePopover.options);
      }
    },
    true
  );

  bindCodeCopySanitizer();
}

initSiteClient();
