/**
 * Steam service preset – Live upstream metrics and redirect transformations.
 *
 * The app id must be numeric; The Steam Web API answers non-numeric ids with the global player
 * count of every game instead of an error, so they are rejected before any fetch.
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import { createCommunityMetric, readFiniteNumber } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Steam current players payload (`api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/`). */
interface SteamPlayersPayload {
  /** Number of players currently in-game. */
  playerCount?: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Cache TTL in seconds of the live player count. */
const STEAM_PLAYERS_TTL = 300;

/** Steam current players endpoint (unknown apps are a `404`) with store page redirect. */
const STEAM_PLAYERS_ENDPOINT = createEndpoint<SteamPlayersPayload>({
  api: 'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid={target}',
  page: 'https://store.steampowered.com/app/{target}/',
  project: (data) =>
    isJsonObject(data) && isJsonObject(data.response)
      ? { playerCount: readFiniteNumber(data.response.player_count) }
      : undefined,
  ttl: STEAM_PLAYERS_TTL,
});

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a numeric Steam app id. */
const STEAM_APP_ID_RX = /^\d{1,10}$/;

// -------------------------------------- PUBLIC API -------------------------------------

/** Steam service preset (`steam`). */
export const STEAM_SERVICE = defineService({
  docs: { description: 'Current in-game players of a numeric Steam app id.', title: 'Steam' },
  metrics: {
    players: createCommunityMetric(
      STEAM_PLAYERS_ENDPOINT,
      'players',
      'steam',
      (payload) => payload.playerCount
    ),
  },
  route: { target: { pattern: STEAM_APP_ID_RX, placeholder: ':appid' } },
});
