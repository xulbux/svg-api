/**
 * Build-time Module Evaluator
 *
 * Bundles and evaluates Worker TypeScript entrypoints via temporary CJS `esbuild` outputs.
 */

import { mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

// ---------------------------------------- CONSTS ---------------------------------------

/** Absolute path of the repository root directory. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '..');

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches binary asset extensions loaded as `ArrayBuffer` modules in Worker builds. */
const BINARY_ASSET_RX = /\.(?:ttf|png)$/;

/** Matches text asset extensions loaded as raw string modules in Worker builds. */
const TEXT_ASSET_RX = /\.(?:css|client\.js|iconpack)$/;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Bundle `stdinContents` against `tsconfig.json` with Worker asset loaders, evaluate its CJS exports, and delete the temporary bundle.
 * @param bundlePrefix    Short file-name prefix for the temporary `.wrangler/<prefix>-<pid>.cjs` bundle.
 * @param stdinContents   TypeScript re-export snippet evaluated from `REPO_ROOT`.
 * @returns Evaluated module namespace cast to `TModule`.
 */
export async function evaluateWorkerTsModule<TModule>(
  bundlePrefix: string,
  stdinContents: string
): Promise<TModule> {
  const tempBundlePath = path.resolve(REPO_ROOT, '.wrangler', `${bundlePrefix}-${process.pid}.cjs`);
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
    stdin: { contents: stdinContents, loader: 'ts', resolveDir: REPO_ROOT },
    target: 'node26',
    tsconfig: path.resolve(REPO_ROOT, 'tsconfig.json'),
  });

  const requireModule = createRequire(import.meta.url);
  try {
    return requireModule(tempBundlePath) as TModule;
  } finally {
    if (requireModule.cache) {
      Reflect.deleteProperty(requireModule.cache, tempBundlePath);
    }
    await rm(tempBundlePath, { force: true });
  }
}
