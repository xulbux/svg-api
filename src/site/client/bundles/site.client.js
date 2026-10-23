'use strict';
(() => {
  // src/site/client/site/clipboard.ts
  var COPY_FEEDBACK_MS = 1500;
  var NBSP_RX = /\u00A0/g;
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
      isCopied = document.execCommand('copy');
    } catch {
      isCopied = false;
    }
    selection.removeAllRanges();
    scratch.remove();
    return isCopied;
  }
  function createClipboardController() {
    const copyResetTimers = /* @__PURE__ */ new WeakMap();
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
    return copyText;
  }
  function resolveCopySource(copyButton) {
    const targetId = copyButton.getAttribute('data-copy-target');
    if (targetId) {
      return document.getElementById(targetId) ?? undefined;
    }
    return copyButton.closest('.code-drawer-body')?.querySelector('.code-pre') ?? undefined;
  }
  function bindCodeCopySanitizer() {
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
  }

  // src/site/client/site/drawers.ts
  var CODE_SCROLL_STEP = 240;
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
  function initCodeDrawers(reducedMotionQuery, copyText, resolveCopySource2) {
    function getScrollBehavior() {
      return reducedMotionQuery.matches ? 'auto' : 'smooth';
    }
    const codeResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateScrollButtons(entry.target.closest('.code-drawer-body'));
      }
    });
    for (const openPre of document.querySelectorAll('details.code-drawer[open] .code-pre')) {
      codeResizeObserver.observe(openPre);
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
      const copySource = copyButton ? resolveCopySource2(copyButton) : undefined;
      if (copyButton && copySource) {
        copyText(copySource.textContent ?? '', copyButton);
      }
    });
  }

  // src/site/client/site/popover.ts
  var VIEWPORT_MARGIN = 8;
  function computePopoverPlacement(anchorRect, popoverSize, viewportSize, options) {
    const gap = options.gap ?? VIEWPORT_MARGIN;
    const maxViewportWidth = Math.max(0, viewportSize.width - VIEWPORT_MARGIN * 2);
    const matchedMinWidth = options.isWidthMatched
      ? Math.min(anchorRect.width, maxViewportWidth)
      : undefined;
    const width =
      matchedMinWidth === undefined
        ? popoverSize.width
        : Math.max(popoverSize.width, matchedMinWidth);
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
    return { left, minWidth: matchedMinWidth, top };
  }

  // src/site/client/site/sidebar.ts
  function initSidebarDrawer(sidebarDrawer, drawerQuery, isPopoverOpen, closePopover) {
    if (!sidebarDrawer) {
      return;
    }
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const sidebarBgElements = document.querySelectorAll(
      '.skip-link, .site-header, .page-main, .site-footer'
    );
    function setSidebarBgInert(isInert) {
      for (const element of sidebarBgElements) {
        element.toggleAttribute('inert', isInert);
      }
    }
    function syncSidebarDrawer() {
      if (!sidebarDrawer) {
        return;
      }
      if (drawerQuery.matches) {
        sidebarDrawer.setAttribute('popover', '');
        const isOpen = isPopoverOpen(sidebarDrawer);
        setSidebarBgInert(isOpen);
        sidebarToggle?.setAttribute('aria-expanded', String(isOpen));
      } else {
        closePopover(sidebarDrawer);
        sidebarDrawer.removeAttribute('popover');
        setSidebarBgInert(false);
        sidebarToggle?.setAttribute('aria-expanded', 'false');
      }
    }
    syncSidebarDrawer();
    drawerQuery.addEventListener('change', syncSidebarDrawer);
    sidebarDrawer.addEventListener('toggle', (event) => {
      const isOpen = event.newState === 'open';
      setSidebarBgInert(isOpen && drawerQuery.matches);
      sidebarToggle?.setAttribute('aria-expanded', String(isOpen && drawerQuery.matches));
      if (isOpen) {
        const focusTarget = sidebarDrawer.querySelector(
          '.sidebar-link.is-active, .sidebar-link, .sidebar-close'
        );
        if (focusTarget instanceof HTMLElement) {
          focusTarget.focus();
        }
      } else if (
        drawerQuery.matches &&
        sidebarToggle &&
        (document.activeElement === null ||
          document.activeElement === document.body ||
          sidebarDrawer.contains(document.activeElement))
      ) {
        sidebarToggle.focus();
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

  // src/site/client/site/theme.ts
  function readStorage(key) {
    try {
      return localStorage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  }
  function writeStorage(key, value) {
    try {
      if (value === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    } catch {}
  }
  function sanitizeScheme(value) {
    return value === 'dark' || value === 'light' ? value : undefined;
  }
  function initThemeAndMotion(siteConfig, rootElement, reducedMotionQuery) {
    const schemeMeta = document.querySelector('meta[name="color-scheme"]');
    const themeColorMetas = document.querySelectorAll('meta[name="theme-color"]');
    const themeToggle = document.getElementById('theme-toggle');
    const previewBgToggle = document.getElementById('preview-bg-toggle');
    const darkSchemeQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
    function getSystemScheme() {
      return darkSchemeQuery.matches ? 'dark' : 'light';
    }
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
    function sanitizePreviewBg(value) {
      return typeof value === 'string' && siteConfig.previewBgValues.includes(value)
        ? value
        : siteConfig.previewBgValues[0];
    }
    function applyPreviewBg(previewBg) {
      const isInverse = previewBg !== siteConfig.previewBgValues[0];
      if (isInverse) {
        rootElement.setAttribute('data-preview-bg', previewBg);
      } else {
        rootElement.removeAttribute('data-preview-bg');
      }
      previewBgToggle?.setAttribute('aria-checked', String(isInverse));
    }
    function syncPreviewAnimations() {
      for (const previewSvg of document.querySelectorAll('.preview-stage svg')) {
        if (previewSvg instanceof SVGSVGElement) {
          if (reducedMotionQuery.matches) {
            previewSvg.pauseAnimations();
            previewSvg.setCurrentTime(Number(previewSvg.dataset.restTime) || 0);
          } else {
            previewSvg.unpauseAnimations();
          }
        }
      }
    }
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
    previewBgToggle?.addEventListener('click', () => {
      const currentPreviewBg = sanitizePreviewBg(readStorage(siteConfig.previewBgStorageKey));
      const nextPreviewBg =
        currentPreviewBg === siteConfig.previewBgValues[0]
          ? (siteConfig.previewBgValues[1] ?? siteConfig.previewBgValues[0])
          : siteConfig.previewBgValues[0];
      writeStorage(
        siteConfig.previewBgStorageKey,
        nextPreviewBg === siteConfig.previewBgValues[0] ? undefined : nextPreviewBg
      );
      applyPreviewBg(nextPreviewBg);
    });
    globalThis.addEventListener('storage', (event) => {
      if (event.key === siteConfig.schemeStorageKey) {
        applyScheme(sanitizeScheme(event.newValue));
      } else if (event.key === siteConfig.previewBgStorageKey) {
        applyPreviewBg(sanitizePreviewBg(event.newValue));
      }
    });
  }

  // src/site/client/site/index.ts
  function dispatchFallbackToggle(popover, newState) {
    popover.dispatchEvent(Object.assign(new Event('toggle'), { newState }));
  }
  function initSiteClient() {
    if (typeof document === 'undefined') {
      globalThis.svgSiteCore = { computePopoverPlacement };
      return;
    }
    const siteConfig = JSON.parse(document.getElementById('site-config')?.textContent ?? '{}');
    const rootElement = document.documentElement;
    const reducedMotionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    const drawerQuery = globalThis.matchMedia(siteConfig.drawerMediaQuery);
    const sidebarDrawer = document.getElementById('sidebar-drawer');
    const hasPopoverApi = 'popover' in HTMLElement.prototype;
    let activePopover = undefined;
    function isPopoverOpen(popover) {
      return hasPopoverApi
        ? popover.matches(':popover-open')
        : popover.classList.contains('is-open');
    }
    function openPopover(popover) {
      if (isPopoverOpen(popover)) {
        return;
      }
      if (hasPopoverApi) {
        popover.showPopover();
        return;
      }
      popover.classList.add('is-open');
      document
        .querySelector(`[popovertarget="${popover.id}"]`)
        ?.setAttribute('aria-expanded', 'true');
      dispatchFallbackToggle(popover, 'open');
    }
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
      dispatchFallbackToggle(popover, 'closed');
    }
    function placePopover(popover, anchor, options = {}) {
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
    globalThis.svgSite = { closePopover, copyText, isPopoverOpen, openPopover, placePopover };
    initThemeAndMotion(siteConfig, rootElement, reducedMotionQuery);
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
              if (isPopoverOpen(popover)) {
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
})();
