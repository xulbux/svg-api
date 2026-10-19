/**
 * SSOT SVG renderer tests – Variants 1..3, CTA buttons, standalone icons, tech stack grids, quote cards, Kumo 3D crescents, micro-animations, and special elements (`src/svg/`).
 */

import { describe, expect, it } from 'vitest';
import { BASE_DARK, DOT_COLORS, THEMES } from '@/config/theme';
import { renderDocsHtml, renderHomeHtml } from '@/preview/page';
import { renderSvgPath } from '@/routes/svg';
import { resolveIcon } from '@/svg/icons';
import { renderQuote } from '@/svg/quote';
import {
  ICON_SIZE_RANGE,
  ICON_STROKE_RANGE,
  MAX_LABEL_LENGTH,
  renderBadge,
  renderButton,
  renderIcon,
} from '@/svg/renderer';
import { escapeXml, prepareDisplayText } from '@/svg/shared';
import { STACK_GROUP_GAP_RANGE, renderStack } from '@/svg/stack';
import type { BadgeSpecialElement, BadgeVariant } from '@/types';

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches the `aria-label` attribute of a rendered SVG. */
const ARIA_LABEL_RX = /aria-label="(?<label>[^"]*)"/;

/** Matches a lone (unpaired) UTF-16 surrogate code unit. */
const LONE_SURROGATE_RX = /\p{Cs}/u;

/** Matches the translucent 3D top crescent `<path>` of a secondary (`0.45`) or tertiary (`0.045`) surface. */
const DARK_SURFACE_CRESCENT_RX =
  /<path d="(?<path>M [^"]+)" fill="[^"]+" fill-opacity="(?:0\.45|0\.045)"/;

// -------------------------------------- INTERNALS --------------------------------------

/** Extract the `aria-label` attribute of a rendered SVG. */
function extractAriaLabel(svg: string): string {
  return ARIA_LABEL_RX.exec(svg)?.groups?.label ?? '';
}

/** Extract the `d` attribute of the 3D top crescent of a secondary or tertiary surface. */
function readTopCrescentPath(svg: string): string {
  return DARK_SURFACE_CRESCENT_RX.exec(svg)?.groups?.path ?? '';
}

/** Render a secondary cyan badge with a `delta:` special element. */
function renderDeltaBadge(value: string): string {
  return renderBadge({
    color: 'cyan',
    label: 'delta',
    special: { type: 'delta', value },
    variant: '2',
  });
}

/** Render a default horizontal quote card with a short text and the given author. */
function renderAuthorQuote(author: string): string {
  return renderQuote({ author, color: 'indigo', text: 'Short quote.' });
}

/** Compute the rightmost ink X coordinate of all translated text `<path>` outlines in an SVG. */
function measureMaxTextInkX(svg: string): number {
  let maxInkX = 0;
  for (const match of svg.matchAll(
    /<path transform="translate\((?<x>[\d.-]+) [\d.-]+\)" d="(?<d>[^"]+)"/g
  )) {
    const coordinates = (match.groups?.d ?? '').replaceAll(/[A-Z]/g, ' ').trim().split(/\s+/);
    for (let i = 0; i < coordinates.length; i += 2) {
      maxInkX = Math.max(maxInkX, Number(match.groups?.x) + Number(coordinates[i]));
    }
  }
  return maxInkX;
}

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
    expect(deltaSvg).toContain(`stroke="${THEMES.emerald.accentText}"`);
    expect(deltaSvg).toContain(`fill="${THEMES.emerald.accentText}" />`);
    expect(deltaSvg).not.toContain('<text');
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
    expect(iconOnlyBadge).not.toContain('<text');

    const dotOnlyBadge = renderBadge({ color: 'emerald', dot: 'green', label: '', variant: '2' });
    expect(dotOnlyBadge).toContain('width="25"');
    expect(dotOnlyBadge).toContain('cx="12.5"');

    const noIconButton = renderButton({ color: 'amber', label: 'Get Started', variant: '1' });
    const widthMatch = /width="(?<total>\d+)"/.exec(noIconButton);
    const totalWidth = Number(widthMatch?.groups?.total);
    expect(totalWidth).toBeGreaterThan(80);
    expect(noIconButton).toContain('aria-label="Get Started"');
    expect(noIconButton).not.toContain('<text');

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

  it('applies tapering Kumo upper-edge crescent on all 3 button and badge variants (1, 2, 3), and uses muted carbon-gray text on variant=3', () => {
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
    expect(secondaryBadge).toContain('A 5 4 0 0 0');
    expect(secondaryBadge).toContain(`fill="${THEMES.cyan.borderColor}" fill-opacity="0.45"`);

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
    expect(tertiaryBadge).toContain(`fill="${BASE_DARK.textMuted}" />`);
    expect(tertiaryBadge).toContain('A 5 4 0 0 0');
    expect(tertiaryBadge).toContain('fill="#ffffff" fill-opacity="0.045"');
    expect(tertiaryButton).toContain(`fill="${BASE_DARK.textMuted}" />`);
    expect(tertiaryButton).not.toContain('<style>');
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
    expect(sheenLucideSvg).toContain('linearGradient id="icon-sheen"');
    expect(sheenLucideSvg).toContain('values="-58;58;58"');
    expect(sheenLucideSvg).toContain('values="-32;84;84"');
    expect(sheenLucideSvg).toContain('stop-opacity="0.45"');
    expect(sheenLucideSvg).toContain('stroke="url(#icon-sheen)"');
    expect(sheenLucideSvg).not.toContain('gradientTransform');
    expect(sheenLucideSvg).not.toContain('<animateTransform');

    const sheenSimpleSvg = renderIcon({
      anim: 'sheen',
      color: 'orange',
      icon: 'cloudflare',
      size: 24,
    });
    expect(sheenSimpleSvg).toContain('linearGradient id="icon-sheen"');
    expect(sheenSimpleSvg).toContain('fill="url(#icon-sheen)"');

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
    expect(quoteSvgV2).toContain('— XulbuX');
    expect(quoteSvgV2).not.toContain('<text');
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
    expect(verticalQuoteSvgV1).toContain('fill="url(#grad-blue)"');
    expect(verticalQuoteSvgV1).toContain('fill="#ffffff"');
    expect(verticalQuoteSvgV1).toContain('rotate(180 12 12)');
    expect(verticalQuoteSvgV1).toContain('fill="rgba(255, 255, 255, 0.82)" />');
    expect(verticalQuoteSvgV1).toContain('— XulbuX');
    expect(verticalQuoteSvgV1).not.toContain('<text');

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
    expect(iconsHtml).toContain('<span class="route-path">/icon/:icon</span>');
    expect(stackHtml).toContain('<span class="route-path">/stack/:groups</span>');
    expect(quotesHtml).toContain('<span class="route-path">/quote/:author/:text</span>');
    expect(colorsHtml).toContain('22 Tailwind v4 OKLCH Theme Colors');
  });
});

describe('rendering regressions', () => {
  it('marks truncated quotes with an ellipsis and shortens over-long words (regression: silent cut-off and overflow)', () => {
    const longText = Array.from({ length: 200 }, (_, index) => `word${index}`).join(' ');
    const truncatedSvg = renderQuote({ color: 'indigo', text: longText, width: 240 });
    const ariaLabel = extractAriaLabel(truncatedSvg);
    expect(ariaLabel.endsWith('…')).toBe(true);
    expect(ariaLabel).not.toContain('word199');

    const longWordSvg = renderQuote({
      color: 'indigo',
      text: `${'a'.repeat(400)} end`,
      width: 240,
    });
    const longWordLabel = extractAriaLabel(longWordSvg);
    expect(longWordLabel).toContain('…');
    expect(longWordLabel.length).toBeLessThan(200);
  });

  it('keeps horizontal quote lines including their quote marks inside the text column (regression: marks overflowed into the watermark)', () => {
    const width = 260;
    const svg = renderQuote({
      color: 'indigo',
      text: `Supercalifragilisticexpialidocious${'a'.repeat(60)} end of the quote text here`,
      width,
    });
    // Text column: starts at x = 34 and is `width - (padX + 42)` wide (`padX = 36` at the `md` size).
    const textColumnRight = 34 + (width - (36 + 42));
    const maxInkX = measureMaxTextInkX(svg);
    expect(maxInkX).toBeGreaterThan(100);
    expect(maxInkX).toBeLessThanOrEqual(textColumnRight + 0.5);
  });

  it('truncates overlong quote author lines to the text column (regression: author overflowed the card)', () => {
    const width = 260;
    const author = 'An Extraordinarily Long Author Name That Never Fits Into The Card';
    const horizontalSvg = renderQuote({ author, color: 'indigo', text: 'Short quote.', width });
    expect(extractAriaLabel(horizontalSvg).endsWith('…')).toBe(true);
    expect(measureMaxTextInkX(horizontalSvg)).toBeLessThanOrEqual(34 + (width - (36 + 42)) + 0.5);

    const verticalSvg = renderQuote({
      author,
      color: 'indigo',
      layout: 'vertical',
      text: 'Short quote.',
      width,
    });
    expect(extractAriaLabel(verticalSvg).endsWith('…')).toBe(true);
    expect(measureMaxTextInkX(verticalSvg)).toBeLessThanOrEqual(width - 36);
  });

  it('caps quote text at 1000 characters with an ellipsis (regression: unbounded text length)', () => {
    const svg = renderQuote({ color: 'indigo', text: 'x'.repeat(5000), width: 900 });
    expect(extractAriaLabel(svg).length).toBeLessThan(1000);
    expect(extractAriaLabel(svg).endsWith('…')).toBe(true);
  });

  it('clamps derived defaults into their documented ranges (regression: fallbacks skipped clamping)', () => {
    // `gap = 24` derives `groupGap = 78`, which must clamp to the `64px` maximum.
    expect(renderStack({ gap: 24, icons: ['rust|go'] })).toContain('width="148"');
    // `gap = 2` derives `groupGap = 7`, which must clamp to the `8px` minimum.
    expect(renderStack({ gap: 2, icons: ['rust|go'] })).toContain('width="92"');
    // `size = 28` derives a `1045px` default width, which must clamp to the `900px` maximum.
    expect(renderQuote({ color: 'indigo', size: 28, text: 'Clamped.' })).toContain('width="900"');
  });

  it('draws flat sparklines through the vertical center instead of the bottom edge', () => {
    const flatSvg = renderBadge({
      color: 'indigo',
      label: 'flat',
      special: { type: 'sparkline', values: [5, 5, 5] },
      value: '5',
      variant: '2',
    });
    const linePoints = /<polyline points="(?<points>[^"]+)"/.exec(flatSvg)?.groups?.points ?? '';
    for (const point of linePoints.split(' ')) {
      expect(point.endsWith(',11.0')).toBe(true);
    }
  });

  it('applies the first motion of a per-icon pair to standalone icons (regression: pairs were ignored)', () => {
    const pairSvg = renderIcon({ anim: 'nudge,shake', color: 'indigo', icon: 'rocket' });
    expect(pairSvg).toContain('type="translate" values="0 0;0 0;1.8 -1.8;0 0;0 0"');
  });

  it('never interpolates the icon slug into the sheen gradient ID (regression: SVG injection via /icon/:icon?anim=sheen)', () => {
    const maliciousSlug = 'x"><script>alert(1)</script><g id="';
    const svg = renderIcon({ anim: 'sheen', color: 'indigo', icon: maliciousSlug });
    expect(svg).not.toContain('<script');
    expect(svg).toContain('<linearGradient id="icon-sheen"');
    expect(svg).toContain('url(#icon-sheen)');
    expect(svg).toContain(`aria-label="${escapeXml(maliciousSlug.toLowerCase())}"`);
  });

  it('compensates the Devicon coordinate scale in the standalone sheen gradient (regression: band was 5x too narrow)', () => {
    const deviconSvg = renderIcon({ anim: 'sheen', color: 'blue', icon: 'typescript' });
    expect(deviconSvg).toContain('<linearGradient id="icon-sheen-s5333"');
    expect(deviconSvg).toContain('gradientTransform="scale(5.3333)"');
    expect(deviconSvg).toContain('fill="url(#icon-sheen-s5333)"');
  });

  it('gives differently laid out stacks with equal size different sheen clip IDs (regression: duplicate IDs with different content)', () => {
    const clipIdRx = /clipPath id="(?<id>[^"]+)"/;
    const leftHeavySvg = renderStack({ anim: 'sheen', icons: ['rust,go,ts|py'] });
    const rightHeavySvg = renderStack({ anim: 'sheen', icons: ['rust|go,ts,py'] });
    expect(leftHeavySvg).toContain('width="210" height="42"');
    expect(rightHeavySvg).toContain('width="210" height="42"');
    const leftHeavyId = clipIdRx.exec(leftHeavySvg)?.groups?.id;
    expect(leftHeavyId).toMatch(/^stack-sheen-clip-210-42-/);
    expect(leftHeavyId).not.toBe(clipIdRx.exec(rightHeavySvg)?.groups?.id);
    expect(renderStack({ anim: 'sheen', icons: ['rust,go,ts|py'] })).toContain(
      `id="${leftHeavyId}"`
    );
  });

  it('strips XML-illegal control characters from aria-labels and titles (regression: ill-formed SVG)', () => {
    const badgeSvg = renderBadge({
      color: 'indigo',
      label: 'a\u0001b',
      value: 'c\u001Fd',
      variant: '2',
    });
    expect(extractAriaLabel(badgeSvg)).toBe('a b: c d');
    expect(badgeSvg.includes('\u0001') || badgeSvg.includes('\u001F')).toBe(false);
    expect(escapeXml('tab\there\nnew\u0000line\uFFFF')).toBe('tab\there\nnewline');
    expect(escapeXml('lone \uD800 surrogate 😀')).toBe('lone  surrogate 😀');
  });

  it('renders control and invisible format characters as spaces (regression: Geist drew them as .notdef boxes)', () => {
    const spacedBadge = renderBadge({ color: 'indigo', label: 'a b', value: 'c d', variant: '2' });
    for (const separator of ['\n', '\t', '\u200B', '\u0000\u00AD']) {
      const badgeSvg = renderBadge({
        color: 'indigo',
        label: `a${separator}b`,
        value: `c${separator}d`,
        variant: '2',
      });
      expect(badgeSvg, JSON.stringify(separator)).toBe(spacedBadge);
    }
    expect(prepareDisplayText('x\r\n\u2060y', 10)).toBe('x y');
  });

  it('caps badge and button labels, values, and delta readouts at 128 characters without splitting surrogate pairs (regression: unbounded text length)', () => {
    const longBadge = renderBadge({
      color: 'indigo',
      label: 'a'.repeat(5000),
      special: { type: 'delta', value: `+${'9'.repeat(5000)}%` },
      value: 'b'.repeat(5000),
      variant: '2',
    });
    const [labelPart, valuePart] = extractAriaLabel(longBadge).split(': ');
    expect(labelPart).toHaveLength(MAX_LABEL_LENGTH);
    expect(labelPart.endsWith('…')).toBe(true);
    expect(valuePart).toHaveLength(MAX_LABEL_LENGTH);
    expect(Number(/width="(?<width>\d+)"/.exec(longBadge)?.groups?.width)).toBeLessThan(3000);

    const emojiButton = renderButton({
      color: 'indigo',
      label: `${'a'.repeat(MAX_LABEL_LENGTH - 2)}😀${'b'.repeat(10)}`,
      variant: '1',
    });
    expect(LONE_SURROGATE_RX.test(extractAriaLabel(emojiButton))).toBe(false);
    expect(extractAriaLabel(emojiButton)).toBe(`${'a'.repeat(MAX_LABEL_LENGTH - 2)}…`);
  });

  it('draws only the track for a 0% ring (regression: a round line cap drew a dot)', () => {
    const emptyRingSvg = renderBadge({
      color: 'sky',
      label: 'quota',
      special: { type: 'ring', value: 0 },
      value: '0%',
      variant: '2',
    });
    expect(emptyRingSvg).toContain('r="4.5"');
    expect(emptyRingSvg).not.toContain('stroke-dasharray');
  });

  it('treats every zero-valued delta as flat (regression: "-0%" showed a red arrow, "0.0%" a green one)', () => {
    for (const value of ['0', '0%', '+0%', '-0%', '0.0%', '+0', '0.00']) {
      const svg = renderBadge({
        color: 'cyan',
        label: 'delta',
        special: { type: 'delta', value },
        variant: '2',
      });
      expect(svg, value).toContain(`stroke="${BASE_DARK.textMuted}"`);
    }
    const negativeSvg = renderBadge({
      color: 'cyan',
      label: 'delta',
      special: { type: 'delta', value: '-3%' },
      variant: '2',
    });
    expect(negativeSvg).toContain(`stroke="${THEMES.rose.accentText}"`);
  });

  it('reserves no width for an empty strip (regression: 3px phantom compartment)', () => {
    const plainSvg = renderBadge({ color: 'indigo', label: 'uptime', variant: '2' });
    const emptyStripSvg = renderBadge({
      color: 'indigo',
      label: 'uptime',
      special: { states: [], type: 'strip' },
      variant: '2',
    });
    expect(emptyStripSvg).toBe(plainSvg);
  });

  it('names icon-only badges after the first visible icon (regression: aria-label="none" for icon=none,<slug>)', () => {
    expect(
      extractAriaLabel(
        renderBadge({ color: 'indigo', icon: 'none,github', label: '', variant: '1' })
      )
    ).toBe('github');
  });

  it('centers stack tile icons by their visible ink bounds instead of the 24x24 box', () => {
    const svg = renderStack({ icons: ['rust'], size: 56 });
    const transform = /translate\((?<x>[\d.]+), [\d.]+\) scale\((?<scale>[\d.]+)\)/.exec(
      svg
    )?.groups;
    const iconData = resolveIcon('rust', true);
    expect(transform).toBeDefined();
    expect(iconData).toBeDefined();
    const visualCenterX =
      Number(transform?.x) +
      (((iconData?.minX ?? 0) + (iconData?.maxX ?? 0)) / 2) * Number(transform?.scale);
    expect(visualCenterX).toBeCloseTo(28, 1);
  });

  it('never emits NaN for extreme or non-finite widget values (regression: 1e308 sparklines and Infinity gauges)', () => {
    const svgs = [
      renderBadge({
        color: 'sky',
        label: 'spark',
        special: { type: 'sparkline', values: [1e308, -1e308, 5] },
        variant: '2',
      }),
      renderBadge({
        color: 'sky',
        label: 'spark',
        special: { type: 'sparkline', values: [Number.NaN, 3, Number.POSITIVE_INFINITY, 4] },
        variant: '1',
      }),
      renderBadge({
        color: 'sky',
        label: 'bar',
        special: { type: 'bar', value: Number.POSITIVE_INFINITY },
        variant: '2',
      }),
      renderBadge({
        color: 'sky',
        label: 'ring',
        special: { type: 'ring', value: Number.NaN },
        variant: '2',
      }),
    ];
    for (const svg of svgs) {
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('Infinity');
    }
    expect(svgs[2]).toContain('width="32" height="6"');
  });

  it('treats ?anim=none,none like none (regression: dots, strips, and bars kept animating)', () => {
    const specials: BadgeSpecialElement[] = [
      { states: ['9', '8'], type: 'strip' },
      { type: 'bar', value: 50 },
    ];
    for (const special of specials) {
      const staticSvg = renderBadge({
        anim: 'none,none',
        color: 'emerald',
        dot: 'green',
        label: 'status',
        special,
        variant: '2',
      });
      expect(staticSvg, special.type).not.toContain('<animate');
    }
  });

  it('renders non-numeric deltas flat and classifies suffixed or Unicode-minus deltas by sign (regression: "n/a" showed a green up arrow)', () => {
    expect(renderDeltaBadge('n/a')).toContain(`stroke="${BASE_DARK.textMuted}"`);
    expect(renderDeltaBadge('+12 stars')).toContain(`stroke="${THEMES.emerald.accentText}"`);
    expect(renderDeltaBadge('\u22125%')).toContain(`stroke="${THEMES.rose.accentText}"`);
    expect(renderDeltaBadge('  +5%  ')).toBe(renderDeltaBadge('+5%'));
  });

  it('references the standalone icon body once for the sheen pass (regression: body inlined twice, duplicating IDs)', () => {
    const iconData = resolveIcon('rocket');
    const svg = renderIcon({ anim: 'sheen', color: 'violet', icon: 'rocket' });
    expect(iconData).toBeDefined();
    expect(svg.split(iconData?.innerSvg ?? '').length - 1).toBe(1);
    expect(svg).toContain('<use href="#icon-body" stroke="url(#icon-sheen)" />');
  });

  it('emits each stack icon body once and references it per tile (regression: 128 large brand tiles produced a ~6.9 MB SVG)', () => {
    const iconData = resolveIcon('elsevier', true);
    const svg = renderStack({ icons: Array.from({ length: 128 }, () => 'elsevier') });
    expect(iconData).toBeDefined();
    expect(svg.split(iconData?.innerSvg ?? '').length - 1).toBe(1);
    expect(svg.split('<use href="#stack-icon-0" />').length - 1).toBe(128);
    expect(svg.length).toBeLessThan(200_000);
  });

  it('draws the 3D top crescent of split secondary badges on the right capsule only, like split primary badges', () => {
    const splitSecondary = readTopCrescentPath(
      renderBadge({ color: 'cyan', label: 'arch', value: 'hyprland', variant: '2' })
    );
    const splitTertiary = readTopCrescentPath(
      renderBadge({ color: 'cyan', label: 'arch', value: 'hyprland', variant: '3' })
    );
    const singleSecondary = readTopCrescentPath(
      renderBadge({ color: 'cyan', label: 'arch', variant: '2' })
    );

    // Square-left crescent (`M <x> 1 H …`) starting just right of the divider.
    expect(splitSecondary).toMatch(/^M [\d.]+ 1 H/);
    expect(Number.parseFloat(splitSecondary.slice(2))).toBeGreaterThan(20);
    // Rounded-left crescents spanning the whole badge (`M 1 <cornerY> A …`).
    expect(splitTertiary).toMatch(/^M 1 [\d.]+ A/);
    expect(singleSecondary).toMatch(/^M 1 [\d.]+ A/);
  });

  it('caps the quote author before ink-measuring it (regression: 1000-character authors cost ~26 ms of CPU)', () => {
    expect(renderAuthorQuote('W'.repeat(1000))).toBe(renderAuthorQuote('W'.repeat(400)));
    expect(extractAriaLabel(renderAuthorQuote('Ada'))).toBe('Short quote. — Ada');
  });
});

describe('documentation drift guards', () => {
  it('throws for documented paths that match no SVG route instead of rendering a broken snippet', () => {
    expect(() => renderSvgPath('/nope/example')).toThrow('No SVG route matches');
    expect(renderSvgPath('/badge//100%25?icon=zap')).toContain('aria-label="100%"');
  });

  it('documents the exact numeric ranges enforced by the renderers', () => {
    const iconsHtml = renderDocsHtml('icons');
    expect(iconsHtml).toContain(
      `${ICON_SIZE_RANGE.min}<span class="param-sep"> to </span>${ICON_SIZE_RANGE.max}`
    );
    expect(iconsHtml).toContain(`${ICON_STROKE_RANGE.default}</code>`);
    const stackHtml = renderDocsHtml('stack');
    expect(stackHtml).toContain(
      `${STACK_GROUP_GAP_RANGE.min}<span class="param-sep"> to </span>${STACK_GROUP_GAP_RANGE.max}`
    );
  });
});
