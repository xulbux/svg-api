/**
 * Discord service preset – Live upstream metrics and redirect transformations.
 */

import { CACHE_TTL, createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { RATIO_SPECIALS, buildRatioSpecials, createCommunityMetric } from '@/services/metrics';

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
 * Discord invite endpoint (with approximate counts) and invite link redirect; Discord rate-limits
 * per IP and Workers share egress IPs, so approximate counts use the slow TTL.
 */
const DISCORD_ENDPOINT = createEndpoint({
  api: 'https://discord.com/api/v10/invites/{target}?with_counts=true',
  page: 'https://discord.gg/{target}',
  project: pickFields<DiscordInvitePayload>([
    'approximate_member_count',
    'approximate_presence_count',
  ]),
  ttl: CACHE_TTL.slow,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Discord service preset (`discord`). */
export const DISCORD_SERVICE = defineService({
  docs: {
    description: 'Approximate online and total member counts via a permanent invite code.',
    title: 'Discord',
  },
  metricAliases: { users: 'members' },
  metrics: {
    members: createCommunityMetric(
      DISCORD_ENDPOINT,
      'members',
      'discord',
      (invite) => invite.approximate_member_count,
      (invite) =>
        buildRatioSpecials(invite.approximate_presence_count, invite.approximate_member_count),
      RATIO_SPECIALS
    ),
    online: createCommunityMetric(
      DISCORD_ENDPOINT,
      'online',
      'discord',
      (invite) => invite.approximate_presence_count,
      (invite) =>
        buildRatioSpecials(invite.approximate_presence_count, invite.approximate_member_count),
      RATIO_SPECIALS
    ),
  },
  route: { target: { placeholder: ':invite' } },
});
