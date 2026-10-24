/**
 * NuGet service preset – Live upstream metrics and redirect transformations.
 */

import {
  createEndpoint,
  defineService,
  isJsonObject,
  readFirstObjectEntry,
} from '@/services/endpoint';
import {
  SERIES_DELTA_SPECIALS,
  buildTrailingSeriesSpecials,
  createDownloadsMetric,
  createVersionMetric,
  readFiniteNumber,
  readText,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected NuGet search entry (`azuresearch-usnc.nuget.org/query?q=packageid:…`). */
interface NuGetSearchProjection {
  /** All-time downloads across all versions. */
  totalDownloads?: number;
  /** Latest stable version. */
  version?: string;
  /** Per-version download counts across the most recent 12 releases. */
  versionDownloads?: number[];
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches valid NuGet package IDs (`<= 100` chars) so Lucene query operators cannot enter `q=packageid:{target}`. */
const NUGET_PACKAGE_ID_RX = /^(?=.{1,100}$)\w+(?:[.-]\w+)*$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Project the first NuGet search entry to its version, total downloads, and recent per-version series. */
function projectNuGetEntry(data: unknown): NuGetSearchProjection | undefined {
  const entry = readFirstObjectEntry(isJsonObject(data) ? data.data : undefined);
  if (!entry) {
    return undefined;
  }
  const versionDownloads: number[] = [];
  if (Array.isArray(entry.versions)) {
    for (const item of entry.versions.slice(-12)) {
      if (isJsonObject(item)) {
        const count = readFiniteNumber(item.downloads);
        if (count !== undefined) {
          versionDownloads.push(count);
        }
      }
    }
  }
  return {
    totalDownloads: readFiniteNumber(entry.totalDownloads),
    version: readText(entry.version),
    versionDownloads: versionDownloads.length >= 2 ? versionDownloads : undefined,
  };
}

/** NuGet search API endpoint filtered to a single exact package ID (first match; None is not found). */
const NUGET_ENDPOINT = createEndpoint({
  api: 'https://azuresearch-usnc.nuget.org/query?q=packageid:{target}&prerelease=false&semVerLevel=2.0.0&take=1',
  page: 'https://www.nuget.org/packages/{target}',
  project: projectNuGetEntry,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** NuGet service preset (`nuget`). */
export const NUGET_SERVICE = defineService({
  docs: {
    description: 'Latest stable version and all-time downloads of any .NET package.',
    title: 'NuGet',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: createDownloadsMetric(
      NUGET_ENDPOINT,
      'dt',
      (entry) => entry.totalDownloads,
      { autoSpecials: SERIES_DELTA_SPECIALS },
      (entry) => buildTrailingSeriesSpecials(entry.versionDownloads)
    ),
    v: createVersionMetric(
      NUGET_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'nuget', defaultLabel: 'NuGet' },
      (entry) => entry.version
    ),
  },
  route: { target: { pattern: NUGET_PACKAGE_ID_RX, placeholder: ':package' } },
});
