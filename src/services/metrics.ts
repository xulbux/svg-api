/**
 * Service metric helpers – Compact number, byte size, date, version, and license formatting plus reusable transform factories, endpoint factories, and badge presentations for service presets.
 */

import type {
  MetricEndpoint,
  MetricPresentation,
  MetricResult,
  MetricTransform,
  ScoreColorThreshold,
  ThemeColorName,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Raw numeric upstream value (number or numeric string), possibly missing. */
type RawCount = number | string | null | undefined;

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

/** Maximum coverage percentage. */
const MAX_COVERAGE_PERCENT = 100;

/** Maximum rendered license string length before truncation with `..`. */
const MAX_LICENSE_LENGTH = 18;

/** Currency symbols prefixed to formatted amounts; Other ISO 4217 codes are appended instead. */
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = { EUR: '€', GBP: '£', USD: '$' };

/** Amount below which non-integer currency values keep exactly 2 decimals (`'€640.80'`). */
const CURRENCY_CENTS_THRESHOLD = 1000;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a trailing `.0` in compact formatted numbers. */
const TRAILING_ZERO_DECIMAL_RX = /\.0$/;

/** Matches a leading ASCII digit (versions that should receive a `v` prefix). */
const LEADING_DIGIT_RX = /^\d/;

/** Matches the SPDX custom license prefix (`LicenseRef-Polyform-Shield-1.0.0`). */
const LICENSE_REF_PREFIX_RX = /^LicenseRef-/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Convert a numeric or numeric-string upstream value into a finite number, or `undefined`. */
function toFiniteNumber(raw: RawCount): number | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

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
  const lowerPart = part.toLowerCase();
  if (Object.hasOwn(SPDX_PART_OVERRIDES, lowerPart)) {
    return SPDX_PART_OVERRIDES[lowerPart];
  }
  return part.length <= SPDX_ACRONYM_MAX_LENGTH
    ? part.toUpperCase()
    : part.charAt(0).toUpperCase() + part.slice(1);
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

// -------------------------------------- PUBLIC API -------------------------------------

/** Default presentation for all-time total download metrics (`dt`). */
export const TOTAL_DOWNLOADS: MetricPresentation = {
  defaultColor: 'indigo',
  defaultIcon: 'download',
  defaultLabel: 'downloads',
};

/** Default presentation for monthly or recent download metrics (`dl`). */
export const RECENT_DOWNLOADS: MetricPresentation = {
  defaultColor: 'emerald',
  defaultIcon: 'download',
  defaultLabel: 'downloads',
};

/** Default presentation for weekly download metrics (`dw`). */
export const WEEKLY_DOWNLOADS: MetricPresentation = {
  defaultColor: 'sky',
  defaultIcon: 'download',
  defaultLabel: 'downloads',
};

/** Default presentation for license metrics (`license`). */
export const LICENSE: MetricPresentation = {
  defaultColor: 'slate',
  defaultIcon: 'scale',
  defaultLabel: 'license',
};

/** Default presentation for repository star metrics (`stars`). */
export const STARS: MetricPresentation = {
  defaultColor: 'amber',
  defaultIcon: 'star',
  defaultLabel: 'stars',
};

/** Default presentation for repository fork metrics (`forks`). */
export const FORKS: MetricPresentation = {
  defaultColor: 'sky',
  defaultIcon: 'git-fork',
  defaultLabel: 'forks',
};

/** Default presentation for open issue metrics (`issues`). */
export const ISSUES: MetricPresentation = {
  defaultColor: 'rose',
  defaultIcon: 'circle-dot',
  defaultLabel: 'issues',
};

/** Default presentation for open pull request metrics (`prs`). */
export const PULL_REQUESTS: MetricPresentation = {
  defaultColor: 'violet',
  defaultIcon: 'git-pull-request',
  defaultLabel: 'pull requests',
};

/** Default presentation for last commit / activity metrics (`commit`). */
export const LAST_COMMIT: MetricPresentation = {
  defaultColor: 'rose',
  defaultIcon: 'git-commit-horizontal',
  defaultLabel: 'last commit',
};

/** Default presentation for latest release tag metrics (`release`). */
export const RELEASE: MetricPresentation = {
  defaultColor: 'indigo',
  defaultIcon: 'tag',
  defaultLabel: 'release',
};

/** Default presentation for average star rating metrics (`rating`). */
export const RATING: MetricPresentation = {
  defaultColor: 'amber',
  defaultIcon: 'star',
  defaultLabel: 'rating',
};

/** Default presentation for test coverage metrics (`coverage`), recolored by `createCoverageTransform`. */
export const COVERAGE: MetricPresentation = {
  defaultColor: 'emerald',
  defaultIcon: 'shield-check',
  defaultLabel: 'coverage',
};

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
  if (bytes === undefined) {
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
 * @param isoTimestamp   ISO 8601 timestamp string from an upstream API.
 * @param nowMs          Optional reference timestamp in milliseconds (defaults to `Date.now()`).
 * @returns Compact relative time label, or `'n/a'` when the timestamp is missing or invalid.
 */
export function formatRelativeDate(isoTimestamp?: string, nowMs = Date.now()): string {
  const parsedMs = isoTimestamp ? Date.parse(isoTimestamp) : Number.NaN;
  if (!Number.isFinite(parsedMs)) {
    return MISSING_VALUE;
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

/**
 * Format a raw version string as a badge value, adding a `v` prefix to numeric versions.
 * @param rawVersion   Upstream version or tag string (e.g., `'1.2.3'`, `'v2.0.0'`, `'nightly'`).
 * @returns Badge value (e.g., `'v1.2.3'`), or `'n/a'` when missing.
 */
export function formatVersion(rawVersion: string | null | undefined): string {
  const trimmed = (rawVersion ?? '').trim();
  if (!trimmed) {
    return MISSING_VALUE;
  }
  return LEADING_DIGIT_RX.test(trimmed) ? `v${trimmed}` : trimmed;
}

/**
 * Format a raw license string as a badge value, dropping the SPDX `LicenseRef-` prefix and
 * truncating overly long license texts with `..`.
 * @param rawLicense   Upstream SPDX expression or license name.
 * @returns Badge value (e.g., `'MIT'`), or `'unknown'` when missing.
 */
export function formatLicense(rawLicense: string | null | undefined): string {
  const trimmed = (rawLicense ?? '').trim().replace(LICENSE_REF_PREFIX_RX, '');
  if (!trimmed) {
    return 'unknown';
  }
  return trimmed.length > MAX_LICENSE_LENGTH
    ? `${trimmed.slice(0, MAX_LICENSE_LENGTH - 2)}..`
    : trimmed;
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
 * Create a transform that reads a numeric count from a typed payload and formats it compactly.
 * @param readCount   Reads the raw count (number or numeric string) from the payload.
 * @param suffix      Optional unit suffix appended to the formatted count (e.g., `'/mo'`).
 * @returns Metric transform rendering e.g. `'4.2M/mo'`, or `'n/a'` when the count is missing.
 */
export function createCountTransform<T>(
  readCount: (payload: Partial<T>) => RawCount,
  suffix = ''
): MetricTransform {
  return function transformCount(data: unknown): Partial<MetricResult> {
    return { value: formatCount(readCount((data ?? {}) as Partial<T>), suffix) };
  };
}

/**
 * Create a transform that reads a byte size from a typed payload and formats it with binary units.
 * @param readBytes   Reads the raw byte count from the payload.
 * @returns Metric transform rendering e.g. `'7.8 kB'`, or `'n/a'` when the size is missing.
 */
export function createBytesTransform<T>(
  readBytes: (payload: Partial<T>) => RawCount
): MetricTransform {
  return function transformBytes(data: unknown): Partial<MetricResult> {
    return { value: formatBytes(readBytes((data ?? {}) as Partial<T>)) };
  };
}

/**
 * Create a transform that reads a version string from a typed payload.
 * @param readVersion   Reads the raw version string from the payload.
 * @returns Metric transform rendering e.g. `'v1.2.3'`, or `'n/a'` when the version is missing.
 */
export function createVersionTransform<T>(
  readVersion: (payload: Partial<T>) => string | null | undefined
): MetricTransform {
  return function transformVersion(data: unknown): Partial<MetricResult> {
    return { value: formatVersion(readVersion((data ?? {}) as Partial<T>)) };
  };
}

/**
 * Create a transform that reads a license string from a typed payload.
 * @param readLicense   Reads the raw license string from the payload.
 * @returns Metric transform rendering e.g. `'MIT'`, or `'unknown'` when the license is missing.
 */
export function createLicenseTransform<T>(
  readLicense: (payload: Partial<T>) => string | null | undefined
): MetricTransform {
  return function transformLicense(data: unknown): Partial<MetricResult> {
    return { value: formatLicense(readLicense((data ?? {}) as Partial<T>)) };
  };
}

/**
 * Create a transform that reads an ISO 8601 timestamp from a typed payload and renders its relative age.
 * @param readTimestamp   Reads the raw ISO 8601 timestamp from the payload.
 * @returns Metric transform rendering e.g. `'3d ago'`, or `'n/a'` when the timestamp is missing.
 */
export function createRelativeDateTransform<T>(
  readTimestamp: (payload: Partial<T>) => string | null | undefined
): MetricTransform {
  return function transformRelativeDate(data: unknown): Partial<MetricResult> {
    return { value: formatRelativeDate(readTimestamp((data ?? {}) as Partial<T>) ?? undefined) };
  };
}

/**
 * Create a transform that rates on a 5-star scale (e.g., `'4.8/5'`), or `'unrated'` when missing or zero.
 * @param readRating   Reads `[rating, maximum]` from the payload (e.g., `[94, 100]` for WordPress).
 * @returns Metric transform rendering the rating scaled to 5 stars.
 */
export function createRatingTransform<T>(
  readRating: (payload: Partial<T>) => readonly [rating: unknown, maximum: number]
): MetricTransform {
  return function transformRating(data: unknown): Partial<MetricResult> {
    const [rawRating, maximum] = readRating((data ?? {}) as Partial<T>);
    const rating = typeof rawRating === 'number' ? rawRating : 0;
    return {
      value: rating > 0 && maximum > 0 ? `${((rating / maximum) * 5).toFixed(1)}/5` : 'unrated',
    };
  };
}

/**
 * Create a transform that renders a score percentage with an inline ring gauge (`?special=ring:<pct>`).
 * @param readScore    Reads `[achieved, maximum]` points from the payload.
 * @param format       Formats the achieved and maximum points into the badge value.
 * @param thresholds   Optional descending percentage thresholds that override the default color.
 * @returns Metric transform rendering the formatted score plus ring, or `'n/a'` when missing.
 */
export function createScoreTransform<T>(
  readScore: (payload: Partial<T>) => readonly [achieved: unknown, maximum: unknown],
  format: (achieved: number, maximum: number) => string,
  thresholds?: readonly ScoreColorThreshold[]
): MetricTransform {
  return function transformScore(data: unknown): Partial<MetricResult> {
    const [rawAchieved, rawMaximum] = readScore((data ?? {}) as Partial<T>);
    const achieved = typeof rawAchieved === 'number' ? rawAchieved : undefined;
    const maximum = typeof rawMaximum === 'number' ? rawMaximum : undefined;
    if (achieved === undefined || maximum === undefined || maximum <= 0) {
      return { value: MISSING_VALUE };
    }
    const percent = Math.round((achieved / maximum) * 100);
    return {
      color: thresholds ? resolveThresholdColor(percent, thresholds) : undefined,
      special: { type: 'ring', value: percent },
      value: format(achieved, maximum),
    };
  };
}

/**
 * Create a transform that renders a coverage percentage with a ring gauge, colored by threshold
 * (`>= 80%` emerald, `>= 60%` amber, otherwise rose).
 * @param readPercent   Reads the raw coverage percentage (`0`–`100`) from the payload.
 * @returns Metric transform rendering e.g. `'96.4%'` plus ring, or `'n/a'` when missing.
 */
export function createCoverageTransform<T>(
  readPercent: (payload: Partial<T>) => unknown
): MetricTransform {
  return createScoreTransform<T>(
    (payload) => [readPercent(payload), MAX_COVERAGE_PERCENT],
    formatPercent,
    COVERAGE_THRESHOLDS
  );
}

/**
 * Create a transform that applies `transformEntry` to the first entry of an upstream result list,
 * reporting an empty or missing list as not found (e.g., AUR `results`, NuGet `data`, cranlogs rows).
 * @param readEntries      Reads the result list from the payload.
 * @param transformEntry   Metric transform applied to the first entry.
 * @returns Metric transform returning `undefined` (not found) when the list is empty.
 */
export function createFirstEntryTransform<T>(
  readEntries: (payload: Partial<T>) => unknown,
  transformEntry: MetricTransform
): MetricTransform {
  return function transformFirstEntry(
    data: unknown,
    owner: string,
    target: string
  ): Partial<MetricResult> | undefined {
    const entries = readEntries((data ?? {}) as Partial<T>);
    const entry: unknown = Array.isArray(entries) ? entries[0] : undefined;
    return entry !== null && typeof entry === 'object'
      ? transformEntry(entry, owner, target)
      : undefined;
  };
}

/**
 * Create an endpoint factory for a code forge's `/:owner/:repo` API resources and web pages (GitHub, GitLab, Codeberg, Gitea).
 * @param buildApiBase   Builds the repository API base URL (without a trailing slash) for `(owner, repo)`.
 * @param webOrigin      Forge web origin (e.g., `'https://github.com'`).
 * @returns Factory creating an endpoint from an API sub-resource suffix and a web page suffix.
 */
export function createRepoEndpointFactory(
  buildApiBase: (owner: string, repo: string) => string,
  webOrigin: string
): (apiSuffix: string, pageSuffix: string) => MetricEndpoint {
  return function createRepoEndpoint(apiSuffix: string, pageSuffix: string): MetricEndpoint {
    return {
      buildApiUrl: (owner: string, repo: string): string =>
        `${buildApiBase(owner, repo)}${apiSuffix}`,
      buildRedirectUrl: (owner: string, repo: string): string =>
        `${webOrigin}/${owner}/${repo}${pageSuffix}`,
    };
  };
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
