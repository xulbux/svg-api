/**
 * Sidebar Component
 *
 * Grouped left navigation sidebar (`<Sidebar />`) rendered as a sticky column on wide screens and a popover drawer on narrow screens.
 */

import { UiIcon } from '@/site/components/UiIcon';
import type { HtmlFragment } from '@/site/jsx';
import type { PageSidebar } from '@/types';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the grouped left sidebar (a sticky column on wide screens and a popover drawer with a close button on narrow screens,
 * opened by the header's sidebar toggle) as a JSX component.
 * @param sidebar   Sidebar configuration (`activeHref`, `groups`, `label`).
 * @returns Rendered `<aside class="sidebar">` JSX fragment.
 */
export function Sidebar(sidebar: PageSidebar): HtmlFragment {
  const groupSections: HtmlFragment[] = [];
  for (let i = 0; i < sidebar.groups.length; i += 1) {
    const group = sidebar.groups[i];
    if (group) {
      const titleId = `sidebar-group-${i}`;
      const linkItems: HtmlFragment[] = [];
      for (const link of group.links) {
        const isActive = link.href === sidebar.activeHref;
        linkItems.push(
          <li>
            <a
              href={link.href}
              class={isActive ? 'sidebar-link is-active' : 'sidebar-link'}
              aria-current={isActive ? 'page' : undefined}
              tabindex="0">
              {link.label}
            </a>
          </li>
        );
      }
      groupSections.push(
        <section class="sidebar-group">
          <p class="sidebar-group-title" id={titleId}>
            <UiIcon slug={group.icon} size={14} />
            {group.title}
          </p>
          <ul class="sidebar-list" aria-labelledby={titleId}>
            {linkItems}
          </ul>
        </section>
      );
    }
  }
  const closeLabel = `Close ${sidebar.label}`;
  return (
    <aside class="sidebar" id="sidebar-drawer">
      <button
        type="button"
        class="sidebar-close"
        popovertarget="sidebar-drawer"
        popovertargetaction="hide"
        aria-controls="sidebar-drawer"
        aria-label={closeLabel}
        title={closeLabel}>
        <UiIcon slug="x" size={16} />
      </button>
      <nav aria-label={sidebar.label}>{groupSections}</nav>
    </aside>
  );
}
