import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'ttf-arraybuffer',
      transform(_code, id) {
        if (!id.endsWith('.ttf')) {
          return undefined;
        }
        const b64 = readFileSync(id).toString('base64');
        return `export default Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0)).buffer;`;
      },
    },
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { include: ['test/**/*.test.ts'], root: '.' },
});
