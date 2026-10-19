/**
 * Snapcraft service preset – Latest stable snap version and license (`/badge/snap/:snap/:metric`).
 *
 * The Snap Store info API rejects requests without the `Snap-Device-Series: 16` header. The version
 * is read from the stable channel of the snap's default track, preferring the `amd64` build.
 */

import { createEndpoint, defineService, isJsonObject, pickFields } from '@/services/endpoint';
import { createLicenseMetric, createVersionMetric } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Requested snap metadata fields of the Snap Store info API. */
interface SnapMetadata {
  /** SPDX license expression. */
  license?: string;
}

/** Partial Snap Store info API payload (`api.snapcraft.io/v2/snaps/info/:snap`). */
interface SnapInfoPayload {
  /** Every released channel and architecture combination (`{ channel: { architecture, risk, track }, version }`). */
  'channel-map': unknown[];
  /** Default track of the snap, or `null` for `latest`. */
  'default-track': string | null;
  /** Requested snap metadata fields. */
  snap: SnapMetadata | null;
}

/** Version and architecture of a stable channel map entry of the default track. */
interface StableSnapRelease {
  /** CPU architecture of the build (e.g., `'amd64'`). */
  architecture: unknown;
  /** Released snap version. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Required Snap Store API request headers. */
const SNAP_HEADERS: Readonly<Record<string, string>> = { 'Snap-Device-Series': '16' };

/** Channel track used when the snap declares no default track. */
const DEFAULT_SNAP_TRACK = 'latest';

/** Architecture preferred when the stable channel has several builds. */
const PREFERRED_SNAP_ARCHITECTURE = 'amd64';

/** Snap Store info endpoint with snapcraft.io store page redirect. */
const SNAP_ENDPOINT = createEndpoint({
  api: 'https://api.snapcraft.io/v2/snaps/info/{target}?fields=license,version',
  page: 'https://snapcraft.io/{target}',
  project: pickFields<SnapInfoPayload>(['channel-map', 'default-track', 'snap']),
});

// -------------------------------------- INTERNALS --------------------------------------

/** Build the required Snap Store request headers. */
function buildSnapHeaders(): Readonly<Record<string, string>> {
  return SNAP_HEADERS;
}

/** Read the version of a channel map entry released to the stable channel of `track` (malformed entries are skipped). */
function readStableRelease(entry: unknown, track: string): StableSnapRelease | undefined {
  const channel = isJsonObject(entry) ? entry.channel : undefined;
  if (!isJsonObject(entry) || !isJsonObject(channel) || typeof entry.version !== 'string') {
    return undefined;
  }
  return channel.track === track && channel.risk === 'stable'
    ? { architecture: channel.architecture, version: entry.version }
    : undefined;
}

/** Read the stable default-track version, preferring the `amd64` build over other architectures. */
function readStableSnapVersion(payload: Partial<SnapInfoPayload>): string | undefined {
  const entries = payload['channel-map'];
  if (!Array.isArray(entries)) {
    return undefined;
  }
  const track = payload['default-track'] ?? DEFAULT_SNAP_TRACK;
  let fallbackVersion: string | undefined = undefined;
  for (const entry of entries) {
    const release = readStableRelease(entry, track);
    if (release?.architecture === PREFERRED_SNAP_ARCHITECTURE) {
      return release.version;
    }
    fallbackVersion ??= release?.version;
  }
  return fallbackVersion;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Snapcraft service preset (`snap`). */
export const SNAP_SERVICE = defineService({
  buildHeaders: buildSnapHeaders,
  docs: {
    description: 'Latest stable version (default track, amd64 preferred) and license.',
    title: 'Snapcraft',
  },
  metrics: {
    license: createLicenseMetric(SNAP_ENDPOINT, (info) => info.snap?.license),
    v: createVersionMetric(
      SNAP_ENDPOINT,
      { defaultColor: 'teal', defaultIcon: 'snapcraft', defaultLabel: 'snapcraft' },
      readStableSnapVersion
    ),
  },
  route: { target: { placeholder: ':snap' } },
});
