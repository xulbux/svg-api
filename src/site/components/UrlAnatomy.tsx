/**
 * URL anatomy component – Syntax-highlighted URL diagram and legend (`<UrlAnatomy />`) on the Getting Started page.
 */

import { renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';

// ---------------------------------------- TYPES ----------------------------------------

/** Highlighted part of the URL anatomy example on the Getting Started page. */
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

/**
 * Render the highlighted URL anatomy example with its legend as an HTML string.
 * @param parts   Highlighted URL parts and legend entries.
 * @returns HTML string for the anatomy figure.
 */
export function renderUrlAnatomyHtml(parts: readonly UrlAnatomyPart[]): string {
  return renderHtml(<UrlAnatomy parts={parts} />);
}
