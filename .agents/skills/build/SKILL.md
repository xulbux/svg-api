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

In accordance with `AGENTS.md` Section 4, keep `src/preview/` (`catalog.ts`, `page.ts`, `layout.ts`) synchronized with all routes, parameters, variants, and Markdown snippets. Start the local Wrangler dev server to preview all routes (`/` homepage, `/docs`, `/docs/:section`, `/preview`, `/badge/*`, `/button/*`, `/btn/*`, `/icon/*`, `/stack/*`, `/quote/*`) exactly as hosted on `svg.xul.is`:

```bash
pnpm run dev
```

Open <http://localhost:8787/> (or <http://localhost:8787/docs>) in a browser to inspect the homepage, parameter tables, expandable Markdown code drawers, and all variants across dark and light canvases.

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

## 5. Full One-Liner (Validate + Dry-Run Bundle)

```bash
pnpm run check
```

