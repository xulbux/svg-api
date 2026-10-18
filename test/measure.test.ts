/**
 * Text measurement & vector path rendering tests – Geist Sans OpenType glyph bounds and SVG `<path>` generation (`src/svg/measure.ts`).
 */

import { describe, expect, it } from 'vitest';
import { computeCenteredBaselineY, measureTextWidth, renderTextPathMarkup } from '@/svg/measure';

// ----------------------------------------- MAIN ----------------------------------------

describe('measureTextWidth & renderTextPathMarkup', () => {
  it('returns 0 width and empty path markup for empty or whitespace-only strings', () => {
    expect(measureTextWidth('')).toBe(0);
    expect(renderTextPathMarkup('', 50, 15, 11, '#ffffff')).toBe('');
    expect(renderTextPathMarkup('   ', 50, 15, 11, '#ffffff')).toBe('');
    expect(measureTextWidth('   ', 11, false)).toBeGreaterThan(0);
  });

  it('measures exact Geist Sans ink bounding box widths across strings and weights', () => {
    const narrowWidth = measureTextWidth('iii', 11, false);
    const wideWidth = measureTextWidth('WWW', 11, false);
    expect(narrowWidth).toBeLessThan(wideWidth);
    expect(measureTextWidth('python', 11, false)).toBeGreaterThan(30);
    expect(measureTextWidth('npm', 11, false)).toBeGreaterThan(18);
    expect(measureTextWidth('platform', 11, false)).toBeGreaterThan(38);
    expect(measureTextWidth('linux', 11, true)).toBeGreaterThan(20);
    expect(measureTextWidth('Discussions', 12.5, true)).toBeGreaterThan(60);
  });

  it('scales proportionally with font size', () => {
    const baseWidth = measureTextWidth('Documentation', 11, false);
    const doubleWidth = measureTextWidth('Documentation', 22, false);
    expect(doubleWidth).toBeCloseTo(baseWidth * 2, 1);
  });

  it('uses distinct Geist Sans OpenType fonts for 500 Medium, 600 SemiBold, and 600 SemiBold Italic', () => {
    const mediumWidth = measureTextWidth('stars', 11, false, false);
    const semiBoldWidth = measureTextWidth('stars', 11, true, false);
    const italicWidth = measureTextWidth('stars', 11, true, true);
    expect(semiBoldWidth).toBeGreaterThan(mediumWidth);
    expect(italicWidth).toBeGreaterThan(0);
  });

  it('renders centered and left-aligned SVG <path> outlines without <text> or NaN coordinates', () => {
    const baselineY = computeCenteredBaselineY(22, 11);
    expect(baselineY).toBe(14.91);

    const centeredPath = renderTextPathMarkup('Production', 100, baselineY, 14, '#ffffff', true);
    expect(centeredPath).toMatch(/^<path d="M[\d.-]+ [\d.-]+.*" fill="#ffffff" \/>$/);
    expect(centeredPath).not.toContain('NaN');

    const leftItalicPath = renderTextPathMarkup(
      '— XulbuX',
      34,
      baselineY,
      12.6,
      '#818cf8',
      true,
      true,
      'left'
    );
    expect(leftItalicPath).toContain('L34 11.91');
    expect(leftItalicPath).toContain('fill="#818cf8" />');
    expect(leftItalicPath).not.toContain('NaN');
  });
});
