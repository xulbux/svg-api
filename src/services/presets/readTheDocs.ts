/**
 * Read the Docs service preset – Status of the most recent documentation build (`/badge/rtd/:project/:metric`).
 */

import { createFirstEntryTransform } from '@/services/metrics';
import type { MetricEndpoint, MetricResult, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial build entry of a Read the Docs builds payload. */
interface ReadTheDocsBuild {
  /** Build state. */
  state?: {
    /** Build state code (`triggered`, `building`, `finished`, …). */
    code?: string;
  };
  /** Whether the finished build succeeded. */
  success?: boolean | null;
}

/** Partial Read the Docs builds API payload (`readthedocs.org/api/v3/projects/:project/builds/`). */
interface ReadTheDocsBuildsPayload {
  /** Builds, newest first. */
  results: ReadTheDocsBuild[];
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

/** Badge properties of a build that has not finished yet. */
const RUNNING_BUILD: Partial<MetricResult> = { color: 'amber', icon: 'loader', value: 'building' };

/** Read the Docs latest build endpoint with hosted documentation redirect. */
const READ_THE_DOCS_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, project: string): string =>
    `https://readthedocs.org/api/v3/projects/${project}/builds/?limit=1`,
  buildRedirectUrl: (_owner: string, project: string): string =>
    `https://${project}.readthedocs.io/`,
};

// -------------------------------------- INTERNALS --------------------------------------

/** Read the build list of a Read the Docs builds payload. */
function readReadTheDocsBuilds(payload: Partial<ReadTheDocsBuildsPayload>): unknown {
  return payload.results;
}

/** Transform the most recent build into a `passing`, `failing`, or `building` status. */
function transformReadTheDocsBuild(data: unknown): Partial<MetricResult> {
  const build = data as ReadTheDocsBuild;
  if (build.state?.code !== 'finished') {
    return RUNNING_BUILD;
  }
  return build.success === true ? PASSING_BUILD : FAILING_BUILD;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Read the Docs service preset (`rtd`). */
export const READ_THE_DOCS_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Status of the most recent documentation build (passing, failing, or building).',
    targetName: ':project',
    title: 'Read the Docs',
  },
  metricAliases: { status: 'build' },
  metrics: {
    build: {
      ...READ_THE_DOCS_ENDPOINT,
      defaultColor: 'emerald',
      defaultIcon: 'readthedocs',
      defaultLabel: 'docs',
      transform: createFirstEntryTransform<ReadTheDocsBuildsPayload>(
        readReadTheDocsBuilds,
        transformReadTheDocsBuild
      ),
    },
  },
  ownerMode: 'none',
};
