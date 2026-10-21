/**
 * Clojars service preset – Clojure artifact version, total downloads, and license (`/badge/clojars/[:group/]:artifact/:metric`).
 *
 * The group segment may be omitted for artifacts whose group equals the artifact name (e.g., `hiccup`).
 */

import { createEndpoint, defineService, isJsonObject, pickFields } from '@/services/endpoint';
import {
  SERIES_DELTA_SPECIALS,
  buildTrailingSeriesSpecials,
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
  readFiniteNumber,
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
  /** Per-version download counts (`{ "1.0.0": 4210, … }`). */
  downloads_per_version?: Record<string, number>;
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
    'downloads_per_version',
    'latest_release',
    'latest_version',
    'licenses',
  ]),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Read the per-version download series and latest-vs-previous release delta from `downloads_per_version`. */
function buildClojarsDownloadSpecials(artifact: Partial<ClojarsArtifactPayload>) {
  const map = isJsonObject(artifact.downloads_per_version)
    ? artifact.downloads_per_version
    : undefined;
  const series: number[] = [];
  if (map) {
    for (const value of Object.values(map)) {
      const count = readFiniteNumber(value);
      if (count !== undefined) {
        series.push(count);
      }
    }
  }
  const recent = series.slice(-12);
  return buildTrailingSeriesSpecials(recent);
}

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
    dt: createDownloadsMetric(
      CLOJARS_ENDPOINT,
      'dt',
      (artifact) => artifact.downloads,
      { autoSpecials: SERIES_DELTA_SPECIALS },
      buildClojarsDownloadSpecials
    ),
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
