/**
 * Website UI components barrel – Re-exports layout shell, navigation chrome, showcase cards, parameter tables, builder controls, and UI icons from `src/site/components/`.
 */

export { BuilderFieldView } from './BuilderControls';
export { BuilderOutputPanel } from './BuilderOutputPanel';
export { DocsPager } from './DocsPager';
export type { DocsPagerProps } from './DocsPager';
export { Footer, renderFooter } from './Footer';
export { HeaderNav, renderHeaderNav } from './HeaderNav';
export { IconPickerPopover, renderIconPickerHtml } from './IconPickerPopover';
export { getHeadScriptBody, PageLayout, renderFaviconSvg } from './PageLayout';
export { AliasList, ParamTable, renderAliasList, renderParamTable } from './ParamTable';
export { RoutePills, SectionHeader, SectionSubhead } from './SectionHeader';
export type { RoutePillsProps, SectionHeaderProps, SectionSubheadProps } from './SectionHeader';
export { CardGrid, ShowcaseCard } from './ShowcaseCard';
export { Sidebar } from './Sidebar';
export {
  AnchorLink,
  BRAND_FILL_ATTRS,
  CopyButton,
  InlineMarkup,
  LUCIDE_STROKE_ATTRS,
  UiIcon,
  UiSprite,
  formatInlineMarkupHtml,
  renderUiIcon,
  renderUiSprite,
  serializeInlineJson,
  slugifyText,
  stripInlineMarkup,
} from './UiIcon';
export { UrlAnatomy } from './UrlAnatomy';
