// @ts-check
/**
 * Site client script – Color-scheme toggle, preview stage backgrounds, reduced motion for SMIL previews, code drawer
 * scrolling, and clipboard copying on every `svg.xul.is` documentation page.
 *
 * Loaded as a deferred classic script; Shared values (storage keys, preview backgrounds) are read from the
 * `#site-config` JSON element rendered by `src/preview/layout.ts`.
 */

(function initSiteClient() {
  // ---------------------------------------- CONSTS ---------------------------------------

  /** @type {SiteClientConfig} */
  const SITE_CONFIG = JSON.parse(document.getElementById('site-config')?.textContent ?? '{}');

  /** Horizontal distance in pixels scrolled by a code drawer scroll button. */
  const CODE_SCROLL_STEP = 240;

  /** Duration in milliseconds before copy feedback resets. */
  const COPY_FEEDBACK_MS = 1500;

  const rootElement = document.documentElement;
  const schemeMeta = /** @type {HTMLMetaElement | null} */ (
    document.querySelector('meta[name="color-scheme"]')
  );
  const themeToggle = document.getElementById('theme-toggle');
  const darkSchemeQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
  const reducedMotionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');

  /** @type {WeakMap<Element, number>} */
  const copyResetTimers = new WeakMap();

  /** Whether the browser supports the Popover API (otherwise popovers toggle an `.is-open` class). */
  const hasPopoverApi = 'popover' in HTMLElement.prototype;

  /** Whether the browser supports CSS anchor positioning for popovers. */
  const hasAnchorPositioning = CSS.supports('position-area', 'block-end');

  // ------------------------------------ REGEX PATTERNS -----------------------------------

  /** Matches non-breaking spaces in copied code selections. */
  const NBSP_RX = /\u00A0/g;

  // -------------------------------------- INTERNALS --------------------------------------

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
   * Read a `localStorage` value (`null` when unavailable).
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
   * @param {string} key            Storage key.
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
   * Apply an explicit color scheme (or follow the system with `undefined`) and sync the theme switch state.
   * @param {'dark' | 'light' | undefined} storedScheme   Explicit scheme override.
   */
  function applyScheme(storedScheme) {
    if (schemeMeta) {
      schemeMeta.content = storedScheme ?? 'light dark';
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
    return typeof value === 'string' && SITE_CONFIG.previewBgValues.includes(value)
      ? value
      : SITE_CONFIG.previewBgValues[0];
  }

  /**
   * Apply a preview stage background to `<html data-preview-bg>` and sync every picker radio input.
   * @param {string} previewBg   Sanitized preview background value.
   */
  function applyPreviewBg(previewBg) {
    if (previewBg === SITE_CONFIG.previewBgValues[0]) {
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
    if (!codePre || !leftButton || !rightButton) {
      return;
    }
    const isScrollable = codePre.scrollWidth > codePre.clientWidth + 1;
    leftButton.classList.toggle('is-visible', isScrollable);
    rightButton.classList.toggle('is-visible', isScrollable);
    if (isScrollable) {
      leftButton.classList.toggle('is-disabled', codePre.scrollLeft <= 0);
      rightButton.classList.toggle(
        'is-disabled',
        codePre.scrollLeft >= codePre.scrollWidth - codePre.clientWidth - 1
      );
    }
  }

  /**
   * Copy an element's text by selecting it and running the legacy `copy` command.
   * @param {Element} sourceElement   Element whose text content is copied.
   * @returns {boolean} Whether the copy command succeeded.
   */
  function copyWithSelection(sourceElement) {
    const selection = globalThis.getSelection();
    if (!selection) {
      return false;
    }
    const range = document.createRange();
    range.selectNodeContents(sourceElement);
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
    return isCopied;
  }

  /**
   * Announce copy success or failure on a copy button, resetting after `COPY_FEEDBACK_MS`.
   * @param {Element} copyButton   `.copy-btn` element.
   * @param {boolean} isCopied     Whether the copy succeeded.
   */
  function showCopyFeedback(copyButton, isCopied) {
    const labelElement = copyButton.querySelector('.copy-btn-text');
    clearTimeout(copyResetTimers.get(copyButton));
    copyButton.classList.toggle('is-copied', isCopied);
    copyButton.classList.toggle('is-failed', !isCopied);
    if (labelElement) {
      labelElement.textContent = isCopied ? 'Copied' : 'Copy failed';
    }
    copyResetTimers.set(
      copyButton,
      globalThis.setTimeout(() => {
        copyButton.classList.remove('is-copied', 'is-failed');
        if (labelElement) {
          labelElement.textContent = 'Copy';
        }
      }, COPY_FEEDBACK_MS)
    );
  }

  /**
   * Copy text with the async Clipboard API, falling back to a selection copy of `sourceElement`.
   * @param {Element} copyButton      `.copy-btn` element receiving the feedback.
   * @param {Element} sourceElement   Element whose text content is copied.
   */
  function copyElementText(copyButton, sourceElement) {
    if (navigator.clipboard && globalThis.isSecureContext) {
      navigator.clipboard.writeText(sourceElement.textContent ?? '').then(
        () => showCopyFeedback(copyButton, true),
        () => showCopyFeedback(copyButton, copyWithSelection(sourceElement))
      );
    } else {
      showCopyFeedback(copyButton, copyWithSelection(sourceElement));
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

  // ----------------------------------------- MAIN ----------------------------------------

  applyScheme(sanitizeScheme(readStorage(SITE_CONFIG.schemeStorageKey)));
  applyPreviewBg(sanitizePreviewBg(readStorage(SITE_CONFIG.previewBgStorageKey)));
  if (reducedMotionQuery.matches) {
    syncPreviewAnimations();
  }

  themeToggle?.addEventListener('click', () => {
    const renderedScheme =
      sanitizeScheme(readStorage(SITE_CONFIG.schemeStorageKey)) ?? getSystemScheme();
    const targetScheme = renderedScheme === 'dark' ? 'light' : 'dark';
    const storedScheme = targetScheme === getSystemScheme() ? undefined : targetScheme;
    writeStorage(SITE_CONFIG.schemeStorageKey, storedScheme);
    applyScheme(storedScheme);
  });

  darkSchemeQuery.addEventListener('change', () => {
    applyScheme(sanitizeScheme(readStorage(SITE_CONFIG.schemeStorageKey)));
  });

  reducedMotionQuery.addEventListener('change', syncPreviewAnimations);

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.name === 'preview-bg') {
      const previewBg = sanitizePreviewBg(input.value);
      writeStorage(
        SITE_CONFIG.previewBgStorageKey,
        previewBg === SITE_CONFIG.previewBgValues[0] ? undefined : previewBg
      );
      applyPreviewBg(previewBg);
    }
  });

  globalThis.addEventListener('storage', (event) => {
    if (event.key === SITE_CONFIG.schemeStorageKey) {
      applyScheme(sanitizeScheme(event.newValue));
    } else if (event.key === SITE_CONFIG.previewBgStorageKey) {
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
    if (hasPopoverApi && !hasAnchorPositioning) {
      bgPickerMenu.addEventListener('beforetoggle', (event) => {
        if (/** @type {ToggleEvent} */ (event).newState === 'open') {
          const triggerRect = bgPickerTrigger.getBoundingClientRect();
          bgPickerMenu.style.top = `${triggerRect.bottom + 8}px`;
          bgPickerMenu.style.right = `${Math.max(8, rootElement.clientWidth - triggerRect.right)}px`;
        }
      });
    }

    // Pointer selections close the menu; Keyboard arrow selections (click detail 0) keep it open.
    bgPickerMenu.addEventListener('click', (event) => {
      const { target } = event;
      if (event.detail > 0 && target instanceof Element && target.closest('.bg-picker-option')) {
        closePopover(bgPickerMenu);
      }
    });
  }

  // Close the mobile sidebar drawer when one of its links is followed.
  const sidebarDrawer = document.getElementById('sidebar-drawer');
  sidebarDrawer?.addEventListener('click', (event) => {
    const { target } = event;
    if (target instanceof Element && target.closest('a')) {
      closePopover(sidebarDrawer);
    }
  });

  // Code drawers: Scroll buttons follow the scroll position and the drawer width.
  document.addEventListener(
    'toggle',
    (event) => {
      const drawer = event.target;
      if (
        drawer instanceof HTMLDetailsElement &&
        drawer.classList.contains('code-drawer') &&
        drawer.open
      ) {
        const drawerBody = drawer.querySelector('.code-drawer-body');
        globalThis.setTimeout(() => updateScrollButtons(drawerBody), 30);
      }
    },
    true
  );

  globalThis.addEventListener('resize', () => {
    for (const drawerBody of document.querySelectorAll(
      'details.code-drawer[open] .code-drawer-body'
    )) {
      updateScrollButtons(drawerBody);
    }
  });

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
      copyElementText(copyButton, copySource);
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
    if (anchorElement?.closest('.code-pre, .code-output')) {
      event.clipboardData.setData('text/plain', selection.toString().replace(NBSP_RX, ' '));
      event.preventDefault();
    }
  });
})();
