/**
 * Zenodo service preset – Record downloads, unique downloads, views, and DOI (`/badge/zenodo/:record/:metric`).
 *
 * Statistics cover every version of the record; Concept record ids redirect to the latest version.
 */

import {
  CACHE_TTL,
  createEndpoint,
  createMetric,
  defineService,
  pickFields,
} from '@/services/endpoint';
import { createCountMetric, createDownloadsMetric } from '@/services/metrics';
import type { MetricResult } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Usage statistics of a Zenodo record. */
interface ZenodoStats {
  /** Total file downloads. */
  downloads?: number;
  /** Unique file downloads. */
  unique_downloads?: number;
  /** Total page views. */
  views?: number;
}

/** Partial Zenodo record payload (`zenodo.org/api/records/:record`). */
interface ZenodoRecordPayload {
  /** Version DOI (e.g., `'10.5281/zenodo.3835582'`). */
  doi: string;
  /** Usage statistics across every version of the record. */
  stats: ZenodoStats | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Zenodo record endpoint (statistics refresh daily) with record page redirect. */
const ZENODO_ENDPOINT = createEndpoint({
  api: 'https://zenodo.org/api/records/{target}',
  page: 'https://zenodo.org/records/{target}',
  project: pickFields<ZenodoRecordPayload>(['doi', 'stats']),
  ttl: CACHE_TTL.daily,
});

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a numeric Zenodo record id. */
const ZENODO_RECORD_ID_RX = /^\d{1,12}$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Transform a Zenodo record into its DOI. */
function transformZenodoDoi(record: Partial<ZenodoRecordPayload>): Partial<MetricResult> {
  return { value: typeof record.doi === 'string' && record.doi !== '' ? record.doi : 'n/a' };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Zenodo service preset (`zenodo`). */
export const ZENODO_SERVICE = defineService({
  docs: {
    description:
      'All-version downloads (dt), unique downloads, views, and DOI of a numeric record id.',
    title: 'Zenodo',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    doi: createMetric(
      ZENODO_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'zenodo', defaultLabel: 'doi' },
      transformZenodoDoi
    ),
    dt: createDownloadsMetric(ZENODO_ENDPOINT, 'dt', (record) => record.stats?.downloads),
    unique: createDownloadsMetric(
      ZENODO_ENDPOINT,
      'dt',
      (record) => record.stats?.unique_downloads,
      { defaultLabel: 'unique downloads' }
    ),
    views: createCountMetric(
      ZENODO_ENDPOINT,
      { defaultColor: 'violet', defaultIcon: 'eye', defaultLabel: 'views' },
      (record) => record.stats?.views
    ),
  },
  route: { target: { pattern: ZENODO_RECORD_ID_RX, placeholder: ':record' } },
});
