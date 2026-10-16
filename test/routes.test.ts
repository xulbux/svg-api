/**
 * Worker route, readable query DSL, special element parser, and smart redirect tests (`src/index.ts`, `src/services/fetcher.ts`, `src/config/`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCompactNumber } from '@/config/services';
import { resolveColor } from '@/config/theme';
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

  it('resolves both compact and readable badge/button variant names', () => {
    expect(resolveVariant('b2', '1')).toBe('b2');
    expect(resolveVariant('3', '1')).toBe('3');
    expect(resolveVariant('primary', '2')).toBe('1');
    expect(resolveVariant('secondary', '1')).toBe('2');
    expect(resolveVariant('tertiary', '1')).toBe('3');
    expect(resolveVariant('button', '1')).toBe('b1');
    expect(resolveVariant('button-secondary', '1')).toBe('b2');
    expect(resolveVariant('button-tertiary', '1')).toBe('b3');
    expect(resolveVariant('invalid', 'b1')).toBe('b1');
  });

  it('resolves animation modes and aliases cleanly', () => {
    expect(resolveAnimationMode('sheen')).toBe('sheen');
    expect(resolveAnimationMode('glint')).toBe('sheen');
    expect(resolveAnimationMode('spin')).toBe('spin');
    expect(resolveAnimationMode('wiggle')).toBe('shake');
    expect(resolveAnimationMode('off')).toBe('none');
    expect(resolveAnimationMode('unknown')).toBe('auto');
  });

  it('parses unified special=<type>:<payload> strings across all 5 widget types', () => {
    expect(parseSpecialParam('bar:94.5%')).toEqual({ type: 'bar', value: 94.5 });
    expect(parseSpecialParam('ring:80')).toEqual({ type: 'ring', value: 80 });
    expect(parseSpecialParam('strip:1120')).toEqual({
      states: ['up', 'up', 'warn', 'down'],
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
    expect(body).toContain('badge.xul.is — SSOT Live Preview');
  });

  it('renders 2-segment static badge with both compact and readable query params and special widgets', async () => {
    const response = await app.request(
      '/coverage/99.4%25?color=emerald&variant=secondary&icon=shield-check&special=bar:99.4',
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

  it('renders 1-segment micro-button defaulting to v=b1 and redirects on document navigation via ?redirect= or ?r=', async () => {
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

  it('renders /status/:state/:text preset with outward radar ripple dot', async () => {
    const response = await app.request(
      '/status/green/API+Online?special=strip:11112111',
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
