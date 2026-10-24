/**
 * Builder schema – Declarative URL builder schemas for every element kind, generated from the constants the route parser and renderers use.
 *
 * Every option list, numeric range, and service preset is read directly from the code that parses or
 * renders it, so the builder cannot offer a value the API rejects.
 */

import { resolveServiceOwnerMode, SERVICES_CONFIG } from '@/config/services';
import { SITE_ORIGIN } from '@/config/site';
import { DEFAULT_THEME_COLOR, DOT_COLORS, THEME_COLOR_NAMES, THEMES } from '@/config/theme';
import {
  ACTIVE_STACK_MOTION_TOKENS,
  FALSY_FLAG_LIST,
  ICON_MOTION_ALIASES,
  ICON_MOTION_TOKENS,
  QUOTE_LAYOUT_TOKENS,
  SPECIAL_ELEMENT_KINDS,
  STACK_MOTION_ALIASES,
  TRUTHY_FLAG_LIST,
  TYPING_ALIGN_MAP,
  TYPING_ALIGN_TOKENS,
  TYPING_CURSOR_MAP,
  TYPING_CURSOR_TOKENS,
  TYPING_ERASE_MAP,
  TYPING_ERASE_TOKENS,
  TYPING_FONT_MAP,
  TYPING_FONT_TOKENS,
  TYPING_LAYOUT_MAP,
  TYPING_LAYOUT_TOKENS,
  VARIANT_TOKENS,
  VERTICAL_LAYOUT_TOKENS,
} from '@/routes/params';
import {
  DEFAULT_BADGE_VARIANT,
  DEFAULT_BUTTON_VARIANT,
  DEFAULT_QUOTE_VARIANT,
  DEFAULT_STACK_VARIANT,
  DEFAULT_TYPING_VARIANT,
  findSvgRoute,
  resolveSvgRoute,
} from '@/routes/svg';
import { listServiceMetricAliases } from '@/services/fetcher';
import {
  capitalizeWord,
  collectAliasesForTarget,
  formatConjunctionList,
  SPECIAL_KIND_DETAILS,
  VARIANT_TIERS,
} from '@/site/glossary';
import { MAX_ICON_SLUG_LENGTH } from '@/svg/icons';
import {
  DEFAULT_HORIZONTAL_QUOTE_SIZE,
  DEFAULT_QUOTE_LAYOUT,
  DEFAULT_VERTICAL_QUOTE_SIZE,
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
import { getOwnValue } from '@/svg/shared';
import {
  STACK_GAP_RANGE,
  STACK_GROUP_GAP_RANGE,
  STACK_PER_LINE_RANGE,
  STACK_TILE_SIZE_RANGE,
} from '@/svg/stack';
import {
  DEFAULT_IDE_TITLE,
  DEFAULT_LAYOUT_FONTS,
  DEFAULT_TYPING_CURSOR,
  DEFAULT_TYPING_ERASE,
  DEFAULT_TYPING_LAYOUT,
  DEFAULT_WINDOW_PROMPT,
  MAX_TYPING_HINT_LENGTH,
  MAX_TYPING_LINE_LENGTH,
  MAX_TYPING_LINES,
  MAX_TYPING_PREFIX_LENGTH,
  MAX_TYPING_TITLE_LENGTH,
  TYPING_DURATION_RANGE,
  TYPING_FONT_SIZE_RANGE,
  TYPING_PAUSE_RANGE,
  TYPING_SIZE_MAP,
  TYPING_WIDTH_RANGE,
} from '@/svg/typing';
import type {
  BadgeVariant,
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
  ServiceRequest,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Options for `buildColorField`. */
interface ColorFieldOptions {
  /** Effective default value (`DEFAULT_THEME_COLOR` when `leadingLabel` is omitted). */
  defaultValue?: string;
  /** Optional helper description below the swatch picker. */
  description?: string;
  /** Optional leading non-theme swatch label (e.g., `'Auto'` or `'Brand colors'`). */
  leadingLabel?: string;
}

/** Owner and target values of one redirect template probe. */
interface RedirectProbe {
  /** Effective owner passed to `buildPageUrl`. */
  owner: string;
  /** Target passed to `buildPageUrl`. */
  target: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Example `/stack` groups the tech stack builder starts with. */
const EXAMPLE_STACK_GROUPS = 'js,ts,html,css|react,vue,tailwind';

/** Example quote text the quote card builder starts with. */
const EXAMPLE_QUOTE_TEXT =
  'Your quote goes here. Long quotes wrap onto multiple lines automatically.';

/** Example `;`-separated lines the typing animation builder starts with. */
const EXAMPLE_TYPING_LINES =
  'Full-Stack Developer;Design-Driven Engineering;Edge Systems Architect';

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

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches owner and target segments the derived redirect templates are verified for (word characters, `.`, `-`). */
const REDIRECT_SAFE_VALUE_RX = /^[\w.-]+$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Build the leading "omit the parameter" option. */
function buildDefaultOption(label = 'Default'): BuilderOption {
  return { label, value: '' };
}

/** Return sorted aliases for `targetValue`, or `undefined` when none exist. */
function collectAliasesForValue(
  aliasMap: Readonly<Record<string, string>>,
  targetValue: string
): string[] | undefined {
  const aliases = collectAliasesForTarget(aliasMap, targetValue);
  return aliases.length > 0 ? aliases : undefined;
}

/** Build `BuilderOption[]` from canonical tokens, their alias map, and an optional label formatter. */
function buildMappedOptions<T extends string>(
  tokens: readonly T[],
  aliasMap: Readonly<Record<string, T>>,
  formatLabel: (token: T) => string = capitalizeWord
): BuilderOption[] {
  const options: BuilderOption[] = [];
  for (const token of tokens) {
    options.push({
      aliases: collectAliasesForValue(aliasMap, token),
      label: formatLabel(token),
      value: token,
    });
  }
  return options;
}

/** Build the `?variant=` field. */
function buildVariantField(defaultValue: BadgeVariant = DEFAULT_BADGE_VARIANT): BuilderField {
  const options: BuilderOption[] = [];
  for (const variant of VARIANT_TOKENS) {
    options.push({ label: `${variant} · ${VARIANT_TIERS[variant].name}`, value: variant });
  }
  return {
    control: 'select',
    defaultValue,
    id: 'variant',
    label: 'Variant',
    options,
    param: 'variant',
  };
}

/** Build the `?color=` swatch field. */
function buildColorField(fieldOptions: ColorFieldOptions = {}): BuilderField {
  const { defaultValue, description, leadingLabel } = fieldOptions;
  const options: BuilderOption[] = leadingLabel ? [buildDefaultOption(leadingLabel)] : [];
  for (const colorName of THEME_COLOR_NAMES) {
    options.push({ label: colorName, swatch: THEMES[colorName].glowColor, value: colorName });
  }
  return {
    control: 'color',
    defaultValue: leadingLabel ? defaultValue : (defaultValue ?? DEFAULT_THEME_COLOR),
    description,
    id: 'color',
    label: 'Color',
    options,
    param: 'color',
  };
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
    placeholder: 'none',
  };
}

/** Build the `?dot=` status dot field. */
function buildDotField(hasDynamicPreset = false): BuilderField {
  const options: BuilderOption[] = hasDynamicPreset
    ? [buildDefaultOption('Auto'), { label: 'None', value: 'none' }]
    : [{ aliases: ['none'], label: 'None', value: '' }];
  for (const colorName of THEME_COLOR_NAMES) {
    options.push({ label: colorName, swatch: DOT_COLORS[colorName], value: colorName });
  }
  return {
    control: 'select',
    defaultValue: hasDynamicPreset ? undefined : '',
    id: 'dot',
    label: 'Status dot',
    options,
    param: 'dot',
  };
}

/** Build the `?special=` inline data widget field. */
function buildSpecialField(hasPresetValue = false): BuilderField {
  const defaultDescription = hasPresetValue
    ? 'Auto-marked widgets use live upstream data when Data is left empty.'
    : 'Optional inline chart, gauge, or delta pill next to the badge value.';
  const options: BuilderOption[] = hasPresetValue
    ? [{ description: 'Hides any inline widget on the badge.', label: 'None', value: 'none' }]
    : [{ ...buildDefaultOption('None'), description: defaultDescription }];
  for (const kind of SPECIAL_ELEMENT_KINDS) {
    const detail = SPECIAL_KIND_DETAILS[kind];
    const modifiers: BuilderOption[] = [];
    if (detail.modifiers.length > 0) {
      modifiers.push(buildDefaultOption(detail.defaultModifierLabel ?? 'Default'));
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
    defaultValue: hasPresetValue ? undefined : '',
    description: defaultDescription,
    hasPresetValue,
    id: 'special',
    label: 'Data widget',
    options,
    param: 'special',
  };
}

/** Build the `?anim=` field. */
function buildAnimField(scope: BuilderAnimScope): BuilderField {
  const options: BuilderOption[] = [];
  if (scope === 'pair' || scope === 'single') {
    const isNoneOmitted = scope === 'single';
    options.push(
      isNoneOmitted
        ? { aliases: ['none'], label: 'Static', value: '' }
        : buildDefaultOption('Static')
    );
    for (const motion of ICON_MOTION_TOKENS) {
      if (motion !== 'default' && (!isNoneOmitted || motion !== 'none')) {
        options.push({
          aliases: collectAliasesForValue(ICON_MOTION_ALIASES, motion),
          label: capitalizeWord(motion),
          value: motion,
        });
      }
    }
  } else if (scope === 'stack') {
    options.push({ aliases: ['none'], label: 'Static', value: '' });
    for (const motion of ACTIVE_STACK_MOTION_TOKENS) {
      options.push({
        aliases: collectAliasesForValue(STACK_MOTION_ALIASES, motion),
        label: capitalizeWord(motion),
        value: motion,
      });
    }
  } else if (scope === 'typing') {
    options.push(buildDefaultOption('Typing'), { label: 'Static (none)', value: 'none' });
  } else {
    options.push(buildDefaultOption('Static'));
  }
  const descriptions: Readonly<Record<BuilderAnimScope, string>> = {
    pair: 'Surface sheen plus one motion per icon; None also stops widget and dot animations.',
    sheen: 'Diagonal sheen sweep across the whole element.',
    single: 'Diagonal sheen plus one icon motion (Auto picks a motion per icon).',
    stack: `Diagonal sheen sweep and/or staggered per-tile ${formatConjunctionList(ACTIVE_STACK_MOTION_TOKENS, 'or')} motion.`,
    typing: 'Diagonal sheen sweep or static reduced-motion snapshot (none).',
  };
  return {
    animScope: scope,
    control: 'anim',
    defaultValue: '',
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
  const isAutoComputed = extra.placeholder === 'auto';
  return {
    control: 'number',
    defaultValue: isAutoComputed ? undefined : String(range.default),
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
  defaultValue: string,
  description: string,
  layoutDefaults?: Readonly<Record<string, string>>
): BuilderField {
  const options: BuilderOption[] = [];
  for (const [presetName, presetValue] of Object.entries(presets)) {
    options.push({ label: `${presetName} (${presetValue}px)`, value: presetName });
  }
  return {
    control: 'size',
    defaultValue,
    description,
    id: 'size',
    label: 'Size',
    layoutDefaults,
    max: range.max,
    min: range.min,
    options,
    param: 'size',
    placeholder: String(range.default),
    step: 1,
  };
}

/** Build the owner segment placeholder of a service preset (default owner, optional, or required). */
function buildServiceOwnerHint(
  service: ServiceDefinition,
  defaultOwner: string | undefined
): string | undefined {
  const { owner } = service.route;
  if (!owner) {
    return undefined;
  }
  if (owner.isRequired) {
    return 'required';
  }
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

/** Build the service preset options of the service badge builder. */
function buildServiceOptions(): BuilderServiceOption[] {
  const services: BuilderServiceOption[] = [];
  for (const [key, service] of Object.entries(SERVICES_CONFIG)) {
    const { owner, target } = service.route;
    const defaultOwner = owner?.defaultValue || undefined;
    const metrics: BuilderServiceMetric[] = [];
    for (const [metric, config] of Object.entries(service.metrics)) {
      metrics.push({
        autoSpecials: config.autoSpecials,
        defaultColor: config.defaultColor,
        defaultIcon: config.defaultIcon,
        defaultLabel: config.defaultLabel,
        defaultSpecial: config.defaultSpecial,
        hasDynamicColor: config.hasDynamicColor,
        hasDynamicDot: config.hasDynamicDot,
        hasDynamicIcon: config.hasDynamicIcon,
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
      ...(target.minSegments && target.minSegments > 1
        ? { minTargetSegments: target.minSegments }
        : {}),
      ownerHint: buildServiceOwnerHint(service, defaultOwner),
      ownerMode: resolveServiceOwnerMode(service),
      ownerName: owner?.placeholder,
      targetName: target.placeholder,
      title: service.docs.title,
    });
  }

  return services;
}

/** Check whether a parsed service request matches the service's required/optional owner and target segment arity. */
function isEditableServiceRequest(request: ServiceRequest): boolean {
  const service = getOwnValue(SERVICES_CONFIG, request.service);
  if (!service || !request.target) {
    return false;
  }
  const { maxSegments = 1, minSegments = 1 } = service.route.target;
  const targetSegments = request.target.split('/');
  if (
    targetSegments.length < minSegments ||
    targetSegments.length > maxSegments ||
    targetSegments.includes('')
  ) {
    return false;
  }
  const ownerMode = resolveServiceOwnerMode(service);
  if (ownerMode === 'none') {
    return request.owner === undefined;
  }
  if (ownerMode === 'required') {
    return Boolean(request.owner);
  }
  return true;
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
    buildVariantField(DEFAULT_BADGE_VARIANT),
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
    buildVariantField(DEFAULT_BADGE_VARIANT),
    buildColorField({ description: 'Overrides the preset color.', leadingLabel: 'Auto' }),
    buildIconPairField(
      'Overrides the preset icon; Set only the right icon to keep the preset icon on the left, or clear the left icon to hide it.',
      true
    ),
    buildDotField(true),
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
    buildVariantField(DEFAULT_BUTTON_VARIANT),
    buildColorField(),
    buildSizePresetField(
      presetHeights,
      BUTTON_HEIGHT_RANGE,
      'md',
      'Height preset or custom pixel height.'
    ),
    buildIconPairField('Leading icon, trailing icon, or both.'),
    buildAnimField('pair'),
  ];
}

/** Build the standalone icon builder fields. */
function buildIconFields(): BuilderField[] {
  return [
    { control: 'icon', id: 'icon', isRequired: true, label: 'Icon' },
    buildColorField(),
    buildNumberField('size', 'Size (px)', ICON_SIZE_RANGE),
    buildNumberField('stroke', 'Stroke width', ICON_STROKE_RANGE, {
      description: 'Applies to UI stroke icons only.',
    }),
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
    buildVariantField(DEFAULT_STACK_VARIANT),
    buildColorField({
      defaultValue: '',
      description: 'Uniform tile color (defaults to each brand color).',
      leadingLabel: 'Brand colors',
    }),
    {
      control: 'text',
      defaultValue: String(STACK_PER_LINE_RANGE.default),
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
    buildAnimField('stack'),
  ];
}

/** Build the quote card builder fields (`aliases` of path segment fields list their query fallbacks). */
function buildQuoteFields(): BuilderField[] {
  const verticalAliases = [...VERTICAL_LAYOUT_TOKENS]
    .filter((token) => token !== 'vertical')
    .toSorted();
  const layoutOptions: BuilderOption[] = [];
  for (const layoutToken of QUOTE_LAYOUT_TOKENS) {
    layoutOptions.push({
      aliases: layoutToken === 'vertical' ? verticalAliases : undefined,
      label: capitalizeWord(layoutToken),
      value: layoutToken,
    });
  }
  return [
    {
      aliases: ['text', 'quote'],
      control: 'textarea',
      id: 'text',
      isRequired: true,
      label: 'Quote',
      maxLength: MAX_QUOTE_TEXT_LENGTH,
    },
    {
      aliases: ['author'],
      control: 'text',
      id: 'author',
      label: 'Author',
      maxLength: MAX_LABEL_LENGTH,
      placeholder: 'optional',
    },
    {
      aliases: ['type'],
      control: 'select',
      defaultValue: DEFAULT_QUOTE_LAYOUT,
      id: 'layout',
      label: 'Layout',
      options: layoutOptions,
      param: 'layout',
    },
    buildVariantField(DEFAULT_QUOTE_VARIANT),
    buildColorField(),
    buildSizePresetField(
      QUOTE_SIZE_MAP,
      QUOTE_FONT_SIZE_RANGE,
      DEFAULT_HORIZONTAL_QUOTE_SIZE,
      `Typography preset or custom font size (defaults to ${DEFAULT_HORIZONTAL_QUOTE_SIZE}, or ${DEFAULT_VERTICAL_QUOTE_SIZE} for vertical cards).`,
      { horizontal: DEFAULT_HORIZONTAL_QUOTE_SIZE, vertical: DEFAULT_VERTICAL_QUOTE_SIZE }
    ),
    buildNumberField('width', 'Width (px)', QUOTE_WIDTH_RANGE, {
      description: `Defaults to ${QUOTE_WIDTH_RANGE.default}px (horizontal) or ${DEFAULT_VERTICAL_QUOTE_WIDTH}px (vertical) and grows with text sizes above the layout's default.`,
      placeholder: 'auto',
    }),
    buildAnimField('sheen'),
  ];
}

/** Build the typing animation builder fields (`aliases` of path segment fields list their query fallbacks). */
function buildTypingFields(): BuilderField[] {
  const layoutLabels: Readonly<Record<(typeof TYPING_LAYOUT_TOKENS)[number], string>> = {
    browser: 'Browser',
    ide: 'IDE',
    none: 'None',
    prompt: 'Prompt',
    window: 'Window',
  };
  const layoutOptions = buildMappedOptions(
    TYPING_LAYOUT_TOKENS,
    TYPING_LAYOUT_MAP,
    (token) => layoutLabels[token]
  );
  const fontOptions = buildMappedOptions(TYPING_FONT_TOKENS, TYPING_FONT_MAP);
  const cursorOptions = buildMappedOptions(TYPING_CURSOR_TOKENS, TYPING_CURSOR_MAP);
  const eraseOptions = buildMappedOptions(TYPING_ERASE_TOKENS, TYPING_ERASE_MAP);
  const alignOptions = buildMappedOptions(TYPING_ALIGN_TOKENS, TYPING_ALIGN_MAP);

  const [primaryTruthyFlag, ...truthyFlagAliases] = TRUTHY_FLAG_LIST;

  return [
    {
      aliases: ['lines', 'text'],
      control: 'typingLines',
      id: 'lines',
      isRequired: true,
      label: 'Typed lines',
      max: MAX_TYPING_LINES,
      maxLength: MAX_TYPING_LINE_LENGTH,
    },
    {
      aliases: ['prefix', 'prompt'],
      control: 'text',
      description:
        'Static prompt text before the typed lines (pass none to hide the default prompt).',
      id: 'prefix',
      label: 'Prefix',
      maxLength: MAX_TYPING_PREFIX_LENGTH,
      placeholder: `${DEFAULT_WINDOW_PROMPT} (${DEFAULT_TYPING_LAYOUT} default)`,
    },
    {
      aliases: ['frame', 'type'],
      control: 'select',
      defaultValue: DEFAULT_TYPING_LAYOUT,
      id: 'layout',
      label: 'Layout',
      options: layoutOptions,
      param: 'layout',
    },
    buildVariantField(DEFAULT_TYPING_VARIANT),
    buildColorField(),
    {
      control: 'select',
      defaultValue: DEFAULT_LAYOUT_FONTS[DEFAULT_TYPING_LAYOUT],
      id: 'font',
      label: 'Font',
      layoutDefaults: DEFAULT_LAYOUT_FONTS,
      options: fontOptions,
      param: 'font',
    },
    buildSizePresetField(
      TYPING_SIZE_MAP,
      TYPING_FONT_SIZE_RANGE,
      'md',
      'Typography preset or custom font size in pixels.'
    ),
    buildNumberField('width', 'Width (px)', TYPING_WIDTH_RANGE, {
      description: 'Auto-fits the longest line when left empty.',
      placeholder: 'auto',
    }),
    {
      control: 'select',
      defaultValue: 'left',
      id: 'align',
      label: 'Alignment',
      options: alignOptions,
      param: 'align',
    },
    {
      control: 'text',
      description: 'Optional header bar or active tab title on titled layouts.',
      id: 'title',
      label: 'Window / tab title',
      layoutDefaults: { ide: DEFAULT_IDE_TITLE },
      maxLength: MAX_TYPING_TITLE_LENGTH,
      param: 'title',
      placeholder: 'optional (e.g., zsh)',
    },
    {
      control: 'icon',
      description: 'Optional icon rendered in the active container frame or header.',
      id: 'icon',
      label: 'Icon',
      param: 'icon',
      placeholder: 'none',
    },
    {
      control: 'hint',
      description: 'Optional icon and/or label inside the trailing hint or keycap badge.',
      id: 'hint',
      label: 'Keycap / hint',
      maxLength: MAX_TYPING_HINT_LENGTH,
      param: 'hint',
      placeholder: 'optional (e.g., UTF-8)',
    },
    {
      control: 'select',
      defaultValue: DEFAULT_TYPING_CURSOR,
      id: 'cursor',
      label: 'Cursor',
      options: cursorOptions,
      param: 'cursor',
    },
    {
      aliases: ['delete'],
      control: 'select',
      defaultValue: DEFAULT_TYPING_ERASE,
      id: 'erase',
      label: 'Erase mode',
      options: eraseOptions,
      param: 'erase',
    },
    {
      control: 'select',
      defaultValue: '',
      description:
        'Simulates an occasional QWERTY neighbor key slip + immediate backspace correction.',
      id: 'typo',
      label: 'Human typo',
      options: [
        { aliases: FALSY_FLAG_LIST, label: 'Off', value: '' },
        { aliases: truthyFlagAliases, label: 'Enabled', value: primaryTruthyFlag },
      ],
      param: 'typo',
    },
    buildNumberField('duration', 'Typing speed (ms)', TYPING_DURATION_RANGE),
    buildNumberField('pause', 'Hold pause (ms)', TYPING_PAUSE_RANGE),
    buildAnimField('typing'),
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
    case 'typing': {
      return {
        ...base,
        fields: buildTypingFields(),
        initialState: { lines: EXAMPLE_TYPING_LINES },
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
 * @returns Builder kind and prefilled builder URL, or `undefined` for paths no builder can edit.
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
    if (isEditableServiceRequest(match.request)) {
      kind = 'service';
    }
  } else {
    const prefix = url.pathname.split('/', 2)[1] ?? '';
    kind = findSvgRoute(prefix)?.builderKind;
  }
  return kind ? { href: `/builder/${kind}?path=${encodeURIComponent(path)}`, kind } : undefined;
}
