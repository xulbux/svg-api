/**
 * Hugging Face service presets – Model and dataset 30-day/all-time downloads and likes via the compact `?expand[]=` Hub API (`/badge/hf/:owner/:model/:metric`, `/badge/hf-dataset/:owner/:dataset/:metric`).
 */

import { createCountTransform, RECENT_DOWNLOADS, TOTAL_DOWNLOADS } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Hugging Face Hub repository payload limited by `?expand[]=downloads,likes,downloadsAllTime`. */
interface HuggingFaceRepoPayload {
  /** Downloads in the last 30 days. */
  downloads: number;
  /** All-time downloads. */
  downloadsAllTime: number;
  /** Number of likes. */
  likes: number;
}

/** Hugging Face Hub repository kind. */
interface HuggingFaceRepoKind {
  /** Hub API collection (`models`, `datasets`). */
  apiCollection: string;
  /** Docs metadata description. */
  description: string;
  /** Web page path prefix (`''` for models, `'/datasets'` for datasets). */
  pagePrefix: string;
  /** Target segment placeholder (e.g., `':model'`). */
  targetName: string;
  /** Human-readable service name. */
  title: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Query string limiting the Hub API response to the badge fields (`~120 B` instead of `~5 KB`). */
const EXPAND_QUERY = '?expand%5B%5D=downloads&expand%5B%5D=likes&expand%5B%5D=downloadsAllTime';

// -------------------------------------- INTERNALS --------------------------------------

/** Create a Hugging Face service preset for a Hub repository kind. */
function createHuggingFaceService(kind: HuggingFaceRepoKind): ServiceDefinition {
  const endpoint: MetricEndpoint = {
    buildApiUrl: (owner: string, repo: string): string =>
      `https://huggingface.co/api/${kind.apiCollection}/${owner}/${repo}${EXPAND_QUERY}`,
    buildRedirectUrl: (owner: string, repo: string): string =>
      `https://huggingface.co${kind.pagePrefix}/${owner}/${repo}`,
  };
  return {
    docs: {
      description: kind.description,
      ownerName: ':owner',
      targetName: kind.targetName,
      title: kind.title,
    },
    metricAliases: { dm: 'dl' },
    metrics: {
      dl: {
        ...endpoint,
        ...RECENT_DOWNLOADS,
        transform: createCountTransform<HuggingFaceRepoPayload>(
          (payload) => payload.downloads,
          '/mo'
        ),
      },
      dt: {
        ...endpoint,
        ...TOTAL_DOWNLOADS,
        transform: createCountTransform<HuggingFaceRepoPayload>(
          (payload) => payload.downloadsAllTime
        ),
      },
      likes: {
        ...endpoint,
        defaultColor: 'amber',
        defaultIcon: 'huggingface',
        defaultLabel: 'likes',
        transform: createCountTransform<HuggingFaceRepoPayload>((payload) => payload.likes),
      },
    },
    ownerMode: 'required',
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Hugging Face model service preset (`hf`). */
export const HUGGING_FACE_MODEL_SERVICE: ServiceDefinition = createHuggingFaceService({
  apiCollection: 'models',
  description: 'Model downloads (30-day and all-time) and likes.',
  pagePrefix: '',
  targetName: ':model',
  title: 'Hugging Face',
});

/** Hugging Face dataset service preset (`hf-dataset`). */
export const HUGGING_FACE_DATASET_SERVICE: ServiceDefinition = createHuggingFaceService({
  apiCollection: 'datasets',
  description: 'Dataset downloads (30-day and all-time) and likes.',
  pagePrefix: '/datasets',
  targetName: ':dataset',
  title: 'Hugging Face Datasets',
});
