/**
 * Shared isomorphic utilities barrel – Pure snippet tokenizer, parameter codecs, stack DSL helpers, and URL builder core shared by Worker SSR and browser client bundles.
 */

export { isTypingFieldActiveForLayout, resolveEffectiveFieldDefault } from './defaults';
export {
  decodeSegment,
  encodeSegment,
  findField,
  findOption,
  findService,
  readState,
} from './encoding';
export {
  composeAnim,
  composeHint,
  composeIconPair,
  composeSpecial,
  splitAnim,
  splitHint,
  splitIconPair,
  splitSize,
  splitSpecial,
} from './fields';
export {
  buildMarkdownSnippetTokens,
  buildSnippets,
  buildSnippetTokens,
  encodeMarkdownDestination,
  tokenizeUrl,
} from './snippets';
export {
  collectStackSlugs,
  collectStackTileTokens,
  composeCategorizedStack,
  normalizeStackGroups,
  stripStackTileColor,
} from './stackDsl';
export {
  buildAltText,
  buildDefaultLinkTarget,
  buildPath,
  buildPreviewPath,
  buildShareUrl,
  parsePath,
} from './url';
