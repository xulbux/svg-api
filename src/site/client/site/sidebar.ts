/**
 * Mobile sidebar drawer controller – Converts `#sidebar-drawer` into a modal-like popover on narrow screens and keeps it an inline sticky column on wide screens.
 */

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Bind the responsive sidebar drawer behavior (`popover` attribute toggle, background `inert` management, focus entry, and close-on-navigation).
 * @param sidebarDrawer   `#sidebar-drawer` element (`null` on pages without a sidebar).
 * @param drawerQuery     Narrow-screen media query list (`siteConfig.drawerMediaQuery`).
 * @param isPopoverOpen   Checks whether a popover element is open.
 * @param closePopover    Closes an open popover element.
 */
export function initSidebarDrawer(
  sidebarDrawer: HTMLElement | null,
  drawerQuery: MediaQueryList,
  isPopoverOpen: (popover: Element) => boolean,
  closePopover: (popover: HTMLElement) => void
): void {
  if (!sidebarDrawer) {
    return;
  }
  const sidebarBgElements = document.querySelectorAll(
    '.skip-link, .site-header, .page-main, .site-footer'
  );

  /**
   * Toggle `inert` on the page regions behind the mobile sidebar drawer so the background cannot be
   * interacted with while the drawer is open.
   */
  function setSidebarBgInert(isInert: boolean): void {
    for (const element of sidebarBgElements) {
      element.toggleAttribute('inert', isInert);
    }
  }

  /**
   * Give the sidebar the `popover` attribute only on narrow screens (`drawerQuery`), because a closed
   * `[popover]` is inert for keyboard focus even when shown inline by CSS on wide screens.
   */
  function syncSidebarDrawer(): void {
    if (!sidebarDrawer) {
      return;
    }
    if (drawerQuery.matches) {
      sidebarDrawer.setAttribute('popover', '');
      setSidebarBgInert(isPopoverOpen(sidebarDrawer));
    } else {
      closePopover(sidebarDrawer);
      sidebarDrawer.removeAttribute('popover');
      setSidebarBgInert(false);
    }
  }

  syncSidebarDrawer();
  drawerQuery.addEventListener('change', syncSidebarDrawer);
  sidebarDrawer.addEventListener('toggle', (event) => {
    const isOpen = (event as ToggleEvent).newState === 'open';
    setSidebarBgInert(isOpen && drawerQuery.matches);
    if (isOpen) {
      const focusTarget = sidebarDrawer.querySelector(
        '.sidebar-link.is-active, .sidebar-link, .sidebar-close'
      );
      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus();
      }
    }
  });
  sidebarDrawer.addEventListener('focusout', (event) => {
    if (
      drawerQuery.matches &&
      event.relatedTarget instanceof Node &&
      !sidebarDrawer.contains(event.relatedTarget)
    ) {
      closePopover(sidebarDrawer);
    }
  });
  sidebarDrawer.addEventListener('click', (event) => {
    const { target } = event;
    if (target instanceof Element && target.closest('a')) {
      closePopover(sidebarDrawer);
    }
  });
}
