/**
 * Icon resolver – Resolves Lucide (stroke) and Iconify brand/tech (`@iconify-json/devicon-plain` + `@iconify-json/simple-icons`) SVG paths.
 */

import { icons as deviconPlainSet } from '@iconify-json/devicon-plain';
import { icons as simpleIconSet } from '@iconify-json/simple-icons';
import * as lucideIcons from 'lucide-static';
import type { ResolvedIcon, ThemeColorName } from '@/types';

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches hyphen or underscore word separators in icon slugs. */
const SLUG_SEPARATOR_RX = /[-_]/g;

/** Matches hyphen, underscore, or dot characters in brand icon slugs. */
const BRAND_SLUG_CLEAN_RX = /[-_.]/g;

/** Matches `fill="currentColor"` attributes inside Iconify SVG path bodies so parent `<g fill="...">` controls color and sheen. */
const CURRENT_COLOR_FILL_RX = /\s*fill="currentColor"/g;

/** Matches the inner content of an `<svg>...</svg>` element. */
const INNER_SVG_RX = /<svg[^>]*>(?<inner>[\s\S]*?)<\/svg>/i;

// ---------------------------------------- CONSTS ---------------------------------------

/**
 * Scale factor normalizing `@iconify-json/devicon-plain`'s `128x128` coordinate space to `24x24` (`24 / 128 = 0.1875`).
 */
const DEVICON_SCALE = 0.1875;

/**
 * Canonical brand slugs that prefer `@iconify-json/devicon-plain` over `@iconify-json/simple-icons`
 * so icon families (`c` / `cplusplus` / `csharp`, `javascript` / `typescript`) share an identical geometric frame
 * and database icons (`mysql`, `sqlite`) use clean symbol-only marks without embedded wordmark text.
 */
const DEVICON_PREFERRED_SLUGS: ReadonlySet<string> = new Set([
  'c',
  'cplusplus',
  'csharp',
  'javascript',
  'mysql',
  'sqlite',
  'typescript',
]);

/** Common icon slug aliases mapped to their canonical Lucide, Simple Icons, or Devicon Plain slugs. */
const ICON_SLUG_ALIASES: Readonly<Record<string, string>> = {
  ae: 'adobeaftereffects',
  ai: 'adobeillustrator',
  aws: 'amazonwebservices',
  azure: 'microsoftazure',
  bash: 'gnubash',
  'box-isometric-tape': 'package',
  browser: 'app-window',
  'camera-rotate': 'switch-camera',
  'circle-info': 'info',
  cpp: 'cplusplus',
  'crosshairs-simple': 'crosshair',
  cs: 'csharp',
  css: 'css3',
  'globe-code': 'globe',
  html: 'html5',
  js: 'javascript',
  md: 'markdown',
  microchip: 'cpu',
  nodejs: 'nodedotjs',
  pr: 'adobepremierepro',
  ps: 'adobephotoshop',
  'puzzle-piece': 'puzzle',
  py: 'python',
  'rocket-launch': 'rocket',
  snake: 'worm',
  'square-text': 'message-square-text',
  swatchbook: 'swatch-book',
  tailwind: 'tailwindcss',
  threejs: 'threedotjs',
  ts: 'typescript',
  unreal: 'unrealengine',
  vscode: 'visualstudiocode',
  vue: 'vuedotjs',
};

/**
 * Curated semantic Tailwind v4 theme colors for tech stack icons on `/stack/:icons`.
 * Used when no explicit uniform `?color=` query parameter is specified.
 */
const STACK_ICON_COLORS: Readonly<Record<string, ThemeColorName>> = {
  adobeaftereffects: 'violet',
  adobeillustrator: 'orange',
  adobephotoshop: 'sky',
  adobepremierepro: 'purple',
  ae: 'violet',
  ai: 'orange',
  amazonwebservices: 'amber',
  archlinux: 'cyan',
  arduino: 'teal',
  aws: 'amber',
  azure: 'sky',
  bash: 'emerald',
  blender: 'orange',
  c: 'blue',
  cloudflare: 'orange',
  cmake: 'red',
  codepen: 'slate',
  cplusplus: 'blue',
  cpp: 'blue',
  cs: 'violet',
  csharp: 'violet',
  css: 'sky',
  css3: 'sky',
  docker: 'sky',
  dotnet: 'purple',
  figma: 'pink',
  firebase: 'amber',
  git: 'orange',
  github: 'slate',
  githubactions: 'blue',
  gnubash: 'emerald',
  go: 'cyan',
  gtk: 'emerald',
  html: 'orange',
  html5: 'orange',
  java: 'orange',
  javascript: 'yellow',
  js: 'yellow',
  kotlin: 'violet',
  laravel: 'red',
  latex: 'teal',
  linux: 'amber',
  lua: 'indigo',
  markdown: 'slate',
  md: 'slate',
  microsoftazure: 'sky',
  mysql: 'sky',
  netlify: 'teal',
  nodedotjs: 'green',
  nodejs: 'green',
  notion: 'slate',
  npm: 'red',
  obsidian: 'violet',
  php: 'indigo',
  pinia: 'yellow',
  postgres: 'blue',
  postgresql: 'blue',
  powershell: 'sky',
  pr: 'purple',
  ps: 'sky',
  py: 'amber',
  pypi: 'sky',
  python: 'amber',
  raspberrypi: 'rose',
  react: 'cyan',
  redis: 'red',
  regex: 'indigo',
  rust: 'orange',
  sass: 'pink',
  sqlite: 'sky',
  svelte: 'orange',
  swift: 'orange',
  symfony: 'slate',
  tailwind: 'cyan',
  tailwindcss: 'cyan',
  tauri: 'amber',
  terraform: 'violet',
  threedotjs: 'slate',
  threejs: 'slate',
  ts: 'blue',
  typescript: 'blue',
  unity: 'slate',
  unreal: 'slate',
  unrealengine: 'slate',
  visualstudio: 'purple',
  visualstudiocode: 'sky',
  vite: 'violet',
  vscode: 'sky',
  vue: 'emerald',
  vuedotjs: 'emerald',
  windows: 'sky',
  wordpress: 'sky',
};

// -------------------------------------- INTERNALS --------------------------------------

/** Convert a kebab-case or snake_case slug into PascalCase. */
function toPascalCase(slug: string): string {
  const parts = slug.split(SLUG_SEPARATOR_RX);
  let result = '';
  for (const part of parts) {
    if (part.length > 0) {
      result += part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }
  }
  return result;
}

/** Look up a `128x128` icon in `@iconify-json/devicon-plain` and normalize it to `24x24`. */
function lookupDeviconPlain(slug: string): ResolvedIcon | undefined {
  const normalized = slug.replace(BRAND_SLUG_CLEAN_RX, '');
  const entry = deviconPlainSet.icons[slug] ?? deviconPlainSet.icons[normalized];
  if (!entry?.body) {
    return undefined;
  }
  const cleanBody = entry.body.replace(CURRENT_COLOR_FILL_RX, '').trim();
  return { innerSvg: `<g transform="scale(${DEVICON_SCALE})">${cleanBody}</g>`, type: 'simple' };
}

/** Look up a `24x24` icon in `@iconify-json/simple-icons`. */
function lookupSimpleIcon(slug: string): ResolvedIcon | undefined {
  const normalized = slug.replace(BRAND_SLUG_CLEAN_RX, '');
  const aliasParent =
    simpleIconSet.aliases?.[slug]?.parent ?? simpleIconSet.aliases?.[normalized]?.parent;
  const entry =
    simpleIconSet.icons[slug] ??
    simpleIconSet.icons[normalized] ??
    (aliasParent ? simpleIconSet.icons[aliasParent] : undefined);
  if (!entry?.body) {
    return undefined;
  }
  return { innerSvg: entry.body.replace(CURRENT_COLOR_FILL_RX, '').trim(), type: 'simple' };
}

/** Look up a brand/tech slug in `@iconify-json/devicon-plain` and `@iconify-json/simple-icons`. */
function lookupBrandIcon(cleanSlug: string): ResolvedIcon | undefined {
  if (DEVICON_PREFERRED_SLUGS.has(cleanSlug)) {
    return lookupDeviconPlain(cleanSlug) ?? lookupSimpleIcon(cleanSlug);
  }
  return lookupSimpleIcon(cleanSlug) ?? lookupDeviconPlain(cleanSlug);
}

/** Look up a UI stroke icon slug in `lucide-static`. */
function lookupLucideIcon(cleanSlug: string): ResolvedIcon | undefined {
  const lucideKey = toPascalCase(cleanSlug);
  const lucideMap = lucideIcons as Record<string, string>;
  if (lucideKey in lucideMap && typeof lucideMap[lucideKey] === 'string') {
    const rawSvg = lucideMap[lucideKey];
    const innerMatch = INNER_SVG_RX.exec(rawSvg);
    const innerContent = innerMatch?.groups?.inner;
    if (innerContent) {
      return { innerSvg: innerContent.trim(), type: 'lucide' };
    }
  }
  return undefined;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Resolve an icon slug to its inner SVG markup from `lucide-static`, `@iconify-json/simple-icons`, or `@iconify-json/devicon-plain`.
 * @param slug            Icon slug (e.g., `'star'`, `'globe-code'`, `'rust'`, `'archlinux'`) or `'none'`.
 * @param isBrandFirst    When `true` (e.g., on `/stack/:icons`), checks brand icons before Lucide stroke icons.
 * @returns The resolved icon data, or `undefined` if `'none'`, empty, or not found.
 */
export function resolveIcon(slug?: string, isBrandFirst = false): ResolvedIcon | undefined {
  if (!slug || slug === 'none') {
    return undefined;
  }
  const rawSlug = slug.trim().toLowerCase();
  if (!rawSlug || rawSlug === 'none') {
    return undefined;
  }
  const cleanSlug = ICON_SLUG_ALIASES[rawSlug] ?? rawSlug;

  if (isBrandFirst) {
    return (
      lookupBrandIcon(cleanSlug) ??
      lookupBrandIcon(rawSlug) ??
      lookupLucideIcon(cleanSlug) ??
      lookupLucideIcon(rawSlug)
    );
  }

  return (
    lookupLucideIcon(cleanSlug) ??
    lookupLucideIcon(rawSlug) ??
    lookupBrandIcon(cleanSlug) ??
    lookupBrandIcon(rawSlug)
  );
}

/** Human-readable display titles for tech stack tooltips (`<title>`). */
const STACK_ICON_TITLES: Readonly<Record<string, string>> = {
  adobeaftereffects: 'Adobe After Effects',
  adobeillustrator: 'Adobe Illustrator',
  adobephotoshop: 'Adobe Photoshop',
  adobepremierepro: 'Adobe Premiere Pro',
  ae: 'Adobe After Effects',
  ai: 'Adobe Illustrator',
  amazonwebservices: 'AWS',
  archlinux: 'Arch Linux',
  arduino: 'Arduino',
  aws: 'AWS',
  azure: 'Microsoft Azure',
  bash: 'Bash',
  blender: 'Blender',
  c: 'C',
  cloudflare: 'Cloudflare',
  cmake: 'CMake',
  codepen: 'CodePen',
  cplusplus: 'C++',
  cpp: 'C++',
  cs: 'C#',
  csharp: 'C#',
  css: 'CSS3',
  css3: 'CSS3',
  docker: 'Docker',
  dotnet: '.NET',
  figma: 'Figma',
  firebase: 'Firebase',
  git: 'Git',
  github: 'GitHub',
  githubactions: 'GitHub Actions',
  gnubash: 'Bash',
  go: 'Go',
  gtk: 'GTK',
  html: 'HTML5',
  html5: 'HTML5',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  kotlin: 'Kotlin',
  laravel: 'Laravel',
  latex: 'LaTeX',
  linux: 'Linux',
  lua: 'Lua',
  markdown: 'Markdown',
  md: 'Markdown',
  microsoftazure: 'Microsoft Azure',
  mysql: 'MySQL',
  netlify: 'Netlify',
  nodedotjs: 'Node.js',
  nodejs: 'Node.js',
  notion: 'Notion',
  npm: 'npm',
  obsidian: 'Obsidian',
  php: 'PHP',
  pinia: 'Pinia',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  powershell: 'PowerShell',
  pr: 'Adobe Premiere Pro',
  ps: 'Adobe Photoshop',
  py: 'Python',
  pypi: 'PyPI',
  python: 'Python',
  raspberrypi: 'Raspberry Pi',
  react: 'React',
  redis: 'Redis',
  regex: 'RegEx',
  rust: 'Rust',
  sass: 'Sass',
  sqlite: 'SQLite',
  svelte: 'Svelte',
  swift: 'Swift',
  symfony: 'Symfony',
  tailwind: 'Tailwind CSS',
  tailwindcss: 'Tailwind CSS',
  tauri: 'Tauri',
  terraform: 'Terraform',
  threedotjs: 'Three.js',
  threejs: 'Three.js',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  unity: 'Unity',
  unreal: 'Unreal Engine',
  unrealengine: 'Unreal Engine',
  visualstudio: 'Visual Studio',
  visualstudiocode: 'VS Code',
  vite: 'Vite',
  vscode: 'VS Code',
  vue: 'Vue.js',
  vuedotjs: 'Vue.js',
  windows: 'Windows',
  wordpress: 'WordPress',
};

/**
 * Resolve the semantic Tailwind v4 theme color for a tech stack icon slug.
 * @param slug       Raw or canonical icon slug (e.g., `'rust'`, `'py'`, `'ts'`, `'vue'`).
 * @param fallback   Optional explicit theme color override.
 * @returns The resolved `ThemeColorName`.
 */
export function resolveStackIconColor(slug: string, fallback?: ThemeColorName): ThemeColorName {
  if (fallback) {
    return fallback;
  }
  const rawSlug = slug.trim().toLowerCase();
  const cleanSlug = ICON_SLUG_ALIASES[rawSlug] ?? rawSlug;
  return STACK_ICON_COLORS[rawSlug] ?? STACK_ICON_COLORS[cleanSlug] ?? 'indigo';
}

/**
 * Resolve a human-readable display title for a tech stack icon slug (used in `<title>` hover tooltips).
 * @param slug   Raw or canonical icon slug (e.g., `'cpp'` -> `'C++'`, `'vscode'` -> `'VS Code'`).
 * @returns Human-readable technology title.
 */
export function resolveStackIconTitle(slug: string): string {
  const rawSlug = slug.trim().toLowerCase();
  const cleanSlug = ICON_SLUG_ALIASES[rawSlug] ?? rawSlug;
  const mapped = STACK_ICON_TITLES[rawSlug] ?? STACK_ICON_TITLES[cleanSlug];
  if (mapped) {
    return mapped;
  }
  return rawSlug
    .split(SLUG_SEPARATOR_RX)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
