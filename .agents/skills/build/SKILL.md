---
name: build
description: Runs the local Wrangler dev server for live previewing, verifies the Cloudflare Worker bundle, and deploys to Cloudflare.
---

# Build & Deploy

Preview `SVG API` locally, verify the Worker bundle, or deploy to Cloudflare.

## 1. Prerequisites

Run the full validation suite (`AGENTS.md` Section 4) and confirm zero errors or warnings:

```bash
pnpm run check
```

## 2. Local Preview Server (`localhost:8787`)

Preview the site, docs (`DOCS_PAGES`), builders (`BUILDER_PAGES`), static assets, and live SVG routes (`SVG_ROUTES` in `src/routes/svg.ts`):

```bash
pnpm run dev
```

Inspect <http://localhost:8787/> and <http://localhost:8787/docs> across both color schemes, both preview stage backgrounds, and narrow viewports (sidebar drawer). On `/builder/:kind`, verify controls, the icon picker, and prefilled "Open in Builder" links from docs previews.

## 3. Verify Worker Bundle (Dry Run)

```bash
pnpm exec wrangler deploy --dry-run
```

## 4. Deploy to Cloudflare

```bash
pnpm exec wrangler secret put GITHUB_TOKEN
pnpm run deploy
```

Pushes to `main` also deploy automatically after CI validation passes (`.github/workflows/ci.yaml`).
