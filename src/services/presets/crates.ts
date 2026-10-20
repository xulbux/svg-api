/**
 * crates.io service preset – Rust crate version, MSRV, crate size, total/90-day downloads, and license (`/badge/crates/:crate/:metric`).
 *
 * `?include=default_version,downloads` shrinks the crate document from `~440 KB` (every version)
 * to `~3 KB` (only the default version, whose license, MSRV, and crate size are reported).
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  createBytesMetric,
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
  readFiniteNumber,
  readText,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected crates.io crate metadata (`crates.io/api/v1/crates/:crate?include=default_version,downloads`). */
interface CratesIoProjection {
  /** Default (latest stable, non-yanked) version string. */
  defaultVersion?: string;
  /** Total all-time downloads. */
  downloads?: number;
  /** SPDX license expression of the default version. */
  license?: string;
  /** Minimum supported Rust version (`rust_version`) of the default version. */
  msrv?: string;
  /** Downloads in the last 90 days. */
  recentDownloads?: number;
  /** Compressed `.crate` tarball size in bytes (`crate_size`) of the default version. */
  size?: number;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Find the version entry matching `defaultVersion` (or the first version entry as a fallback). */
function findDefaultVersionEntry(
  versions: unknown,
  defaultVersion: string | undefined
): Record<string, unknown> | undefined {
  if (!Array.isArray(versions)) {
    return undefined;
  }
  for (const candidate of versions) {
    if (isJsonObject(candidate) && candidate.num === defaultVersion) {
      return candidate;
    }
  }
  const [firstVersion] = versions;
  return isJsonObject(firstVersion) ? firstVersion : undefined;
}

/** Project a crates.io crate document to its summary counts and default version metadata. */
function projectCratesPayload(data: unknown): CratesIoProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const crate = isJsonObject(data.crate) ? data.crate : undefined;
  const defaultVersion =
    readText(crate?.default_version) ??
    readText(crate?.max_stable_version) ??
    readText(crate?.max_version) ??
    readText(crate?.newest_version);
  const matchedVersion = findDefaultVersionEntry(data.versions, defaultVersion);
  return {
    defaultVersion,
    downloads: readFiniteNumber(crate?.downloads),
    license: readText(matchedVersion?.license),
    msrv: readText(matchedVersion?.rust_version),
    recentDownloads: readFiniteNumber(crate?.recent_downloads),
    size: readFiniteNumber(matchedVersion?.crate_size),
  };
}

// ---------------------------------------- CONSTS ---------------------------------------

/** crates.io crate metadata endpoint (default version only) with crate page redirect. */
const CRATES_ENDPOINT = createEndpoint({
  api: 'https://crates.io/api/v1/crates/{target}?include=default_version,downloads',
  page: 'https://crates.io/crates/{target}',
  project: projectCratesPayload,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** crates.io service preset (`crates`). */
export const CRATES_SERVICE = defineService({
  docs: {
    description:
      'Default version, MSRV, crate size, total and 90-day downloads (dt/dq), and license.',
    title: 'crates.io',
  },
  // `dl` reported the 90-day downloads before the download keys were normalized.
  metricAliases: { dl: 'dq', rust: 'msrv' },
  metrics: {
    dq: createDownloadsMetric(CRATES_ENDPOINT, 'dq', (crate) => crate.recentDownloads),
    dt: createDownloadsMetric(CRATES_ENDPOINT, 'dt', (crate) => crate.downloads),
    license: createLicenseMetric(CRATES_ENDPOINT, (crate) => crate.license),
    msrv: createVersionMetric(
      CRATES_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'rust', defaultLabel: 'msrv' },
      (crate) => crate.msrv
    ),
    size: createBytesMetric(
      CRATES_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'weight', defaultLabel: 'crate size' },
      (crate) => crate.size
    ),
    v: createVersionMetric(
      CRATES_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'rust', defaultLabel: 'crates.io' },
      (crate) => crate.defaultVersion
    ),
  },
  route: { target: { placeholder: ':crate' } },
});
