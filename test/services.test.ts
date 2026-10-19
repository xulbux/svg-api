/**
 * Service preset tests – Upstream metric transforms for every service, request validation, error handling, request coalescing, and caching (`src/services/`, `src/config/services.ts`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVICES_CONFIG } from '@/config/services';
import { SITE_ORIGIN } from '@/config/site';
import app from '@/index';
import { resolveSvgRoute } from '@/routes/svg';
import {
  resetUpstreamCaches,
  resolveServiceMetric,
  resolveServiceRedirectUrl,
} from '@/services/fetcher';
import {
  formatBytes,
  formatCount,
  formatCurrency,
  formatLicense,
  formatPercent,
  formatSpdxKey,
  formatVersion,
} from '@/services/metrics';
import { resolveIcon } from '@/svg/icons';
import type { Env, ResolvedServiceMetric, ServiceRequest } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Rendered service badge summary. */
interface BadgeSummary {
  /** Badge `aria-label` (`label: value`). */
  ariaLabel: string | undefined;
  /** HTTP status of the badge response. */
  status: number;
  /** Complete SVG markup. */
  svg: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Test Worker environment bindings. */
const TEST_ENV: Env = { ALLOW_PREVIEW_IN_PROD: 'true', DEFAULT_GH_OWNER: 'xulbux' };

/** Request headers of an embedded `<img>` badge request. */
const IMAGE_REQUEST: RequestInit = { headers: { 'Sec-Fetch-Dest': 'image' } };

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches the `aria-label` attribute of a rendered SVG. */
const ARIA_LABEL_RX = /aria-label="(?<label>[^"]*)"/;

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve the URL string of a `fetch` input. */
function resolveFetchUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url;
  }
  return input instanceof URL ? input.href : input;
}

/**
 * Mock `fetch` to answer with JSON payloads keyed by URL fragment (the longest matching fragment wins;
 * Unmatched URLs return `404`).
 * @returns Live list of every requested upstream URL.
 */
function mockUpstream(payloadsByFragment: Record<string, unknown>): string[] {
  const requestedUrls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = resolveFetchUrl(input);
    requestedUrls.push(url);
    let bestFragment: string | undefined = undefined;
    for (const fragment of Object.keys(payloadsByFragment)) {
      if (url.includes(fragment) && fragment.length > (bestFragment?.length ?? 0)) {
        bestFragment = fragment;
      }
    }
    return bestFragment === undefined
      ? new Response('not found', { status: 404 })
      : Response.json(payloadsByFragment[bestFragment]);
  });
  return requestedUrls;
}

/** Request a badge path as an embedded image and summarize the response. */
async function requestBadge(path: string): Promise<BadgeSummary> {
  const response = await app.request(path, IMAGE_REQUEST, TEST_ENV);
  const svg = await response.text();
  return { ariaLabel: ARIA_LABEL_RX.exec(svg)?.groups?.label, status: response.status, svg };
}

/** Request a badge path as an embedded image and return its `aria-label` (`label: value`). */
async function requestAriaLabel(path: string): Promise<string | undefined> {
  const badge = await requestBadge(path);
  return badge.ariaLabel;
}

/** Parse a service badge path into its service request (throws for non-service routes). */
function parseServiceRequest(path: string): ServiceRequest {
  const match = resolveSvgRoute(new URL(path, SITE_ORIGIN));
  if (match?.kind !== 'service') {
    throw new Error(`Not a service route: ${path}`);
  }
  return match.request;
}

/** Resolve a service badge path through the route parser and fetcher (no SVG rendering). */
async function resolvePathMetric(path: string): Promise<ResolvedServiceMetric> {
  return resolveServiceMetric(parseServiceRequest(path), TEST_ENV);
}

/** Resolve a service badge path and summarize it as `label: value`. */
async function describeMetric(path: string): Promise<string> {
  const { result } = await resolvePathMetric(path);
  return `${result.label}: ${result.value ?? ''}`;
}

/** Resolve the browser redirect destination of a service badge path. */
function resolvePathRedirect(path: string): string {
  return resolveServiceRedirectUrl(parseServiceRequest(path), TEST_ENV);
}

// ----------------------------------------- MAIN ----------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  resetUpstreamCaches();
});

describe('service registry integrity', () => {
  it('resolves every metric default icon and every metric alias target', () => {
    for (const [key, service] of Object.entries(SERVICES_CONFIG)) {
      for (const [metricKey, metric] of Object.entries(service.metrics)) {
        expect(resolveIcon(metric.defaultIcon), `${key}/${metricKey} icon`).toBeDefined();
      }
      for (const [alias, target] of Object.entries(service.metricAliases ?? {})) {
        expect(Object.hasOwn(service.metrics, target), `${key} alias ${alias}`).toBe(true);
      }
    }
  });

  it('lists every public service route on /docs/services', async () => {
    const response = await app.request('/docs/services', {}, TEST_ENV);
    const body = await response.text();
    for (const [key, service] of Object.entries(SERVICES_CONFIG)) {
      expect(body.includes(`/badge/${key}/`)).toBe(!service.allowedOwners);
    }
  });
});

describe('existing service presets', () => {
  it('resolves GitHub repository metrics from one shared, cached upstream payload', async () => {
    const requestedUrls = mockUpstream({
      '/repos/xulbux/color-tracr': {
        forks_count: 12,
        license: { spdx_id: 'MIT' },
        pushed_at: new Date().toISOString(),
        stargazers_count: 1420,
      },
      '/repos/xulbux/color-tracr/releases/latest': { tag_name: 'v2.1.0' },
    });

    expect(await requestAriaLabel('/badge/gh/color-tracr/stars')).toBe('stars: 1.4k');
    expect(await requestAriaLabel('/badge/gh/color-tracr/commit')).toBe('last commit: today');
    expect(await requestAriaLabel('/badge/gh/xulbux/color-tracr/last-commit')).toBe(
      'last commit: today'
    );
    expect(await requestAriaLabel('/badge/gh/color-tracr/license')).toBe('license: MIT');
    expect(await requestAriaLabel('/badge/gh/color-tracr/release')).toBe('release: v2.1.0');
    expect(requestedUrls).toHaveLength(2);
  });

  it('shows "computing" while GitHub statistics are still being generated (HTTP 202)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}, { status: 202 }));
    const badge = await requestBadge('/badge/gh/color-tracr/activity');
    expect(badge.ariaLabel).toBe('commits: computing');
  });

  it('resolves PyPI metrics and queries ClickPy with the PEP 503 normalized name', async () => {
    const requestedUrls = mockUpstream({
      'pypi.org/pypi/xulbux/json': { info: { license_expression: 'MIT', version: '1.4.0' } },
      'sql-clickhouse': { row_1: { last_month: '3333', total: '86808' } },
    });

    expect(await requestAriaLabel('/badge/pypi/xulbux/v')).toBe('pypi: v1.4.0');
    expect(await requestAriaLabel('/badge/pypi/xulbux/py')).toBe('python: any');
    expect(await requestAriaLabel('/badge/pypi/xulbux/l')).toBe('license: MIT');
    expect(await requestAriaLabel('/badge/pypi/xulbux/dt?label=total+downloads')).toBe(
      'total downloads: 86.8k'
    );

    await requestBadge('/badge/pypi/Typing_Extensions/dl');
    const clickPyUrl = decodeURIComponent(requestedUrls.at(-1) ?? '');
    expect(clickPyUrl).toContain("project = 'typing-extensions'");
  });

  it('resolves unscoped and scoped npm metrics', async () => {
    const requestedUrls = mockUpstream({
      'downloads/point/last-year/@hono/node-server': { downloads: 12_400_000 },
      'registry.npmjs.org/hono/latest': {
        license: 'MIT',
        types: './dist/index.d.ts',
        version: '4.13.13',
      },
    });
    expect(await requestAriaLabel('/badge/npm/hono/v')).toBe('npm: v4.13.13');
    expect(await requestAriaLabel('/badge/npm/hono/types')).toBe('types: included');
    expect(await requestAriaLabel('/badge/npm/@hono/node-server/dt')).toBe('downloads: 12.4M/yr');
    expect(requestedUrls).toHaveLength(2);
  });

  it('resolves Open VSX, crates.io, and Docker Hub metrics (including default owners and aliases)', async () => {
    const requestedUrls = mockUpstream({
      'crates.io/api/v1/crates/serde': { crate: { max_stable_version: '1.0.215' } },
      'hub.docker.com/v2/repositories/library/nginx/': { pull_count: 1_200_000_000 },
      'open-vsx.org/api/xulbux/color-tracr': { downloadCount: 2486, version: '1.2.3' },
    });
    expect(await requestAriaLabel('/badge/ovsx/color-tracr/v')).toBe('open vsx: v1.2.3');
    expect(await requestAriaLabel('/badge/ovsx/color-tracr/rating')).toBe('rating: unrated');
    expect(await requestAriaLabel('/badge/crates/serde/v')).toBe('crates.io: v1.0.215');
    expect(await requestAriaLabel('/badge/docker/nginx/dl')).toBe('docker pulls: 1.2B');
    expect(requestedUrls).toHaveLength(3);
  });
});

describe('new service presets', () => {
  it('resolves AUR package metrics, flags out-of-date packages, and reports missing packages', async () => {
    mockUpstream({
      'arg[]=missing': { resultcount: 0, results: [] },
      'arg[]=stale': { results: [{ OutOfDate: 1_781_905_288, Version: '1.0-1' }] },
      'arg[]=yay': {
        results: [
          {
            License: ['GPL-3.0-or-later'],
            NumVotes: 2650,
            Popularity: 18.663753,
            Version: '13.0.1-1',
          },
        ],
      },
    });
    expect(await requestAriaLabel('/badge/aur/yay/v')).toBe('aur: v13.0.1-1');
    expect(await requestAriaLabel('/badge/aur/yay/votes')).toBe('votes: 2.6k');
    expect(await requestAriaLabel('/badge/aur/yay/popularity')).toBe('popularity: 18.66');
    expect(await requestAriaLabel('/badge/aur/yay/license')).toBe('license: GPL-3.0-or-later');
    expect(await requestAriaLabel('/badge/aur/stale/v')).toBe('aur: v1.0-1 (outdated)');
    expect(await requestAriaLabel('/badge/aur/missing/v')).toBe('aur: not found');
  });

  it('resolves Codeberg and GitLab repository metrics for any owner', async () => {
    const requestedUrls = mockUpstream({
      'codeberg.org/api/v1/repos/forgejo/forgejo': {
        open_issues_count: 1567,
        stars_count: 5671,
        updated_at: new Date().toISOString(),
      },
      'gitlab.com/api/v4/projects/gitlab-org%2Fgitlab-runner/releases': { tag_name: 'v19.5.0' },
      'gitlab.com/api/v4/projects/gitlab-org%2Fgitlab-runner?': {
        license: { key: 'apache-2.0' },
        star_count: 2579,
      },
    });
    expect(await requestAriaLabel('/badge/codeberg/forgejo/forgejo/stars')).toBe('stars: 5.7k');
    expect(await requestAriaLabel('/badge/codeberg/forgejo/forgejo/issues')).toBe('issues: 1.6k');
    expect(await requestAriaLabel('/badge/codeberg/forgejo/forgejo/commit')).toBe(
      'last activity: today'
    );
    expect(await requestAriaLabel('/badge/gitlab/gitlab-org/gitlab-runner/stars')).toBe(
      'stars: 2.6k'
    );
    expect(await requestAriaLabel('/badge/gitlab/gitlab-org/gitlab-runner/license')).toBe(
      'license: Apache-2.0'
    );
    expect(await requestAriaLabel('/badge/gitlab/gitlab-org/gitlab-runner/release')).toBe(
      'release: v19.5.0'
    );
    expect(requestedUrls).toHaveLength(3);
    expect(await requestAriaLabel('/badge/codeberg/forgejo/stars')).toBe('codeberg: missing owner');
  });

  it('resolves Hex.pm, pub.dev, RubyGems, NuGet, and Packagist package metrics', async () => {
    mockUpstream({
      'azuresearch-usnc.nuget.org/query?q=packageid:Missing': { data: [] },
      'azuresearch-usnc.nuget.org/query?q=packageid:Newtonsoft.Json': {
        data: [{ totalDownloads: 9_325_394_018, version: '13.0.4' }],
      },
      'hex.pm/api/packages/phoenix': {
        downloads: { all: 157_768_246, recent: 5_566_399, week: 595_975 },
        latest_stable_version: '1.8.15',
        meta: { licenses: ['MIT'] },
      },
      'packagist.org/packages/laravel/framework/stats.json': {
        downloads: { daily: 432_874, monthly: 18_242_879, total: 598_558_554 },
        versions: ['13.x-dev', 'dev-master', 'v13.30.0-RC1', 'v13.29.1', 'v13.29.0'],
      },
      'pub.dev/api/packages/http': { latest: { version: '1.6.0' } },
      'pub.dev/api/packages/http/score': { grantedPoints: 150, likeCount: 8479, maxPoints: 160 },
      'rubygems.org/api/v1/gems/rails.json': {
        downloads: 802_607_897,
        licenses: ['MIT'],
        version: '8.1.4',
      },
    });
    expect(await requestAriaLabel('/badge/hex/phoenix/v')).toBe('hex: v1.8.15');
    expect(await requestAriaLabel('/badge/hex/phoenix/dl')).toBe('downloads: 5.6M/90d');
    expect(await requestAriaLabel('/badge/pub/http/v')).toBe('pub: v1.6.0');
    expect(await requestAriaLabel('/badge/pub/http/likes')).toBe('likes: 8.5k');
    const pointsBadge = await requestBadge('/badge/pub/http/points');
    expect(pointsBadge.ariaLabel).toBe('pub points: 150/160');
    expect(pointsBadge.svg).toContain('stroke-dasharray="26.57 28.27"');
    expect(await requestAriaLabel('/badge/gem/rails/v')).toBe('gem: v8.1.4');
    expect(await requestAriaLabel('/badge/gem/rails/dt')).toBe('downloads: 802.6M');
    expect(await requestAriaLabel('/badge/nuget/Newtonsoft.Json/v')).toBe('nuget: v13.0.4');
    expect(await requestAriaLabel('/badge/nuget/Newtonsoft.Json/dt')).toBe('downloads: 9.3B');
    expect(await requestAriaLabel('/badge/nuget/Missing/v')).toBe('nuget: not found');
    expect(await requestAriaLabel('/badge/packagist/laravel/framework/v')).toBe(
      'packagist: v13.29.1'
    );
    expect(await requestAriaLabel('/badge/packagist/laravel/framework/dd')).toBe(
      'downloads: 432.9k/day'
    );
  });

  it('resolves JSR and jsDelivr metrics (with optional @ scopes)', async () => {
    const requestedUrls = mockUpstream({
      'api.jsr.io/scopes/std/packages/path': { latestVersion: '1.1.6', score: 94 },
      'data.jsdelivr.com/v1/stats/packages/npm/jquery?period=month': {
        hits: { total: 1_585_106_437 },
      },
    });
    expect(await requestAriaLabel('/badge/jsr/@std/path/v')).toBe('jsr: v1.1.6');
    const scoreBadge = await requestBadge('/badge/jsr/std/path/score');
    expect(scoreBadge.ariaLabel).toBe('jsr score: 94%');
    expect(scoreBadge.svg).toContain('stroke-dasharray="26.57 28.27"');
    expect(await requestAriaLabel('/badge/jsdelivr/jquery/hits')).toBe('jsdelivr: 1.6B/mo');
    expect(requestedUrls).toHaveLength(2);
  });
});

describe('service request validation', () => {
  it('rejects path traversal segments without calling upstream (regression: ..%2F bypassed the GitHub owner allowlist)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const badges = await Promise.all(
      [
        '/badge/gh/xulbux/..%2F..%2Fusers%2Fevil/stars',
        '/badge/gh/..%2Fevil/stars',
        '/badge/npm/%2E%2E%2Fsecret/v',
        '/badge/pypi/a%2Fb/v',
      ].map(requestBadge)
    );
    for (const badge of badges) {
      expect(badge.status).toBe(200);
      expect(badge.ariaLabel).toMatch(/: invalid name$/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('enforces owner allowlists, owner modes, and known metrics without calling upstream', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await requestAriaLabel('/badge/gh/someone-else/repo/stars')).toBe(
      'svg.xul.is: restricted'
    );
    expect(await requestAriaLabel('/badge/pypi/owner/pkg/v')).toBe('pypi: invalid route');
    expect(await requestAriaLabel('/badge/npm/hono/nope')).toBe('npm: invalid metric');
    expect(await requestAriaLabel('/badge/npm/hono/constructor')).toBe('npm: invalid metric');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('upstream error handling', () => {
  it('renders error badges with a short TTL instead of HTTP 500 (regression: invalid JSON and network errors crashed)', async () => {
    const timeoutError = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = resolveFetchUrl(input);
      if (url.includes('/invalid-json/')) {
        return Promise.resolve(new Response('not json'));
      }
      if (url.includes('/network-error/')) {
        return Promise.reject(new TypeError('network'));
      }
      if (url.includes('/slow/')) {
        return Promise.reject(timeoutError);
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });
    const cases: [path: string, expected: string][] = [
      ['/badge/npm/invalid-json/v', 'npm: api error'],
      ['/badge/npm/network-error/v', 'npm: api error'],
      ['/badge/npm/slow/v', 'npm: timeout'],
      ['/badge/npm/missing/v', 'npm: not found'],
    ];
    const responses = await Promise.all(
      cases.map(([path]) => app.request(path, IMAGE_REQUEST, TEST_ENV))
    );
    const bodies = await Promise.all(responses.map((response) => response.text()));
    for (let i = 0; i < cases.length; i += 1) {
      expect(responses[i].status).toBe(200);
      expect(responses[i].headers.get('Cache-Control')).toContain('s-maxage=60');
      expect(ARIA_LABEL_RX.exec(bodies[i])?.groups?.label).toBe(cases[i][1]);
    }
  });

  it('reports exhausted rate limits as "rate limited" (regression: GitHub 403 and 429 showed "api error")', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = resolveFetchUrl(input);
      if (url.includes('/throttled/')) {
        return Promise.resolve(new Response('', { status: 429 }));
      }
      if (url.includes('api.github.com')) {
        return Promise.resolve(
          new Response('', { headers: { 'x-ratelimit-remaining': '0' }, status: 403 })
        );
      }
      return Promise.resolve(new Response('', { status: 403 }));
    });
    expect(await requestAriaLabel('/badge/npm/throttled/v')).toBe('npm: rate limited');
    expect(await requestAriaLabel('/badge/gh/color-tracr/stars')).toBe('stars: rate limited');
    expect(await requestAriaLabel('/badge/npm/forbidden/v')).toBe('npm: api error');
  });
});

describe('upstream memory cache budget', () => {
  it('keeps small payloads in memory but never holds oversized payloads (regression: unbounded isolate memory)', async () => {
    const hugePadding = 'x'.repeat(4_100_000);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        const isHuge = resolveFetchUrl(input).includes('/huge/');
        return Promise.resolve(
          Response.json({ padding: isHuge ? hugePadding : '', version: '1.0.0' })
        );
      });
    await requestBadge('/badge/npm/small/v');
    await requestBadge('/badge/npm/small/license');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await requestBadge('/badge/npm/huge/v');
    expect(await requestAriaLabel('/badge/npm/huge/license')).toBe('license: unknown');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

describe('upstream caching & redirects', () => {
  it('coalesces concurrent requests for the same upstream URL into one fetch', async () => {
    const upstream: { resolve?: (response: Response) => void } = {};
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          upstream.resolve = resolve;
        })
    );
    const pendingBadges = [
      requestBadge('/badge/crates/serde/v'),
      requestBadge('/badge/crates/serde/dt'),
      requestBadge('/badge/crates/serde/license'),
    ];
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    upstream.resolve?.(
      Response.json({
        crate: { downloads: 490_000_000, max_stable_version: '1.0.219' },
        versions: [{ license: 'MIT OR Apache-2.0' }],
      })
    );
    const [versionBadge, downloadsBadge, licenseBadge] = await Promise.all(pendingBadges);
    expect(versionBadge.ariaLabel).toBe('crates.io: v1.0.219');
    expect(downloadsBadge.ariaLabel).toBe('downloads: 490M');
    expect(licenseBadge.ariaLabel).toBe('license: MIT OR Apache-2.0');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('redirects document navigations to the upstream page without fetching metrics', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const documentRequest: RequestInit = { headers: { 'Sec-Fetch-Dest': 'document' } };

    const pypiRes = await app.request('/badge/pypi/xulbux/dt', documentRequest, TEST_ENV);
    expect(pypiRes.status).toBe(302);
    expect(pypiRes.headers.get('Location')).toBe('https://clickpy.clickhouse.com/dashboard/xulbux');

    const aurRes = await app.request('/badge/aur/yay/v', documentRequest, TEST_ENV);
    expect(aurRes.headers.get('Location')).toBe('https://aur.archlinux.org/packages/yay');

    const restrictedRes = await app.request('/badge/gh/evil/repo/stars', documentRequest, TEST_ENV);
    expect(restrictedRes.headers.get('Location')).toBe('https://xul.is');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('metric formatting helpers', () => {
  it('prefixes numeric versions with v exactly once and reports missing values', () => {
    expect(formatVersion('1.2.3')).toBe('v1.2.3');
    expect(formatVersion('v2.0.0')).toBe('v2.0.0');
    expect(formatVersion('nightly')).toBe('nightly');
    expect(formatVersion(undefined)).toBe('n/a');
  });

  it('restores canonical SPDX casing from lowercase license keys', () => {
    expect(formatSpdxKey('mit')).toBe('MIT');
    expect(formatSpdxKey('apache-2.0')).toBe('Apache-2.0');
    expect(formatSpdxKey('bsd-3-clause')).toBe('BSD-3-Clause');
    expect(formatSpdxKey('gpl-3.0')).toBe('GPL-3.0');
    expect(formatSpdxKey(undefined)).toBeUndefined();
  });

  it('keeps SPDX operators lowercase and special-cases Zlib/WTFPL (regression: gpl-3.0-or-later became GPL-3.0-OR-Later)', () => {
    expect(formatSpdxKey('gpl-3.0-or-later')).toBe('GPL-3.0-or-later');
    expect(formatSpdxKey('lgpl-2.1-only')).toBe('LGPL-2.1-only');
    expect(formatSpdxKey('agpl-3.0-only')).toBe('AGPL-3.0-only');
    expect(formatSpdxKey('zlib')).toBe('Zlib');
    expect(formatSpdxKey('wtfpl')).toBe('WTFPL');
    expect(formatSpdxKey('postgresql')).toBe('PostgreSQL');
    expect(formatSpdxKey('unlicense')).toBe('Unlicense');
  });

  it('formats counts, byte sizes, percentages, and custom license refs', () => {
    expect(formatCount(4_200_000, '/mo')).toBe('4.2M/mo');
    expect(formatCount('3333')).toBe('3.3k');
    expect(formatCount(undefined, '/mo')).toBe('n/a');
    expect(formatBytes(812)).toBe('812 B');
    expect(formatBytes(7994)).toBe('7.8 kB');
    expect(formatBytes(3053)).toBe('3 kB');
    expect(formatBytes(1_258_291)).toBe('1.2 MB');
    expect(formatBytes(undefined)).toBe('n/a');
    expect(formatPercent(96.43)).toBe('96.4%');
    expect(formatPercent(90)).toBe('90%');
    expect(formatLicense('LicenseRef-Polyform-Shield-1.0.0')).toBe('Polyform-Shield-..');
    expect(formatLicense('LicenseRef-proprietary')).toBe('proprietary');
  });
});

describe('shared service refactors', () => {
  it('resolves the Codeberg prs metric from open_pr_counter and accepts the pulls alias', async () => {
    mockUpstream({
      'codeberg.org/api/v1/repos/forgejo/forgejo': { open_pr_counter: 312, stars_count: 5671 },
    });
    expect(await describeMetric('/badge/codeberg/forgejo/forgejo/prs')).toBe('pull requests: 312');
    expect(await describeMetric('/badge/codeberg/forgejo/forgejo/pulls')).toBe(
      'pull requests: 312'
    );
    expect(resolvePathRedirect('/badge/codeberg/forgejo/forgejo/prs')).toBe(
      'https://codeberg.org/forgejo/forgejo/pulls'
    );
  });

  it('accepts consistent license, last-commit, and download aliases across services', async () => {
    mockUpstream({
      '/repos/xulbux/color-tracr': { license: { spdx_id: 'MIT' } },
      'pypi.org/pypi/xulbux/json': { info: { license_expression: 'MIT' } },
      'sql-clickhouse': { row_1: { last_month: '3333' } },
    });
    expect(await describeMetric('/badge/gh/color-tracr/l')).toBe('license: MIT');
    expect(await describeMetric('/badge/pypi/xulbux/dm')).toBe('downloads: 3.3k/mo');
    for (const [key, service] of Object.entries(SERVICES_CONFIG)) {
      const aliases = service.metricAliases ?? {};
      if (Object.hasOwn(service.metrics, 'license')) {
        expect(aliases.l, `${key} l alias`).toBe('license');
      }
      for (const [metricKey, metric] of Object.entries(service.metrics)) {
        if (metric.defaultIcon === 'git-commit-horizontal') {
          expect(aliases.commit ?? 'commit', `${key} commit alias`).toBe(metricKey);
          expect(aliases['last-commit'], `${key} last-commit alias`).toBe(metricKey);
        }
      }
      const hasDownloads = Object.values(service.metrics).some(
        (metric) => metric.defaultIcon === 'download'
      );
      if (hasDownloads) {
        expect(
          Object.hasOwn(service.metrics, 'dl') || Object.hasOwn(aliases, 'dl'),
          `${key} dl`
        ).toBe(true);
      }
    }
  });

  it('builds forge endpoints from the shared factory (GitHub, GitLab, Codeberg)', () => {
    expect(resolvePathRedirect('/badge/gh/color-tracr/stars')).toBe(
      'https://github.com/xulbux/color-tracr/stargazers'
    );
    expect(resolvePathRedirect('/badge/gitlab/gitlab-org/gitlab-runner/release')).toBe(
      'https://gitlab.com/gitlab-org/gitlab-runner/-/releases'
    );
    expect(SERVICES_CONFIG.gitlab.metrics.stars.buildApiUrl('gitlab-org', 'gitlab-runner')).toBe(
      'https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab-runner?license=true'
    );
  });
});

describe('segment validation & query encoding', () => {
  it('allows @ and + in segments (Homebrew python@3.12, gtk+3) and URL-encodes them upstream', async () => {
    const requestedUrls = mockUpstream({
      'formulae.brew.sh/api/formula/': { versions: { stable: '3.12.12' } },
    });
    expect(await describeMetric('/badge/brew/python@3.12/v')).toBe('homebrew: v3.12.12');
    expect(await describeMetric('/badge/brew/gtk%2B3/v')).toBe('homebrew: v3.12.12');
    expect(requestedUrls).toEqual([
      'https://formulae.brew.sh/api/formula/python%403.12.json',
      'https://formulae.brew.sh/api/formula/gtk%2B3.json',
    ]);
  });

  it('URL-encodes targets embedded in query strings (AUR, NuGet, Bundlephobia, WordPress)', () => {
    expect(SERVICES_CONFIG.aur.metrics.v.buildApiUrl('', 'gtk+3')).toBe(
      'https://aur.archlinux.org/rpc/v5/info?arg[]=gtk%2B3'
    );
    expect(SERVICES_CONFIG.nuget.metrics.v.buildApiUrl('', 'A+B')).toContain('packageid:A%2BB&');
    expect(SERVICES_CONFIG.bundlephobia.metrics.gzip.buildApiUrl('@hono', 'node-server')).toBe(
      'https://bundlephobia.com/api/size?package=%40hono%2Fnode-server'
    );
    expect(SERVICES_CONFIG.wp.metrics.v.buildApiUrl('', 'a+b')).toContain(
      'request%5Bslug%5D=a%2Bb&'
    );
  });

  it('still blocks dot-only segments and over-long multi-segment targets without calling upstream', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const paths = [
      '/badge/brew/..%2F..%2Fcask%2Ffirefox/v',
      '/badge/go/github.com/..%2Fevil/v',
      '/badge/go/github.com//cobra/v',
      '/badge/go/a/b/c/d/e/f/g/h/i/v',
      '/badge/npm/a%2Fb/v',
    ];
    const resolved = await Promise.all(paths.map(resolvePathMetric));
    for (let i = 0; i < paths.length; i += 1) {
      expect(resolved[i].status, paths[i]).toBe(400);
      expect(resolved[i].result.value, paths[i]).toBe('invalid name');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('added service presets', () => {
  it('resolves Homebrew formula and cask metrics, summing option variants', async () => {
    mockUpstream({
      'formulae.brew.sh/api/cask/firefox.json': {
        analytics: { install: { '30d': { firefox: 12_215 }, '365d': { firefox: 184_825 } } },
        token: 'firefox',
        version: '158.0',
      },
      'formulae.brew.sh/api/formula/wget.json': {
        analytics: {
          install: {
            '30d': { wget: 57_314, 'wget --HEAD': 121 },
            '365d': { wget: 323_141 },
            '90d': { wget: 83_475 },
          },
        },
        license: 'GPL-3.0-or-later',
        name: 'wget',
        versions: { stable: '1.25.0' },
      },
    });
    expect(await describeMetric('/badge/brew/wget/v')).toBe('homebrew: v1.25.0');
    expect(await describeMetric('/badge/brew/wget/l')).toBe('license: GPL-3.0-or-later');
    expect(await describeMetric('/badge/brew/wget/dl')).toBe('installs: 57.4k/mo');
    expect(await describeMetric('/badge/brew/wget/dq')).toBe('installs: 83.5k/90d');
    expect(await describeMetric('/badge/brew/wget/dy')).toBe('installs: 323.1k/yr');
    expect(await describeMetric('/badge/cask/firefox/v')).toBe('homebrew cask: v158.0');
    expect(await describeMetric('/badge/cask/firefox/dt')).toBe('installs: 184.8k/yr');
    expect(resolvePathRedirect('/badge/cask/firefox/v')).toBe(
      'https://formulae.brew.sh/cask/firefox'
    );
  });

  it('resolves Hugging Face model and dataset metrics from the compact expand query', async () => {
    const requestedUrls = mockUpstream({
      'huggingface.co/api/datasets/HuggingFaceFW/fineweb': {
        downloads: 328_660,
        downloadsAllTime: 10_339_641,
        likes: 3677,
      },
      'huggingface.co/api/models/openai-community/gpt2': {
        downloads: 16_816_065,
        downloadsAllTime: 942_548_716,
        id: 'openai-community/gpt2',
        likes: 4260,
      },
    });
    expect(await describeMetric('/badge/hf/openai-community/gpt2/dl')).toBe('downloads: 16.8M/mo');
    expect(await describeMetric('/badge/hf/openai-community/gpt2/dt')).toBe('downloads: 942.5M');
    expect(await describeMetric('/badge/hf/openai-community/gpt2/likes')).toBe('likes: 4.3k');
    expect(await describeMetric('/badge/hf-dataset/HuggingFaceFW/fineweb/dl')).toBe(
      'downloads: 328.7k/mo'
    );
    expect(requestedUrls[0]).toBe(
      'https://huggingface.co/api/models/openai-community/gpt2?expand%5B%5D=downloads&expand%5B%5D=likes&expand%5B%5D=downloadsAllTime'
    );
    expect(requestedUrls).toHaveLength(2);
    expect(resolvePathRedirect('/badge/hf-dataset/HuggingFaceFW/fineweb/likes')).toBe(
      'https://huggingface.co/datasets/HuggingFaceFW/fineweb'
    );
  });

  it('resolves Modrinth metrics and picks the newest stable game release', async () => {
    mockUpstream({
      'api.modrinth.com/v2/project/sodium': {
        downloads: 249_055_901,
        followers: 41_921,
        game_versions: ['26.2', '26.3-rc-1', '26.3', '26w14a'],
        license: { id: 'LicenseRef-Polyform-Shield-1.0.0' },
        project_type: 'mod',
        slug: 'sodium',
      },
    });
    expect(await describeMetric('/badge/modrinth/sodium/dl')).toBe('downloads: 249.1M');
    expect(await describeMetric('/badge/modrinth/sodium/followers')).toBe('followers: 41.9k');
    expect(await describeMetric('/badge/modrinth/sodium/mc')).toBe('minecraft: 26.3');
    expect(await describeMetric('/badge/modrinth/sodium/l')).toBe('license: Polyform-Shield-..');
  });

  it('resolves Firefox Add-ons (AMO) metrics', async () => {
    mockUpstream({
      'addons.mozilla.org/api/v5/addons/addon/ublock-origin/?lang=en-US': {
        average_daily_users: 11_431_967,
        current_version: { license: { slug: 'GPL-3.0-only' }, version: '1.75.0' },
        ratings: { average: 4.8019, count: 22_219 },
        slug: 'ublock-origin',
        weekly_downloads: 240_419,
      },
    });
    expect(await describeMetric('/badge/amo/ublock-origin/v')).toBe('firefox: v1.75.0');
    expect(await describeMetric('/badge/amo/ublock-origin/users')).toBe('users: 11.4M');
    expect(await describeMetric('/badge/amo/ublock-origin/dl')).toBe('downloads: 240.4k/wk');
    expect(await describeMetric('/badge/amo/ublock-origin/rating')).toBe('rating: 4.8/5');
    expect(await describeMetric('/badge/amo/ublock-origin/license')).toBe('license: GPL-3.0-only');
  });

  it('resolves Flathub AppStream and install statistics', async () => {
    mockUpstream({
      'flathub.org/api/v2/appstream/org.mozilla.firefox': {
        name: 'Firefox',
        project_license: 'MPL-2.0',
        releases: [{ type: 'stable', version: '158.0' }],
      },
      'flathub.org/api/v2/stats/org.mozilla.firefox': {
        installs_last_7_days: 41_059,
        installs_last_month: 200_251,
        installs_total: 12_413_951,
      },
    });
    expect(await describeMetric('/badge/flathub/org.mozilla.firefox/v')).toBe('flathub: v158.0');
    expect(await describeMetric('/badge/flathub/org.mozilla.firefox/l')).toBe('license: MPL-2.0');
    expect(await describeMetric('/badge/flathub/org.mozilla.firefox/dt')).toBe('installs: 12.4M');
    expect(await describeMetric('/badge/flathub/org.mozilla.firefox/dl')).toBe(
      'installs: 200.3k/mo'
    );
    expect(await describeMetric('/badge/flathub/org.mozilla.firefox/dw')).toBe(
      'installs: 41.1k/wk'
    );
  });

  it('resolves CRAN crandb and cranlogs metrics (array payloads)', async () => {
    mockUpstream({
      'crandb.r-pkg.org/ggplot2': {
        License: 'MIT + file LICENSE',
        Package: 'ggplot2',
        Version: '4.0.3',
      },
      'cranlogs.r-pkg.org/downloads/total/last-month/ggplot2': [
        { downloads: 2_099_543, package: 'ggplot2' },
      ],
      'cranlogs.r-pkg.org/downloads/total/last-week/empty': [],
    });
    expect(await describeMetric('/badge/cran/ggplot2/v')).toBe('cran: v4.0.3');
    expect(await describeMetric('/badge/cran/ggplot2/license')).toBe('license: MIT');
    expect(await describeMetric('/badge/cran/ggplot2/dm')).toBe('downloads: 2.1M/mo');
    expect(await describeMetric('/badge/cran/empty/dw')).toBe('downloads: not found');
  });

  it('colors OpenSSF Scorecard, Codecov, and Coveralls scores by threshold with a ring gauge', async () => {
    mockUpstream({
      'api.codecov.io/api/v2/github/codecov/repos/codecov-api/': {
        name: 'codecov-api',
        totals: { coverage: 96.43, files: 488, lines: 16_977 },
      },
      // oxlint-disable-next-line unicorn/no-null -- Codecov reports `null` coverage before the first upload.
      'api.codecov.io/api/v2/github/vuejs/repos/core/': { totals: { coverage: null } },
      'api.securityscorecards.dev/projects/github.com/ossf/scorecard': {
        repo: { name: 'github.com/ossf/scorecard' },
        score: 8.3,
      },
      'api.securityscorecards.dev/projects/github.com/weak/repo': { score: 3.9 },
      'coveralls.io/github/lemurheavy/coveralls-ruby.json': {
        covered_percent: 65.88,
        repo_name: 'lemurheavy/coveralls-ruby',
      },
    });
    const scorecard = await resolvePathMetric('/badge/scorecard/ossf/scorecard/score');
    expect(scorecard.result.value).toBe('8.3/10');
    expect(scorecard.result.color).toBe('emerald');
    expect(scorecard.result.special).toEqual({ type: 'ring', value: 83 });
    const weakScorecard = await resolvePathMetric('/badge/scorecard/weak/repo/score');
    expect(weakScorecard.result.color).toBe('rose');

    const codecov = await resolvePathMetric('/badge/codecov/codecov/codecov-api/coverage');
    expect(`${codecov.result.label}: ${codecov.result.value ?? ''}`).toBe('coverage: 96.4%');
    expect(codecov.result.color).toBe('emerald');
    expect(codecov.result.icon).toBe('codecov');
    expect(await describeMetric('/badge/codecov/vuejs/core/cov')).toBe('coverage: n/a');

    const coveralls = await resolvePathMetric(
      '/badge/coveralls/lemurheavy/coveralls-ruby/coverage'
    );
    expect(coveralls.result.value).toBe('65.9%');
    expect(coveralls.result.color).toBe('amber');
    expect(resolvePathRedirect('/badge/codecov/codecov/codecov-api/coverage')).toBe(
      'https://app.codecov.io/gh/codecov/codecov-api'
    );
  });

  it('resolves Discord online and member counts with a longer cache TTL', async () => {
    mockUpstream({
      'discord.com/api/v10/invites/discord-developers?with_counts=true': {
        approximate_member_count: 308_557,
        approximate_presence_count: 71_399,
        code: 'discord-developers',
      },
    });
    expect(await describeMetric('/badge/discord/discord-developers/online')).toBe(
      'discord: 71.4k online'
    );
    expect(await describeMetric('/badge/discord/discord-developers/members')).toBe(
      'discord: 308.6k members'
    );
    expect(SERVICES_CONFIG.discord.metrics.online.cacheTtlSeconds).toBeGreaterThan(600);
    expect(resolvePathRedirect('/badge/discord/discord-developers/online')).toBe(
      'https://discord.gg/discord-developers'
    );
  });

  it('resolves Bundlephobia sizes for unscoped and scoped packages', async () => {
    mockUpstream({
      'package=%40hono%2Fnode-server': { gzip: 8185, size: 22_283 },
      'package=react': { gzip: 3053, name: 'react', size: 7994, version: '19.3.1' },
    });
    expect(await describeMetric('/badge/bundlephobia/react/min')).toBe('minified: 7.8 kB');
    expect(await describeMetric('/badge/bundlephobia/react/gzip')).toBe('minzipped: 3 kB');
    expect(await describeMetric('/badge/bundlephobia/@hono/node-server/minzip')).toBe(
      'minzipped: 8 kB'
    );
    expect(resolvePathRedirect('/badge/bundlephobia/@hono/node-server/min')).toBe(
      'https://bundlephobia.com/package/@hono/node-server'
    );
  });

  it('routes multi-segment Go module paths and case-encodes them for the module proxy', async () => {
    const requestedUrls = mockUpstream({
      'proxy.golang.org/github.com/!burnt!sushi/toml/@latest': { Version: 'v1.5.0' },
      'proxy.golang.org/github.com/spf13/cobra/@latest': {
        Origin: { URL: 'https://github.com/spf13/cobra' },
        Version: 'v1.10.2',
      },
    });
    expect(parseServiceRequest('/badge/go/github.com/spf13/cobra/v')).toEqual({
      metric: 'v',
      service: 'go',
      target: 'github.com/spf13/cobra',
    });
    expect(await describeMetric('/badge/go/github.com/spf13/cobra/v')).toBe('go: v1.10.2');
    expect(await describeMetric('/badge/go/github.com/BurntSushi/toml/v')).toBe('go: v1.5.0');
    expect(requestedUrls.at(-1)).toBe(
      'https://proxy.golang.org/github.com/!burnt!sushi/toml/@latest'
    );
    expect(resolvePathRedirect('/badge/go/github.com/BurntSushi/toml/v')).toBe(
      'https://pkg.go.dev/github.com/BurntSushi/toml'
    );
  });

  it('resolves WordPress plugin and theme metrics from the trimmed info API', async () => {
    const requestedUrls = mockUpstream({
      'plugins/info/1.2/?action=plugin_information&request%5Bslug%5D=akismet': {
        active_installs: 5_000_000,
        downloaded: 407_684_612,
        rating: 94,
        version: '5.7.2',
      },
      'themes/info/1.2/?action=theme_information&request%5Bslug%5D=astra': {
        active_installs: 1_000_000,
        downloaded: 27_051_895,
        rating: 98,
        version: '4.14.1',
      },
    });
    expect(await describeMetric('/badge/wp/akismet/v')).toBe('wordpress: v5.7.2');
    expect(await describeMetric('/badge/wp/akismet/installs')).toBe('active installs: 5M+');
    expect(await describeMetric('/badge/wp/akismet/rating')).toBe('rating: 4.7/5');
    expect(await describeMetric('/badge/wp/akismet/dl')).toBe('downloads: 407.7M');
    expect(await describeMetric('/badge/wp-theme/astra/v')).toBe('wordpress theme: v4.14.1');
    expect(await describeMetric('/badge/wp-theme/astra/rating')).toBe('rating: 4.9/5');
    expect(requestedUrls[0]).toContain('request%5Bfields%5D%5Bsections%5D=0');
    expect(resolvePathRedirect('/badge/wp-theme/astra/v')).toBe(
      'https://wordpress.org/themes/astra/'
    );
  });
});

describe('package registry presets (CocoaPods, Snapcraft, Clojars, Hackage, Elm)', () => {
  it('resolves CocoaPods versions and string or object licenses', async () => {
    mockUpstream({
      'trunk.cocoapods.org/api/v1/pods/AFNetworking/specs/latest': {
        license: { file: 'LICENSE', type: 'MIT' },
        version: '4.0.1',
      },
      'trunk.cocoapods.org/api/v1/pods/Alamofire/specs/latest': {
        license: 'MIT',
        version: '5.12.2',
      },
    });
    expect(await describeMetric('/badge/cocoapods/Alamofire/v')).toBe('pod: v5.12.2');
    expect(await describeMetric('/badge/cocoapods/Alamofire/l')).toBe('license: MIT');
    expect(await describeMetric('/badge/cocoapods/AFNetworking/license')).toBe('license: MIT');
    expect(await describeMetric('/badge/cocoapods/Missing/v')).toBe('pod: not found');
    expect(resolvePathRedirect('/badge/cocoapods/Alamofire/v')).toBe(
      'https://cocoapods.org/pods/Alamofire'
    );
  });

  it('sends the required Snap-Device-Series header and picks the stable amd64 default-track build', async () => {
    const requestedHeaders: Record<string, string>[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requestedHeaders.push((init?.headers ?? {}) as Record<string, string>);
        const url = resolveFetchUrl(input);
        if (url.includes('/snaps/info/firefox?')) {
          return Response.json({
            'channel-map': [
              {
                channel: { architecture: 'arm64', risk: 'stable', track: 'latest' },
                version: '157.0-1',
              },
              {
                channel: { architecture: 'amd64', risk: 'beta', track: 'latest' },
                version: '159.0b3-1',
              },
              {
                channel: { architecture: 'amd64', risk: 'stable', track: 'esr' },
                version: '153.5.0esr-1',
              },
              {
                channel: { architecture: 'amd64', risk: 'stable', track: 'latest' },
                version: '158.0-2',
              },
            ],
            snap: { license: 'MPL-2.0' },
          });
        }
        if (url.includes('/snaps/info/armonly?')) {
          return Response.json({
            'channel-map': [
              {
                channel: { architecture: 'arm64', risk: 'stable', track: '2.x' },
                version: '2.4.1',
              },
            ],
            'default-track': '2.x',
          });
        }
        return new Response('not found', { status: 404 });
      }
    );
    expect(await describeMetric('/badge/snap/firefox/v')).toBe('snapcraft: v158.0-2');
    expect(await describeMetric('/badge/snap/firefox/l')).toBe('license: MPL-2.0');
    expect(await describeMetric('/badge/snap/armonly/v')).toBe('snapcraft: v2.4.1');
    expect(await describeMetric('/badge/snap/armonly/license')).toBe('license: unknown');
    expect(await describeMetric('/badge/snap/missing/v')).toBe('snapcraft: not found');
    expect(requestedHeaders.length).toBeGreaterThan(0);
    for (const headers of requestedHeaders) {
      expect(headers['Snap-Device-Series']).toBe('16');
      expect(headers['User-Agent']).toContain('svg-api');
    }
    expect(SERVICES_CONFIG.snap.metrics.v.buildApiUrl('', 'firefox')).toBe(
      'https://api.snapcraft.io/v2/snaps/info/firefox?fields=license,version'
    );
  });

  it('resolves Clojars artifacts with and without an explicit group', async () => {
    const requestedUrls = mockUpstream({
      'clojars.org/api/artifacts/hiccup': { downloads: 30_558_428, latest_version: '2.0.0-RC5' },
      'clojars.org/api/artifacts/ring/ring-core': {
        downloads: 41_625_760,
        latest_release: '1.15.5',
        latest_version: '1.16.0-SNAPSHOT',
        licenses: [{ name: 'The MIT License', url: 'http://opensource.org/licenses/MIT' }],
      },
    });
    expect(await describeMetric('/badge/clojars/ring/ring-core/v')).toBe('clojars: v1.15.5');
    expect(await describeMetric('/badge/clojars/ring/ring-core/dt')).toBe('downloads: 41.6M');
    expect(await describeMetric('/badge/clojars/ring/ring-core/l')).toBe(
      'license: The MIT License'
    );
    expect(await describeMetric('/badge/clojars/hiccup/v')).toBe('clojars: v2.0.0-RC5');
    expect(await describeMetric('/badge/clojars/hiccup/license')).toBe('license: unknown');
    expect(requestedUrls).toEqual([
      'https://clojars.org/api/artifacts/ring/ring-core',
      'https://clojars.org/api/artifacts/hiccup',
    ]);
    expect(resolvePathRedirect('/badge/clojars/hiccup/v')).toBe('https://clojars.org/hiccup');
    expect(resolvePathRedirect('/badge/clojars/ring/ring-core/v')).toBe(
      'https://clojars.org/ring/ring-core'
    );
  });

  it('resolves Hackage preferred versions and Elm package metrics', async () => {
    mockUpstream({
      'hackage.haskell.org/package/aeson/preferred': {
        'deprecated-version': ['0.10.0.0'],
        'normal-version': ['2.3.2.0', '2.3.1.0'],
      },
      'hackage.haskell.org/package/empty/preferred': { 'normal-version': [] },
      'package.elm-lang.org/packages/elm/core/latest/elm.json': {
        license: 'BSD-3-Clause',
        version: '1.0.5',
      },
    });
    expect(await describeMetric('/badge/hackage/aeson/v')).toBe('hackage: v2.3.2.0');
    expect(await describeMetric('/badge/hackage/empty/v')).toBe('hackage: n/a');
    expect(await describeMetric('/badge/elm/elm/core/v')).toBe('elm: v1.0.5');
    expect(await describeMetric('/badge/elm/elm/core/l')).toBe('license: BSD-3-Clause');
    expect(await describeMetric('/badge/elm/core/v')).toBe('elm: missing owner');
    expect(resolvePathRedirect('/badge/hackage/aeson/v')).toBe(
      'https://hackage.haskell.org/package/aeson'
    );
    expect(resolvePathRedirect('/badge/elm/elm/core/v')).toBe(
      'https://package.elm-lang.org/packages/elm/core/latest/'
    );
  });
});

describe('ecosystem presets (Puppet Forge, Ansible Galaxy, F-Droid, Read the Docs, Gitea)', () => {
  it('resolves Puppet Forge metrics and renders the feedback score as a ring gauge', async () => {
    mockUpstream({
      'forgeapi.puppet.com/v3/modules/acme-fresh': { current_release: { version: '0.1.0' } },
      'forgeapi.puppet.com/v3/modules/puppetlabs-stdlib': {
        current_release: { metadata: { license: 'Apache-2.0' }, version: '10.1.0' },
        downloads: 120_630_352,
        feedback_score: 98,
      },
    });
    expect(await describeMetric('/badge/puppet/puppetlabs/stdlib/v')).toBe('puppet forge: v10.1.0');
    expect(await describeMetric('/badge/puppet/puppetlabs/stdlib/dl')).toBe('downloads: 120.6M');
    expect(await describeMetric('/badge/puppet/puppetlabs/stdlib/l')).toBe('license: Apache-2.0');
    const score = await resolvePathMetric('/badge/puppet/puppetlabs/stdlib/score');
    expect(score.result.value).toBe('98%');
    expect(score.result.special).toEqual({ type: 'ring', value: 98 });
    expect(await describeMetric('/badge/puppet/acme/fresh/score')).toBe('puppet score: n/a');
    expect(await describeMetric('/badge/puppet/stdlib/v')).toBe('puppet: missing owner');
    expect(resolvePathRedirect('/badge/puppet/puppetlabs/stdlib/v')).toBe(
      'https://forge.puppet.com/modules/puppetlabs/stdlib'
    );
  });

  it('resolves Ansible Galaxy collection metrics from the trailing-slash index endpoint', async () => {
    const requestedUrls = mockUpstream({
      'collections/index/community/general/': {
        download_count: 278_006_142,
        highest_version: { version: '13.5.0' },
      },
    });
    expect(await describeMetric('/badge/galaxy/community/general/v')).toBe('galaxy: v13.5.0');
    expect(await describeMetric('/badge/galaxy/community/general/dt')).toBe('downloads: 278M');
    expect(await describeMetric('/badge/galaxy/community/missing/v')).toBe('galaxy: not found');
    expect(requestedUrls[0]).toBe(
      'https://galaxy.ansible.com/api/v3/plugin/ansible/content/published/collections/index/community/general/'
    );
    expect(resolvePathRedirect('/badge/galaxy/community/general/v')).toBe(
      'https://galaxy.ansible.com/ui/repo/published/community/general/'
    );
  });

  it('resolves the suggested F-Droid version and falls back to the newest build', async () => {
    mockUpstream({
      'f-droid.org/api/v1/packages/org.example.app': {
        packages: [{ versionCode: 3, versionName: '3.0' }],
        suggestedVersionCode: 9,
      },
      'f-droid.org/api/v1/packages/org.fdroid.fdroid': {
        packages: [
          { versionCode: 2_000_052, versionName: '2.0.2' },
          { versionCode: 1_023_052, versionName: '1.23.2' },
        ],
        suggestedVersionCode: 1_023_052,
      },
    });
    expect(await describeMetric('/badge/fdroid/org.fdroid.fdroid/v')).toBe('f-droid: v1.23.2');
    expect(await describeMetric('/badge/fdroid/org.example.app/v')).toBe('f-droid: v3.0');
    expect(await describeMetric('/badge/fdroid/org.missing.app/v')).toBe('f-droid: not found');
    expect(resolvePathRedirect('/badge/fdroid/org.fdroid.fdroid/v')).toBe(
      'https://f-droid.org/packages/org.fdroid.fdroid/'
    );
  });

  it('maps the latest Read the Docs build to passing, failing, building, or not found', async () => {
    mockUpstream({
      'projects/broken/builds/': { results: [{ state: { code: 'finished' }, success: false }] },
      'projects/busy/builds/': { results: [{ state: { code: 'building' } }] },
      'projects/missing/builds/': { count: 0, results: [] },
      'projects/pip/builds/': { results: [{ state: { code: 'finished' }, success: true }] },
    });
    const passing = await resolvePathMetric('/badge/rtd/pip/build');
    expect(passing.result).toMatchObject({
      color: 'emerald',
      icon: 'circle-check',
      label: 'docs',
      value: 'passing',
    });
    const failing = await resolvePathMetric('/badge/rtd/broken/status');
    expect(failing.result).toMatchObject({ color: 'rose', icon: 'circle-x', value: 'failing' });
    const building = await resolvePathMetric('/badge/rtd/busy/build');
    expect(building.result).toMatchObject({ color: 'amber', value: 'building' });
    expect(await describeMetric('/badge/rtd/missing/build')).toBe('docs: not found');
    expect(SERVICES_CONFIG.rtd.metrics.build.buildApiUrl('', 'pip')).toBe(
      'https://readthedocs.org/api/v3/projects/pip/builds/?limit=1'
    );
    expect(resolvePathRedirect('/badge/rtd/pip/build')).toBe('https://pip.readthedocs.io/');
  });

  it('builds gitea.com repository metrics from the shared Gitea/Forgejo factory', async () => {
    const requestedUrls = mockUpstream({
      'gitea.com/api/v1/repos/gitea/tea': { open_pr_counter: 16, stars_count: 277 },
      'gitea.com/api/v1/repos/gitea/tea/releases/latest': { tag_name: 'v0.16.0' },
    });
    expect(await describeMetric('/badge/gitea/gitea/tea/stars')).toBe('stars: 277');
    expect(await describeMetric('/badge/gitea/gitea/tea/pulls')).toBe('pull requests: 16');
    expect(await describeMetric('/badge/gitea/gitea/tea/release')).toBe('release: v0.16.0');
    expect(requestedUrls).toEqual([
      'https://gitea.com/api/v1/repos/gitea/tea',
      'https://gitea.com/api/v1/repos/gitea/tea/releases/latest',
    ]);
    expect(resolvePathRedirect('/badge/gitea/gitea/tea/stars')).toBe(
      'https://gitea.com/gitea/tea/stars'
    );
    expect(SERVICES_CONFIG.gitea.docs.title).toBe('Gitea');
    expect(SERVICES_CONFIG.codeberg.metrics.stars.buildApiUrl('forgejo', 'forgejo')).toBe(
      'https://codeberg.org/api/v1/repos/forgejo/forgejo'
    );
  });
});

describe('funding & social presets (Open Collective, Liberapay, Bluesky)', () => {
  it('resolves Open Collective backers and the yearly budget from cents', async () => {
    mockUpstream({
      'opencollective.com/euro-club.json': { currency: 'EUR', yearlyIncome: 64_085 },
      'opencollective.com/webpack.json': {
        backersCount: 3067,
        currency: 'USD',
        yearlyIncome: 17_751_531,
      },
    });
    expect(await describeMetric('/badge/opencollective/webpack/backers')).toBe('backers: 3.1k');
    expect(await describeMetric('/badge/opencollective/webpack/budget')).toBe('budget: $177.5k/yr');
    expect(await describeMetric('/badge/opencollective/euro-club/budget')).toBe(
      'budget: €640.85/yr'
    );
    expect(await describeMetric('/badge/opencollective/euro-club/backers')).toBe('backers: n/a');
    expect(resolvePathRedirect('/badge/opencollective/webpack/backers')).toBe(
      'https://opencollective.com/webpack'
    );
  });

  it('resolves Liberapay patrons and weekly receipts, reporting hidden receipts', async () => {
    mockUpstream({
      'liberapay.com/Liberapay/public.json': {
        npatrons: 1788,
        receiving: { amount: '640.85', currency: 'EUR' },
      },
      'liberapay.com/private/public.json': { npatrons: 3 },
    });
    expect(await describeMetric('/badge/liberapay/Liberapay/patrons')).toBe('patrons: 1.8k');
    expect(await describeMetric('/badge/liberapay/Liberapay/receives')).toBe(
      'receives: €640.85/wk'
    );
    expect(await describeMetric('/badge/liberapay/private/receives')).toBe('receives: hidden');
    expect(resolvePathRedirect('/badge/liberapay/Liberapay/patrons')).toBe(
      'https://liberapay.com/Liberapay'
    );
  });

  it('resolves Bluesky follower and post counts with a URL-encoded actor query', async () => {
    const requestedUrls = mockUpstream({
      'app.bsky.actor.getProfile?actor=bsky.app': { followersCount: 35_300_770, postsCount: 880 },
    });
    expect(await describeMetric('/badge/bluesky/bsky.app/followers')).toBe(
      'bluesky: 35.3M followers'
    );
    expect(await describeMetric('/badge/bluesky/bsky.app/posts')).toBe('bluesky: 880 posts');
    expect(requestedUrls).toHaveLength(1);
    expect(SERVICES_CONFIG.bluesky.metrics.posts.buildApiUrl('', 'a+b.bsky.social')).toBe(
      'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=a%2Bb.bsky.social'
    );
    expect(resolvePathRedirect('/badge/bluesky/bsky.app/followers')).toBe(
      'https://bsky.app/profile/bsky.app'
    );
  });

  it('formats currency amounts with known symbols or appended ISO codes', () => {
    expect(formatCurrency(177_515.31, 'USD', '/yr')).toBe('$177.5k/yr');
    expect(formatCurrency('640.8', 'eur', '/wk')).toBe('€640.80/wk');
    expect(formatCurrency(25, 'GBP')).toBe('£25');
    expect(formatCurrency('1234.5', 'CHF', '/mo')).toBe('1.2k CHF/mo');
    expect(formatCurrency(12, undefined)).toBe('12');
    expect(formatCurrency(undefined, 'USD')).toBe('n/a');
  });
});
