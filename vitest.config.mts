/**
 * Vitest configuration – Mirrors the Wrangler module rules (`.ttf` and `.png` binaries as `ArrayBuffer`, `*.css` and `*.client.js` as text) and the `@/` path alias for the test suite.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// ---------------------------------------- CONSTS ---------------------------------------

/** Virtual module ID prefix of text-imported website stylesheets and browser scripts. */
const TEXT_MODULE_PREFIX = '\0text:';

/** Virtual module ID suffix (keeps Vite's CSS pipeline away from text-imported `.css` files). */
const TEXT_MODULE_SUFFIX = '.text-module';

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches module IDs bundled as plain text by Wrangler (`rules` in `wrangler.jsonc`). */
const TEXT_MODULE_RX = /\.(?:css|client\.js)$/;

// ----------------------------------------- MAIN ----------------------------------------

export default defineConfig({
  plugins: [
    {
      // Mirror Wrangler's `Data` module rule; `*.ttf` and `*.png` imports default-export an `ArrayBuffer`.
      // The generated module reads the file itself instead of inlining (and re-parsing) a base64 copy:
      enforce: 'pre',
      load(id) {
        if (!id.endsWith('.ttf') && !id.endsWith('.png')) {
          return undefined;
        }
        this.addWatchFile(id);
        return [
          "import { readFileSync } from 'node:fs';",
          `const bytes = readFileSync(${JSON.stringify(id)});`,
          'export default bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);',
        ].join('\n');
      },
      name: 'ttf-arraybuffer',
    },
    {
      // Mirror Wrangler's `Text` module rule; `*.css` and `*.client.js` imports default-export their raw source:
      enforce: 'pre',
      load(id) {
        if (!id.startsWith(TEXT_MODULE_PREFIX)) {
          return undefined;
        }
        const filePath = id.slice(TEXT_MODULE_PREFIX.length, -TEXT_MODULE_SUFFIX.length);
        this.addWatchFile(filePath);
        return `export default ${JSON.stringify(readFileSync(filePath, 'utf8'))};`;
      },
      name: 'text-modules',
      async resolveId(source, importer) {
        if (!TEXT_MODULE_RX.test(source)) {
          return undefined;
        }
        const resolved = await this.resolve(source, importer, { skipSelf: true });
        return resolved ? `${TEXT_MODULE_PREFIX}${resolved.id}${TEXT_MODULE_SUFFIX}` : undefined;
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@bundles': path.resolve(import.meta.dirname, 'dist/client'),
      '@scripts': path.resolve(import.meta.dirname, 'scripts'),
    },
  },
  test: { include: ['test/**/*.test.ts'], restoreMocks: true, root: '.' },
});
