/**
 * Debian service preset – Source package version for a Debian suite from Debian Sources (`/badge/debian/[:suite/]:pkg/v`).
 *
 * The optional suite segment defaults to `sid` and also accepts the release aliases `stable`
 * (`trixie`), `testing` (`forky`), `unstable` (`sid`), and `oldstable` (`bookworm`).
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import { createVersionMetric, readText } from '@/services/metrics';
import { getOwnValue } from '@/svg/shared';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Debian source package versions by suite (`sources.debian.org/api/src/:pkg/`). */
interface DebianSourceProjection {
  /** Newest version string for each suite name (`sid`, `trixie`, `bookworm`, …). */
  bySuite: Readonly<Record<string, string>>;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Default Debian suite when `:suite` is omitted. */
const DEFAULT_DEBIAN_SUITE = 'sid';

/** Canonical suite codenames for Debian release aliases. */
const DEBIAN_SUITE_ALIASES: Readonly<Record<string, string>> = {
  oldstable: 'bookworm',
  stable: 'trixie',
  testing: 'forky',
  unstable: 'sid',
};

// -------------------------------------- INTERNALS --------------------------------------

/** Resolve the default Debian suite (`sid`). */
function resolveDefaultDebianSuite(): string {
  return DEFAULT_DEBIAN_SUITE;
}

/** Project a Debian Sources response into its newest version per suite (`undefined` when not found). */
function projectDebianSource(data: unknown): DebianSourceProjection | undefined {
  if (!isJsonObject(data) || data.error !== undefined || !Array.isArray(data.versions)) {
    return undefined;
  }
  const bySuite: Record<string, string> = {};
  for (const entry of data.versions) {
    if (isJsonObject(entry) && Array.isArray(entry.suites)) {
      const version = readText(entry.version);
      if (version) {
        for (const rawSuite of entry.suites) {
          if (typeof rawSuite === 'string' && !Object.hasOwn(bySuite, rawSuite)) {
            bySuite[rawSuite] = version;
          }
        }
      }
    }
  }
  return Object.keys(bySuite).length > 0 ? { bySuite } : undefined;
}

/** Read the package version for the requested Debian suite (or its release alias). */
function readDebianSuiteVersion(
  source: DebianSourceProjection,
  rawSuite: string
): string | undefined {
  const normalized = rawSuite.toLowerCase();
  const suite = getOwnValue(DEBIAN_SUITE_ALIASES, normalized) ?? normalized;
  return getOwnValue(source.bySuite, suite);
}

/** Debian Sources API endpoint with Debian Package Tracker redirect. */
const DEBIAN_ENDPOINT = createEndpoint({
  api: 'https://sources.debian.org/api/src/{target}/',
  page: 'https://tracker.debian.org/pkg/{target}',
  project: projectDebianSource,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Debian Sources service preset (`debian`). */
export const DEBIAN_SERVICE = defineService({
  docs: {
    description:
      'Source package version of a Debian suite (omit :suite for sid, or pass stable/trixie/bookworm).',
    title: 'Debian',
  },
  metrics: {
    v: createVersionMetric(
      DEBIAN_ENDPOINT,
      { defaultColor: 'rose', defaultIcon: 'debian', defaultLabel: 'debian' },
      (source, params) => readDebianSuiteVersion(source, params.owner)
    ),
  },
  route: {
    owner: { isRequired: false, placeholder: ':suite', resolveDefault: resolveDefaultDebianSuite },
    target: { placeholder: ':pkg' },
  },
});
