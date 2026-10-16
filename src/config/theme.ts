/**
 * Theme tokens – Curated dark-native color palettes and variant token helpers.
 */

import type { BaseDarkPalette, DotState, ThemeColorName, ThemePalette } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Base dark-slate neutral surface tokens. */
export const BASE_DARK: BaseDarkPalette = {
  bevelHighlight: 'rgba(255, 255, 255, 0.26)',
  bgBottom: '#0f1118',
  bgTop: '#161923',
  borderNeutral: '#262b38',
  innerHighlight: 'rgba(255, 255, 255, 0.08)',
  textMuted: '#9ca3af',
  textPrimary: '#f3f4f6',
};

/** Hex colors for animated pulsing status indicator dots. */
export const DOT_COLORS: Record<DotState, string> = {
  amber: '#f59e0b',
  cyan: '#06b6d4',
  green: '#22c55e',
  red: '#ef4444',
};

/** Named theme color palettes. */
export const THEMES: Record<ThemeColorName, ThemePalette> = {
  amber: {
    accentText: '#fbbf24',
    borderColor: 'rgba(245, 158, 11, 0.45)',
    glowColor: '#f59e0b',
    gradEnd: '#d97706',
    gradStart: '#f59e0b',
    iconColor: '#fbbf24',
    tintBg: 'rgba(245, 158, 11, 0.16)',
  },
  cyan: {
    accentText: '#22d3ee',
    borderColor: 'rgba(6, 182, 212, 0.45)',
    glowColor: '#06b6d4',
    gradEnd: '#0891b2',
    gradStart: '#06b6d4',
    iconColor: '#22d3ee',
    tintBg: 'rgba(6, 182, 212, 0.16)',
  },
  emerald: {
    accentText: '#34d399',
    borderColor: 'rgba(16, 185, 129, 0.45)',
    glowColor: '#10b981',
    gradEnd: '#059669',
    gradStart: '#10b981',
    iconColor: '#34d399',
    tintBg: 'rgba(16, 185, 129, 0.16)',
  },
  green: {
    accentText: '#4ade80',
    borderColor: 'rgba(34, 197, 94, 0.45)',
    glowColor: '#22c55e',
    gradEnd: '#16a34a',
    gradStart: '#22c55e',
    iconColor: '#4ade80',
    tintBg: 'rgba(34, 197, 94, 0.16)',
  },
  indigo: {
    accentText: '#818cf8',
    borderColor: 'rgba(99, 102, 241, 0.48)',
    glowColor: '#6366f1',
    gradEnd: '#4f46e5',
    gradStart: '#6366f1',
    iconColor: '#818cf8',
    tintBg: 'rgba(99, 102, 241, 0.16)',
  },
  red: {
    accentText: '#f87171',
    borderColor: 'rgba(239, 68, 68, 0.45)',
    glowColor: '#ef4444',
    gradEnd: '#dc2626',
    gradStart: '#ef4444',
    iconColor: '#f87171',
    tintBg: 'rgba(239, 68, 68, 0.16)',
  },
  rose: {
    accentText: '#fb7185',
    borderColor: 'rgba(244, 63, 94, 0.45)',
    glowColor: '#f43f5e',
    gradEnd: '#e11d48',
    gradStart: '#f43f5e',
    iconColor: '#fb7185',
    tintBg: 'rgba(244, 63, 94, 0.16)',
  },
  sky: {
    accentText: '#38bdf8',
    borderColor: 'rgba(14, 165, 233, 0.45)',
    glowColor: '#0ea5e9',
    gradEnd: '#0284c7',
    gradStart: '#0ea5e9',
    iconColor: '#38bdf8',
    tintBg: 'rgba(14, 165, 233, 0.16)',
  },
  slate: {
    accentText: '#cbd5e1',
    borderColor: 'rgba(148, 163, 184, 0.35)',
    glowColor: '#64748b',
    gradEnd: '#334155',
    gradStart: '#475569',
    iconColor: '#94a3b8',
    tintBg: 'rgba(148, 163, 184, 0.14)',
  },
  violet: {
    accentText: '#a78bfa',
    borderColor: 'rgba(139, 92, 246, 0.48)',
    glowColor: '#8b5cf6',
    gradEnd: '#7c3aed',
    gradStart: '#8b5cf6',
    iconColor: '#a78bfa',
    tintBg: 'rgba(139, 92, 246, 0.16)',
  },
};

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Resolve a raw color query parameter to a valid `ThemeColorName`.
 * @param input      Raw color query parameter (`?c=`).
 * @param fallback   Fallback color token when `input` is missing or unknown.
 * @returns The resolved `ThemeColorName`.
 */
export function resolveColor(input?: string, fallback: ThemeColorName = 'indigo'): ThemeColorName {
  if (!input) {
    return fallback;
  }
  const key = input.toLowerCase() as ThemeColorName;
  return key in THEMES ? key : fallback;
}
