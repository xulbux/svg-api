/**
 * Read the Docs service preset – Status of the most recent build of the `latest` documentation version (`/badge/rtd/:project/:metric`).
 */

import {
  createEndpoint,
  createMetric,
  defineService,
  projectFirstEntry,
} from '@/services/endpoint';
import type { MetricResult } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** State of a Read the Docs build. */
interface ReadTheDocsBuildState {
  /** Build state code (`triggered`, `cloning`, `installing`, `building`, `uploading`, `finished`, `cancelled`). */
  code?: string;
}

/** Partial build entry of a Read the Docs builds payload (`readthedocs.org/api/v3/projects/:project/versions/latest/builds/`). */
interface ReadTheDocsBuild {
  /** Build state. */
  state: ReadTheDocsBuildState | null;
  /** Whether the finished build succeeded. */
  success: boolean | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Badge properties of a successful build. */
const PASSING_BUILD: Partial<MetricResult> = {
  color: 'emerald',
  icon: 'circle-check',
  value: 'passing',
};

/** Badge properties of a failed build. */
const FAILING_BUILD: Partial<MetricResult> = { color: 'rose', icon: 'circle-x', value: 'failing' };

/** Badge properties of a build that is still in progress. */
const RUNNING_BUILD: Partial<MetricResult> = { color: 'amber', icon: 'loader', value: 'building' };

/** Badge properties of a cancelled build. */
const CANCELLED_BUILD: Partial<MetricResult> = {
  color: 'slate',
  icon: 'circle-slash',
  value: 'cancelled',
};

/** Badge properties of a build in an unknown state. */
const UNKNOWN_BUILD: Partial<MetricResult> = {
  color: 'slate',
  icon: 'circle-help',
  value: 'unknown',
};

/** Build state codes of builds that are still in progress. */
const IN_PROGRESS_STATES: ReadonlySet<string> = new Set([
  'building',
  'cloning',
  'installing',
  'triggered',
  'uploading',
]);

/** Read the Docs latest-version build endpoint (newest build only) with hosted documentation redirect. */
const READ_THE_DOCS_ENDPOINT = createEndpoint({
  api: 'https://readthedocs.org/api/v3/projects/{target}/versions/latest/builds/?limit=1',
  page: ({ target }) => `https://${encodeURIComponent(target)}.readthedocs.io/`,
  project: projectFirstEntry<ReadTheDocsBuild>('results', ['state', 'success']),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Transform the most recent build into a `passing`, `failing`, `building`, or `cancelled` status. */
function transformReadTheDocsBuild(build: Partial<ReadTheDocsBuild>): Partial<MetricResult> {
  const stateCode = build.state?.code;
  if (stateCode === 'finished') {
    return build.success === true ? PASSING_BUILD : FAILING_BUILD;
  }
  if (stateCode === 'cancelled') {
    return CANCELLED_BUILD;
  }
  return typeof stateCode === 'string' && IN_PROGRESS_STATES.has(stateCode)
    ? RUNNING_BUILD
    : UNKNOWN_BUILD;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Read the Docs service preset (`rtd`). */
export const READ_THE_DOCS_SERVICE = defineService({
  docs: {
    description:
      'Status of the latest documentation build (passing, failing, building, or cancelled).',
    title: 'Read the Docs',
  },
  metricAliases: { status: 'build' },
  metrics: {
    build: createMetric(
      READ_THE_DOCS_ENDPOINT,
      { defaultColor: 'emerald', defaultIcon: 'readthedocs', defaultLabel: 'docs' },
      transformReadTheDocsBuild
    ),
  },
  route: { target: { placeholder: ':project' } },
});
