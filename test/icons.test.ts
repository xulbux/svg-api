/**
 * Icon resolution tests – Lucide stroke icons, Simple Icons brand fills, and full XulbuX tech stack coverage (`src/svg/icons.ts`).
 */

/* oxlint-disable typescript/no-non-null-assertion */

import { describe, expect, it } from 'vitest';
import {
  FALLBACK_ICON_SLUG,
  ICON_SLUG_ALIASES,
  computeIconXBounds,
  normalizeIconSlug,
  resolveIcon,
  resolveIconWithFallback,
} from '@/svg/icons';
import { resolveStackIconColor } from '@/svg/stack';

// ----------------------------------------- MAIN ----------------------------------------

describe('resolveIcon', () => {
  it('returns undefined when slug is undefined, empty, or "none"', () => {
    expect(resolveIcon()).toBeUndefined();
    expect(resolveIcon('')).toBeUndefined();
    expect(resolveIcon('   ')).toBeUndefined();
    expect(resolveIcon('none')).toBeUndefined();
    expect(resolveIcon('NONE')).toBeUndefined();
  });

  it('resolves single-word, multi-word, and aliased Lucide icons', () => {
    const starIcon = resolveIcon('star');
    expect(starIcon).toBeDefined();
    expect(starIcon!.type).toBe('lucide');
    expect(starIcon!.innerSvg).toContain('<');

    const bookOpenIcon = resolveIcon('book-open');
    expect(bookOpenIcon).toBeDefined();
    expect(bookOpenIcon!.type).toBe('lucide');
    expect(bookOpenIcon!.innerSvg).toContain('<path');

    const globeCodeIcon = resolveIcon('globe-code');
    expect(globeCodeIcon).toBeDefined();
    expect(globeCodeIcon!.type).toBe('lucide');
    expect(globeCodeIcon!.innerSvg).toContain('<circle');

    const squareTextIcon = resolveIcon('square-text');
    expect(squareTextIcon).toBeDefined();
    expect(squareTextIcon!.type).toBe('lucide');
    expect(squareTextIcon!.innerSvg).toContain('<path');

    const puzzleAlias = resolveIcon('puzzle-piece');
    expect(puzzleAlias).toBeDefined();
    expect(puzzleAlias!.type).toBe('lucide');
  });

  it('resolves Iconify brand/tech slugs with unified C/C++/C# hexagon style and all 60+ tech stack slugs', () => {
    const cIcon = resolveIcon('c', true);
    const cppIcon = resolveIcon('cpp', true);
    const csIcon = resolveIcon('cs', true);
    expect(cIcon!.innerSvg).toContain('transform="scale(0.1875)"');
    expect(cppIcon!.innerSvg).toContain('transform="scale(0.1875)"');
    expect(csIcon!.innerSvg).toContain('transform="scale(0.1875)"');
    const stackSlugs = [
      'c',
      'cpp',
      'cs',
      'rust',
      'java',
      'py',
      'js',
      'ts',
      'php',
      'lua',
      'bash',
      'powershell',
      'html',
      'css',
      'sass',
      'md',
      'dotnet',
      'vue',
      'pinia',
      'laravel',
      'symfony',
      'nodejs',
      'threejs',
      'tauri',
      'unity',
      'unreal',
      'tailwind',
      'wordpress',
      'git',
      'github',
      'githubactions',
      'vscode',
      'visualstudio',
      'npm',
      'vite',
      'cmake',
      'linux',
      'windows',
      'raspberrypi',
      'arduino',
      'aws',
      'azure',
      'cloudflare',
      'firebase',
      'netlify',
      'terraform',
      'mysql',
      'sqlite',
      'figma',
      'ai',
      'blender',
      'ps',
      'pr',
      'ae',
      'obsidian',
      'notion',
      'codepen',
      'gtk',
      'latex',
      'regex',
      'snake',
      'box-isometric-tape',
    ];

    for (const slug of stackSlugs) {
      const resolved = resolveIcon(slug, true);
      expect(resolved, `Expected icon "${slug}" to resolve`).toBeDefined();
      expect(resolveStackIconColor(slug)).toBeDefined();
    }

    // With isBrandFirst=true, "blender" resolves to the Simple Icons 3D Blender logo rather than Lucide's kitchen blender.
    const blenderBrand = resolveIcon('blender', true);
    expect(blenderBrand!.type).toBe('simple');
  });

  it('returns undefined for unknown icon slugs and Object.prototype keys', () => {
    expect(resolveIcon('definitely-not-a-real-icon-xyz')).toBeUndefined();
    expect(() => resolveIcon('constructor')).not.toThrow();
    expect(resolveStackIconColor('toString')).toBe('indigo');
  });

  it('resolves the postgres alias that already had a stack color (regression: rendered the fallback icon)', () => {
    expect(resolveIcon('postgres', true)).toBeDefined();
    expect(resolveIcon('postgres', true)).toBe(resolveIcon('postgresql', true));
    expect(resolveStackIconColor('postgres')).toBe('blue');
  });

  it('never resolves Object.prototype keys through the Iconify or Lucide tables (regression: prototype-unsafe lookups)', () => {
    for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(resolveIcon(key)).toBeUndefined();
      expect(resolveIcon(key, true)).toBeUndefined();
    }
  });

  it('caches misses and rejects implausibly long slugs', () => {
    expect(resolveIcon('still-not-a-real-icon')).toBeUndefined();
    expect(resolveIcon('still-not-a-real-icon')).toBeUndefined();
    expect(resolveIcon('star'.repeat(40))).toBeUndefined();
  });

  it('falls back to the requested fallback slug and finally to a plain circle', () => {
    expect(resolveIconWithFallback('no-such-icon-at-all', FALLBACK_ICON_SLUG)).toBe(
      resolveIcon(FALLBACK_ICON_SLUG)
    );
    const circleIcon = resolveIconWithFallback('no-such-icon-at-all', 'no-such-fallback');
    expect(circleIcon.innerSvg).toBe('<circle cx="12" cy="12" r="9" />');
    expect(circleIcon.type).toBe('lucide');
  });

  it('normalizes slugs by trimming, lowercasing, and resolving aliases', () => {
    expect(normalizeIconSlug(' PY ')).toBe('python');
    expect(normalizeIconSlug('cpp')).toBe('cplusplus');
    expect(normalizeIconSlug('rocket')).toBe('rocket');
    expect(ICON_SLUG_ALIASES.ts).toBe('typescript');
  });
});

describe('computeIconXBounds', () => {
  it('reads `width` instead of `stroke-width` on shapes (regression: word boundary matched stroke-width)', () => {
    const bounds = computeIconXBounds(
      '<rect stroke-width="20" x="2" y="2" width="10" height="4" />',
      false
    );
    expect(bounds).toEqual({ maxX: 12, minX: 2 });
  });

  it('uses cubic and quadratic curve extrema instead of control points (regression: control points inflated widths)', () => {
    const cubic = computeIconXBounds('<path d="M4 12 C0 0 24 0 20 12" />', false);
    expect(cubic.minX).toBeCloseTo(3.55, 1);
    expect(cubic.maxX).toBeCloseTo(20.45, 1);

    const quad = computeIconXBounds('<path d="M4 12 Q0 0 4 -12" />', false);
    expect(quad.minX).toBeCloseTo(2, 1);
    expect(quad.maxX).toBe(4);

    // The reflected `S` control point (`x = 16`) and its explicit control (`x = 24`) both lie outside the ink.
    const smooth = computeIconXBounds('<path d="M4 12 C0 0 24 0 20 12 S24 24 4 24" />', false);
    expect(smooth.maxX).toBeCloseTo(20.45, 1);
  });

  it('honors both radii, the rotation, and large arcs with tiny chords (regression: arcs measured as one apex)', () => {
    const nearlyFullCircle = computeIconXBounds('<path d="M12 2 A10 10 0 1 1 11.99 2" />', false);
    expect(nearlyFullCircle.minX).toBeCloseTo(2, 1);
    expect(nearlyFullCircle.maxX).toBeCloseTo(22, 1);

    const tallEllipse = computeIconXBounds('<path d="M12 2 A5 10 0 1 1 11.99 2" />', false);
    expect(tallEllipse.minX).toBeCloseTo(7, 1);
    expect(tallEllipse.maxX).toBeCloseTo(17, 1);

    const rotatedEllipse = computeIconXBounds('<path d="M12 2 A10 5 90 1 1 11.99 2" />', false);
    expect(rotatedEllipse.minX).toBeCloseTo(7, 1);
    expect(rotatedEllipse.maxX).toBeCloseTo(17, 1);
  });

  it('pads stroked icons by half the stroke width and falls back for empty bodies', () => {
    expect(computeIconXBounds('<line x1="4" y1="2" x2="20" y2="2" />', true)).toEqual({
      maxX: 21.13,
      minX: 2.88,
    });
    expect(computeIconXBounds('<g />', false)).toEqual({ maxX: 22, minX: 2 });
  });
});
