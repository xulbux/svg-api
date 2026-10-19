/**
 * Ansible Galaxy service preset – Collection version and total downloads (`/badge/galaxy/:namespace/:collection/:metric`).
 */

import { createCountTransform, createVersionTransform, TOTAL_DOWNLOADS } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Galaxy collection index payload (`galaxy.ansible.com/api/v3/.../collections/index/:ns/:name/`). */
interface GalaxyCollectionPayload {
  /** All-time collection downloads. */
  download_count: number;
  /** Highest published version. */
  highest_version: {
    /** Version string. */
    version?: string;
  };
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Galaxy collection index endpoint (trailing slash required) with collection page redirect. */
const GALAXY_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (namespace: string, collection: string): string =>
    `https://galaxy.ansible.com/api/v3/plugin/ansible/content/published/collections/index/${namespace}/${collection}/`,
  buildRedirectUrl: (namespace: string, collection: string): string =>
    `https://galaxy.ansible.com/ui/repo/published/${namespace}/${collection}/`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Ansible Galaxy collection service preset (`galaxy`). */
export const GALAXY_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Highest published collection version and total downloads.',
    ownerName: ':namespace',
    targetName: ':collection',
    title: 'Ansible Galaxy',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: {
      ...GALAXY_ENDPOINT,
      ...TOTAL_DOWNLOADS,
      transform: createCountTransform<GalaxyCollectionPayload>((payload) => payload.download_count),
    },
    v: {
      ...GALAXY_ENDPOINT,
      defaultColor: 'slate',
      defaultIcon: 'ansible',
      defaultLabel: 'galaxy',
      transform: createVersionTransform<GalaxyCollectionPayload>(
        (payload) => payload.highest_version?.version
      ),
    },
  },
  ownerMode: 'required',
};
