/**
 * Site navigation – Single source of truth for the header tabs, the grouped documentation and builder sidebars, page titles, meta descriptions, and the docs pager order.
 */

import { SITE_HOST } from '@/config/site';
import { THEME_COLOR_NAMES } from '@/config/theme';
import type {
  BuilderKind,
  BuilderPageMeta,
  DocsPageSlug,
  DocsSectionMeta,
  PageSidebar,
  SidebarGroup,
  SidebarGroupId,
  SidebarGroupMeta,
  SidebarLink,
} from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Sidebar groups in display order (shared by the documentation and builder sidebars; Empty groups are skipped). */
const SIDEBAR_GROUPS: readonly SidebarGroupMeta[] = [
  { icon: 'rocket', id: 'start', title: 'Getting Started' },
  { icon: 'tag', id: 'badges', title: 'Badges' },
  { icon: 'shapes', id: 'elements', title: 'Elements' },
  { icon: 'book-open', id: 'reference', title: 'Reference' },
];

/**
 * Documentation pages in sidebar and pager order.
 * Single source of truth for the docs sidebar, the previous/next pager, page titles, and meta descriptions.
 */
export const DOCS_PAGES: readonly [DocsSectionMeta, ...DocsSectionMeta[]] = [
  {
    description: `Getting started with ${SITE_HOST}: URL anatomy, path encoding, shared parameters, Markdown embeds, and edge caching.`,
    group: 'start',
    navLabel: 'Overview',
    pagerLabel: 'Getting Started',
    slug: 'overview',
    title: 'Getting Started',
  },
  {
    description:
      'Status and metadata badges with icons, pulsing status dots, inline charts, and animations.',
    group: 'badges',
    navLabel: 'Static Badges',
    pagerLabel: 'Static Badges',
    slug: 'badges',
    title: 'Static Badges',
  },
  {
    description:
      'Live package, forge, and CDN metric badges with edge caching and upstream redirects.',
    group: 'badges',
    navLabel: 'Live Services',
    pagerLabel: 'Live Service Badges',
    slug: 'services',
    title: 'Live Service Badges',
  },
  {
    description:
      'Action buttons with size presets, leading and trailing icons, animations, and split layouts.',
    group: 'elements',
    navLabel: 'Buttons',
    pagerLabel: 'CTA Buttons',
    slug: 'buttons',
    title: 'CTA Buttons',
  },
  {
    description:
      'Standalone UI icons and brand logos with custom pixel sizing, stroke width, colors, and motion.',
    group: 'elements',
    navLabel: 'Icons',
    pagerLabel: 'Standalone Icons',
    slug: 'icons',
    title: 'Standalone Icons',
  },
  {
    description:
      'Grouped tech stack icon grids with custom columns, row bands, tile variants, and staggered animations.',
    group: 'elements',
    navLabel: 'Tech Stack',
    pagerLabel: 'Tech Stack Grids',
    slug: 'stack',
    title: 'Tech Stack Grids',
  },
  {
    description:
      'Natural SVG typing animations across container frames and frameless headlines with custom cursors and erase modes.',
    group: 'elements',
    navLabel: 'Typing',
    pagerLabel: 'Typing Animations',
    slug: 'typing',
    title: 'Typing Animations',
  },
  {
    description:
      'Auto-wrapping README quote cards in horizontal and vertical layouts with custom sizes and colors.',
    group: 'elements',
    navLabel: 'Quotes',
    pagerLabel: 'Quote Cards',
    slug: 'quotes',
    title: 'Quote Cards',
  },
  {
    description: `All ${THEME_COLOR_NAMES.length} theme colors accepted by ?color= across every SVG endpoint.`,
    group: 'reference',
    navLabel: 'Colors',
    pagerLabel: 'Theme Colors',
    slug: 'colors',
    title: 'Theme Colors',
  },
];

/**
 * Builder pages in sidebar order.
 * Single source of truth for the builder sidebar, page headings, titles, companion docs links, and meta descriptions.
 */
export const BUILDER_PAGES: readonly [BuilderPageMeta, ...BuilderPageMeta[]] = [
  {
    description: 'Customize a static status badge and copy its Markdown, HTML, or URL.',
    docsSlug: 'badges',
    group: 'badges',
    kind: 'badge',
    navLabel: 'Badge',
    ogLabel: 'Badges',
    title: 'Badge Builder',
  },
  {
    description: 'Pick a live service metric, customize its style, and copy the embed snippet.',
    docsSlug: 'services',
    group: 'badges',
    kind: 'service',
    navLabel: 'Service Badge',
    ogLabel: 'Live Services',
    title: 'Service Badge Builder',
  },
  {
    description: 'Design an action button with custom size, icons, colors, and motion.',
    docsSlug: 'buttons',
    group: 'elements',
    kind: 'button',
    navLabel: 'Button',
    ogLabel: 'CTA Buttons',
    title: 'Button Builder',
  },
  {
    description: 'Search UI and brand icons and customize size, stroke, color, and motion.',
    docsSlug: 'icons',
    group: 'elements',
    kind: 'icon',
    navLabel: 'Icon',
    ogLabel: 'Vector Icons',
    title: 'Icon Builder',
  },
  {
    description: 'Compose grouped tech stack grids by category or with the stack DSL.',
    docsSlug: 'stack',
    group: 'elements',
    kind: 'stack',
    navLabel: 'Tech Stack',
    ogLabel: 'Tech Stacks',
    title: 'Tech Stack Builder',
  },
  {
    description: 'Configure animated typing lines, container frames, cursors, and timing.',
    docsSlug: 'typing',
    group: 'elements',
    kind: 'typing',
    navLabel: 'Typing',
    ogLabel: 'Typing',
    title: 'Typing Animation Builder',
  },
  {
    description: 'Style an auto-wrapping quote card in horizontal or vertical layout.',
    docsSlug: 'quotes',
    group: 'elements',
    kind: 'quote',
    navLabel: 'Quote Card',
    ogLabel: 'Quotes',
    title: 'Quote Card Builder',
  },
];

/** Builder page rendered for `/builder` and for unknown `/builder/:kind` slugs. */
export const DEFAULT_BUILDER_KIND: BuilderKind = 'badge';

// -------------------------------------- INTERNALS --------------------------------------

/** Group pages into sidebar groups (in `SIDEBAR_GROUPS` order, skipping empty groups). */
function groupSidebarLinks<T extends { group: SidebarGroupId }>(
  pages: readonly T[],
  toLink: (page: T) => SidebarLink
): SidebarGroup[] {
  const groups: SidebarGroup[] = [];
  for (const groupMeta of SIDEBAR_GROUPS) {
    const links: SidebarLink[] = [];
    for (const page of pages) {
      if (page.group === groupMeta.id) {
        links.push(toLink(page));
      }
    }
    if (links.length > 0) {
      groups.push({ icon: groupMeta.icon, links, title: groupMeta.title });
    }
  }
  return groups;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the path of a documentation page.
 * @param slug   Documentation page slug.
 * @returns `/docs` for `'overview'`, otherwise `/docs/:section`.
 */
export function buildDocsPath(slug: DocsPageSlug): string {
  return slug === 'overview' ? '/docs' : `/docs/${slug}`;
}

/**
 * Build the path of a builder page.
 * @param kind   Builder element kind.
 * @returns `/builder/:kind`.
 */
export function buildBuilderPath(kind: BuilderKind): string {
  return `/builder/${kind}`;
}

/**
 * Find the metadata of a documentation page.
 * @param slug   Documentation page slug.
 * @returns Page metadata (falls back to the overview).
 */
export function getDocsPageMeta(slug: DocsPageSlug): DocsSectionMeta {
  return DOCS_PAGES.find((meta) => meta.slug === slug) ?? DOCS_PAGES[0];
}

/**
 * Find the metadata of a builder page.
 * @param kind   Builder element kind.
 * @returns Page metadata (falls back to the first builder).
 */
export function getBuilderPageMeta(kind: BuilderKind): BuilderPageMeta {
  return BUILDER_PAGES.find((meta) => meta.kind === kind) ?? BUILDER_PAGES[0];
}

/**
 * Check whether a raw slug is a builder element kind.
 * @param slug   Raw, lowercased `/builder/:kind` slug.
 * @returns `true` when `slug` is a known `BuilderKind`.
 */
export function isBuilderKind(slug: string): slug is BuilderKind {
  return BUILDER_PAGES.some((meta) => meta.kind === slug);
}

/**
 * Build the documentation sidebar with `slug` as the active page.
 * @param slug   Active documentation page slug.
 * @returns Grouped documentation sidebar.
 */
export function buildDocsSidebar(slug: DocsPageSlug): PageSidebar {
  return {
    activeHref: buildDocsPath(slug),
    groups: groupSidebarLinks(DOCS_PAGES, (page) => ({
      href: buildDocsPath(page.slug),
      label: page.navLabel,
    })),
    label: 'Documentation pages',
  };
}

/**
 * Build the builder sidebar with `kind` as the active page.
 * @param kind   Active builder element kind.
 * @returns Grouped builder sidebar.
 */
export function buildBuilderSidebar(kind: BuilderKind): PageSidebar {
  return {
    activeHref: buildBuilderPath(kind),
    groups: groupSidebarLinks(BUILDER_PAGES, (page) => ({
      href: buildBuilderPath(page.kind),
      label: page.navLabel,
    })),
    label: 'Builder pages',
  };
}
