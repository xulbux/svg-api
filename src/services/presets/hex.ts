/**
 * Hex.pm service preset – Elixir/Erlang package version, all-time/90-day/weekly downloads, and license (`/badge/hex/:pkg/:metric`).
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import {
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Download counters of a Hex.pm package. */
interface HexDownloads {
  /** All-time downloads. */
  all?: number;
  /** Downloads in the last 90 days. */
  recent?: number;
  /** Downloads in the last 7 days. */
  week?: number;
}

/** Metadata of a Hex.pm package. */
interface HexPackageMeta {
  /** SPDX license identifiers. */
  licenses?: string[];
}

/** Partial Hex.pm package API payload (`hex.pm/api/packages/:pkg`). */
interface HexPackagePayload {
  /** Download counters. */
  downloads: HexDownloads | null;
  /** Latest stable version, or `null` when only pre-releases exist. */
  latest_stable_version: string | null;
  /** Latest version including pre-releases. */
  latest_version: string;
  /** Package metadata. */
  meta: HexPackageMeta | null;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Hex.pm package endpoint with package page redirect. */
const HEX_ENDPOINT = createEndpoint({
  api: 'https://hex.pm/api/packages/{target}',
  page: 'https://hex.pm/packages/{target}',
  project: pickFields<HexPackagePayload>([
    'downloads',
    'latest_stable_version',
    'latest_version',
    'meta',
  ]),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Hex.pm service preset (`hex`). */
export const HEX_SERVICE = defineService({
  docs: {
    description: 'Latest stable version, all-time/90-day/weekly downloads (dt/dq/dw), and license.',
    title: 'Hex.pm',
  },
  // `dl` reported the 90-day downloads before the download keys were normalized.
  metricAliases: { dl: 'dq' },
  metrics: {
    dq: createDownloadsMetric(HEX_ENDPOINT, 'dq', (pkg) => pkg.downloads?.recent),
    dt: createDownloadsMetric(HEX_ENDPOINT, 'dt', (pkg) => pkg.downloads?.all),
    dw: createDownloadsMetric(HEX_ENDPOINT, 'dw', (pkg) => pkg.downloads?.week),
    license: createLicenseMetric(HEX_ENDPOINT, (pkg) => {
      const licenses = pkg.meta?.licenses;
      return Array.isArray(licenses) ? licenses[0] : undefined;
    }),
    v: createVersionMetric(
      HEX_ENDPOINT,
      { defaultColor: 'violet', defaultIcon: 'elixir', defaultLabel: 'hex' },
      (pkg) => pkg.latest_stable_version ?? pkg.latest_version
    ),
  },
  route: { target: { placeholder: ':pkg' } },
});
