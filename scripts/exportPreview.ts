/**
 * Standalone preview exporter – Generates `preview.html` in the repository root using the SSOT renderer.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderPreviewHtml } from '@/preview/page';

// ----------------------------------------- MAIN ----------------------------------------

const outPath = path.resolve(process.cwd(), 'preview.html');
writeFileSync(outPath, renderPreviewHtml(), 'utf8');
process.stdout.write(`Generated standalone SSOT preview at: ${outPath}\n`);
