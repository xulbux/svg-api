/**
 * Documentation catalog barrel – Re-exports the modular catalog data (`src/site/catalog/`).
 */

// -------------------------------------- PUBLIC API -------------------------------------

export {
  BADGE_VARIANT_DESCRIPTORS,
  buildBadgeParamRows,
  buildBadgeUseCaseCards,
  buildBadgeVariantCards,
} from '@/site/catalog/badges';
export {
  buildButtonParamRows,
  buildButtonVariantCards,
  BUTTON_USE_CASE_CARDS,
  BUTTON_VARIANT_DESCRIPTORS,
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
  buildServiceRoutePattern,
  formatServiceMetrics,
  SERVICE_PRESET_CARDS,
  SERVICE_ROUTE_PATTERN,
} from '@/site/catalog/services';
export {
  ENCODED_CHAOS_QUOTE,
  ENDPOINT_ROUTES,
  formatCountLowerBound,
  getIconSetCounts,
  STACK_EXAMPLE_GROUPS,
} from '@/site/catalog/shared';
export {
  buildStackParamRows,
  buildStackVariantCards,
  STACK_ANIMATION_CARDS,
  STACK_VARIANT_DESCRIPTORS,
} from '@/site/catalog/stack';
export {
  buildTypingParamRows,
  TYPING_BEHAVIOR_CARDS,
  TYPING_LAYOUT_CARDS,
  TYPING_VARIANT_CARDS,
} from '@/site/catalog/typing';
