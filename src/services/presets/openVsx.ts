/**
 * Open VSX service preset – Extension version, total downloads, and average rating (`/badge/ovsx/[:owner/]:ext/:metric`).
 */

import { resolveDefaultGhOwner } from '@/config/site';
import {
  createCountTransform,
  createRatingTransform,
  createVersionTransform,
  RATING,
  TOTAL_DOWNLOADS,
} from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Open VSX extension metadata API payload (`open-vsx.org/api/:owner/:ext`). */
interface OpenVsxExtensionPayload {
  /** Average star rating (`0`–`5`), absent when the extension has no reviews. */
  averageRating: number;
  /** Total all-time extension downloads. */
  downloadCount: number;
  /** Latest published extension version. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Open VSX extension metadata endpoint with extension page redirect. */
const OPEN_VSX_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (owner: string, ext: string): string => `https://open-vsx.org/api/${owner}/${ext}`,
  buildRedirectUrl: (owner: string, ext: string): string =>
    `https://open-vsx.org/extension/${owner}/${ext}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Open VSX Registry service preset (`ovsx`). */
export const OPEN_VSX_SERVICE: ServiceDefinition = {
  defaultOwner: resolveDefaultGhOwner,
  docs: {
    description: 'Extension version, total downloads, and average star rating.',
    ownerName: ':owner',
    targetName: ':ext',
    title: 'Open VSX',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: {
      ...OPEN_VSX_ENDPOINT,
      ...TOTAL_DOWNLOADS,
      defaultColor: 'violet',
      transform: createCountTransform<OpenVsxExtensionPayload>((payload) => payload.downloadCount),
    },
    rating: {
      ...OPEN_VSX_ENDPOINT,
      ...RATING,
      transform: createRatingTransform<OpenVsxExtensionPayload>((payload) => [
        payload.averageRating,
        5,
      ]),
    },
    v: {
      ...OPEN_VSX_ENDPOINT,
      defaultColor: 'indigo',
      defaultIcon: 'puzzle',
      defaultLabel: 'open vsx',
      transform: createVersionTransform<OpenVsxExtensionPayload>((payload) => payload.version),
    },
  },
  ownerMode: 'optional',
};
