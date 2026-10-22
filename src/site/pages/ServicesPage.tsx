/**
 * Services documentation page – Renders the Live Service Badges (`/docs/services`) section (`<ServicesSection />` and `renderServicesSectionHtml`).
 */

import { listPublicServices } from '@/config/services';
import {
  buildServiceParamRows,
  SERVICE_PRESET_CARDS,
  SERVICE_ROUTE_PATTERN,
} from '@/site/catalog/services';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import { renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the dedicated Public Service Badges (`/docs/services`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="services">` JSX fragment.
 */
export function ServicesSection(): HtmlFragment {
  const publicServices = listPublicServices();
  return (
    <section class="doc-section" id="services">
      <SectionHeader
        description={`Auto-fetched metrics from ${publicServices.length} public registries and forges (no tokens required) with multi-tier edge caching and smart 302 redirects to the upstream page when opened in a browser tab. The route reference below lists every service with its exact route, metrics (aliases in parentheses), and owner defaults.`}
        routes={[SERVICE_ROUTE_PATTERN]}
        title="Live Service Badges"
      />
      <SectionSubhead iconSlug="activity" text="Service Preset Examples" />
      <CardGrid cards={SERVICE_PRESET_CARDS} />
      <SectionSubhead iconSlug="book-open" text="Service Route Reference" />
      <ParamTable rows={buildServiceParamRows()} label="Service preset routes and metrics" />
    </section>
  );
}

/**
 * Render the dedicated Public Service Badges (`/docs/services`) documentation section HTML.
 * @returns HTML string for the `/docs/services` documentation and live preview section.
 */
export function renderServicesSectionHtml(): string {
  return renderHtml(<ServicesSection />);
}
