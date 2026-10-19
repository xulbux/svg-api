/**
 * Site navigation – Single source of truth for the header tabs, the grouped documentation and builder sidebars, page titles, meta descriptions, and the docs pager order.
 */

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
    description:
      'Getting started with svg.xul.is: URL anatomy, path segment encoding, shared query parameters, embedding in Markdown and HTML, click-through redirects, and caching.',
    group: 'start',
    navLabel: 'Overview',
    pagerLabel: 'Getting Started',
    slug: 'overview',
    title: 'Getting Started',
  },
  {
    description:
      'Static and status badges with pulsing radar dots, inline data widgets, icons, and micro-animations, plus the full query parameter reference.',
    group: 'badges',
    navLabel: 'Static & Status',
    pagerLabel: 'Status Badges',
    slug: 'badges',
    title: 'Status Badges',
  },
  {
    description:
      'Live package registry, CDN, and forge metric badges with edge caching and 302 redirects to the upstream page, generated from the service registry.',
    group: 'badges',
    navLabel: 'Live Services',
    pagerLabel: 'Live Service Badges',
    slug: 'services',
    title: 'Live Service Badges',
  },
  {
    description:
      '3D CTA buttons with size presets, leading and trailing icons, status dots, sheen and icon animations, and split two-segment layouts.',
    group: 'elements',
    navLabel: 'Buttons',
    pagerLabel: 'CTA Buttons',
    slug: 'buttons',
    title: 'CTA Buttons',
  },
  {
    description:
      'Standalone Lucide UI icons and Simple Icons / Devicon brand logos as tinted SVGs with intrinsic pixel sizing, stroke control, aliases, and animations.',
    group: 'elements',
    navLabel: 'Icons',
    pagerLabel: 'Standalone Icons',
    slug: 'icons',
    title: 'Standalone Icons',
  },
  {
    description:
      'Grouped tech stack icon grids with per-group columns, side-by-side groups, row bands, tile variants, and spacing controls.',
    group: 'elements',
    navLabel: 'Tech Stack',
    pagerLabel: 'Tech Stack Grids',
    slug: 'stack',
    title: 'Tech Stack Grids',
  },
  {
    description:
      'Auto-wrapping README quote cards in horizontal and vertical layouts with size presets, accent colors, surface tiers, and sheen.',
    group: 'elements',
    navLabel: 'Quotes',
    pagerLabel: 'Quote Cards',
    slug: 'quotes',
    title: 'Quote Cards',
  },
  {
    description:
      'Every Tailwind v4 OKLCH theme color token accepted by ?color= across badges, buttons, icons, tech stacks, and quote cards.',
    group: 'reference',
    navLabel: 'Colors',
    pagerLabel: 'Theme Colors',
    slug: 'colors',
    title: 'Theme Color Tokens',
  },
];

/**
 * Builder pages in sidebar order.
 * Single source of truth for the builder sidebar, page headings, titles, and meta descriptions.
 */
export const BUILDER_PAGES: readonly [BuilderPageMeta, ...BuilderPageMeta[]] = [
  {
    description:
      'Build static and status badge URLs with labels, icons, colors, status dots, inline data widgets, and animations, then copy the Markdown, HTML, or URL.',
    group: 'badges',
    kind: 'badge',
    navLabel: 'Badge',
    title: 'Badge Builder',
  },
  {
    description:
      'Build live service badge URLs for package registries, forges, and CDNs with metric selection, label overrides, and styling, previewed with live data.',
    group: 'badges',
    kind: 'service',
    navLabel: 'Service Badge',
    title: 'Service Badge Builder',
  },
  {
    description:
      'Build 3D CTA button URLs with size presets, leading and trailing icons, status dots, and sheen or icon animations.',
    group: 'elements',
    kind: 'button',
    navLabel: 'Button',
    title: 'Button Builder',
  },
  {
    description:
      'Find any Lucide, Simple Icons, or Devicon icon in a searchable picker and build standalone icon URLs with size, stroke, color, and motion.',
    group: 'elements',
    kind: 'icon',
    navLabel: 'Icon',
    title: 'Icon Builder',
  },
  {
    description:
      'Build grouped tech stack grid URLs with per-group columns, side-by-side groups, row bands, tile variants, and spacing.',
    group: 'elements',
    kind: 'stack',
    navLabel: 'Tech Stack',
    title: 'Tech Stack Builder',
  },
  {
    description:
      'Build README quote card URLs with author attribution, horizontal or vertical layouts, size presets, widths, and accent colors.',
    group: 'elements',
    kind: 'quote',
    navLabel: 'Quote Card',
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
