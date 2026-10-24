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

// -------------------------------------- INTERNALS --------------------------------------

/** Render (once per isolate) the site footer HTML. */
function renderFooter(): string {
  if (footerHtmlCache === undefined) {
    footerHtmlCache = renderHtml(
      <footer class="site-footer">
        <div class="footer-inner">
          <p class="footer-feedback">
            Missing a service, icon, or SVG element? Reach out at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} class="text-link" tabindex="0">
              {CONTACT_EMAIL}
            </a>
            .
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

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the site footer as a JSX component.
 * @returns Rendered `<footer class="site-footer">` JSX fragment.
 */
export function Footer(): HtmlFragment {
  return raw(renderFooter());
}
