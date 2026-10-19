/**
 * AUR service preset – Arch User Repository package version, votes, popularity, and license (`/badge/aur/:pkg/:metric`).
 */

import {
  createCountTransform,
  createFirstEntryTransform,
  createLicenseTransform,
  formatVersion,
  LICENSE,
} from '@/services/metrics';
import type { MetricEndpoint, MetricResult, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Single package entry of the AUR RPC v5 `info` response. */
interface AurPackageInfo {
  /** SPDX license identifiers. */
  License?: string[];
  /** Number of user votes. */
  NumVotes?: number;
  /** Whether (and since when, as a Unix timestamp) the package is flagged out-of-date. */
  OutOfDate?: number | null;
  /** Decaying popularity score. */
  Popularity?: number;
  /** Package version including the `pkgrel` suffix (e.g., `'13.0.1-1'`). */
  Version?: string;
}

/** Partial AUR RPC v5 `info` payload (`aur.archlinux.org/rpc/v5/info?arg[]=:pkg`). */
interface AurInfoPayload {
  /** Matched packages (empty when the package does not exist). */
  results: AurPackageInfo[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** AUR RPC v5 `info` endpoint with package page redirect. */
const AUR_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, pkg: string): string =>
    `https://aur.archlinux.org/rpc/v5/info?arg[]=${encodeURIComponent(pkg)}`,
  buildRedirectUrl: (_owner: string, pkg: string): string =>
    `https://aur.archlinux.org/packages/${pkg}`,
};

// -------------------------------------- INTERNALS --------------------------------------

/** Read the matched package list of an AUR `info` payload. */
function readAurResults(payload: Partial<AurInfoPayload>): unknown {
  return payload.results;
}

/** Transform an AUR package into a version metric, highlighting out-of-date flags in amber. */
function transformAurVersion(data: unknown): Partial<MetricResult> {
  const info = data as AurPackageInfo;
  const isOutOfDate = typeof info.OutOfDate === 'number';
  return {
    color: isOutOfDate ? 'amber' : undefined,
    value: isOutOfDate ? `${formatVersion(info.Version)} (outdated)` : formatVersion(info.Version),
  };
}

/** Transform an AUR package into a popularity score metric. */
function transformAurPopularity(data: unknown): Partial<MetricResult> {
  const { Popularity: popularity } = data as AurPackageInfo;
  return { value: typeof popularity === 'number' ? popularity.toFixed(2) : 'n/a' };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Arch User Repository service preset (`aur`). */
export const AUR_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Package version (flags out-of-date), votes, popularity, and license.',
    targetName: ':pkg',
    title: 'AUR',
  },
  metricAliases: { l: 'license' },
  metrics: {
    license: {
      ...AUR_ENDPOINT,
      ...LICENSE,
      transform: createFirstEntryTransform<AurInfoPayload>(
        readAurResults,
        createLicenseTransform<AurPackageInfo>((info) => info.License?.[0])
      ),
    },
    popularity: {
      ...AUR_ENDPOINT,
      defaultColor: 'violet',
      defaultIcon: 'trending-up',
      defaultLabel: 'popularity',
      transform: createFirstEntryTransform<AurInfoPayload>(readAurResults, transformAurPopularity),
    },
    v: {
      ...AUR_ENDPOINT,
      defaultColor: 'sky',
      defaultIcon: 'archlinux',
      defaultLabel: 'aur',
      transform: createFirstEntryTransform<AurInfoPayload>(readAurResults, transformAurVersion),
    },
    votes: {
      ...AUR_ENDPOINT,
      defaultColor: 'amber',
      defaultIcon: 'thumbs-up',
      defaultLabel: 'votes',
      transform: createFirstEntryTransform<AurInfoPayload>(
        readAurResults,
        createCountTransform<AurPackageInfo>((info) => info.NumVotes)
      ),
    },
  },
  ownerMode: 'none',
};
