/**
 * Hugging Face service presets – Model and dataset 30-day/all-time downloads and likes via the compact `?expand[]=` Hub API (`/badge/hf/:owner/:model/:metric`, `/badge/hf-dataset/:owner/:dataset/:metric`).
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createCommunityMetric, createDownloadsMetric } from '@/services/metrics';
import type { ServiceDefinition } from '@/types';

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
  targetPlaceholder: string;
  /** Human-readable service name. */
  title: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Query string limiting the Hub API response to the badge fields (`~120 B` instead of `~5 KB`). */
const EXPAND_QUERY = '?expand%5B%5D=downloads&expand%5B%5D=likes&expand%5B%5D=downloadsAllTime';

// -------------------------------------- INTERNALS --------------------------------------

/** Create a Hugging Face service preset for a Hub repository kind. */
function createHuggingFaceService(kind: HuggingFaceRepoKind): ServiceDefinition {
  const endpoint = createEndpoint({
    api: `https://huggingface.co/api/${kind.apiCollection}/{owner}/{target}${EXPAND_QUERY}`,
    page: `https://huggingface.co${kind.pagePrefix}/{owner}/{target}`,
    project: pickFields<HuggingFaceRepoPayload>(['downloads', 'downloadsAllTime', 'likes']),
  });
  return defineService({
    docs: { description: kind.description, title: kind.title },
    metrics: {
      dl: createDownloadsMetric(endpoint, 'dl', (repo) => repo.downloads),
      dt: createDownloadsMetric(endpoint, 'dt', (repo) => repo.downloadsAllTime),
      likes: createCommunityMetric(endpoint, 'likes', 'huggingface', (repo) => repo.likes),
    },
    route: {
      owner: { isRequired: true, placeholder: ':owner' },
      target: { placeholder: kind.targetPlaceholder },
    },
  });
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Hugging Face model service preset (`hf`). */
export const HUGGING_FACE_MODEL_SERVICE: ServiceDefinition = createHuggingFaceService({
  apiCollection: 'models',
  description: 'Model downloads (30-day and all-time) and likes.',
  pagePrefix: '',
  targetPlaceholder: ':model',
  title: 'Hugging Face',
});

/** Hugging Face dataset service preset (`hf-dataset`). */
export const HUGGING_FACE_DATASET_SERVICE: ServiceDefinition = createHuggingFaceService({
  apiCollection: 'datasets',
  description: 'Dataset downloads (30-day and all-time) and likes.',
  pagePrefix: '/datasets',
  targetPlaceholder: ':dataset',
  title: 'Hugging Face Datasets',
});
