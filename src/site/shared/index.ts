/**
 * Shared isomorphic utilities barrel – Pure snippet tokenizer, parameter codecs, stack DSL helpers, and URL builder core shared by Worker SSR and browser client bundles.
 */

// -------------------------------------- PUBLIC API -------------------------------------

export {
  isTypingFieldActiveForLayout,
  resolveActiveServiceMetric,
  resolveEffectiveFieldDefault,
} from '@/site/shared/defaults';
export {
  BRAND_SLUG_CLEAN_RX,
  capitalizeSlugParts,
  decodeSegment,
  encodeSegment,
  findField,
  findOption,
  findService,
  HINT_ICON_REST_RX,
  readState,
} from '@/site/shared/encoding';
export {
  composeAnim,
  composeHint,
  composeIconPair,
  composeSpecial,
  resolveIconSelectDisplay,
  splitAnim,
  splitHint,
  splitIconPair,
  splitSize,
  splitSpecial,
} from '@/site/shared/fields';
export {
  buildMarkdownSnippetTokens,
  buildSnippets,
  buildSnippetTokens,
  encodeMarkdownDestination,
  tokenizeUrl,
} from '@/site/shared/snippets';
export {
  collectStackSlugs,
  collectStackTileTokens,
  composeCategorizedStack,
  normalizeStackGroups,
  stripStackTileColor,
} from '@/site/shared/stackDsl';
export {
  buildAltText,
  buildDefaultLinkTarget,
  buildPath,
  buildPreviewPath,
  buildShareUrl,
  parsePath,
} from '@/site/shared/url';
