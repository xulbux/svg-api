/**
 * Glossary – Shared wording of the docs catalog and the builder schema: Variant tiers, inline data widget kinds, and text helpers.
 */

import { SPECIAL_ELEMENT_KINDS, VARIANT_TOKENS } from '@/routes/params';
import type { BadgeSpecialElement, BadgeVariant, SpecialKindDetail, VariantTier } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Visual hierarchy tiers of the shared variants (builder labels and docs descriptions). */
export const VARIANT_TIERS: Readonly<Record<BadgeVariant, VariantTier>> = {
  1: { name: 'Primary', surface: 'gradient' },
  2: { name: 'Secondary', surface: 'tinted dark' },
  3: { name: 'Tertiary', surface: 'neutral dark' },
};

/** Display labels, payload examples, and parser modifiers of the inline data widget kinds (builder and docs). */
export const SPECIAL_KIND_DETAILS: Readonly<
  Record<BadgeSpecialElement['type'], SpecialKindDetail>
> = {
  bar: { example: '92', label: 'Progress bar', modifiers: ['static'] },
  delta: { example: '+24%', label: 'Delta pill', modifiers: [] },
  ring: { example: '84', label: 'Donut ring', modifiers: ['pulse'] },
  sparkline: { example: '22,19,21,17,15,16,14', label: 'Sparkline', modifiers: [] },
  strip: { example: '9987998999', label: 'Uptime strip', modifiers: [] },
};

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Capitalize the first character of a word.
 * @param word   Lowercase word (e.g., `'nudge'`).
 * @returns Capitalized word (e.g., `'Nudge'`).
 */
export function capitalizeWord(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/**
 * Join every variant identifier as a parameter table value.
 * @returns Variant values in hierarchy order (e.g., `'1 | 2 | 3'`).
 */
export function formatVariantValues(): string {
  return VARIANT_TOKENS.join(' | ');
}

/**
 * Summarize every variant tier.
 * @returns Tier summary (e.g., `'1 = Primary gradient, 2 = Secondary tinted dark, 3 = Tertiary neutral dark'`).
 */
export function formatVariantTierSummary(): string {
  const parts: string[] = [];
  for (const variant of VARIANT_TOKENS) {
    const tier = VARIANT_TIERS[variant];
    parts.push(`${variant} = ${tier.name} ${tier.surface}`);
  }
  return parts.join(', ');
}

/**
 * List a valid `?special=` example per widget kind and modifier as a parameter table value.
 * @returns Examples in parser order (e.g., `'sparkline:22,19,… | bar:92 | bar:92:static | …'`).
 */
export function formatSpecialExamples(): string {
  const examples: string[] = [];
  for (const kind of SPECIAL_ELEMENT_KINDS) {
    const detail = SPECIAL_KIND_DETAILS[kind];
    examples.push(`${kind}:${detail.example}`);
    for (const modifier of detail.modifiers) {
      examples.push(`${kind}:${detail.example}:${modifier}`);
    }
  }
  return examples.join(' | ');
}
