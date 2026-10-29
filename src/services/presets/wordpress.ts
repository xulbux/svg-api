/**
 * WordPress service presets – Live upstream metrics and redirect transformations.
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import {
  createCountMetric,
  createDownloadsMetric,
  createRatingMetric,
  createVersionMetric,
  readStarHistogram,
  readText,
} from '@/services/metrics';
import type { ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial WordPress.org plugin/theme information payload (`api.wordpress.org/{plugins|themes}/info/1.2/`). */
interface WordPressInfoPayload {
  /** Active install bucket (e.g., `5000000` for `'5+ million'`). */
  active_installs: number;
  /** All-time downloads. */
  downloaded: number;
  /** Average rating in percent (`0`–`100`; Stars = `rating / 20`). */
  rating: number;
  /** Star vote breakdown keyed by `'1'`–`'5'`. */
  ratings?: Record<string, number>;
  /** Minimum required WordPress version (`false` when unspecified). */
  requires: string | boolean;
  /** Minimum required PHP version (`false` when unspecified). */
  requires_php: string | boolean;
  /** Latest version. */
  version: string;
}

/** WordPress.org directory kind. */
interface WordPressDirectory {
  /** Info API action (`plugin_information`, `theme_information`). */
  action: string;
  /** Docs metadata description. */
  description: string;
  /** Badge label of the version metric. */
  label: string;
  /** Directory path segment (`plugins`, `themes`). */
  path: string;
  /** Target segment placeholder (e.g., `':plugin'`). */
  targetPlaceholder: string;
  /** Human-readable service name. */
  title: string;
  /** Extra `request[fields]` toggles that trim the response (e.g., `sections=0`). */
  trimmedFields: readonly string[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum WordPress.org rating (percent). */
const MAX_WORDPRESS_RATING = 100;

/** Fields disabled for plugin requests (shrinks the response from `~66 KB` to `~1 KB`). */
const TRIMMED_PLUGIN_FIELDS: readonly string[] = [
  'banners',
  'compatibility',
  'contributors',
  'description',
  'icons',
  'reviews',
  'screenshots',
  'sections',
  'tags',
  'versions',
];

/** Fields disabled for theme requests. */
const TRIMMED_THEME_FIELDS: readonly string[] = ['sections', 'tags'];

/** Projection of the info payload (only the badge fields). */
const INFO_PROJECTION = pickFields<WordPressInfoPayload>([
  'active_installs',
  'downloaded',
  'rating',
  'ratings',
  'requires',
  'requires_php',
  'version',
]);

// -------------------------------------- INTERNALS --------------------------------------

/** Build the `request[fields]` query of a directory (enables installs/downloads, disables bulky fields). */
function buildFieldsQuery(directory: WordPressDirectory): string {
  let query = '&request%5Bfields%5D%5Bactive_installs%5D=1&request%5Bfields%5D%5Bdownloaded%5D=1';
  for (const field of directory.trimmedFields) {
    query += `&request%5Bfields%5D%5B${field}%5D=0`;
  }
  return query;
}

/** Create a WordPress.org service preset for a directory kind. */
function createWordPressService(directory: WordPressDirectory): ServiceDefinition {
  const endpoint = createEndpoint({
    api: `https://api.wordpress.org/${directory.path}/info/1.2/?action=${directory.action}&request%5Bslug%5D={target}${buildFieldsQuery(directory)}`,
    page: `https://wordpress.org/${directory.path}/{target}/`,
    project: INFO_PROJECTION,
  });
  return defineService({
    docs: { description: directory.description, title: directory.title },
    metricAliases: { wordpress: 'wp' },
    metrics: {
      dt: createDownloadsMetric(endpoint, 'dt', (info) => info.downloaded),
      installs: createCountMetric(
        endpoint,
        { defaultColor: 'emerald', defaultIcon: 'users', defaultLabel: 'Active Installs' },
        (info) => info.active_installs,
        '+'
      ),
      php: createVersionMetric(
        endpoint,
        { defaultColor: 'indigo', defaultIcon: 'php', defaultLabel: 'PHP' },
        (info) => readText(info.requires_php)
      ),
      rating: createRatingMetric(
        endpoint,
        (info) => [info.rating, MAX_WORDPRESS_RATING],
        (info) => readStarHistogram(info.ratings)
      ),
      v: createVersionMetric(
        endpoint,
        { defaultColor: 'sky', defaultIcon: 'wordpress', defaultLabel: directory.label },
        (info) => info.version
      ),
      wp: createVersionMetric(
        endpoint,
        { defaultColor: 'sky', defaultIcon: 'wordpress', defaultLabel: 'WordPress' },
        (info) => readText(info.requires)
      ),
    },
    route: { target: { placeholder: directory.targetPlaceholder } },
  });
}

// -------------------------------------- PUBLIC API -------------------------------------

/** WordPress plugin service preset (`wp`). */
export const WORDPRESS_PLUGIN_SERVICE: ServiceDefinition = createWordPressService({
  action: 'plugin_information',
  description:
    'Plugin version, required PHP/WordPress versions, active installs, all-time downloads, and rating.',
  label: 'WordPress',
  path: 'plugins',
  targetPlaceholder: ':plugin',
  title: 'WordPress Plugins',
  trimmedFields: TRIMMED_PLUGIN_FIELDS,
});

/** WordPress theme service preset (`wp-theme`). */
export const WORDPRESS_THEME_SERVICE: ServiceDefinition = createWordPressService({
  action: 'theme_information',
  description:
    'Theme version, required PHP/WordPress versions, active installs, all-time downloads, and rating.',
  label: 'WordPress Theme',
  path: 'themes',
  targetPlaceholder: ':theme',
  title: 'WordPress Themes',
  trimmedFields: TRIMMED_THEME_FIELDS,
});
