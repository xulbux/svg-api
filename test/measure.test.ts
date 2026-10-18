/**
 * Text measurement tests – Character width lookup and scaling (`src/svg/measure.ts`).
 */

import { describe, expect, it } from 'vitest';
import { measureTextWidth } from '@/svg/measure';

// ----------------------------------------- MAIN ----------------------------------------

describe('measureTextWidth', () => {
  it('returns 0 for an empty string', () => {
    expect(measureTextWidth('')).toBe(0);
  });

  it('measures known ASCII strings accurately at 11px normal and semi-bold weights', () => {
    const narrowWidth = measureTextWidth('iii', 11, false);
    const wideWidth = measureTextWidth('WWW', 11, false);
    expect(narrowWidth).toBeLessThan(wideWidth);
    expect(narrowWidth).toBe(Math.round(2.34 * 3 - 1.2));
    expect(wideWidth).toBe(Math.round(10.28 * 3 - 1.2));
    expect(measureTextWidth('python', 11, false)).toBe(31);
    expect(measureTextWidth('npm', 11, false)).toBe(20);
    expect(measureTextWidth('platform', 11, false)).toBe(38);
    expect(measureTextWidth('linux', 11, true)).toBe(24);
    expect(measureTextWidth('Discussions', 12.5, true)).toBe(71);
  });

  it('scales proportionally with font size', () => {
    const baseWidth = measureTextWidth('Documentation', 11, false);
    const largerWidth = measureTextWidth('Documentation', 22, false);
    expect(largerWidth).toBeGreaterThanOrEqual(baseWidth * 2 - 1);
  });

  it('uses distinct calibrated tables for 500 normal and 600 semi-bold weights', () => {
    const regularWidth = measureTextWidth('stars', 11, false);
    const boldWidth = measureTextWidth('stars', 11, true);
    expect(boldWidth).toBeGreaterThan(regularWidth);
  });

  it('uses fallback width for unmapped Unicode characters', () => {
    const width = measureTextWidth('⚡', 11, false);
    expect(width).toBeGreaterThan(0);
  });
});
