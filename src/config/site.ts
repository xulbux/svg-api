/**
 * Site configuration – Public host, origin, author metadata, fallback redirect destination, and default Worker bindings.
 */

import type { Env } from '@/types';

// -------------------------------------- PUBLIC API -------------------------------------

/** Public hostname of the deployed Worker. */
export const SITE_HOST = 'svg.xul.is';

/** Public origin of the deployed Worker (docs previews, Markdown snippets, and canonical URLs). */
export const SITE_ORIGIN = `https://${SITE_HOST}`;

/** Author display name for site credits and structured metadata. */
export const AUTHOR_NAME = 'XulbuX';

/** Author GitHub profile URL for header, footer, and structured metadata links. */
export const AUTHOR_GITHUB_URL = 'https://github.com/xulbux';

/** Public feedback email address linked in the site footer. */
export const CONTACT_EMAIL = 'hi@xul.is';

/** Fallback redirect destination for invalid service badge routes. */
export const FALLBACK_REDIRECT_URL = 'https://xul.is';

/** Default environment bindings (bare `app.request()` calls and network-free docs previews). */
export const DEFAULT_ENV: Env = {};
