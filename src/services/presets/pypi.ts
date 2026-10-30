/**
 * PyPI Service Preset
 *
 * Live upstream metrics and redirect transformations for PyPI.
 *
 * The PyPI JSON document lists every release file (e.g., `~3.3 MB` for `boto3`), but its leading `info` object holds every needed field,
 * so the body stream is cancelled as soon as `info` is complete (`extractKeys`).
 */

import {
  CACHE_TTL,
  createEndpoint,
  createMetric,
  defineService,
  readJsonObject,
} from '@/services/endpoint';
import {
  SERIES_DELTA_SPECIALS,
  bucketSeries,
  buildSeriesSpecials,
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
  parseFiniteNumber,
  readText,
} from '@/services/metrics';
import { MAX_BARS_POINTS, MIN_SERIES_POINTS } from '@/svg/renderer';
import type { MetricResult, RawCount, ServiceRouteParams } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected PyPI package metadata (`pypi.org/pypi/:pkg/json` `info` object). */
interface PyPiInfoProjection {
  /** License (PEP 639 expression, short legacy license, or the last `License ::` classifier). */
  license?: string;
  /** Required Python version specifier. */
  requiresPython?: string;
  /** Latest published package version. */
  version?: string;
}

/** Result row of the ClickHouse ClickPy downloads query. */
interface ClickPyDownloadsRow {
  /** 15 two-day download buckets across the last 30 days. */
  bins_30d?: readonly RawCount[];
  /** Downloads in the last 30 full days (today excluded). */
  last_month?: number | string;
  /** 12 thirty-day download buckets across the last 360 days. */
  monthly_12m?: readonly RawCount[];
  /** Downloads in the preceding 30-day window (days -60 to -31). */
  prev_month?: number | string;
  /** All-time total downloads (`sum(count)`). */
  total?: number | string;
}

/** Partial ClickHouse ClickPy (`pypi.pypi_downloads_per_day`) `JSONObjectEachRow` payload. */
interface ClickPyDownloadsPayload {
  /** First result row. */
  row_1: ClickPyDownloadsRow | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Prefix of trove license classifiers (`License :: OSI Approved :: MIT License`). */
const LICENSE_CLASSIFIER_PREFIX = 'License :: ';

/** Separator of trove classifier levels. */
const CLASSIFIER_SEPARATOR = ' :: ';

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches one or more whitespace characters. */
const WHITESPACE_RX = /\s+/g;

/** Matches runs of PEP 503 name separators (`-`, `_`, `.`). */
const PEP503_SEPARATOR_RX = /[-_.]+/g;

/** Matches a PEP 508 PyPI project name (alphanumeric endpoints with inner `.`, `_`, or `-`; Safe for SQL string literals). */
const PYPI_PROJECT_RX = /^[A-Za-z\d](?:[A-Za-z\d._-]{0,212}[A-Za-z\d])?$/;

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Normalize a PyPI project name per PEP 503 (`My_Package.Name` -> `my-package-name`).
 * `PYPI_PROJECT_RX` restricts `:pkg` to ASCII letters, digits, `.`, `_`, and `-`,
 * so the normalized name is safe to embed in the ClickPy SQL string literal.
 */
function normalizePyPiName(pkg: string): string {
  return pkg.replace(PEP503_SEPARATOR_RX, '-').toLowerCase();
}

/** Read the most specific `License ::` trove classifier level (`MIT License`). */
function readLicenseClassifier(classifiers: unknown): string | undefined {
  if (!Array.isArray(classifiers)) {
    return undefined;
  }
  let license: string | undefined = undefined;
  let bestDepth = 0;
  for (const classifier of classifiers) {
    if (typeof classifier === 'string' && classifier.startsWith(LICENSE_CLASSIFIER_PREFIX)) {
      const parts = classifier.split(CLASSIFIER_SEPARATOR);
      const leaf = readText(parts.at(-1));
      if (leaf !== undefined && parts.length >= bestDepth) {
        bestDepth = parts.length;
        license = leaf;
      }
    }
  }
  return license;
}

/** Project the PyPI `info` object into the badge fields (the README `description` is dropped). */
function projectPyPiInfo(data: unknown): PyPiInfoProjection | undefined {
  const info = readJsonObject(readJsonObject(data)?.info);
  if (!info) {
    return undefined;
  }
  // Legacy `license` fields sometimes hold the full license text; only short names are usable:
  const legacyLicense = readText(info.license);
  const shortLegacyLicense = legacyLicense?.includes('\n') ? undefined : legacyLicense;
  return {
    license:
      readText(info.license_expression) ??
      shortLegacyLicense ??
      readLicenseClassifier(info.classifiers),
    requiresPython: readText(info.requires_python),
    version: readText(info.version),
  };
}

/** Transform PyPI metadata into a required Python version metric. */
function transformPyPiPythonVersion(info: PyPiInfoProjection): Partial<MetricResult> {
  return { value: info.requiresPython ? info.requiresPython.replace(WHITESPACE_RX, '') : 'any' };
}

/** Convert a ClickHouse array of numeric values or numeric strings into finite numbers. */
function readClickPySeries(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const values: number[] = [];
  for (const item of raw) {
    const parsed = parseFiniteNumber(item);
    if (parsed !== undefined) {
      values.push(parsed);
    }
  }
  return values.length >= MIN_SERIES_POINTS ? values : undefined;
}

/**
 * Build the read-only ClickPy SQL URL returning all-time, 30-day, prior 30-day, and bucketed downloads
 * (`HAVING count() > 0` yields empty JSON for missing projects).
 */
function buildClickPyApiUrl({ target }: ServiceRouteParams): string {
  const sql = `SELECT sum(count) AS total, sumIf(count, date >= today() - 30 AND date < today()) AS last_month, sumIf(count, date >= today() - 60 AND date < today() - 30) AS prev_month, sumForEach(arrayMap(i -> toUInt64(if(date >= addDays(today(), (i - 15) * 2) AND date < addDays(today(), (i - 14) * 2), count, 0)), range(15))) AS bins_30d, sumForEach(arrayMap(i -> toUInt64(if(date >= addDays(today(), (i - 12) * 30) AND date < addDays(today(), (i - 11) * 30), count, 0)), range(12))) AS monthly_12m FROM pypi.pypi_downloads_per_day WHERE project = '${normalizePyPiName(target)}' HAVING count() > 0`;
  return `https://sql-clickhouse.clickhouse.com/?user=play&default_format=JSONObjectEachRow&query=${encodeURIComponent(sql)}`;
}

/** Build the ClickPy dashboard URL. */
function buildClickPyPageUrl({ target }: ServiceRouteParams): string {
  return `https://clickpy.clickhouse.com/dashboard/${encodeURIComponent(normalizePyPiName(target))}`;
}

/** PyPI package metadata endpoint (`info` prefix only). */
const PYPI_ENDPOINT = createEndpoint({
  api: 'https://pypi.org/pypi/{target}/json',
  extractKeys: ['info'],
  page: 'https://pypi.org/project/{target}/',
  project: projectPyPiInfo,
});

/** ClickPy daily download statistics endpoint (`undefined` when `row_1` is absent so missing packages return `404`). */
const CLICKPY_ENDPOINT = createEndpoint<Partial<ClickPyDownloadsPayload>>({
  api: buildClickPyApiUrl,
  extractKeys: ['row_1'],
  page: buildClickPyPageUrl,
  project: (data) => {
    const row = readJsonObject(readJsonObject(data)?.row_1);
    return row ? { row_1: row as ClickPyDownloadsRow } : undefined;
  },
  ttl: CACHE_TTL.daily,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** PyPI and ClickPy service preset (`pypi`). */
export const PYPI_SERVICE = defineService({
  docs: {
    description:
      'PyPI version, ClickPy total/30-day downloads (dt/dl), required Python, and license.',
    title: 'PyPI',
  },
  metricAliases: { python: 'py' },
  metrics: {
    dl: createDownloadsMetric(
      CLICKPY_ENDPOINT,
      'dl',
      (stats) => stats.row_1?.last_month,
      { autoSpecials: SERIES_DELTA_SPECIALS },
      (stats) => {
        const row = stats.row_1;
        const bins30d = readClickPySeries(row?.bins_30d);
        return buildSeriesSpecials({
          barsValues: bins30d ? bucketSeries(bins30d, MAX_BARS_POINTS) : undefined,
          current: row?.last_month,
          previous: row?.prev_month,
          sparklineValues: bins30d,
        });
      }
    ),
    dt: createDownloadsMetric(
      CLICKPY_ENDPOINT,
      'dt',
      (stats) => stats.row_1?.total,
      { autoSpecials: SERIES_DELTA_SPECIALS },
      (stats) => {
        const row = stats.row_1;
        const monthly12m = readClickPySeries(row?.monthly_12m);
        return buildSeriesSpecials({
          barsValues: monthly12m ? bucketSeries(monthly12m, MAX_BARS_POINTS) : undefined,
          current: row?.last_month,
          previous: row?.prev_month,
          sparklineValues: monthly12m,
        });
      }
    ),
    license: createLicenseMetric(PYPI_ENDPOINT, (info) => info.license),
    py: createMetric(
      PYPI_ENDPOINT,
      { defaultColor: 'amber', defaultIcon: 'python', defaultLabel: 'Python' },
      transformPyPiPythonVersion
    ),
    v: createVersionMetric(
      PYPI_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'pypi', defaultLabel: 'PyPI' },
      (info) => info.version
    ),
  },
  route: { target: { pattern: PYPI_PROJECT_RX, placeholder: ':pkg' } },
});
