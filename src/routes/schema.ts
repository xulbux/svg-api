/**
 * Builder schema – Declarative URL builder schemas for every element kind, generated from the constants the route parser and renderers use.
 *
 * Every option list (variants, colors, motions, widget kinds, size presets), numeric
 * range, and service preset is read from the code that parses or renders it, so the builder cannot
 * offer a value the API rejects. The schemas are embedded into the `/builder/:kind` pages and read by
 * the builder client script (`src/site/client/bundles/builder.client.js`).
 */

import { listPublicServices, resolveServiceOwnerMode } from '@/config/services';
import { DEFAULT_ENV, SITE_ORIGIN } from '@/config/site';
import { DOT_COLORS, THEME_COLOR_NAMES, THEMES } from '@/config/theme';
import { ICON_MOTION_TOKENS, SPECIAL_ELEMENT_KINDS, VARIANT_TOKENS } from '@/routes/params';
import { resolveSvgRoute } from '@/routes/svg';
import { listServiceMetricAliases } from '@/services/fetcher';
import { capitalizeWord, SPECIAL_KIND_DETAILS, VARIANT_TIERS } from '@/site/glossary';
import { MAX_ICON_SLUG_LENGTH } from '@/svg/icons';
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
} from '@/svg/renderer';
import {
  STACK_GAP_RANGE,
  STACK_GROUP_GAP_RANGE,
  STACK_PER_LINE_RANGE,
  STACK_TILE_SIZE_RANGE,
} from '@/svg/stack';
import type {
  BuilderAnimScope,
  BuilderField,
  BuilderKind,
  BuilderOption,
  BuilderSchema,
  BuilderServiceMetric,
  BuilderServiceOption,
  BuilderTarget,
  NumericRange,
  ServiceDefinition,
  ServiceMetricConfig,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Owner and target values of one redirect template probe. */
interface RedirectProbe {
  /** Effective owner passed to `buildRedirectUrl`. */
  owner: string;
  /** Target passed to `buildRedirectUrl`. */
  target: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Example `/stack` groups the tech stack builder starts with. */
const EXAMPLE_STACK_GROUPS = 'js,ts,html,css|react,vue,tailwind';

/** Example quote text the quote card builder starts with. */
const EXAMPLE_QUOTE_TEXT =
  'Your quote goes here. Long quotes wrap onto multiple lines automatically.';

/** Owner placeholder of upstream redirect templates. */
const REDIRECT_OWNER_PLACEHOLDER = '{owner}';

/** Target placeholder of upstream redirect templates. */
const REDIRECT_TARGET_PLACEHOLDER = '{target}';

/** Unique values substituted by the redirect template placeholders while deriving a template. */
const REDIRECT_TEMPLATE_PROBE: RedirectProbe = { owner: 'zqownerzq', target: 'zqtargetzq' };

/** Explicit owner used to verify a derived redirect template (mixed case catches case transforms). */
const REDIRECT_VERIFY_OWNER = 'Owner-1';

/** Single-segment target used to verify a derived redirect template. */
const REDIRECT_VERIFY_TARGET = 'Pkg.Name_2';

/** Multi-segment target used to verify the redirect templates of multi-segment services. */
const REDIRECT_VERIFY_PATH_TARGET = 'Host.example/a-B/c_d';

/** Memoized builder schemas keyed by element kind. */
const BUILDER_SCHEMA_CACHE = new Map<BuilderKind, BuilderSchema>();

/** Memoized public service keys (`undefined` until first used). */
let publicServiceKeysCache: ReadonlySet<string> | undefined = undefined;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches owner and target segments the derived redirect templates are verified for (word characters, `.`, `-`). */
const REDIRECT_SAFE_VALUE_RX = /^[\w.-]+$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Build the leading "omit the parameter" option. */
function buildDefaultOption(label = 'Default'): BuilderOption {
  return { label, value: '' };
}

/** Build the `?variant=` field (every tier from the parser's `VARIANT_TOKENS`). */
function buildVariantField(): BuilderField {
  const options: BuilderOption[] = [buildDefaultOption()];
  for (const variant of VARIANT_TOKENS) {
    options.push({ label: `${variant} · ${VARIANT_TIERS[variant].name}`, value: variant });
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

/** Build the `?dot=` status dot field (theme colors, with `None` as the default). */
function buildDotField(): BuilderField {
  const options: BuilderOption[] = [{ aliases: ['none'], label: 'None', value: '' }];
  for (const colorName of THEME_COLOR_NAMES) {
    options.push({ label: colorName, swatch: DOT_COLORS[colorName], value: colorName });
  }
  return { control: 'select', id: 'dot', label: 'Status dot', options, param: 'dot' };
}

/** Build the `?special=` inline data widget field (every kind from the parser's `SPECIAL_ELEMENT_KINDS`). */
function buildSpecialField(hasPresetValue = false): BuilderField {
  const defaultDescription = hasPresetValue
    ? 'Auto-marked widgets use live upstream data when Data is left empty.'
    : 'Optional inline chart, gauge, or delta pill next to the badge value.';
  const options: BuilderOption[] = hasPresetValue
    ? [
        { ...buildDefaultOption(), description: defaultDescription },
        {
          description: 'Hides any default inline widget of the selected metric.',
          label: 'none (remove preset widget)',
          value: 'none',
        },
      ]
    : [{ ...buildDefaultOption('None'), description: defaultDescription }];
  for (const kind of SPECIAL_ELEMENT_KINDS) {
    const detail = SPECIAL_KIND_DETAILS[kind];
    const modifiers: BuilderOption[] = [];
    if (detail.modifiers.length > 0) {
      modifiers.push(buildDefaultOption());
      for (const modifier of detail.modifiers) {
        modifiers.push({ label: capitalizeWord(modifier), value: modifier });
      }
    }
    options.push({
      description: detail.description,
      label: detail.label,
      modifiers,
      placeholder: detail.example,
      value: kind,
    });
  }
  return {
    control: 'special',
    description: defaultDescription,
    hasPresetValue,
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

/** Build the owner segment placeholder of a service preset (default owner, optional, or required). */
function buildServiceOwnerHint(service: ServiceDefinition): string | undefined {
  const { owner } = service.route;
  if (!owner) {
    return undefined;
  }
  if (owner.isRequired) {
    return 'required';
  }
  const defaultOwner = owner.resolveDefault?.(DEFAULT_ENV);
  return defaultOwner ? `${defaultOwner} (default)` : 'optional';
}

/** Fill the `{owner}` and `{target}` placeholders of a redirect template. */
function fillRedirectTemplate(template: string, probe: RedirectProbe): string {
  return template
    .replaceAll(REDIRECT_OWNER_PLACEHOLDER, probe.owner)
    .replaceAll(REDIRECT_TARGET_PLACEHOLDER, probe.target);
}

/** Collect the probes a derived redirect template must reproduce (explicit, default, and missing owners; Single- and multi-segment targets). */
function collectRedirectProbes(
  service: ServiceDefinition,
  defaultOwner: string | undefined
): RedirectProbe[] {
  const owners: string[] = [];
  const ownerMode = resolveServiceOwnerMode(service);
  if (ownerMode === 'none') {
    owners.push(defaultOwner ?? '');
  } else {
    owners.push(REDIRECT_VERIFY_OWNER);
    if (defaultOwner !== undefined || ownerMode === 'optional') {
      owners.push(defaultOwner ?? '');
    }
  }
  const targets = [REDIRECT_VERIFY_TARGET];
  if ((service.route.target.maxSegments ?? 1) > 1) {
    targets.push(REDIRECT_VERIFY_PATH_TARGET);
  }
  const probes: RedirectProbe[] = [];
  for (const owner of owners) {
    for (const target of targets) {
      probes.push({ owner, target });
    }
  }
  return probes;
}

/**
 * Derive the upstream page URL template of a metric by substituting unique probe values, then verify it
 * against every probe (conditional or transforming URL builders yield no template).
 */
function deriveRedirectTemplate(
  metric: ServiceMetricConfig,
  service: ServiceDefinition,
  defaultOwner: string | undefined
): string | undefined {
  const { buildPageUrl } = metric.endpoint;
  const derivationOwner =
    service.route.owner === undefined ? (defaultOwner ?? '') : REDIRECT_TEMPLATE_PROBE.owner;
  const template = buildPageUrl({ owner: derivationOwner, target: REDIRECT_TEMPLATE_PROBE.target })
    .replaceAll(REDIRECT_TEMPLATE_PROBE.owner, REDIRECT_OWNER_PLACEHOLDER)
    .replaceAll(REDIRECT_TEMPLATE_PROBE.target, REDIRECT_TARGET_PLACEHOLDER);
  if (!template.includes(REDIRECT_TARGET_PLACEHOLDER)) {
    return undefined;
  }
  for (const probe of collectRedirectProbes(service, defaultOwner)) {
    if (buildPageUrl(probe) !== fillRedirectTemplate(template, probe)) {
      return undefined;
    }
  }
  return template;
}

/** Build the service preset options of the service badge builder (public presets only). */
function buildServiceOptions(): BuilderServiceOption[] {
  const services: BuilderServiceOption[] = [];
  for (const [key, service] of listPublicServices()) {
    const { owner, target } = service.route;
    const defaultOwner = owner?.resolveDefault?.(DEFAULT_ENV) || undefined;
    const metrics: BuilderServiceMetric[] = [];
    for (const [metric, config] of Object.entries(service.metrics)) {
      metrics.push({
        autoSpecials: config.autoSpecials,
        defaultSpecial: config.defaultSpecial,
        label: `${metric} · ${config.defaultLabel}`,
        redirect: deriveRedirectTemplate(config, service, defaultOwner),
        value: metric,
      });
    }
    services.push({
      defaultOwner,
      key,
      maxTargetSegments: target.maxSegments ?? 1,
      metricAliases: Object.fromEntries(listServiceMetricAliases(service)),
      metrics,
      ownerHint: buildServiceOwnerHint(service),
      ownerMode: resolveServiceOwnerMode(service),
      ownerName: owner?.placeholder,
      targetName: target.placeholder,
      title: service.docs.title,
    });
  }
  return services;
}

/** Collect (once per isolate) the route keys of every public service preset. */
function getPublicServiceKeys(): ReadonlySet<string> {
  if (publicServiceKeysCache === undefined) {
    const keys = new Set<string>();
    for (const [key] of listPublicServices()) {
      keys.add(key);
    }
    publicServiceKeysCache = keys;
  }
  return publicServiceKeysCache;
}

/** Build the badge builder fields. */
function buildBadgeFields(): BuilderField[] {
  return [
    {
      control: 'text',
      description: 'Leave empty for an icon + value badge.',
      id: 'label',
      label: 'Label',
      maxLength: MAX_LABEL_LENGTH,
      placeholder: 'Build',
    },
    {
      control: 'text',
      description: 'Leave empty for a single-part tag.',
      id: 'value',
      label: 'Value',
      maxLength: MAX_LABEL_LENGTH,
      placeholder: 'Passing',
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
    {
      control: 'select',
      description:
        'Services and metrics marked Auto offer automatic data widgets from live upstream data.',
      id: 'service',
      label: 'Service',
      options: [],
    },
    {
      control: 'text',
      hasDynamicRequirement: true,
      id: 'owner',
      label: 'Owner',
      placeholder: 'optional',
    },
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
    buildSpecialField(true),
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

/** Build the tech stack builder fields (`aliases` lists the query fallbacks of the path segment in Worker precedence). */
function buildStackFields(): BuilderField[] {
  return [
    {
      aliases: ['groups', 'icons', 'i'],
      control: 'stackGroups',
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

/** Build the quote card builder fields (`aliases` of path segment fields list their query fallbacks). */
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
        { aliases: ['center', 'v'], label: 'Vertical (centered watermarks)', value: 'vertical' },
      ],
      param: 'layout',
    },
    buildVariantField(),
    buildSizePresetField(
      QUOTE_SIZE_MAP,
      QUOTE_FONT_SIZE_RANGE,
      'Typography preset or custom font size (defaults to md, or lg for vertical cards).'
    ),
    buildColorField(),
    buildNumberField('width', 'Width (px)', QUOTE_WIDTH_RANGE, {
      description: `Defaults to ${QUOTE_WIDTH_RANGE.default}px (horizontal) or ${DEFAULT_VERTICAL_QUOTE_WIDTH}px (vertical) and grows with text sizes above the layout's default.`,
      placeholder: 'auto',
    }),
    buildAnimField('sheen'),
  ];
}

/** Build the schema of one element kind. */
function buildBuilderSchema(kind: BuilderKind): BuilderSchema {
  const base = {
    isBrandFirst: false,
    kind,
    maxIconSlugLength: MAX_ICON_SLUG_LENGTH,
    origin: SITE_ORIGIN,
  };
  switch (kind) {
    case 'badge': {
      return {
        ...base,
        fields: buildBadgeFields(),
        initialState: { color: 'emerald', icon: 'circle-check', label: 'Build', value: 'Passing' },
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
        redirectValuePattern: REDIRECT_SAFE_VALUE_RX.source,
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
  if (!URL.canParse(path, SITE_ORIGIN)) {
    return undefined;
  }
  const url = new URL(path, SITE_ORIGIN);
  const match = resolveSvgRoute(url);
  if (!match) {
    return undefined;
  }
  let kind: BuilderKind | undefined = undefined;
  if (match.kind === 'service') {
    if (getPublicServiceKeys().has(match.request.service)) {
      kind = 'service';
    }
  } else {
    const prefix = url.pathname.split('/', 2)[1] ?? '';
    switch (prefix) {
      case 'badge': {
        kind = 'badge';
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
  }
  return kind ? { href: `/builder/${kind}?path=${encodeURIComponent(path)}`, kind } : undefined;
}
