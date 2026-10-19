/**
 * NuGet service preset – .NET package version and total downloads via the NuGet search API (`/badge/nuget/:pkg/:metric`).
 */

import { createEndpoint, defineService, projectFirstEntry } from '@/services/endpoint';
import { createDownloadsMetric, createVersionMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Single package entry of a NuGet search API response (`azuresearch-usnc.nuget.org/query?q=packageid:...`). */
interface NuGetSearchEntry {
  /** All-time downloads across all versions. */
  totalDownloads: number;
  /** Latest stable version. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** NuGet search API endpoint filtered to a single exact package ID (first match; None is not found). */
const NUGET_ENDPOINT = createEndpoint({
  api: 'https://azuresearch-usnc.nuget.org/query?q=packageid:{target}&prerelease=false&semVerLevel=2.0.0&take=1',
  page: 'https://www.nuget.org/packages/{target}',
  project: projectFirstEntry<NuGetSearchEntry>('data', ['totalDownloads', 'version']),
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
    dt: createDownloadsMetric(NUGET_ENDPOINT, 'dt', (entry) => entry.totalDownloads),
    v: createVersionMetric(
      NUGET_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'nuget', defaultLabel: 'nuget' },
      (entry) => entry.version
    ),
  },
  route: { target: { placeholder: ':pkg' } },
});
