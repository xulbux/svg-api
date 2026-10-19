/**
 * Elm service preset – Latest Elm package version and license (`/badge/elm/:author/:pkg/:metric`).
 */

import { createLicenseTransform, createVersionTransform, LICENSE } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Elm package manifest payload (`package.elm-lang.org/packages/:author/:pkg/latest/elm.json`). */
interface ElmPackagePayload {
  /** SPDX license identifier. */
  license: string;
  /** Latest published version. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Elm package manifest endpoint with package documentation redirect. */
const ELM_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (author: string, pkg: string): string =>
    `https://package.elm-lang.org/packages/${author}/${pkg}/latest/elm.json`,
  buildRedirectUrl: (author: string, pkg: string): string =>
    `https://package.elm-lang.org/packages/${author}/${pkg}/latest/`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Elm package service preset (`elm`). */
export const ELM_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Latest package version and license.',
    ownerName: ':author',
    targetName: ':pkg',
    title: 'Elm Packages',
  },
  metricAliases: { l: 'license' },
  metrics: {
    license: {
      ...ELM_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<ElmPackagePayload>((payload) => payload.license),
    },
    v: {
      ...ELM_ENDPOINT,
      defaultColor: 'sky',
      defaultIcon: 'elm',
      defaultLabel: 'elm',
      transform: createVersionTransform<ElmPackagePayload>((payload) => payload.version),
    },
  },
  ownerMode: 'required',
};
