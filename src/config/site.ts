/**
 * Site configuration – Public host, origin, repository and author metadata, fallback redirect destination, and default Worker bindings.
 */

import type { Env } from '@/types';

// -------------------------------------- PUBLIC API -------------------------------------

/** Official display name of the service and documentation site. */
export const SITE_NAME = 'SVG API';

/** Canonical project description shared across `package.json`, `README.md`, and site metadata. */
export const SITE_DESCRIPTION =
  'High-performance, zero-cold-start dynamic SVG engine on Cloudflare Workers.';

/** Public hostname of the deployed Worker. */
export const SITE_HOST = 'svg.xul.is';

/** Public origin of the deployed Worker. */
export const SITE_ORIGIN = `https://${SITE_HOST}`;

/** Canonical `User-Agent` header sent on outbound upstream service requests. */
export const SERVICE_USER_AGENT = `svg-api/1.0.0 (${SITE_ORIGIN})`;

/** Author display name for site credits and structured metadata. */
export const AUTHOR_NAME = 'XulbuX';

/** Author primary website URL. */
export const AUTHOR_WEBSITE_URL = 'https://xulbux.com';

/** Public GitHub repository URL. */
export const REPO_GITHUB_URL = 'https://github.com/xulbux/svg-api';

/** Fallback redirect destination for invalid service badge routes. */
export const FALLBACK_REDIRECT_URL = AUTHOR_WEBSITE_URL;

/** Required square pixel dimension of the canonical `assets/icon.png` brand icon. */
export const BRAND_ICON_PNG_SIZE = 512;

/** Square pixel dimension of the raster `/favicon.png` (sized for search engines and touch icons). */
export const FAVICON_PNG_SIZE = 192;

/** Default environment bindings (bare `app.request()` calls and network-free docs previews). */
export const DEFAULT_ENV: Env = {};
