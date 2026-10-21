/**
 * Static website assets – Versioned stylesheet, browser scripts, bundled fonts, and icon picker data served at `/assets/:name` with immutable caching.
 *
 * Each stylesheet and script is built once per isolate, and its content hash is appended to its URL
 * (`?v=<hash>`), so pages always reference the deployed version and browsers can cache it forever.
 * Icon picker pages are built on demand (never kept in memory) and share the version of the icon index.
 */

import geistBoldBuffer from '@/assets/fonts/Geist-Bold.ttf';
import geistMediumBuffer from '@/assets/fonts/Geist-Medium.ttf';
import geistRegularBuffer from '@/assets/fonts/Geist-Regular.ttf';
import geistSemiBoldBuffer from '@/assets/fonts/Geist-SemiBold.ttf';
import geistSemiBoldItalicBuffer from '@/assets/fonts/Geist-SemiBoldItalic.ttf';
import jetBrainsMonoBoldBuffer from '@/assets/fonts/JetBrainsMono-Bold.ttf';
import jetBrainsMonoBoldItalicBuffer from '@/assets/fonts/JetBrainsMono-BoldItalic.ttf';
import jetBrainsMonoItalicBuffer from '@/assets/fonts/JetBrainsMono-Italic.ttf';
import jetBrainsMonoRegularBuffer from '@/assets/fonts/JetBrainsMono-Regular.ttf';
import builderScript from '@/preview/scripts/builder.client.js';
import siteScript from '@/preview/scripts/site.client.js';
import { getSiteStylesheet } from '@/preview/styles';
import { getIconPickerIndex, getIconPickerPage } from '@/svg/icons';
import { getOwnValue, hashText } from '@/svg/shared';
import type { IconPickerSetId, SiteAsset, SiteAssetName, SiteFontName } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Source of a static website asset. */
interface SiteAssetSource {
  /** `Content-Type` header value. */
  contentType: string;
  /** Builds the asset body (called at most once per isolate). */
  render: () => string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** `Content-Type` of TrueType font assets. */
const FONT_CONTENT_TYPE = 'font/ttf';

/** `Content-Type` of JavaScript assets. */
const JAVASCRIPT_CONTENT_TYPE = 'text/javascript; charset=utf-8';

/** `Content-Type` of JSON assets. */
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

/** Static website assets keyed by their public file name, sorted alphabetically. */
const SITE_ASSET_SOURCES: Readonly<Record<SiteAssetName, SiteAssetSource>> = {
  'builder.js': { contentType: JAVASCRIPT_CONTENT_TYPE, render: () => builderScript },
  'icons.json': {
    contentType: JSON_CONTENT_TYPE,
    render: () => JSON.stringify(getIconPickerIndex()),
  },
  'site.css': { contentType: 'text/css; charset=utf-8', render: getSiteStylesheet },
  'site.js': { contentType: JAVASCRIPT_CONTENT_TYPE, render: () => siteScript },
};

/** Bundled website font binaries keyed by their public file name, sorted alphabetically. */
const SITE_FONT_BUFFERS: Readonly<Record<SiteFontName, ArrayBuffer>> = {
  'Geist-Bold.ttf': geistBoldBuffer,
  'Geist-Medium.ttf': geistMediumBuffer,
  'Geist-Regular.ttf': geistRegularBuffer,
  'Geist-SemiBold.ttf': geistSemiBoldBuffer,
  'Geist-SemiBoldItalic.ttf': geistSemiBoldItalicBuffer,
  'JetBrainsMono-Bold.ttf': jetBrainsMonoBoldBuffer,
  'JetBrainsMono-BoldItalic.ttf': jetBrainsMonoBoldItalicBuffer,
  'JetBrainsMono-Italic.ttf': jetBrainsMonoItalicBuffer,
  'JetBrainsMono-Regular.ttf': jetBrainsMonoRegularBuffer,
};

/** Memoized built assets (bounded by the fixed set of asset names). */
const SITE_ASSET_CACHE = new Map<SiteAssetName, SiteAsset>();

/** Memoized built font assets (bounded by the fixed set of font file names). */
const SITE_FONT_CACHE = new Map<SiteFontName, SiteAsset<ArrayBuffer>>();

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches icon picker page file names (`icons-lucide-0.json`, `icons-brands-12.json`). */
const ICON_PAGE_NAME_RX = /^icons-(?<set>brands|lucide)-(?<page>\d{1,3})\.json$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Build (once per isolate) a static website asset with its content version. */
function buildSiteAsset(name: SiteAssetName): SiteAsset {
  let asset = SITE_ASSET_CACHE.get(name);
  if (!asset) {
    const source = SITE_ASSET_SOURCES[name];
    const body = source.render();
    asset = { body, contentType: source.contentType, version: hashText(body) };
    SITE_ASSET_CACHE.set(name, asset);
  }
  return asset;
}

/** Build (once per isolate) a static website font asset with its byte-length version. */
function buildFontAsset(name: SiteFontName): SiteAsset<ArrayBuffer> {
  let asset = SITE_FONT_CACHE.get(name);
  if (!asset) {
    const body = SITE_FONT_BUFFERS[name];
    asset = { body, contentType: FONT_CONTENT_TYPE, version: body.byteLength.toString(36) };
    SITE_FONT_CACHE.set(name, asset);
  }
  return asset;
}

/** Build an icon picker body page asset on demand (versioned with the icon index). */
function buildIconPageAsset(setId: IconPickerSetId, page: number): SiteAsset | undefined {
  const bodies = getIconPickerPage(setId, page);
  return bodies
    ? {
        body: JSON.stringify(bodies),
        contentType: JSON_CONTENT_TYPE,
        version: buildSiteAsset('icons.json').version,
      }
    : undefined;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Resolve a website asset by its public file name.
 * @param name   Raw file name after `/assets/` (e.g., `'site.css'`, `'Geist-Regular.ttf'`, `'icons-lucide-0.json'`).
 * @returns The built asset, or `undefined` for unknown names and out-of-range icon pages.
 */
export function getSiteAsset(name: SiteAssetName): SiteAsset;
export function getSiteAsset(name: SiteFontName): SiteAsset<ArrayBuffer>;
export function getSiteAsset(
  name: `icons-${IconPickerSetId}-${number}.json`
): SiteAsset | undefined;
export function getSiteAsset(name: string): SiteAsset<ArrayBuffer | string> | undefined;
export function getSiteAsset(name: string): SiteAsset<ArrayBuffer | string> | undefined {
  if (getOwnValue(SITE_ASSET_SOURCES, name)) {
    return buildSiteAsset(name as SiteAssetName);
  }
  if (getOwnValue(SITE_FONT_BUFFERS, name)) {
    return buildFontAsset(name as SiteFontName);
  }
  const pageMatch = ICON_PAGE_NAME_RX.exec(name);
  if (!pageMatch?.groups) {
    return undefined;
  }
  return buildIconPageAsset(
    pageMatch.groups.set === 'lucide' ? 'lucide' : 'brands',
    Number(pageMatch.groups.page)
  );
}

/**
 * Build the versioned URL of a static website asset.
 * @param name   Asset file name.
 * @returns Root-relative URL with a content hash (e.g., `'/assets/site.css?v=1x2k9f'`).
 */
export function getSiteAssetUrl(name: SiteAssetName): string {
  return `/assets/${name}?v=${buildSiteAsset(name).version}`;
}
