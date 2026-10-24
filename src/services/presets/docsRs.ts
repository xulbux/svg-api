/**
 * docs.rs service preset – Live upstream metrics and redirect transformations.
 */

import { createEndpoint, createMetric, defineService, isJsonObject } from '@/services/endpoint';
import {
  FAILING_STATUS,
  PASSING_STATUS,
  UNKNOWN_STATUS,
  createVersionMetric,
  readText,
} from '@/services/metrics';
import type { MetricResult } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected docs.rs crate status metadata (`docs.rs/crate/:crate/latest/status.json`). */
interface DocsRsStatusProjection {
  /** Whether the latest crate documentation build succeeded (`undefined` while queued or missing). */
  hasDocs?: boolean;
  /** Latest crate version processed by docs.rs. */
  version?: string;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Project a docs.rs status payload to its boolean build flag and latest crate version. */
function projectDocsRsStatus(data: unknown): DocsRsStatusProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  return {
    hasDocs: typeof data.doc_status === 'boolean' ? data.doc_status : undefined,
    version: readText(data.version),
  };
}

/** Transform a docs.rs status projection into `passing`, `failing`, or `unknown`. */
function transformDocsRsStatus(payload: DocsRsStatusProjection): Partial<MetricResult> {
  if (payload.hasDocs === true) {
    return PASSING_STATUS;
  }
  if (payload.hasDocs === false) {
    return FAILING_STATUS;
  }
  return UNKNOWN_STATUS;
}

/** docs.rs crate status endpoint with crate documentation page redirect. */
const DOCSRS_ENDPOINT = createEndpoint({
  api: 'https://docs.rs/crate/{target}/latest/status.json',
  page: 'https://docs.rs/{target}',
  project: projectDocsRsStatus,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Rust docs.rs service preset (`docsrs`). */
export const DOCSRS_SERVICE = defineService({
  docs: {
    description: 'Rust crate documentation build status (passing or failing) and latest version.',
    title: 'docs.rs',
  },
  metricAliases: { build: 'docs', status: 'docs' },
  metrics: {
    docs: createMetric(
      DOCSRS_ENDPOINT,
      {
        defaultColor: 'emerald',
        defaultIcon: 'docsdotrs',
        defaultLabel: 'docs.rs',
        hasDynamicColor: true,
        hasDynamicIcon: true,
      },
      transformDocsRsStatus
    ),
    v: createVersionMetric(
      DOCSRS_ENDPOINT,
      { defaultColor: 'amber', defaultIcon: 'docsdotrs', defaultLabel: 'docs.rs' },
      (status) => status.version
    ),
  },
  route: { target: { placeholder: ':crate' } },
});
