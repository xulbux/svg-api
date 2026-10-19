/**
 * Service types – Service preset configuration, Cloudflare Worker environment, and metric result types.
 */

import type { BadgeSpecialElement } from './badge';
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
  /** Default GitHub owner/username for 3-segment `/badge/gh/:repo/:metric` routes (also the owner allowlist). */
  DEFAULT_GH_OWNER: string;
  /** Optional GitHub Personal Access Token for higher upstream API rate limits. */
  GITHUB_TOKEN?: string;
}

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

/**
 * Transforms a raw upstream JSON payload into badge properties.
 * Returning `undefined` marks the requested package or repository as not found.
 */
export type MetricTransform = (
  data: unknown,
  owner: string,
  target: string
) => Partial<MetricResult> | undefined;

/** Upstream endpoint builders shared by one or more metrics of a service preset. */
export interface MetricEndpoint {
  /** Builds the upstream JSON API URL for `(owner, target)`. */
  buildApiUrl: (owner: string, target: string) => string;
  /** Builds the browser redirect destination URL for `(owner, target)`. */
  buildRedirectUrl: (owner: string, target: string) => string;
  /** Optional Tier-1 JSON cache TTL in seconds (defaults to `600`). */
  cacheTtlSeconds?: number;
}

/** Default visual presentation of a metric badge before query overrides. */
export interface MetricPresentation {
  /** Default theme color token when `?color=` is not provided. */
  defaultColor: ThemeColorName;
  /** Default icon slug when `?icon=` is not provided. */
  defaultIcon: string;
  /** Default left-side label when `?label=` is not provided. */
  defaultLabel: string;
}

/** Minimum percentage at which a score or coverage badge switches to a theme color. */
export interface ScoreColorThreshold {
  /** Theme color token used at or above `minPercent`. */
  color: ThemeColorName;
  /** Inclusive lower bound in percent (`0`–`100`). */
  minPercent: number;
}

/** Configuration for a single metric within an upstream service preset. */
export interface ServiceMetricConfig extends MetricEndpoint, MetricPresentation {
  /** Transforms the raw upstream JSON payload into badge properties. */
  transform: MetricTransform;
}

/**
 * Owner segment handling of a service preset route.
 * - `'none'`: Only `/badge/:service/:target/:metric` is valid.
 * - `'optional'`: Both 3-segment and 4-segment routes are valid (`defaultOwner` fills the gap).
 * - `'required'`: Only `/badge/:service/:owner/:target/:metric` is valid.
 */
export type ServiceOwnerMode = 'none' | 'optional' | 'required';

/** Documentation metadata used to generate the `/docs/services` route reference table. */
export interface ServiceDocs {
  /** Short explanation of the available metrics. */
  description: string;
  /** Owner segment placeholder (e.g., `':scope'`, `':vendor'`), when the service accepts an owner. */
  ownerName?: string;
  /** Target segment placeholder (e.g., `':pkg'`, `':repo'`). */
  targetName: string;
  /** Human-readable service name (e.g., `'PyPI'`, `'crates.io'`). */
  title: string;
}

/** Declarative definition for an external service (e.g., `gh`, `pypi`). */
export interface ServiceDefinition {
  /**
   * Returns the allowlist of owners permitted to use this service preset.
   * Include `'*'` to allow any owner; Services with an allowlist are omitted from the public docs.
   */
  allowedOwners?: (env: Env) => string[];
  /** Returns additional upstream request headers (e.g., an `Authorization` token). */
  buildHeaders?: (env: Env) => Record<string, string>;
  /** Resolves the default owner when omitted from the route path. */
  defaultOwner?: (env: Env) => string;
  /** Documentation metadata for the `/docs/services` reference table. */
  docs: ServiceDocs;
  /** Optional alternative metric slugs mapped to their canonical metric slug (e.g., `l` -> `license`). */
  metricAliases?: Readonly<Record<string, string>>;
  /**
   * Maximum number of `/`-separated path segments the target may span (defaults to `1`).
   * Values above `1` require `ownerMode: 'none'`; Every path segment between the service key and
   * the trailing metric segment is joined into the target, and each one is validated individually
   * (e.g., Go modules: `/badge/go/github.com/spf13/cobra/v`).
   */
  maxTargetSegments?: number;
  /** Map of canonical metric slugs to their endpoint and transformer definitions. */
  metrics: Readonly<Record<string, ServiceMetricConfig>>;
  /** Whether the route accepts, requires, or rejects an explicit owner segment. */
  ownerMode: ServiceOwnerMode;
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
