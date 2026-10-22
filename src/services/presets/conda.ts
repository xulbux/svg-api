/**
 * Conda service preset – Package version and license from Anaconda Cloud (`/badge/conda/[:channel/]:pkg/:metric`).
 *
 * The optional channel segment defaults to `conda-forge` (e.g., `bioconda`, `anaconda`, `pytorch`);
 * `extractKeys` stops the response stream before the multi-megabyte `builds`, `releases`, and
 * `files` arrays.
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createLicenseMetric, createVersionMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Anaconda Cloud package payload (`api.anaconda.org/package/:channel/:pkg`). */
interface CondaPackagePayload {
  /** Latest published package version. */
  latest_version: string;
  /** SPDX license expression or short license name. */
  license: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default Conda channel when `:channel` is omitted. */
const DEFAULT_CONDA_CHANNEL = 'conda-forge';

/** Anaconda Cloud package endpoint (`extractKeys` cancels the stream before `builds`/`files`). */
const CONDA_ENDPOINT = createEndpoint({
  api: 'https://api.anaconda.org/package/{owner}/{target}',
  extractKeys: ['latest_version', 'license'],
  page: 'https://anaconda.org/{owner}/{target}',
  project: pickFields<CondaPackagePayload>(['latest_version', 'license']),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve the default Conda channel (`conda-forge`). */
function resolveDefaultCondaChannel(): string {
  return DEFAULT_CONDA_CHANNEL;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Conda (Anaconda Cloud / conda-forge) service preset (`conda`). */
export const CONDA_SERVICE = defineService({
  docs: {
    description:
      'Latest package version and license on Anaconda Cloud (omit :channel for conda-forge, e.g., bioconda).',
    title: 'Conda',
  },
  metrics: {
    license: createLicenseMetric(CONDA_ENDPOINT, (pkg) => pkg.license),
    v: createVersionMetric(
      CONDA_ENDPOINT,
      { defaultColor: 'emerald', defaultIcon: 'condaforge', defaultLabel: 'Conda' },
      (pkg) => pkg.latest_version
    ),
  },
  route: {
    owner: {
      isRequired: false,
      placeholder: ':channel',
      resolveDefault: resolveDefaultCondaChannel,
    },
    target: { placeholder: ':pkg' },
  },
});
