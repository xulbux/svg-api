/**
 * Builder form control components – Schema-driven form fields (`<BuilderFieldView />`), custom searchable dropdowns, icon selectors, color swatch radiogroups, composite animation/widget/size controls, and the interactive tech stack category composer.
 */

import { STACK_CATEGORIES } from '@/config/stack';
import { SPECIAL_ELEMENT_KINDS } from '@/routes/params';
import { UiIcon } from '@/site/components/UiIcon';
import { SPECIAL_KIND_DETAILS } from '@/site/glossary';
import type { HtmlFragment } from '@/site/jsx';
import type { BuilderControl, BuilderField, BuilderOption, BuilderSchema } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the `<BuilderFieldView />` component. */
export interface BuilderFieldViewProps {
  /** Builder field schema definition. */
  readonly field: BuilderField;
  /** Enclosing builder schema. */
  readonly schema: BuilderSchema;
}

// ---------------------------------------- CONSTS ---------------------------------------

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

// -------------------------------------- INTERNALS --------------------------------------

/** Build the DOM ID of a field control or one of its parts (e.g., `'field-icon-left'`). */
function buildFieldId(field: BuilderField, part?: string): string {
  return part ? `field-${field.id}-${part}` : `field-${field.id}`;
}

/** Render `<option>` elements (with optional `data-swatch` colors and `data-badge="Auto"` pills), selecting `selectedValue`. */
function renderOptions(options: readonly BuilderOption[], selectedValue: string): HtmlFragment[] {
  const optionNodes: HtmlFragment[] = [];
  for (const option of options) {
    const hasAutoBadge = option.autoSpecials !== undefined && option.autoSpecials.length > 0;
    optionNodes.push(
      <option
        value={option.value}
        data-swatch={option.swatch}
        data-badge={hasAutoBadge ? 'Auto' : undefined}
        selected={option.value === selectedValue}>
        {option.label}
      </option>
    );
  }
  return optionNodes;
}

/**
 * Render a custom dropdown: A visually hidden native `<select>` (the form state read by the builder
 * script) and a trigger that opens an anchored listbox popover (filled by the builder script).
 * Dropdowns with more than `SEARCHABLE_OPTION_COUNT` options get a search field.
 */
function renderCustomSelect(
  selectId: string,
  labelId: string,
  options: readonly BuilderOption[],
  selectedValue: string,
  part?: string
): HtmlFragment {
  const selected = options.find((option) => option.value === selectedValue) ?? options[0];
  const swatchElement = selected?.swatch ? (
    <span class="select-swatch" aria-hidden="true" style={`--swatch: ${selected.swatch}`}></span>
  ) : (
    <span class="select-swatch" aria-hidden="true" hidden={true}></span>
  );
  const searchElement =
    options.length > SEARCHABLE_OPTION_COUNT ? (
      <div class="select-search">
        <UiIcon slug="search" size={14} />
        <input
          class="select-search-input"
          type="search"
          placeholder="Search…"
          aria-label="Search options"
          spellcheck={false}
          autocomplete="off"
        />
      </div>
    ) : undefined;
  return (
    <div class="select" data-select={selectId}>
      <select class="select-native" id={selectId} data-part={part} tabindex="-1" aria-hidden="true">
        {renderOptions(options, selectedValue)}
      </select>
      <button
        type="button"
        class="builder-input select-trigger"
        id={`${selectId}-trigger`}
        popovertarget={`${selectId}-menu`}
        aria-haspopup="listbox"
        aria-labelledby={`${labelId} ${selectId}-value`}>
        {swatchElement}
        <span class="select-value" id={`${selectId}-value`}>
          {selected?.label ?? ''}
        </span>
        <UiIcon slug="chevron-down" size={14} extraClass="select-chevron" />
      </button>
      <div class="popover-panel select-menu" id={`${selectId}-menu`} popover={true}>
        {searchElement}
        <div class="select-options" role="listbox" aria-labelledby={labelId}></div>
      </div>
    </div>
  );
}

/** Render the service options of the service badge builder (`PyPI (pypi)`), marking services that support automatic inline widgets. */
function buildServiceSelectOptions(schema: BuilderSchema): BuilderOption[] {
  const options: BuilderOption[] = [];
  for (const service of schema.services ?? []) {
    const autoMetric = service.metrics.find(
      (metric) => metric.autoSpecials !== undefined && metric.autoSpecials.length > 0
    );
    options.push({
      ...(autoMetric?.autoSpecials ? { autoSpecials: autoMetric.autoSpecials } : {}),
      label: `${service.title} (${service.key})`,
      value: service.key,
    });
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
function renderIconSelect(field: BuilderField, part: string, sublabel?: string): HtmlFragment {
  const inputId = buildFieldId(field, part);
  const placeholder = field.placeholder ?? 'none';
  const labelId = sublabel ? `${inputId}-label` : `${buildFieldId(field)}-label`;
  const clearLabel = (sublabel ?? field.label).toLowerCase();
  return (
    <div class="icon-input">
      {sublabel ? (
        <span class="builder-sublabel" id={labelId}>
          {sublabel}
        </span>
      ) : undefined}
      <div class="icon-select">
        <input type="hidden" id={inputId} data-part={part} />
        <button
          type="button"
          class="builder-input icon-select-trigger"
          data-icon-target={inputId}
          data-icon-none={field.hasPresetValue ? 'true' : undefined}
          popovertarget="icon-picker"
          aria-haspopup="dialog"
          aria-labelledby={`${labelId} ${inputId}-value`}>
          <span class="icon-input-glyph" aria-hidden="true" data-glyph-for={inputId}></span>
          <span
            class="icon-select-value is-placeholder"
            id={`${inputId}-value`}
            data-placeholder={placeholder}>
            {placeholder}
          </span>
          <UiIcon slug="layout-grid" size={14} extraClass="icon-select-grid" />
        </button>
        <button
          type="button"
          class="icon-select-clear"
          data-icon-clear={inputId}
          aria-label={`Clear ${clearLabel}`}
          title="Clear"
          hidden={true}>
          <UiIcon slug="x" size={14} />
        </button>
      </div>
      <p
        class="builder-hint builder-validation"
        data-validation-for={inputId}
        aria-live="polite"></p>
    </div>
  );
}

/** Render the swatch radio group of a `color` field. */
function renderColorControl(field: BuilderField, selectedValue: string): HtmlFragment {
  const swatches: HtmlFragment[] = [];
  for (const option of field.options ?? []) {
    const label = option.value ? option.label : 'Default';
    swatches.push(
      <label class="swatch" title={label}>
        <input
          class="swatch-input"
          type="radio"
          name={buildFieldId(field)}
          value={option.value}
          checked={option.value === selectedValue}
        />
        <span
          class={option.value ? 'swatch-dot' : 'swatch-dot is-default'}
          style={option.swatch ? `--swatch: ${option.swatch}` : undefined}
          aria-hidden="true"></span>
        <span class="visually-hidden">{label}</span>
      </label>
    );
  }
  return (
    <div class="swatch-grid" role="radiogroup" aria-labelledby={`${buildFieldId(field)}-label`}>
      {swatches}
    </div>
  );
}

/** Render a labeled dropdown part of a composite field (e.g., an icon motion or the widget kind). */
function renderSubSelect(
  field: BuilderField,
  part: string,
  label: string,
  options: readonly BuilderOption[],
  extraClass = ''
): HtmlFragment {
  const selectId = buildFieldId(field, part);
  return (
    <div
      class={`builder-subfield${extraClass}`}
      data-special-part={part === 'modifier' ? 'modifier' : undefined}>
      <span class="builder-sublabel" id={`${selectId}-label`}>
        {label}
      </span>
      {renderCustomSelect(selectId, `${selectId}-label`, options, '', part)}
    </div>
  );
}

/** Render the composite controls of an `anim` field (sheen toggle plus motion dropdowns). */
function renderAnimControl(field: BuilderField): HtmlFragment {
  const sheenId = buildFieldId(field, 'sheen');
  const motionOptions = field.options ?? [];
  let motionsFragment: HtmlFragment | undefined = undefined;
  if (field.animScope === 'pair') {
    motionsFragment = (
      <div class="builder-inline">
        {renderSubSelect(field, 'left', 'Left icon motion', motionOptions)}
        {renderSubSelect(field, 'right', 'Right icon motion', motionOptions)}
      </div>
    );
  } else if (field.animScope === 'single') {
    motionsFragment = (
      <div class="builder-inline">
        {renderSubSelect(field, 'left', 'Icon motion', motionOptions)}
      </div>
    );
  }
  return (
    <div class="builder-composite">
      <label class="builder-check" for={sheenId}>
        <input class="check-input" type="checkbox" id={sheenId} data-part="sheen" />
        <span class="check-box" aria-hidden="true">
          <UiIcon slug="check" size={12} extraClass="check-icon" />
        </span>
        <span>Surface sheen</span>
      </label>
      {motionsFragment}
    </div>
  );
}

/** Render a circular `?` syntax help trigger button that opens `popoverId`. */
function renderHelpButton(
  buttonId: string,
  popoverId: string,
  label: string,
  extraClass = '',
  align: 'end' | 'start' = 'end'
): HtmlFragment {
  return (
    <button
      type="button"
      class={`help-btn${extraClass}`}
      id={buttonId}
      data-help-popover={popoverId}
      data-help-align={align}
      popovertarget={popoverId}
      aria-label={label}
      title="Syntax help">
      <svg
        class="ui-icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="3 3 18 18"
        width="13"
        height="13"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="2.25"
        stroke-linecap="round"
        stroke-linejoin="round">
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
    </button>
  );
}

/** Render the syntax reference popover of a `special` field. */
function renderSpecialHelpPopover(field: BuilderField): HtmlFragment {
  const rows: HtmlFragment[] = [];
  for (const kind of SPECIAL_ELEMENT_KINDS) {
    const detail = SPECIAL_KIND_DETAILS[kind];
    rows.push(
      <div class="stack-help-row">
        <dt>
          <code class="param-code">{detail.example}</code>
        </dt>
        <dd>{detail.summary}</dd>
      </div>
    );
  }
  return (
    <div
      class="popover-panel stack-help-popover"
      id="special-syntax-help"
      popover={true}
      role="dialog"
      aria-label="Data widget syntax reference">
      <div class="stack-help-head">
        <p class="stack-help-title">Data widget syntax</p>
        <p class="stack-help-desc">
          Format of the <code>Data</code> field per widget kind
          {field.hasPresetValue ? (
            <>
              ; Leave empty on <code>Auto</code> widgets for live data
            </>
          ) : undefined}
          .
        </p>
      </div>
      <dl class="stack-help-list">{rows}</dl>
    </div>
  );
}

/** Render the composite controls of a `special` field (widget kind, payload, and modifier). */
function renderSpecialControl(field: BuilderField): HtmlFragment {
  const payloadId = buildFieldId(field, 'payload');
  return (
    <>
      <div class="builder-inline">
        {renderSubSelect(field, 'kind', 'Widget', field.options ?? [])}
        <div class="builder-subfield is-grow" data-special-part="payload">
          <label class="builder-sublabel" for={payloadId}>
            Data
          </label>
          <input
            class="builder-input"
            id={payloadId}
            type="text"
            data-part="payload"
            spellcheck={false}
          />
        </div>
        {renderSubSelect(field, 'modifier', 'Motion', [])}
      </div>
      {renderSpecialHelpPopover(field)}
    </>
  );
}

/** Render the composite controls of a `size` field (named preset or custom number). */
function renderSizeControl(field: BuilderField): HtmlFragment {
  const customId = buildFieldId(field, 'custom');
  const options: BuilderOption[] = [
    ...(field.options ?? []),
    { label: 'Custom…', value: 'custom' },
  ];
  return (
    <div class="builder-inline">
      {renderSubSelect(field, 'preset', 'Preset', options, ' is-grow')}
      <div class="builder-subfield" data-size-part="custom" hidden={true}>
        <label class="builder-sublabel" for={customId}>
          Pixels
        </label>
        <input
          class="builder-input"
          id={customId}
          type="number"
          data-part="custom"
          min={field.min ?? ''}
          max={field.max ?? ''}
          step={field.step ?? 1}
          placeholder={field.placeholder ?? ''}
          inputmode="decimal"
        />
      </div>
    </div>
  );
}

/** Render the interactive category composer and raw DSL controls of a `stackGroups` field. */
function renderStackGroupsControl(
  controlId: string,
  initialValue: string,
  isRequired: boolean | undefined
): HtmlFragment {
  const categorySections: HtmlFragment[] = [];
  for (const category of STACK_CATEGORIES) {
    const chips: HtmlFragment[] = [];
    for (const item of category.items) {
      chips.push(
        <button
          type="button"
          class="stack-chip"
          data-stack-chip={item.slug}
          data-stack-canonical={item.canonical === item.slug ? undefined : item.canonical}
          aria-pressed="false"
          title={`${item.label} (${item.slug})`}>
          <span class="stack-chip-glyph" aria-hidden="true"></span>
          <span class="stack-chip-label">{item.label}</span>
        </button>
      );
    }
    categorySections.push(
      <section class="stack-category" data-stack-category={category.id}>
        <p class="stack-category-title">{category.title}</p>
        <div class="stack-chip-list">{chips}</div>
      </section>
    );
  }

  return (
    <>
      <div class="stack-toolbar">
        <div class="builder-tabs stack-mode-tabs" role="tablist" aria-label="Stack input mode">
          <button
            type="button"
            class="stack-mode-tab is-active"
            role="tab"
            id="stack-tab-categories"
            data-stack-mode="categories"
            aria-selected="true"
            aria-controls="stack-panel-categories"
            tabindex="0">
            Categories
          </button>
          <button
            type="button"
            class="stack-mode-tab"
            role="tab"
            id="stack-tab-raw"
            data-stack-mode="raw"
            aria-selected="false"
            aria-controls="stack-panel-raw"
            tabindex="-1">
            Raw DSL
          </button>
        </div>
        <label
          class="builder-check stack-group-check"
          for="stack-group-by-category"
          data-stack-group-toggle={true}>
          <input class="check-input" type="checkbox" id="stack-group-by-category" checked={true} />
          <span class="check-box" aria-hidden="true">
            <UiIcon slug="check" size={12} extraClass="check-icon" />
          </span>
          <span>Group by category</span>
        </label>
      </div>
      <div
        class="stack-panel"
        id="stack-panel-categories"
        data-stack-panel="categories"
        role="tabpanel"
        aria-labelledby="stack-tab-categories">
        <div class="select-search stack-search">
          <UiIcon slug="search" size={14} />
          <input
            class="select-search-input"
            id="stack-category-search"
            type="search"
            placeholder="Filter categories…"
            aria-label="Filter category icons"
            spellcheck={false}
            autocomplete="off"
          />
        </div>
        <div class="stack-catalog-wrap">
          <div class="stack-catalog" id="stack-catalog">
            {categorySections}
            <p class="select-empty stack-catalog-empty" id="stack-catalog-empty" hidden={true}>
              No matching technologies in the quick categories; Switch to Raw DSL to insert any
              bundled icon.
            </p>
          </div>
        </div>
        <p class="builder-hint">
          Switch to <strong>Raw DSL</strong> to add any icon from the full catalog or customize
          per-icon colors.
        </p>
      </div>
      <div
        class="stack-panel"
        id="stack-panel-raw"
        data-stack-panel="raw"
        role="tabpanel"
        aria-labelledby="stack-tab-raw"
        hidden={true}>
        <div class="stack-textarea-wrap">
          <textarea
            class="builder-input builder-textarea is-mono"
            id={controlId}
            rows="4"
            spellcheck={false}
            aria-required={isRequired ? 'true' : undefined}>
            {initialValue}
          </textarea>
          {renderHelpButton(
            'stack-help-trigger',
            'stack-syntax-help',
            'Stack DSL syntax help',
            ' stack-help-btn'
          )}
        </div>
        <div
          class="popover-panel stack-help-popover"
          id="stack-syntax-help"
          popover={true}
          role="dialog"
          aria-label="Stack DSL syntax reference">
          <div class="stack-help-head">
            <p class="stack-help-title">Stack DSL syntax</p>
            <p class="stack-help-desc">
              Comma-separated icon slugs; Line breaks or <code>;</code> stack row bands.
            </p>
          </div>
          <dl class="stack-help-list">
            <div class="stack-help-row">
              <dt>
                <code class="param-code">rust,go,ts</code>
              </dt>
              <dd>Icons in the same group</dd>
            </div>
            <div class="stack-help-row">
              <dt>
                <code class="param-code">rust@amber</code>
              </dt>
              <dd>Custom tile color per icon</dd>
            </div>
            <div class="stack-help-row">
              <dt>
                <code class="param-code">figma,ps,ai:3</code>
              </dt>
              <dd>
                Columns (<code>:N</code>) for a group
              </dd>
            </div>
            <div class="stack-help-row">
              <dt>
                <code class="param-code">a,b | c,d</code>
              </dt>
              <dd>Place groups side by side</dd>
            </div>
            <div class="stack-help-row">
              <dt>
                <code class="param-code">row1 ; row2</code>
              </dt>
              <dd>Start a new row band</dd>
            </div>
          </dl>
        </div>
      </div>
      <p
        class="builder-hint builder-validation"
        data-validation-for={controlId}
        aria-live="polite"></p>
      <div class="builder-field-actions" data-stack-raw-actions={true} hidden={true}>
        <button
          type="button"
          class="btn-secondary btn-small"
          data-icon-target={controlId}
          data-icon-insert="true"
          popovertarget="icon-picker">
          <UiIcon slug="layout-grid" size={14} />
          Insert icon
        </button>
      </div>
    </>
  );
}

/** Render the control(s) of a builder field. */
function renderFieldControl(field: BuilderField, schema: BuilderSchema): HtmlFragment {
  const controlId = buildFieldId(field);
  const initialValue = schema.initialState[field.id] ?? '';
  switch (field.control) {
    case 'anim': {
      return renderAnimControl(field);
    }
    case 'color': {
      return renderColorControl(field, initialValue);
    }
    case 'icon': {
      return renderIconSelect(field, 'main');
    }
    case 'iconPair': {
      return (
        <div class="builder-inline is-pair">
          {renderIconSelect(field, 'left', 'Left icon')}
          {renderIconSelect(field, 'right', 'Right icon')}
        </div>
      );
    }
    case 'number': {
      return (
        <input
          class="builder-input"
          id={controlId}
          type="number"
          min={field.min ?? ''}
          max={field.max ?? ''}
          step={field.step ?? 1}
          value={initialValue}
          placeholder={field.placeholder}
          inputmode="decimal"
        />
      );
    }
    case 'select': {
      return renderCustomSelect(
        controlId,
        `${controlId}-label`,
        resolveSelectOptions(field, schema),
        initialValue
      );
    }
    case 'size': {
      return renderSizeControl(field);
    }
    case 'special': {
      return renderSpecialControl(field);
    }
    case 'stackGroups': {
      return renderStackGroupsControl(controlId, initialValue, field.isRequired);
    }
    case 'textarea': {
      return (
        <textarea
          class="builder-input builder-textarea"
          id={controlId}
          rows="4"
          maxlength={field.maxLength}
          placeholder={field.placeholder}
          aria-required={field.isRequired ? 'true' : undefined}>
          {initialValue}
        </textarea>
      );
    }
    default: {
      return (
        <input
          class="builder-input"
          id={controlId}
          type="text"
          value={initialValue}
          maxlength={field.maxLength}
          placeholder={field.placeholder}
          aria-required={field.isRequired ? 'true' : undefined}
          spellcheck={false}
        />
      );
    }
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render one builder field with its label, control(s), and help text as a JSX component.
 * @param props   Builder field view props (`field` and `schema`).
 * @returns Rendered `<div class="builder-field">` JSX fragment.
 */
export function BuilderFieldView(props: BuilderFieldViewProps): HtmlFragment {
  const { field, schema } = props;
  const controlId = buildFieldId(field);
  const isSingleControl = SINGLE_CONTROL_TYPES.has(field.control);
  // Fields with a runtime requirement (service owners) get a hidden mark the builder script toggles.
  const requiredMark =
    field.isRequired || field.hasDynamicRequirement ? (
      <span class="builder-required" aria-hidden="true" hidden={!field.isRequired}>
        *
      </span>
    ) : undefined;
  const labelElement = isSingleControl ? (
    <label class="builder-label" id={`${controlId}-label`} for={controlId}>
      <span class="builder-label-text">{field.label}</span>
      {requiredMark}
    </label>
  ) : (
    <span class="builder-label" id={`${controlId}-label`}>
      <span class="builder-label-text">{field.label}</span>
      {requiredMark}
    </span>
  );
  const headingElement =
    field.control === 'special' ? (
      <span class="builder-label-group">
        {labelElement}
        {renderHelpButton(
          'special-help-trigger',
          'special-syntax-help',
          'Data widget syntax help',
          '',
          'start'
        )}
      </span>
    ) : (
      labelElement
    );
  // Dropdowns and the color radiogroup label themselves; Other composite controls are labeled groups.
  const isGroup = !isSingleControl && !SELF_LABELED_CONTROL_TYPES.has(field.control);

  return (
    <div
      class="builder-field"
      data-field={field.id}
      data-control={field.control}
      role={isGroup ? 'group' : undefined}
      aria-labelledby={isGroup ? `${controlId}-label` : undefined}>
      <div class="builder-label-row">
        {headingElement}
        {field.param ? <code class="builder-param">{`?${field.param}=`}</code> : undefined}
      </div>
      {renderFieldControl(field, schema)}
      {field.description ? <p class="builder-hint">{field.description}</p> : undefined}
    </div>
  );
}
