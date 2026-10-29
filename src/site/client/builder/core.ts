/**
 * Builder client core – Pure URL, snippet, grid focus, async cache, and icon resolver helpers shared across the builder modules.
 */

import { filterIconCatalog } from '@/site/client/builder/iconSearch';
import { createTypingLinesController } from '@/site/client/builder/typingLines';
import type { TypingLinesControllerOptions } from '@/site/client/builder/typingLines';
import type { SvgSite } from '@/site/client/site/types';
import {
  BRAND_SLUG_CLEAN_RX,
  buildAltText,
  buildDefaultLinkTarget,
  buildPath,
  buildPreviewPath,
  buildShareUrl,
  buildSnippets,
  buildSnippetTokens,
  capitalizeSlugParts,
  collectStackSlugs,
  composeAnim,
  composeCategorizedStack,
  composeHint,
  composeIconPair,
  composeSpecial,
  decodeSegment,
  encodeSegment,
  getOwnValue,
  isTypingFieldActiveForLayout,
  parsePath,
  resolveEffectiveFieldDefault,
  resolveIconSelectDisplay,
  resolveStackPrefillMode,
  splitAnim,
  splitHint,
  splitIconPair,
  splitSize,
  splitSpecial,
} from '@/site/shared';
import type {
  BuilderClientCore,
  IconMatch,
  IconPickerIndex,
  IconPickerSetId,
  IconResolver,
} from '@/types';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Mark `selectedTab` as the active roving tab (`is-active`, `aria-selected`, `tabindex`) across `tabs`.
 * @param tabs          All tab elements in the `tablist`.
 * @param selectedTab   Newly selected tab element.
 */
export function activateRovingTab(tabs: Iterable<Element>, selectedTab: Element): void {
  for (const tab of tabs) {
    const isSelected = tab === selectedTab;
    tab.classList.toggle('is-active', isSelected);
    tab.setAttribute('aria-selected', String(isSelected));
    tab.setAttribute('tabindex', isSelected ? '0' : '-1');
  }
}

/**
 * Close `popover` when keyboard focus moves outside both `popover` and an optional trigger/anchor boundary.
 * @param popover               Popover element to close on external focus loss.
 * @param site                  Shared site client utilities.
 * @param getExternalBoundary   Optional accessor returning an external trigger or wrapper element.
 */
export function bindPopoverFocusDismiss(
  popover: HTMLElement,
  site: SvgSite | undefined,
  getExternalBoundary?: () => Element | null | undefined
): void {
  popover.addEventListener('focusout', (event) => {
    const boundary = getExternalBoundary?.();
    if (
      event.relatedTarget instanceof Node &&
      !popover.contains(event.relatedTarget) &&
      (!boundary || !boundary.contains(event.relatedTarget))
    ) {
      site?.closePopover(popover);
    }
  });
}

/**
 * Move roving focus across a horizontal ARIA `tablist` on `ArrowLeft`, `ArrowRight`, `Home`, and `End`.
 * @param event       Keyboard event from the `tablist` container.
 * @param tabs        Ordered tab elements inside the `tablist`.
 * @param selectTab   Callback invoked with the newly selected tab element.
 */
export function handleRovingTabKeydown(
  event: KeyboardEvent,
  tabs: readonly Element[],
  selectTab: (tab: HTMLElement) => void
): void {
  if (tabs.length === 0) {
    return;
  }
  let current = 0;
  for (let i = 0; i < tabs.length; i += 1) {
    if (tabs[i]?.getAttribute('aria-selected') === 'true') {
      current = i;
    }
  }
  let nextIndex: number | undefined = undefined;
  if (event.key === 'ArrowLeft') {
    nextIndex = (current - 1 + tabs.length) % tabs.length;
  } else if (event.key === 'ArrowRight') {
    nextIndex = (current + 1) % tabs.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = tabs.length - 1;
  }
  const next = nextIndex !== undefined ? tabs[nextIndex] : undefined;
  if (next instanceof HTMLElement) {
    event.preventDefault();
    selectTab(next);
    next.focus();
  }
}

/**
 * Compute the tile index a grid navigation key moves the roving focus to (arrows by cell or row, `Home` / `End`
 * to the first / last match, including matches that are not rendered yet).
 * @param key       `KeyboardEvent.key`.
 * @param index     Current tile index.
 * @param columns   Number of grid columns.
 * @param total     Number of matches.
 * @returns Target index, or `undefined` for other keys.
 */
export function computeGridFocusIndex(
  key: string,
  index: number,
  columns: number,
  total: number
): number | undefined {
  const targets: Readonly<Record<string, number>> = {
    ArrowDown: index + columns,
    ArrowLeft: index - 1,
    ArrowRight: index + 1,
    ArrowUp: index - columns,
    End: total - 1,
    Home: 0,
  };
  if (total <= 0 || !Object.hasOwn(targets, key)) {
    return undefined;
  }
  return Math.max(0, Math.min(total - 1, targets[key] ?? 0));
}

/**
 * Create a keyed promise cache that forgets rejected loads, so failed requests are retried on the next call.
 * @param load   Loader per key.
 * @returns Memoized async loader function.
 */
export function createAsyncCache<T>(
  load: (key: string) => Promise<T>
): (key: string) => Promise<T> {
  const promises = new Map<string, Promise<T>>();
  return (key: string) => {
    let promise = promises.get(key);
    if (!promise) {
      const pending = load(key);
      pending.catch(() => {
        if (promises.get(key) === pending) {
          promises.delete(key);
        }
      });
      promises.set(key, pending);
      promise = pending;
    }
    return promise;
  };
}

/**
 * Create a slug resolver mirroring `resolveIcon` (aliases, Lucide-first or brand-first lookup, slug length limit).
 * @param index           Icon picker index.
 * @param maxSlugLength   Maximum slug length (`BuilderSchema.maxIconSlugLength`).
 * @returns Icon slug resolver and page locator.
 */
export function createIconResolver(index: IconPickerIndex, maxSlugLength: number): IconResolver {
  const lucideByKey = new Map<string, string>();
  const lucidePositions = new Map<string, number>();
  for (const [i, slug] of index.sets.lucide.entries()) {
    lucideByKey.set(capitalizeSlugParts(slug), slug);
    lucidePositions.set(slug, i);
  }
  for (const [alias, primary] of Object.entries(index.lucideAliases)) {
    lucideByKey.set(capitalizeSlugParts(alias), primary);
  }
  const brandByClean = new Map<string, string>();
  const brandPositions = new Map<string, number>();
  for (const [i, slug] of index.sets.brands.entries()) {
    brandPositions.set(slug, i);
    const cleanKey = slug.replace(BRAND_SLUG_CLEAN_RX, '');
    if (!brandByClean.has(cleanKey)) {
      brandByClean.set(cleanKey, slug);
    }
  }

  function findLucide(slug: string): string | undefined {
    return lucideByKey.get(capitalizeSlugParts(slug));
  }

  function findBrand(slug: string): string | undefined {
    const normalized = slug.replace(BRAND_SLUG_CLEAN_RX, '');
    const parent =
      getOwnValue(index.brandAliases, slug) ?? getOwnValue(index.brandAliases, normalized);
    for (const candidate of [slug, normalized, parent]) {
      if (candidate && brandPositions.has(candidate)) {
        return candidate;
      }
    }
    return brandByClean.get(normalized);
  }

  function findIconMatch(slug: string, isBrandFirst: boolean): IconMatch | 'none' | undefined {
    const rawSlug = slug.trim().toLowerCase();
    if (!rawSlug || rawSlug === 'none') {
      return 'none';
    }
    if (rawSlug.length > maxSlugLength) {
      return undefined;
    }
    const cleanSlug = getOwnValue(index.aliases, rawSlug) ?? rawSlug;
    const candidates = cleanSlug === rawSlug ? [cleanSlug] : [cleanSlug, rawSlug];
    const order: readonly IconPickerSetId[] = isBrandFirst
      ? ['brands', 'lucide']
      : ['lucide', 'brands'];
    for (const set of order) {
      for (const candidate of candidates) {
        const found = set === 'lucide' ? findLucide(candidate) : findBrand(candidate);
        if (found) {
          return { set, slug: found };
        }
      }
    }
    return undefined;
  }

  return {
    locate(slug: string, isBrandFirst: boolean) {
      const found = findIconMatch(slug, isBrandFirst);
      if (!found || found === 'none') {
        return undefined;
      }
      const position =
        (found.set === 'lucide' ? lucidePositions : brandPositions).get(found.slug) ?? 0;
      return { page: Math.floor(position / index.pageSize), set: found.set, slug: found.slug };
    },
    resolve(slug: string, isBrandFirst: boolean) {
      const found = findIconMatch(slug, isBrandFirst);
      return found === 'none' || found === undefined ? found : found.set;
    },
  };
}

/** Pure builder client helpers exposed on `globalThis.svgBuilderCore` for unit testing. */
export const core: BuilderClientCore = {
  buildAltText,
  buildDefaultLinkTarget,
  buildPath,
  buildPreviewPath,
  buildShareUrl,
  buildSnippetTokens,
  buildSnippets,
  collectStackSlugs,
  composeAnim,
  composeCategorizedStack,
  composeHint,
  composeIconPair,
  composeSpecial,
  computeGridFocusIndex,
  createAsyncCache,
  createIconResolver,
  createTypingLinesController(options) {
    return createTypingLinesController(options as TypingLinesControllerOptions);
  },
  decodeSegment,
  encodeSegment,
  filterIconCatalog,
  isTypingFieldActiveForLayout,
  parsePath,
  resolveEffectiveFieldDefault,
  resolveIconSelectDisplay,
  resolveStackPrefillMode,
  splitAnim,
  splitHint,
  splitIconPair,
  splitSize,
  splitSpecial,
};

export {
  BRAND_SLUG_CLEAN_RX,
  buildAltText,
  buildDefaultLinkTarget,
  buildPath,
  buildPreviewPath,
  buildShareUrl,
  buildSnippets,
  buildSnippetTokens,
  collectStackSlugs,
  collectStackTileTokens,
  composeAnim,
  composeCategorizedStack,
  composeHint,
  composeIconPair,
  composeSpecial,
  decodeSegment,
  encodeSegment,
  findField,
  findOption,
  findService,
  getOwnValue,
  isTypingFieldActiveForLayout,
  normalizeStackGroups,
  parsePath,
  readState,
  resolveActiveServiceMetric,
  resolveEffectiveFieldDefault,
  resolveStackPrefillMode,
  splitAnim,
  splitHint,
  splitIconPair,
  splitSize,
  splitSpecial,
  stripStackTileColor,
} from '@/site/shared';
