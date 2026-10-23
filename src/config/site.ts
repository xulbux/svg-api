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

/** Fallback redirect destination for invalid service badge routes. */
export const FALLBACK_REDIRECT_URL = 'https://xul.is';

/** Default environment bindings (bare `app.request()` calls and network-free docs previews). */
export const DEFAULT_ENV: Env = {};
