# Agent Guidelines for `svg-api`

When working on this repository, any AI agent or automated assistant must adhere strictly to the following rules to maintain the codebase's integrity, performance, readability, and correctness.

## 1. Package Manager

This project uses **pnpm** as its package manager. Always use `pnpm` (e.g., `pnpm i`, `pnpm run <script>`, `pnpm exec <tool>`, `pnpm dlx <tool>`). **Never** use `npm`, `npx`, or `yarn`.

## 2. Strict Typing

Everything must be meticulously and strictly type-hinted. Do not ever use `any` unless it is fundamentally impossible to type otherwise; Use `unknown` and narrow it instead. All code must be fully statically analyzable.

-   **Browser Scripts:** Website client and shared modules live in `src/site/client/**/*.ts` and `src/site/shared/**/*.ts`, are type-checked by `tsconfig.client.json` (part of `pnpm run type-check`), and are bundled by `pnpm run build:client` (`scripts/buildClient.ts`) into gitignored `dist/client/*.client.js`; They follow the same rules as Worker TypeScript modules.
-   **No `@ts-ignore` Comments:** `@ts-ignore` comments are forbidden. You must instead use `@ts-expect-error` with a descriptive reason comment (e.g., `// @ts-expect-error: Upstream response shape is untyped`). The ONLY exception is when `@ts-expect-error` itself fails because the error only occurs conditionally, and rewriting the code to bypass the error would decrease performance or reduce readability.

## 3. Performance & Lightweight Design

This service runs on Cloudflare Workers at the edge with a zero-cold-start target. **Performance is critical** – both startup time and per-request latency.

-   **Lazy Initialization:** Avoid eager computation at module load time. Defer heavy work (regex compilation, data structure construction) until first use where practical.
-   **Regex Best Practices:** Prefer non-backtracking patterns. Use possessive-style character classes with word-boundary lookaheads instead of relying on regex backtracking.
-   **Avoid Unnecessary Allocations:** Reuse objects and arrays where possible. Prefer `for` loops over `.map()/.filter()` chains when intermediate arrays aren't needed.
-   **DRY Principle (Don't Repeat Yourself):** Always strive to prevent redundant code and duplicate logic. Abstract repeated patterns into reusable helper functions (shared SVG primitives live in `src/svg/shared.ts`, service endpoint templates and projections in `src/services/endpoint.ts`, metric formatters and metric factories in `src/services/metrics.ts`, shared docs vocabulary in `src/site/glossary.ts`). When a feature depends on data produced by multiple stages (e.g., static routes, service presets, standalone icons), feed **all** sources into a single unified rendering and caching code path (the `src/svg/` renderers are the Single Source of Truth, and every documented preview is rendered through the live route table and dispatcher in `src/routes/svg.ts`).
-   **Dynamic Copy & Metadata (No Hardcoded Drift):** Whenever user-facing UI text, documentation descriptions, parameter tables, builder schemas, or SEO endpoints (`src/site/seo.ts`) mention specific counts, route patterns, parameter tokens, defaults, aliases, or numeric bounds governed by code, derive and format them dynamically from the canonical exported constants and registries (`SVG_ROUTES`, `SERVICES_CONFIG`, `DOCS_PAGES`, `BUILDER_PAGES`, theme/icon/renderer constants). Where exact enumeration is unnecessary, keep prose general so code changes never leave stale copy behind.
-   **Bundle Size:** Avoid adding heavyweight dependencies (such as WASM font parsers) – prefer small, focused utility functions and lookup tables written in-house.
-   **Bounded Memory, Output & CPU:** Every request input is untrusted, and a Worker isolate is long-lived with a small memory limit.
    -   **Caches:** In-isolate caches keyed by user input must be bounded by entry count **and** by total size; Use the shared LRU helpers (`createLruCache`, `readLruCache`, `writeLruCache` in `src/svg/shared.ts`) instead of hand-rolled `Map` caches.
    -   **Output Size:** Cap user-controlled lengths and counts before expensive work (text layout, ink measurement, icon bodies), and emit repeated SVG content once in `<defs>` and reference it with `<use>` (with content-addressed IDs, so several SVGs inlined on one page never collide).
    -   **Text:** Route user-supplied display text through `prepareDisplayText` (it replaces control and invisible characters, which Geist would draw as `.notdef` boxes) and sanitize numeric widget values in the renderer, whether they come from the query DSL or from upstream JSON.
-   **Upstream Service Presets:** Only documented, public, token-free `GET` JSON endpoints for developer ecosystems that are verified live (e.g., with `curl`) before writing a transform; Never scrape HTML or rely on undocumented internal web endpoints. Never let a request choose the upstream host (SSRF), build upstream URLs with the encoding URL templates of `createEndpoint()`, and do not add a preset whose correct metrics require multi-megabyte payloads for common targets (parsing them exceeds Worker CPU limits; Bodies above 2 MB are rejected); Prefer a smaller endpoint, or skip the metric, and keep only the needed fields with a `project` projection. See `CONTRIBUTING.md` (Adding a Service Preset) for the registration steps.

## 4. Validation & Testing

After making any code changes, you must validate them by running the full suite of type checks, linters, formatters, tests, and Wrangler dry-run verification:

```bash
pnpm run build:client && pnpm run type-check && pnpm run lint && pnpm run lint:md && pnpm run fmt && pnpm run test && pnpm exec wrangler deploy --dry-run
```

Fix all problems and warnings until they are completely resolved (zero errors, zero warnings, and zero lint issues). Use the `test` skill for testing guidelines and commands, and the `build` skill for local development server previewing, Wrangler verification, and deployment.

-   **Drift Guards Over Manual Checklists:** Automated drift tests in `test/` enforce parity across `SVG_ROUTES`, `SERVICES_CONFIG`, `src/site/`, `/builder/:kind`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `.github/`. Keep live showcase previews and builder UI interactions aligned with visual changes, and add a drift assertion whenever introducing a new code-governed list or limit in prose.
-   **Regression Tests for Bug Fixes:** Every bug fix **must** include a test that reproduces the original bug and verifies the fix before considering the fix complete. This prevents regressions and ensures the same problem never resurfaces.

## 5. Ask, Don't Assume

If you run into anything you are not sure about (ambiguous requirements, visual/color decisions, architectural changes, edge cases), **ask first**. Do not make assumptions about the desired look or behavior.

## 6. Code Structure, Style & Readability

-   **Plain Functions:** Write plain functions (`function` declarations) and module-level constants – no classes. Pass shared state as a `context`/`options` object when needed.
-   **Worker Entrypoint (`src/index.ts`):** Export **only** `export default app;` from `src/index.ts`. Never export named constants, variables, or helper functions from the Worker entrypoint module; `workerd` validates every named export on the entrypoint as a Worker handler or RPC entrypoint and fails to start if a non-function value is exported.
-   **Module Headers:** Start every module (except type-only barrel files) with a JSDoc header: `Title – Description` (capitalized after the en dash), or a short sentence, followed by a blank ` *` line and details if needed.
-   **Logical Placement & Sections:** Do not mindlessly append new code to the end of a file. Group module contents with 90-character section dividers, title centered in uppercase (e.g., `// -------------------------------------- PUBLIC API -------------------------------------`). Use the sections `TYPES`, `CONSTS`, `REGEX PATTERNS`, `INTERNALS`, `PUBLIC API`, and `MAIN` (in that order, as needed). In test files or fixture regions, 90-character block-comment separators (`/********************************* Section Title *********************************/`) or 65-character internal separators may also be used.
-   **Imports Placement & Path Aliases:** Always place imports at the top of the file. Use the `@/*` path alias for imports from `src/`.
-   **Types:** Shared/exported types live in `src/types/` (one file per domain, re-exported from `src/types/index.ts`) and are imported with separate `import type { … }` statements, never inline `type` specifiers. Module-private types stay in the module's `TYPES` section. Use `interface` for object types.
-   **Private Constants & Regex Constants:** Define module-level constants, lookup tables, and regex patterns in `CONSTS` / `REGEX PATTERNS` below imports. Name `RegExp` constants `<NAME>_RX` and document each with `/** Matches … */`. Don't add the `u` flag unless the pattern needs it.
-   **Spacing & Formatting:** Keep the code "spacy" and readable, matching the repository's Oxc formatting conventions (`.oxfmtrc.json`).
-   **Naming Conventions:**
    -   **Descriptive Variable Names (CRITICAL):** Single-letter variables (e.g., `x`, `c`, `r`) are strictly banned. You MUST use fully descriptive variable names (e.g., `char`, `context`, `radius`). The ONLY exceptions are `i` (and rarely `j`) for loop indices, and `n` for mathematical counts.
    -   **Predicates & Booleans:** Predicate functions and boolean properties must always start with `is` or `has` (e.g., `isDocumentNavigation`, `isButton`, `hasDot`, `hasSparkline`).
    -   **Verb-First for Actions & Getters:** Functions performing actions or fetching data should start with an active verb (e.g., `renderBadge`, `resolveIcon`, `measureTextWidth`).
-   **Variables & Loops:** Initialize `let` variables that may stay unset explicitly with `undefined` (`let value: T | undefined = undefined;`), and use `i += 1` instead of `i++`.
-   **Lint Order:** Define functions before using them (`no-use-before-define`), so internal helpers and builders go into `INTERNALS` above `PUBLIC API` and `MAIN`.
-   **Organization:** When introducing large data structures (like hardcoded maps, theme palettes, or service configs), keep them strictly organized and structured. Default to sorting keys alphabetically unless a specific logical order is required.
-   **Maintain Documentation Integrity:** Preserve all existing comments and docstrings that are unrelated to your code changes, unless the user specifies otherwise.
-   **Documentation (JSDoc & Prose):** Document every exported function, constant, and every interface property with JSDoc (`/** … */`). Align `@param` descriptions 3 spaces after the longest parameter name (`@param name   Description`). Document units in the JSDoc instead of the name. Never use em dashes (`—`) in prose, UI copy, documentation, JSDoc, comments, or responses; Use `; `, start a new sentence, or use an en dash (`–`) instead. Use `e.g.,` with a comma, and use the single Unicode ellipsis character `…` instead of three dots `...` in prose, JSDoc, and comments.
-   **Self-Contained Comments & JSDocs (CRITICAL):** Never write comments or JSDocs that must be updated when code elsewhere changes. Do not enumerate volatile union members, supported element kinds, route/page lists, icon sets, preset metrics, item counts, default values, numeric bounds defined elsewhere, or cross-file consumer lists in comments or JSDocs; Describe purpose and contract in general, self-contained terms (or reference the canonical constant identifier in backticks when needed).
-   **Code Comments (`//`, `/* … */`, `#`) (CRITICAL):**
    -   **Inline Code:** Always wrap variable names, parameters, properties, selectors, paths, and inline code expressions inside comments in backticks `` ` `` (never normal quotes).
    -   **Comment Length:** Prefer single-line comments; If a comment must span multiple lines, keep it to a maximum of **two lines** (max 2 lines).
    -   **Standalone Comments (Own Line, Describing Following Code):** Single-line comments written on their own line to describe upcoming code MUST end with a colon `:` (e.g., `// Check cache; skip if unchanged:`). For multiline comments (max 2 lines), preceding lines may end in a period `.` (or wrap mid-sentence), and **only the last line** ends with a colon `:`. Replace all `:`s inside a standalone comment's prose body with `;`s so `:` only appears at the very end introducing the following code (preserve literal `:` inside backticked code spans like `` `/builder/:kind` `` or `` `align: 'center'` ``).
        -   **Exceptions:** Short ~1–3 word section-title comments in stylesheets (e.g., `/* Layout Dimensions */`), standalone comments inside an empty `{}` block where no code follows (end with `.`, e.g., `// Edge cache writes are best-effort.`), and compiler/linter pragmas (`// @ts-expect-error: …`, `// oxlint-disable-next-line … -- …`, `/* oxlint-disable … */`).
    -   **End-of-Line (Inline) Comments:** If a comment is written at the end of a code line (behind code on the same line), always end it with a period `.` (e.g., `return fallback; // Use default when unset.`), unless it is a short ~1–2 word title-like label (e.g., `// Dodger Blue`, `// RGB`).
    -   **Numbered Step Comments:** Always format numbered step comments with square brackets `[1]`, `[2]`, `[3]`, etc. (e.g., `// [1] Parse input:`, `// [2] Validate options:`), NEVER with trailing periods like `1.`, `2.`.

## 7. Rule & Skill Authoring (Single Source of Truth)

To keep agent guidelines clean, maintainable, and free of contradictions, adhere strictly to the Single Source of Truth (SSOT) principle:

-   **Define Once:** Every rule, standard, or guideline must be defined in exactly ONE canonical location:
    -   **`AGENTS.md`:** Repository-wide core policies (strict typing, performance, code structure, naming conventions, validation).
    -   **Skills (`.agents/skills/<skill>/SKILL.md`):** Specialized domain-specific workflows (`test` for test suite guidelines; `build` for preview generation, Wrangler dry-run verification, and Cloudflare deployment).
-   **Reference, Never Duplicate:** When a rule defined in one location also applies in another, do NOT duplicate or re-explain the rule. Instead, reference and point directly to its canonical definition.
-   **Synchronize References:** If a canonical rule is updated or moved, verify that all external references pointing to it are kept accurate.
