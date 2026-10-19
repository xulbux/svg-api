/**
 * Flathub service preset – Flatpak app version and license from AppStream plus total/monthly/weekly install statistics (`/badge/flathub/:app/:metric`).
 */

import {
  CACHE_TTL,
  createEndpoint,
  defineService,
  isJsonObject,
  pickFields,
} from '@/services/endpoint';
import {
  createDownloadsMetric,
  createLicenseMetric,
  createVersionMetric,
} from '@/services/metrics';
import type { ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Flathub AppStream payload (`flathub.org/api/v2/appstream/:app`). */
interface FlathubAppStreamProjection {
  /** SPDX license expression of the project (`project_license`). */
  license?: string;
  /** Version of the newest release (`releases[0].version`). */
  version?: string;
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

/** Presentation override of the install metrics. */
const INSTALLS_LABEL = { defaultLabel: 'installs' } as const;

/** Flathub install statistics endpoint (refreshed daily). */
const STATS_ENDPOINT = createEndpoint({
  api: 'https://flathub.org/api/v2/stats/{target}',
  page: 'https://flathub.org/apps/{target}',
  project: pickFields<FlathubStatsPayload>([
    'installs_last_7_days',
    'installs_last_month',
    'installs_total',
  ]),
  ttl: CACHE_TTL.daily,
});

// -------------------------------------- INTERNALS --------------------------------------

/** Project an AppStream document into its license and newest release version (release notes are dropped). */
function projectAppStream(data: unknown): FlathubAppStreamProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const releases = Array.isArray(data.releases) ? data.releases : [];
  const newestRelease: unknown = releases[0];
  return {
    license: typeof data.project_license === 'string' ? data.project_license : undefined,
    version:
      isJsonObject(newestRelease) && typeof newestRelease.version === 'string'
        ? newestRelease.version
        : undefined,
  };
}

/** Create the Flathub service preset. */
function createFlathubService(): ServiceDefinition {
  const appStreamEndpoint = createEndpoint({
    api: 'https://flathub.org/api/v2/appstream/{target}',
    page: 'https://flathub.org/apps/{target}',
    project: projectAppStream,
  });
  return defineService({
    docs: {
      description: 'App version, license, and total/monthly/weekly installs (dt/dl/dw).',
      title: 'Flathub',
    },
    metrics: {
      dl: createDownloadsMetric(
        STATS_ENDPOINT,
        'dl',
        (stats) => stats.installs_last_month,
        INSTALLS_LABEL
      ),
      dt: createDownloadsMetric(
        STATS_ENDPOINT,
        'dt',
        (stats) => stats.installs_total,
        INSTALLS_LABEL
      ),
      dw: createDownloadsMetric(
        STATS_ENDPOINT,
        'dw',
        (stats) => stats.installs_last_7_days,
        INSTALLS_LABEL
      ),
      license: createLicenseMetric(appStreamEndpoint, (app) => app.license),
      v: createVersionMetric(
        appStreamEndpoint,
        { defaultColor: 'sky', defaultIcon: 'flathub', defaultLabel: 'flathub' },
        (app) => app.version
      ),
    },
    route: { target: { placeholder: ':app' } },
  });
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Flathub service preset (`flathub`). */
export const FLATHUB_SERVICE: ServiceDefinition = createFlathubService();
