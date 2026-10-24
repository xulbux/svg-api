/**
 * Code drawer scroll controller – Manages horizontal scroll buttons and resize observation for expandable `<details class="code-drawer">` blocks.
 */

// ---------------------------------------- CONSTS ---------------------------------------

/** Horizontal distance in pixels scrolled by a code drawer scroll button. */
const CODE_SCROLL_STEP = 240;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Show or hide (and enable or disable) the scroll buttons of a code drawer body.
 * @param drawerBody   `.code-drawer-body` element.
 */
export function updateScrollButtons(drawerBody: Element | null | undefined): void {
  const codePre = drawerBody?.querySelector('.code-pre');
  const leftButton = drawerBody?.querySelector('.scroll-btn-left');
  const rightButton = drawerBody?.querySelector('.scroll-btn-right');
  if (
    !codePre ||
    !(leftButton instanceof HTMLButtonElement) ||
    !(rightButton instanceof HTMLButtonElement)
  ) {
    return;
  }
  const isScrollable = codePre.scrollWidth > codePre.clientWidth + 1;
  leftButton.classList.toggle('is-visible', isScrollable);
  rightButton.classList.toggle('is-visible', isScrollable);
  leftButton.disabled = !isScrollable || codePre.scrollLeft <= 0;
  rightButton.disabled =
    !isScrollable || codePre.scrollLeft >= codePre.scrollWidth - codePre.clientWidth - 1;
}

/**
 * Bind code drawer `<details>` toggle observation and scroll button click handling.
 * @param reducedMotionQuery   `prefers-reduced-motion: reduce` media query list.
 * @param copyText             Clipboard copy helper.
 * @param resolveCopySource    Resolves the target element of a `.copy-btn`.
 */
export function initCodeDrawers(
  reducedMotionQuery: MediaQueryList,
  copyText: (text: string, button: Element) => void,
  resolveCopySource: (copyButton: Element) => Element | undefined
): void {
  function getScrollBehavior(): ScrollBehavior {
    return reducedMotionQuery.matches ? 'auto' : 'smooth';
  }

  /** Keeps the scroll buttons of open code drawers in sync with their width. */
  const codeResizeObserver =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            updateScrollButtons(entry.target.closest('.code-drawer-body'));
          }
        });

  for (const openPre of document.querySelectorAll('details.code-drawer[open] .code-pre')) {
    codeResizeObserver?.observe(openPre);
    updateScrollButtons(openPre.closest('.code-drawer-body'));
  }

  document.addEventListener(
    'toggle',
    (event) => {
      const drawer = event.target;
      if (!(drawer instanceof HTMLDetailsElement) || !drawer.classList.contains('code-drawer')) {
        return;
      }
      const codePre = drawer.querySelector('.code-pre');
      if (!codePre) {
        return;
      }
      if (drawer.open) {
        codeResizeObserver?.observe(codePre);
        globalThis.requestAnimationFrame(() =>
          updateScrollButtons(codePre.closest('.code-drawer-body'))
        );
      } else {
        codeResizeObserver?.unobserve(codePre);
      }
    },
    true
  );

  document.addEventListener('click', (event) => {
    const clickTarget = event.target;
    if (!(clickTarget instanceof Element)) {
      return;
    }

    const scrollButton = clickTarget.closest('.scroll-btn');
    if (scrollButton) {
      const scrollPre = scrollButton.closest('.code-drawer-body')?.querySelector('.code-pre');
      const scrollDistance = scrollButton.classList.contains('scroll-btn-left')
        ? -CODE_SCROLL_STEP
        : CODE_SCROLL_STEP;
      scrollPre?.scrollBy({ behavior: getScrollBehavior(), left: scrollDistance });
      return;
    }

    const copyButton = clickTarget.closest('.copy-btn');
    const copySource = copyButton ? resolveCopySource(copyButton) : undefined;
    if (copyButton && copySource) {
      copyText(copySource.textContent ?? '', copyButton);
    }
  });
}
