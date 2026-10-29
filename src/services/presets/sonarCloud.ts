/**
 * SonarCloud service preset – Live upstream metrics and redirect transformations.
 *
 * Every metric reads one shared measures request whose measures are projected into a small
 * `metric -> value` map.
 */

import {
  asJsonObject,
  createEndpoint,
  createMetric,
  defineService,
  isJsonObject,
  readFirstObjectEntry,
} from '@/services/endpoint';
import {
  buildRatioSpecials,
  computeProgressPercent,
  computeScaledSteps,
  createCoverageMetric,
  formatCompactNumber,
  formatCount,
  formatPercent,
  formatPointDelta,
  toFiniteNumber,
} from '@/services/metrics';
import { MAX_STEPS_COUNT, MAX_STRIP_TICKS } from '@/svg/renderer';
import { getOwnValue } from '@/svg/shared';
import type {
  BadgeSpecialKind,
  BadgeSpecialMap,
  MetricPresentation,
  MetricResult,
  ServiceMetricConfig,
  StripTickState,
  ThemeColorName,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** SonarCloud measure keys requested by the preset. */
type SonarMeasureKey =
  | 'alert_status'
  | 'bugs'
  | 'code_smells'
  | 'coverage'
  | 'duplicated_lines_density'
  | 'new_bugs'
  | 'new_code_smells'
  | 'new_coverage'
  | 'new_duplicated_lines_density'
  | 'new_vulnerabilities'
  | 'quality_gate_details'
  | 'reliability_rating'
  | 'security_rating'
  | 'sqale_rating'
  | 'vulnerabilities';

/** Projected SonarCloud measures (`component.measures[]` as `metric -> value`). */
type SonarMeasures = Partial<Record<SonarMeasureKey, string>>;

/** Badge properties of a SonarCloud letter rating. */
interface SonarGrade {
  /** Theme color of the grade. */
  color: ThemeColorName;
  /** Letter grade (`A`–`E`). */
  letter: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Requested measure keys (sorted, comma-separated for the `metricKeys` query). */
const SONAR_MEASURE_KEYS: readonly SonarMeasureKey[] = [
  'alert_status',
  'bugs',
  'code_smells',
  'coverage',
  'duplicated_lines_density',
  'new_bugs',
  'new_code_smells',
  'new_coverage',
  'new_duplicated_lines_density',
  'new_vulnerabilities',
  'quality_gate_details',
  'reliability_rating',
  'security_rating',
  'sqale_rating',
  'vulnerabilities',
];

/** Automatic inline widget kinds supported by SonarCloud issue count metrics. */
const ISSUE_SPECIALS: readonly BadgeSpecialKind[] = ['delta', 'bar', 'ring'];

/** Automatic inline widget kinds supported by SonarCloud letter grade metrics (`A`–`E`). */
const GRADE_SPECIALS: readonly BadgeSpecialKind[] = ['steps', 'ring', 'bar'];

/** Automatic inline widget kinds supported by SonarCloud `quality`. */
const QUALITY_GATE_SPECIALS: readonly BadgeSpecialKind[] = ['strip', 'steps', 'ring', 'bar'];

/** Automatic inline widget kinds supported by SonarCloud `duplication`. */
const DUPLICATION_SPECIALS: readonly BadgeSpecialKind[] = ['bar', 'ring', 'delta'];

/** Letter grades of the SonarCloud ratings `1.0` (A) to `5.0` (E). */
const SONAR_GRADES: readonly SonarGrade[] = [
  { color: 'emerald', letter: 'A' },
  { color: 'lime', letter: 'B' },
  { color: 'yellow', letter: 'C' },
  { color: 'orange', letter: 'D' },
  { color: 'rose', letter: 'E' },
];

/** Badge properties of the quality gate states. */
const QUALITY_GATE_STATES: Readonly<Record<string, Partial<MetricResult>>> = {
  ERROR: { color: 'rose', icon: 'circle-x', value: 'failed' },
  OK: { color: 'emerald', icon: 'circle-check', value: 'passed' },
  WARN: { color: 'amber', icon: 'circle-alert', value: 'warning' },
};

/** Shared presentation of the SonarCloud rating badges (label set per rating). */
const RATING_PRESENTATION: MetricPresentation = {
  autoSpecials: GRADE_SPECIALS,
  defaultColor: 'slate',
  defaultIcon: 'sonarcloud',
  defaultLabel: 'Rating',
  hasDynamicColor: true,
};

/** Lazily initialized lookup set for `SONAR_MEASURE_KEYS`. */
let sonarMeasureKeySetCache: ReadonlySet<string> | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Check whether a measure key is one of the requested keys (guards against prototype keys). */
function isSonarMeasureKey(key: string): key is SonarMeasureKey {
  sonarMeasureKeySetCache ??= new Set<string>(SONAR_MEASURE_KEYS);
  return sonarMeasureKeySetCache.has(key);
}

/** Read the value string of a SonarCloud measure (`measure.value` or `measure.period.value`). */
function readMeasureValue(measure: Record<string, unknown>): string | undefined {
  if (typeof measure.value === 'string') {
    return measure.value;
  }
  const period = asJsonObject(measure.period);
  if (typeof period?.value === 'string') {
    return period.value;
  }
  const firstPeriod = readFirstObjectEntry(measure.periods);
  return typeof firstPeriod?.value === 'string' ? firstPeriod.value : undefined;
}

/** Project a SonarCloud measures response into a `metric -> value` map of the requested measures. */
function projectSonarMeasures(data: unknown): SonarMeasures | undefined {
  const component = asJsonObject(asJsonObject(data)?.component);
  if (!component || !Array.isArray(component.measures) || component.measures.length === 0) {
    return undefined;
  }
  const measures: SonarMeasures = {};
  for (const measure of component.measures) {
    if (
      isJsonObject(measure) &&
      typeof measure.metric === 'string' &&
      isSonarMeasureKey(measure.metric)
    ) {
      const value = readMeasureValue(measure);
      if (value !== undefined) {
        measures[measure.metric] = value;
      }
    }
  }
  return measures;
}

/** Build `strip`, `steps`, `ring`, and `bar` widgets from `quality_gate_details` conditions. */
function buildQualityGateSpecials(detailsJson: string | undefined): BadgeSpecialMap | undefined {
  if (!detailsJson) {
    return undefined;
  }
  let parsed: unknown = undefined;
  try {
    parsed = JSON.parse(detailsJson) as unknown;
  } catch {
    return undefined;
  }
  const conditions =
    isJsonObject(parsed) && Array.isArray(parsed.conditions) ? parsed.conditions : undefined;
  if (!conditions || conditions.length === 0) {
    return undefined;
  }
  const states: StripTickState[] = [];
  let passedCount = 0;
  let totalCount = 0;
  for (const condition of conditions) {
    const rawLevel = isJsonObject(condition) ? (condition.level ?? condition.status) : undefined;
    if (typeof rawLevel === 'string') {
      totalCount += 1;
      let tick: StripTickState = '0';
      if (rawLevel === 'OK') {
        tick = '9';
        passedCount += 1;
      } else if (rawLevel === 'WARN') {
        tick = '4';
      }
      if (states.length < MAX_STRIP_TICKS) {
        states.push(tick);
      }
    }
  }
  if (totalCount === 0) {
    return undefined;
  }
  const stepTotal = Math.min(MAX_STEPS_COUNT, totalCount);
  const stepDone = computeScaledSteps(passedCount, totalCount, stepTotal);
  const ratio = buildRatioSpecials(passedCount, totalCount);
  return {
    ...ratio,
    steps: { done: stepDone, total: stepTotal, type: 'steps' },
    strip: { states, type: 'strip' },
  };
}

/** Transform the quality gate status into `passed`, `failed`, or `warning`. */
function transformQualityGate(measures: SonarMeasures): Partial<MetricResult> {
  const status = measures.alert_status;
  const base = (status ? getOwnValue(QUALITY_GATE_STATES, status) : undefined) ?? { value: 'n/a' };
  const specials = buildQualityGateSpecials(measures.quality_gate_details);
  return specials ? { ...base, specials } : base;
}

/** Read the numeric difference between a new-code measure and an overall measure. */
function readMeasureDiff(
  measures: SonarMeasures,
  newKey: SonarMeasureKey,
  overallKey: SonarMeasureKey
): number | undefined {
  const newValue = toFiniteNumber(measures[newKey]);
  const overallValue = toFiniteNumber(measures[overallKey]);
  return newValue !== undefined && overallValue !== undefined ? newValue - overallValue : undefined;
}

/** SonarCloud component measures endpoint with project overview page redirect. */
const MEASURES_ENDPOINT = createEndpoint({
  api: `https://sonarcloud.io/api/measures/component?component={target}&metricKeys=${SONAR_MEASURE_KEYS.join(',')}`,
  page: 'https://sonarcloud.io/project/overview?id={target}',
  project: projectSonarMeasures,
});

/** Create an issue count metric that turns emerald at zero and derives `delta`, `bar`, and `ring` from new code. */
function createIssueCountMetric(
  key: SonarMeasureKey,
  newKey: SonarMeasureKey,
  presentation: MetricPresentation
): ServiceMetricConfig {
  return createMetric(
    MEASURES_ENDPOINT,
    { ...presentation, autoSpecials: ISSUE_SPECIALS, hasDynamicColor: true },
    (measures) => {
      const count = toFiniteNumber(measures[key]);
      const newCount = toFiniteNumber(measures[newKey]);
      const specials: BadgeSpecialMap = {};
      if (newCount !== undefined) {
        specials.delta = {
          type: 'delta',
          value:
            newCount === 0 ? '0' : `${newCount > 0 ? '+' : ''}${formatCompactNumber(newCount)}`,
        };
        const ratio = buildRatioSpecials(newCount, count);
        if (ratio) {
          specials.bar = ratio.bar;
          specials.ring = ratio.ring;
        }
      }
      return {
        color: count === 0 ? 'emerald' : undefined,
        specials: Object.keys(specials).length > 0 ? specials : undefined,
        value: formatCount(count),
      };
    }
  );
}

/** Create a letter rating metric (`A`–`E`) with `steps`, `ring`, and `bar` widgets. */
function createGradeMetric(key: SonarMeasureKey, label: string): ServiceMetricConfig {
  return createMetric(
    MEASURES_ENDPOINT,
    { ...RATING_PRESENTATION, defaultLabel: label },
    (measures) => {
      const rating = toFiniteNumber(measures[key]);
      const rounded = rating === undefined ? undefined : Math.round(rating);
      const grade = rounded === undefined ? undefined : SONAR_GRADES[rounded - 1];
      if (!grade || rounded === undefined) {
        return { value: 'n/a' };
      }
      const done = Math.min(5, Math.max(1, 6 - rounded));
      const percent = done * 20;
      return {
        color: grade.color,
        specials: {
          bar: { type: 'bar', value: percent },
          ring: { type: 'ring', value: percent },
          steps: { done, total: 5, type: 'steps' },
        },
        value: grade.letter,
      };
    }
  );
}

// -------------------------------------- PUBLIC API -------------------------------------

/** SonarCloud service preset (`sonarcloud`). */
export const SONARCLOUD_SERVICE = defineService({
  docs: {
    description:
      'Quality gate, coverage (ring gauge), bugs, vulnerabilities, code smells, duplication, and A–E ratings of a public project.',
    title: 'SonarCloud',
  },
  metricAliases: {
    code_smells: 'smells',
    dup: 'duplication',
    gate: 'quality',
    quality_gate: 'quality',
    sqale: 'maintainability',
    vulns: 'vulnerabilities',
  },
  metrics: {
    bugs: createIssueCountMetric('bugs', 'new_bugs', {
      defaultColor: 'rose',
      defaultIcon: 'bug',
      defaultLabel: 'Bugs',
    }),
    coverage: createCoverageMetric(
      MEASURES_ENDPOINT,
      'sonarcloud',
      (measures) => toFiniteNumber(measures.coverage),
      (measures) => readMeasureDiff(measures, 'new_coverage', 'coverage')
    ),
    duplication: createMetric(
      MEASURES_ENDPOINT,
      {
        autoSpecials: DUPLICATION_SPECIALS,
        defaultColor: 'sky',
        defaultIcon: 'copy',
        defaultLabel: 'Duplicated Lines',
      },
      (measures) => {
        const percent = toFiniteNumber(measures.duplicated_lines_density);
        if (percent === undefined) {
          return { value: 'n/a' };
        }
        const clamped = computeProgressPercent(percent, 100);
        const delta = formatPointDelta(
          readMeasureDiff(measures, 'new_duplicated_lines_density', 'duplicated_lines_density')
        );
        return {
          specials: {
            bar: { type: 'bar', value: clamped },
            ...(delta ? { delta: { type: 'delta', value: delta } } : {}),
            ring: { type: 'ring', value: clamped },
          },
          value: formatPercent(percent),
        };
      }
    ),
    maintainability: createGradeMetric('sqale_rating', 'Maintainability'),
    quality: createMetric(
      MEASURES_ENDPOINT,
      {
        autoSpecials: QUALITY_GATE_SPECIALS,
        defaultColor: 'emerald',
        defaultIcon: 'sonarcloud',
        defaultLabel: 'Quality Gate',
        hasDynamicColor: true,
        hasDynamicIcon: true,
      },
      transformQualityGate
    ),
    reliability: createGradeMetric('reliability_rating', 'Reliability'),
    security: createGradeMetric('security_rating', 'Security'),
    smells: createIssueCountMetric('code_smells', 'new_code_smells', {
      defaultColor: 'amber',
      defaultIcon: 'wind',
      defaultLabel: 'Code Smells',
    }),
    vulnerabilities: createIssueCountMetric('vulnerabilities', 'new_vulnerabilities', {
      defaultColor: 'orange',
      defaultIcon: 'shield-alert',
      defaultLabel: 'Vulnerabilities',
    }),
  },
  route: { target: { placeholder: ':component' } },
});
