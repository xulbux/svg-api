/**
 * F-Droid service preset – Suggested app version from the F-Droid repository (`/badge/fdroid/:appId/:metric`).
 */

import { createEndpoint, defineService, isJsonObject, pickFields } from '@/services/endpoint';
import { createVersionMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial F-Droid package API payload (`f-droid.org/api/v1/packages/:appId`). */
interface FdroidPackagePayload {
  /** Published builds (`{ versionCode, versionName }`), newest first. */
  packages: unknown[];
  /** Version code of the build F-Droid suggests installing. */
  suggestedVersionCode: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** F-Droid package endpoint with f-droid.org app page redirect. */
const FDROID_ENDPOINT = createEndpoint({
  api: 'https://f-droid.org/api/v1/packages/{target}',
  page: 'https://f-droid.org/packages/{target}/',
  project: pickFields<FdroidPackagePayload>(['packages', 'suggestedVersionCode']),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Read the version name of a build entry (malformed entries such as `null` are skipped). */
function readBuildVersionName(build: unknown): string | undefined {
  return isJsonObject(build) && typeof build.versionName === 'string'
    ? build.versionName
    : undefined;
}

/** Read the suggested build's version name, falling back to the newest published build. */
function readSuggestedFdroidVersion(payload: Partial<FdroidPackagePayload>): string | undefined {
  const builds = payload.packages;
  if (!Array.isArray(builds)) {
    return undefined;
  }
  let newestVersion: string | undefined = undefined;
  for (const build of builds) {
    const versionName = readBuildVersionName(build);
    if (isJsonObject(build) && build.versionCode === payload.suggestedVersionCode && versionName) {
      return versionName;
    }
    newestVersion ??= versionName;
  }
  return newestVersion;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** F-Droid service preset (`fdroid`). */
export const FDROID_SERVICE = defineService({
  docs: {
    description: 'Suggested app version (falls back to the newest published build).',
    title: 'F-Droid',
  },
  metrics: {
    v: createVersionMetric(
      FDROID_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'fdroid', defaultLabel: 'f-droid' },
      readSuggestedFdroidVersion
    ),
  },
  route: { target: { placeholder: ':appId' } },
});
