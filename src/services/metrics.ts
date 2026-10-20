/**
 * Service metric helpers – Compact number, byte size, date, version, and license formatting plus typed metric factories, the shared download period and community count tables, and badge presentations for service presets.
 */

import { createEndpoint, createMetric, defineService, isJsonObject } from '@/services/endpoint';
import { getOwnValue } from '@/svg/shared';
import type {
  CommunityMetricKind,
  DownloadMetricKey,
  MetricEndpoint,
  MetricPresentation,
  MetricResult,
  RawCount,
  ScoreColorThreshold,
  ServiceDefinition,
  ServiceMetricConfig,
  ThemeColorName,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Badge color and value suffix of a download period. */
interface DownloadPeriodSpec {
  /** Default theme color of the period's badges. */
  color: ThemeColorName;
  /** Unit suffix appended to the formatted count (e.g., `'/mo'`). */
  suffix: string;
}

/** Projected coverage payload of `createCoverageService` endpoints. */
interface CoveragePayload {
  /** Raw coverage percentage (`0`–`100`), possibly missing. */
  percent: unknown;
}

/** Options of a coverage service preset (`createCoverageService`). */
interface CoverageServiceOptions<P extends object> {
  /** Upstream API URL template (`{owner}`, `{target}`). */
  api: string;
  /** Docs description. */
  description: string;
  /** Default icon slug of the coverage badge. */
  icon: string;
  /** Browser page URL template (`{owner}`, `{target}`). */
  page: string;
  /** Reads the raw coverage percentage from the upstream payload. */
  readPercent: (payload: Partial<P>) => unknown;
  /** Human-readable service name. */
  title: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Number of milliseconds in one day (`24 * 60 * 60 * 1000`). */
const MS_PER_DAY = 86_400_000;

/** Compact number units in descending order (`[threshold, suffix]`). */
const COMPACT_UNITS: readonly (readonly [threshold: number, suffix: string])[] = [
  [1_000_000_000, 'B'],
  [1_000_000, 'M'],
  [1000, 'k'],
];

/** Binary byte size units in descending order (`[threshold, suffix]`), matching Bundlephobia. */
const BYTE_UNITS: readonly (readonly [threshold: number, suffix: string])[] = [
  [1_073_741_824, 'GB'],
  [1_048_576, 'MB'],
  [1024, 'kB'],
];

/**
 * Relative tolerance below a unit threshold at which values are promoted to that unit,
 * so `999_950` renders as `1M` instead of `1000k` after 1-decimal rounding.
 */
const UNIT_PROMOTION_TOLERANCE = 0.00005;

/** Placeholder value for missing upstream data. */
const MISSING_VALUE = 'n/a';

/** Maximum length of SPDX license id parts that are fully upper-cased (`mit`, `gpl`, `bsd`, `cc0`). */
const SPDX_ACRONYM_MAX_LENGTH = 4;

/**
 * Canonical casing of SPDX license id parts that the acronym/capitalization heuristic gets wrong
 * (operators and suffixes stay lowercase, e.g., `GPL-3.0-or-later`, `LGPL-2.1-only`).
 */
const SPDX_PART_OVERRIDES: Readonly<Record<string, string>> = {
  curl: 'curl',
  exception: 'exception',
  invariants: 'invariants',
  later: 'later',
  no: 'no',
  only: 'only',
  openssl: 'OpenSSL',
  or: 'or',
  postgresql: 'PostgreSQL',
  with: 'with',
  wtfpl: 'WTFPL',
  zlib: 'Zlib',
};

/** Coverage color thresholds: `>= 80%` emerald, `>= 60%` amber, otherwise rose. */
const COVERAGE_THRESHOLDS: readonly ScoreColorThreshold[] = [
  { color: 'emerald', minPercent: 80 },
  { color: 'amber', minPercent: 60 },
  { color: 'rose', minPercent: 0 },
];

/** Maximum percentage of percent-based scores. */
const MAX_PERCENT = 100;

/** Maximum OpenSSF Scorecard score. */
const MAX_SCORECARD_SCORE = 10;

/** OpenSSF Scorecard color thresholds: `>= 7.0` emerald, `>= 4.0` amber, otherwise rose. */
const SCORECARD_THRESHOLDS: readonly ScoreColorThreshold[] = [
  { color: 'emerald', minPercent: 70 },
  { color: 'amber', minPercent: 40 },
  { color: 'rose', minPercent: 0 },
];

/** Maximum rendered license string length before truncation with `..` (fits `MIT OR Apache-2.0`). */
const MAX_LICENSE_LENGTH = 24;

/** Currency symbols prefixed to formatted amounts; Other ISO 4217 codes are appended instead. */
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = { EUR: '€', GBP: '£', USD: '$' };

/** Amount below which non-integer currency values keep exactly 2 decimals (`'€640.80'`). */
const CURRENCY_CENTS_THRESHOLD = 1000;

/**
 * Download period table (single source of truth for every download metric): Short periods are
 * sky, recent periods emerald, and long periods indigo.
 */
const DOWNLOAD_PERIODS: Readonly<Record<DownloadMetricKey, DownloadPeriodSpec>> = {
  dd: { color: 'sky', suffix: '/day' },
  dl: { color: 'emerald', suffix: '/mo' },
  dq: { color: 'emerald', suffix: '/90d' },
  dt: { color: 'indigo', suffix: '' },
  dw: { color: 'sky', suffix: '/wk' },
  dy: { color: 'indigo', suffix: '/yr' },
};

/**
 * Community count table (single source of truth for every community metric): Audience counts are
 * sky/indigo, appreciation counts rose, supporter counts pink, and live presence emerald.
 */
const COMMUNITY_KINDS: Readonly<Record<CommunityMetricKind, ThemeColorName>> = {
  backers: 'pink',
  followers: 'sky',
  likes: 'rose',
  members: 'indigo',
  online: 'emerald',
  patrons: 'pink',
  players: 'emerald',
  posts: 'violet',
  votes: 'rose',
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a trailing `.0` in compact formatted numbers. */
const TRAILING_ZERO_DECIMAL_RX = /\.0$/;

/** Matches a leading ASCII digit (versions that should receive a `v` prefix). */
const LEADING_DIGIT_RX = /^\d/;

/** Matches the SPDX custom license prefix (`LicenseRef-Polyform-Shield-1.0.0`). */
const LICENSE_REF_PREFIX_RX = /^LicenseRef-/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Format `num` with the first matching `[threshold, suffix]` unit (1 decimal, trailing `.0` stripped). */
function formatWithUnits(
  num: number,
  units: readonly (readonly [threshold: number, suffix: string])[],
  separator: string
): string | undefined {
  for (const [threshold, suffix] of units) {
    if (num >= threshold * (1 - UNIT_PROMOTION_TOLERANCE)) {
      return `${(num / threshold).toFixed(1).replace(TRAILING_ZERO_DECIMAL_RX, '')}${separator}${suffix}`;
    }
  }
  return undefined;
}

/** Capitalize a single SPDX license id part (`apache` -> `Apache`, `mit` -> `MIT`, `or` -> `or`). */
function formatSpdxPart(part: string): string {
  const override = getOwnValue(SPDX_PART_OVERRIDES, part.toLowerCase());
  if (override !== undefined) {
    return override;
  }
  return part.length <= SPDX_ACRONYM_MAX_LENGTH
    ? part.toUpperCase()
    : part.charAt(0).toUpperCase() + part.slice(1);
}

/** Strip one pair of enclosing parentheses (`(MIT OR Apache-2.0)`), keeping `(A) OR (B)` intact. */
function stripOuterParentheses(text: string): string {
  if (!text.startsWith('(') || !text.endsWith(')')) {
    return text;
  }
  let depth = 0;
  for (let i = 0; i < text.length - 1; i += 1) {
    const char = text[i];
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      // The opening parenthesis closes before the end, so it does not enclose the whole text.
      if (depth === 0) {
        return text;
      }
    }
  }
  return text.slice(1, -1).trim();
}

/** Resolve the theme color of a score percentage from descending `thresholds`. */
function resolveThresholdColor(
  percent: number,
  thresholds: readonly ScoreColorThreshold[]
): ThemeColorName | undefined {
  for (const threshold of thresholds) {
    if (percent >= threshold.minPercent) {
      return threshold.color;
    }
  }
  return undefined;
}

/** Format an out-of-N score with at most 1 decimal (`'8.3/10'`). */
function formatScoreOutOf(achieved: number, maximum: number): string {
  return `${Number(achieved.toFixed(1))}/${maximum}`;
}

/**
 * Read a finite number from an unknown JSON value.
 * @param raw   Raw JSON value.
 * @returns Finite number, or `undefined` for non-numeric or non-finite values.
 */
function readFiniteNumber(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

/**
 * Read a string from an unknown JSON value.
 * @param raw   Raw JSON value.
 * @returns String value, or `undefined` for non-string values.
 */
function readText(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined;
}

/** Build score badge properties (value plus ring gauge, optionally threshold-colored). */
function buildScoreResult(
  rawAchieved: unknown,
  rawMaximum: unknown,
  format: (achieved: number, maximum: number) => string,
  thresholds: readonly ScoreColorThreshold[] | undefined
): Partial<MetricResult> {
  const achieved = readFiniteNumber(rawAchieved);
  const maximum = readFiniteNumber(rawMaximum);
  if (achieved === undefined || achieved < 0 || maximum === undefined || maximum <= 0) {
    return { value: MISSING_VALUE };
  }
  const percent = Math.min(MAX_PERCENT, Math.round((achieved / maximum) * 100));
  return {
    color: thresholds ? resolveThresholdColor(percent, thresholds) : undefined,
    special: { type: 'ring', value: percent },
    value: format(achieved, maximum),
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Default presentation for test coverage metrics (`coverage`), recolored by threshold. */
export const COVERAGE: MetricPresentation = {
  defaultColor: 'emerald',
  defaultIcon: 'shield-check',
  defaultLabel: 'coverage',
};

/** Default presentation for repository fork metrics (`forks`). */
export const FORKS: MetricPresentation = {
  defaultColor: 'sky',
  defaultIcon: 'git-fork',
  defaultLabel: 'forks',
};

/** Presentation override for download metrics labeled `installs` (`createDownloadsMetric(..., INSTALLS_LABEL)`). */
export const INSTALLS_LABEL: Partial<MetricPresentation> = { defaultLabel: 'installs' };

/** Default presentation for open issue metrics (`issues`). */
export const ISSUES: MetricPresentation = {
  defaultColor: 'rose',
  defaultIcon: 'circle-dot',
  defaultLabel: 'issues',
};

/** Default presentation for last commit / activity metrics (`commit`). */
export const LAST_COMMIT: MetricPresentation = {
  defaultColor: 'rose',
  defaultIcon: 'git-commit-horizontal',
  defaultLabel: 'last commit',
};

/** Default presentation for license metrics (`license`). */
export const LICENSE: MetricPresentation = {
  defaultColor: 'slate',
  defaultIcon: 'scale',
  defaultLabel: 'license',
};

/** Default presentation for open pull request metrics (`prs`). */
export const PULL_REQUESTS: MetricPresentation = {
  defaultColor: 'violet',
  defaultIcon: 'git-pull-request',
  defaultLabel: 'pull requests',
};

/** Default presentation for average star rating metrics (`rating`). */
export const RATING: MetricPresentation = {
  defaultColor: 'amber',
  defaultIcon: 'star',
  defaultLabel: 'rating',
};

/** Default presentation for latest release tag metrics (`release`). */
export const RELEASE: MetricPresentation = {
  defaultColor: 'indigo',
  defaultIcon: 'tag',
  defaultLabel: 'release',
};

/** Default presentation for quality score metrics with a ring gauge (`score`, `points`). */
export const SCORE: MetricPresentation = {
  defaultColor: 'emerald',
  defaultIcon: 'gauge',
  defaultLabel: 'score',
};

/** Default presentation for repository star metrics (`stars`). */
export const STARS: MetricPresentation = {
  defaultColor: 'amber',
  defaultIcon: 'star',
  defaultLabel: 'stars',
};

/** Default presentation for package / image last-updated timestamp metrics (`updated`). */
export const UPDATED: MetricPresentation = {
  defaultColor: 'indigo',
  defaultIcon: 'clock',
  defaultLabel: 'updated',
};

export { readFiniteNumber, readText };

/**
 * Convert a numeric or numeric-string upstream value into a finite number.
 * @param raw   Raw count (number or numeric string).
 * @returns Finite number, or `undefined` for missing, blank, or non-numeric values.
 */
export function toFiniteNumber(raw: RawCount): number | undefined {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : undefined;
  }
  if (typeof raw !== 'string' || raw.trim() === '') {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Format a number into a compact human-readable string (e.g., `1.2k`, `3.4M`, `1.1B`).
 * @param num   Numeric value to format.
 * @returns Compact string representation.
 */
export function formatCompactNumber(num: number): string {
  return (
    formatWithUnits(num, COMPACT_UNITS, '') ??
    String(Number.isInteger(num) ? num : Number(num.toFixed(2)))
  );
}

/**
 * Format a raw upstream count compactly with an optional unit suffix.
 * @param raw      Raw count (number or numeric string).
 * @param suffix   Optional unit suffix appended to the formatted count (e.g., `'/mo'`).
 * @returns Badge value (e.g., `'4.2M/mo'`), or `'n/a'` when the count is missing.
 */
export function formatCount(raw: RawCount, suffix = ''): string {
  const count = toFiniteNumber(raw);
  return count === undefined ? MISSING_VALUE : `${formatCompactNumber(count)}${suffix}`;
}

/**
 * Format a raw byte count with binary units (e.g., `'812 B'`, `'7.8 kB'`, `'1.2 MB'`).
 * @param raw   Raw byte count (number or numeric string).
 * @returns Badge value, or `'n/a'` when the size is missing.
 */
export function formatBytes(raw: RawCount): string {
  const bytes = toFiniteNumber(raw);
  if (bytes === undefined || bytes < 0) {
    return MISSING_VALUE;
  }
  return formatWithUnits(bytes, BYTE_UNITS, ' ') ?? `${Math.round(bytes)} B`;
}

/**
 * Format a percentage with at most 1 decimal (e.g., `96.43` -> `'96.4%'`, `90` -> `'90%'`).
 * @param percent   Percentage value.
 * @returns Badge value.
 */
export function formatPercent(percent: number): string {
  return `${Number(percent.toFixed(1))}%`;
}

/**
 * Format a raw currency amount compactly, prefixing known currency symbols (`$`, `€`, `£`) and
 * appending any other ISO 4217 code (e.g., `'$177.5k/yr'`, `'€640.85/wk'`, `'1.2k CHF/mo'`).
 * @param raw        Raw amount in major currency units (number or numeric string).
 * @param currency   ISO 4217 currency code (e.g., `'USD'`).
 * @param suffix     Optional period suffix appended to the formatted amount (e.g., `'/wk'`).
 * @returns Badge value, or `'n/a'` when the amount is missing.
 */
export function formatCurrency(
  raw: RawCount,
  currency: string | null | undefined,
  suffix = ''
): string {
  const amount = toFiniteNumber(raw);
  if (amount === undefined) {
    return MISSING_VALUE;
  }
  const formatted =
    amount < CURRENCY_CENTS_THRESHOLD && !Number.isInteger(amount)
      ? amount.toFixed(2)
      : formatCompactNumber(amount);
  const code = (currency ?? '').toUpperCase();
  if (Object.hasOwn(CURRENCY_SYMBOLS, code)) {
    return `${CURRENCY_SYMBOLS[code]}${formatted}${suffix}`;
  }
  return code ? `${formatted} ${code}${suffix}` : `${formatted}${suffix}`;
}

/**
 * Format an ISO 8601 timestamp into a concise relative age label (e.g., `'today'`, `'3d ago'`, `'2mo ago'`).
 * @param isoTimestamp    ISO 8601 timestamp string from an upstream API.
 * @param referenceTime   Optional reference timestamp in milliseconds (defaults to `Date.now()`).
 * @returns Compact relative time label, or `'n/a'` when the timestamp is missing or invalid.
 */
export function formatRelativeDate(isoTimestamp?: string, referenceTime = Date.now()): string {
  const parsedTime = isoTimestamp ? Date.parse(isoTimestamp) : Number.NaN;
  if (!Number.isFinite(parsedTime)) {
    return MISSING_VALUE;
  }
  const diffDays = Math.max(0, Math.floor((referenceTime - parsedTime) / MS_PER_DAY));
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

/**
 * Format a raw version string as a badge value, adding a `v` prefix to numeric versions.
 * @param rawVersion   Upstream version or tag string (e.g., `'1.2.3'`, `'v2.0.0'`, `'nightly'`).
 * @returns Badge value (e.g., `'v1.2.3'`), or `'n/a'` when missing.
 */
export function formatVersion(rawVersion: string | null | undefined): string {
  const trimmed = (typeof rawVersion === 'string' ? rawVersion : '').trim();
  if (!trimmed) {
    return MISSING_VALUE;
  }
  return LEADING_DIGIT_RX.test(trimmed) ? `v${trimmed}` : trimmed;
}

/**
 * Build a version metric result that highlights an out-of-date flag in amber (e.g., AUR, Arch Linux).
 * @param rawVersion    Upstream version string.
 * @param isOutOfDate   Whether the package is flagged out-of-date.
 * @returns Badge properties (e.g., `'v1.2.3'`, or amber `'v1.2.3 (outdated)'`).
 */
export function buildFlaggedVersionResult(
  rawVersion: string | null | undefined,
  isOutOfDate: boolean
): Partial<MetricResult> {
  const version = formatVersion(rawVersion);
  return isOutOfDate ? { color: 'amber', value: `${version} (outdated)` } : { value: version };
}

/**
 * Join distribution package version parts in pacman/RPM notation (`[epoch:]version[-release]`),
 * omitting a zero or missing epoch and a missing release.
 * @param epoch     Raw epoch (number or numeric string, e.g., Arch Linux `2`, Fedora `'0'`).
 * @param version   Upstream version (e.g., `'9.0.2'`).
 * @param release   Upstream package release (e.g., Arch Linux `'1'`, Fedora `'1.fc46'`).
 * @returns Joined version (e.g., `'2:9.0.2-1'`), or `undefined` when the version is missing.
 */
export function buildPackageVersion(
  epoch: RawCount,
  version: unknown,
  release: unknown
): string | undefined {
  if (typeof version !== 'string' || version.trim() === '') {
    return undefined;
  }
  const epochNumber = toFiniteNumber(epoch) ?? 0;
  const prefix = epochNumber > 0 ? `${epochNumber}:` : '';
  const suffix = typeof release === 'string' && release !== '' ? `-${release}` : '';
  return `${prefix}${version.trim()}${suffix}`;
}

/**
 * Format a raw license string as a badge value, stripping one pair of enclosing parentheses and the
 * SPDX `LicenseRef-` prefix, and truncating overly long license texts with `..`.
 * @param rawLicense   Upstream SPDX expression or license name.
 * @returns Badge value (e.g., `'MIT OR Apache-2.0'`), or `'unknown'` when missing.
 */
export function formatLicense(rawLicense: string | null | undefined): string {
  const trimmed = stripOuterParentheses(
    (typeof rawLicense === 'string' ? rawLicense : '').trim()
  ).replace(LICENSE_REF_PREFIX_RX, '');
  if (!trimmed) {
    return 'unknown';
  }
  return trimmed.length > MAX_LICENSE_LENGTH
    ? `${trimmed.slice(0, MAX_LICENSE_LENGTH - 2)}..`
    : trimmed;
}

/**
 * Read a license name from an SPDX string, a string array, or a `{ type }` / `{ id }` license object (npm, CocoaPods, Zenodo).
 * @param rawLicense   Upstream `license` or `licenses` field.
 * @returns License name, or `undefined` when missing.
 */
export function readLicenseName(rawLicense: unknown): string | undefined {
  if (typeof rawLicense === 'string') {
    return rawLicense;
  }
  if (Array.isArray(rawLicense)) {
    for (const item of rawLicense) {
      if (typeof item === 'string' && item.trim() !== '') {
        return item;
      }
    }
    return undefined;
  }
  if (!isJsonObject(rawLicense)) {
    return undefined;
  }
  if (typeof rawLicense.type === 'string') {
    return rawLicense.type;
  }
  return typeof rawLicense.id === 'string' ? rawLicense.id : undefined;
}

/**
 * Convert a lowercase SPDX license key into its canonical casing (e.g., `'apache-2.0'` -> `'Apache-2.0'`).
 * @param key   Lowercase SPDX license key (e.g., GitLab `license.key`).
 * @returns Canonically cased license id, or `undefined` when `key` is missing.
 */
export function formatSpdxKey(key: string | null | undefined): string | undefined {
  if (!key) {
    return undefined;
  }
  let formatted = '';
  for (const part of key.split('-')) {
    formatted += formatted.length > 0 ? `-${formatSpdxPart(part)}` : formatSpdxPart(part);
  }
  return formatted;
}

/**
 * Combine an optional npm scope (`owner`) and package name into a full npm package identifier.
 * @param owner   Optional scope with or without a leading `@` (e.g., `'@hono'`, `'hono'`, `''`).
 * @param pkg     Package name.
 * @returns Full package identifier (e.g., `'@hono/node-server'` or `'hono'`).
 */
export function resolveNpmPackageName(owner: string, pkg: string): string {
  if (!owner) {
    return pkg;
  }
  return owner.startsWith('@') ? `${owner}/${pkg}` : `@${owner}/${pkg}`;
}

/**
 * Strip an optional leading `@` from a package scope segment (npm, JSR).
 * @param owner   Scope with or without a leading `@` (e.g., `'@std'`, `'std'`).
 * @returns Scope without `@` (e.g., `'std'`).
 */
export function stripScopePrefix(owner: string): string {
  return owner.startsWith('@') ? owner.slice(1) : owner;
}

/**
 * Build a URL path for an npm package name, encoding the scope and name individually.
 * @param owner   Optional scope with or without a leading `@` (e.g., `'@hono'`, `'hono'`, `''`).
 * @param pkg     Package name.
 * @returns URL path (e.g., `'@hono/node-server'` or `'hono'`).
 */
export function encodeNpmPackageName(owner: string, pkg: string): string {
  const scope = stripScopePrefix(owner);
  return scope
    ? `@${encodeURIComponent(scope)}/${encodeURIComponent(pkg)}`
    : encodeURIComponent(pkg);
}

/**
 * Create a metric that formats a numeric count compactly.
 * @param endpoint       Upstream endpoint.
 * @param presentation   Default color, icon, and label.
 * @param readCount      Reads the raw count from the projected payload.
 * @param suffix         Optional unit suffix (e.g., `' followers'`).
 * @returns Metric rendering (e.g., `'4.2M'`), or `'n/a'` when the count is missing.
 */
export function createCountMetric<P>(
  endpoint: MetricEndpoint<P>,
  presentation: MetricPresentation,
  readCount: (payload: P) => RawCount,
  suffix = ''
): ServiceMetricConfig {
  return createMetric(endpoint, presentation, (payload) => ({
    value: formatCount(readCount(payload), suffix),
  }));
}

/**
 * Create a download metric whose suffix and default color come from the shared period table.
 * @param endpoint    Upstream endpoint.
 * @param period      Canonical download metric key (e.g., `'dw'` -> `/wk`, `'dt'` -> all-time).
 * @param readCount   Reads the raw download count from the projected payload.
 * @param overrides   Optional presentation overrides (e.g., `{ defaultLabel: 'installs' }`).
 * @returns Metric rendering (e.g., `'1.1M/wk'`).
 */
export function createDownloadsMetric<P>(
  endpoint: MetricEndpoint<P>,
  period: DownloadMetricKey,
  readCount: (payload: P) => RawCount,
  overrides?: Partial<MetricPresentation>
): ServiceMetricConfig {
  const spec = DOWNLOAD_PERIODS[period];
  return createCountMetric(
    endpoint,
    {
      defaultColor: overrides?.defaultColor ?? spec.color,
      defaultIcon: overrides?.defaultIcon ?? 'download',
      defaultLabel: overrides?.defaultLabel ?? 'downloads',
    },
    readCount,
    spec.suffix
  );
}

/**
 * Create a community count metric whose label and default color come from the shared community table.
 * @param endpoint    Upstream endpoint.
 * @param kind        Community count kind (e.g., `'followers'`, `'likes'`, `'members'`).
 * @param icon        Service brand icon identifying the platform (e.g., `'discord'`).
 * @param readCount   Reads the raw count from the projected payload.
 * @returns Metric rendering (e.g., `'12.4k'` labeled `followers`).
 */
export function createCommunityMetric<P>(
  endpoint: MetricEndpoint<P>,
  kind: CommunityMetricKind,
  icon: string,
  readCount: (payload: P) => RawCount
): ServiceMetricConfig {
  return createCountMetric(
    endpoint,
    { defaultColor: COMMUNITY_KINDS[kind], defaultIcon: icon, defaultLabel: kind },
    readCount
  );
}

/**
 * Create a metric that formats a byte size with binary units.
 * @param endpoint       Upstream endpoint.
 * @param presentation   Default color, icon, and label.
 * @param readBytes      Reads the raw byte count from the projected payload.
 * @returns Metric rendering (e.g., `'7.8 kB'`), or `'n/a'` when the size is missing.
 */
export function createBytesMetric<P>(
  endpoint: MetricEndpoint<P>,
  presentation: MetricPresentation,
  readBytes: (payload: P) => RawCount
): ServiceMetricConfig {
  return createMetric(endpoint, presentation, (payload) => ({
    value: formatBytes(readBytes(payload)),
  }));
}

/**
 * Create a metric that renders a version string with a `v` prefix for numeric versions.
 * @param endpoint       Upstream endpoint.
 * @param presentation   Default color, icon, and label.
 * @param readVersion    Reads the raw version from the projected payload.
 * @returns Metric rendering (e.g., `'v1.2.3'`), or `'n/a'` when the version is missing.
 */
export function createVersionMetric<P>(
  endpoint: MetricEndpoint<P>,
  presentation: MetricPresentation,
  readVersion: (payload: P) => string | null | undefined
): ServiceMetricConfig {
  return createMetric(endpoint, presentation, (payload) => ({
    value: formatVersion(readVersion(payload)),
  }));
}

/**
 * Create a latest release tag metric (`release`) for a code forge.
 * @param endpoint   Upstream latest release endpoint.
 * @param readTag    Reads the release tag name from the projected payload.
 * @returns Metric rendering (e.g., `'v2.1.0'`).
 */
export function createReleaseMetric<P>(
  endpoint: MetricEndpoint<P>,
  readTag: (payload: P) => string | null | undefined
): ServiceMetricConfig {
  return createVersionMetric(endpoint, RELEASE, readTag);
}

/**
 * Create a license metric (`license`).
 * @param endpoint      Upstream endpoint.
 * @param readLicense   Reads the raw license string from the projected payload.
 * @returns Metric rendering (e.g., `'MIT'`), or `'unknown'` when the license is missing.
 */
export function createLicenseMetric<P>(
  endpoint: MetricEndpoint<P>,
  readLicense: (payload: P) => string | null | undefined
): ServiceMetricConfig {
  return createMetric(endpoint, LICENSE, (payload) => ({
    value: formatLicense(readLicense(payload)),
  }));
}

/**
 * Create a metric that renders a trimmed string value (or `fallback` when missing/blank).
 * @param endpoint       Upstream endpoint.
 * @param presentation   Default color, icon, and label.
 * @param readValue      Reads the raw string from the projected payload.
 * @param fallback       Fallback value when the string is missing or blank (defaults to `'n/a'`).
 * @returns Metric rendering the trimmed text, or `fallback` when missing.
 */
export function createTextMetric<P>(
  endpoint: MetricEndpoint<P>,
  presentation: MetricPresentation,
  readValue: (payload: P) => string | null | undefined,
  fallback = MISSING_VALUE
): ServiceMetricConfig {
  return createMetric(endpoint, presentation, (payload) => {
    const raw = readValue(payload);
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    return { value: trimmed || fallback };
  });
}

/**
 * Create a metric that renders the relative age of an ISO 8601 timestamp.
 * @param endpoint        Upstream endpoint.
 * @param presentation    Default color, icon, and label.
 * @param readTimestamp   Reads the raw timestamp from the projected payload.
 * @returns Metric rendering (e.g., `'3d ago'`), or `'n/a'` when the timestamp is missing.
 */
export function createRelativeDateMetric<P>(
  endpoint: MetricEndpoint<P>,
  presentation: MetricPresentation,
  readTimestamp: (payload: P) => string | null | undefined
): ServiceMetricConfig {
  return createMetric(endpoint, presentation, (payload) => {
    const timestamp = readTimestamp(payload);
    return { value: formatRelativeDate(typeof timestamp === 'string' ? timestamp : undefined) };
  });
}

/**
 * Create a rating metric on a 5-star scale (e.g., `'4.8/5'`), or `'unrated'` when missing or zero.
 * @param endpoint     Upstream endpoint.
 * @param readRating   Reads `[rating, maximum]` from the projected payload (e.g., `[94, 100]` for WordPress).
 * @returns Metric rendering the rating scaled to 5 stars.
 */
export function createRatingMetric<P>(
  endpoint: MetricEndpoint<P>,
  readRating: (payload: P) => readonly [rating: unknown, maximum: number]
): ServiceMetricConfig {
  return createMetric(endpoint, RATING, (payload) => {
    const [rawRating, maximum] = readRating(payload);
    const rating = typeof rawRating === 'number' && Number.isFinite(rawRating) ? rawRating : 0;
    return {
      value: rating > 0 && maximum > 0 ? `${((rating / maximum) * 5).toFixed(1)}/5` : 'unrated',
    };
  });
}

/**
 * Create a score metric with an inline ring gauge (`?special=ring:<pct>`).
 * @param endpoint       Upstream endpoint.
 * @param presentation   Default color, icon, and label.
 * @param readScore      Reads `[achieved, maximum]` points from the projected payload.
 * @param format         Formats the achieved and maximum points into the badge value.
 * @param thresholds     Optional descending percentage thresholds that override the default color.
 * @returns Metric rendering the formatted score plus ring, or `'n/a'` when missing.
 */
export function createScoreMetric<P>(
  endpoint: MetricEndpoint<P>,
  presentation: MetricPresentation,
  readScore: (payload: P) => readonly [achieved: unknown, maximum: unknown],
  format: (achieved: number, maximum: number) => string,
  thresholds?: readonly ScoreColorThreshold[]
): ServiceMetricConfig {
  return createMetric(endpoint, presentation, (payload) => {
    const [achieved, maximum] = readScore(payload);
    return buildScoreResult(achieved, maximum, format, thresholds);
  });
}

/**
 * Create a percentage score metric (`0`–`100`) with a ring gauge (e.g., `'94%'`).
 * @param endpoint       Upstream endpoint.
 * @param presentation   Default color, icon, and label.
 * @param readPercent    Reads the raw percentage from the projected payload.
 * @param thresholds     Optional descending percentage thresholds that override the default color.
 * @returns Metric rendering the percentage plus ring, or `'n/a'` when missing.
 */
export function createPercentScoreMetric<P>(
  endpoint: MetricEndpoint<P>,
  presentation: MetricPresentation,
  readPercent: (payload: P) => unknown,
  thresholds?: readonly ScoreColorThreshold[]
): ServiceMetricConfig {
  return createMetric(endpoint, presentation, (payload) =>
    buildScoreResult(readPercent(payload), MAX_PERCENT, formatPercent, thresholds)
  );
}

/**
 * Create a test coverage metric (`coverage`) with a ring gauge, colored by threshold
 * (`>= 80%` emerald, `>= 60%` amber, otherwise rose).
 * @param endpoint      Upstream endpoint.
 * @param icon          Default icon slug (e.g., `'codecov'`).
 * @param readPercent   Reads the raw coverage percentage (`0`–`100`) from the projected payload.
 * @returns Metric rendering (e.g., `'96.4%'`) plus ring, or `'n/a'` when missing.
 */
export function createCoverageMetric<P>(
  endpoint: MetricEndpoint<P>,
  icon: string,
  readPercent: (payload: P) => unknown
): ServiceMetricConfig {
  return createPercentScoreMetric(
    endpoint,
    { ...COVERAGE, defaultIcon: icon },
    readPercent,
    COVERAGE_THRESHOLDS
  );
}

/**
 * Create an OpenSSF Scorecard score metric (`0`–`10`, e.g., `'8.3/10'`) with a ring gauge, colored
 * by threshold (`>= 7.0` emerald, `>= 4.0` amber, otherwise rose).
 * @param endpoint    Upstream endpoint.
 * @param readScore   Reads the raw aggregate score from the projected payload.
 * @returns Metric rendering the score plus ring, or `'n/a'` when missing.
 */
export function createScorecardMetric<P>(
  endpoint: MetricEndpoint<P>,
  readScore: (payload: P) => unknown
): ServiceMetricConfig {
  return createScoreMetric(
    endpoint,
    { defaultColor: 'emerald', defaultIcon: 'shield-check', defaultLabel: 'openssf scorecard' },
    (payload) => [readScore(payload), MAX_SCORECARD_SCORE],
    formatScoreOutOf,
    SCORECARD_THRESHOLDS
  );
}

/**
 * Create a test coverage service preset for a GitHub repository (`/badge/:service/:owner/:repo/coverage`),
 * colored by threshold (`>= 80%` emerald, `>= 60%` amber, otherwise rose).
 * @param options   Upstream URL templates, coverage reader, icon, and docs metadata.
 * @returns Coverage service definition (`coverage` metric with a `cov` alias).
 */
export function createCoverageService<P extends object>(
  options: CoverageServiceOptions<P>
): ServiceDefinition {
  const endpoint = createEndpoint<CoveragePayload>({
    api: options.api,
    page: options.page,
    project: (data) =>
      isJsonObject(data) ? { percent: options.readPercent(data as Partial<P>) } : undefined,
  });
  return defineService({
    docs: { description: options.description, title: options.title },
    metrics: {
      coverage: createCoverageMetric(endpoint, options.icon, (payload) => payload.percent),
    },
    route: { owner: { isRequired: true, placeholder: ':owner' }, target: { placeholder: ':repo' } },
  });
}
