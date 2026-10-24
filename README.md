# `svg-api` Dev Cheatsheet

Private Cloudflare Worker codebase for **[svg.xul.is](https://svg.xul.is)**.

## Commands

```bash
pnpm run dev          # Build client bundles + start Wrangler dev server (http://localhost:8787)
pnpm run check        # Full suite: client build, fmt, oxlint, markdownlint, 3x tsc, vitest, dry-run
pnpm run fmt          # Format codebase (oxfmt)
pnpm run lint         # Auto-fix lint issues (oxlint)
pnpm run test         # Build client bundles + run vitest once
pnpm run test:watch   # Watch mode
pnpm run deploy       # Build client bundles + deploy to Cloudflare
```

## Secrets & `.dev.vars`

Optional `.dev.vars` in the repo root for local GitHub API calls (`60 req/hr` unauthenticated fallback otherwise):

```ini
GITHUB_TOKEN=github_pat_...
```

Production secret:

```bash
pnpm exec wrangler secret put GITHUB_TOKEN
```

Use a **Fine-Grained PAT** scoped to **Public Repositories (read-only)** with zero repository or account permissions (`5,000 req/hr` REST Core + free `304` `ETag` revalidations + `5,000 pts/hr` GraphQL v4).

## Adding a Service Preset

1.  Create `src/services/presets/<service>.ts` with `defineService()` + `createEndpoint()` (`src/services/endpoint.ts`) and metric factories (`src/services/metrics.ts`). Always set a `project` projection (e.g., `pickFields`) and `ttl` from `CACHE_TTL`.
2.  Register in `SERVICES_CONFIG` (`src/config/services.ts`); routing, validation, global metric aliases, `/docs/services`, and `/builder/service` pick it up automatically.
3.  Add a preview card to `buildServicePresetCards()` (`src/site/catalog/services.ts`) and transform tests in `test/services.test.ts`.

### `createEndpoint()` URL Placeholders

-   `{owner}`, `{target}` – Single path segment (`encodeURIComponent` per segment)
-   `{scope}` – Encoded `owner` with any leading `@` stripped, or empty when omitted
-   `{path}` – `[owner/]target`
-   `{id}` – Fully URL-encoded `[owner%2F]target`
-   `{npm}` / `{npm-id}` – `[@owner/]target` / `[@owner%2F]target`

### Canonical Download Metric Keys

-   `dd` (`/day`), `dw` (`/wk`), `dl` (`/mo`, aliased as `dm`), `dq` (`/90d`), `dy` (`/yr`), `dt` (all-time)

## Gotchas

-   **Path encoding:** `+` in SVG route segments decodes to a space; encode literal `+` as `%2B` (e.g., `C%2B%2B`, `gtk%2B3`) and `%` as `%25`. Multi-segment targets set `route.target.maxSegments`; non-`404` missing responses set `endpoint.missingStatuses`.
-   **Worker entrypoint (`src/index.ts`):** Must **only** `export default app;`. Any named non-function export crashes `workerd` at startup.
-   **Inline `<head>` script CSP:** Changing `buildHeadScriptBody()` in `src/site/components/PageLayout.tsx` requires updating its `sha256-...` hash in `HTML_SECURITY_HEADERS['Content-Security-Policy']` (`src/routes/http.ts`).
-   **Client bundle boundary:** `src/site/client/**` and `src/site/shared/**` are checked against DOM types (`tsconfig.client.json`) without Worker bindings and bundled into gitignored `dist/client/*.client.js` via `pnpm run build:client`.
