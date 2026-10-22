/**
 * SSOT SVG renderer tests – Variants 1..3, CTA buttons, standalone icons, tech stack grids, quote cards, Kumo 3D crescents, micro-animations, and special elements (`src/svg/`).
 */

import { describe, expect, it } from 'vitest';
import { BASE_DARK, DOT_COLORS, THEMES } from '@/config/theme';
import { renderSvgPath } from '@/routes/svg';
import { renderDocsHtml, renderHomeHtml } from '@/site/pages';
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
import { escapeXml, prepareDisplayText, sliceAtCodePoint } from '@/svg/shared';
import { resolveStackIconColor, STACK_GROUP_GAP_RANGE, renderStack } from '@/svg/stack';
import {
  MAX_TYPING_LINES,
  renderTyping,
  TYPING_DURATION_RANGE,
  TYPING_FONT_SIZE_RANGE,
  TYPING_PAUSE_RANGE,
  TYPING_WIDTH_RANGE,
} from '@/svg/typing';
import type {
  AnimationMode,
  BadgeSpecialElement,
  BadgeVariant,
  SizePreset,
  StripTickState,
  TypingCursor,
  TypingEraseMode,
  TypingLayout,
} from '@/types';
import { extractAriaLabel } from './helpers';

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a lone (unpaired) UTF-16 surrogate code unit. */
const LONE_SURROGATE_RX = /\p{Cs}/u;

/** Matches the translucent 3D top crescent `<path>` of a secondary (`0.45`) or tertiary (`0.045`) surface. */
const DARK_SURFACE_CRESCENT_RX =
  /<path d="(?<path>M [^"]+)" fill="[^"]+" fill-opacity="(?:0\.45|0\.045)"/;

/** Matches every `<use href="#…">` reference and captures the referenced ID. */
const USE_HREF_RX = /<use href="#(?<id>[^"]+)"/g;

/** Matches the watermark quote mark group of a horizontal quote card and captures its X offset and scale. */
const WATERMARK_TRANSFORM_RX =
  /<g transform="translate\((?<x>[\d.]+), [\d.]+\) scale\((?<scale>[\d.]+)\)" fill="none" stroke="[^"]+" stroke-opacity/;

/** Matches the `id` attribute of a `<clipPath>` element and captures its value. */
const CLIP_PATH_ID_RX = /clipPath id="(?<id>[^"]+)"/;

// -------------------------------------- INTERNALS --------------------------------------

/** Extract the `d` attribute of the 3D top crescent of a secondary or tertiary surface. */
function readTopCrescentPath(svg: string): string {
  return DARK_SURFACE_CRESCENT_RX.exec(svg)?.groups?.path ?? '';
}

/** Collect the distinct IDs referenced via `<use href="#…">` in an SVG. */
function collectUseIds(svg: string): Set<string> {
  const ids = new Set<string>();
  for (const match of svg.matchAll(USE_HREF_RX)) {
    ids.add(match.groups?.id ?? '');
  }
  return ids;
}

/** Render a secondary sky `metric` badge with a special element and read its `aria-label`. */
function readMetricBadgeLabel(special: BadgeSpecialElement, value?: string): string | undefined {
  return extractAriaLabel(
    renderBadge({ color: 'sky', label: 'metric', special, value, variant: '2' })
  );
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
    expect(dualIconNudgeSvg.match(/<animateTransform/g) ?? []).toHaveLength(1);

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
    expect(stripSvg).toContain('fill="#00D294"');
    expect(stripSvg).toContain('fill="#9AE600"');
    expect(stripSvg).toContain('fill="#FDC700"');
    expect(stripSvg).toContain('fill="#FF8904"');
    expect(stripSvg).toContain('fill="#FF4D6D"');

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
    expect(dualIconBadge.match(/scale\(0\.5417\)/g) ?? []).toHaveLength(2);

    const rightOnlyButton = renderButton({
      color: 'emerald',
      icon: 'none,chevron-right',
      label: 'Continue',
      variant: '1',
    });
    expect(rightOnlyButton.match(/scale\(0\.625\)/g) ?? []).toHaveLength(1);
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
      'stroke="#FFFFFF" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"'
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
    expect(secondaryButton).not.toContain('opacity="0.85"');

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
      'stroke="#FFFFFF" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"'
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
    expect(tertiaryBadge).toContain('fill="#FFFFFF" fill-opacity="0.045"');
    expect(tertiaryButton).toContain(`fill="${BASE_DARK.textMuted}" />`);
    expect(tertiaryButton).not.toContain('<style>');
    expect(tertiaryButton).toContain('A 8 7 0 0 0');
    expect(tertiaryButton).toContain('fill="#FFFFFF" fill-opacity="0.045"');
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
    expect(floatIconSvg).toContain(
      'type="translate" values="0 0;0 -1.5;0 0;0 1.2;0 0" keyTimes="0;0.25;0.5;0.75;1" calcMode="spline" keySplines="0.36 0.66 0.64 1;0.36 0 0.64 0.34;0.36 0.66 0.64 1;0.36 0 0.64 0.34"'
    );

    const animatedIconSvg = renderIcon({ anim: 'auto', color: 'teal', icon: 'refresh-cw' });
    expect(animatedIconSvg).toContain('width="24" height="24"');
    expect(animatedIconSvg).toContain('type="rotate" from="0 12 12" to="360 12 12"');

    const turnIconSvg = renderIcon({ anim: 'turn', color: 'cyan', icon: 'compass' });
    expect(turnIconSvg).toContain('type="rotate" values="0 12 12;0 12 12;360 12 12"');

    const whirlIconSvg = renderIcon({ anim: 'whirl', color: 'indigo', icon: 'orbit' });
    expect(whirlIconSvg).toContain(
      'type="rotate" values="0 12 12;360 12 12" keyTimes="0;1" calcMode="spline" keySplines="0.42 0.15 0.58 0.85"'
    );

    const breatheIconSvg = renderIcon({ anim: 'breathe', color: 'orange', icon: 'flame' });
    expect(breatheIconSvg).toContain(
      'type="scale" values="1;1.14;1;0.92;1" keyTimes="0;0.25;0.5;0.75;1" calcMode="spline" keySplines="0.36 0.66 0.64 1;0.36 0 0.64 0.34;0.36 0.66 0.64 1;0.36 0 0.64 0.34"'
    );

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
    expect(stackSvgV1).toContain('fill="#FFFFFF"');

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
    expect(stackSvgV3).toContain('fill="#FFFFFF" fill-opacity="0.045"');
  });

  it('resolves automatic official brand colors across all bundled icon sets and supports per-tile icon@color overrides', () => {
    expect(resolveStackIconColor('supabase')).toBe('emerald');
    expect(resolveStackIconColor('prisma')).toBe('slate');
    expect(resolveStackIconColor('zig')).toBe('amber');
    expect(resolveStackIconColor('gleam')).toBe('fuchsia');
    expect(resolveStackIconColor('rust@amber')).toBe('amber');
    expect(resolveStackIconColor('cpu@emerald')).toBe('emerald');
    expect(resolveStackIconColor('rust@amber', 'sky')).toBe('amber');

    const perTileSvg = renderStack({
      color: 'slate',
      icons: ['rust@amber,cpu@emerald,go'],
      variant: '2',
    });
    expect(perTileSvg).toContain('<title>Rust</title>');
    expect(perTileSvg).toContain('<title>Cpu</title>');
    expect(perTileSvg).toContain('<title>Go</title>');
    expect(perTileSvg).toContain(`fill="${THEMES.amber.tintBg}"`);
    expect(perTileSvg).toContain(`fill="${THEMES.emerald.tintBg}"`);
    expect(perTileSvg).toContain(`fill="${THEMES.slate.tintBg}"`);

    const catalogTitlesSvg = renderStack({
      icons: ['unocss,nextdotjs,scikitlearn,n8n'],
      variant: '2',
    });
    expect(catalogTitlesSvg).toContain('<title>UnoCSS</title>');
    expect(catalogTitlesSvg).toContain('<title>Next.js</title>');
    expect(catalogTitlesSvg).toContain('<title>scikit-learn</title>');
    expect(catalogTitlesSvg).toContain('<title>n8n</title>');
    expect(extractAriaLabel(catalogTitlesSvg)).toBe(
      'tech stack: UnoCSS, Next.js, scikit-learn, n8n'
    );
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
    expect(verticalQuoteSvgV1).toContain('fill="#FFFFFF"');
    expect(verticalQuoteSvgV1).toContain('rotate(180 12 12)');
    expect(verticalQuoteSvgV1).toContain('fill="rgba(255,255,255,0.85)" />');
    expect(verticalQuoteSvgV1).toContain('— XulbuX');
    expect(verticalQuoteSvgV1).not.toContain('<text');

    const quoteSvgV3 = renderQuote({
      author: 'XulbuX',
      color: 'violet',
      text: 'Minimal tertiary quote card.',
      variant: '3',
    });
    expect(quoteSvgV3).toContain(`stroke="${BASE_DARK.borderNeutral}"`);
    expect(quoteSvgV3).toContain('fill="#FFFFFF" fill-opacity="0.045"');
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
      '<span class="card-title-text">Open VSX Registry</span><code class="card-title-meta">/badge/ovsx/:namespace/:ext/:metric</code>'
    );
    expect(servicesHtml).toContain(
      '<span class="card-title-text">Crates.io &amp; Docker Hub</span><code class="card-title-meta">/badge/crates/*</code><code class="card-title-meta">/badge/docker/*</code>'
    );
    expect(iconsHtml).toContain('<span class="route-method">GET</span>/icon/:icon</code>');
    expect(stackHtml).toContain('<span class="route-method">GET</span>/stack/:groups</code>');
    expect(quotesHtml).toContain(
      '<span class="route-method">GET</span>/quote/:author/:text</code>'
    );
    expect(colorsHtml).toContain('22 Tailwind v4 OKLCH Theme Colors');
  });
});

describe('rendering regressions', () => {
  it('marks truncated quotes with an ellipsis and shortens over-long words (regression: silent cut-off and overflow)', () => {
    const longText = Array.from({ length: 200 }, (_entry, index) => `word${index}`).join(' ');
    const truncatedSvg = renderQuote({ color: 'indigo', text: longText, width: 240 });
    const ariaLabel = extractAriaLabel(truncatedSvg) ?? '';
    expect(ariaLabel.endsWith('…')).toBe(true);
    expect(ariaLabel).not.toContain('word199');

    const longWordSvg = renderQuote({
      color: 'indigo',
      text: `${'a'.repeat(400)} end`,
      width: 240,
    });
    const longWordLabel = extractAriaLabel(longWordSvg) ?? '';
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
    // Text column (`md`): Starts at x = 38 and ends 16px left of the watermark ink (x = 217 + 2 * 1.05).
    const textColumnRight = 217 + 2.1 - 16;
    const maxInkX = measureMaxTextInkX(svg);
    expect(maxInkX).toBeGreaterThan(100);
    expect(maxInkX).toBeLessThanOrEqual(textColumnRight + 0.5);
  });

  it('never runs horizontal quote text under the watermark at any size (regression: md text reached x = 520, the watermark starts at x = 519)', () => {
    const sizes: (SizePreset | number)[] = ['sm', 'md', 'lg', 'xl', 11, 28];
    const variants: BadgeVariant[] = ['1', '2'];
    const text =
      'Every single word of this deliberately long quotation keeps wrapping across several lines of the card';
    for (const size of sizes) {
      for (const variant of variants) {
        const svg = renderQuote({
          author: 'A Long Author Name',
          color: 'indigo',
          size,
          text,
          variant,
        });
        const watermark = WATERMARK_TRANSFORM_RX.exec(svg)?.groups;
        expect(watermark, String(size)).toBeDefined();
        const watermarkInkLeft = Number(watermark?.x) + 2 * Number(watermark?.scale);
        expect(measureMaxTextInkX(svg), String(size)).toBeLessThan(watermarkInkLeft);
      }
    }
  });

  it('truncates overlong quote author lines to the text column (regression: author overflowed the card)', () => {
    const width = 260;
    const author = 'An Extraordinarily Long Author Name That Never Fits Into The Card';
    const horizontalSvg = renderQuote({ author, color: 'indigo', text: 'Short quote.', width });
    expect(extractAriaLabel(horizontalSvg)?.endsWith('…')).toBe(true);
    expect(measureMaxTextInkX(horizontalSvg)).toBeLessThanOrEqual(217 + 2.1 - 16 + 0.5);

    const verticalSvg = renderQuote({
      author,
      color: 'indigo',
      layout: 'vertical',
      text: 'Short quote.',
      width,
    });
    expect(extractAriaLabel(verticalSvg)?.endsWith('…')).toBe(true);
    expect(measureMaxTextInkX(verticalSvg)).toBeLessThanOrEqual(width - 36);
  });

  it('caps quote text at 1000 characters with an ellipsis (regression: unbounded text length)', () => {
    const svg = renderQuote({ color: 'indigo', text: 'x'.repeat(5000), width: 900 });
    expect(extractAriaLabel(svg)?.length).toBeLessThan(1000);
    expect(extractAriaLabel(svg)?.endsWith('…')).toBe(true);
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
    expect(svg).toContain(
      `aria-label="${escapeXml(`unknown icon: ${maliciousSlug.toLowerCase()}`)}"`
    );
  });

  it('compensates the Devicon coordinate scale in the standalone sheen gradient (regression: band was 5x too narrow)', () => {
    const deviconSvg = renderIcon({ anim: 'sheen', color: 'blue', icon: 'typescript' });
    expect(deviconSvg).toContain('<linearGradient id="icon-sheen-s5333"');
    expect(deviconSvg).toContain('gradientTransform="scale(5.3333)"');
    expect(deviconSvg).toContain('fill="url(#icon-sheen-s5333)"');
  });

  it('gives differently laid out stacks with equal size different sheen clip IDs (regression: duplicate IDs with different content)', () => {
    const leftHeavySvg = renderStack({ anim: 'sheen', icons: ['rust,go,ts|py'] });
    const rightHeavySvg = renderStack({ anim: 'sheen', icons: ['rust|go,ts,py'] });
    expect(leftHeavySvg).toContain('width="210" height="42"');
    expect(rightHeavySvg).toContain('width="210" height="42"');
    const leftHeavyId = CLIP_PATH_ID_RX.exec(leftHeavySvg)?.groups?.id;
    expect(leftHeavyId).toMatch(/^stack-sheen-clip-210-42-/);
    expect(leftHeavyId).not.toBe(CLIP_PATH_ID_RX.exec(rightHeavySvg)?.groups?.id);
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
    const [labelPart = '', rightPart = ''] = (extractAriaLabel(longBadge) ?? '').split(': ');
    const [deltaPart, valuePart] = rightPart.split(' ');
    expect(labelPart).toHaveLength(MAX_LABEL_LENGTH);
    expect(labelPart.endsWith('…')).toBe(true);
    expect(deltaPart).toHaveLength(MAX_LABEL_LENGTH);
    expect(valuePart).toHaveLength(MAX_LABEL_LENGTH);
    expect(Number(/width="(?<width>\d+)"/.exec(longBadge)?.groups?.width)).toBeLessThan(3000);

    const emojiButton = renderButton({
      color: 'indigo',
      label: `${'a'.repeat(MAX_LABEL_LENGTH - 2)}😀${'b'.repeat(10)}`,
      variant: '1',
    });
    expect(LONE_SURROGATE_RX.test(extractAriaLabel(emojiButton) ?? '')).toBe(false);
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

  it('treats ?anim=none,none and ?anim=sheen,none,none as disabled for dots, strips, and bars (regression: dots, strips, and bars kept animating)', () => {
    const specials: BadgeSpecialElement[] = [
      { states: ['9', '8'], type: 'strip' },
      { type: 'bar', value: 50 },
    ];
    for (const anim of ['none,none', 'sheen,none,none'] satisfies readonly AnimationMode[]) {
      for (const special of specials) {
        const staticSvg = renderBadge({
          anim,
          color: 'emerald',
          dot: 'green',
          label: 'status',
          special,
          variant: '2',
        });
        expect(staticSvg, `${anim} ${special.type}`).not.toContain('attributeName="r"');
        expect(staticSvg, `${anim} ${special.type}`).not.toContain('attributeName="opacity"');
        expect(staticSvg, `${anim} ${special.type}`).not.toContain('bar-shimmer');
      }
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
    expect(svg).toMatch(/<use href="#icon-body-[\da-z]+" stroke="url\(#icon-sheen\)" \/>/);
  });

  it('emits each stack icon body once and references it per tile (regression: 128 large brand tiles produced a ~6.9 MB SVG)', () => {
    const iconData = resolveIcon('elsevier', true);
    const svg = renderStack({ icons: Array.from({ length: 128 }, () => 'elsevier') });
    expect(iconData).toBeDefined();
    expect(svg.split(iconData?.innerSvg ?? '').length - 1).toBe(1);
    const [bodyId] = collectUseIds(svg);
    expect(collectUseIds(svg).size).toBe(1);
    expect(svg.split(`<use href="#${bodyId}" />`).length - 1).toBe(128);
    expect(svg.length).toBeLessThan(200_000);
  });

  it('content-addresses stack and standalone icon body IDs (regression: stack-icon-0 and icon-body collided across inlined SVGs)', () => {
    const rustStackIds = collectUseIds(renderStack({ icons: ['rust'] }));
    const goStackIds = collectUseIds(renderStack({ icons: ['go'] }));
    expect(rustStackIds.size).toBe(1);
    expect([...rustStackIds][0]).toMatch(/^stack-icon-[\da-z]+$/);
    expect([...rustStackIds][0]).not.toBe([...goStackIds][0]);
    expect(collectUseIds(renderStack({ icons: ['go', 'rust'] }))).toEqual(
      new Set([...goStackIds, ...rustStackIds])
    );

    const rocketIds = collectUseIds(renderIcon({ anim: 'sheen', color: 'indigo', icon: 'rocket' }));
    const zapIds = collectUseIds(renderIcon({ anim: 'sheen', color: 'indigo', icon: 'zap' }));
    expect([...rocketIds][0]).toMatch(/^icon-body-[\da-z]+$/);
    expect([...rocketIds][0]).not.toBe([...zapIds][0]);
    expect(collectUseIds(renderIcon({ anim: 'sheen', color: 'rose', icon: 'rocket' }))).toEqual(
      rocketIds
    );
  });

  it('describes special elements in badge aria-labels (regression: bars, rings, strips, deltas, and sparklines were silent)', () => {
    expect(readMetricBadgeLabel({ type: 'bar', value: 85 }, '85%')).toBe('metric: 85%');
    expect(readMetricBadgeLabel({ type: 'bar', value: 94 }, '150/160')).toBe('metric: 94% 150/160');
    expect(readMetricBadgeLabel({ type: 'ring', value: 74.6 })).toBe('metric: 75%');
    expect(readMetricBadgeLabel({ type: 'delta', value: '+14%' }, '142k')).toBe(
      'metric: +14% 142k'
    );
    expect(readMetricBadgeLabel({ states: ['9', '9', '0'], type: 'strip' })).toBe(
      'metric: 3 checks'
    );
    expect(readMetricBadgeLabel({ type: 'sparkline', values: [1, 3, 2] }, '44/8w')).toBe(
      'metric: trend 44/8w'
    );
    expect(readMetricBadgeLabel({ type: 'bars', values: [2, 5, 8, 6] }, '44/8w')).toBe(
      'metric: histogram 44/8w'
    );
    expect(readMetricBadgeLabel({ done: 4, total: 5, type: 'steps' }, '4/5')).toBe('metric: 4/5');
    expect(readMetricBadgeLabel({ done: 4, total: 5, type: 'steps' }, 'v2 rollout')).toBe(
      'metric: 4/5 v2 rollout'
    );
    // Sparklines and histograms with fewer than 2 points render nothing, so they are not announced either.
    expect(readMetricBadgeLabel({ type: 'sparkline', values: [1] })).toBe('metric');
    expect(readMetricBadgeLabel({ type: 'bars', values: [1] })).toBe('metric');
    expect(readMetricBadgeLabel({ done: 1, total: 0, type: 'steps' })).toBe('metric');
  });

  it('renders bars and steps inline widgets and clamps invalid or out-of-range inputs', () => {
    const barsSvg = renderBadge({
      color: 'cyan',
      label: 'commits',
      special: { type: 'bars', values: [2, 5, 8, 6, 9, 12] },
      value: '42/wk',
      variant: '2',
    });
    expect(barsSvg).toContain('aria-label="commits: histogram 42/wk"');
    expect(barsSvg).not.toContain('NaN');

    const flatBarsSvg = renderBadge({
      color: 'cyan',
      label: 'commits',
      special: { type: 'bars', values: [5, 5, 5] },
      variant: '1',
    });
    expect(flatBarsSvg).toContain('height="11"');

    const stepsSvg = renderBadge({
      color: 'emerald',
      label: 'phase',
      special: { done: 3, total: 5, type: 'steps' },
      value: '3/5',
      variant: '2',
    });
    expect(stepsSvg).toContain('aria-label="phase: 3/5"');
    expect(stepsSvg).toContain(`fill="${THEMES.emerald.accentText}"`);
    expect(stepsSvg).toContain('fill-opacity="0.22"');

    const clampedStepsSvg = renderBadge({
      color: 'emerald',
      label: 'phase',
      special: { done: 99, total: 5, type: 'steps' },
      variant: '1',
    });
    expect(clampedStepsSvg).toContain('aria-label="phase: 5/5"');
  });

  it('wraps default quote text on narrow cards and avoids double ellipses when truncating (regressions)', () => {
    const narrowDefaultQuote = renderQuote({ color: 'indigo', text: '', width: 220 });
    expect(measureMaxTextInkX(narrowDefaultQuote)).toBeLessThanOrEqual(220);

    const trailingEllipsisQuote = renderQuote({
      color: 'indigo',
      size: 'xl',
      text: `${'Long philosophical reflection on simplicity '.repeat(8)}and clarity…`,
      width: 240,
    });
    expect(extractAriaLabel(trailingEllipsisQuote)).not.toContain('……');
  });

  it('omits gauge percentages when the value already states one (regression: "coverage: 69% 69.4%")', () => {
    expect(readMetricBadgeLabel({ type: 'ring', value: 69.4 }, '69.4%')).toBe('metric: 69.4%');
    expect(readMetricBadgeLabel({ type: 'bar', value: 99.98 }, '99.98%')).toBe('metric: 99.98%');
    expect(readMetricBadgeLabel({ type: 'ring', value: 85 }, '8.5/10')).toBe('metric: 85% 8.5/10');
    expect(readMetricBadgeLabel({ type: 'delta', value: '+2%' }, '96%')).toBe('metric: +2% 96%');
  });

  it('names empty buttons "button" and unknown standalone icons after the fallback (regression: "badge" and the raw slug)', () => {
    expect(extractAriaLabel(renderButton({ color: 'indigo', label: '', variant: '1' }))).toBe(
      'button'
    );
    expect(extractAriaLabel(renderBadge({ color: 'indigo', label: '', variant: '1' }))).toBe(
      'badge'
    );
    expect(extractAriaLabel(renderIcon({ color: 'indigo', icon: 'no-such-icon' }))).toBe(
      'unknown icon: no-such-icon'
    );
    expect(extractAriaLabel(renderIcon({ color: 'indigo', icon: 'Rocket' }))).toBe('rocket');
  });

  it('builds stack aria-labels from the bounded tile titles (regression: raw, uncapped slugs)', () => {
    const svg = renderStack({ icons: ['ts', 'my-tool', `x${'y'.repeat(5000)}`] });
    const ariaLabel = extractAriaLabel(svg) ?? '';
    expect(ariaLabel.startsWith('tech stack: TypeScript, My Tool, Xyyy')).toBe(true);
    expect(ariaLabel.length).toBeLessThan(200);
    expect(svg.length).toBeLessThan(10_000);
    // Tiles beyond the 128-tile cap are dropped before any normalization.
    const cappedIcons = Array.from({ length: 128 }, (_entry, index) => `tool-${index}`);
    const overlongIcons = [...cappedIcons, ...Array.from({ length: 500 }, () => 'rust')];
    expect(renderStack({ groups: [[{ icons: overlongIcons }]] })).toBe(
      renderStack({ groups: [[{ icons: cappedIcons }]] })
    );
  });

  it('renders no special element for an empty or whitespace-only delta (regression: lone arrow without readout)', () => {
    const plainSvg = renderBadge({ color: 'cyan', label: 'delta', variant: '2' });
    expect(renderDeltaBadge('')).toBe(plainSvg);
    expect(renderDeltaBadge('  \u200B ')).toBe(plainSvg);
  });

  it('drops invalid strip tick states from upstream data (regression: prototype keys and junk ticks were drawn)', () => {
    const junkStates: StripTickState[] = JSON.parse('["9", "constructor", "x", "5"]');
    const junkSvg = renderBadge({
      color: 'emerald',
      label: 'uptime',
      special: { states: junkStates, type: 'strip' },
      variant: '1',
    });
    const cleanSvg = renderBadge({
      color: 'emerald',
      label: 'uptime',
      special: { states: ['9', '5'], type: 'strip' },
      variant: '1',
    });
    expect(junkSvg).toBe(cleanSvg);
    expect(junkSvg).not.toContain('undefined');
  });

  it('returns an empty prefix for non-positive slice ends (regression: negative ends sliced from the string end)', () => {
    expect(sliceAtCodePoint('abc', 0)).toBe('');
    expect(sliceAtCodePoint('abc', -1)).toBe('');
    expect(sliceAtCodePoint('a😀', 2)).toBe('a');
  });

  it('adds the escaped accessible label as the first-child <title> of every SVG (regression: no tooltip or title fallback)', () => {
    const svgs = [
      renderBadge({ color: 'indigo', label: 'a & b', value: '<1>', variant: '2' }),
      renderButton({ color: 'indigo', label: 'Go', variant: '1' }),
      renderIcon({ color: 'indigo', icon: 'rocket' }),
      renderStack({ icons: ['rust'] }),
      renderQuote({ color: 'indigo', text: 'Short quote.' }),
    ];
    for (const svg of svgs) {
      const label = extractAriaLabel(svg) ?? '';
      expect(label.length).toBeGreaterThan(0);
      expect(svg).toContain(`aria-label="${label}"><title>${label}</title>`);
    }
    expect(svgs[0]).toContain('<title>a &amp; b: &lt;1&gt;</title>');
  });

  it('routes the bar shimmer gradient into the root <defs> (regression: inline <defs> inside the badge body)', () => {
    const svg = renderBadge({
      color: 'emerald',
      label: 'coverage',
      special: { type: 'bar', value: 60 },
      variant: '2',
    });
    expect(svg.split('<defs>').length - 1).toBe(1);
    const rootDefs = /<defs>(?<defs>.*?)<\/defs>/.exec(svg)?.groups?.defs ?? '';
    expect(rootDefs).toContain('<linearGradient id="bar-shimmer-c"');
    expect(svg).toContain('fill="url(#bar-shimmer-c)"');
  });

  it('applies a single foreground alpha to flat delta arrows on primary capsules (regression: rgba 0.85 x opacity 0.82)', () => {
    const svg = renderBadge({
      color: 'cyan',
      label: 'delta',
      special: { type: 'delta', value: '0%' },
      variant: '1',
    });
    expect(svg).toContain('stroke="#FFFFFF" stroke-width="1.6"');
    expect(svg).toContain('opacity="0.85"><path d="M2 5H8');
    expect(svg).not.toContain('stroke="rgba(');
    expect(svg).toContain('fill="rgba(255,255,255,0.85)"');
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

  it('renders unmistakable red exclamation-mark placeholders with a translucent border across /stack, /icon, /badge, and /button even when color or variant is overridden', () => {
    const redStroke = `stroke="${THEMES.red.iconColor}"`;

    // Stack fallback tiles use a hollow transparent frame with a translucent red stroke and standalone red `!` icon.
    const stackSvg = renderStack({ color: 'emerald', icons: ['unknown-tool@amber'], variant: '1' });
    expect(stackSvg).toContain(
      '<g stroke-width="2.75"><path d="M12 3.5v10.5" /><path d="M12 19.5h.01" /></g>'
    );
    expect(stackSvg).not.toContain('<circle cx="12" cy="12" r="10"');
    expect(stackSvg).toContain(
      `<rect x="0.5" y="0.5" width="41" height="41" rx="9.5" ${redStroke} stroke-opacity="0.45" stroke-width="1" />`
    );
    expect(stackSvg).toContain(
      `fill="none" ${redStroke} stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"`
    );
    expect(stackSvg).not.toContain('url(#grad-');

    // Standalone unknown icons use the translucent-circle `!` placeholder in red regardless of `color`.
    const iconSvg = renderIcon({ color: 'sky', icon: 'unknown-tool' });
    expect(iconSvg).toContain(redStroke);
    expect(iconSvg).toContain('<circle cx="12" cy="12" r="10" stroke-opacity="0.45" />');
    expect(iconSvg).toContain('<path d="M12 7v5.5" /><path d="M12 16.5h.01" />');

    // Badges and buttons with unknown `?icon=` slugs render the red translucent-circle `!` placeholder instead of omitting the icon.
    const badgeSvg = renderBadge({
      color: 'emerald',
      icon: 'unknown-tool',
      label: 'build',
      value: 'ok',
      variant: '2',
    });
    expect(badgeSvg).toContain(redStroke);
    expect(badgeSvg).toContain('<circle cx="12" cy="12" r="10" stroke-opacity="0.45" />');
    expect(badgeSvg).toContain('<path d="M12 7v5.5" /><path d="M12 16.5h.01" />');

    const buttonSvg = renderButton({
      color: 'red',
      icon: 'unknown-tool',
      label: 'Deploy',
      variant: '1',
    });
    expect(buttonSvg).toContain(redStroke);
    expect(buttonSvg).toContain('<circle cx="12" cy="12" r="10" stroke-opacity="0.45" />');
    expect(buttonSvg).toContain(`<circle cx="12" cy="12" r="10" fill="${BASE_DARK.bgBottom}"`);
  });

  it('splits only the status dot into the dark left cap on primary label-only badges while keeping icons with the label and leaving secondary/tertiary unsplit', () => {
    // Primary (`variant=1`) label-only badge with left icon + dot (`[ • | ⚡ Test ]`):
    // Only the dot sits in the 25px dark left cap; `zap` and `Test` stay together on the primary right cap in white.
    const primaryLabelWithIconAndDot = renderBadge({
      color: 'amber',
      dot: 'green',
      icon: 'zap',
      label: 'Test',
      variant: '1',
    });
    expect(primaryLabelWithIconAndDot).toContain('fill="url(#bg-dark)"');
    expect(primaryLabelWithIconAndDot).toContain('fill="url(#grad-amber)"');
    expect(primaryLabelWithIconAndDot).toContain(`fill="${DOT_COLORS.green}"`);
    expect(primaryLabelWithIconAndDot).toContain('M 25 0 H');
    expect(primaryLabelWithIconAndDot).toContain(
      'stroke="#FFFFFF" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"'
    );
    expect(primaryLabelWithIconAndDot).not.toContain(`stroke="${THEMES.amber.iconColor}"`);
    expect(extractAriaLabel(primaryLabelWithIconAndDot)).toBe('Test');

    // Secondary (`variant=2`) and Tertiary (`variant=3`) label-only badges with a dot stay unsplit (no divider) and keep label text colors.
    const secondaryLabelWithDot = renderBadge({
      color: 'emerald',
      dot: 'emerald',
      label: 'Label',
      variant: '2',
    });
    expect(secondaryLabelWithDot).not.toContain('<line ');
    expect(secondaryLabelWithDot).toContain(`fill="${BASE_DARK.textPrimary}" />`);
    expect(secondaryLabelWithDot).not.toContain(`fill="${THEMES.emerald.accentText}" />`);

    const tertiaryLabelWithDot = renderBadge({
      color: 'emerald',
      dot: 'emerald',
      label: 'Label',
      variant: '3',
    });
    expect(tertiaryLabelWithDot).not.toContain('<line ');
    expect(tertiaryLabelWithDot).toContain(`fill="${BASE_DARK.textMuted}" />`);
    expect(tertiaryLabelWithDot).not.toContain(`fill="${THEMES.emerald.accentText}" />`);

    // Value-only badge (`/badge//Value?icon=zap&dot=green`) keeps both `[ • ⚡ ]` in the dark left cap (`leftWidth > 25`, colored icon).
    const valueOnlyWithIconAndDot = renderBadge({
      color: 'amber',
      dot: 'green',
      icon: 'zap',
      label: '',
      value: 'Value',
      variant: '1',
    });
    expect(valueOnlyWithIconAndDot).toContain(`stroke="${THEMES.amber.iconColor}"`);

    // Dot-only badge with no text or icons on `variant=1` uses the dark carbon surface instead of the primary gradient.
    const dotOnlyPrimaryBadge = renderBadge({ color: 'sky', dot: 'sky', label: '', variant: '1' });
    const dotOnlyTertiaryBadge = renderBadge({ color: 'sky', dot: 'sky', label: '', variant: '3' });
    expect(dotOnlyPrimaryBadge).toBe(dotOnlyTertiaryBadge);
    expect(dotOnlyPrimaryBadge).toContain(`fill="${DOT_COLORS.sky}"`);
    expect(dotOnlyPrimaryBadge).not.toContain('url(#grad-sky)');
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
    const typingHtml = renderDocsHtml('typing');
    for (const range of [
      TYPING_FONT_SIZE_RANGE,
      TYPING_DURATION_RANGE,
      TYPING_PAUSE_RANGE,
      TYPING_WIDTH_RANGE,
    ]) {
      expect(typingHtml).toContain(`${range.min}<span class="param-sep"> to </span>${range.max}`);
    }
  });
});

describe('renderTyping', () => {
  it('renders all 5 container layouts, 3 variants, and 3 cursor shapes with deduplicated <defs> glyph outlines', () => {
    const layouts: readonly TypingLayout[] = ['window', 'prompt', 'ide', 'browser', 'none'];
    for (const layout of layouts) {
      const svg = renderTyping({
        color: 'indigo',
        hint: 'utf8',
        layout,
        lines: 'Passionate Coder;Creative Technologist',
        title: 'zsh',
      });
      expect(svg, layout).toContain('role="img"');
      expect(svg, layout).not.toContain('NaN');
      expect(svg, layout).toMatch(/<path id="type-g-[\da-z]+" d="M/);
      expect(svg, layout).toMatch(/<use href="#type-g-[\da-z]+"/);
      if (layout !== 'none') {
        expect(svg, layout).toContain('fill="rgba(9,10,15,0.62)"');
      }
    }

    // `window` and `ide` render the header hint badge as a fully rounded pill (`height="18" rx="9"`).
    const windowSvg = renderTyping({
      color: 'indigo',
      hint: 'utf8',
      layout: 'window',
      lines: 'Hello',
    });
    expect(windowSvg.split('<circle cx="').length - 1).toBe(3);
    expect(windowSvg).toContain('height="18" rx="9" fill="rgba(9,10,15,0.62)"');

    // Without `?icon=`, no icon or squircle box is rendered on any layout; With `?icon=sparkles` on `prompt`, the squircle badge (`x=10..38`, center `24`) centers its icon at `x=24`.
    const barePromptSvg = renderTyping({ color: 'cyan', layout: 'prompt', lines: 'Search' });
    expect(barePromptSvg).not.toContain('scale(');
    expect(barePromptSvg).not.toContain('width="28" height="28"');
    const iconPromptSvg = renderTyping({
      color: 'cyan',
      icon: 'sparkles',
      layout: 'prompt',
      lines: 'Search',
    });
    expect(iconPromptSvg).toContain('<rect x="10" y="10" width="28" height="28" rx="8"');
    const promptIconTransform =
      /translate\((?<x>[\d.]+), (?<y>[\d.]+)\) scale\((?<scale>[\d.]+)\)/.exec(
        iconPromptSvg
      )?.groups;
    const sparklesData = resolveIcon('sparkles');
    expect(promptIconTransform).toBeDefined();
    expect(sparklesData).toBeDefined();
    const promptIconCenterX =
      Number(promptIconTransform?.x) +
      (((sparklesData?.minX ?? 0) + (sparklesData?.maxX ?? 0)) / 2) *
        Number(promptIconTransform?.scale);
    expect(promptIconCenterX).toBeCloseTo(24, 1);
    expect(Number(promptIconTransform?.y)).toBe(16);

    // `browser` renders the omnibox hint badge without a border stroke; `browser` and `ide` ignore `align: 'center'`.
    const browserSvg = renderTyping({
      align: 'center',
      color: 'sky',
      hint: 'utf8',
      layout: 'browser',
      lines: 'svg.xul.is',
    });
    expect(browserSvg).toContain('height="22" rx="5" fill="rgba(9,10,15,0.62)" />');
    expect(browserSvg).toBe(
      renderTyping({
        align: 'left',
        color: 'sky',
        hint: 'utf8',
        layout: 'browser',
        lines: 'svg.xul.is',
      })
    );

    const ideSvg = renderTyping({
      align: 'center',
      color: 'emerald',
      icon: 'ts',
      layout: 'ide',
      lines: 'const x = 1;',
    });
    expect(ideSvg).toContain('<g opacity="0.42">');
    expect(ideSvg).toBe(
      renderTyping({
        align: 'left',
        color: 'emerald',
        icon: 'ts',
        layout: 'ide',
        lines: 'const x = 1;',
      })
    );

    const noneSvg = renderTyping({ color: 'indigo', layout: 'none', lines: 'Bare' });
    expect(noneSvg).not.toContain('url(#bg-dark)');
    expect(noneSvg).not.toContain('url(#grad-');

    const variants: readonly BadgeVariant[] = ['1', '2', '3'];
    for (const variant of variants) {
      const svg = renderTyping({ color: 'emerald', hint: 'utf8', lines: 'Line A;Line B', variant });
      expect(svg, variant).not.toContain('NaN');
      if (variant === '1') {
        expect(svg).toContain('fill="rgba(0,0,0,0.11)"');
      }
    }

    const cursors: readonly TypingCursor[] = ['bar', 'block', 'underscore'];
    for (const cursor of cursors) {
      const svg = renderTyping({ color: 'sky', cursor, lines: 'Cursor test' });
      expect(svg, cursor).toContain('attributeName="x"');
    }
  });

  it('renders icon-only, icon + text, and wide monospace keycap hints without overflowing', () => {
    const iconOnlyHintSvg = renderTyping({
      color: 'indigo',
      hint: 'icon:corner-down-left',
      layout: 'prompt',
      lines: 'Prompt test',
    });
    const iconAndTextHintSvg = renderTyping({
      color: 'indigo',
      hint: 'icon:command K',
      layout: 'prompt',
      lines: 'Prompt test',
    });
    expect(iconOnlyHintSvg).toContain('stroke-linecap="round"');
    expect(iconAndTextHintSvg).toContain('stroke-linecap="round"');
    expect(iconAndTextHintSvg.length).toBeGreaterThan(iconOnlyHintSvg.length);

    // Wide monospace keycap text (`testttttttttt`, where `'t'` is much wider in JetBrains Mono than in Geist Sans)
    // must measure with the monospace font so the keycap `<rect>` contains the text without overflowing.
    for (const wideHint of ['testttttttttt', 'icon:corner-down-left testttttttttt']) {
      const wideHintSvg = renderTyping({
        color: 'indigo',
        hint: wideHint,
        layout: 'prompt',
        lines: 'Prompt test',
      });
      const keycapMatch =
        /<rect x="(?<rectX>[\d.]+)" y="(?<rectY>[\d.]+)" width="(?<rectWidth>[\d.]+)" height="23"/.exec(
          wideHintSvg
        );
      const keycapRightEdge =
        Number(keycapMatch?.groups?.rectX ?? 0) + Number(keycapMatch?.groups?.rectWidth ?? 0);
      expect(measureMaxTextInkX(wideHintSvg), wideHint).toBeLessThan(keycapRightEdge - 4);
    }
  });

  it('supports backspace, select, and fade erase modes, sparse human typos, and static anim=none mode', () => {
    const eraseModes: readonly TypingEraseMode[] = ['backspace', 'select', 'fade'];
    for (const erase of eraseModes) {
      const svg = renderTyping({
        align: 'center',
        color: 'violet',
        erase,
        lines: 'Short;Much longer centered line',
      });
      expect(svg, erase).not.toContain('NaN');
      if (erase === 'select') {
        expect(svg).toContain('fill-opacity="0.28" opacity="0"');
      }
    }

    const withoutTypo = renderTyping({
      color: 'amber',
      hasTypo: false,
      lines: 'Building resilient systems;Crafting delightful interfaces;Shipping edge workers',
    });
    const withTypo = renderTyping({
      color: 'amber',
      hasTypo: true,
      lines: 'Building resilient systems;Crafting delightful interfaces;Shipping edge workers',
    });
    // Across 3 lines, only 1 line receives a simulated typo (not every single line).
    expect(withTypo.split('<use href="#type-g-')).toHaveLength(
      withoutTypo.split('<use href="#type-g-').length + 1
    );

    const staticSvg = renderTyping({
      anim: 'none',
      color: 'indigo',
      lines: 'Static line;Second line',
    });
    expect(staticSvg).not.toContain('<animate');
    expect(staticSvg).toContain('<use href="#type-g-');
  });

  it('truncates overlong lines with an ellipsis and caps line counts at MAX_TYPING_LINES', () => {
    const narrowSvg = renderTyping({
      color: 'rose',
      lines: 'An extraordinarily long line that exceeds a narrow two hundred pixel container width',
      width: 200,
    });
    expect(narrowSvg).toContain('width="200"');
    expect(narrowSvg).not.toContain('NaN');

    const cappedLines = Array.from({ length: MAX_TYPING_LINES }, (_val, index) => `Line ${index}`);
    const extraLines = [...cappedLines, 'Overflow 1', 'Overflow 2'];
    expect(renderTyping({ color: 'indigo', lines: extraLines })).toBe(
      renderTyping({ color: 'indigo', lines: cappedLines })
    );
  });
});
