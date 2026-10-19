/**
 * Hex.pm service preset – Elixir/Erlang package version, all-time/90-day/weekly downloads, and license (`/badge/hex/:pkg/:metric`).
 */

import {
  createCountTransform,
  createLicenseTransform,
  createVersionTransform,
  LICENSE,
  RECENT_DOWNLOADS,
  TOTAL_DOWNLOADS,
  WEEKLY_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Hex.pm package API payload (`hex.pm/api/packages/:pkg`). */
interface HexPackagePayload {
  /** Download counters. */
  downloads: {
    /** All-time downloads. */
    all?: number;
    /** Downloads in the last 90 days. */
    recent?: number;
    /** Downloads in the last 7 days. */
    week?: number;
  };
  /** Latest stable version, or `null` when only pre-releases exist. */
  latest_stable_version: string | null;
  /** Latest version including pre-releases. */
  latest_version: string;
  /** Package metadata. */
  meta: {
    /** SPDX license identifiers. */
    licenses?: string[];
  };
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Hex.pm package endpoint with package page redirect. */
const HEX_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, pkg: string): string => `https://hex.pm/api/packages/${pkg}`,
  buildRedirectUrl: (_owner: string, pkg: string): string => `https://hex.pm/packages/${pkg}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Hex.pm service preset (`hex`). */
export const HEX_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Latest stable version, all-time/90-day/weekly downloads, and license.',
    targetName: ':pkg',
    title: 'Hex.pm',
  },
  metricAliases: { l: 'license' },
  metrics: {
    dl: {
      ...HEX_ENDPOINT,
      ...RECENT_DOWNLOADS,
      transform: createCountTransform<HexPackagePayload>(
        (payload) => payload.downloads?.recent,
        '/90d'
      ),
    },
    dt: {
      ...HEX_ENDPOINT,
      ...TOTAL_DOWNLOADS,
      transform: createCountTransform<HexPackagePayload>((payload) => payload.downloads?.all),
    },
    dw: {
      ...HEX_ENDPOINT,
      ...WEEKLY_DOWNLOADS,
      transform: createCountTransform<HexPackagePayload>(
        (payload) => payload.downloads?.week,
        '/wk'
      ),
    },
    license: {
      ...HEX_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<HexPackagePayload>(
        (payload) => payload.meta?.licenses?.[0]
      ),
    },
    v: {
      ...HEX_ENDPOINT,
      defaultColor: 'violet',
      defaultIcon: 'elixir',
      defaultLabel: 'hex',
      transform: createVersionTransform<HexPackagePayload>(
        (payload) => payload.latest_stable_version ?? payload.latest_version
      ),
    },
  },
  ownerMode: 'none',
};
