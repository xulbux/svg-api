/**
 * Site configuration – Public host, origin, repository and author metadata, fallback redirect destination, and default Worker bindings.
 */

import type { Env } from '@/types';

// -------------------------------------- PUBLIC API -------------------------------------

/** Official display name of the service and documentation site. */
export const SITE_NAME = 'SVG API';

/** Public hostname of the deployed Worker. */
export const SITE_HOST = 'svg.xul.is';

/** Public origin of the deployed Worker. */
export const SITE_ORIGIN = `https://${SITE_HOST}`;

/** Author display name for site credits and structured metadata. */
export const AUTHOR_NAME = 'XulbuX';

/** Author GitHub profile URL. */
export const AUTHOR_GITHUB_URL = 'https://github.com/xulbux';

/** Public GitHub repository URL. */
export const REPO_GITHUB_URL = `${AUTHOR_GITHUB_URL}/svg-api`;

/** Fallback redirect destination for invalid service badge routes. */
export const FALLBACK_REDIRECT_URL = 'https://xul.is';

/** Required square pixel dimension of the canonical `assets/icon.png` brand icon. */
export const BRAND_ICON_PNG_SIZE = 512;

/** Square pixel dimension of the raster `/favicon.png` (`48px` multiple for Google Search and Apple touch icons). */
export const FAVICON_PNG_SIZE = 192;

/** Default environment bindings (bare `app.request()` calls and network-free docs previews). */
export const DEFAULT_ENV: Env = {};
