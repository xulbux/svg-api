/**
 * Route tests – Worker routes, readable query DSL, special element parser, documentation pages, edge cache, and route regressions (`src/index.ts`, `src/routes/`, `src/preview/`, `src/config/`).
 */

import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { SITE_ORIGIN } from '@/config/site';
import { isThemeColorName, resolveColor, THEME_COLOR_NAMES, THEMES } from '@/config/theme';
import app from '@/index';
import {
  buildSvgCacheControl,
  computeEtag,
  isDocumentNavigation,
  isPreviewDisabledFlag,
  sanitizeRedirectUrl,
} from '@/routes/http';
import {
  decodeSegment,
  parseOptionalNumber,
  parsePerLineList,
  parseSpecialParam,
  resolveAnimationMode,
  resolveDotState,
  resolveIconQueryParam,
  resolveQuoteLayout,
  resolveSizeToken,
  resolveSpecialParam,
  resolveVariant,
  SIZE_TOKENS,
} from '@/routes/params';
import { renderSvgPath, resolveSvgRequest, resolveSvgRoute, SVG_ROUTES } from '@/routes/svg';
import { resetUpstreamCaches } from '@/services/fetcher';
import {
  MAX_BARS_POINTS,
  MAX_SPARKLINE_POINTS,
  MAX_STEPS_COUNT,
  MAX_STRIP_TICKS,
} from '@/svg/renderer';
import type { BadgeSpecialElement, BadgeSpecialMap, Env, ThemeColorName } from '@/types';
import { extractAriaLabel, installEdgeCacheStub, requireDefined, TEST_ENV } from './helpers';

// ---------------------------------------- CONSTS ---------------------------------------

/** Worker environment with the preview pages disabled. */
const DISABLED_ENV: Env = { ALLOW_PREVIEW_IN_PROD: 'false', DEFAULT_GH_OWNER: 'xulbux' };

/** Six valid stack icon slugs forming one group (wider than a `?perline=4` row). */
const STACK_GROUP = 'c,cpp,cs,rust,py,ts';

/** `URLSearchParams.get()` result of a missing query parameter (what the parsers receive from routes). */
const MISSING_PARAM = new URLSearchParams().get('missing');

// -------------------------------------- INTERNALS --------------------------------------

/** Request every path concurrently against the Worker app. */
function requestAll(paths: readonly string[], env: Env): Promise<Response[]> {
  return Promise.all(paths.map((path) => app.request(path, {}, env)));
}

/** Silence and capture `console.error` output of the `app.onError` handler. */
function muteConsoleError() {
  return vi.spyOn(console, 'error').mockReturnValue(undefined);
}

// ----------------------------------------- MAIN ----------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetUpstreamCaches();
});

describe('resolveColor', () => {
  it('resolves all 22 Tailwind v4 theme colors and falls back on unknown inputs', () => {
    expect(resolveColor('cyan', 'indigo')).toBe('cyan');
    expect(resolveColor('EMERALD', 'indigo')).toBe('emerald');
    expect(resolveColor('fuchsia', 'indigo')).toBe('fuchsia');
    expect(resolveColor('teal', 'indigo')).toBe('teal');
    expect(resolveColor('zinc', 'indigo')).toBe('zinc');
    expect(resolveColor('unknown-color', 'rose')).toBe('rose');
    expect(resolveColor(undefined, 'amber')).toBe('amber');
  });

  it('lists every theme color exactly once and guards untrusted color keys', () => {
    expectTypeOf<(typeof THEME_COLOR_NAMES)[number]>().toEqualTypeOf<ThemeColorName>();
    expect(new Set(THEME_COLOR_NAMES).size).toBe(THEME_COLOR_NAMES.length);
    expect(THEME_COLOR_NAMES).toHaveLength(22);
    for (const colorName of THEME_COLOR_NAMES) {
      expect(isThemeColorName(colorName), colorName).toBe(true);
    }
    expect(isThemeColorName('constructor')).toBe(false);
    expect(isThemeColorName('Indigo')).toBe(false);
    expect(isThemeColorName('')).toBe(false);
  });

  it('emits upper-case hex theme colors like the fixed palette', () => {
    for (const colorName of THEME_COLOR_NAMES) {
      expect(THEMES[colorName].gradEnd, colorName).toMatch(/^#[\dA-F]{6}$/);
      expect(THEMES[colorName].accentText, colorName).toMatch(/^#[\dA-F]{6}$/);
    }
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
    expect(resolveAnimationMode('breathe')).toBe('breathe');
    expect(resolveAnimationMode('grow')).toBe('breathe');
    expect(resolveAnimationMode('scale')).toBe('breathe');
    expect(resolveAnimationMode('turn')).toBe('turn');
    expect(resolveAnimationMode('twirl')).toBe('turn');
    expect(resolveAnimationMode('whirl')).toBe('whirl');
    expect(resolveAnimationMode('spin-smooth')).toBe('whirl');
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

describe('route parameter parsers', () => {
  it('parses optional finite numbers and rejects empty, non-numeric, and infinite values', () => {
    expect(parseOptionalNumber(' 24 ')).toBe(24);
    expect(parseOptionalNumber('2.25')).toBe(2.25);
    expect(parseOptionalNumber('-3')).toBe(-3);
    for (const raw of [
      undefined,
      MISSING_PARAM,
      '',
      '   ',
      'abc',
      '1e999',
      '-Infinity',
      'NaN',
      '12px',
    ]) {
      expect(parseOptionalNumber(raw), String(raw)).toBeUndefined();
    }
  });

  it('resolves named size tokens case-insensitively, numeric sizes, and rejects unknown tokens', () => {
    for (const token of SIZE_TOKENS) {
      expect(resolveSizeToken(token)).toBe(token);
    }
    expect(SIZE_TOKENS).toEqual(['sm', 'md', 'lg', 'xl']);
    expect(resolveSizeToken(' LG ')).toBe('lg');
    expect(resolveSizeToken('32')).toBe(32);
    expect(resolveSizeToken('huge')).toBeUndefined();
    expect(resolveSizeToken('constructor')).toBeUndefined();
    expect(resolveSizeToken(MISSING_PARAM)).toBeUndefined();
  });

  it('keeps ?perline= positions for invalid entries (regression: 8,0,4 shifted 4 onto the second group)', () => {
    expect(parsePerLineList('8,0,4')).toEqual([8, undefined, 4]);
    expect(parsePerLineList('8,x,4')).toEqual([8, undefined, 4]);
    expect(parsePerLineList('8 6 4')).toEqual([8, 6, 4]);
    expect(parsePerLineList('3.6')).toEqual([4]);
    expect(parsePerLineList('8,')).toEqual([8]);
    expect(parsePerLineList('8,0')).toEqual([8]);
    for (const raw of [undefined, MISSING_PARAM, '', '0', 'x,0', ' , ']) {
      expect(parsePerLineList(raw), String(raw)).toBeUndefined();
    }
  });

  it('falls through empty quote layout aliases and only consults ?center= without a layout (regression: ?layout=&type=vertical)', () => {
    expect(resolveQuoteLayout('', 'vertical', MISSING_PARAM)).toBe('vertical');
    expect(resolveQuoteLayout(' V ', MISSING_PARAM, MISSING_PARAM)).toBe('vertical');
    expect(resolveQuoteLayout('center', MISSING_PARAM, MISSING_PARAM)).toBe('vertical');
    expect(resolveQuoteLayout(MISSING_PARAM, MISSING_PARAM, MISSING_PARAM)).toBe('horizontal');
    for (const center of ['true', ' TRUE ', '1', 'yes']) {
      expect(resolveQuoteLayout(MISSING_PARAM, '', center), center).toBe('vertical');
    }
    for (const center of ['false', '0', 'no', '']) {
      expect(resolveQuoteLayout(MISSING_PARAM, MISSING_PARAM, center), center).toBe('horizontal');
    }
    expect(resolveQuoteLayout('horizontal', MISSING_PARAM, 'true')).toBe('horizontal');
  });

  it('keeps the preset icon for an empty ?icon= (regression: ?icon= removed the service icon)', () => {
    expect(resolveIconQueryParam('', 'npm')).toBe('npm');
    expect(resolveIconQueryParam('   ', 'npm')).toBe('npm');
    expect(resolveIconQueryParam(MISSING_PARAM, 'npm')).toBe('npm');
    expect(resolveIconQueryParam(',arrow-right', 'npm')).toBe('npm,arrow-right');
    expect(resolveIconQueryParam('none', 'npm')).toBe('none');
    expect(resolveIconQueryParam(' github ')).toBe('github');
    expect(resolveIconQueryParam('')).toBeUndefined();
  });

  it('resolves dot states from status presets and theme colors and rejects prototype keys', () => {
    expect(resolveDotState('online')).toBe('green');
    expect(resolveDotState(' EMERALD ')).toBe('emerald');
    expect(resolveDotState('none', 'green')).toBeUndefined();
    expect(resolveDotState('', 'sky')).toBe('sky');
    expect(resolveDotState('constructor', 'sky')).toBe('sky');
    expect(resolveDotState('bogus')).toBeUndefined();
  });

  it('resolves automatic, manual, and none ?special= parameters against preset widgets', () => {
    const defaultRing: BadgeSpecialElement = { type: 'ring', value: 85 };
    const autoSpecials: BadgeSpecialMap = {
      bar: { type: 'bar', value: 85 },
      delta: { type: 'delta', value: '+14%' },
      ring: defaultRing,
      sparkline: { type: 'sparkline', values: [10, 20, 30] },
    };
    expect(resolveSpecialParam(MISSING_PARAM, defaultRing, autoSpecials)).toEqual(defaultRing);
    expect(resolveSpecialParam('', defaultRing, autoSpecials)).toEqual(defaultRing);
    expect(resolveSpecialParam('none', defaultRing, autoSpecials)).toBeUndefined();
    expect(resolveSpecialParam('sparkline', defaultRing, autoSpecials)).toEqual(
      autoSpecials.sparkline
    );
    expect(resolveSpecialParam('sparkline:auto', defaultRing, autoSpecials)).toEqual(
      autoSpecials.sparkline
    );
    expect(resolveSpecialParam('bar:static', defaultRing, autoSpecials)).toEqual({
      hasPulse: false,
      type: 'bar',
      value: 85,
    });
    expect(resolveSpecialParam('ring:pulse', defaultRing, autoSpecials)).toEqual({
      hasPulse: true,
      type: 'ring',
      value: 85,
    });
    expect(resolveSpecialParam('ring::static', defaultRing, autoSpecials)).toEqual({
      hasPulse: false,
      type: 'ring',
      value: 85,
    });
    expect(resolveSpecialParam('steps', defaultRing, autoSpecials)).toEqual(defaultRing);
    expect(resolveSpecialParam('steps', undefined, autoSpecials)).toBeUndefined();
    expect(resolveSpecialParam('delta:+99%', defaultRing, autoSpecials)).toEqual({
      type: 'delta',
      value: '+99%',
    });
  });

  it('rejects malformed special payloads and caps sparkline, bars, steps, and strip lengths', () => {
    for (const raw of [
      'bar:',
      'bar:abc',
      'bar:1e999',
      'bars:',
      'bars:4',
      'ring:%',
      'delta:',
      ':5',
      'steps:',
      'steps:3',
      'steps:3/0',
      'steps:a/5',
      'strip:',
      'strip:xyz',
    ]) {
      expect(parseSpecialParam(raw), raw).toBeUndefined();
    }
    expect(parseSpecialParam('BAR:5')).toEqual({ hasPulse: undefined, type: 'bar', value: 5 });
    expect(parseSpecialParam('sparkline:4')).toBeUndefined();

    const manyPoints = Array.from({ length: MAX_SPARKLINE_POINTS * 3 }, (_unused, i) => i);
    expect(parseSpecialParam(`sparkline:${manyPoints.join(',')}`)).toEqual({
      type: 'sparkline',
      values: manyPoints.slice(0, MAX_SPARKLINE_POINTS),
    });
    expect(parseSpecialParam('sparkline:1,x,2,,3')).toEqual({
      type: 'sparkline',
      values: [1, 2, 3],
    });
    expect(parseSpecialParam(`bars:${manyPoints.join(',')}`)).toEqual({
      type: 'bars',
      values: manyPoints.slice(0, MAX_BARS_POINTS),
    });
    expect(parseSpecialParam('steps:3/5')).toEqual({ done: 3, total: 5, type: 'steps' });
    expect(parseSpecialParam('steps:99/50')).toEqual({
      done: MAX_STEPS_COUNT,
      total: MAX_STEPS_COUNT,
      type: 'steps',
    });

    const longStrip = parseSpecialParam(`strip:${'9'.repeat(MAX_STRIP_TICKS * 5)}`);
    expect(longStrip?.type === 'strip' ? longStrip.states : []).toHaveLength(MAX_STRIP_TICKS);
    const longSeparatedStrip = parseSpecialParam(`strip:${'8,'.repeat(MAX_STRIP_TICKS * 5)}`);
    expect(longSeparatedStrip?.type === 'strip' ? longSeparatedStrip.states : []).toHaveLength(
      MAX_STRIP_TICKS
    );
    expect(parseSpecialParam('strip:98,7 x,5')).toEqual({ states: ['7', '5'], type: 'strip' });
    expect(parseSpecialParam('strip:9a8')).toEqual({ states: ['9', '8'], type: 'strip' });
  });

  it('rejects animation inputs with duplicate sheen, more than 3 tokens, or excessive length early', () => {
    expect(resolveAnimationMode('sheen,none')).toBe('sheen');
    expect(resolveAnimationMode(' Sheen , Auto ')).toBe('sheen,auto');
    expect(resolveAnimationMode('sheen,shake,nudge')).toBe('sheen,shake,nudge');
    expect(resolveAnimationMode('sheen,sheen')).toBe('default');
    expect(resolveAnimationMode('sheen,sheen,auto')).toBe('default');
    expect(resolveAnimationMode('shake,nudge,spin')).toBe('default');
    expect(resolveAnimationMode('sheen,shake,nudge,spin')).toBe('default');
    expect(resolveAnimationMode('sheen,sheen,sheen,sheen')).toBe('default');
    expect(resolveAnimationMode(`${'sheen,'.repeat(5000)}auto`, 'none')).toBe('none');
  });

  it('decodes malformed percent-encoding to the +-decoded raw text instead of throwing', () => {
    expect(decodeSegment('%E0%A4%A')).toBe('%E0%A4%A');
    expect(decodeSegment('100%')).toBe('100%');
    expect(decodeSegment('%ZZ+x')).toBe('%ZZ x');
    expect(decodeSegment('a+b%2B')).toBe('a b+');
  });
});

describe('HTTP helpers', () => {
  it('parses ALLOW_PREVIEW_IN_PROD case-insensitively (false and 0 disable the previews)', () => {
    for (const flag of ['false', ' FALSE ', '0']) {
      expect(isPreviewDisabledFlag(flag), flag).toBe(true);
    }
    for (const flag of [undefined, '', 'true', '1', 'no']) {
      expect(isPreviewDisabledFlag(flag), String(flag)).toBe(false);
    }
  });

  it('accepts only parseable http(s) redirect URLs without control characters', () => {
    expect(sanitizeRedirectUrl(' https://www.npmjs.com/package/hono ')).toBe(
      'https://www.npmjs.com/package/hono'
    );
    expect(sanitizeRedirectUrl('http://xul.is')).toBe('http://xul.is');
    for (const rawUrl of [
      'data:text/html,hello',
      'mailto:hi@xul.is',
      'ftp://xul.is',
      'not a url',
      '',
      'https://xul.is/a\nb',
      'https://',
    ]) {
      expect(sanitizeRedirectUrl(rawUrl), rawUrl).toBeUndefined();
    }
  });

  it('computes deterministic weak entity tags and SVG Cache-Control headers', () => {
    expect(computeEtag('abc')).toBe(computeEtag('abc'));
    expect(computeEtag('abc')).not.toBe(computeEtag('abd'));
    expect(computeEtag('abc')).toMatch(/^W\/"[\da-z]+-3"$/);
    expect(buildSvgCacheControl(300)).toBe(
      'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
    );
  });
});

describe('Hono routes on svg.xul.is', () => {
  it('renders homepage HTML at / and redirects when ALLOW_PREVIEW_IN_PROD is false', async () => {
    const response = await app.request('/', {}, TEST_ENV);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('One Cohesive <span class="hero-accent">Edge SVG Engine</span>');
    expect(body).toContain('href="/docs"');
    expect(body).toContain('href="/builder"');
    expect(body).toContain('href="/builder/badge"');
    expect(body).toContain('<details class="code-drawer">');
    expect(body).toContain('class="ui-icon');
    expect(body).toMatch(/<link rel="stylesheet" href="\/assets\/site\.css\?v=[\da-z]+" \/>/);
    expect(body).toContain('class="feature-card"');

    const disabledRes = await app.request('/', {}, DISABLED_ENV);
    expect(disabledRes.status).toBe(302);
    expect(disabledRes.headers.get('Location')).toBe('https://xul.is');
  });

  it('renders the /docs overview, redirects /preview and unknown sections to /docs, and renders /docs/:section pages with syntax-highlighted Markdown code drawers', async () => {
    const docsRes = await app.request('/docs', {}, TEST_ENV);
    expect(docsRes.status).toBe(200);
    expect(docsRes.headers.get('Content-Type')).toContain('text/html');
    expect(await docsRes.text()).toContain('Encoding Path Segments');

    const previewRedirect = await app.request('/preview', {}, TEST_ENV);
    expect(previewRedirect.status).toBe(302);
    expect(previewRedirect.headers.get('Location')).toBe('/docs');

    const badgesRes = await app.request('/docs/badges', {}, TEST_ENV);
    expect(badgesRes.status).toBe(200);
    expect(badgesRes.headers.get('Content-Type')).toContain('text/html');
    const body = await badgesRes.text();
    expect(body).toContain('View Markdown');
    expect(body).toContain(
      '<span class="hl-p">![</span><span class="hl-alt">Build</span><span class="hl-p">](</span><span class="hl-url">https://svg.xul.is/badge</span><span class="hl-path">/Build/Passing</span>'
    );

    const buttonsRes = await app.request('/docs/buttons', {}, TEST_ENV);
    expect(buttonsRes.status).toBe(200);
    expect(await buttonsRes.text()).toContain('Interactive CTA Buttons');

    const servicesRes = await app.request('/docs/services', {}, TEST_ENV);
    expect(servicesRes.status).toBe(200);
    const servicesBody = await servicesRes.text();
    expect(servicesBody).toContain('Live Service Badges');
    expect(servicesBody).toContain(
      '<span class="hl-p">![</span><span class="hl-alt">PyPI Version</span><span class="hl-p">](</span><span class="hl-url">https://svg.xul.is/badge</span><span class="hl-path">/pypi/xulbux/v</span><span class="hl-p">)</span>'
    );

    const sectionRes = await app.request('/docs/stack', {}, TEST_ENV);
    expect(sectionRes.status).toBe(200);
    expect(await sectionRes.text()).toContain('Grouped Tech Stack Icon Grids');

    const unknownPaths = ['/docs/unknown-page', '/docs/overview'];
    const unknownResponses = await requestAll(unknownPaths, TEST_ENV);
    for (const [i, response] of unknownResponses.entries()) {
      expect(response.status, unknownPaths[i]).toBe(302);
      expect(response.headers.get('Location'), unknownPaths[i]).toBe('/docs');
    }
  });

  it('redirects /builder and unknown kinds to /builder/badge and renders every builder page', async () => {
    const redirectPaths = ['/builder', '/builder/unknown'];
    const redirectResponses = await requestAll(redirectPaths, TEST_ENV);
    for (const [i, response] of redirectResponses.entries()) {
      expect(response.status, redirectPaths[i]).toBe(302);
      expect(response.headers.get('Location'), redirectPaths[i]).toBe('/builder/badge');
    }
    const builderPaths = ['badge', 'service', 'button', 'icon', 'stack', 'quote'].map(
      (kind) => `/builder/${kind}`
    );
    const builderResponses = await requestAll(builderPaths, TEST_ENV);
    for (const [i, response] of builderResponses.entries()) {
      expect(response.status, builderPaths[i]).toBe(200);
      expect(response.headers.get('Content-Type'), builderPaths[i]).toContain('text/html');
    }
  });

  it('disables the docs, builder, and asset routes when ALLOW_PREVIEW_IN_PROD is false', async () => {
    const disabledPaths = [
      '/docs',
      '/docs/badges',
      '/docs/',
      '/preview',
      '/builder',
      '/builder/icon',
      '/builder/',
    ];
    const disabledResponses = await requestAll(disabledPaths, DISABLED_ENV);
    for (const [i, response] of disabledResponses.entries()) {
      expect(response.status, disabledPaths[i]).toBe(302);
      expect(response.headers.get('Location'), disabledPaths[i]).toBe('https://xul.is');
    }
    const assetRes = await app.request('/assets/site.css', {}, DISABLED_ENV);
    expect(assetRes.status).toBe(404);
  });

  it('treats ALLOW_PREVIEW_IN_PROD case-insensitively (regression: " FALSE " and "0" kept the previews online)', async () => {
    const flags = [' FALSE ', '0'];
    const responses = await Promise.all(
      flags.map((flag) =>
        app.request('/docs', {}, { ALLOW_PREVIEW_IN_PROD: flag, DEFAULT_GH_OWNER: 'xulbux' })
      )
    );
    for (const [i, response] of responses.entries()) {
      expect(response.status, flags[i]).toBe(302);
      expect(response.headers.get('Location'), flags[i]).toBe('https://xul.is');
    }
  });

  it('redirects trailing-slash docs and builder paths to their canonical paths (regression: /docs/ returned 404)', async () => {
    const cases: readonly (readonly [path: string, location: string])[] = [
      ['/docs/', '/docs'],
      ['/docs/badges/', '/docs/badges'],
      ['/builder/', '/builder'],
      ['/builder/badge/?label=a', '/builder/badge?label=a'],
    ];
    const responses = await requestAll(
      cases.map(([path]) => path),
      TEST_ENV
    );
    for (const [i, [path, location]] of cases.entries()) {
      const response = requireDefined(responses[i], path);
      expect(response.status, path).toBe(301);
      expect(response.headers.get('Location'), path).toBe(location);
    }
  });

  it('serves versioned static assets immutably and unknown assets as 404', async () => {
    const homeRes = await app.request('/', {}, TEST_ENV);
    const homeBody = await homeRes.text();
    const assetUrls = homeBody.match(/\/assets\/site\.(?:css|js)\?v=[\da-z]+/g) ?? [];
    expect(assetUrls).toHaveLength(2);
    const versionedResponses = await requestAll(assetUrls, TEST_ENV);
    const staleResponses = await requestAll(
      assetUrls.map((assetUrl) => assetUrl.replace(/\?v=.*/, '?v=stale')),
      TEST_ENV
    );
    for (const [i, assetUrl] of assetUrls.entries()) {
      const versionedResponse = requireDefined(versionedResponses[i], assetUrl);
      const staleResponse = requireDefined(staleResponses[i], assetUrl);
      expect(versionedResponse.status, assetUrl).toBe(200);
      expect(versionedResponse.headers.get('Cache-Control'), assetUrl).toContain('immutable');
      expect(versionedResponse.headers.get('ETag'), assetUrl).toMatch(/^W\/"/);
      expect(staleResponse.status, assetUrl).toBe(200);
      expect(staleResponse.headers.get('Cache-Control'), assetUrl).not.toContain('immutable');
    }
    const [cssRes, unknownRes, prototypeRes] = await Promise.all([
      app.request('/assets/site.css', {}, TEST_ENV),
      app.request('/assets/unknown.js', {}, TEST_ENV),
      app.request('/assets/constructor', {}, TEST_ENV),
    ]);
    expect(cssRes.headers.get('Content-Type')).toContain('text/css');
    expect(cssRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(unknownRes.status).toBe(404);
    expect(prototypeRes.status).toBe(404);
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
    expect(svg.match(/scale\(0\.625\)/g) ?? []).toHaveLength(2);
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
    expect(splitSvg.match(/scale\(0\.7083\)/g) ?? []).toHaveLength(1);
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
    expect(iconSvg).toContain('width="16" height="16" viewBox="-3 -5 30 30"');
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

describe('route parsing regressions', () => {
  it('renders documented empty-label and icon-only badge URLs instead of 404 (regression: /badge//:value, /badge/)', async () => {
    const compactRes = await app.request('/badge//100%25?icon=zap&color=amber', {}, TEST_ENV);
    expect(compactRes.status).toBe(200);
    expect(extractAriaLabel(await compactRes.text())).toBe('100%');

    const iconOnlyResponses = await requestAll(
      ['/badge/?icon=github', '/badge?icon=github'],
      TEST_ENV
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

    const malformedRes = await app.request('/badge/a%E0%A4%A/b', {}, TEST_ENV);
    expect(malformedRes.status).toBe(200);
    expect(extractAriaLabel(await malformedRes.text())).toBe('a%E0%A4%A: b');
  });

  it('routes paths containing encoded line terminators (regression: %0A, %0D, and %E2%80%A8 returned 404)', async () => {
    const paths = [
      '/badge/a%0Ab/c',
      '/badge/a%0Db/c',
      '/badge/a%E2%80%A8b/c',
      '/quote/line%0Abreak',
    ];
    const responses = await requestAll(paths, TEST_ENV);
    for (const [i, response] of responses.entries()) {
      expect(response.status, paths[i]).toBe(200);
    }
    expect(extractAriaLabel(await requireDefined(responses[0], 'first response').text())).toBe(
      'a b: c'
    );
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
    const responses = await requestAll(paths, TEST_ENV);
    const svgs = await Promise.all(responses.map((response) => response.text()));
    for (const [i, response] of responses.entries()) {
      expect(response.status, paths[i]).toBe(200);
      expect(svgs[i]).not.toContain('undefined');
      expect(svgs[i]).not.toContain('native code');
    }
  });

  it('returns 404 for paths that match no SVG route', async () => {
    const paths = ['/badge/a/b/c', '/badge/a/b/c/d/e', '/icon/a/b', '/icon', '/stack/a/b', '/nope'];
    const responses = await requestAll(paths, TEST_ENV);
    for (const [i, response] of responses.entries()) {
      expect(response.status, paths[i]).toBe(404);
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

  it('keeps per-icon brand colors for invalid stack colors (regression: ?color=foo forced indigo)', () => {
    const brandSvg = renderSvgPath('/stack/react,rust');
    expect(renderSvgPath('/stack/react,rust?color=foo')).toBe(brandSvg);
    expect(renderSvgPath('/stack/react,rust?color=constructor')).toBe(brandSvg);
    expect(renderSvgPath('/stack/react,rust?color=indigo')).not.toBe(brandSvg);
    expect(renderSvgPath('/stack/react,rust?color=%20Emerald%20')).toBe(
      renderSvgPath('/stack/react,rust?color=emerald')
    );
  });

  it('falls through empty stack aliases in the documented order groups, icons, i (regression: /stack/?icons=react rendered an empty stack)', () => {
    const pathSvg = renderSvgPath('/stack/react');
    for (const path of [
      '/stack/?icons=react',
      '/stack/?groups=react',
      '/stack?i=react',
      '/stack?groups=&icons=react',
      '/stack?groups=react&icons=rust&i=py',
      '/stack?icons=react&i=py',
    ]) {
      expect(renderSvgPath(path), path).toBe(pathSvg);
    }
    expect(renderSvgPath('/stack/rust?groups=react')).toBe(renderSvgPath('/stack/rust'));
  });

  it('falls through an empty ?groupgap= to ?ggap= (regression: ?groupgap=&ggap=12 ignored ggap)', () => {
    const aliasSvg = renderSvgPath('/stack/react;rust?ggap=40');
    expect(renderSvgPath('/stack/react;rust?groupgap=&ggap=40')).toBe(aliasSvg);
    expect(renderSvgPath('/stack/react;rust?groupgap=40')).toBe(aliasSvg);
    expect(renderSvgPath('/stack/react;rust')).not.toBe(aliasSvg);
  });

  it('keeps ?perline= values on their groups (regression: ?perline=8,0,4 applied 4 to the second group)', () => {
    const stackPath = `/stack/${STACK_GROUP}|${STACK_GROUP}|${STACK_GROUP}`;
    const holeSvg = renderSvgPath(`${stackPath}?perline=8,0,4`);
    expect(renderSvgPath(`${stackPath}?perline=8,x,4`)).toBe(holeSvg);
    expect(renderSvgPath(`${stackPath}?perline=8,8,4`)).toBe(holeSvg);
    expect(renderSvgPath(`${stackPath}?perline=8,4`)).not.toBe(holeSvg);
  });

  it('falls back to a neutral slate status for unknown states (regression: /badge/status/typo/x claimed online)', () => {
    const unknownSvg = renderSvgPath('/badge/status/typo/x');
    expect(unknownSvg).toBe(renderSvgPath('/badge/status/standby/x'));
    expect(unknownSvg).not.toBe(renderSvgPath('/badge/status/online/x'));
    expect(renderSvgPath('/badge/status/ONLINE/x')).toBe(renderSvgPath('/badge/status/online/x'));
  });

  it('falls through empty quote layout aliases (regression: ?layout=&type=vertical rendered horizontally)', () => {
    const verticalSvg = renderSvgPath('/quote/Hello?layout=vertical');
    expect(renderSvgPath('/quote/Hello?layout=&type=vertical')).toBe(verticalSvg);
    expect(renderSvgPath('/quote/Hello?center=%20Yes%20')).toBe(verticalSvg);
    expect(renderSvgPath('/quote/Hello?layout=horizontal&center=true')).toBe(
      renderSvgPath('/quote/Hello')
    );
  });
});

describe('SVG route table & edge cache keys', () => {
  it('registers every route table prefix with Hono', async () => {
    const responses = await requestAll(
      SVG_ROUTES.map((route) => `/${route.prefix}/x`),
      TEST_ENV
    );
    for (const [i, response] of responses.entries()) {
      expect(response.status, SVG_ROUTES[i]?.prefix).toBe(200);
      expect(response.headers.get('Content-Type'), SVG_ROUTES[i]?.prefix).toContain(
        'image/svg+xml'
      );
    }
  });

  it('lists every route table prefix and query parameter list alphabetically', () => {
    const prefixes = SVG_ROUTES.map((route) => route.prefix);
    expect(prefixes).toEqual(prefixes.toSorted());
    for (const route of SVG_ROUTES) {
      expect(route.queryParams, route.prefix).toEqual(route.queryParams.toSorted());
    }
  });

  it('normalizes cache keys to the recognized query parameters in sorted order', () => {
    const canonical = resolveSvgRequest(
      new URL('/stack/c,cpp?color=emerald&variant=1', SITE_ORIGIN)
    );
    const reordered = resolveSvgRequest(
      new URL('/stack/c,cpp?utm_source=x&variant=1&color=emerald&color=rose', SITE_ORIGIN)
    );
    expect(canonical?.cacheKey).toBe(`${SITE_ORIGIN}/stack/c,cpp?color=emerald&variant=1`);
    expect(reordered?.cacheKey).toBe(canonical?.cacheKey);
    expect(resolveSvgRequest(new URL('/icon/zap?utm=1', SITE_ORIGIN))?.cacheKey).toBe(
      `${SITE_ORIGIN}/icon/zap`
    );
    expect(
      resolveSvgRequest(new URL('/badge/npm/hono/v?label=x&foo=1&anim=none', SITE_ORIGIN))?.cacheKey
    ).toBe(`${SITE_ORIGIN}/badge/npm/hono/v?anim=none&label=x`);
  });

  it('ignores unrecognized query parameters when rendering, so the cache key determines the SVG', () => {
    expect(renderSvgPath('/badge/a/b?color=rose&foo=bar')).toBe(
      renderSvgPath('/badge/a/b?color=rose')
    );
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

  it('sends CORS, CSP, nosniff, and per-route Cache-Control headers on every SVG route kind', async () => {
    const cases: readonly (readonly [path: string, sharedMaxAge: number])[] = [
      ['/badge/a/b', 3600],
      ['/badge/status/online/up', 300],
      ['/button/Go', 3600],
      ['/btn/Go', 3600],
      ['/icon/zap', 3600],
      ['/stack/react', 3600],
      ['/quote/Hello', 3600],
    ];
    const responses = await requestAll(
      cases.map(([path]) => path),
      TEST_ENV
    );
    for (const [i, [path, sharedMaxAge]] of cases.entries()) {
      const { headers } = requireDefined(responses[i], path);
      expect(headers.get('Cache-Control'), path).toBe(buildSvgCacheControl(sharedMaxAge));
      expect(headers.get('Access-Control-Allow-Origin'), path).toBe('*');
      expect(headers.get('Content-Security-Policy'), path).toBe(
        "default-src 'none'; style-src 'unsafe-inline'"
      );
      expect(headers.get('X-Content-Type-Options'), path).toBe('nosniff');
      expect(headers.get('Content-Type'), path).toBe('image/svg+xml; charset=utf-8');
    }
  });

  it('answers HEAD requests with headers only', async () => {
    const [svgRes, docsRes] = await Promise.all([
      app.request('/badge/a/b', { method: 'HEAD' }, TEST_ENV),
      app.request('/docs', { method: 'HEAD' }, TEST_ENV),
    ]);
    expect(svgRes.status).toBe(200);
    expect(svgRes.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(await svgRes.text()).toBe('');
    expect(docsRes.status).toBe(200);
    expect(docsRes.headers.get('ETag')).toMatch(/^W\/"/);
    expect(await docsRes.text()).toBe('');
  });

  it('answers If-None-Match revalidations of memoized docs pages with 304 Not Modified', async () => {
    const firstRes = await app.request('/docs/colors', {}, TEST_ENV);
    const etag = firstRes.headers.get('ETag') ?? '';
    expect(etag).toMatch(/^W\/"[\da-z]+-[\da-z]+"$/);

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

    const wildcardRes = await app.request(
      '/docs/colors',
      { headers: { 'If-None-Match': '*' } },
      TEST_ENV
    );
    expect(wildcardRes.status).toBe(304);

    const staleRes = await app.request(
      '/docs/colors',
      { headers: { 'If-None-Match': '"stale"' } },
      TEST_ENV
    );
    expect(staleRes.status).toBe(200);
    expect(await staleRes.text()).toBe(await firstRes.text());
  });

  it('answers If-None-Match revalidations of static assets with 304 Not Modified', async () => {
    const assetRes = await app.request('/assets/site.css', {}, TEST_ENV);
    const etag = assetRes.headers.get('ETag') ?? '';
    expect(etag).toMatch(/^W\/"/);
    const [matchingRes, wildcardRes] = await Promise.all([
      app.request('/assets/site.css', { headers: { 'If-None-Match': etag } }, TEST_ENV),
      app.request('/assets/site.css', { headers: { 'If-None-Match': '*' } }, TEST_ENV),
    ]);
    expect(matchingRes.status).toBe(304);
    expect(await matchingRes.text()).toBe('');
    expect(wildcardRes.status).toBe(304);

    const fontRes = await app.request('/assets/JetBrainsMono-Regular.ttf', {}, TEST_ENV);
    expect(fontRes.status).toBe(200);
    expect(fontRes.headers.get('Content-Type')).toBe('font/ttf');
    expect(fontRes.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    const fontBuffer = await fontRes.arrayBuffer();
    expect(fontBuffer.byteLength).toBeGreaterThan(200_000);
  });
});

describe('Tier-2 edge cache', () => {
  it('stores static SVGs under a normalized key and serves reordered or extra params from the cache', async () => {
    const stub = installEdgeCacheStub();
    const firstRes = await app.request('/stack/c,cpp?variant=1&color=emerald', {}, TEST_ENV);
    const firstSvg = await firstRes.text();
    expect(stub.storedKeys).toEqual(['http://localhost/stack/c,cpp?color=emerald&variant=1']);

    const secondRes = await app.request(
      '/stack/c,cpp?color=emerald&utm_source=readme&variant=1',
      {},
      TEST_ENV
    );
    expect(await secondRes.text()).toBe(firstSvg);
    expect(stub.storedKeys).toHaveLength(1);
    expect(stub.matchedKeys).toEqual([
      'http://localhost/stack/c,cpp?color=emerald&variant=1',
      'http://localhost/stack/c,cpp?color=emerald&variant=1',
    ]);
  });

  it('returns cache hits without rendering', async () => {
    const stub = installEdgeCacheStub();
    stub.store.set('http://localhost/badge/a/b', new Response('cached-svg', { status: 200 }));
    const response = await app.request('/badge/a/b?utm=1', {}, TEST_ENV);
    expect(await response.text()).toBe('cached-svg');
    expect(stub.storedKeys).toEqual([]);
  });

  it('does not store failed service badges and adds Vary to service responses', async () => {
    const stub = installEdgeCacheStub();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('upstream down', { status: 500 }));
    const response = await app.request(
      '/badge/npm/hono/v',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Vary')).toBe('Sec-Fetch-Dest, Accept');
    expect(response.headers.get('Cache-Control')).toBe(buildSvgCacheControl(60));
    for (const storedKey of stub.storedKeys) {
      expect(storedKey.startsWith('http://localhost/')).toBe(false);
    }
  });

  it('redirects service document navigations before the cache lookup with an uncacheable response', async () => {
    const stub = installEdgeCacheStub();
    stub.store.set(
      'http://localhost/badge/npm/hono/v',
      new Response('cached-svg', { status: 200 })
    );
    const response = await app.request(
      '/badge/npm/hono/v',
      { headers: { 'Sec-Fetch-Dest': 'document' } },
      TEST_ENV
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toMatch(/^https:\/\//);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Vary')).toBe('Sec-Fetch-Dest, Accept');
    expect(stub.matchedKeys).toEqual([]);
  });
});

describe('unexpected errors', () => {
  it('answers failing SVG routes with an error badge instead of a bare 500 (regression: no app.onError handler)', async () => {
    const consoleErrorSpy = muteConsoleError();
    const stub = installEdgeCacheStub();
    vi.spyOn(stub.cache, 'match').mockRejectedValue(new Error('cache unavailable'));
    const response = await app.request('/badge/a/b', {}, TEST_ENV);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe(buildSvgCacheControl(60));
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(extractAriaLabel(await response.text())).toBe('error: internal error');
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
  });

  it('answers failing HTML routes with a plain-text 500', async () => {
    muteConsoleError();
    const throwingEnv: Env = {
      get ALLOW_PREVIEW_IN_PROD(): string {
        throw new Error('binding unavailable');
      },
      DEFAULT_GH_OWNER: 'xulbux',
    };
    const response = await app.request('/docs', {}, throwingEnv);
    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('Internal Server Error');
  });
});
