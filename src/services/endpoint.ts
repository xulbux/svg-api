/**
 * Service endpoint helpers – URL templates with per-segment encoding, cache payload projections, and the typed `defineService` / `createMetric` entry points of every service preset.
 *
 * URL templates substitute `encodeURIComponent`-encoded route params, so presets never
 * interpolate raw route input into upstream URLs:
 * - `{owner}` / `{target}`: Owner and target (multi-segment targets are encoded per segment and keep their `/` separators).
 * - `{scope}`: Scope (`owner` with an optional leading `@` stripped), encoded as one component.
 * - `{path}`: `[owner/]target`, encoded per segment (e.g., Clojars `[:group/]:artifact`).
 * - `{id}`: `[owner/]target` encoded as one component (`/` -> `%2F`, e.g., GitLab project IDs).
 * - `{npm}`: `[@scope/]target` with scope and package encoded individually (e.g., `@hono/node-server` or `hono`).
 * - `{npm-id}`: `[@scope/]target` encoded as one component (`@hono/node-server` -> `%40hono%2Fnode-server`).
 */

import type {
  MetricEndpoint,
  MetricPresentation,
  MetricTransform,
  PayloadProjection,
  ServiceDefinition,
  ServiceMetricConfig,
  ServiceRequestBuilder,
  ServiceRoute,
  ServiceRouteParams,
  ServiceUrlBuilder,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** URL template with encoded route parameter placeholders, or a custom URL builder. */
type UrlSource = string | ServiceUrlBuilder;

/** Options of `createEndpoint`. */
interface EndpointOptions<P> {
  /** Upstream JSON API URL template or builder. */
  api: UrlSource;
  /** Optional custom HTTP request builder (e.g., an authenticated GraphQL `POST` query). */
  buildRequest?: ServiceRequestBuilder;
  /** Top-level JSON object keys whose values are the only parts needed. */
  extractKeys?: readonly string[];
  /** Upstream error statuses reported as not found. */
  missingStatuses?: readonly number[];
  /** Browser redirect URL template or builder. */
  page: UrlSource;
  /** Projection of the raw payload kept in the caches (defaults to the raw JSON object). */
  project?: PayloadProjection<P>;
  /** Tier-1 JSON cache TTL in seconds (defaults to `CACHE_TTL.default`). */
  ttl?: number;
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a URL template placeholder (captured, so `split` keeps the placeholder names). */
const URL_PLACEHOLDER_RX = /\{(?<placeholder>owner|scope|target|path|id|npm-id|npm)\}/;

// -------------------------------------- INTERNALS --------------------------------------

/** Encode every `/`-separated segment of a path value with `encodeURIComponent`, keeping the separators. */
function encodePathSegments(value: string): string {
  let encoded = '';
  let start = 0;
  for (let slash = value.indexOf('/'); slash !== -1; slash = value.indexOf('/', start)) {
    encoded += `${encodeURIComponent(value.slice(start, slash))}/`;
    start = slash + 1;
  }
  return encoded + encodeURIComponent(value.slice(start));
}

/** Join an optional owner and the target into `[owner/]target`. */
function joinRoutePath({ owner, target }: ServiceRouteParams): string {
  return owner ? `${owner}/${target}` : target;
}

/** Join an optional npm scope (`owner`) and package (`target`) into `[@scope/]pkg`. */
function joinNpmPackage({ owner, target }: ServiceRouteParams): string {
  if (!owner) {
    return target;
  }
  return owner.startsWith('@') ? `${owner}/${target}` : `@${owner}/${target}`;
}

/** Strip an optional leading `@` from a package scope segment (`'@std'` -> `'std'`). */
function stripScopePrefix(owner: string): string {
  return owner.startsWith('@') ? owner.slice(1) : owner;
}

/** Encode an npm `[@scope/]pkg` path, keeping the leading `@` and `/` unencoded. */
function encodeNpmPath({ owner, target }: ServiceRouteParams): string {
  const scope = stripScopePrefix(owner);
  return scope
    ? `@${encodeURIComponent(scope)}/${encodeURIComponent(target)}`
    : encodeURIComponent(target);
}

/** Resolve the encoded value of a URL template placeholder. */
function resolvePlaceholder(name: string, params: ServiceRouteParams): string {
  switch (name) {
    case 'owner': {
      return encodePathSegments(params.owner);
    }
    case 'scope': {
      return encodeURIComponent(stripScopePrefix(params.owner));
    }
    case 'path': {
      return encodePathSegments(joinRoutePath(params));
    }
    case 'id': {
      return encodeURIComponent(joinRoutePath(params));
    }
    case 'npm': {
      return encodeNpmPath(params);
    }
    case 'npm-id': {
      return encodeURIComponent(joinNpmPackage(params));
    }
    default: {
      return encodePathSegments(params.target);
    }
  }
}

/** Compile a URL template lazily into a builder that substitutes encoded route params. */
function compileUrlTemplate(template: string): ServiceUrlBuilder {
  let parts: string[] | undefined = undefined;
  return function buildTemplateUrl(params: ServiceRouteParams): string {
    // Split once on first use; odd indices hold placeholder names, even indices literal text:
    parts ??= template.split(URL_PLACEHOLDER_RX);
    let url = '';
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i] ?? '';
      url += i % 2 === 0 ? part : resolvePlaceholder(part, params);
    }
    return url;
  };
}

/** Resolve a URL template or builder into a builder. */
function toUrlBuilder(source: UrlSource): ServiceUrlBuilder {
  return typeof source === 'string' ? compileUrlTemplate(source) : source;
}

/** Derive an endpoint that shares the upstream API URL, TTL, and projection but redirects to another page. */
function withPage<P>(endpoint: MetricEndpoint<P>, page: UrlSource): MetricEndpoint<P> {
  return { ...endpoint, buildPageUrl: toUrlBuilder(page) };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Tier-1 JSON cache TTL presets in seconds for normal, rate-limited, and daily-refreshed upstreams. */
export const CACHE_TTL = { daily: 3600, default: 600, slow: 1800 } as const satisfies Readonly<
  Record<string, number>
>;

/** Shared route schema for `:owner/:repo` repository services. */
export const OWNER_REPO_ROUTE: ServiceRoute = {
  owner: { isRequired: true, placeholder: ':owner' },
  target: { placeholder: ':repo' },
};

/** Shared route schema for single-segment `:pkg` package services. */
export const PACKAGE_ROUTE: ServiceRoute = { target: { placeholder: ':pkg' } };

/** Shared route schema for `[:scope/]:pkg` package services. */
export const NPM_PACKAGE_ROUTE: ServiceRoute = {
  owner: { isRequired: false, placeholder: ':scope' },
  target: { placeholder: ':pkg' },
};

/**
 * Check whether a JSON value is a plain (non-array) object.
 * @param value   Parsed JSON value.
 * @returns `true` for non-null, non-array objects.
 */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Narrow an unknown JSON value to a plain object, returning `undefined` otherwise.
 * @param value   Parsed JSON value.
 * @returns Plain object record, or `undefined` for primitives, `null`, or arrays.
 */
export function asJsonObject(value: unknown): Record<string, unknown> | undefined {
  return isJsonObject(value) ? value : undefined;
}

/**
 * Return the first plain-object element of a JSON array, or `undefined` when not a non-empty array of objects.
 * @param entries   Candidate JSON array.
 * @returns First object element, or `undefined`.
 */
export function readFirstObjectEntry(entries: unknown): Record<string, unknown> | undefined {
  return Array.isArray(entries) ? asJsonObject(entries[0]) : undefined;
}

/**
 * Create an upstream endpoint from URL templates (or builders), a cache TTL, and an optional projection.
 * @param options   API and page URL sources, TTL, extracted keys, missing statuses, and projection.
 * @returns Endpoint whose URL templates are compiled lazily on first use.
 */
export function createEndpoint<P = Record<string, unknown>>(
  options: EndpointOptions<P>
): MetricEndpoint<P> {
  return {
    buildApiUrl: toUrlBuilder(options.api),
    buildPageUrl: toUrlBuilder(options.page),
    buildRequest: options.buildRequest,
    extractKeys: options.extractKeys,
    missingStatuses: options.missingStatuses,
    project: options.project,
    ttl: options.ttl ?? CACHE_TTL.default,
  };
}

/**
 * Derive an endpoint that redirects to a sub-page of the base endpoint's page (e.g., `'/stargazers'`).
 * @param endpoint   Base endpoint.
 * @param suffix     Literal path suffix appended to the base page URL.
 * @returns Endpoint with the suffixed page URL builder.
 */
export function withPageSuffix<P>(endpoint: MetricEndpoint<P>, suffix: string): MetricEndpoint<P> {
  const buildBasePageUrl = endpoint.buildPageUrl;
  return withPage(endpoint, (params) => `${buildBasePageUrl(params)}${suffix}`);
}

/**
 * Create a projection that keeps only the listed top-level fields of a JSON object payload.
 * @param fields   Field names to keep.
 * @returns Projection returning the picked fields, or `undefined` (not found) for non-object payloads.
 */
export function pickFields<T extends object>(
  fields: readonly (keyof T & string)[]
): PayloadProjection<Partial<T>> {
  return function projectFields(data: unknown): Partial<T> | undefined {
    if (!isJsonObject(data)) {
      return undefined;
    }
    const picked: Record<string, unknown> = {};
    for (const field of fields) {
      if (Object.hasOwn(data, field)) {
        picked[field] = data[field];
      }
    }
    return picked as Partial<T>;
  };
}

/**
 * Create a projection that keeps the first object entry of an upstream result list, reporting an empty
 * or missing list as not found.
 * @param listKey   Key of the result list in the payload object, or `undefined` when the payload is the list itself.
 * @param fields    Optional entry fields to keep (all fields when omitted).
 * @returns Projection returning the (picked) first entry, or `undefined` when there is none.
 */
export function projectFirstEntry<E extends object>(
  listKey: string | undefined,
  fields?: readonly (keyof E & string)[]
): PayloadProjection<Partial<E>> {
  const pickEntryFields = fields ? pickFields<E>(fields) : undefined;
  return function projectFirst(data: unknown): Partial<E> | undefined {
    let entries: unknown = data;
    if (listKey !== undefined) {
      entries = asJsonObject(data)?.[listKey];
    }
    const entry = readFirstObjectEntry(entries);
    if (!entry) {
      return undefined;
    }
    return pickEntryFields ? pickEntryFields(entry) : (entry as Partial<E>);
  };
}

/**
 * Create a metric from an endpoint, a presentation, and a transform typed by the endpoint projection.
 * @param endpoint       Upstream endpoint (its projection output is the transform input).
 * @param presentation   Default color, icon, and label.
 * @param transform      Transforms the projected payload into badge properties.
 * @returns Type-erased metric configuration for the service registry.
 */
export function createMetric<P>(
  endpoint: MetricEndpoint<P>,
  presentation: MetricPresentation,
  transform: MetricTransform<P>
): ServiceMetricConfig {
  return {
    ...presentation,
    endpoint,
    // The fetcher only ever passes this endpoint's projection output, so erasing `P` is safe:
    transform: transform as MetricTransform,
  };
}

/**
 * Define a service preset with compile-time checked metric keys (alias targets must name a metric).
 * @param definition   Service definition.
 * @returns The same definition, typed for the service registry.
 */
export function defineService<const M extends string>(
  definition: ServiceDefinition<M>
): ServiceDefinition {
  return definition;
}
