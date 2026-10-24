/**
 * Documentation website tests – HTML validity, accessibility, head metadata, navigation, static assets, client behavior guards, and docs drift guards for the homepage, `/docs`, `/docs/:section`, and `/builder/:kind` pages (`src/site/`).
 */

import siteScript from '@bundles/site.client.js';
import { rasterizeOgSvgToPng } from '@scripts/og/rasterizer';
import { evaluatePaint, flattenSvgPath, parseGradientDefs } from '@scripts/og/svgParser';
import { describe, expect, it } from 'vitest';
import { SERVICES_CONFIG } from '@/config/services';
import { SITE_ORIGIN } from '@/config/site';
import { THEME_COLOR_NAMES } from '@/config/theme';
import { HTML_SECURITY_HEADERS } from '@/routes/http';
import { ICON_MOTION_TOKENS, SIZE_TOKENS } from '@/routes/params';
import { listServiceMetricAliases } from '@/services/fetcher';
import { getSiteAsset } from '@/site/assets';
import { formatCountLowerBound, getIconSetCounts, STACK_EXAMPLE_GROUPS } from '@/site/catalog';
import { formatInlineMarkupHtml, getHeadScriptBody, renderParamTable } from '@/site/components';
import { formatSpecialExamples, formatVariantTierSummary } from '@/site/glossary';
import { jsx } from '@/site/jsx/jsx-runtime';
import { BUILDER_PAGES, buildBuilderPath, buildDocsPath, DOCS_PAGES } from '@/site/navigation';
import {
  renderBuilderHtml,
  renderDocsHtml,
  renderHomeHtml,
  renderNotFoundHtml,
  renderServerErrorHtml,
} from '@/site/pages';
import { DARK_BG, getSiteStylesheet, LIGHT_BG } from '@/site/styles';
import { FALLBACK_ICON_SLUG, ICON_SLUG_ALIASES } from '@/svg/icons';
import { MAX_SPARKLINE_POINTS, MAX_STRIP_TICKS } from '@/svg/renderer';
import { escapeXml } from '@/svg/shared';
import { GROUP_GAP_RATIO } from '@/svg/stack';
import type { SiteClientCore } from '@/types';
import { evaluateClientCore, requireDefined } from './helpers';

// ---------------------------------------- TYPES ----------------------------------------

/** Rendered documentation page with its canonical path. */
interface RenderedPage {
  /** Complete HTML document. */
  html: string;
  /** Canonical path (`/`, `/docs`, `/docs/:section`, or `/builder/:kind`). */
  path: string;
}

/** Metrics and metric aliases listed in a services table row. */
interface ListedMetrics {
  /** Listed metric aliases. */
  aliases: string[];
  /** Listed canonical metrics. */
  metrics: string[];
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches every `id="…"` attribute. */
const ID_ATTRIBUTE_RX = /\sid="(?<id>[^"]+)"/g;

/** Matches every in-page fragment reference (`url(#…)` and `href="#…"`). */
const FRAGMENT_REFERENCE_RX = /(?:url\(#|href="#)(?<id>[^")]+)/g;

/** Matches every `aria-labelledby` / `aria-describedby` ID reference. */
const ARIA_ID_REFERENCE_RX = /aria-(?:labelledby|describedby)="(?<id>[^"]+)"/g;

/** Matches every opening heading tag. */
const HEADING_TAG_RX = /<h(?<level>[1-6])[\s>]/g;

/** Matches HTML tags. */
const HTML_TAG_RX = /<[^>]+>/g;

/** Matches every top navigation link (`href` and active state). */
const NAV_LINK_RX = /<a href="(?<href>[^"]+)" class="nav-link(?<active> is-active)?"/g;

/** Matches every primary or secondary call-to-action link (`href` and button kind). */
const CTA_LINK_RX =
  /<a href="(?<href>[^"]+)" class="(?<kind>btn-primary|btn-secondary)" tabindex="0">/g;

/** Matches every sidebar link (`href`, active state, and label). */
const SIDEBAR_LINK_RX =
  /<a href="(?<href>[^"]+)" class="sidebar-link(?<active> is-active)?"[^>]*>(?<label>[^<]+)<\/a>/g;

/** Matches the header's sidebar drawer toggle and its current page label. */
const SIDEBAR_TOGGLE_RX =
  /<button type="button" class="sidebar-toggle" popovertarget="sidebar-drawer"[^>]*>[\s\S]*?<span class="sidebar-toggle-label"[^>]*>(?<label>[^<]*)<\/span>/;

/** Matches class names that were removed from the markup because no stylesheet or script uses them. */
const DEAD_CLASS_RX =
  /class="(?:[^"]*\s)?(?:nav-text|brand-name|brand-sparkle|theme-icon|gh-icon|footer-from|btn-label|btn-icon-left|btn-icon-right|drawer-summary-text|route-path|sidebar-group-label|subhead-text|sidebar-nav|card-grid-3|hero-gradient-text|stack-chip-label|feature-icon|builder-panel-inner)[\s"]/;

/** Matches every `var(--c-…)` custom property reference. */
const COLOR_TOKEN_USAGE_RX = /var\((?<name>--c-[\w-]+)/g;

/** Matches every `--c-…:` custom property definition. */
const COLOR_TOKEN_DEFINITION_RX = /(?<name>--c-[\w-]+):/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Render the homepage, every documentation page, and every builder page. */
function renderAllPages(): RenderedPage[] {
  const pages: RenderedPage[] = [{ html: renderHomeHtml(), path: '/' }];
  for (const page of DOCS_PAGES) {
    pages.push({ html: renderDocsHtml(page.slug), path: buildDocsPath(page.slug) });
  }
  for (const page of BUILDER_PAGES) {
    pages.push({ html: renderBuilderHtml(page.kind), path: buildBuilderPath(page.kind) });
  }
  return pages;
}

/** Read the site script asset source. */
function readSiteScript(): string {
  return getSiteAsset('site.js')?.body ?? '';
}

/** Evaluate the site script without a DOM and return its exposed pure helpers. */
function loadSiteCore(): SiteClientCore {
  return evaluateClientCore<SiteClientCore>(siteScript, 'svgSiteCore');
}

/** Collect a named capture group of every match. */
function collectGroups(html: string, pattern: RegExp, groupName: string): string[] {
  const values: string[] = [];
  for (const match of html.matchAll(pattern)) {
    values.push(match.groups?.[groupName] ?? '');
  }
  return values;
}

/** Extract the service reference table row of a service key (`<tr>…</tr>`). */
function extractServiceRow(servicesHtml: string, key: string): string {
  const rowStart = servicesHtml.indexOf(`<th scope="row" role="rowheader">/badge/${key}/`);
  expect(rowStart, key).toBeGreaterThan(-1);
  return servicesHtml.slice(rowStart, servicesHtml.indexOf('</tr>', rowStart));
}

/** Parse the metrics and `metric (alias, alias)` notes listed in a services table row's `Values` cell. */
function collectListedMetrics(row: string): ListedMetrics {
  const valuesCell = (row.split('<td role="cell">')[1] ?? '').replace(HTML_TAG_RX, '').trim();
  const listed: ListedMetrics = { aliases: [], metrics: [] };
  for (const token of valuesCell.split(' | ')) {
    const aliasIndex = token.indexOf(' (');
    if (aliasIndex === -1) {
      listed.metrics.push(token);
    } else {
      listed.metrics.push(token.slice(0, aliasIndex));
      listed.aliases.push(...token.slice(aliasIndex + 2, -1).split(', '));
    }
  }
  return listed;
}

// ----------------------------------------- MAIN ----------------------------------------

/************************************ HTML validity *************************************/

describe('documentation pages – HTML validity', () => {
  it('never repeats an element ID on a page (regression: inlined previews duplicated bg-dark, grad-*, sheen-*)', () => {
    for (const page of renderAllPages()) {
      const ids = collectGroups(page.html, ID_ATTRIBUTE_RX, 'id');
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      expect(duplicates, page.path).toEqual([]);
      expect(ids.length, page.path).toBeGreaterThan(0);
    }
  });

  it('resolves every url(#…), href="#…", and ARIA ID reference to an element on the same page', () => {
    for (const page of renderAllPages()) {
      const ids = new Set(collectGroups(page.html, ID_ATTRIBUTE_RX, 'id'));
      for (const reference of collectGroups(page.html, FRAGMENT_REFERENCE_RX, 'id')) {
        expect(ids.has(reference), `${page.path} #${reference}`).toBe(true);
      }
      // ARIA references are space-separated ID lists (e.g., a dropdown labeled by its field label and value):
      for (const references of collectGroups(page.html, ARIA_ID_REFERENCE_RX, 'id')) {
        for (const reference of references.split(' ')) {
          expect(ids.has(reference), `${page.path} aria → ${reference}`).toBe(true);
        }
      }
    }
  });

  it('scopes inline preview SVG IDs per card instance instead of rewriting the renderers', () => {
    const colorsHtml = renderDocsHtml('colors');
    expect(colorsHtml).not.toContain('id="bg-dark"');
    expect(colorsHtml).not.toContain('url(#bg-dark)');
    expect(colorsHtml).toMatch(/id="p[\da-z]+-\d+-bg-dark"/);
  });

  it('renders exactly one <h1> per page and never skips a heading level', () => {
    for (const page of renderAllPages()) {
      const levels = collectGroups(page.html, HEADING_TAG_RX, 'level').map(Number);
      expect(
        levels.filter((level) => level === 1),
        page.path
      ).toHaveLength(1);
      expect(levels[0], page.path).toBe(1);
      for (const [i, level] of levels.entries()) {
        const previousLevel = levels[i - 1];
        if (previousLevel !== undefined) {
          expect(level - previousLevel, `${page.path} heading ${i}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('escapes parameter table content and renders alias and note micro-syntax', () => {
    const tableHtml = renderParamTable(
      [
        {
          defaultVal: 'round(gap × 3.25) (groupgap)',
          description: '<script>alert(1)</script>',
          name: '?x= / ?y=',
          values: 'v | license [l] | 1 to 4',
        },
      ],
      'Test <parameters>'
    );
    expect(tableHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(tableHtml).not.toContain('<script>');
    expect(tableHtml).toContain('aria-label="Test &lt;parameters&gt;"');
    expect(tableHtml).toContain(
      '<th scope="row" role="rowheader">?x=<span class="param-sep"> / </span>?y=</th>'
    );
    expect(tableHtml).toContain('license <span class="param-alias">(l)</span>');
    expect(tableHtml).toContain('1<span class="param-sep"> to </span>4');
    expect(tableHtml).toContain(
      '<code class="param-code">round(gap × 3.25)</code> <span class="param-note">(groupgap)</span>'
    );
  });
});

/************************************ Accessibility *************************************/

describe('documentation pages – accessibility', () => {
  it('exposes the theme switch state via aria-checked, starts the body with a skip link, and puts every link in the Tab order (incl. Vivaldi/Safari)', () => {
    for (const page of renderAllPages()) {
      expect(page.html, page.path).toMatch(/role="switch" aria-checked="(?:true|false)"/);
      expect(page.html, page.path).toMatch(
        /<body(?: class="has-sidebar")?>\s*<a class="skip-link" href="#main-content" tabindex="0">/
      );
      expect(page.html, page.path).toContain('id="main-content" tabindex="-1"');
      for (const match of page.html.matchAll(/<a\s[^>]+>/g)) {
        if (match[0].includes('href=')) {
          expect(match[0], `${page.path}: ${match[0]}`).toContain('tabindex="0"');
        }
      }
    }
  });

  it('makes every scrollable code block and parameter table keyboard-focusable with an accessible name', () => {
    const badgesHtml = renderDocsHtml('badges');
    const codeBlockCount = badgesHtml.split('<pre class="code-pre"').length - 1;
    expect(codeBlockCount).toBeGreaterThan(0);
    expect(
      badgesHtml.split('<pre class="code-pre" tabindex="0" role="region" aria-label="').length - 1
    ).toBe(codeBlockCount);
    expect(badgesHtml).toContain(
      '<div class="table-wrapper" tabindex="0" role="region" aria-label="'
    );
  });

  it('announces copy feedback and describes each copy button by its card title', () => {
    const buttonsHtml = renderDocsHtml('buttons');
    expect(buttonsHtml).toMatch(/class="copy-btn" aria-describedby="[\w-]+-title"/);
    expect(buttonsHtml).toContain(
      '<span class="visually-hidden" data-copy-label aria-live="polite">Copy</span>'
    );
    expect(buttonsHtml).not.toContain('code-drawer-toolbar');
    expect(buttonsHtml).not.toContain('code-drawer-label');
  });

  it('adds deep-link anchors to section subheads and cards', () => {
    const badgesHtml = renderDocsHtml('badges');
    expect(badgesHtml).toContain(
      '<div class="subhead-row" id="visual-hierarchy-variants-variant">'
    );
    expect(badgesHtml).toContain('href="#visual-hierarchy-variants-variant"');
    expect(badgesHtml).toContain(
      '<div class="card-container" id="variant-1-primary-badge-default">'
    );
    expect(badgesHtml).toContain('href="#variant-1-primary-badge-default"');
  });

  it('raises --c-text-3 to WCAG AA contrast and keeps the footer text selectable', () => {
    const css = getSiteStylesheet();
    expect(css).toContain('--c-text-3: #646464;');
    expect(css).toContain('--c-text-3: #8A8A8A;');
    expect(css).not.toMatch(/\.site-footer \{[^}]*user-select/);
    expect(css).toMatch(/:where\(a, button, summary, \[tabindex\]\):focus-visible/);
  });

  it('stops all CSS motion and pauses SMIL previews at their readable rest frame under prefers-reduced-motion', () => {
    expect(getSiteStylesheet()).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^]*?\*,\s*\*::before,\s*\*::after \{\s*transition: none !important;\s*animation: none !important;/
    );
    const script = readSiteScript();
    expect(script).toContain('previewSvg.pauseAnimations()');
    expect(script).toContain('previewSvg.dataset.restTime');
    expect(script).toContain("reducedMotionQuery.matches ? 'auto' : 'smooth'");
    expect(renderHomeHtml()).toContain('data-rest-time="');
  });

  it('wires builder hints and validation messages via aria-describedby, aria-invalid, and valid aria-required attributes', () => {
    const badgeBuilderHtml = renderBuilderHtml('badge');
    expect(badgeBuilderHtml).toContain('id="field-value-hint"');
    expect(badgeBuilderHtml).toContain('aria-describedby="field-value-hint"');
    expect(badgeBuilderHtml).toContain('id="field-icon-left-validation"');
    expect(badgeBuilderHtml).toContain('aria-describedby="field-icon-left-validation"');
    expect(renderBuilderHtml('icon')).toContain('aria-describedby="field-icon-main-validation"');
    expect(renderBuilderHtml('typing')).toContain(
      'aria-describedby="field-icon-main-validation field-icon-hint"'
    );
    expect(badgeBuilderHtml).toContain(
      'class="select-empty" data-select-empty role="status" aria-live="polite" hidden'
    );

    const stackBuilderHtml = renderBuilderHtml('stack');
    expect(stackBuilderHtml).toContain('aria-describedby="field-groups-validation"');
    expect(stackBuilderHtml).toContain(
      'class="select-empty stack-catalog-empty" id="stack-catalog-empty" role="status" aria-live="polite" hidden'
    );

    const builderJs = getSiteAsset('builder.js')?.body ?? '';
    expect(builderJs).toContain("setAttribute('aria-required', 'true')");
    expect(builderJs).toContain("removeAttribute('aria-required')");
    expect(builderJs).not.toContain("toggleAttribute('aria-required'");
    expect(builderJs).toContain("setAttribute('aria-invalid', 'true')");
    expect(builderJs).toContain("removeAttribute('aria-invalid')");
    expect(builderJs).toContain("key === 'Home'");
    expect(builderJs).toContain("key === 'End'");
  });
});

/********************************* Head & client script *********************************/

describe('documentation pages – head metadata & client script', () => {
  it('renders a canonical URL, raster OpenGraph card, font preloads, BreadcrumbList JSON-LD, and a unique meta description per page', () => {
    const descriptions = new Set<string>();
    for (const page of renderAllPages()) {
      expect(page.html, page.path).toContain(
        `<link rel="canonical" href="${SITE_ORIGIN}${page.path}" />`
      );
      expect(page.html, page.path).toContain(
        '<link rel="sitemap" type="application/xml" href="/sitemap.xml" />'
      );
      expect(page.html, page.path).toContain(
        '<link rel="preload" href="/assets/Geist-Regular.ttf" as="font" type="font/ttf" crossorigin="anonymous" />'
      );
      expect(page.html, page.path).toContain(
        '<link rel="preload" href="/assets/Geist-Bold.ttf" as="font" type="font/ttf" crossorigin="anonymous" />'
      );
      expect(page.html, page.path).toContain(
        `<meta property="og:url" content="${SITE_ORIGIN}${page.path}" />`
      );
      expect(page.html, page.path).toContain('<meta property="og:locale" content="en_US" />');
      expect(page.html, page.path).toContain('<meta property="og:title" content="');
      expect(page.html, page.path).toContain(
        `<meta property="og:image" content="${SITE_ORIGIN}/og.png" />`
      );
      expect(page.html, page.path).toContain(
        '<meta property="og:image:type" content="image/png" />'
      );
      expect(page.html, page.path).toContain(
        `<meta name="twitter:image" content="${SITE_ORIGIN}/og.png" />`
      );
      expect(page.html, page.path).toContain(
        '<meta name="twitter:card" content="summary_large_image" />'
      );
      expect(page.html, page.path).toContain('media="(prefers-color-scheme: dark)"');
      const jsonLd =
        /<script type="application\/ld\+json">(?<json>[^<]+)<\/script>/.exec(page.html)?.groups
          ?.json ?? '';
      expect(jsonLd, page.path).toContain('"@context":"https://schema.org"');
      if (page.path !== '/') {
        expect(jsonLd, page.path).toContain('"@type":"BreadcrumbList"');
      }
      expect(() => JSON.parse(jsonLd) as unknown, page.path).not.toThrow();
      const description = /<meta name="description" content="(?<content>[^"]+)"/.exec(page.html)
        ?.groups?.content;
      expect(description, page.path).toMatch(/\S/);
      descriptions.add(description ?? '');
    }
    expect(descriptions.size).toBe(DOCS_PAGES.length + BUILDER_PAGES.length + 1);
    expect(renderDocsHtml('badges')).not.toContain('Interactive SVG preview studio');
  });

  it('keeps the HTML Content-Security-Policy SHA-256 hash synchronized with the inline head script and renders accessible 404 and 500 status pages without canonical metadata (drift guard)', async () => {
    const scriptBytes = new TextEncoder().encode(getHeadScriptBody());
    const digestBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
    const digestBase64 = btoa(String.fromCodePoint(...new Uint8Array(digestBuffer)));
    expect(HTML_SECURITY_HEADERS['Content-Security-Policy']).toContain(`'sha256-${digestBase64}'`);

    const statusPages: readonly [html: string, titleHeading: string][] = [
      [renderNotFoundHtml(), '<span class="hero-accent">404</span> Page Not Found'],
      [renderServerErrorHtml(), '<span class="hero-accent">500</span> Internal Server Error'],
    ];
    for (const [statusHtml, titleHeading] of statusPages) {
      expect(statusHtml).toContain(titleHeading);
      expect(statusHtml).toContain('Back to Home');
      expect(statusHtml).toContain('<meta name="robots" content="noindex" />');
      expect(statusHtml).not.toContain('rel="canonical"');
      expect(statusHtml).not.toContain('property="og:url"');
      expect(statusHtml).not.toContain('<script type="application/ld+json">');
      const ctaLinks = collectGroups(statusHtml, CTA_LINK_RX, 'href');
      expect(ctaLinks).toEqual(['/']);
      const ids = collectGroups(statusHtml, ID_ATTRIBUTE_RX, 'id');
      expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
      for (const anchorMatch of statusHtml.matchAll(/<a\s[^>]*href="[^"]+"[^>]*>/g)) {
        expect(anchorMatch[0]).toContain('tabindex="0"');
      }
    }
  });

  it('only applies whitelisted stored color schemes and preview backgrounds (regression: any localStorage value reached the meta tag)', () => {
    const html = renderHomeHtml();
    const script = readSiteScript();
    expect(html).not.toContain('localStorage.getItem("color-scheme")??');
    expect(html).toContain("if(storedScheme==='dark'||storedScheme==='light')");
    expect(script).toContain("return value === 'dark' || value === 'light' ? value : undefined;");
    expect(script).toContain(
      "typeof value === 'string' && siteConfig.previewBgValues.includes(value)"
    );
    expect(script).not.toContain('event.newValue ||');
    expect(html).not.toContain('<script blocking="render">');
  });

  it('renders one persisted preview background toggle switch per page in the header', () => {
    for (const page of renderAllPages()) {
      const headerHtml = page.html.slice(
        page.html.indexOf('<header class="site-header">'),
        page.html.indexOf('</header>')
      );
      expect(headerHtml.split('id="preview-bg-toggle"').length - 1, page.path).toBe(1);
      expect(headerHtml, page.path).toContain(
        'class="bg-toggle" id="preview-bg-toggle" role="switch" aria-checked="false"'
      );
      expect(headerHtml, page.path).toContain('<span class="bg-swatch" aria-hidden="true"></span>');
      expect(headerHtml, page.path).not.toContain('id="bg-picker-menu"');
      expect(page.html, page.path).toContain('"previewBgValues":["auto","inverse"]');
    }
  });

  it('inverts the checker preview stage and Edit chip relative to the page scheme instead of offering redundant fixed dark/light stages', () => {
    const css = getSiteStylesheet();
    expect(css).toContain('--c-preview-inverse-bg: light-dark(#101010, #FFFFFF);');
    expect(css).toContain('--c-preview-inverse-btn-bg: light-dark(#DCDCDC, #242424);');
    expect(css).toContain('--c-preview-inverse-btn-text: light-dark(#000000, #FAFAFA);');
    expect(css).toMatch(
      /:root\[data-preview-bg=['"]inverse['"]\] \.preview-stage \{\s*--c-btn-bg: var\(--c-preview-inverse-btn-bg\);\s*--c-btn-text: var\(--c-preview-inverse-btn-text\);\s*--stage-bg: var\(--c-preview-inverse-bg\);\s*--stage-checker: light-dark\(/
    );
    expect(css).not.toMatch(/data-preview-bg=['"]checker['"]/);
    expect(css).not.toMatch(/data-preview-bg=['"]dark['"]/);
    expect(css).not.toMatch(/data-preview-bg=['"]light['"]/);
  });

  it('memoizes rendered pages per isolate', () => {
    expect(renderDocsHtml('stack')).toBe(renderDocsHtml('stack'));
    expect(renderHomeHtml()).toBe(renderHomeHtml());
  });
});

/********************************* Navigation & assets **********************************/

describe('documentation pages – navigation & static assets', () => {
  it('makes the Builder the primary homepage call to action and the docs the secondary one (regression: docs-first hero)', () => {
    const html = renderHomeHtml();
    const heroHtml = html.slice(html.indexOf('class="hero-cta-row"'), html.indexOf('</section>'));
    const endHtml = html.slice(html.indexOf('class="pager-row is-end"'));
    for (const ctaHtml of [heroHtml, endHtml]) {
      const links: string[] = [];
      for (const match of ctaHtml.matchAll(CTA_LINK_RX)) {
        links.push(`${match.groups?.kind ?? ''} ${match.groups?.href ?? ''}`);
      }
      expect(links).toContain(`btn-primary ${buildBuilderPath('badge')}`);
      expect(links).toContain(`btn-secondary ${buildDocsPath('overview')}`);
      expect(links.filter((link) => link.startsWith('btn-primary'))).toHaveLength(1);
    }
  });

  it('renders highlight cards right below the hero, hides their detail text on narrow screens, and keeps live endpoint previews above the bottom CTA row', () => {
    const html = renderHomeHtml();
    const heroIndex = html.indexOf('<section class="hero">');
    const highlightsIndex = html.indexOf('<section class="feature-grid" aria-label="Highlights">');
    const endpointsIndex = html.indexOf('<section class="doc-section" id="endpoints">');
    const pagerIndex = html.indexOf('<div class="pager-row is-end">');
    expect(heroIndex).toBeGreaterThan(-1);
    expect(highlightsIndex).toBeGreaterThan(heroIndex);
    expect(endpointsIndex).toBeGreaterThan(highlightsIndex);
    expect(pagerIndex).toBeGreaterThan(endpointsIndex);
    expect(
      html.split('<h2 class="feature-title"><svg class="ui-icon"').length - 1
    ).toBeGreaterThanOrEqual(4);
    expect(html).not.toContain('feature-icon');
    expect(getSiteStylesheet()).toMatch(
      /@media \(max-width: 640px\) \{[\s\S]*?\.feature-desc \{\s*display: none;\s*\}/
    );
  });

  it('renders exactly three header tabs and marks the active one with aria-current', () => {
    const expectedActive: Readonly<Record<string, string>> = {
      '/': '/',
      '/builder/badge': '/builder/badge',
      '/builder/typing': '/builder/badge',
      '/docs': '/docs',
      '/docs/colors': '/docs',
    };
    for (const page of renderAllPages()) {
      const headerHtml = page.html.slice(0, page.html.indexOf('</header>'));
      const navHrefs = collectGroups(headerHtml, NAV_LINK_RX, 'href');
      expect(navHrefs, page.path).toEqual(['/', '/builder/badge', '/docs']);
      const activeHrefs: string[] = [];
      for (const match of headerHtml.matchAll(NAV_LINK_RX)) {
        if (match.groups?.active) {
          activeHrefs.push(match.groups.href ?? '');
        }
      }
      expect(activeHrefs, page.path).toHaveLength(1);
      const expected = expectedActive[page.path];
      if (expected) {
        expect(activeHrefs[0], page.path).toBe(expected);
      }
      expect(headerHtml, page.path).toContain('<a href="/docs" class="nav-link');
    }
  });

  it('lists every docs page and builder page exactly once in its grouped sidebar with one active link', () => {
    const docsHrefs = DOCS_PAGES.map((page) => buildDocsPath(page.slug));
    const builderHrefs = BUILDER_PAGES.map((page) => buildBuilderPath(page.kind));
    const [firstPage, ...sidebarPages] = renderAllPages();
    const homePage = requireDefined(firstPage, 'the homepage');
    expect(collectGroups(homePage.html, SIDEBAR_LINK_RX, 'href')).toEqual([]);
    expect(homePage.html).not.toContain('class="has-sidebar"');
    expect(homePage.html).not.toContain('popovertarget="sidebar-drawer"');

    for (const page of sidebarPages) {
      const sidebarHrefs = collectGroups(page.html, SIDEBAR_LINK_RX, 'href');
      const expectedHrefs = page.path.startsWith('/builder') ? builderHrefs : docsHrefs;
      expect(sidebarHrefs.toSorted(), page.path).toEqual(expectedHrefs.toSorted());
      const activeMatches = [...page.html.matchAll(SIDEBAR_LINK_RX)].filter(
        (match) => match.groups?.active
      );
      expect(activeMatches, page.path).toHaveLength(1);
      expect(activeMatches[0]?.groups?.href, page.path).toBe(page.path);
      expect(page.html, page.path).toContain('<body class="has-sidebar">');
      // The drawer toggle lives in the sticky header and shows the active page title:
      const headerHtml = page.html.slice(0, page.html.indexOf('</header>'));
      const toggleLabel = SIDEBAR_TOGGLE_RX.exec(headerHtml)?.groups?.label;
      expect(toggleLabel, page.path).toBe(activeMatches[0]?.groups?.label);
    }
  });

  it('chains the docs pager in sidebar order without Home buttons at the ends', () => {
    for (const [i, page] of DOCS_PAGES.entries()) {
      const html = renderDocsHtml(page.slug);
      const pagerHtml = html.slice(html.indexOf('<nav class="pager-row'));
      const previousPage = DOCS_PAGES[i - 1];
      const nextPage = DOCS_PAGES[i + 1];
      if (previousPage) {
        expect(pagerHtml, page.slug).toContain(
          `<a href="${buildDocsPath(previousPage.slug)}" class="btn-secondary" rel="prev" tabindex="0">`
        );
      } else {
        expect(pagerHtml, page.slug).not.toContain('rel="prev"');
        expect(pagerHtml, page.slug).toContain('<nav class="pager-row is-end"');
      }
      if (nextPage) {
        expect(pagerHtml, page.slug).toContain(
          `<a href="${buildDocsPath(nextPage.slug)}" class="btn-primary" rel="next" tabindex="0">`
        );
      } else {
        expect(pagerHtml, page.slug).not.toContain('rel="next"');
      }
    }
  });

  it('references the versioned stylesheet and site script and keeps template placeholders out of the assets', () => {
    const css = getSiteAsset('site.css');
    const script = getSiteAsset('site.js');
    expect(css?.body).toBe(getSiteStylesheet());
    for (const page of renderAllPages()) {
      expect(page.html, page.path).toContain(
        `<link rel="stylesheet" href="/assets/site.css?v=${css?.version}" />`
      );
      expect(page.html, page.path).toContain(
        `<script src="/assets/site.js?v=${script?.version}" defer></script>`
      );
      expect(page.html, page.path).toContain('<script type="application/json" id="site-config">');
      expect(page.html, page.path).not.toContain('<style>');
    }
    expect(css?.body).not.toContain('${');
    expect(css?.body).toContain('--brand-gradient-start: #818CF8;');
    expect(getSiteAsset('__proto__')).toBeUndefined();
  });

  it('serves every bundled Geist and JetBrains Mono NF @font-face binary referenced by the stylesheet', () => {
    const css = getSiteStylesheet();
    expect(css).toContain("--font-sans: 'Geist',");
    expect(css).toContain("--font-mono: 'JetBrains Mono NF',");
    expect(css).toContain('font-variant-ligatures: none;');
    expect(css).not.toContain("'liga' 1");
    expect(css).toMatch(/body \{[^}]*font-family: var\(--font-sans\);/);
    const fontNames = collectGroups(css, /url\(['"]\/assets\/(?<name>[\w-]+\.ttf)['"]\)/g, 'name');
    expect(fontNames).toEqual([
      'Geist-Regular.ttf',
      'Geist-Medium.ttf',
      'Geist-SemiBold.ttf',
      'Geist-SemiBoldItalic.ttf',
      'Geist-Bold.ttf',
      'JetBrainsMono-Regular.ttf',
      'JetBrainsMono-Italic.ttf',
      'JetBrainsMono-Bold.ttf',
      'JetBrainsMono-BoldItalic.ttf',
    ]);
    for (const fontName of fontNames) {
      const asset = getSiteAsset(fontName);
      expect(asset?.contentType, fontName).toBe('font/ttf');
      expect(asset?.body, fontName).toBeInstanceOf(ArrayBuffer);
      expect((asset?.body as ArrayBuffer | undefined)?.byteLength, fontName).toBeGreaterThan(
        100_000
      );
    }
  });
});

/********************************** Docs drift guards ***********************************/

describe('documentation drift guards', () => {
  it('lists every metric and metric alias of every registered service in the generated services table', () => {
    const servicesHtml = renderDocsHtml('services');
    for (const [key, service] of Object.entries(SERVICES_CONFIG)) {
      const listed = collectListedMetrics(extractServiceRow(servicesHtml, key));
      expect(listed.metrics.toSorted(), key).toEqual(Object.keys(service.metrics).toSorted());
      expect(listed.aliases.toSorted(), key).toEqual(
        listServiceMetricAliases(service)
          .map(([alias]) => alias)
          .toSorted()
      );
    }
  });

  it('documents and showcases pulsing status dots (?dot=) and all theme colors', () => {
    const badgesHtml = renderDocsHtml('badges');
    for (const dotColor of ['green', 'amber', 'orange', 'red', 'sky', 'violet', 'slate']) {
      expect(badgesHtml, dotColor).toContain(
        `<span class="hl-key">&amp;dot=</span><span class="hl-val">${dotColor}</span>`
      );
    }
    expect(badgesHtml).toContain(`(${THEME_COLOR_NAMES.length} colors)`);
    expect(badgesHtml).toContain('Accepts any theme color or none');
  });

  it('documents the full ?anim= grammar and ?special= limits read from the parser', () => {
    const badgesHtml = renderDocsHtml('badges');
    for (const token of ICON_MOTION_TOKENS) {
      expect(badgesHtml, token).toContain(`<span class="param-sep"> | </span>${token}`);
    }
    expect(badgesHtml).toContain('&lt;left&gt;,&lt;right&gt;');
    expect(badgesHtml).toContain('sheen,&lt;left&gt;,&lt;right&gt;');
    expect(badgesHtml).toContain(`2 to ${MAX_SPARKLINE_POINTS} comma- or space-separated numbers`);
    expect(badgesHtml).toContain(`up to ${MAX_STRIP_TICKS} ticks`);
    expect(badgesHtml).toContain('bar:92:static');
  });

  it('documents every icon slug alias and the unknown-icon fallback', () => {
    const iconsHtml = renderDocsHtml('icons');
    for (const [alias, canonical] of Object.entries(ICON_SLUG_ALIASES)) {
      expect(iconsHtml, alias).toContain(
        `<code class="param-code">${alias}</code><span class="alias-arrow" aria-hidden="true">→</span><span class="visually-hidden"> resolves to </span><code class="param-code">${canonical}</code>`
      );
    }
    expect(iconsHtml).toContain(`unknown slugs fall back to ${FALLBACK_ICON_SLUG}`);
    expect(iconsHtml).toContain('Per-icon pairs apply their first motion');
  });

  it('documents stack query aliases, ?anim=, the computed group gap default, and shares the homepage stack example', () => {
    const stackHtml = renderDocsHtml('stack');
    expect(stackHtml).toContain(
      ':groups<span class="param-sep"> / </span>?groups=<span class="param-sep"> / </span>?icons=<span class="param-sep"> / </span>?i='
    );
    expect(stackHtml).toContain(
      '?gap=<span class="param-sep"> / </span>?groupgap=<span class="param-sep"> / </span>?ggap='
    );
    expect(stackHtml).toContain(`round(gap × ${GROUP_GAP_RATIO})`);
    expect(stackHtml).toMatch(/<th scope="row" role="rowheader">\?anim=<\/th>/);
    expect(stackHtml).toContain(
      `<span class="hl-url">${SITE_ORIGIN}/stack</span><span class="hl-path">/${STACK_EXAMPLE_GROUPS}</span>`
    );
    expect(renderHomeHtml()).toContain(
      `<span class="hl-url">${SITE_ORIGIN}/stack</span><span class="hl-path">/${STACK_EXAMPLE_GROUPS}</span>`
    );
  });

  it('documents quote text/author aliases, layout aliases, ?anim=, and the single-segment route in unified parameter order', () => {
    const quotesHtml = renderDocsHtml('quotes');
    const orderedRows = [
      '?text=<span class="param-sep"> / </span>?quote=',
      '?author=',
      '?layout=<span class="param-sep"> / </span>?type=',
      '?center=',
      '?variant=',
      '?color=',
      '?size=',
      '?width=',
      '?anim=',
    ];
    let lastRowIndex = -1;
    for (const name of orderedRows) {
      const marker = `<th scope="row" role="rowheader">${name}</th>`;
      const rowIndex = quotesHtml.indexOf(marker);
      expect(rowIndex, name).toBeGreaterThan(lastRowIndex);
      lastRowIndex = rowIndex;
    }
    expect(quotesHtml).toContain('<span class="route-method">GET</span>/quote/:text</code>');
  });

  it('documents typing query aliases, container layouts, cursor shapes, erase modes, and the two-segment route in unified parameter order', () => {
    const typingHtml = renderDocsHtml('typing');
    const orderedRows = [
      ':prefix<span class="param-sep"> / </span>:lines',
      '?lines=<span class="param-sep"> / </span>?text=',
      '?prefix=<span class="param-sep"> / </span>?prompt=',
      '?layout=<span class="param-sep"> / </span>?frame=<span class="param-sep"> / </span>?type=',
      '?variant=',
      '?color=',
      '?font=',
      '?size=',
      '?width=',
      '?align=<span class="param-sep"> / </span>?center=',
      '?title=',
      '?icon=',
      '?hint=',
      '?cursor=',
      '?erase=<span class="param-sep"> / </span>?delete=',
      '?typo=',
      '?duration=',
      '?pause=',
      '?anim=',
    ];
    let lastRowIndex = -1;
    for (const name of orderedRows) {
      const marker = `<th scope="row" role="rowheader">${name}</th>`;
      const rowIndex = typingHtml.indexOf(marker);
      expect(rowIndex, name).toBeGreaterThan(lastRowIndex);
      lastRowIndex = rowIndex;
    }
    expect(typingHtml).toContain(
      '<span class="route-method">GET</span>/typing/:prefix/:lines</code>'
    );
  });

  it('computes every headline count instead of hard-coding it and keeps internal jargon out of user-facing copy', () => {
    const homeHtml = renderHomeHtml();
    const iconCounts = getIconSetCounts();
    expect(iconCounts.lucide).toBeGreaterThan(1000);
    expect(iconCounts.brand).toBeGreaterThan(1000);
    expect(homeHtml).toContain(`${THEME_COLOR_NAMES.length} Theme Colors`);
    expect(homeHtml).toContain(`${formatCountLowerBound(iconCounts.lucide)} UI icons`);
    expect(homeHtml).toContain(
      `${formatCountLowerBound(iconCounts.lucide + iconCounts.brand)} Icons`
    );
    expect(homeHtml).toContain(`${Object.keys(SERVICES_CONFIG).length} Live Services`);
    expect(homeHtml).toContain('Six Unified Endpoints');
    expect(homeHtml.split('<span class="route-method">GET</span>').length - 1).toBe(6);
    expect(homeHtml).not.toContain('OKLCH');
    expect(homeHtml).not.toContain('Simple Icons');
    expect(renderDocsHtml('icons')).toContain(
      `${formatCountLowerBound(iconCounts.brand)} brand &amp; technology logos`
    );
    expect(formatCountLowerBound(1890)).toBe('1,800+');
  });

  it('uses path-only route pills on every page', () => {
    for (const page of renderAllPages()) {
      expect(page.html, page.path).not.toMatch(
        /<span class="route-method">GET<\/span>(?:https?:\/\/|svg\.xul\.is)/
      );
    }
  });
});

/********************************* Website regressions **********************************/

describe('website client scripts & markup regressions', () => {
  it('places fallback popovers from their measured size inside the viewport (regression: hard-coded 420/380 sizes)', () => {
    const { computePopoverPlacement } = loadSiteCore();
    const viewport = { height: 700, width: 1000 };
    const anchor = { bottom: 630, left: 900, right: 960, top: 600, width: 60 };
    expect(computePopoverPlacement(anchor, { height: 452, width: 384 }, viewport, {})).toEqual({
      left: 608,
      minWidth: undefined,
      top: 140,
    });
    expect(
      computePopoverPlacement(anchor, { height: 200, width: 176 }, viewport, { align: 'end' })
    ).toEqual({ left: 784, minWidth: undefined, top: 392 });
    const lowAnchor = { bottom: 40, left: 10, right: 210, top: 10, width: 200 };
    expect(
      computePopoverPlacement(lowAnchor, { height: 120, width: 150 }, viewport, {
        gap: 4,
        isWidthMatched: true,
      })
    ).toEqual({ left: 10, minWidth: 200, top: 44 });
    expect(computePopoverPlacement(lowAnchor, { height: 690, width: 150 }, viewport, {}).top).toBe(
      8
    );
    const wideAnchor = { bottom: 40, left: 4, right: 396, top: 10, width: 392 };
    expect(
      computePopoverPlacement(
        wideAnchor,
        { height: 120, width: 392 },
        { height: 600, width: 320 },
        { isWidthMatched: true }
      ).minWidth
    ).toBe(304);
  });

  it('keeps the theme-color meta tags in sync with the manual scheme override (regression: system color only)', () => {
    const html = renderHomeHtml();
    const script = readSiteScript();
    const config = JSON.parse(
      /<script type="application\/json" id="site-config">(?<json>[^<]*)<\/script>/.exec(html)
        ?.groups?.json ?? '{}'
    ) as { drawerMediaQuery?: string; themeColors?: Record<string, string> };
    expect(config.themeColors).toEqual({ dark: DARK_BG, light: LIGHT_BG });
    expect(html.indexOf('name="theme-color"')).toBeLessThan(html.indexOf('<script>try{'));
    expect(html).toContain(
      `document.querySelectorAll('meta[name="theme-color"]').forEach(function(meta){meta.content=`
    );
    expect(script).toContain(
      'themeColorMeta.content = siteConfig.themeColors[storedScheme ?? mediaScheme]'
    );
  });

  it('keeps the sidebar keyboard-focusable on wide screens, turns it into a popover drawer on narrow screens, and restores focus on close (regressions)', () => {
    const html = renderDocsHtml('badges');
    const drawerHtml = html.slice(html.indexOf('<aside class="sidebar" id="sidebar-drawer">'));
    expect(drawerHtml).toMatch(
      /^<aside class="sidebar" id="sidebar-drawer">\s*<button type="button" class="sidebar-close" popovertarget="sidebar-drawer" popovertargetaction="hide" aria-label="Close /
    );
    expect(html).toContain(
      'class="sidebar-toggle" popovertarget="sidebar-drawer" aria-expanded="false"'
    );
    expect(html).not.toContain('<aside class="sidebar" id="sidebar-drawer" popover>');
    expect(html).toContain('"drawerMediaQuery":"(max-width: 960px)"');
    const script = readSiteScript();
    expect(script).toContain("sidebarDrawer.setAttribute('popover', '')");
    expect(script).toContain("sidebarDrawer.removeAttribute('popover')");
    expect(script).toContain("drawerQuery.addEventListener('change', syncSidebarDrawer)");
    expect(script).toContain("element.toggleAttribute('inert', isInert)");
    expect(script).toContain("sidebarToggle?.setAttribute('aria-expanded'");
    expect(script).toContain('sidebarToggle.focus()');
    expect(getSiteStylesheet()).toContain('body:has(.sidebar:where(:popover-open, .is-open))');
    expect(getSiteStylesheet()).not.toContain('content-visibility: auto');
  });

  it('disables code scroll buttons natively and follows drawer width changes without window listeners (regressions)', () => {
    const script = readSiteScript();
    expect(script).toContain('leftButton.disabled =');
    expect(script).toContain('rightButton.disabled =');
    expect(script).not.toContain('is-disabled');
    expect(script).toContain('new ResizeObserver(');
    expect(script).not.toContain("addEventListener('resize'");
    expect(script).not.toContain('setTimeout(() => updateScrollButtons');
    expect(script).not.toContain('.code-output');
    expect(script).not.toContain('`null` when unavailable');
  });

  it('exposes the shared clipboard and popover helpers for the builder script', () => {
    const script = readSiteScript();
    expect(script).toMatch(
      /globalThis\.svgSite = \{\s*closePopover,\s*copyText,\s*isPopoverOpen,\s*openPopover,\s*placePopover,?\s*\};/
    );
    expect(script).toContain("button.querySelector('[data-copy-label]')");
    expect(script).not.toContain('hasAnchorPositioning');
  });

  it('emits repeated UI icons once per page as sprite symbols referenced with <use>', () => {
    for (const page of renderAllPages()) {
      expect(page.html.split('<svg class="ui-sprite"').length - 1, page.path).toBe(1);
      expect(page.html.split('<symbol id="ui-copy"').length - 1, page.path).toBe(1);
    }
    const badgesHtml = renderDocsHtml('badges');
    expect(badgesHtml.split('<use href="#ui-copy"></use>').length - 1).toBeGreaterThan(5);
    expect(badgesHtml.split('<use href="#ui-chevron-right"></use>').length - 1).toBeGreaterThan(5);
  });

  it('drops unstyled class names from the markup and uses the shared popover and grid classes', () => {
    for (const page of renderAllPages()) {
      expect(page.html, page.path).not.toMatch(DEAD_CLASS_RX);
    }
    const docsHtml = renderDocsHtml('buttons');
    expect(docsHtml).toContain('<div class="card-grid is-3col">');
    const builderHtml = renderBuilderHtml('badge');
    expect(builderHtml).toContain('class="popover-panel select-menu"');
    expect(builderHtml).toContain('class="popover-panel icon-picker"');
    expect(renderBuilderHtml('stack')).toContain('class="popover-panel stack-help-popover"');
  });

  it('documents variant tiers, widget examples, sizes, quote widths, and alias rules from shared sources (docs drift)', () => {
    const badgesHtml = renderDocsHtml('badges');
    expect(badgesHtml).toContain(`Hierarchy tier: ${formatVariantTierSummary()}.`);
    for (const example of formatSpecialExamples().split(' | ')) {
      expect(badgesHtml, example).toContain(escapeXml(example));
    }
    const buttonsHtml = renderDocsHtml('buttons');
    expect(buttonsHtml).toContain(`Button Size Scale (?size=${SIZE_TOKENS.join('|')})`);
    expect(buttonsHtml).toContain('Open “Discussions Join” in the Builder');
    const quotesHtml = renderDocsHtml('quotes');
    expect(quotesHtml).toContain('The default grows proportionally with text sizes');
    expect(quotesHtml).toContain('Only read when ?layout= and ?type= are empty.');
    const stackHtml = renderDocsHtml('stack');
    expect(stackHtml).toContain('then ?groups=, ?icons=, and ?i= (empty values fall through)');
    expect(renderDocsHtml('overview')).toContain('Unknown query parameters are ignored per route');
  });
});

/*********************************** Site stylesheet ************************************/

describe('site stylesheet', () => {
  it('only references defined --c-* tokens (regression: .brand-mark used the undefined --c-btn-brand-text)', () => {
    const css = getSiteStylesheet();
    const defined = new Set(collectGroups(css, COLOR_TOKEN_DEFINITION_RX, 'name'));
    const undefinedTokens = collectGroups(css, COLOR_TOKEN_USAGE_RX, 'name').filter(
      (name) => !defined.has(name)
    );
    expect(undefinedTokens).toEqual([]);
    expect(css).toMatch(/\.brand-mark \{[^}]*color: var\(--c-on-brand\);/);
    expect(css).not.toContain('--c-btn-brand-text');
  });

  it('drops the removed tokens and uses the renamed brand gradient stops', () => {
    const css = getSiteStylesheet();
    for (const removed of ['--c-bg-alt', '--c-brand-3', '--base-brand', '--c-border-subtle']) {
      expect(css, removed).not.toContain(removed);
    }
    expect(css).toContain('--brand-gradient-end: #4F46E5;');
    expect(css).toContain('var(--brand-gradient-start) 0%');
    expect(css).toContain('var(--brand-gradient-end) 100%');
  });

  it('hides [hidden] elements with exactly one global rule', () => {
    const css = getSiteStylesheet();
    expect(css.split('[hidden]').length - 1).toBe(1);
    expect(css).toMatch(/\[hidden\] \{\s*display: none !important;\s*\}/);
  });

  it('offsets in-page anchors below the sticky header with root scroll padding instead of per-element scroll margins', () => {
    const css = getSiteStylesheet();
    expect(css).not.toContain('scroll-margin-block-start');
    expect(css).toMatch(
      /:root \{[^}]*scroll-padding-block-start: calc\(var\(--header-height\) \+ 32px\);/
    );
  });

  it('shares one elevated popover panel base for every popover', () => {
    const css = getSiteStylesheet();
    expect(css).toMatch(
      /\.popover-panel \{[^}]*background: color-mix\(in srgb, var\(--c-bg-elv\) 78%, transparent\);[^}]*backdrop-filter: blur\(16px\);/
    );
    expect(css).toContain('.popover-panel:where(:popover-open, .is-open) {');
    expect(css).toContain('.popover-panel:not(:where(:popover-open, .is-open)) {');
    for (const popover of ['.select-menu', '.icon-picker', '.stack-help-popover']) {
      expect(css, popover).not.toContain(`${popover}:where(:popover-open, .is-open) {`);
    }
  });

  it('colors errors, validation messages, and invalid input borders with --c-danger and keeps --c-hl-path for syntax highlighting', () => {
    const css = getSiteStylesheet();
    expect(css).toContain('--c-danger: light-dark(#C5002B, #FF6467);');
    expect(css).toContain('--c-hl-path: light-dark(#4131CE, #BECBFF);');
    expect(css).toContain('--c-hl-key: light-dark(#2B7676, #7CEEE3);');
    expect(css).toContain('--c-hl-val: light-dark(#214A4B, #BCFFF7);');
    expect(css).toContain('--c-hl-href: light-dark(#3D3D3D, #C2C2C2);');
    expect(css).not.toContain('--c-warning');
    expect(css).toMatch(
      /\.copy-btn\.is-failed,\s*\.btn-secondary\.is-failed \{[^}]*color: var\(--c-danger\);/
    );
    expect(css).toMatch(/\.builder-hint\.is-warning \{\s*color: var\(--c-danger\);/);
    expect(css).toMatch(/\.builder-status\.is-warning \{\s*color: var\(--c-danger\);/);
    expect(css).toMatch(
      /\.icon-input\.is-invalid \.icon-select-trigger,\s*\.builder-field:is\(\.is-invalid, \.is-missing\) :is\(\.builder-input, \.stack-catalog-wrap\) \{\s*border-color: var\(--c-danger\);/
    );
    expect(css.split('var(--c-hl-path)').length - 1).toBe(1);
    expect(css).toMatch(/\.hl-path \{\s*color: var\(--c-hl-path\);/);
  });

  it('turns the 3-column card grid into an .is-3col modifier and styles native disabled scroll buttons', () => {
    const css = getSiteStylesheet();
    expect(css).not.toContain('.card-grid-3');
    expect(css).toContain('.card-grid.is-3col {');
    expect(css).not.toContain('.is-disabled');
    expect(css).not.toContain('.code-drawer-body:focus-within');
    expect(css).toMatch(
      /\.scroll-btn:disabled,\s*\.copy-btn:disabled \{[^}]*backdrop-filter: blur\(5px\);/
    );
  });

  it('merges every reduced-motion override into a single media block', () => {
    expect(getSiteStylesheet().split('@media (prefers-reduced-motion: reduce)').length - 1).toBe(1);
  });

  it('keeps preview hover effects and color swatch focus rings working across touchscreen laptops (regressions: @media (hover: hover), pointer-events: none, invisible swatch focus)', () => {
    const css = getSiteStylesheet();
    expect(css).not.toContain('@media (hover:');
    expect(css).not.toContain('@media (any-hover:');
    expect(css).not.toMatch(/\.preview-stage svg \{[^}]*pointer-events: none;/);
    expect(css).toMatch(
      /\.preview-link:hover::after,\s*\.preview-link:focus-visible::after \{\s*opacity: 1;\s*\}/
    );
    expect(css).toMatch(
      /\.preview-stage:has\(\.preview-link:hover\) \.preview-link:not\(:hover\),\s*\.preview-stage:has\(\.preview-link:focus-visible\) \.preview-link:not\(:focus-visible\) \{\s*opacity: 0\.45;\s*\}/
    );
    expect(css).toMatch(
      /\.swatch-grid:has\(\.swatch-input:focus-visible\) \.swatch-input:not\(:checked\) \+ \.swatch-dot \{/
    );
    expect(css).toMatch(/\.section-title-row \{[^}]*justify-content: space-between;/);
  });

  it('meets WCAG 2.2 AA 24px minimum target sizes, preserves High Contrast swatches, and keeps mobile anchor links at full contrast', () => {
    const css = getSiteStylesheet();
    expect(css).toMatch(/\.theme-switch \{[^}]*inline-size: 42px;\s*block-size: 24px;/);
    expect(css).toMatch(/\.gh-link \{[^}]*inline-size: 24px;\s*block-size: 24px;/);
    expect(css).toMatch(/\.bg-toggle \{[^}]*inline-size: 24px;\s*block-size: 24px;/);
    expect(css).toMatch(/\.anchor-link \{[^}]*min-inline-size: 24px;\s*min-block-size: 24px;/);
    expect(css).toMatch(
      /@media \(max-width: 640px\) \{\s*\.anchor-link \{\s*opacity: 1;\s*\}\s*\}/
    );
    expect(css).toMatch(
      /\.scroll-btn \{\s*display: none;\s*inline-size: 18px;\s*block-size: 18px;\s*border-radius: 5px;/
    );
    expect(css).toMatch(/\.scroll-btn::before \{[^}]*inset: -3px;/);
    expect(css).toMatch(/\.scroll-btn-left \{\s*inset-inline-start: 5px;\s*\}/);
    expect(css).toMatch(/\.scroll-btn-right \{\s*inset-inline-start: 29px;\s*\}/);
    expect(css).toMatch(
      /\.typing-line-handle \{[^}]*-webkit-user-select: none;\s*user-select: none;/
    );
    expect(css).toMatch(/\.swatch-dot \{\s*inline-size: 24px;\s*block-size: 24px;/);
    expect(css).toMatch(/\.help-btn::before \{[^}]*inset: -3px;/);
    expect(css).toMatch(
      /@media \(forced-colors: active\) \{\s*\.swatch-dot,\s*\.select-swatch,\s*\.anatomy-swatch,\s*\.bg-swatch \{\s*forced-color-adjust: none;\s*\}\s*\}/
    );
  });

  it('pins a compact focus-free live preview above the form on single-column builder viewports while keeping snippets below', () => {
    const css = getSiteStylesheet();
    expect(css).toMatch(
      /@media \(max-width: 1200px\) \{[\s\S]*?\.builder-grid \{[\s\S]*?grid-template-areas:\s*'preview'\s*'form'\s*'output';/
    );
    expect(css).toMatch(
      /\.builder-preview-dock \{[^}]*position: sticky;\s*inset-block-start: var\(--header-height\);[^}]*container-name: builder-preview;\s*container-type: scroll-state;/
    );
    expect(css).toContain('@container builder-preview scroll-state(stuck: top) {');
    expect(css).toContain('max-block-size: min(22dvh, 148px);');

    for (const page of BUILDER_PAGES) {
      const html = renderBuilderHtml(page.kind);
      const dockMatch =
        /<div class="builder-preview-dock">(?<dock>[\s\S]*?)<\/div>\s*<div class="builder-output">/.exec(
          html
        );
      const dockHtml = requireDefined(dockMatch?.groups?.dock, `${page.kind} preview dock`);
      expect(dockHtml, page.kind).toContain('id="builder-preview"');
      expect(dockHtml, page.kind).toContain('id="builder-status"');
      // Keep the visually reordered preview dock free of focusable elements so Tab order stays top-to-bottom:
      expect(dockHtml, page.kind).not.toMatch(/<(?:a|button|input|select|textarea)\b|tabindex=/);
    }
  });

  it('protects asterisks inside inline code spans, serializes string popover attributes, marks variant=2 as the /docs/typing default, and rasterizes <circle> inside <g> (regressions: code-span asterisks became <strong>, string popover coerced to bare popover, /docs/typing variant=1 marked default, missing sparkles <circle> in og.png)', () => {
    expect(formatInlineMarkupHtml('Match `**glob**` with **care**')).toBe(
      'Match <code>**glob**</code> with <strong>care</strong>'
    );

    expect(jsx('div', { popover: 'manual' }).rawHtml).toBe('<div popover="manual"></div>');
    expect(jsx('div', { popover: true }).rawHtml).toBe('<div popover></div>');
    expect(jsx('div', { popover: false }).rawHtml).toBe('<div></div>');

    const typingDocsHtml = renderDocsHtml('typing');
    expect(typingDocsHtml).toContain(
      '<span class="card-title-text">Secondary Tinted + Block Cursor</span><span class="card-title-pill">Default</span>'
    );
    expect(typingDocsHtml).not.toContain(
      '<span class="card-title-text">Primary Brand Gradient</span><span class="card-title-pill">Default</span>'
    );

    // `<circle>` inside `<g>` must paint onto the OG canvas instead of being ignored:
    const emptyGroupPng = rasterizeOgSvgToPng(
      '<svg width="16" height="16"><rect width="16" height="16" fill="#000000" /><g transform="translate(2, 2)" stroke="#FFFFFF" stroke-width="2"></g></svg>',
      16,
      16,
      '00'
    );
    const circleGroupPng = rasterizeOgSvgToPng(
      '<svg width="16" height="16"><rect width="16" height="16" fill="#000000" /><g transform="translate(2, 2)" stroke="#FFFFFF" stroke-width="2"><circle cx="6" cy="6" r="4" /></g></svg>',
      16,
      16,
      '00'
    );
    expect(circleGroupPng.equals(emptyGroupPng)).toBe(false);

    // Multi-stop `<linearGradient>` interpolates intermediate stops instead of skipping straight from first to last:
    const gradients = parseGradientDefs(
      '<defs><linearGradient id="g" x1="0" y1="0" x2="100" y2="0"><stop offset="0%" stop-color="#000000" /><stop offset="50%" stop-color="#FF0000" /><stop offset="100%" stop-color="#000000" /></linearGradient></defs>'
    );
    const midpointPaint = evaluatePaint('url(#g)', gradients, 50, 0);
    expect(midpointPaint?.[0]).toBeGreaterThan(200);
    expect(midpointPaint?.[1]).toBe(0);

    // Smooth curves (`S`, `T`) and packed arc flags (`a5 5 0 015 5`) flatten without dropping segments:
    const flattened = flattenSvgPath('M0 0 C2 0 4 2 6 2 S10 0 12 0 Q14 2 16 0 T20 0 a5 5 0 015 5');
    expect(flattened[0]?.points.length).toBeGreaterThan(20);
  });

  it('preserves string values on HTML boolean-capable attributes, guards prototype attribute names, scopes legacy color overrides under @supports not, and uses concise BreadcrumbList item names (regressions: boolean attribute dropped string value, :root:has overrode light-dark())', () => {
    expect(jsx('div', { hidden: 'until-found' }).rawHtml).toBe('<div hidden="until-found"></div>');
    expect(jsx('div', { hidden: true }).rawHtml).toBe('<div hidden></div>');
    expect(jsx('div', { hidden: '' }).rawHtml).toBe('<div hidden></div>');
    expect(jsx('div', { hidden: false }).rawHtml).toBe('<div></div>');
    expect(jsx('div', { draggable: true }).rawHtml).toBe('<div draggable="true"></div>');
    expect(jsx('div', { constructor: 'safe' }).rawHtml).toBe('<div constructor="safe"></div>');

    const css = getSiteStylesheet();
    expect(css).toContain('@supports not (color: light-dark(white, black)) {');
    const beforeSupportsIndex = css.indexOf('@supports (color: light-dark(white, black))');
    expect(beforeSupportsIndex).toBeGreaterThan(0);
    expect(css.slice(0, beforeSupportsIndex)).not.toContain('--c-text-3:');

    const badgesDocsHtml = renderDocsHtml('badges');
    expect(badgesDocsHtml).toContain('"name":"Static Badges","position":3');
    const badgeBuilderHtml = renderBuilderHtml('badge');
    expect(badgeBuilderHtml).toContain('"name":"Badge Builder","position":2');
  });
});
