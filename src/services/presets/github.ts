/**
 * GitHub service preset – Live upstream metrics and redirect transformations.
 *
 * Repository metadata, latest releases, and weekly commit participation use conditional REST
 * requests (`ETag` / `304 Not Modified`), while open issue and pull request counts coalesce across
 * both metrics and up to `MAX_GRAPHQL_BATCH_SIZE` concurrent repositories into a single 1-point
 * GraphQL v4 query when `GITHUB_TOKEN` is configured (short-circuiting at 0 cost when
 * `open_issues_count === 0`, and falling back to REST search without a token in local development).
 */

import {
  CACHE_TTL,
  OWNER_REPO_ROUTE,
  UPSTREAM_TIMEOUT,
  asJsonObject,
  cancelBody,
  createEndpoint,
  createMetric,
  defineService,
  isJsonObject,
  pickFields,
  readBoundedResponseText,
  withPageSuffix,
} from '@/services/endpoint';
import {
  FORKS,
  ISSUES,
  LAST_COMMIT,
  LICENSE,
  PULL_REQUESTS,
  RATIO_SPECIALS,
  SERIES_DELTA_SPECIALS,
  STARS,
  buildRatioSpecials,
  buildSeriesSpecials,
  createCountMetric,
  createRelativeDateMetric,
  createReleaseMetric,
  formatCompactNumber,
  formatLicense,
  readFiniteNumber,
  sumSeries,
} from '@/services/metrics';
import { MIN_SERIES_POINTS } from '@/svg/renderer';
import type {
  CachedPayloadReader,
  Env,
  MetricResult,
  ServiceRouteParams,
  UpstreamRequestInit,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** License metadata of a GitHub repository. */
interface GitHubLicense {
  /** SPDX license identifier (`NOASSERTION` for unrecognized licenses). */
  spdx_id?: string | null;
}

/** Partial GitHub repository API payload (`api.github.com/repos/:owner/:repo`). */
interface GitHubRepoPayload {
  /** Number of repository forks. */
  forks_count: number;
  /** Repository license metadata (`null` without a detected license). */
  license: GitHubLicense | null;
  /** Combined open issue and open pull request count (`0` guarantees both `issues` and `prs` are `0`). */
  open_issues_count: number;
  /** ISO 8601 timestamp of the most recent git push. */
  pushed_at: string;
  /** Number of repository stargazers. */
  stargazers_count: number;
}

/** Projected open issue and pull request counts (from GraphQL `repository` or REST `/search/issues`). */
interface GitHubCountsProjection {
  /** Open issue count from GraphQL `repository.issues.totalCount`. */
  issues?: number;
  /** Open pull request count from GraphQL `repository.pullRequests.totalCount`. */
  prs?: number;
  /** Fallback count from unauthenticated REST `/search/issues` (`total_count`). */
  total?: number;
}

/** Partial GitHub latest release API payload. */
interface GitHubReleasePayload {
  /** Release git tag name. */
  tag_name: string;
}

/** Partial GitHub commit participation API payload. */
interface GitHubParticipationPayload {
  /** Weekly commit counts for all users over the last 52 weeks. */
  all: unknown[];
}

/** Queued GraphQL count lookup waiting for the current microtask batch to flush. */
interface GraphQlBatchItem {
  /** Repository owner login. */
  owner: string;
  /** Rejects the item's promise on transport/timeout errors. */
  reject: (reason?: unknown) => void;
  /** Resolves the item's promise with its demultiplexed `Response`. */
  resolve: (response: Response) => void;
  /** Repository name. */
  target: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Number of trailing weeks summarized by the `activity` metric. */
const ACTIVITY_WEEKS = 8;

/** Fallback zero-filled weekly activity series when fewer than `MIN_SERIES_POINTS` weeks exist. */
const ZERO_ACTIVITY_WEEKS: readonly number[] = Array.from({ length: ACTIVITY_WEEKS }, () => 0);

/** GitHub GraphQL v4 endpoint URL. */
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

/**
 * Maximum repositories combined into one aliased GraphQL query (`16 * 3 = 48` internal lookups,
 * well below GitHub's `100`-lookup threshold, so the entire batch still costs `1` GraphQL point).
 */
const MAX_GRAPHQL_BATCH_SIZE = 16;

/** Selection set fetching open issue and open pull request totals on a GraphQL `Repository`. */
const REPOSITORY_COUNTS_SELECTION =
  '{issues(states:OPEN){totalCount}pullRequests(states:OPEN){totalCount}}';

/** Single-point GraphQL query fetching both open issue and open pull request totals for one repository. */
const GITHUB_COUNTS_QUERY = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name)${REPOSITORY_COUNTS_SELECTION}}`;

/** Request headers added to authenticated GraphQL `POST` requests. */
const GRAPHQL_HEADERS: Readonly<Record<string, string>> = { 'Content-Type': 'application/json' };

/** Upstream rate-limit headers preserved across demultiplexed GraphQL batch responses. */
const FORWARDED_RATE_HEADERS: readonly string[] = [
  'ratelimit-limit',
  'ratelimit-remaining',
  'ratelimit-reset',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
];

/** Pre-serialized synthetic GraphQL payload returned at 0 API cost when `open_issues_count` is already known to be `0`. */
const ZERO_COUNTS_BODY = JSON.stringify({
  data: { repository: { issues: { totalCount: 0 }, pullRequests: { totalCount: 0 } } },
});

/** Memoized aliased GraphQL query documents keyed by batch size (`2`–`MAX_GRAPHQL_BATCH_SIZE`). */
const BATCHED_QUERY_CACHE = new Map<number, string>();

/** Open microtask batches keyed by `Authorization` header value. */
const PENDING_GRAPHQL_BATCHES = new Map<string, GraphQlBatchItem[]>();

/** GitHub repository endpoint (one cached projection shared by every repository metric). */
const REPO_ENDPOINT = createEndpoint({
  api: 'https://api.github.com/repos/{owner}/{target}',
  page: 'https://github.com/{owner}/{target}',
  project: pickFields<GitHubRepoPayload>([
    'forks_count',
    'license',
    'open_issues_count',
    'pushed_at',
    'stargazers_count',
  ]),
});

/** GitHub latest release endpoint. */
const RELEASE_ENDPOINT = createEndpoint({
  api: 'https://api.github.com/repos/{owner}/{target}/releases/latest',
  extractKeys: ['tag_name'],
  page: 'https://github.com/{owner}/{target}/releases',
  project: pickFields<GitHubReleasePayload>(['tag_name']),
});

/** GitHub commit participation endpoint. */
const PARTICIPATION_ENDPOINT = createEndpoint({
  api: 'https://api.github.com/repos/{owner}/{target}/stats/participation',
  extractKeys: ['all'],
  page: 'https://github.com/{owner}/{target}/graphs/commit-activity',
  project: pickFields<GitHubParticipationPayload>(['all']),
  ttl: CACHE_TTL.slow,
});

// -------------------------------------- INTERNALS --------------------------------------

/** Build the `Authorization` header when a `GITHUB_TOKEN` secret is configured. */
function buildGitHubHeaders(env: Env): Readonly<Record<string, string>> {
  return env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {};
}

/** Build (once per batch size `2`–`MAX_GRAPHQL_BATCH_SIZE`) a parameterized aliased GraphQL counts query. */
function getBatchedCountsQuery(count: number): string {
  let cached = BATCHED_QUERY_CACHE.get(count);
  if (cached !== undefined) {
    return cached;
  }
  const declarations: string[] = [];
  const selections: string[] = [];
  for (let i = 0; i < count; i += 1) {
    declarations.push(`$o${i}:String!,$n${i}:String!`);
    selections.push(`r${i}:repository(owner:$o${i},name:$n${i})${REPOSITORY_COUNTS_SELECTION}`);
  }
  cached = `query(${declarations.join(',')}){${selections.join('')}}`;
  BATCHED_QUERY_CACHE.set(count, cached);
  return cached;
}

/** Copy rate-limit and retry headers from an upstream GraphQL `Response` onto demultiplexed responses. */
function copyRateLimitHeaders(response: Response): Record<string, string> {
  const copied: Record<string, string> = {};
  for (const headerName of FORWARDED_RATE_HEADERS) {
    const value = response.headers.get(headerName);
    if (value !== null) {
      copied[headerName] = value;
    }
  }
  return copied;
}

/** Extract the single-repository `{ data, errors }` GraphQL envelope for `alias` (`r0`, `r1`, …). */
function buildAliasEnvelope(parsed: unknown, alias: string): Record<string, unknown> {
  if (!isJsonObject(parsed)) {
    return { errors: [{ message: 'Invalid GraphQL response' }] };
  }
  const rawErrors = Array.isArray(parsed.errors) ? parsed.errors : [];
  const itemErrors: unknown[] = [];
  for (const entry of rawErrors) {
    if (isJsonObject(entry)) {
      const path = Array.isArray(entry.path) ? entry.path : undefined;
      if (!path || path.length === 0 || path[0] === alias) {
        itemErrors.push(entry);
      }
    }
  }
  const dataNode = asJsonObject(parsed.data);
  if (dataNode && Object.hasOwn(dataNode, alias)) {
    return itemErrors.length > 0
      ? { data: { repository: dataNode[alias] }, errors: itemErrors }
      : { data: { repository: dataNode[alias] } };
  }
  return {
    errors: itemErrors.length > 0 ? itemErrors : [{ message: 'Missing GraphQL alias result' }],
  };
}

/** Execute a multi-repository GraphQL batch (`2`–`MAX_GRAPHQL_BATCH_SIZE` items) and demultiplex each alias response. */
async function executeMultiRepoBatch(
  batch: readonly GraphQlBatchItem[],
  headers: Readonly<Record<string, string>>
): Promise<void> {
  const variables: Record<string, string> = {};
  for (let i = 0; i < batch.length; i += 1) {
    const item = batch[i];
    if (item) {
      variables[`o${i}`] = item.owner;
      variables[`n${i}`] = item.target;
    }
  }
  let response: Response | undefined = undefined;
  try {
    response = await fetch(GITHUB_GRAPHQL_URL, {
      body: JSON.stringify({ query: getBatchedCountsQuery(batch.length), variables }),
      headers,
      method: 'POST',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    });
  } catch (error) {
    for (const item of batch) {
      item.reject(error);
    }
    return;
  }
  const forwardedHeaders = copyRateLimitHeaders(response);
  if (response.url && !response.url.startsWith('https:')) {
    cancelBody(response.body);
    for (const item of batch) {
      item.resolve(new Response('', { headers: forwardedHeaders, status: 502 }));
    }
    return;
  }
  if (!response.ok) {
    cancelBody(response.body);
    for (const item of batch) {
      item.resolve(new Response('', { headers: forwardedHeaders, status: response.status }));
    }
    return;
  }
  let parsed: unknown = undefined;
  try {
    const bodyText = await readBoundedResponseText(response);
    if (bodyText === undefined) {
      for (const item of batch) {
        item.resolve(new Response('', { headers: forwardedHeaders, status: 413 }));
      }
      return;
    }
    parsed = JSON.parse(bodyText) as unknown;
  } catch (error) {
    const isAbortOrTimeout =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    for (const item of batch) {
      if (isAbortOrTimeout) {
        item.reject(error);
      } else {
        item.resolve(new Response('invalid json', { headers: forwardedHeaders, status: 200 }));
      }
    }
    return;
  }
  for (let i = 0; i < batch.length; i += 1) {
    const item = batch[i];
    if (item) {
      item.resolve(
        Response.json(buildAliasEnvelope(parsed, `r${i}`), {
          headers: forwardedHeaders,
          status: 200,
        })
      );
    }
  }
}

/** No-op error handler for fire-and-forget async tasks that already settle every item promise. */
function ignoreUnhandledBatchError(): void {
  // Every queued item is resolved or rejected inside `executeMultiRepoBatch`.
}

/** Flush one queued microtask batch (`1` repo directly, or `2`–`MAX_GRAPHQL_BATCH_SIZE` repos in a single 1-point query). */
function flushGraphQlBatch(
  authKey: string,
  batch: GraphQlBatchItem[],
  headers: Readonly<Record<string, string>>
): void {
  if (PENDING_GRAPHQL_BATCHES.get(authKey) === batch) {
    PENDING_GRAPHQL_BATCHES.delete(authKey);
  }
  if (batch.length === 1) {
    const [single] = batch;
    if (!single) {
      return;
    }
    fetch(GITHUB_GRAPHQL_URL, {
      body: JSON.stringify({
        query: GITHUB_COUNTS_QUERY,
        variables: { name: single.target, owner: single.owner },
      }),
      headers,
      method: 'POST',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    }).then(single.resolve, single.reject);
    return;
  }
  executeMultiRepoBatch(batch, headers).catch(ignoreUnhandledBatchError);
}

/** Enqueue a repository count lookup into the current microtask's GraphQL batch (`<= MAX_GRAPHQL_BATCH_SIZE` repos per query). */
function enqueueGitHubCountsQuery(
  params: ServiceRouteParams,
  headers: Readonly<Record<string, string>>
): Promise<Response> {
  const authKey = headers.Authorization ?? '';
  return new Promise<Response>((resolve, reject) => {
    let batch = PENDING_GRAPHQL_BATCHES.get(authKey);
    if (!batch) {
      batch = [];
      PENDING_GRAPHQL_BATCHES.set(authKey, batch);
      const scheduledBatch = batch;
      queueMicrotask(() => {
        flushGraphQlBatch(authKey, scheduledBatch, headers);
      });
    }
    batch.push({ owner: params.owner, reject, resolve, target: params.target });
    if (batch.length >= MAX_GRAPHQL_BATCH_SIZE) {
      PENDING_GRAPHQL_BATCHES.delete(authKey);
    }
  });
}

/** Check whether the cached repository payload already proves both open issues and PRs are `0`. */
function hasZeroOpenIssuesAndPrs(
  params: ServiceRouteParams,
  peekCached: CachedPayloadReader
): boolean {
  const cachedRepo = peekCached(REPO_ENDPOINT.buildApiUrl(params));
  return isJsonObject(cachedRepo) && cachedRepo.open_issues_count === 0;
}

/**
 * Build a shared GraphQL request for open issue and pull request counts (micro-batched across up to
 * `MAX_GRAPHQL_BATCH_SIZE` concurrent repositories when `GITHUB_TOKEN` is set, short-circuited at 0
 * cost when `open_issues_count === 0`, and falling back to REST `/search/issues` without a token).
 */
function buildGitHubCountsRequest(
  params: ServiceRouteParams,
  env: Env,
  peekCached: CachedPayloadReader
): UpstreamRequestInit | undefined {
  const encodedRepo = `${encodeURIComponent(params.owner)}/${encodeURIComponent(params.target)}`;
  const sharedCacheKey = `${GITHUB_GRAPHQL_URL}?repo=${encodedRepo}&q=counts`;
  if (hasZeroOpenIssuesAndPrs(params, peekCached)) {
    return {
      cacheKey: sharedCacheKey,
      send: () =>
        Promise.resolve(new Response(ZERO_COUNTS_BODY, { headers: GRAPHQL_HEADERS, status: 200 })),
      url: GITHUB_GRAPHQL_URL,
    };
  }
  if (!env.GITHUB_TOKEN) {
    return undefined;
  }
  return {
    cacheKey: sharedCacheKey,
    headers: GRAPHQL_HEADERS,
    method: 'POST',
    send: (requestHeaders) => enqueueGitHubCountsQuery(params, requestHeaders),
    url: GITHUB_GRAPHQL_URL,
  };
}

/** Project open issue and pull request counts from either GraphQL `repository` or REST `/search/issues`. */
function projectGitHubCounts(data: unknown): GitHubCountsProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  if (Object.hasOwn(data, 'data')) {
    const repo = asJsonObject(asJsonObject(data.data)?.repository);
    if (!repo) {
      return undefined;
    }
    const issuesNode = asJsonObject(repo.issues);
    const prsNode = asJsonObject(repo.pullRequests);
    return {
      issues: readFiniteNumber(issuesNode?.totalCount),
      prs: readFiniteNumber(prsNode?.totalCount),
    };
  }
  const total = readFiniteNumber(data.total_count);
  return total === undefined ? undefined : { total };
}

/** Transform a GitHub repository into its SPDX license (`none` without license, `custom` when unrecognized). */
function transformGitHubLicense(payload: Partial<GitHubRepoPayload>): Partial<MetricResult> {
  const { license } = payload;
  if (!license) {
    return { value: 'none' };
  }
  const spdxId = license.spdx_id;
  return { value: spdxId && spdxId !== 'NOASSERTION' ? formatLicense(spdxId) : 'custom' };
}

/** Transform GitHub commit participation into an 8-week total, sparkline, and candidate widgets (non-numeric weeks count as `0`). */
function transformGitHubActivity(
  payload: Partial<GitHubParticipationPayload>
): Partial<MetricResult> {
  const allWeeks = Array.isArray(payload.all) ? payload.all : [];
  const parsedWeeks: number[] = [];
  for (const rawCount of allWeeks) {
    parsedWeeks.push(
      typeof rawCount === 'number' && Number.isFinite(rawCount) ? Math.max(0, rawCount) : 0
    );
  }
  const recentWeeks = parsedWeeks.slice(-ACTIVITY_WEEKS);
  const totalRecent = sumSeries(recentWeeks);
  const prevTotal =
    parsedWeeks.length >= ACTIVITY_WEEKS * 2
      ? sumSeries(
          parsedWeeks,
          parsedWeeks.length - ACTIVITY_WEEKS * 2,
          parsedWeeks.length - ACTIVITY_WEEKS
        )
      : undefined;
  const values = recentWeeks.length >= MIN_SERIES_POINTS ? recentWeeks : ZERO_ACTIVITY_WEEKS;
  const sparkline = { type: 'sparkline' as const, values };
  const specials = buildSeriesSpecials({
    barsValues: values,
    current: totalRecent,
    previous: prevTotal,
    sparklineValues: values,
  });
  return {
    special: sparkline,
    specials: { ...specials, sparkline },
    value: `${formatCompactNumber(totalRecent)}/${ACTIVITY_WEEKS}w`,
  };
}

/** GitHub open issues count endpoint (micro-batched GraphQL with `GITHUB_TOKEN`, REST fallback otherwise). */
const ISSUES_ENDPOINT = createEndpoint({
  api: 'https://api.github.com/search/issues?q=repo:{owner}/{target}+type:issue+state:open&per_page=1',
  buildRequest: buildGitHubCountsRequest,
  extractKeys: ['total_count'],
  missingStatuses: [422],
  page: 'https://github.com/{owner}/{target}/issues',
  project: projectGitHubCounts,
  ttl: CACHE_TTL.slow,
});

/** GitHub open pull requests count endpoint (micro-batched GraphQL with `GITHUB_TOKEN`, REST fallback otherwise). */
const PRS_ENDPOINT = createEndpoint({
  api: 'https://api.github.com/search/issues?q=repo:{owner}/{target}+type:pr+state:open&per_page=1',
  buildRequest: buildGitHubCountsRequest,
  extractKeys: ['total_count'],
  missingStatuses: [422],
  page: 'https://github.com/{owner}/{target}/pulls',
  project: projectGitHubCounts,
  ttl: CACHE_TTL.slow,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** GitHub repository service preset (`gh`). */
export const GITHUB_SERVICE = defineService({
  buildHeaders: buildGitHubHeaders,
  docs: {
    description:
      'Repository stars, forks, open issues, open pull requests, license, last commit, release, and activity.',
    title: 'GitHub',
  },
  metrics: {
    activity: createMetric(
      PARTICIPATION_ENDPOINT,
      {
        autoSpecials: SERIES_DELTA_SPECIALS,
        defaultColor: 'emerald',
        defaultIcon: 'activity',
        defaultLabel: 'Commits',
        defaultSpecial: 'sparkline',
      },
      transformGitHubActivity
    ),
    commit: createRelativeDateMetric(
      withPageSuffix(REPO_ENDPOINT, '/commits'),
      LAST_COMMIT,
      (repo) => repo.pushed_at
    ),
    forks: createCountMetric(
      withPageSuffix(REPO_ENDPOINT, '/network/members'),
      { ...FORKS, autoSpecials: RATIO_SPECIALS },
      (repo) => repo.forks_count,
      '',
      (repo) => buildRatioSpecials(repo.forks_count, repo.stargazers_count)
    ),
    issues: createCountMetric(ISSUES_ENDPOINT, ISSUES, (counts) => counts.issues ?? counts.total),
    // The repository root renders any license file (`LICENSE.md`, `COPYING`, …):
    license: createMetric(REPO_ENDPOINT, LICENSE, transformGitHubLicense),
    prs: createCountMetric(PRS_ENDPOINT, PULL_REQUESTS, (counts) => counts.prs ?? counts.total),
    release: createReleaseMetric(RELEASE_ENDPOINT, (release) => release.tag_name),
    stars: createCountMetric(
      withPageSuffix(REPO_ENDPOINT, '/stargazers'),
      STARS,
      (repo) => repo.stargazers_count
    ),
  },
  route: OWNER_REPO_ROUTE,
});
