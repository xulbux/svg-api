/**
 * Hugging Face Service Presets
 *
 * Live upstream metrics and redirect transformations for Hugging Face models, datasets, and Spaces.
 */

import {
  createEndpoint,
  createMetric,
  defineService,
  isJsonObject,
  pickFields,
  readJsonObject,
} from '@/services/endpoint';
import {
  createCommunityMetric,
  createDownloadsMetric,
  readFiniteNumber,
  readText,
} from '@/services/metrics';
import { getOwnValue } from '@/svg/shared';
import type { MetricResult, ServiceDefinition } from '@/types';

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

/** Projected Hugging Face Space metadata limited by `?expand[]=likes,sdk,runtime`. */
interface HuggingFaceSpaceProjection {
  /** Number of likes. */
  likes?: number;
  /** Space SDK identifier (`'gradio'`, `'streamlit'`, `'docker'`, `'static'`). */
  sdk?: string;
  /** Runtime stage code (e.g., `'RUNNING'`, `'SLEEPING'`, `'BUILDING'`). */
  stage?: string;
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

/** Query string limiting the Hub API response to model/dataset badge fields (`~120 B` instead of `~5 KB`). */
const EXPAND_QUERY = '?expand%5B%5D=downloads&expand%5B%5D=likes&expand%5B%5D=downloadsAllTime';

/** Query string limiting the Hub Spaces API response to `likes`, `sdk`, and `runtime`. */
const SPACE_EXPAND_QUERY = '?expand%5B%5D=likes&expand%5B%5D=sdk&expand%5B%5D=runtime';

/** Upstream HTTP statuses returned by Hugging Face Hub for nonexistent or private repositories. */
const HUGGING_FACE_MISSING_STATUSES: readonly number[] = [401];

/** Brand-aware badge presentations of Hugging Face Space SDKs. */
const SPACE_SDK_PRESENTATIONS: Readonly<Record<string, Partial<MetricResult>>> = {
  docker: { color: 'sky', icon: 'docker', value: 'Docker' },
  gradio: { color: 'orange', icon: 'gradio', value: 'Gradio' },
  static: { color: 'indigo', icon: 'file-code', value: 'Static' },
  streamlit: { color: 'rose', icon: 'streamlit', value: 'Streamlit' },
};

/** Status badge presentations of Hugging Face Space runtime stages. */
const SPACE_STAGE_PRESENTATIONS: Readonly<Record<string, Partial<MetricResult>>> = {
  APP_STARTING: { color: 'amber', dot: 'amber', value: 'starting' },
  BUILD_ERROR: { color: 'rose', icon: 'circle-x', value: 'build error' },
  BUILDING: { color: 'amber', dot: 'amber', value: 'building' },
  CONFIG_ERROR: { color: 'rose', icon: 'circle-x', value: 'config error' },
  DELETING: { color: 'slate', icon: 'trash-2', value: 'deleting' },
  NO_APP_FILE: { color: 'amber', icon: 'circle-alert', value: 'no app file' },
  PAUSED: { color: 'slate', icon: 'circle-pause', value: 'paused' },
  RUNNING: { color: 'emerald', dot: 'emerald', value: 'running' },
  RUNNING_APP_STARTING: { color: 'amber', dot: 'amber', value: 'starting' },
  RUNNING_BUILDING: { color: 'emerald', dot: 'amber', value: 'rebuilding' },
  RUNTIME_ERROR: { color: 'rose', icon: 'circle-x', value: 'runtime error' },
  SLEEPING: { color: 'sky', icon: 'moon', value: 'sleeping' },
  STOPPED: { color: 'slate', icon: 'circle-stop', value: 'stopped' },
};

// -------------------------------------- INTERNALS --------------------------------------

/** Create a Hugging Face service preset for a Hub repository kind (`models` or `datasets`). */
function createHuggingFaceService(kind: HuggingFaceRepoKind): ServiceDefinition {
  const endpoint = createEndpoint({
    api: `https://huggingface.co/api/${kind.apiCollection}/{owner}/{target}${EXPAND_QUERY}`,
    missingStatuses: HUGGING_FACE_MISSING_STATUSES,
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

/** Project a Hugging Face Space payload to its likes count, SDK, and runtime stage. */
function projectHuggingFaceSpace(data: unknown): HuggingFaceSpaceProjection | undefined {
  if (!isJsonObject(data)) {
    return undefined;
  }
  return {
    likes: readFiniteNumber(data.likes),
    sdk: readText(data.sdk),
    stage: readText(readJsonObject(data.runtime)?.stage),
  };
}

/** Transform a Hugging Face Space SDK identifier into a brand-colored badge result. */
function transformSpaceSdk(space: HuggingFaceSpaceProjection): Partial<MetricResult> {
  if (!space.sdk) {
    return { value: 'n/a' };
  }
  const normalized = space.sdk.toLowerCase();
  return getOwnValue(SPACE_SDK_PRESENTATIONS, normalized) ?? { value: space.sdk };
}

/** Transform a Hugging Face Space runtime stage into a status badge result. */
function transformSpaceStage(space: HuggingFaceSpaceProjection): Partial<MetricResult> {
  if (!space.stage) {
    return { value: 'n/a' };
  }
  const normalized = space.stage.toUpperCase();
  return (
    getOwnValue(SPACE_STAGE_PRESENTATIONS, normalized) ?? {
      value: normalized.toLowerCase().replaceAll('_', ' '),
    }
  );
}

/** Hugging Face Spaces endpoint (`?expand[]=likes,sdk,runtime`) with Space page redirect. */
const HUGGING_FACE_SPACE_ENDPOINT = createEndpoint({
  api: `https://huggingface.co/api/spaces/{owner}/{target}${SPACE_EXPAND_QUERY}`,
  extractKeys: ['likes', 'runtime', 'sdk'],
  missingStatuses: HUGGING_FACE_MISSING_STATUSES,
  page: 'https://huggingface.co/spaces/{owner}/{target}',
  project: projectHuggingFaceSpace,
});

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

/** Hugging Face Spaces service preset (`hf-space`). */
export const HUGGING_FACE_SPACE_SERVICE: ServiceDefinition = defineService({
  docs: {
    description: 'Space runtime stage (running, sleeping, building), SDK, and likes.',
    title: 'Hugging Face Spaces',
  },
  metricAliases: { state: 'stage', status: 'stage' },
  metrics: {
    likes: createCommunityMetric(
      HUGGING_FACE_SPACE_ENDPOINT,
      'likes',
      'huggingface',
      (space) => space.likes
    ),
    sdk: createMetric(
      HUGGING_FACE_SPACE_ENDPOINT,
      {
        defaultColor: 'amber',
        defaultIcon: 'huggingface',
        defaultLabel: 'Space SDK',
        hasDynamicColor: true,
        hasDynamicIcon: true,
      },
      transformSpaceSdk
    ),
    stage: createMetric(
      HUGGING_FACE_SPACE_ENDPOINT,
      {
        defaultColor: 'emerald',
        defaultIcon: 'huggingface',
        defaultLabel: 'Space',
        hasDynamicColor: true,
        hasDynamicDot: true,
        hasDynamicIcon: true,
      },
      transformSpaceStage
    ),
  },
  route: { owner: { isRequired: true, placeholder: ':owner' }, target: { placeholder: ':space' } },
});
