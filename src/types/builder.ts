/**
 * Builder types – Declarative URL builder schemas embedded into builder pages and consumed by the builder client.
 */

import type { BadgeSpecialKind } from './badge';
import type { IconPickerIndex, IconPickerSetId } from './icon';
import type { ServiceOwnerMode } from './service';
import type { BuilderKind, HighlightToken } from './site';
import type { ThemeColorName } from './theme';

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

/** Selectable option of a builder field (an empty `value` omits the parameter). */
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
  /** Default theme color token when `?color=` is omitted. */
  defaultColor: ThemeColorName;
  /** Default icon slug when `?icon=` is omitted. */
  defaultIcon: string;
  /** Default left-side badge label when `?label=` is omitted. */
  defaultLabel: string;
  /** Default inline data widget kind rendered when `?special=` is omitted. */
  defaultSpecial?: BadgeSpecialKind;
  /** Whether the metric transform overrides `defaultColor` dynamically from live upstream data. */
  hasDynamicColor?: boolean;
  /** Whether the metric transform adds a status dot dynamically from live upstream data. */
  hasDynamicDot?: boolean;
  /** Whether the metric transform overrides `defaultIcon` dynamically from live upstream data. */
  hasDynamicIcon?: boolean;
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
  /** Effective default value when the query parameter is omitted (matching selections omit the parameter). */
  defaultValue?: string;
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
  /** Layout-dependent effective defaults keyed by canonical layout token (overrides `defaultValue`). */
  layoutDefaults?: Readonly<Record<string, string>>;
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
  /** Minimum number of `/`-separated target segments when greater than `1`. */
  minTargetSegments?: number;
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
  /** Alternative modifier tokens accepted as explicit aliases for the default (omitted) modifier. */
  defaultModifierAliases?: readonly string[];
  /** Label of the default (omitted) motion modifier when `modifiers` is non-empty. */
  defaultModifierLabel?: string;
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

/** Builder target of a documented SVG path. */
export interface BuilderTarget {
  /** Root-relative builder URL with the prefilled path (e.g., `'/builder/badge/build/passing'`). */
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

/** Extracted SVG path, target builder kind, and optional snippet metadata parsed from a pasted URL or embed. */
export interface ImportedBuilderSnippet {
  /** Extracted alt text (`''` when absent). */
  alt: string;
  /** Target builder element kind inferred from the SVG route prefix and path arity. */
  kind: BuilderKind;
  /** Extracted click-through link target (`''` when unlinked). */
  link: string;
  /** Extracted root-relative SVG path and query string (e.g., `'/stack/ts,rust?variant=2'`). */
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

/** Decomposed sheen toggle and left/right icon motion tokens of a `?anim=` value. */
export interface AnimSplitParts {
  /** Whether the periodic diagonal surface sheen sweep is enabled. */
  hasSheen: boolean;
  /** Left or single icon motion token (`''` when static). */
  left: string;
  /** Right icon motion token (`''` when static or single-icon). */
  right: string;
}

/** Decomposed optional icon slug and label text of a `?hint=` value. */
export interface HintSplitParts {
  /** Leading icon slug (`''` when none). */
  icon: string;
  /** Trailing hint label text (`''` when none). */
  text: string;
}

/** Decomposed widget kind, modifier, and payload of a `?special=` value. */
export interface SpecialSplitParts {
  /** Canonical widget kind (`''` when none). */
  kind: string;
  /** Optional trailing modifier token (`''` when omitted). */
  modifier: string;
  /** Widget data payload (`''` when omitted or automatic). */
  payload: string;
}

/** Decomposed named preset and custom pixel value of a `?size=` value. */
export interface SizeSplitParts {
  /** Custom numeric pixel string (`''` when using a named preset). */
  custom: string;
  /** Named preset token or `'custom'` (`''` when omitted). */
  preset: string;
}

/** Resolved active service and metric options for a `service` builder state. */
export interface ActiveServiceMetric {
  /** Active metric option (`undefined` when the service has none). */
  metric: BuilderServiceMetric | undefined;
  /** Active service preset option (`undefined` when none). */
  service: BuilderServiceOption | undefined;
}

/** Resolved display label, glyph slug, and placeholder state of an icon selector trigger. */
export interface IconSelectDisplay {
  /** Visible trigger label text (`'Auto'`, icon slug, or placeholder). */
  displayLabel: string;
  /** Icon slug rendered in the trigger glyph preview (`''` when none). */
  glyphSlug: string;
  /** Whether the trigger displays muted placeholder text. */
  isPlaceholder: boolean;
}

/** Filtered icon picker matches and optional per-tab match counts for a search query. */
export interface IconCatalogFilterResult {
  /** Match count per icon set (`undefined` when the search query is empty). */
  counts: Record<IconPickerSetId, number> | undefined;
  /** Ordered matches for the active icon picker tab. */
  matches: IconMatch[];
}

/** DOM mount element references accepted by `createTypingLinesController`. */
export interface TypingLinesMountOptions<TButton = unknown, TElement = unknown, TInput = unknown> {
  /** `#typing-line-add` button element. */
  addButton: TButton | null;
  /** `#typing-lines-editor` wrapper element. */
  editorElement: TElement | null;
  /** Hidden `#field-lines` input element storing the `;`-separated lines string. */
  hiddenInput: TInput | null;
  /** `#typing-lines-list` row container element. */
  listElement: TElement | null;
}

/** Public controller interface returned by `createTypingLinesController`. */
export interface TypingLinesController {
  /** Bind add, remove, keyboard navigation, pointer reorder, and multi-line paste listeners. */
  bind: () => void;
  /** Read and serialize the non-empty line inputs into `;`-separated form and sync `#field-lines`. */
  readValue: () => string;
  /** Rebuild the line input rows from a `;`- or newline-separated lines string. */
  syncFromValue: (rawValue: string) => void;
}

/** Resolved `/builder/stack` mode tab and `Group by category` toggle state for a prefilled DSL string. */
export interface StackPrefillModeResult {
  /** Target state of `Group by category` (`undefined` when switching to `Raw DSL`). */
  isGroupedByCategory: boolean | undefined;
  /** Target stack editor tab (`'categories'` or `'raw'`). */
  mode: 'categories' | 'raw';
}

/** Pure helpers exposed on `globalThis.svgBuilderCore` when the builder client runs without a DOM. */
export interface BuilderClientCore {
  /** Build a human-readable default alt text for the current element state. */
  buildAltText: (schema: BuilderSchema, state: BuilderState) => string;
  /** Build the default click-through target URL for a service badge or element. */
  buildDefaultLinkTarget: (schema: BuilderSchema, state: BuilderState, url: string) => string;
  /** Build the relative SVG request path and list of missing required fields. */
  buildPath: (schema: BuilderSchema, state: BuilderState) => BuilderBuildResult;
  /** Append `anim=none` when reduced motion is enabled. */
  buildPreviewPath: (path: string, isReducedMotion: boolean) => string;
  /** Build the shareable builder URL for the current element path and snippet options. */
  buildShareUrl: (href: string, path: string, alt: string, link: string) => string;
  /** Build the syntax-highlighted token lists for the Markdown, HTML, and URL snippets. */
  buildSnippetTokens: (url: string, alt: string, link: string) => SnippetTokenSet;
  /** Build the plain-text Markdown, HTML, and URL copy snippets. */
  buildSnippets: (url: string, alt: string, link: string) => SnippetSet;
  /** Split a stack groups string into individual non-empty icon slugs. */
  collectStackSlugs: (groups: string) => string[];
  /** Compose an `?anim=` query value from the sheen toggle and left/right icon motion tokens. */
  composeAnim: (hasSheen: boolean, left: string, right: string) => string;
  /** Compose the `/stack/:icons` path segment from categorized icon groups. */
  composeCategorizedStack: (
    categoryGroups: readonly (readonly string[])[],
    isGroupedByCategory: boolean,
    rawPerLine?: string
  ) => string;
  /** Compose a `?hint=` query value from an optional icon slug and label text. */
  composeHint: (icon: string, text: string) => string;
  /** Compose an `?icon=` query value from left and right icon slugs. */
  composeIconPair: (left: string, right: string, hasPresetIcon: boolean) => string;
  /** Compose a `?special=` query value from its kind, payload, and modifier. */
  composeSpecial: (
    kind: string,
    payload: string,
    modifier: string,
    isAutoAllowed?: boolean
  ) => string;
  /** Compute the next focused grid cell index for an arrow/`Home`/`End` key press. */
  computeGridFocusIndex: (
    key: string,
    index: number,
    columns: number,
    total: number
  ) => number | undefined;
  /** Memoize an async loader by key, evicting failed promises so retries work. */
  createAsyncCache: <T>(load: (key: string) => Promise<T>) => (key: string) => Promise<T>;
  /** Create an icon slug resolver from the icon picker index. */
  createIconResolver: (index: IconPickerIndex, maxSlugLength: number) => IconResolver;
  /** Create the interactive line-by-line list controller for `/builder/typing`. */
  createTypingLinesController: <TButton = unknown, TElement = unknown, TInput = unknown>(
    options: TypingLinesMountOptions<TButton, TElement, TInput>
  ) => TypingLinesController;
  /** Decode a URL path segment (`+` to space, percent-encoding to UTF-8). */
  decodeSegment: (raw: string) => string;
  /** Encode a URL path segment (spaces to `+`, preserving readable punctuation). */
  encodeSegment: (text: string) => string;
  /** Extract the prefilled root-relative SVG path from a builder page URL. */
  extractBuilderPrefillPath: (href: string, schema: BuilderSchema) => string;
  /** Filter icon picker matches across both sets for a search query. */
  filterIconCatalog: (
    index: IconPickerIndex,
    catalog: Record<IconPickerSetId, string[]>,
    activeSet: IconPickerSetId,
    rawQuery: string
  ) => IconCatalogFilterResult;
  /** Check whether a typing builder field applies to the selected container layout. */
  isTypingFieldActiveForLayout: (fieldId: string, layoutValue: string) => boolean;
  /** Parse a pasted SVG URL, root-relative path, builder share link, Markdown embed, or HTML `<img>` snippet. */
  parseImportedSnippet: (
    rawInput: string,
    allowedOrigins: readonly string[]
  ) => ImportedBuilderSnippet | undefined;
  /** Parse a relative SVG path and query string into a builder form state. */
  parsePath: (schema: BuilderSchema, rawPath: string) => BuilderState | undefined;
  /** Resolve the effective default value of a field under the current state. */
  resolveEffectiveFieldDefault: (
    schema: BuilderSchema,
    state: BuilderState,
    field: BuilderField
  ) => string;
  /** Resolve the display label, glyph slug, and placeholder state of an icon selector trigger. */
  resolveIconSelectDisplay: (
    rawSlug: string,
    placeholder: string,
    presetIcon?: string,
    isPresetDynamic?: boolean
  ) => IconSelectDisplay;
  /** Resolve the builder element kind matching an existing SVG path and query string. */
  resolvePathBuilderKind: (rawPath: string, origin: string) => BuilderKind | undefined;
  /** Determine whether a prefilled `/stack` DSL string fits `Categories` mode or requires `Raw DSL`. */
  resolveStackPrefillMode: (
    dslValue: string,
    categoryGroups: readonly (readonly string[])[],
    hasCustomTokens: boolean,
    rawPerLine?: string
  ) => StackPrefillModeResult;
  /** Split an `?anim=` query value into the sheen toggle and left/right icon motion tokens. */
  splitAnim: (value: string, options?: readonly BuilderOption[]) => AnimSplitParts;
  /** Split a `?hint=` query value into its optional icon slug and label text. */
  splitHint: (value: string) => HintSplitParts;
  /** Split an `?icon=` query value into `[left, right]` icon slugs. */
  splitIconPair: (value: string, hasPresetIcon: boolean) => [left: string, right: string];
  /** Split a `?size=` query value into a named preset or custom pixel value. */
  splitSize: (value: string, options: readonly BuilderOption[]) => SizeSplitParts;
  /** Split a `?special=` query value into its kind, payload, and modifier. */
  splitSpecial: (value: string, options: readonly BuilderOption[]) => SpecialSplitParts;
}
