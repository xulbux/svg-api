/**
 * Site navigation – Single source of truth for the header tabs, the grouped documentation and builder sidebars, page titles, meta descriptions, and the docs pager order.
 */

import { SITE_HOST } from '@/config/site';
import { ACTIVE_STACK_MOTION_TOKENS, TYPING_LAYOUT_TOKENS } from '@/routes/params';
import { formatConjunctionList } from '@/site/glossary';
import { ALL_ICON_SOURCE_NAMES, ICON_SOURCE_SETS } from '@/svg/icons';
import { BADGE_HEIGHT } from '@/svg/renderer';
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
    description: `Getting started with ${SITE_HOST}: URL anatomy, path segment encoding, shared query parameters, embedding in Markdown and HTML, click-through redirects, and caching.`,
    group: 'start',
    navLabel: 'Overview',
    pagerLabel: 'Getting Started',
    slug: 'overview',
    title: 'Getting Started',
  },
  {
    description: `Static ${BADGE_HEIGHT}px badges with pulsing radar dots, inline data widgets, icons, and micro-animations, plus the full query parameter reference.`,
    group: 'badges',
    navLabel: 'Static Badges',
    pagerLabel: 'Static Badges',
    slug: 'badges',
    title: 'Static Badges',
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
      '3D CTA buttons with size presets, leading and trailing icons, sheen and icon animations, and split two-segment layouts.',
    group: 'elements',
    navLabel: 'Buttons',
    pagerLabel: 'CTA Buttons',
    slug: 'buttons',
    title: 'CTA Buttons',
  },
  {
    description: `Standalone ${formatConjunctionList(ICON_SOURCE_SETS.stroke)} UI icons and ${formatConjunctionList(ICON_SOURCE_SETS.brand)} brand logos as tinted SVGs with intrinsic pixel sizing, stroke control, aliases, and animations.`,
    group: 'elements',
    navLabel: 'Icons',
    pagerLabel: 'Standalone Icons',
    slug: 'icons',
    title: 'Standalone Icons',
  },
  {
    description:
      'Grouped tech stack icon grids with per-group columns, side-by-side groups, row bands, tile variants, spacing controls, and staggered per-tile micro-animations.',
    group: 'elements',
    navLabel: 'Tech Stack',
    pagerLabel: 'Tech Stack Grids',
    slug: 'stack',
    title: 'Tech Stack Grids',
  },
  {
    description:
      'Realistic human-cadence SVG typing animations across Kumo 3D container frames and frameless canvases with blinking cursors, erase transitions, and optional typos.',
    group: 'elements',
    navLabel: 'Typing',
    pagerLabel: 'Typing Animations',
    slug: 'typing',
    title: 'Typing Animations',
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
      'Every Tailwind v4 OKLCH theme color token accepted by ?color= across every SVG endpoint.',
    group: 'reference',
    navLabel: 'Colors',
    pagerLabel: 'Theme Colors',
    slug: 'colors',
    title: 'Theme Color Tokens',
  },
];

/**
 * Builder pages in sidebar order.
 * Single source of truth for the builder sidebar, page headings, titles, companion docs links, and meta descriptions.
 */
export const BUILDER_PAGES: readonly [BuilderPageMeta, ...BuilderPageMeta[]] = [
  {
    description:
      'Build static badge URLs with labels, icons, colors, status dots, inline data widgets, and animations, then copy the Markdown, HTML, or URL.',
    docsSlug: 'badges',
    group: 'badges',
    kind: 'badge',
    navLabel: 'Badge',
    ogLabel: 'Badges',
    title: 'Badge Builder',
  },
  {
    description:
      'Build live service badge URLs for package registries, forges, and CDNs with metric selection, automatic data widgets (marked Auto), label overrides, and styling, previewed with live data.',
    docsSlug: 'services',
    group: 'badges',
    kind: 'service',
    navLabel: 'Service Badge',
    ogLabel: 'Live Services',
    title: 'Service Badge Builder',
  },
  {
    description:
      'Build 3D CTA button URLs with size presets, leading and trailing icons, and sheen or icon animations.',
    docsSlug: 'buttons',
    group: 'elements',
    kind: 'button',
    navLabel: 'Button',
    ogLabel: 'CTA Buttons',
    title: 'Button Builder',
  },
  {
    description: `Find any ${formatConjunctionList(ALL_ICON_SOURCE_NAMES, 'or')} icon in a searchable picker and build standalone icon URLs with size, stroke, color, and motion.`,
    docsSlug: 'icons',
    group: 'elements',
    kind: 'icon',
    navLabel: 'Icon',
    ogLabel: 'Vector Icons',
    title: 'Icon Builder',
  },
  {
    description: `Build grouped tech stack grid URLs with per-group columns, side-by-side groups, row bands, tile variants, spacing, and staggered ${formatConjunctionList(ACTIVE_STACK_MOTION_TOKENS, 'or')} animations.`,
    docsSlug: 'stack',
    group: 'elements',
    kind: 'stack',
    navLabel: 'Tech Stack',
    ogLabel: 'Tech Stacks',
    title: 'Tech Stack Builder',
  },
  {
    description: `Build realistic SVG typing animation URLs with container frames (${TYPING_LAYOUT_TOKENS.join(', ')}), cursor shapes, erase modes, fonts, and human keystroke cadence.`,
    docsSlug: 'typing',
    group: 'elements',
    kind: 'typing',
    navLabel: 'Typing',
    ogLabel: 'Typing',
    title: 'Typing Animation Builder',
  },
  {
    description:
      'Build README quote card URLs with author attribution, horizontal or vertical layouts, size presets, widths, and accent colors.',
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
