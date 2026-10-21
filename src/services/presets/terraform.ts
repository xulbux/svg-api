/**
 * Terraform Registry service presets – Module downloads and latest version (`/badge/terraform/:namespace/:name/:provider/:metric`) and provider downloads and latest version (`/badge/tf-provider/:namespace/:type/:metric`).
 */

import { createEndpoint, defineService, isJsonObject } from '@/services/endpoint';
import {
  DELTA_SPECIALS,
  SERIES_DELTA_SPECIALS,
  buildSeriesSpecials,
  buildWindowDeltaSpecials,
  createDownloadsMetric,
  createVersionMetric,
  readFiniteNumber,
  readText,
} from '@/services/metrics';
import type { MetricPresentation, ServiceDefinition } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Included provider version entry with publication timestamp and download count. */
interface TerraformVersionEntry {
  /** Version download count. */
  downloads: number;
  /** ISO 8601 publication timestamp (empty when omitted). */
  publishedAt: string;
}

/** Projected Terraform Registry JSON:API resource (downloads, windowed counts, and version attributes). */
interface TerraformResourceProjection {
  /** All-time downloads (`data.attributes.downloads` or `data.attributes.total`). */
  downloads?: number;
  /** Last-month downloads (`data.attributes.month` on module download summaries). */
  month?: number;
  /** Version (`data.attributes.version`, or the included latest module version). */
  version?: string;
  /** Per-version download counts across the most recent 12 provider releases. */
  versionDownloads?: number[];
  /** Last-year downloads (`data.attributes.year` on module download summaries). */
  year?: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Number of path segments of a module address (`:namespace/:name/:provider`). */
const MODULE_ADDRESS_SEGMENTS = 3;

/** Shared presentation of the Terraform version badges. */
const TERRAFORM_VERSION: MetricPresentation = {
  defaultColor: 'violet',
  defaultIcon: 'terraform',
  defaultLabel: 'terraform',
};

// -------------------------------------- INTERNALS --------------------------------------

/** Read the `attributes` object of a JSON:API resource. */
function readAttributes(resource: unknown): Record<string, unknown> | undefined {
  return isJsonObject(resource) && isJsonObject(resource.attributes)
    ? resource.attributes
    : undefined;
}

/** Read the first `version` attribute of the JSON:API `included` resources (`?include=latest-version`). */
function readIncludedVersion(included: unknown): unknown {
  return Array.isArray(included) ? readAttributes(included[0])?.version : undefined;
}

/** Read the last 12 per-version download counts from JSON:API `included` version resources (`?include=provider-versions`). */
function readIncludedVersionDownloads(included: unknown): number[] | undefined {
  if (!Array.isArray(included) || included.length < 2) {
    return undefined;
  }
  const entries: TerraformVersionEntry[] = [];
  for (const item of included) {
    const attributes = readAttributes(item);
    const downloads = readFiniteNumber(attributes?.downloads);
    if (downloads !== undefined) {
      entries.push({ downloads, publishedAt: readText(attributes?.['published-at']) ?? '' });
    }
  }
  if (entries.length < 2) {
    return undefined;
  }
  entries.sort((first, second) =>
    first.publishedAt && second.publishedAt
      ? first.publishedAt.localeCompare(second.publishedAt)
      : 0
  );
  const recentDownloads: number[] = [];
  for (const entry of entries.slice(-12)) {
    recentDownloads.push(entry.downloads);
  }
  return recentDownloads;
}

/** Project a Terraform Registry JSON:API document into its downloads, summary windows, and version attributes. */
function projectTerraformResource(data: unknown): TerraformResourceProjection | undefined {
  const attributes = isJsonObject(data) ? readAttributes(data.data) : undefined;
  if (!isJsonObject(data) || !attributes) {
    return undefined;
  }
  const version = attributes.version ?? readIncludedVersion(data.included);
  return {
    downloads: readFiniteNumber(attributes.downloads) ?? readFiniteNumber(attributes.total),
    month: readFiniteNumber(attributes.month),
    version: typeof version === 'string' ? version : undefined,
    versionDownloads: readIncludedVersionDownloads(data.included),
    year: readFiniteNumber(attributes.year),
  };
}

/** Create the Terraform module service preset. */
function createModuleService(): ServiceDefinition {
  const moduleEndpoint = createEndpoint({
    api: 'https://registry.terraform.io/v2/modules/{target}?include=latest-version',
    page: 'https://registry.terraform.io/modules/{target}',
    project: projectTerraformResource,
  });
  const moduleDownloadsEndpoint = createEndpoint({
    api: 'https://registry.terraform.io/v2/modules/{target}/downloads/summary',
    page: 'https://registry.terraform.io/modules/{target}',
    project: projectTerraformResource,
  });
  return defineService({
    docs: {
      description: 'Module all-time downloads and latest version (:namespace/:name/:provider).',
      title: 'Terraform Modules',
    },
    metricAliases: { dl: 'dt' },
    metrics: {
      dt: createDownloadsMetric(
        moduleDownloadsEndpoint,
        'dt',
        (resource) => resource.downloads,
        { autoSpecials: DELTA_SPECIALS },
        (resource) => buildWindowDeltaSpecials(resource.month, 30, resource.year, 365)
      ),
      v: createVersionMetric(moduleEndpoint, TERRAFORM_VERSION, (resource) => resource.version),
    },
    route: {
      target: {
        maxSegments: MODULE_ADDRESS_SEGMENTS,
        minSegments: MODULE_ADDRESS_SEGMENTS,
        placeholder: ':namespace/:name/:provider',
      },
    },
  });
}

/** Create the Terraform provider service preset. */
function createProviderService(): ServiceDefinition {
  const providerEndpoint = createEndpoint({
    api: 'https://registry.terraform.io/v2/providers/{owner}/{target}?include=provider-versions',
    page: 'https://registry.terraform.io/providers/{owner}/{target}/latest',
    project: projectTerraformResource,
  });
  const latestVersionEndpoint = createEndpoint({
    api: 'https://registry.terraform.io/v2/providers/{owner}/{target}/provider-versions/latest',
    page: 'https://registry.terraform.io/providers/{owner}/{target}/latest',
    project: projectTerraformResource,
  });
  return defineService({
    docs: {
      description: 'Provider all-time downloads and latest version.',
      title: 'Terraform Providers',
    },
    metricAliases: { dl: 'dt' },
    metrics: {
      dt: createDownloadsMetric(
        providerEndpoint,
        'dt',
        (resource) => resource.downloads,
        { autoSpecials: SERIES_DELTA_SPECIALS },
        (resource) =>
          buildSeriesSpecials({
            barsValues: resource.versionDownloads,
            current: resource.versionDownloads?.at(-1),
            previous:
              resource.versionDownloads && resource.versionDownloads.length >= 2
                ? resource.versionDownloads.at(-2)
                : undefined,
            sparklineValues: resource.versionDownloads,
          })
      ),
      v: createVersionMetric(
        latestVersionEndpoint,
        { ...TERRAFORM_VERSION, defaultLabel: 'terraform provider' },
        (resource) => resource.version
      ),
    },
    route: {
      owner: { isRequired: true, placeholder: ':namespace' },
      target: { placeholder: ':type' },
    },
  });
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Terraform Registry module service preset (`terraform`). */
export const TERRAFORM_MODULE_SERVICE: ServiceDefinition = createModuleService();

/** Terraform Registry provider service preset (`tf-provider`). */
export const TERRAFORM_PROVIDER_SERVICE: ServiceDefinition = createProviderService();
