/**
 * Text measurement & vector path rendering tests – Geist Sans OpenType glyph bounds, SVG `<path>` generation (`src/svg/measure.ts`), and the bounded LRU cache behind the outline cache.
 */

import { describe, expect, it } from 'vitest';
import {
  computeCenteredBaselineY,
  layoutTextGlyphs,
  measureTextAdvance,
  measureTextWidth,
  measureTextWidthUncached,
  renderTextPathMarkup,
  resolveCharGlyph,
} from '@/svg/measure';
import {
  clearLruCache,
  createLruCache,
  deleteLruEntry,
  readLruCache,
  writeLruCache,
} from '@/svg/shared';

// ----------------------------------------- MAIN ----------------------------------------

describe('measureTextWidth & renderTextPathMarkup', () => {
  it('returns 0 width and empty path markup for empty or whitespace-only strings', () => {
    const style = { anchorX: 50, baselineY: 15, fill: '#FFFFFF', fontSize: 11 };
    expect(measureTextWidth('')).toBe(0);
    expect(renderTextPathMarkup('', style)).toBe('');
    expect(renderTextPathMarkup('   ', style)).toBe('');
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

    const centeredPath = renderTextPathMarkup('Production', {
      anchorX: 100,
      baselineY,
      fill: '#FFFFFF',
      fontSize: 14,
      isBold: true,
    });
    expect(centeredPath).toMatch(
      /^<path transform="translate\([\d.-]+ 14\.91\)" d="M[\d.-]+ [\d.-]+.*" fill="#FFFFFF" \/>$/
    );
    expect(centeredPath).not.toContain('NaN');

    const leftItalicPath = renderTextPathMarkup('— XulbuX', {
      align: 'left',
      anchorX: 34,
      baselineY,
      fill: '#818CF8',
      fontSize: 12.6,
      isBold: true,
      isItalic: true,
    });
    // The em dash's leftmost ink point (origin path `L<x1> -3`) plus the translate offset lands on `x = 34`:
    const translateX = Number(/translate\((?<x>[\d.-]+) /.exec(leftItalicPath)?.groups?.x);
    const inkStartX = Number(/L(?<x>[\d.-]+) -3/.exec(leftItalicPath)?.groups?.x);
    expect(translateX + inkStartX).toBeCloseTo(34, 1);
    expect(leftItalicPath).toContain('fill="#818CF8" />');
    expect(leftItalicPath).not.toContain('NaN');
  });

  it('reuses the cached origin outline and only changes the translate offset between anchors', () => {
    const style = { baselineY: 15, fill: '#FFFFFF', fontSize: 11 };
    const firstPath = renderTextPathMarkup('reuse', { ...style, anchorX: 10 });
    const secondPath = renderTextPathMarkup('reuse', { ...style, anchorX: 60 });
    const firstPathData = / d="(?<d>[^"]+)"/.exec(firstPath)?.groups?.d;
    const secondPathData = / d="(?<d>[^"]+)"/.exec(secondPath)?.groups?.d;
    expect(firstPathData).toBeDefined();
    expect(firstPathData).toBe(secondPathData);
    expect(firstPath).not.toBe(secondPath);
  });

  it('measures probe strings without caching identically to the cached measurement', () => {
    expect(measureTextWidthUncached('Changelog', 12.5, true)).toBe(
      measureTextWidth('Changelog', 12.5, true)
    );
    expect(measureTextWidthUncached('', 12.5)).toBe(0);
  });

  it('adds up word and space advance widths so line wrapping can estimate widths incrementally', () => {
    const lineAdvance = measureTextAdvance('quick brown', 15, true);
    const summedAdvance =
      measureTextAdvance('quick', 15, true) +
      measureTextAdvance(' ', 15, true) +
      measureTextAdvance('brown', 15, true);
    expect(summedAdvance).toBeCloseTo(lineAdvance, 1);
    expect(lineAdvance).toBeGreaterThanOrEqual(measureTextWidth('quick brown', 15, true));
  });

  it('renders and measures very long strings that bypass the outline cache consistently', () => {
    const longText = 'x'.repeat(300);
    const longPath = renderTextPathMarkup(longText, {
      anchorX: 0,
      baselineY: 15,
      fill: '#FFFFFF',
      fontSize: 11,
    });
    expect(longPath).toContain('d="M');
    expect(measureTextWidth(longText)).toBe(measureTextWidthUncached(longText, 11));
  });

  it('lays out per-character glyphs in JetBrains Mono and Geist Sans and falls back to JetBrains Mono for technical symbols', () => {
    expect(layoutTextGlyphs('', 16, false, 'mono')).toEqual({ glyphs: [], totalAdvance: 0 });

    const monoLayout = layoutTextGlyphs('iiiWWW', 16, false, 'mono');
    expect(monoLayout.glyphs).toHaveLength(6);
    // In a monospace font, narrow and wide letters have identical advance widths:
    expect(monoLayout.glyphs[0]?.advance).toBe(monoLayout.glyphs[5]?.advance);
    expect(monoLayout.glyphs[0]?.pathData).toMatch(/^M[\d.-]+ [\d.-]+/);

    const sansLayout = layoutTextGlyphs('iiiWWW', 16, false, 'sans');
    expect(sansLayout.glyphs[0]?.advance).toBeLessThan(sansLayout.glyphs[5]?.advance ?? 0);

    // Technical prompt/keycap symbols (`❯`, `⌘`, `⏎`) fall back to JetBrains Mono when missing in Geist Sans:
    for (const symbol of ['❯', '⌘', '⏎']) {
      const resolvedSans = resolveCharGlyph(symbol, 16, true, 'sans');
      const resolvedMono = resolveCharGlyph(symbol, 16, true, 'mono');
      expect(resolvedSans.pathData.length, symbol).toBeGreaterThan(10);
      expect(resolvedSans.pathData).toBe(resolvedMono.pathData);

      const sansPathMarkup = renderTextPathMarkup(symbol, {
        anchorX: 10,
        baselineY: 20,
        fill: '#ffffff',
        font: 'sans',
        fontSize: 16,
        isBold: true,
        isUncached: true,
      });
      const monoPathMarkup = renderTextPathMarkup(symbol, {
        anchorX: 10,
        baselineY: 20,
        fill: '#ffffff',
        font: 'mono',
        fontSize: 16,
        isBold: true,
        isUncached: true,
      });
      expect(sansPathMarkup, symbol).toBe(monoPathMarkup);
    }
  });

  it('forwards italic styling to JetBrains Mono fallback glyphs and includes fallback glyphs in uncached widths (regression: fallback outlines dropped isItalic and uncached widths ignored fallback glyphs)', () => {
    const italicSansSymbol = renderTextPathMarkup('⌘', {
      anchorX: 10,
      baselineY: 20,
      fill: '#ffffff',
      font: 'sans',
      fontSize: 16,
      isBold: true,
      isItalic: true,
      isUncached: true,
    });
    const italicMonoSymbol = renderTextPathMarkup('⌘', {
      anchorX: 10,
      baselineY: 20,
      fill: '#ffffff',
      font: 'mono',
      fontSize: 16,
      isBold: true,
      isItalic: true,
      isUncached: true,
    });
    expect(italicSansSymbol).toBe(italicMonoSymbol);

    const uprightMarkup = renderTextPathMarkup('⌘K', {
      anchorX: 10,
      baselineY: 20,
      fill: '#ffffff',
      font: 'sans',
      fontSize: 16,
      isBold: true,
      isItalic: false,
      isUncached: true,
    });
    const italicMarkup = renderTextPathMarkup('⌘K', {
      anchorX: 10,
      baselineY: 20,
      fill: '#ffffff',
      font: 'sans',
      fontSize: 16,
      isBold: true,
      isItalic: true,
      isUncached: true,
    });
    expect(italicMarkup).not.toBe(uprightMarkup);
    expect(italicMarkup).not.toContain('NaN');

    expect(measureTextWidthUncached('⌘', 16, true)).toBeGreaterThan(0);
    expect(measureTextWidthUncached('⌘K', 16, true)).toBe(measureTextWidth('⌘K', 16, true));
    expect(measureTextWidthUncached('⌘K', 16, true, true)).toBe(
      measureTextWidth('⌘K', 16, true, true)
    );
  });

  it('separates cached italic outlines, applies sans tracking and kerning across fallback strings, and prevents outline cache delimiter collisions (regressions: missing sans tracking/kerning in fallback outlines, colon-joined cache keys)', () => {
    const uprightCached = renderTextPathMarkup('⌘K', {
      anchorX: 10,
      baselineY: 20,
      fill: '#ffffff',
      font: 'sans',
      fontSize: 16,
      isBold: true,
      isItalic: false,
    });
    const italicCached = renderTextPathMarkup('⌘K', {
      anchorX: 10,
      baselineY: 20,
      fill: '#ffffff',
      font: 'sans',
      fontSize: 16,
      isBold: true,
      isItalic: true,
    });
    expect(italicCached).not.toBe(uprightCached);

    // Mixed strings containing a Mono fallback glyph (`⌘`) must preserve Geist Sans `-0.01em` tracking and `AV` pair kerning:
    const symbolAdvance = measureTextAdvance('⌘', 16, true);
    const kernedPairAdvance = measureTextAdvance('AV', 16, true);
    expect(measureTextAdvance('⌘AV', 16, true) - symbolAdvance).toBeCloseTo(kernedPairAdvance, 2);
    expect(measureTextWidth('⌘AV', 16, true)).toBe(measureTextWidthUncached('⌘AV', 16, true));

    // Distinct `(font, fontSize, isBold, isItalic, text)` tuples with embedded colons must never collide in `OUTLINE_CACHE`:
    const colonMarkupA = renderTextPathMarkup('0:0:a', {
      anchorX: 0,
      baselineY: 15,
      fill: '#ffffff',
      fontSize: 11,
      isBold: false,
    });
    const colonMarkupB = renderTextPathMarkup('a', {
      anchorX: 0,
      baselineY: 15,
      fill: '#ffffff',
      fontSize: 11,
      isBold: false,
    });
    expect(colonMarkupA).not.toBe(colonMarkupB);
  });
});

describe('bounded LRU cache (src/svg/shared.ts)', () => {
  it('evicts least recently used entries by count and by summed weight, and never stores oversized values', () => {
    const cache = createLruCache<string>(3, (value) => value.length, 10);
    writeLruCache(cache, 'a', 'aaa');
    writeLruCache(cache, 'b', 'bbb');
    writeLruCache(cache, 'c', 'ccc');
    expect(readLruCache(cache, 'a')).toBe('aaa');

    // A fourth entry exceeds the count limit and evicts `b`, the least recently used entry:
    writeLruCache(cache, 'd', 'd');
    expect([...cache.entries.keys()]).toEqual(['c', 'a', 'd']);
    expect(cache.totalWeight).toBe(7);

    // A heavy entry evicts by weight until the summed weight fits again:
    writeLruCache(cache, 'e', 'eeeeeee');
    expect([...cache.entries.keys()]).toEqual(['d', 'e']);
    expect(cache.totalWeight).toBe(8);

    // Values heavier than the whole budget are never cached and keep existing entries:
    writeLruCache(cache, 'huge', 'x'.repeat(11));
    expect(readLruCache(cache, 'huge')).toBeUndefined();
    expect(cache.entries.size).toBe(2);

    deleteLruEntry(cache, 'd');
    expect(cache.totalWeight).toBe(7);
    clearLruCache(cache);
    expect(cache.entries.size).toBe(0);
    expect(cache.totalWeight).toBe(0);
  });
});
