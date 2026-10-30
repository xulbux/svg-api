/**
 * Client & Asset Builder
 *
 * Pre-packs icon datasets, bundles browser TypeScript entrypoints, minifies `/assets/site.css`, and rebuilds rasterized brand/OpenGraph PNG assets.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, stop, transform } from 'esbuild';
import { buildPackedIconAssets } from './buildIcons.ts';
import { evaluateWorkerTsModule, REPO_ROOT } from './evalModule.ts';
import { buildBrandRasterAssets } from './og/index.ts';
import type { LiveOgModule } from './og/types.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** Evaluated exports of `src/site/styles/index.ts` used to emit `dist/client/site.client.css`. */
interface EvaluatedStylesModule {
  /** Build the composite website stylesheet source. */
  getSiteStylesheet: () => string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Output directory for generated browser client bundles, minified CSS, and rasterized brand/OpenGraph PNGs (gitignored). */
const CLIENT_BUNDLE_DIR = 'dist/client';

/** Output path of the minified composite website stylesheet bundled into the Worker. */
const CLIENT_CSS_OUTPUT_PATH = path.resolve(REPO_ROOT, CLIENT_BUNDLE_DIR, 'site.client.css');

// -------------------------------------- INTERNALS --------------------------------------

/** Evaluate `getSiteStylesheet()` from `src/site/styles/index.ts` and write minified `dist/client/site.client.css`. */
async function buildMinifiedSiteStylesheet(): Promise<void> {
  const stylesModule = await evaluateWorkerTsModule<EvaluatedStylesModule>(
    'css-eval',
    "export { getSiteStylesheet } from './src/site/styles/index.ts';"
  );
  const rawCss = stylesModule.getSiteStylesheet();
  const minified = await transform(rawCss, { loader: 'css', minify: true });
  await mkdir(path.dirname(CLIENT_CSS_OUTPUT_PATH), { recursive: true });
  await writeFile(CLIENT_CSS_OUTPUT_PATH, minified.code, 'utf8');
}

// ----------------------------------------- MAIN ----------------------------------------

await buildPackedIconAssets(REPO_ROOT);

await build({
  absWorkingDir: REPO_ROOT,
  bundle: true,
  charset: 'utf8',
  entryPoints: {
    'builder.client': 'src/site/client/builder/index.ts',
    'site.client': 'src/site/client/site/index.ts',
  },
  format: 'iife',
  legalComments: 'none',
  minify: true,
  outdir: CLIENT_BUNDLE_DIR,
  platform: 'browser',
  target: 'es2023',
  tsconfig: 'tsconfig.client.json',
});

await buildMinifiedSiteStylesheet();
await buildBrandRasterAssets(REPO_ROOT, () =>
  evaluateWorkerTsModule<LiveOgModule>(
    'og-eval',
    "export { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, renderOgImageSvg } from './src/site/seo.ts';"
  )
);
await stop();
