/**
 * Preview and documentation layout: Shared responsive HTML shell, XulbuX CSS design system, Lucide UI icons, parameter tables, and expandable Markdown code drawers.
 */

import { resolveIcon } from '@/svg/icons';
import { escapeXml } from '@/svg/shared';

// ---------------------------------------- TYPES ----------------------------------------

/** Valid navigation tab identifiers across the `svg.xul.is` web interface. */
export type NavPageId =
  | 'badges'
  | 'buttons'
  | 'colors'
  | 'home'
  | 'icons'
  | 'quotes'
  | 'services'
  | 'stack';

/** Single rendered SVG item paired with its canonical Markdown embed snippet. */
export interface ShowcaseItem {
  /** Accessible alt text used in the generated Markdown snippet (`![alt](url)`). */
  alt: string;
  /** Optional outer link target (`[![alt](url)](href)`). */
  href?: string;
  /** Canonical path and query string on `https://svg.xul.is` (e.g., `'/badge/pypi/xulbux/v'`). */
  path: string;
  /** Rendered inline `<svg>...</svg>` markup from the SSOT engine. */
  svg: string;
}

/** Configuration for a visual showcase card with an expandable Markdown code drawer. */
export interface ShowcaseCardConfig {
  /** Whether to center the rendered SVGs inside the preview stage. */
  isCentered?: boolean;
  /** List of rendered SVG items and their Markdown paths. */
  items: ShowcaseItem[];
  /** Optional descriptive subtitle explaining the option or pattern shown. */
  subtitle?: string;
  /** Card header title or route pattern. */
  title: string;
}

/** Single row in a documentation parameter or route reference table. */
export interface ParamTableRow {
  /** Default value when omitted (prefix with `~` for a non-code descriptive note). */
  defaultVal: string;
  /** Explanation of what the parameter or segment controls. */
  description: string;
  /** Parameter or route segment name (e.g., `?variant=`, `:icon`). */
  name: string;
  /** Accepted values or type signature (prefix with `~` for a non-code descriptive note). */
  values: string;
}

/** Options for rendering the full HTML document shell. */
export interface PageLayoutOptions {
  /** Active navigation tab identifier. */
  activePage: NavPageId;
  /** Inner `<main>` HTML content. */
  bodyHtml: string;
  /** Meta description for search engines and link previews. */
  description: string;
  /** Document `<title>` text. */
  title: string;
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a trailing parenthetical group at the end of a string (e.g., `Primary Badge (Default)`). */
const TRAILING_PAREN_RX = /^(?<main>.+?)\s+\((?<paren>[^()]+)\)$/;

/** Matches comma-separated items inside a card title parenthetical. */
const COMMA_SPLIT_RX = /,\s*/;

/** Matches operator/separator tokens (` | `, ` / `, ` to `, `...`) inside parameter code cells. */
const PARAM_CODE_TOKEN_RX = /(?<sep>\s\|\s|\s\/\s|\sto\s|\.\.\.)/g;

// ---------------------------------------- CONSTS ---------------------------------------

/** Canonical production origin used in copyable Markdown snippets. */
const BASE_ORIGIN = 'https://svg.xul.is';

/** Navigation links displayed in the sticky top header (VitePress text-only style). */
const NAV_LINKS: readonly { href: string; id: NavPageId; label: string }[] = [
  { href: '/', id: 'home', label: 'Home' },
  { href: '/docs/badges', id: 'badges', label: 'Badges' },
  { href: '/docs/buttons', id: 'buttons', label: 'Buttons' },
  { href: '/docs/services', id: 'services', label: 'Services' },
  { href: '/docs/icons', id: 'icons', label: 'Icons' },
  { href: '/docs/stack', id: 'stack', label: 'Tech Stack' },
  { href: '/docs/quotes', id: 'quotes', label: 'Quotes' },
  { href: '/docs/colors', id: 'colors', label: 'Colors' },
];

// -------------------------------------- INTERNALS --------------------------------------

/** Build an inline UI icon (`<svg class="ui-icon">`) from `lucide-static` or `@iconify-json/simple-icons`. */
function buildUiIcon(slug: string, size = 16, extraClass = ''): string {
  const resolved = resolveIcon(slug);
  if (!resolved) {
    return '';
  }
  const classAttr = extraClass ? `ui-icon ${extraClass}` : 'ui-icon';
  if (resolved.type === 'lucide') {
    return `<svg class="${classAttr}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${resolved.innerSvg}</svg>`;
  }
  return `<svg class="${classAttr}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${resolved.innerSvg}</svg>`;
}

/** Highlight a URL's base path and query parameters (`?key=val&...`) for Markdown code drawers. */
function highlightUrlHtml(rawUrl: string): string {
  const qIdx = rawUrl.indexOf('?');
  if (qIdx === -1) {
    return `<span class="hl-url">${escapeXml(rawUrl)}</span>`;
  }

  const basePath = rawUrl.slice(0, qIdx);
  const queryStr = rawUrl.slice(qIdx + 1);
  const pairs = queryStr.split('&');
  let queryHtml = '';

  for (let i = 0; i < pairs.length; i += 1) {
    if (i > 0) {
      queryHtml += '<span class="hl-op">&amp;</span>';
    }
    const pair = pairs[i];
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      queryHtml += `<span class="hl-key">${escapeXml(pair)}</span>`;
    } else {
      const key = pair.slice(0, eqIdx);
      const val = pair.slice(eqIdx + 1);
      queryHtml += `<span class="hl-key">${escapeXml(key)}</span><span class="hl-op">=</span><span class="hl-val">${escapeXml(val)}</span>`;
    }
  }

  return `<span class="hl-url">${escapeXml(basePath)}</span><span class="hl-op">?</span>${queryHtml}`;
}

/** Format a `ShowcaseItem` into a syntax-highlighted GitHub README Markdown line whose `.textContent` is exact Markdown. */
function formatHighlightedMarkdownSnippet(item: ShowcaseItem): string {
  const fullUrl = `${BASE_ORIGIN}${item.path}`;
  const imgHtml = `<span class="hl-p">![</span><span class="hl-alt">${escapeXml(item.alt)}</span><span class="hl-p">](</span>${highlightUrlHtml(fullUrl)}<span class="hl-p">)</span>`;
  if (!item.href) {
    return imgHtml;
  }
  return `<span class="hl-p">[</span>${imgHtml}<span class="hl-p">](</span><span class="hl-href">${escapeXml(item.href)}</span><span class="hl-p">)</span>`;
}

/**
 * Format a card title string into hierarchical HTML with a primary heading, optional leading code badge, and optional trailing meta/status pills.
 */
function formatCardTitleHtml(rawTitle: string): string {
  let remainder = rawTitle.trim();
  let trailingPillHtml = '';

  // 1. Extract trailing parenthetical group first so inner symbols never interfere with ` · ` prefix splitting.
  const parenMatch = TRAILING_PAREN_RX.exec(remainder);
  if (parenMatch?.groups) {
    remainder = parenMatch.groups.main.trim();
    const parenContent = parenMatch.groups.paren.trim();
    const parts = parenContent.split(COMMA_SPLIT_RX);
    for (const part of parts) {
      const cleanPart = part.trim();
      if (cleanPart.length > 0) {
        const isCodeMeta =
          cleanPart.startsWith('/') ||
          cleanPart.startsWith('?') ||
          cleanPart.startsWith('@') ||
          cleanPart.includes('=');
        trailingPillHtml += isCodeMeta
          ? `<code class="card-title-meta">${escapeXml(cleanPart)}</code>`
          : `<span class="card-title-pill">${escapeXml(cleanPart)}</span>`;
      }
    }
  }

  // 2. Extract leading `code · ` prefix if present on the main title text.
  let prefixBadgeHtml = '';
  const dotSeparatorIndex = remainder.indexOf(' · ');
  if (dotSeparatorIndex !== -1) {
    const prefix = remainder.slice(0, dotSeparatorIndex).trim();
    remainder = remainder.slice(dotSeparatorIndex + 3).trim();
    prefixBadgeHtml = `<code class="card-title-code">${escapeXml(prefix)}</code>`;
  }

  return `${prefixBadgeHtml}<span class="card-title-text">${escapeXml(remainder)}</span>${trailingPillHtml}`;
}

/** Render a `<code class="param-code">` block with dimmed, non-selectable operator tokens (`|`, `/`, `to`, `...`). */
function renderCodeWithDimmedSeparators(rawCode: string): string {
  const tokens = rawCode.split(PARAM_CODE_TOKEN_RX);
  let innerHtml = '';
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (i % 2 === 1) {
      innerHtml += `<span class="param-sep">${escapeXml(tok)}</span>`;
    } else if (tok.length > 0) {
      innerHtml += escapeXml(tok);
    }
  }
  return `<code class="param-code">${innerHtml}</code>`;
}

/** Render a single `code` or `code (note)` segment inside a parameter table cell. */
function renderParamSegmentHtml(segment: string): string {
  const trimmed = segment.trim();
  if (trimmed.startsWith('~')) {
    return `<span class="param-note">${escapeXml(trimmed.slice(1).trim())}</span>`;
  }
  const parenMatch = TRAILING_PAREN_RX.exec(trimmed);
  if (parenMatch?.groups) {
    const codePart = parenMatch.groups.main.trim();
    const notePart = parenMatch.groups.paren.trim();
    return `${renderCodeWithDimmedSeparators(codePart)} <span class="param-note">(${escapeXml(notePart)})</span>`;
  }
  return renderCodeWithDimmedSeparators(trimmed);
}

/** Format a parameter table `Values` or `Default` cell with dimmed pipes/ranges and separated explanatory notes. */
function formatParamCellHtml(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes(') / ')) {
    const slashParts = trimmed.split(' / ');
    const renderedParts: string[] = [];
    for (const part of slashParts) {
      renderedParts.push(renderParamSegmentHtml(part));
    }
    return renderedParts.join(' <span class="param-sep">/</span> ');
  }
  return renderParamSegmentHtml(trimmed);
}

/** Render the sticky top navigation bar matching the VitePress text-link navbar style. */
function renderHeaderNav(activePage: NavPageId): string {
  let navItemsHtml = '';
  for (const link of NAV_LINKS) {
    const isActive = link.id === activePage;
    const activeAttr = isActive
      ? ' class="nav-link is-active" aria-current="page"'
      : ' class="nav-link"';
    navItemsHtml += `<a href="${link.href}"${activeAttr}><span class="nav-text">${escapeXml(link.label)}</span></a>`;
  }

  const brandIcon = buildUiIcon('sparkles', 15, 'brand-sparkle');
  const sunIcon = buildUiIcon('sun', 12, 'theme-icon theme-label-light');
  const moonIcon = buildUiIcon('moon', 12, 'theme-icon theme-label-dark');
  const githubIcon = buildUiIcon('github', 20, 'gh-icon');

  return `<header class="site-header">
    <div class="header-inner">
      <a href="/" class="brand-link">
        <span class="brand-mark" aria-hidden="true">${brandIcon}</span>
        <span class="brand-name">svg.xul.is</span>
      </a>
      <nav class="site-nav" aria-label="Documentation sections">${navItemsHtml}</nav>
      <div class="header-actions">
        <span class="header-divider" aria-hidden="true"></span>
        <button type="button" class="theme-switch" id="theme-toggle" role="switch" aria-label="Toggle color scheme">
          <span class="theme-switch-thumb">
            ${sunIcon}
            ${moonIcon}
          </span>
        </button>
        <span class="header-divider" aria-hidden="true"></span>
        <a href="https://github.com/xulbux" class="gh-link" target="_blank" rel="noopener noreferrer" aria-label="XulbuX on GitHub" title="XulbuX on GitHub">
          ${githubIcon}
        </a>
      </div>
    </div>
  </header>`;
}

/** Render the site footer matching the XulbuX documentation aesthetic. */
function renderFooter(): string {
  const sparkleIcon = buildUiIcon('sparkles', 14, 'footer-sparkle');
  return `<footer class="site-footer">
    <div class="footer-inner">
      <p class="footer-feedback">
        Missing a public API service, vector icon, or even a whole new SVG element? Feel free to <a href="mailto:hi@xul.is" class="text-link">send an email to hi@xul.is</a> and let me know!
      </p>
      <div class="footer-meta">
        <p class="footer-license">Released under the MIT License.</p>
        <p class="footer-credit">
          ${sparkleIcon}
          <span class="footer-from">From <a href="https://github.com/xulbux" class="text-link" target="_blank" rel="noopener noreferrer"><b>XulbuX</b></a></span>
          ${sparkleIcon}
        </p>
      </div>
    </div>
  </footer>`;
}

/** Render the shared CSS stylesheet using XulbuX dark/light surface tokens, indigo accent palette, and layered border hierarchy. */
function renderStylesheet(): string {
  return `<style>
    @view-transition {
      navigation: auto;
    }

    @media (prefers-reduced-motion: reduce) {
      @view-transition {
        navigation: none;
      }
    }

    :root {
      interpolate-size: allow-keywords;
      color-scheme: light dark;

      /* Indigo Accent Base */
      --base-brand: #4f46e5;

      /* Light Theme Tokens (from python-lib-xulbux website with Indigo accent) */
      --vp-c-bg: #ffffff;
      --vp-c-bg-alt: #fafafa;
      --vp-c-bg-elv: #f0f0f0;
      --vp-c-bg-soft: #fafafa;
      --vp-c-divider: #ededed;
      --vp-c-text-1: rgba(0 0 0 / 0.88);
      --vp-c-text-2: rgba(0 0 0 / 0.6);
      --vp-c-text-3: rgba(0 0 0 / 0.38);
      --vp-c-brand-1: #4f46e5;
      --vp-c-brand-2: #6366f1;
      --vp-c-brand-3: #818cf8;
      --vp-nav-bg-color: color-mix(in srgb, var(--vp-c-bg) 75%, transparent);
      --vp-button-brand-bg: var(--vp-c-brand-1);
      --vp-button-brand-text: #ffffff;
      --vp-button-brand-hover-bg: color-mix(in srgb, var(--vp-c-brand-2), var(--vp-c-brand-1) 50%);
      --vp-switch-bg: #f0f0f0;
      --vp-switch-thumb-bg: #ffffff;
      /* Isolux Pro Light Syntax Tokens */
      --vp-c-hl-p: #646464;
      --vp-c-hl-op: #c5002b;
      --vp-c-hl-alt: #2b7676;
      --vp-c-hl-url: #4f48ec;
      --vp-c-hl-key: #214a4b;
      --vp-c-hl-val: #8a0be5;
      --vp-c-hl-href: #367a44;

      /* Dark Theme Tokens (from python-lib-xulbux website with Indigo accent) */
      --dvp-c-bg: #101010;
      --dvp-c-bg-alt: #000000;
      --dvp-c-bg-elv: #1a1a1a;
      --dvp-c-bg-soft: #000000;
      --dvp-c-divider: #262626;
      --dvp-c-text-1: rgba(255 255 255 / 0.9);
      --dvp-c-text-2: rgba(255 255 255 / 0.6);
      --dvp-c-text-3: rgba(255 255 255 / 0.38);
      --dvp-c-brand-1: #818cf8;
      --dvp-c-brand-2: #6366f1;
      --dvp-c-brand-3: #4f46e5;
      --dvp-nav-bg-color: color-mix(in srgb, var(--dvp-c-bg) 64%, transparent);
      --dvp-button-brand-bg: var(--dvp-c-brand-3);
      --dvp-button-brand-text: #ffffff;
      --dvp-button-brand-hover-bg: color-mix(in srgb, var(--dvp-c-brand-2), var(--dvp-c-brand-3) 50%);
      --dvp-switch-bg: #26262a;
      --dvp-switch-thumb-bg: #000000;
      /* Isolux Pro Dark Syntax Tokens */
      --dvp-c-hl-p: #8a8a8a;
      --dvp-c-hl-op: #ffa4aa;
      --dvp-c-hl-alt: #7ceee3;
      --dvp-c-hl-url: #909fff;
      --dvp-c-hl-key: #bcfff7;
      --dvp-c-hl-val: #d5acff;
      --dvp-c-hl-href: #93f0b0;

      /* Active Theme Bindings (Default Light) */
      --c-bg: var(--vp-c-bg);
      --c-bg-alt: var(--vp-c-bg-alt);
      --c-bg-elv: var(--vp-c-bg-elv);
      --c-bg-soft: var(--vp-c-bg-soft);
      --c-divider: var(--vp-c-divider);
      --c-text-1: var(--vp-c-text-1);
      --c-text-2: var(--vp-c-text-2);
      --c-text-3: var(--vp-c-text-3);
      --c-brand-1: var(--vp-c-brand-1);
      --c-brand-2: var(--vp-c-brand-2);
      --c-brand-3: var(--vp-c-brand-3);
      --c-nav-bg: var(--vp-nav-bg-color);
      --c-btn-brand-bg: var(--vp-button-brand-bg);
      --c-btn-brand-text: var(--vp-button-brand-text);
      --c-btn-brand-hover-bg: var(--vp-button-brand-hover-bg);
      --c-switch-bg: var(--vp-switch-bg);
      --c-switch-thumb-bg: var(--vp-switch-thumb-bg);
      --c-hl-p: var(--vp-c-hl-p);
      --c-hl-op: var(--vp-c-hl-op);
      --c-hl-alt: var(--vp-c-hl-alt);
      --c-hl-url: var(--vp-c-hl-url);
      --c-hl-key: var(--vp-c-hl-key);
      --c-hl-val: var(--vp-c-hl-val);
      --c-hl-href: var(--vp-c-hl-href);

      @media (prefers-color-scheme: dark) {
        --c-bg: var(--dvp-c-bg);
        --c-bg-alt: var(--dvp-c-bg-alt);
        --c-bg-elv: var(--dvp-c-bg-elv);
        --c-bg-soft: var(--dvp-c-bg-soft);
        --c-divider: var(--dvp-c-divider);
        --c-text-1: var(--dvp-c-text-1);
        --c-text-2: var(--dvp-c-text-2);
        --c-text-3: var(--dvp-c-text-3);
        --c-brand-1: var(--dvp-c-brand-1);
        --c-brand-2: var(--dvp-c-brand-2);
        --c-brand-3: var(--dvp-c-brand-3);
        --c-nav-bg: var(--dvp-nav-bg-color);
        --c-btn-brand-bg: var(--dvp-button-brand-bg);
        --c-btn-brand-text: var(--dvp-button-brand-text);
        --c-btn-brand-hover-bg: var(--dvp-button-brand-hover-bg);
        --c-switch-bg: var(--dvp-switch-bg);
        --c-switch-thumb-bg: var(--dvp-switch-thumb-bg);
        --c-hl-p: var(--dvp-c-hl-p);
        --c-hl-op: var(--dvp-c-hl-op);
        --c-hl-alt: var(--dvp-c-hl-alt);
        --c-hl-url: var(--dvp-c-hl-url);
        --c-hl-key: var(--dvp-c-hl-key);
        --c-hl-val: var(--dvp-c-hl-val);
        --c-hl-href: var(--dvp-c-hl-href);
      }

      &:has(> head > meta[name="color-scheme"][content="dark"]) {
        color-scheme: dark;
        --c-bg: var(--dvp-c-bg);
        --c-bg-alt: var(--dvp-c-bg-alt);
        --c-bg-elv: var(--dvp-c-bg-elv);
        --c-bg-soft: var(--dvp-c-bg-soft);
        --c-divider: var(--dvp-c-divider);
        --c-text-1: var(--dvp-c-text-1);
        --c-text-2: var(--dvp-c-text-2);
        --c-text-3: var(--dvp-c-text-3);
        --c-brand-1: var(--dvp-c-brand-1);
        --c-brand-2: var(--dvp-c-brand-2);
        --c-brand-3: var(--dvp-c-brand-3);
        --c-nav-bg: var(--dvp-nav-bg-color);
        --c-btn-brand-bg: var(--dvp-button-brand-bg);
        --c-btn-brand-text: var(--dvp-button-brand-text);
        --c-btn-brand-hover-bg: var(--dvp-button-brand-hover-bg);
        --c-switch-bg: var(--dvp-switch-bg);
        --c-switch-thumb-bg: var(--dvp-switch-thumb-bg);
        --c-hl-p: var(--dvp-c-hl-p);
        --c-hl-op: var(--dvp-c-hl-op);
        --c-hl-alt: var(--dvp-c-hl-alt);
        --c-hl-url: var(--dvp-c-hl-url);
        --c-hl-key: var(--dvp-c-hl-key);
        --c-hl-val: var(--dvp-c-hl-val);
        --c-hl-href: var(--dvp-c-hl-href);
      }

      &:has(> head > meta[name="color-scheme"][content="light"]) {
        color-scheme: light;
        --c-bg: var(--vp-c-bg);
        --c-bg-alt: var(--vp-c-bg-alt);
        --c-bg-elv: var(--vp-c-bg-elv);
        --c-bg-soft: var(--vp-c-bg-soft);
        --c-divider: var(--vp-c-divider);
        --c-text-1: var(--vp-c-text-1);
        --c-text-2: var(--vp-c-text-2);
        --c-text-3: var(--vp-c-text-3);
        --c-brand-1: var(--vp-c-brand-1);
        --c-brand-2: var(--vp-c-brand-2);
        --c-brand-3: var(--vp-c-brand-3);
        --c-nav-bg: var(--vp-nav-bg-color);
        --c-btn-brand-bg: var(--vp-button-brand-bg);
        --c-btn-brand-text: var(--vp-button-brand-text);
        --c-btn-brand-hover-bg: var(--vp-button-brand-hover-bg);
        --c-switch-bg: var(--vp-switch-bg);
        --c-switch-thumb-bg: var(--vp-switch-thumb-bg);
        --c-hl-p: var(--vp-c-hl-p);
        --c-hl-op: var(--vp-c-hl-op);
        --c-hl-alt: var(--vp-c-hl-alt);
        --c-hl-url: var(--vp-c-hl-url);
        --c-hl-key: var(--vp-c-hl-key);
        --c-hl-val: var(--vp-c-hl-val);
        --c-hl-href: var(--vp-c-hl-href);
      }

      @supports (color: light-dark(white, black)) {
        --c-bg: light-dark(var(--vp-c-bg), var(--dvp-c-bg));
        --c-bg-alt: light-dark(var(--vp-c-bg-alt), var(--dvp-c-bg-alt));
        --c-bg-elv: light-dark(var(--vp-c-bg-elv), var(--dvp-c-bg-elv));
        --c-bg-soft: light-dark(var(--vp-c-bg-soft), var(--dvp-c-bg-soft));
        --c-divider: light-dark(var(--vp-c-divider), var(--dvp-c-divider));
        --c-text-1: light-dark(var(--vp-c-text-1), var(--dvp-c-text-1));
        --c-text-2: light-dark(var(--vp-c-text-2), var(--dvp-c-text-2));
        --c-text-3: light-dark(var(--vp-c-text-3), var(--dvp-c-text-3));
        --c-brand-1: light-dark(var(--vp-c-brand-1), var(--dvp-c-brand-1));
        --c-brand-2: light-dark(var(--vp-c-brand-2), var(--dvp-c-brand-2));
        --c-brand-3: light-dark(var(--vp-c-brand-3), var(--dvp-c-brand-3));
        --c-nav-bg: light-dark(var(--vp-nav-bg-color), var(--dvp-nav-bg-color));
        --c-btn-brand-bg: light-dark(var(--vp-button-brand-bg), var(--dvp-button-brand-bg));
        --c-btn-brand-text: light-dark(var(--vp-button-brand-text), var(--dvp-button-brand-text));
        --c-btn-brand-hover-bg: light-dark(var(--vp-button-brand-hover-bg), var(--dvp-button-brand-hover-bg));
        --c-switch-bg: light-dark(var(--vp-switch-bg), var(--dvp-switch-bg));
        --c-switch-thumb-bg: light-dark(var(--vp-switch-thumb-bg), var(--dvp-switch-thumb-bg));
        --c-hl-p: light-dark(var(--vp-c-hl-p), var(--dvp-c-hl-p));
        --c-hl-op: light-dark(var(--vp-c-hl-op), var(--dvp-c-hl-op));
        --c-hl-alt: light-dark(var(--vp-c-hl-alt), var(--dvp-c-hl-alt));
        --c-hl-url: light-dark(var(--vp-c-hl-url), var(--dvp-c-hl-url));
        --c-hl-key: light-dark(var(--vp-c-hl-key), var(--dvp-c-hl-key));
        --c-hl-val: light-dark(var(--vp-c-hl-val), var(--dvp-c-hl-val));
        --c-hl-href: light-dark(var(--vp-c-hl-href), var(--dvp-c-hl-href));
      }

      /* 3-Tier Border Hierarchy: Outer Divider > Standard Border > Inner Subtle Border */
      --c-border: color-mix(in srgb, var(--c-bg), var(--c-divider) 72%);
      --c-border-subtle: color-mix(in srgb, var(--c-bg), var(--c-divider) 42%);
      --c-code-bg: color-mix(in srgb, var(--c-bg), var(--c-divider) 65%);
      --c-brand-soft: color-mix(in srgb, var(--c-brand-1) 12%, transparent);
      --c-brand-border: color-mix(in srgb, var(--c-brand-1) 36%, transparent);

      accent-color: var(--c-brand-1);
      scrollbar-width: thin;
      scrollbar-color: color-mix(in srgb, var(--c-text-1) 24%, transparent) transparent;
    }

    ::selection {
      background-color: color-mix(in srgb, var(--c-brand-2) 40%, transparent);
    }

    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }

    ::-webkit-scrollbar-track,
    ::-webkit-scrollbar-corner {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      border-radius: 4px;
      background: color-mix(in srgb, var(--c-text-1) 24%, transparent);
    }

    ::-webkit-scrollbar-thumb:hover {
      background: color-mix(in srgb, var(--c-text-1) 32%, transparent);
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-block-size: 100dvh;
      display: flex;
      flex-direction: column;
      background: var(--c-bg);
      color: var(--c-text-1);
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
      line-height: 1.55;
      transition: background-color 0.2s ease, color 0.2s ease;
    }

    h1, h2, h3, h4, th {
      text-wrap: balance;
      margin-block: 0;
    }

    p, li {
      text-wrap: pretty;
    }

    pre, code {
      font-family: 'JetBrains Mono NF', 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace;
      font-feature-settings: 'calt' 1, 'liga' 1;
      font-variant-ligatures: normal;
    }

    .ui-icon {
      flex-shrink: 0;
      display: inline-block;
      vertical-align: middle;
      user-select: none;
      -webkit-user-select: none;
      pointer-events: none;
    }

    /* Text links: transparent underline by default, fades in to solid currentColor on hover */
    .text-link {
      color: var(--c-text-1);
      text-decoration: none;
      border-block-end: 1px solid transparent;
      transition: border-color 0.2s ease;
    }

    .text-link:hover {
      border-block-end-color: currentColor;
    }

    /* Sticky Header & VitePress-Style Text Navigation */
    .site-header {
      view-transition-name: site-header;
      position: sticky;
      inset-block-start: 0;
      z-index: 20;
      background: var(--c-nav-bg);
      border-block-end: 1px solid var(--c-divider);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      user-select: none;
      -webkit-user-select: none;
    }

    .header-inner {
      max-inline-size: 1180px;
      margin-inline: auto;
      padding: 12px clamp(16px, 3.5vw, 32px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .brand-link {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      text-decoration: none;
      color: var(--c-text-1);
      font-weight: 700;
      font-size: 1rem;
      flex-shrink: 0;
    }

    .brand-mark {
      inline-size: 26px;
      block-size: 26px;
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #818cf8 0%, #4f46e5 100%);
      color: #ffffff;
    }

    .site-nav {
      display: flex;
      align-items: center;
      gap: 2px;
      overflow-x: auto;
      scrollbar-width: none;
      margin-inline-start: auto;
    }

    .nav-link {
      display: inline-flex;
      align-items: center;
      text-decoration: none;
      color: var(--c-text-1);
      font-size: 0.875rem;
      font-weight: 500;
      padding: 4px 11px;
      white-space: nowrap;
      transition: color 0.25s ease;
    }

    .nav-link:hover {
      color: var(--c-brand-1);
    }

    .nav-link.is-active {
      color: var(--c-brand-1);
    }

    /* VitePress-Style Theme Switch & Social Link */
    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .theme-switch {
      position: relative;
      display: inline-flex;
      align-items: center;
      inline-size: 40px;
      block-size: 22px;
      flex-shrink: 0;
      border-radius: 11px;
      border: 1px solid var(--c-divider);
      background: var(--c-switch-bg);
      cursor: pointer;
      padding: 0;
      transition: border-color 0.25s ease, background-color 0.25s ease;
    }

    .theme-switch:hover {
      border-color: var(--c-text-3);
    }

    .theme-switch-thumb {
      position: absolute;
      inset-block-start: 1px;
      inset-inline-start: 1px;
      inline-size: 18px;
      block-size: 18px;
      border-radius: 50%;
      background: var(--c-switch-thumb-bg);
      color: var(--c-text-2);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: translate 0.25s ease, background-color 0.25s ease, color 0.25s ease;
    }

    .theme-switch:hover .theme-switch-thumb {
      color: var(--c-text-1);
    }

    /* Slide thumb right and swap sun/moon icon in dark mode without requiring JS */
    .theme-label-dark { display: none; }
    .theme-label-light { display: inline-flex; }
    @media (prefers-color-scheme: dark) {
      .theme-label-dark { display: inline-flex; }
      .theme-label-light { display: none; }
      .theme-switch-thumb { translate: 18px 0; }
    }
    :root:has(> head > meta[name="color-scheme"][content="dark"]) .theme-label-dark { display: inline-flex; }
    :root:has(> head > meta[name="color-scheme"][content="dark"]) .theme-label-light { display: none; }
    :root:has(> head > meta[name="color-scheme"][content="dark"]) .theme-switch-thumb { translate: 18px 0; }
    :root:has(> head > meta[name="color-scheme"][content="light"]) .theme-label-dark { display: none; }
    :root:has(> head > meta[name="color-scheme"][content="light"]) .theme-label-light { display: inline-flex; }
    :root:has(> head > meta[name="color-scheme"][content="light"]) .theme-switch-thumb { translate: 0 0; }

    .header-divider {
      inline-size: 1px;
      block-size: 24px;
      background: var(--c-divider);
      pointer-events: none;
    }

    .gh-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 32px;
      block-size: 32px;
      color: var(--c-text-2);
      text-decoration: none;
      transition: color 0.2s ease;
    }

    .gh-link:hover {
      color: var(--c-text-1);
    }

    @media (max-width: 860px) {
      .site-nav {
        order: 3;
        inline-size: 100%;
        margin-inline-start: 0;
        padding-block-start: 8px;
        border-block-start: 1px solid var(--c-border-subtle);
      }

      .header-actions > .header-divider:first-child {
        display: none;
      }
    }

    /* Main Content Container */
    .page-main {
      flex: 1;
      inline-size: 100%;
      max-inline-size: 1180px;
      margin-inline: auto;
      padding: clamp(32px, 5vw, 52px) clamp(16px, 3.5vw, 32px) 84px;
    }

    /* Hero Banner */
    .hero {
      position: relative;
      overflow: hidden;
      container-type: inline-size;
      background: var(--c-bg-soft);
      border: 1px solid var(--c-divider);
      border-radius: 14px;
      padding: clamp(28px, 4.5vw, 44px);
      margin-block-end: 44px;
    }

    .hero-title {
      position: relative;
      font-size: clamp(1.65rem, 1.2rem + 2vw, 2.45rem);
      font-weight: 800;
      letter-spacing: -0.025em;
      line-height: 1.22;
      margin-block-end: 12px;
      color: var(--c-text-1);
    }

    .hero-gradient-text {
      color: var(--c-brand-1);
    }

    .hero-lead {
      position: relative;
      font-size: clamp(0.95rem, 0.9rem + 0.25vw, 1.05rem);
      color: var(--c-text-2);
      max-inline-size: 66ch;
      margin-block: 0 22px;
    }

    .hero-lead code {
      color: var(--c-brand-1);
      background: var(--c-brand-soft);
      border: 1px solid color-mix(in srgb, var(--c-brand-1) 24%, transparent);
      padding: 1px 6px;
      border-radius: 5px;
      font-size: 0.88em;
    }

    .hero-cta-row {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      user-select: none;
      -webkit-user-select: none;
    }

    .btn-primary, .btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 16px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      user-select: none;
      -webkit-user-select: none;
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
    }

    .btn-primary {
      background: var(--c-btn-brand-bg);
      color: var(--c-btn-brand-text);
      border: 1px solid color-mix(in srgb, var(--c-brand-2), transparent 40%);
    }

    .btn-secondary {
      background: var(--c-border);
      color: var(--c-text-1);
      border: 1px solid var(--c-divider);
    }

    .btn-primary:hover {
      background: var(--c-btn-brand-hover-bg);
      box-shadow: 0 0 14px color-mix(in srgb, var(--base-brand) 32%, transparent);
    }

    .btn-secondary:hover {
      border-color: var(--c-brand-border);
      background: color-mix(in srgb, var(--c-text-1), var(--c-border) 94%);
    }

    /* Feature Highlights Grid (Matching python-lib-xulbux VPFeature) */
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
      gap: 18px;
      margin-block-end: 60px;
    }

    .feature-card {
      background: var(--c-bg-soft);
      border: 1px solid var(--c-border);
      border-radius: 12px;
      padding: 20px 22px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .feature-icon {
      width: fit-content;
      height: auto;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      color: var(--c-brand-1);
      margin-block-end: 4px;
    }

    .feature-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--c-text-1);
    }

    .feature-desc {
      margin: 0;
      font-size: 0.84rem;
      color: var(--c-text-2);
      line-height: 1.55;
    }

    /* Section Headers & Spacious Subsections */
    .doc-section {
      margin-block-end: 60px;
      scroll-margin-block-start: 90px;
    }

    .section-header {
      margin-block-end: 28px;
    }

    .section-title {
      font-size: clamp(1.35rem, 1.1rem + 0.8vw, 1.65rem);
      font-weight: 700;
      letter-spacing: -0.015em;
      margin-block-end: 8px;
      color: var(--c-text-1);
    }

    .section-desc {
      margin-block: 0;
      color: var(--c-text-2);
      font-size: 0.925rem;
      max-inline-size: 72ch;
    }

    .section-desc code,
    .section-title code,
    .section-subhead code {
      color: color-mix(in srgb, var(--c-text-2), var(--c-text-1) 50%);
      background: var(--c-code-bg);
      border: 1px solid var(--c-border-subtle);
      padding: 1px 6px;
      border-radius: 5px;
      font-size: 0.86em;
    }

    .section-subhead {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 1.05rem;
      font-weight: 700;
      margin-block: 52px 18px;
      color: var(--c-text-1);
    }

    .section-subhead .ui-icon {
      color: var(--c-brand-1);
    }

    .route-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-block: 16px 0;
    }

    .route-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: var(--c-bg-soft);
      color: var(--c-text-1);
      border: 1px solid var(--c-border);
      padding: 5px 11px;
      border-radius: 7px;
      font-size: 0.78rem;
      overflow-x: auto;
      max-inline-size: 100%;
    }

    .route-method {
      color: var(--c-brand-1);
      font-weight: 700;
      font-size: 0.7rem;
      user-select: none;
      -webkit-user-select: none;
    }

    /* Responsive Card Grids & Hierarchical Cards */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
      gap: 20px;
    }

    .card-grid-3 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
      gap: 20px;
    }

    .table-wrapper + .card-grid,
    .table-wrapper + .card-grid-3 {
      margin-block-start: 40px;
    }

    .card-grid-3 + .card-grid,
    .card-grid + .card-grid {
      margin-block-start: 20px;
    }

    .card-container {
      container-type: inline-size;
    }

    /* Outer Card: Distinct divider border + soft surface */
    .card {
      background: var(--c-bg-soft);
      border: 1px solid var(--c-divider);
      border-radius: 12px;
      padding: clamp(18px, 2.5vw, 24px);
      display: flex;
      flex-direction: column;
      gap: 16px;
      block-size: 100%;
    }

    .card-head {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .card-title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
      font-size: 0.94rem;
      font-weight: 700;
      color: var(--c-text-1);
      line-height: 1.35;
    }

    .card-title-text {
      color: var(--c-text-1);
    }

    .card-title-code {
      font-size: 0.76rem;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 6px;
      color: var(--c-brand-1);
      background: var(--c-brand-soft);
      border: 1px solid color-mix(in srgb, var(--c-brand-1) 28%, transparent);
    }

    .card-title-meta {
      font-size: 0.74rem;
      font-weight: 500;
      padding: 1px 7px;
      border-radius: 5px;
      color: var(--c-text-2);
      background: var(--c-bg);
      border: 1px solid var(--c-border-subtle);
    }

    .card-title-pill {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: calc(infinity * 1px);
      color: var(--c-text-2);
      background: var(--c-bg);
      border: 1px solid var(--c-border-subtle);
      user-select: none;
      -webkit-user-select: none;
    }

    .card-subtitle {
      font-size: 0.825rem;
      color: var(--c-text-2);
      margin-block: 0;
      line-height: 1.48;
    }

    /* Inner Preview Stage: Subtle border and non-interactable SVG previews */
    .preview-stage {
      position: relative;
      background: var(--c-bg);
      border: 1px solid var(--c-border-subtle);
      border-radius: 9px;
      padding: 18px 20px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      overflow-x: auto;
      max-inline-size: 100%;
      user-select: none;
      -webkit-user-select: none;
    }

    .preview-stage.is-centered {
      justify-content: center;
    }

    .preview-stage svg {
      max-inline-size: 100%;
      block-size: auto;
      flex-shrink: 0;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
    }

    /* Expandable <details> Markdown Code Drawer (Subtle inner hierarchy) */
    details.code-drawer {
      margin-block-start: auto;
    }

    details.code-drawer::details-content {
      block-size: 0;
      opacity: 0;
      overflow: clip;
      transition:
        block-size 0.22s ease,
        opacity 0.18s ease,
        content-visibility 0.22s ease allow-discrete;
    }

    details.code-drawer[open]::details-content {
      block-size: auto;
      opacity: 1;
    }

    details.code-drawer > summary {
      list-style: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.76rem;
      font-weight: 600;
      color: var(--c-text-2);
      user-select: none;
      -webkit-user-select: none;
      padding: 5px 11px;
      border-radius: 7px;
      background: var(--c-bg);
      border: 1px solid var(--c-border-subtle);
      transition: color 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
    }

    details.code-drawer > summary::-webkit-details-marker {
      display: none;
    }

    details.code-drawer > summary:hover {
      color: var(--c-text-1);
      border-color: var(--c-brand-border);
      background: color-mix(in srgb, var(--c-brand-1) 6%, var(--c-bg));
    }

    .drawer-chevron {
      display: inline-flex;
      transition: rotate 0.2s ease;
    }

    details.code-drawer[open] .drawer-chevron {
      rotate: 90deg;
    }

    .code-drawer-body {
      margin-block-start: 10px;
      background: var(--c-bg);
      color: var(--c-text-1);
      border: 1px solid var(--c-border-subtle);
      border-radius: 8px;
      padding: 10px 13px;
      overflow: hidden;
    }

    .code-drawer-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-block-end: 4px;
      padding-block-end: 7px;
      border-block-end: 1px solid var(--c-border-subtle);
      user-select: none;
      -webkit-user-select: none;
    }

    .code-drawer-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--c-text-3);
    }

    .code-toolbar-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .scroll-btn {
      inline-size: 22px;
      block-size: 22px;
      border-radius: 5px;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      color: var(--c-text-2);
      background: var(--c-bg-soft);
      border: 1px solid var(--c-border-subtle);
      padding: 0;
      transition: border-color 0.18s ease, color 0.18s ease, opacity 0.18s ease;
    }

    .scroll-btn.is-visible {
      display: inline-flex;
    }

    .scroll-btn:hover:not(.is-disabled) {
      border-color: var(--c-brand-border);
      color: var(--c-text-1);
    }

    .scroll-btn.is-disabled {
      opacity: 0.35;
      cursor: default;
      pointer-events: none;
    }

    .copy-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: var(--c-bg-soft);
      color: var(--c-text-2);
      border: 1px solid var(--c-border-subtle);
      border-radius: 6px;
      padding: 3px 9px;
      font-size: 0.71rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 0.18s ease, color 0.18s ease, background-color 0.18s ease;
    }

    .copy-btn:hover {
      border-color: var(--c-brand-border);
      color: var(--c-text-1);
    }

    .copy-btn.is-copied {
      border-color: var(--c-brand-border);
      color: var(--c-brand-1);
      background: var(--c-brand-soft);
    }

    .copy-btn .icon-check {
      display: none;
    }

    .copy-btn.is-copied .icon-copy {
      display: none;
    }

    .copy-btn.is-copied .icon-check {
      display: inline-block;
    }

    /* Soft-Edge Inner Fade-Out for Code Blocks (Matching python-lib-xulbux website) */
    .code-pre-wrap {
      position: relative;
      overflow: hidden;
      margin-inline: -13px;
      margin-block-end: -10px;
    }

    .code-pre-wrap::after {
      content: '';
      z-index: 2;
      inset: 0;
      position: absolute;
      pointer-events: none;
      box-shadow:
        inset 10px 0 12px -4px var(--c-bg),
        inset -10px 0 12px -4px var(--c-bg);
    }

    .code-pre {
      margin: 0;
      padding: 6px 14px 10px;
      font-size: 0.76rem;
      line-height: 1.55;
      overflow-x: auto;
      white-space: pre;
      color: var(--c-hl-url);
      scrollbar-width: none;
      -webkit-mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 14px,
        black calc(100% - 14px),
        transparent 100%
      );
      mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 14px,
        black calc(100% - 14px),
        transparent 100%
      );
    }

    .code-pre::-webkit-scrollbar {
      display: none;
    }

    /* Markdown Syntax Highlighting Tokens (Isolux Pro Light & Dark) */
    .hl-p {
      color: var(--c-hl-p);
    }

    .hl-op {
      color: var(--c-hl-op);
    }

    .hl-alt {
      color: var(--c-hl-alt);
    }

    .hl-url {
      color: var(--c-hl-url);
    }

    .hl-key {
      color: var(--c-hl-key);
    }

    .hl-val {
      color: var(--c-hl-val);
    }

    .hl-href {
      color: var(--c-hl-href);
    }

    /* Responsive Parameter Reference Tables (Outer divider, subtle inner rows) */
    .table-wrapper {
      overflow: auto;
      max-inline-size: 100%;
      container-type: inline-size;
      background: var(--c-bg-soft);
      border: 1px solid var(--c-divider);
      border-radius: 12px;
      margin-block-end: 0;
    }

    .param-table {
      inline-size: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 0.83rem;
      --label-2: "Values";
      --label-3: "Default";
      --label-4: "Description";
    }

    .param-table thead {
      position: sticky;
      inset-block-start: 0;
      z-index: 1;
      background: var(--c-bg-elv);
      user-select: none;
      -webkit-user-select: none;
    }

    .param-table th, .param-table td {
      text-align: start;
      padding: 10px 15px;
      border-block-end: 1px solid var(--c-border-subtle);
      vertical-align: top;
    }

    .param-table thead th {
      font-size: 0.73rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--c-text-2);
      font-weight: 700;
      border-block-end: 1px solid var(--c-border);
    }

    .param-table tbody tr:last-child th,
    .param-table tbody tr:last-child td {
      border-block-end: none;
    }

    .param-table tbody th {
      font-family: 'JetBrains Mono NF', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-weight: 600;
      color: var(--c-brand-1);
      white-space: nowrap;
      background: var(--c-bg-soft);
    }

    .param-table tbody td {
      color: var(--c-text-2);
    }

    .param-code {
      background: var(--c-bg);
      color: color-mix(in srgb, var(--c-text-2), var(--c-text-1) 65%);
      border: 1px solid var(--c-border-subtle);
      padding: 1px 6px;
      border-radius: 5px;
      font-size: 0.77rem;
    }

    .param-sep {
      color: var(--c-text-3);
      font-weight: 400;
      user-select: none;
      -webkit-user-select: none;
      pointer-events: none;
    }

    .param-note {
      color: var(--c-text-3);
      font-size: 0.76rem;
      user-select: none;
      -webkit-user-select: none;
      pointer-events: none;
    }

    @container (width < 600px) {
      .param-table,
      .param-table thead,
      .param-table tbody,
      .param-table tr,
      .param-table th,
      .param-table td {
        display: block;
      }

      .param-table thead {
        display: none;
      }

      .param-table tbody tr {
        padding: 12px 15px;
        border-block-end: 1px solid var(--c-border-subtle);
      }

      .param-table tbody th {
        position: sticky;
        inset-block-start: 0;
        z-index: 2;
        padding: 0 0 6px;
        border-block-end: none;
      }

      .param-table td {
        padding: 3px 0;
        border-block-end: none;
      }

      .param-table td:nth-child(2)::before {
        content: var(--label-2) ": " / var(--label-2);
        font-weight: 600;
        color: var(--c-text-1);
      }

      .param-table td:nth-child(3)::before {
        content: var(--label-3) ": " / var(--label-3);
        font-weight: 600;
        color: var(--c-text-1);
      }

      .param-table td:nth-child(4)::before {
        content: var(--label-4) ": " / var(--label-4);
        font-weight: 600;
        color: var(--c-text-1);
      }
    }

    /* Section Footer Pager */
    .pager-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-block-start: 32px;
      padding-block-start: 22px;
      border-block-start: 1px solid var(--c-divider);
      user-select: none;
      -webkit-user-select: none;
    }

    /* Site Footer (Matching python-lib-xulbux) */
    .site-footer {
      border-block-start: 1px solid var(--c-divider);
      background: var(--c-bg-soft);
      padding: 24px clamp(16px, 3.5vw, 32px);
      text-align: center;
      user-select: none;
      -webkit-user-select: none;
    }

    .footer-inner {
      max-inline-size: 1180px;
      margin-inline: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    .footer-feedback {
      margin: 0;
      font-size: 0.82rem;
      color: var(--c-text-2);
      line-height: 1.5;
    }

    .footer-meta {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .footer-license, .footer-credit {
      margin: 0;
      font-size: 0.82rem;
      color: var(--c-text-2);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .footer-sparkle {
      color: var(--c-brand-1);
    }

    @media (prefers-reduced-motion: reduce) {
      .drawer-chevron,
      .nav-link,
      .theme-switch,
      .theme-switch-thumb,
      .gh-link,
      .btn-primary,
      .btn-secondary,
      details.code-drawer > summary,
      details.code-drawer::details-content {
        transition: none !important;
      }
    }
  </style>`;
}

/** Render the client-side script for color-scheme toggling, code block scroll buttons, and plain-text clipboard copying. */
function renderClientScript(): string {
  return `<script>
    (function () {
      var meta = document.querySelector('meta[name="color-scheme"]');
      var toggleBtn = document.getElementById('theme-toggle');

      function getSystemScheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }

      function getRenderedScheme() {
        var stored = null;
        try { stored = localStorage.getItem('color-scheme'); } catch {}
        if (stored === 'dark' || stored === 'light') {
          return stored;
        }
        return getSystemScheme();
      }

      if (toggleBtn && meta) {
        toggleBtn.addEventListener('click', function () {
          var current = getRenderedScheme();
          var target = current === 'dark' ? 'light' : 'dark';
          var sys = getSystemScheme();
          if (target === sys) {
            try { localStorage.removeItem('color-scheme'); } catch {}
            meta.content = 'light dark';
          } else {
            try { localStorage.setItem('color-scheme', target); } catch {}
            meta.content = target;
          }
        });
      }

      window.addEventListener('storage', function (event) {
        if (event.key === 'color-scheme' && meta) {
          meta.content = event.newValue || 'light dark';
        }
      });

      function updateScrollButtons(drawer) {
        if (!drawer) return;
        var pre = drawer.querySelector('.code-pre');
        var leftBtn = drawer.querySelector('.scroll-btn-left');
        var rightBtn = drawer.querySelector('.scroll-btn-right');
        if (!pre || !leftBtn || !rightBtn) return;

        var isScrollable = pre.scrollWidth > pre.clientWidth + 1;
        leftBtn.classList.toggle('is-visible', isScrollable);
        rightBtn.classList.toggle('is-visible', isScrollable);
        if (isScrollable) {
          leftBtn.classList.toggle('is-disabled', !(pre.scrollLeft > 0));
          rightBtn.classList.toggle('is-disabled', !(pre.scrollLeft < pre.scrollWidth - pre.clientWidth - 1));
        }
      }

      document.addEventListener('toggle', function (event) {
        var target = event.target;
        if (target && target.classList && target.classList.contains('code-drawer') && target.open) {
          var body = target.querySelector('.code-drawer-body');
          setTimeout(function () { updateScrollButtons(body); }, 30);
        }
      }, true);

      window.addEventListener('resize', function () {
        var openDrawers = document.querySelectorAll('details.code-drawer[open] .code-drawer-body');
        for (var i = 0; i < openDrawers.length; i += 1) {
          updateScrollButtons(openDrawers[i]);
        }
      });

      document.addEventListener('scroll', function (event) {
        var target = event.target;
        if (target && target.classList && target.classList.contains('code-pre')) {
          updateScrollButtons(target.closest('.code-drawer-body'));
        }
      }, true);

      document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || !target.closest) return;

        var scrollBtn = target.closest('.scroll-btn');
        if (scrollBtn) {
          var drawerBody = scrollBtn.closest('.code-drawer-body');
          var scrollPre = drawerBody ? drawerBody.querySelector('.code-pre') : null;
          if (scrollPre) {
            var dir = scrollBtn.classList.contains('scroll-btn-left') ? -240 : 240;
            scrollPre.scrollBy({ behavior: 'smooth', left: dir });
          }
          return;
        }

        var copyBtn = target.closest('.copy-btn');
        if (!copyBtn) return;
        var drawer = copyBtn.closest('.code-drawer-body');
        var pre = drawer ? drawer.querySelector('.code-pre') : null;
        if (!pre || !navigator.clipboard) return;
        var labelSpan = copyBtn.querySelector('.copy-btn-text');
        navigator.clipboard.writeText(pre.textContent || '').then(function () {
          copyBtn.classList.add('is-copied');
          if (labelSpan) labelSpan.textContent = 'Copied';
          setTimeout(function () {
            copyBtn.classList.remove('is-copied');
            if (labelSpan) labelSpan.textContent = 'Copy';
          }, 1500);
        });
      });

      document.addEventListener('copy', function (event) {
        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection || selection.isCollapsed || !event.clipboardData) return;
        var anchor = selection.anchorNode;
        var elem = anchor && anchor.nodeType === 1 ? anchor : (anchor ? anchor.parentElement : null);
        if (elem && elem.closest && elem.closest('.code-pre')) {
          event.clipboardData.setData('text/plain', selection.toString().replace(/\\u00a0/g, ' '));
          event.preventDefault();
        }
      });
    })();
  </script>`;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render an inline UI icon (`<svg class="ui-icon">`) from `lucide-static` or `@iconify-json/simple-icons`.
 * @param slug         Icon slug (e.g., `'sparkles'`, `'copy'`, `'check'`, `'chevron-right'`, `'github'`).
 * @param size         Width and height in pixels (defaults to `16`).
 * @param extraClass   Optional additional CSS class name(s) appended to `ui-icon`.
 * @returns Inline `<svg>` HTML string, or empty string if the slug is not found.
 */
export function renderUiIcon(slug: string, size = 16, extraClass = ''): string {
  return buildUiIcon(slug, size, extraClass);
}

/**
 * Render a showcase card containing live rendered SVGs and an expandable `<details>` Markdown drawer.
 * @param card   Showcase card configuration with items and titles.
 * @returns HTML string for the card wrapped in a container-query context.
 */
export function renderShowcaseCard(card: ShowcaseCardConfig): string {
  let svgsHtml = '';
  const mdLines: string[] = [];

  for (const item of card.items) {
    svgsHtml += `${item.svg}\n`;
    mdLines.push(formatHighlightedMarkdownSnippet(item));
  }

  const stageClass = card.isCentered ? 'preview-stage is-centered' : 'preview-stage';
  const subtitleHtml = card.subtitle
    ? `<p class="card-subtitle">${escapeXml(card.subtitle)}</p>`
    : '';
  const mdBlock = mdLines.join('\n');

  const chevronIcon = buildUiIcon('chevron-right', 14, 'drawer-chevron');
  const leftScrollIcon = buildUiIcon('chevron-left', 14);
  const rightScrollIcon = buildUiIcon('chevron-right', 14);
  const copyIcon = buildUiIcon('copy', 13, 'icon-copy');
  const checkIcon = buildUiIcon('check', 13, 'icon-check');

  return `<div class="card-container">
    <div class="card">
      <div class="card-head">
        <div class="card-title">${formatCardTitleHtml(card.title)}</div>
        ${subtitleHtml}
      </div>
      <div class="${stageClass}">${svgsHtml}</div>
      <details class="code-drawer">
        <summary>${chevronIcon}<span class="drawer-summary-text">View Markdown</span></summary>
        <div class="code-drawer-body">
          <div class="code-drawer-toolbar">
            <span class="code-drawer-label">Markdown</span>
            <div class="code-toolbar-actions">
              <button type="button" class="scroll-btn scroll-btn-left" aria-label="Scroll code left">${leftScrollIcon}</button>
              <button type="button" class="scroll-btn scroll-btn-right" aria-label="Scroll code right">${rightScrollIcon}</button>
              <button type="button" class="copy-btn">${copyIcon}${checkIcon}<span class="copy-btn-text">Copy</span></button>
            </div>
          </div>
          <div class="code-pre-wrap">
            <pre class="code-pre"><code>${mdBlock}</code></pre>
          </div>
        </div>
      </details>
    </div>
  </div>`;
}

/**
 * Render a responsive parameter reference table that transforms into labeled cards on narrow containers.
 * @param rows   Array of parameter rows to display.
 * @returns HTML string for the responsive table wrapper.
 */
export function renderParamTable(rows: readonly ParamTableRow[]): string {
  let bodyRowsHtml = '';
  for (const row of rows) {
    bodyRowsHtml += `<tr>
      <th scope="row">${escapeXml(row.name)}</th>
      <td>${formatParamCellHtml(row.values)}</td>
      <td>${formatParamCellHtml(row.defaultVal)}</td>
      <td>${escapeXml(row.description)}</td>
    </tr>`;
  }

  return `<div class="table-wrapper">
    <table class="param-table">
      <thead>
        <tr>
          <th scope="col">Parameter</th>
          <th scope="col">Values</th>
          <th scope="col">Default</th>
          <th scope="col">Description</th>
        </tr>
      </thead>
      <tbody>${bodyRowsHtml}</tbody>
    </table>
  </div>`;
}

/**
 * Render a list of route pattern pills (`GET /badge/...`).
 * @param patterns   Array of route path strings.
 * @returns HTML string for the route pattern pill strip.
 */
export function renderRoutePills(patterns: readonly string[]): string {
  let pillsHtml = '';
  for (const pattern of patterns) {
    pillsHtml += `<code class="route-pill"><span class="route-method">GET</span><span class="route-path">${escapeXml(pattern)}</span></code>`;
  }
  return `<div class="route-pills">${pillsHtml}</div>`;
}

/**
 * Render the standalone `32x32` SVG favicon matching the navbar brand mark (indigo gradient squircle with Lucide `sparkles`).
 * @returns Standalone `<svg>` XML string.
 */
export function renderFaviconSvg(): string {
  const resolved = resolveIcon('sparkles');
  const innerSvg = resolved ? resolved.innerSvg : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#4f46e5" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="8" fill="url(#bg)" />
  <g transform="translate(6 6) scale(0.8333)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${innerSvg}</g>
</svg>`;
}

/**
 * Render the complete HTML document shell with FOUC-free color-scheme support, view transitions, and responsive navigation.
 * @param options   Page layout options (`activePage`, `title`, `description`, `bodyHtml`).
 * @returns Complete HTML document string.
 */
export function renderPageLayout(options: PageLayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <script blocking="render">try{document.querySelector('meta[name="color-scheme"]').content=localStorage.getItem("color-scheme")??"light dark";}catch{}</script>
  <link rel="expect" href="#main-content" blocking="render" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <meta name="description" content="${escapeXml(options.description)}" />
  <title>${escapeXml(options.title)}</title>
  ${renderStylesheet()}
</head>
<body>
  ${renderHeaderNav(options.activePage)}
  <main class="page-main" id="main-content">
    ${options.bodyHtml}
  </main>
  ${renderFooter()}
  ${renderClientScript()}
</body>
</html>`;
}
