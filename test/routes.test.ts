/**
 * Worker route, readable query DSL, special element parser, service presets, and smart redirect tests (`src/index.ts`, `src/services/fetcher.ts`, `src/config/`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCompactNumber, formatRelativeDate } from '@/config/services';
import { resolveColor, THEMES } from '@/config/theme';
import app, {
  isDocumentNavigation,
  parseSpecialParam,
  resolveAnimationMode,
  resolveVariant,
} from '@/index';
import type { Env } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Test Worker environment bindings. */
const TEST_ENV: Env = { ALLOW_PREVIEW_IN_PROD: 'true', DEFAULT_GH_OWNER: 'xulbux' };

// ----------------------------------------- MAIN ----------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

describe('helpers', () => {
  it('formats compact numbers with k, M, and B suffixes', () => {
    expect(formatCompactNumber(42)).toBe('42');
    expect(formatCompactNumber(1000)).toBe('1k');
    expect(formatCompactNumber(4820)).toBe('4.8k');
    expect(formatCompactNumber(2_500_000)).toBe('2.5M');
    expect(formatCompactNumber(1_200_000_000)).toBe('1.2B');
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

  it('fetches GitHub, ClickPy PyPI, npm, Open VSX, Crates.io, and Docker Hub metrics and enforces GitHub owner allowlist', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // 1. GitHub stars & last-commit.
    fetchSpy.mockResolvedValueOnce(
      Response.json(
        { pushed_at: new Date().toISOString(), stargazers_count: 1420 },
        { status: 200 }
      )
    );
    const ghStarsRes = await app.request(
      '/badge/gh/color-tracr/stars',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(ghStarsRes.status).toBe(200);
    expect(await ghStarsRes.text()).toContain('1.4k');

    fetchSpy.mockResolvedValueOnce(
      Response.json({ pushed_at: new Date().toISOString() }, { status: 200 })
    );
    const ghCommitRes = await app.request(
      '/badge/gh/python-lib-xulbux/commit',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(ghCommitRes.status).toBe(200);
    expect(await ghCommitRes.text()).toContain('today');

    // 2. ClickHouse ClickPy PyPI total downloads (dt) with ?label= override + redirect to clickpy.clickhouse.com.
    fetchSpy.mockResolvedValueOnce(
      Response.json({ row_1: { last_month: '3333', total: '86808' } }, { status: 200 })
    );
    const pypiDtRes = await app.request(
      '/badge/pypi/xulbux/dt?label=total+downloads',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(pypiDtRes.status).toBe(200);
    const pypiDtSvg = await pypiDtRes.text();
    expect(pypiDtSvg).toContain('total downloads');
    expect(pypiDtSvg).toContain('86.8k');

    fetchSpy.mockResolvedValueOnce(
      Response.json({ row_1: { last_month: '3333', total: '86808' } }, { status: 200 })
    );
    const pypiDocNav = await app.request(
      '/badge/pypi/xulbux/dt',
      { headers: { 'Sec-Fetch-Dest': 'document' } },
      TEST_ENV
    );
    expect(pypiDocNav.status).toBe(302);
    expect(pypiDocNav.headers.get('Location')).toBe(
      'https://clickpy.clickhouse.com/dashboard/xulbux'
    );

    // 3. npm unscoped version & scoped downloads.
    fetchSpy.mockResolvedValueOnce(
      Response.json(
        { license: 'MIT', types: './dist/index.d.ts', version: '4.13.13' },
        { status: 200 }
      )
    );
    const npmVerRes = await app.request(
      '/badge/npm/hono/v',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(npmVerRes.status).toBe(200);
    expect(await npmVerRes.text()).toContain('v4.13.13');

    fetchSpy.mockResolvedValueOnce(Response.json({ downloads: 12_400_000 }, { status: 200 }));
    const npmScopedDlRes = await app.request(
      '/badge/npm/@hono/node-server/dt',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(npmScopedDlRes.status).toBe(200);
    expect(await npmScopedDlRes.text()).toContain('12.4M/yr');

    // 4. Open VSX version & total downloads.
    fetchSpy.mockResolvedValueOnce(
      Response.json({ downloadCount: 2486, version: '1.2.3' }, { status: 200 })
    );
    const ovsxRes = await app.request(
      '/badge/ovsx/color-tracr/v',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(ovsxRes.status).toBe(200);
    expect(await ovsxRes.text()).toContain('v1.2.3');

    // 5. Crates.io version & Docker Hub pulls.
    fetchSpy.mockResolvedValueOnce(
      Response.json(
        {
          crate: {
            downloads: 450_000_000,
            max_stable_version: '1.0.215',
            recent_downloads: 32_000_000,
          },
        },
        { status: 200 }
      )
    );
    const cratesRes = await app.request(
      '/badge/crates/serde/v',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(cratesRes.status).toBe(200);
    expect(await cratesRes.text()).toContain('v1.0.215');

    fetchSpy.mockResolvedValueOnce(
      Response.json({ pull_count: 1_200_000_000, star_count: 1940 }, { status: 200 })
    );
    const dockerRes = await app.request(
      '/badge/docker/nginx/pulls',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(dockerRes.status).toBe(200);
    expect(await dockerRes.text()).toContain('1.2B');

    // 6. Restricted owner check.
    const restrictedRes = await app.request(
      '/badge/gh/someone-else/some-repo/stars',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(restrictedRes.status).toBe(200);
    expect(await restrictedRes.text()).toContain('restricted');
  });
});
