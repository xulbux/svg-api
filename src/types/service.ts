/**
 * Service preset configuration, Cloudflare Worker environment, and metric result types.
 */

import type { DotState, ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Minimal execution context interface supporting background `waitUntil` tasks. */
export interface WaitUntilContext {
  /** Registers a promise to complete in the background after the response is sent. */
  waitUntil: (promise: Promise<unknown>) => void;
}

/** Cloudflare Worker environment bindings and variables. */
export interface Env {
  /** Whether the `/preview` design studio route is enabled in production. */
  ALLOW_PREVIEW_IN_PROD?: string;
  /** Default GitHub owner/username for 3-segment `/gh/:target/:metric` routes. */
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
  /** Optional time-series points for an inline sparkline. */
  sparkline?: number[];
  /** Right-side formatted metric value. */
  value?: string;
}

/** Status preset mapping entry for `/status/:state/:text`. */
export interface StatusPreset {
  /** Default theme color for this status state. */
  color: ThemeColorName;
  /** Default left-hand label text. */
  defaultLabel: string;
  /** Pulsing status dot color state. */
  dot: DotState;
}

/** Configuration for a single metric within an upstream service preset. */
export interface ServiceMetricConfig {
  /** Builds the upstream JSON API URL for `(owner, target)`. */
  buildApiUrl: (owner: string, target: string) => string;
  /** Builds the browser redirect destination URL for `(owner, target)`. */
  buildRedirectUrl: (owner: string, target: string) => string;
  /** Optional Tier-1 JSON cache TTL in seconds (defaults to `600`). */
  cacheTtlSeconds?: number;
  /** Default theme color token when `?c=` is not provided. */
  defaultColor: ThemeColorName;
  /** Default icon slug when `?i=` is not provided. */
  defaultIcon: string;
  /** Default left-side label when `?l=` is not provided. */
  defaultLabel: string;
  /** Transforms the raw upstream JSON payload into badge properties. */
  transform: (data: unknown, owner: string, target: string) => Partial<MetricResult>;
}

/** Declarative definition for an external service (e.g., `gh`, `pypi`). */
export interface ServiceDefinition {
  /**
   * Returns the allowlist of owners permitted to use this service preset.
   * Include `'*'` to allow any owner.
   */
  allowedOwners?: (env: Env) => string[];
  /** Optional allowlist of target/package names permitted to use this service preset. */
  allowedTargets?: string[];
  /** Resolves the default owner when omitted from the route path. */
  defaultOwner?: (env: Env) => string;
  /** Map of metric slugs to their endpoint and transformer definitions. */
  metrics: Record<string, ServiceMetricConfig>;
}

/** HTTP status code and resolved metric result from `resolveServiceMetric`. */
export interface ResolvedServiceMetric {
  /** Resolved badge properties and redirect URL. */
  result: MetricResult;
  /** Upstream or validation HTTP status code. */
  status: number;
}
