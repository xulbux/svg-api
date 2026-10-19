/**
 * Documentation catalog – Showcase examples, Markdown snippets, and parameter tables for the Getting Started overview and every `svg.xul.is` documentation section.
 *
 * Every preview is rendered from its documented path by the live route dispatcher, and every numeric
 * range, count, color list, status preset, icon alias, animation token, and service route is read from
 * the code it documents, so the documentation cannot drift from the API.
 */

import { icons as deviconPlainSet } from '@iconify-json/devicon-plain';
import { icons as simpleIconSet } from '@iconify-json/simple-icons';
// oxlint-disable-next-line import/no-namespace -- Lucide exports one binding per icon; Counting them needs the whole namespace.
import * as lucideIcons from 'lucide-static';
import { listPublicServices, resolveServiceOwnerMode, STATUS_PRESET_MAP } from '@/config/services';
import { DEFAULT_ENV, SITE_ORIGIN } from '@/config/site';
import { THEME_COLOR_NAMES } from '@/config/theme';
import {
  renderAliasList,
  renderCardsHtml,
  renderParamTable,
  renderSectionHeader,
  renderSectionSubhead,
  renderShowcaseCard,
} from '@/preview/components';
import {
  capitalizeWord,
  formatSpecialExamples,
  formatVariantTierSummary,
  formatVariantValues,
} from '@/preview/glossary';
import { ICON_MOTION_TOKENS, SIZE_TOKENS } from '@/routes/params';
import {
  SERVICE_ERROR_TTL_SECONDS,
  SERVICE_TTL_SECONDS,
  STATIC_TTL_SECONDS,
  STATUS_TTL_SECONDS,
} from '@/routes/svg';
import { listServiceMetricAliases } from '@/services/fetcher';
import { FALLBACK_ICON_SLUG, ICON_SLUG_ALIASES } from '@/svg/icons';
import {
  DEFAULT_VERTICAL_QUOTE_WIDTH,
  QUOTE_FONT_SIZE_RANGE,
  QUOTE_SIZE_MAP,
  QUOTE_WIDTH_RANGE,
} from '@/svg/quote';
import {
  BUTTON_HEIGHT_RANGE,
  BUTTON_SIZE_PRESETS,
  ICON_SIZE_RANGE,
  ICON_STROKE_RANGE,
  MAX_SPARKLINE_POINTS,
  MAX_STRIP_TICKS,
} from '@/svg/renderer';
import { escapeXml, getOwnValue } from '@/svg/shared';
import {
  GROUP_GAP_RATIO,
  parseStackGroups,
  STACK_GAP_RANGE,
  STACK_GROUP_GAP_RANGE,
  STACK_PER_LINE_RANGE,
  STACK_TILE_SIZE_RANGE,
} from '@/svg/stack';
import type {
  BadgeVariant,
  IconSetCounts,
  NumericRange,
  ParamTableRow,
  ServiceDefinition,
  ShowcaseCardConfig,
  ShowcaseItem,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Descriptor for a badge, button, stack, or quote variant showcase card. */
interface VariantDescriptor {
  /** Short explanation of the visual hierarchy tier. */
  description: string;
  /** Variant query parameter identifier (`1`, `2`, `3`). */
  id: BadgeVariant;
  /** Display title for the variant card. */
  title: string;
}

/** Highlighted part of the URL anatomy example on the Getting Started page. */
interface UrlAnatomyPart {
  /** Syntax highlighting class (`hl-*`). */
  className: string;
  /** Legend label. */
  label: string;
  /** Literal URL text. */
  text: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Public endpoint families listed on the `/` homepage (`/btn/*` is an alias of `/button/*`). */
export const ENDPOINT_ROUTES: readonly string[] = [
  '/badge/*',
  '/button/*',
  '/icon/*',
  '/stack/*',
  '/quote/*',
];

/** Generic service preset route shown in the `/docs/services` header (each exact route is listed in its reference table). */
const SERVICE_ROUTE_PATTERN = '/badge/:service/[:owner/]:target/:metric';

/** Showcase definitions for the 3 badge hierarchy variants (`1`, `2`, `3`). */
const BADGE_VARIANT_DESCRIPTORS: readonly VariantDescriptor[] = [
  {
    description: '3D brand gradient right cap for primary status and repository metrics.',
    id: '1',
    title: 'variant=1 · Primary Badge (Default)',
  },
  {
    description: 'Tinted dark 3D right cap with a glowing colored border.',
    id: '2',
    title: 'variant=2 · Secondary Badge',
  },
  {
    description: 'Neutral carbon-dark surface with colored icon and muted value text.',
    id: '3',
    title: 'variant=3 · Tertiary Badge',
  },
];

/** Showcase definitions for the 3 CTA button hierarchy variants (`1`, `2`, `3`). */
const BUTTON_VARIANT_DESCRIPTORS: readonly VariantDescriptor[] = [
  {
    description: '3D Kumo brand gradient surface with upper-edge specular highlight.',
    id: '1',
    title: 'variant=1 · Primary Button (Default)',
  },
  {
    description: 'Tinted dark surface with glowing colored border and upper highlight.',
    id: '2',
    title: 'variant=2 · Secondary Button',
  },
  {
    description: 'Neutral carbon-dark surface with subtle border and colored icon.',
    id: '3',
    title: 'variant=3 · Tertiary Button',
  },
];

/** Showcase definitions for the 3 tech stack tile variants (`1`, `2`, `3`). */
const STACK_VARIANT_DESCRIPTORS: readonly VariantDescriptor[] = [
  {
    description: 'Filled 3D brand gradient tiles with crisp white icons.',
    id: '1',
    title: 'variant=1 · Primary Brand Gradient Stack',
  },
  {
    description: 'Tinted carbon-dark surface with glowing colored borders and brand-colored icons.',
    id: '2',
    title: 'variant=2 · Secondary Tinted Dark Stack (Default)',
  },
  {
    description: 'Neutral carbon-dark tiles with subtle borders and brand-colored icons.',
    id: '3',
    title: 'variant=3 · Tertiary Neutral Dark Stack',
  },
];

/** Multi-group tech stack DSL bands matching the full profile layout (joined with `;` on use). */
const FULL_PROFILE_GROUP_BANDS: readonly string[] = [
  'c,cpp,cs,rust,java,py,js,ts,php,lua,bash,powershell,html,css,sass,md:8',
  'dotnet,vue,pinia,laravel,symfony,nodejs,threejs,tauri,unity,unreal,tailwind,wordpress:6',
  'git,github,githubactions,vscode,visualstudio,npm,vite,cmake,linux,windows,raspberrypi,arduino:6|aws,azure,cloudflare,firebase,netlify,terraform,mysql,sqlite:4',
  'figma,ai,blender,ps,pr,ae:3|obsidian,notion,codepen,gtk,latex,regex:3',
];

/** URL-encoded sample quote text used across the quote card examples. */
const ENCODED_CHAOS_QUOTE =
  'Who+says+programmers+are+boring%3F+I+bring+the+humor+to+the+office+while+my+code+brings+the+chaos!';

/** URL-encoded second sample quote text. */
const ENCODED_EDGE_QUOTE =
  'Always+creating+more+cool+stuff+for+you%2C+with+balanced+OKLCH+colors+and+zero+cold+starts+at+the+edge.';

/** URL-encoded sample status texts for the status preset showcase (presets without a sample show their name). */
const STATUS_SAMPLE_TEXTS: Readonly<Record<string, string>> = {
  beta: 'v3+engine',
  degraded: '180ms+latency',
  incident: 'queue+load+94%25',
  maintenance: 'scheduled',
  offline: 'unreachable',
  online: 'operational',
  standby: 'warm+spare',
};

/** Showcase cards for the dedicated `/docs/buttons` page. */
const BUTTON_USE_CASE_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      { alt: 'Small Button', path: '/button/Small+26px?icon=sparkles&size=sm' },
      { alt: 'Medium Button', path: '/button/Medium+30px?icon=rocket&size=md&color=emerald' },
      { alt: 'Large Button', path: '/button/Large+36px?icon=zap&size=lg&color=cyan' },
      { alt: 'XL Hero Button', path: '/button/XL+Hero+42px?icon=flame&size=xl&color=rose' },
    ],
    subtitle: `Scale button height, padding, font size, and icon dimensions with ?size=${SIZE_TOKENS.join('|')} or a custom pixel height (${BUTTON_HEIGHT_RANGE.min} to ${BUTTON_HEIGHT_RANGE.max}).`,
    title: `Button Size Scale (?size=${SIZE_TOKENS.join('|')})`,
  },
  {
    items: [
      {
        alt: 'Explore Docs',
        href: `${SITE_ORIGIN}/docs/badges`,
        path: '/button/Explore+Docs?icon=book-open,arrow-right&anim=nudge',
      },
      {
        alt: 'Open Website',
        href: 'https://xul.is',
        path: '/button/Open+Website?icon=globe,external-link&color=sky&variant=2',
      },
      { alt: 'Continue', path: '/btn/Continue?icon=none,chevron-right&color=emerald' },
    ],
    subtitle:
      'Set a leading icon (?icon=name), both leading and trailing icons (?icon=left,right), or a trailing icon only (?icon=none,right).',
    title: 'Leading & Trailing Icons (?icon=left,right)',
  },
  {
    items: [
      {
        alt: 'Get Started',
        href: `${SITE_ORIGIN}/docs/badges`,
        path: '/button/Get+Started?icon=sparkles,arrow-right&anim=sheen',
      },
      { alt: 'Live Demo', path: '/button/Live+Demo?dot=online&color=emerald&variant=2' },
      { alt: 'Sponsor', path: '/button/Sponsor?icon=heart&color=rose&variant=2&anim=pulse' },
      {
        alt: 'Next Step',
        path: '/button/Next?icon=sparkles,arrow-right&color=violet&anim=shake,nudge',
      },
    ],
    subtitle:
      'Combine diagonal surface sheen (?anim=sheen), pulsing status dots (?dot=), icon motion (?anim=pulse|auto|...), and per-icon pairs (?anim=shake,nudge).',
    title: 'Surface Sheen, Status Dots & Icon Motion (?anim= & ?dot=)',
  },
  {
    items: [
      { alt: 'Deploy Production', path: '/button/Deploy/Production?icon=rocket' },
      {
        alt: 'Download v1.4.0',
        path: '/button/Download/v1.4.0?icon=download,arrow-right&color=emerald&variant=2',
      },
      {
        alt: 'Discussions Join',
        path: '/btn/Discussions/Join?icon=message-square&color=violet&variant=3',
      },
    ],
    subtitle:
      'Pass a second path segment (/button/:label/:value or /btn/:label/:value) for split action buttons with a vertical divider.',
    title: 'Two-Segment Split Action Buttons (/button/:label/:value)',
  },
];

/** Showcase cards for the dedicated `/docs/services` page (sample values; no network access). */
const SERVICE_PRESET_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      { alt: 'PyPI Version', path: '/badge/pypi/xulbux/v', sample: 'v1.4.0' },
      { alt: 'PyPI Total Downloads', path: '/badge/pypi/xulbux/dt', sample: '86.8k' },
      { alt: 'PyPI Monthly Downloads', path: '/badge/pypi/xulbux/dl', sample: '3.3k/mo' },
      { alt: 'Python Version', path: '/badge/pypi/xulbux/py', sample: '>=3.10' },
      { alt: 'PyPI License', path: '/badge/pypi/xulbux/license', sample: 'MIT' },
    ],
    subtitle:
      'Live package version, required Python, license, and ClickHouse ClickPy download stats.',
    title: 'PyPI & ClickPy (/badge/pypi/:pkg/:metric)',
  },
  {
    items: [
      { alt: 'npm Version', path: '/badge/npm/hono/v', sample: 'v4.13.13' },
      { alt: 'npm Monthly Downloads', path: '/badge/npm/hono/dl', sample: '4.2M/mo' },
      { alt: 'npm Weekly Downloads', path: '/badge/npm/hono/dw', sample: '1.1M/wk' },
      { alt: 'TypeScript Types', path: '/badge/npm/hono/types', sample: 'included' },
      {
        alt: 'Scoped npm Version',
        path: '/badge/npm/@iconify-json/simple-icons/v',
        sample: 'v1.2.100',
      },
    ],
    subtitle:
      'Supports both unscoped (/badge/npm/:pkg/:metric) and scoped (/badge/npm/:scope/:pkg/:metric) packages.',
    title: 'npm Registry (/badge/npm/:pkg/:metric)',
  },
  {
    items: [
      { alt: 'JSR Version', path: '/badge/jsr/std/path/v', sample: 'v1.1.6' },
      { alt: 'JSR Score', path: '/badge/jsr/std/path/score', sample: { score: 100 } },
      { alt: 'jsDelivr Monthly Hits', path: '/badge/jsdelivr/jquery/hm', sample: '1.6B/mo' },
      { alt: 'jsDelivr Yearly Hits', path: '/badge/jsdelivr/hono/hy', sample: '58.2M/yr' },
    ],
    subtitle:
      'JSR package version and quality score ring, plus jsDelivr CDN hits for any npm package.',
    title: 'JSR & jsDelivr (/badge/jsr/*, /badge/jsdelivr/*)',
  },
  {
    items: [
      { alt: 'Open VSX Version', path: '/badge/ovsx/xulbux/color-tracr/v', sample: 'v1.2.3' },
      { alt: 'Open VSX Downloads', path: '/badge/ovsx/xulbux/color-tracr/dt', sample: '2.5k' },
      { alt: 'Open VSX Rating', path: '/badge/ovsx/xulbux/color-tracr/rating', sample: '5.0/5' },
    ],
    subtitle: 'Version, total downloads, and average star rating for any Open VSX extension.',
    title: 'Open VSX Registry (/badge/ovsx/:namespace/:ext/:metric)',
  },
  {
    items: [
      { alt: 'Crates.io Version', path: '/badge/crates/serde/v', sample: 'v1.0.219' },
      { alt: 'Crates.io Total Downloads', path: '/badge/crates/serde/dt', sample: '490M' },
      { alt: 'Crates.io 90-Day Downloads', path: '/badge/crates/serde/dq', sample: '68.4M/90d' },
      { alt: 'Docker Pulls', path: '/badge/docker/alpine/pulls', sample: '1B' },
      { alt: 'Docker Stars', path: '/badge/docker/postgres/stars', sample: '14.2k' },
    ],
    subtitle: 'Rust crates.io package metrics and Docker Hub container pull/star counters.',
    title: 'Crates.io & Docker Hub (/badge/crates/*, /badge/docker/*)',
  },
  {
    items: [
      { alt: 'RubyGems Version', path: '/badge/gem/rails/v', sample: 'v8.1.4' },
      { alt: 'RubyGems Downloads', path: '/badge/gem/rails/dt', sample: '802.6M' },
      {
        alt: 'Packagist Version',
        path: '/badge/packagist/laravel/framework/v',
        sample: 'v13.30.0',
      },
      {
        alt: 'Packagist Monthly Installs',
        path: '/badge/packagist/laravel/framework/dl',
        sample: '18.2M/mo',
      },
      { alt: 'NuGet Version', path: '/badge/nuget/Newtonsoft.Json/v', sample: 'v13.0.4' },
      { alt: 'NuGet Downloads', path: '/badge/nuget/Newtonsoft.Json/dt', sample: '9.3B' },
    ],
    subtitle: 'Ruby gems, PHP Composer packages, and .NET NuGet packages.',
    title: 'RubyGems, Packagist & NuGet (/badge/gem/*, /badge/packagist/*, /badge/nuget/*)',
  },
  {
    items: [
      { alt: 'Hex Version', path: '/badge/hex/phoenix/v', sample: 'v1.8.15' },
      { alt: 'Hex 90-Day Downloads', path: '/badge/hex/phoenix/dq', sample: '5.6M/90d' },
      { alt: 'pub.dev Version', path: '/badge/pub/http/v', sample: 'v1.6.0' },
      { alt: 'pub.dev Likes', path: '/badge/pub/http/likes', sample: '8.5k' },
      {
        alt: 'pub.dev Points',
        path: '/badge/pub/http/points',
        sample: { grantedPoints: 150, maxPoints: 160 },
      },
    ],
    subtitle: 'Elixir/Erlang Hex.pm packages and Dart/Flutter pub.dev packages (pub points ring).',
    title: 'Hex.pm & pub.dev (/badge/hex/*, /badge/pub/*)',
  },
  {
    items: [
      { alt: 'AUR Version', path: '/badge/aur/yay/v', sample: 'v13.0.1-1' },
      { alt: 'AUR Votes', path: '/badge/aur/yay/votes', sample: '2.6k' },
      { alt: 'AUR Popularity', path: '/badge/aur/yay/popularity', sample: '18.66' },
      { alt: 'AUR License', path: '/badge/aur/yay/license', sample: 'GPL-3.0-or-later' },
    ],
    subtitle:
      'Arch User Repository version (amber when flagged out-of-date), votes, popularity, and license.',
    title: 'Arch User Repository (/badge/aur/:pkg/:metric)',
  },
  {
    items: [
      { alt: 'Arch Linux Version', path: '/badge/arch/firefox/v', sample: 'v158.0-1' },
      { alt: 'Arch Linux Repository', path: '/badge/arch/firefox/repo', sample: 'extra' },
      { alt: 'Fedora Rawhide Version', path: '/badge/fedora/python3/v', sample: 'v3.15.0-1.fc46' },
      { alt: 'Fedora 43 Version', path: '/badge/fedora/f43/python3/v', sample: 'v3.14.8-1.fc43' },
      { alt: 'MacPorts Version', path: '/badge/macports/git/v', sample: 'v2.56.0' },
      {
        alt: 'MacPorts License',
        path: '/badge/macports/git/license',
        sample: 'GPL-2 and LGPL-2.1+',
      },
    ],
    subtitle:
      'Official Arch Linux repository versions (amber when flagged out-of-date), Fedora branch versions (omit the branch for rawhide), and MacPorts ports.',
    title: 'Arch Linux, Fedora & MacPorts (/badge/arch/*, /badge/fedora/*, /badge/macports/*)',
  },
  {
    items: [
      { alt: 'GitLab Stars', path: '/badge/gitlab/gitlab-org/gitlab-runner/stars', sample: '2.6k' },
      {
        alt: 'GitLab Release',
        path: '/badge/gitlab/gitlab-org/gitlab-runner/release',
        sample: 'v19.5.0',
      },
      {
        alt: 'GitLab Subgroup Project Stars',
        path: '/badge/gitlab/gitlab-org/charts/gitlab-runner/stars',
        sample: '512',
      },
      { alt: 'Codeberg Stars', path: '/badge/codeberg/forgejo/forgejo/stars', sample: '5.7k' },
      { alt: 'Codeberg Issues', path: '/badge/codeberg/forgejo/forgejo/issues', sample: '1.6k' },
      { alt: 'Codeberg Pull Requests', path: '/badge/codeberg/forgejo/forgejo/prs', sample: '312' },
      {
        alt: 'Codeberg Activity',
        path: '/badge/codeberg/forgejo/forgejo/updated',
        sample: 'today',
      },
      { alt: 'Gitea Stars', path: '/badge/gitea/gitea/tea/stars', sample: '277' },
      { alt: 'Gitea Release', path: '/badge/gitea/gitea/tea/release', sample: 'v0.16.0' },
    ],
    subtitle:
      'Public repository metrics for any GitLab.com (incl. nested subgroups), Codeberg, or gitea.com owner (no token required).',
    title: 'GitLab, Codeberg & Gitea (/badge/gitlab/*, /badge/codeberg/*, /badge/gitea/*)',
  },
  {
    items: [
      { alt: 'Homebrew Version', path: '/badge/brew/wget/v', sample: 'v1.25.0' },
      { alt: 'Homebrew Installs', path: '/badge/brew/wget/dl', sample: '57.4k/mo' },
      { alt: 'Homebrew License', path: '/badge/brew/wget/license', sample: 'GPL-3.0-or-later' },
      { alt: 'Versioned Formula', path: '/badge/brew/python@3.12/v', sample: 'v3.12.12' },
      { alt: 'Homebrew Cask Version', path: '/badge/cask/firefox/v', sample: 'v158.0' },
      { alt: 'Homebrew Cask Installs', path: '/badge/cask/firefox/dy', sample: '184.8k/yr' },
    ],
    subtitle:
      'Formula and cask versions plus 30/90/365-day install analytics (dl/dq/dy); Encode + as %2B (gtk%2B3).',
    title: 'Homebrew (/badge/brew/:formula/:metric, /badge/cask/:cask/:metric)',
  },
  {
    items: [
      {
        alt: 'Hugging Face Monthly Downloads',
        path: '/badge/hf/openai-community/gpt2/dl',
        sample: '16.8M/mo',
      },
      {
        alt: 'Hugging Face Total Downloads',
        path: '/badge/hf/openai-community/gpt2/dt',
        sample: '942.5M',
      },
      { alt: 'Hugging Face Likes', path: '/badge/hf/openai-community/gpt2/likes', sample: '4.3k' },
      {
        alt: 'Hugging Face Dataset Downloads',
        path: '/badge/hf-dataset/HuggingFaceFW/fineweb/dl',
        sample: '328.7k/mo',
      },
    ],
    subtitle:
      'Model and dataset downloads (30-day and all-time) and likes from the Hugging Face Hub.',
    title: 'Hugging Face (/badge/hf/:owner/:model/:metric, /badge/hf-dataset/*)',
  },
  {
    items: [
      { alt: 'Modrinth Downloads', path: '/badge/modrinth/sodium/dt', sample: '249.1M' },
      { alt: 'Modrinth Followers', path: '/badge/modrinth/sodium/followers', sample: '41.9k' },
      { alt: 'Modrinth Game Version', path: '/badge/modrinth/sodium/game', sample: '26.3' },
      { alt: 'Firefox Add-on Version', path: '/badge/amo/ublock-origin/v', sample: 'v1.75.0' },
      { alt: 'Firefox Add-on Users', path: '/badge/amo/ublock-origin/users', sample: '11.4M' },
      { alt: 'Firefox Add-on Rating', path: '/badge/amo/ublock-origin/rating', sample: '4.8/5' },
    ],
    subtitle:
      'Modrinth project downloads, followers, and newest supported Minecraft release, plus Firefox add-on metrics.',
    title: 'Modrinth & Firefox Add-ons (/badge/modrinth/*, /badge/amo/*)',
  },
  {
    items: [
      { alt: 'SpigotMC Version', path: '/badge/spigot/9089/v', sample: 'v2.22.0' },
      { alt: 'SpigotMC Downloads', path: '/badge/spigot/9089/dt', sample: '5.9M' },
      { alt: 'SpigotMC Rating', path: '/badge/spigot/9089/rating', sample: '4.5/5' },
      { alt: 'Hangar Downloads', path: '/badge/hangar/ViaVersion/ViaVersion/dt', sample: '514.2k' },
      { alt: 'Hangar Stars', path: '/badge/hangar/ViaVersion/ViaVersion/stars', sample: '472' },
      {
        alt: 'Thunderstore Version',
        path: '/badge/thunderstore/BepInEx/BepInExPack/v',
        sample: 'v5.4.2305',
      },
      {
        alt: 'Thunderstore Downloads',
        path: '/badge/thunderstore/BepInEx/BepInExPack/dt',
        sample: '33.9M',
      },
    ],
    subtitle:
      'SpigotMC resources (via Spiget, by numeric resource ID), Hangar (PaperMC) projects, and Thunderstore mods.',
    title:
      'SpigotMC, Hangar & Thunderstore (/badge/spigot/:id/*, /badge/hangar/*, /badge/thunderstore/*)',
  },
  {
    items: [
      { alt: 'Flathub Version', path: '/badge/flathub/org.mozilla.firefox/v', sample: 'v158.0' },
      { alt: 'Flathub Installs', path: '/badge/flathub/org.mozilla.firefox/dt', sample: '12.4M' },
      {
        alt: 'Flathub Monthly Installs',
        path: '/badge/flathub/org.mozilla.firefox/dl',
        sample: '200.3k/mo',
      },
      { alt: 'CRAN Version', path: '/badge/cran/ggplot2/v', sample: 'v4.0.3' },
      { alt: 'CRAN Monthly Downloads', path: '/badge/cran/ggplot2/dl', sample: '2.1M/mo' },
      { alt: 'CRAN License', path: '/badge/cran/ggplot2/license', sample: 'MIT' },
    ],
    subtitle: 'Flatpak app versions and installs, plus R package versions and cranlogs downloads.',
    title: 'Flathub & CRAN (/badge/flathub/*, /badge/cran/*)',
  },
  {
    items: [
      {
        alt: 'OpenSSF Scorecard',
        path: '/badge/scorecard/ossf/scorecard/score',
        sample: { score: 8.3 },
      },
      {
        alt: 'Codecov Coverage',
        path: '/badge/codecov/codecov/codecov-api/coverage',
        sample: { totals: { coverage: 96.43 } },
      },
      {
        alt: 'Coveralls Coverage',
        path: '/badge/coveralls/lemurheavy/coveralls-ruby/coverage',
        sample: { covered_percent: 65.88 },
      },
    ],
    subtitle:
      'Ring gauges colored by threshold: Coverage >= 80% emerald, >= 60% amber; Scorecard >= 7 emerald, >= 4 amber; Otherwise rose.',
    title:
      'Scorecard, Codecov & Coveralls (/badge/scorecard/*, /badge/codecov/*, /badge/coveralls/*)',
  },
  {
    items: [
      { alt: 'deps.dev Stars', path: '/badge/depsdev/honojs/hono/stars', sample: '32.5k' },
      {
        alt: 'deps.dev Scorecard',
        path: '/badge/depsdev/expressjs/express/score',
        sample: { scorecard: { overallScore: 8.5 } },
      },
      {
        alt: 'SonarCloud Quality Gate',
        path: '/badge/sonarcloud/apache_struts/quality',
        sample: { component: { measures: [{ metric: 'alert_status', value: 'OK' }] } },
      },
      {
        alt: 'SonarCloud Coverage',
        path: '/badge/sonarcloud/apache_struts/coverage',
        sample: { component: { measures: [{ metric: 'coverage', value: '69.4' }] } },
      },
      {
        alt: 'SonarCloud Maintainability',
        path: '/badge/sonarcloud/apache_struts/maintainability',
        sample: { component: { measures: [{ metric: 'sqale_rating', value: '1.0' }] } },
      },
    ],
    subtitle:
      'deps.dev GitHub repository metrics for any owner (refreshed about daily), plus SonarCloud quality gates, coverage, and A–E ratings.',
    title: 'deps.dev & SonarCloud (/badge/depsdev/:owner/:repo/*, /badge/sonarcloud/:component/*)',
  },
  {
    items: [
      { alt: 'Discord Online', path: '/badge/discord/discord-developers/online', sample: '71.4k' },
      {
        alt: 'Discord Members',
        path: '/badge/discord/discord-developers/members',
        sample: '308.6k',
      },
      { alt: 'Bundle Size', path: '/badge/bundlephobia/react/min', sample: '7.8 kB' },
      {
        alt: 'Gzipped Bundle Size',
        path: '/badge/bundlephobia/@hono/node-server/gzip',
        sample: '8 kB',
      },
    ],
    subtitle:
      'Discord server presence via a permanent invite code, and Bundlephobia sizes for unscoped or scoped npm packages.',
    title: 'Discord & Bundlephobia (/badge/discord/:invite/*, /badge/bundlephobia/*)',
  },
  {
    items: [
      { alt: 'Go Module Version', path: '/badge/go/github.com/spf13/cobra/v', sample: 'v1.10.2' },
      { alt: 'WordPress Plugin Version', path: '/badge/wp/akismet/v', sample: 'v5.7.2' },
      { alt: 'WordPress Active Installs', path: '/badge/wp/akismet/installs', sample: '5M+' },
      { alt: 'WordPress Plugin Rating', path: '/badge/wp/akismet/rating', sample: '4.7/5' },
      { alt: 'WordPress Theme Version', path: '/badge/wp-theme/astra/v', sample: 'v4.14.1' },
    ],
    subtitle:
      'Go module versions (the full module path spans several segments) and WordPress plugin/theme metrics.',
    title: 'Go Modules & WordPress (/badge/go/:module/v, /badge/wp/*, /badge/wp-theme/*)',
  },
  {
    items: [
      { alt: 'CocoaPods Version', path: '/badge/cocoapods/Alamofire/v', sample: 'v5.12.2' },
      { alt: 'CocoaPods License', path: '/badge/cocoapods/Alamofire/license', sample: 'MIT' },
      { alt: 'Snapcraft Version', path: '/badge/snap/firefox/v', sample: 'v158.0-2' },
      { alt: 'Snapcraft License', path: '/badge/snap/firefox/license', sample: 'MPL-2.0' },
    ],
    subtitle: 'CocoaPods pod versions and licenses, plus stable Snap Store releases.',
    title: 'CocoaPods & Snapcraft (/badge/cocoapods/*, /badge/snap/*)',
  },
  {
    items: [
      { alt: 'Clojars Version', path: '/badge/clojars/ring/ring-core/v', sample: 'v1.15.5' },
      { alt: 'Clojars Downloads', path: '/badge/clojars/hiccup/dt', sample: '30.6M' },
      { alt: 'Hackage Version', path: '/badge/hackage/aeson/v', sample: 'v2.3.2.0' },
      { alt: 'Elm Package Version', path: '/badge/elm/elm/core/v', sample: 'v1.0.5' },
      { alt: 'Elm Package License', path: '/badge/elm/elm/core/license', sample: 'BSD-3-Clause' },
    ],
    subtitle:
      'Clojure artifacts (omit the group when it equals the artifact), Haskell packages, and Elm packages.',
    title: 'Clojars, Hackage & Elm (/badge/clojars/*, /badge/hackage/*, /badge/elm/*)',
  },
  {
    items: [
      { alt: 'Puppet Forge Version', path: '/badge/puppet/puppetlabs/stdlib/v', sample: 'v10.1.0' },
      {
        alt: 'Puppet Forge Downloads',
        path: '/badge/puppet/puppetlabs/stdlib/dt',
        sample: '120.6M',
      },
      {
        alt: 'Puppet Forge Score',
        path: '/badge/puppet/puppetlabs/stdlib/score',
        sample: { feedback_score: 98 },
      },
      {
        alt: 'Ansible Galaxy Version',
        path: '/badge/galaxy/community/general/v',
        sample: 'v13.5.0',
      },
      {
        alt: 'Ansible Galaxy Downloads',
        path: '/badge/galaxy/community/general/dt',
        sample: '278M',
      },
    ],
    subtitle:
      'Puppet Forge module metrics with a feedback score ring, and Ansible Galaxy collection versions and downloads.',
    title: 'Puppet Forge & Ansible Galaxy (/badge/puppet/*, /badge/galaxy/*)',
  },
  {
    items: [
      {
        alt: 'Terraform Module Version',
        path: '/badge/terraform/terraform-aws-modules/vpc/aws/v',
        sample: 'v6.7.3',
      },
      {
        alt: 'Terraform Module Downloads',
        path: '/badge/terraform/terraform-aws-modules/vpc/aws/dt',
        sample: '222.8M',
      },
      {
        alt: 'Terraform Provider Version',
        path: '/badge/tf-provider/hashicorp/aws/v',
        sample: 'v6.69.1',
      },
      {
        alt: 'Terraform Provider Downloads',
        path: '/badge/tf-provider/hashicorp/aws/dt',
        sample: '8.1B',
      },
      {
        alt: 'Artifact Hub Chart Version',
        path: '/badge/artifacthub/helm/bitnami/nginx/v',
        sample: 'v25.2.5',
      },
      {
        alt: 'Artifact Hub App Version',
        path: '/badge/artifacthub/helm/bitnami/nginx/app',
        sample: 'v1.31.7',
      },
    ],
    subtitle:
      'Terraform Registry module and provider versions and downloads, plus Artifact Hub package versions (e.g., Helm charts).',
    title:
      'Terraform & Artifact Hub (/badge/terraform/*, /badge/tf-provider/*, /badge/artifacthub/*)',
  },
  {
    items: [
      { alt: 'F-Droid Version', path: '/badge/fdroid/org.fdroid.fdroid/v', sample: 'v1.23.2' },
      {
        alt: 'Read the Docs Build',
        path: '/badge/rtd/pip/build',
        sample: { results: [{ state: { code: 'finished' }, success: true }] },
      },
      {
        alt: 'Read the Docs Failing Build',
        path: '/badge/rtd/broken-docs/build',
        sample: { results: [{ state: { code: 'finished' }, success: false }] },
      },
      { alt: 'Bluesky Followers', path: '/badge/bluesky/bsky.app/followers', sample: '35.3M' },
      { alt: 'Bluesky Posts', path: '/badge/bluesky/bsky.app/posts', sample: '880' },
    ],
    subtitle:
      'Suggested F-Droid app versions, the latest Read the Docs build status (passing, failing, or building), and Bluesky profile counters.',
    title: 'F-Droid, Read the Docs & Bluesky (/badge/fdroid/*, /badge/rtd/*, /badge/bluesky/*)',
  },
  {
    items: [
      {
        alt: 'Open Collective Backers',
        path: '/badge/opencollective/webpack/backers',
        sample: '3.1k',
      },
      {
        alt: 'Open Collective Budget',
        path: '/badge/opencollective/webpack/budget',
        sample: '$177.5k/yr',
      },
      { alt: 'Liberapay Patrons', path: '/badge/liberapay/Liberapay/patrons', sample: '1.8k' },
      {
        alt: 'Liberapay Receipts',
        path: '/badge/liberapay/Liberapay/receives',
        sample: '€640.85/wk',
      },
    ],
    subtitle:
      'Open Collective backers and yearly budget, plus Liberapay patrons and weekly receipts (hidden when private).',
    title: 'Open Collective & Liberapay (/badge/opencollective/*, /badge/liberapay/*)',
  },
  {
    items: [
      { alt: 'MetaCPAN Version', path: '/badge/cpan/Moose/v', sample: 'v2.4001' },
      { alt: 'MetaCPAN License', path: '/badge/cpan/Moose/license', sample: 'Perl 5' },
      { alt: 'MetaCPAN Last Release', path: '/badge/cpan/libwww-perl/updated', sample: '5mo ago' },
      { alt: 'Zenodo Downloads', path: '/badge/zenodo/3835582/dt', sample: '76k' },
      { alt: 'Zenodo Views', path: '/badge/zenodo/3835582/views', sample: '1.4k' },
      { alt: 'Zenodo DOI', path: '/badge/zenodo/3835582/doi', sample: '10.5281/zenodo.3835582' },
    ],
    subtitle:
      'Perl distribution versions, licenses, and release age from MetaCPAN, plus Zenodo record statistics (all versions) and DOIs.',
    title: 'MetaCPAN & Zenodo (/badge/cpan/:dist/*, /badge/zenodo/:record/*)',
  },
  {
    items: [
      { alt: 'Steam Players', path: '/badge/steam/730/players', sample: '982.3k' },
      { alt: 'Hacker News Karma', path: '/badge/hn/pg/karma', sample: '157.3k' },
    ],
    subtitle: 'Live Steam player counts by numeric app id and Hacker News karma.',
    title: 'Steam & Hacker News (/badge/steam/*, /badge/hn/*)',
  },
];

/** Showcase cards for the dedicated `/docs/icons` page. */
const ICON_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      { alt: 'Website', path: '/icon/globe-code?size=16&stroke=2.5' },
      { alt: 'Code', path: '/icon/code-xml?size=16&stroke=2.5' },
      { alt: 'Docs', path: '/icon/square-text?size=16&stroke=2.5' },
      { alt: 'Worm', path: '/icon/snake?size=16' },
      { alt: 'Terminal', path: '/icon/square-terminal?color=sky&size=20' },
      { alt: 'Package', path: '/icon/package?color=emerald' },
      { alt: 'Quick Start', path: '/icon/zap?color=amber&size=28' },
      { alt: 'Feedback', path: '/icon/heart-handshake?color=rose&size=28' },
    ],
    subtitle: 'For README section headers (size=28) and inline lists (size=16).',
    title: 'Lucide UI Stroke Icons (size=16 to 28)',
  },
  {
    items: [
      { alt: 'Arch Linux', path: '/icon/archlinux?color=cyan&size=28' },
      { alt: 'Python', path: '/icon/python?color=amber&size=28' },
      { alt: 'Rust', path: '/icon/rust?color=orange&size=28' },
      { alt: 'TypeScript', path: '/icon/ts?color=blue&size=28' },
      { alt: 'Cloudflare', path: '/icon/cloudflare?color=orange&size=28' },
      { alt: 'GitHub', path: '/icon/github?color=slate&size=28' },
    ],
    subtitle: 'Simple Icons and Devicon Plain vector logos tinted with any OKLCH color.',
    title:
      'Brand & Technology Vector Icons (@iconify-json/simple-icons, @iconify-json/devicon-plain)',
  },
  {
    items: [
      { alt: 'Sheen', path: '/icon/sparkles?color=amber&size=28&anim=sheen' },
      { alt: 'Auto Motion', path: '/icon/loader?color=sky&size=28&anim=auto' },
      { alt: 'Pulse', path: '/icon/heart?color=rose&size=28&anim=pulse' },
      { alt: 'Sheen + Float', path: '/icon/rocket?color=violet&size=28&anim=sheen,float' },
      { alt: 'Unknown Icon', path: '/icon/not-a-real-icon?color=slate&size=28' },
    ],
    subtitle:
      'Sheen, icon motion, and combined sheen,<motion> via ?anim= (pairs apply their first motion); Unknown slugs render the fallback icon.',
    title: 'Animations & Fallback (?anim=)',
  },
];

/** Vertical layout showcase cards for the dedicated `/docs/quotes` page. */
const VERTICAL_QUOTE_CARDS: readonly ShowcaseCardConfig[] = [
  {
    isCentered: true,
    items: [
      {
        alt: "XulbuX's Quote",
        path: `/quote/XulbuX/${ENCODED_CHAOS_QUOTE}?layout=vertical&variant=1&color=blue`,
      },
    ],
    subtitle: 'Primary brand gradient card in vertical layout with quote watermarks.',
    title: 'variant=1 · Vertical Primary Brand Quote',
  },
  {
    isCentered: true,
    items: [
      {
        alt: "XulbuX's Quote",
        path: `/quote/XulbuX/${ENCODED_CHAOS_QUOTE}?layout=vertical&variant=2`,
      },
    ],
    subtitle: 'Secondary tinted dark card with glowing indigo border (Default).',
    title: 'variant=2 · Vertical Secondary Tinted Quote (Default)',
  },
  {
    isCentered: true,
    items: [
      {
        alt: "XulbuX's Quote",
        path: `/quote/XulbuX/${ENCODED_CHAOS_QUOTE}?layout=vertical&variant=3&color=cyan`,
      },
    ],
    subtitle: 'Tertiary neutral dark card with subtle border and cyan watermarks.',
    title: 'variant=3 · Vertical Tertiary Neutral Quote',
  },
];

/** Horizontal layout showcase cards for the dedicated `/docs/quotes` page. */
const HORIZONTAL_QUOTE_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [{ alt: "XulbuX's Quote", path: `/quote/XulbuX/${ENCODED_CHAOS_QUOTE}?variant=1` }],
    subtitle: 'Horizontal layout with left accent bar and primary gradient fill.',
    title: 'variant=1 · Horizontal Primary Brand Quote',
  },
  {
    items: [
      { alt: "XulbuX's Quote", path: `/quote/XulbuX/${ENCODED_CHAOS_QUOTE}?variant=2&color=cyan` },
    ],
    subtitle: 'Horizontal layout with glowing cyan border and left accent bar.',
    title: 'variant=2 · Horizontal Secondary Tinted Quote (Default)',
  },
  {
    items: [
      {
        alt: "XulbuX's Quote",
        path: `/quote/${ENCODED_EDGE_QUOTE}?author=XulbuX&variant=3&anim=sheen`,
      },
    ],
    subtitle:
      'Single-segment /quote/:text form with ?author=, a neutral dark surface, and a diagonal sheen (?anim=sheen).',
    title: 'variant=3 · Horizontal Tertiary Neutral Quote',
  },
];

/** Highlighted parts of the URL anatomy example on the Getting Started page. */
const URL_ANATOMY_PARTS: readonly UrlAnatomyPart[] = [
  { className: 'hl-p', label: 'Origin', text: SITE_ORIGIN },
  { className: 'hl-url', label: 'Endpoint', text: '/badge' },
  { className: 'hl-alt', label: 'Path segments', text: '/build+status/passing' },
  { className: 'hl-key', label: 'Query parameters', text: '?icon=circle-check&color=emerald' },
];

/** Path segment encoding rules (every example is a working, documented path). */
const SEGMENT_ENCODING_ROWS: readonly ParamTableRow[] = [
  {
    defaultVal: '/badge/build+status/passing',
    description: 'Both forms decode to a space inside a path segment.',
    name: 'Space',
    values: '+ / %20',
  },
  {
    defaultVal: '/badge/language/C%2B%2B',
    description: 'A raw + would decode to a space.',
    name: '+',
    values: '%2B',
  },
  {
    defaultVal: '/badge/coverage/99%25',
    description: 'Percent signs start escape sequences, so they must be escaped themselves.',
    name: '%',
    values: '%25',
  },
  {
    defaultVal: '/badge/requests/2.4M%2Fd',
    description: 'A raw / would start a new path segment.',
    name: '/',
    values: '%2F',
  },
  {
    defaultVal: '/badge/question/why%3F',
    description:
      'Raw ? and # end the path; A raw & inside a query value starts the next parameter.',
    name: '? / # / &',
    values: '%3F / %23 / %26',
  },
  {
    defaultVal: '/badge//100%25?icon=zap',
    description:
      'An empty segment omits the label (icon + value only) or the value (single-part tag).',
    name: 'Empty segment',
    values: '//',
  },
];

/** Column labels of the path segment encoding table. */
const SEGMENT_ENCODING_COLUMNS: ParamTableRow = {
  defaultVal: 'Example',
  description: 'Notes',
  name: 'Character',
  values: 'Write as',
};

/** Column labels of the shared query parameter table. */
const SHARED_PARAM_COLUMNS: ParamTableRow = {
  defaultVal: 'Endpoints',
  description: 'Description',
  name: 'Parameter',
  values: 'Values',
};

/** Column labels of the edge caching table. */
const CACHING_COLUMNS: ParamTableRow = {
  defaultVal: 'On errors',
  description: 'Notes',
  name: 'Routes',
  values: 'Edge TTL',
};

/** Showcase cards of the embedding section on the Getting Started page. */
const EMBEDDING_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      { alt: 'Build Status', path: '/badge/build+status/passing?icon=circle-check&color=emerald' },
    ],
    subtitle:
      'Paste the Markdown image snippet into any README; GitHub proxies and caches the SVG through its image CDN.',
    title: 'Static Badge (Markdown Image)',
  },
  {
    items: [{ alt: 'PyPI Downloads', path: '/badge/pypi/xulbux/dt', sample: '86.8k' }],
    subtitle:
      'Live service badges are wrapped in a link to their upstream page; Opening the badge URL itself also redirects there (302).',
    title: 'Live Service Badge (Linked Image)',
  },
];

/** Memoized icon set counts (`undefined` until first computed). */
let iconSetCountsCache: IconSetCounts | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Format a numeric range as a parameter table value (`'8 to 256'`). */
function formatRange(range: NumericRange): string {
  return `${range.min} to ${range.max}`;
}

/** Format the `?color=` parameter row values. */
function formatColorValues(): string {
  return `indigo | cyan | emerald | rose | amber | ... (${THEME_COLOR_NAMES.length} colors)`;
}

/** Build a `?color=` parameter row. */
function buildColorParamRow(defaultVal: string, description: string): ParamTableRow {
  return { defaultVal, description, name: '?color=', values: formatColorValues() };
}

/** Build a `?dot=` parameter row listing every status preset (any theme color is accepted as well). */
function buildDotParamRow(description: string): ParamTableRow {
  return {
    defaultVal: 'none',
    description: `${description} Accepts a status preset name or any theme color; none removes a preset dot.`,
    name: '?dot=',
    values: `none | ${Object.keys(STATUS_PRESET_MAP).join(' | ')} | emerald | sky | ... (${THEME_COLOR_NAMES.length} colors)`,
  };
}

/** Build a `?variant=` parameter row (`'<topic>: 1 = Primary gradient, …'` from the shared tier table). */
function buildVariantParamRow(defaultVal: BadgeVariant, topic: string): ParamTableRow {
  return {
    defaultVal,
    description: `${topic}: ${formatVariantTierSummary()}.`,
    name: '?variant=',
    values: formatVariantValues(),
  };
}

/** Build a `?icon=` parameter row for badges and buttons. */
function buildIconQueryParamRow(description: string, values: string): ParamTableRow {
  return { defaultVal: 'none', description, name: '?icon=', values };
}

/** Build the full `?anim=` parameter row for badges and buttons (every motion token from the parser). */
function buildAnimParamRow(): ParamTableRow {
  return {
    defaultVal: 'default',
    description:
      'Surface sheen, one icon motion (auto picks a motion per icon; default keeps icons static), a per-icon <left>,<right> pair (e.g., shake,nudge or none,nudge), or sheen combined with either; none also stops widget and dot animations.',
    name: '?anim=',
    values: `sheen | ${ICON_MOTION_TOKENS.join(' | ')} | <left>,<right> | sheen,<motion> | sheen,<left>,<right>`,
  };
}

/** Build a sheen-only `?anim=` parameter row for stacks and quote cards. */
function buildSheenAnimParamRow(description: string): ParamTableRow {
  return { defaultVal: '~static', description, name: '?anim=', values: 'sheen | none' };
}

/** Build the status preset items (every preset in `STATUS_PRESET_MAP`, plus the neutral unknown-state fallback). */
function buildStatusPresetItems(): ShowcaseItem[] {
  const items: ShowcaseItem[] = [];
  for (const state of Object.keys(STATUS_PRESET_MAP)) {
    items.push({
      alt: `Status ${capitalizeWord(state)}`,
      path: `/badge/status/${state}/${getOwnValue(STATUS_SAMPLE_TEXTS, state) ?? state}`,
    });
  }
  items.push({ alt: 'Status Unknown', path: '/badge/status/unknown/falls+back+to+neutral' });
  return items;
}

/** Build the showcase cards for inline data widgets, status presets, structural layouts, and micro-animations. */
function buildBadgeUseCaseCards(): ShowcaseCardConfig[] {
  return [
    {
      items: [
        {
          alt: 'Sparkline Widget',
          path: '/badge/latency/14ms?icon=activity&special=sparkline:22,19,21,17,15,16,14',
        },
        {
          alt: 'Progress Bar Widget',
          path: '/badge/coverage/92%25?icon=shield-check&color=emerald&special=bar:92',
        },
        {
          alt: 'Donut Ring Widget',
          path: '/badge/kv+quota/84%25?icon=cpu&color=sky&special=ring:84:pulse',
        },
        {
          alt: 'Uptime Strip Widget',
          path: '/badge/status/online/99.98%25?special=strip:9987998999',
        },
        {
          alt: 'Delta Trend Pill',
          path: '/badge/requests/2.4M%2Fd?icon=trending-up&color=violet&special=delta:%2B38%25',
        },
      ],
      subtitle:
        'Embed sparklines, progress bars, donut rings, 10-stage strips, and delta pills via ?special=.',
      title: 'Inline Data Visualizations (?special=)',
    },
    {
      items: buildStatusPresetItems(),
      subtitle:
        'Outward radar ripple dots via /badge/status/:state/:text or ?dot=; Unknown states render a neutral slate dot.',
      title: 'Pulsing Radar Status Presets (/badge/status/:state/:text)',
    },
    {
      items: [
        { alt: 'Single-Part Tag', path: '/badge/xulbux?icon=sparkles' },
        { alt: 'Secondary Tag', path: '/badge/verified?icon=shield-check&color=emerald&variant=2' },
        { alt: 'Compact Icon + Value', path: '/badge//100%25?icon=zap&color=amber' },
        { alt: 'Dual-Icon Badge', path: '/badge/docs/read?icon=book-open,arrow-right&color=sky' },
        { alt: 'Icon-Only Pill', path: '/badge/?icon=github&color=violet' },
        { alt: 'No-Icon Badge', path: '/badge/platform/linux?color=rose' },
      ],
      subtitle:
        'Omit label or value segments, or set both left and right icons via ?icon=left,right.',
      title: 'Flexible Structural Layouts (/badge/:label, /badge//:value)',
    },
    {
      items: [
        { alt: 'Sheen Sweep', path: '/badge/Release/v2.0?icon=sparkles&anim=sheen' },
        {
          alt: 'Sheen + Icon Motion',
          path: '/badge/Featured?icon=sparkles&color=amber&anim=sheen,auto',
        },
        {
          alt: 'Icon Spin',
          path: '/badge/build/running?icon=loader&color=sky&variant=2&anim=spin',
        },
        {
          alt: 'Icon Pulse',
          path: '/badge/sponsor/heart?icon=heart&color=rose&variant=2&anim=pulse',
        },
        { alt: 'Icon Nudge', path: '/badge/next/step?icon=arrow-right&color=emerald&anim=nudge' },
      ],
      subtitle:
        'Surface sheen, icon motion presets (auto/spin/shake/nudge/pulse/float), or combined sheen,auto via ?anim=.',
      title: 'SVG Micro-Animations (?anim=)',
    },
  ];
}

/** Build the parameter reference rows for `/badge/*` routes. */
function buildBadgeParamRows(): ParamTableRow[] {
  return [
    {
      defaultVal: '~unknown states render a neutral slate dot',
      description:
        'Status preset of /badge/status/:state/:text; Sets the label, color, and pulsing radar dot.',
      name: ':state',
      values: Object.keys(STATUS_PRESET_MAP).join(' | '),
    },
    buildVariantParamRow('1', 'Hierarchy tier'),
    buildColorParamRow(
      'indigo',
      'Tailwind v4 OKLCH accent palette for gradients, borders, and icons.'
    ),
    buildIconQueryParamRow(
      'Leading left icon (icon=name), both left and right icons (icon=left,right), right-only icon (icon=none,right), or none.',
      'circle-check | rocket,arrow-right | none,external-link | none | ...'
    ),
    buildDotParamRow('Pulsing radar status dot.'),
    {
      defaultVal: 'none',
      description: `Inline data widget on the right side: sparkline (2 to ${MAX_SPARKLINE_POINTS} comma- or space-separated numbers), bar or ring percentage (bars shimmer unless :static; rings pulse only with :pulse), strip (up to ${MAX_STRIP_TICKS} ticks from 0 to 9, as digits or comma/space-separated), or a delta pill.`,
      name: '?special=',
      values: formatSpecialExamples(),
    },
    buildAnimParamRow(),
  ];
}

/** Build the parameter reference rows for `/button/*` and `/btn/*` routes. */
function buildButtonParamRows(): ParamTableRow[] {
  const presetHeights: string[] = [];
  for (const [presetName, preset] of Object.entries(BUTTON_SIZE_PRESETS)) {
    presetHeights.push(`${presetName}=${preset.height}px`);
  }
  return [
    buildVariantParamRow('1', 'Surface tier'),
    {
      defaultVal: `md (${BUTTON_SIZE_PRESETS.md.height}px)`,
      description: `Button scale preset (${presetHeights.join(', ')}) or custom pixel height.`,
      name: '?size=',
      values: `${SIZE_TOKENS.join(' | ')} | ${formatRange(BUTTON_HEIGHT_RANGE)}`,
    },
    buildColorParamRow(
      'indigo',
      'Tailwind v4 OKLCH accent palette for gradients, borders, and icons.'
    ),
    buildIconQueryParamRow(
      'Leading left icon (icon=name), both left and right icons (icon=left,right), or trailing right icon only (icon=none,right).',
      'rocket | book-open,arrow-right | none,chevron-right | sparkles | ...'
    ),
    buildDotParamRow('Leading pulsing radar status dot.'),
    buildAnimParamRow(),
  ];
}

/** Build the route pattern of a service preset (e.g., `/badge/npm/[:scope/]:pkg/:metric`). */
function buildServiceRoutePattern(key: string, service: ServiceDefinition): string {
  const { owner, target } = service.route;
  if (!owner) {
    return `/badge/${key}/${target.placeholder}/:metric`;
  }
  const ownerPart = owner.isRequired ? `${owner.placeholder}/` : `[${owner.placeholder}/]`;
  return `/badge/${key}/${ownerPart}${target.placeholder}/:metric`;
}

/** Format a service's metrics with their effective aliases as a parameter value (e.g., `'v | dt | license [l]'`). */
function formatServiceMetricValues(service: ServiceDefinition): string {
  const aliasesByMetric = new Map<string, string[]>();
  for (const [alias, metric] of listServiceMetricAliases(service)) {
    const aliases = aliasesByMetric.get(metric);
    if (aliases) {
      aliases.push(alias);
    } else {
      aliasesByMetric.set(metric, [alias]);
    }
  }
  const metricValues: string[] = [];
  for (const metric of Object.keys(service.metrics)) {
    const aliases = aliasesByMetric.get(metric);
    metricValues.push(aliases ? `${metric} [${aliases.join(', ')}]` : metric);
  }
  return metricValues.join(' | ');
}

/** Format the `Default` cell of a service route row (default owner, optional owner, or required owner). */
function formatServiceDefaultValue(service: ServiceDefinition): string {
  const { owner } = service.route;
  const ownerMode = resolveServiceOwnerMode(service);
  if (!owner || ownerMode === 'none') {
    return '~—';
  }
  if (ownerMode === 'required') {
    return `~${owner.placeholder} required`;
  }
  const defaultOwner = owner.resolveDefault?.(DEFAULT_ENV);
  return defaultOwner ? `${defaultOwner} (${owner.placeholder})` : `~${owner.placeholder} optional`;
}

/** Build the route and metric reference rows for `/docs/services` from `SERVICES_CONFIG`. */
function buildServiceParamRows(): ParamTableRow[] {
  const rows: ParamTableRow[] = [];
  for (const [key, service] of listPublicServices()) {
    rows.push({
      defaultVal: formatServiceDefaultValue(service),
      description: `${service.docs.title}: ${service.docs.description}`,
      name: buildServiceRoutePattern(key, service),
      values: formatServiceMetricValues(service),
    });
  }
  rows.push(
    {
      defaultVal: '~service preset',
      description: 'Overrides the default left-hand label text on any service badge.',
      name: '?label=',
      values: '~any string',
    },
    {
      defaultVal: '~service preset',
      description:
        'All standard badge query params (?variant=, ?color=, ?icon=, ?dot=, ?anim=, ?special=) apply; An empty ?icon= keeps the preset icon.',
      name: '?variant= / ?color= / ...',
      values: `${formatVariantValues()} (and ${THEME_COLOR_NAMES.length} colors)`,
    }
  );
  return rows;
}

/** Build the parameter reference rows for `/icon/:icon` routes. */
function buildIconParamRows(): ParamTableRow[] {
  return [
    {
      defaultVal: `~required (unknown slugs fall back to ${FALLBACK_ICON_SLUG})`,
      description:
        'Lucide stroke slug, Simple Icons slug, Devicon Plain slug, or one of the slug aliases listed below.',
      name: ':icon',
      values: 'rocket | star | python | rust | archlinux | ...',
    },
    buildColorParamRow(
      'indigo',
      'Tailwind v4 OKLCH theme color applied to the icon stroke or fill.'
    ),
    {
      defaultVal: `${ICON_SIZE_RANGE.default} (px)`,
      description: 'Intrinsic SVG width and height in pixels.',
      name: '?size=',
      values: formatRange(ICON_SIZE_RANGE),
    },
    {
      defaultVal: String(ICON_STROKE_RANGE.default),
      description: 'Stroke width for Lucide stroke icons.',
      name: '?stroke=',
      values: `${formatRange(ICON_STROKE_RANGE)} (e.g., 1.5, 2.5)`,
    },
    {
      defaultVal: 'default',
      description:
        'Diagonal sheen, one icon motion (auto picks a motion per icon), or sheen combined with a motion; Per-icon pairs apply their first motion to the single icon.',
      name: '?anim=',
      values: `sheen | ${ICON_MOTION_TOKENS.join(' | ')} | sheen,<motion>`,
    },
  ];
}

/** Build the parameter reference rows for `/stack/:groups` routes. */
function buildStackParamRows(): ParamTableRow[] {
  return [
    {
      defaultVal: '~required',
      description:
        'Icon slugs with :N columns per group, | side-by-side groups, and ; row bands; Read from the path segment, then ?groups=, ?icons=, and ?i= (empty values fall through).',
      name: ':groups / ?groups= / ?icons= / ?i=',
      values: 'c,cpp,cs,rust:4 | aws,cloudflare:2 ; figma,blender:2',
    },
    buildVariantParamRow('2', 'Tile hierarchy'),
    buildColorParamRow(
      '~per-icon brand color',
      'Uniform theme color override applied to all tiles.'
    ),
    {
      defaultVal: String(STACK_PER_LINE_RANGE.default),
      description:
        'Fallback column count per row, or a comma-separated list per group; Invalid list entries keep their position and use the group default.',
      name: '?perline=',
      values: `${formatRange(STACK_PER_LINE_RANGE)} (or 8,6,6,4,3,3)`,
    },
    {
      defaultVal: `${STACK_TILE_SIZE_RANGE.default} (px)`,
      description: 'Width and height of each rounded square tile in pixels.',
      name: '?size=',
      values: formatRange(STACK_TILE_SIZE_RANGE),
    },
    {
      defaultVal: `${STACK_GAP_RANGE.default} (gap) / round(gap × ${GROUP_GAP_RATIO}) (groupgap)`,
      description:
        'Tile spacing in pixels (?gap= within groups, ?groupgap= or its ?ggap= alias between groups).',
      name: '?gap= / ?groupgap= / ?ggap=',
      values: `${formatRange(STACK_GAP_RANGE)} / ${formatRange(STACK_GROUP_GAP_RANGE)}`,
    },
    buildSheenAnimParamRow('Diagonal sheen sweep across every tile, or none.'),
  ];
}

/** Build the parameter reference rows for `/quote/*` routes. */
function buildQuoteParamRows(): ParamTableRow[] {
  return [
    {
      defaultVal: '~required',
      description:
        'Author attribution and quote body text (+ or %20 for spaces); The single-segment form reads the author from ?author=.',
      name: ':author / :text',
      values: '/quote/XulbuX/Your+quote+here | /quote/Your+quote+here',
    },
    {
      defaultVal: '~none',
      description: 'Author attribution for the single-segment /quote/:text and /quote?text= forms.',
      name: '?author=',
      values: '~any string',
    },
    {
      defaultVal: '~none',
      description:
        'Quote body text when no path segment is given (e.g., /quote?text=Hi&author=XulbuX).',
      name: '?text= / ?quote=',
      values: '~any string',
    },
    buildVariantParamRow('2', 'Surface tier'),
    {
      defaultVal: 'horizontal',
      description:
        'Layout mode: horizontal (left accent bar) or vertical (centered watermarks); center and v are vertical aliases, and ?type= is an alias of ?layout= (an empty ?layout= falls through to ?type=).',
      name: '?layout= / ?type=',
      values: 'horizontal | vertical | center | v',
    },
    {
      defaultVal: '~false',
      description:
        'Shorthand for the vertical layout; Only read when ?layout= and ?type= are empty.',
      name: '?center=',
      values: 'true | 1 | yes',
    },
    {
      defaultVal: `md (${QUOTE_SIZE_MAP.md}px) / lg (${QUOTE_SIZE_MAP.lg}px, vertical)`,
      description: 'Typography scale preset or custom pixel size.',
      name: '?size=',
      values: `${SIZE_TOKENS.join(' | ')} | ${formatRange(QUOTE_FONT_SIZE_RANGE)}`,
    },
    buildColorParamRow(
      'indigo',
      'Tailwind v4 OKLCH accent color for surface, border, and quote marks.'
    ),
    {
      defaultVal: `${QUOTE_WIDTH_RANGE.default} (horizontal) / ${DEFAULT_VERTICAL_QUOTE_WIDTH} (vertical)`,
      description:
        "Card width in pixels; The default grows proportionally with text sizes above the layout's default size, and the height adapts to the wrapped lines.",
      name: '?width=',
      values: formatRange(QUOTE_WIDTH_RANGE),
    },
    buildSheenAnimParamRow('Diagonal sheen sweep across the card surface, or none.'),
  ];
}

/** Build the 4 static badge items for a `22px` badge variant (`1`, `2`, `3`). */
function buildBadgeVariantItems(variant: BadgeVariant): ShowcaseItem[] {
  return [
    { alt: 'build', path: `/badge/build/passing?icon=circle-check&variant=${variant}` },
    { alt: 'arch', path: `/badge/arch/hyprland?icon=archlinux&color=cyan&variant=${variant}` },
    {
      alt: 'runtime',
      path: `/badge/runtime/cloudflare?icon=cloudflare&color=emerald&variant=${variant}`,
    },
    {
      alt: 'security',
      path: `/badge/security/verified?icon=shield-check&color=rose&variant=${variant}`,
    },
  ];
}

/** Build the 4 CTA button items for a `30px` button variant (`1`, `2`, `3`). */
function buildButtonVariantItems(variant: BadgeVariant): ShowcaseItem[] {
  return [
    {
      alt: 'Documentation',
      href: `${SITE_ORIGIN}/docs/badges`,
      path: `/button/Documentation?icon=book-open&variant=${variant}`,
    },
    {
      alt: 'Install Arch',
      path: `/button/Install+Arch?icon=archlinux&color=cyan&variant=${variant}`,
    },
    {
      alt: 'Latest Release',
      path: `/button/Latest+Release?icon=rocket&color=emerald&variant=${variant}`,
    },
    { alt: 'Report Issue', path: `/button/Report+Issue?icon=bug&color=rose&variant=${variant}` },
  ];
}

/** Build the single full-profile stack example for a stack variant. */
function buildStackVariantItems(variant: BadgeVariant): ShowcaseItem[] {
  return [
    {
      alt: `Tech Stack (Variant ${variant})`,
      path: `/stack/${FULL_PROFILE_GROUP_BANDS.join(';')}?variant=${variant}`,
    },
  ];
}

/** Render one showcase card per variant descriptor using `buildItems` for its examples. */
function renderVariantCardsHtml(
  descriptors: readonly VariantDescriptor[],
  buildItems: (variant: BadgeVariant) => ShowcaseItem[],
  isCentered = false
): string {
  let cardsHtml = '';
  for (const descriptor of descriptors) {
    cardsHtml += renderShowcaseCard({
      isCentered,
      items: buildItems(descriptor.id),
      subtitle: descriptor.description,
      title: descriptor.title,
    });
  }
  return cardsHtml;
}

/** Count the icons of the full-profile stack example through the live stack DSL parser. */
function countFullProfileIcons(): number {
  let iconCount = 0;
  for (const band of parseStackGroups(FULL_PROFILE_GROUP_BANDS.join(';'))) {
    for (const group of band) {
      iconCount += group.icons.length;
    }
  }
  return iconCount;
}

/** Format a TTL in seconds as a compact duration (`3600` -> `'1 h'`, `300` -> `'5 min'`, `45` -> `'45 s'`). */
function formatDuration(seconds: number): string {
  if (seconds % 3600 === 0) {
    return `${seconds / 3600} h`;
  }
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
}

/** Render the highlighted URL anatomy example with its legend. */
function renderUrlAnatomyHtml(): string {
  let urlHtml = '';
  let legendHtml = '';
  for (const part of URL_ANATOMY_PARTS) {
    urlHtml += `<span class="${part.className}">${escapeXml(part.text)}</span>`;
    legendHtml += `<li class="anatomy-legend-item"><span class="anatomy-swatch ${part.className}" aria-hidden="true"></span>${escapeXml(part.label)}</li>`;
  }
  return `<figure class="anatomy">
      <code class="anatomy-url">${urlHtml}</code>
      <figcaption><ul class="anatomy-legend" role="list">${legendHtml}</ul></figcaption>
    </figure>`;
}

/** Build the shared query parameter rows (values read from the parser and theme). */
function buildSharedParamRows(): ParamTableRow[] {
  return [
    {
      defaultVal: '/badge | /button | /icon | /stack | /quote',
      description: `Any of the ${THEME_COLOR_NAMES.length} Tailwind v4 OKLCH theme colors (see Colors); Stacks keep per-icon brand colors unless set.`,
      name: '?color=',
      values: formatColorValues(),
    },
    {
      defaultVal: '/badge | /button | /stack | /quote',
      description: `Visual hierarchy tier: ${formatVariantTierSummary()}.`,
      name: '?variant=',
      values: formatVariantValues(),
    },
    {
      defaultVal: '/badge | /button',
      description:
        'Leading icon, a left,right pair, or a right-only icon (none,right); Any Lucide, Simple Icons, or Devicon slug.',
      name: '?icon=',
      values: 'rocket | book-open,arrow-right | none,external-link',
    },
    {
      defaultVal: '/badge | /button | /icon | /stack | /quote',
      description:
        'Surface sheen and icon motions (stacks and quote cards support sheen only); none also stops widget and dot animations.',
      name: '?anim=',
      values: `sheen | ${ICON_MOTION_TOKENS.join(' | ')}`,
    },
    {
      defaultVal: '/badge | /button | /icon | /stack | /quote',
      description:
        'Unknown query parameters are ignored per route, so tracking or cache-busting parameters never change the SVG.',
      name: '?<other>=',
      values: '~any parameter a route does not document',
    },
  ];
}

/** Build the edge caching rows (TTLs read from the route dispatcher). */
function buildCachingRows(): ParamTableRow[] {
  return [
    {
      defaultVal: '~—',
      description: 'Deterministic SVGs; Identical URLs always render identical output.',
      name: '/badge/:label/:value, /button, /icon, /stack, /quote',
      values: formatDuration(STATIC_TTL_SECONDS),
    },
    {
      defaultVal: '~—',
      description: 'Status presets refresh faster so state changes propagate quickly.',
      name: '/badge/status/:state/:text',
      values: formatDuration(STATUS_TTL_SECONDS),
    },
    {
      defaultVal: formatDuration(SERVICE_ERROR_TTL_SECONDS),
      description: 'Upstream JSON is cached separately; Failed or pending lookups retry sooner.',
      name: '/badge/:service/...',
      values: formatDuration(SERVICE_TTL_SECONDS),
    },
  ];
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Count (once per isolate) the distinct icons of the bundled Lucide, Simple Icons, and Devicon Plain sets.
 * @returns Distinct Lucide and brand icon counts.
 */
export function getIconSetCounts(): IconSetCounts {
  if (iconSetCountsCache === undefined) {
    const lucideGlyphs = new Set<string>();
    for (const glyph of Object.values(lucideIcons)) {
      if (typeof glyph === 'string') {
        lucideGlyphs.add(glyph);
      }
    }
    const brandSlugs = new Set<string>(Object.keys(simpleIconSet.icons));
    for (const slug of Object.keys(deviconPlainSet.icons)) {
      brandSlugs.add(slug);
    }
    iconSetCountsCache = { brand: brandSlugs.size, lucide: lucideGlyphs.size };
  }
  return iconSetCountsCache;
}

/**
 * Format a large count as a rounded-down lower bound (e.g., `1890` -> `'1,800+'`).
 * @param count   Exact count.
 * @returns Human-readable lower bound with a thousands separator.
 */
export function formatCountLowerBound(count: number): string {
  return `${(Math.floor(count / 100) * 100).toLocaleString('en-US')}+`;
}

/**
 * Render the complete `22px` Status Badges (`/docs/badges`) documentation section HTML.
 * @returns HTML string for the `/docs/badges` documentation and live preview section.
 */
export function renderBadgesSectionHtml(): string {
  return `<section class="doc-section" id="badges">
    ${renderSectionHeader({
      description: `Two-segment and single-segment 22px badges with pulsing radar dots, inline charts, and ${BADGE_VARIANT_DESCRIPTORS.length} visual hierarchy tiers.`,
      routes: ['/badge/:label/:value', '/badge/:label', '/badge/status/:state/:text'],
      title: 'Status & Metadata Badges',
    })}
    ${renderParamTable(buildBadgeParamRows(), 'Badge route segments and query parameters')}
    ${renderSectionSubhead('layers', 'Visual Hierarchy Variants (`?variant=`)')}
    <div class="card-grid is-3col">${renderVariantCardsHtml(BADGE_VARIANT_DESCRIPTORS, buildBadgeVariantItems)}</div>
    ${renderSectionSubhead('zap', 'Inline Widgets, Status Presets & Layouts')}
    <div class="card-grid">${renderCardsHtml(buildBadgeUseCaseCards())}</div>
  </section>`;
}

/**
 * Render the dedicated CTA Buttons (`/docs/buttons`) documentation section HTML.
 * @returns HTML string for the `/docs/buttons` documentation and live preview section.
 */
export function renderButtonsSectionHtml(): string {
  const sizePresetCodes: string[] = [];
  for (const presetName of SIZE_TOKENS) {
    sizePresetCodes.push(`\`${presetName}\``);
  }
  const sizePresetsMarkup = sizePresetCodes.join(', ');
  return `<section class="doc-section" id="buttons">
    ${renderSectionHeader({
      description: `Dedicated 3D Kumo action buttons with configurable size presets (${sizePresetsMarkup}), trailing icons, status dots, and split compartments.`,
      routes: ['/button/:label', '/btn/:label', '/button/:label/:value', '/btn/:label/:value'],
      title: 'Interactive CTA Buttons',
    })}
    ${renderParamTable(buildButtonParamRows(), 'Button query parameters')}
    ${renderSectionSubhead('layers', 'Visual Hierarchy Variants (`?variant=`)')}
    <div class="card-grid is-3col">${renderVariantCardsHtml(BUTTON_VARIANT_DESCRIPTORS, buildButtonVariantItems)}</div>
    ${renderSectionSubhead('sliders-horizontal', 'Size Scale, Trailing Icons, Animations & Split Buttons')}
    <div class="card-grid">${renderCardsHtml(BUTTON_USE_CASE_CARDS)}</div>
  </section>`;
}

/**
 * Render the dedicated Public Service Badges (`/docs/services`) documentation section HTML.
 * @returns HTML string for the `/docs/services` documentation and live preview section.
 */
export function renderServicesSectionHtml(): string {
  const publicServices = listPublicServices();

  return `<section class="doc-section" id="services">
    ${renderSectionHeader({
      description: `Auto-fetched metrics from ${publicServices.length} public registries and forges (no tokens required) with multi-tier edge caching and smart 302 redirects to the upstream page when opened in a browser tab. The route reference below lists every service with its exact route, metrics (aliases in parentheses), and owner defaults.`,
      routes: [SERVICE_ROUTE_PATTERN],
      title: 'Live Service Badges',
    })}
    ${renderSectionSubhead('activity', 'Service Preset Examples')}
    <div class="card-grid">${renderCardsHtml(SERVICE_PRESET_CARDS)}</div>
    ${renderSectionSubhead('book-open', 'Service Route Reference')}
    ${renderParamTable(buildServiceParamRows(), 'Service preset routes and metrics')}
  </section>`;
}

/**
 * Render the Standalone Icons (`/icon/:icon`) documentation section HTML.
 * @returns HTML string for the `/icon/*` documentation and live preview section.
 */
export function renderIconsSectionHtml(): string {
  const iconCounts = getIconSetCounts();
  return `<section class="doc-section" id="icons">
    ${renderSectionHeader({
      description: `${formatCountLowerBound(iconCounts.lucide)} Lucide stroke icons and ${formatCountLowerBound(iconCounts.brand)} Simple Icons / Devicon brand marks with intrinsic pixel dimensions baked into the root \`<svg>\`.`,
      routes: ['/icon/:icon'],
      title: 'Standalone UI & Brand Icons',
    })}
    ${renderParamTable(buildIconParamRows(), 'Icon route segment and query parameters')}
    ${renderSectionSubhead('shapes', 'Icon Examples')}
    <div class="card-grid">${renderCardsHtml(ICON_CARDS)}</div>
    ${renderSectionSubhead('link', 'Slug Aliases')}
    ${renderAliasList(ICON_SLUG_ALIASES, 'Icon slug aliases')}
  </section>`;
}

/**
 * Render the Tech Stack Grids (`/stack/:groups`) documentation section HTML.
 * @returns HTML string for the `/stack/*` documentation and live preview section.
 */
export function renderStackSectionHtml(): string {
  return `<section class="doc-section" id="stack">
    ${renderSectionHeader({
      description: `Combine multiple technology groups into one SVG using \`:N\` for columns, \`|\` for side-by-side groups, and \`;\` for row bands. Every example below renders the same ${countFullProfileIcons()}-icon profile.`,
      routes: [
        '/stack/:groups',
        '/stack?groups=:groups',
        '/stack/c,cpp,cs,rust:4|aws,cloudflare,docker,linux:2;figma,blender,ps:3',
      ],
      title: 'Grouped Tech Stack Icon Grids',
    })}
    ${renderParamTable(buildStackParamRows(), 'Tech stack route segment and query parameters')}
    ${renderSectionSubhead('layers', 'Visual Hierarchy Variants (`?variant=`)')}
    <div class="card-grid">${renderVariantCardsHtml(STACK_VARIANT_DESCRIPTORS, buildStackVariantItems, true)}</div>
  </section>`;
}

/**
 * Render the Quote Cards (`/quote/*`) documentation section HTML.
 * @returns HTML string for the `/quote/*` documentation and live preview section.
 */
export function renderQuotesSectionHtml(): string {
  return `<section class="doc-section" id="quotes">
    ${renderSectionHeader({
      description: `Auto-wrapping quote cards in \`vertical\` centered or \`horizontal\` left-bar layouts across ${Object.keys(QUOTE_SIZE_MAP).length} text sizes and ${BADGE_VARIANT_DESCRIPTORS.length} surface tiers.`,
      routes: ['/quote/:author/:text', '/quote/:text', '/quote?text=:text&author=:author'],
      title: 'Styled README Quote Cards',
    })}
    ${renderParamTable(buildQuoteParamRows(), 'Quote card route segments and query parameters')}
    ${renderSectionSubhead('rectangle-vertical', 'Vertical Layout (`?layout=vertical`)')}
    <div class="card-grid is-3col">${renderCardsHtml(VERTICAL_QUOTE_CARDS)}</div>
    ${renderSectionSubhead('rectangle-horizontal', 'Horizontal Layout (`?layout=horizontal`)')}
    <div class="card-grid">${renderCardsHtml(HORIZONTAL_QUOTE_CARDS)}</div>
  </section>`;
}

/**
 * Render the Tailwind v4 OKLCH Theme Colors (`/docs/colors`) documentation section HTML.
 * @returns HTML string for the color palette showcase section.
 */
export function renderColorsSectionHtml(): string {
  const primaryItems: ShowcaseItem[] = [];
  const secondaryItems: ShowcaseItem[] = [];
  for (const colorName of THEME_COLOR_NAMES) {
    primaryItems.push({
      alt: `${colorName} primary`,
      path: `/badge/color/${colorName}?icon=sparkles&color=${colorName}&variant=1`,
    });
    secondaryItems.push({
      alt: `${colorName} secondary`,
      path: `/badge/theme/${colorName}?icon=sparkles&color=${colorName}&variant=2`,
    });
  }
  const colorCount = THEME_COLOR_NAMES.length;

  return `<section class="doc-section" id="colors">
    ${renderSectionHeader({
      description: `Every endpoint accepts any of the ${colorCount} harmonically balanced OKLCH color names below.`,
      title: `${colorCount} Tailwind v4 OKLCH Theme Colors (\`?color=\`)`,
    })}
    ${renderSectionSubhead('swatch-book', 'Color Swatches by Variant')}
    <div class="card-grid">
      ${renderShowcaseCard({
        items: primaryItems,
        subtitle: `All ${colorCount} color tokens rendered with variant=1 (3D brand gradient right cap).`,
        title: 'Primary Gradient Swatches (?variant=1)',
      })}
      ${renderShowcaseCard({
        items: secondaryItems,
        subtitle: `All ${colorCount} color tokens rendered with variant=2 (tinted dark surface + border).`,
        title: 'Secondary Tinted Swatches (?variant=2)',
      })}
    </div>
  </section>`;
}

/**
 * Render the Getting Started (`/docs`) overview section HTML.
 * @returns HTML string for the `/docs` overview section.
 */
export function renderOverviewSectionHtml(): string {
  return `<section class="doc-section" id="overview">
    ${renderSectionHeader({
      description:
        'Every element is a plain `GET` URL that returns an SVG image. Compose one by hand with the rules below, or click any preview in the docs to open it in the **Builder**.',
      routes: ENDPOINT_ROUTES,
      title: 'Getting Started',
    })}
    ${renderSectionSubhead('link', 'URL Anatomy')}
    ${renderUrlAnatomyHtml()}
    ${renderSectionSubhead('binary', 'Encoding Path Segments')}
    ${renderParamTable(SEGMENT_ENCODING_ROWS, 'Path segment encoding rules', SEGMENT_ENCODING_COLUMNS)}
    ${renderSectionSubhead('sliders-horizontal', 'Shared Query Parameters')}
    ${renderParamTable(buildSharedParamRows(), 'Query parameters shared across endpoints', SHARED_PARAM_COLUMNS)}
    ${renderSectionSubhead('code', 'Embedding in READMEs & Docs')}
    <div class="card-grid">${renderCardsHtml(EMBEDDING_CARDS)}</div>
    ${renderSectionSubhead('timer', 'Edge Caching')}
    ${renderParamTable(buildCachingRows(), 'Edge cache lifetimes', CACHING_COLUMNS)}
  </section>`;
}
