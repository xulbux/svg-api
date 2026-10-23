/**
 * Client & asset builder – Compiles modular browser TypeScript in `src/site/client/` into self-contained IIFE bundles in `dist/client/*.client.js` and rasterizes `src/assets/og.png` from `renderOgImageSvg()`.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, stop } from 'esbuild';
import { format } from 'oxfmt';
import type { FormatConfig } from 'oxfmt';
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

/** Config keys valid in `.oxfmtrc.json` that are file-discovery-only and excluded from `FormatConfig`. */
const DISCOVERY_ONLY_CONFIG_KEYS: ReadonlySet<string> = new Set([
  '$schema',
  'associations',
  'ignorePatterns',
  'overrides',
]);

/** Entry point to output path mappings for browser client bundles. */
const CLIENT_BUNDLES: readonly ClientBundleSpec[] = [
  { entryPoint: 'src/site/client/site/index.ts', outfile: `${CLIENT_BUNDLE_DIR}/site.client.js` },
  {
    entryPoint: 'src/site/client/builder/index.ts',
    outfile: `${CLIENT_BUNDLE_DIR}/builder.client.js`,
  },
];

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches `void 0` emitted by esbuild so readable `undefined` literals are preserved in the bundle. */
const VOID_ZERO_RX = /\bvoid 0\b/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Read `.oxfmtrc.json` and omit file-discovery keys so `format()` receives a pure `FormatConfig`. */
async function loadFormatConfig(): Promise<FormatConfig> {
  const rawConfig = JSON.parse(
    await readFile(path.resolve(REPO_ROOT, '.oxfmtrc.json'), 'utf8')
  ) as Record<string, unknown>;
  const filteredConfig: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawConfig)) {
    if (!DISCOVERY_ONLY_CONFIG_KEYS.has(key)) {
      filteredConfig[key] = value;
    }
  }
  return filteredConfig as FormatConfig;
}

// ----------------------------------------- MAIN ----------------------------------------

const [, formatConfig] = await Promise.all([
  mkdir(path.resolve(REPO_ROOT, CLIENT_BUNDLE_DIR), { recursive: true }),
  loadFormatConfig(),
]);

await Promise.all(
  CLIENT_BUNDLES.map(async (bundle) => {
    const result = await build({
      absWorkingDir: REPO_ROOT,
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
      const normalized = outputFile.text.replace(VOID_ZERO_RX, 'undefined');
      const formatted = await format(bundle.outfile, normalized, formatConfig);
      await writeFile(path.resolve(REPO_ROOT, bundle.outfile), formatted.code, 'utf8');
    }
  })
);

await buildOgImagePng();
await stop();
