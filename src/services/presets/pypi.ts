/**
 * PyPI service preset – Package version, required Python, and license from PyPI plus ClickHouse ClickPy download statistics (`/badge/pypi/:pkg/:metric`).
 *
 * The PyPI JSON document lists every release file (e.g., `~3.3 MB` for `boto3`), but its leading
 * `info` object holds every needed field, so the body stream is cancelled as soon as `info` is
 * complete (`leadingKey`).
 */

import {
  CACHE_TTL,
  createEndpoint,
  createMetric,
  defineService,
  isJsonObject,
  pickFields,
} from '@/services/endpoint';
import {
  SERIES_DELTA_SPECIALS,
  bucketSeries,
  buildSeriesSpecials,
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
  toFiniteNumber,
} from '@/services/metrics';
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

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Normalize a PyPI project name per PEP 503 (`My_Package.Name` -> `my-package-name`).
 * ClickPy stores download rows under the normalized name, and owner/target segments are
 * already validated to `[\w.@+-]` (no quotes or backslashes), so the result is safe to embed in
 * the SQL string literal.
 */
function normalizePyPiName(pkg: string): string {
  return pkg.replace(PEP503_SEPARATOR_RX, '-').toLowerCase();
}

/** Read a non-empty string field. */
function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Read the most specific level of the last `License ::` trove classifier (`MIT License`). */
function readLicenseClassifier(classifiers: unknown): string | undefined {
  if (!Array.isArray(classifiers)) {
    return undefined;
  }
  let license: string | undefined = undefined;
  for (const classifier of classifiers) {
    if (typeof classifier === 'string' && classifier.startsWith(LICENSE_CLASSIFIER_PREFIX)) {
      license = classifier.slice(
        classifier.lastIndexOf(CLASSIFIER_SEPARATOR) + CLASSIFIER_SEPARATOR.length
      );
    }
  }
  return license;
}

/** Project the PyPI `info` object into the badge fields (the README `description` is dropped). */
function projectPyPiInfo(data: unknown): PyPiInfoProjection | undefined {
  const info = isJsonObject(data) ? data.info : undefined;
  if (!isJsonObject(info)) {
    return undefined;
  }
  // Legacy `license` fields sometimes hold the full license text; Only short names are usable.
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
    const parsed = toFiniteNumber(item as RawCount);
    if (parsed !== undefined) {
      values.push(parsed);
    }
  }
  return values.length >= 2 ? values : undefined;
}

/** Build the read-only ClickPy SQL URL returning all-time, 30-day, prior 30-day, and bucketed downloads. */
function buildClickPyApiUrl({ target }: ServiceRouteParams): string {
  const sql = `SELECT sum(count) AS total, sumIf(count, date >= today() - 30 AND date < today()) AS last_month, sumIf(count, date >= today() - 60 AND date < today() - 30) AS prev_month, sumForEach(arrayMap(i -> toUInt64(if(date >= addDays(today(), (i - 15) * 2) AND date < addDays(today(), (i - 14) * 2), count, 0)), range(15))) AS bins_30d, sumForEach(arrayMap(i -> toUInt64(if(date >= addDays(today(), (i - 12) * 30) AND date < addDays(today(), (i - 11) * 30), count, 0)), range(12))) AS monthly_12m FROM pypi.pypi_downloads_per_day WHERE project = '${normalizePyPiName(target)}'`;
  return `https://sql-clickhouse.clickhouse.com/?user=play&default_format=JSONObjectEachRow&query=${encodeURIComponent(sql)}`;
}

/** Build the ClickPy dashboard URL. */
function buildClickPyPageUrl({ target }: ServiceRouteParams): string {
  return `https://clickpy.clickhouse.com/dashboard/${encodeURIComponent(normalizePyPiName(target))}`;
}

/** PyPI package metadata endpoint (`info` prefix only). */
const PYPI_ENDPOINT = createEndpoint({
  api: 'https://pypi.org/pypi/{target}/json',
  leadingKey: 'info',
  page: 'https://pypi.org/project/{target}/',
  project: projectPyPiInfo,
});

/** ClickPy daily download statistics endpoint. */
const CLICKPY_ENDPOINT = createEndpoint<Partial<ClickPyDownloadsPayload>>({
  api: buildClickPyApiUrl,
  page: buildClickPyPageUrl,
  project: pickFields<ClickPyDownloadsPayload>(['row_1']),
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
          barsValues: bins30d ? bucketSeries(bins30d, 10) : undefined,
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
          barsValues: monthly12m,
          current: row?.last_month,
          previous: row?.prev_month,
          sparklineValues: monthly12m,
        });
      }
    ),
    license: createLicenseMetric(PYPI_ENDPOINT, (info) => info.license),
    py: createMetric(
      PYPI_ENDPOINT,
      { defaultColor: 'amber', defaultIcon: 'python', defaultLabel: 'python' },
      transformPyPiPythonVersion
    ),
    v: createVersionMetric(
      PYPI_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'pypi', defaultLabel: 'pypi' },
      (info) => info.version
    ),
  },
  route: { target: { placeholder: ':pkg' } },
});
