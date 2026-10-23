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
import type { ActivePopoverState } from '@/site/client/site/popover';
import { initSidebarDrawer } from '@/site/client/site/sidebar';
import { initThemeAndMotion } from '@/site/client/site/theme';
import type { PopoverPlacementOptions, SiteClientConfig } from '@/site/client/site/types';

// -------------------------------------- INTERNALS --------------------------------------

/** Dispatch a synthetic `toggle` event for non-Popover-API fallback listeners. */
function dispatchFallbackToggle(popover: HTMLElement, newState: 'closed' | 'open'): void {
  popover.dispatchEvent(Object.assign(new Event('toggle'), { newState }));
}

// ----------------------------------------- MAIN ----------------------------------------

/** Initialize the site client in the browser, or expose `svgSiteCore` when evaluated in Node/Vitest without a DOM. */
function initSiteClient(): void {
  if (typeof document === 'undefined') {
    globalThis.svgSiteCore = { computePopoverPlacement };
    return;
  }

  const siteConfig = JSON.parse(
    document.getElementById('site-config')?.textContent ?? '{}'
  ) as SiteClientConfig;
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
    const popoverRect = popover.getBoundingClientRect();
    const placement = computePopoverPlacement(
      anchor.getBoundingClientRect(),
      { height: popoverRect.height, width: popoverRect.width },
      { height: globalThis.innerHeight, width: rootElement.clientWidth },
      options
    );
    popover.style.top = `${placement.top}px`;
    popover.style.left = `${placement.left}px`;
    if (placement.minWidth !== undefined) {
      popover.style.minWidth = `${placement.minWidth}px`;
    }
  }

  const copyText = createClipboardController();
  globalThis.svgSite = { closePopover, copyText, isPopoverOpen, openPopover, placePopover };

  initThemeAndMotion(siteConfig, rootElement, reducedMotionQuery);

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

  document.addEventListener(
    'toggle',
    (event) => {
      const popover = event.target;
      if (popover instanceof HTMLElement && popover.hasAttribute('popover')) {
        syncPopoverExpanded(popover, (event as ToggleEvent).newState === 'open');
      }
    },
    true
  );

  // Popovers (mobile sidebar drawer, builder menus); native popovers with a class-toggle fallback:
  if (!hasPopoverApi) {
    for (const trigger of document.querySelectorAll(
      '[popovertarget]:not([popovertargetaction="hide"])'
    )) {
      trigger.setAttribute('aria-expanded', 'false');
    }
    document.addEventListener('click', (event) => {
      const { target } = event;
      const trigger = target instanceof Element ? target.closest('[popovertarget]') : undefined;
      const action = trigger?.getAttribute('popovertargetaction');
      for (const popover of document.querySelectorAll('[popover]')) {
        if (popover instanceof HTMLElement) {
          const isOwnTrigger = trigger?.getAttribute('popovertarget') === popover.id;
          if (isOwnTrigger) {
            if (action === 'hide') {
              closePopover(popover);
            } else if (action === 'show') {
              openPopover(popover);
            } else if (isPopoverOpen(popover)) {
              closePopover(popover);
            } else {
              openPopover(popover);
            }
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
