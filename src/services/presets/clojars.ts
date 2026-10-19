/**
 * Clojars service preset – Clojure artifact version, total downloads, and license (`/badge/clojars/[:group/]:artifact/:metric`).
 *
 * The group segment may be omitted for artifacts whose group equals the artifact name (e.g., `hiccup`).
 */

import {
  createCountTransform,
  createLicenseTransform,
  createVersionTransform,
  LICENSE,
  TOTAL_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Clojars artifact API payload (`clojars.org/api/artifacts/[:group/]:artifact`). */
interface ClojarsArtifactPayload {
  /** All-time downloads of every version. */
  downloads: number;
  /** Latest non-snapshot release, or `null` when only snapshots exist. */
  latest_release: string | null;
  /** Latest version including snapshots. */
  latest_version: string;
  /** Declared licenses. */
  licenses: {
    /** License display name (e.g., `'Eclipse Public License'`). */
    name?: string;
  }[];
}

// -------------------------------------- INTERNALS --------------------------------------

/** Build the `[:group/]:artifact` coordinate path (the group is omitted when empty). */
function buildClojarsPath(group: string, artifact: string): string {
  return group ? `${group}/${artifact}` : artifact;
}

/** Clojars artifact endpoint with clojars.org artifact page redirect. */
const CLOJARS_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (group: string, artifact: string): string =>
    `https://clojars.org/api/artifacts/${buildClojarsPath(group, artifact)}`,
  buildRedirectUrl: (group: string, artifact: string): string =>
    `https://clojars.org/${buildClojarsPath(group, artifact)}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Clojars service preset (`clojars`). */
export const CLOJARS_SERVICE: ServiceDefinition = {
  docs: {
    description:
      'Latest release, total downloads, and license (omit the group when it equals the artifact).',
    ownerName: ':group',
    targetName: ':artifact',
    title: 'Clojars',
  },
  metricAliases: { dl: 'dt', l: 'license' },
  metrics: {
    dt: {
      ...CLOJARS_ENDPOINT,
      ...TOTAL_DOWNLOADS,
      transform: createCountTransform<ClojarsArtifactPayload>((payload) => payload.downloads),
    },
    license: {
      ...CLOJARS_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<ClojarsArtifactPayload>(
        (payload) => payload.licenses?.[0]?.name
      ),
    },
    v: {
      ...CLOJARS_ENDPOINT,
      defaultColor: 'blue',
      defaultIcon: 'clojure',
      defaultLabel: 'clojars',
      transform: createVersionTransform<ClojarsArtifactPayload>(
        (payload) => payload.latest_release ?? payload.latest_version
      ),
    },
  },
  ownerMode: 'optional',
};
