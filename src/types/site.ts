/**
 * Website types – Navigation, showcase cards, parameter tables, and page layout options.
 */

import type { ServicePreviewSample } from './service';
import type { BadgeVariant } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Pre-escaped HTML fragment produced by a JSX element, fragment, or `raw()` call. */
export interface HtmlFragment {
  /** Pre-escaped HTML markup string. */
  readonly rawHtml: string;
  /** Returns the raw HTML string. */
  toString: () => string;
}

/** Valid child values inside a JSX element or fragment. */
export type JsxChild =
  | HtmlFragment
  | readonly JsxChild[]
  | boolean
  | number
  | string
  | null
  | undefined;

/** Supported documentation section slugs. */
export type DocsSectionSlug =
  | 'badges'
  | 'buttons'
  | 'colors'
  | 'icons'
  | 'quotes'
  | 'services'
  | 'stack'
  | 'typing';

/** Documentation page slugs (`'overview'` is the root documentation landing page). */
export type DocsPageSlug = DocsSectionSlug | 'overview';

/** Element kinds with a dedicated URL builder page. */
export type BuilderKind = 'badge' | 'button' | 'icon' | 'quote' | 'service' | 'stack' | 'typing';

/** Sidebar group identifiers shared by the documentation and builder sidebars. */
export type SidebarGroupId = 'badges' | 'elements' | 'reference' | 'start';

/** Top navigation tab identifiers (`'none'` when no tab is active, e.g., on `404`). */
export type NavPageId = 'builder' | 'docs' | 'home' | 'none';

/** Public file names of static website assets (paginated icon body assets are resolved dynamically). */
export type SiteAssetName = 'builder.js' | 'icons.json' | 'site.css' | 'site.js';

/** Public file names of bundled website font files. */
export type SiteFontName =
  | 'Geist-Bold.ttf'
  | 'Geist-Medium.ttf'
  | 'Geist-Regular.ttf'
  | 'Geist-SemiBold.ttf'
  | 'Geist-SemiBoldItalic.ttf'
  | 'JetBrainsMono-Bold.ttf'
  | 'JetBrainsMono-BoldItalic.ttf'
  | 'JetBrainsMono-Italic.ttf'
  | 'JetBrainsMono-Regular.ttf';

/** Syntax highlighting token of a code snippet (`hl-*` class name and literal text). */
export type HighlightToken = [className: string, text: string];

/** Built static website asset. */
export interface SiteAsset<TBody extends ArrayBuffer | string = string> {
  /** Asset body (CSS, JavaScript, JSON source, or font binary). */
  body: TBody;
  /** `Content-Type` header value. */
  contentType: string;
  /** Content hash appended to asset URLs (`?v=`). */
  version: string;
}

/** Navigation, pager, sidebar, `<title>`, and meta description metadata of a documentation page. */
export interface DocsSectionMeta {
  /** Unique meta description for search engines and link previews. */
  description: string;
  /** Sidebar group the page is listed in. */
  group: SidebarGroupId;
  /** Short label in the sidebar. */
  navLabel: string;
  /** Descriptive label in the previous/next pager. */
  pagerLabel: string;
  /** Page slug (`/docs` for `'overview'`, otherwise `/docs/:section`). */
  slug: DocsPageSlug;
  /** Document `<title>` prefix. */
  title: string;
}

/** Sidebar, `<title>`, meta description, and companion docs metadata of a builder page. */
export interface BuilderPageMeta {
  /** Unique meta description for search engines and link previews. */
  description: string;
  /** Companion documentation section slug linked from the builder header. */
  docsSlug: DocsSectionSlug;
  /** Sidebar group the page is listed in. */
  group: SidebarGroupId;
  /** Element kind (`/builder/:kind`). */
  kind: BuilderKind;
  /** Short label in the sidebar. */
  navLabel: string;
  /** Short capability label rendered on the shared OpenGraph preview card. */
  ogLabel: string;
  /** Page heading and document `<title>` prefix. */
  title: string;
}

/** Display metadata of a sidebar group. */
export interface SidebarGroupMeta {
  /** Lucide icon slug shown next to the group title. */
  icon: string;
  /** Group identifier. */
  id: SidebarGroupId;
  /** Visible group title. */
  title: string;
}

/** Single sidebar link. */
export interface SidebarLink {
  /** Link target path. */
  href: string;
  /** Visible link label. */
  label: string;
}

/** Sidebar group with its links in display order. */
export interface SidebarGroup {
  /** Lucide icon slug shown next to the group title. */
  icon: string;
  /** Links in display order. */
  links: readonly SidebarLink[];
  /** Visible group title. */
  title: string;
}

/** Left sidebar of a documentation or builder page. */
export interface PageSidebar {
  /** Path of the active page (highlighted with `aria-current="page"`). */
  activeHref: string;
  /** Groups in display order. */
  groups: readonly SidebarGroup[];
  /** Accessible navigation label (e.g., `'Documentation pages'`). */
  label: string;
}

/** Distinct icon counts of the bundled icon sets (computed lazily; Never hard-coded). */
export interface IconSetCounts {
  /** Distinct brand and technology slugs across the bundled brand icon sets. */
  brand: number;
  /** Distinct UI stroke icons (aliases of the same glyph are counted once). */
  lucide: number;
}

/** Single documented SVG example; Its preview is rendered from `path` by the live route dispatcher. */
export interface ShowcaseItem {
  /** Accessible alt text used in the generated Markdown snippet (`![alt](url)`). */
  alt: string;
  /** Optional outer link target (`[![alt](url)](href)`; Defaults to the preset redirect for service badges). */
  href?: string;
  /** Canonical root-relative SVG path and query string (e.g., `'/badge/pypi/xulbux/v'`). */
  path: string;
  /** Sample value or upstream payload for service preset badges (rendered without network access). */
  sample?: ServicePreviewSample;
}

/** Configuration for a visual showcase card with an expandable Markdown code drawer. */
export interface ShowcaseCardConfig {
  /** Whether to center the rendered SVGs inside the preview stage. */
  isCentered?: boolean;
  /** Documented SVG examples. */
  items: readonly ShowcaseItem[];
  /** Optional descriptive subtitle explaining the option or pattern shown. */
  subtitle?: string;
  /** Card header title or route pattern. */
  title: string;
}

/**
 * Single row in a documentation parameter or route reference table.
 * Inside code values, ` | `, ` / `, ` to `, and `…` render as dimmed separators, and a bracketed
 * suffix (e.g., `license [l]`) renders as an alias note (`license (l)`).
 */
export interface ParamTableRow {
  /** Default value when omitted (prefix with `~` for a non-code descriptive note). */
  defaultVal: string;
  /** Explanation of what the parameter or segment controls. */
  description: string;
  /** Parameter or route segment name (e.g., `?variant=`, `:icon`). */
  name: string;
  /** Accepted values or type signature (prefix with `~` for a non-code descriptive note). */
  values: string;
}

/** Site-wide client configuration rendered into the `#site-config` JSON element. */
export interface SiteClientConfig {
  /** Media query under which the sidebar is a popover drawer (e.g., `'(max-width: 960px)'`). */
  drawerMediaQuery: string;
  /** `localStorage` key of the persisted preview stage background. */
  previewBgStorageKey: string;
  /** Allowed preview stage background values (the first one is the default and removes the attribute; Never empty). */
  previewBgValues: readonly [string, ...string[]];
  /** `localStorage` key of the persisted color scheme override. */
  schemeStorageKey: string;
  /** Page background per color scheme, written into the `theme-color` meta tags. */
  themeColors: Readonly<Record<'dark' | 'light', string>>;
}

/** Bounding rectangle of a popover anchor (a `DOMRect` subset). */
export interface PopoverAnchorRect {
  /** Bottom edge in viewport pixels. */
  bottom: number;
  /** Left edge in viewport pixels. */
  left: number;
  /** Right edge in viewport pixels. */
  right: number;
  /** Top edge in viewport pixels. */
  top: number;
  /** Width in pixels. */
  width: number;
}

/** Width and height of a popover or the viewport. */
export interface PopoverSize {
  /** Height in pixels. */
  height: number;
  /** Width in pixels. */
  width: number;
}

/** Options of a fallback popover placement. */
export interface PopoverPlacementOptions {
  /** Horizontal alignment with the anchor (`'start'` aligns left edges, `'end'` right edges). */
  align?: 'end' | 'start';
  /** Distance in pixels between anchor and popover. */
  gap?: number;
  /** Whether the popover is at least as wide as its anchor (dropdown menus). */
  isWidthMatched?: boolean;
}

/** Computed fallback popover position. */
export interface PopoverPlacement {
  /** Left edge in viewport pixels. */
  left: number;
  /** Minimum width in pixels (`undefined` unless the width matches the anchor). */
  minWidth: number | undefined;
  /** Top edge in viewport pixels. */
  top: number;
}

/** Pure helpers exposed by the site script when evaluated without a DOM (`svgSiteCore`). */
export interface SiteClientCore {
  /** Compute the viewport position of a popover below or above its anchor. */
  computePopoverPlacement: (
    anchorRect: PopoverAnchorRect,
    popoverSize: PopoverSize,
    viewportSize: PopoverSize,
    options: PopoverPlacementOptions
  ) => PopoverPlacement;
}

/** Descriptor for a visual hierarchy variant showcase card. */
export interface VariantDescriptor {
  /** Short explanation of the visual hierarchy tier. */
  readonly description: string;
  /** Variant query parameter identifier. */
  readonly id: BadgeVariant;
  /** Display title for the variant card. */
  readonly title: string;
}

/** Highlighted part of a URL anatomy example. */
export interface UrlAnatomyPart {
  /** Syntax highlighting class (`hl-*`). */
  readonly className: string;
  /** Optional legend label (omitted on repeated roles in the URL). */
  readonly label?: string | undefined;
  /** Literal URL text. */
  readonly text: string;
}

/** Leading and trailing parts of a `main (parenthetical)` string. */
export interface TrailingParenthetical {
  /** Text before the trailing parenthetical group. */
  main: string;
  /** Text inside the trailing parenthetical group. */
  paren: string;
}
