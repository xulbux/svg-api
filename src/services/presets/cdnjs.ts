/**
 * cdnjs Service Preset
 *
 * Live upstream metrics and redirect transformations for cdnjs.
 */

import { PACKAGE_ROUTE, createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import { createLicenseMetric, createVersionMetric, readText } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected cdnjs library metadata (`api.cdnjs.com/libraries/:pkg?fields=version,license`). */
interface CdnjsLibraryProjection {
  /** SPDX license identifier or short license name. */
  license?: string;
  /** Latest hosted library version. */
  version?: string;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Project cdnjs library metadata, reporting empty `{}` HTTP `200` responses as not found. */
function projectCdnjsLibrary(data: unknown): CdnjsLibraryProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const license = readText(data.license);
  const version = readText(data.version);
  return license !== undefined || version !== undefined ? { license, version } : undefined;
}

/** cdnjs library endpoint (`fields=version,license` trims the response to ~35 bytes). */
const CDNJS_ENDPOINT = createEndpoint({
  api: 'https://api.cdnjs.com/libraries/{target}?fields=version,license',
  extractKeys: ['license', 'version'],
  page: 'https://cdnjs.com/libraries/{target}',
  project: projectCdnjsLibrary,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** cdnjs library service preset (`cdnjs`). */
export const CDNJS_SERVICE = defineService({
  docs: {
    description: 'Latest hosted version and license of any library on cdnjs.',
    title: 'cdnjs',
  },
  metrics: {
    license: createLicenseMetric(CDNJS_ENDPOINT, (lib) => lib.license),
    v: createVersionMetric(
      CDNJS_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'cloudflare', defaultLabel: 'cdnjs' },
      (lib) => lib.version
    ),
  },
  route: PACKAGE_ROUTE,
});
