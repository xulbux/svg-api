/**
 * Services documentation page – Renders the Live Service Badges (`/docs/services`) section (`<ServicesSection />`).
 */

import { SERVICES_CONFIG } from '@/config/services';
import {
  buildServiceParamRows,
  SERVICE_PRESET_CARDS,
  SERVICE_ROUTE_PATTERN,
} from '@/site/catalog/services';
import { ParamTable } from '@/site/components/ParamTable';
import { SectionHeader, SectionSubhead } from '@/site/components/SectionHeader';
import { CardGrid } from '@/site/components/ShowcaseCard';
import type { HtmlFragment } from '@/site/jsx';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the dedicated Public Service Badges (`/docs/services`) documentation section as a JSX component.
 * @returns Rendered `<section class="doc-section" id="services">` JSX fragment.
 */
export function ServicesSection(): HtmlFragment {
  const serviceCount = Object.keys(SERVICES_CONFIG).length;
  return (
    <section class="doc-section" id="services">
      <SectionHeader
        description={`Live metrics from ${serviceCount} public registries, forges, and CDNs, edge-cached with automatic 302 redirects when opened in a browser tab.`}
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
