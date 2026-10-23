/**
 * Conda service preset – Live upstream metrics and redirect transformations.
 *
 * The optional channel segment falls back to `DEFAULT_CONDA_CHANNEL`; `extractKeys` stops the
 * response stream before the multi-megabyte `builds`, `releases`, and `files` arrays.
 */

import { CACHE_TTL, createEndpoint, defineService, pickFields } from '@/services/endpoint';
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
  ttl: CACHE_TTL.daily,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Conda (Anaconda Cloud) service preset (`conda`). */
export const CONDA_SERVICE = defineService({
  docs: {
    description: `Latest package version and license on Anaconda Cloud (omit :channel for ${DEFAULT_CONDA_CHANNEL}, e.g., bioconda).`,
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
    owner: { defaultValue: DEFAULT_CONDA_CHANNEL, isRequired: false, placeholder: ':channel' },
    target: { placeholder: ':pkg' },
  },
});
