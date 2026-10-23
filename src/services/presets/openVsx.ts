/**
 * Open VSX service preset – Live upstream metrics and redirect transformations.
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import {
  createDownloadsMetric,
  createLicenseMetric,
  createRatingMetric,
  createVersionMetric,
} from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Open VSX extension metadata API payload (`open-vsx.org/api/:namespace/:ext`). */
interface OpenVsxExtensionPayload {
  /** Average star rating (`0`–`5`), absent when the extension has no reviews. */
  averageRating: number;
  /** Total all-time extension downloads. */
  downloadCount: number;
  /** SPDX license identifier. */
  license: string | null;
  /** Latest published extension version. */
  version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Open VSX extension metadata endpoint with extension page redirect. */
const OPEN_VSX_ENDPOINT = createEndpoint({
  api: 'https://open-vsx.org/api/{owner}/{target}',
  page: 'https://open-vsx.org/extension/{owner}/{target}',
  project: pickFields<OpenVsxExtensionPayload>([
    'averageRating',
    'downloadCount',
    'license',
    'version',
  ]),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Open VSX Registry service preset (`ovsx`). */
export const OPEN_VSX_SERVICE = defineService({
  docs: {
    description: 'Extension version, total downloads, average star rating, and license.',
    title: 'Open VSX',
  },
  metricAliases: { dl: 'dt' },
  metrics: {
    dt: createDownloadsMetric(OPEN_VSX_ENDPOINT, 'dt', (extension) => extension.downloadCount, {
      defaultColor: 'violet',
    }),
    license: createLicenseMetric(OPEN_VSX_ENDPOINT, (extension) => extension.license),
    rating: createRatingMetric(OPEN_VSX_ENDPOINT, (extension) => [extension.averageRating, 5]),
    v: createVersionMetric(
      OPEN_VSX_ENDPOINT,
      { defaultColor: 'indigo', defaultIcon: 'puzzle', defaultLabel: 'Open VSX' },
      (extension) => extension.version
    ),
  },
  route: {
    owner: { isRequired: true, placeholder: ':namespace' },
    target: { placeholder: ':ext' },
  },
});
