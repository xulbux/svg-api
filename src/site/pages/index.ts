/**
 * Website pages barrel – Re-exports the homepage (`/`), documentation pages (`/docs`, `/docs/:section`), URL builder pages (`/builder/:kind`), `404` page, and section components.
 */

export { BadgesSection } from './BadgesPage';
export { BuilderPage, renderBuilderHtml } from './BuilderPage';
export { ButtonsSection } from './ButtonsPage';
export { ColorsSection } from './ColorsPage';
export { DocsPage, isDocsSectionSlug, renderDocsHtml } from './DocsPage';
export type { DocsPageProps } from './DocsPage';
export { HomePage, renderHomeHtml } from './HomePage';
export { IconsSection } from './IconsPage';
export { NotFoundPage, renderNotFoundHtml } from './NotFoundPage';
export { OverviewSection } from './OverviewPage';
export { QuotesSection } from './QuotesPage';
export { ServicesSection } from './ServicesPage';
export { StackSection } from './StackPage';
export { TypingSection } from './TypingPage';
