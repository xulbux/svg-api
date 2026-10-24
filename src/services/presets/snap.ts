/**
 * Snapcraft service preset – Live upstream metrics and redirect transformations.
 *
 * The Snap Store info API requires a `Snap-Device-Series` header (`SNAP_HEADERS`). The version is
 * read from the stable channel of the snap's default track, preferring `PREFERRED_SNAP_ARCHITECTURE`.
 */

import { asJsonObject, createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import { createLicenseMetric, createVersionMetric, readText } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Snap Store info metadata (`api.snapcraft.io/v2/snaps/info/:snap`). */
interface SnapInfoProjection {
  /** SPDX license expression. */
  license?: string;
  /** Stable default-track version (preferring `PREFERRED_SNAP_ARCHITECTURE`). */
  version?: string;
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

// -------------------------------------- INTERNALS --------------------------------------

/** Read the version of a channel map entry released to the stable channel of `track` (malformed entries are skipped). */
function readStableRelease(entry: unknown, track: string): StableSnapRelease | undefined {
  if (!isJsonObject(entry) || typeof entry.version !== 'string') {
    return undefined;
  }
  const channel = asJsonObject(entry.channel);
  if (!channel) {
    return undefined;
  }
  return channel.track === track && channel.risk === 'stable'
    ? { architecture: channel.architecture, version: entry.version }
    : undefined;
}

/** Read the stable default-track version, preferring the `amd64` build over other architectures. */
function readStableSnapVersion(entries: unknown, defaultTrack: unknown): string | undefined {
  if (!Array.isArray(entries)) {
    return undefined;
  }
  const track = readText(defaultTrack) ?? DEFAULT_SNAP_TRACK;
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

/** Project a Snap Store info payload to its license and resolved stable version. */
function projectSnapInfo(data: unknown): SnapInfoProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  return {
    license: readText(asJsonObject(data.snap)?.license),
    version: readStableSnapVersion(data['channel-map'], data['default-track']),
  };
}

/** Snap Store info endpoint with snapcraft.io store page redirect. */
const SNAP_ENDPOINT = createEndpoint({
  api: 'https://api.snapcraft.io/v2/snaps/info/{target}?fields=license,version',
  page: 'https://snapcraft.io/{target}',
  project: projectSnapInfo,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Snapcraft service preset (`snap`). */
export const SNAP_SERVICE = defineService({
  docs: {
    description: 'Latest stable version (default track, amd64 preferred) and license.',
    title: 'Snapcraft',
  },
  headers: SNAP_HEADERS,
  metrics: {
    license: createLicenseMetric(SNAP_ENDPOINT, (info) => info.license),
    v: createVersionMetric(
      SNAP_ENDPOINT,
      { defaultColor: 'teal', defaultIcon: 'snapcraft', defaultLabel: 'Snapcraft' },
      (info) => info.version
    ),
  },
  route: { target: { placeholder: ':snap' } },
});
