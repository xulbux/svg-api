/**
 * SonarCloud service preset – Quality gate, coverage, issue counts, duplication, and ratings of a public SonarCloud project (`/badge/sonarcloud/:component/:metric`).
 *
 * Every metric reads one shared measures request whose measures are projected into a small
 * `metric -> value` map.
 */

import { createEndpoint, createMetric, defineService, isJsonObject } from '@/services/endpoint';
import {
  createCoverageMetric,
  formatCount,
  formatPercent,
  toFiniteNumber,
} from '@/services/metrics';
import type {
  MetricPresentation,
  MetricResult,
  ServiceDefinition,
  ServiceMetricConfig,
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
  'reliability_rating',
  'security_rating',
  'sqale_rating',
  'vulnerabilities',
];

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
  defaultColor: 'slate',
  defaultIcon: 'sonarcloud',
  defaultLabel: 'rating',
};

// -------------------------------------- INTERNALS --------------------------------------

/** Check whether a measure key is one of the requested keys (guards against prototype keys). */
function isSonarMeasureKey(key: string): key is SonarMeasureKey {
  return (SONAR_MEASURE_KEYS as readonly string[]).includes(key);
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
      typeof measure.value === 'string' &&
      isSonarMeasureKey(measure.metric)
    ) {
      measures[measure.metric] = measure.value;
    }
  }
  return measures;
}

/** Transform the quality gate status into `passed`, `failed`, or `warning`. */
function transformQualityGate(measures: SonarMeasures): Partial<MetricResult> {
  const status = measures.alert_status;
  return (
    (status && Object.hasOwn(QUALITY_GATE_STATES, status)
      ? QUALITY_GATE_STATES[status]
      : undefined) ?? { value: 'n/a' }
  );
}

/** Create the shared SonarCloud service preset. */
function createSonarCloudService(): ServiceDefinition {
  const measuresEndpoint = createEndpoint({
    api: `https://sonarcloud.io/api/measures/component?component={target}&metricKeys=${SONAR_MEASURE_KEYS.join(',')}`,
    page: 'https://sonarcloud.io/project/overview?id={target}',
    project: projectSonarMeasures,
  });

  /** Create an issue count metric that turns emerald at zero. */
  function createIssueCountMetric(
    key: SonarMeasureKey,
    presentation: MetricPresentation
  ): ServiceMetricConfig {
    return createMetric(measuresEndpoint, presentation, (measures) => {
      const count = toFiniteNumber(measures[key]);
      return { color: count === 0 ? 'emerald' : undefined, value: formatCount(count) };
    });
  }

  /** Create a letter rating metric (`A`–`E`). */
  function createGradeMetric(key: SonarMeasureKey, label: string): ServiceMetricConfig {
    return createMetric(
      measuresEndpoint,
      { ...RATING_PRESENTATION, defaultLabel: label },
      (measures) => {
        const rating = toFiniteNumber(measures[key]);
        const grade = rating === undefined ? undefined : SONAR_GRADES[Math.round(rating) - 1];
        return grade ? { color: grade.color, value: grade.letter } : { value: 'n/a' };
      }
    );
  }

  return defineService({
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
      bugs: createIssueCountMetric('bugs', {
        defaultColor: 'rose',
        defaultIcon: 'bug',
        defaultLabel: 'bugs',
      }),
      coverage: createCoverageMetric(measuresEndpoint, 'sonarcloud', (measures) =>
        toFiniteNumber(measures.coverage)
      ),
      duplication: createMetric(
        measuresEndpoint,
        { defaultColor: 'sky', defaultIcon: 'copy', defaultLabel: 'duplicated lines' },
        (measures) => {
          const percent = toFiniteNumber(measures.duplicated_lines_density);
          return { value: percent === undefined ? 'n/a' : formatPercent(percent) };
        }
      ),
      maintainability: createGradeMetric('sqale_rating', 'maintainability'),
      quality: createMetric(
        measuresEndpoint,
        { defaultColor: 'emerald', defaultIcon: 'sonarcloud', defaultLabel: 'quality gate' },
        transformQualityGate
      ),
      reliability: createGradeMetric('reliability_rating', 'reliability'),
      security: createGradeMetric('security_rating', 'security'),
      smells: createIssueCountMetric('code_smells', {
        defaultColor: 'amber',
        defaultIcon: 'wind',
        defaultLabel: 'code smells',
      }),
      vulnerabilities: createIssueCountMetric('vulnerabilities', {
        defaultColor: 'orange',
        defaultIcon: 'shield-alert',
        defaultLabel: 'vulnerabilities',
      }),
    },
    route: { target: { placeholder: ':component' } },
  });
}

// -------------------------------------- PUBLIC API -------------------------------------

/** SonarCloud service preset (`sonarcloud`). */
export const SONARCLOUD_SERVICE: ServiceDefinition = createSonarCloudService();
