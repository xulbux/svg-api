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

/** Cloudflare Worker environment bindings and variables. */
export interface Env {
  /** Whether the `/` homepage and `/docs/*` documentation pages are enabled in production. */
  ALLOW_PREVIEW_IN_PROD?: string;
  /**
   * GitHub owner of the restricted `gh` preset: Default owner of 3-segment `/badge/gh/:repo/:metric`
   * routes and the only allowed owner; When unset or empty, every `gh` badge is restricted.
   */
  DEFAULT_GH_OWNER?: string;
  /** Optional GitHub Personal Access Token for higher upstream API rate limits. */
  GITHUB_TOKEN?: string;
}

/** Raw numeric upstream value (number or numeric string), possibly missing. */
export type RawCount = number | string | null | undefined;

/**
 * Canonical download metric keys: `dd` = last day (`/day`), `dw` = last week (`/wk`), `dl` = last
 * month (`/mo`), `dq` = last 90 days (`/90d`), `dy` = last year (`/yr`), `dt` = all-time (no suffix).
 */
export type DownloadMetricKey = 'dd' | 'dl' | 'dq' | 'dt' | 'dw' | 'dy';

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

/** Status preset mapping entry for `/badge/status/:state/:text`. */
export interface StatusPreset {
  /** Default theme color for this status state. */
  color: ThemeColorName;
  /** Default left-hand label text. */
  defaultLabel: string;
  /** Pulsing status dot color state. */
  dot: DotState;
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
  /**
   * Top-level keys of the upstream JSON object whose values are the only parts needed (e.g., PyPI's
   * `['info']` or pub.dev's `['latest']`); Unneeded keys are skipped in `O(1)` memory while
   * streaming, and the body stream is cancelled as soon as all listed keys are read.
   */
  extractKeys?: readonly string[];
  /**
   * Shorthand for `extractKeys: [leadingKey]` when a single top-level key holds every needed field
   * (e.g., PyPI's `info`).
   */
  leadingKey?: string;
  /**
   * Additional upstream HTTP error statuses that mean the package does not exist (e.g., Fedora
   * mdapi's `400`); They are reported and cached like a `404`.
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
}

/** Minimum percentage at which a score or coverage badge switches to a theme color. */
export interface ScoreColorThreshold {
  /** Theme color token used at or above `minPercent`. */
  color: ThemeColorName;
  /** Inclusive lower bound in percent (`0`–`100`). */
  minPercent: number;
}

/**
 * Configuration for a single metric within an upstream service preset (built with the typed
 * factories in `src/services/metrics.ts`, which guarantee that `transform` matches `endpoint`).
 */
export interface ServiceMetricConfig extends MetricPresentation {
  /** Upstream endpoint and cache projection. */
  endpoint: MetricEndpoint;
  /** Transforms the projected endpoint payload into badge properties. */
  transform: MetricTransform;
}

/**
 * Owner segment handling of a service preset route (derived from `ServiceRoute`, used by the builder).
 * - `'none'`: Only `/badge/:service/:target/:metric` is valid.
 * - `'optional'`: Both 3-segment and 4-segment routes are valid.
 * - `'required'`: Only `/badge/:service/:owner/:target/:metric` is valid.
 */
export type ServiceOwnerMode = 'none' | 'optional' | 'required';

/** Owner path segment of a service preset route. */
export interface ServiceOwnerSegment {
  /** Whether the owner segment must be present. */
  isRequired: boolean;
  /**
   * Stricter pattern the owner segment must also match on top of the shared safe segment rule
   * (e.g., Maven group coordinates); Mismatches are rejected as `invalid name` before any fetch.
   */
  pattern?: RegExp;
  /** Docs placeholder of the owner segment (e.g., `':scope'`, `':vendor'`). */
  placeholder: string;
  /**
   * Resolves the owner of routes without an owner segment (optional owners only); Returning
   * `undefined` or `''` rejects the route as `missing owner`.
   */
  resolveDefault?: (env: Env) => string | undefined;
}

/** Target path segment(s) of a service preset route. */
export interface ServiceTargetSegment {
  /**
   * Maximum number of `/`-separated path segments the target may span (defaults to `1`); Each one
   * is validated individually (e.g., Go modules: `/badge/go/github.com/spf13/cobra/v`). Values
   * above `1` combined with an owner require `isRequired: true`, so the owner stays unambiguous.
   */
  maxSegments?: number;
  /** Minimum number of `/`-separated path segments the target must span (defaults to `1`). */
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

/** Documentation metadata used to generate the `/docs/services` route reference table. */
export interface ServiceDocs {
  /** Short explanation of the available metrics. */
  description: string;
  /** Human-readable service name (e.g., `'PyPI'`, `'crates.io'`). */
  title: string;
}

/**
 * Declarative definition for an external service (e.g., `gh`, `pypi`); `M` is the union of
 * canonical metric keys, so alias targets are checked at compile time (see `defineService`).
 */
export interface ServiceDefinition<M extends string = string> {
  /**
   * Returns the allowlist of owners permitted to use this service preset.
   * Include `'*'` to allow any owner; Services with an allowlist are omitted from the public docs.
   */
  allowedOwners?: (env: Env) => readonly string[];
  /** Returns additional upstream request headers (e.g., an `Authorization` token). */
  buildHeaders?: (env: Env) => Readonly<Record<string, string>>;
  /** Documentation metadata for the `/docs/services` reference table. */
  docs: ServiceDocs;
  /**
   * Service-specific alternative metric slugs mapped to their canonical metric slug; They extend
   * and override the global default aliases of the fetcher (e.g., `l` -> `license`).
   */
  metricAliases?: Readonly<Record<string, NoInfer<M>>>;
  /** Map of canonical metric slugs to their endpoint and transformer definitions. */
  metrics: Readonly<Record<M, ServiceMetricConfig>>;
  /** Owner and target path segments of the route. */
  route: ServiceRoute;
}

/** Parsed service preset route (`/badge/:service/[:owner/]:target/:metric`). */
export interface ServiceRequest {
  /** Requested metric slug (e.g., `'stars'`, `'v'`, `'dl'`). */
  metric: string;
  /** Explicit owner segment, or `undefined` for 3-segment routes. */
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
