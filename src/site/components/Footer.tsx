/**
 * Footer component – Shared site footer (`<Footer />`) with feedback mailto link, MIT license notice, and author credit.
 */

import { AUTHOR_GITHUB_URL, AUTHOR_NAME, CONTACT_EMAIL } from '@/config/site';
import { UiIcon } from '@/site/components/UiIcon';
import { raw, renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';

// ---------------------------------------- CONSTS ---------------------------------------

/** Memoized footer HTML (`undefined` until first rendered). */
let footerHtmlCache: string | undefined = undefined;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render (once per isolate) the site footer.
 * @returns Footer HTML string.
 */
export function renderFooter(): string {
  if (footerHtmlCache === undefined) {
    footerHtmlCache = renderHtml(
      <footer class="site-footer">
        <div class="footer-inner">
          <p class="footer-feedback">
            Missing a public API service, vector icon, or even a whole new SVG element? Feel free to{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} class="text-link" tabindex="0">
              send an email to {CONTACT_EMAIL}
            </a>{' '}
            and let me know!
          </p>
          <div class="footer-meta">
            <p class="footer-license">Released under the MIT License.</p>
            <p class="footer-credit">
              <UiIcon slug="sparkles" size={14} extraClass="footer-sparkle" />
              From{' '}
              <a
                href={AUTHOR_GITHUB_URL}
                class="text-link"
                target="_blank"
                rel="noopener noreferrer"
                tabindex="0">
                <b>{AUTHOR_NAME}</b>
              </a>
              <UiIcon slug="sparkles" size={14} extraClass="footer-sparkle" />
            </p>
          </div>
        </div>
      </footer>
    );
  }
  return footerHtmlCache;
}

/**
 * Render the site footer as a JSX component.
 * @returns Rendered `<footer class="site-footer">` JSX fragment.
 */
export function Footer(): HtmlFragment {
  return raw(renderFooter());
}
