/**
 * Snapcraft service preset – Latest stable snap version and license (`/badge/snap/:snap/:metric`).
 *
 * The Snap Store info API rejects requests without the `Snap-Device-Series: 16` header. The version
 * is read from the stable channel of the snap's default track, preferring the `amd64` build.
 */

import { createLicenseTransform, createVersionTransform, LICENSE } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial channel map entry of a Snap Store info payload. */
interface SnapChannelMapEntry {
  /** Channel coordinates of this release. */
  channel?: {
    /** CPU architecture of the build (e.g., `'amd64'`). */
    architecture?: string;
    /** Channel risk level (`stable`, `candidate`, `beta`, `edge`). */
    risk?: string;
    /** Channel track (e.g., `'latest'`, `'esr'`). */
    track?: string;
  };
  /** Released snap version. */
  version?: string;
}

/** Partial Snap Store info API payload (`api.snapcraft.io/v2/snaps/info/:snap`). */
interface SnapInfoPayload {
  /** Every released channel and architecture combination. */
  'channel-map': SnapChannelMapEntry[];
  /** Default track of the snap, or `null` for `latest`. */
  'default-track': string | null;
  /** Requested snap metadata fields. */
  snap: {
    /** SPDX license expression. */
    license?: string;
  };
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Required Snap Store API request headers. */
const SNAP_HEADERS: Readonly<Record<string, string>> = { 'Snap-Device-Series': '16' };

/** Channel track used when the snap declares no default track. */
const DEFAULT_SNAP_TRACK = 'latest';

/** Architecture preferred when the stable channel has several builds. */
const PREFERRED_SNAP_ARCHITECTURE = 'amd64';

/** Snap Store info endpoint with snapcraft.io store page redirect. */
const SNAP_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, snap: string): string =>
    `https://api.snapcraft.io/v2/snaps/info/${encodeURIComponent(snap)}?fields=license,version`,
  buildRedirectUrl: (_owner: string, snap: string): string => `https://snapcraft.io/${snap}`,
};

// -------------------------------------- INTERNALS --------------------------------------

/** Read the stable default-track version, preferring the `amd64` build over other architectures. */
function readStableSnapVersion(payload: Partial<SnapInfoPayload>): string | undefined {
  const entries = payload['channel-map'];
  if (!Array.isArray(entries)) {
    return undefined;
  }
  const track = payload['default-track'] ?? DEFAULT_SNAP_TRACK;
  let fallback: SnapChannelMapEntry | undefined = undefined;
  for (const entry of entries) {
    const isStableRelease = entry.channel?.track === track && entry.channel.risk === 'stable';
    if (isStableRelease && entry.channel?.architecture === PREFERRED_SNAP_ARCHITECTURE) {
      return entry.version;
    }
    if (isStableRelease) {
      fallback ??= entry;
    }
  }
  return fallback?.version;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Snapcraft service preset (`snap`). */
export const SNAP_SERVICE: ServiceDefinition = {
  buildHeaders: () => SNAP_HEADERS,
  docs: {
    description: 'Latest stable version (default track, amd64 preferred) and license.',
    targetName: ':snap',
    title: 'Snapcraft',
  },
  metricAliases: { l: 'license' },
  metrics: {
    license: {
      ...SNAP_ENDPOINT,
      ...LICENSE,
      transform: createLicenseTransform<SnapInfoPayload>((payload) => payload.snap?.license),
    },
    v: {
      ...SNAP_ENDPOINT,
      defaultColor: 'teal',
      defaultIcon: 'snapcraft',
      defaultLabel: 'snapcraft',
      transform: createVersionTransform<SnapInfoPayload>(readStableSnapVersion),
    },
  },
  ownerMode: 'none',
};
