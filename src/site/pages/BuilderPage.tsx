/**
 * Builder page – Renders the `/builder/:kind` URL builder pages (`<BuilderPage />` and `renderBuilderHtml`).
 */

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
import type { BuilderKind } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the `<BuilderPage />` component. */
export interface BuilderPageProps {
  /** Builder element kind. */
  readonly kind: BuilderKind;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Documentation page linked from each builder (parameter reference). */
const BUILDER_DOCS_SLUGS = {
  badge: 'badges',
  button: 'buttons',
  icon: 'icons',
  quote: 'quotes',
  service: 'services',
  stack: 'stack',
} as const satisfies Readonly<Record<BuilderKind, string>>;

/** Memoized builder pages keyed by element kind. */
const BUILDER_HTML_CACHE = new Map<BuilderKind, string>();

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the URL builder page of an element kind as a JSX component.
 * @param props   Builder page props (`kind`).
 * @returns Complete builder page JSX document fragment.
 */
export function BuilderPage(props: BuilderPageProps): HtmlFragment {
  const { kind } = props;
  const meta = getBuilderPageMeta(kind);
  const schema = getBuilderSchema(kind);
  const fieldViews: HtmlFragment[] = [];
  for (const field of schema.fields) {
    fieldViews.push(<BuilderFieldView field={field} schema={schema} />);
  }
  const docsHref = buildDocsPath(BUILDER_DOCS_SLUGS[kind]);
  const referenceHtml = renderHtml(
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
      canonicalPath={buildBuilderPath(kind)}
      description={meta.description}
      extraBody={extraBody}
      sidebar={buildBuilderSidebar(kind)}
      title={`${meta.title} · svg.xul.is`}>
      <section class="doc-section builder" id="builder" data-builder-kind={kind}>
        <SectionHeader
          actionHtml={referenceHtml}
          description={`${meta.description} Click any preview in the docs to open it here.`}
          title={meta.title}
        />
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
