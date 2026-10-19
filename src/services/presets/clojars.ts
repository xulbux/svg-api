/**
 * Clojars service preset – Clojure artifact version, total downloads, and license (`/badge/clojars/[:group/]:artifact/:metric`).
 *
 * The group segment may be omitted for artifacts whose group equals the artifact name (e.g., `hiccup`).
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import {
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** License declared by a Clojars artifact. */
interface ClojarsLicense {
  /** License display name (e.g., `'Eclipse Public License'`). */
  name?: string;
}

/** Partial Clojars artifact API payload (`clojars.org/api/artifacts/[:group/]:artifact`). */
interface ClojarsArtifactPayload {
  /** All-time downloads of every version. */
  downloads: number;
  /** Latest non-snapshot release, or `null` when only snapshots exist. */
  latest_release: string | null;
  /** Latest version including snapshots. */
  latest_version: string;
  /** Declared licenses. */
  licenses: ClojarsLicense[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Clojars artifact endpoint (`{path}` omits an empty group) with clojars.org artifact page redirect. */
const CLOJARS_ENDPOINT = createEndpoint({
  api: 'https://clojars.org/api/artifacts/{path}',
  page: 'https://clojars.org/{path}',
  project: pickFields<ClojarsArtifactPayload>([
    'downloads',
    'latest_release',
    'latest_version',
    'licenses',
  ]),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Clojars service preset (`clojars`). */
export const CLOJARS_SERVICE = defineService({
  docs: {
    description:
      'Latest release, total downloads, and license (omit the group when it equals the artifact).',
    title: 'Clojars',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: createDownloadsMetric(CLOJARS_ENDPOINT, 'dt', (artifact) => artifact.downloads),
    license: createLicenseMetric(CLOJARS_ENDPOINT, (artifact) =>
      Array.isArray(artifact.licenses) ? artifact.licenses[0]?.name : undefined
    ),
    v: createVersionMetric(
      CLOJARS_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'clojure', defaultLabel: 'clojars' },
      (artifact) => artifact.latest_release ?? artifact.latest_version
    ),
  },
  route: {
    owner: { isRequired: false, placeholder: ':group' },
    target: { placeholder: ':artifact' },
  },
});
