/**
 * RubyGems service preset – Ruby gem version, total downloads, and license (`/badge/gem/:gem/:metric`).
 */

import {
  createCountTransform,
  createLicenseTransform,
  createVersionTransform,
  LICENSE,
  TOTAL_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

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
const RUBYGEMS_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, gem: string): string =>
    `https://rubygems.org/api/v1/gems/${gem}.json`,
  buildRedirectUrl: (_owner: string, gem: string): string => `https://rubygems.org/gems/${gem}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** RubyGems service preset (`gem`). */
export const RUBYGEMS_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Latest version, all-time downloads, and license of any Ruby gem.',
    targetName: ':gem',
    title: 'RubyGems',
  },
  metricAliases: { dl: 'dt', l: 'license' },
  metrics: {
    dt: {
      ...RUBYGEMS_ENDPOINT,
      ...TOTAL_DOWNLOADS,
      transform: createCountTransform<RubyGemPayload>((payload) => payload.downloads),
    },
    license: {
      ...RUBYGEMS_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<RubyGemPayload>((payload) => payload.licenses?.[0]),
    },
    v: {
      ...RUBYGEMS_ENDPOINT,
      defaultColor: 'red',
      defaultIcon: 'rubygems',
      defaultLabel: 'gem',
      transform: createVersionTransform<RubyGemPayload>((payload) => payload.version),
    },
  },
  ownerMode: 'none',
};
