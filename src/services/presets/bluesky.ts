/**
 * Bluesky Service Preset
 *
 * Live upstream metrics and redirect transformations for Bluesky.
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createCommunityMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Bluesky profile payload (`public.api.bsky.app/xrpc/app.bsky.actor.getProfile`). */
interface BlueskyProfilePayload {
  /** Number of followers. */
  followersCount: number;
  /** Number of published posts. */
  postsCount: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Bluesky public AppView profile endpoint with bsky.app profile redirect. */
const BLUESKY_ENDPOINT = createEndpoint({
  api: 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={target}',
  page: 'https://bsky.app/profile/{target}',
  project: pickFields<BlueskyProfilePayload>(['followersCount', 'postsCount']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Bluesky service preset (`bluesky`). */
export const BLUESKY_SERVICE = defineService({
  docs: {
    description: 'Follower and post counts of a public profile handle (e.g., bsky.app).',
    title: 'Bluesky',
  },
  metrics: {
    followers: createCommunityMetric(
      BLUESKY_ENDPOINT,
      'followers',
      'bluesky',
      (profile) => profile.followersCount
    ),
    posts: createCommunityMetric(
      BLUESKY_ENDPOINT,
      'posts',
      'bluesky',
      (profile) => profile.postsCount
    ),
  },
  route: { target: { placeholder: ':handle' } },
});
