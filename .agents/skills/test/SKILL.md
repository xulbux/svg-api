---
name: test
description: Guidelines and commands for running tests and maintaining the svg-api test suite.
---

# Test

In accordance with the validation policy in `AGENTS.md` Section 4, use this skill to create, organize, run, and maintain tests for `svg-api`.

---

## 1. Architecture

Tests use **vitest** and are located in the `test/` directory. Pure modules in `src/` (`measureTextWidth`, `resolveIcon`, `renderBadge`, `renderButton`, `renderIcon`, `renderStack`, `renderQuote`, `resolveColor`, `formatCompactNumber`, the `src/routes/` parsers and HTTP helpers, the `src/preview/` page renderers, the builder schemas in `src/routes/schema.ts`) and the Hono application (`app.request()`) can be tested directly without requiring a live Cloudflare account. Upstream APIs are never called: Mock `fetch` with `vi.spyOn(globalThis, 'fetch')` (mocks are restored automatically via `restoreMocks`), and call `resetUpstreamCaches()` (`src/services/fetcher.ts`) in `afterEach` so the in-isolate memory cache never leaks between tests. Edge cache paths are tested with `createEdgeCacheStub()` from `test/helpers.ts` (`vi.stubGlobal('caches', { default: stub.cache })`).

### Key Files

| File                    | Purpose                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| `test/helpers.ts`       | Shared test helpers (`TEST_ENV`, `ARIA_LABEL_RX`, `extractAriaLabel`, `createEdgeCacheStub`); Reuse them instead of local copies |
| `test/measure.test.ts`  | Text width calculation, cached and uncached outline rendering (`src/svg/measure.ts`), and the shared count- and size-bounded LRU cache (`src/svg/shared.ts`) |
| `test/icons.test.ts`    | Lucide, Simple Icons & Devicon Plain resolution, aliases, the size-bounded icon cache, and ink bounds (`src/svg/icons.ts`) |
| `test/renderer.test.ts` | SSOT SVG rendering across badge/button variants, standalone icons, stacks, quotes, widgets, accessible labels, content-addressed IDs, size/DoS bounds, and docs drift guards |
| `test/routes.test.ts`   | Hono routes, the route table and dispatcher (`/badge/*`, `/button/*`, `/btn/*`, `/icon/*`, `/stack/*`, `/quote/*`), query DSL parsers, HTTP helpers (`src/routes/http.ts`), response headers, normalized edge cache keys, error badges, docs pages & route regressions |
| `test/services.test.ts` | Every service preset transform, endpoint URL templates & projections, request validation, upstream error, size-cap, and rate-limit badges, coalescing, negative edge caching, the memory cache size budget, caching & redirects (`src/services/`) |
| `test/preview.test.ts`  | Documentation website HTML validity, accessibility, head metadata, header tabs, grouped sidebars, pager order, versioned assets, stylesheets, client script guards (theme, preview background picker), and docs drift guards (`src/preview/`) |
| `test/builder.test.ts`  | Builder schema drift guards, the builder client core (evaluated from `builder.client.js` without a DOM) round-tripped through the route parser, snippet token parity with the server, icon picker index/assets and slug resolution parity with `resolveIcon`, and "Open in Builder" links that must render identical SVGs |
| `vitest.config.mts`     | Vitest config with `@/` path alias, `.ttf` loader, and `restoreMocks`            |

---

## 2. Test Organization

1.  **One File per Module Area:** Group tests by module area using `describe()` blocks.
2.  **Same Code Style:** Test files follow the code style in `AGENTS.md` Section 6 (module header, descriptive variable names, no single-letter variables except `i`/`j`/`n`).
3.  **Descriptive Names:** `describe()` the function or route, `it()` the specific behavior being verified:
    -   ✅ `'returns 302 redirect when Sec-Fetch-Dest is document'`
    -   ❌ `'test redirect'`
4.  **Both Positive and Negative Assertions:** Test both valid inputs and fallback/error handling (e.g., unknown colors, restricted owners, invalid icons, XML escaping).
5.  **Regression Tests:** Required for every bug fix (see `AGENTS.md` Section 4). Name the original bug in the title (`'… (regression: <bug>)'`). For performance and DoS fixes, assert deterministic bounds (output size, identical output for over-long vs. capped input, number of `fetch` calls) instead of wall-clock timings, which are flaky in CI.
6.  **Shared Helpers:** Repeated setup goes into hoisted `function` helpers in the file's `INTERNALS` section (e.g., `mockUpstream`, `requestBadge`), not into arrow functions inside `it()` blocks.

---

## 3. Running Tests

### Single Run

```bash
pnpm run test
```

### Watch Mode (re-runs on file save)

```bash
pnpm run test:watch
```

### Full Validation + Tests

```bash
pnpm run check
```

---

## 4. Lint Rules in Test Files

Test files may legitimately use patterns that are disallowed in production code. Use file-level oxlint disable comments when necessary:

```typescript
/* oxlint-disable typescript/no-non-null-assertion */
```

Keep these to the minimum necessary set of rules.
