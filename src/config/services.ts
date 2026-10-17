/**
 * Service presets – Declarative configuration for GitHub, PyPI (via ClickHouse ClickPy), Open VSX, and status indicators.
 */

import type { Env, MetricResult, ServiceDefinition, StatusPreset } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial GitHub repository API payload. */
interface GitHubRepoPayload {
  /** Number of repository forks. */
  forks_count?: number;
  /** Repository license metadata. */
  license?: {
    /** SPDX license identifier. */
    spdx_id?: string;
  };
  /** Number of open issues and pull requests. */
  open_issues_count?: number;
  /** ISO 8601 timestamp of the most recent git push. */
  pushed_at?: string;
  /** Number of repository stargazers. */
  stargazers_count?: number;
}

/** Partial GitHub latest release API payload. */
interface GitHubReleasePayload {
  /** Release git tag name. */
  tag_name?: string;
}

/** Partial GitHub commit participation API payload. */
interface GitHubParticipationPayload {
  /** Weekly commit counts for all users over the last 52 weeks. */
  all?: number[];
}

/** Partial PyPI package metadata API payload. */
interface PyPiPackagePayload {
  /** Package metadata block. */
  info?: {
    /** Required Python version specifier. */
    requires_python?: string;
    /** Latest published package version. */
    version?: string;
  };
}

/** Partial ClickHouse ClickPy (`pypi.pypi_downloads_per_day`) and PyPI Stats download payload. */
interface PyPiDownloadsPayload {
  /** Optional legacy PyPI Stats `data` block. */
  data?: {
    /** Downloads in the last 30 days. */
    last_month?: number;
  };
  /** ClickHouse `JSONObjectEachRow` first row result. */
  row_1?: {
    /** Downloads in the last 30 days (`sumIf(count, date >= today() - 30)`). */
    last_month?: number | string;
    /** All-time total downloads (`sum(count)`). */
    total?: number | string;
  };
}

/** Partial Open VSX extension metadata API payload (`https://open-vsx.org/api/:owner/:ext`). */
interface OpenVsxExtensionPayload {
  /** Average star rating (`0`–`5`). */
  averageRating?: number;
  /** Total all-time extension downloads. */
  downloadCount?: number;
  /** Latest published extension version. */
  version?: string;
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a trailing `.0` in compact formatted numbers. */
const TRAILING_ZERO_DECIMAL_RX = /\.0$/;

/** Matches one or more whitespace characters. */
const WHITESPACE_RX = /\s+/g;

/** Matches any character not allowed in a canonical PyPI package identifier. */
const UNSAFE_PKG_CHAR_RX = /[^a-zA-Z0-9._-]/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Default fallback sparkline points when commit participation history is empty. */
const DEFAULT_ACTIVITY_SPARKLINE = [2, 5, 3, 8, 6, 11, 9, 14];

/** Number of milliseconds in one day (`24 * 60 * 60 * 1000`). */
const MS_PER_DAY = 86_400_000;

/**
 * Format a number into a compact human-readable string (e.g., `1.2k`, `3.4M`).
 * @param num   Numeric value to format.
 * @returns Compact string representation.
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace(TRAILING_ZERO_DECIMAL_RX, '')}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1).replace(TRAILING_ZERO_DECIMAL_RX, '')}k`;
  }
  return String(num);
}

/**
 * Format an ISO 8601 timestamp into a concise relative age label (e.g., `'today'`, `'3d ago'`, `'2mo ago'`).
 * @param isoTimestamp   ISO 8601 timestamp string from an upstream API.
 * @param nowMs          Optional reference timestamp in milliseconds (defaults to `Date.now()`).
 * @returns Compact relative time label.
 */
export function formatRelativeDate(isoTimestamp?: string, nowMs = Date.now()): string {
  if (!isoTimestamp) {
    return 'recent';
  }
  const parsedMs = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsedMs)) {
    return 'recent';
  }
  const diffDays = Math.max(0, Math.floor((nowMs - parsedMs) / MS_PER_DAY));
  if (diffDays === 0) {
    return 'today';
  }
  if (diffDays === 1) {
    return 'yesterday';
  }
  if (diffDays < 14) {
    return `${diffDays}d ago`;
  }
  if (diffDays < 60) {
    return `${Math.floor(diffDays / 7)}w ago`;
  }
  if (diffDays < 365) {
    return `${Math.floor(diffDays / 30)}mo ago`;
  }
  return `${Math.floor(diffDays / 365)}y ago`;
}

/** Resolve the default GitHub / Open VSX owner from environment bindings. */
function getDefaultGitHubOwner(env: Env): string {
  return env.DEFAULT_GH_OWNER || 'xulbux';
}

/** Resolve the allowlist of GitHub / Open VSX owners from environment bindings. */
function getAllowedGitHubOwners(env: Env): string[] {
  return [(env.DEFAULT_GH_OWNER || 'xulbux').toLowerCase()];
}

/** Build the GitHub repository metadata API URL. */
function buildGitHubRepoApiUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${owner}/${repo}`;
}

/** Build the GitHub stargazers redirect URL. */
function buildGitHubStarsRedirectUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/stargazers`;
}

/** Transform GitHub repository payload into stargazer count metric. */
function transformGitHubStars(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as GitHubRepoPayload;
  return { value: formatCompactNumber(payload.stargazers_count ?? 0) };
}

/** Build the GitHub forks network redirect URL. */
function buildGitHubForksRedirectUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/network/members`;
}

/** Transform GitHub repository payload into fork count metric. */
function transformGitHubForks(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as GitHubRepoPayload;
  return { value: formatCompactNumber(payload.forks_count ?? 0) };
}

/** Build the GitHub issues redirect URL. */
function buildGitHubIssuesRedirectUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/issues`;
}

/** Transform GitHub repository payload into open issues count metric. */
function transformGitHubIssues(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as GitHubRepoPayload;
  return { value: formatCompactNumber(payload.open_issues_count ?? 0) };
}

/** Build the GitHub license file redirect URL. */
function buildGitHubLicenseRedirectUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/blob/main/LICENSE`;
}

/** Transform GitHub repository payload into SPDX license identifier metric. */
function transformGitHubLicense(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as GitHubRepoPayload;
  const spdxId = payload.license?.spdx_id;
  return { value: spdxId && spdxId !== 'NOASSERTION' ? spdxId : 'custom' };
}

/** Build the GitHub commit history redirect URL. */
function buildGitHubCommitsRedirectUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/commits`;
}

/** Transform GitHub repository payload (`pushed_at`) into relative last-commit age. */
function transformGitHubLastCommit(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as GitHubRepoPayload;
  return { value: formatRelativeDate(payload.pushed_at) };
}

/** Build the GitHub latest release API URL. */
function buildGitHubReleaseApiUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
}

/** Build the GitHub releases redirect URL. */
function buildGitHubReleaseRedirectUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/releases`;
}

/** Transform GitHub latest release payload into tag name metric. */
function transformGitHubRelease(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as GitHubReleasePayload;
  return { value: payload.tag_name || 'none' };
}

/** Build the GitHub commit participation stats API URL. */
function buildGitHubActivityApiUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/stats/participation`;
}

/** Build the GitHub commit activity graph redirect URL. */
function buildGitHubActivityRedirectUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/graphs/commit-activity`;
}

/** Transform GitHub commit participation payload into 8-week total and sparkline. */
function transformGitHubActivity(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as GitHubParticipationPayload;
  const allWeeks = Array.isArray(payload.all) ? payload.all : [];
  const recent8Weeks = allWeeks.slice(-8);
  let totalRecent = 0;
  for (const weekCount of recent8Weeks) {
    totalRecent += weekCount;
  }
  return {
    special: {
      type: 'sparkline',
      values: recent8Weeks.length > 0 ? recent8Weeks : DEFAULT_ACTIVITY_SPARKLINE,
    },
    value: `${formatCompactNumber(totalRecent)}/8w`,
  };
}

/** Build the PyPI package metadata JSON API URL. */
function buildPyPiApiUrl(_owner: string, pkg: string): string {
  return `https://pypi.org/pypi/${pkg}/json`;
}

/** Build the PyPI project page redirect URL. */
function buildPyPiRedirectUrl(_owner: string, pkg: string): string {
  return `https://pypi.org/project/${pkg}/`;
}

/** Transform PyPI package metadata into latest version metric. */
function transformPyPiVersion(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as PyPiPackagePayload;
  return { value: `v${payload.info?.version ?? '0.0.0'}` };
}

/** Transform PyPI package metadata into required Python version metric. */
function transformPyPiPythonVersion(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as PyPiPackagePayload;
  const requirement = payload.info?.requires_python || '>=3.10';
  return { value: requirement.replace(WHITESPACE_RX, '') };
}

/**
 * Build the ClickHouse public ClickPy SQL API URL for a PyPI package.
 * Queries both all-time `total` and 30-day `last_month` downloads in one fast read-only query.
 */
function buildPyPiClickPyApiUrl(_owner: string, pkg: string): string {
  const safePkg = pkg.replace(UNSAFE_PKG_CHAR_RX, '').toLowerCase();
  const sql = `SELECT sum(count) AS total, sumIf(count, date >= today() - 30) AS last_month FROM pypi.pypi_downloads_per_day WHERE project = '${safePkg}'`;
  return `https://sql-clickhouse.clickhouse.com/?user=play&default_format=JSONObjectEachRow&query=${encodeURIComponent(sql)}`;
}

/** Build the ClickPy (`clickpy.clickhouse.com`) analytics dashboard redirect URL for a PyPI package. */
function buildPyPiClickPyRedirectUrl(_owner: string, pkg: string): string {
  const safePkg = pkg.replace(UNSAFE_PKG_CHAR_RX, '').toLowerCase();
  return `https://clickpy.clickhouse.com/dashboard/${safePkg}`;
}

/** Transform ClickHouse ClickPy payload into all-time total download count (`dt`). */
function transformPyPiTotalDownloads(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as PyPiDownloadsPayload;
  const rawTotal = Number(payload.row_1?.total ?? payload.data?.last_month ?? 0);
  return { value: formatCompactNumber(Number.isFinite(rawTotal) ? rawTotal : 0) };
}

/** Transform ClickHouse ClickPy payload into 30-day monthly download count (`dl`). */
function transformPyPiMonthlyDownloads(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as PyPiDownloadsPayload;
  const rawMonthly = Number(payload.row_1?.last_month ?? payload.data?.last_month ?? 0);
  return { value: `${formatCompactNumber(Number.isFinite(rawMonthly) ? rawMonthly : 0)}/mo` };
}

/** Build the Open VSX extension metadata API URL. */
function buildOpenVsxApiUrl(owner: string, ext: string): string {
  return `https://open-vsx.org/api/${owner}/${ext}`;
}

/** Build the Open VSX extension page redirect URL. */
function buildOpenVsxRedirectUrl(owner: string, ext: string): string {
  return `https://open-vsx.org/extension/${owner}/${ext}`;
}

/** Transform Open VSX extension payload into latest version metric (`v`). */
function transformOpenVsxVersion(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as OpenVsxExtensionPayload;
  return { value: `v${payload.version ?? '0.0.0'}` };
}

/** Transform Open VSX extension payload into total download count metric (`dt` / `dl`). */
function transformOpenVsxDownloads(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as OpenVsxExtensionPayload;
  return { value: formatCompactNumber(payload.downloadCount ?? 0) };
}

/** Transform Open VSX extension payload into average rating metric (`rating`). */
function transformOpenVsxRating(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as OpenVsxExtensionPayload;
  const rating = payload.averageRating;
  return { value: typeof rating === 'number' && rating > 0 ? `${rating.toFixed(1)}/5` : '5.0/5' };
}

// ---------------------------------------- CONSTS ---------------------------------------

/**
 * Declarative Status Dot Mapping.
 * Maps canonical status preset names to their dot state, default label, and theme color.
 */
export const STATUS_PRESET_MAP: Record<string, StatusPreset> = {
  beta: { color: 'violet', defaultLabel: 'status', dot: 'violet' },
  degraded: { color: 'amber', defaultLabel: 'status', dot: 'amber' },
  incident: { color: 'orange', defaultLabel: 'status', dot: 'orange' },
  maintenance: { color: 'sky', defaultLabel: 'status', dot: 'sky' },
  offline: { color: 'rose', defaultLabel: 'status', dot: 'red' },
  online: { color: 'emerald', defaultLabel: 'status', dot: 'green' },
  standby: { color: 'slate', defaultLabel: 'status', dot: 'slate' },
};

/** Declarative external service preset configurations (`gh`, `pypi`, `ovsx`). */
export const SERVICES_CONFIG: Record<string, ServiceDefinition> = {
  gh: {
    allowedOwners: getAllowedGitHubOwners,
    defaultOwner: getDefaultGitHubOwner,
    metrics: {
      activity: {
        buildApiUrl: buildGitHubActivityApiUrl,
        buildRedirectUrl: buildGitHubActivityRedirectUrl,
        defaultColor: 'emerald',
        defaultIcon: 'activity',
        defaultLabel: 'commits',
        transform: transformGitHubActivity,
      },
      commit: {
        buildApiUrl: buildGitHubRepoApiUrl,
        buildRedirectUrl: buildGitHubCommitsRedirectUrl,
        defaultColor: 'rose',
        defaultIcon: 'git-commit-horizontal',
        defaultLabel: 'last commit',
        transform: transformGitHubLastCommit,
      },
      forks: {
        buildApiUrl: buildGitHubRepoApiUrl,
        buildRedirectUrl: buildGitHubForksRedirectUrl,
        defaultColor: 'sky',
        defaultIcon: 'git-fork',
        defaultLabel: 'forks',
        transform: transformGitHubForks,
      },
      issues: {
        buildApiUrl: buildGitHubRepoApiUrl,
        buildRedirectUrl: buildGitHubIssuesRedirectUrl,
        defaultColor: 'rose',
        defaultIcon: 'circle-dot',
        defaultLabel: 'issues',
        transform: transformGitHubIssues,
      },
      'last-commit': {
        buildApiUrl: buildGitHubRepoApiUrl,
        buildRedirectUrl: buildGitHubCommitsRedirectUrl,
        defaultColor: 'rose',
        defaultIcon: 'git-commit-horizontal',
        defaultLabel: 'last commit',
        transform: transformGitHubLastCommit,
      },
      license: {
        buildApiUrl: buildGitHubRepoApiUrl,
        buildRedirectUrl: buildGitHubLicenseRedirectUrl,
        defaultColor: 'slate',
        defaultIcon: 'scale',
        defaultLabel: 'license',
        transform: transformGitHubLicense,
      },
      release: {
        buildApiUrl: buildGitHubReleaseApiUrl,
        buildRedirectUrl: buildGitHubReleaseRedirectUrl,
        defaultColor: 'indigo',
        defaultIcon: 'tag',
        defaultLabel: 'release',
        transform: transformGitHubRelease,
      },
      stars: {
        buildApiUrl: buildGitHubRepoApiUrl,
        buildRedirectUrl: buildGitHubStarsRedirectUrl,
        defaultColor: 'amber',
        defaultIcon: 'star',
        defaultLabel: 'stars',
        transform: transformGitHubStars,
      },
    },
  },
  ovsx: {
    allowedOwners: getAllowedGitHubOwners,
    defaultOwner: getDefaultGitHubOwner,
    metrics: {
      dl: {
        buildApiUrl: buildOpenVsxApiUrl,
        buildRedirectUrl: buildOpenVsxRedirectUrl,
        defaultColor: 'violet',
        defaultIcon: 'download',
        defaultLabel: 'downloads',
        transform: transformOpenVsxDownloads,
      },
      dt: {
        buildApiUrl: buildOpenVsxApiUrl,
        buildRedirectUrl: buildOpenVsxRedirectUrl,
        defaultColor: 'violet',
        defaultIcon: 'download',
        defaultLabel: 'downloads',
        transform: transformOpenVsxDownloads,
      },
      rating: {
        buildApiUrl: buildOpenVsxApiUrl,
        buildRedirectUrl: buildOpenVsxRedirectUrl,
        defaultColor: 'amber',
        defaultIcon: 'star',
        defaultLabel: 'rating',
        transform: transformOpenVsxRating,
      },
      v: {
        buildApiUrl: buildOpenVsxApiUrl,
        buildRedirectUrl: buildOpenVsxRedirectUrl,
        defaultColor: 'indigo',
        defaultIcon: 'puzzle',
        defaultLabel: 'open vsx',
        transform: transformOpenVsxVersion,
      },
    },
  },
  pypi: {
    allowedTargets: [],
    metrics: {
      dl: {
        buildApiUrl: buildPyPiClickPyApiUrl,
        buildRedirectUrl: buildPyPiClickPyRedirectUrl,
        defaultColor: 'emerald',
        defaultIcon: 'download',
        defaultLabel: 'downloads',
        transform: transformPyPiMonthlyDownloads,
      },
      dt: {
        buildApiUrl: buildPyPiClickPyApiUrl,
        buildRedirectUrl: buildPyPiClickPyRedirectUrl,
        defaultColor: 'indigo',
        defaultIcon: 'download',
        defaultLabel: 'downloads',
        transform: transformPyPiTotalDownloads,
      },
      py: {
        buildApiUrl: buildPyPiApiUrl,
        buildRedirectUrl: buildPyPiRedirectUrl,
        defaultColor: 'amber',
        defaultIcon: 'python',
        defaultLabel: 'python',
        transform: transformPyPiPythonVersion,
      },
      v: {
        buildApiUrl: buildPyPiApiUrl,
        buildRedirectUrl: buildPyPiRedirectUrl,
        defaultColor: 'sky',
        defaultIcon: 'pypi',
        defaultLabel: 'pypi',
        transform: transformPyPiVersion,
      },
    },
  },
};
