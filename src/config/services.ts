/**
 * Service presets – Registry of all upstream service presets (`/badge/:service/...`) and status indicator presets (`/badge/status/:state/:text`).
 *
 * Each service lives in its own module under `src/services/presets/`; This registry is the single
 * source of truth for routing, fetching, and the generated `/docs/services` reference table.
 */

import { AMO_SERVICE } from '@/services/presets/amo';
import { ARCH_SERVICE } from '@/services/presets/arch';
import { ARTIFACT_HUB_SERVICE } from '@/services/presets/artifactHub';
import { AUR_SERVICE } from '@/services/presets/aur';
import { BLUESKY_SERVICE } from '@/services/presets/bluesky';
import { BUNDLEPHOBIA_SERVICE } from '@/services/presets/bundlephobia';
import { CLOJARS_SERVICE } from '@/services/presets/clojars';
import { COCOAPODS_SERVICE } from '@/services/presets/cocoapods';
import { CODECOV_SERVICE } from '@/services/presets/codecov';
import { COVERALLS_SERVICE } from '@/services/presets/coveralls';
import { CPAN_SERVICE } from '@/services/presets/cpan';
import { CRAN_SERVICE } from '@/services/presets/cran';
import { CRATES_SERVICE } from '@/services/presets/crates';
import { DEPS_DEV_SERVICE } from '@/services/presets/depsDev';
import { DISCORD_SERVICE } from '@/services/presets/discord';
import { DOCKER_SERVICE } from '@/services/presets/docker';
import { ELM_SERVICE } from '@/services/presets/elm';
import { FDROID_SERVICE } from '@/services/presets/fdroid';
import { FEDORA_SERVICE } from '@/services/presets/fedora';
import { FLATHUB_SERVICE } from '@/services/presets/flathub';
import { GALAXY_SERVICE } from '@/services/presets/galaxy';
import { CODEBERG_SERVICE, GITEA_SERVICE } from '@/services/presets/gitea';
import { GITHUB_SERVICE } from '@/services/presets/github';
import { GITLAB_SERVICE } from '@/services/presets/gitlab';
import { GO_SERVICE } from '@/services/presets/go';
import { HACKAGE_SERVICE } from '@/services/presets/hackage';
import { HEX_SERVICE } from '@/services/presets/hex';
import { HACKER_NEWS_SERVICE } from '@/services/presets/hn';
import { HOMEBREW_CASK_SERVICE, HOMEBREW_FORMULA_SERVICE } from '@/services/presets/homebrew';
import {
  HUGGING_FACE_DATASET_SERVICE,
  HUGGING_FACE_MODEL_SERVICE,
} from '@/services/presets/huggingface';
import { JETBRAINS_SERVICE } from '@/services/presets/jetbrains';
import { JSDELIVR_SERVICE } from '@/services/presets/jsDelivr';
import { JSR_SERVICE } from '@/services/presets/jsr';
import { LIBERAPAY_SERVICE } from '@/services/presets/liberapay';
import { MACPORTS_SERVICE } from '@/services/presets/macports';
import { MAVEN_SERVICE } from '@/services/presets/maven';
import { HANGAR_SERVICE, SPIGOT_SERVICE } from '@/services/presets/minecraftPlugins';
import { MODRINTH_SERVICE } from '@/services/presets/modrinth';
import { NPM_SERVICE } from '@/services/presets/npm';
import { NUGET_SERVICE } from '@/services/presets/nuget';
import { OPEN_COLLECTIVE_SERVICE } from '@/services/presets/openCollective';
import { OPEN_VSX_SERVICE } from '@/services/presets/openVsx';
import { PACKAGIST_SERVICE } from '@/services/presets/packagist';
import { PUB_SERVICE } from '@/services/presets/pub';
import { PUPPET_SERVICE } from '@/services/presets/puppet';
import { PYPI_SERVICE } from '@/services/presets/pypi';
import { READ_THE_DOCS_SERVICE } from '@/services/presets/readTheDocs';
import { RUBYGEMS_SERVICE } from '@/services/presets/rubygems';
import { SCORECARD_SERVICE } from '@/services/presets/scorecard';
import { SNAP_SERVICE } from '@/services/presets/snap';
import { SONARCLOUD_SERVICE } from '@/services/presets/sonarCloud';
import { STEAM_SERVICE } from '@/services/presets/steam';
import { TERRAFORM_MODULE_SERVICE, TERRAFORM_PROVIDER_SERVICE } from '@/services/presets/terraform';
import { THUNDERSTORE_SERVICE } from '@/services/presets/thunderstore';
import { WORDPRESS_PLUGIN_SERVICE, WORDPRESS_THEME_SERVICE } from '@/services/presets/wordpress';
import { ZENODO_SERVICE } from '@/services/presets/zenodo';
import type { ServiceDefinition, ServiceOwnerMode, StatusPreset } from '@/types';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Declarative status dot mapping.
 * Maps canonical status preset names to their dot state, default label, and theme color.
 */
export const STATUS_PRESET_MAP: Readonly<Record<string, StatusPreset>> = {
  beta: { color: 'violet', defaultLabel: 'status', dot: 'violet' },
  degraded: { color: 'amber', defaultLabel: 'status', dot: 'amber' },
  incident: { color: 'orange', defaultLabel: 'status', dot: 'orange' },
  maintenance: { color: 'sky', defaultLabel: 'status', dot: 'sky' },
  offline: { color: 'rose', defaultLabel: 'status', dot: 'red' },
  online: { color: 'emerald', defaultLabel: 'status', dot: 'green' },
  standby: { color: 'slate', defaultLabel: 'status', dot: 'slate' },
};

/**
 * Neutral fallback preset for unknown `/badge/status/:state/:text` states (a slate dot instead of
 * claiming `online`); Deliberately not part of `STATUS_PRESET_MAP`, so it is no `?dot=` alias.
 */
export const UNKNOWN_STATUS_PRESET: Readonly<StatusPreset> = {
  color: 'slate',
  defaultLabel: 'status',
  dot: 'slate',
};

/** External service presets keyed by their route segment (`/badge/:service/...`), sorted alphabetically. */
export const SERVICES_CONFIG: Readonly<Record<string, ServiceDefinition>> = {
  amo: AMO_SERVICE,
  arch: ARCH_SERVICE,
  artifacthub: ARTIFACT_HUB_SERVICE,
  aur: AUR_SERVICE,
  bluesky: BLUESKY_SERVICE,
  brew: HOMEBREW_FORMULA_SERVICE,
  bundlephobia: BUNDLEPHOBIA_SERVICE,
  cask: HOMEBREW_CASK_SERVICE,
  clojars: CLOJARS_SERVICE,
  cocoapods: COCOAPODS_SERVICE,
  codeberg: CODEBERG_SERVICE,
  codecov: CODECOV_SERVICE,
  coveralls: COVERALLS_SERVICE,
  cpan: CPAN_SERVICE,
  cran: CRAN_SERVICE,
  crates: CRATES_SERVICE,
  depsdev: DEPS_DEV_SERVICE,
  discord: DISCORD_SERVICE,
  docker: DOCKER_SERVICE,
  elm: ELM_SERVICE,
  fdroid: FDROID_SERVICE,
  fedora: FEDORA_SERVICE,
  flathub: FLATHUB_SERVICE,
  galaxy: GALAXY_SERVICE,
  gem: RUBYGEMS_SERVICE,
  gh: GITHUB_SERVICE,
  gitea: GITEA_SERVICE,
  gitlab: GITLAB_SERVICE,
  go: GO_SERVICE,
  hackage: HACKAGE_SERVICE,
  hangar: HANGAR_SERVICE,
  hex: HEX_SERVICE,
  hf: HUGGING_FACE_MODEL_SERVICE,
  'hf-dataset': HUGGING_FACE_DATASET_SERVICE,
  hn: HACKER_NEWS_SERVICE,
  jetbrains: JETBRAINS_SERVICE,
  jsdelivr: JSDELIVR_SERVICE,
  jsr: JSR_SERVICE,
  liberapay: LIBERAPAY_SERVICE,
  macports: MACPORTS_SERVICE,
  maven: MAVEN_SERVICE,
  modrinth: MODRINTH_SERVICE,
  npm: NPM_SERVICE,
  nuget: NUGET_SERVICE,
  opencollective: OPEN_COLLECTIVE_SERVICE,
  ovsx: OPEN_VSX_SERVICE,
  packagist: PACKAGIST_SERVICE,
  pub: PUB_SERVICE,
  puppet: PUPPET_SERVICE,
  pypi: PYPI_SERVICE,
  rtd: READ_THE_DOCS_SERVICE,
  scorecard: SCORECARD_SERVICE,
  snap: SNAP_SERVICE,
  sonarcloud: SONARCLOUD_SERVICE,
  spigot: SPIGOT_SERVICE,
  steam: STEAM_SERVICE,
  terraform: TERRAFORM_MODULE_SERVICE,
  'tf-provider': TERRAFORM_PROVIDER_SERVICE,
  thunderstore: THUNDERSTORE_SERVICE,
  wp: WORDPRESS_PLUGIN_SERVICE,
  'wp-theme': WORDPRESS_THEME_SERVICE,
  zenodo: ZENODO_SERVICE,
};

/**
 * List the public (non-owner-restricted) service presets in registry order.
 * @returns `[key, definition]` pairs of every service preset without an owner allowlist.
 */
export function listPublicServices(): [key: string, service: ServiceDefinition][] {
  const services: [key: string, service: ServiceDefinition][] = [];
  for (const [key, service] of Object.entries(SERVICES_CONFIG)) {
    if (!service.allowedOwners) {
      services.push([key, service]);
    }
  }
  return services;
}

/**
 * Derive the owner segment mode of a service preset route (used by the builder and the docs).
 * @param service   Service definition.
 * @returns `'none'` without an owner segment, otherwise `'required'` or `'optional'`.
 */
export function resolveServiceOwnerMode(service: ServiceDefinition): ServiceOwnerMode {
  const { owner } = service.route;
  if (!owner) {
    return 'none';
  }
  return owner.isRequired ? 'required' : 'optional';
}
