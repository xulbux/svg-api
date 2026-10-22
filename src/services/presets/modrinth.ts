/**
 * Modrinth service preset – Minecraft project downloads, followers, latest supported game release, and license (`/badge/modrinth/:project/:metric`).
 *
 * Every metric reads the compact project document; The multi-megabyte version list endpoint is
 * deliberately avoided.
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  createCommunityMetric,
  createDownloadsMetric,
  createLicenseMetric,
  createTextMetric,
  readFiniteNumber,
  readLicenseName,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Modrinth project metadata (`api.modrinth.com/v2/project/:project`). */
interface ModrinthProjectProjection {
  /** All-time downloads. */
  downloads?: number;
  /** Number of followers. */
  followers?: number;
  /** Newest supported stable game release (falling back to the newest version). */
  gameVersion?: string;
  /** SPDX license identifier (e.g., `'MIT'`, `'LicenseRef-Polyform-Shield-1.0.0'`). */
  license?: string;
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a stable Minecraft release version (`1.21.4`, `26.3`), excluding snapshots and pre-releases. */
const RELEASE_GAME_VERSION_RX = /^\d+(?:\.\d+)+$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Read the newest supported stable Minecraft game release from `game_versions` (falling back to the newest version). */
function readNewestModrinthGameVersion(rawVersions: unknown): string | undefined {
  if (!Array.isArray(rawVersions)) {
    return undefined;
  }
  let newestVersion: string | undefined = undefined;
  for (let i = rawVersions.length - 1; i >= 0; i -= 1) {
    const version: unknown = rawVersions[i];
    if (typeof version === 'string') {
      if (RELEASE_GAME_VERSION_RX.test(version)) {
        return version;
      }
      newestVersion ??= version;
    }
  }
  return newestVersion;
}

/** Project a Modrinth project payload to its download/follower counts, game version, and license. */
function projectModrinthProject(data: unknown): ModrinthProjectProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  return {
    downloads: readFiniteNumber(data.downloads),
    followers: readFiniteNumber(data.followers),
    gameVersion: readNewestModrinthGameVersion(data.game_versions),
    license: readLicenseName(data.license),
  };
}

/** Modrinth project endpoint with project page redirect (`/project/` redirects to the typed page). */
const MODRINTH_ENDPOINT = createEndpoint({
  api: 'https://api.modrinth.com/v2/project/{target}',
  page: 'https://modrinth.com/project/{target}',
  project: projectModrinthProject,
});

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
    game: createTextMetric(
      MODRINTH_ENDPOINT,
      { defaultColor: 'emerald', defaultIcon: 'modrinth', defaultLabel: 'Minecraft' },
      (project) => project.gameVersion
    ),
    license: createLicenseMetric(MODRINTH_ENDPOINT, (project) => project.license),
  },
  route: { target: { placeholder: ':project' } },
});
