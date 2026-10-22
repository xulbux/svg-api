/**
 * CocoaPods service preset – Latest pod version and license from the CocoaPods Trunk API (`/badge/cocoapods/:pod/:metric`).
 *
 * Trunk answers with a `303` redirect to the commit-pinned podspec JSON on GitHub, which `fetch`
 * follows transparently.
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createLicenseMetric, createVersionMetric, readLicenseName } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial podspec JSON payload (`trunk.cocoapods.org/api/v1/pods/:pod/specs/latest`). */
interface CocoaPodsSpecPayload {
  /** SPDX license identifier or license object (`{ type, file }`). */
  license: unknown;
  /** Latest published pod version. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** CocoaPods Trunk latest podspec endpoint with cocoapods.org pod page redirect. */
const COCOAPODS_ENDPOINT = createEndpoint({
  api: 'https://trunk.cocoapods.org/api/v1/pods/{target}/specs/latest',
  page: 'https://cocoapods.org/pods/{target}',
  project: pickFields<CocoaPodsSpecPayload>(['license', 'version']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** CocoaPods service preset (`cocoapods`). */
export const COCOAPODS_SERVICE = defineService({
  docs: { description: 'Latest pod version and license.', title: 'CocoaPods' },
  metrics: {
    license: createLicenseMetric(COCOAPODS_ENDPOINT, (spec) => readLicenseName(spec.license)),
    v: createVersionMetric(
      COCOAPODS_ENDPOINT,
      { defaultColor: 'rose', defaultIcon: 'cocoapods', defaultLabel: 'Pod' },
      (spec) => spec.version
    ),
  },
  route: { target: { placeholder: ':pod' } },
});
