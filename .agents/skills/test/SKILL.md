---
name: test
description: Guidelines and commands for running tests and maintaining the svg-api test suite.
---

# Test

Create, organize, run, and maintain the **vitest** suite in `test/` (`AGENTS.md` Section 4).

---

## 1. Architecture

Pure modules in `src/` and the Hono app (`app.request()`) run directly without a live Cloudflare account. Never call live upstream APIs: mock `fetch` via `vi.spyOn(globalThis, 'fetch')` (`restoreMocks` and `unstubGlobals` clean up automatically), call `resetUpstreamCaches()` (`src/services/fetcher.ts`) in `afterEach`, and use `installEdgeCacheStub()` / `createEdgeCacheStub()` (`test/helpers.ts`) for edge cache paths.

### Key Files

| File                    | Purpose                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| `test/helpers.ts`       | Shared helpers (`TEST_ENV`, ARIA extraction, guards, edge cache stubs, client-bundle evaluators) |
| `test/measure.test.ts`  | Text measurement, outline rendering (`src/svg/measure.ts`), and bounded LRU cache (`src/svg/shared.ts`) |
| `test/icons.test.ts`    | Bundled icon resolution, aliases, size-bounded cache, and ink bounds (`src/svg/icons.ts`) |
| `test/renderer.test.ts` | SSOT SVG rendering across elements, variants, widgets, ARIA labels, IDs, and DoS bounds (`src/svg/`) |
| `test/routes.test.ts`   | Entrypoint guard, Hono routes, `SVG_ROUTES`, query parsers, HTTP/cache headers, SEO & regressions |
| `test/services.test.ts` | Preset transforms, endpoint projections, error/rate-limit badges, coalescing, caching & redirects (`src/services/`) |
| `test/site.test.ts`     | Site HTML/a11y, metadata, navigation, versioned assets, client scripts, and OSS/docs drift guards |
| `test/builder.test.ts`  | Builder schema drift, client core parser round-trips, snippet parity, icon picker & builder links |
| `vitest.config.mts`     | Vitest config mirroring `tsconfig.json` aliases and `wrangler.jsonc` `Data`/`Text` loaders |

---

## 2. Test Organization

1.  **One File per Area:** Group by module area with `describe()`, follow `AGENTS.md` Section 6 style/comments, and put repeated setup in hoisted `function` helpers under `INTERNALS`.
2.  **Descriptive Titles:** `describe()` the unit/route and `it()` the exact behavior (e.g., `'returns 302 redirect when Sec-Fetch-Dest is document'`).
3.  **Positive & Negative Paths:** Cover valid inputs alongside fallbacks, errors, and escaping.
4.  **Regression Tests:** Name the bug (`'… (regression: <bug>)'`) and assert deterministic bounds (output size, capped-input parity, `fetch` count) rather than flaky wall-clock timings.
5.  **Test Lint Overrides:** Keep file-level disables minimal (e.g., `/* oxlint-disable typescript/no-non-null-assertion */`).

---

## 3. Commands

```bash
pnpm run test         # Single run
pnpm run test:watch   # Watch mode
pnpm run check        # Full validation + tests
```
