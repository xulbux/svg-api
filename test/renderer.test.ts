/**
 * SSOT SVG renderer tests – Variants 1..3, b1..b3, status dots, sparklines, and escaping (`src/svg/renderer.ts`).
 */

import { describe, expect, it } from 'vitest';
import { renderPreviewHtml } from '@/preview/page';
import { renderBadge } from '@/svg/renderer';
import type { BadgeVariant } from '@/types';

// ----------------------------------------- MAIN ----------------------------------------

describe('renderBadge', () => {
  it('renders all 6 variants with valid SVG dimensions and viewBox', () => {
    const variants: BadgeVariant[] = ['1', '2', '3', 'b1', 'b2', 'b3'];

    for (const variant of variants) {
      const isBtn = variant.startsWith('b');
      const svg = renderBadge({
        color: 'indigo',
        icon: 'sparkles',
        label: 'xulbux',
        value: isBtn ? undefined : 'v1.0',
        variant,
      });

      const expectedHeight = isBtn ? 26 : 22;
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain(`height="${expectedHeight}"`);
      expect(svg).toMatch(new RegExp(`viewBox="0 0 \\d+ ${expectedHeight}"`));
    }
  });

  it('renders an animated pulsing dot when dot option is specified', () => {
    const svg = renderBadge({
      color: 'emerald',
      dot: 'green',
      label: 'status',
      value: 'online',
      variant: '2',
    });

    expect(svg).toContain('<animate attributeName="r"');
    expect(svg).toContain('fill="#22c55e"');
  });

  it('renders a polyline sparkline with a closed polygon area gradient fill when at least 2 points are provided', () => {
    const svg = renderBadge({
      color: 'emerald',
      icon: 'activity',
      label: 'commits',
      sparkline: [2, 6, 4, 10, 8, 14],
      value: '44/8w',
      variant: '2',
    });

    expect(svg).toContain('<polyline points="');
    expect(svg).toContain('<polygon points="');
    expect(svg).toContain('id="spark-fill-emerald"');
    expect(svg).toContain('fill="url(#spark-fill-emerald)"');
  });

  it('escapes XML special characters in label, value, and aria-label', () => {
    const svg = renderBadge({
      color: 'amber',
      label: 'python & <rust>',
      value: '>=3.10 "fast"',
      variant: '1',
    });

    expect(svg).toContain('python &amp; &lt;rust&gt;');
    expect(svg).toContain('&gt;=3.10 &quot;fast&quot;');
    expect(svg).not.toContain('<rust>');
  });

  it('scopes gradient IDs by color and bevel type so multiple inlined SVGs do not collide in DOM', () => {
    const cyanBadge = renderBadge({
      color: 'cyan',
      label: 'arch',
      value: 'hyprland',
      variant: '1',
    });
    const emeraldButton = renderBadge({ color: 'emerald', label: 'Latest Release', variant: 'b1' });

    expect(cyanBadge).toContain('id="grad-cyan"');
    expect(cyanBadge).toContain('fill="url(#grad-cyan)"');
    expect(cyanBadge).toContain('id="bevel-sec"');

    expect(emeraldButton).toContain('id="grad-emerald"');
    expect(emeraldButton).toContain('fill="url(#grad-emerald)"');
    expect(emeraldButton).toContain('id="bevel-pri"');
  });

  it('renders symmetric horizontal padding for icon-only, dot-only, and single-part badges', () => {
    const iconOnlyBadge = renderBadge({ color: 'indigo', icon: 'github', label: '', variant: '1' });
    // padX (9) + iconSize (13) + padX (9) = 31px total width, no empty <text class="txt"> element.
    expect(iconOnlyBadge).toContain('width="31"');
    expect(iconOnlyBadge).toContain('translate(9, 4.5)');
    expect(iconOnlyBadge).not.toContain('class="txt"');

    const dotOnlyBadge = renderBadge({ color: 'emerald', dot: 'green', label: '', variant: '2' });
    // padX (9) + dot diameter (7) + padX (9) = 25px total width, dot centered at cx="12.5".
    expect(dotOnlyBadge).toContain('width="25"');
    expect(dotOnlyBadge).toContain('cx="12.5"');

    const singlePartPrimary = renderBadge({ color: 'rose', label: 'Experimental', variant: '1' });
    expect(singlePartPrimary).toContain('fill="url(#grad-rose)"');
    expect(singlePartPrimary).toContain('id="bevel-pri"');
  });
});

describe('renderPreviewHtml', () => {
  it('renders the complete SSOT preview studio HTML containing all 6 variants and structural use cases', () => {
    const html = renderPreviewHtml();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('v=1 · Primary Badge');
    expect(html).toContain('v=b3 · Tertiary Button');
    expect(html).toContain('4. Structural Combinations & Edge Cases');
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  });
});
