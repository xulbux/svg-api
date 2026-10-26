---
name: build
description: Runs the local Wrangler dev server for live previewing, verifies the Cloudflare Worker bundle, and deploys to Cloudflare.
---

# Build & Deploy

Use this skill to preview `svg.xul.is` locally via Wrangler, verify the Cloudflare Worker bundle, or deploy to production.

## 1. Prerequisites

Before building or deploying, always run the full validation suite (see `AGENTS.md` Section 4) and ensure the output is completely clean:

```bash
pnpm run check
```

## 2. Local Preview & Documentation Server (`localhost:8787`)

Start the local Wrangler dev server to preview the website, documentation (`DOCS_PAGES`), interactive builders (`BUILDER_PAGES`), static assets, and all live SVG routes (`SVG_ROUTES` in `src/routes/svg.ts`) exactly as hosted on `svg.xul.is`:

```bash
pnpm run dev
```

Open <http://localhost:8787/> (or <http://localhost:8787/docs>) in a browser to inspect the homepage, parameter tables, expandable Markdown code drawers, and all variants. Check previews in both color schemes (header theme switch), on both preview stage backgrounds (header preview background toggle), and on narrow screens (sidebar drawer). On `/builder/:kind`, edit fields, open the icon picker, and click a docs preview to verify it opens prefilled in its builder.

## 3. Verify Worker Bundle (Dry Run)

Verify that Wrangler can bundle the Worker cleanly without deploying:

```bash
pnpm exec wrangler deploy --dry-run
```

## 4. Deploy to Cloudflare

Authenticate Wrangler (if needed), configure secrets, and deploy to `svg.xul.is`:

```bash
pnpm exec wrangler secret put GITHUB_TOKEN
pnpm run deploy
```

Pushes to `main` also deploy automatically after CI validation passes (`.github/workflows/ci.yaml`).
