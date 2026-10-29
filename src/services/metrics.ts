/**
 * Service metric helpers – Compact number, byte size, date, version, and license formatting plus typed metric factories, the shared download period and community count tables, and badge presentations for service presets.
 */

import {
  OWNER_REPO_ROUTE,
  createEndpoint,
  createMetric,
  defineService,
  isJsonObject,
} from '@/services/endpoint';
import { capitalizeWord } from '@/site/shared/encoding';
import {
  MAX_BARS_POINTS,
  MAX_SPARKLINE_POINTS,
  MAX_STEPS_COUNT,
  MAX_STRIP_TICKS,
  MIN_SERIES_POINTS,
} from '@/svg/renderer';
import { getOwnValue, sliceAtCodePoint } from '@/svg/shared';
import type {
  BadgeSpecialKind,
  BadgeSpecialMap,
  CommunityMetricKind,
  DownloadMetricKey,
  DownloadPeriodSpec,
  MetricEndpoint,
  MetricPresentation,
  MetricResult,
  RawCount,
  ScoreColorThreshold,
  SeriesSpecialsOptions,
  ServiceDefinition,
  ServiceMetricConfig,
  ServiceRouteParams,
  StripTickState,
  ThemeColorName,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected coverage payload of `createCoverageService` endpoints. */
interface CoveragePayload {
  /** Optional signed coverage percentage change from the previous build. */
  delta?: number;
  /** Parsed coverage percentage (`0`–`100`) when valid. */
  percent: number | undefined;
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
  /** Optional reader for signed coverage percentage point change. */
  readDelta?: (payload: Partial<P>) => unknown;
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

/** Coverage color thresholds in descending order. */
export const COVERAGE_THRESHOLDS: readonly ScoreColorThreshold[] = [
  { color: 'emerald', minPercent: 80 },
  { color: 'amber', minPercent: 60 },
  { color: 'rose', minPercent: 0 },
];

/** Maximum percentage of percent-based scores. */
const MAX_PERCENT = 100;

/** Maximum OpenSSF Scorecard score. */
export const MAX_SCORECARD_SCORE = 10;

/** OpenSSF Scorecard color thresholds in descending order. */
export const SCORECARD_THRESHOLDS: readonly ScoreColorThreshold[] = [
  { color: 'emerald', minPercent: 70 },
  { color: 'amber', minPercent: 40 },
  { color: 'rose', minPercent: 0 },
];

/** Maximum rendered license string length before truncation with `..` (fits `MIT OR Apache-2.0`). */
const MAX_LICENSE_LENGTH = 24;

/** Maximum nested array recursion depth when reading upstream license structures. */
const MAX_LICENSE_DEPTH = 2;

/** Currency symbols prefixed to formatted amounts; Other ISO 4217 codes are appended instead. */
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = { EUR: '€', GBP: '£', USD: '$' };

/** Amount below which non-integer currency values keep exactly 2 decimals (`'€640.80'`). */
const CURRENCY_CENTS_THRESHOLD = 1000;

/**
 * Download period table (single source of truth for every download metric): Short periods are
 * sky, recent periods emerald, and long periods indigo.
 */
export const DOWNLOAD_PERIODS: Readonly<Record<DownloadMetricKey, DownloadPeriodSpec>> = {
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

/** Star rating vote keys in ascending order (`1★` through `5★`). */
const STAR_KEYS = ['1', '2', '3', '4', '5'] as const;

/** Automatic inline widget kinds supported by score, rating, and coverage metrics. */
const SCORE_SPECIALS: readonly BadgeSpecialKind[] = ['ring', 'bar', 'steps'];

/** Automatic inline widget kinds supported by coverage metrics with build-over-build delta. */
const COVERAGE_DELTA_SPECIALS: readonly BadgeSpecialKind[] = ['ring', 'bar', 'steps', 'delta'];

/** Automatic inline widget kinds supported by OpenSSF Scorecard metrics with check breakdowns. */
const SCORECARD_CHECK_SPECIALS: readonly BadgeSpecialKind[] = [
  'ring',
  'bar',
  'steps',
  'strip',
  'bars',
  'sparkline',
];

/** Automatic inline widget kinds supported by star rating metrics with a vote distribution. */
const RATING_HISTOGRAM_SPECIALS: readonly BadgeSpecialKind[] = [
  'bars',
  'sparkline',
  'ring',
  'bar',
  'steps',
];

/** Default presentation for test coverage metrics (`coverage`), recolored by threshold. */
const COVERAGE: MetricPresentation = {
  autoSpecials: SCORE_SPECIALS,
  defaultColor: 'emerald',
  defaultIcon: 'shield-check',
  defaultLabel: 'Coverage',
  defaultSpecial: 'ring',
};

/** Default presentation for average star rating metrics (`rating`). */
const RATING: MetricPresentation = {
  autoSpecials: SCORE_SPECIALS,
  defaultColor: 'amber',
  defaultIcon: 'star',
  defaultLabel: 'Rating',
};

/** Default presentation for latest release tag metrics (`release`). */
const RELEASE: MetricPresentation = {
  defaultColor: 'indigo',
  defaultIcon: 'tag',
  defaultLabel: 'Release',
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
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  for (const [threshold, suffix] of units) {
    if (absNum >= threshold * (1 - UNIT_PROMOTION_TOLERANCE)) {
      return `${sign}${(absNum / threshold).toFixed(1).replace(TRAILING_ZERO_DECIMAL_RX, '')}${separator}${suffix}`;
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
  return part.length <= SPDX_ACRONYM_MAX_LENGTH ? part.toUpperCase() : capitalizeWord(part);
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
      // The opening parenthesis closes before the end, so it does not enclose the whole text:
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
 * Read a non-empty string from an unknown JSON value.
 * @param raw   Raw JSON value.
 * @returns Non-empty string value, or `undefined` for non-string or blank values.
 */
function readText(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : undefined;
}

/** Read a license name from an SPDX string, nested array, or `{ type }` / `{ id }` / `{ name }` object up to `MAX_LICENSE_DEPTH`. */
function readLicenseNameAtDepth(rawLicense: unknown, depth: number): string | undefined {
  if (typeof rawLicense === 'string') {
    return readText(rawLicense);
  }
  if (Array.isArray(rawLicense)) {
    if (depth >= MAX_LICENSE_DEPTH) {
      return undefined;
    }
    for (const item of rawLicense) {
      const parsed = readLicenseNameAtDepth(item, depth + 1);
      if (parsed !== undefined) {
        return parsed;
      }
    }
    return undefined;
  }
  if (!isJsonObject(rawLicense)) {
    return undefined;
  }
  return readText(rawLicense.type) ?? readText(rawLicense.id) ?? readText(rawLicense.name);
}

/** Build score badge properties (value plus ring gauge and bar/steps alternatives, optionally threshold-colored). */
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
  const ring = { type: 'ring' as const, value: percent };
  return {
    color: thresholds ? resolveThresholdColor(percent, thresholds) : undefined,
    special: ring,
    specials: {
      bar: { type: 'bar', value: percent },
      ring,
      steps: {
        done: Math.round((percent / MAX_PERCENT) * MAX_STEPS_COUNT),
        total: MAX_STEPS_COUNT,
        type: 'steps',
      },
    },
    value: format(achieved, maximum),
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Automatic inline widget kinds supported by time-series metrics with period-over-period delta. */
export const SERIES_DELTA_SPECIALS: readonly BadgeSpecialKind[] = ['sparkline', 'bars', 'delta'];

/** Automatic inline widget kinds supported by period-over-period delta metrics. */
export const DELTA_SPECIALS: readonly BadgeSpecialKind[] = ['delta'];

/** Automatic inline widget kinds supported by part-of-whole ratio metrics. */
export const RATIO_SPECIALS: readonly BadgeSpecialKind[] = ['bar', 'ring'];

/** Automatic inline widget kinds supported by part-of-whole ratio metrics with discrete steps. */
export const RATIO_STEPS_SPECIALS: readonly BadgeSpecialKind[] = ['bar', 'ring', 'steps'];

/** Default presentation for repository fork metrics (`forks`). */
export const FORKS: MetricPresentation = {
  defaultColor: 'sky',
  defaultIcon: 'git-fork',
  defaultLabel: 'Forks',
};

/** Presentation override for download metrics labeled `Installs` (`createDownloadsMetric(…, INSTALLS_LABEL)`). */
export const INSTALLS_LABEL: Partial<MetricPresentation> = { defaultLabel: 'Installs' };

/** Default presentation for open issue metrics (`issues`). */
export const ISSUES: MetricPresentation = {
  defaultColor: 'rose',
  defaultIcon: 'circle-dot',
  defaultLabel: 'Issues',
};

/** Default presentation for last commit / activity metrics (`commit`). */
export const LAST_COMMIT: MetricPresentation = {
  defaultColor: 'rose',
  defaultIcon: 'git-commit-horizontal',
  defaultLabel: 'Last Commit',
};

/** Default presentation for license metrics (`license`). */
export const LICENSE: MetricPresentation = {
  defaultColor: 'slate',
  defaultIcon: 'scale',
  defaultLabel: 'License',
};

/** Default presentation for open pull request metrics (`prs`). */
export const PULL_REQUESTS: MetricPresentation = {
  defaultColor: 'violet',
  defaultIcon: 'git-pull-request',
  defaultLabel: 'Pull Requests',
};

/** Default presentation for quality score metrics with a ring gauge (`score`, `points`). */
export const SCORE: MetricPresentation = {
  autoSpecials: SCORE_SPECIALS,
  defaultColor: 'emerald',
  defaultIcon: 'gauge',
  defaultLabel: 'Score',
  defaultSpecial: 'ring',
};

/** Default presentation for repository star metrics (`stars`). */
export const STARS: MetricPresentation = {
  defaultColor: 'amber',
  defaultIcon: 'star',
  defaultLabel: 'Stars',
};

/** Default presentation for package / image last-updated timestamp metrics (`updated`). */
export const UPDATED: MetricPresentation = {
  defaultColor: 'indigo',
  defaultIcon: 'clock',
  defaultLabel: 'Updated',
};

/** Shared badge properties for a passing build or status check. */
export const PASSING_STATUS: Partial<MetricResult> = {
  color: 'emerald',
  icon: 'circle-check',
  value: 'passing',
};

/** Shared badge properties for a failing build or status check. */
export const FAILING_STATUS: Partial<MetricResult> = {
  color: 'rose',
  icon: 'circle-x',
  value: 'failing',
};

/** Shared badge properties for an unknown or absent build/status check. */
export const UNKNOWN_STATUS: Partial<MetricResult> = {
  color: 'slate',
  icon: 'circle-help',
  value: 'unknown',
};

export { SCORE_SPECIALS, readFiniteNumber, readText };

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
 * Format a raw currency amount compactly, prefixing known currency symbols (`CURRENCY_SYMBOLS`) and
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
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const formatted =
    absAmount < CURRENCY_CENTS_THRESHOLD && !Number.isInteger(absAmount)
      ? absAmount.toFixed(2)
      : formatCompactNumber(absAmount);
  const code = (currency ?? '').toUpperCase();
  const symbol = getOwnValue(CURRENCY_SYMBOLS, code);
  if (symbol !== undefined) {
    return `${sign}${symbol}${formatted}${suffix}`;
  }
  return code ? `${sign}${formatted} ${code}${suffix}` : `${sign}${formatted}${suffix}`;
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
    ? `${sliceAtCodePoint(trimmed, MAX_LICENSE_LENGTH - 2)}..`
    : trimmed;
}

/**
 * Read a license name from an SPDX string, an array of strings or license objects, or a `{ type }` / `{ id }` / `{ name }` object.
 * @param rawLicense   Upstream `license` or `licenses` field.
 * @returns License name, or `undefined` when missing.
 */
export function readLicenseName(rawLicense: unknown): string | undefined {
  return readLicenseNameAtDepth(rawLicense, 0);
}

/**
 * Convert a lowercase SPDX license key into its canonical casing (e.g., `'apache-2.0'` -> `'Apache-2.0'`).
 * @param key   Lowercase SPDX license key (e.g., GitLab `license.key`).
 * @returns Canonically cased license id, or `undefined` when `key` is missing or non-string.
 */
export function formatSpdxKey(key: unknown): string | undefined {
  const trimmed = readText(key)?.trim();
  if (!trimmed) {
    return undefined;
  }
  let formatted = '';
  for (const part of trimmed.split('-')) {
    formatted += formatted.length > 0 ? `-${formatSpdxPart(part)}` : formatSpdxPart(part);
  }
  return formatted;
}

/**
 * Sum the finite numeric entries in `values` across `[start, end)`.
 * @param values   Numeric series.
 * @param start    Inclusive start index.
 * @param end      Exclusive end index.
 * @returns Sum of finite entries in the slice.
 */
export function sumSeries(
  values: readonly number[],
  start = 0,
  end: number = values.length
): number {
  const from = Math.max(0, start);
  const to = Math.min(values.length, end);
  let total = 0;
  for (let i = from; i < to; i += 1) {
    const item = values[i];
    if (item !== undefined && Number.isFinite(item)) {
      total += item;
    }
  }
  return total;
}

/**
 * Sum two adjacent, equal-width trailing windows (`[end - 2 * width, end - width)` vs `[end - width, end)`).
 * When `values.length < maxWindow * 2`, `width` falls back to `Math.floor(values.length / 2)` so odd-length
 * series drop the oldest unpaired element instead of comparing unequal window widths.
 * @param values      Chronological numeric series.
 * @param maxWindow   Maximum window width in elements.
 * @param minWindow   Minimum required window width in elements.
 * @returns `[currentSum, previousSum]`, or `[undefined, undefined]` when fewer than `minWindow` elements per window exist.
 */
export function compareTrailingWindows(
  values: readonly number[],
  maxWindow: number = Math.floor(values.length / 2),
  minWindow = 1
): readonly [current: number | undefined, previous: number | undefined] {
  const width = Math.min(maxWindow, Math.floor(values.length / 2));
  if (width < minWindow) {
    return [undefined, undefined];
  }
  const end = values.length;
  return [sumSeries(values, end - width, end), sumSeries(values, end - width * 2, end - width)];
}

/**
 * Aggregate a numeric series into at most `bucketCount` contiguous per-entry average buckets.
 * Averaging each bucket (`sum / width`) prevents uneven slice widths (`values.length % count !== 0`)
 * from creating sawtooth spikes while preserving exact values when `values.length <= bucketCount`.
 * @param values        Source numeric series in chronological order.
 * @param bucketCount   Target number of buckets.
 * @returns Bucketed series (empty when `values` is empty or `bucketCount <= 0`).
 */
export function bucketSeries(values: readonly number[], bucketCount: number): number[] {
  if (values.length === 0 || bucketCount <= 0) {
    return [];
  }
  const count = Math.min(bucketCount, values.length);
  const buckets: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor((i * values.length) / count);
    const end = Math.floor(((i + 1) * values.length) / count);
    const span = Math.max(1, end - start);
    buckets.push(Math.round((sumSeries(values, start, end) / span) * 100) / 100);
  }
  return buckets;
}

/**
 * Extract a chronological numeric series from an ISO-date-keyed counts map (`{ 'YYYY-MM-DD': count }`).
 * @param dates   Raw date-to-count JSON object.
 * @returns Chronological daily counts (empty when `dates` is not an object).
 */
export function readDateKeyedSeries(dates: unknown): number[] {
  if (!isJsonObject(dates)) {
    return [];
  }
  const values: number[] = [];
  for (const dateKey of Object.keys(dates).toSorted()) {
    values.push(readFiniteNumber(dates[dateKey]) ?? 0);
  }
  return values;
}

/**
 * Extract 1-star through 5-star vote counts from a `{ '1': n, …, '5': n }` rating breakdown object.
 * @param rawVotes   Raw star vote breakdown object.
 * @returns Five-element `[1★, 2★, 3★, 4★, 5★]` array, or `undefined` when missing or all zero.
 */
export function readStarHistogram(rawVotes: unknown): number[] | undefined {
  if (!isJsonObject(rawVotes)) {
    return undefined;
  }
  const counts: number[] = [];
  for (const key of STAR_KEYS) {
    counts.push(Math.max(0, toFiniteNumber(rawVotes[key] as RawCount) ?? 0));
  }
  return sumSeries(counts) > 0 ? counts : undefined;
}

/**
 * Format a signed percentage-point change (`'+1.8%'`, `'-0.4%'`, `'0%'`).
 * @param delta   Signed percentage-point difference.
 * @returns Formatted point delta, or `undefined` when `delta` is missing or non-finite.
 */
export function formatPointDelta(delta: number | undefined): string | undefined {
  if (delta === undefined || !Number.isFinite(delta)) {
    return undefined;
  }
  return Math.abs(delta) < 0.05 ? '0%' : `${delta > 0 ? '+' : ''}${Number(delta.toFixed(1))}%`;
}

/**
 * Format a period-over-period percentage change (`'+14%'`, `'-3.2%'`, `'0%'`).
 * @param current    Current period count or metric value.
 * @param previous   Previous period count or baseline value (must be `> 0`).
 * @returns Formatted delta string, or `undefined` when either value is missing or `previous <= 0`.
 */
export function formatDeltaPercent(current: RawCount, previous: RawCount): string | undefined {
  const currentValue = toFiniteNumber(current);
  const previousValue = toFiniteNumber(previous);
  if (currentValue === undefined || previousValue === undefined || previousValue <= 0) {
    return undefined;
  }
  const percent = ((currentValue - previousValue) / previousValue) * 100;
  if (Math.abs(percent) < 0.05) {
    return '0%';
  }
  const sign = percent > 0 ? '+' : '';
  const rounded = Math.abs(percent) >= 10 ? Math.round(percent) : Number(percent.toFixed(1));
  return `${sign}${rounded}%`;
}

/**
 * Build a candidate `delta` widget comparing a shorter window count against the prior-window pace
 * inside a longer cumulative window (e.g., 30-day installs vs the prior 60 days of 90-day installs).
 * @param shorterCount   Count in the shorter recent window.
 * @param shorterDays    Length of the shorter window in days (`> 0`).
 * @param longerCount    Cumulative count in the longer window (`>= shorterCount`).
 * @param longerDays     Length of the longer window in days (`> shorterDays`).
 * @returns Candidate widget map with `delta`, or `undefined` when unavailable.
 */
export function buildWindowDeltaSpecials(
  shorterCount: RawCount,
  shorterDays: number,
  longerCount: RawCount,
  longerDays: number
): BadgeSpecialMap | undefined {
  const recent = toFiniteNumber(shorterCount);
  const cumulative = toFiniteNumber(longerCount);
  const priorDays = longerDays - shorterDays;
  if (
    recent === undefined ||
    recent < 0 ||
    cumulative === undefined ||
    shorterDays <= 0 ||
    priorDays <= 0 ||
    cumulative <= recent
  ) {
    return undefined;
  }
  const priorPace = ((cumulative - recent) * shorterDays) / priorDays;
  const delta = formatDeltaPercent(recent, priorPace);
  return delta ? { delta: { type: 'delta', value: delta } } : undefined;
}

/**
 * Build candidate gauge (and optional step pill) widgets from a `part / whole` ratio.
 * @param part       Numerator value (`>= 0`).
 * @param whole      Denominator value (`> 0`).
 * @param hasSteps   Whether to also include a discrete `steps` widget.
 * @returns Candidate widget map, or `undefined` when the ratio cannot be computed.
 */
export function buildRatioSpecials(
  part: RawCount,
  whole: RawCount,
  hasSteps = false
): BadgeSpecialMap | undefined {
  const partValue = toFiniteNumber(part);
  const wholeValue = toFiniteNumber(whole);
  if (partValue === undefined || partValue < 0 || wholeValue === undefined || wholeValue <= 0) {
    return undefined;
  }
  const percent = Math.min(MAX_PERCENT, Math.round((partValue / wholeValue) * 100));
  return hasSteps
    ? {
        bar: { type: 'bar', value: percent },
        ring: { type: 'ring', value: percent },
        steps: {
          done: Math.round((percent / MAX_PERCENT) * MAX_STEPS_COUNT),
          total: MAX_STEPS_COUNT,
          type: 'steps',
        },
      }
    : { bar: { type: 'bar', value: percent }, ring: { type: 'ring', value: percent } };
}

/**
 * Build a candidate widget map (`sparkline`, `bars`, `delta`) from time-series and delta inputs.
 * @param options   Series points and current/previous period counts.
 * @returns Candidate widget map, or `undefined` when no widget can be derived.
 */
export function buildSeriesSpecials(options: SeriesSpecialsOptions): BadgeSpecialMap | undefined {
  const specials: BadgeSpecialMap = {};
  const sparklineSource = options.sparklineValues ?? options.barsValues;
  if (sparklineSource && sparklineSource.length >= MIN_SERIES_POINTS) {
    specials.sparkline = {
      type: 'sparkline',
      values: sparklineSource.slice(-MAX_SPARKLINE_POINTS),
    };
  }
  const barsSource = options.barsValues ?? options.sparklineValues;
  if (barsSource && barsSource.length >= MIN_SERIES_POINTS) {
    specials.bars = { type: 'bars', values: barsSource.slice(-MAX_BARS_POINTS) };
  }
  const delta = formatDeltaPercent(options.current, options.previous);
  if (delta !== undefined) {
    specials.delta = { type: 'delta', value: delta };
  }
  return Object.keys(specials).length > 0 ? specials : undefined;
}

/**
 * Build `sparkline`, `bars`, and period-over-period `delta` widgets from the trailing entries of a chronological series.
 * @param series   Chronological numeric series.
 * @returns Candidate widget map, or `undefined` when `series` has fewer than `MIN_SERIES_POINTS` points.
 */
export function buildTrailingSeriesSpecials(
  series: readonly number[] | undefined
): BadgeSpecialMap | undefined {
  return buildSeriesSpecials({
    barsValues: series,
    current: series?.at(-1),
    previous: series && series.length >= MIN_SERIES_POINTS ? series.at(-2) : undefined,
    sparklineValues: series,
  });
}

/**
 * Create a metric that formats a numeric count compactly.
 * @param endpoint        Upstream endpoint.
 * @param presentation    Default color, icon, and label.
 * @param readCount       Reads the raw count from the projected payload.
 * @param suffix          Optional unit suffix (e.g., `' followers'`).
 * @param buildSpecials   Optional builder for automatic inline widgets from the projected payload.
 * @returns Metric rendering (e.g., `'4.2M'`), or `'n/a'` when the count is missing.
 */
export function createCountMetric<P>(
  endpoint: MetricEndpoint<P>,
  presentation: MetricPresentation,
  readCount: (payload: P) => RawCount,
  suffix = '',
  buildSpecials?: (payload: P) => BadgeSpecialMap | undefined
): ServiceMetricConfig {
  return createMetric(endpoint, presentation, (payload) => ({
    specials: buildSpecials?.(payload),
    value: formatCount(readCount(payload), suffix),
  }));
}

/**
 * Create a download metric whose suffix and default color come from the shared period table.
 * @param endpoint        Upstream endpoint.
 * @param period          Canonical download metric key (e.g., `'dw'` -> `/wk`, `'dt'` -> all-time).
 * @param readCount       Reads the raw download count from the projected payload.
 * @param overrides       Optional presentation overrides (e.g., `{ defaultLabel: 'Installs' }`).
 * @param buildSpecials   Optional builder for automatic inline widgets from the projected payload.
 * @returns Metric rendering (e.g., `'1.1M/wk'`).
 */
export function createDownloadsMetric<P>(
  endpoint: MetricEndpoint<P>,
  period: DownloadMetricKey,
  readCount: (payload: P) => RawCount,
  overrides?: Partial<MetricPresentation>,
  buildSpecials?: (payload: P) => BadgeSpecialMap | undefined
): ServiceMetricConfig {
  const spec = DOWNLOAD_PERIODS[period];
  return createCountMetric(
    endpoint,
    { defaultColor: spec.color, defaultIcon: 'download', defaultLabel: 'Downloads', ...overrides },
    readCount,
    spec.suffix,
    buildSpecials
  );
}

/**
 * Create a community count metric whose label and default color come from the shared community table.
 * @param endpoint        Upstream endpoint.
 * @param kind            Community count kind (e.g., `'followers'`, `'likes'`, `'members'`).
 * @param icon            Service brand icon identifying the platform (e.g., `'discord'`).
 * @param readCount       Reads the raw count from the projected payload.
 * @param buildSpecials   Optional builder for automatic inline widgets from the projected payload.
 * @param autoSpecials    Optional list of automatic inline widget kinds supported by this metric.
 * @returns Metric rendering (e.g., `'12.4k'` labeled `Followers`).
 */
export function createCommunityMetric<P>(
  endpoint: MetricEndpoint<P>,
  kind: CommunityMetricKind,
  icon: string,
  readCount: (payload: P) => RawCount,
  buildSpecials?: (payload: P) => BadgeSpecialMap | undefined,
  autoSpecials?: readonly BadgeSpecialKind[]
): ServiceMetricConfig {
  return createCountMetric(
    endpoint,
    {
      autoSpecials,
      defaultColor: COMMUNITY_KINDS[kind],
      defaultIcon: icon,
      defaultLabel: capitalizeWord(kind),
    },
    readCount,
    '',
    buildSpecials
  );
}

/**
 * Create a metric that formats a byte size with binary units.
 * @param endpoint        Upstream endpoint.
 * @param presentation    Default color, icon, and label.
 * @param readBytes       Reads the raw byte count from the projected payload.
 * @param buildSpecials   Optional builder for automatic inline widgets from the projected payload.
 * @returns Metric rendering (e.g., `'7.8 kB'`), or `'n/a'` when the size is missing.
 */
export function createBytesMetric<P>(
  endpoint: MetricEndpoint<P>,
  presentation: MetricPresentation,
  readBytes: (payload: P) => RawCount,
  buildSpecials?: (payload: P) => BadgeSpecialMap | undefined
): ServiceMetricConfig {
  return createMetric(endpoint, presentation, (payload) => ({
    specials: buildSpecials?.(payload),
    value: formatBytes(readBytes(payload)),
  }));
}

/**
 * Create a metric that renders a version string with a `v` prefix for numeric versions.
 * @param endpoint       Upstream endpoint.
 * @param presentation   Default color, icon, and label.
 * @param readVersion    Reads the raw version from the projected payload and route parameters.
 * @returns Metric rendering (e.g., `'v1.2.3'`), or `'n/a'` when the version is missing.
 */
export function createVersionMetric<P>(
  endpoint: MetricEndpoint<P>,
  presentation: MetricPresentation,
  readVersion: (payload: P, params: ServiceRouteParams) => string | null | undefined
): ServiceMetricConfig {
  return createMetric(endpoint, presentation, (payload, params) => ({
    value: formatVersion(readVersion(payload, params)),
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
 * @param readLicense   Reads the raw license string, array, or object from the projected payload.
 * @returns Metric rendering (e.g., `'MIT'`), or `'unknown'` when the license is missing.
 */
export function createLicenseMetric<P>(
  endpoint: MetricEndpoint<P>,
  readLicense: (payload: P) => unknown
): ServiceMetricConfig {
  return createMetric(endpoint, LICENSE, (payload) => ({
    value: formatLicense(readLicenseName(readLicense(payload))),
  }));
}

/**
 * Create a metric that renders a trimmed string value (or `fallback` when missing/blank).
 * @param endpoint       Upstream endpoint.
 * @param presentation   Default color, icon, and label.
 * @param readValue      Reads the raw string from the projected payload.
 * @param fallback       Fallback value when the string is missing or blank.
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
 * @param endpoint        Upstream endpoint.
 * @param readRating      Reads `[rating, maximum]` from the projected payload (e.g., `[94, 100]` for WordPress).
 * @param readHistogram   Optional reader returning star vote counts (1-star through 5-star) for `bars` and `sparkline`.
 * @returns Metric rendering the rating scaled to 5 stars.
 */
export function createRatingMetric<P>(
  endpoint: MetricEndpoint<P>,
  readRating: (payload: P) => readonly [rating: unknown, maximum: number],
  readHistogram?: (payload: P) => readonly number[] | undefined
): ServiceMetricConfig {
  const presentation: MetricPresentation = readHistogram
    ? { ...RATING, autoSpecials: RATING_HISTOGRAM_SPECIALS }
    : RATING;
  return createMetric(endpoint, presentation, (payload) => {
    const [rawRating, maximum] = readRating(payload);
    const rating = toFiniteNumber(rawRating as RawCount) ?? 0;
    if (rating <= 0 || maximum <= 0) {
      return { value: 'unrated' };
    }
    const scaled = Math.min(5, Math.max(0, (rating / maximum) * 5));
    const percent = Math.min(MAX_PERCENT, Math.round((rating / maximum) * 100));
    const specials: BadgeSpecialMap = {
      bar: { type: 'bar', value: percent },
      ring: { type: 'ring', value: percent },
      steps: { done: Math.min(5, Math.max(0, Math.round(scaled))), total: 5, type: 'steps' },
    };
    const histogram = readHistogram?.(payload);
    if (histogram && histogram.length >= MIN_SERIES_POINTS && sumSeries(histogram) > 0) {
      specials.bars = { type: 'bars', values: histogram.slice(0, MAX_BARS_POINTS) };
      specials.sparkline = { type: 'sparkline', values: histogram.slice(0, MAX_SPARKLINE_POINTS) };
    }
    return { specials, value: `${scaled.toFixed(1)}/5` };
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
  format: (achieved: number, maximum: number) => string = formatScoreOutOf,
  thresholds?: readonly ScoreColorThreshold[]
): ServiceMetricConfig {
  return createMetric(
    endpoint,
    {
      autoSpecials: SCORE_SPECIALS,
      defaultSpecial: 'ring',
      ...(thresholds ? { hasDynamicColor: true } : {}),
      ...presentation,
    },
    (payload) => {
      const [achieved, maximum] = readScore(payload);
      return buildScoreResult(achieved, maximum, format, thresholds);
    }
  );
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
  return createMetric(
    endpoint,
    {
      autoSpecials: SCORE_SPECIALS,
      defaultSpecial: 'ring',
      ...(thresholds ? { hasDynamicColor: true } : {}),
      ...presentation,
    },
    (payload) => buildScoreResult(readPercent(payload), MAX_PERCENT, formatPercent, thresholds)
  );
}

/**
 * Create a test coverage metric (`coverage`) with a ring gauge, colored by `COVERAGE_THRESHOLDS`.
 * @param endpoint      Upstream endpoint.
 * @param icon          Default icon slug (e.g., `'codecov'`).
 * @param readPercent   Reads the raw coverage percentage from the projected payload.
 * @param readDelta     Optional reader for signed coverage percentage-point change (adds `delta` widget).
 * @returns Metric rendering (e.g., `'96.4%'`) plus ring, or `'n/a'` when missing.
 */
export function createCoverageMetric<P>(
  endpoint: MetricEndpoint<P>,
  icon: string,
  readPercent: (payload: P) => unknown,
  readDelta?: (payload: P) => number | undefined
): ServiceMetricConfig {
  const base = createPercentScoreMetric(
    endpoint,
    { ...COVERAGE, defaultIcon: icon },
    readPercent,
    COVERAGE_THRESHOLDS
  );
  if (!readDelta) {
    return base;
  }
  return {
    ...base,
    autoSpecials: COVERAGE_DELTA_SPECIALS,
    transform: (rawPayload, params) => {
      const result = base.transform(rawPayload, params);
      const deltaText = formatPointDelta(readDelta(rawPayload as P));
      if (!result?.specials || deltaText === undefined) {
        return result;
      }
      return {
        ...result,
        specials: { ...result.specials, delta: { type: 'delta', value: deltaText } },
      };
    },
  };
}

/**
 * Extract valid check scores from an OpenSSF Scorecard `checks` array.
 * @param rawChecks   Upstream `checks` array (`[{ score: number }, …]`).
 * @returns Array of valid check scores (`0` to `MAX_SCORECARD_SCORE`), or `undefined` when fewer than `MIN_SERIES_POINTS` checks are present.
 */
export function readScorecardCheckScores(rawChecks: unknown): number[] | undefined {
  if (!Array.isArray(rawChecks)) {
    return undefined;
  }
  const scores: number[] = [];
  for (const check of rawChecks) {
    if (isJsonObject(check)) {
      const score = readFiniteNumber(check.score);
      if (score !== undefined && score >= 0 && score <= MAX_SCORECARD_SCORE) {
        scores.push(score);
      }
    }
  }
  return scores.length >= MIN_SERIES_POINTS ? scores : undefined;
}

/**
 * Create an OpenSSF Scorecard score metric with a ring gauge, colored by `SCORECARD_THRESHOLDS`.
 * @param endpoint     Upstream endpoint.
 * @param readScore    Reads the raw aggregate score from the projected payload.
 * @param readChecks   Optional reader returning valid check scores for multi-check widgets.
 * @returns Metric rendering the score plus ring, or `'n/a'` when missing.
 */
export function createScorecardMetric<P>(
  endpoint: MetricEndpoint<P>,
  readScore: (payload: P) => unknown,
  readChecks?: (payload: P) => readonly number[] | undefined
): ServiceMetricConfig {
  const presentation: MetricPresentation = {
    autoSpecials: readChecks ? SCORECARD_CHECK_SPECIALS : SCORE_SPECIALS,
    defaultColor: 'emerald',
    defaultIcon: 'shield-check',
    defaultLabel: 'OpenSSF Scorecard',
    defaultSpecial: 'ring',
    hasDynamicColor: true,
  };
  return createMetric(endpoint, presentation, (payload) => {
    const base = buildScoreResult(
      readScore(payload),
      MAX_SCORECARD_SCORE,
      formatScoreOutOf,
      SCORECARD_THRESHOLDS
    );
    const checks = readChecks?.(payload);
    if (!base.specials || !checks || checks.length < MIN_SERIES_POINTS) {
      return base;
    }
    const states: StripTickState[] = [];
    for (const score of checks.slice(0, MAX_STRIP_TICKS)) {
      const digit = Math.min(9, Math.max(0, Math.round((score / MAX_SCORECARD_SCORE) * 9)));
      states.push(String(digit) as StripTickState);
    }
    let passedChecks = 0;
    for (const score of checks) {
      if (score >= 7) {
        passedChecks += 1;
      }
    }
    const stepTotal = Math.min(MAX_STEPS_COUNT, checks.length);
    const rawStepDone = Math.round((passedChecks / checks.length) * stepTotal);
    const stepDone =
      passedChecks < checks.length ? Math.min(stepTotal - 1, rawStepDone) : stepTotal;
    return {
      ...base,
      specials: {
        ...base.specials,
        bars: { type: 'bars', values: checks.slice(0, MAX_BARS_POINTS) },
        sparkline: { type: 'sparkline', values: checks.slice(0, MAX_SPARKLINE_POINTS) },
        steps: { done: stepDone, total: stepTotal, type: 'steps' },
        strip: { states, type: 'strip' },
      },
    };
  });
}

/**
 * Create a test coverage service preset for a repository (`/badge/:service/:owner/:repo/coverage`),
 * colored by `COVERAGE_THRESHOLDS`.
 * @param options   Upstream URL templates, coverage reader, icon, and docs metadata.
 * @returns Coverage service definition.
 */
export function createCoverageService<P extends object>(
  options: CoverageServiceOptions<P>
): ServiceDefinition {
  const endpoint = createEndpoint<CoveragePayload>({
    api: options.api,
    page: options.page,
    project: (data) => {
      if (!isJsonObject(data)) {
        return undefined;
      }
      const typed = data as Partial<P>;
      const percent = toFiniteNumber(options.readPercent(typed) as RawCount);
      const delta = options.readDelta
        ? toFiniteNumber(options.readDelta(typed) as RawCount)
        : undefined;
      return delta === undefined ? { percent } : { delta, percent };
    },
  });
  const coverageMetric = createCoverageMetric(
    endpoint,
    options.icon,
    (payload) => payload.percent,
    options.readDelta ? (payload) => payload.delta : undefined
  );
  return defineService({
    docs: { description: options.description, title: options.title },
    metrics: { coverage: coverageMetric },
    route: OWNER_REPO_ROUTE,
  });
}
