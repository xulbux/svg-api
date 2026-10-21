/**
 * Minecraft plugin service presets – SpigotMC resource downloads, rating, likes, and latest version via the Spiget API (`/badge/spigot/:id/:metric`) and Hangar (PaperMC) project downloads, stars, watchers, and license (`/badge/hangar/:owner/:slug/:metric`).
 */

import { createEndpoint, defineService, isJsonObject, pickFields } from '@/services/endpoint';
import {
  STARS,
  createCommunityMetric,
  createCountMetric,
  createDownloadsMetric,
  createLicenseMetric,
  createRatingMetric,
  createVersionMetric,
  readFiniteNumber,
  readText,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Rating summary of a Spiget resource. */
interface SpigetRating {
  /** Average star rating (`0`–`5`). */
  average?: number;
}

/** Partial Spiget resource payload (`api.spiget.org/v2/resources/:id?fields=downloads,rating,likes`). */
interface SpigetResourcePayload {
  /** All-time downloads. */
  downloads: number;
  /** Number of likes. */
  likes: number;
  /** Rating summary. */
  rating: SpigetRating | null;
}

/** Partial Spiget latest version payload (`api.spiget.org/v2/resources/:id/versions/latest`). */
interface SpigetVersionPayload {
  /** Version name. */
  name: string;
}

/** Projected Hangar project payload (`hangar.papermc.io/api/v1/projects/:owner/:slug`). */
interface HangarProjectProjection {
  /** All-time downloads (`stats.downloads`). */
  downloads?: number;
  /** License name (`settings.license.name`, falling back to its type). */
  license?: string;
  /** Number of stars (`stats.stars`). */
  stars?: number;
  /** Number of watchers (`stats.watchers`). */
  watchers?: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Spiget resource endpoint (selected fields only) with SpigotMC resource page redirect. */
const SPIGET_RESOURCE_ENDPOINT = createEndpoint({
  api: 'https://api.spiget.org/v2/resources/{target}?fields=downloads,rating,likes',
  page: 'https://www.spigotmc.org/resources/{target}/',
  project: pickFields<SpigetResourcePayload>(['downloads', 'likes', 'rating']),
});

/** Spiget latest version endpoint with SpigotMC resource page redirect. */
const SPIGET_VERSION_ENDPOINT = createEndpoint({
  api: 'https://api.spiget.org/v2/resources/{target}/versions/latest',
  page: 'https://www.spigotmc.org/resources/{target}/',
  project: pickFields<SpigetVersionPayload>(['name']),
});

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a numeric SpigotMC resource ID. */
const RESOURCE_ID_RX = /^\d{1,10}$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Read the Hangar license name, falling back to its type (`GPL`, `MIT`, …). */
function readHangarLicense(settings: unknown): string | undefined {
  const license = isJsonObject(settings) ? settings.license : undefined;
  if (!isJsonObject(license)) {
    return undefined;
  }
  return readText(license.name) ?? readText(license.type);
}

/** Project a Hangar project into its counters and license (links and platform lists are dropped). */
function projectHangarProject(data: unknown): HangarProjectProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  const stats = isJsonObject(data.stats) ? data.stats : undefined;
  return {
    downloads: readFiniteNumber(stats?.downloads),
    license: readHangarLicense(data.settings),
    stars: readFiniteNumber(stats?.stars),
    watchers: readFiniteNumber(stats?.watchers),
  };
}

/** Hangar project endpoint with Hangar project page redirect. */
const HANGAR_PROJECT_ENDPOINT = createEndpoint({
  api: 'https://hangar.papermc.io/api/v1/projects/{owner}/{target}',
  page: 'https://hangar.papermc.io/{owner}/{target}',
  project: projectHangarProject,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** SpigotMC (Spiget) service preset (`spigot`). */
export const SPIGOT_SERVICE = defineService({
  docs: {
    description: 'Resource downloads, rating, likes, and latest version by numeric resource ID.',
    title: 'SpigotMC',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: createDownloadsMetric(SPIGET_RESOURCE_ENDPOINT, 'dt', (resource) => resource.downloads),
    likes: createCommunityMetric(
      SPIGET_RESOURCE_ENDPOINT,
      'likes',
      'spigotmc',
      (resource) => resource.likes
    ),
    rating: createRatingMetric(SPIGET_RESOURCE_ENDPOINT, (resource) => [
      resource.rating?.average,
      5,
    ]),
    v: createVersionMetric(
      SPIGET_VERSION_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'spigotmc', defaultLabel: 'spigot' },
      (version) => version.name
    ),
  },
  route: { target: { pattern: RESOURCE_ID_RX, placeholder: ':id' } },
});

/** Hangar (PaperMC) service preset (`hangar`). */
export const HANGAR_SERVICE = defineService({
  docs: { description: 'Paper plugin downloads, stars, watchers, and license.', title: 'Hangar' },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: createDownloadsMetric(HANGAR_PROJECT_ENDPOINT, 'dt', (project) => project.downloads),
    license: createLicenseMetric(HANGAR_PROJECT_ENDPOINT, (project) => project.license),
    stars: createCountMetric(HANGAR_PROJECT_ENDPOINT, STARS, (project) => project.stars),
    watchers: createCountMetric(
      HANGAR_PROJECT_ENDPOINT,
      { defaultColor: 'sky', defaultIcon: 'eye', defaultLabel: 'watchers' },
      (project) => project.watchers
    ),
  },
  route: { owner: { isRequired: true, placeholder: ':owner' }, target: { placeholder: ':slug' } },
});
