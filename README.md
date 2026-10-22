# `svg.xul.is` Edge SVG Engine

Dynamic SVG badge, CTA button, service preset, icon, tech stack grid, and quote card engine running on Cloudflare Workers at **[svg.xul.is](https://svg.xul.is)**; 100% free for everyone, with no signup, no API keys, and no rate limits.

For public endpoints (`/badge/*`, `/button/*`, `/btn/*`, `/icon/*`, `/stack/*`, `/quote/*`) and the token-free public service presets (PyPI, Conda, npm, JSR, jsDelivr, cdnjs, Bundlephobia, Open VSX, JetBrains Marketplace, Firefox Add-ons, crates.io, Go modules, Docker Hub, RubyGems, Packagist, NuGet, Maven Central, Hex.pm, pub.dev, DUB, CRAN, CTAN, MetaCPAN, CocoaPods, Clojars, Hackage, Elm packages, Puppet Forge, Ansible Galaxy, Homebrew formulae & casks, Terraform modules & providers, Artifact Hub, Flathub, Snapcraft, F-Droid, AUR, Arch Linux, Debian, Fedora, MacPorts, Hugging Face models & datasets, Zenodo, Modrinth, SpigotMC, Hangar, Thunderstore, Steam, WordPress plugins & themes, GitLab, Codeberg, Gitea, OpenSSF Scorecard, deps.dev, SonarCloud, Codecov, Coveralls, Read the Docs, Open Collective, Liberapay, Discord, Bluesky, and Hacker News), compose any element visually in the **[Builder](https://svg.xul.is/builder)**, or browse the live interactive documentation on **[svg.xul.is/docs](https://svg.xul.is/docs)** (every documented preview opens in the Builder prefilled).

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
| `src/index.ts` | Hono router wiring: docs and builder pages (behind the preview guard), versioned static assets (`/assets/*`), SVG routes registered from the route table, document redirects, error badges (`onError`), and Tier-2 SVG edge caching (static and service routes, keyed by path plus the recognized query parameters only). |
| `src/routes/` | Path segment & query DSL parsing (`params.ts`), the SVG route table and dispatcher (`svg.ts`) shared by the Worker and the docs previews, HTTP helpers (`http.ts`: response headers, entity tags, document navigation detection, redirect sanitizing), and the URL builder schemas (`schema.ts`) generated from the parser constants. |
| `src/svg/` | SSOT renderers (badges, buttons, icons, stacks, quotes), text outlines, icon resolution, and shared primitives (incl. the count- and size-bounded LRU caches and content-addressed SVG IDs). |
| `src/services/` | Upstream fetcher (validation, coalescing, 2 MB body cap, projected memory cache + edge caching incl. negative caching), endpoint helpers (`endpoint.ts`: URL templates, projections, `defineService`), metric factories (`metrics.ts`), and one preset module per service in `presets/`. |
| `src/config/` | The fixed color palette (`palette.ts`: Isolux grays, UI neutrals and syntax colors, brand indigo, strip stages), Tailwind v4 theme palettes (`theme.ts`), tech stack categories and brand colors (`stack.ts`), the service registry (`services.ts`), and status presets. |
| `src/preview/` | Homepage (`page.ts`), Getting Started and `/docs/:section` pages (`catalog.ts`), shared docs vocabulary (`glossary.ts`: variant tiers, special element examples), `/builder/:kind` pages (`builder.ts`), navigation and sidebars (`navigation.ts`), the document shell (`layout.ts`), shared components (`components.ts`), and versioned assets (`assets.ts`); Every preview is rendered from its documented path. |
| `src/preview/styles/` | Website stylesheets (plain `.css`, bundled as text; design tokens are generated in `styles.ts`). |
| `src/preview/scripts/` | Browser scripts (`*.client.js`, type-checked with JSDoc via `tsconfig.client.json`): the site script (theme, popovers, clipboard helpers shared via `svgSite`) and the builder (form, snippets, icon picker; share links keep the state incl. `&alt=` and `&link=`). |

### Adding a Service Preset

1.  Create `src/services/presets/<service>.ts` exporting a service built with `defineService()` (`src/services/endpoint.ts`): `docs` metadata, a `route` descriptor (optional or required `owner` segment with an optional `resolveDefault`, and the `target` placeholder), and `metrics` built with the typed factories in `src/services/metrics.ts` (`createVersionMetric`, `createLicenseMetric`, `createDownloadsMetric`, `createCommunityMetric`, `createCountMetric`, `createPercentScoreMetric`, …). Metric keys are type-checked, so `metricAliases` can only point at existing metrics.
2.  Declare upstream endpoints with `createEndpoint()`: URL templates (`{owner}`, `{target}`, `{path}` = `[owner/]target`, `{id}` = fully encoded `owner%2Ftarget`, `{npm}` = `[@owner/]target`, `{npm-id}` = `[@owner%2F]target`) encode every placeholder with `encodeURIComponent()` per path segment, a `ttl` from `CACHE_TTL` (`default`, `slow`, `daily`), and a `project` function (e.g., `pickFields`, `projectFirstEntry`) so only the few fields a badge needs are kept in the in-isolate and edge caches.
3.  Register it in `SERVICES_CONFIG` (`src/config/services.ts`). Routing, validation, caching, global metric aliases (`l`, `dm`, `version`, `last-commit`, `pr`, `pulls`, `pull-requests`, `cov`), and the `/docs/services` reference table pick it up automatically.
4.  Add a showcase card to `SERVICE_PRESET_CARDS` (`src/preview/catalog.ts`) and transform tests to `test/services.test.ts`. The service badge builder lists every public preset automatically.

Download metrics use canonical keys with one shared suffix and color table: `dd` (last day, `/day`), `dw` (last week, `/wk`), `dl` (last month, `/mo`), `dq` (last 90 days, `/90d`), `dy` (last year, `/yr`), and `dt` (all-time, no suffix). Community counts (`followers`, `likes`, `members`, `online`, `players`, `posts`, `votes`, `backers`, `patrons`) share one label and color table as well, while the service brand icon identifies the platform.

Owner and target segments may contain word characters, `.`, `-`, `@`, and `+` (dot-only segments are rejected). A literal `+` in a badge path decodes to a space, so names like `gtk+3` must be written as `gtk%2B3`. Targets spanning several path segments (e.g., Go module paths like `/badge/go/github.com/spf13/cobra/v`, or GitLab projects in nested subgroups like `/badge/gitlab/gitlab-org/charts/gitlab-runner/stars`) set `route.target.maxSegments`; Every segment is validated individually. Presets with stricter ids set `route.target.pattern` (e.g., numeric Steam app ids, Lucene-safe CPAN distribution names), and endpoints whose API reports missing packages with another status set `missingStatuses` (e.g., Fedora mdapi's `400`), so they render `not found`. Upstream bodies are capped at 2 MB (`too large` badge), and failures are cached briefly at the edge (`404`: 5 min, `429`: `Retry-After` clamped to 1–15 min, `5xx`: 1 min).

## Environment & Secrets

Create `.dev.vars` in the project root for local development:

```ini
GITHUB_TOKEN=ghp_your_personal_access_token
DEFAULT_GH_OWNER=xulbux
ALLOW_PREVIEW_IN_PROD=true
```

-   **`GITHUB_TOKEN`**: Optional locally, recommended in production for higher GitHub API rate limits (`5,000 req/hr` vs `60 req/hr`) on `/badge/gh/*` endpoints. Set in production via:

    ```bash
    pnpm exec wrangler secret put GITHUB_TOKEN
    ```

-   **`DEFAULT_GH_OWNER`**: The only allowed owner of `/badge/gh/*` endpoints and the default owner of the 3-segment `/badge/gh/:repo/:metric` form (configured in `wrangler.jsonc` as `xulbux`). There is no built-in fallback: Without the binding, every `gh` badge is `restricted` (and the 3-segment form reports `missing owner`).
-   **`ALLOW_PREVIEW_IN_PROD`**: Controls whether `/`, `/docs/*`, and `/builder/*` render the interactive documentation website and builder in production (`"true"`) or redirect to `https://xul.is` (`"false"`; `/assets/*` then returns `404`).

## Restricted GitHub Service Badges (`/badge/gh/*`)

GitHub repository presets are intentionally omitted from the public documentation website because they are locked to the `DEFAULT_GH_OWNER` binding (`xulbux` on svg.xul.is) to protect the Worker's `GITHUB_TOKEN` rate limit. Requests for any other owner return a `restricted` badge, and an exhausted rate limit (`429`, or GitHub's `403` with `x-ratelimit-remaining: 0`) renders a `rate limited` badge.

There is no free, token-free source of *live* metrics for arbitrary public repositories: Unauthenticated `api.github.com` allows only `60 req/hr` per IP (shared by all Workers on the same egress IP), and proxies like [ungh.cc](https://ungh.cc) or shields.io's JSON endpoints run on their own pooled tokens (shields.io pools OAuth tokens donated by its users instead of paying GitHub). Opening the preset to every owner would therefore need a token pool of its own. For any public GitHub repository, the public `depsdev` preset (`/badge/depsdev/:owner/:repo/stars|forks|issues|license|score`) serves token-free stars, forks, open issues & PRs, license, and OpenSSF Scorecard data from [deps.dev](https://deps.dev) instead (refreshed about once a day).

### Route Formats

```text
https://svg.xul.is/badge/gh/:repo/:metric
https://svg.xul.is/badge/gh/xulbux/:repo/:metric
```

When `:owner` is omitted, it defaults to the `DEFAULT_GH_OWNER` binding (`missing owner` when the binding is unset). Opening any `/badge/gh/*` badge in a browser (`Sec-Fetch-Dest: document`) redirects to the corresponding GitHub repository page (`stargazers`, `network/members`, `issues`, `pulls`, the repository root, `commits`, `releases`, or `graphs/commit-activity`) without fetching any metrics.

### Available `:metric` Presets

| Metric | Route Example | Default Label | Default Color & Icon | Default Redirect Target |
| :--- | :--- | :--- | :--- | :--- |
| **`stars`** | `/badge/gh/python-lib-xulbux/stars` | `Stars` | `amber` (`star`) | `github.com/xulbux/:repo/stargazers` |
| **`forks`** | `/badge/gh/python-lib-xulbux/forks` | `Forks` | `sky` (`git-fork`) | `github.com/xulbux/:repo/network/members` |
| **`issues`** | `/badge/gh/python-lib-xulbux/issues` | `Issues` | `rose` (`circle-dot`) | `github.com/xulbux/:repo/issues` |
| **`prs`** or **`pr`**, **`pulls`**, **`pull-requests`** | `/badge/gh/python-lib-xulbux/prs` | `Pull Requests` | `violet` (`git-pull-request`) | `github.com/xulbux/:repo/pulls` |
| **`license`** or **`l`** | `/badge/gh/python-lib-xulbux/license` | `License` (`none` without a license, `custom` when unrecognized) | `slate` (`scale`) | `github.com/xulbux/:repo` |
| **`commit`** or **`last-commit`** | `/badge/gh/python-lib-xulbux/commit` | `Last Commit` | `rose` (`git-commit-horizontal`) | `github.com/xulbux/:repo/commits` |
| **`release`** | `/badge/gh/python-lib-xulbux/release` | `Release` | `indigo` (`tag`) | `github.com/xulbux/:repo/releases` |
| **`activity`** | `/badge/gh/python-lib-xulbux/activity` | `Commits` | `emerald` (`activity` + 8-week `sparkline`; auto `bars`, `delta`; `computing` while GitHub generates stats) | `github.com/xulbux/:repo/graphs/commit-activity` |

### Markdown Examples

```markdown
[![GitHub Stars](https://svg.xul.is/badge/gh/python-lib-xulbux/stars)](https://svg.xul.is/badge/gh/python-lib-xulbux/stars)
[![GitHub Release](https://svg.xul.is/badge/gh/python-lib-xulbux/release)](https://svg.xul.is/badge/gh/python-lib-xulbux/release)
[![Commit Activity](https://svg.xul.is/badge/gh/python-lib-xulbux/activity)](https://svg.xul.is/badge/gh/python-lib-xulbux/activity)
[![Last Commit](https://svg.xul.is/badge/gh/python-lib-xulbux/commit)](https://svg.xul.is/badge/gh/python-lib-xulbux/commit)
[![License](https://svg.xul.is/badge/gh/python-lib-xulbux/license)](https://svg.xul.is/badge/gh/python-lib-xulbux/license)
```

### Query Overrides

All `/badge/gh/*` routes accept the standard badge query parameters plus `?label=`:

-   `?variant=1|2|3` (defaults to `1` for all GitHub metrics)
-   `?color=<theme>` (any Tailwind v4 OKLCH theme color listed on [/docs/colors](https://svg.xul.is/docs/colors))
-   `?icon=<slug>|<left>,<right>|none,<right>|none` (override the default left icon, add both left and right icons, or show only a right icon)
-   `?label=<text>` (override the left-hand label text on service badges)
-   `?dot=<theme>|online|degraded|incident|offline|maintenance|beta|standby|none` (any theme color or status preset name)
-   `?anim=sheen|auto|spin|whirl|turn|shake|nudge|pulse|breathe|float|<left>,<right>|sheen,<mode>|sheen,<left>,<right>|none` (defaults to static icons/surfaces; pass `sheen` for surface sweep only, `auto` or a specific motion for icon animation, `<left>,<right>` like `none,nudge` or `shake,nudge` to animate left and right icons independently, `sheen,auto` for both, or `none` to disable all animations)
-   `?special=sparkline|bars|bar|steps|ring|strip|delta|none` (populate a supported widget automatically from live upstream data, pass `none` to hide a default preset widget, or pass `<kind>:<payload>` for custom numbers)
