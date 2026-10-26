/**
 * Client & asset builder – Compiles modular browser TypeScript in `src/site/client/` into self-contained IIFE bundles in `dist/client/*.client.js` and rasterizes `dist/client/favicon.png` + `src/assets/og.png` from `assets/icon.svg` and `renderOgImageSvg()`.
 */

import path from 'node:path';
import { build, stop } from 'esbuild';
import { buildBrandRasterAssets } from './og/index.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/** Absolute path of the repository root directory. */
const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** Output directory for generated browser client bundles and rasterized brand favicon (gitignored). */
const CLIENT_BUNDLE_DIR = 'dist/client';

// ----------------------------------------- MAIN ----------------------------------------

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

await buildBrandRasterAssets();
await stop();
