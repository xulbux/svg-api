/**
 * Preview studio – Interactive HTML showcase rendered directly from the SSOT SVG generator.
 */

import { THEMES } from '@/config/theme';
import { renderBadge } from '@/svg/renderer';
import type { BadgeVariant, ThemeColorName } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Metadata for a variant showcase card in the preview studio. */
interface VariantDescriptor {
  /** Short description of the variant's visual design. */
  desc: string;
  /** Variant query parameter identifier. */
  id: BadgeVariant;
  /** Display title for the variant card. */
  title: string;
}

/** Metadata for a structural use-case showcase card in Section 4. */
interface UseCaseGroup {
  /** Array of badge render configurations for this use-case card. */
  badges: Parameters<typeof renderBadge>[0][];
  /** Short description of the structural combination being tested. */
  desc: string;
  /** Display title for the use-case card. */
  title: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Showcase definitions for all 6 badge and micro-button variants. */
const VARIANT_DESCRIPTORS: VariantDescriptor[] = [
  {
    desc: 'Flat dark slate label + Kumo 3D gradient value capsule',
    id: '1',
    title: 'v=1 · Primary Badge',
  },
  { desc: 'Colored border + 16% tinted value capsule', id: '2', title: 'v=2 · Secondary Badge' },
  {
    desc: 'Minimal neutral border + muted label + accent value',
    id: '3',
    title: 'v=3 · Tertiary Badge',
  },
  {
    desc: 'Kumo 3D full-bleed gradient CTA pill (26px height)',
    id: 'b1',
    title: 'v=b1 · Primary Button',
  },
  {
    desc: 'Kumo 3D tinted dark button with glowing border (26px height)',
    id: 'b2',
    title: 'v=b2 · Secondary Button',
  },
  {
    desc: 'Understated flat utility button with muted label (26px height)',
    id: 'b3',
    title: 'v=b3 · Tertiary Button',
  },
];

/** Comprehensive structural use-case and edge-case groups for visual verification. */
const USE_CASE_GROUPS: UseCaseGroup[] = [
  {
    badges: [
      { color: 'indigo', label: 'license', value: 'MIT', variant: '1' },
      { color: 'cyan', label: 'typescript', value: 'v5.8', variant: '2' },
      { color: 'emerald', label: 'coverage', value: '99.4%', variant: '3' },
      { color: 'violet', icon: 'none', label: 'engine', value: 'cloudflare edge', variant: '2' },
      { color: 'amber', label: 'Get Started', variant: 'b1' },
      { color: 'sky', label: 'View Changelog', variant: 'b2' },
    ],
    desc: 'Pure typography without icons (or with ?icon=none)',
    title: 'No-Icon Badges & Buttons',
  },
  {
    badges: [
      { color: 'indigo', icon: 'sparkles', label: 'xulbux', variant: '1' },
      { color: 'cyan', icon: 'archlinux', label: 'Arch Linux', variant: '2' },
      { color: 'emerald', icon: 'terminal', label: 'CLI Ready', variant: '3' },
      { color: 'emerald', dot: 'green', label: 'All Systems Operational', variant: '2' },
      { color: 'rose', label: 'Experimental', variant: '1' },
      { color: 'slate', label: 'MIT Licensed', variant: '3' },
    ],
    desc: '22px badges (v=1, v=2, v=3) with only a single compartment',
    title: 'Single-Part Badges (No Split Side)',
  },
  {
    badges: [
      { color: 'indigo', icon: 'github', label: '', variant: '1' },
      { color: 'cyan', icon: 'archlinux', label: '', variant: '2' },
      { color: 'amber', icon: 'sparkles', label: '', variant: '3' },
      { color: 'emerald', dot: 'green', label: '', variant: '2' },
      { color: 'violet', icon: 'rocket', label: '', variant: 'b1' },
      { color: 'sky', icon: 'terminal', label: '', variant: 'b2' },
      { color: 'rose', icon: 'heart', label: '', variant: 'b3' },
    ],
    desc: 'Symmetrically padded icon-only and status-dot-only micro-pills (?label=)',
    title: 'Icon-Only & Dot-Only Pills',
  },
  {
    badges: [
      { color: 'indigo', icon: 'star', label: '', value: '4.8k', variant: '1' },
      { color: 'cyan', icon: 'git-fork', label: '', value: '342', variant: '2' },
      { color: 'emerald', icon: 'download', label: '', value: '128k/mo', variant: '3' },
      { color: 'emerald', dot: 'green', label: '', value: '99.99%', variant: '2' },
      { color: 'amber', dot: 'amber', label: '', value: '180ms', variant: '3' },
    ],
    desc: 'Icon or pulsing dot on the left + value capsule on the right (?label=)',
    title: 'Compact Icon / Dot + Value (No Label Text)',
  },
  {
    badges: [
      {
        color: 'emerald',
        icon: 'shield-check',
        label: 'coverage',
        special: { type: 'bar', value: 94.8 },
        value: '94.8%',
        variant: '2',
      },
      {
        color: 'indigo',
        icon: 'cpu',
        label: 'memory',
        special: { type: 'ring', value: 78 },
        value: '78%',
        variant: '1',
      },
      {
        color: 'emerald',
        dot: 'green',
        label: 'uptime',
        special: { states: ['up', 'up', 'up', 'up', 'warn', 'up', 'up', 'up'], type: 'strip' },
        value: '99.98%',
        variant: '2',
      },
      {
        color: 'cyan',
        icon: 'trending-up',
        label: 'weekly dl',
        special: { type: 'delta', value: '+18.4%' },
        value: '142k',
        variant: '2',
      },
      {
        color: 'rose',
        icon: 'flame',
        label: 'p99 latency',
        special: { type: 'delta', value: '-12%' },
        value: '14ms',
        variant: '3',
      },
    ],
    desc: 'Unified ?special= widgets: bar:<pct>, ring:<pct>, strip:<states>, and delta:<val>',
    title: 'Special Data Widgets (Bar, Ring, Strip & Delta)',
  },
  {
    badges: [
      {
        anim: 'sheen',
        color: 'blue',
        icon: 'rocket',
        label: 'Deploy',
        value: 'Production',
        variant: 'b1',
      },
      { color: 'teal', icon: 'refresh-cw', label: 'Syncing Edge', variant: 'b2' },
      { color: 'purple', icon: 'sparkles', label: 'AI Assisted', variant: 'b2' },
      { color: 'rose', icon: 'heart', label: 'Sponsor', value: '$5/mo', variant: 'b3' },
      {
        color: 'cyan',
        dot: 'green',
        icon: 'zap',
        label: 'edge latency',
        sparkline: [19, 16, 18, 15, 14, 15, 12, 11],
        value: '11ms',
        variant: '2',
      },
    ],
    desc: 'Optional ?anim=sheen button glint, auto spin/shake/nudge icons, and kitchen-sink badge',
    title: 'Micro-Animations & Split Micro-Buttons',
  },
];

// -------------------------------------- INTERNALS --------------------------------------

/** Render an HTML showcase card for a single badge or button variant. */
function renderVariantCard(variantInfo: VariantDescriptor): string {
  const isBtn = variantInfo.id.startsWith('b');
  const samples = [
    renderBadge({
      color: 'indigo',
      icon: isBtn ? 'book-open' : 'star',
      label: isBtn ? 'Documentation' : 'stars',
      value: isBtn ? undefined : '4.8k',
      variant: variantInfo.id,
    }),
    renderBadge({
      color: 'cyan',
      icon: 'archlinux',
      label: isBtn ? 'Install Arch' : 'arch',
      value: isBtn ? undefined : 'hyprland',
      variant: variantInfo.id,
    }),
    renderBadge({
      color: 'emerald',
      icon: isBtn ? 'rocket' : 'pypi',
      label: isBtn ? 'Latest Release' : 'pypi',
      value: isBtn ? undefined : 'v2.4.0',
      variant: variantInfo.id,
    }),
    renderBadge({
      color: 'rose',
      icon: 'bug',
      label: isBtn ? 'Report Issue' : 'issues',
      value: isBtn ? undefined : '12 open',
      variant: variantInfo.id,
    }),
  ].join('\n');

  return `
        <div class="card">
          <div class="card-header">
            <code>${variantInfo.title}</code>
            <span>${variantInfo.desc}</span>
          </div>
          <div class="badge-row">${samples}</div>
        </div>
      `;
}

/** Render an HTML showcase card for a structural use-case group. */
function renderUseCaseCard(group: UseCaseGroup): string {
  const samples = group.badges.map((badgeOptions) => renderBadge(badgeOptions)).join('\n');

  return `
        <div class="card">
          <div class="card-header">
            <code>${group.title}</code>
            <span>${group.desc}</span>
          </div>
          <div class="badge-row">${samples}</div>
        </div>
      `;
}

/** Render a color swatch badge for a named theme color token. */
function renderPaletteSwatch(colorName: ThemeColorName): string {
  return renderBadge({
    color: colorName,
    icon: 'sparkles',
    label: 'theme',
    value: colorName,
    variant: '2',
  });
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the complete standalone HTML page for the `/preview` SSOT design studio.
 * @returns Complete HTML document string.
 */
export function renderPreviewHtml(): string {
  const colors = Object.keys(THEMES) as ThemeColorName[];
  const variantCards = VARIANT_DESCRIPTORS.map(renderVariantCard).join('\n');
  const paletteSwatches = colors.map(renderPaletteSwatch).join('\n');
  const useCaseCards = USE_CASE_GROUPS.map(renderUseCaseCard).join('\n');

  const specialSamples = [
    renderBadge({
      color: 'emerald',
      dot: 'green',
      label: 'api.xul.is',
      value: 'online',
      variant: '2',
    }),
    renderBadge({
      color: 'amber',
      dot: 'amber',
      label: 'worker latency',
      value: 'degraded (180ms)',
      variant: '2',
    }),
    renderBadge({
      color: 'rose',
      dot: 'red',
      label: 'build pipeline',
      value: 'offline',
      variant: '2',
    }),
    renderBadge({
      color: 'emerald',
      icon: 'activity',
      label: 'commits',
      sparkline: [3, 7, 5, 12, 9, 15, 11, 19],
      value: '84/8w',
      variant: '2',
    }),
    renderBadge({
      color: 'indigo',
      icon: 'download',
      label: 'downloads',
      sparkline: [12, 18, 15, 24, 29, 35, 42],
      value: '42.1k/mo',
      variant: '1',
    }),
    renderBadge({
      color: 'emerald',
      icon: 'shield-check',
      label: 'coverage',
      special: { type: 'bar', value: 99.4 },
      value: '99.4%',
      variant: '2',
    }),
    renderBadge({
      color: 'sky',
      icon: 'cpu',
      label: 'kv quota',
      special: { type: 'ring', value: 72 },
      value: '72%',
      variant: '2',
    }),
    renderBadge({
      color: 'emerald',
      dot: 'green',
      label: 'edge health',
      special: { states: ['up', 'up', 'up', 'up', 'warn', 'up', 'up', 'up'], type: 'strip' },
      value: '99.9%',
      variant: '3',
    }),
    renderBadge({
      color: 'violet',
      icon: 'trending-up',
      label: 'requests',
      special: { type: 'delta', value: '+24%' },
      value: '1.2M/d',
      variant: '2',
    }),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>badge.xul.is — SSOT Visual Studio</title>
  <style>
    :root {
      --bg: #090b10;
      --card: #11141d;
      --border: #1f2433;
      --text: #f3f4f6;
      --muted: #9ca3af;
    }
    body.light-canvas {
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
    }
    body {
      margin: 0;
      padding: 40px 24px;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      transition: background 0.2s, color 0.2s;
    }
    .container { max-width: 980px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 20px; margin: 0; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 32px 0 12px; }
    button.toggle {
      background: var(--card);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 16px; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px;
    }
    .card-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; gap: 12px; }
    .card-header code { font-weight: 600; font-size: 13px; white-space: nowrap; }
    .card-header span { font-size: 12px; color: var(--muted); text-align: right; }
    .badge-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>badge.xul.is — SSOT Live Preview</h1>
        <p style="margin:4px 0 0;font-size:13px;color:var(--muted)">Rendered directly via <code>src/svg/renderer.ts</code></p>
      </div>
      <button class="toggle" onclick="document.body.classList.toggle('light-canvas')">
        Toggle Dark / Light README Canvas
      </button>
    </header>

    <h2>1. The 6 Badge & Button Variants</h2>
    <div class="grid">${variantCards}</div>

    <h2>2. Special Elements (?special=sparkline | bar | ring | strip | delta)</h2>
    <div class="card">
      <div class="badge-row">${specialSamples}</div>
    </div>

    <h2>3. Tailwind v4 Color Tokens (?color= / ?c=)</h2>
    <div class="card">
      <div class="badge-row">${paletteSwatches}</div>
    </div>

    <h2>4. Structural Combinations, Micro-Animations & Edge Cases</h2>
    <div class="grid">${useCaseCards}</div>
  </div>
</body>
</html>`;
}
