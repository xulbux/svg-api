/**
 * SSOT SVG renderer tests – Variants 1..3, b1..b3, standalone icons, tech stack grids, quote cards, Kumo 3D crescents, micro-animations, and special elements (`src/svg/`).
 */

import { describe, expect, it } from 'vitest';
import { BASE_DARK, DOT_COLORS, THEMES } from '@/config/theme';
import { renderPreviewHtml } from '@/preview/page';
import { renderBadge, renderIcon, renderQuote, renderStack } from '@/svg/renderer';
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

  it('renders outward-only radar ripples with severity-specific cadences for status dots', () => {
    const greenDotSvg = renderBadge({
      color: 'emerald',
      dot: 'green',
      label: 'status',
      value: 'online',
      variant: '2',
    });
    expect(greenDotSvg).toContain(`fill="${DOT_COLORS.green}"`);
    expect(greenDotSvg).toContain('values="2.6;6.8"');
    expect(greenDotSvg).toContain('dur="2.3s"');

    const amberDotSvg = renderBadge({
      color: 'amber',
      dot: 'amber',
      label: 'status',
      value: 'degraded',
      variant: '2',
    });
    expect(amberDotSvg).toContain('values="2.6;6.4;2.6;6.8"');
    expect(amberDotSvg).toContain('dur="1.8s"');

    const redDotSvg = renderBadge({
      color: 'rose',
      dot: 'red',
      label: 'status',
      value: 'offline',
      variant: '2',
    });
    expect(redDotSvg).toContain('values="2.6;7.2"');
    expect(redDotSvg).toContain('dur="1.15s"');

    const maintenanceDotSvg = renderBadge({
      color: 'sky',
      dot: 'sky',
      label: 'status',
      value: 'maintenance',
      variant: '2',
    });
    expect(maintenanceDotSvg).toContain('values="2.4;3.2;2.4"');

    const standbyDotSvg = renderBadge({
      color: 'slate',
      dot: 'slate',
      label: 'status',
      value: 'standby',
      variant: '3',
    });
    expect(standbyDotSvg).toContain('values="0.9;0.32;0.9" dur="3.4s"');
  });

  it('renders contextual icon micro-animations automatically and respects anim overrides', () => {
    const spinSvg = renderBadge({
      color: 'teal',
      icon: 'refresh-cw',
      label: 'Syncing',
      variant: 'b2',
    });
    expect(spinSvg).toContain('type="rotate" from="0 12 12" to="360 12 12"');

    const shakeSvg = renderBadge({ color: 'purple', icon: 'sparkles', label: 'AI', variant: 'b2' });
    expect(shakeSvg).toContain('type="scale" values="1;1;1.15;1.15;1.15;1.15;1;1"');
    expect(shakeSvg).toContain('type="rotate" values="0;0;-11;11;-9;7;0;0"');

    const nudgeSvg = renderBadge({ color: 'blue', icon: 'rocket', label: 'Launch', variant: 'b1' });
    expect(nudgeSvg).toContain('type="translate" values="0 0;0 0;1.8 -1.8;0 0;0 0"');

    const sheenSvg = renderBadge({ anim: 'sheen', color: 'blue', label: 'Deploy', variant: 'b1' });
    expect(sheenSvg).toContain('clipPath id="sheen-clip-');
    expect(sheenSvg).toContain('linearGradient id="sheen-grad-');
    expect(sheenSvg).toContain('calcMode="spline" keySplines="0.42 0 0.25 1;0 0 1 1" dur="4s"');

    const staticSvg = renderBadge({
      anim: 'none',
      color: 'emerald',
      dot: 'green',
      icon: 'sparkles',
      label: 'Static',
      variant: '2',
    });
    expect(staticSvg).not.toContain('<animate');
    expect(staticSvg).not.toContain('<animateTransform');
  });

  it('renders all 5 special right-hand data elements (sparkline, bar, ring, strip, delta)', () => {
    const sparkSvg = renderBadge({
      color: 'emerald',
      icon: 'activity',
      label: 'commits',
      special: { type: 'sparkline', values: [2, 14] },
      value: '44/8w',
      variant: '2',
    });
    expect(sparkSvg).toContain('<polyline points="');
    expect(sparkSvg).toContain('<polygon points="');
    expect(sparkSvg).toContain(',15.5 ');
    expect(sparkSvg).toContain(',6.5"');

    const barSvg = renderBadge({
      color: 'emerald',
      label: 'coverage',
      special: { type: 'bar', value: 95 },
      value: '95%',
      variant: '2',
    });
    expect(barSvg).toContain(
      `width="32" height="6" rx="3" fill="${THEMES.emerald.accentText}" fill-opacity="0.20"`
    );
    expect(barSvg).toContain('width="30.4" height="6" rx="3" fill="url(#bar-shimmer-');

    const staticBarSvg = renderBadge({
      color: 'emerald',
      label: 'coverage',
      special: { hasPulse: false, type: 'bar', value: 95 },
      value: '95%',
      variant: '2',
    });
    expect(staticBarSvg).not.toContain('bar-shimmer-');

    const ringSvg = renderBadge({
      color: 'sky',
      label: 'quota',
      special: { type: 'ring', value: 75 },
      value: '75%',
      variant: '2',
    });
    expect(ringSvg).toContain(`stroke="${THEMES.sky.accentText}" stroke-opacity="0.24"`);
    expect(ringSvg).toContain('stroke-dasharray="21.2 28.27"');
    expect(ringSvg).not.toContain('values="1;0.45;1"');

    const pulsingRingSvg = renderBadge({
      color: 'sky',
      label: 'quota',
      special: { hasPulse: true, type: 'ring', value: 75 },
      value: '75%',
      variant: '2',
    });
    expect(pulsingRingSvg).toContain('values="1;0.45;1"');

    const stripSvg = renderBadge({
      color: 'emerald',
      label: 'uptime',
      special: { states: ['9', '6', '4', '2', '0'], type: 'strip' },
      value: '99.9%',
      variant: '2',
    });
    expect(stripSvg).toContain('fill="#00d294"');
    expect(stripSvg).toContain('fill="#9ae600"');
    expect(stripSvg).toContain('fill="#fdc700"');
    expect(stripSvg).toContain('fill="#ff8904"');
    expect(stripSvg).toContain('fill="#ff4d6d"');

    const deltaSvg = renderBadge({
      color: 'cyan',
      label: 'downloads',
      special: { type: 'delta', value: '+18%' },
      value: '142k',
      variant: '2',
    });
    expect(deltaSvg).toContain('+18%</text>');
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

  it('renders symmetric horizontal padding and centered text-anchor for no-icon buttons and pills', () => {
    const iconOnlyBadge = renderBadge({ color: 'indigo', icon: 'github', label: '', variant: '1' });
    expect(iconOnlyBadge).toContain('width="31"');
    expect(iconOnlyBadge).toContain('translate(9, 4.5)');
    expect(iconOnlyBadge).not.toContain('class="txt"');

    const dotOnlyBadge = renderBadge({ color: 'emerald', dot: 'green', label: '', variant: '2' });
    expect(dotOnlyBadge).toContain('width="25"');
    expect(dotOnlyBadge).toContain('cx="12.5"');

    const noIconButton = renderBadge({ color: 'amber', label: 'Get Started', variant: 'b1' });
    const widthMatch = /width="(?<total>\d+)"/.exec(noIconButton);
    const totalWidth = Number(widthMatch?.groups?.total);
    expect(noIconButton).toContain(`x="${totalWidth / 2}" y="17" text-anchor="middle"`);
  });

  it('applies tapering Kumo upper-edge crescent on all 3 button variants (b1, b2, b3) and colored variant=1 capsules, and uses muted gray text on both variant=3 and variant=b3', () => {
    const primaryButton = renderBadge({ color: 'blue', label: 'Change', variant: 'b1' });
    expect(primaryButton).toContain('A 6 5 0 0 0');
    expect(primaryButton).toContain(`fill="${THEMES.blue.emphasisBg}"`);
    expect(primaryButton).toContain(`stroke="${THEMES.blue.emphasisRing}"`);

    const secondaryButton = renderBadge({ color: 'sky', label: 'Changelog', variant: 'b2' });
    expect(secondaryButton).toContain('A 6 5 0 0 0');
    expect(secondaryButton).toContain(`fill="${THEMES.sky.borderColor}" fill-opacity="0.45"`);
    expect(secondaryButton).toContain(`stroke="${THEMES.sky.borderColor}" stroke-width="1"`);

    const splitPrimary = renderBadge({
      color: 'emerald',
      icon: 'pypi',
      label: 'pypi',
      value: 'v2.4.0',
      variant: '1',
    });
    expect(splitPrimary).toContain(`stroke="${BASE_DARK.borderNeutral}"`);
    expect(splitPrimary).toContain('A 5 4 0 0 0');
    expect(splitPrimary).toContain(`fill="${THEMES.emerald.emphasisBg}"`);
    expect(splitPrimary).toContain(`stroke="${THEMES.emerald.emphasisRing}"`);

    const secondaryBadge = renderBadge({
      color: 'cyan',
      label: 'arch',
      value: 'hyprland',
      variant: '2',
    });
    expect(secondaryBadge).not.toContain('A 5 4 0 0 0');

    const tertiaryBadge = renderBadge({
      color: 'indigo',
      label: 'stars',
      value: '4.8k',
      variant: '3',
    });
    const tertiaryButton = renderBadge({
      color: 'rose',
      icon: 'bug',
      label: 'Report Issue',
      variant: 'b3',
    });
    expect(tertiaryBadge).toContain(`fill="${BASE_DARK.textMuted}" class="txt"`);
    expect(tertiaryBadge).not.toContain('A 5 4 0 0 0');
    expect(tertiaryButton).toContain(`fill="${BASE_DARK.textMuted}" class="txt"`);
    expect(tertiaryButton).toContain('A 6 5 0 0 0');
    expect(tertiaryButton).toContain('fill="#ffffff" fill-opacity="0.045"');
  });
});

describe('renderIcon', () => {
  it('renders standalone Lucide stroke icons and Simple Icons brand fills with anti-clipping padded viewBox, custom size, strokeWidth, color, glint sheen, pulse, float, and spin animations', () => {
    const lucideSvg = renderIcon({
      anim: 'none',
      color: 'violet',
      icon: 'globe-code',
      size: 16,
      strokeWidth: 2.5,
    });
    expect(lucideSvg).toContain('width="16" height="16" viewBox="-3 -3 30 30"');
    expect(lucideSvg).toContain(`stroke="${THEMES.violet.iconColor}"`);
    expect(lucideSvg).toContain('stroke-width="2.5"');
    expect(lucideSvg).not.toContain('<animateTransform');

    const simpleSvg = renderIcon({ color: 'cyan', icon: 'archlinux', size: 28 });
    expect(simpleSvg).toContain('width="28" height="28" viewBox="-3 -3 30 30"');
    expect(simpleSvg).toContain(`fill="${THEMES.cyan.iconColor}"`);
    expect(simpleSvg).not.toContain('stroke-width=');

    const sheenLucideSvg = renderIcon({ anim: 'sheen', color: 'amber', icon: 'zap', size: 28 });
    expect(sheenLucideSvg).toContain('linearGradient id="icon-sheen-zap-amber-28"');
    expect(sheenLucideSvg).toContain('values="-58;58;58"');
    expect(sheenLucideSvg).toContain('values="-32;84;84"');
    expect(sheenLucideSvg).toContain('stop-opacity="0.45"');
    expect(sheenLucideSvg).toContain('stroke="url(#icon-sheen-zap-amber-28)"');

    const sheenSimpleSvg = renderIcon({
      anim: 'sheen',
      color: 'orange',
      icon: 'cloudflare',
      size: 24,
    });
    expect(sheenSimpleSvg).toContain('linearGradient id="icon-sheen-cloudflare-orange-24"');
    expect(sheenSimpleSvg).toContain('fill="url(#icon-sheen-cloudflare-orange-24)"');

    const pulseIconSvg = renderIcon({ color: 'rose', icon: 'heart-handshake' });
    expect(pulseIconSvg).toContain('type="scale" values="1;1;1.18;0.96;1.14;1;1"');

    const floatIconSvg = renderIcon({ color: 'emerald', icon: 'package' });
    expect(floatIconSvg).toContain('type="translate" values="0 0;0 -1.5;0 0;0 1.2;0 0"');

    const animatedIconSvg = renderIcon({ color: 'teal', icon: 'refresh-cw' });
    expect(animatedIconSvg).toContain('width="24" height="24"');
    expect(animatedIconSvg).toContain('type="rotate" from="0 12 12" to="360 12 12"');

    const clampedIconSvg = renderIcon({
      color: 'amber',
      icon: 'unknown-nonexistent-icon',
      size: 9999,
      strokeWidth: 99,
    });
    expect(clampedIconSvg).toContain('width="256" height="256"');
    expect(clampedIconSvg).toContain('stroke-width="4"');
  });
});

describe('renderStack', () => {
  it('renders single and multi-group Kumo 3D tech stack icon grids across Primary (1), Secondary (2), and Tertiary (3) variants', () => {
    const stackSvgV1 = renderStack({
      anim: 'sheen',
      gap: 8,
      icons: ['c', 'cpp', 'cs', 'rust', 'py', 'ts'],
      perLine: 3,
      size: 42,
      variant: '1',
    });
    expect(stackSvgV1).toContain('width="142" height="92"');
    expect(stackSvgV1).toContain('stack-sheen-clip-142-92');
    expect(stackSvgV1).toContain('fill="url(#grad-blue)"');
    expect(stackSvgV1).toContain('fill="url(#grad-orange)"');
    expect(stackSvgV1).toContain('fill="#ffffff"');

    const groupedStackSvgV2 = renderStack({
      anim: 'sheen',
      icons: ['figma,ai,blender,ps,pr,ae:3|obsidian,notion,codepen,gtk,latex,regex:3'],
      variant: '2',
    });
    expect(groupedStackSvgV2).toContain('width="310" height="92"');
    expect(groupedStackSvgV2).toContain('stack-sheen-clip-310-92');
    expect(groupedStackSvgV2).toContain(`fill="${THEMES.orange.iconColor}"`);
    expect(groupedStackSvgV2).toContain(`fill="${THEMES.orange.tintBg}"`);

    const stackSvgV3 = renderStack({ icons: ['rust', 'ts'], variant: '3' });
    expect(stackSvgV3).toContain(`stroke="${BASE_DARK.borderNeutral}"`);
    expect(stackSvgV3).toContain('fill="#ffffff" fill-opacity="0.045"');
  });
});

describe('renderQuote', () => {
  it('renders horizontal and vertical Kumo 3D quote cards across Primary (1), Secondary (2), and Tertiary (3) variants', () => {
    const quoteSvgV2 = renderQuote({
      anim: 'sheen',
      author: 'XulbuX',
      color: 'indigo',
      size: 'lg',
      text: 'Who says programmers are boring? I bring the humor to the office while my code brings the chaos!',
      variant: '2',
      width: 440,
    });
    expect(quoteSvgV2).toContain('width="440"');
    expect(quoteSvgV2).toContain('Who says programmers are boring?');
    expect(quoteSvgV2).toContain('— XulbuX</text>');
    expect(quoteSvgV2).toContain('quote-sheen-clip-440-');
    expect(quoteSvgV2).toContain(`fill="${THEMES.indigo.tintBg}"`);

    const verticalQuoteSvgV1 = renderQuote({
      anim: 'sheen',
      author: 'XulbuX',
      color: 'blue',
      layout: 'vertical',
      size: 'lg',
      text: 'Who says programmers are boring? I bring the humor to the office while my code brings the chaos!',
      variant: '1',
      width: 340,
    });
    expect(verticalQuoteSvgV1).toContain('width="340"');
    expect(verticalQuoteSvgV1).toContain('fill="url(#quote-grad-blue)"');
    expect(verticalQuoteSvgV1).toContain('fill="#ffffff"');
    expect(verticalQuoteSvgV1).toContain('rotate(180 12 12)');
    expect(verticalQuoteSvgV1).toContain('font-style: italic;');
    expect(verticalQuoteSvgV1).toContain('— XulbuX</text>');

    const quoteSvgV3 = renderQuote({
      author: 'XulbuX',
      color: 'violet',
      text: 'Minimal tertiary quote card.',
      variant: '3',
    });
    expect(quoteSvgV3).toContain(`stroke="${BASE_DARK.borderNeutral}"`);
    expect(quoteSvgV3).toContain('fill="#ffffff" fill-opacity="0.045"');
  });
});

describe('renderPreviewHtml', () => {
  it('renders the complete SSOT preview studio HTML containing all variants for badges, buttons, tech stacks, and quote cards', () => {
    const html = renderPreviewHtml();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('svg-api – SSOT Live Preview');
    expect(html).toContain('variant=1 · Primary Badge');
    expect(html).toContain('variant=b3 · Tertiary Button');
    expect(html).toContain('svg.xul.is/icon/:icon');
    expect(html).toContain('svg.xul.is/stack/:groups');
    expect(html).toContain('svg.xul.is/quote/:author/:text');
    expect(html).not.toContain('<span>');
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  });
});
