---
name: build
description: Exports the standalone SSOT preview HTML, verifies the Cloudflare Worker bundle, and deploys to Cloudflare.
---

# Build & Deploy

Use this skill to export the standalone visual preview, verify the Cloudflare Worker bundle with Wrangler, or deploy to production.

## 1. Prerequisites

Before building or deploying, always run the full validation suite (see `AGENTS.md` Section 4) and ensure the output is completely clean:

```bash
pnpm run type-check; pnpm run lint; pnpm run fmt; pnpm run test; pnpm run preview:export
```

## 2. Export Standalone Preview

Generate `preview.html` in the project root using the Single Source of Truth renderer (`src/svg/renderer.ts`):

```bash
pnpm run preview:export
```

Open `preview.html` in a browser or start the local Wrangler dev server (`pnpm run dev` → <http://localhost:8787/preview>) to inspect all 6 badge/button variants, status dots, sparklines, and theme palettes on dark and light canvases.

## 3. Verify Worker Bundle (Dry Run)

Verify that Wrangler can bundle the Worker cleanly without deploying:

```bash
pnpm exec wrangler deploy --dry-run
```

## 4. Deploy to Cloudflare

Authenticate Wrangler (if needed), configure secrets, and deploy to `badge.xul.is` and `b.xul.is`:

```bash
pnpm exec wrangler secret put GITHUB_TOKEN
pnpm run deploy
```

## 5. Full One-Liner (Validate + Dry-Run Bundle)

```bash
pnpm run type-check && pnpm run lint && pnpm run fmt && pnpm run test && pnpm run preview:export && pnpm exec wrangler deploy --dry-run
```

