---
name: test
description: Guidelines and commands for running tests and maintaining the svg-api test suite.
---

# Test

In accordance with the validation policy in `AGENTS.md` Section 4, use this skill to create, organize, run, and maintain tests for `svg-api`.

---

## 1. Architecture

Tests use **vitest** and are located in the `test/` directory. Pure modules in `src/` (`measureTextWidth`, `resolveIcon`, `renderBadge`, `renderIcon`, `resolveColor`, `formatCompactNumber`) and the Hono application (`app.request()`) can be tested directly without requiring a live Cloudflare account.

### Key Files

| File                    | Purpose                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| `test/measure.test.ts`  | Text width calculation tests (`src/svg/measure.ts`)                              |
| `test/icons.test.ts`    | Lucide & Simple Icons resolution tests (`src/svg/icons.ts`)                      |
| `test/renderer.test.ts` | SSOT SVG rendering across all 6 badge variants, standalone icons, and widgets    |
| `test/routes.test.ts`   | Hono route handling for `badge.xul.is` and `icon.xul.is`, overrides & redirects  |
| `vitest.config.mts`     | Vitest config with `@/` path alias                                               |

---

## 2. Test Organization

1.  **One File per Module Area:** Group tests by module area using `describe()` blocks.
2.  **Same Code Style:** Test files follow the code style in `AGENTS.md` Section 6 (module header, descriptive variable names, no single-letter variables except `i`/`j`/`n`).
3.  **Descriptive Names:** `describe()` the function or route, `it()` the specific behavior being verified:
    -   ✅ `'returns 302 redirect when Sec-Fetch-Dest is document'`
    -   ❌ `'test redirect'`
4.  **Both Positive and Negative Assertions:** Test both valid inputs and fallback/error handling (e.g., unknown colors, restricted owners, invalid icons, XML escaping).
5.  **Regression Tests:** Every bug fix must come with a test that reproduces the original bug.

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
pnpm run type-check; pnpm run lint; pnpm run fmt; pnpm run test; pnpm run preview:export
```

---

## 4. Lint Rules in Test Files

Test files may legitimately use patterns that are disallowed in production code. Use file-level oxlint disable comments when necessary:

```typescript
/* oxlint-disable typescript/no-non-null-assertion */
```

Keep these to the minimum necessary set of rules.

