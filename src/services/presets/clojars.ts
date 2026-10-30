/**
 * Clojars Service Preset
 *
 * Live upstream metrics and redirect transformations for Clojars.
 *
 * The group segment may be omitted for artifacts whose group equals the artifact name (e.g., `hiccup`).
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  SERIES_DELTA_SPECIALS,
  buildTrailingSeriesSpecials,
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
  readFiniteNumber,
  readLicenseName,
  readText,
} from '@/services/metrics';
import { MAX_BARS_POINTS, MIN_SERIES_POINTS } from '@/svg/renderer';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Clojars artifact metadata (`clojars.org/api/artifacts/[:group/]:artifact`). */
interface ClojarsArtifactProjection {
  /** All-time downloads of every version. */
  downloads?: number;
  /** Primary declared license name. */
  license?: string;
  /** Chronological per-release download counts across recent releases. */
  recentDownloads?: number[];
  /** Latest non-snapshot release, falling back to the latest snapshot version. */
  version?: string;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Project a Clojars artifact payload to its release version, primary license, total downloads, and recent series. */
function projectClojarsArtifact(data: unknown): ClojarsArtifactProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const series: number[] = [];
  if (Array.isArray(data.recent_versions)) {
    for (let i = Math.min(data.recent_versions.length, MAX_BARS_POINTS) - 1; i >= 0; i -= 1) {
      const entry = data.recent_versions[i];
      const count = isJsonObject(entry) ? readFiniteNumber(entry.downloads) : undefined;
      if (count !== undefined) {
        series.push(count);
      }
    }
  }
  return {
    downloads: readFiniteNumber(data.downloads),
    license: readLicenseName(data.licenses),
    recentDownloads: series.length >= MIN_SERIES_POINTS ? series : undefined,
    version: readText(data.latest_release) ?? readText(data.latest_version),
  };
}

/** Clojars artifact endpoint (`{path}` omits an empty group) with clojars.org artifact page redirect. */
const CLOJARS_ENDPOINT = createEndpoint({
  api: 'https://clojars.org/api/artifacts/{path}',
  extractKeys: ['downloads', 'latest_release', 'latest_version', 'licenses', 'recent_versions'],
  page: 'https://clojars.org/{path}',
  project: projectClojarsArtifact,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Clojars service preset (`clojars`). */
export const CLOJARS_SERVICE = defineService({
  docs: {
    description:
      'Latest release, total downloads, and license (omit the group when it equals the artifact).',
    title: 'Clojars',
  },
  metrics: {
    dt: createDownloadsMetric(
      CLOJARS_ENDPOINT,
      'dt',
      (artifact) => artifact.downloads,
      { autoSpecials: SERIES_DELTA_SPECIALS },
      (artifact) => buildTrailingSeriesSpecials(artifact.recentDownloads)
    ),
    license: createLicenseMetric(CLOJARS_ENDPOINT, (artifact) => artifact.license),
    v: createVersionMetric(
      CLOJARS_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'clojure', defaultLabel: 'Clojars' },
      (artifact) => artifact.version
    ),
  },
  route: {
    owner: { isRequired: false, placeholder: ':group' },
    target: { placeholder: ':artifact' },
  },
});
