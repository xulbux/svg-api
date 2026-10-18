# `svg.xul.is` Edge SVG Engine

Dynamic SVG badge, CTA button, service preset, icon, tech stack grid, and quote card engine running on Cloudflare Workers at **[svg.xul.is](https://svg.xul.is)**.

For public endpoints (`/badge/*`, `/button/*`, `/btn/*`, `/icon/*`, `/stack/*`, `/quote/*`, and public service presets like PyPI, npm, Open VSX, Crates.io, and Docker Hub), see the live interactive documentation on **[svg.xul.is](https://svg.xul.is)**.

## Local Development

```bash
# Format, lint, type-check, run tests, and dry-run bundle
pnpm run check

# Start local Wrangler dev server (http://localhost:8787)
pnpm run dev
```

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
-   **`ALLOW_PREVIEW_IN_PROD`**: Controls whether `/` and `/docs/*` render the interactive documentation website in production (`"true"`) or redirect to `https://xul.is` (`"false"`).

## Restricted GitHub Service Badges (`/badge/gh/*`)

GitHub repository presets are intentionally omitted from the public documentation website because they are locked to `DEFAULT_GH_OWNER` (`xulbux`) to protect the Worker's `GITHUB_TOKEN` rate limit. Requests for any other owner return a `restricted` badge.

### Route Formats

```text
https://svg.xul.is/badge/gh/:repo/:metric
https://svg.xul.is/badge/gh/xulbux/:repo/:metric
```

When `:owner` is omitted, it defaults to `xulbux`. Clicking any `/badge/gh/*` badge in a browser (`Sec-Fetch-Dest: document`) automatically redirects to the corresponding GitHub repository page (`stargazers`, `network/members`, `issues`, `commits`, `releases`, or `pulse`).

### Available `:metric` Presets

| Metric | Route Example | Default Label | Default Color & Icon | Default Redirect Target |
| :--- | :--- | :--- | :--- | :--- |
| **`stars`** | `/badge/gh/python-lib-xulbux/stars` | `stars` | `amber` (`star`) | `github.com/xulbux/:repo/stargazers` |
| **`forks`** | `/badge/gh/python-lib-xulbux/forks` | `forks` | `blue` (`git-fork`) | `github.com/xulbux/:repo/network/members` |
| **`issues`** | `/badge/gh/python-lib-xulbux/issues` | `issues` | `emerald` (`0`) or `amber` (`>0`) (`circle-dot`) | `github.com/xulbux/:repo/issues` |
| **`license`** | `/badge/gh/python-lib-xulbux/license` | `license` | `teal` (`scale`) | `github.com/xulbux/:repo` |
| **`commit`** or **`last-commit`** | `/badge/gh/python-lib-xulbux/commit` | `last commit` | `indigo` (`git-commit-horizontal`) | `github.com/xulbux/:repo/commits` |
| **`release`** | `/badge/gh/python-lib-xulbux/release` | `release` | `violet` (`tag`, `variant=1`) | `github.com/xulbux/:repo/releases` |
| **`activity`** | `/badge/gh/python-lib-xulbux/activity` | `commits` | `emerald` (`activity` + 8-week `sparkline`) | `github.com/xulbux/:repo/pulse` |

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

-   `?variant=1|2|3` (defaults to `1` for `release`, `2` for all other GitHub metrics)
-   `?color=<theme>` (any of the 22 Tailwind v4 OKLCH theme colors)
-   `?icon=<slug>|<left>,<right>|none,<right>|none` (override the default left icon, add both left and right icons, or show only a right icon)
-   `?label=<text>` (override the left-hand label text on service badges)
-   `?dot=green|amber|red|blue|sky|indigo|violet|purple|emerald|teal|cyan|slate`
-   `?anim=sheen|auto|spin|shake|nudge|pulse|float|<left>,<right>|sheen,<mode>|sheen,<left>,<right>|none` (defaults to static icons/surfaces; pass `sheen` for surface sweep only, `auto` or a specific motion for icon animation, `<left>,<right>` like `none,nudge` or `shake,nudge` to animate left and right icons independently, `sheen,auto` for both, or `none` to disable all animations)
-   `?special=sparkline:...|bar:...|ring:...|strip:...|delta:...`
