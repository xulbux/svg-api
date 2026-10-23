/**
 * Website pages barrel – Re-exports the homepage (`/`), documentation pages (`/docs`, `/docs/:section`), URL builder pages (`/builder/:kind`), HTTP status pages, and section components.
 */

// -------------------------------------- PUBLIC API -------------------------------------

export { BadgesSection } from '@/site/pages/BadgesPage';
export { BuilderPage, renderBuilderHtml } from '@/site/pages/BuilderPage';
export { ButtonsSection } from '@/site/pages/ButtonsPage';
export { ColorsSection } from '@/site/pages/ColorsPage';
export { DocsPage, isDocsSectionSlug, renderDocsHtml } from '@/site/pages/DocsPage';
export { HomePage, renderHomeHtml } from '@/site/pages/HomePage';
export { IconsSection } from '@/site/pages/IconsPage';
export {
  NotFoundPage,
  renderNotFoundHtml,
  renderServerErrorHtml,
  ServerErrorPage,
} from '@/site/pages/NotFoundPage';
export { OverviewSection } from '@/site/pages/OverviewPage';
export { QuotesSection } from '@/site/pages/QuotesPage';
export { ServicesSection } from '@/site/pages/ServicesPage';
export { StackSection } from '@/site/pages/StackPage';
export { TypingSection } from '@/site/pages/TypingPage';
