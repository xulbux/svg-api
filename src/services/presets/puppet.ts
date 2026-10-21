/**
 * Puppet Forge service preset – Module version, total downloads, license, and community feedback score with a ring gauge (`/badge/puppet/:owner/:module/:metric`).
 *
 * Version and license come from the newest release (`/v3/releases?limit=1`, `~5 KB` with
 * `exclude_fields`); Downloads and the feedback score need the module document, which ignores
 * `exclude_fields` (`~300 KB`), so only its two counters are kept in the caches.
 */

import { createEndpoint, defineService, isJsonObject, pickFields } from '@/services/endpoint';
import {
  SCORE,
  createDownloadsMetric,
  createLicenseMetric,
  createPercentScoreMetric,
  createVersionMetric,
  readText,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Puppet Forge module API payload (`forgeapi.puppet.com/v3/modules/:owner-:module`). */
interface PuppetModulePayload {
  /** All-time downloads of every release. */
  downloads: number;
  /** Community feedback score (`0`–`100`), or `null` without feedback. */
  feedback_score: number | null;
}

/** Projected Puppet Forge newest release metadata (`forgeapi.puppet.com/v3/releases?module=:owner-:module`). */
interface PuppetReleaseProjection {
  /** SPDX license identifier from `metadata.license`. */
  license?: string;
  /** Release version. */
  version?: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Puppet Forge module endpoint (only the download and feedback counters are cached). */
const MODULE_ENDPOINT = createEndpoint({
  api: ({ owner, target }) =>
    `https://forgeapi.puppet.com/v3/modules/${encodeURIComponent(owner)}-${encodeURIComponent(target)}`,
  page: 'https://forge.puppet.com/modules/{owner}/{target}',
  project: pickFields<PuppetModulePayload>(['downloads', 'feedback_score']),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Project the first entry of a Puppet Forge releases response to its version and license. */
function projectPuppetRelease(data: unknown): PuppetReleaseProjection | undefined {
  const results = isJsonObject(data) ? data.results : undefined;
  const firstEntry: unknown = Array.isArray(results) ? results[0] : undefined;
  if (!isJsonObject(firstEntry)) {
    return undefined;
  }
  const metadata = isJsonObject(firstEntry.metadata) ? firstEntry.metadata : undefined;
  return { license: readText(metadata?.license), version: readText(firstEntry.version) };
}

/** Puppet Forge newest release endpoint (an empty `results` list is not found). */
const RELEASE_ENDPOINT = createEndpoint({
  api: ({ owner, target }) =>
    `https://forgeapi.puppet.com/v3/releases?module=${encodeURIComponent(`${owner}-${target}`)}&limit=1&sort_by=release_date&exclude_fields=readme,changelog,license,reference,tasks,plans`,
  page: 'https://forge.puppet.com/modules/{owner}/{target}',
  project: projectPuppetRelease,
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
    license: createLicenseMetric(RELEASE_ENDPOINT, (release) => release.license),
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
