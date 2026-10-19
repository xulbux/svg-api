/**
 * PyPI service preset – Package version, required Python, and license from PyPI plus ClickHouse ClickPy download statistics (`/badge/pypi/:pkg/:metric`).
 */

import {
  createCountTransform,
  createLicenseTransform,
  createVersionTransform,
  LICENSE,
  RECENT_DOWNLOADS,
  TOTAL_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, MetricResult, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial PyPI package metadata API payload. */
interface PyPiPackagePayload {
  /** Package metadata block. */
  info: {
    /** Legacy license string. */
    license?: string | null;
    /** PEP 639 SPDX license expression. */
    license_expression?: string | null;
    /** Required Python version specifier. */
    requires_python?: string | null;
    /** Latest published package version. */
    version?: string;
  };
}

/** Partial ClickHouse ClickPy (`pypi.pypi_downloads_per_day`) `JSONObjectEachRow` payload. */
interface ClickPyDownloadsPayload {
  /** First result row. */
  row_1: {
    /** Downloads in the last 30 days (`sumIf(count, date >= today() - 30)`). */
    last_month?: number | string;
    /** All-time total downloads (`sum(count)`). */
    total?: number | string;
  };
}

// ---------------------------------------- CONSTS ---------------------------------------

/** PyPI JSON API endpoint (`pypi.org/pypi/:pkg/json`) with project page redirect. */
const PYPI_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, pkg: string): string => `https://pypi.org/pypi/${pkg}/json`,
  buildRedirectUrl: (_owner: string, pkg: string): string => `https://pypi.org/project/${pkg}/`,
};

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

/** Transform PyPI package metadata into a required Python version metric. */
function transformPyPiPythonVersion(data: unknown): Partial<MetricResult> {
  const requirement = ((data ?? {}) as Partial<PyPiPackagePayload>).info?.requires_python;
  return { value: requirement ? requirement.replace(WHITESPACE_RX, '') : 'any' };
}

/** ClickHouse ClickPy SQL endpoint returning all-time and 30-day downloads in one read-only query. */
const CLICKPY_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, pkg: string): string => {
    const sql = `SELECT sum(count) AS total, sumIf(count, date >= today() - 30) AS last_month FROM pypi.pypi_downloads_per_day WHERE project = '${normalizePyPiName(pkg)}'`;
    return `https://sql-clickhouse.clickhouse.com/?user=play&default_format=JSONObjectEachRow&query=${encodeURIComponent(sql)}`;
  },
  buildRedirectUrl: (_owner: string, pkg: string): string =>
    `https://clickpy.clickhouse.com/dashboard/${normalizePyPiName(pkg)}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** PyPI and ClickPy service preset (`pypi`). */
export const PYPI_SERVICE: ServiceDefinition = {
  docs: {
    description: 'PyPI version, ClickPy total/monthly downloads, required Python, and license.',
    targetName: ':pkg',
    title: 'PyPI',
  },
  metricAliases: { dm: 'dl', l: 'license' },
  metrics: {
    dl: {
      ...CLICKPY_ENDPOINT,
      ...RECENT_DOWNLOADS,
      transform: createCountTransform<ClickPyDownloadsPayload>(
        (payload) => payload.row_1?.last_month,
        '/mo'
      ),
    },
    dt: {
      ...CLICKPY_ENDPOINT,
      ...TOTAL_DOWNLOADS,
      transform: createCountTransform<ClickPyDownloadsPayload>((payload) => payload.row_1?.total),
    },
    license: {
      ...PYPI_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<PyPiPackagePayload>(
        (payload) => payload.info?.license_expression || payload.info?.license
      ),
    },
    py: {
      ...PYPI_ENDPOINT,
      defaultColor: 'amber',
      defaultIcon: 'python',
      defaultLabel: 'python',
      transform: transformPyPiPythonVersion,
    },
    v: {
      ...PYPI_ENDPOINT,
      defaultColor: 'sky',
      defaultIcon: 'pypi',
      defaultLabel: 'pypi',
      transform: createVersionTransform<PyPiPackagePayload>((payload) => payload.info?.version),
    },
  },
  ownerMode: 'none',
};
