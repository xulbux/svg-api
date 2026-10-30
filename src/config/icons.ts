/**
 * Icon Catalog Configuration
 *
 * Bundled icon set names, preferred brand overrides, slug aliases, and SVG body sanitizers.
 */

// ---------------------------------------- CONSTS ---------------------------------------

/** Ordered display names of all bundled stroke and brand icon sets. */
export const ALL_ICON_SOURCE_NAMES: readonly string[] = [
  'Lucide',
  'Simple Icons',
  'Devicon Plain',
  'File Icons',
];

/**
 * Canonical brand slugs that prefer Devicon Plain over Simple Icons so related language icon families
 * share a consistent geometric frame and database icons use clean symbol-only marks.
 */
export const DEVICON_PREFERRED_SLUG_LIST: readonly string[] = [
  'c',
  'cplusplus',
  'csharp',
  'javascript',
  'mysql',
  'sqlite',
  'typescript',
];

/** Default coordinate box size of File Icons (`512x512`). */
export const FILE_ICONS_DEFAULT_SIZE = 512;

/** Number of icons per icon picker body asset page. */
export const ICON_PICKER_PAGE_SIZE = 120;

/** Common icon slug aliases mapped to their canonical icon set slugs. */
export const ICON_SLUG_ALIASES: Readonly<Record<string, string>> = {
  '11ty': 'eleventy',
  ableton: 'abletonlive',
  adonis: 'adonisjs',
  ae: 'adobeaftereffects',
  aftereffects: 'adobeaftereffects',
  ai: 'adobeillustrator',
  airflow: 'apacheairflow',
  alpinejs: 'alpinedotjs',
  antd: 'antdesign',
  apollo: 'apollographql',
  arch: 'archlinux',
  argocd: 'argo',
  audition: 'adobeaudition',
  aws: 'amazonwebservices',
  azure: 'microsoftazure',
  babylonjs: 'babylondotjs',
  backbonejs: 'backbonedotjs',
  bash: 'gnubash',
  bigquery: 'googlebigquery',
  'box-isometric-tape': 'package',
  brew: 'homebrew',
  browser: 'app-window',
  bsky: 'bluesky',
  bunjs: 'bun',
  c4d: 'cinema4d',
  'camera-rotate': 'switch-camera',
  cassandra: 'apachecassandra',
  cf: 'cloudflare',
  cfpages: 'cloudflarepages',
  cfworkers: 'cloudflareworkers',
  chakra: 'chakraui',
  chartjs: 'chartdotjs',
  chatgpt: 'openai',
  chrome: 'googlechrome',
  'circle-info': 'info',
  cli: 'terminal',
  clj: 'clojure',
  close: 'x',
  cockroachdb: 'cockroachlabs',
  console: 'terminal',
  copilot: 'githubcopilot',
  couchdb: 'apachecouchdb',
  cpp: 'cplusplus',
  'crosshairs-simple': 'crosshair',
  cs: 'csharp',
  css: 'css3',
  cws: 'chromewebstore',
  d3js: 'd3',
  davinci: 'davinciresolve',
  denojs: 'deno',
  devto: 'devdotto',
  discordjs: 'discorddotjs',
  docs: 'book-open',
  docsrs: 'docsdotrs',
  drawio: 'diagramsdotnet',
  emacs: 'gnuemacs',
  email: 'mail',
  ember: 'emberdotjs',
  emberjs: 'emberdotjs',
  envoy: 'envoyproxy',
  error: 'circle-alert',
  esp32: 'espressif',
  expressjs: 'express',
  external: 'external-link',
  flink: 'apacheflink',
  flyio: 'flydotio',
  gcloud: 'googlecloud',
  gcp: 'googlecloud',
  gear: 'settings',
  gemini: 'googlegemini',
  gh: 'github',
  gha: 'githubactions',
  gl: 'gitlab',
  'globe-code': 'globe',
  godot: 'godotengine',
  golang: 'go',
  gql: 'graphql',
  groovy: 'apachegroovy',
  hadoop: 'apachehadoop',
  handlebars: 'handlebarsdotjs',
  handlebarsjs: 'handlebarsdotjs',
  hbs: 'handlebarsdotjs',
  help: 'circle-question-mark',
  hf: 'huggingface',
  hn: 'ycombinator',
  hs: 'haskell',
  html: 'html5',
  ig: 'instagram',
  illustrator: 'adobeillustrator',
  indesign: 'adobeindesign',
  inertiajs: 'inertia',
  'info-circle': 'info',
  intellij: 'intellijidea',
  itchio: 'itchdotio',
  js: 'javascript',
  jwt: 'jsonwebtokens',
  k8s: 'kubernetes',
  kafka: 'apachekafka',
  kali: 'kalilinux',
  knex: 'knexdotjs',
  knexjs: 'knexdotjs',
  kt: 'kotlin',
  license: 'scale',
  lightroom: 'adobelightroom',
  lr: 'adobelightroom',
  materialui: 'mui',
  maya: 'autodeskmaya',
  md: 'markdown',
  microchip: 'cpu',
  mistral: 'mistralai',
  mongo: 'mongodb',
  nest: 'nestjs',
  netbeans: 'apachenetbeanside',
  nextjs: 'nextdotjs',
  node: 'nodedotjs',
  nodejs: 'nodedotjs',
  notepadpp: 'notepadplusplus',
  npp: 'notepadplusplus',
  nuxtjs: 'nuxt',
  nvim: 'neovim',
  objc: 'objectivec',
  obs: 'obsstudio',
  openapi: 'openapiinitiative',
  otel: 'opentelemetry',
  p5js: 'p5dotjs',
  pg: 'postgresql',
  phoenix: 'phoenixframework',
  photoshop: 'adobephotoshop',
  plausible: 'plausibleanalytics',
  postgres: 'postgresql',
  pr: 'adobepremierepro',
  premiere: 'adobepremierepro',
  premierepro: 'adobepremierepro',
  ps: 'adobephotoshop',
  'puzzle-piece': 'puzzle',
  pwsh: 'powershell',
  py: 'python',
  question: 'circle-question-mark',
  radix: 'radixui',
  rails: 'rubyonrails',
  raspi: 'raspberrypi',
  rb: 'ruby',
  reactjs: 'react',
  repo: 'git-branch',
  'rocket-launch': 'rocket',
  rollup: 'rollupdotjs',
  rollupjs: 'rollupdotjs',
  rpi: 'raspberrypi',
  rs: 'rust',
  rtd: 'readthedocs',
  rxjs: 'reactivex',
  scrutinizer: 'scrutinizerci',
  scss: 'sass',
  security: 'shield',
  sh: 'gnubash',
  shadcn: 'shadcnui',
  shieldsio: 'shieldsdotio',
  sklearn: 'scikitlearn',
  snake: 'worm',
  socketio: 'socketdotio',
  solidjs: 'solid',
  spigot: 'spigotmc',
  sponsor: 'heart',
  spyder: 'spyderide',
  'square-text': 'message-square-text',
  sublime: 'sublimetext',
  success: 'circle-check',
  sveltejs: 'svelte',
  sveltekit: 'svelte',
  swatchbook: 'swatch-book',
  tailwind: 'tailwindcss',
  tex: 'latex',
  tf: 'terraform',
  tg: 'telegram',
  threejs: 'threedotjs',
  tofu: 'opentofu',
  torch: 'pytorch',
  traefik: 'traefikproxy',
  ts: 'typescript',
  tw: 'tailwindcss',
  ue: 'unrealengine',
  unreal: 'unrealengine',
  vb: 'visualbasic',
  vitejs: 'vite',
  vs: 'visualstudio',
  vscode: 'visualstudiocode',
  vue: 'vuedotjs',
  vuejs: 'vuedotjs',
  wandb: 'weightsandbiases',
  warn: 'triangle-alert',
  warning: 'triangle-alert',
  wasm: 'webassembly',
  web: 'globe',
  website: 'globe',
  wp: 'wordpress',
  xd: 'adobexd',
  xorg: 'xdotorg',
  yml: 'yaml',
  yt: 'youtube',
  zed: 'zedindustries',
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches the last character before a PascalCase word boundary (e.g., `AArrow` or `Down01`). */
const PASCAL_BOUNDARY_RX = /[\da-z](?=[A-Z])|[A-Z](?=[A-Z][a-z])/g;

/** Matches presentational `class="…"` attributes inside bundled icon SVG markup. */
const ICON_CLASS_ATTR_RX = /\s*class="[^"]*"/g;

/** Matches `fill="currentColor"`, `color="currentColor"`, or `class="…"` attributes inside filled Iconify SVG bodies. */
const BRAND_REDUNDANT_ATTR_RX = /\s*(?:(?:fill|color)="currentColor"|class="[^"]*")/g;

/** Matches a uniform `currentColor`-only `<defs><linearGradient id="…">…</linearGradient></defs>` block in Devicon Plain bodies. */
const UNIFORM_CURRENT_COLOR_GRADIENT_RX =
  /<defs><linearGradient id="(?<id>[\w-]+)"[^>]*>(?:<stop\b(?:[^/>]|\/(?!>))*stop-color="currentColor"(?:[^/>]|\/(?!>))*\/>)+<\/linearGradient><\/defs>/;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Convert a PascalCase Lucide export name into its kebab-case slug (e.g., `'ArrowDown01'` -> `'arrow-down01'`).
 * @param exportName   PascalCase export identifier.
 * @returns Lowercase kebab-case icon slug.
 */
export function formatLucideSlug(exportName: string): string {
  return exportName.replace(PASCAL_BOUNDARY_RX, '$&-').toLowerCase();
}

/**
 * Extract the inner markup of the outermost `<svg …>…</svg>` element and strip unused `class="…"` attributes.
 * @param rawSvg   Complete `<svg>` document string.
 * @returns Trimmed inner SVG markup, or `undefined` when malformed.
 */
export function extractInnerSvg(rawSvg: string): string | undefined {
  const openStart = rawSvg.indexOf('<svg');
  const openEnd = openStart === -1 ? -1 : rawSvg.indexOf('>', openStart);
  const closeStart = rawSvg.lastIndexOf('</svg>');
  if (openEnd === -1 || closeStart <= openEnd) {
    return undefined;
  }
  const inner = rawSvg.slice(openEnd + 1, closeStart).trim();
  return inner.includes('class="') ? inner.replace(ICON_CLASS_ATTR_RX, '').trim() : inner;
}

/**
 * Strip redundant `fill="currentColor"`, `color="currentColor"`, and `class="…"` attributes from a filled Iconify body.
 * @param rawBody   Raw Iconify SVG body markup.
 * @returns Trimmed SVG body controlled by parent `<g>` paint attributes.
 */
export function sanitizeBrandIconBody(rawBody: string): string {
  return rawBody.replace(BRAND_REDUNDANT_ATTR_RX, '').trim();
}

/**
 * Sanitize a `128x128` Devicon Plain SVG body and collapse uniform `currentColor`-only `<linearGradient>` wrappers.
 * @param rawBody   Raw Devicon Plain SVG body markup.
 * @returns Cleaned inner SVG body markup.
 */
export function sanitizeDeviconPlainBody(rawBody: string): string {
  let cleanBody = sanitizeBrandIconBody(rawBody);
  if (cleanBody.includes('<linearGradient')) {
    const gradMatch = UNIFORM_CURRENT_COLOR_GRADIENT_RX.exec(cleanBody);
    const gradId = gradMatch?.groups?.id;
    if (gradMatch && gradId) {
      cleanBody = cleanBody
        .replace(gradMatch[0], '')
        .replaceAll(` fill="url(#${gradId})"`, '')
        .replaceAll(`fill="url(#${gradId})"`, '')
        .trim();
    }
  }
  return cleanBody;
}
