/**
 * Section header components – Page and section headers (`<SectionHeader />`), route pattern pills (`<RoutePills />`), and icon-prefixed subheadings (`<SectionSubhead />`).
 */

import {
  AnchorLink,
  InlineMarkup,
  slugifyText,
  stripInlineMarkup,
  UiIcon,
} from '@/site/components/UiIcon';
import { raw, renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';
import type { SectionHeaderOptions } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the `<RoutePills />` component. */
export interface RoutePillsProps {
  /** Route pattern strings (e.g., `['/badge/:label/:value']`). */
  readonly patterns: readonly string[];
}

/** Props for the `<SectionSubhead />` component. */
export interface SectionSubheadProps {
  /** Lucide icon slug (e.g., `'layers'`). */
  readonly iconSlug: string;
  /** Subheading text (supports inline `` `code` `` markup). */
  readonly text: string;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render a list of route pattern pills (`GET /badge/…`) as a JSX component.
 * @param props   Route pills props (`patterns`).
 * @returns Rendered `<div class="route-pills">` fragment.
 */
export function RoutePills(props: RoutePillsProps): HtmlFragment {
  const pills: HtmlFragment[] = [];
  for (const pattern of props.patterns) {
    pills.push(
      <code class="route-pill">
        <span class="route-method">GET</span>
        {pattern}
      </code>
    );
  }
  return <div class="route-pills">{pills}</div>;
}

/**
 * Render a documentation section header (title, optional header action, lead paragraph, and route pills) as a JSX component.
 * @param options   Section header options (`title`, `description`, optional `actionHtml`, `routes`, and `headingLevel`).
 * @returns Rendered `<div class="section-header">` fragment.
 */
export function SectionHeader(options: SectionHeaderOptions): HtmlFragment {
  const titleFragment =
    options.headingLevel === 2 ? (
      <h2 class="section-title">
        <InlineMarkup text={options.title} />
      </h2>
    ) : (
      <h1 class="section-title">
        <InlineMarkup text={options.title} />
      </h1>
    );
  const headerTop = options.actionHtml ? (
    <div class="section-title-row">
      {titleFragment}
      {raw(options.actionHtml)}
    </div>
  ) : (
    titleFragment
  );
  return (
    <div class="section-header">
      {headerTop}
      <p class="section-desc">
        <InlineMarkup text={options.description} />
      </p>
      {options.routes ? <RoutePills patterns={options.routes} /> : undefined}
    </div>
  );
}

/**
 * Render a documentation section header (title, optional header action, lead paragraph, and route pills).
 * @param options   Section header options (`title`, `description`, optional `actionHtml`, `routes`, and `headingLevel`).
 * @returns HTML string for the section header.
 */
export function renderSectionHeader(options: SectionHeaderOptions): string {
  return renderHtml(<SectionHeader {...options} />);
}

/**
 * Render a section subheading (`<h2>`) with a leading Lucide icon and a hover/focus deep-link anchor as a JSX component.
 * @param props   Section subhead props (`iconSlug` and `text`).
 * @returns Rendered `<div class="subhead-row">` fragment.
 */
export function SectionSubhead(props: SectionSubheadProps): HtmlFragment {
  const plainText = stripInlineMarkup(props.text);
  const subheadId = slugifyText(plainText);
  return (
    <div class="subhead-row" id={subheadId}>
      <h2 class="section-subhead">
        <UiIcon slug={props.iconSlug} size={16} />
        <span class="section-subhead-text">
          <InlineMarkup text={props.text} />
        </span>
      </h2>
      <AnchorLink targetId={subheadId} label={plainText} />
    </div>
  );
}

/**
 * Render a section subheading (`<h2>`) with a leading Lucide icon and a hover/focus deep-link anchor.
 * @param iconSlug   Lucide icon slug (e.g., `'layers'`).
 * @param text       Subheading text (supports inline `` `code` `` markup).
 * @returns HTML string for the subheading row.
 */
export function renderSectionSubhead(iconSlug: string, text: string): string {
  return renderHtml(<SectionSubhead iconSlug={iconSlug} text={text} />);
}
