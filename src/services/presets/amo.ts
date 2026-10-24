/**
 * Firefox Add-ons service preset – Live upstream metrics and redirect transformations.
 */

import { asJsonObject, createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  createCountMetric,
  createDownloadsMetric,
  createLicenseMetric,
  createRatingMetric,
  createVersionMetric,
  readFiniteNumber,
  readText,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected AMO add-on metadata (`addons.mozilla.org/api/v5/addons/addon/:addon/?lang=en-US`). */
interface AmoAddonProjection {
  /** Average daily users. */
  dailyUsers?: number;
  /** SPDX license identifier (`'custom'` for custom licenses). */
  license?: string;
  /** Average star rating (`0`–`5`). */
  rating?: number;
  /** Current listed version string. */
  version?: string;
  /** Downloads in the last 7 days. */
  weeklyDownloads?: number;
}

// -------------------------------------- INTERNALS --------------------------------------

/** Project an AMO add-on payload to its version, license, rating, and user/download counts. */
function projectAmoAddon(data: unknown): AmoAddonProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const currentVersion = asJsonObject(data.current_version);
  const license = asJsonObject(currentVersion?.license);
  const ratings = asJsonObject(data.ratings);
  return {
    dailyUsers: readFiniteNumber(data.average_daily_users),
    license: readText(license?.slug) || (license?.is_custom === true ? 'custom' : undefined),
    rating: readFiniteNumber(ratings?.average),
    version: readText(currentVersion?.version),
    weeklyDownloads: readFiniteNumber(data.weekly_downloads),
  };
}

/** AMO add-on endpoint (`lang=en-US` shrinks the payload from `~130 KB` to `~8 KB`) with listing redirect. */
const AMO_ENDPOINT = createEndpoint({
  api: 'https://addons.mozilla.org/api/v5/addons/addon/{target}/?lang=en-US',
  page: 'https://addons.mozilla.org/firefox/addon/{target}/',
  project: projectAmoAddon,
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
    dw: createDownloadsMetric(AMO_ENDPOINT, 'dw', (addon) => addon.weeklyDownloads),
    license: createLicenseMetric(AMO_ENDPOINT, (addon) => addon.license),
    rating: createRatingMetric(AMO_ENDPOINT, (addon) => [addon.rating, 5]),
    users: createCountMetric(
      AMO_ENDPOINT,
      { defaultColor: 'indigo', defaultIcon: 'users', defaultLabel: 'Users' },
      (addon) => addon.dailyUsers
    ),
    v: createVersionMetric(
      AMO_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'firefoxbrowser', defaultLabel: 'Firefox' },
      (addon) => addon.version
    ),
  },
  route: { target: { placeholder: ':addon' } },
});
