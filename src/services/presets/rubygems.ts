/**
 * RubyGems service preset – Ruby gem version, total downloads, and license (`/badge/gem/:gem/:metric`).
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import {
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial RubyGems gem API payload (`rubygems.org/api/v1/gems/:gem.json`). */
interface RubyGemPayload {
  /** All-time downloads across all versions. */
  downloads: number;
  /** SPDX license identifiers. */
  licenses: string[] | null;
  /** Latest version. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** RubyGems gem endpoint with gem page redirect. */
const RUBYGEMS_ENDPOINT = createEndpoint({
  api: 'https://rubygems.org/api/v1/gems/{target}.json',
  page: 'https://rubygems.org/gems/{target}',
  project: pickFields<RubyGemPayload>(['downloads', 'licenses', 'version']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** RubyGems service preset (`gem`). */
export const RUBYGEMS_SERVICE = defineService({
  docs: {
    description: 'Latest version, all-time downloads, and license of any Ruby gem.',
    title: 'RubyGems',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: createDownloadsMetric(RUBYGEMS_ENDPOINT, 'dt', (gem) => gem.downloads),
    license: createLicenseMetric(RUBYGEMS_ENDPOINT, (gem) =>
      Array.isArray(gem.licenses) ? gem.licenses[0] : undefined
    ),
    v: createVersionMetric(
      RUBYGEMS_ENDPOINT,
      { defaultColor: 'red', defaultIcon: 'rubygems', defaultLabel: 'gem' },
      (gem) => gem.version
    ),
  },
  route: { target: { placeholder: ':gem' } },
});
