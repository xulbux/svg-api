/**
 * Site client entry point – Initializes theme/background switches, reduced-motion SMIL pausing, mobile sidebar drawer, code drawer scrolling, popovers, and clipboard copying on every `svg.xul.is` page.
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

  /** Check whether a popover element is open (native `:popover-open` or the `.is-open` fallback class). */
  function isPopoverOpen(popover: Element): boolean {
    return hasPopoverApi ? popover.matches(':popover-open') : popover.classList.contains('is-open');
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
    document
      .querySelector(`[popovertarget="${popover.id}"]`)
      ?.setAttribute('aria-expanded', 'false');
  }

  /** Position an open popover next to its anchor, clamped to the viewport. */
  function placePopover(
    popover: HTMLElement,
    anchor: Element,
    options: PopoverPlacementOptions = {}
  ): void {
    activePopover = { anchor, options, popover };
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
  globalThis.svgSite = { closePopover, copyText, isPopoverOpen, placePopover };

  initThemeAndMotion(siteConfig, rootElement, reducedMotionQuery);

  // Popovers (mobile sidebar drawer, builder menus); native popovers with a class-toggle fallback:
  if (!hasPopoverApi) {
    for (const trigger of document.querySelectorAll('[popovertarget]')) {
      trigger.setAttribute('aria-expanded', 'false');
    }
    document.addEventListener('click', (event) => {
      const { target } = event;
      const trigger = target instanceof Element ? target.closest('[popovertarget]') : undefined;
      for (const popover of document.querySelectorAll('[popover]')) {
        if (popover instanceof HTMLElement) {
          const isOwnTrigger = trigger?.getAttribute('popovertarget') === popover.id;
          if (isOwnTrigger) {
            const isOpen = popover.classList.toggle('is-open');
            trigger?.setAttribute('aria-expanded', String(isOpen));
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
          closePopover(popover);
          const trigger = document.querySelector(`[popovertarget="${popover.id}"]`);
          if (trigger instanceof HTMLElement) {
            trigger.focus();
          }
        }
      }
    });
  }

  initSidebarDrawer(sidebarDrawer, drawerQuery, isPopoverOpen, closePopover);
  initCodeDrawers(reducedMotionQuery, copyText, resolveCopySource);

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
