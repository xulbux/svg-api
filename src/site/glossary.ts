/**
 * Glossary – Shared wording of the docs catalog and the builder schema: Variant tiers, inline data widget kinds, and text helpers.
 */

import { SPECIAL_ELEMENT_KINDS, VARIANT_TOKENS } from '@/routes/params';
import {
  MAX_BARS_POINTS,
  MAX_SPARKLINE_POINTS,
  MAX_STEPS_COUNT,
  MAX_STRIP_TICKS,
  MIN_SERIES_POINTS,
  PERCENT_RANGE,
  STRIP_TICK_MAX_STATE,
} from '@/svg/renderer';
import type { BadgeSpecialElement, BadgeVariant, SpecialKindDetail, VariantTier } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Visual hierarchy tiers of the shared variants (builder labels and docs descriptions). */
export const VARIANT_TIERS: Readonly<Record<BadgeVariant, VariantTier>> = {
  1: { name: 'Primary', surface: 'gradient' },
  2: { name: 'Secondary', surface: 'tinted dark' },
  3: { name: 'Tertiary', surface: 'neutral dark' },
};

/** Display labels, payload examples, descriptions, and parser modifiers of the inline data widget kinds (builder and docs). */
export const SPECIAL_KIND_DETAILS: Readonly<
  Record<BadgeSpecialElement['type'], SpecialKindDetail>
> = {
  bar: {
    defaultModifierLabel: 'Shimmer',
    description: `Percentage from ${PERCENT_RANGE.min} to ${PERCENT_RANGE.max} (e.g., 92).`,
    example: '92',
    label: 'Progress bar',
    modifiers: ['static'],
    summary: `Progress bar (${PERCENT_RANGE.min} to ${PERCENT_RANGE.max}%)`,
  },
  bars: {
    description: `${MIN_SERIES_POINTS} to ${MAX_BARS_POINTS} comma-separated numbers (e.g., 3,6,4,8,5,9,7).`,
    example: '3,6,4,8,5,9,7',
    label: 'Mini bars',
    modifiers: [],
    summary: `Mini bars (${MIN_SERIES_POINTS} to ${MAX_BARS_POINTS} numbers)`,
  },
  delta: {
    description: 'Signed change label; + tints emerald, - tints rose (e.g., +24%).',
    example: '+24%',
    label: 'Delta pill',
    modifiers: [],
    summary: 'Delta pill (+ emerald, - rose)',
  },
  ring: {
    defaultModifierLabel: 'Static',
    description: `Percentage from ${PERCENT_RANGE.min} to ${PERCENT_RANGE.max} (e.g., 84).`,
    example: '84',
    label: 'Donut ring',
    modifiers: ['pulse'],
    summary: `Donut ring (${PERCENT_RANGE.min} to ${PERCENT_RANGE.max}%)`,
  },
  sparkline: {
    description: `${MIN_SERIES_POINTS} to ${MAX_SPARKLINE_POINTS} comma-separated numbers (e.g., 22,19,21,17,15,16,14).`,
    example: '22,19,21,17,15,16,14',
    label: 'Sparkline',
    modifiers: [],
    summary: `Sparkline (${MIN_SERIES_POINTS} to ${MAX_SPARKLINE_POINTS} numbers)`,
  },
  steps: {
    description: `Completed/total steps up to ${MAX_STEPS_COUNT} (e.g., 4/5).`,
    example: '4/5',
    label: 'Step pills',
    modifiers: [],
    summary: `Step pills (done/total, up to ${MAX_STEPS_COUNT})`,
  },
  strip: {
    description: `1 to ${MAX_STRIP_TICKS} tick states from 0 (down) to ${STRIP_TICK_MAX_STATE} (ok) (e.g., 9987998999).`,
    example: '9987998999',
    label: 'Uptime strip',
    modifiers: [],
    summary: `Uptime strip (1 to ${MAX_STRIP_TICKS} ticks, 0 to ${STRIP_TICK_MAX_STATE})`,
  },
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

/**
 * Collect sorted alias keys from `aliasMap` that resolve to `targetValue` (excluding `targetValue` itself).
 * @param aliasMap      Alias lookup map (`alias -> canonical`).
 * @param targetValue   Canonical target token.
 * @returns Sorted list of alias tokens for `targetValue`.
 */
export function collectAliasesForTarget(
  aliasMap: Readonly<Record<string, string>>,
  targetValue: string
): string[] {
  const aliases: string[] = [];
  for (const [alias, canonical] of Object.entries(aliasMap)) {
    if (canonical === targetValue && alias !== targetValue) {
      aliases.push(alias);
    }
  }
  return aliases.toSorted();
}

/**
 * Format a list of strings as natural English prose (`'a'`, `'a and b'`, `'a, b, and c'`).
 * @param items         Items to join in display order.
 * @param conjunction   Coordinating conjunction (`'and'` or `'or'`).
 * @returns Human-readable prose list.
 */
export function formatConjunctionList(items: readonly string[], conjunction = 'and'): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  if (items.length === 2) {
    return `${items[0]} ${conjunction} ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items.at(-1)}`;
}
