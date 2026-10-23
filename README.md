# `svg.xul.is` Edge SVG Engine

Dynamic SVG badge, CTA button, service preset, icon, tech stack grid, typing animation, and quote card engine running on Cloudflare Workers at **[svg.xul.is](https://svg.xul.is)**; 100% free for everyone, with no signup, no API keys, and no rate limits.

For public endpoints (`/badge/*`, `/button/*`, `/btn/*`, `/icon/*`, `/stack/*`, `/typing/*`, `/type/*`, `/quote/*`) and the public service presets (PyPI, Conda, npm, JSR, jsDelivr, cdnjs, Bundlephobia, Open VSX, JetBrains Marketplace, Firefox Add-ons, crates.io, Go modules, Docker Hub, RubyGems, Packagist, NuGet, Maven Central, Hex.pm, pub.dev, DUB, CRAN, CTAN, MetaCPAN, CocoaPods, Clojars, Hackage, Elm packages, Puppet Forge, Ansible Galaxy, Homebrew formulae & casks, Terraform modules & providers, Artifact Hub, Flathub, Snapcraft, F-Droid, AUR, Arch Linux, Debian, Fedora, MacPorts, Hugging Face models & datasets, Zenodo, Modrinth, SpigotMC, Hangar, Thunderstore, Steam, WordPress plugins & themes, GitHub, GitLab, Codeberg, Gitea, OpenSSF Scorecard, deps.dev, SonarCloud, Codecov, Coveralls, Read the Docs, Open Collective, Liberapay, Discord, Bluesky, and Hacker News), compose any element visually in the **[Builder](https://svg.xul.is/builder)**, or browse the live interactive documentation on **[svg.xul.is/docs](https://svg.xul.is/docs)** (every documented preview opens in the Builder prefilled).

## Local Development

```bash
# Format, lint, type-check, run tests, and dry-run bundle
pnpm run check

# Start local Wrangler dev server (http://localhost:8787)
pnpm run dev
```

## Project Structure

| Path | Purpose |
| :--- | :--- |
| `src/index.ts` | Hono router wiring: docs and builder pages, versioned static assets (`/assets/*`), SVG routes registered from the route table, document redirects, error badges (`onError`), and Tier-2 SVG edge caching (static and service routes, keyed by path plus the recognized query parameters only). |
| `src/routes/` | Path segment & query DSL parsing (`params.ts`), the SVG route table and dispatcher (`svg.ts`) shared by the Worker and the docs previews, HTTP helpers (`http.ts`: response headers, entity tags, document navigation detection, redirect sanitizing), and the URL builder schemas (`schema.ts`) generated from the parser constants. |
| `src/svg/` | SSOT renderers (badges, buttons, icons, stacks, typing animations, quotes), text outlines, icon resolution, and shared primitives (incl. the count- and size-bounded LRU caches and content-addressed SVG IDs). |
| `src/services/` | Upstream fetcher (validation, coalescing, 2 MB body cap, projected memory cache + edge caching incl. conditional `ETag` revalidation, `stale-if-error` rescue, and negative caching), endpoint helpers (`endpoint.ts`: URL templates, custom request builders, projections, `defineService`), metric factories (`metrics.ts`), and one preset module per service in `presets/`. |
| `src/config/` | The fixed color palette (`palette.ts`: Isolux grays, UI neutrals and syntax colors, brand indigo, strip stages), Tailwind v4 theme palettes (`theme.ts`), tech stack categories and brand colors (`stack.ts`), and the service registry (`services.ts`). |
| `src/site/` | Homepage, Getting Started, `/docs/:section`, and `/builder/:kind` JSX pages (`pages/`), modular catalog data (`catalog/`), shared docs vocabulary (`glossary.ts`: variant tiers, special element examples), navigation and sidebars (`navigation.ts`), reusable UI components (`components/`), custom zero-dependency JSX runtime (`jsx/`), shared isomorphic utilities (`shared/`), and versioned assets (`assets.ts`); Every preview is rendered from its documented path. |
| `src/site/styles/` | Website stylesheets (plain `.css`, bundled as text; design tokens are generated in `styles/index.ts`). |
| `src/site/client/` | Modular browser TypeScript (`site/*.ts` and `builder/*.ts`, type-checked via `tsconfig.client.json` and bundled into `client/bundles/*.client.js`): the site script (theme, popovers, clipboard helpers shared via `svgSite`) and the builder (form, snippets, icon picker; share links keep the state incl. `&alt=` and `&link=`). |

### Adding a Service Preset

1.  Create `src/services/presets/<service>.ts` exporting a service built with `defineService()` (`src/services/endpoint.ts`): `docs` metadata, a `route` descriptor (optional or required `owner` segment with an optional `resolveDefault`, and the `target` placeholder), and `metrics` built with the typed factories in `src/services/metrics.ts` (`createVersionMetric`, `createLicenseMetric`, `createDownloadsMetric`, `createCommunityMetric`, `createCountMetric`, `createPercentScoreMetric`, …). Metric keys are type-checked, so `metricAliases` can only point at existing metrics.
2.  Declare upstream endpoints with `createEndpoint()`: URL templates (`{owner}`, `{target}`, `{path}` = `[owner/]target`, `{id}` = fully encoded `owner%2Ftarget`, `{npm}` = `[@owner/]target`, `{npm-id}` = `[@owner%2F]target`) encode every placeholder with `encodeURIComponent()` per path segment, a `ttl` from `CACHE_TTL` (`default`, `slow`, `daily`), and a `project` function (e.g., `pickFields`, `projectFirstEntry`) so only the few fields a badge needs are kept in the in-isolate and edge caches.
3.  Register it in `SERVICES_CONFIG` (`src/config/services.ts`). Routing, validation, caching, global metric aliases (`l`, `dm`, `version`, `last-commit`, `pr`, `pulls`, `pull-requests`, `cov`), and the `/docs/services` reference table pick it up automatically.
4.  Add a showcase card to `SERVICE_PRESET_CARDS` (`src/site/catalog/services.ts`) and transform tests to `test/services.test.ts`. The service badge builder lists every public preset automatically.

Download metrics use canonical keys with one shared suffix and color table: `dd` (last day, `/day`), `dw` (last week, `/wk`), `dl` (last month, `/mo`), `dq` (last 90 days, `/90d`), `dy` (last year, `/yr`), and `dt` (all-time, no suffix). Community counts (`followers`, `likes`, `members`, `online`, `players`, `posts`, `votes`, `backers`, `patrons`) share one label and color table as well, while the service brand icon identifies the platform.

Owner and target segments may contain word characters, `.`, `-`, `@`, and `+` (dot-only segments are rejected). A literal `+` in a badge path decodes to a space, so names like `gtk+3` must be written as `gtk%2B3`. Targets spanning several path segments (e.g., Go module paths like `/badge/go/github.com/spf13/cobra/v`, or GitLab projects in nested subgroups like `/badge/gitlab/gitlab-org/charts/gitlab-runner/stars`) set `route.target.maxSegments`; Every segment is validated individually. Presets with stricter ids set `route.target.pattern` (e.g., numeric Steam app ids, Lucene-safe CPAN distribution names), and endpoints whose API reports missing packages with another status set `missingStatuses` (e.g., Fedora mdapi's `400`), so they render `not found`. Upstream bodies are capped at 2 MB (`too large` badge), and failures are cached briefly at the edge (`404`: 5 min, `429`: `Retry-After` clamped to 1–15 min, `5xx`: 1 min).

## Environment & Secrets

Create `.dev.vars` in the project root for local development (optional):

```ini
GITHUB_TOKEN=github_pat_your_fine_grained_token
```

-   **`GITHUB_TOKEN`**: Optional locally, recommended in production for `/badge/gh/:owner/:repo/:metric` endpoints. A Fine-Grained Personal Access Token scoped to **Public Repositories (read-only)** with zero repository or account permissions unlocks `5,000 req/hr` on REST Core with free `304 Not Modified` conditional `ETag` revalidations (7-day edge retention + quota-aware adaptive TTL backoff) plus a separate `5,000 points/hr` GraphQL v4 bucket (micro-batching `issues` and `prs` for up to 16 concurrent repositories into a single 1-point query); When omitted, GitHub endpoints fall back to unauthenticated REST (`60 req/hr` per egress IP). Set in production via:

    ```bash
    pnpm exec wrangler secret put GITHUB_TOKEN
    ```
