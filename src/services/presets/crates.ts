/**
 * crates.io service preset – Rust crate version, total/90-day downloads, and license (`/badge/crates/:crate/:metric`).
 *
 * `?include=default_version,downloads` shrinks the crate document from `~440 KB` (every version)
 * to `~3 KB` (only the default version, whose license is reported).
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import {
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Crate summary object of the crates.io crate metadata API. */
interface CratesIoCrate {
  /** Default (latest stable, non-yanked) version string. */
  default_version?: string | null;
  /** Total all-time downloads. */
  downloads?: number;
  /** Downloads in the last 90 days. */
  recent_downloads?: number;
}

/** Version object included in the crates.io crate metadata API. */
interface CratesIoVersion {
  /** SPDX license expression for the version. */
  license?: string | null;
  /** Version string. */
  num?: string;
}

/** Partial crates.io crate metadata API payload (`crates.io/api/v1/crates/:crate?include=default_version,downloads`). */
interface CratesIoPayload {
  /** Crate summary object. */
  crate: CratesIoCrate | null;
  /** Included versions (only the default version). */
  versions: CratesIoVersion[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** crates.io crate metadata endpoint (default version only) with crate page redirect. */
const CRATES_ENDPOINT = createEndpoint({
  api: 'https://crates.io/api/v1/crates/{target}?include=default_version,downloads',
  page: 'https://crates.io/crates/{target}',
  project: pickFields<CratesIoPayload>(['crate', 'versions']),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Read the license of the crate's default version (falling back to the first included version). */
function readDefaultVersionLicense(payload: Partial<CratesIoPayload>): string | null | undefined {
  const { versions } = payload;
  if (!Array.isArray(versions)) {
    return undefined;
  }
  const defaultVersion = payload.crate?.default_version;
  for (const version of versions) {
    if (version?.num === defaultVersion) {
      return version.license;
    }
  }
  return versions[0]?.license;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** crates.io service preset (`crates`). */
export const CRATES_SERVICE = defineService({
  docs: {
    description: 'Default version, total and 90-day downloads (dt/dq), and license.',
    title: 'crates.io',
  },
  // `dl` reported the 90-day downloads before the download keys were normalized.
  metricAliases: { dl: 'dq' },
  metrics: {
    dq: createDownloadsMetric(CRATES_ENDPOINT, 'dq', (payload) => payload.crate?.recent_downloads),
    dt: createDownloadsMetric(CRATES_ENDPOINT, 'dt', (payload) => payload.crate?.downloads),
    license: createLicenseMetric(CRATES_ENDPOINT, readDefaultVersionLicense),
    v: createVersionMetric(
      CRATES_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'rust', defaultLabel: 'crates.io' },
      (payload) => payload.crate?.default_version
    ),
  },
  route: { target: { placeholder: ':crate' } },
});
