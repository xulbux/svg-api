/**
 * Builder schema – Declarative URL builder schemas for every element kind, generated from the constants the route parser and renderers use.
 *
 * Every option list (variants, colors, status presets, motions, widget kinds, size presets), numeric
 * range, and service preset is read from the code that parses or renders it, so the builder cannot
 * offer a value the API rejects. The schemas are embedded into the `/builder/:kind` pages and read by
 * the builder client script (`src/preview/scripts/builder.client.js`).
 */

import { listPublicServices, STATUS_PRESET_MAP } from '@/config/services';
import { DEFAULT_ENV, SITE_ORIGIN } from '@/config/site';
import { DOT_COLORS, THEME_COLOR_NAMES, THEMES } from '@/config/theme';
import { ICON_MOTION_TOKENS, SPECIAL_ELEMENT_KINDS, VARIANT_TOKENS } from '@/routes/params';
import {
  DEFAULT_VERTICAL_QUOTE_WIDTH,
  MAX_QUOTE_TEXT_LENGTH,
  QUOTE_FONT_SIZE_RANGE,
  QUOTE_SIZE_MAP,
  QUOTE_WIDTH_RANGE,
} from '@/svg/quote';
import {
  BUTTON_HEIGHT_RANGE,
  BUTTON_SIZE_PRESETS,
  ICON_SIZE_RANGE,
  ICON_STROKE_RANGE,
  MAX_LABEL_LENGTH,
  MAX_SPARKLINE_POINTS,
  MAX_STRIP_TICKS,
} from '@/svg/renderer';
import {
  STACK_GAP_RANGE,
  STACK_GROUP_GAP_RANGE,
  STACK_PER_LINE_RANGE,
  STACK_TILE_SIZE_RANGE,
} from '@/svg/stack';
import type {
  BadgeSpecialElement,
  BadgeVariant,
  BuilderAnimScope,
  BuilderField,
  BuilderKind,
  BuilderOption,
  BuilderSchema,
  BuilderServiceOption,
  BuilderTarget,
  NumericRange,
  ServiceDefinition,
} from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Visual hierarchy tier names of the shared variants. */
const VARIANT_LABELS: Readonly<Record<BadgeVariant, string>> = {
  1: 'Primary',
  2: 'Secondary',
  3: 'Tertiary',
};

/** Display labels and payload examples of the inline data widget kinds. */
const SPECIAL_KIND_DETAILS: Readonly<
  Record<BadgeSpecialElement['type'], { label: string; placeholder: string }>
> = {
  bar: { label: 'Progress bar', placeholder: '92' },
  delta: { label: 'Delta pill', placeholder: '+24%' },
  ring: { label: 'Donut ring', placeholder: '84' },
  sparkline: { label: 'Sparkline', placeholder: '22,19,21,17,15,16,14' },
  strip: { label: 'Uptime strip', placeholder: '9987998999' },
};

/** Example `/stack` groups the tech stack builder starts with. */
const EXAMPLE_STACK_GROUPS = 'html,css,js,ts:4|react,nodejs,docker:3';

/** Example quote text the quote card builder starts with. */
const EXAMPLE_QUOTE_TEXT =
  'Your quote goes here. Long quotes wrap onto multiple lines automatically.';

/** Memoized builder schemas keyed by element kind. */
const BUILDER_SCHEMA_CACHE = new Map<BuilderKind, BuilderSchema>();

// -------------------------------------- INTERNALS --------------------------------------

/** Capitalize the first character of a word (e.g., `'nudge'` -> `'Nudge'`). */
function capitalizeWord(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/** Build the leading "omit the parameter" option. */
function buildDefaultOption(label = 'Default'): BuilderOption {
  return { label, value: '' };
}

/** Build the `?variant=` field (every tier from the parser's `VARIANT_TOKENS`). */
function buildVariantField(): BuilderField {
  const options: BuilderOption[] = [buildDefaultOption()];
  for (const variant of VARIANT_TOKENS) {
    options.push({ label: `${variant} · ${VARIANT_LABELS[variant]}`, value: variant });
  }
  return { control: 'select', id: 'variant', label: 'Variant', options, param: 'variant' };
}

/** Build the `?color=` swatch field (every theme color with its Tailwind `500` swatch). */
function buildColorField(description?: string): BuilderField {
  const options: BuilderOption[] = [buildDefaultOption()];
  for (const colorName of THEME_COLOR_NAMES) {
    options.push({ label: colorName, swatch: THEMES[colorName].glowColor, value: colorName });
  }
  return { control: 'color', description, id: 'color', label: 'Color', options, param: 'color' };
}

/** Build the `?icon=left,right` icon pair field (`hasPresetValue`: An empty slug keeps the service preset icon). */
function buildIconPairField(description: string, hasPresetValue = false): BuilderField {
  return {
    control: 'iconPair',
    description,
    hasPresetValue,
    id: 'icon',
    label: 'Icons',
    param: 'icon',
    placeholder: hasPresetValue ? 'preset' : 'none',
  };
}

/** Build the `?dot=` status dot field (status presets and theme colors, plus `none` to remove a preset dot). */
function buildDotField(): BuilderField {
  const options: BuilderOption[] = [
    buildDefaultOption(),
    { label: 'none (remove preset dot)', value: 'none' },
  ];
  for (const [state, preset] of Object.entries(STATUS_PRESET_MAP)) {
    options.push({
      label: `${state} (status preset)`,
      swatch: DOT_COLORS[preset.dot],
      value: state,
    });
  }
  for (const colorName of THEME_COLOR_NAMES) {
    options.push({ label: colorName, swatch: DOT_COLORS[colorName], value: colorName });
  }
  return { control: 'select', id: 'dot', label: 'Status dot', options, param: 'dot' };
}

/** Build the `?special=` inline data widget field (every kind from the parser's `SPECIAL_ELEMENT_KINDS`). */
function buildSpecialField(): BuilderField {
  const options: BuilderOption[] = [buildDefaultOption('None')];
  for (const kind of SPECIAL_ELEMENT_KINDS) {
    options.push({ ...SPECIAL_KIND_DETAILS[kind], value: kind });
  }
  return {
    control: 'special',
    description: `Sparklines take 2 to ${MAX_SPARKLINE_POINTS} numbers, strips up to ${MAX_STRIP_TICKS} ticks from 0 to 9, bars and rings a percentage.`,
    id: 'special',
    label: 'Data widget',
    options,
    param: 'special',
  };
}

/** Build the `?anim=` field (motion options from the parser's `ICON_MOTION_TOKENS`). */
function buildAnimField(scope: BuilderAnimScope): BuilderField {
  const options: BuilderOption[] = [buildDefaultOption('Static')];
  if (scope !== 'sheen') {
    for (const motion of ICON_MOTION_TOKENS) {
      if (motion !== 'default') {
        options.push({ label: capitalizeWord(motion), value: motion });
      }
    }
  }
  const descriptions: Readonly<Record<BuilderAnimScope, string>> = {
    pair: 'Surface sheen plus one motion per icon; None also stops widget and dot animations.',
    sheen: 'Diagonal sheen sweep across the whole element.',
    single: 'Diagonal sheen plus one icon motion (Auto picks a motion per icon).',
  };
  return {
    animScope: scope,
    control: 'anim',
    description: descriptions[scope],
    id: 'anim',
    label: 'Animation',
    options,
    param: 'anim',
  };
}

/** Build a numeric query parameter field from a renderer range. */
function buildNumberField(
  id: string,
  label: string,
  range: NumericRange,
  extra: Partial<BuilderField> = {}
): BuilderField {
  return {
    control: 'number',
    id,
    label,
    max: range.max,
    min: range.min,
    param: id,
    placeholder: String(range.default),
    step: Number.isInteger(range.min) && Number.isInteger(range.max) ? 1 : 0.25,
    ...extra,
  };
}

/** Build a `?size=` field with named presets plus a custom value in `range`. */
function buildSizePresetField(
  presets: Readonly<Record<string, number>>,
  range: NumericRange,
  description: string
): BuilderField {
  const options: BuilderOption[] = [buildDefaultOption()];
  for (const [presetName, presetValue] of Object.entries(presets)) {
    options.push({ label: `${presetName} (${presetValue}px)`, value: presetName });
  }
  return {
    control: 'size',
    description,
    id: 'size',
    label: 'Size',
    max: range.max,
    min: range.min,
    options,
    param: 'size',
    placeholder: String(range.default),
    step: 1,
  };
}

/** Build the status preset options of the badge builder. */
function buildStatusOptions(): BuilderOption[] {
  const options: BuilderOption[] = [];
  for (const state of Object.keys(STATUS_PRESET_MAP)) {
    options.push({ label: capitalizeWord(state), value: state });
  }
  return options;
}

/** Build the owner segment placeholder of a service preset (default owner, optional, or required). */
function buildServiceOwnerHint(service: ServiceDefinition): string | undefined {
  if (service.ownerMode === 'none') {
    return undefined;
  }
  if (service.ownerMode === 'required') {
    return 'required';
  }
  const defaultOwner = service.defaultOwner?.(DEFAULT_ENV);
  return defaultOwner ? `${defaultOwner} (default)` : 'optional';
}

/** Build the service preset options of the service badge builder (public presets only). */
function buildServiceOptions(): BuilderServiceOption[] {
  const services: BuilderServiceOption[] = [];
  for (const [key, service] of listPublicServices()) {
    const metrics: BuilderOption[] = [];
    for (const [metric, config] of Object.entries(service.metrics)) {
      metrics.push({ label: `${metric} · ${config.defaultLabel}`, value: metric });
    }
    services.push({
      key,
      maxTargetSegments: service.maxTargetSegments ?? 1,
      metrics,
      ownerHint: buildServiceOwnerHint(service),
      ownerMode: service.ownerMode,
      ownerName: service.docs.ownerName,
      targetName: service.docs.targetName,
      title: service.docs.title,
    });
  }
  return services;
}

/** Build the badge builder fields (static and status presets share one builder). */
function buildBadgeFields(): BuilderField[] {
  const staticOnly = { field: 'type', values: ['static'] };
  const statusOnly = { field: 'type', values: ['status'] };
  return [
    {
      control: 'select',
      id: 'type',
      label: 'Badge type',
      options: [
        { label: 'Static badge (/badge/:label/:value)', value: 'static' },
        { label: 'Status preset (/badge/status/:state/:text)', value: 'status' },
      ],
    },
    {
      control: 'text',
      description: 'Leave empty for an icon + value badge.',
      id: 'label',
      label: 'Label',
      maxLength: MAX_LABEL_LENGTH,
      placeholder: 'build',
      showWhen: staticOnly,
    },
    {
      control: 'text',
      description: 'Leave empty for a single-part tag.',
      id: 'value',
      label: 'Value',
      maxLength: MAX_LABEL_LENGTH,
      placeholder: 'passing',
      showWhen: staticOnly,
    },
    {
      control: 'select',
      description: 'Sets the label, color, and pulsing radar dot.',
      id: 'state',
      label: 'Status',
      options: buildStatusOptions(),
      showWhen: statusOnly,
    },
    {
      control: 'text',
      id: 'text',
      isRequired: true,
      label: 'Status text',
      maxLength: MAX_LABEL_LENGTH,
      placeholder: 'operational',
      showWhen: statusOnly,
    },
    buildVariantField(),
    buildColorField(),
    buildIconPairField(
      'Left icon, right icon, or both; Leave the left one empty for a right-only icon.'
    ),
    buildDotField(),
    buildSpecialField(),
    buildAnimField('pair'),
  ];
}

/** Build the service badge builder fields. */
function buildServiceFields(): BuilderField[] {
  return [
    { control: 'select', id: 'service', label: 'Service', options: [] },
    { control: 'text', id: 'owner', label: 'Owner', placeholder: 'optional' },
    { control: 'text', id: 'target', isRequired: true, label: 'Target' },
    { control: 'select', id: 'metric', label: 'Metric', options: [] },
    {
      control: 'text',
      description: 'Overrides the preset label.',
      id: 'label',
      label: 'Label',
      maxLength: MAX_LABEL_LENGTH,
      param: 'label',
      placeholder: 'preset label',
    },
    buildVariantField(),
    buildColorField('Overrides the preset color.'),
    buildIconPairField(
      'Overrides the preset icon; Set only the right icon to keep the preset icon on the left, or pick No icon to remove it.',
      true
    ),
    buildDotField(),
    buildSpecialField(),
    buildAnimField('pair'),
  ];
}

/** Build the button builder fields. */
function buildButtonFields(): BuilderField[] {
  const presetHeights: Record<string, number> = {};
  for (const [presetName, preset] of Object.entries(BUTTON_SIZE_PRESETS)) {
    presetHeights[presetName] = preset.height;
  }
  return [
    {
      control: 'text',
      id: 'label',
      isRequired: true,
      label: 'Label',
      maxLength: MAX_LABEL_LENGTH,
      placeholder: 'Get Started',
    },
    {
      control: 'text',
      description: 'Optional second compartment (split button).',
      id: 'value',
      label: 'Value',
      maxLength: MAX_LABEL_LENGTH,
    },
    buildVariantField(),
    buildSizePresetField(
      presetHeights,
      BUTTON_HEIGHT_RANGE,
      'Height preset or custom pixel height.'
    ),
    buildColorField(),
    buildIconPairField('Leading icon, trailing icon, or both.'),
    buildDotField(),
    buildAnimField('pair'),
  ];
}

/** Build the standalone icon builder fields. */
function buildIconFields(): BuilderField[] {
  return [
    { control: 'icon', id: 'icon', isRequired: true, label: 'Icon' },
    buildNumberField('size', 'Size (px)', ICON_SIZE_RANGE),
    buildNumberField('stroke', 'Stroke width', ICON_STROKE_RANGE, {
      description: 'Applies to Lucide stroke icons only.',
    }),
    buildColorField(),
    buildAnimField('single'),
  ];
}

/** Build the tech stack builder fields. */
function buildStackFields(): BuilderField[] {
  return [
    {
      aliases: ['groups', 'icons', 'i'],
      control: 'stackGroups',
      description:
        'Comma-separated slugs; :N sets the columns of a group, | places groups side by side, and ; starts a new row band.',
      id: 'groups',
      isRequired: true,
      label: 'Icon groups',
    },
    buildVariantField(),
    buildColorField('Uniform tile color (defaults to each brand color).'),
    {
      control: 'text',
      description: `Fallback columns per row (${STACK_PER_LINE_RANGE.min} to ${STACK_PER_LINE_RANGE.max}), or one value per group (e.g., 8,6,4).`,
      id: 'perline',
      label: 'Columns',
      param: 'perline',
      placeholder: String(STACK_PER_LINE_RANGE.default),
    },
    buildNumberField('size', 'Tile size (px)', STACK_TILE_SIZE_RANGE),
    buildNumberField('gap', 'Gap (px)', STACK_GAP_RANGE),
    buildNumberField('groupgap', 'Group gap (px)', STACK_GROUP_GAP_RANGE, {
      aliases: ['ggap'],
      placeholder: 'auto',
    }),
    buildAnimField('sheen'),
  ];
}

/** Build the quote card builder fields. */
function buildQuoteFields(): BuilderField[] {
  return [
    {
      aliases: ['author'],
      control: 'text',
      id: 'author',
      label: 'Author',
      maxLength: MAX_LABEL_LENGTH,
      placeholder: 'optional',
    },
    {
      aliases: ['text', 'quote'],
      control: 'textarea',
      id: 'text',
      isRequired: true,
      label: 'Quote',
      maxLength: MAX_QUOTE_TEXT_LENGTH,
    },
    {
      aliases: ['type'],
      control: 'select',
      id: 'layout',
      label: 'Layout',
      options: [
        buildDefaultOption('Default (horizontal)'),
        { label: 'Horizontal (left accent bar)', value: 'horizontal' },
        { label: 'Vertical (centered watermarks)', value: 'vertical' },
      ],
      param: 'layout',
    },
    buildVariantField(),
    buildSizePresetField(
      QUOTE_SIZE_MAP,
      QUOTE_FONT_SIZE_RANGE,
      'Typography preset or custom font size.'
    ),
    buildColorField(),
    buildNumberField('width', 'Width (px)', QUOTE_WIDTH_RANGE, {
      description: `Defaults to ${QUOTE_WIDTH_RANGE.default}px (horizontal) or ${DEFAULT_VERTICAL_QUOTE_WIDTH}px (vertical).`,
      placeholder: 'auto',
    }),
    buildAnimField('sheen'),
  ];
}

/** Build the schema of one element kind. */
function buildBuilderSchema(kind: BuilderKind): BuilderSchema {
  const base = { isBrandFirst: false, kind, origin: SITE_ORIGIN };
  switch (kind) {
    case 'badge': {
      return {
        ...base,
        fields: buildBadgeFields(),
        initialState: {
          color: 'emerald',
          icon: 'circle-check',
          label: 'build',
          state: 'online',
          text: 'operational',
          type: 'static',
          value: 'passing',
        },
      };
    }
    case 'button': {
      return {
        ...base,
        fields: buildButtonFields(),
        initialState: { anim: 'sheen', icon: 'rocket,arrow-right', label: 'Get Started' },
      };
    }
    case 'icon': {
      return { ...base, fields: buildIconFields(), initialState: { icon: 'rocket', size: '48' } };
    }
    case 'quote': {
      return {
        ...base,
        fields: buildQuoteFields(),
        initialState: { author: 'Author', text: EXAMPLE_QUOTE_TEXT },
      };
    }
    case 'service': {
      return {
        ...base,
        fields: buildServiceFields(),
        initialState: { metric: 'v', service: 'npm', target: 'react' },
        services: buildServiceOptions(),
      };
    }
    case 'stack': {
      return {
        ...base,
        fields: buildStackFields(),
        initialState: { groups: EXAMPLE_STACK_GROUPS },
        isBrandFirst: true,
      };
    }
    default: {
      return { ...base, fields: [], initialState: {} };
    }
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build (once per isolate) the URL builder schema of an element kind.
 * @param kind   Builder element kind.
 * @returns Builder schema (fields, example state, and service presets).
 */
export function getBuilderSchema(kind: BuilderKind): BuilderSchema {
  let schema = BUILDER_SCHEMA_CACHE.get(kind);
  if (!schema) {
    schema = buildBuilderSchema(kind);
    BUILDER_SCHEMA_CACHE.set(kind, schema);
  }
  return schema;
}

/**
 * Resolve the builder that edits a documented SVG path ("Open in Builder" preview links).
 * @param path   Root-relative path and query string (e.g., `'/badge/pypi/xulbux/v'`).
 * @returns Builder kind and prefilled builder URL, or `undefined` for paths no builder can edit (e.g., owner-restricted services).
 */
export function resolveBuilderTarget(path: string): BuilderTarget | undefined {
  const pathname = path.split('?', 1)[0] ?? '';
  const [, prefix = '', first = '', ...rest] = pathname.split('/');
  let kind: BuilderKind | undefined = undefined;
  switch (prefix) {
    case 'badge': {
      const firstLower = first.toLowerCase();
      const isServicePath = rest.length >= 2 && firstLower !== 'status';
      if (!isServicePath) {
        kind = 'badge';
      } else if (listPublicServices().some(([key]) => key === firstLower)) {
        kind = 'service';
      }
      break;
    }
    case 'btn':
    case 'button': {
      kind = 'button';
      break;
    }
    case 'icon':
    case 'quote':
    case 'stack': {
      kind = prefix;
      break;
    }
    default: {
      break;
    }
  }
  return kind ? { href: `/builder/${kind}?path=${encodeURIComponent(path)}`, kind } : undefined;
}
