/**
 * Builder types – Declarative URL builder schemas embedded into the `/builder/:kind` pages and read by the builder client script.
 */

import type { BuilderKind } from './preview';
import type { ServiceOwnerMode } from './service';

// ---------------------------------------- TYPES ----------------------------------------

/**
 * Form control of a builder field. Composite controls (`anim`, `iconPair`, `size`, `special`) render
 * several inputs but always serialize to a single parameter value string.
 */
export type BuilderControl =
  | 'anim'
  | 'color'
  | 'icon'
  | 'iconPair'
  | 'number'
  | 'select'
  | 'size'
  | 'special'
  | 'stackGroups'
  | 'text'
  | 'textarea';

/** Motion controls offered by an `anim` field (`pair`: Sheen + left/right motions; `single`: Sheen + one motion; `sheen`: Sheen only). */
export type BuilderAnimScope = 'pair' | 'sheen' | 'single';

/** Selectable option of a builder field (an empty `value` means "omit the parameter"). */
export interface BuilderOption {
  /** Alternative (lowercase) values the parser accepts for this option; Prefilled links map them onto `value`. */
  aliases?: readonly string[];
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
  /**
   * Upstream page URL template with `{owner}` and `{target}` placeholders (the effective owner falls back to
   * the service's default owner); Omitted when the upstream URL cannot be expressed as a plain template.
   */
  redirect?: string;
}

/** Condition under which a builder field is shown (all other fields are always shown). */
export interface BuilderFieldCondition {
  /** ID of the field whose value controls the visibility. */
  field: string;
  /** Values of `field` that show this field. */
  values: readonly string[];
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
  /** Maximum numeric value (`number` and `size` fields). */
  max?: number;
  /** Maximum text length (`text` and `textarea` fields). */
  maxLength?: number;
  /** Minimum numeric value (`number` and `size` fields). */
  min?: number;
  /** Selectable options (`select`, `color`, `size`, and `anim` motion options). */
  options?: readonly BuilderOption[];
  /** Query parameter name; Fields without one are path segments built per element kind. */
  param?: string;
  /** Placeholder text (usually the effective default). */
  placeholder?: string;
  /** Visibility condition. */
  showWhen?: BuilderFieldCondition;
  /** Numeric step (`number` and `size` fields). */
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
  /** Maximum icon slug length in characters; Longer slugs never resolve (mirrors `resolveIcon`). */
  maxIconSlugLength: number;
  /** Public origin used in the generated snippets (e.g., `'https://svg.xul.is'`). */
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

/** Display label, payload example, and modifiers of an inline data widget kind (`?special=`). */
export interface SpecialKindDetail {
  /** Valid payload example (builder placeholder and docs value). */
  example: string;
  /** Display label. */
  label: string;
  /** Trailing `:<modifier>` tokens accepted by the parser (e.g., `'static'` for bars). */
  modifiers: readonly string[];
}

/** Builder target of a documented SVG path (used by the "Open in Builder" preview links). */
export interface BuilderTarget {
  /** Root-relative builder URL with the prefilled path (e.g., `'/builder/badge?path=…'`). */
  href: string;
  /** Builder element kind. */
  kind: BuilderKind;
}
