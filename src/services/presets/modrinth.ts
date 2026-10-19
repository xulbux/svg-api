/**
 * Modrinth service preset – Minecraft project downloads, followers, latest supported game release, and license (`/badge/modrinth/:project/:metric`).
 *
 * Every metric reads the compact project document; The multi-megabyte version list endpoint is
 * deliberately avoided.
 */

import {
  createCountTransform,
  createLicenseTransform,
  formatVersion,
  LICENSE,
  TOTAL_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, MetricResult, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Modrinth project API payload (`api.modrinth.com/v2/project/:project`). */
interface ModrinthProjectPayload {
  /** All-time downloads. */
  downloads: number;
  /** Number of followers. */
  followers: number;
  /** Supported game versions in ascending order (including snapshots and pre-releases). */
  game_versions: string[];
  /** License metadata. */
  license: {
    /** SPDX license identifier (e.g., `'MIT'`, `'LicenseRef-Polyform-Shield-1.0.0'`). */
    id?: string;
  } | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Modrinth project endpoint with project page redirect (`/project/` redirects to the typed page). */
const MODRINTH_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, project: string): string =>
    `https://api.modrinth.com/v2/project/${project}`,
  buildRedirectUrl: (_owner: string, project: string): string =>
    `https://modrinth.com/project/${project}`,
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a stable Minecraft release version (`1.21.4`, `26.3`), excluding snapshots and pre-releases. */
const RELEASE_GAME_VERSION_RX = /^\d+(?:\.\d+)+$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Transform a Modrinth project into its newest supported stable game release (falling back to the newest version). */
function transformModrinthGameVersion(data: unknown): Partial<MetricResult> {
  const versions = ((data ?? {}) as Partial<ModrinthProjectPayload>).game_versions;
  if (!Array.isArray(versions) || versions.length === 0) {
    return { value: formatVersion(undefined) };
  }
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    if (RELEASE_GAME_VERSION_RX.test(versions[i])) {
      return { value: versions[i] };
    }
  }
  return { value: versions.at(-1) };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Modrinth service preset (`modrinth`). */
export const MODRINTH_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Project downloads, followers, latest supported game release, and license.',
    targetName: ':project',
    title: 'Modrinth',
  },
  metricAliases: { dl: 'dt', l: 'license', mc: 'game' },
  metrics: {
    dt: {
      ...MODRINTH_ENDPOINT,
      ...TOTAL_DOWNLOADS,
      defaultColor: 'emerald',
      transform: createCountTransform<ModrinthProjectPayload>((payload) => payload.downloads),
    },
    followers: {
      ...MODRINTH_ENDPOINT,
      defaultColor: 'rose',
      defaultIcon: 'heart',
      defaultLabel: 'followers',
      transform: createCountTransform<ModrinthProjectPayload>((payload) => payload.followers),
    },
    game: {
      ...MODRINTH_ENDPOINT,
      defaultColor: 'emerald',
      defaultIcon: 'modrinth',
      defaultLabel: 'minecraft',
      transform: transformModrinthGameVersion,
    },
    license: {
      ...MODRINTH_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<ModrinthProjectPayload>((payload) => payload.license?.id),
    },
  },
  ownerMode: 'none',
};
