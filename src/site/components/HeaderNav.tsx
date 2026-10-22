/**
 * Header navigation component – Sticky top navbar (`<HeaderNav />`) with brand link, narrow-screen sidebar toggle, 3-tab navigation, preview background switch, theme switch, and GitHub link.
 */

import { UiIcon } from '@/site/components/UiIcon';
import { raw, renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';
import type { NavPageId, PageSidebar } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Top navigation tab. */
interface NavTab {
  /** Link target path. */
  readonly href: string;
  /** Tab identifier. */
  readonly id: NavPageId;
  /** Visible label. */
  readonly label: string;
}

/** Props for the `<HeaderNav />` component. */
export interface HeaderNavProps {
  /** Active top-level navigation tab (`'home'`, `'builder'`, or `'docs'`). */
  readonly activeNav: NavPageId;
  /** Optional grouped left sidebar configuration (renders the narrow-screen drawer toggle when present). */
  readonly sidebar?: PageSidebar | undefined;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Top navigation tabs in display order. */
const NAV_TABS: readonly NavTab[] = [
  { href: '/', id: 'home', label: 'Home' },
  { href: '/builder', id: 'builder', label: 'Builder' },
  { href: '/docs', id: 'docs', label: 'Docs' },
];

/** Memoized header HTML keyed by active navigation tab and active sidebar path. */
const HEADER_HTML_CACHE = new Map<string, string>();

// -------------------------------------- INTERNALS --------------------------------------

/** Find the label of the active sidebar link (empty when no link matches the active path). */
function findActiveSidebarLabel(sidebar: PageSidebar): string {
  for (const group of sidebar.groups) {
    for (const link of group.links) {
      if (link.href === sidebar.activeHref) {
        return link.label;
      }
    }
  }
  return '';
}

/**
 * Render the narrow-screen sidebar drawer toggle shown in the header nav row: A panel icon followed by the
 * current page title (hidden on wide screens, where the sidebar is a sticky column).
 */
function renderSidebarToggle(sidebar: PageSidebar): HtmlFragment {
  const openLabel = `Open ${sidebar.label}`;
  const activeLabel = findActiveSidebarLabel(sidebar);
  return (
    <button
      type="button"
      class="sidebar-toggle"
      popovertarget="sidebar-drawer"
      aria-label={openLabel}
      title={openLabel}>
      <UiIcon slug="panel-left" size={16} />
      <span class="sidebar-toggle-label" aria-hidden="true">
        {activeLabel}
      </span>
    </button>
  );
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render (once per active tab and sidebar page) the sticky top navigation bar matching the VitePress text-link
 * navbar style; On narrow screens, the nav row wraps below the brand and holds the sidebar drawer toggle.
 * @param activeNav   Active top-level navigation tab.
 * @param sidebar     Optional sidebar configuration.
 * @returns Header HTML string.
 */
export function renderHeaderNav(activeNav: NavPageId, sidebar: PageSidebar | undefined): string {
  // Sidebar pages are a fixed set, so the cache stays bounded by the number of pages.
  const cacheKey = `${activeNav}|${sidebar?.activeHref ?? ''}`;
  const cached = HEADER_HTML_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const navLinks: HtmlFragment[] = [];
  for (const tab of NAV_TABS) {
    const isActive = tab.id === activeNav;
    navLinks.push(
      <a
        href={tab.href}
        class={isActive ? 'nav-link is-active' : 'nav-link'}
        aria-current={isActive ? 'page' : undefined}
        tabindex="0">
        {tab.label}
      </a>
    );
  }

  const headerHtml = renderHtml(
    <header class="site-header">
      <div class="header-inner">
        <a href="/" class="brand-link" tabindex="0">
          <span class="brand-mark" aria-hidden="true">
            <UiIcon slug="sparkles" size={15} />
          </span>
          svg.xul.is
        </a>
        <div class="header-nav-row">
          {sidebar ? renderSidebarToggle(sidebar) : undefined}
          <nav class="site-nav" aria-label="Main">
            {navLinks}
          </nav>
        </div>
        <div class="header-actions">
          <span class="header-divider" aria-hidden="true"></span>
          <button
            type="button"
            class="bg-toggle"
            id="preview-bg-toggle"
            role="switch"
            aria-checked="false"
            aria-label="Invert preview background"
            title="Toggle inverted preview background">
            <span class="bg-swatch" aria-hidden="true"></span>
          </button>
          <button
            type="button"
            class="theme-switch"
            id="theme-toggle"
            role="switch"
            aria-checked="false"
            aria-label="Dark color scheme"
            title="Toggle dark color scheme">
            <span class="theme-switch-thumb">
              <UiIcon slug="sun" size={12} extraClass="theme-label-light" />
              <UiIcon slug="moon" size={12} extraClass="theme-label-dark" />
            </span>
          </button>
          <span class="header-divider" aria-hidden="true"></span>
          <a
            href="https://github.com/xulbux"
            class="gh-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="XulbuX on GitHub"
            title="XulbuX on GitHub"
            tabindex="0">
            <UiIcon slug="github" size={20} />
          </a>
        </div>
      </div>
    </header>
  );
  HEADER_HTML_CACHE.set(cacheKey, headerHtml);
  return headerHtml;
}

/**
 * Render the sticky top navigation bar as a JSX component.
 * @param props   Header nav props (`activeNav` and optional `sidebar`).
 * @returns Rendered `<header class="site-header">` JSX fragment.
 */
export function HeaderNav(props: HeaderNavProps): HtmlFragment {
  return raw(renderHeaderNav(props.activeNav, props.sidebar));
}
