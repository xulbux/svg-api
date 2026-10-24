/**
 * HTTP status error pages – Branded `noindex` HTML error pages for unmatched site paths and unexpected server errors.
 */

import { SITE_HOST } from '@/config/site';
import { PageLayout } from '@/site/components/PageLayout';
import { UiIcon } from '@/site/components/UiIcon';
import { renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the shared `<StatusPage />` component. */
interface StatusPageProps {
  /** Numeric HTTP status code rendered in the accent color. */
  readonly code: number;
  /** Meta description for the document `<head>`. */
  readonly description: string;
  /** Primary status heading rendered next to `code`. */
  readonly heading: string;
  /** Concise explanation shown below the status heading. */
  readonly message: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Memoized `404` HTML document (`undefined` until first rendered). */
let notFoundHtmlCache: string | undefined = undefined;

/** Memoized `500` HTML document (`undefined` until first rendered). */
let serverErrorHtmlCache: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Render a branded `noindex` HTTP status page with an accent status code and a `Back to Home` button. */
function StatusPage(props: StatusPageProps): HtmlFragment {
  const { code, description, heading, message } = props;
  return (
    <PageLayout
      activeNav="none"
      description={description}
      isNoIndex={true}
      title={`${code} ${heading} · ${SITE_HOST}`}>
      <section class="hero">
        <h1 class="hero-title">
          <span class="hero-accent">{code}</span> {heading}
        </h1>
        <p class="hero-lead">{message}</p>
        <div class="hero-cta-row">
          <a href="/" class="btn-primary" tabindex="0">
            <UiIcon slug="arrow-left" size={16} />
            Back to Home
          </a>
        </div>
      </section>
    </PageLayout>
  );
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render (once per isolate) the branded `404 Page Not Found` HTML document.
 * @returns Complete HTML document string.
 */
export function renderNotFoundHtml(): string {
  notFoundHtmlCache ??= renderHtml(
    <StatusPage
      code={404}
      description={`The requested page could not be found on ${SITE_HOST}.`}
      heading="Page Not Found"
      message="The page you requested doesn't exist or may have been moved."
    />
  );
  return notFoundHtmlCache;
}

/**
 * Render (once per isolate) the branded `500 Internal Server Error` HTML document.
 * @returns Complete HTML document string.
 */
export function renderServerErrorHtml(): string {
  serverErrorHtmlCache ??= renderHtml(
    <StatusPage
      code={500}
      description={`An unexpected server error occurred on ${SITE_HOST}.`}
      heading="Internal Server Error"
      message="Something went wrong while loading this page. Please try again in a moment."
    />
  );
  return serverErrorHtmlCache;
}
