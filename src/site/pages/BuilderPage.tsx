/**
 * Builder page – Renders the `/builder/:kind` URL builder pages.
 */

import { SITE_HOST } from '@/config/site';
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

// -------------------------------------- INTERNALS --------------------------------------

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
  const pageTitle = `${meta.title} · ${SITE_HOST}`;
  const referenceAction = (
    <a class="section-action" href={docsHref} tabindex="0">
      <UiIcon slug="book-open" size={14} />
      Reference
    </a>
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
      jsonLd={buildBuilderJsonLd(pageTitle, meta.description, canonicalPath, meta.title)}
      sidebar={buildBuilderSidebar(kind)}
      title={pageTitle}>
      <section class="doc-section builder" id="builder" data-builder-kind={kind}>
        <SectionHeader action={referenceAction} description={meta.description} title={meta.title} />
        <div class="builder-grid">
          <form class="builder-form" id="builder-form" autocomplete="off" novalidate={true}>
            {fieldViews}
          </form>
          <BuilderOutputPanel />
        </div>
      </section>
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
