/**
 * Icon resolution tests – Bundled stroke and brand icon resolution, aliases, bounded caching, and ink bounds (`src/svg/icons.ts`).
 */

import { describe, expect, it } from 'vitest';
import {
  FALLBACK_ICON_SLUG,
  ICON_SLUG_ALIASES,
  computeIconXBounds,
  getIconPickerIndex,
  getIconPickerPage,
  inspectResolvedIconCache,
  normalizeIconSlug,
  resolveIcon,
  resolveIconLookup,
  resolveIconWithFallback,
} from '@/svg/icons';
import { renderStack, resolveStackIconColor } from '@/svg/stack';
import { extractAriaLabel, requireDefined } from './helpers';

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
    const starIcon = requireDefined(resolveIcon('star'), 'star icon');
    expect(starIcon.type).toBe('lucide');
    expect(starIcon.innerSvg).toContain('<');

    const bookOpenIcon = requireDefined(resolveIcon('book-open'), 'book-open icon');
    expect(bookOpenIcon.type).toBe('lucide');
    expect(bookOpenIcon.innerSvg).toContain('<path');

    const globeCodeIcon = requireDefined(resolveIcon('globe-code'), 'globe-code icon');
    expect(globeCodeIcon.type).toBe('lucide');
    expect(globeCodeIcon.innerSvg).toContain('<circle');

    const squareTextIcon = requireDefined(resolveIcon('square-text'), 'square-text icon');
    expect(squareTextIcon.type).toBe('lucide');
    expect(squareTextIcon.innerSvg).toContain('<path');

    const puzzleAlias = requireDefined(resolveIcon('puzzle-piece'), 'puzzle-piece icon');
    expect(puzzleAlias.type).toBe('lucide');
  });

  it('resolves brand and tech slugs with unified C/C++/C# hexagon style across the tech stack catalog', () => {
    const cIcon = requireDefined(resolveIcon('c', true), 'c brand icon');
    const cppIcon = requireDefined(resolveIcon('cpp', true), 'cpp brand icon');
    const csIcon = requireDefined(resolveIcon('cs', true), 'cs brand icon');
    expect(cIcon.innerSvg).toContain('transform="scale(0.1875)"');
    expect(cppIcon.innerSvg).toContain('transform="scale(0.1875)"');
    expect(csIcon.innerSvg).toContain('transform="scale(0.1875)"');
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
      'apachemaven',
      'jetbrains',
      'maven',
      'twig',
    ];

    for (const slug of stackSlugs) {
      const resolved = resolveIcon(slug, true);
      expect(resolved, `Expected icon "${slug}" to resolve`).toBeDefined();
      expect(resolveStackIconColor(slug)).toBeDefined();
    }

    // With `isBrandFirst=true`, `'blender'` resolves to the Simple Icons 3D Blender logo rather than Lucide's kitchen blender:
    const blenderBrand = requireDefined(resolveIcon('blender', true), 'blender brand icon');
    expect(blenderBrand.type).toBe('simple');
  });

  it('resolves fallback icons from @iconify-json/file-icons (e.g., twig) while preferring Simple Icons and Devicon Plain without duplicates', () => {
    const twigIcon = requireDefined(resolveIcon('twig', true), 'twig icon');
    expect(twigIcon.type).toBe('simple');
    expect(twigIcon.coordScale).toBe(0.046875);
    expect(twigIcon.coordOffsetX).toBe(2.41);
    expect(twigIcon.innerSvg).toContain('transform="translate(2.41, 0) scale(0.046875)"');
    expect(resolveStackIconColor('twig')).toBe('lime');

    // Icons present in Simple Icons or Devicon Plain must keep their preferred glyph rather than File Icons' 512-unit body:
    const phpIcon = requireDefined(resolveIcon('php', true), 'php icon');
    expect(phpIcon.coordScale).toBe(1);
    const archIcon = requireDefined(resolveIcon('archlinux', true), 'archlinux icon');
    expect(archIcon.coordScale).toBe(1);
    expect(resolveIcon('arch-linux', true)?.innerSvg).toBe(archIcon.innerSvg);

    // Hyphenated File Icons duplicates (`arch-linux`, `common-lisp`) are mapped as aliases instead of duplicating picker slugs:
    const index = getIconPickerIndex();
    expect(index.sets.brands).toContain('twig');
    expect(index.sets.brands).toContain('archlinux');
    expect(index.sets.brands).not.toContain('arch-linux');
    expect(index.brandAliases['arch-linux']).toBe('archlinux');
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

  it('returns the canonical key together with the resolved data (normalized once)', () => {
    const lookup = resolveIconLookup(' TS ', true);
    expect(lookup.key).toBe('typescript');
    expect(lookup.data).toBe(resolveIcon('typescript', true));
    expect(resolveIconLookup('none')).toEqual({ data: undefined, key: 'none' });
  });

  it('never serves a raw-slug fallback result for the canonical slug (regression: cached under the alias target key)', () => {
    // A temporary alias whose canonical target does not exist, so the raw slug resolves it:
    const alias = 'zap';
    const missingTarget = 'zzz-no-such-canonical-icon';
    Reflect.set(ICON_SLUG_ALIASES, alias, missingTarget);
    try {
      expect(resolveIcon(alias)).toBeDefined();
      expect(resolveIcon(missingTarget)).toBeUndefined();
    } finally {
      Reflect.deleteProperty(ICON_SLUG_ALIASES, alias);
    }
    expect(resolveIcon(alias)).toBeDefined();
  });

  it('bounds the resolved icon cache by total body size, not only by entry count (regression: count-only bound)', () => {
    for (const slug of ['elsevier', 'rust', 'typescript', 'star', 'rocket']) {
      resolveIcon(slug, true);
    }
    const cache = inspectResolvedIconCache();
    const rustIcon = requireDefined(resolveIcon('rust', true), 'rust brand icon');
    expect(Number.isFinite(cache.maxWeight)).toBe(true);
    expect(cache.weigh(rustIcon)).toBe(rustIcon.innerSvg.length);
    let summedWeight = 0;
    for (const icon of cache.entries.values()) {
      summedWeight += icon.innerSvg.length;
    }
    expect(cache.totalWeight).toBe(summedWeight);
    expect(cache.totalWeight).toBeLessThanOrEqual(cache.maxWeight);
  });

  it('canonicalizes Simple Icons aliases for stack colors and titles and paginates icon picker pages cleanly (regressions: Simple Icons aliases fell back to indigo, hyphenated File Icons tie-break)', () => {
    expect(resolveIconLookup('nuxtdotjs', true).key).toBe('nuxt');
    expect(resolveStackIconColor('nuxtdotjs')).toBe(resolveStackIconColor('nuxt'));
    expect(resolveStackIconColor('nuxtdotjs')).not.toBe('indigo');
    expect(extractAriaLabel(renderStack({ icons: ['nuxtdotjs'] }))).toBe('tech stack: Nuxt');

    expect(resolveIconLookup('amazonaws', true).key).toBe('amazonwebservices');
    expect(resolveStackIconColor('amazonaws')).toBe(resolveStackIconColor('aws'));

    const firstPage = getIconPickerPage('lucide', 0);
    expect(firstPage).toBeDefined();
    expect(Object.keys(firstPage ?? {}).length).toBeGreaterThan(0);
    expect(getIconPickerPage('lucide', 9999)).toBeUndefined();
    expect(getIconPickerPage('lucide', -1)).toBeUndefined();
  });

  it('maps every ICON_SLUG_ALIASES entry to a primary picker slug, deduplicates secondary brand sets, and resolves dotted brand aliases', () => {
    const index = getIconPickerIndex();
    const primarySlugs = new Set<string>([...index.sets.lucide, ...index.sets.brands]);
    for (const [alias, canonical] of Object.entries(ICON_SLUG_ALIASES)) {
      expect(primarySlugs.has(canonical), `${alias} -> ${canonical}`).toBe(true);
      expect(resolveIcon(alias), alias).toBeDefined();
      expect(resolveIcon(alias, true), `${alias} (brand-first)`).toBeDefined();
    }

    // Secondary-set duplicates of brand aliases (`vscode`, `nodejs`, `nextjs`) map through `brandAliases` instead of duplicating `sets.brands`:
    for (const duplicate of ['vscode', 'nodejs', 'nextjs', 'nuxtjs', 'vitejs']) {
      expect(index.sets.brands, duplicate).not.toContain(duplicate);
      expect(index.brandAliases[duplicate], duplicate).toBe(ICON_SLUG_ALIASES[duplicate]);
    }

    // Dotted and hyphenated spellings of brand aliases (`next.js`, `socket.io`, `draw.io`, `premiere-pro`) resolve to their canonical Simple Icons glyphs and titles:
    expect(resolveIconLookup('next.js', true)).toEqual(resolveIconLookup('nextdotjs', true));
    expect(resolveIconLookup('next-js', true)).toEqual(resolveIconLookup('nextdotjs', true));
    expect(resolveIconLookup('socket.io', true)).toEqual(resolveIconLookup('socketdotio', true));
    expect(resolveIconLookup('draw.io', true)).toEqual(resolveIconLookup('diagramsdotnet', true));
    expect(resolveIconLookup('premiere-pro', true)).toEqual(
      resolveIconLookup('adobepremierepro', true)
    );
    expect(
      extractAriaLabel(
        renderStack({ icons: ['next.js', 'socket.io', 'discordjs', 'docsrs', 'chrome', 'hn'] })
      )
    ).toBe('tech stack: Next.js, Socket.io, discord.js, docs.rs, Google Chrome, Y Combinator');
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

    // The reflected `S` control point (`x = 16`) and its explicit control (`x = 24`) both lie outside the ink:
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
    expect(computeIconXBounds('<polygon points="" /><polyline points="   " />', false)).toEqual({
      maxX: 22,
      minX: 2,
    });
  });

  it('keeps narrow bounds on single-X vertical stroke icons instead of inflating to 2..22 (regression: single-X vertical stroke bounds)', () => {
    expect(computeIconXBounds('<path d="M4 4v16" />', true)).toEqual({ maxX: 5.13, minX: 2.88 });
    const tallyOne = requireDefined(resolveIcon('tally-1'), 'tally-1 icon');
    expect(tallyOne.maxX - tallyOne.minX).toBeLessThan(3);
  });

  it('ignores non-path d-suffixed attributes, zero-extent shapes, and truncated path commands (regressions: unanchored d= match, zero-radius shapes, truncated path NaN)', () => {
    expect(computeIconXBounds('<path data-id="M0 0 H24" d="M6 4 H18" />', false)).toEqual({
      maxX: 18,
      minX: 6,
    });
    expect(
      computeIconXBounds(
        '<circle cx="1" cy="12" r="0" /><rect x="23" y="4" width="0" height="8" /><rect x="6" y="4" width="12" height="8" />',
        false
      )
    ).toEqual({ maxX: 18, minX: 6 });

    for (const truncatedPath of [
      '<path d="M5 10 H15 L" />',
      '<path d="M5 10 H15 C0 0" />',
      '<path d="M5 10 H15 Q0" />',
      '<path d="M5 10 H15 A5 5 0 0" />',
    ]) {
      const bounds = computeIconXBounds(truncatedPath, false);
      expect(Number.isFinite(bounds.minX), truncatedPath).toBe(true);
      expect(Number.isFinite(bounds.maxX), truncatedPath).toBe(true);
      expect(bounds, truncatedPath).toEqual({ maxX: 15, minX: 5 });
    }
  });
});
