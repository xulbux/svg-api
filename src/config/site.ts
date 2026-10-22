/**
 * Site configuration – Public origin, fallback redirect destination, and default Worker environment bindings.
 *
 * Shared by the Worker router (`src/index.ts`), the route dispatcher (`src/routes/svg.ts`), the
 * upstream service fetcher (`src/services/`), and the documentation pages (`src/site/`).
 */

import type { Env } from '@/types';

// -------------------------------------- PUBLIC API -------------------------------------

/** Public origin of the deployed Worker (docs previews, Markdown snippets, and canonical URLs). */
export const SITE_ORIGIN = 'https://svg.xul.is';

/** Public host name of the deployed Worker (e.g., the label of `restricted` badges). */
export const SITE_HOST = SITE_ORIGIN.slice(SITE_ORIGIN.indexOf('//') + 2);

/** Fallback redirect destination for disabled docs pages and invalid or restricted service badges. */
export const FALLBACK_REDIRECT_URL = 'https://xul.is';

/**
 * Default environment bindings (bare `app.request()` calls and network-free docs previews); No
 * `DEFAULT_GH_OWNER`, so the restricted `gh` preset allows no owner unless the binding is set.
 */
export const DEFAULT_ENV: Env = {};

/**
 * Resolve the configured GitHub owner of the restricted `gh` preset from environment bindings.
 * @param env   Worker environment bindings.
 * @returns `env.DEFAULT_GH_OWNER`, or `undefined` when the binding is unset or empty.
 */
export function resolveDefaultGhOwner(env: Env): string | undefined {
  return env.DEFAULT_GH_OWNER || undefined;
}
