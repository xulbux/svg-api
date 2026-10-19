/**
 * npm service preset – Registry version, license, TypeScript types, and download counts for unscoped and scoped packages (`/badge/npm/[:scope/]:pkg/:metric`).
 */

import {
  createCountTransform,
  createLicenseTransform,
  createVersionTransform,
  LICENSE,
  RECENT_DOWNLOADS,
  resolveNpmPackageName,
  TOTAL_DOWNLOADS,
  WEEKLY_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, MetricResult, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial npm Registry latest version metadata payload (`registry.npmjs.org/:pkg/latest`). */
interface NpmLatestPayload {
  /** SPDX license identifier or legacy license object. */
  license: string | { type?: string };
  /** Bundled TypeScript `.d.ts` entrypoint. */
  types: string;
  /** Legacy TypeScript `.d.ts` entrypoint. */
  typings: string;
  /** Latest published npm version. */
  version: string;
}

/** Partial npm Downloads API payload (`api.npmjs.org/downloads/point/:period/:pkg`). */
interface NpmDownloadsPayload {
  /** Total downloads in the requested period. */
  downloads: number;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Build the npm package page redirect URL. */
function buildNpmRedirectUrl(scope: string, pkg: string): string {
  return `https://www.npmjs.com/package/${resolveNpmPackageName(scope, pkg)}`;
}

/** Create an npm Downloads API endpoint for a period (`last-week`, `last-month`, `last-year`). */
function createNpmDownloadsEndpoint(period: string): MetricEndpoint {
  return {
    buildApiUrl: (scope: string, pkg: string): string =>
      `https://api.npmjs.org/downloads/point/${period}/${resolveNpmPackageName(scope, pkg)}`,
    buildRedirectUrl: buildNpmRedirectUrl,
  };
}

/** Transform npm latest metadata into a TypeScript definitions indicator. */
function transformNpmTypes(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as Partial<NpmLatestPayload>;
  return { value: payload.types || payload.typings ? 'included' : 'none' };
}

/** npm Registry latest version metadata endpoint. */
const NPM_LATEST_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (scope: string, pkg: string): string =>
    `https://registry.npmjs.org/${resolveNpmPackageName(scope, pkg)}/latest`,
  buildRedirectUrl: buildNpmRedirectUrl,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** npm Registry service preset (`npm`). */
export const NPM_SERVICE: ServiceDefinition = {
  docs: {
    description:
      'Version, weekly/monthly downloads, last-year downloads (dt), license, and bundled TS types.',
    ownerName: ':scope',
    targetName: ':pkg',
    title: 'npm',
  },
  metricAliases: { dm: 'dl', dy: 'dt', l: 'license' },
  metrics: {
    dl: {
      ...createNpmDownloadsEndpoint('last-month'),
      ...RECENT_DOWNLOADS,
      transform: createCountTransform<NpmDownloadsPayload>((payload) => payload.downloads, '/mo'),
    },
    dt: {
      ...createNpmDownloadsEndpoint('last-year'),
      ...TOTAL_DOWNLOADS,
      transform: createCountTransform<NpmDownloadsPayload>((payload) => payload.downloads, '/yr'),
    },
    dw: {
      ...createNpmDownloadsEndpoint('last-week'),
      ...WEEKLY_DOWNLOADS,
      transform: createCountTransform<NpmDownloadsPayload>((payload) => payload.downloads, '/wk'),
    },
    license: {
      ...NPM_LATEST_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<NpmLatestPayload>((payload) =>
        typeof payload.license === 'string' ? payload.license : payload.license?.type
      ),
    },
    types: {
      ...NPM_LATEST_ENDPOINT,
      defaultColor: 'blue',
      defaultIcon: 'ts',
      defaultLabel: 'types',
      transform: transformNpmTypes,
    },
    v: {
      ...NPM_LATEST_ENDPOINT,
      defaultColor: 'rose',
      defaultIcon: 'npm',
      defaultLabel: 'npm',
      transform: createVersionTransform<NpmLatestPayload>((payload) => payload.version),
    },
  },
  ownerMode: 'optional',
};
