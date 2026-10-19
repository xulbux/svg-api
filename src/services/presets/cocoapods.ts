/**
 * CocoaPods service preset – Latest pod version and license from the CocoaPods Trunk API (`/badge/cocoapods/:pod/:metric`).
 *
 * Trunk answers with a `303` redirect to the commit-pinned podspec JSON on GitHub, which `fetch`
 * follows transparently.
 */

import { createLicenseTransform, createVersionTransform, LICENSE } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial podspec JSON payload (`trunk.cocoapods.org/api/v1/pods/:pod/specs/latest`). */
interface CocoaPodsSpecPayload {
  /** SPDX license identifier or license object (`{ type, file }`). */
  license: string | { type?: string };
  /** Latest published pod version. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** CocoaPods Trunk latest podspec endpoint with cocoapods.org pod page redirect. */
const COCOAPODS_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, pod: string): string =>
    `https://trunk.cocoapods.org/api/v1/pods/${pod}/specs/latest`,
  buildRedirectUrl: (_owner: string, pod: string): string => `https://cocoapods.org/pods/${pod}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** CocoaPods service preset (`cocoapods`). */
export const COCOAPODS_SERVICE: ServiceDefinition = {
  docs: { description: 'Latest pod version and license.', targetName: ':pod', title: 'CocoaPods' },
  metricAliases: { l: 'license' },
  metrics: {
    license: {
      ...COCOAPODS_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<CocoaPodsSpecPayload>((payload) =>
        typeof payload.license === 'string' ? payload.license : payload.license?.type
      ),
    },
    v: {
      ...COCOAPODS_ENDPOINT,
      defaultColor: 'rose',
      defaultIcon: 'cocoapods',
      defaultLabel: 'pod',
      transform: createVersionTransform<CocoaPodsSpecPayload>((payload) => payload.version),
    },
  },
  ownerMode: 'none',
};
