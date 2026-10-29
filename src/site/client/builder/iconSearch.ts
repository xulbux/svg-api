/**
 * Icon picker search & display helpers – Pure search ranking, trigger display state, cursor slug insertion, and `<template>` SVG glyph instantiation.
 */

import {
  BRAND_SLUG_CLEAN_RX,
  getOwnValue,
  resolveIconSelectDisplay as resolvePureIconSelectDisplay,
} from '@/site/shared';
import type {
  IconCatalogFilterResult,
  IconMatch,
  IconPickerIndex,
  IconPickerSetId,
  IconSelectDisplay,
} from '@/types';

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches whitespace runs in search queries. */
const WHITESPACE_RX = /\s+/g;

/** Matches a trailing separator (or whitespace) in the stack groups textarea when inserting a picked icon. */
const TRAILING_STACK_SEPARATOR_RX = /[,;|\s]$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Check whether every whitespace-separated word of `tokens` appears in `haystack`. */
function hasAllQueryTokens(haystack: string, tokens: readonly string[]): boolean {
  for (const token of tokens) {
    if (!haystack.includes(token)) {
      return false;
    }
  }
  return true;
}

/** Build `[-_.]`-cleaned search tokens (`undefined` when no token contains brand punctuation) so `next.js` or `github-actions` match brand slugs. */
function buildCleanBrandTokens(tokens: readonly string[]): string[] | undefined {
  let cleanTokens: string[] | undefined = undefined;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    const cleaned = token.replace(BRAND_SLUG_CLEAN_RX, '');
    if (cleaned.length > 0 && cleaned !== token) {
      cleanTokens ??= tokens.slice(0, i);
      cleanTokens.push(cleaned);
    } else if (cleanTokens) {
      cleanTokens.push(token);
    }
  }
  return cleanTokens;
}

/** Check whether `haystack` matches either `tokens` or optional `cleanTokens`. */
function matchesQueryOrCleanTokens(
  haystack: string,
  tokens: readonly string[],
  cleanTokens: readonly string[] | undefined
): boolean {
  return (
    hasAllQueryTokens(haystack, tokens) ||
    (cleanTokens !== undefined && hasAllQueryTokens(haystack, cleanTokens))
  );
}

/** Collect target icon slugs whose alias matches every token of `queryTokens` (or `cleanTokens`). */
function collectMatchingAliasTargets(
  aliasMap: Readonly<Record<string, string>>,
  queryTokens: readonly string[],
  targetSet: Set<string>,
  cleanTokens?: readonly string[]
): void {
  for (const [alias, primary] of Object.entries(aliasMap)) {
    if (matchesQueryOrCleanTokens(alias, queryTokens, cleanTokens)) {
      targetSet.add(primary);
    }
  }
}

/**
 * Compute the filtered icon picker matches for a single icon set and search query
 * (prefix slug matches first, then substring/alias matches, then icon tag matches).
 */
function computeSetMatches(
  index: IconPickerIndex,
  catalog: Record<IconPickerSetId, string[]>,
  set: IconPickerSetId,
  query: string,
  queryTokens: readonly string[],
  setAliasHits: ReadonlySet<string>,
  cleanTokens?: readonly string[]
): IconMatch[] {
  const prefixMatches: IconMatch[] = [];
  const substringMatches: IconMatch[] = [];
  const tagMatches: IconMatch[] = [];
  for (const slug of catalog[set]) {
    if (slug.startsWith(query)) {
      prefixMatches.push({ set, slug });
    } else if (
      matchesQueryOrCleanTokens(slug, queryTokens, cleanTokens) ||
      setAliasHits.has(slug)
    ) {
      substringMatches.push({ set, slug });
    } else if (set === 'lucide') {
      const tags = getOwnValue(index.lucideTags, slug);
      if (tags && hasAllQueryTokens(`${slug} ${tags}`, queryTokens)) {
        tagMatches.push({ set, slug });
      }
    }
  }
  prefixMatches.push(...substringMatches, ...tagMatches);
  return prefixMatches;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Compute filtered icon matches across both sets for `rawQuery` (`counts` is `undefined` when `rawQuery` is empty).
 * @param index       Loaded icon picker index.
 * @param catalog     Renderable icon slugs per set.
 * @param activeSet   Currently selected icon set identifier.
 * @param rawQuery    Raw search input string.
 * @returns Active-tab matches and optional per-tab match counts.
 */
export function filterIconCatalog(
  index: IconPickerIndex,
  catalog: Record<IconPickerSetId, string[]>,
  activeSet: IconPickerSetId,
  rawQuery: string
): IconCatalogFilterResult {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    const allMatches: IconMatch[] = [];
    for (const slug of catalog[activeSet]) {
      allMatches.push({ set: activeSet, slug });
    }
    return { counts: undefined, matches: allMatches };
  }

  const queryTokens = query.split(WHITESPACE_RX);
  const cleanBrandTokens = buildCleanBrandTokens(queryTokens);
  const lucideAliasHits = new Set<string>();
  const brandAliasHits = new Set<string>();
  collectMatchingAliasTargets(index.lucideAliases, queryTokens, lucideAliasHits);
  collectMatchingAliasTargets(index.brandAliases, queryTokens, brandAliasHits, cleanBrandTokens);
  for (const [alias, primary] of Object.entries(index.aliases)) {
    if (hasAllQueryTokens(alias, queryTokens)) {
      lucideAliasHits.add(primary);
      brandAliasHits.add(primary);
    } else if (cleanBrandTokens !== undefined && hasAllQueryTokens(alias, cleanBrandTokens)) {
      brandAliasHits.add(primary);
    }
  }

  const lucideMatches = computeSetMatches(
    index,
    catalog,
    'lucide',
    query,
    queryTokens,
    lucideAliasHits
  );
  const brandMatches = computeSetMatches(
    index,
    catalog,
    'brands',
    query,
    queryTokens,
    brandAliasHits,
    cleanBrandTokens
  );
  return {
    counts: { brands: brandMatches.length, lucide: lucideMatches.length },
    matches: activeSet === 'brands' ? brandMatches : lucideMatches,
  };
}

/**
 * Resolve the effective icon slug represented by `trigger` and `rawSlug`.
 * @param trigger              Icon selector trigger element.
 * @param rawSlug              Raw hidden input value.
 * @param hasDynamicFallback   Whether dynamic preset icons fall back to their static preview slug.
 * @returns Effective icon slug (`''` when none).
 */
export function resolveTriggerEffectiveSlug(
  trigger: HTMLElement | undefined,
  rawSlug: string,
  hasDynamicFallback: boolean
): string {
  if (trigger?.dataset.presetDynamic === 'true' && !hasDynamicFallback && !rawSlug.trim()) {
    return '';
  }
  return resolvePureIconSelectDisplay(
    rawSlug,
    '',
    trigger?.dataset.presetIcon,
    trigger?.dataset.presetDynamic === 'true'
  ).glyphSlug;
}

/**
 * Resolve the label, placeholder state, and glyph slug of an icon selector trigger.
 * @param trigger       Icon selector trigger element.
 * @param rawSlug       Raw hidden input value.
 * @param placeholder   Fallback placeholder text.
 * @returns Display label, glyph slug, and placeholder state flag.
 */
export function resolveIconSelectDisplay(
  trigger: HTMLElement | undefined,
  rawSlug: string,
  placeholder: string
): IconSelectDisplay {
  return resolvePureIconSelectDisplay(
    rawSlug,
    placeholder,
    trigger?.dataset.presetIcon,
    trigger?.dataset.presetDynamic === 'true'
  );
}

/**
 * Insert `slug` at the current caret or selection inside `target` (adding a comma separator when needed).
 * @param target   Target input or textarea element.
 * @param slug     Picked icon slug.
 */
export function insertPickedSlugAtCursor(
  target: HTMLInputElement | HTMLTextAreaElement,
  slug: string
): void {
  const cursor = target.selectionStart ?? target.value.length;
  const before = target.value.slice(0, cursor);
  const after = target.value.slice(target.selectionEnd ?? cursor);
  const needsSeparator = before.length > 0 && !TRAILING_STACK_SEPARATOR_RX.test(before);
  const insertion = `${needsSeparator ? ',' : ''}${slug}`;
  target.value = `${before}${insertion}${after}`;
  const cursorAfter = before.length + insertion.length;
  target.setSelectionRange(cursorAfter, cursorAfter);
}

/**
 * Clone an `<svg>` glyph shell from `glyphTemplates` and populate its inner SVG body.
 * @param glyphTemplates   `<template id="icon-glyph-templates">` element.
 * @param set              Icon set identifier.
 * @param innerSvg         Trusted server-provided SVG body fragment.
 * @returns Populated `<svg>` element.
 */
export function createIconGlyph(
  glyphTemplates: HTMLElement | null,
  set: IconPickerSetId,
  innerSvg: string
): SVGSVGElement {
  const template =
    glyphTemplates instanceof HTMLTemplateElement
      ? glyphTemplates.content.querySelector(`svg[data-set="${set}"]`)
      : undefined;
  const glyph = template ? document.importNode(template, false) : undefined;
  const svg =
    glyph instanceof SVGSVGElement
      ? glyph
      : document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.removeAttribute('data-set');
  svg.innerHTML = innerSvg;
  return svg;
}
