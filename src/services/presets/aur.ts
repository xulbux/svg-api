/**
 * AUR service preset – Arch User Repository package version, votes, popularity, and license (`/badge/aur/:pkg/:metric`).
 */

import {
  createEndpoint,
  createMetric,
  defineService,
  projectFirstEntry,
} from '@/services/endpoint';
import {
  buildFlaggedVersionResult,
  createCommunityMetric,
  createLicenseMetric,
} from '@/services/metrics';
import type { MetricResult } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Single package entry of the AUR RPC v5 `info` response (`aur.archlinux.org/rpc/v5/info?arg[]=:pkg`). */
interface AurPackageInfo {
  /** SPDX license identifiers. */
  License: string[];
  /** Number of user votes. */
  NumVotes: number;
  /** Whether (and since when, as a Unix timestamp) the package is flagged out-of-date. */
  OutOfDate: number | null;
  /** Decaying popularity score. */
  Popularity: number;
  /** Package version including the `pkgrel` suffix (e.g., `'13.0.1-1'`). */
  Version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** AUR RPC v5 `info` endpoint (first matched package; An empty `results` list is not found). */
const AUR_ENDPOINT = createEndpoint({
  api: 'https://aur.archlinux.org/rpc/v5/info?arg[]={target}',
  page: 'https://aur.archlinux.org/packages/{target}',
  project: projectFirstEntry<AurPackageInfo>('results', [
    'License',
    'NumVotes',
    'OutOfDate',
    'Popularity',
    'Version',
  ]),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Transform an AUR package into a version metric, highlighting out-of-date flags in amber. */
function transformAurVersion(info: Partial<AurPackageInfo>): Partial<MetricResult> {
  return buildFlaggedVersionResult(info.Version, typeof info.OutOfDate === 'number');
}

/** Transform an AUR package into a popularity score metric. */
function transformAurPopularity(info: Partial<AurPackageInfo>): Partial<MetricResult> {
  const popularity = info.Popularity;
  return {
    value:
      typeof popularity === 'number' && Number.isFinite(popularity) ? popularity.toFixed(2) : 'n/a',
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Arch User Repository service preset (`aur`). */
export const AUR_SERVICE = defineService({
  docs: {
    description: 'Package version (flags out-of-date), votes, popularity, and license.',
    title: 'AUR',
  },
  metrics: {
    license: createLicenseMetric(AUR_ENDPOINT, (info) =>
      Array.isArray(info.License) ? info.License[0] : undefined
    ),
    popularity: createMetric(
      AUR_ENDPOINT,
      { defaultColor: 'violet', defaultIcon: 'trending-up', defaultLabel: 'Popularity' },
      transformAurPopularity
    ),
    v: createMetric(
      AUR_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'archlinux', defaultLabel: 'AUR' },
      transformAurVersion
    ),
    votes: createCommunityMetric(AUR_ENDPOINT, 'votes', 'archlinux', (info) => info.NumVotes),
  },
  route: { target: { placeholder: ':pkg' } },
});
