/**
 * SonarCloud service preset – Quality gate, coverage, issue counts, duplication, and ratings of a public SonarCloud project (`/badge/sonarcloud/:component/:metric`).
 *
 * Every metric reads one shared measures request whose measures are projected into a small
 * `metric -> value` map.
 */

import { createEndpoint, createMetric, defineService, isJsonObject } from '@/services/endpoint';
import {
  buildRatioSpecials,
  createCoverageMetric,
  formatCompactNumber,
  formatCount,
  formatPercent,
  formatPointDelta,
  toFiniteNumber,
} from '@/services/metrics';
import { MAX_STRIP_TICKS } from '@/svg/renderer';
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

/** Automatic inline widget kinds supported by SonarCloud issue count metrics (`bugs`, `smells`, `vulnerabilities`). */
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
  defaultLabel: 'rating',
};

// -------------------------------------- INTERNALS --------------------------------------

/** Check whether a measure key is one of the requested keys (guards against prototype keys). */
function isSonarMeasureKey(key: string): key is SonarMeasureKey {
  return (SONAR_MEASURE_KEYS as readonly string[]).includes(key);
}

/** Read the value string of a SonarCloud measure (`measure.value` or `measure.period.value`). */
function readMeasureValue(measure: Record<string, unknown>): string | undefined {
  if (typeof measure.value === 'string') {
    return measure.value;
  }
  if (isJsonObject(measure.period) && typeof measure.period.value === 'string') {
    return measure.period.value;
  }
  const periods = Array.isArray(measure.periods) ? measure.periods : undefined;
  const firstPeriod: unknown = periods ? periods[0] : undefined;
  return isJsonObject(firstPeriod) && typeof firstPeriod.value === 'string'
    ? firstPeriod.value
    : undefined;
}

/** Project a SonarCloud measures response into a `metric -> value` map of the requested measures. */
function projectSonarMeasures(data: unknown): SonarMeasures | undefined {
  const component = isJsonObject(data) ? data.component : undefined;
  if (!isJsonObject(component) || !Array.isArray(component.measures)) {
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
  for (const condition of conditions.slice(0, MAX_STRIP_TICKS)) {
    if (isJsonObject(condition) && typeof condition.status === 'string') {
      if (condition.status === 'OK') {
        states.push('9');
        passedCount += 1;
      } else if (condition.status === 'WARN') {
        states.push('4');
      } else {
        states.push('0');
      }
    }
  }
  if (states.length === 0) {
    return undefined;
  }
  const total = states.length;
  const ratio = buildRatioSpecials(passedCount, total);
  return {
    ...ratio,
    steps: { done: passedCount, total, type: 'steps' },
    strip: { states, type: 'strip' },
  };
}

/** Transform the quality gate status into `passed`, `failed`, or `warning`. */
function transformQualityGate(measures: SonarMeasures): Partial<MetricResult> {
  const status = measures.alert_status;
  const base = (status && Object.hasOwn(QUALITY_GATE_STATES, status)
    ? QUALITY_GATE_STATES[status]
    : undefined) ?? { value: 'n/a' };
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
    { ...presentation, autoSpecials: ISSUE_SPECIALS },
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
        const ratio = buildRatioSpecials(newCount, count && count > 0 ? count : undefined);
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
      defaultLabel: 'bugs',
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
        defaultLabel: 'duplicated lines',
      },
      (measures) => {
        const percent = toFiniteNumber(measures.duplicated_lines_density);
        if (percent === undefined) {
          return { value: 'n/a' };
        }
        const clamped = Math.min(100, Math.max(0, Math.round(percent)));
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
    maintainability: createGradeMetric('sqale_rating', 'maintainability'),
    quality: createMetric(
      MEASURES_ENDPOINT,
      {
        autoSpecials: QUALITY_GATE_SPECIALS,
        defaultColor: 'emerald',
        defaultIcon: 'sonarcloud',
        defaultLabel: 'quality gate',
      },
      transformQualityGate
    ),
    reliability: createGradeMetric('reliability_rating', 'reliability'),
    security: createGradeMetric('security_rating', 'security'),
    smells: createIssueCountMetric('code_smells', 'new_code_smells', {
      defaultColor: 'amber',
      defaultIcon: 'wind',
      defaultLabel: 'code smells',
    }),
    vulnerabilities: createIssueCountMetric('vulnerabilities', 'new_vulnerabilities', {
      defaultColor: 'orange',
      defaultIcon: 'shield-alert',
      defaultLabel: 'vulnerabilities',
    }),
  },
  route: { target: { placeholder: ':component' } },
});
