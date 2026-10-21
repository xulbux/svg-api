/**
 * MetaCPAN service preset – Perl distribution version, license, and last release date (`/badge/cpan/:dist/:metric`).
 *
 * The distribution name is placed into a Lucene query string, so it is restricted to ASCII letters,
 * digits, and inner hyphens (CPAN distribution names, e.g., `libwww-perl`) before any fetch.
 */

import { createEndpoint, defineService, isJsonObject, pickFields } from '@/services/endpoint';
import {
  createLicenseMetric,
  createRelativeDateMetric,
  createVersionMetric,
} from '@/services/metrics';
import { getOwnValue } from '@/svg/shared';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected `_source` of the latest MetaCPAN release (`fastapi.metacpan.org/v1/release/_search`). */
interface CpanRelease {
  /** UTC release timestamp without a timezone suffix (e.g., `'2026-10-01T00:35:44'`). */
  date: string;
  /** `CPAN::Meta::Spec` license keys (e.g., `['perl_5']`). */
  license: string[];
  /** Release version (e.g., `'2.4001'`, `'v1.2.3'`). */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Display names of the `CPAN::Meta::Spec` license keys (SPDX ids where one exists). */
const CPAN_LICENSE_NAMES: Readonly<Record<string, string>> = {
  agpl_3: 'AGPL-3.0',
  apache_1_1: 'Apache-1.1',
  apache_2_0: 'Apache-2.0',
  artistic_1: 'Artistic-1.0',
  artistic_2: 'Artistic-2.0',
  bsd: 'BSD-3-Clause',
  freebsd: 'BSD-2-Clause',
  gfdl_1_2: 'GFDL-1.2',
  gfdl_1_3: 'GFDL-1.3',
  gpl_1: 'GPL-1.0',
  gpl_2: 'GPL-2.0',
  gpl_3: 'GPL-3.0',
  lgpl_2_1: 'LGPL-2.1',
  lgpl_3_0: 'LGPL-3.0',
  mit: 'MIT',
  mozilla_1_0: 'MPL-1.0',
  mozilla_1_1: 'MPL-1.1',
  open_source: 'open source',
  openssl: 'OpenSSL',
  perl_5: 'Perl 5',
  qpl_1_0: 'QPL-1.0',
  restricted: 'restricted',
  ssleay: 'SSLeay',
  sun: 'SISSL',
  unrestricted: 'unrestricted',
  zlib: 'Zlib',
};

/** Key of the stored document of an Elasticsearch search hit. */
const SEARCH_HIT_SOURCE_KEY = '_source';

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a CPAN distribution name (ASCII letters, digits, and inner hyphens; Safe inside a Lucene query). */
const CPAN_DIST_RX = /^[A-Za-z\d][A-Za-z\d-]{0,127}$/;

/** Matches a trailing ISO 8601 timezone designator (`Z` or `±hh:mm`). */
const TIMEZONE_SUFFIX_RX = /(?:Z|[+-]\d{2}:?\d{2})$/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Projects the `_source` fields of a release search hit. */
const projectReleaseFields = pickFields<CpanRelease>(['date', 'license', 'version']);

/** MetaCPAN latest release search (3 source fields of 1 hit; No hits is not found) with distribution page redirect. */
const CPAN_ENDPOINT = createEndpoint({
  api: 'https://fastapi.metacpan.org/v1/release/_search?q=distribution:{target}%20AND%20status:latest&_source=version,license,date&size=1',
  page: 'https://metacpan.org/dist/{target}',
  project: (data) => {
    const hits = isJsonObject(data) && isJsonObject(data.hits) ? data.hits.hits : undefined;
    const firstHit: unknown = Array.isArray(hits) ? hits[0] : undefined;
    return projectReleaseFields(
      isJsonObject(firstHit) ? firstHit[SEARCH_HIT_SOURCE_KEY] : undefined
    );
  },
});

/** Read the display name of the first release license (`unknown` keys render as missing). */
function readCpanLicense(release: Partial<CpanRelease>): string | undefined {
  const key: unknown = Array.isArray(release.license) ? release.license[0] : undefined;
  if (typeof key !== 'string' || key === 'unknown') {
    return undefined;
  }
  return getOwnValue(CPAN_LICENSE_NAMES, key) ?? key;
}

/** Read the release timestamp as UTC (MetaCPAN omits the timezone designator). */
function readCpanReleaseDate(release: Partial<CpanRelease>): string | undefined {
  const { date } = release;
  if (typeof date !== 'string' || date === '') {
    return undefined;
  }
  return TIMEZONE_SUFFIX_RX.test(date) ? date : `${date}Z`;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** MetaCPAN (Perl) service preset (`cpan`). */
export const CPAN_SERVICE = defineService({
  docs: {
    description: 'Latest Perl distribution version, license, and last release date.',
    title: 'MetaCPAN',
  },
  metrics: {
    license: createLicenseMetric(CPAN_ENDPOINT, readCpanLicense),
    updated: createRelativeDateMetric(
      CPAN_ENDPOINT,
      { defaultColor: 'violet', defaultIcon: 'calendar-clock', defaultLabel: 'last release' },
      readCpanReleaseDate
    ),
    v: createVersionMetric(
      CPAN_ENDPOINT,
      { defaultColor: 'indigo', defaultIcon: 'perl', defaultLabel: 'cpan' },
      (release) => release.version
    ),
  },
  route: { target: { pattern: CPAN_DIST_RX, placeholder: ':dist' } },
});
