/**
 * Gitea/Forgejo service presets – Public repository stars, forks, issues, pull requests, last activity, and latest release for any owner on Codeberg and gitea.com (`/badge/codeberg/:owner/:repo/:metric`, `/badge/gitea/:owner/:repo/:metric`).
 *
 * Codeberg runs Forgejo, a Gitea fork with an identical `/api/v1/repos` API, so both presets are
 * built by the same `createGiteaService` factory.
 */

import {
  createCountTransform,
  createRelativeDateTransform,
  createRepoEndpointFactory,
  createVersionTransform,
  FORKS,
  ISSUES,
  LAST_COMMIT,
  PULL_REQUESTS,
  RELEASE,
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

// -------------------------------------- INTERNALS --------------------------------------

/** Create a repository service preset for a Gitea-compatible forge instance. */
function createGiteaService({ host, title }: GiteaInstanceOptions): ServiceDefinition {
  const createEndpoint = createRepoEndpointFactory(
    (owner: string, repo: string): string => `https://${host}/api/v1/repos/${owner}/${repo}`,
    `https://${host}`
  );
  return {
    docs: {
      description:
        'Repository stars, forks, open issues, open pull requests, last activity, and latest release.',
      ownerName: ':owner',
      targetName: ':repo',
      title,
    },
    metricAliases: { commit: 'updated', 'last-commit': 'updated', pulls: 'prs' },
    metrics: {
      forks: {
        ...createEndpoint('', '/forks'),
        ...FORKS,
        transform: createCountTransform<GiteaRepoPayload>((payload) => payload.forks_count),
      },
      issues: {
        ...createEndpoint('', '/issues'),
        ...ISSUES,
        transform: createCountTransform<GiteaRepoPayload>((payload) => payload.open_issues_count),
      },
      prs: {
        ...createEndpoint('', '/pulls'),
        ...PULL_REQUESTS,
        transform: createCountTransform<GiteaRepoPayload>((payload) => payload.open_pr_counter),
      },
      release: {
        ...createEndpoint('/releases/latest', '/releases'),
        ...RELEASE,
        transform: createVersionTransform<GiteaReleasePayload>((payload) => payload.tag_name),
      },
      stars: {
        ...createEndpoint('', '/stars'),
        ...STARS,
        transform: createCountTransform<GiteaRepoPayload>((payload) => payload.stars_count),
      },
      updated: {
        ...createEndpoint('', '/activity'),
        ...LAST_COMMIT,
        defaultLabel: 'last activity',
        transform: createRelativeDateTransform<GiteaRepoPayload>((payload) => payload.updated_at),
      },
    },
    ownerMode: 'required',
  };
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
