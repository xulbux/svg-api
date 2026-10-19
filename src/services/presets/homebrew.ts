/**
 * Homebrew service presets – Formula and cask version, license, and 30/90/365-day install analytics (`/badge/brew/:formula/:metric`, `/badge/cask/:cask/:metric`).
 *
 * Install counts sum every analytics key of a period, so option variants (e.g., `wget --HEAD`)
 * count towards the formula total. Names containing `+` must be percent-encoded in the badge path
 * (`gtk%2B3`), because a literal `+` in a path segment decodes to a space.
 */

import { CACHE_TTL, createEndpoint, defineService, pickFields } from '@/services/endpoint';
import {
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
} from '@/services/metrics';
import type { MetricEndpoint, MetricPresentation, ServiceMetricConfig } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Install analytics period keys of the Homebrew formulae API. */
type HomebrewAnalyticsPeriod = '30d' | '90d' | '365d';

/** Homebrew install analytics of a formula or cask. */
interface HomebrewAnalytics {
  /** Install counts per period, keyed by formula/cask name and option variant (e.g., `'wget --HEAD'`). */
  install?: Partial<Record<HomebrewAnalyticsPeriod, Record<string, unknown>>>;
}

/** Homebrew install analytics block shared by formula and cask payloads. */
interface HomebrewAnalyticsPayload {
  /** Install analytics. */
  analytics: HomebrewAnalytics | null;
}

/** Version metadata of a Homebrew formula. */
interface HomebrewFormulaVersions {
  /** Latest stable version. */
  stable?: string;
}

/** Partial Homebrew formula API payload (`formulae.brew.sh/api/formula/:formula.json`). */
interface HomebrewFormulaPayload extends HomebrewAnalyticsPayload {
  /** SPDX license expression. */
  license: string | null;
  /** Version metadata. */
  versions: HomebrewFormulaVersions | null;
}

/** Partial Homebrew cask API payload (`formulae.brew.sh/api/cask/:cask.json`). */
interface HomebrewCaskPayload extends HomebrewAnalyticsPayload {
  /** Latest cask version. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Shared presentation of the Homebrew version badges. */
const HOMEBREW_VERSION: MetricPresentation = {
  defaultColor: 'amber',
  defaultIcon: 'homebrew',
  defaultLabel: 'homebrew',
};

/** Presentation override of the install metrics. */
const INSTALLS_LABEL = { defaultLabel: 'installs' } as const;

/** Homebrew formula endpoint (analytics refresh daily). */
const FORMULA_ENDPOINT = createEndpoint({
  api: 'https://formulae.brew.sh/api/formula/{target}.json',
  page: 'https://formulae.brew.sh/formula/{target}',
  project: pickFields<HomebrewFormulaPayload>(['analytics', 'license', 'versions']),
  ttl: CACHE_TTL.daily,
});

/** Homebrew cask endpoint (analytics refresh daily). */
const CASK_ENDPOINT = createEndpoint({
  api: 'https://formulae.brew.sh/api/cask/{target}.json',
  page: 'https://formulae.brew.sh/cask/{target}',
  project: pickFields<HomebrewCaskPayload>(['analytics', 'version']),
  ttl: CACHE_TTL.daily,
});

/** Docs note on the install metric keys. */
const INSTALLS_DOCS = '30/90/365-day installs (dl/dq/dy)';

// -------------------------------------- INTERNALS --------------------------------------

/** Sum every install count of an analytics period (all option variants), or `undefined` when missing. */
function sumInstalls(
  payload: Partial<HomebrewAnalyticsPayload>,
  period: HomebrewAnalyticsPeriod
): number | undefined {
  const counts = payload.analytics?.install?.[period];
  if (!counts || typeof counts !== 'object') {
    return undefined;
  }
  let total = 0;
  for (const count of Object.values(counts)) {
    total += typeof count === 'number' && Number.isFinite(count) ? count : 0;
  }
  return total;
}

/** Create the 30/90/365-day install metrics of a Homebrew endpoint. */
function createInstallMetrics<P extends Partial<HomebrewAnalyticsPayload>>(
  endpoint: MetricEndpoint<P>
): Record<'dl' | 'dq' | 'dy', ServiceMetricConfig> {
  return {
    dl: createDownloadsMetric(
      endpoint,
      'dl',
      (payload) => sumInstalls(payload, '30d'),
      INSTALLS_LABEL
    ),
    dq: createDownloadsMetric(
      endpoint,
      'dq',
      (payload) => sumInstalls(payload, '90d'),
      INSTALLS_LABEL
    ),
    dy: createDownloadsMetric(
      endpoint,
      'dy',
      (payload) => sumInstalls(payload, '365d'),
      INSTALLS_LABEL
    ),
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Homebrew formula service preset (`brew`). */
export const HOMEBREW_FORMULA_SERVICE = defineService({
  docs: {
    description: `Formula version, license, and ${INSTALLS_DOCS}; Encode + as %2B.`,
    title: 'Homebrew',
  },
  // `dt` reported the 365-day installs before the download keys were normalized.
  metricAliases: { dt: 'dy' },
  metrics: {
    ...createInstallMetrics(FORMULA_ENDPOINT),
    license: createLicenseMetric(FORMULA_ENDPOINT, (formula) => formula.license),
    v: createVersionMetric(
      FORMULA_ENDPOINT,
      HOMEBREW_VERSION,
      (formula) => formula.versions?.stable
    ),
  },
  route: { target: { placeholder: ':formula' } },
});

/** Homebrew cask service preset (`cask`). */
export const HOMEBREW_CASK_SERVICE = defineService({
  docs: { description: `Cask version and ${INSTALLS_DOCS}.`, title: 'Homebrew Cask' },
  // `dt` reported the 365-day installs before the download keys were normalized.
  metricAliases: { dt: 'dy' },
  metrics: {
    ...createInstallMetrics(CASK_ENDPOINT),
    v: createVersionMetric(
      CASK_ENDPOINT,
      { ...HOMEBREW_VERSION, defaultLabel: 'homebrew cask' },
      (cask) => cask.version
    ),
  },
  route: { target: { placeholder: ':cask' } },
});
