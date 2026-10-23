/**
 * docs.rs service preset – Live upstream metrics and redirect transformations.
 */

import { createEndpoint, createMetric, defineService, pickFields } from '@/services/endpoint';
import { createVersionMetric } from '@/services/metrics';
import type { MetricResult } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial docs.rs crate status payload (`docs.rs/crate/:crate/latest/status.json`). */
interface DocsRsStatusPayload {
  /** Whether the latest crate documentation build succeeded. */
  doc_status: boolean;
  /** Latest crate version processed by docs.rs. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Badge properties of a passing docs.rs build. */
const PASSING_DOCS: Partial<MetricResult> = {
  color: 'emerald',
  icon: 'circle-check',
  value: 'passing',
};

/** Badge properties of a failing docs.rs build. */
const FAILING_DOCS: Partial<MetricResult> = { color: 'rose', icon: 'circle-x', value: 'failing' };

/** Badge properties when `doc_status` is absent or non-boolean. */
const UNKNOWN_DOCS: Partial<MetricResult> = {
  color: 'slate',
  icon: 'circle-help',
  value: 'unknown',
};

/** docs.rs crate status endpoint with crate documentation page redirect. */
const DOCSRS_ENDPOINT = createEndpoint({
  api: 'https://docs.rs/crate/{target}/latest/status.json',
  page: 'https://docs.rs/{target}',
  project: pickFields<DocsRsStatusPayload>(['doc_status', 'version']),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Transform a docs.rs status payload into `passing`, `failing`, or `unknown`. */
function transformDocsRsStatus(payload: Partial<DocsRsStatusPayload>): Partial<MetricResult> {
  if (payload.doc_status === true) {
    return PASSING_DOCS;
  }
  if (payload.doc_status === false) {
    return FAILING_DOCS;
  }
  return UNKNOWN_DOCS;
}

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
      { defaultColor: 'emerald', defaultIcon: 'docsdotrs', defaultLabel: 'docs.rs' },
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
