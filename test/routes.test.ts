/**
 * Worker route, readable query DSL, special element parser, and smart redirect tests (`src/index.ts`, `src/services/fetcher.ts`, `src/config/`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCompactNumber } from '@/config/services';
import { resolveColor, THEMES } from '@/config/theme';
import app, {
  isDocumentNavigation,
  isIconHost,
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
  it('formats compact numbers with k and M suffixes', () => {
    expect(formatCompactNumber(42)).toBe('42');
    expect(formatCompactNumber(1000)).toBe('1k');
    expect(formatCompactNumber(4820)).toBe('4.8k');
    expect(formatCompactNumber(2_500_000)).toBe('2.5M');
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
    expect(resolveVariant('b1', '1')).toBe('b1');
    expect(resolveVariant('b2', '1')).toBe('b2');
    expect(resolveVariant('b3', '1')).toBe('b3');
    expect(resolveVariant('invalid', 'b1')).toBe('b1');
  });

  it('resolves canonical animation modes and falls back to auto', () => {
    expect(resolveAnimationMode('sheen')).toBe('sheen');
    expect(resolveAnimationMode('spin')).toBe('spin');
    expect(resolveAnimationMode('shake')).toBe('shake');
    expect(resolveAnimationMode('nudge')).toBe('nudge');
    expect(resolveAnimationMode('pulse')).toBe('pulse');
    expect(resolveAnimationMode('float')).toBe('float');
    expect(resolveAnimationMode('none')).toBe('none');
    expect(resolveAnimationMode('unknown')).toBe('auto');
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
    const imgReq = new Request('https://badge.xul.is/test', {
      headers: { 'Sec-Fetch-Dest': 'image' },
    });
    expect(isDocumentNavigation(imgReq)).toBe(false);

    const docReq = new Request('https://badge.xul.is/test', {
      headers: { 'Sec-Fetch-Dest': 'document' },
    });
    expect(isDocumentNavigation(docReq)).toBe(true);

    const acceptHtmlReq = new Request('https://badge.xul.is/test', {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    expect(isDocumentNavigation(acceptHtmlReq)).toBe(true);
  });

  it('distinguishes icon.xul.is from badge.xul.is', () => {
    expect(isIconHost(new Request('https://icon.xul.is/globe-code'))).toBe(true);
    expect(isIconHost(new Request('https://badge.xul.is/Documentation'))).toBe(false);
    expect(isIconHost(new Request('https://badge.xul.is/license/MIT'))).toBe(false);
  });
});

describe('Hono routes', () => {
  it('redirects root / to https://xul.is', async () => {
    const response = await app.request('/', {}, TEST_ENV);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://xul.is');
  });

  it('renders /preview HTML studio when enabled', async () => {
    const response = await app.request('/preview', {}, TEST_ENV);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('svg-api – SSOT Live Preview');
  });

  it('renders 2-segment static badge with canonical query params and special widgets', async () => {
    const response = await app.request(
      '/coverage/99.4%25?color=emerald&variant=2&icon=shield-check&special=bar:99.4',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    const svg = await response.text();
    expect(svg).toContain('coverage');
    expect(svg).toContain('99.4%');
    expect(svg).toContain('width="32" height="6" rx="3"');
  });

  it('renders 1-segment micro-button defaulting to variant=b1 and redirects on document navigation via ?redirect=', async () => {
    const imgResponse = await app.request(
      '/Documentation?color=indigo&icon=book-open&anim=sheen&redirect=https://docs.xul.is',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(imgResponse.status).toBe(200);
    const svg = await imgResponse.text();
    expect(svg).toContain('height="26"');
    expect(svg).toContain('Documentation');
    expect(svg).toContain('sheen-clip-');

    const docResponse = await app.request(
      '/Documentation?color=indigo&icon=book-open&redirect=https://docs.xul.is',
      { headers: { 'Sec-Fetch-Dest': 'document' } },
      TEST_ENV
    );
    expect(docResponse.status).toBe(302);
    expect(docResponse.headers.get('Location')).toBe('https://docs.xul.is');
  });

  it('renders standalone SVG icons on icon.xul.is and rejects multi-segment badge routes on icon.xul.is', async () => {
    const iconRes = await app.request(
      'https://icon.xul.is/globe-code?color=violet&size=16&stroke=2.5&anim=none',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(iconRes.status).toBe(200);
    expect(iconRes.headers.get('Content-Type')).toContain('image/svg+xml');
    const iconSvg = await iconRes.text();
    expect(iconSvg).toContain('width="16" height="16" viewBox="-3 -3 30 30"');
    expect(iconSvg).toContain(`stroke="${THEMES.violet.iconColor}"`);
    expect(iconSvg).toContain('stroke-width="2.5"');

    const iconRedirectRes = await app.request(
      'https://icon.xul.is/rocket?redirect=https://xul.is',
      { headers: { 'Sec-Fetch-Dest': 'document' } },
      TEST_ENV
    );
    expect(iconRedirectRes.status).toBe(302);
    expect(iconRedirectRes.headers.get('Location')).toBe('https://xul.is');

    // Multi-segment badge paths must return 404 on icon.xul.is.
    const badgeOnIconHostRes = await app.request(
      'https://icon.xul.is/license/MIT',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(badgeOnIconHostRes.status).toBe(404);
  });

  it('renders /status/:state/:text preset with outward radar ripple dot and 10-stage strip', async () => {
    const response = await app.request(
      '/status/online/API+Online?special=strip:99994999',
      {},
      TEST_ENV
    );
    expect(response.status).toBe(200);
    const svg = await response.text();
    expect(svg).toContain('API Online');
    expect(svg).toContain('<animate attributeName="r"');
    expect(svg).toContain('width="2.5" height="10"');
  });

  it('fetches GitHub metric for allowed default owner and blocks unauthorized owners', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({ stargazers_count: 1420 }, { status: 200 })
    );

    const allowedRes = await app.request(
      '/gh/color-tracr/stars',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(allowedRes.status).toBe(200);
    const allowedSvg = await allowedRes.text();
    expect(allowedSvg).toContain('1.4k');

    const restrictedRes = await app.request(
      '/gh/someone-else/some-repo/stars',
      { headers: { 'Sec-Fetch-Dest': 'image' } },
      TEST_ENV
    );
    expect(restrictedRes.status).toBe(200);
    const restrictedSvg = await restrictedRes.text();
    expect(restrictedSvg).toContain('restricted');
  });
});
