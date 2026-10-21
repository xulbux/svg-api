/**
 * JetBrains Marketplace service preset – IDE plugin version, total downloads, and average rating (`/badge/jetbrains/:plugin/:metric`).
 */

import {
  createEndpoint,
  defineService,
  isJsonObject,
  pickFields,
  projectFirstEntry,
} from '@/services/endpoint';
import {
  createDownloadsMetric,
  createRatingMetric,
  createVersionMetric,
  readFiniteNumber,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial JetBrains Marketplace plugin metadata payload (`plugins.jetbrains.com/api/plugins/:plugin`). */
interface JetBrainsPluginPayload {
  /** Total all-time plugin downloads. */
  downloads: number;
}

/** Partial JetBrains Marketplace plugin rating payload (`plugins.jetbrains.com/api/plugins/:plugin/rating`). */
interface JetBrainsRatingPayload {
  /** Bayesian mean star rating (`0`–`5`). */
  meanRating: number;
  /** Star vote counts keyed by `'1'`–`'5'`. */
  votes?: Record<string, number>;
}

/** Partial update entry of the JetBrains Marketplace plugin updates list (`plugins.jetbrains.com/api/plugins/:plugin/updates?size=1`). */
interface JetBrainsUpdateEntry {
  /** Published plugin version string. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Star vote keys in ascending order (`1` through `5` stars). */
const STAR_KEYS: readonly string[] = ['1', '2', '3', '4', '5'];

/** Shared JetBrains Marketplace plugin page URL template. */
const PLUGIN_PAGE = 'https://plugins.jetbrains.com/plugin/{target}';

/** JetBrains Marketplace plugin metadata endpoint (downloads). */
const PLUGIN_ENDPOINT = createEndpoint({
  api: 'https://plugins.jetbrains.com/api/plugins/{target}',
  page: PLUGIN_PAGE,
  project: pickFields<JetBrainsPluginPayload>(['downloads']),
});

/** JetBrains Marketplace plugin rating endpoint. */
const RATING_ENDPOINT = createEndpoint({
  api: 'https://plugins.jetbrains.com/api/plugins/{target}/rating',
  page: PLUGIN_PAGE,
  project: pickFields<JetBrainsRatingPayload>(['meanRating', 'votes']),
});

/** JetBrains Marketplace newest plugin update endpoint (`size=1`). */
const UPDATES_ENDPOINT = createEndpoint({
  api: 'https://plugins.jetbrains.com/api/plugins/{target}/updates?size=1',
  page: PLUGIN_PAGE,
  project: projectFirstEntry<JetBrainsUpdateEntry>(undefined, ['version']),
});

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a positive numeric JetBrains Marketplace plugin ID (`plugins.jetbrains.com/plugin/:id`). */
const PLUGIN_ID_RX = /^[1-9]\d{0,11}$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Read the 1-star through 5-star vote distribution from `rating.votes`. */
function readJetBrainsVotes(rating: Partial<JetBrainsRatingPayload>): number[] | undefined {
  if (!isJsonObject(rating.votes)) {
    return undefined;
  }
  const counts: number[] = [];
  for (const key of STAR_KEYS) {
    counts.push(readFiniteNumber(rating.votes[key]) ?? 0);
  }
  return counts;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** JetBrains Marketplace service preset (`jetbrains`). */
export const JETBRAINS_SERVICE = defineService({
  docs: {
    description: 'IDE plugin version, total downloads, and average rating by numeric plugin ID.',
    title: 'JetBrains Marketplace',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: createDownloadsMetric(PLUGIN_ENDPOINT, 'dt', (plugin) => plugin.downloads),
    rating: createRatingMetric(
      RATING_ENDPOINT,
      (rating) => [rating.meanRating, 5],
      readJetBrainsVotes
    ),
    v: createVersionMetric(
      UPDATES_ENDPOINT,
      { defaultColor: 'rose', defaultIcon: 'jetbrains', defaultLabel: 'jetbrains' },
      (update) => update.version
    ),
  },
  route: { target: { pattern: PLUGIN_ID_RX, placeholder: ':plugin' } },
});
