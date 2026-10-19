/**
 * Modrinth service preset – Minecraft project downloads, followers, latest supported game release, and license (`/badge/modrinth/:project/:metric`).
 *
 * Every metric reads the compact project document; The multi-megabyte version list endpoint is
 * deliberately avoided.
 */

import { createEndpoint, createMetric, defineService, pickFields } from '@/services/endpoint';
import {
  createCommunityMetric,
  createDownloadsMetric,
  createLicenseMetric,
  formatVersion,
} from '@/services/metrics';
import type { MetricResult } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** License metadata of a Modrinth project. */
interface ModrinthLicense {
  /** SPDX license identifier (e.g., `'MIT'`, `'LicenseRef-Polyform-Shield-1.0.0'`). */
  id?: string;
}

/** Partial Modrinth project API payload (`api.modrinth.com/v2/project/:project`). */
interface ModrinthProjectPayload {
  /** All-time downloads. */
  downloads: number;
  /** Number of followers. */
  followers: number;
  /** Supported game versions in ascending order (including snapshots and pre-releases). */
  game_versions: unknown[];
  /** License metadata. */
  license: ModrinthLicense | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Modrinth project endpoint with project page redirect (`/project/` redirects to the typed page). */
const MODRINTH_ENDPOINT = createEndpoint({
  api: 'https://api.modrinth.com/v2/project/{target}',
  page: 'https://modrinth.com/project/{target}',
  project: pickFields<ModrinthProjectPayload>([
    'downloads',
    'followers',
    'game_versions',
    'license',
  ]),
});

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a stable Minecraft release version (`1.21.4`, `26.3`), excluding snapshots and pre-releases. */
const RELEASE_GAME_VERSION_RX = /^\d+(?:\.\d+)+$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Transform a Modrinth project into its newest supported stable game release (falling back to the newest version). */
function transformModrinthGameVersion(
  project: Partial<ModrinthProjectPayload>
): Partial<MetricResult> {
  const versions = Array.isArray(project.game_versions) ? project.game_versions : [];
  let newestVersion: string | undefined = undefined;
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    const version: unknown = versions[i];
    if (typeof version === 'string') {
      if (RELEASE_GAME_VERSION_RX.test(version)) {
        return { value: version };
      }
      newestVersion ??= version;
    }
  }
  return { value: newestVersion ?? formatVersion(undefined) };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Modrinth service preset (`modrinth`). */
export const MODRINTH_SERVICE = defineService({
  docs: {
    description: 'Project downloads, followers, latest supported game release, and license.',
    title: 'Modrinth',
  },
  metricAliases: { dl: 'dt', mc: 'game' },
  metrics: {
    dt: createDownloadsMetric(MODRINTH_ENDPOINT, 'dt', (project) => project.downloads, {
      defaultColor: 'emerald',
    }),
    followers: createCommunityMetric(
      MODRINTH_ENDPOINT,
      'followers',
      'modrinth',
      (project) => project.followers
    ),
    game: createMetric(
      MODRINTH_ENDPOINT,
      { defaultColor: 'emerald', defaultIcon: 'modrinth', defaultLabel: 'minecraft' },
      transformModrinthGameVersion
    ),
    license: createLicenseMetric(MODRINTH_ENDPOINT, (project) => project.license?.id),
  },
  route: { target: { placeholder: ':project' } },
});
