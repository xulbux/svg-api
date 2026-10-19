/**
 * Worker route, readable query DSL, special element parser, documentation page, and route regression tests (`src/index.ts`, `src/routes/`, `src/preview/`, `src/config/`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SITE_ORIGIN } from '@/config/site';
import { resolveColor, THEMES } from '@/config/theme';
import app, { isDocumentNavigation } from '@/index';
import { parseSpecialParam, resolveAnimationMode, resolveVariant } from '@/routes/params';
import { resolveSvgRoute } from '@/routes/svg';
import { resetUpstreamCaches } from '@/services/fetcher';
import { formatCompactNumber, formatRelativeDate } from '@/services/metrics';
import type { Env } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Test Worker environment bindings. */
const TEST_ENV: Env = { ALLOW_PREVIEW_IN_PROD: 'true', DEFAULT_GH_OWNER: 'xulbux' };

// ----------------------------------------- MAIN ----------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  resetUpstreamCaches();
});

describe('helpers', () => {
  it('formats compact numbers with k, M, and B suffixes', () => {
    expect(formatCompactNumber(42)).toBe('42');
    expect(formatCompactNumber(1000)).toBe('1k');
    expect(formatCompactNumber(4820)).toBe('4.8k');
    expect(formatCompactNumber(2_500_000)).toBe('2.5M');
    expect(formatCompactNumber(1_200_000_000)).toBe('1.2B');
  });

  it('promotes values that round up to the next unit (regression: 999_950 rendered as "1000k")', () => {
    expect(formatCompactNumber(999_949)).toBe('999.9k');
    expect(formatCompactNumber(999_950)).toBe('1M');
    expect(formatCompactNumber(999_999_999)).toBe('1B');
    expect(formatCompactNumber(18.663753)).toBe('18.66');
  });

  it('formats relative dates from ISO timestamps', () => {
    const refMs = Date.parse('2026-10-17T12:00:00Z');
    expect(formatRelativeDate('2026-10-17T08:00:00Z', refMs)).toBe('today');
    expect(formatRelativeDate('2026-10-16T08:00:00Z', refMs)).toBe('yesterday');
    expect(formatRelativeDate('2026-10-13T08:00:00Z', refMs)).toBe('4d ago');
    expect(formatRelativeDate('2026-09-25T08:00:00Z', refMs)).toBe('3w ago');
    expect(formatRelativeDate('2026-06-10T08:00:00Z', refMs)).toBe('4mo ago');
  });

  it('resolves all 22 Tailwind v4 theme colors and falls back on unknown inputs', () => {
    expect(resolveColor('cyan', 'indigo')).toBe('cyan');
    expect(resolveColor('EMERALD', 'indigo')).toBe('emerald');
    expect(resolveColor('fuchsia', 'indigo')).toBe('fuchsia');
    expect(resolveColor('teal', 'indigo')).toBe('teal');
    expect(resolveColor('zinc', 'indigo')).toBe('zinc');
    expect(resolveColor('unknown-color', 'rose')).toBe('rose');
    expect(resolveColor(undefined, 'amber')).toBe('amber');
  });

  it('resolves canonical badge/button variant names and falls back on unknown inputs', () => {
    expect(resolveVariant('1', '2')).toBe('1');
    expect(resolveVariant('2', '1')).toBe('2');
    expect(resolveVariant('3', '1')).toBe('3');
    expect(resolveVariant('invalid', '2')).toBe('2');
  });

  it('resolves canonical animation modes (including sheen,<mode> combinations) and falls back to default', () => {
    expect(resolveAnimationMode('sheen')).toBe('sheen');
    expect(resolveAnimationMode('auto')).toBe('auto');
    expect(resolveAnimationMode('spin')).toBe('spin');
    expect(resolveAnimationMode('shake')).toBe('shake');
    expect(resolveAnimationMode('nudge')).toBe('nudge');
    expect(resolveAnimationMode('pulse')).toBe('pulse');
    expect(resolveAnimationMode('float')).toBe('float');
    expect(resolveAnimationMode('sheen,auto')).toBe('sheen,auto');
    expect(resolveAnimationMode('shake,sheen')).toBe('sheen,shake');
    expect(resolveAnimationMode('none')).toBe('none');
    expect(resolveAnimationMode(undefined)).toBe('default');
    expect(resolveAnimationMode('unknown')).toBe('default');
  });

  it('parses unified special=<type>:<payload> strings across all 5 widget types', () => {
    expect(parseSpecialParam('bar:94.5%')).toEqual({
      hasPulse: undefined,
      type: 'bar',
      value: 94.5,
    });
    expect(parseSpecialParam('bar:94.5:static')).toEqual({
      hasPulse: false,
      type: 'bar',
      value: 94.5,
    });
    expect(parseSpecialParam('ring:80')).toEqual({ hasPulse: undefined, type: 'ring', value: 80 });
    expect(parseSpecialParam('ring:80:pulse')).toEqual({ hasPulse: true, type: 'ring', value: 80 });
    expect(parseSpecialParam('strip:9940')).toEqual({
      states: ['9', '9', '4', '0'],
      type: 'strip',
    });
    expect(parseSpecialParam('delta:+12.4%')).toEqual({ type: 'delta', value: '+12.4%' });
    expect(parseSpecialParam('sparkline:4,8,6,12')).toEqual({
      type: 'sparkline',
      values: [4, 8, 6, 12],
    });
    expect(parseSpecialParam('invalid')).toBeUndefined();
  });

  it('detects document navigation vs image embeds from headers', () => {
    const imgReq = new Request('https://svg.xul.is/badge/test', {
      headers: { 'Sec-Fetch-Dest': 'image' },
    });
    expect(isDocumentNavigation(imgReq)).toBe(false);

    const docReq = new Request('https://svg.xul.is/badge/test', {
      headers: { 'Sec-Fetch-Dest': 'document' },
    });
    expect(isDocumentNavigation(docReq)).toBe(true);

    const acceptHtmlReq = new Request('https://svg.xul.is/badge/test', {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    expect(isDocumentNavigation(acceptHtmlReq)).toBe(true);
  });
});

describe('Hono routes on svg.xul.is', () => {
  it('renders homepage HTML at / and redirects when ALLOW_PREVIEW_IN_PROD is false', async () => {
    const response = await app.request('/', {}, TEST_ENV);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('One Cohesive <span class="hero-gradient-text">Edge SVG Engine</span>');
    expect(body).toContain('href="/docs/badges"');
    expect(body).toContain('href="/docs/buttons"');
    expect(body).toContain('href="/docs/services"');
    expect(body).toContain('<details class="code-drawer">');
    expect(body).toContain('class="ui-icon');
    expect(body).toContain('@view-transition');
    expect(body).toContain('class="feature-card"');

    const disabledRes = await app.request(
      '/',
      {},
      { ALLOW_PREVIEW_IN_PROD: 'false', DEFAULT_GH_OWNER: 'xulbux' }
    );
    expect(disabledRes.status).toBe(302);
    expect(disabledRes.headers.get('Location')).toBe('https://xul.is');
  });

  it('redirects /docs and /preview to /docs/badges and renders /docs/:section pages with syntax-highlighted Markdown code drawers', async () => {
    const docsRedirect = await app.request('/docs', {}, TEST_ENV);
    expect(docsRedirect.status).toBe(302);
    expect(docsRedirect.headers.get('Location')).toBe('/docs/badges');

    const previewRedirect = await app.request('/preview', {}, TEST_ENV);
    expect(previewRedirect.status).toBe(302);
    expect(previewRedirect.headers.get('Location')).toBe('/docs/badges');

    const badgesRes = await app.request('/docs/badges', {}, TEST_ENV);
    expect(badgesRes.status).toBe(200);
    expect(badgesRes.headers.get('Content-Type')).toContain('text/html');
    const body = await badgesRes.text();
    expect(body).toContain('View Markdown');
    expect(body).toContain(
      '<span class="hl-p">![</span><span class="hl-alt">build</span><span class="hl-p">](</span><span class="hl-url">https://svg.xul.is/badge/build/passing</span>'
    );

    const buttonsRes = await app.request('/docs/buttons', {}, TEST_ENV);
    expect(buttonsRes.status).toBe(200);
    expect(await buttonsRes.text()).toContain('Interactive CTA Buttons');

    const servicesRes = await app.request('/docs/services', {}, TEST_ENV);
    expect(servicesRes.status).toBe(200);
    const servicesBody = await servicesRes.text();
    expect(servicesBody).toContain('Live Service Badges');
    expect(servicesBody).toContain(
      '<span class="hl-p">![</span><span class="hl-alt">PyPI Version</span><span class="hl-p">](</span><span class="hl-url">https://svg.xul.is/badge/pypi/xulbux/v</span><span class="hl-p">)</span>'
    );

    const sectionRes = await app.request('/docs/stack', {}, TEST_ENV);
    expect(sectionRes.status).toBe(200);
    expect(await sectionRes.text()).toContain('Grouped Tech Stack Icon Grids');

    const unknownSectionRes = await app.request('/docs/unknown-page', {}, TEST_ENV);
    expect(unknownSectionRes.status).toBe(302);
    expect(unknownSectionRes.headers.get('Location')).toBe('/docs/badges');
  });

  it('renders 2-segment static badge under /badge/:label/:value with canonical query params and ignores ?label= on static badges', async () => {
    const response = await app.request(
      '/badge/coverage/99.4%25?color=emerald&variant=2&icon=shield-check&label=ignored&special=bar:99.4',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    const svg = await response.text();
    expect(svg).toContain('coverage');
    expect(svg).not.toContain('ignored');
    expect(svg).toContain('99.4%');
    expect(svg).toContain('width="32" height="6" rx="3"');
  });

  it('renders 1-segment 22px badge under /badge/:label, CTA buttons under /button/* and /btn/*, and serves /favicon.svg', async () => {
    const faviconRes = await app.request('/favicon.svg', {}, TEST_ENV);
    expect(faviconRes.status).toBe(200);
    expect(faviconRes.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(await faviconRes.text()).toContain('width="32" height="32"');

    const singleBadgeRes = await app.request(
      '/badge/xulbux?color=indigo&icon=sparkles',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(singleBadgeRes.status).toBe(200);
    expect(await singleBadgeRes.text()).toContain('height="22"');

    const buttonRes = await app.request(
      '/button/Documentation?color=indigo&icon=book-open,arrow-right&anim=sheen',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(buttonRes.status).toBe(200);
    const svg = await buttonRes.text();
    expect(svg).toContain('height="30"');
    expect(svg).toContain('Documentation');
    expect(svg).toContain('sheen-clip-');
    expect((svg.match(/scale\(0\.625\)/g) ?? []).length).toBe(2);
    expect(svg).not.toContain('translate(12, 12)');

    const splitBtnAliasRes = await app.request(
      '/btn/Deploy/Production?size=lg&variant=2&color=emerald&icon=none,arrow-right',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(splitBtnAliasRes.status).toBe(200);
    const splitSvg = await splitBtnAliasRes.text();
    expect(splitSvg).toContain('height="36"');
    expect(splitSvg).toContain('rx="11"');
    expect(splitSvg).toContain('Deploy');
    expect(splitSvg).toContain('Production');
    expect((splitSvg.match(/scale\(0\.7083\)/g) ?? []).length).toBe(1);
  });

  it('renders standalone SVG icons under /icon/:icon', async () => {
    const iconRes = await app.request(
      'https://svg.xul.is/icon/globe-code?color=violet&size=16&stroke=2.5&anim=none',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(iconRes.status).toBe(200);
    expect(iconRes.headers.get('Content-Type')).toContain('image/svg+xml');
    const iconSvg = await iconRes.text();
    expect(iconSvg).toContain('width="16" height="16" viewBox="-3 -3 30 30"');
    expect(iconSvg).toContain(`stroke="${THEMES.violet.iconColor}"`);
    expect(iconSvg).toContain('stroke-width="2.5"');
  });

  it('renders single and grouped tech stack grids under /stack/:icons and horizontal/vertical quote cards under /quote/:author/:text', async () => {
    const stackRes = await app.request(
      'https://svg.xul.is/stack/c,cpp,cs,rust,py,ts?perline=3&variant=1',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(stackRes.status).toBe(200);
    const stackSvg = await stackRes.text();
    expect(stackSvg).toContain('width="142" height="92"');

    const groupedStackRes = await app.request(
      'https://svg.xul.is/stack/figma,ai,blender,ps,pr,ae:3|obsidian,notion,codepen,gtk,latex,regex:3?variant=2',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(groupedStackRes.status).toBe(200);
    expect(await groupedStackRes.text()).toContain('width="310" height="92"');

    const quoteRes = await app.request(
      'https://svg.xul.is/quote/XulbuX/Who+says+programmers+are+boring%3F?color=indigo&variant=2&layout=vertical&size=lg',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(quoteRes.status).toBe(200);
    const quoteSvg = await quoteRes.text();
    expect(quoteSvg).toContain('Who says programmers are boring?');
    expect(quoteSvg).toContain('— XulbuX');
    expect(quoteSvg).toContain('rotate(180 12 12)');
  });

  it('renders /badge/status/:state/:text preset with outward radar ripple dot and 10-stage strip', async () => {
    const response = await app.request(
      '/badge/status/online/API+Online?special=strip:99994999',
      {},
      TEST_ENV
    );
    expect(response.status).toBe(200);
    const svg = await response.text();
    expect(svg).toContain('API Online');
    expect(svg).toContain('<animate attributeName="r"');
    expect(svg).toContain('width="2.5" height="10"');
  });
});

/** Extract the `aria-label` attribute of a rendered SVG. */
function extractAriaLabel(svg: string): string | undefined {
  return /aria-label="(?<label>[^"]*)"/.exec(svg)?.groups?.label;
}

describe('route parsing regressions', () => {
  it('renders documented empty-label and icon-only badge URLs instead of 404 (regression: /badge//:value, /badge/)', async () => {
    const compactRes = await app.request('/badge//100%25?icon=zap&color=amber', {}, TEST_ENV);
    expect(compactRes.status).toBe(200);
    expect(extractAriaLabel(await compactRes.text())).toBe('100%');

    const iconOnlyResponses = await Promise.all(
      ['/badge/?icon=github', '/badge?icon=github'].map((path) => app.request(path, {}, TEST_ENV))
    );
    for (const iconOnlyRes of iconOnlyResponses) {
      expect(iconOnlyRes.status).toBe(200);
    }
    const iconOnlySvgs = await Promise.all(iconOnlyResponses.map((response) => response.text()));
    for (const iconOnlySvg of iconOnlySvgs) {
      expect(extractAriaLabel(iconOnlySvg)).toBe('github');
    }
  });

  it('decodes path segments exactly once (regression: %2B became a space and %2525 became %)', async () => {
    const plusRes = await app.request('/badge/version/1.0.0%2Bbuild', {}, TEST_ENV);
    expect(extractAriaLabel(await plusRes.text())).toBe('version: 1.0.0+build');

    const percentRes = await app.request('/badge/escaped/100%2525', {}, TEST_ENV);
    expect(extractAriaLabel(await percentRes.text())).toBe('escaped: 100%25');

    const spaceRes = await app.request('/badge/a+b/c%20d', {}, TEST_ENV);
    expect(extractAriaLabel(await spaceRes.text())).toBe('a b: c d');

    const quoteRes = await app.request('/quote/A%2BB/C%2B%2B+rocks', {}, TEST_ENV);
    expect(extractAriaLabel(await quoteRes.text())).toContain('C++ rocks');
  });

  it('routes paths containing encoded line terminators (regression: %0A, %0D, and %E2%80%A8 returned 404)', async () => {
    const paths = [
      '/badge/a%0Ab/c',
      '/badge/a%0Db/c',
      '/badge/a%E2%80%A8b/c',
      '/quote/line%0Abreak',
    ];
    const responses = await Promise.all(paths.map((path) => app.request(path, {}, TEST_ENV)));
    for (let i = 0; i < paths.length; i += 1) {
      expect(responses[i].status, paths[i]).toBe(200);
    }
    expect(extractAriaLabel(await responses[0].text())).toBe('a b: c');
    const docsRes = await app.request('/docs/badges?x=%0A', {}, TEST_ENV);
    expect(docsRes.status).toBe(200);
  });

  it('ignores Object.prototype keys in user input instead of crashing (regression: /icon/constructor returned 500)', async () => {
    const paths = [
      '/icon/constructor',
      '/stack/constructor,toString',
      '/badge/status/constructor/x',
      '/badge/a/b?color=constructor&dot=toString&icon=hasOwnProperty&anim=auto',
      '/button/a?size=constructor',
      '/quote/a?size=toString',
    ];
    const responses = await Promise.all(paths.map((path) => app.request(path, {}, TEST_ENV)));
    const svgs = await Promise.all(responses.map((response) => response.text()));
    for (let i = 0; i < paths.length; i += 1) {
      expect(responses[i].status, paths[i]).toBe(200);
      expect(svgs[i]).not.toContain('undefined');
      expect(svgs[i]).not.toContain('native code');
    }
  });

  it('returns 404 for paths that match no SVG route', async () => {
    const paths = ['/badge/a/b/c', '/badge/a/b/c/d/e', '/icon/a/b', '/stack/a/b', '/nope'];
    const responses = await Promise.all(paths.map((path) => app.request(path, {}, TEST_ENV)));
    for (const response of responses) {
      expect(response.status).toBe(404);
    }
  });

  it('serves memoized documentation pages with Cache-Control headers', async () => {
    const firstRes = await app.request('/docs/icons', {}, TEST_ENV);
    const secondRes = await app.request('/docs/icons', {}, TEST_ENV);
    expect(firstRes.headers.get('Cache-Control')).toContain('s-maxage=');
    expect(await firstRes.text()).toBe(await secondRes.text());
  });

  it('routes multi-segment service targets only for services that declare maxTargetSegments', () => {
    const goMatch = resolveSvgRoute(new URL('/badge/go/github.com/spf13/cobra/v', SITE_ORIGIN));
    expect(goMatch).toEqual({
      kind: 'service',
      request: { metric: 'v', service: 'go', target: 'github.com/spf13/cobra' },
    });
    expect(resolveSvgRoute(new URL('/badge/npm/a/b/c/v', SITE_ORIGIN))).toBeUndefined();
  });
});

describe('response headers & revalidation', () => {
  it('adds security headers to HTML pages and a restrictive CSP to SVG responses', async () => {
    const homeRes = await app.request('/', {}, TEST_ENV);
    expect(homeRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(homeRes.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');

    const faviconRes = await app.request('/favicon.svg', {}, TEST_ENV);
    expect(faviconRes.headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'"
    );
    const secondFaviconRes = await app.request('/favicon.ico', {}, TEST_ENV);
    expect(await secondFaviconRes.text()).toBe(await faviconRes.text());
  });

  it('answers If-None-Match revalidations of memoized docs pages with 304 Not Modified', async () => {
    const firstRes = await app.request('/docs/colors', {}, TEST_ENV);
    const etag = firstRes.headers.get('ETag') ?? '';
    expect(etag).toMatch(/^W\/"[\da-f]+-[\da-f]+"$/);

    const revalidatedRes = await app.request(
      '/docs/colors',
      { headers: { 'If-None-Match': `"stale", ${etag}` } },
      TEST_ENV
    );
    expect(revalidatedRes.status).toBe(304);
    expect(revalidatedRes.headers.get('ETag')).toBe(etag);
    expect(revalidatedRes.headers.get('Cache-Control')).toContain('s-maxage=');
    expect(await revalidatedRes.text()).toBe('');

    const strongFormRes = await app.request(
      '/docs/colors',
      { headers: { 'If-None-Match': etag.slice(2) } },
      TEST_ENV
    );
    expect(strongFormRes.status).toBe(304);

    const staleRes = await app.request(
      '/docs/colors',
      { headers: { 'If-None-Match': '"stale"' } },
      TEST_ENV
    );
    expect(staleRes.status).toBe(200);
    expect(await staleRes.text()).toBe(await firstRes.text());
  });
});
