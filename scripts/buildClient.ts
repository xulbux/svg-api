/**
 * Client & asset builder – Compiles modular browser TypeScript in `src/site/client/` into self-contained IIFE bundles in `dist/client/*.client.js` and rasterizes `src/assets/og.png` from `renderOgImageSvg()`.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, stop } from 'esbuild';
import { buildOgImagePng } from './og/index.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** Entry point to output path mapping for a compiled browser client bundle. */
interface ClientBundleSpec {
  /** Browser TypeScript entry module relative to the repository root. */
  entryPoint: string;
  /** Generated IIFE bundle path relative to the repository root. */
  outfile: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Absolute path of the repository root directory. */
const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** Output directory for generated browser client bundles (gitignored). */
const CLIENT_BUNDLE_DIR = 'dist/client';

/** Entry point to output path mappings for browser client bundles. */
const CLIENT_BUNDLES: readonly ClientBundleSpec[] = [
  { entryPoint: 'src/site/client/site/index.ts', outfile: `${CLIENT_BUNDLE_DIR}/site.client.js` },
  {
    entryPoint: 'src/site/client/builder/index.ts',
    outfile: `${CLIENT_BUNDLE_DIR}/builder.client.js`,
  },
];

// ----------------------------------------- MAIN ----------------------------------------

await mkdir(path.resolve(REPO_ROOT, CLIENT_BUNDLE_DIR), { recursive: true });

await Promise.all(
  CLIENT_BUNDLES.map(async (bundle) => {
    const result = await build({
      absWorkingDir: REPO_ROOT,
      bundle: true,
      charset: 'utf8',
      entryPoints: [bundle.entryPoint],
      format: 'iife',
      legalComments: 'none',
      minify: true,
      outfile: bundle.outfile,
      platform: 'browser',
      target: 'es2023',
      tsconfig: 'tsconfig.client.json',
      write: false,
    });
    const [outputFile] = result.outputFiles;
    if (outputFile) {
      await writeFile(path.resolve(REPO_ROOT, bundle.outfile), outputFile.text, 'utf8');
    }
  })
);

await buildOgImagePng();
await stop();
