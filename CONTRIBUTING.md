# Contributing to SVG API

Thanks for contributing to **SVG API** ([**svg.xul.is**](https://svg.xul.is))!

<br>

## <a href="#table-of-contents"><img src="https://svg.xul.is/icon/list?size=32&stroke=2" align="left" /></a>Table of Contents

-   [Ways to Contribute](#ways-to-contribute)
-   [Getting Started](#getting-started)
-   [Adding a Service Preset](#adding-a-service-preset)
-   [Icons & Tech Stack](#icons--tech-stack)
-   [Code Style & Gotchas](#code-style--gotchas)
-   [Submitting a Pull Request](#submitting-a-pull-request)

<br>
<br>

## <a href="#ways-to-contribute"><img src="https://svg.xul.is/icon/compass?size=32&stroke=2" align="left" /></a>Ways to Contribute

-   **Service Presets:** Live badges for public, token-free registries and platforms.
-   **Bug Fixes:** Rendering, parser, or builder fixes paired with a regression test.
-   **Icons & Stack Entries:** Shorthand aliases or stack catalog entries for bundled icons.
-   **Docs & Performance:** Clearer docs, faster rendering, or builder UX polish.

> [!NOTE]<br>
> Planning a major change or new route family? Open an [**Issue**](https://github.com/xulbux/svg-api/issues) first so we can align on the design.

<br>

## <a href="#getting-started"><img src="https://svg.xul.is/icon/rocket?size=32&stroke=2" align="left" /></a>Getting Started

-   **Node.js:** `>= 26`
-   **Package Manager:** **pnpm** (never `npm`, `npx`, or `yarn`)

```bash
git clone https://github.com/xulbux/svg-api.git
cd svg-api
pnpm install
pnpm run dev     # Local preview at http://localhost:8787
pnpm run check   # Format, lint, type-check, test & dry-run bundle
```

<br>

## <a href="#adding-a-service-preset"><img src="https://svg.xul.is/icon/plug?size=32&stroke=2" align="left" /></a>Adding a Service Preset

Presets serve `/badge/:service/[:owner/]:target/:metric` from public upstream APIs:

1.  **Create `src/services/presets/<service>.ts`** (verify the live JSON response first, e.g., with `curl`):

    ```typescript
    /**
     * Example registry preset – Live metrics and redirect configuration.
     */

    import { CACHE_TTL, PACKAGE_ROUTE, createEndpoint, defineService, pickFields } from '@/services/endpoint';
    import { createDownloadsMetric, createVersionMetric } from '@/services/metrics';

    interface ExamplePayload {
      downloads: number;
      version: string;
    }

    const EXAMPLE_ENDPOINT = createEndpoint({
      api: 'https://api.example.org/v1/packages/{target}',
      page: 'https://example.org/packages/{target}',
      project: pickFields<ExamplePayload>(['downloads', 'version']),
      ttl: CACHE_TTL.default,
    });

    export const EXAMPLE_SERVICE = defineService({
      docs: { description: 'Latest version and total downloads.', title: 'Example' },
      metrics: {
        dt: createDownloadsMetric(EXAMPLE_ENDPOINT, 'dt', (pkg) => pkg.downloads),
        v: createVersionMetric(
          EXAMPLE_ENDPOINT,
          { defaultColor: 'sky', defaultIcon: 'package', defaultLabel: 'Example' },
          (pkg) => pkg.version
        ),
      },
      route: PACKAGE_ROUTE,
    });
    ```

2.  **Register alphabetically** in `SERVICES_CONFIG` (`src/config/services.ts`).
3.  **Add a preview item** in `buildServicePresetCards()` (`src/site/catalog/services.ts`).
4.  **Add unit tests** (valid payloads, missing fields, errors, redirects) in `test/services.test.ts`.

### Preset Rules

-   **Public `GET` JSON Only:** Documented, token-free endpoints for developer platforms and registries only (no HTML scraping or undocumented internal web endpoints); Hardcode the upstream host via `createEndpoint()` (`PACKAGE_ROUTE`, `OWNER_REPO_ROUTE`, or `NPM_PACKAGE_ROUTE`) – never accept user-controlled hosts.
-   **Small Payloads:** Bodies above `2 MB` are rejected; Project only needed fields via `pickFields()` or `projectFirstEntry()` (plus `extractKeys` on large objects).
-   **Defensive Transforms:** Accept real-world upstream formats descriptively without over-constraining them, ignore unused fields, and sanitize values with `readText()`, `readFiniteNumber()`, `formatVersion()`, `formatCount()`, and `formatLicense()` (`src/services/metrics.ts`) so missing or malformed data never renders `undefined`, `null`, `NaN`, or `[object Object]`.
-   **Standard Metric Keys:** Use canonical keys (`v` aliased `version`, `license` aliased `l`, `coverage` aliased `cov`, `prs` aliased `pr`/`pulls`/`pull-requests`, `commit` aliased `last-commit`, plus `stars`, `forks`, `issues`, `release`, `updated`, `rating`, `score`, `size`); `DEFAULT_METRIC_ALIASES` (`src/services/fetcher.ts`) wires global aliases automatically.
-   **Download Metric Keys:** `dd` (`/day`), `dw` (`/wk`), `dl` (`/mo`, aliased as `dm`), `dq` (`/90d`), `dy` (`/yr`), `dt` (total).
-   **URL Placeholders:** `{owner}` & `{target}` (per-segment), `{scope}` (`owner` without `@`), `{path}` (`[owner/]target`), `{id}` (`/` as `%2F`), `{npm}` & `{npm-id}` (`[@scope/]target`).

<br>

## <a href="#icons--tech-stack"><img src="https://svg.xul.is/icon/shapes?size=32&stroke=2" align="left" /></a>Icons & Tech Stack

Icons resolve from four bundled sets in `src/svg/icons.ts`:

-   **Lucide** (`lucide-static`) – UI stroke icons
-   **Simple Icons** (`@iconify-json/simple-icons`) – Brand and technology marks
-   **Devicon Plain** (`@iconify-json/devicon-plain`) – Developer tools and language symbols
-   **File Icons** (`@iconify-json/file-icons`) – File-type and ecosystem glyphs

**Policy:** PRs adding or removing icon libraries are not accepted (request missing icons upstream in [Lucide](https://github.com/lucide-icons/lucide), [Simple Icons](https://github.com/simple-icons/simple-icons), or [Devicon](https://github.com/devicons/devicon)). Shorthand aliases in `ICON_SLUG_ALIASES` (`src/svg/icons.ts`) and curated entries in `STACK_CATEGORIES` (`src/config/stack.ts`) for bundled icons are welcome.

<br>

## <a href="#code-style--gotchas"><img src="https://svg.xul.is/icon/shield-check?size=32&stroke=2" align="left" /></a>Code Style & Gotchas

-   **Strict Types:** No `any` (narrow `unknown`) and no `@ts-ignore` (only `@ts-expect-error` with a reason).
-   **Naming & Structure:** Descriptive variable names (no single-letter names except `i`, `j`, `n`), `is`/`has` prefixes for booleans, plain `function` declarations (no classes), sorted object keys, and JSDoc on exports.
-   **Comments & Prose:** Backtick code identifiers in comments, end standalone comments with `:` and inline comments with `.`, and use `–` / `…` instead of em dashes or `...`.
-   **Edge Bounds:** Defer heavy init until first use, bound user-keyed caches via `createLruCache` (`src/svg/shared.ts`), and sanitize display text with `prepareDisplayText`.
-   **Worker Entrypoint:** `src/index.ts` must only `export default app;` (extra exports break `workerd`).
-   **Encoding & CSP:** Literal `+` in route paths must be `%2B` (`+` decodes to a space); Changing `getHeadScriptBody()` (`src/site/components/PageLayout.tsx`) requires updating its `sha256-…` hash in `HTML_SECURITY_HEADERS` (`src/routes/http.ts`).

<br>

## <a href="#submitting-a-pull-request"><img src="https://svg.xul.is/icon/git-pull-request?size=32&stroke=2" align="left" /></a>Submitting a Pull Request

Branch from `main`, cover your changes with tests in `test/`, confirm `pnpm run check` passes cleanly, and open a PR with sample paths to preview (PRs are squash-merged into `main`). By contributing, you agree that your code is licensed under the [**MIT License**](LICENSE).
