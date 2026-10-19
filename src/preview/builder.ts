/**
 * Builder pages – Renders the `/builder/:kind` URL builder pages: A schema-driven form, a live preview, copyable Markdown / HTML / URL snippets, and the searchable icon picker.
 *
 * The form is rendered from the builder schema (`src/routes/schema.ts`), which is also embedded as JSON
 * for the builder client script (`src/preview/scripts/builder.client.js`). Previews are plain `<img>`
 * requests to the live SVG routes, so the builder never duplicates rendering logic.
 */

import { getSiteAssetUrl } from '@/preview/assets';
import { renderSectionHeader, renderUiIcon, serializeInlineJson } from '@/preview/components';
import { renderPageLayout } from '@/preview/layout';
import {
  buildBuilderPath,
  buildBuilderSidebar,
  buildDocsPath,
  getBuilderPageMeta,
} from '@/preview/navigation';
import { getBuilderSchema } from '@/routes/schema';
import { escapeXml } from '@/svg/shared';
import type { BuilderField, BuilderKind, BuilderOption, BuilderSchema } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Snippet output format tab. */
interface SnippetFormat {
  /** Format identifier (`data-format`). */
  id: string;
  /** Visible tab label. */
  label: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Snippet output formats in tab order. */
const SNIPPET_FORMATS: readonly SnippetFormat[] = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'html', label: 'HTML' },
  { id: 'url', label: 'URL' },
];

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

/** Memoized icon picker popover HTML (`undefined` until first rendered). */
let iconPickerHtmlCache: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Build the DOM ID of a field control or one of its parts (e.g., `'field-icon-left'`). */
function buildFieldId(field: BuilderField, part?: string): string {
  return part ? `field-${field.id}-${part}` : `field-${field.id}`;
}

/** Render `<option>` elements, selecting `selectedValue`. */
function renderOptionsHtml(options: readonly BuilderOption[], selectedValue: string): string {
  let optionsHtml = '';
  for (const option of options) {
    const selectedAttr = option.value === selectedValue ? ' selected' : '';
    optionsHtml += `<option value="${escapeXml(option.value)}"${selectedAttr}>${escapeXml(option.label)}</option>`;
  }
  return optionsHtml;
}

/** Render the service options of the service badge builder (`<option value="npm">npm · npm</option>`). */
function buildServiceSelectOptions(schema: BuilderSchema): BuilderOption[] {
  const options: BuilderOption[] = [];
  for (const service of schema.services ?? []) {
    options.push({ label: `${service.title} (${service.key})`, value: service.key });
  }
  return options;
}

/** Resolve the options of a select field (service and metric options come from the service presets). */
function resolveSelectOptions(
  field: BuilderField,
  schema: BuilderSchema
): readonly BuilderOption[] {
  if (schema.kind === 'service' && field.id === 'service') {
    return buildServiceSelectOptions(schema);
  }
  if (schema.kind === 'service' && field.id === 'metric') {
    const initialService = schema.services?.find(
      (service) => service.key === schema.initialState.service
    );
    return initialService?.metrics ?? [];
  }
  return field.options ?? [];
}

/** Render an icon slug input with its picker button and glyph preview. */
function renderIconInputHtml(field: BuilderField, part: string, label: string): string {
  const inputId = buildFieldId(field, part);
  return `<div class="icon-input">
          <label class="builder-sublabel" for="${inputId}">${escapeXml(label)}</label>
          <div class="icon-input-row">
            <span class="icon-input-glyph" aria-hidden="true" data-glyph-for="${inputId}"></span>
            <input class="builder-input" id="${inputId}" type="text" data-part="${part}" spellcheck="false" autocapitalize="off" placeholder="${escapeXml(field.placeholder ?? 'none')}" />
            <button type="button" class="icon-picker-btn" data-icon-target="${inputId}" popovertarget="icon-picker" aria-label="Browse icons for ${escapeXml(label.toLowerCase())}" title="Browse icons">${renderUiIcon('layout-grid', 15)}</button>
          </div>
          <p class="builder-hint builder-validation" data-validation-for="${inputId}" aria-live="polite"></p>
        </div>`;
}

/** Render the swatch radio group of a `color` field. */
function renderColorControlHtml(field: BuilderField, selectedValue: string): string {
  let swatchesHtml = '';
  for (const option of field.options ?? []) {
    const checkedAttr = option.value === selectedValue ? ' checked' : '';
    const swatchStyle = option.swatch ? ` style="--swatch: ${escapeXml(option.swatch)}"` : '';
    const label = option.value ? option.label : 'Default';
    swatchesHtml += `<label class="swatch" title="${escapeXml(label)}"><input class="swatch-input" type="radio" name="${buildFieldId(field)}" value="${escapeXml(option.value)}"${checkedAttr} /><span class="swatch-dot${option.value ? '' : ' is-default'}"${swatchStyle} aria-hidden="true"></span><span class="visually-hidden">${escapeXml(label)}</span></label>`;
  }
  return `<div class="swatch-grid" role="radiogroup" aria-labelledby="${buildFieldId(field)}-label">${swatchesHtml}</div>`;
}

/** Render the motion `<select>` of an `anim` field part. */
function renderMotionSelectHtml(field: BuilderField, part: string, label: string): string {
  const selectId = buildFieldId(field, part);
  return `<div class="builder-subfield">
          <label class="builder-sublabel" for="${selectId}">${escapeXml(label)}</label>
          <select class="builder-input builder-select" id="${selectId}" data-part="${part}">${renderOptionsHtml(field.options ?? [], '')}</select>
        </div>`;
}

/** Render the composite controls of an `anim` field (sheen toggle plus motion selects). */
function renderAnimControlHtml(field: BuilderField): string {
  const sheenId = buildFieldId(field, 'sheen');
  let motionsHtml = '';
  if (field.animScope === 'pair') {
    motionsHtml =
      renderMotionSelectHtml(field, 'left', 'Left icon motion') +
      renderMotionSelectHtml(field, 'right', 'Right icon motion');
  } else if (field.animScope === 'single') {
    motionsHtml = renderMotionSelectHtml(field, 'left', 'Icon motion');
  }
  return `<div class="builder-composite">
          <label class="builder-check" for="${sheenId}"><input type="checkbox" id="${sheenId}" data-part="sheen" /><span>Surface sheen</span></label>
          ${motionsHtml ? `<div class="builder-inline">${motionsHtml}</div>` : ''}
        </div>`;
}

/** Render the composite controls of a `special` field (widget kind, payload, and modifier). */
function renderSpecialControlHtml(field: BuilderField): string {
  return `<div class="builder-inline">
          <div class="builder-subfield">
            <label class="builder-sublabel" for="${buildFieldId(field, 'kind')}">Widget</label>
            <select class="builder-input builder-select" id="${buildFieldId(field, 'kind')}" data-part="kind">${renderOptionsHtml(field.options ?? [], '')}</select>
          </div>
          <div class="builder-subfield is-grow" data-special-part="payload">
            <label class="builder-sublabel" for="${buildFieldId(field, 'payload')}">Data</label>
            <input class="builder-input" id="${buildFieldId(field, 'payload')}" type="text" data-part="payload" spellcheck="false" />
          </div>
          <div class="builder-subfield" data-special-part="modifier">
            <label class="builder-sublabel" for="${buildFieldId(field, 'modifier')}">Motion</label>
            <select class="builder-input builder-select" id="${buildFieldId(field, 'modifier')}" data-part="modifier"></select>
          </div>
        </div>`;
}

/** Render the composite controls of a `size` field (named preset or custom number). */
function renderSizeControlHtml(field: BuilderField): string {
  const presetId = buildFieldId(field, 'preset');
  const customId = buildFieldId(field, 'custom');
  const options: BuilderOption[] = [
    ...(field.options ?? []),
    { label: 'Custom…', value: 'custom' },
  ];
  return `<div class="builder-inline">
          <div class="builder-subfield is-grow">
            <label class="builder-sublabel" for="${presetId}">Preset</label>
            <select class="builder-input builder-select" id="${presetId}" data-part="preset">${renderOptionsHtml(options, '')}</select>
          </div>
          <div class="builder-subfield" data-size-part="custom" hidden>
            <label class="builder-sublabel" for="${customId}">Pixels</label>
            <input class="builder-input" id="${customId}" type="number" data-part="custom" min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}" placeholder="${escapeXml(field.placeholder ?? '')}" inputmode="decimal" />
          </div>
        </div>`;
}

/** Render the control(s) of a builder field. */
function renderFieldControlHtml(field: BuilderField, schema: BuilderSchema): string {
  const controlId = buildFieldId(field);
  const initialValue = schema.initialState[field.id] ?? '';
  const placeholderAttr = field.placeholder ? ` placeholder="${escapeXml(field.placeholder)}"` : '';
  const maxLengthAttr = field.maxLength ? ` maxlength="${field.maxLength}"` : '';
  const requiredAttr = field.isRequired ? ' aria-required="true"' : '';
  switch (field.control) {
    case 'anim': {
      return renderAnimControlHtml(field);
    }
    case 'color': {
      return renderColorControlHtml(field, initialValue);
    }
    case 'icon': {
      return renderIconInputHtml(field, 'main', 'Slug');
    }
    case 'iconPair': {
      return `<div class="builder-inline is-pair">${renderIconInputHtml(field, 'left', 'Left icon')}${renderIconInputHtml(field, 'right', 'Right icon')}</div>`;
    }
    case 'number': {
      return `<input class="builder-input" id="${controlId}" type="number" min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}" value="${escapeXml(initialValue)}"${placeholderAttr} inputmode="decimal" />`;
    }
    case 'select': {
      return `<select class="builder-input builder-select" id="${controlId}"${requiredAttr}>${renderOptionsHtml(resolveSelectOptions(field, schema), initialValue)}</select>`;
    }
    case 'size': {
      return renderSizeControlHtml(field);
    }
    case 'special': {
      return renderSpecialControlHtml(field);
    }
    case 'stackGroups': {
      return `<textarea class="builder-input builder-textarea is-mono" id="${controlId}" rows="4" spellcheck="false"${requiredAttr}>${escapeXml(initialValue)}</textarea>
        <div class="builder-field-actions">
          <button type="button" class="btn-secondary btn-small icon-picker-btn" data-icon-target="${controlId}" data-icon-insert="true" popovertarget="icon-picker">${renderUiIcon('layout-grid', 14)}<span class="btn-label">Insert icon</span></button>
        </div>
        <p class="builder-hint builder-validation" data-validation-for="${controlId}" aria-live="polite"></p>`;
    }
    case 'textarea': {
      return `<textarea class="builder-input builder-textarea" id="${controlId}" rows="4"${maxLengthAttr}${placeholderAttr}${requiredAttr}>${escapeXml(initialValue)}</textarea>`;
    }
    default: {
      return `<input class="builder-input" id="${controlId}" type="text" value="${escapeXml(initialValue)}"${maxLengthAttr}${placeholderAttr}${requiredAttr} spellcheck="false" />`;
    }
  }
}

/** Check whether a field renders a single labelable control (`<label for>`), as opposed to a group of parts. */
function hasSingleControl(field: BuilderField): boolean {
  return ['number', 'select', 'stackGroups', 'text', 'textarea'].includes(field.control);
}

/** Render one builder field with its label, control(s), and help text. */
function renderFieldHtml(field: BuilderField, schema: BuilderSchema): string {
  const controlId = buildFieldId(field);
  const requiredMark = field.isRequired
    ? '<span class="builder-required" aria-hidden="true">*</span>'
    : '';
  const paramHtml = field.param
    ? `<code class="builder-param">?${escapeXml(field.param)}=</code>`
    : '';
  const labelHtml = hasSingleControl(field)
    ? `<label class="builder-label" id="${controlId}-label" for="${controlId}">${escapeXml(field.label)}${requiredMark}</label>`
    : `<span class="builder-label" id="${controlId}-label">${escapeXml(field.label)}${requiredMark}</span>`;
  const showAttrs = field.showWhen
    ? ` data-show-field="${escapeXml(field.showWhen.field)}" data-show-values="${escapeXml(field.showWhen.values.join(' '))}"`
    : '';
  const isGroup = !hasSingleControl(field);
  const groupAttrs = isGroup ? ` role="group" aria-labelledby="${controlId}-label"` : '';
  const descriptionHtml = field.description
    ? `<p class="builder-hint">${escapeXml(field.description)}</p>`
    : '';
  return `<div class="builder-field" data-field="${escapeXml(field.id)}" data-control="${field.control}"${showAttrs}${groupAttrs}>
        <div class="builder-label-row">${labelHtml}${paramHtml}</div>
        ${renderFieldControlHtml(field, schema)}
        ${descriptionHtml}
      </div>`;
}

/** Render (once per isolate) the shared icon picker popover (tabs, search, and the lazily filled grid). */
function renderIconPickerHtml(): string {
  if (iconPickerHtmlCache !== undefined) {
    return iconPickerHtmlCache;
  }
  const tabs: readonly SnippetFormat[] = [
    { id: 'all', label: 'All' },
    { id: 'lucide', label: 'Lucide' },
    { id: 'brands', label: 'Brands' },
  ];
  let tabsHtml = '';
  for (let i = 0; i < tabs.length; i += 1) {
    const checkedAttr = i === 0 ? ' checked' : '';
    tabsHtml += `<label class="icon-picker-tab"><input type="radio" name="icon-picker-set" value="${tabs[i].id}"${checkedAttr} /><span>${tabs[i].label}</span></label>`;
  }
  iconPickerHtmlCache = `<div class="icon-picker" id="icon-picker" popover data-index-url="${getSiteAssetUrl('icons.json')}" aria-label="Icon picker">
    <div class="icon-picker-head">
      <div class="icon-picker-search">
        ${renderUiIcon('search', 15)}
        <input class="icon-picker-input" id="icon-picker-search" type="search" placeholder="Search icons…" aria-label="Search icons" spellcheck="false" autocomplete="off" />
      </div>
      <div class="icon-picker-tabs" role="radiogroup" aria-label="Icon set">${tabsHtml}</div>
    </div>
    <div class="icon-picker-grid" id="icon-picker-grid" role="listbox" aria-label="Icons" tabindex="-1"></div>
    <p class="icon-picker-foot" id="icon-picker-status" aria-live="polite">Loading icons…</p>
  </div>`;
  return iconPickerHtmlCache;
}

/** Render the preview, snippet, and action panel. */
function renderOutputPanelHtml(kind: BuilderKind): string {
  let tabsHtml = '';
  for (let i = 0; i < SNIPPET_FORMATS.length; i += 1) {
    const format = SNIPPET_FORMATS[i];
    const isSelected = i === 0;
    tabsHtml += `<button type="button" class="builder-tab${isSelected ? ' is-active' : ''}" role="tab" id="builder-tab-${format.id}" data-format="${format.id}" aria-selected="${isSelected}" aria-controls="builder-code" tabindex="${isSelected ? 0 : -1}">${format.label}</button>`;
  }
  const copyIcon = renderUiIcon('copy', 13, 'icon-copy');
  const checkIcon = renderUiIcon('check', 13, 'icon-check');
  const docsHref = buildDocsPath(BUILDER_DOCS_SLUGS[kind]);
  return `<aside class="builder-panel" aria-label="Preview and snippets">
      <div class="builder-panel-inner">
        <div class="preview-stage builder-stage is-centered">
          <img class="builder-preview" id="builder-preview" alt="Live preview" decoding="async" hidden />
          <p class="builder-placeholder" id="builder-placeholder">Fill in the required fields to see a preview.</p>
        </div>
        <p class="builder-status" id="builder-status" role="status" aria-live="polite"></p>
        <div class="builder-output">
          <div class="builder-tabs" role="tablist" aria-label="Snippet format">${tabsHtml}</div>
          <div class="code-drawer-body builder-code-body">
            <div class="code-drawer-toolbar">
              <span class="code-drawer-label" id="builder-code-label">Snippet</span>
              <div class="code-toolbar-actions">
                <button type="button" class="copy-btn" data-copy-target="builder-code" aria-describedby="builder-code-label">${copyIcon}${checkIcon}<span class="copy-btn-text" aria-live="polite">Copy</span></button>
              </div>
            </div>
            <div class="code-pre-wrap">
              <pre class="code-pre builder-code" id="builder-code" tabindex="0" role="tabpanel" aria-labelledby="builder-tab-markdown"><code></code></pre>
            </div>
          </div>
          <div class="builder-snippet-options">
            <div class="builder-subfield is-grow">
              <label class="builder-sublabel" for="builder-alt">Alt text</label>
              <input class="builder-input" id="builder-alt" type="text" spellcheck="false" />
            </div>
            <div class="builder-subfield is-grow">
              <label class="builder-sublabel" for="builder-link">Link target</label>
              <input class="builder-input" id="builder-link" type="url" placeholder="https://…" spellcheck="false" />
            </div>
          </div>
          <div class="builder-actions">
            <a class="btn-secondary btn-small" id="builder-open" href="#" target="_blank" rel="noopener noreferrer">${renderUiIcon('external-link', 14)}<span class="btn-label">Open SVG</span></a>
            <button type="button" class="btn-secondary btn-small" id="builder-share">${renderUiIcon('link', 14)}<span class="btn-label" id="builder-share-label">Copy builder link</span></button>
            <button type="button" class="btn-secondary btn-small" id="builder-reset">${renderUiIcon('rotate-ccw', 14)}<span class="btn-label">Reset</span></button>
            <a class="btn-secondary btn-small" href="${docsHref}">${renderUiIcon('book-open', 14)}<span class="btn-label">Reference</span></a>
          </div>
        </div>
      </div>
    </aside>`;
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
  const meta = getBuilderPageMeta(kind);
  const schema = getBuilderSchema(kind);
  let fieldsHtml = '';
  for (const field of schema.fields) {
    fieldsHtml += renderFieldHtml(field, schema);
  }

  const bodyHtml = `<section class="doc-section builder" id="builder" data-builder-kind="${kind}">
    ${renderSectionHeader({
      description: `${meta.description} Click any preview in the docs to open it here.`,
      title: meta.title,
    })}
    <div class="builder-grid">
      <form class="builder-form" id="builder-form" autocomplete="off" novalidate>
        ${fieldsHtml}
      </form>
      ${renderOutputPanelHtml(kind)}
    </div>
  </section>
  ${renderIconPickerHtml()}`;

  const html = renderPageLayout({
    activeNav: 'builder',
    bodyHtml,
    canonicalPath: buildBuilderPath(kind),
    description: meta.description,
    extraBodyHtml: `<script type="application/json" id="builder-schema">${serializeInlineJson(schema)}</script>
  <script src="${getSiteAssetUrl('builder.js')}" defer></script>`,
    sidebar: buildBuilderSidebar(kind),
    title: `${meta.title} · svg.xul.is`,
  });
  BUILDER_HTML_CACHE.set(kind, html);
  return html;
}
