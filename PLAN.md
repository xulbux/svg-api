# Implementation Plan: `badge.xul.is` — Dynamic SVG Badge & Button Engine

## 1. Project Overview & Goals

Build a high-performance, zero-cold-start SVG badge and micro-button generator deployed to Cloudflare Workers on `badge.xul.is` (and short alias `b.xul.is`).

### Core Capabilities

1.  **Modern Dark-Native Visuals**: Opaque dark-slate base (`#0f1117` / `#141821`) with hairline inner highlights (`1px`), subtle vertical gradients, and curated theme tokens so badges look crisp on both dark and light backgrounds without fragile OS media-query mismatches.
2.  **Six Visual Variants (`v=`)**:
    -   `v=1` (Default): **Primary Badge** (`22px` height) — dark label section + vibrant gradient value capsule.
    -   `v=2`: **Secondary Badge** (`22px` height) — unified dark pill with colored `1px` border and tinted (`16%` opacity) value capsule with bright accent text.
    -   `v=3`: **Tertiary Badge** (`22px` height) — understated neutral border (`#262c3a`), muted label, accent-colored value text.
    -   `v=b1`: **Primary Button** (`26px` height) — full-bleed vibrant gradient pill, top inner bevel highlight, bold icon + text.
    -   `v=b2`: **Secondary Button** (`26px` height) — dark pill with `14%` color wash, glowing colored border, accent icon + crisp white text.
    -   `v=b3`: **Tertiary Button** (`26px` height) — minimal dark button with neutral border, subtle inner highlight, colored icon + white text.
3.  **Smart Document Redirects**:
    -   Inspect request headers (`Sec-Fetch-Dest` and `Accept`).
    -   When loaded inside `<img src="...">` (`Sec-Fetch-Dest: image`), return `Content-Type: image/svg+xml`.
    -   When visited directly or clicked via a self-link in Markdown (`Sec-Fetch-Dest: document` or `Accept: text/html`), return `302 Found` to the resolved destination URL (either `?r=` query param or the preset's configured `redirectUrl`).
4.  **Declarative Service & Special Element Config (`src/config/services.ts`)**:
    -   Single configuration file defining all external services (`gh`, `pypi`, `status`, etc.), upstream API endpoints, JSON transformers, redirect URLs, and **special visual elements**:
        -   **Pulsing Status Dot (`dot`)**: Maps API states or preset keys to animated glowing SVG dots (e.g. `{ green: 'online', amber: 'degraded', red: 'offline' }`).
        -   **Mini Sparkline (`sparkline`)**: Renders an inline `38×12px` `<polyline>` trend graph inside the badge for time-series metrics (e.g. GitHub commit activity).
5.  **Owner Lock & Allowlist**:
    -   Static badges (`/:label` and `/:label/:value`) are public since they make zero upstream API calls.
    -   API-backed service presets (`/gh/*`, `/pypi/*`) default to the owner's configured username and validate any explicit owner/package against an allowlist in `src/config/services.ts` to protect upstream rate limits.
6.  **Two-Tier Edge Caching**:
    -   **Tier 1 (Upstream JSON Cache)**: Caches raw upstream API JSON responses in `caches.default` so multiple badges for the same repo (`stars`, `forks`, `issues`, `license`) share a single upstream API request.
    -   **Tier 2 (Rendered SVG Cache)**: Caches final SVG responses at the Cloudflare edge (`s-maxage=600, stale-while-revalidate=86400`).
7.  **SSOT Live Preview Studio (`GET /preview`)**:
    -   Built-in HTML showcase route calling the exact same `renderBadge()` function used in production, allowing instant visual tweaking on both dark and light canvases during `wrangler dev`.

---

## 2. Tech Stack & Initialization

### Commands to Initialize

```bash
pnpm add hono lucide-static simple-icons
pnpm add -D @cloudflare/workers-types @types/node oxfmt oxlint tsx typescript vitest wrangler
```

### `package.json`

```json
{
  "name": "badge",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev",
    "fmt": "oxfmt",
    "fmt:check": "oxfmt --check",
    "lint": "oxlint --fix",
    "lint:check": "oxlint",
    "preview:export": "tsx scripts/exportPreview.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "type-check": "tsc --noEmit"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "target": "ES2023",
    "types": ["@cloudflare/workers-types", "node"]
  },
  "exclude": ["node_modules", "dist", ".wrangler"],
  "include": ["src/**/*.ts", "scripts/**/*.ts", "test/**/*.ts", "*.config.*"]
}
```

### `wrangler.jsonc` (Cloudflare Configuration for `badge.xul.is` & `b.xul.is`)

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "xul-badge",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-15",
  "upload_source_maps": true,
  "workers_dev": false,
  "routes": [
    {
      "pattern": "badge.xul.is",
      "custom_domain": true
    },
    {
      "pattern": "b.xul.is",
      "custom_domain": true
    }
  ],
  "vars": {
    "DEFAULT_GH_OWNER": "xulbux",
    "ALLOW_PREVIEW_IN_PROD": "true"
  }
}
```

---

## 3. Directory Structure

```text
.
├── .agents/
│   ├── AGENTS.md               # Repository-wide coding, typing, and validation rules
│   └── skills/
│       ├── build/SKILL.md      # Preview generation, bundle check, and Worker deploy skill
│       └── test/SKILL.md       # Vitest test suite guidelines and commands
├── .oxfmtrc.json               # Oxc formatter configuration
├── .oxlintrc.json              # Oxc linter configuration
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── vitest.config.mts
├── wrangler.jsonc
├── scripts/
│   └── exportPreview.ts        # Generates standalone preview.html using SSOT renderer
├── src/
│   ├── index.ts                # Hono router, redirect detector, edge cache wrapper
│   ├── config/
│   │   ├── theme.ts            # Named color tokens & variant style definitions
│   │   └── services.ts         # Single declarative config for GitHub, PyPI, Status, etc.
│   ├── preview/
│   │   └── page.ts             # Interactive /preview HTML studio route
│   ├── services/
│   │   └── fetcher.ts          # Upstream API fetcher with Tier-1 JSON edge caching
│   ├── svg/
│   │   ├── icons.ts            # Lucide (2.25px stroke) + Simple Icons path resolver
│   │   ├── measure.ts          # Fast character-width lookup table for accurate SVG widths
│   │   └── renderer.ts         # SSOT SVG generator (variants 1..3, b1..b3, dots, sparklines)
│   └── types/
│       ├── badge.ts            # Badge rendering and icon resolution interfaces
│       ├── index.ts            # Barrel re-exports for all shared types
│       ├── service.ts          # Service preset, metric result, and Worker Env interfaces
│       └── theme.ts            # Theme palette, variant, and status dot types
└── test/
    ├── icons.test.ts           # Lucide & Simple Icons resolution tests
    ├── measure.test.ts         # Text width lookup and scaling tests
    ├── renderer.test.ts        # SSOT SVG rendering & preview HTML tests
    └── routes.test.ts          # Hono routes, redirects, and service preset tests
```

---

## 4. URL Specification & Query Parameters

### Query Parameters (Optional on all routes)

| Param | Values | Description |
| :--- | :--- | :--- |
| `c` | `indigo` \| `violet` \| `emerald` \| `rose` \| `amber` \| `cyan` \| `sky` \| `slate` \| `red` \| `green` | Named theme color token. Defaults to preset's default color or `indigo`. |
| `v` | `1` \| `2` \| `3` \| `b1` \| `b2` \| `b3` | Visual variant (`1-3` = badge styles, `b1-b3` = button styles). Defaults to `1` (or `b1` for 1-segment static badges). |
| `i` | `<icon-name>` \| `none` | Lucide icon slug (e.g. `sparkles`, `star`, `terminal`, `book-open`) or Simple Icons slug (`github`, `pypi`, `archlinux`, `rust`, `python`). Pass `none` to hide preset default icon. |
| `r` | `<url>` | Custom redirect destination when visited directly as a document. |
| `dot` | `green` \| `amber` \| `red` \| `cyan` | Adds an animated pulsing status dot to any badge. |
| `l` | `<string>` | Overrides the default left-side label on service preset badges. |

### Route Table

1.  **`GET /preview`**
    Renders the live interactive HTML preview sheet showing all variants, colors, icons, and animations.
2.  **`GET /status/:state/:text`**
    Status preset with animated pulsing dot. `:state` maps via `src/config/services.ts` (`green`/`up`/`online`, `amber`/`warn`/`degraded`, `red`/`down`/`offline`).
    Example: `https://badge.xul.is/status/green/API+Online`
3.  **`GET /:service/:target/:metric`**
    Service preset using default owner (e.g., `/gh/my-repo/stars`, `/gh/my-repo/activity`, `/pypi/my-pkg/v`, `/pypi/my-pkg/dl`).
4.  **`GET /:service/:owner/:target/:metric`**
    Service preset with explicit owner (checked against `allowedOwners` in `src/config/services.ts`).
5.  **`GET /:label/:value`**
    Two-part static badge. Spaces encoded as `+` or `%20`.
    Example: `https://badge.xul.is/arch/hyprland?c=cyan&v=2&i=archlinux`
6.  **`GET /:label`**
    Single-part badge/button. Defaults to variant `b1` unless `v=` is specified.
    Example: `https://badge.xul.is/Documentation?c=indigo&v=b1&i=book-open&r=https://docs.xul.is`

---

## 5. Complete Source Code Blueprints

### 5.1 `src/types.ts`

```typescript
export type ThemeColorName =
  | 'indigo'
  | 'violet'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'cyan'
  | 'sky'
  | 'slate'
  | 'green'
  | 'red';

export type BadgeVariant = '1' | '2' | '3' | 'b1' | 'b2' | 'b3';

export type DotState = 'green' | 'amber' | 'red' | 'cyan';

export interface ThemePalette {
  gradStart: string;     // Top gradient stop for primary fills
  gradEnd: string;       // Bottom gradient stop for primary fills
  accentText: string;    // Bright readable accent text on dark backgrounds
  iconColor: string;     // Icon tint on dark backgrounds
  tintBg: string;        // Low-opacity fill for v=2 and v=b2
  borderColor: string;   // Glowing border color for v=2 and v=b2
  glowColor: string;     // Dot / filter glow color
}

export interface BadgeRenderOptions {
  label: string;
  value?: string;
  color: ThemeColorName;
  variant: BadgeVariant;
  icon?: string;         // Icon slug or 'none'
  dot?: DotState;        // Optional pulsing status indicator
  sparkline?: number[];  // Optional array of numeric points for inline sparkline
}

export interface Env {
  DEFAULT_GH_OWNER: string;
  ALLOW_PREVIEW_IN_PROD?: string;
  GITHUB_TOKEN?: string;
}

export interface MetricResult {
  label: string;
  value?: string;
  color?: ThemeColorName;
  icon?: string;
  dot?: DotState;
  sparkline?: number[];
  redirectUrl: string;
}
```

### 5.2 `src/config/theme.ts`

```typescript
import { ThemeColorName, ThemePalette } from '../types';

export const BASE_DARK = {
  bgTop: '#161923',
  bgBottom: '#0f1118',
  borderNeutral: '#262b38',
  innerHighlight: 'rgba(255, 255, 255, 0.08)',
  bevelHighlight: 'rgba(255, 255, 255, 0.26)',
  textPrimary: '#f3f4f6',
  textMuted: '#9ca3af',
};

export const THEMES: Record<ThemeColorName, ThemePalette> = {
  indigo: {
    gradStart: '#6366f1',
    gradEnd: '#4f46e5',
    accentText: '#818cf8',
    iconColor: '#818cf8',
    tintBg: 'rgba(99, 102, 241, 0.16)',
    borderColor: 'rgba(99, 102, 241, 0.48)',
    glowColor: '#6366f1',
  },
  violet: {
    gradStart: '#8b5cf6',
    gradEnd: '#7c3aed',
    accentText: '#a78bfa',
    iconColor: '#a78bfa',
    tintBg: 'rgba(139, 92, 246, 0.16)',
    borderColor: 'rgba(139, 92, 246, 0.48)',
    glowColor: '#8b5cf6',
  },
  emerald: {
    gradStart: '#10b981',
    gradEnd: '#059669',
    accentText: '#34d399',
    iconColor: '#34d399',
    tintBg: 'rgba(16, 185, 129, 0.16)',
    borderColor: 'rgba(16, 185, 129, 0.45)',
    glowColor: '#10b981',
  },
  rose: {
    gradStart: '#f43f5e',
    gradEnd: '#e11d48',
    accentText: '#fb7185',
    iconColor: '#fb7185',
    tintBg: 'rgba(244, 63, 94, 0.16)',
    borderColor: 'rgba(244, 63, 94, 0.45)',
    glowColor: '#f43f5e',
  },
  amber: {
    gradStart: '#f59e0b',
    gradEnd: '#d97706',
    accentText: '#fbbf24',
    iconColor: '#fbbf24',
    tintBg: 'rgba(245, 158, 11, 0.16)',
    borderColor: 'rgba(245, 158, 11, 0.45)',
    glowColor: '#f59e0b',
  },
  cyan: {
    gradStart: '#06b6d4',
    gradEnd: '#0891b2',
    accentText: '#22d3ee',
    iconColor: '#22d3ee',
    tintBg: 'rgba(6, 182, 212, 0.16)',
    borderColor: 'rgba(6, 182, 212, 0.45)',
    glowColor: '#06b6d4',
  },
  sky: {
    gradStart: '#0ea5e9',
    gradEnd: '#0284c7',
    accentText: '#38bdf8',
    iconColor: '#38bdf8',
    tintBg: 'rgba(14, 165, 233, 0.16)',
    borderColor: 'rgba(14, 165, 233, 0.45)',
    glowColor: '#0ea5e9',
  },
  slate: {
    gradStart: '#475569',
    gradEnd: '#334155',
    accentText: '#cbd5e1',
    iconColor: '#94a3b8',
    tintBg: 'rgba(148, 163, 184, 0.14)',
    borderColor: 'rgba(148, 163, 184, 0.35)',
    glowColor: '#64748b',
  },
  green: {
    gradStart: '#22c55e',
    gradEnd: '#16a34a',
    accentText: '#4ade80',
    iconColor: '#4ade80',
    tintBg: 'rgba(34, 197, 94, 0.16)',
    borderColor: 'rgba(34, 197, 94, 0.45)',
    glowColor: '#22c55e',
  },
  red: {
    gradStart: '#ef4444',
    gradEnd: '#dc2626',
    accentText: '#f87171',
    iconColor: '#f87171',
    tintBg: 'rgba(239, 68, 68, 0.16)',
    borderColor: 'rgba(239, 68, 68, 0.45)',
    glowColor: '#ef4444',
  },
};

export const DOT_COLORS: Record<string, string> = {
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  cyan: '#06b6d4',
};

export function resolveColor(input?: string | null, fallback: ThemeColorName = 'indigo'): ThemeColorName {
  if (!input) return fallback;
  const key = input.toLowerCase() as ThemeColorName;
  return key in THEMES ? key : fallback;
}
```

### 5.3 `src/config/services.ts` (Single Declarative Service & Special Element Config)

```typescript
import { DotState, Env, MetricResult, ThemeColorName } from '../types';

export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(num);
}

/**
 * Declarative Status Dot Mapping
 * Maps status preset aliases (or API return values) to dot state, default label, and theme color.
 */
export const STATUS_PRESET_MAP: Record<
  string,
  { dot: DotState; defaultLabel: string; color: ThemeColorName }
> = {
  green: { dot: 'green', defaultLabel: 'status', color: 'emerald' },
  online: { dot: 'green', defaultLabel: 'status', color: 'emerald' },
  up: { dot: 'green', defaultLabel: 'status', color: 'emerald' },
  amber: { dot: 'amber', defaultLabel: 'status', color: 'amber' },
  degraded: { dot: 'amber', defaultLabel: 'status', color: 'amber' },
  warn: { dot: 'amber', defaultLabel: 'status', color: 'amber' },
  red: { dot: 'red', defaultLabel: 'status', color: 'rose' },
  offline: { dot: 'red', defaultLabel: 'status', color: 'rose' },
  down: { dot: 'red', defaultLabel: 'status', color: 'rose' },
};

export interface ServiceMetricConfig {
  defaultLabel: string;
  defaultColor: ThemeColorName;
  defaultIcon: string;
  cacheTtlSeconds?: number;
  buildApiUrl: (owner: string, target: string) => string;
  buildRedirectUrl: (owner: string, target: string) => string;
  transform: (data: any, owner: string, target: string) => Partial<MetricResult>;
}

export interface ServiceDefinition {
  defaultOwner?: (env: Env) => string;
  /**
   * Allowlist of owners or package names permitted to use this service preset.
   * Use '*' only if you want a specific service unrestricted.
   */
  allowedOwners?: (env: Env) => string[];
  allowedTargets?: string[];
  metrics: Record<string, ServiceMetricConfig>;
}

export const SERVICES_CONFIG: Record<string, ServiceDefinition> = {
  gh: {
    defaultOwner: (env) => env.DEFAULT_GH_OWNER || 'xulbux',
    allowedOwners: (env) => [
      (env.DEFAULT_GH_OWNER || 'xulbux').toLowerCase(),
      // Add any organizations or collaborator usernames here
    ],
    metrics: {
      stars: {
        defaultLabel: 'stars',
        defaultColor: 'amber',
        defaultIcon: 'star',
        buildApiUrl: (owner, repo) => `https://api.github.com/repos/${owner}/${repo}`,
        buildRedirectUrl: (owner, repo) => `https://github.com/${owner}/${repo}/stargazers`,
        transform: (data) => ({
          value: formatCompactNumber(data.stargazers_count ?? 0),
        }),
      },
      forks: {
        defaultLabel: 'forks',
        defaultColor: 'sky',
        defaultIcon: 'git-fork',
        buildApiUrl: (owner, repo) => `https://api.github.com/repos/${owner}/${repo}`,
        buildRedirectUrl: (owner, repo) => `https://github.com/${owner}/${repo}/network/members`,
        transform: (data) => ({
          value: formatCompactNumber(data.forks_count ?? 0),
        }),
      },
      issues: {
        defaultLabel: 'issues',
        defaultColor: 'rose',
        defaultIcon: 'circle-dot',
        buildApiUrl: (owner, repo) => `https://api.github.com/repos/${owner}/${repo}`,
        buildRedirectUrl: (owner, repo) => `https://github.com/${owner}/${repo}/issues`,
        transform: (data) => ({
          value: formatCompactNumber(data.open_issues_count ?? 0),
        }),
      },
      license: {
        defaultLabel: 'license',
        defaultColor: 'slate',
        defaultIcon: 'scale',
        buildApiUrl: (owner, repo) => `https://api.github.com/repos/${owner}/${repo}`,
        buildRedirectUrl: (owner, repo) => `https://github.com/${owner}/${repo}/blob/main/LICENSE`,
        transform: (data) => ({
          value: data.license?.spdx_id && data.license.spdx_id !== 'NOASSERTION'
            ? data.license.spdx_id
            : 'custom',
        }),
      },
      release: {
        defaultLabel: 'release',
        defaultColor: 'indigo',
        defaultIcon: 'tag',
        buildApiUrl: (owner, repo) => `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
        buildRedirectUrl: (owner, repo) => `https://github.com/${owner}/${repo}/releases`,
        transform: (data) => ({
          value: data.tag_name || 'none',
        }),
      },
      activity: {
        defaultLabel: 'commits',
        defaultColor: 'emerald',
        defaultIcon: 'activity',
        buildApiUrl: (owner, repo) => `https://api.github.com/repos/${owner}/${repo}/stats/participation`,
        buildRedirectUrl: (owner, repo) => `https://github.com/${owner}/${repo}/graphs/commit-activity`,
        transform: (data) => {
          const allWeeks: number[] = Array.isArray(data?.all) ? data.all : [];
          const recent8Weeks = allWeeks.slice(-8);
          const totalRecent = recent8Weeks.reduce((acc, v) => acc + v, 0);
          return {
            value: `${formatCompactNumber(totalRecent)}/8w`,
            sparkline: recent8Weeks.length > 0 ? recent8Weeks : [2, 5, 3, 8, 6, 11, 9, 14],
          };
        },
      },
    },
  },

  pypi: {
    // Optionally restrict to specific PyPI package names you own, or leave empty to allow your packages
    allowedTargets: [],
    metrics: {
      v: {
        defaultLabel: 'pypi',
        defaultColor: 'sky',
        defaultIcon: 'pypi',
        buildApiUrl: (_owner, pkg) => `https://pypi.org/pypi/${pkg}/json`,
        buildRedirectUrl: (_owner, pkg) => `https://pypi.org/project/${pkg}/`,
        transform: (data) => ({
          value: `v${data.info?.version ?? '0.0.0'}`,
        }),
      },
      py: {
        defaultLabel: 'python',
        defaultColor: 'amber',
        defaultIcon: 'python',
        buildApiUrl: (_owner, pkg) => `https://pypi.org/pypi/${pkg}/json`,
        buildRedirectUrl: (_owner, pkg) => `https://pypi.org/project/${pkg}/`,
        transform: (data) => {
          const req: string = data.info?.requires_python || '>=3.10';
          return { value: req.replace(/\s+/g, '') };
        },
      },
      dl: {
        defaultLabel: 'downloads',
        defaultColor: 'emerald',
        defaultIcon: 'download',
        buildApiUrl: (_owner, pkg) => `https://pypistats.org/api/packages/${pkg}/recent`,
        buildRedirectUrl: (_owner, pkg) => `https://pypi.org/project/${pkg}/`,
        transform: (data) => ({
          value: `${formatCompactNumber(data.data?.last_month ?? 0)}/mo`,
        }),
      },
    },
  },
};
```

### 5.4 `src/svg/measure.ts` (Microsecond Text Width Calculator)

```typescript
/**
 * Character width lookup table in pixels for 11px Inter / Geist / system sans-serif.
 * Avoids heavy font-parsing WASM dependencies while keeping pill alignment exact.
 */
const CHAR_WIDTHS_11PX: Record<string, number> = {
  ' ': 3.2, '!': 3.4, '"': 4.2, '#': 7.0, '$': 6.4, '%': 8.8, '&': 7.4, "'": 2.6,
  '(': 3.8, ')': 3.8, '*': 4.8, '+': 6.4, ',': 3.0, '-': 4.2, '.': 3.0, '/': 4.2,
  '0': 6.5, '1': 5.4, '2': 6.3, '3': 6.3, '4': 6.5, '5': 6.3, '6': 6.5, '7': 5.9,
  '8': 6.5, '9': 6.5, ':': 3.2, ';': 3.2, '<': 6.4, '=': 6.4, '>': 6.4, '?': 5.6,
  '@': 9.8, 'A': 7.3, 'B': 7.1, 'C': 7.4, 'D': 7.6, 'E': 6.5, 'F': 6.1, 'G': 7.8,
  'H': 7.7, 'I': 3.3, 'J': 5.5, 'K': 7.1, 'L': 6.0, 'M': 9.1, 'N': 7.7, 'O': 8.0,
  'P': 6.8, 'Q': 8.0, 'R': 7.1, 'S': 6.8, 'T': 6.6, 'U': 7.6, 'V': 7.2, 'W': 10.2,
  'X': 7.1, 'Y': 6.9, 'Z': 6.7, '[': 3.8, '\\': 4.2, ']': 3.8, '^': 5.6, '_': 5.8,
  'a': 6.0, 'b': 6.4, 'c': 5.6, 'd': 6.4, 'e': 6.0, 'f': 3.8, 'g': 6.3, 'h': 6.2,
  'i': 2.7, 'j': 2.8, 'k': 5.7, 'l': 2.7, 'm': 9.3, 'n': 6.2, 'o': 6.3, 'p': 6.4,
  'q': 6.4, 'r': 4.1, 's': 5.4, 't': 4.1, 'u': 6.2, 'v': 5.7, 'w': 8.3, 'x': 5.6,
  'y': 5.7, 'z': 5.3,
};

export function measureTextWidth(text: string, fontSize = 11, isBold = false): number {
  const scale = fontSize / 11;
  const weightMultiplier = isBold ? 1.045 : 1.0;
  let total = 0;
  for (const char of text) {
    total += CHAR_WIDTHS_11PX[char] ?? 6.4;
  }
  return Math.ceil(total * scale * weightMultiplier);
}
```

### 5.5 `src/svg/icons.ts` (Lucide + Simple Icons Resolver)

```typescript
import * as lucideIcons from 'lucide-static';
import * as simpleIcons from 'simple-icons';

export interface ResolvedIcon {
  type: 'lucide' | 'simple';
  innerSvg: string;
}

function toPascalCase(slug: string): string {
  return slug
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

export function resolveIcon(slug?: string): ResolvedIcon | null {
  if (!slug || slug === 'none') return null;
  const cleanSlug = slug.trim().toLowerCase();

  // 1. Check Lucide Icons first (stroke-based, rendered with punchy 2.25px stroke)
  const lucideKey = toPascalCase(cleanSlug);
  const lucideMap = lucideIcons as Record<string, string>;
  if (lucideKey in lucideMap && typeof lucideMap[lucideKey] === 'string') {
    const rawSvg = lucideMap[lucideKey];
    const innerMatch = rawSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
    if (innerMatch) {
      return { type: 'lucide', innerSvg: innerMatch[1].trim() };
    }
  }

  // 2. Check Simple Icons fallback (solid single-path brand icons like github, pypi, archlinux)
  const simpleKey = `si${ cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1).replace(/[-_.]/g, '') }`;
  const simpleMap = simpleIcons as Record<string, { path?: string }>;
  for (const [key, val] of Object.entries(simpleMap)) {
    if (key.toLowerCase() === simpleKey.toLowerCase() && val?.path) {
      return {
        type: 'simple',
        innerSvg: `<path d="${val.path}" />`,
      };
    }
  }

  return null;
}
```

### 5.6 `src/svg/renderer.ts` (SSOT SVG Generator for All 6 Variants & Special Elements)

```typescript
import { BASE_DARK, DOT_COLORS, THEMES } from '../config/theme';
import { BadgeRenderOptions } from '../types';
import { resolveIcon } from './icons';
import { measureTextWidth } from './measure';

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildSparklinePoints(values: number[], x: number, y: number, width: number, height: number): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((val, idx) => {
      const px = x + (idx / (values.length - 1)) * width;
      const py = y + height - ((val - min) / range) * height;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(' ');
}

export function renderBadge(opts: BadgeRenderOptions): string {
  const palette = THEMES[opts.color] || THEMES.indigo;
  const isButton = opts.variant.startsWith('b');
  const height = isButton ? 26 : 22;
  const rx = isButton ? 7 : 6;
  const fontSize = isButton ? 11.5 : 11;
  const iconSize = isButton ? 14 : 13;

  const iconData = resolveIcon(opts.icon);
  const hasDot = Boolean(opts.dot && DOT_COLORS[opts.dot]);
  const hasSparkline = Array.isArray(opts.sparkline) && opts.sparkline.length >= 2;
  const hasValue = Boolean(opts.value !== undefined && opts.value !== '');

  const padX = isButton ? 11 : 9;
  const iconGap = 6;
  const dotSpace = hasDot ? 13 : 0;
  const iconSpace = iconData ? iconSize + iconGap : 0;
  const sparkWidth = hasSparkline ? 36 : 0;
  const sparkSpace = hasSparkline ? sparkWidth + 8 : 0;

  const labelText = opts.label;
  const valueText = opts.value ?? '';

  const labelWidth = measureTextWidth(labelText, fontSize, isButton);
  const leftWidth = padX + dotSpace + iconSpace + labelWidth + padX;

  const valueWidth = hasValue ? measureTextWidth(valueText, fontSize, true) : 0;
  const rightWidth = hasValue || hasSparkline ? padX + sparkSpace + valueWidth + padX : 0;
  const totalWidth = leftWidth + rightWidth;

  const centerY = height / 2;
  const textY = Math.round(centerY + fontSize * 0.35);

  // Calculate Left Elements X Positions
  let cursorX = padX;
  const dotCx = cursorX + 3.5;
  if (hasDot) cursorX += dotSpace;

  const iconX = cursorX;
  const iconY = (height - iconSize) / 2;
  if (iconData) cursorX += iconSpace;

  const labelX = cursorX;

  // Calculate Right Elements X Positions
  let rightCursorX = leftWidth + padX;
  const sparkX = rightCursorX;
  const sparkY = (height - 10) / 2;
  if (hasSparkline) rightCursorX += sparkSpace;
  const valueX = rightCursorX;

  // Style determinations per variant
  const isPrimaryFill = opts.variant === 'b1';
  const iconStrokeOrFill = isPrimaryFill ? '#ffffff' : palette.iconColor;
  const labelColor = opts.variant === '3' ? BASE_DARK.textMuted : BASE_DARK.textPrimary;
  const valueColor = opts.variant === '1' || opts.variant === 'b1' ? '#ffffff' : palette.accentText;

  const outerBorder =
    opts.variant === '2' || opts.variant === 'b2'
      ? palette.borderColor
      : opts.variant === 'b1'
      ? 'rgba(255,255,255,0.22)'
      : BASE_DARK.borderNeutral;

  // Render Icon SVG group
  let iconMarkup = '';
  if (iconData) {
    const scale = (iconSize / 24).toFixed(4);
    if (iconData.type === 'lucide') {
      iconMarkup = `<g transform="translate(${iconX}, ${iconY}) scale(${scale})" fill="none" stroke="${iconStrokeOrFill}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${iconData.innerSvg}</g>`;
    } else {
      iconMarkup = `<g transform="translate(${iconX}, ${iconY}) scale(${scale})" fill="${iconStrokeOrFill}">${iconData.innerSvg}</g>`;
    }
  }

  // Render Pulsing Status Dot
  let dotMarkup = '';
  if (hasDot && opts.dot) {
    const dotHex = DOT_COLORS[opts.dot];
    dotMarkup = `
      <circle cx="${dotCx}" cy="${centerY}" r="3.5" fill="${dotHex}" opacity="0.35">
        <animate attributeName="r" values="3.5;6.5;3.5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.45;0;0.45" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="${dotCx}" cy="${centerY}" r="3" fill="${dotHex}" />
    `;
  }

  // Render Mini Sparkline
  let sparkMarkup = '';
  if (hasSparkline && opts.sparkline) {
    const points = buildSparklinePoints(opts.sparkline, sparkX, sparkY, sparkWidth, 10);
    const sparkStroke = opts.variant === '1' ? 'rgba(255,255,255,0.9)' : palette.accentText;
    sparkMarkup = `<polyline points="${points}" fill="none" stroke="${sparkStroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`;
  }

  // Background & Right Capsule Layers by Variant
  const gradId = `grad-${opts.color}`;
  const bevelId = isPrimaryFill ? 'bevel-pri' : 'bevel-sec';
  let bgLayers = `<rect width="${totalWidth}" height="${height}" rx="${rx}" fill="url(#bg-dark)" />`;

  if (opts.variant === 'b1') {
    bgLayers = `<rect width="${totalWidth}" height="${height}" rx="${rx}" fill="url(#${gradId})" />`;
  } else if (opts.variant === 'b2') {
    bgLayers += `<rect width="${totalWidth}" height="${height}" rx="${rx}" fill="${palette.tintBg}" />`;
  } else if (opts.variant === '1' && rightWidth > 0) {
    bgLayers += `<path d="M ${leftWidth} 0 H ${totalWidth - rx} A ${rx} ${rx} 0 0 1 ${totalWidth} ${rx} V ${height - rx} A ${rx} ${rx} 0 0 1 ${totalWidth - rx} ${height} H ${leftWidth} Z" fill="url(#${gradId})" />`;
  } else if (opts.variant === '2' && rightWidth > 0) {
    bgLayers += `<path d="M ${leftWidth} 0 H ${totalWidth - rx} A ${rx} ${rx} 0 0 1 ${totalWidth} ${rx} V ${height - rx} A ${rx} ${rx} 0 0 1 ${totalWidth - rx} ${height} H ${leftWidth} Z" fill="${palette.tintBg}" />`;
    bgLayers += `<line x1="${leftWidth}" y1="0" x2="${leftWidth}" y2="${height}" stroke="${palette.borderColor}" stroke-width="1" />`;
  } else if (opts.variant === '3' && rightWidth > 0) {
    bgLayers += `<line x1="${leftWidth}" y1="4" x2="${leftWidth}" y2="${height - 4}" stroke="${BASE_DARK.borderNeutral}" stroke-width="1" />`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" fill="none" role="img" aria-label="${escapeXml(labelText)}${hasValue ? `: ${escapeXml(valueText)}` : ''}">
  <defs>
    <linearGradient id="bg-dark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BASE_DARK.bgTop}" />
      <stop offset="100%" stop-color="${BASE_DARK.bgBottom}" />
    </linearGradient>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.gradStart}" />
      <stop offset="100%" stop-color="${palette.gradEnd}" />
    </linearGradient>
    <linearGradient id="${bevelId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${isPrimaryFill ? BASE_DARK.bevelHighlight : BASE_DARK.innerHighlight}" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </linearGradient>
  </defs>
  <style>
    .txt {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: ${fontSize}px;
      font-weight: ${isButton ? 600 : 500};
      letter-spacing: -0.01em;
    }
    .val {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: ${fontSize}px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
  </style>
  ${bgLayers}
  <rect x="0.5" y="0.5" width="${totalWidth - 1}" height="${height - 1}" rx="${rx - 0.5}" stroke="url(#${bevelId})" stroke-width="1" />
  <rect x="0.5" y="0.5" width="${totalWidth - 1}" height="${height - 1}" rx="${rx - 0.5}" stroke="${outerBorder}" stroke-width="1" />
  ${dotMarkup}${iconMarkup}
  <text x="${labelX}" y="${textY}" fill="${labelColor}" class="txt">${escapeXml(labelText)}</text>
  ${sparkMarkup}${hasValue ? `<text x="${valueX}" y="${textY}" fill="${valueColor}" class="val">${escapeXml(valueText)}</text>` : ''}
</svg>`;
}
```

### 5.7 `src/services/fetcher.ts` (Two-Tier Cached Upstream Fetcher)

```typescript
import { SERVICES_CONFIG } from '../config/services';
import { Env, MetricResult } from '../types';

export async function resolveServiceMetric(
  serviceName: string,
  ownerInput: string | null,
  target: string,
  metricName: string,
  env: Env,
  ctx: ExecutionContext
): Promise<{ status: number; result: MetricResult }> {
  const service = SERVICES_CONFIG[serviceName.toLowerCase()];
  if (!service) {
    return {
      status: 404,
      result: { label: serviceName, value: 'unknown service', color: 'rose', icon: 'circle-alert', redirectUrl: 'https://xul.is' },
    };
  }

  const owner = ownerInput || (service.defaultOwner ? service.defaultOwner(env) : '');

  // Enforce Owner Allowlist if configured
  if (service.allowedOwners) {
    const allowed = service.allowedOwners(env).map((o) => o.toLowerCase());
    if (!allowed.includes('*') && !allowed.includes(owner.toLowerCase())) {
      return {
        status: 403,
        result: {
          label: 'badge.xul.is',
          value: 'restricted',
          color: 'rose',
          icon: 'lock',
          redirectUrl: 'https://xul.is',
        },
      };
    }
  }

  // Enforce Package/Target Allowlist if configured
  if (service.allowedTargets && service.allowedTargets.length > 0) {
    if (!service.allowedTargets.map((t) => t.toLowerCase()).includes(target.toLowerCase())) {
      return {
        status: 403,
        result: {
          label: 'badge.xul.is',
          value: 'restricted',
          color: 'rose',
          icon: 'lock',
          redirectUrl: 'https://xul.is',
        },
      };
    }
  }

  const metric = service.metrics[metricName.toLowerCase()];
  if (!metric) {
    return {
      status: 404,
      result: {
        label: serviceName,
        value: 'invalid metric',
        color: 'amber',
        icon: 'circle-help',
        redirectUrl: 'https://xul.is',
      },
    };
  }

  const apiUrl = metric.buildApiUrl(owner, target);
  const redirectUrl = metric.buildRedirectUrl(owner, target);
  const ttl = metric.cacheTtlSeconds ?? 600;

  // Tier 1 Cache Lookup: Cache the raw upstream API JSON by its URL so stars/forks/issues share 1 request
  const cache = caches.default;
  const cacheKey = new Request(`https://internal-json-cache.xul.is/?url=${encodeURIComponent(apiUrl)}`, {
    method: 'GET',
  });

  let rawData: any = null;
  const cachedRes = await cache.match(cacheKey);

  if (cachedRes) {
    rawData = await cachedRes.json();
  } else {
    const headers: Record<string, string> = {
      'User-Agent': 'xul-badge-engine/1.0 (https://badge.xul.is)',
      Accept: 'application/json',
    };
    if (serviceName === 'gh' && env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    }

    const upstreamRes = await fetch(apiUrl, { headers });
    if (!upstreamRes.ok) {
      return {
        status: upstreamRes.status,
        result: {
          label: metric.defaultLabel,
          value: upstreamRes.status === 404 ? 'not found' : 'api error',
          color: 'rose',
          icon: metric.defaultIcon,
          redirectUrl,
        },
      };
    }

    rawData = await upstreamRes.json();
    const jsonToCache = new Response(JSON.stringify(rawData), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, jsonToCache));
  }

  const transformed = metric.transform(rawData, owner, target);

  return {
    status: 200,
    result: {
      label: transformed.label ?? metric.defaultLabel,
      value: transformed.value ?? 'n/a',
      color: transformed.color ?? metric.defaultColor,
      icon: transformed.icon ?? metric.defaultIcon,
      dot: transformed.dot,
      sparkline: transformed.sparkline,
      redirectUrl,
    },
  };
}
```

### 5.8 `src/preview/page.ts` (SSOT Interactive Design Studio)

```typescript
import { THEMES } from '../config/theme';
import { renderBadge } from '../svg/renderer';
import { BadgeVariant, ThemeColorName } from '../types';

export function renderPreviewHtml(): string {
  const variants: { id: BadgeVariant; title: string; desc: string }[] = [
    { id: '1', title: 'v=1 · Primary Badge', desc: 'Dark slate label + vibrant gradient value capsule' },
    { id: '2', title: 'v=2 · Secondary Badge', desc: 'Colored border + 16% tinted value capsule' },
    { id: '3', title: 'v=3 · Tertiary Badge', desc: 'Minimal neutral border + muted label + accent value' },
    { id: 'b1', title: 'v=b1 · Primary Button', desc: 'Full-bleed gradient CTA pill (26px height)' },
    { id: 'b2', title: 'v=b2 · Secondary Button', desc: 'Tinted dark button with glowing border (26px height)' },
    { id: 'b3', title: 'v=b3 · Tertiary Button', desc: 'Understated utility button with colored icon (26px height)' },
  ];

  const colors = Object.keys(THEMES) as ThemeColorName[];

  const variantCards = variants
    .map((v) => {
      const isBtn = v.id.startsWith('b');
      const samples = [
        renderBadge({
          label: isBtn ? 'Documentation' : 'stars',
          value: isBtn ? undefined : '4.8k',
          color: 'indigo',
          variant: v.id,
          icon: isBtn ? 'book-open' : 'star',
        }),
        renderBadge({
          label: isBtn ? 'Install Arch' : 'arch',
          value: isBtn ? undefined : 'hyprland',
          color: 'cyan',
          variant: v.id,
          icon: 'archlinux',
        }),
        renderBadge({
          label: isBtn ? 'Latest Release' : 'pypi',
          value: isBtn ? undefined : 'v2.4.0',
          color: 'emerald',
          variant: v.id,
          icon: isBtn ? 'rocket' : 'pypi',
        }),
        renderBadge({
          label: isBtn ? 'Report Issue' : 'issues',
          value: isBtn ? undefined : '12 open',
          color: 'rose',
          variant: v.id,
          icon: 'bug',
        }),
      ].join('\n');

      return `
        <div class="card">
          <div class="card-header">
            <code>${v.title}</code>
            <span>${v.desc}</span>
          </div>
          <div class="badge-row">${samples}</div>
        </div>
      `;
    })
    .join('\n');

  const paletteSwatches = colors
    .map((c) =>
      renderBadge({
        label: 'theme',
        value: c,
        color: c,
        variant: '2',
        icon: 'sparkles',
      })
    )
    .join('\n');

  const specialSamples = [
    renderBadge({
      label: 'api.xul.is',
      value: 'online',
      color: 'emerald',
      variant: '2',
      dot: 'green',
    }),
    renderBadge({
      label: 'worker latency',
      value: 'degraded (180ms)',
      color: 'amber',
      variant: '2',
      dot: 'amber',
    }),
    renderBadge({
      label: 'build pipeline',
      value: 'offline',
      color: 'rose',
      variant: '2',
      dot: 'red',
    }),
    renderBadge({
      label: 'commits',
      value: '84/8w',
      color: 'emerald',
      variant: '2',
      icon: 'activity',
      sparkline: [3, 7, 5, 12, 9, 15, 11, 19],
    }),
    renderBadge({
      label: 'downloads',
      value: '42.1k/mo',
      color: 'indigo',
      variant: '1',
      icon: 'download',
      sparkline: [12, 18, 15, 24, 29, 35, 42],
    }),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>badge.xul.is — SSOT Visual Studio</title>
  <style>
    :root {
      --bg: #090b10;
      --card: #11141d;
      --border: #1f2433;
      --text: #f3f4f6;
      --muted: #9ca3af;
    }
    body.light-canvas {
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
    }
    body {
      margin: 0;
      padding: 40px 24px;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      transition: background 0.2s, color 0.2s;
    }
    .container { max-width: 980px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 20px; margin: 0; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 32px 0 12px; }
    button.toggle {
      background: var(--card);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 16px; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px;
    }
    .card-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
    .card-header code { font-weight: 600; font-size: 13px; }
    .card-header span { font-size: 12px; color: var(--muted); }
    .badge-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>badge.xul.is — SSOT Live Preview</h1>
        <p style="margin:4px 0 0;font-size:13px;color:var(--muted)">Rendered directly via <code>src/svg/renderer.ts</code></p>
      </div>
      <button class="toggle" onclick="document.body.classList.toggle('light-canvas')">
        Toggle Dark / Light README Canvas
      </button>
    </header>

    <h2>1. The 6 Badge & Button Variants</h2>
    <div class="grid">${variantCards}</div>

    <h2>2. Special Elements (Pulsing Status Dots & Mini-Sparklines)</h2>
    <div class="card">
      <div class="badge-row">${specialSamples}</div>
    </div>

    <h2>3. Curated Color Tokens (?c=)</h2>
    <div class="card">
      <div class="badge-row">${paletteSwatches}</div>
    </div>
  </div>
</body>
</html>`;
}
```

### 5.9 `src/index.ts` (Main Worker Entrypoint, Smart Redirects & Edge Cache)

```typescript
import { Hono } from 'hono';
import { STATUS_PRESET_MAP } from './config/services';
import { resolveColor } from './config/theme';
import { renderPreviewHtml } from './preview/page';
import { resolveServiceMetric } from './services/fetcher';
import { renderBadge } from './svg/renderer';
import { BadgeVariant, DotState, Env } from './types';

const app = new Hono<{ Bindings: Env }>();

function decodeSegment(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, ' '));
}

function isDocumentNavigation(req: Request): boolean {
  const fetchDest = req.headers.get('Sec-Fetch-Dest');
  if (fetchDest === 'document' || fetchDest === 'iframe') return true;
  if (fetchDest === 'image') return false;
  const accept = req.headers.get('Accept') || '';
  return accept.includes('text/html') && !accept.startsWith('image/');
}

function resolveVariant(input?: string | null, fallback: BadgeVariant = '1'): BadgeVariant {
  const valid: BadgeVariant[] = ['1', '2', '3', 'b1', 'b2', 'b3'];
  if (input && valid.includes(input as BadgeVariant)) {
    return input as BadgeVariant;
  }
  return fallback;
}

function svgResponse(svg: string, ttlSeconds = 600): Response {
  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': `public, max-age=300, s-maxage=${ttlSeconds}, stale-while-revalidate=86400`,
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// 1. Root Redirect
app.get('/', (c) => c.redirect('https://xul.is', 302));

// 2. SSOT Live Preview Studio
app.get('/preview', (c) => {
  return c.html(renderPreviewHtml());
});

// 3. Status Preset Route: /status/:state/:text
app.get('/status/:state/:text', (c) => {
  const stateKey = c.req.param('state').toLowerCase();
  const text = decodeSegment(c.req.param('text'));
  const redirectParam = c.req.query('r');

  if (redirectParam && isDocumentNavigation(c.req.raw)) {
    return c.redirect(redirectParam, 302);
  }

  const preset = STATUS_PRESET_MAP[stateKey] || STATUS_PRESET_MAP.green;
  const svg = renderBadge({
    label: c.req.query('l') ? decodeSegment(c.req.query('l')!) : preset.defaultLabel,
    value: text,
    color: resolveColor(c.req.query('c'), preset.color),
    variant: resolveVariant(c.req.query('v'), '2'),
    icon: c.req.query('i'),
    dot: preset.dot,
  });

  return svgResponse(svg, 300);
});

// 4. Service Preset Routes (3 segments = default owner, 4 segments = explicit owner)
async function handleServicePreset(
  c: any,
  service: string,
  owner: string | null,
  target: string,
  metric: string
): Promise<Response> {
  const { result } = await resolveServiceMetric(
    service,
    owner,
    target,
    metric,
    c.env,
    c.executionCtx
  );

  const finalRedirect = c.req.query('r') || result.redirectUrl;
  if (isDocumentNavigation(c.req.raw) && finalRedirect) {
    return c.redirect(finalRedirect, 302);
  }

  // Tier 2 Rendered SVG Cache Lookup
  const cache = caches.default;
  const cacheKey = new Request(c.req.url, { method: 'GET' });
  const cachedSvg = await cache.match(cacheKey);
  if (cachedSvg) return cachedSvg;

  const svg = renderBadge({
    label: c.req.query('l') ? decodeSegment(c.req.query('l')!) : result.label,
    value: result.value,
    color: resolveColor(c.req.query('c'), result.color),
    variant: resolveVariant(c.req.query('v'), '1'),
    icon: c.req.query('i') ?? result.icon,
    dot: (c.req.query('dot') as DotState | undefined) ?? result.dot,
    sparkline: result.sparkline,
  });

  const response = svgResponse(svg, 600);
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

app.get('/:service{gh|pypi}/:target/:metric', (c) =>
  handleServicePreset(
    c,
    c.req.param('service'),
    null,
    c.req.param('target'),
    c.req.param('metric')
  )
);

app.get('/:service{gh|pypi}/:owner/:target/:metric', (c) =>
  handleServicePreset(
    c,
    c.req.param('service'),
    c.req.param('owner'),
    c.req.param('target'),
    c.req.param('metric')
  )
);

// 5. Generic Static 2-Segment Badge: /:label/:value
app.get('/:label/:value', (c) => {
  const redirectParam = c.req.query('r');
  if (redirectParam && isDocumentNavigation(c.req.raw)) {
    return c.redirect(redirectParam, 302);
  }

  const svg = renderBadge({
    label: decodeSegment(c.req.param('label')),
    value: decodeSegment(c.req.param('value')),
    color: resolveColor(c.req.query('c'), 'indigo'),
    variant: resolveVariant(c.req.query('v'), '1'),
    icon: c.req.query('i'),
    dot: c.req.query('dot') as DotState | undefined,
  });

  return svgResponse(svg, 3600);
});

// 6. Generic Static 1-Segment Button/Badge: /:label
app.get('/:label', (c) => {
  const redirectParam = c.req.query('r');
  if (redirectParam && isDocumentNavigation(c.req.raw)) {
    return c.redirect(redirectParam, 302);
  }

  const svg = renderBadge({
    label: decodeSegment(c.req.param('label')),
    color: resolveColor(c.req.query('c'), 'indigo'),
    variant: resolveVariant(c.req.query('v'), 'b1'),
    icon: c.req.query('i'),
    dot: c.req.query('dot') as DotState | undefined,
  });

  return svgResponse(svg, 3600);
});

export default app;
```

### 5.10 `scripts/exportPreview.ts` (Offline `preview.html` Generator)

```typescript
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderPreviewHtml } from '@/preview/page';

const outPath = path.resolve(process.cwd(), 'preview.html');
writeFileSync(outPath, renderPreviewHtml(), 'utf8');
process.stdout.write(`Generated standalone SSOT preview at: ${outPath}\n`);
```

---

## 6. Verification & Deployment Steps for Agent

1.  **Install & Validate**:
    -   Run `pnpm i` and `pnpm run type-check; pnpm run lint; pnpm run fmt; pnpm run test` to confirm zero TypeScript, lint, format, or test issues.
2.  **Generate & Inspect SSOT Preview**:
    -   Run `pnpm run preview:export` to output `preview.html` in the project root (can be opened directly in any browser via `file://`), OR run `pnpm run dev` and open <http://localhost:8787/preview>.
3.  **Test Endpoints Locally**:
    -   Static badge: <http://localhost:8787/arch/hyprland?c=cyan&v=2&i=archlinux>
    -   Button variant: <http://localhost:8787/Documentation?c=indigo&v=b1&i=book-open&r=https://xul.is>
    -   Status preset: <http://localhost:8787/status/green/operational>
    -   GitHub preset: <http://localhost:8787/gh/color-tracr/stars>
4.  **Cloudflare Secret & Deployment**:
    -   Authenticate Wrangler if needed: `pnpm exec wrangler login`
    -   Set GitHub API token secret: `pnpm exec wrangler secret put GITHUB_TOKEN`
    -   Deploy Worker & automatically bind `badge.xul.is` and `b.xul.is` Custom Domains: `pnpm run deploy`

