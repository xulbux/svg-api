/**
 * CTAN service preset – TeX/LaTeX package version and license from the Comprehensive TeX Archive Network (`/badge/ctan/:pkg/:metric`).
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  createLicenseMetric,
  createVersionMetric,
  formatSpdxKey,
  readLicenseName,
  readText,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected CTAN package metadata (`ctan.org/json/2.0/pkg/:pkg`). */
interface CtanPackageProjection {
  /** Formatted CTAN license identifier (e.g., `'LPPL-1.3c'`). */
  license?: string;
  /** Published package version number (e.g., `'3.1.12'`). */
  version?: string;
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a compact CTAN license key with an attached version suffix (`lppl1.3c`, `gpl2+`). */
const CTAN_VERSIONED_LICENSE_RX = /^(?<name>[a-z]+)(?<ver>\d.*)$/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Format a lowercase CTAN license key into a readable identifier (`'lppl1.3c'` -> `'LPPL-1.3c'`). */
function formatCtanLicense(rawKey: string | undefined): string | undefined {
  if (!rawKey) {
    return undefined;
  }
  const match = CTAN_VERSIONED_LICENSE_RX.exec(rawKey.trim());
  if (match?.groups?.name && match.groups.ver) {
    return `${formatSpdxKey(match.groups.name) ?? match.groups.name}-${match.groups.ver}`;
  }
  return formatSpdxKey(rawKey);
}

/** Project a CTAN package document into its version number and primary license. */
function projectCtanPackage(data: unknown): CtanPackageProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const version = isJsonObject(data.version) ? data.version : undefined;
  return {
    license: formatCtanLicense(readLicenseName(data.license)),
    version: readText(version?.number),
  };
}

/** CTAN JSON 2.0 package endpoint with ctan.org package page redirect. */
const CTAN_ENDPOINT = createEndpoint({
  api: 'https://ctan.org/json/2.0/pkg/{target}',
  page: 'https://ctan.org/pkg/{target}',
  project: projectCtanPackage,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Comprehensive TeX Archive Network service preset (`ctan`). */
export const CTAN_SERVICE = defineService({
  docs: { description: 'TeX/LaTeX package version and license on CTAN.', title: 'CTAN' },
  metrics: {
    license: createLicenseMetric(CTAN_ENDPOINT, (pkg) => pkg.license),
    v: createVersionMetric(
      CTAN_ENDPOINT,
      { defaultColor: 'teal', defaultIcon: 'latex', defaultLabel: 'ctan' },
      (pkg) => pkg.version
    ),
  },
  route: { target: { placeholder: ':pkg' } },
});
