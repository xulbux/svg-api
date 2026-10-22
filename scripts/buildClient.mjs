/**
 * Client script bundler – Compiles modular browser TypeScript in `src/site/client/` into self-contained IIFE bundles in `src/site/client/bundles/*.client.js` for Wrangler text-module embedding.
 */

import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

// ---------------------------------------- CONSTS ---------------------------------------

/** Entry point to output path mappings for browser client bundles. */
const CLIENT_BUNDLES = [
  {
    entryPoint: 'src/site/client/site/index.ts',
    outfile: 'src/site/client/bundles/site.client.js',
  },
  {
    entryPoint: 'src/site/client/builder/index.ts',
    outfile: 'src/site/client/bundles/builder.client.js',
  },
];

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches `void 0` emitted by esbuild so readable `undefined` literals are preserved in the bundle. */
const VOID_ZERO_RX = /\bvoid 0\b/g;

// ----------------------------------------- MAIN ----------------------------------------

await Promise.all(
  CLIENT_BUNDLES.map(async (bundle) => {
    const result = await build({
      bundle: true,
      charset: 'utf8',
      entryPoints: [bundle.entryPoint],
      format: 'iife',
      legalComments: 'none',
      minify: false,
      outfile: bundle.outfile,
      platform: 'browser',
      target: 'es2023',
      tsconfig: 'tsconfig.client.json',
      write: false,
    });
    const [outputFile] = result.outputFiles;
    if (outputFile) {
      await writeFile(bundle.outfile, outputFile.text.replace(VOID_ZERO_RX, 'undefined'), 'utf8');
    }
  })
);
