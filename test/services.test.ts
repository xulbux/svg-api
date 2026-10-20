/**
 * Service preset tests – Upstream metric transforms for every service, request validation, error handling, request coalescing, caching, streaming, and the typed service definition helpers (`src/services/`, `src/config/services.ts`).
 */

/* oxlint-disable unicorn/no-null -- Upstream JSON payloads legitimately contain `null` values. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVICES_CONFIG } from '@/config/services';
import { SITE_ORIGIN } from '@/config/site';
import app from '@/index';
import { resolveSvgRoute } from '@/routes/svg';
import {
  CACHE_TTL,
  createEndpoint,
  defineService,
  pickFields,
  projectFirstEntry,
} from '@/services/endpoint';
import {
  listServiceMetricAliases,
  resetUpstreamCaches,
  resolveServiceMetric,
  resolveServicePreview,
  resolveServiceRedirectUrl,
} from '@/services/fetcher';
import {
  buildPackageVersion,
  createScoreMetric,
  createVersionMetric,
  formatBytes,
  formatCompactNumber,
  formatCount,
  formatCurrency,
  formatLicense,
  formatPercent,
  formatRelativeDate,
  formatSpdxKey,
  formatVersion,
  toFiniteNumber,
} from '@/services/metrics';
import { resolveIcon } from '@/svg/icons';
import type {
  Env,
  ResolvedServiceMetric,
  ServiceDefinition,
  ServiceMetricConfig,
  ServiceRequest,
} from '@/types';
import { createEdgeCacheStub, extractAriaLabel, installEdgeCacheStub, TEST_ENV } from './helpers';

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

/** Live read statistics of a chunked upstream body stream. */
interface ChunkedBodyStats {
  /** Whether the consumer cancelled the stream. */
  isCancelled: boolean;
  /** Number of chunks pulled by the consumer. */
  pulledChunks: number;
}

/** Chunked upstream body stream with read instrumentation. */
interface ChunkedBody {
  /** Readable body stream. */
  body: ReadableStream<Uint8Array>;
  /** Live read statistics. */
  stats: ChunkedBodyStats;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Request headers of an embedded `<img>` badge request. */
const IMAGE_REQUEST: RequestInit = { headers: { 'Sec-Fetch-Dest': 'image' } };

/** Worker environment without a `DEFAULT_GH_OWNER` binding. */
const UNCONFIGURED_ENV: Env = { ALLOW_PREVIEW_IN_PROD: 'true' };

/** Reference timestamp of the cache expiry tests in milliseconds. */
const REFERENCE_NOW = Date.parse('2026-10-19T12:00:00Z');

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

/**
 * Create a body stream that serves `head` in `headChunkSize`-byte chunks, followed by `tailChunks`
 * lazily generated chunks of `tailChunk`.
 */
function createChunkedBody(
  head: string,
  headChunkSize: number,
  tailChunk = '',
  tailChunks = 0
): ChunkedBody {
  const headBytes = new TextEncoder().encode(head);
  const tailBytes = new TextEncoder().encode(tailChunk);
  const stats = { isCancelled: false, pulledChunks: 0 };
  let offset = 0;
  let servedTailChunks = 0;
  const body = new ReadableStream<Uint8Array>({
    cancel(): void {
      stats.isCancelled = true;
    },
    pull(controller): void {
      stats.pulledChunks += 1;
      if (offset < headBytes.length) {
        controller.enqueue(headBytes.slice(offset, offset + headChunkSize));
        offset += headChunkSize;
      } else if (servedTailChunks < tailChunks) {
        servedTailChunks += 1;
        controller.enqueue(tailBytes);
      } else {
        controller.close();
      }
    },
  });
  return { body, stats };
}

/** Request a badge path as an embedded image and summarize the response. */
async function requestBadge(path: string, env: Env = TEST_ENV): Promise<BadgeSummary> {
  const response = await app.request(path, IMAGE_REQUEST, env);
  const svg = await response.text();
  return { ariaLabel: extractAriaLabel(svg), status: response.status, svg };
}

/** Request a badge path as an embedded image and return its `aria-label` (`label: value`). */
async function requestAriaLabel(path: string, env: Env = TEST_ENV): Promise<string | undefined> {
  const badge = await requestBadge(path, env);
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
async function resolvePathMetric(
  path: string,
  env: Env = TEST_ENV
): Promise<ResolvedServiceMetric> {
  return resolveServiceMetric(parseServiceRequest(path), env);
}

/** Resolve a service badge path and summarize it as `label: value`. */
async function describeMetric(path: string, env: Env = TEST_ENV): Promise<string> {
  const { result } = await resolvePathMetric(path, env);
  return `${result.label}: ${result.value ?? ''}`;
}

/** Resolve the browser redirect destination of a service badge path. */
function resolvePathRedirect(path: string): string {
  return resolveServiceRedirectUrl(parseServiceRequest(path), TEST_ENV);
}

/** Look up a registered service preset (throws for unknown services). */
function getService(service: string): ServiceDefinition {
  const definition = SERVICES_CONFIG[service];
  if (!definition) {
    throw new Error(`Unknown service: ${service}`);
  }
  return definition;
}

/** Look up a registered service metric (throws for unknown services or metrics). */
function getServiceMetric(service: string, metric: string): ServiceMetricConfig {
  const config = getService(service).metrics[metric];
  if (!config) {
    throw new Error(`Unknown metric: ${service}/${metric}`);
  }
  return config;
}

/** Build the upstream API URL of a registered service metric. */
function buildMetricApiUrl(service: string, metric: string, owner: string, target: string): string {
  return getServiceMetric(service, metric).endpoint.buildApiUrl({ owner, target });
}

// ----------------------------------------- MAIN ----------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetUpstreamCaches();
});

describe('service registry integrity', () => {
  it('resolves every metric default icon and every effective metric alias target', () => {
    for (const [key, service] of Object.entries(SERVICES_CONFIG)) {
      for (const [metricKey, metric] of Object.entries(service.metrics)) {
        expect(resolveIcon(metric.defaultIcon), `${key}/${metricKey} icon`).toBeDefined();
      }
      for (const [alias, target] of listServiceMetricAliases(service)) {
        expect(Object.hasOwn(service.metrics, target), `${key} alias ${alias}`).toBe(true);
        expect(Object.hasOwn(service.metrics, alias), `${key} alias ${alias} shadowed`).toBe(false);
      }
    }
  });

  it('shares one cache projection per upstream URL (projected payloads are cached by API URL)', () => {
    const params = { owner: 'owner', target: 'target' };
    const projectionsByUrl = new Map<string, unknown>();
    for (const [key, service] of Object.entries(SERVICES_CONFIG)) {
      for (const [metricKey, metric] of Object.entries(service.metrics)) {
        const apiUrl = metric.endpoint.buildApiUrl(params);
        if (projectionsByUrl.has(apiUrl)) {
          expect(metric.endpoint.project, `${key}/${metricKey}`).toBe(projectionsByUrl.get(apiUrl));
        } else {
          projectionsByUrl.set(apiUrl, metric.endpoint.project);
        }
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

  it('rejects alias targets that name no metric at compile time', () => {
    const endpoint = createEndpoint<{ version?: string }>({
      api: 'https://example.com/{target}',
      page: 'https://example.com/{target}',
    });
    const definition = defineService({
      docs: { description: 'Example.', title: 'Example' },
      // @ts-expect-error: Alias targets must name a canonical metric of the service.
      metricAliases: { ver: 'nope' },
      metrics: {
        v: createVersionMetric(
          endpoint,
          { defaultColor: 'sky', defaultIcon: 'tag', defaultLabel: 'v' },
          (payload) => payload.version
        ),
      },
      route: { target: { placeholder: ':pkg' } },
    });
    expect(Object.keys(definition.metrics)).toEqual(['v']);
  });

  it('presents community counts with one label and color per kind and the service brand icon (regression: per-service looks and nouns in values)', () => {
    const communityMetrics: readonly (readonly [service: string, metric: string, icon: string])[] =
      [
        ['aur', 'votes', 'archlinux'],
        ['bluesky', 'followers', 'bluesky'],
        ['bluesky', 'posts', 'bluesky'],
        ['discord', 'members', 'discord'],
        ['discord', 'online', 'discord'],
        ['hf', 'likes', 'huggingface'],
        ['liberapay', 'patrons', 'liberapay'],
        ['modrinth', 'followers', 'modrinth'],
        ['opencollective', 'backers', 'opencollective'],
        ['pub', 'likes', 'dart'],
        ['spigot', 'likes', 'spigotmc'],
        ['steam', 'players', 'steam'],
      ];
    const colorsByKind = new Map<string, string>();
    for (const [service, metric, icon] of communityMetrics) {
      const config = getServiceMetric(service, metric);
      expect(config.defaultLabel, `${service}/${metric}`).toBe(metric);
      expect(config.defaultIcon, `${service}/${metric}`).toBe(icon);
      const kindColor = colorsByKind.get(metric) ?? config.defaultColor;
      colorsByKind.set(metric, kindColor);
      expect(config.defaultColor, `${service}/${metric}`).toBe(kindColor);
    }
  });
});

describe('endpoint helpers', () => {
  it('encodes every template placeholder per path segment', () => {
    const endpoint = createEndpoint({
      api: 'https://api.example/{owner}/{target}?id={id}&path={path}',
      page: 'https://example/{path}',
    });
    expect(endpoint.buildApiUrl({ owner: 'a@b', target: 'c+d/e f' })).toBe(
      'https://api.example/a%40b/c%2Bd/e%20f?id=a%40b%2Fc%2Bd%2Fe%20f&path=a%40b/c%2Bd/e%20f'
    );
    expect(endpoint.buildPageUrl({ owner: '', target: 'hiccup' })).toBe('https://example/hiccup');
    expect(endpoint.ttl).toBe(CACHE_TTL.default);
  });

  it('projects picked fields and first list entries, reporting non-objects and empty lists as not found', () => {
    const pick = pickFields<{ a: number; b: number }>(['a']);
    expect(pick({ a: 1, b: 2, c: 3 })).toEqual({ a: 1 });
    expect(pick([1])).toBeUndefined();
    expect(pick(null)).toBeUndefined();
    const first = projectFirstEntry<{ x: number; y: number }>('results', ['x']);
    expect(first({ results: [{ x: 1, y: 2 }] })).toEqual({ x: 1 });
    expect(first({ results: [] })).toBeUndefined();
    expect(first({ results: [null] })).toBeUndefined();
    expect(projectFirstEntry<{ x: number }>(undefined)([{ x: 5 }])).toEqual({ x: 5 });
  });
});

describe('existing service presets', () => {
  it('resolves GitHub repository metrics from one shared, cached upstream payload', async () => {
    const requestedUrls = mockUpstream({
      '/repos/xulbux/color-tracr': {
        forks_count: 12,
        license: { spdx_id: 'MIT' },
        open_issues_count: 7,
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
    expect(await requestAriaLabel('/badge/gh/color-tracr/issues')).toBe('issues &amp; PRs: 7');
    expect(requestedUrls).toHaveLength(2);
  });

  it('reports missing GitHub licenses as none and unrecognized ones as custom (regression: license null showed custom)', async () => {
    mockUpstream({
      '/repos/xulbux/no-license': { license: null },
      '/repos/xulbux/odd-license': { license: { spdx_id: 'NOASSERTION' } },
    });
    expect(await describeMetric('/badge/gh/no-license/license')).toBe('license: none');
    expect(await describeMetric('/badge/gh/odd-license/l')).toBe('license: custom');
    expect(resolvePathRedirect('/badge/gh/no-license/license')).toBe(
      'https://github.com/xulbux/no-license'
    );
  });

  it('ignores non-numeric GitHub participation weeks (regression: null weeks produced NaN totals)', async () => {
    mockUpstream({
      '/repos/xulbux/color-tracr/stats/participation': { all: [1, 2, null, 'x', 4, 5, 6, 7, 8, 9] },
    });
    const activity = await resolvePathMetric('/badge/gh/color-tracr/activity');
    expect(activity.result.value).toBe('39/8w');
    expect(activity.result.special).toEqual({
      type: 'sparkline',
      values: [0, 0, 4, 5, 6, 7, 8, 9],
    });
  });

  it('never falls back to a hard-coded GitHub owner (regression: gh defaulted to xulbux without the binding)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await describeMetric('/badge/gh/color-tracr/stars', UNCONFIGURED_ENV)).toBe(
      'gh: missing owner'
    );
    expect(await requestAriaLabel('/badge/gh/xulbux/color-tracr/stars', UNCONFIGURED_ENV)).toBe(
      'svg.xul.is: restricted'
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows "computing" while GitHub statistics are still being generated (HTTP 202)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}, { status: 202 }));
    const badge = await requestBadge('/badge/gh/color-tracr/activity');
    expect(badge.ariaLabel).toBe('commits: computing');
  });

  it('resolves PyPI metrics and queries ClickPy with the PEP 503 normalized name over 30 full days', async () => {
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
    expect(clickPyUrl).toContain('date >= today() - 30 AND date < today()');
    expect(getServiceMetric('pypi', 'dl').endpoint.ttl).toBe(CACHE_TTL.daily);
    expect(getServiceMetric('jsdelivr', 'hm').endpoint.ttl).toBe(CACHE_TTL.daily);
  });

  it('falls back to the last License classifier for PyPI licenses (regression: classifier-only packages showed unknown)', async () => {
    mockUpstream({
      'pypi.org/pypi/classic/json': {
        info: {
          classifiers: [
            'License :: OSI Approved :: BSD License',
            'Programming Language :: Python',
            'License :: OSI Approved :: MIT License',
          ],
          license: '',
          license_expression: null,
        },
      },
      'pypi.org/pypi/full-text/json': {
        info: {
          classifiers: ['License :: OSI Approved :: Apache Software License'],
          license: 'Apache License\nVersion 2.0',
        },
      },
    });
    expect(await describeMetric('/badge/pypi/classic/license')).toBe('license: MIT License');
    expect(await describeMetric('/badge/pypi/full-text/license')).toBe(
      'license: Apache Software License'
    );
  });

  it('resolves unscoped and scoped npm metrics with canonical and legacy download keys', async () => {
    const requestedUrls = mockUpstream({
      'downloads/point/last-year/@hono/node-server': { downloads: 12_400_000 },
      'registry.npmjs.org/hono/latest': {
        license: 'MIT',
        types: './dist/index.d.ts',
        version: '4.13.13',
      },
    });
    expect(await requestAriaLabel('/badge/npm/hono/v')).toBe('npm: v4.13.13');
    expect(await requestAriaLabel('/badge/npm/hono/version')).toBe('npm: v4.13.13');
    expect(await requestAriaLabel('/badge/npm/hono/types')).toBe('types: included');
    expect(await requestAriaLabel('/badge/npm/@hono/node-server/dy')).toBe('downloads: 12.4M/yr');
    expect(await requestAriaLabel('/badge/npm/@hono/node-server/dt')).toBe('downloads: 12.4M/yr');
    expect(requestedUrls).toHaveLength(2);
  });

  it('detects TypeScript types declared only in npm exports conditions (regression: exports-only types showed none)', async () => {
    mockUpstream({
      'registry.npmjs.org/deep/latest': {
        exports: { '.': { a: { b: { c: { d: { types: './x.d.ts' } } } } } },
      },
      'registry.npmjs.org/exports-types/latest': {
        exports: { '.': { import: './index.js', types: './index.d.ts' } },
      },
      'registry.npmjs.org/fallback/latest': { exports: { '.': ['./a.js', { types: './a.d.ts' }] } },
      'registry.npmjs.org/untyped/latest': { exports: './index.js' },
    });
    expect(await describeMetric('/badge/npm/exports-types/types')).toBe('types: included');
    expect(await describeMetric('/badge/npm/fallback/types')).toBe('types: included');
    expect(await describeMetric('/badge/npm/untyped/types')).toBe('types: none');
    expect(await describeMetric('/badge/npm/deep/types')).toBe('types: none');
  });

  it('resolves Open VSX, crates.io, and Docker Hub metrics (Open VSX requires a namespace)', async () => {
    const requestedUrls = mockUpstream({
      'crates.io/api/v1/crates/serde?include=default_version,downloads': {
        crate: { default_version: '1.0.215', max_stable_version: null },
      },
      'hub.docker.com/v2/repositories/library/nginx/': {
        last_updated: new Date().toISOString(),
        pull_count: 1_200_000_000,
      },
      'open-vsx.org/api/xulbux/color-tracr': {
        downloadCount: 2486,
        license: 'MIT',
        version: '1.2.3',
      },
    });
    expect(await requestAriaLabel('/badge/ovsx/xulbux/color-tracr/v')).toBe('open vsx: v1.2.3');
    expect(await requestAriaLabel('/badge/ovsx/xulbux/color-tracr/rating')).toBe('rating: unrated');
    expect(await requestAriaLabel('/badge/ovsx/xulbux/color-tracr/license')).toBe('license: MIT');
    expect(await requestAriaLabel('/badge/crates/serde/v')).toBe('crates.io: v1.0.215');
    expect(await requestAriaLabel('/badge/docker/nginx/dl')).toBe('docker pulls: 1.2B');
    expect(await requestAriaLabel('/badge/docker/nginx/updated')).toBe('updated: today');
    expect(requestedUrls).toHaveLength(3);
  });

  it('rejects Open VSX routes without a namespace (regression: ovsx defaulted to a hard-coded owner)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await describeMetric('/badge/ovsx/color-tracr/v')).toBe('ovsx: missing owner');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the crates.io default version, license, MSRV, and crate size from the compact include document (regression: 441 KB payload)', async () => {
    const requestedUrls = mockUpstream({
      'crates.io/api/v1/crates/serde?include=default_version,downloads': {
        crate: {
          default_version: '1.0.229',
          downloads: 1_550_972_815,
          max_stable_version: null,
          max_version: '0.0.0',
          recent_downloads: 367_688_696,
        },
        versions: [
          {
            crate_size: 80_896,
            license: 'MIT OR Apache-2.0',
            num: '1.0.229',
            rust_version: '1.56',
          },
        ],
      },
    });
    expect(await describeMetric('/badge/crates/serde/v')).toBe('crates.io: v1.0.229');
    expect(await describeMetric('/badge/crates/serde/license')).toBe('license: MIT OR Apache-2.0');
    expect(await describeMetric('/badge/crates/serde/msrv')).toBe('msrv: v1.56');
    expect(await describeMetric('/badge/crates/serde/rust')).toBe('msrv: v1.56');
    expect(await describeMetric('/badge/crates/serde/size')).toBe('crate size: 79 kB');
    expect(await describeMetric('/badge/crates/serde/dq')).toBe('downloads: 367.7M/90d');
    expect(await describeMetric('/badge/crates/serde/dl')).toBe('downloads: 367.7M/90d');
    expect(await describeMetric('/badge/crates/serde/dt')).toBe('downloads: 1.6B');
    expect(requestedUrls).toEqual([
      'https://crates.io/api/v1/crates/serde?include=default_version,downloads',
    ]);
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

  it('resolves GitLab open issues from the token-free issue statistics endpoint', async () => {
    const requestedUrls = mockUpstream({
      'gitlab.com/api/v4/projects/inkscape%2Finkscape/issues_statistics': {
        statistics: { counts: { all: 6394, closed: 4281, opened: 2113 } },
      },
    });
    expect(await describeMetric('/badge/gitlab/inkscape/inkscape/issues')).toBe('issues: 2.1k');
    expect(requestedUrls).toEqual([
      'https://gitlab.com/api/v4/projects/inkscape%2Finkscape/issues_statistics?scope=all',
    ]);
    expect(resolvePathRedirect('/badge/gitlab/inkscape/inkscape/issues')).toBe(
      'https://gitlab.com/inkscape/inkscape/-/issues'
    );
  });

  it('resolves GitLab projects in nested subgroups as one encoded project ID', async () => {
    const requestedUrls = mockUpstream({
      'gitlab.com/api/v4/projects/gitlab-org%2Fcharts%2Fgitlab-runner?': { star_count: 512 },
    });
    expect(await describeMetric('/badge/gitlab/gitlab-org/charts/gitlab-runner/stars')).toBe(
      'stars: 512'
    );
    expect(requestedUrls).toEqual([
      'https://gitlab.com/api/v4/projects/gitlab-org%2Fcharts%2Fgitlab-runner?license=true',
    ]);
    expect(resolvePathRedirect('/badge/gitlab/gitlab-org/charts/gitlab-runner/stars')).toBe(
      'https://gitlab.com/gitlab-org/charts/gitlab-runner/-/starrers'
    );
    // Every segment is validated individually, and the depth stays bounded.
    expect(await describeMetric('/badge/gitlab/gitlab-org/../gitlab-runner/stars')).toBe(
      'gitlab: invalid name'
    );
    expect(await describeMetric('/badge/gitlab/a/b/c/d/e/f/stars')).toBe('gitlab: invalid name');
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
        version_created_at: new Date().toISOString(),
      },
    });
    expect(await requestAriaLabel('/badge/hex/phoenix/v')).toBe('hex: v1.8.15');
    expect(await requestAriaLabel('/badge/hex/phoenix/dq')).toBe('downloads: 5.6M/90d');
    expect(await requestAriaLabel('/badge/hex/phoenix/dl')).toBe('downloads: 5.6M/90d');
    expect(await requestAriaLabel('/badge/pub/http/v')).toBe('pub: v1.6.0');
    expect(await requestAriaLabel('/badge/pub/http/likes')).toBe('likes: 8.5k');
    const pointsBadge = await requestBadge('/badge/pub/http/points');
    expect(pointsBadge.ariaLabel).toBe('pub points: 94% 150/160');
    expect(pointsBadge.svg).toContain('stroke-dasharray="26.57 28.27"');
    expect(await requestAriaLabel('/badge/gem/rails/v')).toBe('gem: v8.1.4');
    expect(await requestAriaLabel('/badge/gem/rails/dt')).toBe('downloads: 802.6M');
    expect(await requestAriaLabel('/badge/gem/rails/updated')).toBe('updated: today');
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

  it('treats Packagist patch releases as stable (regression: -p1 and -patch1 were skipped as unstable)', async () => {
    mockUpstream({
      'packagist.org/packages/acme/beta/stats.json': { versions: ['2.0.0-beta.2', '1.9.0'] },
      'packagist.org/packages/acme/dev-only/stats.json': { versions: ['dev-main', '1.x-dev'] },
      'packagist.org/packages/acme/patch-word/stats.json': { versions: ['3.0.0-patch1', null] },
      'packagist.org/packages/acme/patched/stats.json': { versions: ['2.1.0-p1', '2.1.0'] },
    });
    expect(await describeMetric('/badge/packagist/acme/patched/v')).toBe('packagist: v2.1.0-p1');
    expect(await describeMetric('/badge/packagist/acme/patch-word/v')).toBe(
      'packagist: v3.0.0-patch1'
    );
    expect(await describeMetric('/badge/packagist/acme/beta/v')).toBe('packagist: v1.9.0');
    expect(await describeMetric('/badge/packagist/acme/dev-only/v')).toBe('packagist: dev-main');
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
      ].map((path) => requestBadge(path))
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
    expect(await requestAriaLabel('/badge/aur/yay/dm')).toBe('aur: invalid metric');
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
    const results = await Promise.all(
      cases.map(async ([path, expected]) => {
        const response = await app.request(path, IMAGE_REQUEST, TEST_ENV);
        return { body: await response.text(), expected, response };
      })
    );
    for (const { body, expected, response } of results) {
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toContain('s-maxage=60');
      expect(extractAriaLabel(body)).toBe(expected);
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
      if (url.includes('crates.io')) {
        return Promise.resolve(
          new Response('', { headers: { 'ratelimit-remaining': '0' }, status: 403 })
        );
      }
      return Promise.resolve(new Response('', { status: 403 }));
    });
    expect(await requestAriaLabel('/badge/npm/throttled/v')).toBe('npm: rate limited');
    expect(await requestAriaLabel('/badge/gh/color-tracr/stars')).toBe('stars: rate limited');
    expect(await requestAriaLabel('/badge/crates/serde/v')).toBe('crates.io: rate limited');
    expect(await requestAriaLabel('/badge/npm/forbidden/v')).toBe('npm: api error');
  });

  it('guards resolveServicePreview against invalid routes, missing samples, and throwing transforms', () => {
    expect(
      resolveServicePreview({ metric: 'v', service: 'nope', target: 'x' }, TEST_ENV, {}).color
    ).toBe('rose');
    expect(
      resolveServicePreview({ metric: 'v', service: 'crates', target: 'x' }, TEST_ENV, [])
    ).toMatchObject({ color: 'rose', value: 'not found' });
    vi.spyOn(getServiceMetric('npm', 'v'), 'transform').mockImplementation(() => {
      throw new TypeError('preview crash');
    });
    expect(
      resolveServicePreview({ metric: 'v', service: 'npm', target: 'x' }, TEST_ENV, {
        version: '1.0.0',
      })
    ).toMatchObject({ color: 'rose', value: 'invalid data' });
  });

  it('renders thrown transforms and projections as invalid data (regression: malformed payloads crashed the Worker)', async () => {
    mockUpstream({
      'crates.io/api/v1/crates/broken': { crate: {} },
      'registry.npmjs.org/broken/latest': { version: '1.0.0' },
    });
    vi.spyOn(getServiceMetric('npm', 'v'), 'transform').mockImplementation(() => {
      throw new TypeError('malformed');
    });
    vi.spyOn(getServiceMetric('crates', 'v').endpoint, 'project').mockImplementation(() => {
      throw new TypeError('malformed');
    });
    const transformFailure = await resolvePathMetric('/badge/npm/broken/v');
    expect(transformFailure.status).toBe(502);
    expect(transformFailure.result.value).toBe('invalid data');
    const projectionFailure = await resolvePathMetric('/badge/crates/broken/v');
    expect(projectionFailure.status).toBe(502);
    expect(projectionFailure.result.value).toBe('invalid data');
  });

  it('skips null entries in Snapcraft and F-Droid lists (regression: null entries threw TypeErrors)', async () => {
    mockUpstream({
      'api.snapcraft.io/v2/snaps/info/nulls': {
        'channel-map': [
          null,
          { channel: null, version: '0.1' },
          { channel: { architecture: 'amd64', risk: 'stable', track: 'latest' }, version: '2.0' },
        ],
      },
      'f-droid.org/api/v1/packages/org.example.nulls': {
        packages: [null, { versionCode: 7, versionName: '7.0' }],
        suggestedVersionCode: 9,
      },
    });
    expect(await describeMetric('/badge/fdroid/org.example.nulls/v')).toBe('f-droid: v7.0');
    expect(await describeMetric('/badge/snap/nulls/v')).toBe('snapcraft: v2.0');
  });
});

describe('upstream response size cap', () => {
  it('rejects oversized bodies via content-length and while streaming (regression: unbounded upstream bodies)', async () => {
    const declared = createChunkedBody('{}', 2);
    const streamed = createChunkedBody(
      '{"version":"1.0.0","padding":"',
      65_536,
      'x'.repeat(65_536),
      40
    );
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = resolveFetchUrl(input);
      if (url.includes('/declared/')) {
        return Promise.resolve(
          new Response(declared.body, { headers: { 'content-length': '3000000' } })
        );
      }
      return Promise.resolve(new Response(streamed.body));
    });
    const declaredBadge = await resolvePathMetric('/badge/npm/declared/v');
    expect(declaredBadge.status).toBe(413);
    expect(declaredBadge.result.value).toBe('too large');
    expect(declared.stats.pulledChunks).toBeLessThanOrEqual(1);
    const streamedBadge = await resolvePathMetric('/badge/npm/streamed/v');
    expect(streamedBadge.result.value).toBe('too large');
    expect(streamed.stats.isCancelled).toBe(true);
    expect(streamed.stats.pulledChunks).toBeLessThan(40);
  });

  it('keeps only the small projection of large payloads, so metrics share one fetch (regression: unbounded isolate memory)', async () => {
    const padding = 'x'.repeat(1_500_000);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(Response.json({ license: 'MIT', padding, version: '1.0.0' }))
      );
    expect(await describeMetric('/badge/npm/large/v')).toBe('npm: v1.0.0');
    expect(await describeMetric('/badge/npm/large/license')).toBe('license: MIT');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe('PyPI streaming prefix reader', () => {
  it('stops reading after the leading info object, even when chunks split strings and escapes', async () => {
    const info = String.raw`{"info":{"license_expression":"A\"}]\\ é","requires_python":">= 3.9","version":"2.0.0"},`;
    const chunked = createChunkedBody(info, 1, `"releases":{"x":"${'y'.repeat(65_536)}"}`, 64);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(chunked.body));
    expect(await describeMetric('/badge/pypi/streamed/v')).toBe('pypi: v2.0.0');
    expect(await describeMetric('/badge/pypi/streamed/license')).toBe(String.raw`license: A"}]\ é`);
    expect(await describeMetric('/badge/pypi/streamed/py')).toBe('python: >=3.9');
    expect(chunked.stats.isCancelled).toBe(true);
    expect(chunked.stats.pulledChunks).toBeLessThanOrEqual(
      new TextEncoder().encode(info).length + 1
    );
  });

  it('streams the info prefix despite a multi-megabyte content-length (regression: boto3 rendered too large)', async () => {
    const info = '{"info":{"version":"1.43.114"},';
    const chunked = createChunkedBody(info, 1, `"releases":{"x":"${'y'.repeat(65_536)}"}`, 64);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(chunked.body, { headers: { 'content-length': '3305356' } })
    );
    expect(await describeMetric('/badge/pypi/boto3/v')).toBe('pypi: v1.43.114');
    expect(chunked.stats.isCancelled).toBe(true);
  });

  it('falls back to parsing the complete body when info is not the leading key', async () => {
    const chunked = createChunkedBody(
      '{"last_serial":1,"info":{"version":"3.1.0"},"releases":{}}',
      4
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(chunked.body));
    expect(await describeMetric('/badge/pypi/reordered/v')).toBe('pypi: v3.1.0');
    expect(chunked.stats.isCancelled).toBe(false);
  });

  it('reports non-object info values as not found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"info":"oops"}'));
    expect(await describeMetric('/badge/pypi/odd/v')).toBe('pypi: not found');
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
    ] as const;
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledOnce();
    });
    upstream.resolve?.(
      Response.json({
        crate: { default_version: '1.0.219', downloads: 490_000_000 },
        versions: [{ license: 'MIT OR Apache-2.0', num: '1.0.219' }],
      })
    );
    const [versionBadge, downloadsBadge, licenseBadge] = await Promise.all(pendingBadges);
    expect(versionBadge.ariaLabel).toBe('crates.io: v1.0.219');
    expect(downloadsBadge.ariaLabel).toBe('downloads: 490M');
    expect(licenseBadge.ariaLabel).toBe('license: MIT OR Apache-2.0');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('never rejects coalesced requests when the edge cache fails (regression: a rejected cache put failed every waiter)', async () => {
    const stub = createEdgeCacheStub();
    const failingCache = {
      match: (): Promise<Response | undefined> => Promise.reject(new Error('match failed')),
      put: (): Promise<void> => Promise.reject(new Error('put failed')),
    };
    vi.stubGlobal('caches', { default: { ...stub.cache, ...failingCache } });
    const requestedUrls = mockUpstream({
      'crates.io/api/v1/crates/serde': {
        crate: { default_version: '1.0.219', downloads: 490_000_000 },
        versions: [{ license: 'MIT', num: '1.0.219' }],
      },
    });
    const labels = await Promise.all([
      describeMetric('/badge/crates/serde/v'),
      describeMetric('/badge/crates/serde/dt'),
      describeMetric('/badge/crates/serde/license'),
    ]);
    expect(labels).toEqual(['crates.io: v1.0.219', 'downloads: 490M', 'license: MIT']);
    expect(requestedUrls).toHaveLength(1);
  });

  it('stores only the projected payload at the edge and serves edge hits without fetching', async () => {
    const stub = installEdgeCacheStub();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({
            crate: { default_version: '1.0.0' },
            keywords: ['big'],
            versions: [{ license: 'MIT', num: '1.0.0' }],
          })
        )
      );
    expect(await describeMetric('/badge/crates/tiny/v')).toBe('crates.io: v1.0.0');
    expect(stub.storedKeys).toHaveLength(1);
    const [storedKey = ''] = stub.storedKeys;
    const stored = stub.store.get(storedKey);
    const storedBody = (await stored?.clone().json()) as Record<string, unknown>;
    expect(Object.keys(storedBody).toSorted()).toEqual(['defaultVersion', 'license']);

    resetUpstreamCaches();
    expect(await describeMetric('/badge/crates/tiny/license')).toBe('license: MIT');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('caches failures at the edge as small markers with status-specific TTLs', async () => {
    const stub = installEdgeCacheStub();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = resolveFetchUrl(input);
      if (url.includes('/slow-down/')) {
        return Promise.resolve(
          new Response('', { headers: { 'Retry-After': '120' }, status: 429 })
        );
      }
      if (url.includes('/burst/')) {
        return Promise.resolve(new Response('', { headers: { 'Retry-After': '5' }, status: 429 }));
      }
      if (url.includes('/long-wait/')) {
        return Promise.resolve(
          new Response('', { headers: { 'Retry-After': '5000' }, status: 429 })
        );
      }
      if (url.includes('/down/')) {
        return Promise.resolve(new Response('', { status: 503 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });
    const expectedMaxAges: [name: string, maxAge: number][] = [
      ['missing', 300],
      ['slow-down', 120],
      ['burst', 60],
      ['long-wait', 900],
      ['down', 60],
    ];
    await Promise.all(expectedMaxAges.map(([name]) => resolvePathMetric(`/badge/npm/${name}/v`)));
    const markers = expectedMaxAges.map(([name]) => {
      const apiUrl = encodeURIComponent(`https://registry.npmjs.org/${name}/latest`);
      const key = stub.storedKeys.find((storedKey) => storedKey.endsWith(`?url=${apiUrl}`));
      return stub.store.get(key ?? '');
    });
    const markerBodies = await Promise.all(markers.map((marker) => marker?.clone().text()));
    for (const [i, [name, maxAge]] of expectedMaxAges.entries()) {
      expect(markers[i]?.headers.get('Cache-Control'), name).toContain(`max-age=${maxAge},`);
      expect(markerBodies[i], name).toBe('');
    }

    resetUpstreamCaches();
    const fetchCount = vi.mocked(fetch).mock.calls.length;
    expect(await describeMetric('/badge/npm/missing/v')).toBe('npm: not found');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(fetchCount);
  });

  it('reads x-ratelimit-reset and ratelimit-reset as delta seconds below 1e9 and as an epoch above (regression: delta resets clamped to 60s)', async () => {
    const stub = installEdgeCacheStub();
    vi.spyOn(Date, 'now').mockReturnValue(REFERENCE_NOW);
    const epochReset = Math.floor(REFERENCE_NOW / 1000) + 600;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = resolveFetchUrl(input);
      if (url.includes('/standard-reset/')) {
        return Promise.resolve(
          new Response('', { headers: { 'ratelimit-reset': '240' }, status: 429 })
        );
      }
      const resetHeader = url.includes('/delta-reset/') ? '300' : String(epochReset);
      return Promise.resolve(
        new Response('', { headers: { 'x-ratelimit-reset': resetHeader }, status: 429 })
      );
    });
    const expectedMaxAges: readonly (readonly [name: string, maxAge: number])[] = [
      ['delta-reset', 300],
      ['epoch-reset', 600],
      ['standard-reset', 240],
    ];
    await Promise.all(expectedMaxAges.map(([name]) => resolvePathMetric(`/badge/npm/${name}/v`)));
    for (const [name, maxAge] of expectedMaxAges) {
      const apiUrl = encodeURIComponent(`https://registry.npmjs.org/${name}/latest`);
      const key = stub.storedKeys.find((storedKey) => storedKey.endsWith(`?url=${apiUrl}`));
      const marker = stub.store.get(key ?? '');
      expect(marker?.headers.get('Cache-Control'), name).toContain(`max-age=${maxAge},`);
    }
  });

  it('keeps edge hits in memory only for their remaining TTL (regression: edge hits got a full fresh TTL)', async () => {
    const stub = installEdgeCacheStub();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(REFERENCE_NOW);
    mockUpstream({ 'registry.npmjs.org/aging/latest': { version: '1.0.0' } });
    await describeMetric('/badge/npm/aging/v');
    expect(stub.matchedKeys).toHaveLength(1);

    const expiresAt = REFERENCE_NOW + CACHE_TTL.default * 1000;
    resetUpstreamCaches();
    nowSpy.mockReturnValue(expiresAt - 2000);
    await describeMetric('/badge/npm/aging/v');
    expect(stub.matchedKeys).toHaveLength(2);

    nowSpy.mockReturnValue(expiresAt - 1000);
    await describeMetric('/badge/npm/aging/v');
    expect(stub.matchedKeys).toHaveLength(2);

    nowSpy.mockReturnValue(expiresAt + 500);
    await describeMetric('/badge/npm/aging/v');
    expect(stub.matchedKeys).toHaveLength(3);
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
    const referenceTime = Date.parse('2026-10-17T12:00:00Z');
    expect(formatRelativeDate('2026-10-17T08:00:00Z', referenceTime)).toBe('today');
    expect(formatRelativeDate('2026-10-16T08:00:00Z', referenceTime)).toBe('yesterday');
    expect(formatRelativeDate('2026-10-13T08:00:00Z', referenceTime)).toBe('4d ago');
    expect(formatRelativeDate('2026-09-25T08:00:00Z', referenceTime)).toBe('3w ago');
    expect(formatRelativeDate('2026-06-10T08:00:00Z', referenceTime)).toBe('4mo ago');
  });

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
    expect(formatBytes(2_147_483_648)).toBe('2 GB');
    expect(formatBytes(-1)).toBe('n/a');
    expect(formatBytes(undefined)).toBe('n/a');
    expect(formatPercent(96.43)).toBe('96.4%');
    expect(formatPercent(90)).toBe('90%');
    const scoreMetric = createScoreMetric(
      createEndpoint<readonly [number, number]>({
        api: 'https://example.com/{target}',
        page: 'https://example.com/{target}',
      }),
      { defaultColor: 'emerald', defaultIcon: 'gauge', defaultLabel: 'score' },
      (pair) => pair,
      (achieved, maximum) => `${achieved}/${maximum}`
    );
    const dummyParams = { owner: '', target: 'x' };
    expect(scoreMetric.transform([-5, 100], dummyParams)?.value).toBe('n/a');
    expect(scoreMetric.transform([120, 100], dummyParams)?.special).toEqual({
      type: 'ring',
      value: 100,
    });
    expect(formatLicense('LicenseRef-Polyform-Shield-1.0.0')).toBe('Polyform-Shield-1.0.0');
    expect(formatLicense('LicenseRef-proprietary')).toBe('proprietary');
    expect(formatLicense('Some Very Long Custom License Name')).toBe('Some Very Long Custom ..');
  });

  it('treats blank numeric strings as missing (regression: "  " rendered as 0)', () => {
    expect(toFiniteNumber('  ')).toBeUndefined();
    expect(toFiniteNumber('')).toBeUndefined();
    expect(toFiniteNumber(' 12 ')).toBe(12);
    expect(formatCount('  ')).toBe('n/a');
  });

  it('strips one pair of enclosing license parentheses (regression: "(MIT OR Apache-2.0)" was truncated)', () => {
    expect(formatLicense('(MIT OR Apache-2.0)')).toBe('MIT OR Apache-2.0');
    expect(formatLicense('(MIT) OR (Apache-2.0)')).toBe('(MIT) OR (Apache-2.0)');
    expect(formatLicense('((MIT))')).toBe('(MIT)');
    expect(formatLicense('MIT OR Apache-2.0')).toBe('MIT OR Apache-2.0');
  });
});

describe('shared service refactors', () => {
  it('resolves the Codeberg prs metric from open_pr_counter and accepts the global pulls alias', async () => {
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
      const aliases = Object.fromEntries(listServiceMetricAliases(service));
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

  it('builds forge endpoints from the shared builders (GitHub, GitLab, Codeberg)', () => {
    expect(resolvePathRedirect('/badge/gh/color-tracr/stars')).toBe(
      'https://github.com/xulbux/color-tracr/stargazers'
    );
    expect(resolvePathRedirect('/badge/gitlab/gitlab-org/gitlab-runner/release')).toBe(
      'https://gitlab.com/gitlab-org/gitlab-runner/-/releases'
    );
    expect(buildMetricApiUrl('gitlab', 'stars', 'gitlab-org', 'gitlab-runner')).toBe(
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
    expect(buildMetricApiUrl('aur', 'v', '', 'gtk+3')).toBe(
      'https://aur.archlinux.org/rpc/v5/info?arg[]=gtk%2B3'
    );
    expect(buildMetricApiUrl('nuget', 'v', '', 'A+B')).toContain('packageid:A%2BB&');
    expect(buildMetricApiUrl('bundlephobia', 'gzip', '@hono', 'node-server')).toBe(
      'https://bundlephobia.com/api/size?package=%40hono%2Fnode-server'
    );
    expect(buildMetricApiUrl('wp', 'v', '', 'a+b')).toContain('request%5Bslug%5D=a%2Bb&');
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
    const resolved = await Promise.all(paths.map((path) => resolvePathMetric(path)));
    for (const [i, resolvedMetric] of resolved.entries()) {
      expect(resolvedMetric.status, paths[i]).toBe(400);
      expect(resolvedMetric.result.value, paths[i]).toBe('invalid name');
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
            '90d': { wget: 83_475 },
            '365d': { wget: 323_141 },
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
    expect(await describeMetric('/badge/brew/wget/dt')).toBe('installs: 323.1k/yr');
    expect(await describeMetric('/badge/cask/firefox/v')).toBe('homebrew cask: v158.0');
    expect(await describeMetric('/badge/cask/firefox/dy')).toBe('installs: 184.8k/yr');
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
    expect(await describeMetric('/badge/modrinth/sodium/l')).toBe('license: Polyform-Shield-1.0.0');
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
        releases: [{ description: 'Long release notes', type: 'stable', version: '158.0' }],
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

  it('resolves Discord online and member counts with the slow cache TTL', async () => {
    mockUpstream({
      'discord.com/api/v10/invites/discord-developers?with_counts=true': {
        approximate_member_count: 308_557,
        approximate_presence_count: 71_399,
        code: 'discord-developers',
      },
    });
    expect(await describeMetric('/badge/discord/discord-developers/online')).toBe('online: 71.4k');
    expect(await describeMetric('/badge/discord/discord-developers/members')).toBe(
      'members: 308.6k'
    );
    expect(getServiceMetric('discord', 'online').endpoint.ttl).toBe(CACHE_TTL.slow);
    expect(resolvePathRedirect('/badge/discord/discord-developers/online')).toBe(
      'https://discord.gg/discord-developers'
    );
  });

  it('resolves Bundlephobia sizes and dependency counts for unscoped and scoped packages', async () => {
    mockUpstream({
      'package=%40hono%2Fnode-server': { dependencyCount: 1, gzip: 8185, size: 22_283 },
      'package=react': {
        dependencyCount: 0,
        gzip: 3053,
        name: 'react',
        size: 7994,
        version: '19.3.1',
      },
    });
    expect(await describeMetric('/badge/bundlephobia/react/min')).toBe('minified: 7.8 kB');
    expect(await describeMetric('/badge/bundlephobia/react/gzip')).toBe('minzipped: 3 kB');
    expect(await describeMetric('/badge/bundlephobia/react/deps')).toBe('dependencies: 0');
    expect(await describeMetric('/badge/bundlephobia/@hono/node-server/minzip')).toBe(
      'minzipped: 8 kB'
    );
    expect(await describeMetric('/badge/bundlephobia/@hono/node-server/dependencies')).toBe(
      'dependencies: 1'
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
        requires: '5.8',
        requires_php: '7.2',
        version: '5.7.2',
      },
      'themes/info/1.2/?action=theme_information&request%5Bslug%5D=astra': {
        active_installs: 1_000_000,
        downloaded: 27_051_895,
        rating: 98,
        requires: '5.3',
        requires_php: false,
        version: '4.14.1',
      },
    });
    expect(await describeMetric('/badge/wp/akismet/v')).toBe('wordpress: v5.7.2');
    expect(await describeMetric('/badge/wp/akismet/installs')).toBe('active installs: 5M+');
    expect(await describeMetric('/badge/wp/akismet/rating')).toBe('rating: 4.7/5');
    expect(await describeMetric('/badge/wp/akismet/dl')).toBe('downloads: 407.7M');
    expect(await describeMetric('/badge/wp/akismet/php')).toBe('php: v7.2');
    expect(await describeMetric('/badge/wp/akismet/wp')).toBe('wordpress: v5.8');
    expect(await describeMetric('/badge/wp-theme/astra/v')).toBe('wordpress theme: v4.14.1');
    expect(await describeMetric('/badge/wp-theme/astra/rating')).toBe('rating: 4.9/5');
    expect(await describeMetric('/badge/wp-theme/astra/php')).toBe('php: n/a');
    expect(await describeMetric('/badge/wp-theme/astra/wp')).toBe('wordpress: v5.3');
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
    expect(buildMetricApiUrl('snap', 'v', '', 'firefox')).toBe(
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
  it('resolves Puppet Forge version and license from the compact releases endpoint and the score as a ring gauge', async () => {
    const requestedUrls = mockUpstream({
      'forgeapi.puppet.com/v3/modules/acme-fresh': { current_release: { version: '0.1.0' } },
      'forgeapi.puppet.com/v3/modules/puppetlabs-stdlib': {
        downloads: 120_630_352,
        feedback_score: 98,
      },
      'forgeapi.puppet.com/v3/releases?module=acme-gone': { results: [] },
      'forgeapi.puppet.com/v3/releases?module=puppetlabs-stdlib': {
        results: [{ metadata: { license: 'Apache-2.0' }, version: '10.1.0' }],
      },
    });
    expect(await describeMetric('/badge/puppet/puppetlabs/stdlib/v')).toBe('puppet forge: v10.1.0');
    expect(await describeMetric('/badge/puppet/puppetlabs/stdlib/dl')).toBe('downloads: 120.6M');
    expect(await describeMetric('/badge/puppet/puppetlabs/stdlib/l')).toBe('license: Apache-2.0');
    const score = await resolvePathMetric('/badge/puppet/puppetlabs/stdlib/score');
    expect(score.result.value).toBe('98%');
    expect(score.result.special).toEqual({ type: 'ring', value: 98 });
    expect(await describeMetric('/badge/puppet/acme/fresh/score')).toBe('puppet score: n/a');
    expect(await describeMetric('/badge/puppet/acme/gone/v')).toBe('puppet forge: not found');
    expect(await describeMetric('/badge/puppet/stdlib/v')).toBe('puppet: missing owner');
    expect(requestedUrls[0]).toBe(
      'https://forgeapi.puppet.com/v3/releases?module=puppetlabs-stdlib&limit=1&sort_by=release_date&exclude_fields=readme,changelog,license,reference,tasks,plans'
    );
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

  it('maps the latest Read the Docs build to passing, failing, building, cancelled, or not found', async () => {
    mockUpstream({
      'projects/broken/versions/latest/builds/': {
        results: [{ state: { code: 'finished' }, success: false }],
      },
      'projects/busy/versions/latest/builds/': { results: [{ state: { code: 'cloning' } }] },
      'projects/missing/versions/latest/builds/': { count: 0, results: [] },
      'projects/pip/versions/latest/builds/': {
        results: [{ state: { code: 'finished' }, success: true }],
      },
      'projects/stopped/versions/latest/builds/': {
        results: [{ state: { code: 'cancelled' }, success: false }],
      },
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
    expect(buildMetricApiUrl('rtd', 'build', '', 'pip')).toBe(
      'https://readthedocs.org/api/v3/projects/pip/versions/latest/builds/?limit=1'
    );
    expect(resolvePathRedirect('/badge/rtd/pip/build')).toBe('https://pip.readthedocs.io/');
  });

  it('reports cancelled Read the Docs builds as cancelled (regression: cancelled builds showed building forever)', async () => {
    mockUpstream({
      'projects/stopped/versions/latest/builds/': {
        results: [{ state: { code: 'cancelled' }, success: false }],
      },
    });
    const cancelled = await resolvePathMetric('/badge/rtd/stopped/build');
    expect(cancelled.result).toMatchObject({ color: 'slate', value: 'cancelled' });
    expect(resolveIcon(cancelled.result.icon ?? '')).toBeDefined();
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
    expect(getService('gitea').docs.title).toBe('Gitea');
    expect(buildMetricApiUrl('codeberg', 'stars', 'forgejo', 'forgejo')).toBe(
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
    expect(await describeMetric('/badge/bluesky/bsky.app/followers')).toBe('followers: 35.3M');
    expect(await describeMetric('/badge/bluesky/bsky.app/posts')).toBe('posts: 880');
    expect(requestedUrls).toHaveLength(1);
    expect(buildMetricApiUrl('bluesky', 'posts', '', 'a+b.bsky.social')).toBe(
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

describe('infrastructure, quality & game presets (deps.dev, Terraform, Artifact Hub, SonarCloud, Thunderstore, SpigotMC, Hangar)', () => {
  it('resolves deps.dev repository metrics and the Scorecard ring for any owner', async () => {
    const requestedUrls = mockUpstream({
      'api.deps.dev/v3/projects/github.com%2Fexpressjs%2Fexpress': {
        forksCount: 25_224,
        license: 'MIT',
        openIssuesCount: 236,
        projectKey: { id: 'github.com/expressjs/express' },
        scorecard: { checks: [{ name: 'Maintained', score: 10 }], overallScore: 8.5 },
        starsCount: 69_643,
      },
      'api.deps.dev/v3/projects/github.com%2Fhonojs%2Fhono': { starsCount: 32_538 },
    });
    expect(await describeMetric('/badge/depsdev/expressjs/express/stars')).toBe('stars: 69.6k');
    expect(await describeMetric('/badge/depsdev/expressjs/express/forks')).toBe('forks: 25.2k');
    expect(await describeMetric('/badge/depsdev/expressjs/express/issues')).toBe(
      'issues & PRs: 236'
    );
    expect(await describeMetric('/badge/depsdev/expressjs/express/l')).toBe('license: MIT');
    const score = await resolvePathMetric('/badge/depsdev/expressjs/express/score');
    expect(score.result).toMatchObject({
      color: 'emerald',
      special: { type: 'ring', value: 85 },
      value: '8.5/10',
    });
    expect(await describeMetric('/badge/depsdev/honojs/hono/score')).toBe('openssf scorecard: n/a');
    expect(await describeMetric('/badge/depsdev/nobody/nothing/stars')).toBe('stars: not found');
    expect(await describeMetric('/badge/depsdev/hono/stars')).toBe('depsdev: missing owner');
    expect(requestedUrls[0]).toBe(
      'https://api.deps.dev/v3/projects/github.com%2Fexpressjs%2Fexpress'
    );
    expect(resolvePathRedirect('/badge/depsdev/expressjs/express/stars')).toBe(
      'https://deps.dev/project/github/expressjs%2Fexpress'
    );
    expect(getServiceMetric('depsdev', 'stars').endpoint.ttl).toBe(CACHE_TTL.daily);
  });

  it('resolves Terraform module and provider metrics and requires the full module address', async () => {
    const requestedUrls = mockUpstream({
      'registry.terraform.io/v2/modules/terraform-aws-modules/vpc/aws?include=latest-version': {
        data: { attributes: { downloads: 222_833_090, name: 'vpc' }, type: 'modules' },
        included: [{ attributes: { downloads: 2_080_011, version: '6.7.3' } }],
      },
      'registry.terraform.io/v2/providers/hashicorp/aws': {
        data: { attributes: { downloads: 8_078_352_231 } },
      },
      'registry.terraform.io/v2/providers/hashicorp/aws/provider-versions/latest': {
        data: { attributes: { downloads: 7_774_806, version: '6.69.1' } },
      },
    });
    expect(await describeMetric('/badge/terraform/terraform-aws-modules/vpc/aws/v')).toBe(
      'terraform: v6.7.3'
    );
    expect(await describeMetric('/badge/terraform/terraform-aws-modules/vpc/aws/dl')).toBe(
      'downloads: 222.8M'
    );
    expect(await describeMetric('/badge/tf-provider/hashicorp/aws/v')).toBe(
      'terraform provider: v6.69.1'
    );
    expect(await describeMetric('/badge/tf-provider/hashicorp/aws/dt')).toBe('downloads: 8.1B');
    expect(await describeMetric('/badge/tf-provider/hashicorp/missing/v')).toBe(
      'terraform provider: not found'
    );
    expect(requestedUrls[0]).toBe(
      'https://registry.terraform.io/v2/modules/terraform-aws-modules/vpc/aws?include=latest-version'
    );
    expect(resolvePathRedirect('/badge/terraform/terraform-aws-modules/vpc/aws/v')).toBe(
      'https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws'
    );
    expect(resolvePathRedirect('/badge/tf-provider/hashicorp/aws/dt')).toBe(
      'https://registry.terraform.io/providers/hashicorp/aws/latest'
    );
    const requestCount = requestedUrls.length;
    const partial = await resolvePathMetric('/badge/terraform/terraform-aws-modules/vpc/v');
    expect(partial.result.value).toBe('invalid name');
    expect(requestedUrls).toHaveLength(requestCount);
  });

  it('resolves Artifact Hub package versions and stars', async () => {
    mockUpstream({
      'artifacthub.io/api/v1/packages/helm/bitnami/nginx/summary': {
        app_version: '1.31.7',
        description: 'NGINX Open Source',
        stars: 107,
        version: '25.2.5',
      },
    });
    expect(await describeMetric('/badge/artifacthub/helm/bitnami/nginx/v')).toBe(
      'artifact hub: v25.2.5'
    );
    expect(await describeMetric('/badge/artifacthub/helm/bitnami/nginx/app-version')).toBe(
      'app version: v1.31.7'
    );
    expect(await describeMetric('/badge/artifacthub/helm/bitnami/nginx/stars')).toBe('stars: 107');
    expect(await describeMetric('/badge/artifacthub/helm/nobody/nothing/v')).toBe(
      'artifact hub: not found'
    );
    expect(resolvePathRedirect('/badge/artifacthub/helm/bitnami/nginx/v')).toBe(
      'https://artifacthub.io/packages/helm/bitnami/nginx'
    );
  });

  it('resolves every SonarCloud metric from one shared measures request', async () => {
    const requestedUrls = mockUpstream({
      'component=apache_struts&': {
        component: {
          key: 'apache_struts',
          measures: [
            { metric: 'coverage', value: '69.4' },
            { metric: 'alert_status', value: 'OK' },
            { metric: 'bugs', value: '327' },
            { metric: 'code_smells', value: '3964' },
            { metric: 'duplicated_lines_density', value: '2.6' },
            { metric: 'security_rating', value: '5.0' },
            { metric: 'sqale_rating', value: '1.0' },
            { metric: 'vulnerabilities', value: '0' },
            { metric: '__proto__', value: 'ignored' },
          ],
        },
      },
      'component=failing_project&': {
        component: { measures: [{ metric: 'alert_status', value: 'ERROR' }] },
      },
      'component=odd_project&': { component: { key: 'odd_project' } },
    });
    const quality = await resolvePathMetric('/badge/sonarcloud/apache_struts/quality');
    expect(quality.result).toMatchObject({
      color: 'emerald',
      label: 'quality gate',
      value: 'passed',
    });
    const coverage = await resolvePathMetric('/badge/sonarcloud/apache_struts/cov');
    expect(coverage.result).toMatchObject({
      color: 'amber',
      special: { type: 'ring', value: 69 },
      value: '69.4%',
    });
    expect(await describeMetric('/badge/sonarcloud/apache_struts/bugs')).toBe('bugs: 327');
    expect(await describeMetric('/badge/sonarcloud/apache_struts/code_smells')).toBe(
      'code smells: 4k'
    );
    expect(await describeMetric('/badge/sonarcloud/apache_struts/dup')).toBe(
      'duplicated lines: 2.6%'
    );
    const vulnerabilities = await resolvePathMetric(
      '/badge/sonarcloud/apache_struts/vulnerabilities'
    );
    expect(vulnerabilities.result).toMatchObject({ color: 'emerald', value: '0' });
    const maintainability = await resolvePathMetric(
      '/badge/sonarcloud/apache_struts/maintainability'
    );
    expect(maintainability.result).toMatchObject({ color: 'emerald', value: 'A' });
    const security = await resolvePathMetric('/badge/sonarcloud/apache_struts/security');
    expect(security.result).toMatchObject({ color: 'rose', value: 'E' });
    expect(await describeMetric('/badge/sonarcloud/apache_struts/reliability')).toBe(
      'reliability: n/a'
    );
    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain(
      'metricKeys=alert_status,bugs,code_smells,coverage,duplicated_lines_density,reliability_rating,security_rating,sqale_rating,vulnerabilities'
    );
    const failing = await resolvePathMetric('/badge/sonarcloud/failing_project/gate');
    expect(failing.result).toMatchObject({ color: 'rose', value: 'failed' });
    expect(await describeMetric('/badge/sonarcloud/odd_project/quality')).toBe(
      'quality gate: not found'
    );
    expect(await describeMetric('/badge/sonarcloud/missing_project/bugs')).toBe('bugs: not found');
    expect(resolvePathRedirect('/badge/sonarcloud/apache_struts/quality')).toBe(
      'https://sonarcloud.io/project/overview?id=apache_struts'
    );
  });

  it('resolves Thunderstore package metrics', async () => {
    mockUpstream({
      'thunderstore.io/api/v1/package-metrics/BepInEx/BepInExPack/': {
        downloads: 33_870_119,
        latest_version: '5.4.2305',
        rating_score: 1028,
      },
    });
    expect(await describeMetric('/badge/thunderstore/BepInEx/BepInExPack/v')).toBe(
      'thunderstore: v5.4.2305'
    );
    expect(await describeMetric('/badge/thunderstore/BepInEx/BepInExPack/dl')).toBe(
      'downloads: 33.9M'
    );
    expect(await describeMetric('/badge/thunderstore/BepInEx/BepInExPack/rating')).toBe(
      'rating: 1k'
    );
    expect(await describeMetric('/badge/thunderstore/nobody/nothing/v')).toBe(
      'thunderstore: not found'
    );
    expect(resolvePathRedirect('/badge/thunderstore/BepInEx/BepInExPack/v')).toBe(
      'https://thunderstore.io/package/BepInEx/BepInExPack/'
    );
  });

  it('resolves SpigotMC resources by numeric ID only', async () => {
    const requestedUrls = mockUpstream({
      'api.spiget.org/v2/resources/9089/versions/latest': { name: '2.22.0', resource: 9089 },
      'api.spiget.org/v2/resources/9089?': {
        downloads: 5_916_768,
        likes: 114,
        rating: { average: 4.5, count: 667 },
      },
    });
    expect(await describeMetric('/badge/spigot/9089/v')).toBe('spigot: v2.22.0');
    expect(await describeMetric('/badge/spigot/9089/dt')).toBe('downloads: 5.9M');
    expect(await describeMetric('/badge/spigot/9089/rating')).toBe('rating: 4.5/5');
    expect(await describeMetric('/badge/spigot/9089/likes')).toBe('likes: 114');
    expect(await describeMetric('/badge/spigot/1/v')).toBe('spigot: not found');
    expect(requestedUrls[1]).toBe(
      'https://api.spiget.org/v2/resources/9089?fields=downloads,rating,likes'
    );
    const requestCount = requestedUrls.length;
    expect(await describeMetric('/badge/spigot/essentialsx/v')).toBe('spigot: invalid name');
    expect(requestedUrls).toHaveLength(requestCount);
    expect(resolvePathRedirect('/badge/spigot/9089/v')).toBe(
      'https://www.spigotmc.org/resources/9089/'
    );
  });

  it('resolves Hangar project metrics and the license name or type', async () => {
    mockUpstream({
      'hangar.papermc.io/api/v1/projects/ViaVersion/ViaVersion': {
        name: 'ViaVersion',
        settings: { license: { name: 'GPL', type: 'GPL' }, links: [] },
        stats: { downloads: 514_205, stars: 472, views: 1_178_178, watchers: 273 },
      },
      'hangar.papermc.io/api/v1/projects/acme/Typed': {
        settings: { license: { name: '', type: 'MIT' } },
      },
    });
    expect(await describeMetric('/badge/hangar/ViaVersion/ViaVersion/dt')).toBe(
      'downloads: 514.2k'
    );
    expect(await describeMetric('/badge/hangar/ViaVersion/ViaVersion/stars')).toBe('stars: 472');
    expect(await describeMetric('/badge/hangar/ViaVersion/ViaVersion/watchers')).toBe(
      'watchers: 273'
    );
    expect(await describeMetric('/badge/hangar/ViaVersion/ViaVersion/l')).toBe('license: GPL');
    expect(await describeMetric('/badge/hangar/acme/Typed/license')).toBe('license: MIT');
    expect(await describeMetric('/badge/hangar/acme/Typed/stars')).toBe('stars: n/a');
    expect(resolvePathRedirect('/badge/hangar/ViaVersion/ViaVersion/stars')).toBe(
      'https://hangar.papermc.io/ViaVersion/ViaVersion'
    );
  });
});

describe('distribution & community presets (Arch Linux, MetaCPAN, MacPorts, Fedora, Steam, Zenodo, Hacker News)', () => {
  it('joins distribution package versions in pacman/RPM notation', () => {
    expect(buildPackageVersion(0, '7.1.0', '3')).toBe('7.1.0-3');
    expect(buildPackageVersion(2, '9.0.2', '1')).toBe('2:9.0.2-1');
    expect(buildPackageVersion('1', '2.0', '3.fc46')).toBe('1:2.0-3.fc46');
    expect(buildPackageVersion('0', '3.15.0', undefined)).toBe('3.15.0');
    expect(buildPackageVersion(undefined, ' 1.0 ', '')).toBe('1.0');
    expect(buildPackageVersion(0, 42, '1')).toBeUndefined();
  });

  it('resolves Arch Linux versions with epoch and pkgrel, flags out-of-date packages, and reports empty results as not found', async () => {
    const requestedUrls = mockUpstream({
      '?name=ffmpeg&': {
        results: [{ epoch: 2, flag_date: null, pkgrel: '1', pkgver: '9.0.2', repo: 'extra' }],
      },
      '?name=missing&': { results: [] },
      '?name=odd&': { results: [{ licenses: 'MIT', pkgver: 42, repo: '' }] },
      '?name=pacman&': {
        results: [
          {
            epoch: 0,
            flag_date: null,
            licenses: ['GPL-2.0-or-later'],
            pkgrel: '3',
            pkgver: '7.1.0',
            repo: 'core',
          },
        ],
      },
      '?name=python&': {
        results: [{ epoch: 0, flag_date: '2026-10-10T14:59:18Z', pkgrel: '1', pkgver: '3.14.8' }],
      },
    });
    expect(await describeMetric('/badge/arch/pacman/v')).toBe('arch linux: v7.1.0-3');
    expect(await describeMetric('/badge/arch/pacman/l')).toBe('license: GPL-2.0-or-later');
    expect(await describeMetric('/badge/arch/pacman/repo')).toBe('repo: core');
    expect(await describeMetric('/badge/arch/ffmpeg/v')).toBe('arch linux: v2:9.0.2-1');
    const outdated = await resolvePathMetric('/badge/arch/python/v');
    expect(outdated.result).toMatchObject({ color: 'amber', value: 'v3.14.8-1 (outdated)' });
    expect(await describeMetric('/badge/arch/missing/v')).toBe('arch linux: not found');
    expect(await describeMetric('/badge/arch/odd/v')).toBe('arch linux: n/a');
    expect(await describeMetric('/badge/arch/odd/repo')).toBe('repo: n/a');
    expect(await describeMetric('/badge/arch/odd/license')).toBe('license: unknown');
    expect(requestedUrls[0]).toBe(
      'https://archlinux.org/packages/search/json/?name=pacman&repo=Core&repo=Extra&repo=Multilib'
    );
    expect(resolvePathRedirect('/badge/arch/pacman/v')).toBe(
      'https://archlinux.org/packages/?name=pacman'
    );
  });

  it('resolves MetaCPAN version, license, and release age, rejecting Lucene-unsafe distribution names before any fetch', async () => {
    vi.useFakeTimers({ now: REFERENCE_NOW, toFake: ['Date'] });
    try {
      const requestedUrls = mockUpstream({
        'distribution:Acme-Custom%20AND': {
          hits: { hits: [{ _source: { date: '2026-10-19T11:00:00+00:00', license: ['custom'] } }] },
        },
        'distribution:Acme-Odd%20AND': {
          hits: { hits: [{ _source: { license: ['unknown'], version: 'v1.2.3' } }] },
        },
        'distribution:Missing%20AND': { hits: { hits: [], total: 0 } },
        'distribution:Moose%20AND': {
          hits: {
            hits: [
              { _source: { date: '2026-10-01T00:35:44', license: ['perl_5'], version: '2.4001' } },
            ],
            total: 1,
          },
        },
      });
      expect(await describeMetric('/badge/cpan/Moose/v')).toBe('cpan: v2.4001');
      expect(await describeMetric('/badge/cpan/Moose/license')).toBe('license: Perl 5');
      expect(await describeMetric('/badge/cpan/Moose/updated')).toBe('last release: 2w ago');
      expect(await describeMetric('/badge/cpan/Acme-Odd/v')).toBe('cpan: v1.2.3');
      expect(await describeMetric('/badge/cpan/Acme-Odd/l')).toBe('license: unknown');
      expect(await describeMetric('/badge/cpan/Acme-Odd/updated')).toBe('last release: n/a');
      expect(await describeMetric('/badge/cpan/Acme-Custom/l')).toBe('license: custom');
      expect(await describeMetric('/badge/cpan/Acme-Custom/updated')).toBe('last release: today');
      expect(await describeMetric('/badge/cpan/Missing/v')).toBe('cpan: not found');
      expect(requestedUrls[0]).toBe(
        'https://fastapi.metacpan.org/v1/release/_search?q=distribution:Moose%20AND%20status:latest&_source=version,license,date&size=1'
      );
      const requestCount = requestedUrls.length;
      expect(await describeMetric('/badge/cpan/Moose_X/v')).toBe('cpan: invalid name');
      expect(await describeMetric('/badge/cpan/-Moose/v')).toBe('cpan: invalid name');
      expect(await describeMetric('/badge/cpan/Moose%2Bx/v')).toBe('cpan: invalid name');
      expect(requestedUrls).toHaveLength(requestCount);
      expect(resolvePathRedirect('/badge/cpan/libwww-perl/v')).toBe(
        'https://metacpan.org/dist/libwww-perl'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves MacPorts port version and license from the hourly cached port document', async () => {
    mockUpstream({
      'ports.macports.org/api/v1/ports/git/': {
        depends_on: [{ ports: ['git-lfs'], type: 'lib' }],
        license: 'GPL-2 and LGPL-2.1+',
        version: '2.56.0',
      },
    });
    expect(await describeMetric('/badge/macports/git/v')).toBe('macports: v2.56.0');
    expect(await describeMetric('/badge/macports/git/license')).toBe(
      'license: GPL-2 and LGPL-2.1+'
    );
    expect(await describeMetric('/badge/macports/missing/v')).toBe('macports: not found');
    expect(getServiceMetric('macports', 'v').endpoint.ttl).toBe(CACHE_TTL.daily);
    expect(resolvePathRedirect('/badge/macports/git/v')).toBe(
      'https://ports.macports.org/port/git/'
    );
  });

  it('resolves Fedora branch versions (rawhide by default) and reports mdapi 400 answers as not found', async () => {
    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = resolveFetchUrl(input);
      requestedUrls.push(url);
      if (url.endsWith('/rawhide/pkg/python3')) {
        return Response.json({ arch: 'i686', epoch: '0', release: '1.fc46', version: '3.15.0' });
      }
      if (url.endsWith('/f43/pkg/python3')) {
        return Response.json({ epoch: '0', release: '1.fc43', version: '3.14.8' });
      }
      if (url.endsWith('/rawhide/pkg/ed')) {
        return Response.json({ epoch: '1', release: '3.fc46', version: '2.0' });
      }
      return new Response('400: Bad Request', { status: 400 });
    });
    expect(await describeMetric('/badge/fedora/python3/v')).toBe('fedora: v3.15.0-1.fc46');
    expect(await describeMetric('/badge/fedora/f43/python3/v')).toBe('fedora: v3.14.8-1.fc43');
    expect(await describeMetric('/badge/fedora/ed/v')).toBe('fedora: v1:2.0-3.fc46');
    const missing = await resolvePathMetric('/badge/fedora/no-such-pkg/v');
    expect(missing.status).toBe(404);
    expect(missing.result.value).toBe('not found');
    expect(await describeMetric('/badge/fedora/f42/python3/v')).toBe('fedora: not found');
    // Endpoints without `missingStatuses` keep reporting upstream `400` answers as API errors.
    expect(await describeMetric('/badge/macports/git/v')).toBe('macports: api error');
    expect(requestedUrls[0]).toBe('https://mdapi.fedoraproject.org/rawhide/pkg/python3');
    expect(resolvePathRedirect('/badge/fedora/f43/python3/v')).toBe(
      'https://packages.fedoraproject.org/search?query=python3'
    );
  });

  it('resolves Steam current players for numeric app ids only, with a 5-minute cache TTL', async () => {
    const requestedUrls = mockUpstream({
      'GetNumberOfCurrentPlayers/v1/?appid=730': { response: { player_count: 982_255, result: 1 } },
      'GetNumberOfCurrentPlayers/v1/?appid=999': { response: { player_count: 'lots', result: 1 } },
    });
    expect(await describeMetric('/badge/steam/730/players')).toBe('players: 982.3k');
    expect(await describeMetric('/badge/steam/999/players')).toBe('players: n/a');
    expect(await describeMetric('/badge/steam/1/players')).toBe('players: not found');
    const requestCount = requestedUrls.length;
    const invalid = await resolvePathMetric('/badge/steam/abc/players');
    expect(invalid.status).toBe(400);
    expect(invalid.result.value).toBe('invalid name');
    expect(requestedUrls).toHaveLength(requestCount);
    expect(getServiceMetric('steam', 'players').endpoint.ttl).toBe(300);
    expect(resolvePathRedirect('/badge/steam/730/players')).toBe(
      'https://store.steampowered.com/app/730/'
    );
  });

  it('resolves Zenodo record statistics, version, license, and the DOI for numeric record ids only', async () => {
    const requestedUrls = mockUpstream({
      'zenodo.org/api/records/42': { doi: 5, stats: null },
      'zenodo.org/api/records/3835582': {
        doi: '10.5281/zenodo.3835582',
        files: [{ key: 'astropy.zip', size: 1024 }],
        metadata: { license: { id: 'BSD-3-Clause' }, version: '4.0.1' },
        stats: { downloads: 76_001, unique_downloads: 34_081, unique_views: 1319, views: 1387 },
      },
    });
    expect(await describeMetric('/badge/zenodo/3835582/dt')).toBe('downloads: 76k');
    expect(await describeMetric('/badge/zenodo/3835582/dl')).toBe('downloads: 76k');
    expect(await describeMetric('/badge/zenodo/3835582/unique')).toBe('unique downloads: 34.1k');
    expect(await describeMetric('/badge/zenodo/3835582/views')).toBe('views: 1.4k');
    expect(await describeMetric('/badge/zenodo/3835582/doi')).toBe('doi: 10.5281/zenodo.3835582');
    expect(await describeMetric('/badge/zenodo/3835582/v')).toBe('zenodo: v4.0.1');
    expect(await describeMetric('/badge/zenodo/3835582/license')).toBe('license: BSD-3-Clause');
    expect(await describeMetric('/badge/zenodo/42/dt')).toBe('downloads: n/a');
    expect(await describeMetric('/badge/zenodo/42/doi')).toBe('doi: n/a');
    expect(await describeMetric('/badge/zenodo/42/v')).toBe('zenodo: n/a');
    expect(await describeMetric('/badge/zenodo/42/license')).toBe('license: unknown');
    expect(await describeMetric('/badge/zenodo/7/views')).toBe('views: not found');
    const requestCount = requestedUrls.length;
    expect(await describeMetric('/badge/zenodo/astropy/dt')).toBe('zenodo: invalid name');
    expect(requestedUrls).toHaveLength(requestCount);
    expect(resolvePathRedirect('/badge/zenodo/3835582/dt')).toBe(
      'https://zenodo.org/records/3835582'
    );
  });

  it('resolves Maven Central latest artifact versions and validates Solr coordinates', async () => {
    const requestedUrls = mockUpstream({
      'g:com.google.guava+AND+a:guava': {
        response: { docs: [{ latestVersion: '33.5.0-jre' }], numFound: 1 },
      },
      'g:com.google.guava+AND+a:missing': { response: { docs: [], numFound: 0 } },
    });
    expect(await describeMetric('/badge/maven/com.google.guava/guava/v')).toBe(
      'maven: v33.5.0-jre'
    );
    expect(await describeMetric('/badge/maven/com.google.guava/missing/v')).toBe(
      'maven: not found'
    );
    expect(await describeMetric('/badge/maven/guava/v')).toBe('maven: missing owner');
    const requestCount = requestedUrls.length;
    expect(await describeMetric('/badge/maven/com.google.guava/gua+va/v')).toBe(
      'maven: invalid name'
    );
    expect(await describeMetric('/badge/maven/com.google.guava/.bad/v')).toBe(
      'maven: invalid name'
    );
    expect(requestedUrls).toHaveLength(requestCount);
    expect(resolvePathRedirect('/badge/maven/com.google.guava/guava/v')).toBe(
      'https://central.sonatype.com/artifact/com.google.guava/guava'
    );
  });

  it('resolves JetBrains Marketplace plugin version, downloads, and Bayesian rating by numeric ID', async () => {
    const requestedUrls = mockUpstream({
      'plugins.jetbrains.com/api/plugins/8182': { downloads: 12_845_910, id: 8182 },
      'plugins.jetbrains.com/api/plugins/8182/rating': { meanRating: 4.712, meanVotes: 382 },
      'plugins.jetbrains.com/api/plugins/8182/updates?size=1': [{ version: '0.4.200.5421-243' }],
      'plugins.jetbrains.com/api/plugins/9999/rating': { meanRating: 0, meanVotes: 0 },
      'plugins.jetbrains.com/api/plugins/9999/updates?size=1': [],
    });
    expect(await describeMetric('/badge/jetbrains/8182/v')).toBe('jetbrains: v0.4.200.5421-243');
    expect(await describeMetric('/badge/jetbrains/8182/dl')).toBe('downloads: 12.8M');
    expect(await describeMetric('/badge/jetbrains/8182/dt')).toBe('downloads: 12.8M');
    expect(await describeMetric('/badge/jetbrains/8182/rating')).toBe('rating: 4.7/5');
    expect(await describeMetric('/badge/jetbrains/9999/v')).toBe('jetbrains: not found');
    expect(await describeMetric('/badge/jetbrains/9999/rating')).toBe('rating: unrated');
    const requestCount = requestedUrls.length;
    expect(await describeMetric('/badge/jetbrains/rust/v')).toBe('jetbrains: invalid name');
    expect(requestedUrls).toHaveLength(requestCount);
    expect(resolvePathRedirect('/badge/jetbrains/8182/v')).toBe(
      'https://plugins.jetbrains.com/plugin/8182'
    );
  });

  it('resolves Hacker News karma from the bare Firebase number, reporting null as not found', async () => {
    const requestedUrls = mockUpstream({
      'v0/user/ghost/karma.json': null,
      'v0/user/pg/karma.json': 157_316,
    });
    expect(await describeMetric('/badge/hn/pg/karma')).toBe('karma: 157.3k');
    expect(await describeMetric('/badge/hn/ghost/karma')).toBe('karma: not found');
    expect(await describeMetric('/badge/hn/nobody/karma')).toBe('karma: not found');
    expect(requestedUrls[0]).toBe('https://hacker-news.firebaseio.com/v0/user/pg/karma.json');
    const requestCount = requestedUrls.length;
    expect(await describeMetric('/badge/hn/a.b/karma')).toBe('hn: invalid name');
    expect(requestedUrls).toHaveLength(requestCount);
    expect(resolvePathRedirect('/badge/hn/pg/karma')).toBe(
      'https://news.ycombinator.com/user?id=pg'
    );
  });
});
