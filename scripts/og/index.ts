/**
 * Brand & OpenGraph Raster Asset Builder
 *
 * Rebuilds the rasterized favicon and OpenGraph card when their source digests change.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePngToRgba, ditherCanvasToRgba, encodeRgbaPng, resampleRgbaArea } from './png.ts';
import { rasterizeOgSvgToPng } from './rasterizer.ts';
import type { BrandSiteConfig, LiveOgModule } from './types.ts';

// -------------------------------------- INTERNALS --------------------------------------

/** Check whether an existing PNG file at `outputPath` already carries `sourceDigest` in its `tEXt` chunk. */
async function hasMatchingSourceDigest(outputPath: string, sourceDigest: string): Promise<boolean> {
  const expectedMarker = Buffer.from(`Comment\0src-sha256=${sourceDigest}`, 'ascii');
  try {
    const existingBuffer = await readFile(outputPath);
    return existingBuffer.includes(expectedMarker);
  } catch {
    return false;
  }
}

/** Downsample `assets/icon.png` into `dist/client/favicon.png` (`FAVICON_PNG_SIZE`) when its digest changes. */
async function buildFaviconPng(repoRoot: string): Promise<void> {
  const brandIconPngPath = path.resolve(repoRoot, 'assets', 'icon.png');
  const faviconPngOutputPath = path.resolve(repoRoot, 'dist', 'client', 'favicon.png');
  const rawIconBytes = await readFile(brandIconPngPath);
  const sourceDigest = createHash('sha256').update(rawIconBytes).digest('hex');
  if (await hasMatchingSourceDigest(faviconPngOutputPath, sourceDigest)) {
    return;
  }
  const siteConfigUrl = pathToFileURL(path.resolve(repoRoot, 'src', 'config', 'site.ts')).href;
  const { BRAND_ICON_PNG_SIZE, FAVICON_PNG_SIZE } = (await import(
    siteConfigUrl
  )) as BrandSiteConfig;
  const decodedIcon = decodePngToRgba(rawIconBytes);
  if (decodedIcon.width !== BRAND_ICON_PNG_SIZE || decodedIcon.height !== BRAND_ICON_PNG_SIZE) {
    throw new Error(
      `Expected assets/icon.png to be ${BRAND_ICON_PNG_SIZE}x${BRAND_ICON_PNG_SIZE}, got ${decodedIcon.width}x${decodedIcon.height}`
    );
  }
  const resampledCanvas = resampleRgbaArea(decodedIcon, FAVICON_PNG_SIZE, FAVICON_PNG_SIZE);
  const rgbaPixels = ditherCanvasToRgba(resampledCanvas, FAVICON_PNG_SIZE, FAVICON_PNG_SIZE);
  const pngBuffer = encodeRgbaPng(FAVICON_PNG_SIZE, FAVICON_PNG_SIZE, rgbaPixels, sourceDigest);
  await mkdir(path.dirname(faviconPngOutputPath), { recursive: true });
  await writeFile(faviconPngOutputPath, pngBuffer);
}

/** Render `dist/client/og.png` RGB social card directly from `renderOgImageSvg()` when its digest changes. */
async function buildOgCardPng(repoRoot: string, liveOg: LiveOgModule): Promise<void> {
  const ogPngOutputPath = path.resolve(repoRoot, 'dist', 'client', 'og.png');
  const svgMarkup = liveOg.renderOgImageSvg();
  const sourceDigest = createHash('sha256').update(svgMarkup).digest('hex');
  if (await hasMatchingSourceDigest(ogPngOutputPath, sourceDigest)) {
    return;
  }
  const pngBuffer = rasterizeOgSvgToPng(
    svgMarkup,
    liveOg.OG_IMAGE_WIDTH,
    liveOg.OG_IMAGE_HEIGHT,
    sourceDigest
  );
  await mkdir(path.dirname(ogPngOutputPath), { recursive: true });
  await writeFile(ogPngOutputPath, pngBuffer);
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Rebuild `dist/client/favicon.png` (from `assets/icon.png`) and `dist/client/og.png` (from `renderOgImageSvg()`) when their source digests change.
 * @param repoRoot            Absolute repository root directory.
 * @param evaluateLiveOgSvg   Loader returning the evaluated `src/site/seo.ts` OpenGraph exports.
 */
export async function buildBrandRasterAssets(
  repoRoot: string,
  evaluateLiveOgSvg: () => Promise<LiveOgModule>
): Promise<void> {
  // Build `favicon.png` first so `@bundles/favicon.png` exists on fresh clones before evaluating `src/site/seo.ts`:
  await buildFaviconPng(repoRoot);
  const liveOg = await evaluateLiveOgSvg();
  await buildOgCardPng(repoRoot, liveOg);
}
