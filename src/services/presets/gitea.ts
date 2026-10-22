/**
 * Gitea/Forgejo service presets – Public repository stars, forks, issues, pull requests, last activity, and latest release for any owner on Codeberg and gitea.com (`/badge/codeberg/:owner/:repo/:metric`, `/badge/gitea/:owner/:repo/:metric`).
 *
 * Codeberg runs Forgejo, a Gitea fork with an identical `/api/v1/repos` API, so both presets are
 * built by the same `createGiteaService` factory.
 */

import { createEndpoint, defineService, pickFields, withPageSuffix } from '@/services/endpoint';
import {
  createCountMetric,
  createRelativeDateMetric,
  createReleaseMetric,
  FORKS,
  ISSUES,
  LAST_COMMIT,
  PULL_REQUESTS,
  STARS,
} from '@/services/metrics';
import type { ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Gitea/Forgejo repository API payload (`:host/api/v1/repos/:owner/:repo`). */
interface GiteaRepoPayload {
  /** Number of repository forks. */
  forks_count: number;
  /** Number of open issues. */
  open_issues_count: number;
  /** Number of open pull requests. */
  open_pr_counter: number;
  /** Number of repository stars. */
  stars_count: number;
  /** ISO 8601 timestamp of the most recent repository update. */
  updated_at: string;
}

/** Partial Gitea/Forgejo latest release API payload. */
interface GiteaReleasePayload {
  /** Release git tag name. */
  tag_name: string;
}

/** Options of a Gitea-compatible forge instance. */
interface GiteaInstanceOptions {
  /** Forge host name without protocol (e.g., `'codeberg.org'`). */
  host: string;
  /** Human-readable forge name for the docs (e.g., `'Codeberg'`). */
  title: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Repository payload fields read by the repository metrics. */
const REPO_FIELDS: readonly (keyof GiteaRepoPayload)[] = [
  'forks_count',
  'open_issues_count',
  'open_pr_counter',
  'stars_count',
  'updated_at',
];

// -------------------------------------- INTERNALS --------------------------------------

/** Create a repository service preset for a Gitea-compatible forge instance. */
function createGiteaService({ host, title }: GiteaInstanceOptions): ServiceDefinition {
  const repoEndpoint = createEndpoint({
    api: `https://${host}/api/v1/repos/{owner}/{target}`,
    page: `https://${host}/{owner}/{target}`,
    project: pickFields<GiteaRepoPayload>(REPO_FIELDS),
  });
  const releaseEndpoint = createEndpoint({
    api: `https://${host}/api/v1/repos/{owner}/{target}/releases/latest`,
    page: `https://${host}/{owner}/{target}/releases`,
    project: pickFields<GiteaReleasePayload>(['tag_name']),
  });
  return defineService({
    docs: {
      description:
        'Repository stars, forks, open issues, open pull requests, last activity, and latest release.',
      title,
    },
    metricAliases: { commit: 'updated', 'last-commit': 'updated' },
    metrics: {
      forks: createCountMetric(
        withPageSuffix(repoEndpoint, '/forks'),
        FORKS,
        (repo) => repo.forks_count
      ),
      issues: createCountMetric(
        withPageSuffix(repoEndpoint, '/issues'),
        ISSUES,
        (repo) => repo.open_issues_count
      ),
      prs: createCountMetric(
        withPageSuffix(repoEndpoint, '/pulls'),
        PULL_REQUESTS,
        (repo) => repo.open_pr_counter
      ),
      release: createReleaseMetric(releaseEndpoint, (release) => release.tag_name),
      stars: createCountMetric(
        withPageSuffix(repoEndpoint, '/stars'),
        STARS,
        (repo) => repo.stars_count
      ),
      updated: createRelativeDateMetric(
        withPageSuffix(repoEndpoint, '/activity'),
        { ...LAST_COMMIT, defaultLabel: 'Last Activity' },
        (repo) => repo.updated_at
      ),
    },
    route: { owner: { isRequired: true, placeholder: ':owner' }, target: { placeholder: ':repo' } },
  });
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Codeberg (Forgejo) repository service preset (`codeberg`). */
export const CODEBERG_SERVICE: ServiceDefinition = createGiteaService({
  host: 'codeberg.org',
  title: 'Codeberg',
});

/** gitea.com repository service preset (`gitea`). */
export const GITEA_SERVICE: ServiceDefinition = createGiteaService({
  host: 'gitea.com',
  title: 'Gitea',
});
