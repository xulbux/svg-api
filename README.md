# `svg.xul.is` Edge SVG Engine

Dynamic SVG badge, CTA button, service preset, icon, tech stack grid, and quote card engine running on Cloudflare Workers at **[svg.xul.is](https://svg.xul.is)**.

For public endpoints (`/badge/*`, `/button/*`, `/btn/*`, `/icon/*`, `/stack/*`, `/quote/*`) and the token-free public service presets (PyPI, npm, JSR, jsDelivr, Bundlephobia, Open VSX, Firefox Add-ons, crates.io, Go modules, Docker Hub, RubyGems, Packagist, NuGet, Hex.pm, pub.dev, CRAN, CocoaPods, Clojars, Hackage, Elm packages, Puppet Forge, Ansible Galaxy, Homebrew formulae & casks, Flathub, Snapcraft, F-Droid, AUR, Hugging Face models & datasets, Modrinth, WordPress plugins & themes, GitLab, Codeberg, Gitea, OpenSSF Scorecard, Codecov, Coveralls, Read the Docs, Open Collective, Liberapay, Discord, and Bluesky), see the live interactive documentation on **[svg.xul.is/docs](https://svg.xul.is/docs)**, or compose any element visually in the **[Builder](https://svg.xul.is/builder)** (every documented preview opens there prefilled).

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
| `src/index.ts` | Hono router: docs and builder pages, versioned static assets (`/assets/*`), SVG routes, document redirects, and Tier-2 SVG edge caching. |
| `src/routes/` | Path segment & query DSL parsing (`params.ts`), the SVG route dispatcher (`svg.ts`) shared by the Worker and the docs previews, and the URL builder schemas (`schema.ts`) generated from the parser constants. |
| `src/svg/` | SSOT renderers (badges, buttons, icons, stacks, quotes), text outlines, icon resolution, and shared primitives (incl. the count- and size-bounded LRU caches). |
| `src/services/` | Upstream fetcher (validation, coalescing, size-budgeted memory cache + edge caching), metric helpers, and one preset module per service in `presets/`. |
| `src/config/` | The fixed color palette (`palette.ts`: Isolux grays, UI neutrals and syntax colors, brand indigo, strip stages), Tailwind v4 theme palettes (`theme.ts`), the service registry (`services.ts`), and status presets. |
| `src/preview/` | Homepage (`page.ts`), Getting Started and `/docs/:section` pages (`catalog.ts`), `/builder/:kind` pages (`builder.ts`), navigation and sidebars (`navigation.ts`), the document shell (`layout.ts`), shared components (`components.ts`), and versioned assets (`assets.ts`); Every preview is rendered from its documented path. |
| `src/preview/styles/` | Website stylesheets (plain `.css`, bundled as text; design tokens are generated in `styles.ts`). |
| `src/preview/scripts/` | Browser scripts (`*.client.js`, type-checked with JSDoc via `tsconfig.client.json`): the site script and the builder (form, snippets, icon picker). |

### Adding a Service Preset

1.  Create `src/services/presets/<service>.ts` exporting a `ServiceDefinition` (endpoints, metric presentations, transforms built with the factories in `src/services/metrics.ts`, `ownerMode`, and `docs` metadata).
2.  Register it in `SERVICES_CONFIG` (`src/config/services.ts`). Routing, validation, caching, and the `/docs/services` reference table pick it up automatically.
3.  Add a showcase card to `SERVICE_PRESET_CARDS` (`src/preview/catalog.ts`) and transform tests to `test/services.test.ts`. The service badge builder lists every public preset automatically.

Owner and target segments may contain word characters, `.`, `-`, `@`, and `+` (dot-only segments are rejected). A literal `+` in a badge path decodes to a space, so names like `gtk+3` must be written as `gtk%2B3`. Always `encodeURIComponent()` targets that end up in an upstream query string. Targets spanning several path segments (e.g., Go module paths like `/badge/go/github.com/spf13/cobra/v`) set `maxTargetSegments` on the `ServiceDefinition`; Every segment is validated individually.

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

-   **`DEFAULT_GH_OWNER`**: Owner allowlist for `/badge/gh/*` endpoints (configured in `wrangler.jsonc` as `xulbux`).
-   **`ALLOW_PREVIEW_IN_PROD`**: Controls whether `/`, `/docs/*`, and `/builder/*` render the interactive documentation website and builder in production (`"true"`) or redirect to `https://xul.is` (`"false"`; `/assets/*` then returns `404`).

## Restricted GitHub Service Badges (`/badge/gh/*`)

GitHub repository presets are intentionally omitted from the public documentation website because they are locked to `DEFAULT_GH_OWNER` (`xulbux`) to protect the Worker's `GITHUB_TOKEN` rate limit. Requests for any other owner return a `restricted` badge, and an exhausted rate limit (`429`, or GitHub's `403` with `x-ratelimit-remaining: 0`) renders a `rate limited` badge.

There is no free, token-free source for arbitrary public repositories: Unauthenticated `api.github.com` allows only `60 req/hr` per IP (shared by all Workers on the same egress IP), and proxies like [ungh.cc](https://ungh.cc) or shields.io's JSON endpoints run on their own pooled tokens (shields.io pools OAuth tokens donated by its users instead of paying GitHub). Opening the preset to every owner would therefore need a token pool of its own.

### Route Formats

```text
https://svg.xul.is/badge/gh/:repo/:metric
https://svg.xul.is/badge/gh/xulbux/:repo/:metric
```

When `:owner` is omitted, it defaults to `xulbux`. Opening any `/badge/gh/*` badge in a browser (`Sec-Fetch-Dest: document`) redirects to the corresponding GitHub repository page (`stargazers`, `network/members`, `issues`, `blob/HEAD/LICENSE`, `commits`, `releases`, or `graphs/commit-activity`) without fetching any metrics.

### Available `:metric` Presets

| Metric | Route Example | Default Label | Default Color & Icon | Default Redirect Target |
| :--- | :--- | :--- | :--- | :--- |
| **`stars`** | `/badge/gh/python-lib-xulbux/stars` | `stars` | `amber` (`star`) | `github.com/xulbux/:repo/stargazers` |
| **`forks`** | `/badge/gh/python-lib-xulbux/forks` | `forks` | `sky` (`git-fork`) | `github.com/xulbux/:repo/network/members` |
| **`issues`** | `/badge/gh/python-lib-xulbux/issues` | `issues` | `rose` (`circle-dot`) | `github.com/xulbux/:repo/issues` |
| **`license`** or **`l`** | `/badge/gh/python-lib-xulbux/license` | `license` | `slate` (`scale`) | `github.com/xulbux/:repo/blob/HEAD/LICENSE` |
| **`commit`** or **`last-commit`** | `/badge/gh/python-lib-xulbux/commit` | `last commit` | `rose` (`git-commit-horizontal`) | `github.com/xulbux/:repo/commits` |
| **`release`** | `/badge/gh/python-lib-xulbux/release` | `release` | `indigo` (`tag`) | `github.com/xulbux/:repo/releases` |
| **`activity`** | `/badge/gh/python-lib-xulbux/activity` | `commits` | `emerald` (`activity` + 8-week `sparkline`; `computing` while GitHub generates stats) | `github.com/xulbux/:repo/graphs/commit-activity` |

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
-   `?anim=sheen|auto|spin|shake|nudge|pulse|float|<left>,<right>|sheen,<mode>|sheen,<left>,<right>|none` (defaults to static icons/surfaces; pass `sheen` for surface sweep only, `auto` or a specific motion for icon animation, `<left>,<right>` like `none,nudge` or `shake,nudge` to animate left and right icons independently, `sheen,auto` for both, or `none` to disable all animations)
-   `?special=sparkline:...|bar:...|ring:...|strip:...|delta:...`
