/**
 * Documentation catalog barrel – Re-exports the modular catalog data (`src/site/catalog/`).
 */

export {
  BADGE_VARIANT_DESCRIPTORS,
  buildBadgeParamRows,
  buildBadgeUseCaseCards,
  buildBadgeVariantCards,
} from './badges';
export {
  buildButtonParamRows,
  buildButtonVariantCards,
  BUTTON_USE_CASE_CARDS,
  BUTTON_VARIANT_DESCRIPTORS,
} from './buttons';
export { buildColorSwatchCards } from './colors';
export { buildIconParamRows, ICON_CARDS } from './icons';
export {
  buildCachingRows,
  buildSharedParamRows,
  CACHING_COLUMNS,
  EMBEDDING_CARDS,
  SEGMENT_ENCODING_COLUMNS,
  SEGMENT_ENCODING_ROWS,
  SHARED_PARAM_COLUMNS,
  URL_ANATOMY_PARTS,
} from './overview';
export { buildQuoteParamRows, HORIZONTAL_QUOTE_CARDS, VERTICAL_QUOTE_CARDS } from './quotes';
export { buildServiceParamRows, SERVICE_PRESET_CARDS, SERVICE_ROUTE_PATTERN } from './services';
export {
  ENCODED_CHAOS_QUOTE,
  ENDPOINT_ROUTES,
  formatCountLowerBound,
  getIconSetCounts,
  STACK_EXAMPLE_GROUPS,
} from './shared';
export {
  buildStackParamRows,
  buildStackVariantCards,
  countStackExampleIcons,
  STACK_VARIANT_DESCRIPTORS,
} from './stack';
