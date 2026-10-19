/**
 * Bluesky service preset – Follower and post counts of a public profile (`/badge/bluesky/:handle/:metric`).
 */

import { createCountTransform } from '@/services/metrics';
import type { MetricEndpoint, MetricPresentation, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Bluesky profile payload (`public.api.bsky.app/xrpc/app.bsky.actor.getProfile`). */
interface BlueskyProfilePayload {
  /** Number of followers. */
  followersCount: number;
  /** Number of published posts. */
  postsCount: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Shared presentation of the Bluesky badges. */
const BLUESKY: MetricPresentation = {
  defaultColor: 'blue',
  defaultIcon: 'bluesky',
  defaultLabel: 'bluesky',
};

/** Bluesky public AppView profile endpoint with bsky.app profile redirect. */
const BLUESKY_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, handle: string): string =>
    `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`,
  buildRedirectUrl: (_owner: string, handle: string): string =>
    `https://bsky.app/profile/${handle}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Bluesky service preset (`bluesky`). */
export const BLUESKY_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Follower and post counts of a public profile handle (e.g., bsky.app).',
    targetName: ':handle',
    title: 'Bluesky',
  },
  metrics: {
    followers: {
      ...BLUESKY_ENDPOINT,
      ...BLUESKY,
      transform: createCountTransform<BlueskyProfilePayload>(
        (payload) => payload.followersCount,
        ' followers'
      ),
    },
    posts: {
      ...BLUESKY_ENDPOINT,
      ...BLUESKY,
      transform: createCountTransform<BlueskyProfilePayload>(
        (payload) => payload.postsCount,
        ' posts'
      ),
    },
  },
  ownerMode: 'none',
};
