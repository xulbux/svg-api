/**
 * Homebrew service presets – Formula and cask version, license, and 30/90/365-day install analytics (`/badge/brew/:formula/:metric`, `/badge/cask/:cask/:metric`).
 *
 * Install counts sum every analytics key of a period, so option variants (e.g., `wget --HEAD`)
 * count towards the formula total. Names containing `+` must be percent-encoded in the badge path
 * (`gtk%2B3`), because a literal `+` in a path segment decodes to a space.
 */

import { CACHE_TTL, createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  DELTA_SPECIALS,
  INSTALLS_LABEL,
  buildWindowDeltaSpecials,
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
  readText,
} from '@/services/metrics';
import type { MetricEndpoint, MetricPresentation, ServiceMetricConfig } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Install analytics period keys of the Homebrew formulae API. */
type HomebrewAnalyticsPeriod = '30d' | '90d' | '365d';

/** Projected Homebrew formula or cask metadata (`formulae.brew.sh/api/{formula|cask}/:name.json`). */
interface HomebrewProjection {
  /** 30-day install count across all option variants. */
  dl?: number;
  /** 90-day install count across all option variants. */
  dq?: number;
  /** 365-day install count across all option variants. */
  dy?: number;
  /** SPDX license expression (formulae only). */
  license?: string;
  /** Latest stable version. */
  version?: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Shared presentation of the Homebrew version badges. */
const HOMEBREW_VERSION: MetricPresentation = {
  defaultColor: 'amber',
  defaultIcon: 'homebrew',
  defaultLabel: 'Homebrew',
};

/** Docs note on the install metric keys. */
const INSTALLS_DOCS = '30/90/365-day installs (dl/dq/dy)';

/** Top-level Homebrew JSON keys needed for version, license, and install analytics. */
const HOMEBREW_EXTRACT_KEYS = ['analytics', 'license', 'version', 'versions'] as const;

// -------------------------------------- INTERNALS --------------------------------------

/** Sum every install count of an analytics period (all option variants), or `undefined` when missing. */
function sumInstalls(
  install: Record<string, unknown> | undefined,
  period: HomebrewAnalyticsPeriod
): number | undefined {
  const counts = install ? install[period] : undefined;
  if (!isJsonObject(counts)) {
    return undefined;
  }
  let total = 0;
  for (const count of Object.values(counts)) {
    total += typeof count === 'number' && Number.isFinite(count) ? count : 0;
  }
  return total;
}

/** Project a Homebrew formula or cask payload to its summed install counts, version, and optional license. */
function projectHomebrewPayload(data: unknown): HomebrewProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const analytics = isJsonObject(data.analytics) ? data.analytics : undefined;
  const install = isJsonObject(analytics?.install) ? analytics.install : undefined;
  const versions = isJsonObject(data.versions) ? data.versions : undefined;
  return {
    dl: sumInstalls(install, '30d'),
    dq: sumInstalls(install, '90d'),
    dy: sumInstalls(install, '365d'),
    license: readText(data.license),
    version: readText(versions?.stable) ?? readText(data.version),
  };
}

/** Homebrew formula endpoint (analytics refresh daily). */
const FORMULA_ENDPOINT = createEndpoint({
  api: 'https://formulae.brew.sh/api/formula/{target}.json',
  extractKeys: HOMEBREW_EXTRACT_KEYS,
  page: 'https://formulae.brew.sh/formula/{target}',
  project: projectHomebrewPayload,
  ttl: CACHE_TTL.daily,
});

/** Homebrew cask endpoint (analytics refresh daily). */
const CASK_ENDPOINT = createEndpoint({
  api: 'https://formulae.brew.sh/api/cask/{target}.json',
  extractKeys: HOMEBREW_EXTRACT_KEYS,
  page: 'https://formulae.brew.sh/cask/{target}',
  project: projectHomebrewPayload,
  ttl: CACHE_TTL.daily,
});

/** Create the 30/90/365-day install metrics of a Homebrew endpoint. */
function createInstallMetrics(
  endpoint: MetricEndpoint<HomebrewProjection>
): Record<'dl' | 'dq' | 'dy', ServiceMetricConfig> {
  const deltaOverrides = { ...INSTALLS_LABEL, autoSpecials: DELTA_SPECIALS };
  return {
    dl: createDownloadsMetric(
      endpoint,
      'dl',
      (payload) => payload.dl,
      deltaOverrides,
      (payload) => buildWindowDeltaSpecials(payload.dl, 30, payload.dq, 90)
    ),
    dq: createDownloadsMetric(
      endpoint,
      'dq',
      (payload) => payload.dq,
      deltaOverrides,
      (payload) => buildWindowDeltaSpecials(payload.dq, 90, payload.dy, 365)
    ),
    dy: createDownloadsMetric(endpoint, 'dy', (payload) => payload.dy, INSTALLS_LABEL),
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Homebrew formula service preset (`brew`). */
export const HOMEBREW_FORMULA_SERVICE = defineService({
  docs: {
    description: `Formula version, license, and ${INSTALLS_DOCS}; Encode + as %2B.`,
    title: 'Homebrew',
  },
  // `dt` reported the 365-day installs before the download keys were normalized:
  metricAliases: { dt: 'dy' },
  metrics: {
    ...createInstallMetrics(FORMULA_ENDPOINT),
    license: createLicenseMetric(FORMULA_ENDPOINT, (formula) => formula.license),
    v: createVersionMetric(FORMULA_ENDPOINT, HOMEBREW_VERSION, (formula) => formula.version),
  },
  route: { target: { placeholder: ':formula' } },
});

/** Homebrew cask service preset (`cask`). */
export const HOMEBREW_CASK_SERVICE = defineService({
  docs: { description: `Cask version and ${INSTALLS_DOCS}.`, title: 'Homebrew Cask' },
  // `dt` reported the 365-day installs before the download keys were normalized:
  metricAliases: { dt: 'dy' },
  metrics: {
    ...createInstallMetrics(CASK_ENDPOINT),
    v: createVersionMetric(
      CASK_ENDPOINT,
      { ...HOMEBREW_VERSION, defaultLabel: 'Homebrew Cask' },
      (cask) => cask.version
    ),
  },
  route: { target: { placeholder: ':cask' } },
});
