/**
 * F-Droid service preset – Suggested app version from the F-Droid repository (`/badge/fdroid/:appId/:metric`).
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import { createVersionMetric, readText } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected F-Droid package metadata (`f-droid.org/api/v1/packages/:appId`). */
interface FdroidPackageProjection {
  /** Suggested build version name (falling back to the newest published build). */
  version?: string;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Project an F-Droid package payload to its suggested build's version name (falling back to the newest published build). */
function projectFdroidPackage(data: unknown): FdroidPackageProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const builds = data.packages;
  if (!Array.isArray(builds)) {
    return { version: undefined };
  }
  let newestVersion: string | undefined = undefined;
  for (const build of builds) {
    if (isJsonObject(build)) {
      const versionName = readText(build.versionName);
      if (build.versionCode === data.suggestedVersionCode && versionName) {
        return { version: versionName };
      }
      newestVersion ??= versionName;
    }
  }
  return { version: newestVersion };
}

// ---------------------------------------- CONSTS ---------------------------------------

/** F-Droid package endpoint with f-droid.org app page redirect. */
const FDROID_ENDPOINT = createEndpoint({
  api: 'https://f-droid.org/api/v1/packages/{target}',
  page: 'https://f-droid.org/packages/{target}/',
  project: projectFdroidPackage,
});

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
      (pkg) => pkg.version
    ),
  },
  route: { target: { placeholder: ':appId' } },
});
