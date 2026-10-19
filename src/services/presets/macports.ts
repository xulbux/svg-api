/**
 * MacPorts service preset – Port version and license (`/badge/macports/:port/:metric`).
 *
 * The port API has no field filter (popular ports list their dependents, `~10-35 KB`) and cold
 * lookups are slow, so the projected version and license are cached for an hour.
 */

import { CACHE_TTL, createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createLicenseMetric, createVersionMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial MacPorts port payload (`ports.macports.org/api/v1/ports/:port/`). */
interface MacPortsPortPayload {
  /** License expression (e.g., `'PSF'`, `'(GPL-2+ or Artistic-1) and BSD'`). */
  license: string;
  /** Port version (e.g., `'3.12.15'`). */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** MacPorts port endpoint (a missing port is a `404`) with port page redirect. */
const MACPORTS_ENDPOINT = createEndpoint({
  api: 'https://ports.macports.org/api/v1/ports/{target}/',
  page: 'https://ports.macports.org/port/{target}/',
  project: pickFields<MacPortsPortPayload>(['license', 'version']),
  ttl: CACHE_TTL.daily,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** MacPorts service preset (`macports`). */
export const MACPORTS_SERVICE = defineService({
  docs: { description: 'Port version and license.', title: 'MacPorts' },
  metrics: {
    license: createLicenseMetric(MACPORTS_ENDPOINT, (port) => port.license),
    v: createVersionMetric(
      MACPORTS_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'macports', defaultLabel: 'macports' },
      (port) => port.version
    ),
  },
  route: { target: { placeholder: ':port' } },
});
