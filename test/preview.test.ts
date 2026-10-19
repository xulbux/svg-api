/**
 * Documentation website tests – HTML validity, accessibility, head metadata, navigation, static assets, client behavior guards, and docs drift guards for the homepage, `/docs`, `/docs/:section`, and `/builder/:kind` pages (`src/preview/`).
 */

import { describe, expect, it } from 'vitest';
import { SERVICES_CONFIG, STATUS_PRESET_MAP } from '@/config/services';
import { SITE_ORIGIN } from '@/config/site';
import { THEME_COLOR_NAMES } from '@/config/theme';
import { getSiteAsset } from '@/preview/assets';
import { renderBuilderHtml } from '@/preview/builder';
import { formatCountLowerBound, getIconSetCounts } from '@/preview/catalog';
import { renderParamTable } from '@/preview/components';
import { BUILDER_PAGES, buildBuilderPath, buildDocsPath, DOCS_PAGES } from '@/preview/navigation';
import { renderDocsHtml, renderHomeHtml } from '@/preview/page';
import { getSiteStylesheet } from '@/preview/styles';
import { ICON_MOTION_TOKENS } from '@/routes/params';
import { FALLBACK_ICON_SLUG, ICON_SLUG_ALIASES } from '@/svg/icons';
import { MAX_SPARKLINE_POINTS, MAX_STRIP_TICKS } from '@/svg/renderer';
import { GROUP_GAP_RATIO } from '@/svg/stack';

/********************************* Fixtures *********************************/

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

/** Matches every sidebar link (`href`, active state, and label). */
const SIDEBAR_LINK_RX =
  /<a href="(?<href>[^"]+)" class="sidebar-link(?<active> is-active)?"[^>]*>(?<label>[^<]+)<\/a>/g;

/** Matches the header's sidebar drawer toggle and its current page label. */
const SIDEBAR_TOGGLE_RX =
  /<button type="button" class="sidebar-toggle" popovertarget="sidebar-drawer"[^>]*>[\s\S]*?<span class="sidebar-toggle-label"[^>]*>(?<label>[^<]*)<\/span>/;

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

/********************************* HTML validity *********************************/

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
      // ARIA references are space-separated ID lists (e.g., a dropdown labeled by its field label and value).
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
      for (let i = 1; i < levels.length; i += 1) {
        expect(levels[i] - levels[i - 1], `${page.path} heading ${i}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('escapes parameter table content and renders alias and note micro-syntax', () => {
    const tableHtml = renderParamTable(
      [
        {
          defaultVal: 'round(gap × 3.25) (groupgap)',
          description: '<script>alert(1)</script>',
          name: '?x=',
          values: 'v | license [l] | 1 to 4',
        },
      ],
      'Test <parameters>'
    );
    expect(tableHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(tableHtml).not.toContain('<script>');
    expect(tableHtml).toContain('aria-label="Test &lt;parameters&gt;"');
    expect(tableHtml).toContain('license <span class="param-alias">(l)</span>');
    expect(tableHtml).toContain('1<span class="param-sep"> to </span>4');
    expect(tableHtml).toContain(
      '<code class="param-code">round(gap × 3.25)</code> <span class="param-note">(groupgap)</span>'
    );
  });
});

/********************************* Accessibility *********************************/

describe('documentation pages – accessibility', () => {
  it('exposes the theme switch state via aria-checked and starts the body with a skip link', () => {
    for (const page of renderAllPages()) {
      expect(page.html, page.path).toMatch(/role="switch" aria-checked="(?:true|false)"/);
      expect(page.html, page.path).toMatch(
        /<body(?: class="has-sidebar")?>\s*<a class="skip-link" href="#main-content">/
      );
      expect(page.html, page.path).toContain('id="main-content" tabindex="-1"');
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
    expect(buttonsHtml).toContain('<span class="copy-btn-text" aria-live="polite">Copy</span>');
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

  it('stops all CSS motion and pauses SMIL previews under prefers-reduced-motion', () => {
    expect(getSiteStylesheet()).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^]*?\*,\s*\*::before,\s*\*::after \{\s*transition: none !important;\s*animation: none !important;/
    );
    const script = readSiteScript();
    expect(script).toContain('previewSvg.pauseAnimations()');
    expect(script).toContain("reducedMotionQuery.matches ? 'auto' : 'smooth'");
  });
});

/********************************* Head & client script *********************************/

describe('documentation pages – head metadata & client script', () => {
  it('renders a canonical URL, social metadata, theme colors, and a unique meta description per page', () => {
    const descriptions = new Set<string>();
    for (const page of renderAllPages()) {
      expect(page.html, page.path).toContain(
        `<link rel="canonical" href="${SITE_ORIGIN}${page.path}" />`
      );
      expect(page.html, page.path).toContain(
        `<meta property="og:url" content="${SITE_ORIGIN}${page.path}" />`
      );
      expect(page.html, page.path).toContain('<meta property="og:title" content="');
      expect(page.html, page.path).toContain('<meta name="twitter:card" content="summary" />');
      expect(page.html, page.path).toContain('media="(prefers-color-scheme: dark)"');
      const description = /<meta name="description" content="(?<content>[^"]+)"/.exec(page.html)
        ?.groups?.content;
      expect(description, page.path).toBeTruthy();
      descriptions.add(description ?? '');
    }
    expect(descriptions.size).toBe(DOCS_PAGES.length + BUILDER_PAGES.length + 1);
    expect(renderDocsHtml('badges')).not.toContain('Interactive SVG preview studio');
  });

  it('only applies whitelisted stored color schemes and preview backgrounds (regression: any localStorage value reached the meta tag)', () => {
    const html = renderHomeHtml();
    const script = readSiteScript();
    expect(html).not.toContain('localStorage.getItem("color-scheme")??');
    expect(html).toContain("if(storedScheme==='dark'||storedScheme==='light')");
    expect(script).toContain("return value === 'dark' || value === 'light' ? value : undefined;");
    expect(script).toContain(
      "typeof value === 'string' && SITE_CONFIG.previewBgValues.includes(value)"
    );
    expect(script).not.toContain('event.newValue ||');
    expect(html).not.toContain('<script blocking="render">');
  });

  it('renders one persisted preview background picker per page in the header', () => {
    for (const page of renderAllPages()) {
      const headerHtml = page.html.slice(
        page.html.indexOf('<header class="site-header">'),
        page.html.indexOf('</header>')
      );
      expect(
        headerHtml.split('role="radiogroup" aria-labelledby="bg-picker-title"').length - 1,
        page.path
      ).toBe(1);
      expect(page.html.split('name="preview-bg" value="').length - 1, page.path).toBe(3);
      expect(headerHtml, page.path).toContain('popovertarget="bg-picker-menu"');
      expect(headerHtml, page.path).toContain('id="bg-picker-menu" popover');
      for (const value of ['auto', 'inverse', 'checker']) {
        expect(headerHtml, page.path).toContain(`name="preview-bg" value="${value}"`);
      }
    }
  });

  it('inverts the preview stage relative to the page scheme instead of offering redundant fixed dark/light stages', () => {
    const css = getSiteStylesheet();
    expect(css).toContain('--c-preview-inverse-bg: light-dark(#0D1117, #FFFFFF);');
    expect(css).toMatch(/:root\[data-preview-bg=['"]inverse['"]\] \.preview-stage/);
    expect(css).not.toMatch(/data-preview-bg=['"]dark['"]/);
    expect(css).not.toMatch(/data-preview-bg=['"]light['"]/);
  });
  it('memoizes rendered pages per isolate', () => {
    expect(renderDocsHtml('stack')).toBe(renderDocsHtml('stack'));
    expect(renderHomeHtml()).toBe(renderHomeHtml());
  });
});

/********************************* Navigation & assets *********************************/

describe('documentation pages – navigation & static assets', () => {
  it('renders exactly three header tabs and marks the active one with aria-current', () => {
    const expectedActive: Readonly<Record<string, string>> = {
      '/': '/',
      '/builder/badge': '/builder',
      '/docs': '/docs',
      '/docs/colors': '/docs',
    };
    for (const page of renderAllPages()) {
      const headerHtml = page.html.slice(0, page.html.indexOf('</header>'));
      const navHrefs = collectGroups(headerHtml, NAV_LINK_RX, 'href');
      expect(navHrefs, page.path).toEqual(['/', '/docs', '/builder']);
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
    const [homePage, ...sidebarPages] = renderAllPages();
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
      // The drawer toggle lives in the sticky header and shows the active page title.
      const headerHtml = page.html.slice(0, page.html.indexOf('</header>'));
      const toggleLabel = SIDEBAR_TOGGLE_RX.exec(headerHtml)?.groups?.label;
      expect(toggleLabel, page.path).toBe(activeMatches[0]?.groups?.label);
    }
  });

  it('chains the docs pager in sidebar order from Home through every docs page back to Home', () => {
    for (let i = 0; i < DOCS_PAGES.length; i += 1) {
      const html = renderDocsHtml(DOCS_PAGES[i].slug);
      const pagerHtml = html.slice(html.indexOf('<nav class="pager-row"'));
      const previousHref = i === 0 ? '/' : buildDocsPath(DOCS_PAGES[i - 1].slug);
      const nextHref = i === DOCS_PAGES.length - 1 ? '/' : buildDocsPath(DOCS_PAGES[i + 1].slug);
      expect(pagerHtml, DOCS_PAGES[i].slug).toContain(
        `<a href="${previousHref}" class="btn-secondary" rel="prev">`
      );
      expect(pagerHtml, DOCS_PAGES[i].slug).toContain(
        `<a href="${nextHref}" class="btn-primary" rel="next">`
      );
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
});
/********************************* Docs drift guards *********************************/

describe('documentation drift guards', () => {
  it('lists every metric and metric alias of every public service in the generated services table', () => {
    const servicesHtml = renderDocsHtml('services');
    for (const [key, service] of Object.entries(SERVICES_CONFIG)) {
      if (service.allowedOwners) {
        expect(servicesHtml).not.toContain(`role="rowheader">/badge/${key}/`);
      } else {
        const listed = collectListedMetrics(extractServiceRow(servicesHtml, key));
        expect(listed.metrics.toSorted(), key).toEqual(Object.keys(service.metrics).toSorted());
        expect(listed.aliases.toSorted(), key).toEqual(
          Object.keys(service.metricAliases ?? {}).toSorted()
        );
      }
    }
  });

  it('documents and showcases every status preset, the unknown-state fallback, and all ?dot= values', () => {
    const badgesHtml = renderDocsHtml('badges');
    for (const state of Object.keys(STATUS_PRESET_MAP)) {
      expect(badgesHtml, state).toContain(`${SITE_ORIGIN}/badge/status/${state}/`);
    }
    expect(badgesHtml).toContain('unknown states fall back to online');
    expect(badgesHtml).toContain(`(${THEME_COLOR_NAMES.length} colors)`);
    expect(badgesHtml).toContain('Accepts a status preset name or any theme color');
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

  it('documents stack query aliases, ?anim=, and the computed group gap default', () => {
    const stackHtml = renderDocsHtml('stack');
    expect(stackHtml).toContain(':groups / ?groups= / ?icons= / ?i=');
    expect(stackHtml).toContain('?gap= / ?groupgap= / ?ggap=');
    expect(stackHtml).toContain(`round(gap × ${GROUP_GAP_RATIO})`);
    expect(stackHtml).toMatch(/<th scope="row" role="rowheader">\?anim=<\/th>/);
  });

  it('documents quote text/author aliases, layout aliases, ?anim=, and the single-segment route', () => {
    const quotesHtml = renderDocsHtml('quotes');
    for (const name of [
      '?author=',
      '?text= / ?quote=',
      '?layout= / ?type=',
      '?center=',
      '?anim=',
    ]) {
      expect(quotesHtml, name).toContain(`<th scope="row" role="rowheader">${name}</th>`);
    }
    expect(quotesHtml).toContain('<span class="route-path">/quote/:text</span>');
  });

  it('computes every headline count instead of hard-coding it', () => {
    const homeHtml = renderHomeHtml();
    const iconCounts = getIconSetCounts();
    expect(iconCounts.lucide).toBeGreaterThan(1000);
    expect(iconCounts.brand).toBeGreaterThan(1000);
    expect(homeHtml).toContain(`share ${THEME_COLOR_NAMES.length} Tailwind v4 OKLCH color tokens`);
    expect(homeHtml).toContain(`${formatCountLowerBound(iconCounts.lucide)} Lucide stroke icons`);
    expect(homeHtml).toContain(
      `${formatCountLowerBound(iconCounts.lucide + iconCounts.brand)} Vector Icons`
    );
    expect(homeHtml).toContain('Five Unified Endpoints');
    expect(homeHtml.split('<span class="route-method">GET</span>').length - 1).toBe(5);
    expect(renderDocsHtml('icons')).toContain(
      `${formatCountLowerBound(iconCounts.brand)} Simple Icons`
    );
    expect(formatCountLowerBound(1890)).toBe('1,800+');
  });

  it('uses path-only route pills on every page', () => {
    for (const page of renderAllPages()) {
      expect(page.html, page.path).not.toMatch(
        /<span class="route-path">(?:https?:\/\/|svg\.xul\.is)/
      );
    }
  });
});
