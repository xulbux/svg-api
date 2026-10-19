/**
 * Go modules service preset – Latest module version from the Go module proxy (`/badge/go/:module/:metric`, e.g., `/badge/go/github.com/spf13/cobra/v`).
 *
 * Module paths span multiple path segments (`maxTargetSegments`); Every segment is validated
 * individually, and uppercase letters are escaped as `!` + lowercase for the proxy (Go module
 * proxy protocol case-encoding).
 */

import { createVersionTransform } from '@/services/metrics';
import type { MetricEndpoint, ServiceDefinition } from '@/types';

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

/** Escape a module path for the Go module proxy (`github.com/BurntSushi/toml` -> `github.com/!burnt!sushi/toml`). */
function escapeGoModulePath(modulePath: string): string {
  return modulePath.replace(UPPERCASE_LETTER_RX, (letter) => `!${letter.toLowerCase()}`);
}

/** Go module proxy `@latest` endpoint with pkg.go.dev redirect. */
const GO_PROXY_ENDPOINT: MetricEndpoint = {
  buildApiUrl: (_owner: string, modulePath: string): string =>
    `https://proxy.golang.org/${escapeGoModulePath(modulePath)}/@latest`,
  buildRedirectUrl: (_owner: string, modulePath: string): string =>
    `https://pkg.go.dev/${modulePath}`,
};

// -------------------------------------- PUBLIC API -------------------------------------

/** Go modules service preset (`go`). */
export const GO_SERVICE: ServiceDefinition = {
  docs: {
    description: 'Latest version of any Go module (the full module path spans several segments).',
    targetName: ':module',
    title: 'Go Modules',
  },
  maxTargetSegments: MAX_MODULE_PATH_SEGMENTS,
  metrics: {
    v: {
      ...GO_PROXY_ENDPOINT,
      defaultColor: 'cyan',
      defaultIcon: 'go',
      defaultLabel: 'go',
      transform: createVersionTransform<GoLatestPayload>((payload) => payload.Version),
    },
  },
  ownerMode: 'none',
};
