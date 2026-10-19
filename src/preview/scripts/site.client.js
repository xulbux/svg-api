// @ts-check
/**
 * Site client script – Color-scheme toggle, preview stage backgrounds, reduced motion for SMIL previews, code drawer
 * scrolling, popovers, and clipboard copying on every `svg.xul.is` documentation page.
 *
 * Loaded as a deferred classic script before any page script; Shared values (storage keys, preview backgrounds,
 * theme colors) are read from the `#site-config` JSON element rendered by `src/preview/layout.ts`. The popover
 * and clipboard helpers are exposed as `svgSite` for the builder script; Without a DOM, the pure helpers are
 * exposed as `svgSiteCore` so the test suite can verify them.
 */

(function initSiteClient() {
  // ---------------------------------------- CONSTS ---------------------------------------

  /** Horizontal distance in pixels scrolled by a code drawer scroll button. */
  const CODE_SCROLL_STEP = 240;

  /** Duration in milliseconds before copy feedback resets. */
  const COPY_FEEDBACK_MS = 1500;

  /** Minimum distance in pixels between a fallback-positioned popover and the viewport edges. */
  const VIEWPORT_MARGIN = 8;

  // ------------------------------------ REGEX PATTERNS -----------------------------------

  /** Matches non-breaking spaces in copied code selections. */
  const NBSP_RX = /\u00A0/g;

  // -------------------------------------- INTERNALS --------------------------------------

  /**
   * Compute the viewport position of a popover below (or, without room, above) its anchor, clamped to the
   * viewport; Used where CSS anchor positioning is unavailable.
   * @param {PopoverAnchorRect} anchorRect   Anchor bounding rectangle.
   * @param {PopoverSize} popoverSize        Measured popover size.
   * @param {PopoverSize} viewportSize       Viewport size.
   * @param {PopoverPlacementOptions} options
   * @returns {PopoverPlacement}
   */
  function computePopoverPlacement(anchorRect, popoverSize, viewportSize, options) {
    const gap = options.gap ?? VIEWPORT_MARGIN;
    const width = options.isWidthMatched
      ? Math.max(popoverSize.width, anchorRect.width)
      : popoverSize.width;
    let top = anchorRect.bottom + gap;
    const hasRoomBelow = top + popoverSize.height <= viewportSize.height - VIEWPORT_MARGIN;
    const aboveTop = anchorRect.top - gap - popoverSize.height;
    if (!hasRoomBelow && aboveTop >= VIEWPORT_MARGIN) {
      top = aboveTop;
    } else if (!hasRoomBelow) {
      top = Math.max(VIEWPORT_MARGIN, viewportSize.height - VIEWPORT_MARGIN - popoverSize.height);
    }
    const preferredLeft = options.align === 'end' ? anchorRect.right - width : anchorRect.left;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(preferredLeft, viewportSize.width - VIEWPORT_MARGIN - width)
    );
    return { left, minWidth: options.isWidthMatched ? anchorRect.width : undefined, top };
  }

  // -------------------------------------- PUBLIC API -------------------------------------

  if (typeof document === 'undefined') {
    globalThis.svgSiteCore = { computePopoverPlacement };
    return;
  }

  // ----------------------------------------- MAIN ----------------------------------------
  // Everything below needs the DOM; Helpers close over the page state, so they live inside MAIN.

  /** @type {SiteClientConfig} */
  const siteConfig = JSON.parse(document.getElementById('site-config')?.textContent ?? '{}');
  const rootElement = document.documentElement;
  const schemeMeta = /** @type {HTMLMetaElement | null} */ (
    document.querySelector('meta[name="color-scheme"]')
  );
  const themeColorMetas = document.querySelectorAll('meta[name="theme-color"]');
  const themeToggle = document.getElementById('theme-toggle');
  const darkSchemeQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
  const reducedMotionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  const drawerQuery = globalThis.matchMedia(siteConfig.drawerMediaQuery);
  const sidebarDrawer = document.getElementById('sidebar-drawer');

  /** Whether the browser supports the Popover API (otherwise popovers toggle an `.is-open` class). */
  const hasPopoverApi = 'popover' in HTMLElement.prototype;

  /** Whether the browser supports CSS anchor positioning for popovers. */
  const hasAnchorPositioning = CSS.supports('position-area', 'block-end');

  /** @type {WeakMap<Element, number>} */
  const copyResetTimers = new WeakMap();

  /**
   * Check whether a popover element is open (native `:popover-open` or the `.is-open` fallback class).
   * @param {Element} popover   Popover element.
   * @returns {boolean}
   */
  function isPopoverOpen(popover) {
    return hasPopoverApi ? popover.matches(':popover-open') : popover.classList.contains('is-open');
  }

  /**
   * Close a popover element and sync its fallback trigger state.
   * @param {HTMLElement} popover   Popover element.
   */
  function closePopover(popover) {
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

  /**
   * Position an open popover next to its anchor when CSS anchor positioning is unavailable (no-op otherwise).
   * @param {HTMLElement} popover                Open popover element (measured for its real size).
   * @param {Element} anchor                     Anchor element.
   * @param {PopoverPlacementOptions} [options]
   */
  function placePopover(popover, anchor, options = {}) {
    if (hasAnchorPositioning) {
      return;
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

  /**
   * Read a `localStorage` value (`undefined` when unset or unavailable).
   * @param {string} key   Storage key.
   * @returns {string | undefined}
   */
  function readStorage(key) {
    try {
      return localStorage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Write or remove (`undefined`) a `localStorage` value, ignoring unavailable storage.
   * @param {string} key                 Storage key.
   * @param {string | undefined} value   Value to store, or `undefined` to remove the key.
   */
  function writeStorage(key, value) {
    try {
      if (value === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    } catch {
      // Storage is unavailable (private mode or blocked); Preferences simply do not persist.
    }
  }

  /**
   * Whitelist a stored color scheme; Only `'dark'` and `'light'` are ever written into the color-scheme meta tag.
   * @param {string | null | undefined} value   Raw stored value.
   * @returns {'dark' | 'light' | undefined}
   */
  function sanitizeScheme(value) {
    return value === 'dark' || value === 'light' ? value : undefined;
  }

  /** @returns {'dark' | 'light'} */
  function getSystemScheme() {
    return darkSchemeQuery.matches ? 'dark' : 'light';
  }

  /**
   * Apply an explicit color scheme (or follow the system with `undefined`) to the color-scheme and
   * theme-color meta tags, and sync the theme switch state.
   * @param {'dark' | 'light' | undefined} storedScheme   Explicit scheme override.
   */
  function applyScheme(storedScheme) {
    if (schemeMeta) {
      schemeMeta.content = storedScheme ?? 'light dark';
    }
    for (const themeColorMeta of themeColorMetas) {
      if (themeColorMeta instanceof HTMLMetaElement) {
        const mediaScheme = themeColorMeta.media.includes('dark') ? 'dark' : 'light';
        themeColorMeta.content = siteConfig.themeColors[storedScheme ?? mediaScheme];
      }
    }
    themeToggle?.setAttribute(
      'aria-checked',
      String((storedScheme ?? getSystemScheme()) === 'dark')
    );
  }

  /**
   * Whitelist a stored preview stage background (falls back to the first option).
   * @param {string | null | undefined} value   Raw stored or selected value.
   * @returns {string}
   */
  function sanitizePreviewBg(value) {
    return typeof value === 'string' && siteConfig.previewBgValues.includes(value)
      ? value
      : siteConfig.previewBgValues[0];
  }

  /**
   * Apply a preview stage background to `<html data-preview-bg>` and sync every picker radio input.
   * @param {string} previewBg   Sanitized preview background value.
   */
  function applyPreviewBg(previewBg) {
    if (previewBg === siteConfig.previewBgValues[0]) {
      rootElement.removeAttribute('data-preview-bg');
    } else {
      rootElement.setAttribute('data-preview-bg', previewBg);
    }
    for (const radioInput of document.querySelectorAll('input[name="preview-bg"]')) {
      if (radioInput instanceof HTMLInputElement) {
        radioInput.checked = radioInput.value === previewBg;
      }
    }
  }

  /** Reduced motion: CSS cannot stop SMIL, so pause every inline preview SVG at its first frame. */
  function syncPreviewAnimations() {
    for (const previewSvg of document.querySelectorAll('.preview-stage svg')) {
      if (previewSvg instanceof SVGSVGElement) {
        if (reducedMotionQuery.matches) {
          previewSvg.pauseAnimations();
          previewSvg.setCurrentTime(0);
        } else {
          previewSvg.unpauseAnimations();
        }
      }
    }
  }

  /** @returns {ScrollBehavior} */
  function getScrollBehavior() {
    return reducedMotionQuery.matches ? 'auto' : 'smooth';
  }

  /**
   * Show or hide (and enable or disable) the scroll buttons of a code drawer body.
   * @param {Element | null} drawerBody   `.code-drawer-body` element.
   */
  function updateScrollButtons(drawerBody) {
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
   * Copy text by selecting a temporary off-screen element and running the legacy `copy` command.
   * @param {string} text   Text to copy.
   * @returns {boolean} Whether the copy command succeeded.
   */
  function copyWithSelection(text) {
    const selection = globalThis.getSelection();
    if (!selection) {
      return false;
    }
    const scratch = document.createElement('pre');
    scratch.textContent = text;
    scratch.style.cssText = 'position:fixed;inset:0 auto auto 0;opacity:0;pointer-events:none;';
    document.body.append(scratch);
    const range = document.createRange();
    range.selectNodeContents(scratch);
    selection.removeAllRanges();
    selection.addRange(range);
    let isCopied = false;
    try {
      // oxlint-disable-next-line typescript/no-deprecated -- Fallback for insecure contexts without the Clipboard API.
      isCopied = document.execCommand('copy');
    } catch {
      isCopied = false;
    }
    selection.removeAllRanges();
    scratch.remove();
    return isCopied;
  }

  /**
   * Announce copy success or failure in a button's `[data-copy-label]` element (a polite live region),
   * resetting after `COPY_FEEDBACK_MS`; `data-copied-label` / `data-failed-label` override the texts.
   * @param {Element} button      Copy button.
   * @param {boolean} isCopied    Whether the copy succeeded.
   */
  function showCopyFeedback(button, isCopied) {
    const labelElement = button.querySelector('[data-copy-label]');
    if (!(button instanceof HTMLElement) || !(labelElement instanceof HTMLElement)) {
      return;
    }
    labelElement.dataset.defaultLabel ??= labelElement.textContent ?? '';
    clearTimeout(copyResetTimers.get(button));
    button.classList.toggle('is-copied', isCopied);
    button.classList.toggle('is-failed', !isCopied);
    labelElement.textContent = isCopied
      ? (button.dataset.copiedLabel ?? 'Copied')
      : (button.dataset.failedLabel ?? 'Copy failed');
    copyResetTimers.set(
      button,
      globalThis.setTimeout(() => {
        button.classList.remove('is-copied', 'is-failed');
        labelElement.textContent = labelElement.dataset.defaultLabel ?? '';
      }, COPY_FEEDBACK_MS)
    );
  }

  /**
   * Copy text with the async Clipboard API (falling back to a selection copy) and show feedback on a button.
   * @param {string} text         Text to copy.
   * @param {Element} button      Button receiving the feedback.
   */
  function copyText(text, button) {
    if (navigator.clipboard && globalThis.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        () => showCopyFeedback(button, true),
        () => showCopyFeedback(button, copyWithSelection(text))
      );
    } else {
      showCopyFeedback(button, copyWithSelection(text));
    }
  }

  /**
   * Resolve the copy source of a copy button: `data-copy-target` (an element ID) or the code drawer's `<pre>`.
   * @param {Element} copyButton   `.copy-btn` element.
   * @returns {Element | undefined}
   */
  function resolveCopySource(copyButton) {
    const targetId = copyButton.getAttribute('data-copy-target');
    if (targetId) {
      return document.getElementById(targetId) ?? undefined;
    }
    return copyButton.closest('.code-drawer-body')?.querySelector('.code-pre') ?? undefined;
  }

  globalThis.svgSite = {
    closePopover,
    copyText,
    hasAnchorPositioning,
    isPopoverOpen,
    placePopover,
  };

  /** Keeps the scroll buttons of open code drawers in sync with their width. */
  const codeResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      updateScrollButtons(entry.target.closest('.code-drawer-body'));
    }
  });

  applyScheme(sanitizeScheme(readStorage(siteConfig.schemeStorageKey)));
  applyPreviewBg(sanitizePreviewBg(readStorage(siteConfig.previewBgStorageKey)));
  if (reducedMotionQuery.matches) {
    syncPreviewAnimations();
  }

  themeToggle?.addEventListener('click', () => {
    const renderedScheme =
      sanitizeScheme(readStorage(siteConfig.schemeStorageKey)) ?? getSystemScheme();
    const targetScheme = renderedScheme === 'dark' ? 'light' : 'dark';
    const storedScheme = targetScheme === getSystemScheme() ? undefined : targetScheme;
    writeStorage(siteConfig.schemeStorageKey, storedScheme);
    applyScheme(storedScheme);
  });

  darkSchemeQuery.addEventListener('change', () => {
    applyScheme(sanitizeScheme(readStorage(siteConfig.schemeStorageKey)));
  });

  reducedMotionQuery.addEventListener('change', syncPreviewAnimations);

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.name === 'preview-bg') {
      const previewBg = sanitizePreviewBg(input.value);
      writeStorage(
        siteConfig.previewBgStorageKey,
        previewBg === siteConfig.previewBgValues[0] ? undefined : previewBg
      );
      applyPreviewBg(previewBg);
    }
  });

  globalThis.addEventListener('storage', (event) => {
    if (event.key === siteConfig.schemeStorageKey) {
      applyScheme(sanitizeScheme(event.newValue));
    } else if (event.key === siteConfig.previewBgStorageKey) {
      applyPreviewBg(sanitizePreviewBg(event.newValue));
    }
  });

  // Popover menus (preview background picker, mobile sidebar): Native popovers with a class-toggle fallback.

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

  const bgPickerTrigger = document.getElementById('bg-picker-trigger');
  const bgPickerMenu = document.getElementById('bg-picker-menu');
  if (bgPickerTrigger && bgPickerMenu) {
    bgPickerMenu.addEventListener('toggle', (event) => {
      if (/** @type {ToggleEvent} */ (event).newState === 'open') {
        placePopover(bgPickerMenu, bgPickerTrigger, { align: 'end' });
      }
    });

    // Pointer selections close the menu; Keyboard arrow selections (click detail 0) keep it open.
    bgPickerMenu.addEventListener('click', (event) => {
      const { target } = event;
      if (event.detail > 0 && target instanceof Element && target.closest('.bg-picker-option')) {
        closePopover(bgPickerMenu);
      }
    });
  }

  // Mobile sidebar drawer: Close it when one of its links is followed or the viewport leaves the drawer layout.
  if (sidebarDrawer) {
    sidebarDrawer.addEventListener('click', (event) => {
      const { target } = event;
      if (target instanceof Element && target.closest('a')) {
        closePopover(sidebarDrawer);
      }
    });
    drawerQuery.addEventListener('change', () => {
      if (!drawerQuery.matches) {
        closePopover(sidebarDrawer);
      }
    });
  }

  // Code drawers: Scroll buttons follow the scroll position and the drawer width while a drawer is open.
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
        codeResizeObserver.observe(codePre);
        globalThis.requestAnimationFrame(() =>
          updateScrollButtons(codePre.closest('.code-drawer-body'))
        );
      } else {
        codeResizeObserver.unobserve(codePre);
      }
    },
    true
  );

  document.addEventListener(
    'scroll',
    (event) => {
      const scrolledElement = event.target;
      if (scrolledElement instanceof Element && scrolledElement.classList.contains('code-pre')) {
        updateScrollButtons(scrolledElement.closest('.code-drawer-body'));
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

  // Copy plain text (non-breaking spaces become spaces) from highlighted code blocks.
  document.addEventListener('copy', (event) => {
    const selection = globalThis.getSelection();
    if (!selection || selection.isCollapsed || !event.clipboardData) {
      return;
    }
    const { anchorNode } = selection;
    const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    if (anchorElement?.closest('.code-pre')) {
      event.clipboardData.setData('text/plain', selection.toString().replace(NBSP_RX, ' '));
      event.preventDefault();
    }
  });
})();
