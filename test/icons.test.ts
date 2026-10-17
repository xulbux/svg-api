/**
 * Icon resolution tests – Lucide stroke icons, Simple Icons brand fills, and full XulbuX tech stack coverage (`src/svg/icons.ts`).
 */

/* oxlint-disable typescript/no-non-null-assertion */

import { describe, expect, it } from 'vitest';
import { resolveIcon, resolveStackIconColor } from '@/svg/icons';

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

  it('returns undefined for unknown icon slugs', () => {
    expect(resolveIcon('definitely-not-a-real-icon-xyz')).toBeUndefined();
  });
});
