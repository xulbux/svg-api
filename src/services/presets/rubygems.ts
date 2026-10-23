/**
 * RubyGems service preset – Live upstream metrics and redirect transformations.
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import {
  UPDATED,
  createDownloadsMetric,
  createLicenseMetric,
  createRelativeDateMetric,
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
  /** ISO 8601 publication timestamp of the latest version. */
  version_created_at: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** RubyGems gem endpoint with gem page redirect. */
const RUBYGEMS_ENDPOINT = createEndpoint({
  api: 'https://rubygems.org/api/v1/gems/{target}.json',
  page: 'https://rubygems.org/gems/{target}',
  project: pickFields<RubyGemPayload>(['downloads', 'licenses', 'version', 'version_created_at']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** RubyGems service preset (`gem`). */
export const RUBYGEMS_SERVICE = defineService({
  docs: {
    description:
      'Latest version, all-time downloads, license, and last-updated age of any Ruby gem.',
    title: 'RubyGems',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: createDownloadsMetric(RUBYGEMS_ENDPOINT, 'dt', (gem) => gem.downloads),
    license: createLicenseMetric(RUBYGEMS_ENDPOINT, (gem) => gem.licenses),
    updated: createRelativeDateMetric(RUBYGEMS_ENDPOINT, UPDATED, (gem) => gem.version_created_at),
    v: createVersionMetric(
      RUBYGEMS_ENDPOINT,
      { defaultColor: 'red', defaultIcon: 'rubygems', defaultLabel: 'Gem' },
      (gem) => gem.version
    ),
  },
  route: { target: { placeholder: ':gem' } },
});
