# Agent Guidelines for `svg-api`

When working on this repository, any AI agent or automated assistant must adhere strictly to the following rules to maintain the codebase's integrity, performance, readability, and correctness.

## 1. Package Manager

This project uses **pnpm** as its package manager. Always use `pnpm` (e.g., `pnpm i`, `pnpm run <script>`, `pnpm exec <tool>`, `pnpm dlx <tool>`). **Never** use `npm`, `npx`, or `yarn`.

## 2. Strict Typing

Everything must be meticulously and strictly type-hinted. Do not ever use `any` unless it is fundamentally impossible to type otherwise; Use `unknown` and narrow it instead. All code must be fully statically analyzable.

-   **No `@ts-ignore` Comments:** `@ts-ignore` comments are forbidden. You must instead use `@ts-expect-error` with a descriptive reason comment (e.g., `// @ts-expect-error: Upstream response shape is untyped`). The ONLY exception is when `@ts-expect-error` itself fails because the error only occurs conditionally, and rewriting the code to bypass the error would decrease performance or reduce readability.

## 3. Performance & Lightweight Design

This service runs on Cloudflare Workers at the edge with a zero-cold-start target. **Performance is critical** – both startup time and per-request latency.

-   **Lazy Initialization:** Avoid eager computation at module load time. Defer heavy work (regex compilation, data structure construction) until first use where practical.
-   **Regex Best Practices:** Prefer non-backtracking patterns. Use possessive-style character classes with word-boundary lookaheads instead of relying on regex backtracking.
-   **Avoid Unnecessary Allocations:** Reuse objects and arrays where possible. Prefer `for` loops over `.map()/.filter()` chains when intermediate arrays aren't needed.
-   **DRY Principle (Don't Repeat Yourself):** Always strive to prevent redundant code and duplicate logic. Abstract repeated patterns into reusable helper functions. When a feature depends on data produced by multiple stages (e.g., static routes, status presets, service presets, standalone icons), feed **all** sources into a single unified rendering and caching code path (`renderBadge` and `renderIcon` as the Single Source of Truth).
-   **Bundle Size:** Avoid adding heavyweight dependencies (such as WASM font parsers) – prefer small, focused utility functions and lookup tables written in-house.

## 4. Validation & Testing

After making any code changes, you must validate them by running the full suite of type checks, linters, formatters, tests, and Wrangler dry-run verification:

```bash
pnpm run type-check; pnpm run lint; pnpm run fmt; pnpm run test; pnpm exec wrangler deploy --dry-run
```

Fix all problems and warnings until they are completely resolved (zero errors, zero warnings, and zero lint issues). Use the `test` skill for testing guidelines and commands, and the `build` skill for local development server previewing, Wrangler verification, and deployment.

-   **Keep Homepage, Docs, Previews & README Synchronized:** Whenever routes, query parameters, variants, service presets, icons, or visual behaviors are added or modified, you **must** update the homepage (`/`), dedicated documentation pages (`/docs/badges`, `/docs/services`, `/docs/icons`, `/docs/stack`, `/docs/quotes`, `/docs/colors`), parameter tables, live preview cards, and expandable Markdown snippets in `src/preview/` (`src/preview/catalog.ts`, `src/preview/page.ts`, `src/preview/layout.ts`), as well as `README.md` for local development instructions and owner-restricted `/badge/gh/*` badges.
-   **Regression Tests for Bug Fixes:** Every bug fix **must** include a test that reproduces the original bug and verifies the fix before considering the fix complete. This prevents regressions and ensures the same problem never resurfaces.

## 5. Ask, Don't Assume

If you run into anything you are not sure about (ambiguous requirements, visual/color decisions, architectural changes, edge cases), **ask first**. Do not make assumptions about the desired look or behavior.

## 6. Code Structure, Style & Readability

-   **Plain Functions:** Write plain functions (`function` declarations) and module-level constants – no classes. Pass shared state as a `context`/`options` object when needed.
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
-   **Documentation & Comments:** Document every exported function, constant, and every interface property with JSDoc. Align `@param` descriptions 3 spaces after the longest parameter name (`@param name   Description`). Document units in the JSDoc instead of the name. Comments are full sentences ending with a period; Join clauses with `; ` followed by a capital letter (e.g., `// Check cache; Skip if unchanged.`). Use `e.g.,` with a comma.

## 7. Rule & Skill Authoring (Single Source of Truth)

To keep agent guidelines clean, maintainable, and free of contradictions, adhere strictly to the Single Source of Truth (SSOT) principle:

-   **Define Once:** Every rule, standard, or guideline must be defined in exactly ONE canonical location:
    -   **`AGENTS.md`:** Repository-wide core policies (strict typing, performance, code structure, naming conventions, validation).
    -   **Skills (`.agents/skills/<skill>/SKILL.md`):** Specialized domain-specific workflows (`test` for test suite guidelines; `build` for preview generation, Wrangler dry-run verification, and Cloudflare deployment).
-   **Reference, Never Duplicate:** When a rule defined in one location also applies in another, do NOT duplicate or re-explain the rule. Instead, reference and point directly to its canonical definition.
-   **Synchronize References:** If a canonical rule is updated or moved, verify that all external references pointing to it are kept accurate.

