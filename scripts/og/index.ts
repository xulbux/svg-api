/**
 * Brand & OpenGraph raster asset builder – Rebuilds the rasterized favicon and OpenGraph card when their source digests change.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { decodePngToRgba, ditherCanvasToRgba, encodeRgbaPng, resampleRgbaArea } from './png.ts';
import { rasterizeOgSvgToPng } from './rasterizer.ts';
import type { BrandSiteConfig, LiveOgModule } from './types.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/** Absolute path of the repository root directory. */
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Canonical single-source-of-truth RGBA brand icon path (`assets/icon.png`). */
const BRAND_ICON_PNG_PATH = path.resolve(REPO_ROOT, 'assets', 'icon.png');

/** Output path of the generated raster favicon bundled from gitignored `dist/client/`. */
const FAVICON_PNG_OUTPUT_PATH = path.resolve(REPO_ROOT, 'dist', 'client', 'favicon.png');

/** Output path of the generated OpenGraph raster card bundled from gitignored `dist/client/`. */
const OG_PNG_OUTPUT_PATH = path.resolve(REPO_ROOT, 'dist', 'client', 'og.png');

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches binary asset extensions loaded as `ArrayBuffer` modules in Worker builds. */
const BINARY_ASSET_RX = /\.(?:ttf|png)$/;

/** Matches text asset extensions loaded as raw string modules in Worker builds. */
const TEXT_ASSET_RX = /\.(?:css|client\.js)$/;

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

/** Bundle and evaluate `src/site/seo.ts` image exports via `esbuild` with externalized packages. */
async function evaluateLiveOgSvg(): Promise<LiveOgModule> {
  const tempBundlePath = path.resolve(REPO_ROOT, '.wrangler', `og-eval-${process.pid}.cjs`);
  await mkdir(path.dirname(tempBundlePath), { recursive: true });
  await build({
    bundle: true,
    format: 'cjs',
    outfile: tempBundlePath,
    packages: 'external',
    platform: 'node',
    plugins: [
      {
        name: 'worker-module-loaders',
        setup(buildContext) {
          buildContext.onLoad({ filter: BINARY_ASSET_RX }, (args) => ({
            contents: `const { readFileSync } = require('node:fs'); const raw = readFileSync(${JSON.stringify(args.path)}); module.exports = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);`,
            loader: 'js',
          }));
          buildContext.onLoad({ filter: TEXT_ASSET_RX }, async (args) => ({
            contents: await readFile(args.path, 'utf8'),
            loader: 'text',
          }));
        },
      },
    ],
    stdin: {
      contents:
        "export { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, renderOgImageSvg } from './src/site/seo.ts';",
      loader: 'ts',
      resolveDir: REPO_ROOT,
    },
    target: 'node26',
    tsconfig: path.resolve(REPO_ROOT, 'tsconfig.json'),
  });

  try {
    const requireModule = createRequire(import.meta.url);
    return requireModule(tempBundlePath) as LiveOgModule;
  } finally {
    await rm(tempBundlePath, { force: true });
  }
}

/** Downsample `assets/icon.png` into `dist/client/favicon.png` (`FAVICON_PNG_SIZE`) when its digest changes. */
async function buildFaviconPng(): Promise<void> {
  const rawIconBytes = await readFile(BRAND_ICON_PNG_PATH);
  const sourceDigest = createHash('sha256').update(rawIconBytes).digest('hex');
  if (await hasMatchingSourceDigest(FAVICON_PNG_OUTPUT_PATH, sourceDigest)) {
    return;
  }
  const siteConfigUrl = pathToFileURL(path.resolve(REPO_ROOT, 'src', 'config', 'site.ts')).href;
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
  await mkdir(path.dirname(FAVICON_PNG_OUTPUT_PATH), { recursive: true });
  await writeFile(FAVICON_PNG_OUTPUT_PATH, pngBuffer);
}

/** Render `dist/client/og.png` RGB social card directly from `renderOgImageSvg()` when its digest changes. */
async function buildOgCardPng(liveOg: LiveOgModule): Promise<void> {
  const svgMarkup = liveOg.renderOgImageSvg();
  const sourceDigest = createHash('sha256').update(svgMarkup).digest('hex');
  if (await hasMatchingSourceDigest(OG_PNG_OUTPUT_PATH, sourceDigest)) {
    return;
  }
  const pngBuffer = rasterizeOgSvgToPng(
    svgMarkup,
    liveOg.OG_IMAGE_WIDTH,
    liveOg.OG_IMAGE_HEIGHT,
    sourceDigest
  );
  await mkdir(path.dirname(OG_PNG_OUTPUT_PATH), { recursive: true });
  await writeFile(OG_PNG_OUTPUT_PATH, pngBuffer);
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Rebuild `dist/client/favicon.png` (from `assets/icon.png`) and `dist/client/og.png` (from `renderOgImageSvg()`) when their source digests change.
 */
export async function buildBrandRasterAssets(): Promise<void> {
  // Build `favicon.png` first so `@bundles/favicon.png` exists on fresh clones before evaluating `src/site/seo.ts`:
  await buildFaviconPng();
  const liveOg = await evaluateLiveOgSvg();
  await buildOgCardPng(liveOg);
}
