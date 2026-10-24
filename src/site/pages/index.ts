/**
 * Website pages barrel – Re-exports the homepage (`/`), documentation pages (`/docs`, `/docs/:section`), URL builder pages (`/builder/:kind`), HTTP status pages, and section components.
 */

// -------------------------------------- PUBLIC API -------------------------------------

export { BadgesSection } from '@/site/pages/BadgesPage';
export { renderBuilderHtml } from '@/site/pages/BuilderPage';
export { ButtonsSection } from '@/site/pages/ButtonsPage';
export { ColorsSection } from '@/site/pages/ColorsPage';
export { isDocsSectionSlug, renderDocsHtml } from '@/site/pages/DocsPage';
export { renderHomeHtml } from '@/site/pages/HomePage';
export { IconsSection } from '@/site/pages/IconsPage';
export { renderNotFoundHtml, renderServerErrorHtml } from '@/site/pages/NotFoundPage';
export { OverviewSection } from '@/site/pages/OverviewPage';
export { QuotesSection } from '@/site/pages/QuotesPage';
export { ServicesSection } from '@/site/pages/ServicesPage';
export { StackSection } from '@/site/pages/StackPage';
export { TypingSection } from '@/site/pages/TypingPage';
