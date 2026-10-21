/**
 * Documentation website types – Navigation, showcase cards, parameter tables, and page layout options (`src/preview/`).
 */

import type { ServicePreviewSample } from './service';

// ---------------------------------------- TYPES ----------------------------------------

/** Supported documentation section slugs on `/docs/:section`. */
export type DocsSectionSlug =
  | 'badges'
  | 'buttons'
  | 'colors'
  | 'icons'
  | 'quotes'
  | 'services'
  | 'stack';

/** Documentation page slugs (`'overview'` is the `/docs` landing page). */
export type DocsPageSlug = DocsSectionSlug | 'overview';

/** Element kinds with a dedicated URL builder page on `/builder/:kind`. */
export type BuilderKind = 'badge' | 'button' | 'icon' | 'quote' | 'service' | 'stack';

/** Sidebar group identifiers shared by the documentation and builder sidebars. */
export type SidebarGroupId = 'badges' | 'elements' | 'reference' | 'start';

/** Top navigation tab identifiers across the `svg.xul.is` web interface. */
export type NavPageId = 'builder' | 'docs' | 'home';

/** Public file names of the static website assets served at `/assets/:name` (icon picker pages are resolved dynamically). */
export type SiteAssetName = 'builder.js' | 'icons.json' | 'site.css' | 'site.js';

/** Public file names of the bundled website font files served at `/assets/:name`. */
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

/** Sidebar, `<title>`, and meta description metadata of a builder page. */
export interface BuilderPageMeta {
  /** Unique meta description for search engines and link previews. */
  description: string;
  /** Sidebar group the page is listed in. */
  group: SidebarGroupId;
  /** Element kind (`/builder/:kind`). */
  kind: BuilderKind;
  /** Short label in the sidebar. */
  navLabel: string;
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

/** Distinct icon counts of the bundled icon sets (computed lazily for the docs; Never hard-coded). */
export interface IconSetCounts {
  /** Distinct Simple Icons and Devicon Plain brand/technology slugs. */
  brand: number;
  /** Distinct Lucide stroke icons (aliases of the same glyph are counted once). */
  lucide: number;
}

/** Single documented SVG example; Its preview is rendered from `path` by the live route dispatcher. */
export interface ShowcaseItem {
  /** Accessible alt text used in the generated Markdown snippet (`![alt](url)`). */
  alt: string;
  /** Optional outer link target (`[![alt](url)](href)`; Defaults to the preset redirect for service badges). */
  href?: string;
  /** Canonical path and query string on `https://svg.xul.is` (e.g., `'/badge/pypi/xulbux/v'`). */
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
 * Inside code values, ` | `, ` / `, ` to `, and `...` render as dimmed separators, and a bracketed
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

/**
 * Options for rendering a documentation section header.
 * `title` and `description` support inline `` `code` `` and `**strong**` markup; Everything else is escaped.
 */
export interface SectionHeaderOptions {
  /** Optional raw HTML rendered beside the section title (e.g., the builder's `Reference` link). */
  actionHtml?: string;
  /** Section lead paragraph. */
  description: string;
  /** Heading level of the title (`1` for docs pages, `2` for homepage sections; Defaults to `1`). */
  headingLevel?: 1 | 2;
  /** Route patterns rendered as `GET` pills below the description. */
  routes?: readonly string[];
  /** Section heading text. */
  title: string;
}

/** Options for rendering the full HTML document shell. */
export interface PageLayoutOptions {
  /** Active top navigation tab. */
  activeNav: NavPageId;
  /** Inner `<main>` HTML content. */
  bodyHtml: string;
  /** Canonical path of the page on `https://svg.xul.is` (e.g., `'/docs/badges'`). */
  canonicalPath: string;
  /** Meta description for search engines and link previews. */
  description: string;
  /** Additional HTML appended after the site script (e.g., the builder schema and script). */
  extraBodyHtml?: string;
  /** Optional left sidebar (documentation and builder pages). */
  sidebar?: PageSidebar;
  /** Document `<title>` text. */
  title: string;
}
