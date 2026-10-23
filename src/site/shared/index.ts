/**
 * Shared isomorphic utilities barrel – Pure snippet tokenizer and URL builder core shared by the Worker SSR and the browser client bundles.
 */

export {
  buildMarkdownSnippetTokens,
  buildSnippets,
  buildSnippetTokens,
  encodeMarkdownDestination,
  tokenizeUrl,
} from './snippets';
export {
  buildAltText,
  buildDefaultLinkTarget,
  buildPath,
  buildPreviewPath,
  buildShareUrl,
  collectStackSlugs,
  collectStackTileTokens,
  composeAnim,
  composeCategorizedStack,
  composeIconPair,
  composeSpecial,
  decodeSegment,
  encodeSegment,
  findField,
  findOption,
  findService,
  isTypingFieldActiveForLayout,
  normalizeStackGroups,
  parsePath,
  readState,
  resolveEffectiveFieldDefault,
  splitAnim,
  splitIconPair,
  splitSize,
  splitSpecial,
  stripStackTileColor,
} from './url';
