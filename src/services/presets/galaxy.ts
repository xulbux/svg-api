/**
 * Ansible Galaxy service preset – Collection version and total downloads (`/badge/galaxy/:namespace/:collection/:metric`).
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createDownloadsMetric, createVersionMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Published version of a Galaxy collection. */
interface GalaxyCollectionVersion {
  /** Version string. */
  version?: string;
}

/** Partial Galaxy collection index payload (`galaxy.ansible.com/api/v3/…/collections/index/:ns/:name/`). */
interface GalaxyCollectionPayload {
  /** All-time collection downloads. */
  download_count: number;
  /** Highest published version. */
  highest_version: GalaxyCollectionVersion | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Galaxy collection index endpoint (trailing slash required) with collection page redirect. */
const GALAXY_ENDPOINT = createEndpoint({
  api: 'https://galaxy.ansible.com/api/v3/plugin/ansible/content/published/collections/index/{owner}/{target}/',
  page: 'https://galaxy.ansible.com/ui/repo/published/{owner}/{target}/',
  project: pickFields<GalaxyCollectionPayload>(['download_count', 'highest_version']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Ansible Galaxy collection service preset (`galaxy`). */
export const GALAXY_SERVICE = defineService({
  docs: {
    description: 'Highest published collection version and total downloads.',
    title: 'Ansible Galaxy',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: createDownloadsMetric(GALAXY_ENDPOINT, 'dt', (collection) => collection.download_count),
    v: createVersionMetric(
      GALAXY_ENDPOINT,
      { defaultColor: 'slate', defaultIcon: 'ansible', defaultLabel: 'galaxy' },
      (collection) => collection.highest_version?.version
    ),
  },
  route: {
    owner: { isRequired: true, placeholder: ':namespace' },
    target: { placeholder: ':collection' },
  },
});
