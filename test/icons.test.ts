/**
 * Icon resolution tests – Lucide stroke icons and Simple Icons brand fills (`src/svg/icons.ts`).
 */

/* oxlint-disable typescript/no-non-null-assertion */

import { describe, expect, it } from 'vitest';
import { resolveIcon } from '@/svg/icons';

// ----------------------------------------- MAIN ----------------------------------------

describe('resolveIcon', () => {
  it('returns undefined when slug is undefined, empty, or "none"', () => {
    expect(resolveIcon()).toBeUndefined();
    expect(resolveIcon('')).toBeUndefined();
    expect(resolveIcon('   ')).toBeUndefined();
    expect(resolveIcon('none')).toBeUndefined();
    expect(resolveIcon('NONE')).toBeUndefined();
  });

  it('resolves single-word and multi-word Lucide icons', () => {
    const starIcon = resolveIcon('star');
    expect(starIcon).toBeDefined();
    expect(starIcon!.type).toBe('lucide');
    expect(starIcon!.innerSvg).toContain('<');

    const bookOpenIcon = resolveIcon('book-open');
    expect(bookOpenIcon).toBeDefined();
    expect(bookOpenIcon!.type).toBe('lucide');
    expect(bookOpenIcon!.innerSvg).toContain('<path');
  });

  it('resolves Simple Icons brand slugs as fallback', () => {
    const archIcon = resolveIcon('archlinux');
    expect(archIcon).toBeDefined();
    expect(archIcon!.type).toBe('simple');
    expect(archIcon!.innerSvg).toMatch(/^<path d="[^"]+" \/>$/);

    const pypiIcon = resolveIcon('pypi');
    expect(pypiIcon).toBeDefined();
    expect(pypiIcon!.type).toBe('simple');
  });

  it('returns undefined for unknown icon slugs', () => {
    expect(resolveIcon('definitely-not-a-real-icon-xyz')).toBeUndefined();
  });
});
