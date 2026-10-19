/**
 * Puppet Forge service preset – Module version, total downloads, license, and community feedback score with a ring gauge (`/badge/puppet/:owner/:module/:metric`).
 *
 * The module endpoint ignores `exclude_fields`, so the full (~300 kB) payload is fetched once and
 * shared by every metric through the upstream cache.
 */

import {
  createCountTransform,
  createLicenseTransform,
  createScoreTransform,
  createVersionTransform,
  formatPercent,
  LICENSE,
  TOTAL_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Puppet Forge module API payload (`forgeapi.puppet.com/v3/modules/:owner-:module`). */
interface PuppetModulePayload {
  /** Latest module release. */
  current_release: {
    /** Release `metadata.json` contents. */
    metadata?: {
      /** SPDX license identifier. */
      license?: string;
    };
    /** Release version. */
    version?: string;
  };
  /** All-time downloads of every release. */
  downloads: number;
  /** Community feedback score (`0`–`100`), or `null` without feedback. */
  feedback_score: number | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum Puppet Forge feedback score. */
const MAX_PUPPET_SCORE = 100;

/** Puppet Forge module endpoint with module page redirect. */
const PUPPET_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (owner: string, module: string): string =>
    `https://forgeapi.puppet.com/v3/modules/${owner}-${module}`,
  buildRedirectUrl: (owner: string, module: string): string =>
    `https://forge.puppet.com/modules/${owner}/${module}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Puppet Forge service preset (`puppet`). */
export const PUPPET_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Latest version, total downloads, license, and feedback score (ring gauge).',
    ownerName: ':owner',
    targetName: ':module',
    title: 'Puppet Forge',
  },
  metricAliases: { dl: 'dt', l: 'license' },
  metrics: {
    dt: {
      ...PUPPET_ENDPOINT,
      ...TOTAL_DOWNLOADS,
      transform: createCountTransform<PuppetModulePayload>((payload) => payload.downloads),
    },
    license: {
      ...PUPPET_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<PuppetModulePayload>(
        (payload) => payload.current_release?.metadata?.license
      ),
    },
    score: {
      ...PUPPET_ENDPOINT,
      defaultColor: 'emerald',
      defaultIcon: 'gauge',
      defaultLabel: 'puppet score',
      transform: createScoreTransform<PuppetModulePayload>(
        (payload) => [payload.feedback_score, MAX_PUPPET_SCORE],
        formatPercent
      ),
    },
    v: {
      ...PUPPET_ENDPOINT,
      defaultColor: 'amber',
      defaultIcon: 'puppet',
      defaultLabel: 'puppet forge',
      transform: createVersionTransform<PuppetModulePayload>(
        (payload) => payload.current_release?.version
      ),
    },
  },
  ownerMode: 'required',
};
