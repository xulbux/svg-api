/**
 * Elm Service Preset
 *
 * Live upstream metrics and redirect transformations for Elm.
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createLicenseMetric, createVersionMetric } from '@/services/metrics';

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
const ELM_ENDPOINT = createEndpoint({
  api: 'https://package.elm-lang.org/packages/{owner}/{target}/latest/elm.json',
  page: 'https://package.elm-lang.org/packages/{owner}/{target}/latest/',
  project: pickFields<ElmPackagePayload>(['license', 'version']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Elm package service preset (`elm`). */
export const ELM_SERVICE = defineService({
  docs: { description: 'Latest package version and license.', title: 'Elm Packages' },
  metrics: {
    license: createLicenseMetric(ELM_ENDPOINT, (manifest) => manifest.license),
    v: createVersionMetric(
      ELM_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'elm', defaultLabel: 'Elm' },
      (manifest) => manifest.version
    ),
  },
  route: { owner: { isRequired: true, placeholder: ':author' }, target: { placeholder: ':pkg' } },
});
