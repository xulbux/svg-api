/**
 * Preview studio – Interactive HTML showcase rendered directly from the SSOT SVG generator (`svg.xul.is`).
 */

import { THEME_COLOR_NAMES } from '@/config/theme';
import { renderBadge, renderIcon, renderQuote, renderStack } from '@/svg/renderer';
import type { BadgeVariant, ThemeColorName } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Metadata for a variant showcase card in the preview studio. */
interface VariantDescriptor {
  /** Variant query parameter identifier. */
  id: BadgeVariant;
  /** Display title for the variant card. */
  title: string;
}

/** Metadata for a structural use-case showcase card in Section 4. */
interface UseCaseGroup {
  /** Array of badge render configurations for this use-case card. */
  badges: Parameters<typeof renderBadge>[0][];
  /** Display title for the use-case card. */
  title: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Showcase definitions for all 6 badge and micro-button variants. */
const VARIANT_DESCRIPTORS: VariantDescriptor[] = [
  { id: '1', title: 'variant=1 · Primary Badge' },
  { id: '2', title: 'variant=2 · Secondary Badge' },
  { id: '3', title: 'variant=3 · Tertiary Badge' },
  { id: 'b1', title: 'variant=b1 · Primary Button' },
  { id: 'b2', title: 'variant=b2 · Secondary Button' },
  { id: 'b3', title: 'variant=b3 · Tertiary Button' },
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
    title: 'Compact Icon / Dot + Value (No Label Text)',
  },
  {
    badges: [
      { color: 'sky', icon: 'pypi', label: 'pypi', value: 'v1.4.0', variant: '1' },
      { color: 'indigo', icon: 'download', label: 'downloads', value: '86.8k', variant: '1' },
      { color: 'indigo', icon: 'puzzle', label: 'open vsx', value: 'v1.2.3', variant: '2' },
      { color: 'violet', icon: 'download', label: 'downloads', value: '2.5k', variant: '2' },
      {
        color: 'rose',
        icon: 'git-commit-horizontal',
        label: 'last commit',
        value: '2d ago',
        variant: '2',
      },
      { color: 'slate', icon: 'scale', label: 'license', value: 'MIT', variant: '3' },
    ],
    title: 'Live Service Presets (/badge/gh/* · /badge/pypi/* · /badge/ovsx/*)',
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
        special: { type: 'sparkline', values: [19, 16, 18, 15, 14, 15, 12, 11] },
        value: '11ms',
        variant: '2',
      },
    ],
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
  const variantCards = VARIANT_DESCRIPTORS.map(renderVariantCard).join('\n');
  const paletteSwatches = THEME_COLOR_NAMES.map(renderPaletteSwatch).join('\n');
  const useCaseCards = USE_CASE_GROUPS.map(renderUseCaseCard).join('\n');

  const specialSamples = [
    renderBadge({
      color: 'emerald',
      dot: 'green',
      label: 'svg.xul.is',
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
      color: 'orange',
      dot: 'orange',
      label: 'queue load',
      value: 'incident (94%)',
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
      color: 'sky',
      dot: 'sky',
      label: 'edge cluster',
      value: 'maintenance',
      variant: '2',
    }),
    renderBadge({
      color: 'violet',
      dot: 'violet',
      label: 'v3 engine',
      value: 'beta preview',
      variant: '2',
    }),
    renderBadge({
      color: 'slate',
      dot: 'slate',
      label: 'batch worker',
      value: 'standby',
      variant: '3',
    }),
    renderBadge({
      color: 'indigo',
      icon: 'download',
      label: 'downloads',
      special: { type: 'sparkline', values: [12, 18, 15, 24, 29, 35, 42] },
      value: '42.1k/mo',
      variant: '1',
    }),
    renderBadge({
      color: 'emerald',
      icon: 'activity',
      label: 'commits',
      special: { type: 'sparkline', values: [3, 7, 5, 12, 9, 15, 11, 19] },
      value: '84/8w',
      variant: '2',
    }),
    renderBadge({
      color: 'cyan',
      icon: 'zap',
      label: 'latency',
      special: { type: 'sparkline', values: [19, 16, 18, 15, 14, 15, 12, 11] },
      value: '11ms',
      variant: '3',
    }),
    renderBadge({
      color: 'emerald',
      icon: 'shield-check',
      label: 'coverage',
      special: { type: 'bar', value: 92 },
      value: '92%',
      variant: '1',
    }),
    renderBadge({
      color: 'emerald',
      icon: 'shield-check',
      label: 'coverage',
      special: { type: 'bar', value: 82 },
      value: '82%',
      variant: '2',
    }),
    renderBadge({
      color: 'amber',
      icon: 'database',
      label: 'storage',
      special: { type: 'bar', value: 64 },
      value: '64%',
      variant: '3',
    }),
    renderBadge({
      color: 'sky',
      icon: 'cpu',
      label: 'kv quota',
      special: { hasPulse: true, type: 'ring', value: 84 },
      value: '84%',
      variant: '1',
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
      color: 'violet',
      icon: 'cpu',
      label: 'memory',
      special: { type: 'ring', value: 48 },
      value: '48%',
      variant: '3',
    }),
    renderBadge({
      color: 'emerald',
      dot: 'green',
      label: 'edge health',
      special: { states: ['9', '9', '8', '7', '9', '9', '8', '9', '9', '9'], type: 'strip' },
      value: '99.98%',
      variant: '1',
    }),
    renderBadge({
      color: 'emerald',
      dot: 'green',
      label: 'edge health',
      special: { states: ['9', '9', '8', '6', '4', '2', '5', '7', '8', '9'], type: 'strip' },
      value: '99.9%',
      variant: '2',
    }),
    renderBadge({
      color: 'emerald',
      dot: 'green',
      label: 'edge health',
      special: { states: ['9', '9', '8', '6', '4', '2', '5', '7', '8', '9'], type: 'strip' },
      value: '99.9%',
      variant: '3',
    }),
    renderBadge({
      color: 'indigo',
      icon: 'trending-up',
      label: 'requests',
      special: { type: 'delta', value: '+38%' },
      value: '2.4M/d',
      variant: '1',
    }),
    renderBadge({
      color: 'violet',
      icon: 'trending-up',
      label: 'requests',
      special: { type: 'delta', value: '+24%' },
      value: '1.2M/d',
      variant: '2',
    }),
    renderBadge({
      color: 'rose',
      icon: 'trending-down',
      label: 'error rate',
      special: { type: 'delta', value: '-18%' },
      value: '0.02%',
      variant: '3',
    }),
  ].join('\n');

  const standaloneIconSamples = [
    renderIcon({ anim: 'none', color: 'violet', icon: 'globe-code', size: 16, strokeWidth: 2.5 }),
    renderIcon({ anim: 'none', color: 'indigo', icon: 'code-xml', size: 16, strokeWidth: 2.5 }),
    renderIcon({ anim: 'none', color: 'violet', icon: 'square-text', size: 16, strokeWidth: 2.5 }),
    renderIcon({ anim: 'sheen', color: 'sky', icon: 'square-terminal', size: 20 }),
    renderIcon({ color: 'emerald', icon: 'package', size: 24 }),
    renderIcon({ anim: 'sheen', color: 'amber', icon: 'zap', size: 28 }),
    renderIcon({ color: 'rose', icon: 'heart-handshake', size: 28 }),
    renderIcon({ anim: 'sheen', color: 'yellow', icon: 'star', size: 24 }),
    renderIcon({ color: 'purple', icon: 'sparkles', size: 24 }),
    renderIcon({ color: 'teal', icon: 'refresh-cw', size: 24 }),
    renderIcon({ color: 'blue', icon: 'rocket', size: 24 }),
    renderIcon({ anim: 'sheen', color: 'cyan', icon: 'archlinux', size: 24 }),
    renderIcon({ color: 'amber', icon: 'python', size: 24 }),
    renderIcon({ anim: 'sheen', color: 'orange', icon: 'cloudflare', size: 24 }),
    renderIcon({ color: 'slate', icon: 'github', size: 24 }),
  ].join('\n');

  const fullProfileGroupsDsl = [
    'c,cpp,cs,rust,java,py,js,ts,php,lua,bash,powershell,html,css,sass,md:8',
    'dotnet,vue,pinia,laravel,symfony,nodejs,threejs,tauri,unity,unreal,tailwind,wordpress:6',
    'git,github,githubactions,vscode,visualstudio,npm,vite,cmake,linux,windows,raspberrypi,arduino:6|aws,azure,cloudflare,firebase,netlify,terraform,mysql,sqlite:4',
    'figma,ai,blender,ps,pr,ae:3|obsidian,notion,codepen,gtk,latex,regex:3',
  ].join(';');

  const fullStackVariant1 = renderStack({
    anim: 'sheen',
    icons: [fullProfileGroupsDsl],
    variant: '1',
  });

  const fullStackVariant2 = renderStack({
    anim: 'sheen',
    icons: [fullProfileGroupsDsl],
    variant: '2',
  });

  const fullStackVariant3 = renderStack({ icons: [fullProfileGroupsDsl], variant: '3' });

  const quoteTextChaos =
    'Who says programmers are boring? I bring the humor to the office while my code brings the chaos!';
  const quoteTextEdge =
    'Always creating more cool stuff for you – with balanced OKLCH colors and zero cold starts at the edge.';

  const quoteHorizV1 = renderQuote({
    anim: 'sheen',
    author: 'XulbuX',
    color: 'indigo',
    size: 'md',
    text: quoteTextChaos,
    variant: '1',
    width: 440,
  });

  const quoteHorizV2 = renderQuote({
    anim: 'sheen',
    author: 'XulbuX',
    color: 'cyan',
    size: 'lg',
    text: quoteTextChaos,
    variant: '2',
    width: 440,
  });

  const quoteHorizV3 = renderQuote({
    author: 'XulbuX',
    color: 'violet',
    size: 'md',
    text: quoteTextEdge,
    variant: '3',
    width: 440,
  });

  const quoteVertV1 = renderQuote({
    anim: 'sheen',
    author: 'XulbuX',
    color: 'blue',
    layout: 'vertical',
    size: 'lg',
    text: quoteTextChaos,
    variant: '1',
    width: 340,
  });

  const quoteVertV2 = renderQuote({
    anim: 'sheen',
    author: 'XulbuX',
    color: 'indigo',
    layout: 'vertical',
    size: 'lg',
    text: quoteTextChaos,
    variant: '2',
    width: 340,
  });

  const quoteVertV3 = renderQuote({
    author: 'XulbuX',
    color: 'cyan',
    layout: 'vertical',
    size: 'lg',
    text: quoteTextChaos,
    variant: '3',
    width: 340,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>svg-api (svg.xul.is) – SSOT Visual Studio</title>
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
    .container { max-width: 1120px; margin: 0 auto; }
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
    .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 16px; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px;
    }
    .card-header { display: flex; align-items: baseline; margin-bottom: 14px; }
    .card-header code { font-weight: 600; font-size: 13px; white-space: nowrap; }
    .badge-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .center-row { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: center; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>svg-api – SSOT Live Preview (<code>svg.xul.is</code>)</h1>
        <p style="margin:4px 0 0;font-size:13px;color:var(--muted)">Unified endpoints: <code>/badge/*</code> · <code>/icon/*</code> · <code>/stack/*</code> · <code>/quote/*</code></p>
      </div>
      <button class="toggle" onclick="document.body.classList.toggle('light-canvas')">
        Toggle Dark / Light README Canvas
      </button>
    </header>

    <h2>1. The 6 Badge &amp; Button Variants (svg.xul.is/badge/*)</h2>
    <div class="grid">${variantCards}</div>

    <h2>2. Special Elements Across All Variants (?special=sparkline | bar | ring | strip | delta)</h2>
    <div class="card">
      <div class="badge-row">${specialSamples}</div>
    </div>

    <h2>3. Tailwind v4 Color Tokens (?color=)</h2>
    <div class="card">
      <div class="badge-row">${paletteSwatches}</div>
    </div>

    <h2>4. Structural Combinations, Service Presets &amp; Micro-Animations</h2>
    <div class="grid">${useCaseCards}</div>

    <h2>5. Standalone Icons – svg.xul.is/icon/:icon (?color= &amp; ?size= &amp; ?stroke= &amp; ?anim=)</h2>
    <div class="card">
      <div class="badge-row" style="gap: 16px;">${standaloneIconSamples}</div>
    </div>

    <h2>6. Multi-Group Tech Stacks – All 3 Variants (svg.xul.is/stack/:groups · ; bands · | side-by-side · :N cols)</h2>
    <div class="grid">
      <div class="card">
        <div class="card-header"><code>variant=1 + anim=sheen · Primary Brand Gradient Multi-Group Stack (60 Icons)</code></div>
        <div class="center-row">${fullStackVariant1}</div>
      </div>
      <div class="card">
        <div class="card-header"><code>variant=2 + anim=sheen · Secondary Tinted Dark Multi-Group Stack (60 Icons)</code></div>
        <div class="center-row">${fullStackVariant2}</div>
      </div>
      <div class="card" style="grid-column: 1 / -1;">
        <div class="card-header"><code>variant=3 · Tertiary Neutral Dark Multi-Group Stack (60 Icons)</code></div>
        <div class="center-row">${fullStackVariant3}</div>
      </div>
    </div>

    <h2>7. Quote Cards – All 3 Variants in Vertical Centered &amp; Horizontal Layouts (svg.xul.is/quote/:author/:text)</h2>
    <div class="grid-3" style="margin-bottom: 16px;">
      <div class="card">
        <div class="card-header"><code>variant=1 + layout=vertical + size=lg + anim=sheen · Primary Brand Quote</code></div>
        <div class="center-row">${quoteVertV1}</div>
      </div>
      <div class="card">
        <div class="card-header"><code>variant=2 + layout=vertical + size=lg + anim=sheen · Secondary Tinted Quote</code></div>
        <div class="center-row">${quoteVertV2}</div>
      </div>
      <div class="card">
        <div class="card-header"><code>variant=3 + layout=vertical + size=lg · Tertiary Neutral Quote</code></div>
        <div class="center-row">${quoteVertV3}</div>
      </div>
    </div>
    <div class="grid">
      <div class="card">
        <div class="card-header"><code>variant=1 + size=md + anim=sheen · Horizontal Primary Brand Quote</code></div>
        <div class="badge-row">${quoteHorizV1}</div>
      </div>
      <div class="card">
        <div class="card-header"><code>variant=2 + size=lg + anim=sheen · Horizontal Secondary Tinted Quote</code></div>
        <div class="badge-row">${quoteHorizV2}</div>
      </div>
      <div class="card" style="grid-column: 1 / -1;">
        <div class="card-header"><code>variant=3 + size=md · Horizontal Tertiary Neutral Quote</code></div>
        <div class="badge-row">${quoteHorizV3}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
