/**
 * Builder types – Declarative URL builder schemas embedded into builder pages and consumed by the builder client.
 */

import type { BadgeSpecialKind } from './badge';
import type { IconPickerSetId } from './icon';
import type { ServiceOwnerMode } from './service';
import type { BuilderKind, HighlightToken } from './site';

// ---------------------------------------- TYPES ----------------------------------------

/**
 * Form control kind of a builder field. Composite controls render several interactive sub-inputs
 * while serializing to a single parameter or segment value string.
 */
export type BuilderControl =
  | 'anim'
  | 'color'
  | 'hint'
  | 'icon'
  | 'iconPair'
  | 'number'
  | 'select'
  | 'size'
  | 'special'
  | 'stackGroups'
  | 'text'
  | 'textarea'
  | 'typingLines';

/** Animation control layout mode for an `anim` builder field. */
export type BuilderAnimScope = 'pair' | 'sheen' | 'single' | 'stack' | 'typing';

/** Selectable option of a builder field (an empty `value` means "omit the parameter"). */
export interface BuilderOption {
  /** Alternative (lowercase) values the parser accepts for this option; Prefilled links map them onto `value`. */
  aliases?: readonly string[];
  /** Inline data widget kinds supported automatically from upstream data without a manual payload (`?special=<kind>`). */
  autoSpecials?: readonly BadgeSpecialKind[];
  /** Help text shown when this option is selected (e.g., per-widget data format hints). */
  description?: string;
  /** Visible option label. */
  label: string;
  /** Modifier options offered while the option is selected (e.g., `:static` for `?special=bar:`), led by the default `''`. */
  modifiers?: readonly BuilderOption[];
  /** Placeholder of a dependent input when the option is selected (e.g., a `?special=` payload example). */
  placeholder?: string;
  /** CSS color of the option swatch (`color` fields only). */
  swatch?: string;
  /** Serialized parameter value. */
  value: string;
}

/** Metric option of a service preset. */
export interface BuilderServiceMetric extends BuilderOption {
  /** Default inline data widget kind rendered when `?special=` is omitted. */
  defaultSpecial?: BadgeSpecialKind;
  /**
   * Upstream page URL template with `{owner}` and `{target}` placeholders (the effective owner falls back to
   * the service's default owner); Omitted when the upstream URL cannot be expressed as a plain template.
   */
  redirect?: string;
}

/** Single builder form field. */
export interface BuilderField {
  /** Query parameter aliases accepted when prefilling from an existing URL (e.g., `['type']` for `?layout=`). */
  aliases?: readonly string[];
  /** Motion controls of an `anim` field. */
  animScope?: BuilderAnimScope;
  /** Form control. */
  control: BuilderControl;
  /** Help text shown below the control. */
  description?: string;
  /** Whether the client toggles the required state at runtime (service owner segments). */
  hasDynamicRequirement?: boolean;
  /** Whether an empty value keeps a route preset (service badge icons); `none` then removes it explicitly. */
  hasPresetValue?: boolean;
  /** Field ID (state key and DOM ID suffix). */
  id: string;
  /** Whether the URL cannot be built while the field is empty. */
  isRequired?: boolean;
  /** Visible field label. */
  label: string;
  /** Maximum numeric value. */
  max?: number;
  /** Maximum text length in characters. */
  maxLength?: number;
  /** Minimum numeric value. */
  min?: number;
  /** Selectable options for choice, swatch, preset, or motion controls. */
  options?: readonly BuilderOption[];
  /** Query parameter name; Fields without one are path segments built per element kind. */
  param?: string;
  /** Placeholder text (usually the effective default). */
  placeholder?: string;
  /** Numeric increment step. */
  step?: number;
}

/** Service preset offered by the service badge builder. */
export interface BuilderServiceOption {
  /** Owner used when the owner segment is omitted (e.g., `'library'`), if the preset defines one. */
  defaultOwner?: string;
  /** Service route key (e.g., `'npm'`). */
  key: string;
  /** Maximum number of `/`-separated target segments. */
  maxTargetSegments: number;
  /** Alternative metric slugs mapped to their canonical metric (e.g., `l` -> `license`). */
  metricAliases?: Readonly<Record<string, string>>;
  /** Canonical metrics with their default labels and upstream page templates. */
  metrics: readonly BuilderServiceMetric[];
  /** Placeholder of the owner segment (e.g., `'library (default)'`). */
  ownerHint?: string;
  /** Whether the route accepts, requires, or rejects an explicit owner segment. */
  ownerMode: ServiceOwnerMode;
  /** Owner segment label (e.g., `':scope'`). */
  ownerName?: string;
  /** Target segment label (e.g., `':pkg'`). */
  targetName: string;
  /** Human-readable service name (e.g., `'PyPI'`). */
  title: string;
}

/** Complete builder schema of one element kind (embedded as JSON into its builder page). */
export interface BuilderSchema {
  /** Form fields in display order. */
  fields: readonly BuilderField[];
  /** Example values the builder starts with (field ID -> serialized value). */
  initialState: Readonly<Record<string, string>>;
  /** Whether icon slugs resolve brand logos before Lucide icons (tech stacks). */
  isBrandFirst: boolean;
  /** Element kind. */
  kind: BuilderKind;
  /** Maximum icon slug length in characters; Longer slugs never resolve. */
  maxIconSlugLength: number;
  /** Public origin used in the generated snippets. */
  origin: string;
  /**
   * Pattern (`RegExp` source) every owner and target segment must match before a service redirect template
   * is filled; Other values link to the badge URL, which the Worker redirects itself.
   */
  redirectValuePattern?: string;
  /** Service presets (service badge builder only). */
  services?: readonly BuilderServiceOption[];
}

/** Visual hierarchy tier of a shared variant (`?variant=`). */
export interface VariantTier {
  /** Tier name (e.g., `'Primary'`). */
  name: string;
  /** Short surface description (e.g., `'gradient'`). */
  surface: string;
}

/** Display label, payload example, descriptions, and modifiers of an inline data widget kind (`?special=`). */
export interface SpecialKindDetail {
  /** Concise payload format description shown when this widget kind is selected. */
  description: string;
  /** Valid payload example (builder placeholder and docs value). */
  example: string;
  /** Display label. */
  label: string;
  /** Trailing `:<modifier>` tokens accepted by the parser (e.g., `'static'` for bars). */
  modifiers: readonly string[];
  /** Compact `<dd>` summary for the builder syntax reference popover. */
  summary: string;
}

/** Builder target of a documented SVG path (used by the "Open in Builder" preview links). */
export interface BuilderTarget {
  /** Root-relative builder URL with the prefilled path (e.g., `'/builder/badge?path=…'`). */
  href: string;
  /** Builder element kind. */
  kind: BuilderKind;
}

/** Single technology item in a curated stack builder category. */
export interface StackCategoryItem {
  /** Canonical brand slug after alias resolution (e.g., `'typescript'` for `'ts'`). */
  canonical: string;
  /** Human-readable technology label (e.g., `'TypeScript'`). */
  label: string;
  /** Short slug emitted into the `/stack` DSL (e.g., `'ts'`). */
  slug: string;
}

/** Curated technology category in the stack builder category picker. */
export interface StackCategory {
  /** Stable category identifier (e.g., `'languages'`). */
  id: string;
  /** Curated technology items in display order. */
  items: readonly StackCategoryItem[];
  /** Visible category heading (e.g., `'Languages'`). */
  title: string;
}

/** Builder form state mapping field IDs to their serialized values. */
export type BuilderState = Record<string, string>;

/** Result of building a root-relative SVG URL from a builder state. */
export interface BuilderBuildResult {
  /** Labels of required fields that are still empty. */
  missing: string[];
  /** Root-relative SVG path with an optional query string. */
  path: string;
}

/** Plain-text snippets produced for each output format tab. */
export interface SnippetSet {
  /** HTML `<img>` (or linked `<a><img /></a>`) snippet. */
  html: string;
  /** Markdown image (or linked image) snippet. */
  markdown: string;
  /** Plain absolute SVG URL. */
  url: string;
}

/** Syntax-highlighted token lists keyed by snippet format. */
export type SnippetTokenSet = Record<keyof SnippetSet, HighlightToken[]>;

/** Resolved icon set and canonical slug in the icon picker. */
export interface IconMatch {
  /** Target icon picker set identifier. */
  set: IconPickerSetId;
  /** Canonical icon slug within `set`. */
  slug: string;
}

/** Resolved icon set, canonical slug, and body page number. */
export interface IconLocation extends IconMatch {
  /** Zero-based icon body page index. */
  page: number;
}

/** Client-side icon slug resolver built from the icon picker index. */
export interface IconResolver {
  /** Locate the icon set, canonical slug, and body page of `slug`, or `undefined` when unknown. */
  locate: (slug: string, isBrandFirst: boolean) => IconLocation | undefined;
  /** Resolve the icon set of `slug` (`'none'` when empty/`none`, `undefined` when unknown). */
  resolve: (slug: string, isBrandFirst: boolean) => IconPickerSetId | 'none' | undefined;
}
