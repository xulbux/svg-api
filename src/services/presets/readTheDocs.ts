/**
 * Read the Docs service preset – Status of the most recent build of the `latest` documentation version (`/badge/rtd/:project/:metric`).
 */

import { createEndpoint, createMetric, defineService, isJsonObject } from '@/services/endpoint';
import { buildRatioSpecials, readFiniteNumber } from '@/services/metrics';
import type { BadgeSpecialKind, BadgeSpecialMap, MetricResult, StripTickState } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** State of a Read the Docs build. */
interface ReadTheDocsBuildState {
  /** Build state code (`triggered`, `cloning`, `installing`, `building`, `uploading`, `finished`, `cancelled`). */
  code?: string;
}

/** Partial build entry of a Read the Docs builds payload (`readthedocs.org/api/v3/projects/:project/versions/latest/builds/`). */
interface ReadTheDocsBuild {
  /** Build duration in seconds. */
  duration?: number | null;
  /** Build state. */
  state?: ReadTheDocsBuildState | null;
  /** Whether the finished build succeeded. */
  success?: boolean | null;
}

/** Projected Read the Docs recent build history (`?limit=10`). */
interface ReadTheDocsProjection {
  /** Chronological build durations in seconds across recent builds. */
  durations?: number[];
  /** Most recent build state and success flag. */
  latest: ReadTheDocsBuild;
  /** Number of successful builds in the recent window. */
  passedCount: number;
  /** Chronological health ticks (`'9'` passed, `'5'` building, `'3'` cancelled, `'0'` failed). */
  states: StripTickState[];
  /** Total number of recent builds inspected. */
  totalCount: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Automatic inline widget kinds supported by Read the Docs `build`. */
const RTD_SPECIALS: readonly BadgeSpecialKind[] = [
  'strip',
  'steps',
  'ring',
  'bar',
  'bars',
  'sparkline',
];

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

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a valid Read the Docs project slug (DNS subdomain label: Alphanumeric, hyphens allowed after the first character). */
const READ_THE_DOCS_PROJECT_RX = /^[a-z\d][a-z\d-]*$/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Map a single Read the Docs build entry to its strip tick state (`'9'`, `'5'`, `'3'`, `'0'`). */
function toBuildTickState(build: ReadTheDocsBuild): StripTickState {
  const code = build.state?.code;
  if (code === 'finished') {
    return build.success === true ? '9' : '0';
  }
  if (code === 'cancelled') {
    return '3';
  }
  return typeof code === 'string' && IN_PROGRESS_STATES.has(code) ? '5' : '3';
}

/** Project Read the Docs builds (`?limit=10`) to the newest build plus chronological history. */
function projectReadTheDocsBuilds(data: unknown): ReadTheDocsProjection | undefined {
  const results = isJsonObject(data) ? data.results : undefined;
  const firstEntry: unknown = Array.isArray(results) ? results[0] : undefined;
  if (!isJsonObject(firstEntry)) {
    return undefined;
  }
  const recent: ReadTheDocsBuild[] = [];
  for (const item of (results as unknown[]).slice(0, 10)) {
    if (isJsonObject(item)) {
      const state = isJsonObject(item.state)
        ? { code: typeof item.state.code === 'string' ? item.state.code : undefined }
        : undefined;
      recent.push({
        duration: readFiniteNumber(item.duration),
        state,
        success: typeof item.success === 'boolean' ? item.success : undefined,
      });
    }
  }
  const latest = recent[0] ?? {};
  const chronological = recent.toReversed();
  const states: StripTickState[] = [];
  const durations: number[] = [];
  let passedCount = 0;
  for (const entry of chronological) {
    const tick = toBuildTickState(entry);
    states.push(tick);
    if (tick === '9') {
      passedCount += 1;
    }
    if (typeof entry.duration === 'number' && entry.duration >= 0) {
      durations.push(entry.duration);
    }
  }
  return {
    durations: durations.length >= 2 ? durations : undefined,
    latest,
    passedCount,
    states,
    totalCount: chronological.length,
  };
}

/** Transform the most recent build and history into status and automatic widgets. */
function transformReadTheDocsBuild(projection: ReadTheDocsProjection): Partial<MetricResult> {
  const { durations, latest, passedCount, states, totalCount } = projection;
  const stateCode = latest.state?.code;
  let base: Partial<MetricResult> = UNKNOWN_BUILD;
  if (stateCode === 'finished') {
    base = latest.success === true ? PASSING_BUILD : FAILING_BUILD;
  } else if (stateCode === 'cancelled') {
    base = CANCELLED_BUILD;
  } else if (typeof stateCode === 'string' && IN_PROGRESS_STATES.has(stateCode)) {
    base = RUNNING_BUILD;
  }
  const ratio = buildRatioSpecials(passedCount, totalCount);
  const specials: BadgeSpecialMap = {
    ...ratio,
    ...(durations
      ? {
          bars: { type: 'bars', values: durations },
          sparkline: { type: 'sparkline', values: durations },
        }
      : {}),
    ...(totalCount > 0 ? { steps: { done: passedCount, total: totalCount, type: 'steps' } } : {}),
    ...(states.length > 0 ? { strip: { states, type: 'strip' } } : {}),
  };
  return { ...base, specials };
}

/** Read the Docs latest-version builds endpoint (`limit=10`) with hosted documentation redirect. */
const READ_THE_DOCS_ENDPOINT = createEndpoint({
  api: 'https://readthedocs.org/api/v3/projects/{target}/versions/latest/builds/?limit=10',
  page: 'https://{target}.readthedocs.io/',
  project: projectReadTheDocsBuilds,
});

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
      {
        autoSpecials: RTD_SPECIALS,
        defaultColor: 'emerald',
        defaultIcon: 'readthedocs',
        defaultLabel: 'Docs',
      },
      transformReadTheDocsBuild
    ),
  },
  route: { target: { pattern: READ_THE_DOCS_PROJECT_RX, placeholder: ':project' } },
});
