/**
 * Arch Linux service preset – Live upstream metrics and redirect transformations.
 *
 * The exact-name package search is restricted to the configured stable repositories, so packages
 * currently in testing never shadow the released version.
 */

import {
  createEndpoint,
  createMetric,
  defineService,
  projectFirstEntry,
} from '@/services/endpoint';
import {
  buildFlaggedVersionResult,
  buildPackageVersion,
  createLicenseMetric,
  createTextMetric,
} from '@/services/metrics';
import type { MetricResult } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Single package entry of the Arch Linux package search (`archlinux.org/packages/search/json/?name=:pkg`). */
interface ArchPackageInfo {
  /** Package epoch (`0` when unset). */
  epoch: number;
  /** ISO 8601 timestamp since when the package is flagged out-of-date, or `null`. */
  flag_date: string | null;
  /** SPDX license identifiers. */
  licenses: string[];
  /** Package release number (e.g., `'1'`). */
  pkgrel: string;
  /** Upstream package version (e.g., `'7.1.0'`). */
  pkgver: string;
  /** Repository name (e.g., `'core'`, `'extra'`, `'multilib'`). */
  repo: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Arch Linux exact-name package search in the stable repositories (an empty `results` list is not found). */
const ARCH_ENDPOINT = createEndpoint({
  api: 'https://archlinux.org/packages/search/json/?name={target}&repo=Core&repo=Extra&repo=Multilib',
  page: 'https://archlinux.org/packages/?name={target}',
  project: projectFirstEntry<ArchPackageInfo>('results', [
    'epoch',
    'flag_date',
    'licenses',
    'pkgrel',
    'pkgver',
    'repo',
  ]),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Transform an Arch Linux package into its `[epoch:]pkgver-pkgrel` version, highlighting out-of-date flags in amber. */
function transformArchVersion(info: Partial<ArchPackageInfo>): Partial<MetricResult> {
  return buildFlaggedVersionResult(
    buildPackageVersion(info.epoch, info.pkgver, info.pkgrel),
    typeof info.flag_date === 'string'
  );
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Arch Linux official repositories service preset (`arch`). */
export const ARCH_SERVICE = defineService({
  docs: {
    description: 'Official repository version (flags out-of-date), license, and repository.',
    title: 'Arch Linux',
  },
  metrics: {
    license: createLicenseMetric(ARCH_ENDPOINT, (info) =>
      Array.isArray(info.licenses) ? info.licenses[0] : undefined
    ),
    repo: createTextMetric(
      ARCH_ENDPOINT,
      { defaultColor: 'slate', defaultIcon: 'archlinux', defaultLabel: 'Repo' },
      (info) => info.repo
    ),
    v: createMetric(
      ARCH_ENDPOINT,
      {
        defaultColor: 'sky',
        defaultIcon: 'archlinux',
        defaultLabel: 'Arch Linux',
        hasDynamicColor: true,
      },
      transformArchVersion
    ),
  },
  route: { target: { placeholder: ':pkg' } },
});
