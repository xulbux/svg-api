/**
 * Read the Docs Service Preset
 *
 * Live upstream metrics and redirect transformations for Read the Docs.
 */

import {
  createEndpoint,
  createMetric,
  defineService,
  isJsonObject,
  readFirstObjectEntry,
  readJsonObject,
} from '@/services/endpoint';
import {
  FAILING_STATUS,
  PASSING_STATUS,
  UNKNOWN_STATUS,
  buildRatioSpecials,
  computeScaledSteps,
  readFiniteNumber,
} from '@/services/metrics';
import { MAX_STEPS_COUNT, MAX_STRIP_TICKS, MIN_SERIES_POINTS } from '@/svg/renderer';
import type { BadgeSpecialKind, BadgeSpecialMap, MetricResult, StripTickState } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** State of a Read the Docs build. */
interface ReadTheDocsBuildState {
  /** Build state code (`triggered`, `cloning`, `installing`, `building`, `uploading`, `finished`, `cancelled`). */
  code?: string;
}

/** Projected build entry of a Read the Docs builds payload (`readthedocs.org/api/v3/projects/:project/versions/latest/builds/`). */
interface ReadTheDocsBuild {
  /** Whether the finished build succeeded. */
  isSuccess?: boolean;
  /** Build state. */
  state?: ReadTheDocsBuildState;
}

/** Projected Read the Docs recent build history. */
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

/** Badge properties of a build that is still in progress. */
const RUNNING_BUILD: Partial<MetricResult> = { color: 'amber', icon: 'loader', value: 'building' };

/** Badge properties of a cancelled build. */
const CANCELLED_BUILD: Partial<MetricResult> = {
  color: 'slate',
  icon: 'circle-slash',
  value: 'cancelled',
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a valid Read the Docs project slug (DNS subdomain label: `1`–`63` chars, alphanumeric endpoints, inner hyphens). */
const READ_THE_DOCS_PROJECT_RX = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Check whether a Read the Docs build state code denotes an active build. */
function isInProgressState(code: string | undefined): boolean {
  return (
    code === 'building' ||
    code === 'cloning' ||
    code === 'installing' ||
    code === 'triggered' ||
    code === 'uploading'
  );
}

/** Map a single Read the Docs build entry to its strip tick state (`'9'`, `'5'`, `'3'`, `'0'`). */
function resolveBuildTickState(build: ReadTheDocsBuild): StripTickState {
  const code = build.state?.code;
  if (code === 'finished') {
    return build.isSuccess === true ? '9' : '0';
  }
  if (code === 'cancelled') {
    return '3';
  }
  return isInProgressState(code) ? '5' : '3';
}

/** Project Read the Docs builds to the newest build plus chronological history in a single pass. */
function projectReadTheDocsBuilds(data: unknown): ReadTheDocsProjection | undefined {
  const results = readJsonObject(data)?.results;
  if (!readFirstObjectEntry(results)) {
    return undefined;
  }
  const items = results as unknown[];
  const bound = Math.min(items.length, MAX_STRIP_TICKS);
  const states: StripTickState[] = [];
  const durations: number[] = [];
  let latest: ReadTheDocsBuild = {};
  let passedCount = 0;

  for (let i = bound - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (isJsonObject(item)) {
      const rawState = readJsonObject(item.state);
      const entry: ReadTheDocsBuild = {
        isSuccess: typeof item.success === 'boolean' ? item.success : undefined,
        state: rawState
          ? { code: typeof rawState.code === 'string' ? rawState.code : undefined }
          : undefined,
      };
      if (i === 0) {
        latest = entry;
      }
      const tick = resolveBuildTickState(entry);
      states.push(tick);
      if (tick === '9') {
        passedCount += 1;
      }
      const duration = readFiniteNumber(item.duration);
      if (duration !== undefined && duration >= 0) {
        durations.push(duration);
      }
    }
  }
  return {
    durations: durations.length >= MIN_SERIES_POINTS ? durations : undefined,
    latest,
    passedCount,
    states,
    totalCount: states.length,
  };
}

/** Transform the most recent build and history into status and automatic widgets. */
function transformReadTheDocsBuild(projection: ReadTheDocsProjection): Partial<MetricResult> {
  const { durations, latest, passedCount, states, totalCount } = projection;
  const stateCode = latest.state?.code;
  let base: Partial<MetricResult> = UNKNOWN_STATUS;
  if (stateCode === 'finished') {
    base = latest.isSuccess === true ? PASSING_STATUS : FAILING_STATUS;
  } else if (stateCode === 'cancelled') {
    base = CANCELLED_BUILD;
  } else if (isInProgressState(stateCode)) {
    base = RUNNING_BUILD;
  }
  const ratio = buildRatioSpecials(passedCount, totalCount);
  const stepTotal = Math.min(MAX_STEPS_COUNT, totalCount);
  const stepDone = computeScaledSteps(passedCount, totalCount, stepTotal);
  const specials: BadgeSpecialMap = {
    ...ratio,
    ...(durations
      ? {
          bars: { type: 'bars', values: durations },
          sparkline: { type: 'sparkline', values: durations },
        }
      : {}),
    ...(stepTotal > 0 ? { steps: { done: stepDone, total: stepTotal, type: 'steps' } } : {}),
    ...(states.length > 0 ? { strip: { states, type: 'strip' } } : {}),
  };
  return { ...base, specials };
}

/** Read the Docs latest-version builds endpoint (`limit=10`) with hosted documentation redirect. */
const READ_THE_DOCS_ENDPOINT = createEndpoint({
  api: 'https://readthedocs.org/api/v3/projects/{target}/versions/latest/builds/?limit=10',
  extractKeys: ['results'],
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
        hasDynamicColor: true,
        hasDynamicIcon: true,
      },
      transformReadTheDocsBuild
    ),
  },
  route: { target: { pattern: READ_THE_DOCS_PROJECT_RX, placeholder: ':project' } },
});
