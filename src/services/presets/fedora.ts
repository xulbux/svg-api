/**
 * Fedora service preset – Package version of a Fedora branch from mdapi (`/badge/fedora/[:branch/]:pkg/v`).
 *
 * The optional branch segment defaults to `rawhide` (e.g., `f43`, `epel10`); Mdapi answers unknown
 * packages and branches with `400`, which is reported as not found.
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { buildPackageVersion, createVersionMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial mdapi package payload (`mdapi.fedoraproject.org/:branch/pkg/:pkg`). */
interface FedoraPackagePayload {
  /** Package epoch as a numeric string (`'0'` when unset). */
  epoch: string;
  /** Package release including the dist tag (e.g., `'1.fc46'`). */
  release: string;
  /** Upstream version (e.g., `'3.15.0'`). */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Fedora branch of routes without a branch segment. */
const DEFAULT_FEDORA_BRANCH = 'rawhide';

/** mdapi package endpoint (`400` is not found) with Fedora Packages search redirect (subpackages have no own page). */
const FEDORA_ENDPOINT = createEndpoint({
  api: 'https://mdapi.fedoraproject.org/{owner}/pkg/{target}',
  missingStatuses: [400],
  page: 'https://packages.fedoraproject.org/search?query={target}',
  project: pickFields<FedoraPackagePayload>(['epoch', 'release', 'version']),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve the default Fedora branch (`rawhide`). */
function resolveDefaultFedoraBranch(): string {
  return DEFAULT_FEDORA_BRANCH;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Fedora service preset (`fedora`). */
export const FEDORA_SERVICE = defineService({
  docs: {
    description: 'Package version-release of a branch (omit :branch for rawhide, e.g., f43).',
    title: 'Fedora',
  },
  metrics: {
    v: createVersionMetric(
      FEDORA_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'fedora', defaultLabel: 'Fedora' },
      (pkg) => buildPackageVersion(pkg.epoch, pkg.version, pkg.release)
    ),
  },
  route: {
    owner: {
      isRequired: false,
      placeholder: ':branch',
      resolveDefault: resolveDefaultFedoraBranch,
    },
    target: { placeholder: ':pkg' },
  },
});
