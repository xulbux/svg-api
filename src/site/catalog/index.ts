/**
 * Documentation catalog barrel – Re-exports the modular catalog data (`src/site/catalog/`).
 */

// -------------------------------------- PUBLIC API -------------------------------------

export {
  buildBadgeParamRows,
  buildBadgeUseCaseCards,
  buildBadgeVariantCards,
} from '@/site/catalog/badges';
export {
  buildButtonParamRows,
  buildButtonVariantCards,
  BUTTON_USE_CASE_CARDS,
} from '@/site/catalog/buttons';
export { buildColorSwatchCards } from '@/site/catalog/colors';
export { buildIconParamRows, ICON_CARDS } from '@/site/catalog/icons';
export {
  buildCachingRows,
  buildSharedParamRows,
  CACHING_COLUMNS,
  EMBEDDING_CARDS,
  SEGMENT_ENCODING_COLUMNS,
  SEGMENT_ENCODING_ROWS,
  SHARED_PARAM_COLUMNS,
  URL_ANATOMY_PARTS,
} from '@/site/catalog/overview';
export {
  buildQuoteParamRows,
  HORIZONTAL_QUOTE_CARDS,
  VERTICAL_QUOTE_CARDS,
} from '@/site/catalog/quotes';
export {
  buildServiceParamRows,
  buildServicePresetCards,
  buildServiceRoutePattern,
  formatServiceMetrics,
  SERVICE_ROUTE_PATTERN,
} from '@/site/catalog/services';
export {
  ENCODED_CHAOS_QUOTE,
  formatCountLowerBound,
  getEndpointRoutes,
  getIconSetCounts,
  listRouteAliases,
  STACK_EXAMPLE_GROUPS,
} from '@/site/catalog/shared';
export {
  buildStackAnimationCards,
  buildStackParamRows,
  buildStackVariantCards,
} from '@/site/catalog/stack';
export {
  buildTypingParamRows,
  TYPING_BEHAVIOR_CARDS,
  TYPING_LAYOUT_CARDS,
  TYPING_VARIANT_CARDS,
} from '@/site/catalog/typing';
