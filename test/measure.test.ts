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

  it('measures known ASCII strings accurately at 11px normal weight', () => {
    const narrowWidth = measureTextWidth('iii', 11, false);
    const wideWidth = measureTextWidth('WWW', 11, false);
    expect(narrowWidth).toBeLessThan(wideWidth);
    expect(narrowWidth).toBe(Math.ceil(2.86 * 3));
    expect(wideWidth).toBe(Math.ceil(10.24 * 3));
  });

  it('scales proportionally with font size', () => {
    const baseWidth = measureTextWidth('Documentation', 11, false);
    const largerWidth = measureTextWidth('Documentation', 22, false);
    expect(largerWidth).toBeGreaterThanOrEqual(baseWidth * 2 - 1);
  });

  it('applies a bold multiplier when isBold is true', () => {
    const regularWidth = measureTextWidth('stars', 11, false);
    const boldWidth = measureTextWidth('stars', 11, true);
    expect(boldWidth).toBeGreaterThanOrEqual(regularWidth);
  });

  it('uses fallback width for unmapped Unicode characters', () => {
    const width = measureTextWidth('⚡', 11, false);
    expect(width).toBeGreaterThan(0);
  });
});
