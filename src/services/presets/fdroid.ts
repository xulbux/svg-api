/**
 * F-Droid service preset – Suggested app version from the F-Droid repository (`/badge/fdroid/:appId/:metric`).
 */

import { createVersionTransform } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial published package build of an F-Droid package payload. */
interface FdroidPackageBuild {
  /** Numeric Android version code. */
  versionCode?: number;
  /** Human-readable version name. */
  versionName?: string;
}

/** Partial F-Droid package API payload (`f-droid.org/api/v1/packages/:appId`). */
interface FdroidPackagePayload {
  /** Published builds, newest first. */
  packages: FdroidPackageBuild[];
  /** Version code of the build F-Droid suggests installing. */
  suggestedVersionCode: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** F-Droid package endpoint with f-droid.org app page redirect. */
const FDROID_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, appId: string): string =>
    `https://f-droid.org/api/v1/packages/${appId}`,
  buildRedirectUrl: (_owner: string, appId: string): string =>
    `https://f-droid.org/packages/${appId}/`,
};

// -------------------------------------- INTERNALS --------------------------------------

/** Read the suggested build's version name, falling back to the newest published build. */
function readSuggestedFdroidVersion(payload: Partial<FdroidPackagePayload>): string | undefined {
  const builds = payload.packages;
  if (!Array.isArray(builds)) {
    return undefined;
  }
  for (const build of builds) {
    if (build.versionCode === payload.suggestedVersionCode) {
      return build.versionName;
    }
  }
  return builds[0]?.versionName;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** F-Droid service preset (`fdroid`). */
export const FDROID_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Suggested app version (falls back to the newest published build).',
    targetName: ':appId',
    title: 'F-Droid',
  },
  metrics: {
    v: {
      ...FDROID_ENDPOINT,
      defaultColor: 'blue',
      defaultIcon: 'fdroid',
      defaultLabel: 'f-droid',
      transform: createVersionTransform<FdroidPackagePayload>(readSuggestedFdroidVersion),
    },
  },
  ownerMode: 'none',
};
