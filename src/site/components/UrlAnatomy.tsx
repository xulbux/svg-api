/**
 * URL anatomy component – Syntax-highlighted URL diagram and legend (`<UrlAnatomy />`).
 */

import type { HtmlFragment } from '@/site/jsx';

// ---------------------------------------- TYPES ----------------------------------------

/** Highlighted part of a URL anatomy example. */
export interface UrlAnatomyPart {
  /** Syntax highlighting class (`hl-*`). */
  readonly className: string;
  /** Optional legend label (omitted on repeated roles in the URL). */
  readonly label?: string | undefined;
  /** Literal URL text. */
  readonly text: string;
}

/** Props for the `<UrlAnatomy />` component. */
export interface UrlAnatomyProps {
  /** Highlighted URL parts and legend entries. */
  readonly parts: readonly UrlAnatomyPart[];
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the highlighted URL anatomy example with its legend as a JSX component.
 * @param props   URL anatomy props (`parts`).
 * @returns Rendered `<figure class="anatomy">` JSX fragment.
 */
export function UrlAnatomy(props: UrlAnatomyProps): HtmlFragment {
  const urlSpans: HtmlFragment[] = [];
  const legendItems: HtmlFragment[] = [];
  for (const part of props.parts) {
    urlSpans.push(<span class={part.className}>{part.text}</span>);
    if (part.label) {
      legendItems.push(
        <li class="anatomy-legend-item">
          <span class={`anatomy-swatch ${part.className}`} aria-hidden="true"></span>
          {part.label}
        </li>
      );
    }
  }
  return (
    <figure class="anatomy">
      <code class="anatomy-url">{urlSpans}</code>
      <figcaption>
        <ul class="anatomy-legend" role="list">
          {legendItems}
        </ul>
      </figcaption>
    </figure>
  );
}
