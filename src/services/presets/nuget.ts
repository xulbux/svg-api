/**
 * NuGet service preset – .NET package version and total downloads via the NuGet search API (`/badge/nuget/:pkg/:metric`).
 */

import {
  createCountTransform,
  createFirstEntryTransform,
  createVersionTransform,
  TOTAL_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Single package entry of a NuGet search API response. */
interface NuGetSearchEntry {
  /** All-time downloads across all versions. */
  totalDownloads?: number;
  /** Latest stable version. */
  version?: string;
}

/** Partial NuGet search API payload (`azuresearch-usnc.nuget.org/query?q=packageid:...`). */
interface NuGetSearchPayload {
  /** Matched packages (empty when the package does not exist). */
  data: NuGetSearchEntry[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** NuGet search API endpoint filtered to a single exact package ID, with package page redirect. */
const NUGET_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, pkg: string): string =>
    `https://azuresearch-usnc.nuget.org/query?q=packageid:${encodeURIComponent(pkg)}&prerelease=false&semVerLevel=2.0.0&take=1`,
  buildRedirectUrl: (_owner: string, pkg: string): string =>
    `https://www.nuget.org/packages/${pkg}`,
};

// -------------------------------------- INTERNALS --------------------------------------

/** Read the matched package list of a NuGet search payload. */
function readNuGetEntries(payload: Partial<NuGetSearchPayload>): unknown {
  return payload.data;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** NuGet service preset (`nuget`). */
export const NUGET_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Latest stable version and all-time downloads of any .NET package.',
    targetName: ':pkg',
    title: 'NuGet',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: {
      ...NUGET_ENDPOINT,
      ...TOTAL_DOWNLOADS,
      transform: createFirstEntryTransform<NuGetSearchPayload>(
        readNuGetEntries,
        createCountTransform<NuGetSearchEntry>((entry) => entry.totalDownloads)
      ),
    },
    v: {
      ...NUGET_ENDPOINT,
      defaultColor: 'blue',
      defaultIcon: 'nuget',
      defaultLabel: 'nuget',
      transform: createFirstEntryTransform<NuGetSearchPayload>(
        readNuGetEntries,
        createVersionTransform<NuGetSearchEntry>((entry) => entry.version)
      ),
    },
  },
  ownerMode: 'none',
};
