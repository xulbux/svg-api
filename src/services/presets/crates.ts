/**
 * crates.io service preset – Rust crate version, total/90-day downloads, and license (`/badge/crates/:crate/:metric`).
 */

import {
  createCountTransform,
  createLicenseTransform,
  createVersionTransform,
  LICENSE,
  RECENT_DOWNLOADS,
  TOTAL_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial crates.io crate metadata API payload (`crates.io/api/v1/crates/:crate`). */
interface CratesIoPayload {
  /** Crate summary object. */
  crate: {
    /** Total all-time downloads. */
    downloads?: number;
    /** Latest stable version string. */
    max_stable_version?: string | null;
    /** Highest published version string. */
    max_version?: string;
    /** Downloads in the last 90 days. */
    recent_downloads?: number;
  };
  /** Published versions (newest first). */
  versions: {
    /** SPDX license expression for the version. */
    license?: string | null;
  }[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** crates.io crate metadata endpoint with crate page redirect. */
const CRATES_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, crate: string): string =>
    `https://crates.io/api/v1/crates/${crate}`,
  buildRedirectUrl: (_owner: string, crate: string): string => `https://crates.io/crates/${crate}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** crates.io service preset (`crates`). */
export const CRATES_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Latest stable version, total/90-day downloads, and license.',
    targetName: ':crate',
    title: 'crates.io',
  },
  metricAliases: { l: 'license' },
  metrics: {
    dl: {
      ...CRATES_ENDPOINT,
      ...RECENT_DOWNLOADS,
      transform: createCountTransform<CratesIoPayload>(
        (payload) => payload.crate?.recent_downloads,
        '/90d'
      ),
    },
    dt: {
      ...CRATES_ENDPOINT,
      ...TOTAL_DOWNLOADS,
      transform: createCountTransform<CratesIoPayload>((payload) => payload.crate?.downloads),
    },
    license: {
      ...CRATES_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<CratesIoPayload>(
        (payload) => payload.versions?.[0]?.license
      ),
    },
    v: {
      ...CRATES_ENDPOINT,
      defaultColor: 'orange',
      defaultIcon: 'rust',
      defaultLabel: 'crates.io',
      transform: createVersionTransform<CratesIoPayload>(
        (payload) => payload.crate?.max_stable_version || payload.crate?.max_version
      ),
    },
  },
  ownerMode: 'none',
};
