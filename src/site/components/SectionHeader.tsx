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
import type { HtmlFragment, JsxChild } from '@/site/jsx';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the `<RoutePills />` component. */
interface RoutePillsProps {
  /** Route pattern strings (e.g., `['/badge/:label/:value']`). */
  readonly patterns: readonly string[];
}

/** Props for the `<SectionHeader />` component. */
interface SectionHeaderProps {
  /** Optional trailing header action rendered beside the title (e.g., the builder's `Reference` link). */
  readonly action?: JsxChild;
  /** Lead description paragraph (supports inline `` `code` `` and `**strong**` markup). */
  readonly description: string;
  /** Heading level (`1` on dedicated pages, `2` for secondary homepage sections; defaults to `1`). */
  readonly headingLevel?: 1 | 2 | undefined;
  /** Optional route pattern pills displayed below the description. */
  readonly routes?: readonly string[] | undefined;
  /** Section heading text (supports inline `` `code` `` and `**strong**` markup). */
  readonly title: string;
}

/** Props for the `<SectionSubhead />` component. */
interface SectionSubheadProps {
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
 * @param props   Section header props (`title`, `description`, optional `action`, `routes`, and `headingLevel`).
 * @returns Rendered `<div class="section-header">` fragment.
 */
export function SectionHeader(props: SectionHeaderProps): HtmlFragment {
  const titleFragment =
    props.headingLevel === 2 ? (
      <h2 class="section-title">
        <InlineMarkup text={props.title} />
      </h2>
    ) : (
      <h1 class="section-title">
        <InlineMarkup text={props.title} />
      </h1>
    );
  const headerTop = props.action ? (
    <div class="section-title-row">
      {titleFragment}
      {props.action}
    </div>
  ) : (
    titleFragment
  );
  return (
    <div class="section-header">
      {headerTop}
      <p class="section-desc">
        <InlineMarkup text={props.description} />
      </p>
      {props.routes ? <RoutePills patterns={props.routes} /> : undefined}
    </div>
  );
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
