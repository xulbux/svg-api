/**
 * Site configuration – Public origin, fallback redirect destination, and default Worker environment bindings.
 *
 * Shared by the Worker router (`src/index.ts`), the route dispatcher (`src/routes/svg.ts`), the
 * upstream service fetcher (`src/services/`), and the documentation pages (`src/preview/`).
 */

import type { Env } from '@/types';

// -------------------------------------- PUBLIC API -------------------------------------

/** Public origin of the deployed Worker (docs previews, Markdown snippets, and canonical URLs). */
export const SITE_ORIGIN = 'https://svg.xul.is';

/** Fallback redirect destination for disabled docs pages and invalid or restricted service badges. */
export const FALLBACK_REDIRECT_URL = 'https://xul.is';

/** Default GitHub owner used when the `DEFAULT_GH_OWNER` binding is missing or empty. */
export const DEFAULT_GH_OWNER = 'xulbux';

/** Default environment bindings (bare `app.request()` calls and network-free docs previews). */
export const DEFAULT_ENV: Env = { DEFAULT_GH_OWNER };

/**
 * Resolve the effective default GitHub owner from environment bindings.
 * @param env   Worker environment bindings.
 * @returns `env.DEFAULT_GH_OWNER`, or `DEFAULT_GH_OWNER` when unset or empty.
 */
export function resolveDefaultGhOwner(env: Env): string {
  return env.DEFAULT_GH_OWNER || DEFAULT_GH_OWNER;
}
