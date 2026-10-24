/**
 * CocoaPods service preset – Live upstream metrics and redirect transformations.
 *
 * Trunk answers with a `303` redirect to the commit-pinned podspec JSON on GitHub, which `fetch`
 * follows transparently.
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  createLicenseMetric,
  createVersionMetric,
  readLicenseName,
  readText,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected podspec metadata (`trunk.cocoapods.org/api/v1/pods/:pod/specs/latest`). */
interface CocoaPodsSpecProjection {
  /** SPDX license identifier or license type name (without inline license file text). */
  license?: string;
  /** Latest published pod version. */
  version?: string;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Project a podspec payload to its license name and latest version. */
function projectCocoaPodsSpec(data: unknown): CocoaPodsSpecProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  return { license: readLicenseName(data.license), version: readText(data.version) };
}

/** CocoaPods Trunk latest podspec endpoint with cocoapods.org pod page redirect. */
const COCOAPODS_ENDPOINT = createEndpoint({
  api: 'https://trunk.cocoapods.org/api/v1/pods/{target}/specs/latest',
  extractKeys: ['license', 'version'],
  page: 'https://cocoapods.org/pods/{target}',
  project: projectCocoaPodsSpec,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** CocoaPods service preset (`cocoapods`). */
export const COCOAPODS_SERVICE = defineService({
  docs: { description: 'Latest pod version and license.', title: 'CocoaPods' },
  metrics: {
    license: createLicenseMetric(COCOAPODS_ENDPOINT, (spec) => spec.license),
    v: createVersionMetric(
      COCOAPODS_ENDPOINT,
      { defaultColor: 'rose', defaultIcon: 'cocoapods', defaultLabel: 'Pod' },
      (spec) => spec.version
    ),
  },
  route: { target: { placeholder: ':pod' } },
});
