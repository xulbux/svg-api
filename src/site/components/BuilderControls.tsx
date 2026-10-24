/**
 * Builder form control components – Schema-driven form fields (`<BuilderFieldView />`), custom searchable dropdowns, icon selectors, color swatch radiogroups, composite animation/widget/size controls, and the interactive tech stack category composer.
 */

import { STACK_CATEGORIES } from '@/config/stack';
import { SPECIAL_ELEMENT_KINDS } from '@/routes/params';
import { UiIcon } from '@/site/components/UiIcon';
import { SPECIAL_KIND_DETAILS } from '@/site/glossary';
import type { HtmlFragment } from '@/site/jsx';
import {
  findOption,
  findService,
  getOwnValue,
  MAX_TYPING_LINE_LENGTH,
  MAX_TYPING_LINES,
  resolveActiveServiceMetric,
  resolveEffectiveFieldDefault,
  resolveIconSelectDisplay,
  splitAnim,
  splitHint,
  splitIconPair,
  splitSize,
  splitSpecial,
} from '@/site/shared';
import type {
  BuilderControl,
  BuilderField,
  BuilderOption,
  BuilderSchema,
  BuilderServiceMetric,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the `<BuilderFieldView />` component. */
interface BuilderFieldViewProps {
  /** Builder field schema definition. */
  readonly field: BuilderField;
  /** Enclosing builder schema. */
  readonly schema: BuilderSchema;
}

/** Options for `renderIconSelect`. */
interface IconSelectOptions {
  /** Builder field schema definition. */
  readonly field: BuilderField;
  /** Optional ID of the field description hint. */
  readonly hintId?: string;
  /** Initial hidden input value. */
  readonly initialValue?: string;
  /** Whether `presetIcon` is chosen dynamically from live upstream data (`Auto`). */
  readonly isPresetDynamic?: boolean;
  /** Control part name. */
  readonly part: string;
  /** Optional preset icon slug rendered when the hidden input is empty (`service` left icon). */
  readonly presetIcon?: string;
  /** Optional sublabel rendered above the selector. */
  readonly sublabel?: string;
}

/** Options for `renderSyntaxHelpPopover`. */
interface SyntaxHelpPopoverOptions {
  /** Accessible dialog label (`aria-label`). */
  readonly ariaLabel: string;
  /** Introductory description rendered inside `<p class="stack-help-desc">`. */
  readonly description: HtmlFragment | string;
  /** Popover DOM ID. */
  readonly id: string;
  /** Definition list rows. */
  readonly rows: readonly SyntaxHelpRow[];
  /** Heading text rendered inside `<p class="stack-help-title">`. */
  readonly title: string;
}

/** Single `<dt>` / `<dd>` entry in a syntax reference popover. */
interface SyntaxHelpRow {
  /** Example token rendered inside `<code class="param-code">`. */
  readonly code: string;
  /** Description rendered inside `<dd>`. */
  readonly description: HtmlFragment | string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Sublabels for single-select `animScope` values. */
const SINGLE_ANIM_LABELS: Readonly<Record<string, string>> = {
  single: 'Icon motion',
  stack: 'Tile motion',
  typing: 'Typing motion',
};

/** Syntax reference rows for the `/builder/stack` raw DSL help popover. */
const STACK_SYNTAX_HELP_ROWS: readonly SyntaxHelpRow[] = [
  { code: 'rust,go,ts', description: 'Icons in the same group' },
  { code: 'rust@amber', description: 'Custom tile color per icon' },
  {
    code: 'figma,ps,ai:3',
    description: (
      <>
        Columns (<code>:N</code>) for a group
      </>
    ),
  },
  { code: 'a,b | c,d', description: 'Place groups side by side' },
  { code: 'row1 ; row2', description: 'Start a new row band' },
];

/** Number of options above which a dropdown gets a search field (e.g., the service presets). */
const SEARCHABLE_OPTION_COUNT = 12;

// -------------------------------------- INTERNALS --------------------------------------

/** Check whether `control` renders a single labelable form control (`<label for>`). */
function isSingleControlType(control: BuilderControl): boolean {
  return control === 'number' || control === 'text' || control === 'textarea';
}

/** Check whether `control` labels its own interactive element directly instead of using a group wrapper. */
function isSelfLabeledControlType(control: BuilderControl): boolean {
  return control === 'color' || control === 'icon' || control === 'select';
}

/** Build the DOM ID of a field control or one of its parts (e.g., `'field-icon-left'`). */
function buildFieldId(field: BuilderField, part?: string): string {
  return part ? `field-${field.id}-${part}` : `field-${field.id}`;
}

/** Render `<option>` elements (with optional `data-swatch` colors and `data-badge="Auto"` pills), selecting `selectedValue`. */
function renderOptions(
  options: readonly BuilderOption[],
  selectedValue: string,
  autoBadgeValues?: ReadonlySet<string>
): HtmlFragment[] {
  const optionNodes: HtmlFragment[] = [];
  for (const option of options) {
    const hasAutoBadge =
      (option.autoSpecials !== undefined && option.autoSpecials.length > 0) ||
      Boolean(option.value && autoBadgeValues?.has(option.value));
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
  part?: string,
  hintId?: string,
  autoBadgeValues?: ReadonlySet<string>
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
        {renderOptions(options, selectedValue, autoBadgeValues)}
      </select>
      <button
        type="button"
        class="builder-input select-trigger"
        id={`${selectId}-trigger`}
        popovertarget={`${selectId}-menu`}
        aria-expanded="false"
        aria-haspopup="listbox"
        aria-labelledby={`${labelId} ${selectId}-value`}
        aria-describedby={hintId}>
        {swatchElement}
        <span class="select-value" id={`${selectId}-value`}>
          {selected?.label ?? ''}
        </span>
        <UiIcon slug="chevron-down" size={14} extraClass="select-chevron" />
      </button>
      <div class="popover-panel select-menu" id={`${selectId}-menu`} popover={true}>
        {searchElement}
        <div class="select-options" role="listbox" aria-labelledby={labelId}></div>
        <p
          class="select-empty"
          data-select-empty={true}
          role="status"
          aria-live="polite"
          hidden={true}>
          No matches
        </p>
      </div>
    </div>
  );
}

/** Resolve the initial active service metric of the `service` builder schema. */
function resolveInitialServiceMetric(schema: BuilderSchema): BuilderServiceMetric | undefined {
  return resolveActiveServiceMetric(schema, schema.initialState).metric;
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
    const initialService = findService(schema, schema.initialState.service) ?? schema.services?.[0];
    return initialService?.metrics ?? [];
  }
  if (schema.kind === 'service' && field.id === 'dot') {
    const initialMetric = resolveInitialServiceMetric(schema);
    const dotOptions = field.options ?? [];
    if (initialMetric?.hasDynamicDot) {
      return dotOptions;
    }
    const filteredOptions: BuilderOption[] = [];
    for (const option of dotOptions) {
      if (option.value !== '') {
        filteredOptions.push(option);
      }
    }
    return filteredOptions;
  }
  return field.options ?? [];
}

/**
 * Render an icon selector: A trigger showing the current glyph and slug that opens the icon picker
 * (the slug is stored in a hidden input), plus a clear button. Icon pair parts get a sublabel; A single icon
 * selector is labeled by its field label.
 */
function renderIconSelect(options: IconSelectOptions): HtmlFragment {
  const { field, hintId, initialValue, isPresetDynamic, part, presetIcon, sublabel } = options;
  const inputId = buildFieldId(field, part);
  const validationId = `${inputId}-validation`;
  const describedBy = hintId ? `${validationId} ${hintId}` : validationId;
  const placeholder = field.placeholder ?? 'none';
  const labelId = sublabel ? `${inputId}-label` : `${buildFieldId(field)}-label`;
  const clearLabel = (sublabel ?? field.label).toLowerCase();
  const rawSlug = (initialValue ?? '').trim();
  const { displayLabel, isPlaceholder } = resolveIconSelectDisplay(
    rawSlug,
    placeholder,
    presetIcon,
    Boolean(isPresetDynamic)
  );

  return (
    <div class="icon-input">
      {sublabel ? (
        <span class="builder-sublabel" id={labelId}>
          {sublabel}
        </span>
      ) : undefined}
      <div class="icon-select">
        <input type="hidden" id={inputId} data-part={part} value={rawSlug || undefined} />
        <button
          type="button"
          class="builder-input icon-select-trigger"
          data-icon-target={inputId}
          data-preset-icon={presetIcon}
          data-preset-dynamic={isPresetDynamic ? 'true' : undefined}
          popovertarget="icon-picker"
          aria-expanded="false"
          aria-haspopup="dialog"
          aria-labelledby={`${labelId} ${inputId}-value`}
          aria-describedby={describedBy}>
          <span class="icon-input-glyph" aria-hidden="true" data-glyph-for={inputId}></span>
          <span
            class={isPlaceholder ? 'icon-select-value is-placeholder' : 'icon-select-value'}
            id={`${inputId}-value`}
            data-placeholder={placeholder}>
            {displayLabel}
          </span>
          <UiIcon slug="layout-grid" size={14} extraClass="icon-select-grid" />
        </button>
        <button
          type="button"
          class="icon-select-clear"
          data-icon-clear={inputId}
          aria-label={`Clear ${clearLabel}`}
          title="Clear"
          hidden={isPlaceholder}>
          <UiIcon slug="x" size={14} />
        </button>
      </div>
      <p
        class="builder-hint builder-validation"
        id={validationId}
        data-validation-for={inputId}
        aria-live="polite"></p>
    </div>
  );
}

/** Render the swatch radio group of a `color` field. */
function renderColorControl(
  field: BuilderField,
  schema: BuilderSchema,
  selectedValue: string,
  hintId: string | undefined
): HtmlFragment {
  const initialMetric = resolveInitialServiceMetric(schema);
  const swatches: HtmlFragment[] = [];
  for (const option of field.options ?? []) {
    const { label } = option;
    const isServiceAutoSwatch = schema.kind === 'service' && !option.value;
    swatches.push(
      <label
        class="swatch"
        title={label}
        data-color-auto={isServiceAutoSwatch ? 'true' : undefined}
        hidden={isServiceAutoSwatch && !initialMetric?.hasDynamicColor ? true : undefined}>
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
    <div
      class="swatch-grid"
      role="radiogroup"
      aria-labelledby={`${buildFieldId(field)}-label`}
      aria-describedby={hintId}>
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
  selectedValue = '',
  extraClass = '',
  isHidden = false,
  autoBadgeValues?: ReadonlySet<string>
): HtmlFragment {
  const selectId = buildFieldId(field, part);
  return (
    <div
      class={`builder-subfield${extraClass}`}
      data-special-part={part === 'modifier' ? 'modifier' : undefined}
      hidden={isHidden ? true : undefined}>
      <span class="builder-sublabel" id={`${selectId}-label`}>
        {label}
      </span>
      {renderCustomSelect(
        selectId,
        `${selectId}-label`,
        options,
        selectedValue,
        part,
        undefined,
        autoBadgeValues
      )}
    </div>
  );
}

/** Render the composite controls of an `anim` field (sheen toggle plus motion dropdowns). */
function renderAnimControl(field: BuilderField, initialValue: string): HtmlFragment {
  const sheenId = buildFieldId(field, 'sheen');
  const motionOptions = field.options ?? [];
  const initialAnim = splitAnim(initialValue, motionOptions);
  const singleAnimLabel = field.animScope
    ? getOwnValue(SINGLE_ANIM_LABELS, field.animScope)
    : undefined;
  let motionsFragment: HtmlFragment | undefined = undefined;
  if (field.animScope === 'pair') {
    motionsFragment = (
      <div class="builder-inline">
        {renderSubSelect(field, 'left', 'Left icon motion', motionOptions, initialAnim.left)}
        {renderSubSelect(field, 'right', 'Right icon motion', motionOptions, initialAnim.right)}
      </div>
    );
  } else if (singleAnimLabel) {
    motionsFragment = (
      <div class="builder-inline">
        {renderSubSelect(field, 'left', singleAnimLabel, motionOptions, initialAnim.left)}
      </div>
    );
  }
  return (
    <div class="builder-composite">
      <label class="builder-check" for={sheenId}>
        <input
          class="check-input"
          type="checkbox"
          id={sheenId}
          data-part="sheen"
          checked={initialAnim.hasSheen}
        />
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
      aria-expanded="false"
      aria-haspopup="dialog"
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

/** Render a syntax reference dialog popover listing example tokens and their meanings. */
function renderSyntaxHelpPopover(options: SyntaxHelpPopoverOptions): HtmlFragment {
  const rowNodes: HtmlFragment[] = [];
  for (const row of options.rows) {
    rowNodes.push(
      <div class="stack-help-row">
        <dt>
          <code class="param-code">{row.code}</code>
        </dt>
        <dd>{row.description}</dd>
      </div>
    );
  }
  return (
    <div
      class="popover-panel stack-help-popover"
      id={options.id}
      popover={true}
      role="dialog"
      aria-label={options.ariaLabel}>
      <div class="stack-help-head">
        <p class="stack-help-title">{options.title}</p>
        <p class="stack-help-desc">{options.description}</p>
      </div>
      <dl class="stack-help-list">{rowNodes}</dl>
    </div>
  );
}

/** Render the syntax reference popover of a `special` field. */
function renderSpecialHelpPopover(field: BuilderField): HtmlFragment {
  const rows: SyntaxHelpRow[] = [];
  for (const kind of SPECIAL_ELEMENT_KINDS) {
    const detail = SPECIAL_KIND_DETAILS[kind];
    rows.push({ code: detail.example, description: detail.summary });
  }
  return renderSyntaxHelpPopover({
    ariaLabel: 'Data widget syntax reference',
    description: (
      <>
        Format of the <code>Data</code> field per widget kind
        {field.hasPresetValue ? (
          <>
            ; Leave empty on <code>Auto</code> widgets for live data
          </>
        ) : undefined}
        .
      </>
    ),
    id: `${field.id}-syntax-help`,
    rows,
    title: 'Data widget syntax',
  });
}

/** Render the composite controls of a `special` field (widget kind, payload, and modifier). */
function renderSpecialControl(
  field: BuilderField,
  schema: BuilderSchema,
  selectedValue: string
): HtmlFragment {
  const payloadId = buildFieldId(field, 'payload');
  const initialSpecial = splitSpecial(selectedValue, field.options ?? []);
  const kindOption = findOption(field.options, initialSpecial.kind);
  const modifiers = kindOption?.modifiers ?? [];
  const initialMetric = resolveInitialServiceMetric(schema);
  const autoBadgeValues = initialMetric?.autoSpecials
    ? new Set<string>(initialMetric.autoSpecials)
    : undefined;
  const isPayloadHidden = !initialSpecial.kind || initialSpecial.kind === 'none';

  return (
    <>
      <div class="builder-inline">
        {renderSubSelect(
          field,
          'kind',
          'Widget',
          field.options ?? [],
          initialSpecial.kind,
          '',
          false,
          autoBadgeValues
        )}
        <div
          class="builder-subfield is-grow"
          data-special-part="payload"
          hidden={isPayloadHidden ? true : undefined}>
          <label class="builder-sublabel" for={payloadId}>
            Data
          </label>
          <input
            class="builder-input"
            id={payloadId}
            type="text"
            data-part="payload"
            value={initialSpecial.payload || undefined}
            placeholder={kindOption?.placeholder}
            spellcheck={false}
          />
        </div>
        {renderSubSelect(
          field,
          'modifier',
          'Motion',
          modifiers,
          initialSpecial.modifier,
          '',
          modifiers.length === 0
        )}
      </div>
      {renderSpecialHelpPopover(field)}
    </>
  );
}

/** Render the composite controls of a `size` field (named preset or custom number). */
function renderSizeControl(field: BuilderField, selectedValue: string): HtmlFragment {
  const customId = buildFieldId(field, 'custom');
  const options: BuilderOption[] = [
    ...(field.options ?? []),
    { label: 'Custom…', value: 'custom' },
  ];
  const initialSize = splitSize(selectedValue, field.options ?? []);
  return (
    <div class="builder-inline">
      {renderSubSelect(field, 'preset', 'Preset', options, initialSize.preset, ' is-grow')}
      <div
        class="builder-subfield"
        data-size-part="custom"
        hidden={initialSize.preset !== 'custom'}>
        <label class="builder-sublabel" for={customId}>
          Pixels
        </label>
        <input
          class="builder-input"
          id={customId}
          type="number"
          data-part="custom"
          value={initialSize.custom || undefined}
          min={field.min}
          max={field.max}
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
  const validationId = `${controlId}-validation`;
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
          {item.label}
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
        <div class="builder-tabs" role="tablist" aria-label="Stack input mode">
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
            <p
              class="select-empty stack-catalog-empty"
              id="stack-catalog-empty"
              role="status"
              aria-live="polite"
              hidden={true}>
              No matches here; Switch to Raw DSL to use any icon slug.
            </p>
          </div>
        </div>
        <p class="builder-hint">
          Use <strong>Raw DSL</strong> for any icon slug or per-tile colors.
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
            aria-labelledby={`${controlId}-label`}
            aria-describedby={validationId}
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
        {renderSyntaxHelpPopover({
          ariaLabel: 'Stack DSL syntax reference',
          description: (
            <>
              Comma-separated icon slugs; Line breaks or <code>;</code> stack row bands.
            </>
          ),
          id: 'stack-syntax-help',
          rows: STACK_SYNTAX_HELP_ROWS,
          title: 'Stack DSL syntax',
        })}
      </div>
      <p
        class="builder-hint builder-validation"
        id={validationId}
        data-validation-for={controlId}
        aria-live="polite"></p>
      <div class="builder-field-actions" data-stack-raw-actions={true} hidden={true}>
        <button
          type="button"
          class="btn-secondary btn-small"
          data-icon-target={controlId}
          data-icon-insert="true"
          popovertarget="icon-picker"
          aria-expanded="false"
          aria-haspopup="dialog">
          <UiIcon slug="layout-grid" size={14} />
          Insert icon
        </button>
      </div>
    </>
  );
}

/** Render the interactive line-by-line list editor of a `typingLines` field. */
function renderTypingLinesControl(
  field: BuilderField,
  controlId: string,
  initialValue: string
): HtmlFragment {
  const maxLines = field.max ?? MAX_TYPING_LINES;
  const maxLength = field.maxLength ?? MAX_TYPING_LINE_LENGTH;
  const initialLines: string[] = [];
  for (const rawLine of initialValue.split(';')) {
    const trimmedLine = rawLine.trim();
    if (trimmedLine && initialLines.length < maxLines) {
      initialLines.push(trimmedLine);
    }
  }
  if (initialLines.length === 0) {
    initialLines.push('');
  }
  const isSingleLine = initialLines.length <= 1;
  const rows: HtmlFragment[] = [];

  for (let i = 0; i < initialLines.length; i += 1) {
    const lineValue = initialLines[i] ?? '';
    const lineNumber = i + 1;
    rows.push(
      <div class="typing-line-row" data-typing-line-row={true}>
        <button
          type="button"
          class="typing-line-handle"
          data-typing-line-handle={true}
          aria-label={`Reorder line ${lineNumber} (drag or use Up and Down arrow keys)`}
          title="Drag or use arrow keys to reorder"
          disabled={isSingleLine}>
          <UiIcon slug="grip-vertical" size={13} extraClass="typing-line-grip" />
          <span class="typing-line-index" aria-hidden="true">
            {lineNumber}
          </span>
        </button>
        <input
          class="builder-input typing-line-input"
          type="text"
          value={lineValue}
          maxlength={maxLength}
          placeholder={i === 0 ? 'e.g., Full-Stack Developer' : `Line ${lineNumber}…`}
          aria-label={`Line ${lineNumber}`}
          aria-required={i === 0 && field.isRequired ? 'true' : undefined}
          spellcheck={false}
        />
        <button
          type="button"
          class="icon-select-clear typing-line-remove"
          data-typing-line-remove={true}
          aria-label={`Remove line ${lineNumber}`}
          title="Remove line"
          disabled={isSingleLine}>
          <UiIcon slug="x" size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      class="typing-lines-editor"
      id="typing-lines-editor"
      data-max-lines={maxLines}
      data-max-length={maxLength}>
      <input type="hidden" id={controlId} value={initialValue} />
      <div class="typing-lines-list" id="typing-lines-list">
        {rows}
      </div>
      <div class="builder-field-actions">
        <button
          type="button"
          class="btn-secondary btn-small"
          id="typing-line-add"
          disabled={initialLines.length >= maxLines}>
          <UiIcon slug="plus" size={14} />
          Add line
        </button>
      </div>
    </div>
  );
}

/** Render the left/right icon pair control of a badge, button, or service field. */
function renderIconPairControl(
  field: BuilderField,
  schema: BuilderSchema,
  initialValue: string
): HtmlFragment {
  const [initialLeft, initialRight] = splitIconPair(initialValue, Boolean(field.hasPresetValue));
  const initialMetric = resolveInitialServiceMetric(schema);
  return (
    <div class="builder-inline is-pair">
      {renderIconSelect({
        field,
        initialValue: initialLeft,
        isPresetDynamic: initialMetric?.hasDynamicIcon,
        part: 'left',
        presetIcon: initialMetric?.defaultIcon,
        sublabel: 'Left icon',
      })}
      {renderIconSelect({
        field,
        initialValue: initialRight,
        part: 'right',
        sublabel: 'Right icon',
      })}
    </div>
  );
}

/** Render the hint icon + text pair control on `/builder/typing`. */
function renderHintControl(field: BuilderField, initialValue: string): HtmlFragment {
  const textId = buildFieldId(field, 'text');
  const initialHint = splitHint(initialValue);
  return (
    <div class="builder-inline is-pair">
      {renderIconSelect({
        field,
        initialValue: initialHint.icon,
        part: 'icon',
        sublabel: 'Hint icon',
      })}
      <div class="builder-subfield is-grow">
        <label class="builder-sublabel" for={textId}>
          Hint text
        </label>
        <input
          class="builder-input"
          id={textId}
          type="text"
          data-part="text"
          value={initialHint.text || undefined}
          maxlength={field.maxLength}
          placeholder={field.placeholder}
          spellcheck={false}
        />
      </div>
    </div>
  );
}

/** Render a plain text, number, or textarea input control. */
function renderScalarInputControl(
  field: BuilderField,
  schema: BuilderSchema,
  controlId: string,
  initialValue: string,
  effectiveDefault: string,
  hintId: string | undefined
): HtmlFragment {
  if (field.control === 'number') {
    return (
      <input
        class="builder-input"
        id={controlId}
        type="number"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={initialValue}
        placeholder={field.placeholder}
        aria-describedby={hintId}
        inputmode="decimal"
      />
    );
  }
  if (field.control === 'textarea') {
    return (
      <textarea
        class="builder-input builder-textarea"
        id={controlId}
        rows="4"
        maxlength={field.maxLength}
        placeholder={field.placeholder}
        aria-describedby={hintId}
        aria-required={field.isRequired ? 'true' : undefined}>
        {initialValue}
      </textarea>
    );
  }
  const textPlaceholder =
    schema.kind === 'service' && field.id === 'label'
      ? effectiveDefault || field.placeholder
      : field.placeholder;
  return (
    <input
      class="builder-input"
      id={controlId}
      type="text"
      value={initialValue}
      maxlength={field.maxLength}
      placeholder={textPlaceholder}
      aria-describedby={hintId}
      aria-required={field.isRequired ? 'true' : undefined}
      spellcheck={false}
    />
  );
}

/** Render the control(s) of a builder field. */
function renderFieldControl(
  field: BuilderField,
  schema: BuilderSchema,
  hintId: string | undefined
): HtmlFragment {
  const controlId = buildFieldId(field);
  const initialValue = schema.initialState[field.id] ?? '';
  const effectiveDefault = resolveEffectiveFieldDefault(schema, schema.initialState, field);
  const selectedValue = initialValue || effectiveDefault;

  switch (field.control) {
    case 'anim': {
      return renderAnimControl(field, selectedValue);
    }
    case 'color': {
      return renderColorControl(field, schema, selectedValue, hintId);
    }
    case 'hint': {
      return renderHintControl(field, initialValue);
    }
    case 'icon': {
      return renderIconSelect({ field, hintId, initialValue, part: 'main' });
    }
    case 'iconPair': {
      return renderIconPairControl(field, schema, initialValue);
    }
    case 'select': {
      return renderCustomSelect(
        controlId,
        `${controlId}-label`,
        resolveSelectOptions(field, schema),
        selectedValue,
        undefined,
        hintId
      );
    }
    case 'size': {
      return renderSizeControl(field, selectedValue);
    }
    case 'special': {
      return renderSpecialControl(field, schema, selectedValue);
    }
    case 'stackGroups': {
      return renderStackGroupsControl(controlId, initialValue, field.isRequired);
    }
    case 'typingLines': {
      return renderTypingLinesControl(field, controlId, initialValue);
    }
    default: {
      return renderScalarInputControl(
        field,
        schema,
        controlId,
        initialValue,
        effectiveDefault,
        hintId
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
  const hintId = field.description ? `${controlId}-hint` : undefined;
  const isSingleControl = isSingleControlType(field.control);
  // Fields with a runtime requirement (service owners) get a hidden mark the builder script toggles:
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
          `${field.id}-help-trigger`,
          `${field.id}-syntax-help`,
          'Data widget syntax help',
          '',
          'start'
        )}
      </span>
    ) : (
      labelElement
    );
  // Dropdowns and the color radiogroup label themselves; other composite controls are labeled groups:
  const isGroup = !isSingleControl && !isSelfLabeledControlType(field.control);

  return (
    <div
      class="builder-field"
      data-field={field.id}
      data-control={field.control}
      role={isGroup ? 'group' : undefined}
      aria-labelledby={isGroup ? `${controlId}-label` : undefined}
      aria-describedby={isGroup ? hintId : undefined}>
      <div class="builder-label-row">
        {headingElement}
        {field.param ? <code class="builder-param">{`?${field.param}=`}</code> : undefined}
      </div>
      {renderFieldControl(field, schema, hintId)}
      {hintId ? (
        <p class="builder-hint" id={hintId}>
          {field.description}
        </p>
      ) : undefined}
    </div>
  );
}
