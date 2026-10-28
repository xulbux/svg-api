# Agent Guidelines for `svg-api`

Follow these rules strictly across the repository.

## 1. Package Manager

Always use **pnpm** (e.g., `pnpm i`, `pnpm run <script>`, `pnpm exec <tool>`, `pnpm dlx <tool>`). **Never** use `npm`, `npx`, or `yarn`.

## 2. Strict Typing

All code must be strictly typed and statically analyzable. Never use `any` (use `unknown` and narrow it).

-   **Browser Scripts:** Website client and shared modules live in `src/site/client/**/*.ts` and `src/site/shared/**/*.ts`, are type-checked by `tsconfig.client.json` (`pnpm run type-check`), and bundle via `pnpm run build:client` (`scripts/buildClient.ts`) into gitignored `dist/client/*.client.js` under the same rules as Worker modules.
-   **No `@ts-ignore`:** Forbidden; Use `@ts-expect-error` with a reason (e.g., `// @ts-expect-error: Upstream response shape is untyped`), unless an error only occurs conditionally and avoiding it hurts performance or readability.

## 3. Performance & Lightweight Design

Runs on Cloudflare Workers at the edge with a zero-cold-start target – startup time and per-request latency are critical.

-   **Lazy Initialization:** Defer heavy work (regex compilation, data structures) until first use instead of module load time.
-   **Regex Best Practices:** Prefer non-backtracking patterns with character classes and lookaheads over backtracking.
-   **Avoid Unnecessary Allocations:** Reuse objects/arrays where practical and prefer `for` loops over `.map()/.filter()` chains when intermediate arrays aren't needed.
-   **DRY & Unified Pipeline:** Abstract repeated patterns into shared helpers (SVG primitives in `src/svg/shared.ts`, endpoint templates/projections in `src/services/endpoint.ts`, metric formatters/factories in `src/services/metrics.ts`, docs vocabulary in `src/site/glossary.ts`). Feed multi-stage data into one rendering/caching path (`src/svg/` renderers are the SSOT; every documented preview renders through `SVG_ROUTES` in `src/routes/svg.ts`).
-   **Dynamic Copy & Metadata (No Hardcoded Drift):** Derive counts, route patterns, parameter tokens, defaults, aliases, and bounds dynamically from canonical exports (`SVG_ROUTES`, `SERVICES_CONFIG`, `DOCS_PAGES`, `BUILDER_PAGES`, theme/icon/renderer constants), or keep prose general so code changes never leave stale copy.
-   **Bundle Size:** Avoid heavyweight dependencies (e.g., WASM font parsers) in favor of small in-house utilities and lookup tables.
-   **Bounded Memory, Output & CPU:** Treat every input as untrusted inside a long-lived, memory-constrained Worker isolate:
    -   **Caches:** Bound user-keyed caches by entry count **and** total size via `createLruCache`, `readLruCache`, and `writeLruCache` (`src/svg/shared.ts`) – never hand-rolled `Map` caches.
    -   **Output Size:** Cap user-controlled lengths/counts before expensive work (text layout, ink measurement, icon bodies), and deduplicate repeated SVG markup in `<defs>` + `<use>` with content-addressed IDs.
    -   **Text:** Sanitize display text via `prepareDisplayText` (replaces control/invisible characters that render `.notdef` boxes) and sanitize numeric widget values in the renderer.
-   **Upstream Service Presets:** Verify endpoints live (e.g., with `curl`) first, and follow all preset, registration, and SSRF/payload rules in `CONTRIBUTING.md` (*Adding a Service Preset* and *Preset Rules*).

## 4. Validation & Testing

Validate every code change with zero errors, warnings, or lint issues (client bundle, format, lint, Markdown lint, type-check, tests, and Wrangler dry-run):

```bash
pnpm run fmt && pnpm run lint && pnpm run check
```

See the `test` skill for test guidelines and the `build` skill for local previewing, Wrangler verification, and deployment.

-   **Drift Guards:** Automated tests in `test/` enforce parity across `SVG_ROUTES`, `SERVICES_CONFIG`, `src/site/`, `/builder/:kind`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `.github/`. Keep previews and builder interactions aligned with visual changes, and add a drift assertion whenever introducing a code-governed list or limit in prose.
-   **Regression Tests:** Every bug fix **must** include a test reproducing the bug and verifying the fix.

## 5. Ask, Don't Assume

Ask before assuming on ambiguous requirements, visual/color decisions, architectural changes, or edge cases.

## 6. Code Structure, Style & Readability

-   **Plain Functions:** Use `function` declarations and module-level constants – no classes. Pass shared state via `context`/`options` objects.
-   **Worker Entrypoint (`src/index.ts`):** Export **only** `export default app;` (`workerd` validates every named export as a Worker/RPC entrypoint and fails on non-function exports).
-   **Module Headers:** Start every module (except type-only barrel files) with a JSDoc header (`Title – Description`, capitalized after `–`), followed by a blank ` *` line and details if needed.
-   **Logical Placement & Sections:** Group module contents with 90-character uppercase centered dividers (e.g., `// -------------------------------------- PUBLIC API -------------------------------------`) in order: `TYPES`, `CONSTS`, `REGEX PATTERNS`, `INTERNALS`, `PUBLIC API`, `MAIN`. Test/fixture files may also use 90-character `/********************************* Section Title *********************************/` or 65-character internal separators.
-   **Imports & Aliases:** Place imports at the top of the file and use `@/*` for `src/` imports.
-   **Types:** Put shared/exported types in `src/types/` (one file per domain, re-exported from `src/types/index.ts`) and import via separate `import type { … }` statements (never inline `type` specifiers). Keep private types in `TYPES`; use `interface` for object types.
-   **Constants & Regexes:** Place constants, lookup tables, and `<NAME>_RX` regexes (each documented with `/** Matches … */`) in `CONSTS` / `REGEX PATTERNS`; omit the `u` flag unless required.
-   **Formatting & Lint Order:** Follow `.oxfmtrc.json` spacing, define functions before use (`no-use-before-define`, helpers in `INTERNALS` above `PUBLIC API` / `MAIN`), and sort large maps/configs alphabetically unless logical order is required.
-   **Naming & Loops:**
    -   **Descriptive Names (CRITICAL):** Single-letter names (e.g., `x`, `c`, `r`) are banned except `i`/`j` (loop indices) and `n` (mathematical counts); Use descriptive names (e.g., `char`, `context`, `radius`).
    -   **Booleans & Actions:** Prefix predicates/booleans with `is` or `has` (e.g., `isDocumentNavigation`, `hasDot`) and start action/getter functions with an active verb (e.g., `renderBadge`, `resolveIcon`).
    -   **Variables & Loops:** Initialize potentially unset `let` bindings explicitly (`let value: T | undefined = undefined;`) and use `i += 1` instead of `i++`.
-   **Documentation & Prose:** Preserve unrelated comments/docstrings. Document every exported function, constant, and interface property with JSDoc (`/** … */`), align `@param` descriptions 3 spaces after the longest parameter name, and put units in JSDoc rather than names. Never use em dashes (`—`); Use `; `, a new sentence, or an en dash (`–`). Use `e.g.,` (with comma) and `…` (never `...`).
-   **Self-Contained Comments & JSDocs (CRITICAL):** Never enumerate volatile union members, element kinds, route/page lists, icon sets, preset metrics, counts, defaults, bounds defined elsewhere, or consumer lists; Describe contracts in general terms (or reference canonical constants in backticks).
-   **Code Comments (`//`, `/* … */`, `#`) (CRITICAL):**
    -   **Inline Code & Length:** Wrap identifiers, parameters, properties, selectors, paths, and expressions in backticks `` ` `` (never quotes). Prefer 1 line (**max 2 lines**).
    -   **Standalone Comments (Own Line):** Must end with `:` on the final line (e.g., `// Check cache; skip if unchanged:`). Preceding lines of a 2-line comment may end with `.` or wrap; Replace prose `:`s with `;`s (preserving `:` inside backticks like `` `/builder/:kind` ``).
        -   **Exceptions:** Short ~1–3 word CSS section titles (`/* Layout Dimensions */`), comments in empty `{}` blocks (end with `.`), and compiler/linter pragmas (`// @ts-expect-error: …`, `// oxlint-disable-next-line … -- …`).
    -   **End-of-Line Comments:** End with `.` (e.g., `return fallback; // Use default when unset.`), unless a ~1–2 word label (`// RGB`).
    -   **Numbered Steps:** Use `[1]`, `[2]`, `[3]` (e.g., `// [1] Parse input:`), never `1.`, `2.`.

## 7. Rule & Skill Authoring (Single Source of Truth)

-   **Define Once:** Core repository policies live in `AGENTS.md`; domain workflows live in `.agents/skills/<skill>/SKILL.md` (`test` and `build`).
-   **Reference, Never Duplicate:** Point directly to canonical definitions instead of repeating them, and keep cross-references synchronized when rules move.
