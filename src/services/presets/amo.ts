/**
 * Firefox Add-ons service preset – AMO add-on version, daily users, weekly downloads, rating, and license (`/badge/amo/:addon/:metric`).
 */

import {
  createCountTransform,
  createLicenseTransform,
  createRatingTransform,
  createVersionTransform,
  LICENSE,
  RATING,
  WEEKLY_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial AMO add-on API payload (`addons.mozilla.org/api/v5/addons/addon/:addon/?lang=en-US`). */
interface AmoAddonPayload {
  /** Average daily users. */
  average_daily_users: number;
  /** Current listed version. */
  current_version: {
    /** License metadata (`null` for unlisted licenses). */
    license?: {
      /** Whether the license is a custom (non-SPDX) license. */
      is_custom?: boolean;
      /** SPDX license identifier (e.g., `'GPL-3.0-only'`). */
      slug?: string | null;
    } | null;
    /** Version string. */
    version?: string;
  };
  /** Rating summary. */
  ratings: {
    /** Average star rating (`0`–`5`). */
    average?: number;
  };
  /** Downloads in the last 7 days. */
  weekly_downloads: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** AMO add-on endpoint (`lang=en-US` shrinks the payload from `~130 KB` to `~8 KB`) with listing redirect. */
const AMO_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, addon: string): string =>
    `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(addon)}/?lang=en-US`,
  buildRedirectUrl: (_owner: string, addon: string): string =>
    `https://addons.mozilla.org/firefox/addon/${addon}/`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Firefox Add-ons (AMO) service preset (`amo`). */
export const AMO_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Add-on version, average daily users, weekly downloads, rating, and license.',
    targetName: ':addon',
    title: 'Firefox Add-ons',
  },
  metricAliases: { dl: 'dw', l: 'license' },
  metrics: {
    dw: {
      ...AMO_ENDPOINT,
      ...WEEKLY_DOWNLOADS,
      transform: createCountTransform<AmoAddonPayload>(
        (payload) => payload.weekly_downloads,
        '/wk'
      ),
    },
    license: {
      ...AMO_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<AmoAddonPayload>((payload) => {
        const license = payload.current_version?.license;
        return license?.slug || (license?.is_custom ? 'custom' : undefined);
      }),
    },
    rating: {
      ...AMO_ENDPOINT,
      ...RATING,
      transform: createRatingTransform<AmoAddonPayload>((payload) => [payload.ratings?.average, 5]),
    },
    users: {
      ...AMO_ENDPOINT,
      defaultColor: 'indigo',
      defaultIcon: 'users',
      defaultLabel: 'users',
      transform: createCountTransform<AmoAddonPayload>((payload) => payload.average_daily_users),
    },
    v: {
      ...AMO_ENDPOINT,
      defaultColor: 'orange',
      defaultIcon: 'firefoxbrowser',
      defaultLabel: 'firefox',
      transform: createVersionTransform<AmoAddonPayload>(
        (payload) => payload.current_version?.version
      ),
    },
  },
  ownerMode: 'none',
};
