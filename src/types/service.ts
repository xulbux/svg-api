/**
 * Service types – Service preset configuration, Cloudflare Worker environment, and metric result types.
 */

import type { BadgeSpecialElement, BadgeSpecialKind, BadgeSpecialMap } from './badge';
import type { DotState, ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Minimal execution context interface supporting background `waitUntil` tasks. */
export interface WaitUntilContext {
  /** Registers a promise to complete in the background after the response is sent. */
  waitUntil: (promise: Promise<unknown>) => void;
}

/** Cloudflare Worker environment bindings and secrets. */
export interface Env {
  /** Optional GitHub Personal Access Token for authenticated conditional REST and GraphQL requests. */
  GITHUB_TOKEN?: string;
}

/** Raw numeric upstream value (number or numeric string), possibly missing. */
export type RawCount = number | string | null | undefined;

/** Canonical download period metric keys shared across package registries. */
export type DownloadMetricKey = 'dd' | 'dl' | 'dq' | 'dt' | 'dw' | 'dy';

/** Badge color and value suffix of a canonical download period (`DOWNLOAD_PERIODS`). */
export interface DownloadPeriodSpec {
  /** Default theme color of the period's badges. */
  color: ThemeColorName;
  /** Unit suffix appended to the formatted count (e.g., `'/mo'`). */
  suffix: string;
}

/**
 * Community count kinds sharing one label and color across services (the service brand icon
 * identifies the platform, e.g., Discord `members`, Bluesky `followers`, Hugging Face `likes`).
 */
export type CommunityMetricKind =
  | 'backers'
  | 'followers'
  | 'likes'
  | 'members'
  | 'online'
  | 'patrons'
  | 'players'
  | 'posts'
  | 'votes';

/** Resolved metric values and redirect URL returned by a service preset. */
export interface MetricResult {
  /** Theme color token for the badge. */
  color?: ThemeColorName;
  /** Optional pulsing status dot state. */
  dot?: DotState;
  /** Optional default icon slug. */
  icon?: string;
  /** Left-side label text. */
  label: string;
  /** Destination URL when the badge URL is navigated to as a document. */
  redirectUrl: string;
  /** Optional right-hand special data visualization element. */
  special?: BadgeSpecialElement;
  /** Optional candidate inline data visualization elements derived from upstream data (selected via `?special=<kind>`). */
  specials?: BadgeSpecialMap;
  /** Right-side formatted metric value. */
  value?: string;
}

/** Validated path segments of a service preset route, passed to URL builders and transforms. */
export interface ServiceRouteParams {
  /** Effective owner segment (explicit or default; `''` when the route has none). */
  owner: string;
  /** Target segment; Multi-segment targets are joined with `/`. */
  target: string;
}

/** Builds an upstream API or browser page URL from validated route params. */
export type ServiceUrlBuilder = (params: ServiceRouteParams) => string;

/** Custom upstream HTTP transport invoked instead of a direct `fetch()` call. */
export type UpstreamTransport = (
  headers: Readonly<Record<string, string>>,
  signal: AbortSignal
) => Promise<Response>;

/** Custom upstream HTTP request descriptor (e.g., an authenticated GraphQL `POST` query). */
export interface UpstreamRequestInit {
  /** Optional serialized request body (e.g., a GraphQL JSON query). */
  body?: string;
  /**
   * Canonical cache key URL shared across memory, coalescing, and edge caches (defaults to `url`);
   * Allows several metrics sharing one `POST` query to coalesce under one deterministic key.
   */
  cacheKey?: string;
  /**
   * Top-level JSON object keys to extract while streaming (overrides `MetricEndpoint.extractKeys`;
   * `undefined` reads the full response body).
   */
  extractKeys?: readonly string[];
  /** Additional request headers merged on top of the service headers. */
  headers?: Readonly<Record<string, string>>;
  /** HTTP method used for the upstream request. */
  method?: 'GET' | 'POST';
  /** Optional custom transport (e.g., micro-batched GraphQL queries or cached short-circuits). */
  send?: UpstreamTransport;
  /** Upstream HTTP URL to fetch. */
  url: string;
}

/** Reads a fresh positive projected payload from the in-isolate memory cache by cache key URL. */
export type CachedPayloadReader = (cacheKeyUrl: string) => unknown;

/**
 * Builds an optional custom upstream HTTP request from validated route params and Worker bindings;
 * Returning `undefined` falls back to a standard `GET` request to `buildApiUrl(params)`.
 */
export type ServiceRequestBuilder = (
  params: ServiceRouteParams,
  env: Env,
  peekCached: CachedPayloadReader
) => UpstreamRequestInit | undefined;

/**
 * Projects a raw upstream JSON payload into the small value kept in the in-isolate memory cache
 * and the Tier-1 edge cache. Returning `undefined` marks the package or repository as not found.
 */
export type PayloadProjection<P> = (data: unknown) => P | undefined;

/**
 * Transforms projected upstream data into badge properties.
 * Returning `undefined` marks the requested package or repository as not found.
 */
export type MetricTransform<P = unknown> = (
  data: P,
  params: ServiceRouteParams
) => Partial<MetricResult> | undefined;

/** Upstream JSON endpoint shared by one or more metrics of a service preset. */
export interface MetricEndpoint<P = unknown> {
  /** Builds the upstream JSON API URL. */
  buildApiUrl: ServiceUrlBuilder;
  /** Builds the browser redirect destination URL. */
  buildPageUrl: ServiceUrlBuilder;
  /** Optional custom HTTP request builder (e.g., an authenticated GraphQL `POST` query). */
  buildRequest?: ServiceRequestBuilder;
  /**
   * Top-level keys of the upstream JSON object whose values are the only parts needed; Unneeded
   * keys are skipped in `O(1)` memory while streaming, and the body stream is cancelled as soon
   * as all listed keys are read.
   */
  extractKeys?: readonly string[];
  /**
   * Additional upstream HTTP error statuses that mean the target does not exist; They are
   * reported and cached like a `404`.
   */
  missingStatuses?: readonly number[];
  /** Optional projection of the raw payload (defaults to the raw JSON object). */
  project?: PayloadProjection<P>;
  /** Tier-1 JSON cache TTL in seconds. */
  ttl: number;
}

/** Default visual presentation of a metric badge before query overrides. */
export interface MetricPresentation {
  /** Inline data widget kinds supported automatically from upstream data without a manual payload (`?special=<kind>`). */
  autoSpecials?: readonly BadgeSpecialKind[];
  /** Default theme color token when `?color=` is not provided. */
  defaultColor: ThemeColorName;
  /** Default icon slug when `?icon=` is not provided. */
  defaultIcon: string;
  /** Default left-side label when `?label=` is not provided. */
  defaultLabel: string;
  /** Default inline data widget kind rendered when `?special=` is omitted. */
  defaultSpecial?: BadgeSpecialKind;
  /** Whether the metric transform overrides `defaultColor` dynamically from live upstream status or thresholds. */
  hasDynamicColor?: boolean;
  /** Whether the metric transform adds a status dot dynamically from live upstream status. */
  hasDynamicDot?: boolean;
  /** Whether the metric transform overrides `defaultIcon` dynamically from live upstream status. */
  hasDynamicIcon?: boolean;
}

/** Minimum percentage at which a score or coverage badge switches to a theme color. */
export interface ScoreColorThreshold {
  /** Theme color token used at or above `minPercent`. */
  color: ThemeColorName;
  /** Inclusive lower bound in percent (`0`–`100`). */
  minPercent: number;
}

/** Configuration for a single metric within an upstream service preset, pairing an endpoint with a typed payload transform. */
export interface ServiceMetricConfig extends MetricPresentation {
  /** Upstream endpoint and cache projection. */
  endpoint: MetricEndpoint;
  /** Transforms the projected endpoint payload into badge properties. */
  transform: MetricTransform;
}

/** Owner segment requirement mode of a service preset route. */
export type ServiceOwnerMode = 'none' | 'optional' | 'required';

/** Owner path segment of a service preset route. */
export interface ServiceOwnerSegment {
  /** Default owner used when an optional owner segment is omitted (e.g., `'library'`). */
  defaultValue?: string;
  /** Whether the owner segment must be present. */
  isRequired: boolean;
  /**
   * Stricter pattern the owner segment must also match on top of the shared safe segment rule
   * (e.g., Maven group coordinates); Mismatches are rejected as `invalid name` before any fetch.
   */
  pattern?: RegExp;
  /** Docs placeholder of the owner segment (e.g., `':scope'`, `':vendor'`). */
  placeholder: string;
}

/** Target path segment(s) of a service preset route. */
export interface ServiceTargetSegment {
  /**
   * Maximum number of `/`-separated path segments the target may span; Each segment is validated
   * individually (e.g., Go modules: `/badge/go/github.com/spf13/cobra/v`). Multi-segment targets
   * combined with an owner require `isRequired: true`, so the owner stays unambiguous.
   */
  maxSegments?: number;
  /** Minimum number of `/`-separated path segments the target must span. */
  minSegments?: number;
  /**
   * Stricter pattern every target segment must also match on top of the shared safe segment rule
   * (e.g., numeric Steam app ids); Mismatches are rejected as `invalid name` before any fetch.
   */
  pattern?: RegExp;
  /** Docs placeholder of the target segment (e.g., `':pkg'`, `':repo'`). */
  placeholder: string;
}

/** Path segments of a service preset route (`/badge/:service/[:owner/]:target/:metric`). */
export interface ServiceRoute {
  /** Owner segment; When absent, an explicit owner segment is rejected as `invalid route`. */
  owner?: ServiceOwnerSegment;
  /** Target segment(s). */
  target: ServiceTargetSegment;
}

/** Documentation metadata for a registered service preset. */
export interface ServiceDocs {
  /** Short explanation of the available metrics. */
  description: string;
  /** Human-readable service name (e.g., `'PyPI'`, `'crates.io'`). */
  title: string;
}

/**
 * Declarative definition for an external service (e.g., `gh`, `pypi`); `M` is the union of
 * canonical metric keys, so alias targets are checked at compile time.
 */
export interface ServiceDefinition<M extends string = string> {
  /** Returns additional dynamic upstream request headers (e.g., an `Authorization` token). */
  buildHeaders?: (env: Env) => Readonly<Record<string, string>>;
  /** Documentation metadata for the service reference table. */
  docs: ServiceDocs;
  /** Additional static upstream request headers merged on top of default headers. */
  headers?: Readonly<Record<string, string>>;
  /**
   * Service-specific alternative metric slugs mapped to their canonical metric slug; They extend
   * and override the global default metric aliases (e.g., `l` -> `license`).
   */
  metricAliases?: Readonly<Record<string, NoInfer<M>>>;
  /** Map of canonical metric slugs to their endpoint and transformer definitions. */
  metrics: Readonly<Record<M, ServiceMetricConfig>>;
  /** Owner and target path segments of the route. */
  route: ServiceRoute;
}

/** Options for building time-series and delta inline widgets (`buildSeriesSpecials`). */
export interface SeriesSpecialsOptions {
  /** Numeric bar heights for `bars` (defaults to `sparklineValues` when omitted). */
  barsValues?: readonly number[];
  /** Current period value for `delta` percentage comparison. */
  current?: RawCount;
  /** Previous period value for `delta` percentage comparison. */
  previous?: RawCount;
  /** Numeric series points for `sparkline` (defaults to `barsValues` when omitted). */
  sparklineValues?: readonly number[];
}

/** Parsed service preset route (`/badge/:service/[:owner/]:target/:metric`). */
export interface ServiceRequest {
  /** Requested metric slug (e.g., `'stars'`, `'v'`, `'dl'`). */
  metric: string;
  /** Explicit owner segment, or `undefined` when omitted. */
  owner?: string;
  /** Service identifier (e.g., `'gh'`, `'npm'`). */
  service: string;
  /** Repository, package, or extension name (multi-segment targets are joined with `/`). */
  target: string;
}

/**
 * Sample right-hand value text or sample upstream JSON payload (object or array) for network-free
 * service badge previews.
 */
export type ServicePreviewSample =
  | string
  | Readonly<Record<string, unknown>>
  | readonly Readonly<Record<string, unknown>>[];

/** HTTP status code and resolved metric result from `resolveServiceMetric`. */
export interface ResolvedServiceMetric {
  /** Resolved badge properties and redirect URL. */
  result: MetricResult;
  /** Upstream or validation HTTP status code. */
  status: number;
}
