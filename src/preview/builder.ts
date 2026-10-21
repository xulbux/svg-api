/**
 * Builder pages – Renders the `/builder/:kind` URL builder pages: A schema-driven form, a live preview, copyable Markdown / HTML / URL snippets, and the searchable icon picker.
 *
 * The form is rendered from the builder schema (`src/routes/schema.ts`), which is also embedded as JSON
 * for the builder client script (`src/preview/scripts/builder.client.js`). Previews are plain `<img>`
 * requests to the live SVG routes, so the builder never duplicates rendering logic.
 */

import { STACK_CATEGORIES } from '@/config/stack';
import { getSiteAssetUrl } from '@/preview/assets';
import {
  BRAND_FILL_ATTRS,
  LUCIDE_STROKE_ATTRS,
  renderCopyButton,
  renderSectionHeader,
  renderUiIcon,
  serializeInlineJson,
} from '@/preview/components';
import { renderPageLayout } from '@/preview/layout';
import {
  buildBuilderPath,
  buildBuilderSidebar,
  buildDocsPath,
  getBuilderPageMeta,
} from '@/preview/navigation';
import { getBuilderSchema } from '@/routes/schema';
import { escapeXml } from '@/svg/shared';
import type {
  BuilderControl,
  BuilderField,
  BuilderKind,
  BuilderOption,
  BuilderSchema,
  IconPickerSetId,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Snippet output format tab. */
interface SnippetFormat {
  /** Format identifier (`data-format`). */
  id: string;
  /** Visible tab label. */
  label: string;
}

/** Icon set tab of the icon picker. */
interface IconPickerTab {
  /** Tab value (`'all'` or an icon set). */
  id: IconPickerSetId | 'all';
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

/** Icon set tabs of the icon picker in display order (the first one is selected initially). */
const ICON_PICKER_TABS: readonly IconPickerTab[] = [
  { id: 'all', label: 'All' },
  { id: 'lucide', label: 'Lucide' },
  { id: 'brands', label: 'Brands' },
];

/** SVG paint attributes of icon picker glyphs per set (cloned from `<template>` elements by the builder script). */
const GLYPH_PAINT_ATTRS: Readonly<Record<IconPickerSetId, string>> = {
  brands: BRAND_FILL_ATTRS,
  lucide: LUCIDE_STROKE_ATTRS,
};

/** Documentation page linked from each builder (parameter reference). */
const BUILDER_DOCS_SLUGS = {
  badge: 'badges',
  button: 'buttons',
  icon: 'icons',
  quote: 'quotes',
  service: 'services',
  stack: 'stack',
} as const satisfies Readonly<Record<BuilderKind, string>>;

/** Controls that render a single labelable form control (`<label for>`), as opposed to a group of parts. */
const SINGLE_CONTROL_TYPES: ReadonlySet<BuilderControl> = new Set<BuilderControl>([
  'number',
  'stackGroups',
  'text',
  'textarea',
]);

/** Controls labeled directly (dropdown and icon triggers, the color radiogroup) instead of as a labeled group. */
const SELF_LABELED_CONTROL_TYPES: ReadonlySet<BuilderControl> = new Set<BuilderControl>([
  'color',
  'icon',
  'select',
]);

/** Number of options above which a dropdown gets a search field (e.g., the service presets). */
const SEARCHABLE_OPTION_COUNT = 12;

/** Memoized builder pages keyed by element kind. */
const BUILDER_HTML_CACHE = new Map<BuilderKind, string>();

/** Memoized icon picker popover HTML (`undefined` until first rendered). */
let iconPickerHtmlCache: string | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Build the DOM ID of a field control or one of its parts (e.g., `'field-icon-left'`). */
function buildFieldId(field: BuilderField, part?: string): string {
  return part ? `field-${field.id}-${part}` : `field-${field.id}`;
}

/** Render `<option>` elements (with optional `data-swatch` colors), selecting `selectedValue`. */
function renderOptionsHtml(options: readonly BuilderOption[], selectedValue: string): string {
  let optionsHtml = '';
  for (const option of options) {
    const selectedAttr = option.value === selectedValue ? ' selected' : '';
    const swatchAttr = option.swatch ? ` data-swatch="${escapeXml(option.swatch)}"` : '';
    optionsHtml += `<option value="${escapeXml(option.value)}"${swatchAttr}${selectedAttr}>${escapeXml(option.label)}</option>`;
  }
  return optionsHtml;
}

/**
 * Render a custom dropdown: A visually hidden native `<select>` (the form state read by the builder
 * script) and a trigger that opens an anchored listbox popover (filled by the builder script).
 * Dropdowns with more than `SEARCHABLE_OPTION_COUNT` options get a search field.
 */
function renderSelectHtml(
  selectId: string,
  labelId: string,
  options: readonly BuilderOption[],
  selectedValue: string,
  part?: string
): string {
  const selected = options.find((option) => option.value === selectedValue) ?? options[0];
  const partAttr = part ? ` data-part="${part}"` : '';
  const swatchHtml = selected?.swatch
    ? `<span class="select-swatch" aria-hidden="true" style="--swatch: ${escapeXml(selected.swatch)}"></span>`
    : '<span class="select-swatch" aria-hidden="true" hidden></span>';
  const searchHtml =
    options.length > SEARCHABLE_OPTION_COUNT
      ? `<div class="select-search">${renderUiIcon('search', 14)}<input class="select-search-input" type="search" placeholder="Search…" aria-label="Search options" spellcheck="false" autocomplete="off" /></div>`
      : '';
  return `<div class="select" data-select="${selectId}">
            <select class="select-native" id="${selectId}"${partAttr} tabindex="-1" aria-hidden="true">${renderOptionsHtml(options, selectedValue)}</select>
            <button type="button" class="builder-input select-trigger" id="${selectId}-trigger" popovertarget="${selectId}-menu" aria-haspopup="listbox" aria-labelledby="${labelId} ${selectId}-value">${swatchHtml}<span class="select-value" id="${selectId}-value">${escapeXml(selected?.label ?? '')}</span>${renderUiIcon('chevron-down', 14, 'select-chevron')}</button>
            <div class="popover-panel select-menu" id="${selectId}-menu" popover>
              ${searchHtml}
              <div class="select-options" role="listbox" aria-labelledby="${labelId}"></div>
            </div>
          </div>`;
}

/** Render the service options of the service badge builder (`PyPI (pypi)`). */
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

/**
 * Render an icon selector: A trigger showing the current glyph and slug that opens the icon picker
 * (the slug is stored in a hidden input), plus a clear button. Icon pair parts get a sublabel; A single icon
 * selector is labeled by its field label.
 */
function renderIconSelectHtml(field: BuilderField, part: string, sublabel?: string): string {
  const inputId = buildFieldId(field, part);
  const placeholder = field.placeholder ?? 'none';
  const noneAttr = field.hasPresetValue ? ' data-icon-none="true"' : '';
  const labelId = sublabel ? `${inputId}-label` : `${buildFieldId(field)}-label`;
  const sublabelHtml = sublabel
    ? `<span class="builder-sublabel" id="${labelId}">${escapeXml(sublabel)}</span>`
    : '';
  const clearLabel = (sublabel ?? field.label).toLowerCase();
  return `<div class="icon-input">
          ${sublabelHtml}
          <div class="icon-select">
            <input type="hidden" id="${inputId}" data-part="${part}" />
            <button type="button" class="builder-input icon-select-trigger" data-icon-target="${inputId}"${noneAttr} popovertarget="icon-picker" aria-haspopup="dialog" aria-labelledby="${labelId} ${inputId}-value">
              <span class="icon-input-glyph" aria-hidden="true" data-glyph-for="${inputId}"></span>
              <span class="icon-select-value is-placeholder" id="${inputId}-value" data-placeholder="${escapeXml(placeholder)}">${escapeXml(placeholder)}</span>
              ${renderUiIcon('layout-grid', 14, 'icon-select-grid')}
            </button>
            <button type="button" class="icon-select-clear" data-icon-clear="${inputId}" aria-label="Clear ${escapeXml(clearLabel)}" title="Clear" hidden>${renderUiIcon('x', 14)}</button>
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

/** Render a labeled dropdown part of a composite field (e.g., an icon motion or the widget kind). */
function renderSubSelectHtml(
  field: BuilderField,
  part: string,
  label: string,
  options: readonly BuilderOption[],
  extraClass = ''
): string {
  const selectId = buildFieldId(field, part);
  const partAttr = part === 'modifier' ? ' data-special-part="modifier"' : '';
  return `<div class="builder-subfield${extraClass}"${partAttr}>
          <span class="builder-sublabel" id="${selectId}-label">${escapeXml(label)}</span>
          ${renderSelectHtml(selectId, `${selectId}-label`, options, '', part)}
        </div>`;
}

/** Render the composite controls of an `anim` field (sheen toggle plus motion dropdowns). */
function renderAnimControlHtml(field: BuilderField): string {
  const sheenId = buildFieldId(field, 'sheen');
  const motionOptions = field.options ?? [];
  let motionsHtml = '';
  if (field.animScope === 'pair') {
    motionsHtml =
      renderSubSelectHtml(field, 'left', 'Left icon motion', motionOptions) +
      renderSubSelectHtml(field, 'right', 'Right icon motion', motionOptions);
  } else if (field.animScope === 'single') {
    motionsHtml = renderSubSelectHtml(field, 'left', 'Icon motion', motionOptions);
  }
  return `<div class="builder-composite">
          <label class="builder-check" for="${sheenId}"><input class="check-input" type="checkbox" id="${sheenId}" data-part="sheen" /><span class="check-box" aria-hidden="true">${renderUiIcon('check', 12, 'check-icon')}</span><span>Surface sheen</span></label>
          ${motionsHtml ? `<div class="builder-inline">${motionsHtml}</div>` : ''}
        </div>`;
}

/** Render the composite controls of a `special` field (widget kind, payload, and modifier). */
function renderSpecialControlHtml(field: BuilderField): string {
  return `<div class="builder-inline">
          ${renderSubSelectHtml(field, 'kind', 'Widget', field.options ?? [])}
          <div class="builder-subfield is-grow" data-special-part="payload">
            <label class="builder-sublabel" for="${buildFieldId(field, 'payload')}">Data</label>
            <input class="builder-input" id="${buildFieldId(field, 'payload')}" type="text" data-part="payload" spellcheck="false" />
          </div>
          ${renderSubSelectHtml(field, 'modifier', 'Motion', [])}
        </div>`;
}

/** Render the composite controls of a `size` field (named preset or custom number). */
function renderSizeControlHtml(field: BuilderField): string {
  const customId = buildFieldId(field, 'custom');
  const options: BuilderOption[] = [
    ...(field.options ?? []),
    { label: 'Custom…', value: 'custom' },
  ];
  return `<div class="builder-inline">
          ${renderSubSelectHtml(field, 'preset', 'Preset', options, ' is-grow')}
          <div class="builder-subfield" data-size-part="custom" hidden>
            <label class="builder-sublabel" for="${customId}">Pixels</label>
            <input class="builder-input" id="${customId}" type="number" data-part="custom" min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}" placeholder="${escapeXml(field.placeholder ?? '')}" inputmode="decimal" />
          </div>
        </div>`;
}

/** Render the interactive category composer and raw DSL controls of a `stackGroups` field. */
function renderStackGroupsControlHtml(
  controlId: string,
  initialValue: string,
  requiredAttr: string
): string {
  let categoriesHtml = '';
  for (const category of STACK_CATEGORIES) {
    let chipsHtml = '';
    for (const item of category.items) {
      const canonicalAttr =
        item.canonical === item.slug ? '' : ` data-stack-canonical="${escapeXml(item.canonical)}"`;
      chipsHtml += `<button type="button" class="stack-chip" data-stack-chip="${escapeXml(item.slug)}"${canonicalAttr} aria-pressed="false" title="${escapeXml(`${item.label} (${item.slug})`)}"><span class="stack-chip-glyph" aria-hidden="true"></span><span class="stack-chip-label">${escapeXml(item.label)}</span></button>`;
    }
    categoriesHtml += `<section class="stack-category" data-stack-category="${escapeXml(category.id)}"><p class="stack-category-title">${escapeXml(category.title)}</p><div class="stack-chip-list">${chipsHtml}</div></section>`;
  }

  return `<div class="stack-toolbar">
          <div class="builder-tabs stack-mode-tabs" role="tablist" aria-label="Stack input mode">
            <button type="button" class="stack-mode-tab is-active" role="tab" id="stack-tab-categories" data-stack-mode="categories" aria-selected="true" aria-controls="stack-panel-categories" tabindex="0">Categories</button>
            <button type="button" class="stack-mode-tab" role="tab" id="stack-tab-raw" data-stack-mode="raw" aria-selected="false" aria-controls="stack-panel-raw" tabindex="-1">Raw DSL</button>
          </div>
          <label class="builder-check stack-group-check" for="stack-group-by-category" data-stack-group-toggle><input class="check-input" type="checkbox" id="stack-group-by-category" checked /><span class="check-box" aria-hidden="true">${renderUiIcon('check', 12, 'check-icon')}</span><span>Group by category</span></label>
        </div>
        <div class="stack-panel" id="stack-panel-categories" data-stack-panel="categories" role="tabpanel" aria-labelledby="stack-tab-categories">
          <div class="select-search stack-search">${renderUiIcon('search', 14)}<input class="select-search-input" id="stack-category-search" type="search" placeholder="Filter categories…" aria-label="Filter category icons" spellcheck="false" autocomplete="off" /></div>
          <div class="stack-catalog-wrap">
            <div class="stack-catalog" id="stack-catalog">
              ${categoriesHtml}
              <p class="select-empty stack-catalog-empty" id="stack-catalog-empty" hidden>No matching technologies in the quick categories – switch to Raw DSL to insert any bundled icon.</p>
            </div>
          </div>
          <p class="builder-hint">Switch to <strong>Raw DSL</strong> to add any icon from the full catalog or customize per-icon colors.</p>
        </div>
        <div class="stack-panel" id="stack-panel-raw" data-stack-panel="raw" role="tabpanel" aria-labelledby="stack-tab-raw" hidden>
          <div class="stack-textarea-wrap">
            <textarea class="builder-input builder-textarea is-mono" id="${controlId}" rows="4" spellcheck="false"${requiredAttr}>${escapeXml(initialValue)}</textarea>
            <button type="button" class="stack-help-btn" id="stack-help-trigger" popovertarget="stack-syntax-help" aria-label="Stack DSL syntax help" title="Syntax help"><svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></button>
          </div>
          <div class="popover-panel stack-help-popover" id="stack-syntax-help" popover role="dialog" aria-label="Stack DSL syntax reference">
            <div class="stack-help-head">
              <p class="stack-help-title">Stack DSL syntax</p>
              <p class="stack-help-desc">Comma-separated icon slugs; line breaks or <code>;</code> stack row bands.</p>
            </div>
            <dl class="stack-help-list">
              <div class="stack-help-row"><dt><code class="param-code">rust,go,ts</code></dt><dd>Icons in the same group</dd></div>
              <div class="stack-help-row"><dt><code class="param-code">rust@amber</code></dt><dd>Custom tile color per icon</dd></div>
              <div class="stack-help-row"><dt><code class="param-code">figma,ps,ai:3</code></dt><dd>Columns (<code>:N</code>) for a group</dd></div>
              <div class="stack-help-row"><dt><code class="param-code">a,b | c,d</code></dt><dd>Place groups side by side</dd></div>
              <div class="stack-help-row"><dt><code class="param-code">row1 ; row2</code></dt><dd>Start a new row band</dd></div>
            </dl>
          </div>
        </div>
        <p class="builder-hint builder-validation" data-validation-for="${controlId}" aria-live="polite"></p>
        <div class="builder-field-actions" data-stack-raw-actions hidden>
          <button type="button" class="btn-secondary btn-small" data-icon-target="${controlId}" data-icon-insert="true" popovertarget="icon-picker">${renderUiIcon('layout-grid', 14)}Insert icon</button>
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
      return renderIconSelectHtml(field, 'main');
    }
    case 'iconPair': {
      return `<div class="builder-inline is-pair">${renderIconSelectHtml(field, 'left', 'Left icon')}${renderIconSelectHtml(field, 'right', 'Right icon')}</div>`;
    }
    case 'number': {
      return `<input class="builder-input" id="${controlId}" type="number" min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}" value="${escapeXml(initialValue)}"${placeholderAttr} inputmode="decimal" />`;
    }
    case 'select': {
      return renderSelectHtml(
        controlId,
        `${controlId}-label`,
        resolveSelectOptions(field, schema),
        initialValue
      );
    }
    case 'size': {
      return renderSizeControlHtml(field);
    }
    case 'special': {
      return renderSpecialControlHtml(field);
    }
    case 'stackGroups': {
      return renderStackGroupsControlHtml(controlId, initialValue, requiredAttr);
    }
    case 'textarea': {
      return `<textarea class="builder-input builder-textarea" id="${controlId}" rows="4"${maxLengthAttr}${placeholderAttr}${requiredAttr}>${escapeXml(initialValue)}</textarea>`;
    }
    default: {
      return `<input class="builder-input" id="${controlId}" type="text" value="${escapeXml(initialValue)}"${maxLengthAttr}${placeholderAttr}${requiredAttr} spellcheck="false" />`;
    }
  }
}

/** Render one builder field with its label, control(s), and help text. */
function renderFieldHtml(field: BuilderField, schema: BuilderSchema): string {
  const controlId = buildFieldId(field);
  const isSingleControl = SINGLE_CONTROL_TYPES.has(field.control);
  // Fields with a runtime requirement (service owners) get a hidden mark the builder script toggles.
  const requiredMark =
    field.isRequired || field.hasDynamicRequirement
      ? `<span class="builder-required" aria-hidden="true"${field.isRequired ? '' : ' hidden'}>*</span>`
      : '';
  const paramHtml = field.param
    ? `<code class="builder-param">?${escapeXml(field.param)}=</code>`
    : '';
  const labelTag = isSingleControl ? 'label' : 'span';
  const forAttr = isSingleControl ? ` for="${controlId}"` : '';
  const labelHtml = `<${labelTag} class="builder-label" id="${controlId}-label"${forAttr}><span class="builder-label-text">${escapeXml(field.label)}</span>${requiredMark}</${labelTag}>`;
  const showAttrs = field.showWhen
    ? ` data-show-field="${escapeXml(field.showWhen.field)}" data-show-values="${escapeXml(field.showWhen.values.join(' '))}"`
    : '';
  // Dropdowns and the color radiogroup label themselves; Other composite controls are labeled groups.
  const isGroup = !isSingleControl && !SELF_LABELED_CONTROL_TYPES.has(field.control);
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

/** Render (once per isolate) the shared icon picker dialog popover (tabs, search, the lazily filled grid, and glyph templates). */
function renderIconPickerHtml(): string {
  if (iconPickerHtmlCache === undefined) {
    let tabsHtml = '';
    for (const [i, tab] of ICON_PICKER_TABS.entries()) {
      const checkedAttr = i === 0 ? ' checked' : '';
      tabsHtml += `<label class="icon-picker-tab"><input type="radio" name="icon-picker-set" value="${tab.id}"${checkedAttr} /><span>${tab.label}</span></label>`;
    }
    let glyphTemplatesHtml = '';
    for (const [set, paintAttrs] of Object.entries(GLYPH_PAINT_ATTRS)) {
      glyphTemplatesHtml += `<svg data-set="${set}" viewBox="0 0 24 24" aria-hidden="true" ${paintAttrs}></svg>`;
    }
    iconPickerHtmlCache = `<div class="popover-panel icon-picker" id="icon-picker" popover role="dialog" data-index-url="${getSiteAssetUrl('icons.json')}" aria-label="Icon picker">
    <div class="icon-picker-head">
      <div class="icon-picker-search">
        ${renderUiIcon('search', 15)}
        <input class="icon-picker-input" id="icon-picker-search" type="search" placeholder="Search icons…" aria-label="Search icons" spellcheck="false" autocomplete="off" />
      </div>
      <div class="icon-picker-row">
        <div class="icon-picker-tabs" role="radiogroup" aria-label="Icon set">${tabsHtml}</div>
        <button type="button" class="icon-picker-none" id="icon-picker-none" hidden>No icon</button>
      </div>
    </div>
    <div class="icon-picker-grid" id="icon-picker-grid" role="listbox" aria-label="Icons" tabindex="-1"></div>
    <p class="icon-picker-foot" id="icon-picker-status" aria-live="polite">Loading icons…</p>
    <template id="icon-glyph-templates">${glyphTemplatesHtml}</template>
  </div>`;
  }
  return iconPickerHtmlCache;
}

/** Render the preview, snippet, and action panel. */
function renderOutputPanelHtml(): string {
  let tabsHtml = '';
  for (const [i, format] of SNIPPET_FORMATS.entries()) {
    const isSelected = i === 0;
    tabsHtml += `<button type="button" class="builder-tab${isSelected ? ' is-active' : ''}" role="tab" id="builder-tab-${format.id}" data-format="${format.id}" aria-selected="${isSelected}" aria-controls="builder-code" tabindex="${isSelected ? 0 : -1}">${format.label}</button>`;
  }
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
            ${renderCopyButton('id="builder-copy" data-copy-target="builder-code"')}
            <pre class="code-pre builder-code" id="builder-code" tabindex="0" role="tabpanel" aria-labelledby="builder-tab-markdown"><code></code></pre>
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
            <a class="btn-secondary btn-small" id="builder-open" target="_blank" rel="noopener noreferrer" aria-disabled="true" tabindex="-1">${renderUiIcon('external-link', 14)}Open SVG</a>
            <button type="button" class="btn-secondary btn-small" id="builder-share" data-copied-label="Link copied">${renderUiIcon('link', 14)}<span id="builder-share-label" data-copy-label aria-live="polite">Copy builder link</span></button>
            <button type="button" class="btn-secondary btn-small" id="builder-reset">${renderUiIcon('eraser', 14)}Clear</button>
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
  const docsHref = buildDocsPath(BUILDER_DOCS_SLUGS[kind]);
  const referenceHtml = `<a class="section-action" href="${docsHref}" tabindex="0">${renderUiIcon('book-open', 14)}Reference</a>`;

  const bodyHtml = `<section class="doc-section builder" id="builder" data-builder-kind="${kind}">
    ${renderSectionHeader({
      actionHtml: referenceHtml,
      description: `${meta.description} Click any preview in the docs to open it here.`,
      title: meta.title,
    })}
    <div class="builder-grid">
      <form class="builder-form" id="builder-form" autocomplete="off" novalidate>
        ${fieldsHtml}
      </form>
      ${renderOutputPanelHtml()}
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
