/**
 * Website UI components barrel – Re-exports layout shell, navigation chrome, showcase cards, parameter tables, builder controls, and UI icons from `src/site/components/`.
 */

export { BuilderFieldView } from './BuilderControls';
export { BuilderOutputPanel, renderOutputPanelHtml } from './BuilderOutputPanel';
export { DocsPager, renderDocsPager } from './DocsPager';
export type { DocsPagerProps } from './DocsPager';
export { Footer, renderFooter } from './Footer';
export { HeaderNav, renderHeaderNav } from './HeaderNav';
export { IconPickerPopover, renderIconPickerHtml } from './IconPickerPopover';
export { PageLayout, renderFaviconSvg, renderPageLayout } from './PageLayout';
export { AliasList, ParamTable, renderAliasList, renderParamTable } from './ParamTable';
export {
  RoutePills,
  SectionHeader,
  SectionSubhead,
  renderSectionHeader,
  renderSectionSubhead,
} from './SectionHeader';
export { CardGrid, ShowcaseCard, renderCardsHtml, renderShowcaseCard } from './ShowcaseCard';
export { Sidebar, renderSidebar } from './Sidebar';
export {
  AnchorLink,
  BRAND_FILL_ATTRS,
  CopyButton,
  InlineMarkup,
  LUCIDE_STROKE_ATTRS,
  UiIcon,
  UiSprite,
  formatInlineMarkupHtml,
  renderCopyButton,
  renderUiIcon,
  renderUiSprite,
  serializeInlineJson,
  slugifyText,
  stripInlineMarkup,
} from './UiIcon';
export { UrlAnatomy, renderUrlAnatomyHtml } from './UrlAnatomy';
