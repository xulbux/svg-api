/**
 * Theme, preview stage background & reduced-motion controller – Color-scheme toggle, preview stage inversion toggle, `localStorage` persistence, and SMIL animation pausing.
 */

import type { SiteClientConfig } from '@/site/client/site/types';

// -------------------------------------- INTERNALS --------------------------------------

/** Read a `localStorage` value (`undefined` when unset or unavailable). */
function readStorage(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Write or remove (`undefined`) a `localStorage` value, ignoring unavailable storage. */
function writeStorage(key: string, value: string | undefined): void {
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

/** Whitelist a stored color scheme; Only `'dark'` and `'light'` are ever written into the color-scheme meta tag. */
function sanitizeScheme(value: string | null | undefined): 'dark' | 'light' | undefined {
  return value === 'dark' || value === 'light' ? value : undefined;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Initialize the color-scheme toggle, preview background toggle, cross-tab `storage` listener, and `prefers-reduced-motion` SMIL sync.
 * @param siteConfig           Parsed `#site-config` JSON payload.
 * @param rootElement          Document root (`<html>`).
 * @param reducedMotionQuery   `prefers-reduced-motion: reduce` media query list.
 */
export function initThemeAndMotion(
  siteConfig: SiteClientConfig,
  rootElement: HTMLElement,
  reducedMotionQuery: MediaQueryList
): void {
  const schemeMeta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  const themeColorMetas = document.querySelectorAll('meta[name="theme-color"]');
  const themeToggle = document.getElementById('theme-toggle');
  const previewBgToggle = document.getElementById('preview-bg-toggle');
  const darkSchemeQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');

  function getSystemScheme(): 'dark' | 'light' {
    return darkSchemeQuery.matches ? 'dark' : 'light';
  }

  /**
   * Apply an explicit color scheme (or follow the system with `undefined`) to the color-scheme and
   * theme-color meta tags, and sync the theme switch state.
   */
  function applyScheme(storedScheme: 'dark' | 'light' | undefined): void {
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

  /** Whitelist a stored preview stage background (falls back to the first option). */
  function sanitizePreviewBg(value: string | null | undefined): string {
    return typeof value === 'string' && siteConfig.previewBgValues.includes(value)
      ? value
      : siteConfig.previewBgValues[0];
  }

  /** Apply a preview stage background to `<html data-preview-bg>` and sync the header toggle switch. */
  function applyPreviewBg(previewBg: string): void {
    const isInverse = previewBg !== siteConfig.previewBgValues[0];
    if (isInverse) {
      rootElement.setAttribute('data-preview-bg', previewBg);
    } else {
      rootElement.removeAttribute('data-preview-bg');
    }
    previewBgToggle?.setAttribute('aria-checked', String(isInverse));
  }

  /** Reduced motion: CSS cannot stop SMIL, so pause every inline preview SVG at its first frame. */
  function syncPreviewAnimations(): void {
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
