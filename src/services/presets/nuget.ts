/**
 * NuGet service preset – .NET package version and total downloads via the NuGet search API (`/badge/nuget/:pkg/:metric`).
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  SERIES_DELTA_SPECIALS,
  buildSeriesSpecials,
  createDownloadsMetric,
  createVersionMetric,
  readFiniteNumber,
  readText,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected NuGet search entry (`azuresearch-usnc.nuget.org/query?q=packageid:...`). */
interface NuGetSearchProjection {
  /** All-time downloads across all versions. */
  totalDownloads?: number;
  /** Latest stable version. */
  version?: string;
  /** Per-version download counts across the most recent 12 releases. */
  versionDownloads?: number[];
}

// -------------------------------------- INTERNALS --------------------------------------

/** Project the first NuGet search entry to its version, total downloads, and recent per-version series. */
function projectNuGetEntry(data: unknown): NuGetSearchProjection | undefined {
  const entries = isJsonObject(data) ? data.data : undefined;
  const entry: unknown = Array.isArray(entries) ? entries[0] : undefined;
  if (!isJsonObject(entry)) {
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
      (entry) =>
        buildSeriesSpecials({
          barsValues: entry.versionDownloads,
          current: entry.versionDownloads?.at(-1),
          previous:
            entry.versionDownloads && entry.versionDownloads.length >= 2
              ? entry.versionDownloads.at(-2)
              : undefined,
          sparklineValues: entry.versionDownloads,
        })
    ),
    v: createVersionMetric(
      NUGET_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'nuget', defaultLabel: 'nuget' },
      (entry) => entry.version
    ),
  },
  route: { target: { placeholder: ':pkg' } },
});
