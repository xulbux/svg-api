/**
 * SSOT SVG renderer tests – Variants 1..3, CTA buttons, standalone icons, tech stack grids, quote cards, Kumo 3D crescents, micro-animations, and special elements (`src/svg/`).
 */

import { describe, expect, it } from 'vitest';
import { BASE_DARK, DOT_COLORS, THEMES } from '@/config/theme';
import { renderDocsHtml, renderHomeHtml } from '@/preview/page';
import { renderBadge, renderButton, renderIcon, renderQuote, renderStack } from '@/svg/renderer';
import type { BadgeVariant } from '@/types';

// ----------------------------------------- MAIN ----------------------------------------

describe('renderBadge & renderButton', () => {
  it('renders all 3 badge variants (22px) and all 3 button variants across sm/md/lg/xl sizes', () => {
    const variants: BadgeVariant[] = ['1', '2', '3'];

    for (const variant of variants) {
      const badgeSvg = renderBadge({
        color: 'indigo',
        icon: 'sparkles',
        label: 'xulbux',
        value: 'v1.0',
        variant,
      });
      expect(badgeSvg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(badgeSvg).toContain('height="22"');
      expect(badgeSvg).toMatch(/viewBox="0 0 \d+ 22"/);

      const btnSvg = renderButton({ color: 'indigo', icon: 'sparkles', label: 'Explore', variant });
      expect(btnSvg).toContain('height="30"');
      expect(btnSvg).toMatch(/viewBox="0 0 \d+ 30"/);
    }

    expect(renderButton({ color: 'indigo', label: 'Small', size: 'sm', variant: '1' })).toContain(
      'height="26"'
    );
    expect(renderButton({ color: 'indigo', label: 'Large', size: 'lg', variant: '1' })).toContain(
      'height="36"'
    );
    expect(renderButton({ color: 'indigo', label: 'XL', size: 'xl', variant: '1' })).toContain(
      'height="42"'
    );
    expect(renderButton({ color: 'indigo', label: 'Custom', size: 40, variant: '1' })).toContain(
      'height="40"'
    );
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

  it('keeps icons static by default and under anim=sheen, while animating icons for anim=auto, explicit modes, and sheen,<mode>', () => {
    const defaultSparklesSvg = renderButton({
      color: 'indigo',
      icon: 'sparkles',
      label: 'Explore svg.xul.is',
      variant: '1',
    });
    expect(defaultSparklesSvg).not.toContain('<animateTransform');

    const sheenOnlyButtonSvg = renderButton({
      anim: 'sheen',
      color: 'indigo',
      icon: 'sparkles',
      label: 'Explore svg.xul.is',
      variant: '1',
    });
    expect(sheenOnlyButtonSvg).toContain('clipPath id="sheen-clip-');
    expect(sheenOnlyButtonSvg).not.toContain('type="rotate"');

    const sheenAndAutoButtonSvg = renderButton({
      anim: 'sheen,auto',
      color: 'indigo',
      icon: 'sparkles',
      label: 'Explore svg.xul.is',
      variant: '1',
    });
    expect(sheenAndAutoButtonSvg).toContain('clipPath id="sheen-clip-');
    expect(sheenAndAutoButtonSvg).toContain('type="rotate" values="0;0;-11;11;-9;7;0;0"');

    const spinSvg = renderButton({
      anim: 'auto',
      color: 'teal',
      icon: 'refresh-cw',
      label: 'Syncing',
      variant: '2',
    });
    expect(spinSvg).toContain('type="rotate" from="0 12 12" to="360 12 12"');

    const shakeSvg = renderButton({
      anim: 'auto',
      color: 'purple',
      icon: 'sparkles',
      label: 'AI',
      variant: '2',
    });
    expect(shakeSvg).toContain('type="scale" values="1;1;1.15;1.15;1.15;1.15;1;1"');
    expect(shakeSvg).toContain('type="rotate" values="0;0;-11;11;-9;7;0;0"');

    const nudgeSvg = renderButton({
      anim: 'auto',
      color: 'blue',
      icon: 'rocket',
      label: 'Launch',
      variant: '1',
    });
    expect(nudgeSvg).toContain('type="translate" values="0 0;0 0;1.8 -1.8;0 0;0 0"');

    const sheenSvg = renderButton({ anim: 'sheen', color: 'blue', label: 'Deploy', variant: '1' });
    expect(sheenSvg).toContain('clipPath id="sheen-clip-');
    expect(sheenSvg).toContain('linearGradient id="sheen-grad-');
    expect(sheenSvg).toContain('calcMode="spline" keySplines="0.42 0 0.25 1;0 0 1 1" dur="4s"');

    const dualIconNudgeSvg = renderButton({
      anim: 'nudge',
      color: 'indigo',
      icon: 'book-open,arrow-right',
      label: 'Explore Docs',
      variant: '1',
    });
    expect((dualIconNudgeSvg.match(/<animateTransform/g) ?? []).length).toBe(1);

    const dualIconExplicitPairSvg = renderButton({
      anim: 'sheen,shake,nudge',
      color: 'indigo',
      icon: 'sparkles,arrow-right',
      label: 'Get Started',
      variant: '1',
    });
    expect(dualIconExplicitPairSvg).toContain('clipPath id="sheen-clip-');
    expect(dualIconExplicitPairSvg).toContain('type="rotate" values="0;0;-11;11;-9;7;0;0"');
    expect(dualIconExplicitPairSvg).toContain('type="translate" values="0 0;0 0;2.2 0;0 0;0 0"');

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

  it('renders symmetric horizontal padding, optical icon-bound trimming, and unified icon=left,right / icon=none,right syntax', () => {
    const iconOnlyBadge = renderBadge({ color: 'indigo', icon: 'github', label: '', variant: '1' });
    expect(iconOnlyBadge).toContain('width="31"');
    expect(iconOnlyBadge).toContain('translate(9, 4.5)');
    expect(iconOnlyBadge).not.toContain('class="txt"');

    const dotOnlyBadge = renderBadge({ color: 'emerald', dot: 'green', label: '', variant: '2' });
    expect(dotOnlyBadge).toContain('width="25"');
    expect(dotOnlyBadge).toContain('cx="12.5"');

    const noIconButton = renderButton({ color: 'amber', label: 'Get Started', variant: '1' });
    const widthMatch = /width="(?<total>\d+)"/.exec(noIconButton);
    const totalWidth = Number(widthMatch?.groups?.total);
    expect(noIconButton).toContain(`x="${totalWidth / 2}" y="19" text-anchor="middle"`);

    const dualIconBadge = renderBadge({
      color: 'sky',
      icon: 'book-open,arrow-right',
      label: 'docs',
      value: 'read',
      variant: '1',
    });
    expect((dualIconBadge.match(/scale\(0\.5417\)/g) ?? []).length).toBe(2);

    const rightOnlyButton = renderButton({
      color: 'emerald',
      icon: 'none,chevron-right',
      label: 'Continue',
      variant: '1',
    });
    expect((rightOnlyButton.match(/scale\(0\.625\)/g) ?? []).length).toBe(1);
    expect(rightOnlyButton).toContain('Continue');
  });

  it('applies tapering Kumo upper-edge crescent on all 3 button variants (1, 2, 3) and colored variant=1 badge capsules, and uses muted carbon-gray text on variant=3', () => {
    const primaryButton = renderButton({
      color: 'blue',
      icon: 'sparkles',
      label: 'Change',
      variant: '1',
    });
    expect(primaryButton).toContain('A 8 7 0 0 0');
    expect(primaryButton).toContain(`fill="${THEMES.blue.emphasisBg}"`);
    expect(primaryButton).toContain(`stroke="${THEMES.blue.emphasisRing}"`);
    expect(primaryButton).toContain(
      'stroke="#ffffff" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" opacity="0.82"'
    );

    const secondaryButton = renderButton({
      color: 'sky',
      icon: 'sparkles',
      label: 'Changelog',
      variant: '2',
    });
    expect(secondaryButton).toContain('A 8 7 0 0 0');
    expect(secondaryButton).toContain(`fill="${THEMES.sky.borderColor}" fill-opacity="0.45"`);
    expect(secondaryButton).toContain(`stroke="${THEMES.sky.borderColor}" stroke-width="1"`);
    expect(secondaryButton).not.toContain('opacity="0.82"');

    const splitPrimary = renderBadge({
      color: 'emerald',
      icon: 'pypi,arrow-right',
      label: 'pypi',
      value: 'v2.4.0',
      variant: '1',
    });
    expect(splitPrimary).toContain(`stroke="${BASE_DARK.borderNeutral}"`);
    expect(splitPrimary).toContain('A 5 4 0 0 0');
    expect(splitPrimary).toContain(`fill="${THEMES.emerald.emphasisBg}"`);
    expect(splitPrimary).toContain(`stroke="${THEMES.emerald.emphasisRing}"`);
    expect(splitPrimary).toContain(`fill="${THEMES.emerald.iconColor}">`);
    expect(splitPrimary).toContain(
      'stroke="#ffffff" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" opacity="0.82"'
    );

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
    const tertiaryButton = renderButton({
      color: 'rose',
      icon: 'bug',
      label: 'Report Issue',
      variant: '3',
    });
    expect(tertiaryBadge).toContain(`fill="${BASE_DARK.textMuted}" class="txt"`);
    expect(tertiaryBadge).not.toContain('A 5 4 0 0 0');
    expect(tertiaryButton).toContain(`fill="${BASE_DARK.textMuted}" class="btn-txt-30"`);
    expect(tertiaryButton).not.toContain('.txt {');
    expect(tertiaryButton).not.toContain('.val {');
    expect(tertiaryButton).toContain('A 8 7 0 0 0');
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
    expect(sheenLucideSvg).not.toContain('<animateTransform');

    const sheenSimpleSvg = renderIcon({
      anim: 'sheen',
      color: 'orange',
      icon: 'cloudflare',
      size: 24,
    });
    expect(sheenSimpleSvg).toContain('linearGradient id="icon-sheen-cloudflare-orange-24"');
    expect(sheenSimpleSvg).toContain('fill="url(#icon-sheen-cloudflare-orange-24)"');

    const staticHeartSvg = renderIcon({ color: 'rose', icon: 'heart-handshake' });
    expect(staticHeartSvg).not.toContain('<animateTransform');

    const pulseIconSvg = renderIcon({ anim: 'auto', color: 'rose', icon: 'heart-handshake' });
    expect(pulseIconSvg).toContain('type="scale" values="1;1;1.18;0.96;1.14;1;1"');

    const floatIconSvg = renderIcon({ anim: 'auto', color: 'emerald', icon: 'package' });
    expect(floatIconSvg).toContain('type="translate" values="0 0;0 -1.5;0 0;0 1.2;0 0"');

    const animatedIconSvg = renderIcon({ anim: 'auto', color: 'teal', icon: 'refresh-cw' });
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

describe('renderDocsHtml & renderHomeHtml', () => {
  it('renders the homepage and all 7 dedicated documentation subpages containing all variants, service registries, and syntax-highlighted Markdown snippets', () => {
    const homeHtml = renderHomeHtml();
    const badgesHtml = renderDocsHtml('badges');
    const buttonsHtml = renderDocsHtml('buttons');
    const servicesHtml = renderDocsHtml('services');
    const iconsHtml = renderDocsHtml('icons');
    const stackHtml = renderDocsHtml('stack');
    const quotesHtml = renderDocsHtml('quotes');
    const colorsHtml = renderDocsHtml('colors');

    for (const html of [
      homeHtml,
      badgesHtml,
      buttonsHtml,
      servicesHtml,
      iconsHtml,
      stackHtml,
      quotesHtml,
      colorsHtml,
    ]) {
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).not.toContain('<span>');
      expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(html).toContain(
        'Missing a public API service, vector icon, or even a whole new SVG element?'
      );
    }

    expect(badgesHtml).toContain(
      '<code class="card-title-code">variant=1</code><span class="card-title-text">Primary Badge</span><span class="card-title-pill">Default</span>'
    );
    expect(buttonsHtml).toContain(
      '<code class="card-title-code">variant=3</code><span class="card-title-text">Tertiary Button</span>'
    );
    expect(servicesHtml).toContain(
      '<span class="card-title-text">PyPI &amp; ClickPy</span><code class="card-title-meta">/badge/pypi/:pkg/:metric</code>'
    );
    expect(servicesHtml).toContain(
      '<span class="card-title-text">npm Registry</span><code class="card-title-meta">/badge/npm/:pkg/:metric</code>'
    );
    expect(servicesHtml).toContain(
      '<span class="card-title-text">Open VSX Registry</span><code class="card-title-meta">/badge/ovsx/:owner/:ext/:metric</code>'
    );
    expect(servicesHtml).toContain(
      '<span class="card-title-text">Crates.io &amp; Docker Hub</span><code class="card-title-meta">/badge/crates/*</code><code class="card-title-meta">/badge/docker/*</code>'
    );
    expect(iconsHtml).toContain('svg.xul.is/icon/:icon');
    expect(stackHtml).toContain('svg.xul.is/stack/:groups');
    expect(quotesHtml).toContain('svg.xul.is/quote/:author/:text');
    expect(colorsHtml).toContain('22 Tailwind v4 OKLCH Theme Colors');
  });
});
