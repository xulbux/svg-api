/**
 * Service presets – Declarative configuration for external APIs and status indicators.
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

/** Partial PyPI Stats recent downloads API payload. */
interface PyPiStatsPayload {
  /** Download count metrics block. */
  data?: {
    /** Downloads in the last 30 days. */
    last_month?: number;
  };
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a trailing `.0` in compact formatted numbers. */
const TRAILING_ZERO_DECIMAL_RX = /\.0$/;

/** Matches one or more whitespace characters. */
const WHITESPACE_RX = /\s+/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Default fallback sparkline points when commit participation history is empty. */
const DEFAULT_ACTIVITY_SPARKLINE = [2, 5, 3, 8, 6, 11, 9, 14];

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

/** Resolve the default GitHub owner from environment bindings. */
function getDefaultGitHubOwner(env: Env): string {
  return env.DEFAULT_GH_OWNER || 'xulbux';
}

/** Resolve the allowlist of GitHub owners from environment bindings. */
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
    sparkline: recent8Weeks.length > 0 ? recent8Weeks : DEFAULT_ACTIVITY_SPARKLINE,
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

/** Build the PyPI Stats recent downloads API URL. */
function buildPyPiDownloadsApiUrl(_owner: string, pkg: string): string {
  return `https://pypistats.org/api/packages/${pkg}/recent`;
}

/** Transform PyPI Stats payload into monthly download count metric. */
function transformPyPiDownloads(data: unknown): Partial<MetricResult> {
  const payload = (data ?? {}) as PyPiStatsPayload;
  return { value: `${formatCompactNumber(payload.data?.last_month ?? 0)}/mo` };
}

// ---------------------------------------- CONSTS ---------------------------------------

/**
 * Declarative Status Dot Mapping.
 * Maps status preset aliases (or API return values) to dot state, default label, and theme color.
 */
export const STATUS_PRESET_MAP: Record<string, StatusPreset> = {
  amber: { color: 'amber', defaultLabel: 'status', dot: 'amber' },
  beta: { color: 'violet', defaultLabel: 'status', dot: 'violet' },
  blue: { color: 'sky', defaultLabel: 'status', dot: 'sky' },
  building: { color: 'sky', defaultLabel: 'status', dot: 'sky' },
  degraded: { color: 'amber', defaultLabel: 'status', dot: 'amber' },
  deploying: { color: 'sky', defaultLabel: 'status', dot: 'sky' },
  down: { color: 'rose', defaultLabel: 'status', dot: 'red' },
  experimental: { color: 'violet', defaultLabel: 'status', dot: 'violet' },
  green: { color: 'emerald', defaultLabel: 'status', dot: 'green' },
  healthy: { color: 'emerald', defaultLabel: 'status', dot: 'green' },
  idle: { color: 'slate', defaultLabel: 'status', dot: 'slate' },
  incident: { color: 'orange', defaultLabel: 'status', dot: 'orange' },
  maintenance: { color: 'sky', defaultLabel: 'status', dot: 'sky' },
  offline: { color: 'rose', defaultLabel: 'status', dot: 'red' },
  online: { color: 'emerald', defaultLabel: 'status', dot: 'green' },
  orange: { color: 'orange', defaultLabel: 'status', dot: 'orange' },
  overloaded: { color: 'orange', defaultLabel: 'status', dot: 'orange' },
  paused: { color: 'slate', defaultLabel: 'status', dot: 'slate' },
  preview: { color: 'violet', defaultLabel: 'status', dot: 'violet' },
  purple: { color: 'violet', defaultLabel: 'status', dot: 'violet' },
  red: { color: 'rose', defaultLabel: 'status', dot: 'red' },
  slate: { color: 'slate', defaultLabel: 'status', dot: 'slate' },
  sleeping: { color: 'slate', defaultLabel: 'status', dot: 'slate' },
  staging: { color: 'violet', defaultLabel: 'status', dot: 'violet' },
  standby: { color: 'slate', defaultLabel: 'status', dot: 'slate' },
  syncing: { color: 'sky', defaultLabel: 'status', dot: 'sky' },
  up: { color: 'emerald', defaultLabel: 'status', dot: 'green' },
  warn: { color: 'amber', defaultLabel: 'status', dot: 'amber' },
};

/** Declarative external service preset configurations. */
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
  pypi: {
    allowedTargets: [],
    metrics: {
      dl: {
        buildApiUrl: buildPyPiDownloadsApiUrl,
        buildRedirectUrl: buildPyPiRedirectUrl,
        defaultColor: 'emerald',
        defaultIcon: 'download',
        defaultLabel: 'downloads',
        transform: transformPyPiDownloads,
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
