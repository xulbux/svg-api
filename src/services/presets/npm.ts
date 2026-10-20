/**
 * npm service preset – Registry version, license, TypeScript types, and download counts for unscoped and scoped packages (`/badge/npm/[:scope/]:pkg/:metric`).
 */

import {
  NPM_PACKAGE_ROUTE,
  createEndpoint,
  createMetric,
  defineService,
  isJsonObject,
  pickFields,
} from '@/services/endpoint';
import {
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
  readLicenseName,
  readText,
} from '@/services/metrics';
import type { MetricEndpoint } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected npm Registry latest version metadata (`registry.npmjs.org/:pkg/latest`). */
interface NpmLatestProjection {
  /** Whether the package ships TypeScript declarations (`types`, `typings`, or an `exports` `types` condition). */
  hasTypes: boolean;
  /** SPDX license identifier (from a string or a legacy `{ type }` object). */
  license?: string;
  /** Latest published npm version. */
  version?: string;
}

/** Partial npm Downloads API payload (`api.npmjs.org/downloads/point/:period/:pkg`). */
interface NpmDownloadsPayload {
  /** Total downloads in the requested period. */
  downloads: number;
}

/** Remaining key budget of the bounded `exports` walk. */
interface ExportsWalkBudget {
  /** Number of object keys that may still be visited. */
  remainingKeys: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum nesting depth of the `exports` map searched for `types` conditions. */
const MAX_EXPORTS_DEPTH = 4;

/** Maximum number of `exports` keys visited (huge subpath maps stay cheap). */
const MAX_EXPORTS_KEYS = 256;

/** Projection of the npm Downloads API (only the count). */
const DOWNLOADS_PROJECTION = pickFields<NpmDownloadsPayload>(['downloads']);

// -------------------------------------- INTERNALS --------------------------------------

/** Check whether an `exports` node declares a `types` condition (bounded depth and key count). */
function hasTypesCondition(node: unknown, depth: number, budget: ExportsWalkBudget): boolean {
  if (depth > MAX_EXPORTS_DEPTH || typeof node !== 'object' || node === null) {
    return false;
  }
  if (Array.isArray(node)) {
    // Fallback arrays (`["./a.js", { "types": … }]`).
    for (const entry of node) {
      budget.remainingKeys -= 1;
      if (budget.remainingKeys < 0) {
        return false;
      }
      if (hasTypesCondition(entry, depth + 1, budget)) {
        return true;
      }
    }
    return false;
  }
  const conditions = node as Record<string, unknown>;
  for (const key of Object.keys(conditions)) {
    budget.remainingKeys -= 1;
    if (budget.remainingKeys < 0) {
      return false;
    }
    const value = conditions[key];
    if (key === 'types' && (typeof value === 'string' || isJsonObject(value))) {
      return true;
    }
    if (hasTypesCondition(value, depth + 1, budget)) {
      return true;
    }
  }
  return false;
}

/** Project npm latest metadata into its version, license, and TypeScript declarations flag. */
function projectNpmLatest(data: unknown): NpmLatestProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const hasTopLevelTypes = Boolean(data.types) || Boolean(data.typings);
  return {
    hasTypes:
      hasTopLevelTypes || hasTypesCondition(data.exports, 0, { remainingKeys: MAX_EXPORTS_KEYS }),
    license: readLicenseName(data.license),
    version: readText(data.version),
  };
}

/** Create an npm Downloads API endpoint for a period (`last-week`, `last-month`, `last-year`). */
function createNpmDownloadsEndpoint(period: string): MetricEndpoint<Partial<NpmDownloadsPayload>> {
  return createEndpoint({
    api: `https://api.npmjs.org/downloads/point/${period}/{npm}`,
    page: 'https://www.npmjs.com/package/{npm}',
    project: DOWNLOADS_PROJECTION,
  });
}

/** npm Registry latest version metadata endpoint. */
const NPM_LATEST_ENDPOINT = createEndpoint({
  api: 'https://registry.npmjs.org/{npm}/latest',
  page: 'https://www.npmjs.com/package/{npm}',
  project: projectNpmLatest,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** npm Registry service preset (`npm`). */
export const NPM_SERVICE = defineService({
  docs: {
    description:
      'Version, weekly/monthly/yearly downloads (dw/dl/dy), license, and bundled TS types.',
    title: 'npm',
  },
  // `dt` reported the last-year downloads before the download keys were normalized.
  metricAliases: { dt: 'dy' },
  metrics: {
    dl: createDownloadsMetric(
      createNpmDownloadsEndpoint('last-month'),
      'dl',
      (stats) => stats.downloads
    ),
    dw: createDownloadsMetric(
      createNpmDownloadsEndpoint('last-week'),
      'dw',
      (stats) => stats.downloads
    ),
    dy: createDownloadsMetric(
      createNpmDownloadsEndpoint('last-year'),
      'dy',
      (stats) => stats.downloads
    ),
    license: createLicenseMetric(NPM_LATEST_ENDPOINT, (latest) => latest.license),
    types: createMetric(
      NPM_LATEST_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'ts', defaultLabel: 'types' },
      (latest) => ({ value: latest.hasTypes ? 'included' : 'none' })
    ),
    v: createVersionMetric(
      NPM_LATEST_ENDPOINT,
      { defaultColor: 'rose', defaultIcon: 'npm', defaultLabel: 'npm' },
      (latest) => latest.version
    ),
  },
  route: NPM_PACKAGE_ROUTE,
});
