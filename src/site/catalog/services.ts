/**
 * Services documentation catalog – Live service preset showcase cards and generated route/metric reference rows for `/docs/services`.
 */

import { resolveServiceOwnerMode, SERVICES_CONFIG } from '@/config/services';
import { THEME_COLOR_NAMES } from '@/config/theme';
import { SPECIAL_ELEMENT_KINDS } from '@/routes/params';
import { BADGE_QUERY_PARAMS } from '@/routes/svg';
import { listServiceMetricAliases } from '@/services/fetcher';
import { COVERAGE_THRESHOLDS, MAX_SCORECARD_SCORE, SCORECARD_THRESHOLDS } from '@/services/metrics';
import { formatVariantValues } from '@/site/glossary';
import type {
  ParamTableRow,
  ScoreColorThreshold,
  ServiceDefinition,
  ShowcaseCardConfig,
} from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Generic service preset route shown in the `/docs/services` header (each exact route is listed in its reference table). */
export const SERVICE_ROUTE_PATTERN = '/badge/:service/[:owner/]:target/:metric';

// -------------------------------------- INTERNALS --------------------------------------

/** Format upper score color thresholds as `'Label >= X color, >= Y color'`. */
function formatUpperThresholds(
  label: string,
  thresholds: readonly ScoreColorThreshold[],
  scaleMax: number,
  unitSuffix: string
): string {
  const parts: string[] = [];
  for (const threshold of thresholds) {
    if (threshold.minPercent > 0) {
      const scaledValue = (threshold.minPercent / 100) * scaleMax;
      parts.push(`>= ${scaledValue}${unitSuffix} ${threshold.color}`);
    }
  }
  return `${label} ${parts.join(', ')}`;
}

/** Format the `Default` cell of a service route row (default owner, optional owner, or required owner). */
function formatServiceDefaultValue(service: ServiceDefinition): string {
  const { owner } = service.route;
  const ownerMode = resolveServiceOwnerMode(service);
  if (!owner || ownerMode === 'none') {
    return '~–';
  }
  if (ownerMode === 'required') {
    return `~${owner.placeholder} required`;
  }
  return owner.defaultValue
    ? `${owner.defaultValue} (${owner.placeholder})`
    : `~${owner.placeholder} optional`;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the route pattern of a service preset (e.g., `/badge/npm/[:scope/]:pkg/:metric`).
 * @param key       Service route key.
 * @param service   Service definition.
 * @returns Route pattern string.
 */
export function buildServiceRoutePattern(key: string, service: ServiceDefinition): string {
  const { owner, target } = service.route;
  if (!owner) {
    return `/badge/${key}/${target.placeholder}/:metric`;
  }
  const ownerPart = owner.isRequired ? `${owner.placeholder}/` : `[${owner.placeholder}/]`;
  return `/badge/${key}/${ownerPart}${target.placeholder}/:metric`;
}

/**
 * Format a service's canonical metrics with their effective aliases.
 * @param service      Service definition.
 * @param aliasStyle   Delimiter style around aliases (`'brackets'` for parameter tables, `'parens'` for plain text).
 * @returns Pipe-separated metric summary string.
 */
export function formatServiceMetrics(
  service: ServiceDefinition,
  aliasStyle: 'brackets' | 'parens' = 'brackets'
): string {
  const aliasesByMetric = new Map<string, string[]>();
  for (const [alias, metric] of listServiceMetricAliases(service)) {
    const aliases = aliasesByMetric.get(metric);
    if (aliases) {
      aliases.push(alias);
    } else {
      aliasesByMetric.set(metric, [alias]);
    }
  }
  const [openBracket, closeBracket] = aliasStyle === 'parens' ? ['(', ')'] : ['[', ']'];
  const metricValues: string[] = [];
  for (const metric of Object.keys(service.metrics)) {
    const aliases = aliasesByMetric.get(metric);
    metricValues.push(
      aliases ? `${metric} ${openBracket}${aliases.join(', ')}${closeBracket}` : metric
    );
  }
  return metricValues.join(' | ');
}

/** Showcase cards for the dedicated `/docs/services` page (sample values; No network access). */
export const SERVICE_PRESET_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      {
        alt: 'npm Monthly Downloads Sparkline',
        path: '/badge/npm/hono/dl?special=sparkline',
        sample: {
          downloads: [
            { downloads: 120_000 },
            { downloads: 145_000 },
            { downloads: 138_000 },
            { downloads: 172_000 },
            { downloads: 195_000 },
            { downloads: 210_000 },
            { downloads: 248_000 },
          ],
        },
      },
      {
        alt: 'jsDelivr Monthly Hits Delta',
        path: '/badge/jsdelivr/jquery/hm?special=delta',
        sample: {
          hits: {
            dates: {
              '2026-03-01': 50_000_000,
              '2026-03-02': 52_000_000,
              '2026-03-03': 61_000_000,
              '2026-03-04': 64_000_000,
            },
            total: 1_600_000_000,
          },
        },
      },
      {
        alt: 'Read the Docs Build History Strip',
        path: '/badge/rtd/pip/build?special=strip',
        sample: {
          results: [
            { state: { code: 'finished' }, success: true },
            { state: { code: 'finished' }, success: true },
            { state: { code: 'finished' }, success: false },
            { state: { code: 'finished' }, success: true },
            { state: { code: 'finished' }, success: true },
          ],
        },
      },
      {
        alt: 'WordPress Star Histogram Bars',
        path: '/badge/wp/akismet/rating?special=bars',
        sample: { rating: 94, ratings: { '1': 12, '2': 5, '3': 18, '4': 64, '5': 420 } },
      },
      {
        alt: 'OpenSSF Scorecard Check Strip',
        path: '/badge/scorecard/ossf/scorecard/score?special=strip',
        sample: {
          checks: [{ score: 10 }, { score: 9 }, { score: 8 }, { score: 10 }, { score: 7 }],
          score: 8.3,
        },
      },
      {
        alt: 'SonarCloud Maintainability Steps',
        path: '/badge/sonarcloud/apache_struts/maintainability?special=steps',
        sample: { component: { measures: [{ metric: 'sqale_rating', value: '1.0' }] } },
      },
    ],
    subtitle:
      'Pass a bare widget kind (?special=sparkline, bars, delta, bar, ring, steps, or strip) on supported metrics to populate the widget from live upstream data, ?special=none to hide a default preset widget, or ?special=<kind>:<payload> to supply custom numbers.',
    title: 'Automatic Inline Data Widgets (?special=sparkline|bars|delta|…)',
  },
  {
    items: [
      { alt: 'GitHub Stars', path: '/badge/gh/honojs/hono/stars', sample: '32.5k' },
      { alt: 'GitHub Forks', path: '/badge/gh/honojs/hono/forks', sample: '1.1k' },
      { alt: 'GitHub Open Issues', path: '/badge/gh/honojs/hono/issues', sample: '118' },
      { alt: 'GitHub Pull Requests', path: '/badge/gh/honojs/hono/prs', sample: '24' },
      { alt: 'GitHub Release', path: '/badge/gh/honojs/hono/release', sample: 'v4.13.13' },
      { alt: 'GitHub Last Commit', path: '/badge/gh/honojs/hono/commit', sample: 'today' },
      { alt: 'GitHub License', path: '/badge/gh/honojs/hono/license', sample: 'MIT' },
      {
        alt: 'GitHub Commit Activity',
        path: '/badge/gh/honojs/hono/activity',
        sample: { all: [14, 21, 18, 26, 22, 31, 28, 35] },
      },
    ],
    subtitle:
      'Stars, forks, open issues, open pull requests, latest release, last commit age, SPDX license, and 8-week commit activity sparkline for any public GitHub repository.',
    title: 'GitHub (/badge/gh/:owner/:repo/:metric)',
  },
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
      { alt: 'cdnjs Version', path: '/badge/cdnjs/htmx/v', sample: 'v4.0.0' },
      { alt: 'cdnjs License', path: '/badge/cdnjs/htmx/license', sample: 'BSD-2-Clause' },
    ],
    subtitle:
      'JSR package version and quality score ring, jsDelivr CDN hits for any npm package, and cdnjs library versions and licenses.',
    title: 'JSR, jsDelivr & cdnjs (/badge/jsr/*, /badge/jsdelivr/*, /badge/cdnjs/*)',
  },
  {
    items: [
      { alt: 'Open VSX Version', path: '/badge/ovsx/xulbux/color-tracr/v', sample: 'v1.2.3' },
      { alt: 'Open VSX Downloads', path: '/badge/ovsx/xulbux/color-tracr/dt', sample: '2.5k' },
      { alt: 'Open VSX Rating', path: '/badge/ovsx/xulbux/color-tracr/rating', sample: '5.0/5' },
      { alt: 'Open VSX License', path: '/badge/ovsx/xulbux/color-tracr/license', sample: 'MIT' },
    ],
    subtitle: 'Version, total downloads, star rating, and license for any Open VSX extension.',
    title: 'Open VSX Registry (/badge/ovsx/:namespace/:ext/:metric)',
  },
  {
    items: [
      { alt: 'Crates.io Version', path: '/badge/crates/serde/v', sample: 'v1.0.219' },
      { alt: 'Crates.io Total Downloads', path: '/badge/crates/serde/dt', sample: '490M' },
      { alt: 'Crates.io 90-Day Downloads', path: '/badge/crates/serde/dq', sample: '68.4M/90d' },
      { alt: 'Crates.io MSRV', path: '/badge/crates/serde/msrv', sample: 'v1.56' },
      { alt: 'Crates.io Size', path: '/badge/crates/serde/size', sample: '78.9 kB' },
      {
        alt: 'docs.rs Documentation Build',
        path: '/badge/docsrs/serde/docs',
        sample: { doc_status: true },
      },
      { alt: 'docs.rs Latest Release', path: '/badge/docsrs/serde/v', sample: 'v1.0.219' },
      { alt: 'Docker Pulls', path: '/badge/docker/alpine/pulls', sample: '1B' },
      { alt: 'Docker Stars', path: '/badge/docker/postgres/stars', sample: '14.2k' },
      { alt: 'Docker Last Updated', path: '/badge/docker/alpine/updated', sample: '2d ago' },
    ],
    subtitle:
      'Rust crates.io package metrics (incl. MSRV and crate size), docs.rs documentation build status and latest version, and Docker Hub container pull, star, and update counters.',
    title: 'Crates.io, docs.rs & Docker Hub (/badge/crates/*, /badge/docsrs/*, /badge/docker/*)',
  },
  {
    items: [
      { alt: 'RubyGems Version', path: '/badge/gem/rails/v', sample: 'v8.1.4' },
      { alt: 'RubyGems Downloads', path: '/badge/gem/rails/dt', sample: '802.6M' },
      { alt: 'RubyGems Updated', path: '/badge/gem/rails/updated', sample: '4d ago' },
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
      {
        alt: 'Maven Central Version',
        path: '/badge/maven/com.google.guava/guava/v',
        sample: 'v33.5.0-jre',
      },
      { alt: 'JetBrains Plugin Version', path: '/badge/jetbrains/8182/v', sample: 'v243.26053.17' },
      { alt: 'JetBrains Plugin Downloads', path: '/badge/jetbrains/8182/dl', sample: '5.8M' },
      { alt: 'JetBrains Plugin Rating', path: '/badge/jetbrains/8182/rating', sample: '4.6/5' },
    ],
    subtitle:
      'Maven Central artifact versions by group and artifact ID, plus JetBrains Marketplace plugin versions, downloads, and star ratings.',
    title: 'Maven Central & JetBrains Marketplace (/badge/maven/*, /badge/jetbrains/*)',
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
      { alt: 'Debian Unstable Version', path: '/badge/debian/curl/v', sample: 'v8.23.0-1' },
      {
        alt: 'Debian Stable Version',
        path: '/badge/debian/stable/curl/v',
        sample: 'v8.14.1-2+deb13u5',
      },
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
      'Official Arch Linux repository versions (amber when flagged out-of-date), Debian suite versions (omit the suite for sid), Fedora branch versions (omit the branch for rawhide), and MacPorts ports.',
    title:
      'Arch Linux, Debian, Fedora & MacPorts (/badge/arch/*, /badge/debian/*, /badge/fedora/*, /badge/macports/*)',
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
      {
        alt: 'Hugging Face Space Likes',
        path: '/badge/hf-space/gradio/hello_world/likes',
        sample: '128',
      },
      {
        alt: 'Hugging Face Space SDK',
        path: '/badge/hf-space/gradio/hello_world/sdk',
        sample: { sdk: 'gradio' },
      },
      {
        alt: 'Hugging Face Space Stage',
        path: '/badge/hf-space/gradio/hello_world/stage',
        sample: { runtime: { stage: 'RUNNING' } },
      },
    ],
    subtitle:
      'Model and dataset downloads (30-day and all-time), likes, and Space SDK and runtime stage from the Hugging Face Hub.',
    title: 'Hugging Face (/badge/hf/*, /badge/hf-dataset/*, /badge/hf-space/*)',
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
    subtitle: `${formatUpperThresholds('Ring gauges colored by threshold: Coverage', COVERAGE_THRESHOLDS, 100, '%')}; ${formatUpperThresholds('Scorecard', SCORECARD_THRESHOLDS, MAX_SCORECARD_SCORE, '')}; Otherwise ${COVERAGE_THRESHOLDS.at(-1)?.color ?? 'rose'}.`,
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
      { alt: 'Bundle Dependencies', path: '/badge/bundlephobia/react/deps', sample: '2' },
    ],
    subtitle:
      'Discord server presence via a permanent invite code, and Bundlephobia sizes and dependency counts for unscoped or scoped npm packages.',
    title: 'Discord & Bundlephobia (/badge/discord/:invite/*, /badge/bundlephobia/*)',
  },
  {
    items: [
      { alt: 'Go Module Version', path: '/badge/go/github.com/spf13/cobra/v', sample: 'v1.10.2' },
      { alt: 'WordPress Plugin Version', path: '/badge/wp/akismet/v', sample: 'v5.7.2' },
      { alt: 'WordPress Active Installs', path: '/badge/wp/akismet/installs', sample: '5M+' },
      { alt: 'WordPress Plugin Rating', path: '/badge/wp/akismet/rating', sample: '4.7/5' },
      { alt: 'WordPress Required PHP', path: '/badge/wp/akismet/php', sample: '>=7.2' },
      { alt: 'WordPress Required WP', path: '/badge/wp/akismet/wp', sample: '>=5.8' },
      { alt: 'WordPress Theme Version', path: '/badge/wp-theme/astra/v', sample: 'v4.14.1' },
      { alt: 'WordPress Theme Required PHP', path: '/badge/wp-theme/astra/php', sample: '>=5.3' },
      { alt: 'WordPress Theme Required WP', path: '/badge/wp-theme/astra/wp', sample: '>=5.3' },
    ],
    subtitle:
      'Go module versions (the full module path spans several segments) and WordPress plugin/theme metrics (incl. required PHP and WordPress versions).',
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
      { alt: 'Zenodo Version', path: '/badge/zenodo/3835582/v', sample: 'v1.0.0' },
      { alt: 'Zenodo Downloads', path: '/badge/zenodo/3835582/dt', sample: '76k' },
      { alt: 'Zenodo Views', path: '/badge/zenodo/3835582/views', sample: '1.4k' },
      { alt: 'Zenodo License', path: '/badge/zenodo/3835582/license', sample: 'cc-by-4.0' },
      { alt: 'Zenodo DOI', path: '/badge/zenodo/3835582/doi', sample: '10.5281/zenodo.3835582' },
    ],
    subtitle:
      'Perl distribution versions, licenses, and release age from MetaCPAN, plus Zenodo record versions, statistics, licenses, and DOIs.',
    title: 'MetaCPAN & Zenodo (/badge/cpan/:dist/*, /badge/zenodo/:record/*)',
  },
  {
    items: [
      { alt: 'Conda-Forge Version', path: '/badge/conda/numpy/v', sample: 'v2.4.1' },
      { alt: 'Bioconda Version', path: '/badge/conda/bioconda/samtools/v', sample: 'v1.22.1' },
      { alt: 'DUB Version', path: '/badge/dub/vibe-d/v', sample: 'v0.10.3' },
      { alt: 'DUB Downloads', path: '/badge/dub/vibe-d/dt', sample: '1.9M' },
      { alt: 'DUB Score', path: '/badge/dub/vibe-d/score', sample: { score: 5 } },
      { alt: 'CTAN Version', path: '/badge/ctan/pgf/v', sample: 'v3.1.12' },
      { alt: 'CTAN License', path: '/badge/ctan/pgf/license', sample: 'LPPL-1.3c' },
    ],
    subtitle:
      'Conda packages on Anaconda Cloud (omit :channel for conda-forge), D packages on DUB (version, downloads, license, and score ring), and TeX/LaTeX packages on CTAN.',
    title: 'Conda, DUB & CTAN (/badge/conda/*, /badge/dub/*, /badge/ctan/*)',
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

/**
 * Build the route and metric reference rows for `/docs/services` from `SERVICES_CONFIG`.
 * @returns Parameter table rows.
 */
export function buildServiceParamRows(): ParamTableRow[] {
  const rows: ParamTableRow[] = [];
  for (const [key, service] of Object.entries(SERVICES_CONFIG)) {
    rows.push({
      defaultVal: formatServiceDefaultValue(service),
      description: `${service.docs.title}: ${service.docs.description}`,
      name: buildServiceRoutePattern(key, service),
      values: formatServiceMetrics(service),
    });
  }
  const standardBadgeParams = BADGE_QUERY_PARAMS.filter((param) => param !== 'label')
    .map((param) => `?${param}=`)
    .join(', ');
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
        'Auto-populates an inline widget from live upstream data on supported metrics when passed without a payload (or with :pulse / :static), hides a default preset widget with none, or overrides with custom data (<kind>:<payload>).',
      name: '?special=',
      values: `none | ${SPECIAL_ELEMENT_KINDS.join(' | ')} | <kind>:<payload>`,
    },
    {
      defaultVal: '~service preset',
      description: `All standard badge query params (${standardBadgeParams}) apply; An empty ?icon= keeps the preset icon.`,
      name: '?variant= / ?color= / …',
      values: `${formatVariantValues()} (and ${THEME_COLOR_NAMES.length} colors)`,
    }
  );
  return rows;
}
