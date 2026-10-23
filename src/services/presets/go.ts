/**
 * Go modules service preset – Live upstream metrics and redirect transformations.
 *
 * Module paths span multiple path segments (`route.target.maxSegments`); Every segment is validated
 * individually, and uppercase letters are escaped as `!` + lowercase for the proxy (Go module
 * proxy protocol case-encoding).
 */

import { createEndpoint, defineService, pickFields } from '@/services/endpoint';
import { createVersionMetric } from '@/services/metrics';
import type { ServiceRouteParams } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Partial Go module proxy `@latest` payload (`proxy.golang.org/:module/@latest`). */
interface GoLatestPayload {
  /** Latest module version (e.g., `'v1.10.2'`). */
  Version: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Maximum number of module path segments (e.g., `github.com/aws/aws-sdk-go-v2/service/s3` has 5). */
const MAX_MODULE_PATH_SEGMENTS = 8;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches an uppercase ASCII letter (escaped as `!` + lowercase by the module proxy protocol). */
const UPPERCASE_LETTER_RX = /[A-Z]/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Escape an uppercase letter for the module proxy (`B` -> `!b`). */
function escapeUppercaseLetter(letter: string): string {
  return `!${letter.toLowerCase()}`;
}

/**
 * Build the Go module proxy `@latest` URL, escaping uppercase letters
 * (`github.com/BurntSushi/toml` -> `github.com/!burnt!sushi/toml`) and encoding every segment.
 */
function buildGoProxyUrl({ target }: ServiceRouteParams): string {
  let escapedPath = '';
  for (const segment of target.split('/')) {
    escapedPath += `${encodeURIComponent(segment.replace(UPPERCASE_LETTER_RX, escapeUppercaseLetter))}/`;
  }
  return `https://proxy.golang.org/${escapedPath}@latest`;
}

/** Go module proxy `@latest` endpoint with pkg.go.dev module page redirect. */
const PROXY_ENDPOINT = createEndpoint({
  api: buildGoProxyUrl,
  page: 'https://pkg.go.dev/{target}',
  project: pickFields<GoLatestPayload>(['Version']),
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Go modules service preset (`go`). */
export const GO_SERVICE = defineService({
  docs: {
    description: 'Latest version of any Go module (the full module path spans several segments).',
    title: 'Go Modules',
  },
  metrics: {
    v: createVersionMetric(
      PROXY_ENDPOINT,
      { defaultColor: 'cyan', defaultIcon: 'go', defaultLabel: 'Go' },
      (latest) => latest.Version
    ),
  },
  route: { target: { maxSegments: MAX_MODULE_PATH_SEGMENTS, placeholder: ':module' } },
});
