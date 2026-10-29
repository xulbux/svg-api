/**
 * Builder page – Renders the `/builder/:kind` URL builder pages.
 */

import { SITE_NAME, SITE_ORIGIN } from '@/config/site';
import { getBuilderSchema } from '@/routes/schema';
import { getSiteAssetUrl } from '@/site/assets';
import { BuilderFieldView } from '@/site/components/BuilderControls';
import { BuilderOutputPanel } from '@/site/components/BuilderOutputPanel';
import { IconPickerPopover } from '@/site/components/IconPickerPopover';
import { PageLayout } from '@/site/components/PageLayout';
import { SectionHeader } from '@/site/components/SectionHeader';
import { serializeInlineJson, UiIcon } from '@/site/components/UiIcon';
import { raw, renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';
import {
  buildBuilderPath,
  buildBuilderSidebar,
  buildDocsPath,
  getBuilderPageMeta,
} from '@/site/navigation';
import { buildBuilderJsonLd } from '@/site/seo';
import type { BuilderKind } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the `<BuilderPage />` component. */
interface BuilderPageProps {
  /** Builder element kind. */
  readonly kind: BuilderKind;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Memoized builder pages keyed by element kind. */
const BUILDER_HTML_CACHE = new Map<BuilderKind, string>();

/** Memoized import URL/snippet dialog popover HTML (`undefined` until first rendered). */
let importPopoverHtmlCache: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Render (once per isolate) the shared URL/snippet import dialog popover HTML. */
function renderImportPopoverHtml(): string {
  importPopoverHtmlCache ??= renderHtml(
    <div
      class="popover-panel builder-import-popover"
      id="builder-import-popover"
      popover={true}
      role="dialog"
      aria-labelledby="builder-import-title">
      <div class="stack-help-head">
        <p class="stack-help-title" id="builder-import-title">
          Import URL or snippet
        </p>
        <p class="stack-help-desc" id="builder-import-desc">
          Paste an SVG URL, Markdown/HTML snippet (including linked images), or builder link to load
          its settings, alt text, and link target.
        </p>
      </div>
      <form
        class="builder-import-form"
        id="builder-import-form"
        autocomplete="off"
        novalidate={true}>
        <div class="builder-import-row">
          <input
            class="builder-input"
            id="builder-import-input"
            type="text"
            placeholder={`${SITE_ORIGIN}/…`}
            aria-label="SVG URL or snippet"
            aria-describedby="builder-import-desc"
            spellcheck={false}
            autocomplete="off"
          />
          <button type="submit" class="btn-primary btn-small" id="builder-import-submit">
            Load
          </button>
        </div>
        <p
          class="builder-hint is-warning builder-validation"
          id="builder-import-error"
          role="alert"></p>
      </form>
    </div>
  );
  return importPopoverHtmlCache;
}

/** Render the URL builder page of an element kind as a JSX component. */
function BuilderPage(props: BuilderPageProps): HtmlFragment {
  const { kind } = props;
  const meta = getBuilderPageMeta(kind);
  const schema = getBuilderSchema(kind);
  const fieldViews: HtmlFragment[] = [];
  for (const field of schema.fields) {
    fieldViews.push(<BuilderFieldView field={field} schema={schema} />);
  }
  const docsHref = buildDocsPath(meta.docsSlug);
  const canonicalPath = buildBuilderPath(kind);
  const pageTitle = `${meta.title} · ${SITE_NAME}`;
  const headerActions = (
    <div class="section-actions">
      <button
        type="button"
        class="section-action"
        id="builder-import-trigger"
        popovertarget="builder-import-popover"
        aria-expanded="false"
        aria-controls="builder-import-popover">
        <UiIcon slug="import" size={14} />
        Import
      </button>
      <a class="section-action" href={docsHref} tabindex="0">
        <UiIcon slug="book-open" size={14} />
        Reference
      </a>
    </div>
  );
  const extraBody = (
    <>
      <script type="application/json" id="builder-schema">
        {raw(serializeInlineJson(schema))}
      </script>
      {'\n  '}
      <script src={getSiteAssetUrl('builder.js')} defer={true}></script>
    </>
  );

  return (
    <PageLayout
      activeNav="builder"
      canonicalPath={canonicalPath}
      description={meta.description}
      extraBody={extraBody}
      jsonLd={buildBuilderJsonLd(meta.title, meta.description, canonicalPath)}
      sidebar={buildBuilderSidebar(kind)}
      title={pageTitle}>
      <section class="doc-section builder" id="builder" data-builder-kind={kind}>
        <SectionHeader action={headerActions} description={meta.description} title={meta.title} />
        <div class="builder-grid">
          <form class="builder-form" id="builder-form" autocomplete="off" novalidate={true}>
            {fieldViews}
          </form>
          <BuilderOutputPanel />
        </div>
      </section>
      {raw(renderImportPopoverHtml())}
      <IconPickerPopover />
    </PageLayout>
  );
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render (once per isolate) the URL builder page of an element kind.
 * @param kind   Builder element kind.
 * @returns Complete HTML document string.
 */
export function renderBuilderHtml(kind: BuilderKind): string {
  const cached = BUILDER_HTML_CACHE.get(kind);
  if (cached !== undefined) {
    return cached;
  }
  const html = renderHtml(<BuilderPage kind={kind} />);
  BUILDER_HTML_CACHE.set(kind, html);
  return html;
}
