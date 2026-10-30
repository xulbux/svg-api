/**
 * Hacker News Service Preset
 *
 * Live upstream metrics and redirect transformations for Hacker News.
 *
 * The `karma` child path returns a bare number (`null` for unknown users) instead of the full user document,
 * which lists every submitted item id (`100+ KB` for active users).
 */

import { createEndpoint, defineService } from '@/services/endpoint';
import { createCountMetric, readFiniteNumber } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Hacker News karma payload (`hacker-news.firebaseio.com/v0/user/:user/karma.json`). */
interface HackerNewsKarmaPayload {
  /** User karma. */
  karma: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Hacker News user karma endpoint (`null` is not found) with profile page redirect. */
const HN_KARMA_ENDPOINT = createEndpoint<HackerNewsKarmaPayload>({
  api: 'https://hacker-news.firebaseio.com/v0/user/{target}/karma.json',
  page: 'https://news.ycombinator.com/user?id={target}',
  project: (data) => {
    const karma = readFiniteNumber(data);
    return karma === undefined ? undefined : { karma };
  },
});

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a Hacker News username (letters, digits, `_`, and `-`; Firebase rejects `.` in paths). */
const HN_USER_RX = /^[\w-]{1,32}$/;

// -------------------------------------- PUBLIC API -------------------------------------

/** Hacker News service preset (`hn`). */
export const HACKER_NEWS_SERVICE = defineService({
  docs: { description: 'User karma (case-sensitive username).', title: 'Hacker News' },
  metrics: {
    karma: createCountMetric(
      HN_KARMA_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'ycombinator', defaultLabel: 'Karma' },
      (payload) => payload.karma,
      '',
      undefined,
      true
    ),
  },
  route: { target: { pattern: HN_USER_RX, placeholder: ':user' } },
});
