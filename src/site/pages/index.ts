/**
 * Website pages barrel – Re-exports the homepage (`/`), documentation pages (`/docs`, `/docs/:section`), URL builder pages (`/builder/:kind`), and section components.
 */

export { BadgesSection, renderBadgesSectionHtml } from './BadgesPage';
export { BuilderPage, renderBuilderHtml } from './BuilderPage';
export { ButtonsSection, renderButtonsSectionHtml } from './ButtonsPage';
export { ColorsSection, renderColorsSectionHtml } from './ColorsPage';
export { DocsPage, isDocsSectionSlug, renderDocsHtml } from './DocsPage';
export type { DocsPageProps } from './DocsPage';
export { HomePage, renderHomeHtml } from './HomePage';
export { IconsSection, renderIconsSectionHtml } from './IconsPage';
export { OverviewSection, renderOverviewSectionHtml } from './OverviewPage';
export { QuotesSection, renderQuotesSectionHtml } from './QuotesPage';
export { ServicesSection, renderServicesSectionHtml } from './ServicesPage';
export { StackSection, renderStackSectionHtml } from './StackPage';
