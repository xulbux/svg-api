/**
 * Homebrew service presets – Formula and cask version, license, and 30/90/365-day install analytics (`/badge/brew/:formula/:metric`, `/badge/cask/:cask/:metric`).
 *
 * Install counts sum every analytics key of a period, so option variants (e.g., `wget --HEAD`)
 * count towards the formula total. Names containing `+` must be percent-encoded in the badge path
 * (`gtk%2B3`), because a literal `+` in a path segment decodes to a space.
 */

import {
  createCountTransform,
  createLicenseTransform,
  createVersionTransform,
  LICENSE,
  RECENT_DOWNLOADS,
  TOTAL_DOWNLOADS,
} from '@/services/metrics';
import type {
  MetricEndpoint,
  MetricPresentation,
  ServiceDefinition,
  ServiceMetricConfig,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Install analytics period keys of the Homebrew formulae API. */
type HomebrewAnalyticsPeriod = '30d' | '90d' | '365d';

/** Homebrew install analytics block shared by formula and cask payloads. */
interface HomebrewAnalyticsPayload {
  /** Install analytics. */
  analytics: {
    /** Install counts per period, keyed by formula/cask name and option variant (e.g., `'wget --HEAD'`). */
    install?: Partial<Record<HomebrewAnalyticsPeriod, Record<string, number>>>;
  };
}

/** Partial Homebrew formula API payload (`formulae.brew.sh/api/formula/:formula.json`). */
interface HomebrewFormulaPayload extends HomebrewAnalyticsPayload {
  /** SPDX license expression. */
  license: string | null;
  /** Version metadata. */
  versions: {
    /** Latest stable version. */
    stable?: string;
  };
}

/** Partial Homebrew cask API payload (`formulae.brew.sh/api/cask/:cask.json`). */
interface HomebrewCaskPayload extends HomebrewAnalyticsPayload {
  /** Latest cask version. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Tier-1 JSON cache TTL in seconds (Homebrew analytics refresh daily). */
const HOMEBREW_CACHE_TTL_SECONDS = 3600;

/** Shared presentation of the Homebrew version badges. */
const HOMEBREW_VERSION: MetricPresentation = {
  defaultColor: 'amber',
  defaultIcon: 'homebrew',
  defaultLabel: 'homebrew',
};

// -------------------------------------- INTERNALS --------------------------------------

/** Create a Homebrew formulae API endpoint for a package kind (`formula` or `cask`). */
function createHomebrewEndpoint(kind: 'cask' | 'formula'): MetricEndpoint {
  return {
    buildApiUrl: (_owner: string, name: string): string =>
      `https://formulae.brew.sh/api/${kind}/${encodeURIComponent(name)}.json`,
    buildRedirectUrl: (_owner: string, name: string): string =>
      `https://formulae.brew.sh/${kind}/${name}`,
    cacheTtlSeconds: HOMEBREW_CACHE_TTL_SECONDS,
  };
}

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
    total += typeof count === 'number' ? count : 0;
  }
  return total;
}

/** Create the 30/90/365-day install metrics of a Homebrew endpoint. */
function createHomebrewInstallMetrics(
  endpoint: MetricEndpoint
): Record<'dl' | 'dq' | 'dt', ServiceMetricConfig> {
  return {
    dl: {
      ...endpoint,
      ...RECENT_DOWNLOADS,
      defaultLabel: 'installs',
      transform: createCountTransform<HomebrewAnalyticsPayload>(
        (payload) => sumInstalls(payload, '30d'),
        '/mo'
      ),
    },
    dq: {
      ...endpoint,
      ...RECENT_DOWNLOADS,
      defaultColor: 'sky',
      defaultLabel: 'installs',
      transform: createCountTransform<HomebrewAnalyticsPayload>(
        (payload) => sumInstalls(payload, '90d'),
        '/90d'
      ),
    },
    dt: {
      ...endpoint,
      ...TOTAL_DOWNLOADS,
      defaultLabel: 'installs',
      transform: createCountTransform<HomebrewAnalyticsPayload>(
        (payload) => sumInstalls(payload, '365d'),
        '/yr'
      ),
    },
  };
}

/** Homebrew formula endpoint. */
const FORMULA_ENDPOINT = createHomebrewEndpoint('formula');

/** Homebrew cask endpoint. */
const CASK_ENDPOINT = createHomebrewEndpoint('cask');

// -------------------------------------- PUBLIC API -------------------------------------

/** Homebrew formula service preset (`brew`). */
export const HOMEBREW_FORMULA_SERVICE: ServiceDefinition = {
  docs: {
    description:
      'Formula version, license, and 30/90/365-day installs (dl/dq/dt; encode + as %2B).',
    targetName: ':formula',
    title: 'Homebrew',
  },
  metricAliases: { dm: 'dl', dy: 'dt', l: 'license' },
  metrics: {
    ...createHomebrewInstallMetrics(FORMULA_ENDPOINT),
    license: {
      ...FORMULA_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<HomebrewFormulaPayload>((payload) => payload.license),
    },
    v: {
      ...FORMULA_ENDPOINT,
      ...HOMEBREW_VERSION,
      transform: createVersionTransform<HomebrewFormulaPayload>(
        (payload) => payload.versions?.stable
      ),
    },
  },
  ownerMode: 'none',
};

/** Homebrew cask service preset (`cask`). */
export const HOMEBREW_CASK_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Cask version and 30/90/365-day installs (dl/dq/dt).',
    targetName: ':cask',
    title: 'Homebrew Cask',
  },
  metricAliases: { dm: 'dl', dy: 'dt' },
  metrics: {
    ...createHomebrewInstallMetrics(CASK_ENDPOINT),
    v: {
      ...CASK_ENDPOINT,
      ...HOMEBREW_VERSION,
      defaultLabel: 'homebrew cask',
      transform: createVersionTransform<HomebrewCaskPayload>((payload) => payload.version),
    },
  },
  ownerMode: 'none',
};
