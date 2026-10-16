/**
 * Icon resolver – Resolves Lucide (stroke) and Simple Icons (brand fill) SVG paths.
 */

import * as lucideIcons from 'lucide-static';
import * as simpleIcons from 'simple-icons';
import type { ResolvedIcon } from '@/types';

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches hyphen or underscore word separators in icon slugs. */
const SLUG_SEPARATOR_RX = /[-_]/g;

/** Matches hyphen, underscore, or dot characters in Simple Icons slugs. */
const SIMPLE_SLUG_CLEAN_RX = /[-_.]/g;

/** Matches the inner content of an `<svg>...</svg>` element. */
const INNER_SVG_RX = /<svg[^>]*>(?<inner>[\s\S]*?)<\/svg>/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Lazily initialized lowercase lookup map for Simple Icons SVG paths. */
let simpleIconPathCache: Map<string, string> | undefined = undefined;

/** Convert a kebab-case or snake_case slug into PascalCase. */
function toPascalCase(slug: string): string {
  const parts = slug.split(SLUG_SEPARATOR_RX);
  let result = '';
  for (const part of parts) {
    if (part.length > 0) {
      result += part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }
  }
  return result;
}

/** Get or lazily initialize the lowercase key -> SVG path map for Simple Icons. */
function getSimpleIconPathMap(): Map<string, string> {
  if (simpleIconPathCache) {
    return simpleIconPathCache;
  }
  simpleIconPathCache = new Map<string, string>();
  const simpleMap = simpleIcons as Record<string, { path?: string }>;
  for (const [key, iconObj] of Object.entries(simpleMap)) {
    if (iconObj && typeof iconObj === 'object' && typeof iconObj.path === 'string') {
      simpleIconPathCache.set(key.toLowerCase(), iconObj.path);
    }
  }
  return simpleIconPathCache;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Resolve an icon slug to its inner SVG markup from Lucide or Simple Icons.
 * @param slug   Icon slug (e.g., `'star'`, `'book-open'`, `'archlinux'`) or `'none'`.
 * @returns The resolved icon data, or `undefined` if `'none'`, empty, or not found.
 */
export function resolveIcon(slug?: string): ResolvedIcon | undefined {
  if (!slug || slug === 'none') {
    return undefined;
  }
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug || cleanSlug === 'none') {
    return undefined;
  }

  // 1. Check Lucide Icons first (stroke-based, rendered with punchy 2.25px stroke).
  const lucideKey = toPascalCase(cleanSlug);
  const lucideMap = lucideIcons as Record<string, string>;
  if (lucideKey in lucideMap && typeof lucideMap[lucideKey] === 'string') {
    const rawSvg = lucideMap[lucideKey];
    const innerMatch = INNER_SVG_RX.exec(rawSvg);
    const innerContent = innerMatch?.groups?.inner;
    if (innerContent) {
      return { innerSvg: innerContent.trim(), type: 'lucide' };
    }
  }

  // 2. Check Simple Icons fallback (solid single-path brand icons like github, pypi, archlinux).
  const normalizedBrand = cleanSlug.replace(SIMPLE_SLUG_CLEAN_RX, '');
  const simpleLookupKey = `si${normalizedBrand}`;
  const pathData = getSimpleIconPathMap().get(simpleLookupKey);
  if (pathData) {
    return { innerSvg: `<path d="${pathData}" />`, type: 'simple' };
  }

  return undefined;
}
