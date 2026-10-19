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

/** Valid navigation tab identifiers across the `svg.xul.is` web interface. */
export type NavPageId = DocsSectionSlug | 'home';

/** Navigation, pager, `<title>`, and meta description metadata of a documentation section. */
export interface DocsSectionMeta {
  /** Unique meta description for search engines and link previews. */
  description: string;
  /** Short label in the top navigation bar. */
  navLabel: string;
  /** Descriptive label in the previous/next pager. */
  pagerLabel: string;
  /** Section slug (`/docs/:section`). */
  slug: DocsSectionSlug;
  /** Document `<title>` prefix. */
  title: string;
}

/** Distinct icon counts of the bundled icon sets (computed lazily for the docs; never hard-coded). */
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
  /** Section lead paragraph. */
  description: string;
  /** Heading level of the title (`1` for docs pages, `2` for homepage sections; defaults to `1`). */
  headingLevel?: 1 | 2;
  /** Route patterns rendered as `GET` pills below the description. */
  routes?: readonly string[];
  /** Section heading text. */
  title: string;
}

/** Options for rendering the full HTML document shell. */
export interface PageLayoutOptions {
  /** Active navigation tab identifier. */
  activePage: NavPageId;
  /** Inner `<main>` HTML content. */
  bodyHtml: string;
  /** Canonical path of the page on `https://svg.xul.is` (e.g., `'/docs/badges'`). */
  canonicalPath: string;
  /** Meta description for search engines and link previews. */
  description: string;
  /** Document `<title>` text. */
  title: string;
}
