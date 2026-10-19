/**
 * Discord service preset – Approximate online and total member counts of a server via a permanent invite code (`/badge/discord/:invite/:metric`).
 */

import { createCountTransform } from '@/services/metrics';
import type { MetricEndpoint, MetricPresentation, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Discord invite payload (`discord.com/api/v10/invites/:invite?with_counts=true`). */
interface DiscordInvitePayload {
  /** Approximate total member count. */
  approximate_member_count: number;
  /** Approximate online member count. */
  approximate_presence_count: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/**
 * Tier-1 JSON cache TTL in seconds; Discord rate-limits per IP and Workers share egress IPs, so
 * approximate counts are cached longer than the default.
 */
const DISCORD_CACHE_TTL_SECONDS = 1800;

/** Shared presentation of the Discord badges. */
const DISCORD: MetricPresentation = {
  defaultColor: 'indigo',
  defaultIcon: 'discord',
  defaultLabel: 'discord',
};

/** Discord invite endpoint (with approximate counts) and invite link redirect. */
const DISCORD_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, invite: string): string =>
    `https://discord.com/api/v10/invites/${invite}?with_counts=true`,
  buildRedirectUrl: (_owner: string, invite: string): string => `https://discord.gg/${invite}`,
  cacheTtlSeconds: DISCORD_CACHE_TTL_SECONDS,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Discord service preset (`discord`). */
export const DISCORD_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Approximate online and total member counts via a permanent invite code.',
    targetName: ':invite',
    title: 'Discord',
  },
  metricAliases: { users: 'members' },
  metrics: {
    members: {
      ...DISCORD_ENDPOINT,
      ...DISCORD,
      transform: createCountTransform<DiscordInvitePayload>(
        (payload) => payload.approximate_member_count,
        ' members'
      ),
    },
    online: {
      ...DISCORD_ENDPOINT,
      ...DISCORD,
      transform: createCountTransform<DiscordInvitePayload>(
        (payload) => payload.approximate_presence_count,
        ' online'
      ),
    },
  },
  ownerMode: 'none',
};
