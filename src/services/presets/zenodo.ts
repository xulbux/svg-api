/**
 * Zenodo service preset – Record version, license, downloads, unique downloads, views, and DOI (`/badge/zenodo/:record/:metric`).
 *
 * Statistics cover every version of the record; Concept record ids redirect to the latest version.
 */

import { CACHE_TTL, createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  RATIO_SPECIALS,
  buildRatioSpecials,
  createCountMetric,
  createDownloadsMetric,
  createLicenseMetric,
  createTextMetric,
  createVersionMetric,
  readFiniteNumber,
  readLicenseName,
  readText,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Zenodo record metadata (`zenodo.org/api/records/:record`). */
interface ZenodoRecordProjection {
  /** Version DOI (e.g., `'10.5281/zenodo.3835582'`). */
  doi?: string;
  /** Total file downloads. */
  downloads?: number;
  /** SPDX license identifier from `metadata.license.id`. */
  license?: string;
  /** Unique file downloads. */
  uniqueDownloads?: number;
  /** Record version from `metadata.version`. */
  version?: string;
  /** Total page views. */
  views?: number;
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a numeric Zenodo record id. */
const ZENODO_RECORD_ID_RX = /^\d{1,12}$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Project a Zenodo record payload to its DOI, metadata version/license, and usage statistics. */
function projectZenodoRecord(data: unknown): ZenodoRecordProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const metadata = isJsonObject(data.metadata) ? data.metadata : undefined;
  const stats = isJsonObject(data.stats) ? data.stats : undefined;
  return {
    doi: readText(data.doi),
    downloads: readFiniteNumber(stats?.downloads),
    license: readLicenseName(metadata?.license),
    uniqueDownloads: readFiniteNumber(stats?.unique_downloads),
    version: readText(metadata?.version),
    views: readFiniteNumber(stats?.views),
  };
}

/** Zenodo record endpoint (statistics refresh daily) with record page redirect. */
const ZENODO_ENDPOINT = createEndpoint({
  api: 'https://zenodo.org/api/records/{target}',
  page: 'https://zenodo.org/records/{target}',
  project: projectZenodoRecord,
  ttl: CACHE_TTL.daily,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Zenodo service preset (`zenodo`). */
export const ZENODO_SERVICE = defineService({
  docs: {
    description:
      'Record version, license, all-version downloads (dt), unique downloads, views, and DOI.',
    title: 'Zenodo',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    doi: createTextMetric(
      ZENODO_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'zenodo', defaultLabel: 'doi' },
      (record) => record.doi
    ),
    dt: createDownloadsMetric(ZENODO_ENDPOINT, 'dt', (record) => record.downloads),
    license: createLicenseMetric(ZENODO_ENDPOINT, (record) => record.license),
    unique: createDownloadsMetric(
      ZENODO_ENDPOINT,
      'dt',
      (record) => record.uniqueDownloads,
      { autoSpecials: RATIO_SPECIALS, defaultLabel: 'unique downloads' },
      (record) => buildRatioSpecials(record.uniqueDownloads, record.downloads)
    ),
    v: createVersionMetric(
      ZENODO_ENDPOINT,
      { defaultColor: 'blue', defaultIcon: 'zenodo', defaultLabel: 'zenodo' },
      (record) => record.version
    ),
    views: createCountMetric(
      ZENODO_ENDPOINT,
      { defaultColor: 'violet', defaultIcon: 'eye', defaultLabel: 'views' },
      (record) => record.views
    ),
  },
  route: { target: { pattern: ZENODO_RECORD_ID_RX, placeholder: ':record' } },
});
