/**
 * NuGet Service Preset
 *
 * Live upstream metrics and redirect transformations for NuGet.
 */

import {
  createEndpoint,
  defineService,
  isJsonObject,
  readFirstObjectEntry,
  readJsonObject,
} from '@/services/endpoint';
import {
  SERIES_DELTA_SPECIALS,
  buildTrailingSeriesSpecials,
  createDownloadsMetric,
  createVersionMetric,
  readFiniteNumber,
  readText,
} from '@/services/metrics';
import { MIN_SERIES_POINTS } from '@/svg/renderer';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected NuGet search entry (`azuresearch-usnc.nuget.org/query?q=packageid:…`). */
interface NuGetSearchProjection {
  /** All-time downloads across all versions. */
  totalDownloads?: number;
  /** Latest stable version. */
  version?: string;
  /** Per-version download counts across the most recent releases. */
  versionDownloads?: number[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum number of recent NuGet version download entries kept in the projection. */
const MAX_NUGET_RELEASES = 12;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches valid NuGet package IDs (`<= 100` chars) so Lucene query operators cannot enter `q=packageid:{target}`. */
const NUGET_PACKAGE_ID_RX = /^(?=.{1,100}$)\w+(?:[.-]\w+)*$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Project the first NuGet search entry to its version, total downloads, and recent per-version series. */
function projectNuGetEntry(data: unknown): NuGetSearchProjection | undefined {
  const entry = readFirstObjectEntry(readJsonObject(data)?.data);
  if (!entry) {
    return undefined;
  }
  const versionDownloads: number[] = [];
  if (Array.isArray(entry.versions)) {
    const startIndex = Math.max(0, entry.versions.length - MAX_NUGET_RELEASES);
    for (let i = startIndex; i < entry.versions.length; i += 1) {
      const item: unknown = entry.versions[i];
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
    versionDownloads: versionDownloads.length >= MIN_SERIES_POINTS ? versionDownloads : undefined,
  };
}

/** NuGet search API endpoint filtered to a single exact package ID (first match; None is not found). */
const NUGET_ENDPOINT = createEndpoint({
  api: 'https://azuresearch-usnc.nuget.org/query?q=packageid:{target}&prerelease=false&semVerLevel=2.0.0&take=1',
  extractKeys: ['data'],
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
