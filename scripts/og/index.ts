/**
 * OpenGraph image builder – Evaluates `renderOgImageSvg()` from `src/site/seo.ts` and writes `src/assets/og.png` when its digest changes.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { rasterizeOgSvgToPng } from './rasterizer.ts';
import type { LiveOgModule } from './types.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/** Absolute path of the repository root directory. */
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Output path of the generated OpenGraph raster card bundled by Wrangler. */
const OG_PNG_OUTPUT_PATH = path.resolve(REPO_ROOT, 'src', 'assets', 'og.png');

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches binary asset extensions loaded as `ArrayBuffer` modules in Worker builds. */
const BINARY_ASSET_RX = /\.(?:ttf|png)$/;

/** Matches text asset extensions loaded as raw string modules in Worker builds. */
const TEXT_ASSET_RX = /\.(?:css|client\.js)$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Bundle and evaluate `renderOgImageSvg()` from `src/site/seo.ts` via `esbuild` with externalized packages. */
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

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render `src/assets/og.png` directly from `renderOgImageSvg()`, skipping rasterization when its SHA-256 matches.
 */
export async function buildOgImagePng(): Promise<void> {
  const { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, renderOgImageSvg } = await evaluateLiveOgSvg();
  const svgMarkup = renderOgImageSvg();
  const sourceDigest = createHash('sha256').update(svgMarkup).digest('hex');
  const expectedMarker = Buffer.from(`Comment\0svg-sha256=${sourceDigest}`, 'ascii');

  try {
    const existingBuffer = await readFile(OG_PNG_OUTPUT_PATH);
    if (existingBuffer.includes(expectedMarker)) {
      return;
    }
  } catch {
    // `og.png` does not exist yet on a clean checkout.
  }

  const pngBuffer = rasterizeOgSvgToPng(svgMarkup, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, sourceDigest);
  await writeFile(OG_PNG_OUTPUT_PATH, pngBuffer);
}
