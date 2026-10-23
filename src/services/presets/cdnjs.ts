/**
 * cdnjs service preset – Live upstream metrics and redirect transformations.
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createLicenseMetric, createVersionMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial cdnjs library metadata payload (`api.cdnjs.com/libraries/:pkg?fields=version,license`). */
interface CdnjsLibraryPayload {
  /** SPDX license identifier or short license name. */
  license: string | null;
  /** Latest hosted library version. */
  version: string | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** cdnjs library endpoint (`fields=version,license` trims the response to ~35 bytes). */
const CDNJS_ENDPOINT = createEndpoint({
  api: 'https://api.cdnjs.com/libraries/{target}?fields=version,license',
  page: 'https://cdnjs.com/libraries/{target}',
  project: pickFields<CdnjsLibraryPayload>(['license', 'version']),
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
  route: { target: { placeholder: ':pkg' } },
});
