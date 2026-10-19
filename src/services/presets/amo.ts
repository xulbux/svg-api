/**
 * Firefox Add-ons service preset – AMO add-on version, daily users, weekly downloads, rating, and license (`/badge/amo/:addon/:metric`).
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import {
  createCountMetric,
  createDownloadsMetric,
  createLicenseMetric,
  createRatingMetric,
  createVersionMetric,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** License metadata of an AMO add-on version. */
interface AmoLicense {
  /** Whether the license is a custom (non-SPDX) license. */
  is_custom?: boolean;
  /** SPDX license identifier (e.g., `'GPL-3.0-only'`). */
  slug?: string | null;
}

/** Listed version of an AMO add-on. */
interface AmoVersion {
  /** License metadata (`null` for unlisted licenses). */
  license?: AmoLicense | null;
  /** Version string. */
  version?: string;
}

/** Rating summary of an AMO add-on. */
interface AmoRatings {
  /** Average star rating (`0`–`5`). */
  average?: number;
}

/** Partial AMO add-on API payload (`addons.mozilla.org/api/v5/addons/addon/:addon/?lang=en-US`). */
interface AmoAddonPayload {
  /** Average daily users. */
  average_daily_users: number;
  /** Current listed version. */
  current_version: AmoVersion | null;
  /** Rating summary. */
  ratings: AmoRatings | null;
  /** Downloads in the last 7 days. */
  weekly_downloads: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** AMO add-on endpoint (`lang=en-US` shrinks the payload from `~130 KB` to `~8 KB`) with listing redirect. */
const AMO_ENDPOINT = createEndpoint({
  api: 'https://addons.mozilla.org/api/v5/addons/addon/{target}/?lang=en-US',
  page: 'https://addons.mozilla.org/firefox/addon/{target}/',
  project: pickFields<AmoAddonPayload>([
    'average_daily_users',
    'current_version',
    'ratings',
    'weekly_downloads',
  ]),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Firefox Add-ons (AMO) service preset (`amo`). */
export const AMO_SERVICE = defineService({
  docs: {
    description: 'Add-on version, average daily users, weekly downloads (dw), rating, and license.',
    title: 'Firefox Add-ons',
  },
  metricAliases: { dl: 'dw' },
  metrics: {
    dw: createDownloadsMetric(AMO_ENDPOINT, 'dw', (addon) => addon.weekly_downloads),
    license: createLicenseMetric(AMO_ENDPOINT, (addon) => {
      const license = addon.current_version?.license;
      return license?.slug || (license?.is_custom ? 'custom' : undefined);
    }),
    rating: createRatingMetric(AMO_ENDPOINT, (addon) => [addon.ratings?.average, 5]),
    users: createCountMetric(
      AMO_ENDPOINT,
      { defaultColor: 'indigo', defaultIcon: 'users', defaultLabel: 'users' },
      (addon) => addon.average_daily_users
    ),
    v: createVersionMetric(
      AMO_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'firefoxbrowser', defaultLabel: 'firefox' },
      (addon) => addon.current_version?.version
    ),
  },
  route: { target: { placeholder: ':addon' } },
});
