/**
 * Flathub service preset – Flatpak app version and license from AppStream plus total/monthly/weekly install statistics (`/badge/flathub/:app/:metric`).
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

/** Partial Flathub AppStream payload (`flathub.org/api/v2/appstream/:app`). */
interface FlathubAppStreamPayload {
  /** SPDX license expression of the project. */
  project_license: string | null;
  /** Releases, newest first. */
  releases: {
    /** Release version string. */
    version?: string;
  }[];
}

/** Partial Flathub statistics payload (`flathub.org/api/v2/stats/:app`). */
interface FlathubStatsPayload {
  /** Installs in the last 30 days. */
  installs_last_month: number;
  /** Installs in the last 7 days. */
  installs_last_7_days: number;
  /** All-time installs. */
  installs_total: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Tier-1 JSON cache TTL in seconds for the daily refreshed install statistics. */
const FLATHUB_STATS_CACHE_TTL_SECONDS = 3600;

// -------------------------------------- INTERNALS --------------------------------------

/** Build the Flathub app page redirect URL. */
function buildFlathubRedirectUrl(_owner: string, app: string): string {
  return `https://flathub.org/apps/${app}`;
}

/** Flathub AppStream metadata endpoint. */
const APPSTREAM_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, app: string): string =>
    `https://flathub.org/api/v2/appstream/${app}`,
  buildRedirectUrl: buildFlathubRedirectUrl,
};

/** Flathub install statistics endpoint. */
const STATS_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, app: string): string => `https://flathub.org/api/v2/stats/${app}`,
  buildRedirectUrl: buildFlathubRedirectUrl,
  cacheTtlSeconds: FLATHUB_STATS_CACHE_TTL_SECONDS,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Flathub service preset (`flathub`). */
export const FLATHUB_SERVICE: ServiceDefinition = {
  docs: {
    description: 'App version, license, and total/monthly/weekly installs.',
    targetName: ':app',
    title: 'Flathub',
  },
  metricAliases: { dm: 'dl', l: 'license' },
  metrics: {
    dl: {
      ...STATS_ENDPOINT,
      ...RECENT_DOWNLOADS,
      defaultLabel: 'installs',
      transform: createCountTransform<FlathubStatsPayload>(
        (payload) => payload.installs_last_month,
        '/mo'
      ),
    },
    dt: {
      ...STATS_ENDPOINT,
      ...TOTAL_DOWNLOADS,
      defaultLabel: 'installs',
      transform: createCountTransform<FlathubStatsPayload>((payload) => payload.installs_total),
    },
    dw: {
      ...STATS_ENDPOINT,
      ...WEEKLY_DOWNLOADS,
      defaultLabel: 'installs',
      transform: createCountTransform<FlathubStatsPayload>(
        (payload) => payload.installs_last_7_days,
        '/wk'
      ),
    },
    license: {
      ...APPSTREAM_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<FlathubAppStreamPayload>(
        (payload) => payload.project_license
      ),
    },
    v: {
      ...APPSTREAM_ENDPOINT,
      defaultColor: 'sky',
      defaultIcon: 'flathub',
      defaultLabel: 'flathub',
      transform: createVersionTransform<FlathubAppStreamPayload>(
        (payload) => payload.releases?.[0]?.version
      ),
    },
  },
  ownerMode: 'none',
};
