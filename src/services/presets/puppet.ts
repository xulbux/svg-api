/**
 * Puppet Forge service preset – Module version, total downloads, license, and community feedback score with a ring gauge (`/badge/puppet/:owner/:module/:metric`).
 *
 * Version and license come from the newest release (`/v3/releases?limit=1`, `~5 KB` with
 * `exclude_fields`); Downloads and the feedback score need the module document, which ignores
 * `exclude_fields` (`~300 KB`), so only its two counters are kept in the caches.
 */

import { createEndpoint, defineService, pickFields, projectFirstEntry } from '@/services/endpoint';
import {
  createDownloadsMetric,
  createLicenseMetric,
  createPercentScoreMetric,
  createVersionMetric,
  SCORE,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Puppet Forge module API payload (`forgeapi.puppet.com/v3/modules/:owner-:module`). */
interface PuppetModulePayload {
  /** All-time downloads of every release. */
  downloads: number;
  /** Community feedback score (`0`–`100`), or `null` without feedback. */
  feedback_score: number | null;
}

/** Release `metadata.json` contents of a Puppet Forge release. */
interface PuppetReleaseMetadata {
  /** SPDX license identifier. */
  license?: string;
}

/** Single release entry of a Puppet Forge releases API response (`forgeapi.puppet.com/v3/releases?module=:owner-:module`). */
interface PuppetReleaseEntry {
  /** Release `metadata.json` contents. */
  metadata: PuppetReleaseMetadata | null;
  /** Release version. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Puppet Forge module endpoint (only the download and feedback counters are cached). */
const MODULE_ENDPOINT = createEndpoint({
  api: ({ owner, target }) =>
    `https://forgeapi.puppet.com/v3/modules/${encodeURIComponent(owner)}-${encodeURIComponent(target)}`,
  page: 'https://forge.puppet.com/modules/{owner}/{target}',
  project: pickFields<PuppetModulePayload>(['downloads', 'feedback_score']),
});

/** Puppet Forge newest release endpoint (an empty `results` list is not found). */
const RELEASE_ENDPOINT = createEndpoint({
  api: ({ owner, target }) =>
    `https://forgeapi.puppet.com/v3/releases?module=${encodeURIComponent(`${owner}-${target}`)}&limit=1&sort_by=release_date&exclude_fields=readme,changelog,license,reference,tasks,plans`,
  page: 'https://forge.puppet.com/modules/{owner}/{target}',
  project: projectFirstEntry<PuppetReleaseEntry>('results', ['metadata', 'version']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Puppet Forge service preset (`puppet`). */
export const PUPPET_SERVICE = defineService({
  docs: {
    description: 'Latest version, total downloads, license, and feedback score (ring gauge).',
    title: 'Puppet Forge',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: createDownloadsMetric(MODULE_ENDPOINT, 'dt', (module) => module.downloads),
    license: createLicenseMetric(RELEASE_ENDPOINT, (release) => release.metadata?.license),
    score: createPercentScoreMetric(
      MODULE_ENDPOINT,
      { ...SCORE, defaultLabel: 'puppet score' },
      (module) => module.feedback_score
    ),
    v: createVersionMetric(
      RELEASE_ENDPOINT,
      { defaultColor: 'amber', defaultIcon: 'puppet', defaultLabel: 'puppet forge' },
      (release) => release.version
    ),
  },
  route: { owner: { isRequired: true, placeholder: ':owner' }, target: { placeholder: ':module' } },
});
