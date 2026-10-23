/**
 * Getting Started overview catalog – URL anatomy parts, segment encoding rules, shared query parameters, embedding examples, and edge cache TTL rows for `/docs`.
 */

import { SITE_ORIGIN } from '@/config/site';
import { THEME_COLOR_NAMES } from '@/config/theme';
import { ICON_MOTION_TOKENS, STACK_MOTION_TOKENS } from '@/routes/params';
import {
  SERVICE_ERROR_TTL_SECONDS,
  SERVICE_TTL_SECONDS,
  STATIC_TTL_SECONDS,
  SVG_ROUTES,
} from '@/routes/svg';
import { formatColorValues } from '@/site/catalog/shared';
import type { UrlAnatomyPart } from '@/site/components/UrlAnatomy';
import {
  formatConjunctionList,
  formatVariantTierSummary,
  formatVariantValues,
} from '@/site/glossary';
import { ICON_SOURCE_SETS } from '@/svg/icons';
import type { ParamTableRow, ShowcaseCardConfig } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** Highlighted parts of the URL anatomy example on the Getting Started page. */
export const URL_ANATOMY_PARTS: readonly UrlAnatomyPart[] = [
  { className: 'hl-p', label: 'Origin', text: SITE_ORIGIN },
  { className: 'hl-url', label: 'Endpoint', text: '/badge' },
  { className: 'hl-path', label: 'Path segments', text: '/Build+Status/Passing' },
  { className: 'hl-key', label: 'Query keys', text: '?icon=' },
  { className: 'hl-val', label: 'Query values', text: 'circle-check' },
  { className: 'hl-key', text: '&color=' },
  { className: 'hl-val', text: 'emerald' },
];

/** Path segment encoding rules (every example is a working, documented path). */
export const SEGMENT_ENCODING_ROWS: readonly ParamTableRow[] = [
  {
    defaultVal: '/badge/Build+Status/Passing',
    description: 'Both forms decode to a space inside a path segment.',
    name: 'Space',
    values: '+ / %20',
  },
  {
    defaultVal: '/badge/Language/C%2B%2B',
    description: 'A raw + would decode to a space.',
    name: '+',
    values: '%2B',
  },
  {
    defaultVal: '/badge/Coverage/99%25',
    description: 'Percent signs start escape sequences, so they must be escaped themselves.',
    name: '%',
    values: '%25',
  },
  {
    defaultVal: '/badge/Requests/2.4M%2Fd',
    description: 'A raw / would start a new path segment.',
    name: '/',
    values: '%2F',
  },
  {
    defaultVal: '/badge/Question/Why%3F',
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
export const SEGMENT_ENCODING_COLUMNS: ParamTableRow = {
  defaultVal: 'Example',
  description: 'Notes',
  name: 'Character',
  values: 'Write as',
};

/** Column labels of the shared query parameter table. */
export const SHARED_PARAM_COLUMNS: ParamTableRow = {
  defaultVal: 'Endpoints',
  description: 'Description',
  name: 'Parameter',
  values: 'Values',
};

/** Column labels of the edge caching table. */
export const CACHING_COLUMNS: ParamTableRow = {
  defaultVal: 'On errors',
  description: 'Notes',
  name: 'Routes',
  values: 'Edge TTL',
};

/** Showcase cards of the embedding section on the Getting Started page. */
export const EMBEDDING_CARDS: readonly ShowcaseCardConfig[] = [
  {
    items: [
      { alt: 'Build Status', path: '/badge/Build+Status/Passing?icon=circle-check&color=emerald' },
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

// -------------------------------------- INTERNALS --------------------------------------

/** Format a TTL in seconds as a compact duration (`3600` -> `'1 h'`, `300` -> `'5 min'`, `45` -> `'45 s'`). */
function formatDuration(seconds: number): string {
  if (seconds % 3600 === 0) {
    return `${seconds / 3600} h`;
  }
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
}

/** Join canonical non-alias route prefixes supporting `paramName` (or all canonical prefixes when omitted). */
function formatSupportingEndpoints(paramName?: string): string {
  const prefixes: string[] = [];
  for (const route of SVG_ROUTES) {
    if (
      route.aliasOf === undefined &&
      (paramName === undefined || route.queryParams.includes(paramName))
    ) {
      prefixes.push(`/${route.prefix}`);
    }
  }
  return prefixes.join(' | ');
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the shared query parameter rows (values and endpoints read from the route table, parser, and theme).
 * @returns Parameter table rows.
 */
export function buildSharedParamRows(): ParamTableRow[] {
  const allIconSets = [...ICON_SOURCE_SETS.stroke, ...ICON_SOURCE_SETS.brand];
  const activeStackMotions = STACK_MOTION_TOKENS.filter((token) => token !== 'none');
  const iconMotionSet = new Set<string>(ICON_MOTION_TOKENS);
  const extraStackMotions = activeStackMotions.filter((token) => !iconMotionSet.has(token));
  return [
    {
      defaultVal: formatSupportingEndpoints('color'),
      description: `Any of the ${THEME_COLOR_NAMES.length} Tailwind v4 OKLCH theme colors (see Colors); Stacks keep per-icon brand colors unless set.`,
      name: '?color=',
      values: formatColorValues(),
    },
    {
      defaultVal: formatSupportingEndpoints('variant'),
      description: `Visual hierarchy tier: ${formatVariantTierSummary()}.`,
      name: '?variant=',
      values: formatVariantValues(),
    },
    {
      defaultVal: formatSupportingEndpoints('icon'),
      description: `Leading icon, a left,right pair, or a right-only icon (none,right); Any ${formatConjunctionList(allIconSets, 'or')} slug.`,
      name: '?icon=',
      values: 'rocket | book-open,arrow-right | none,external-link',
    },
    {
      defaultVal: formatSupportingEndpoints('anim'),
      description: `Surface sheen and per-element motions (icon endpoints support per-icon motions; stacks support ${formatConjunctionList(activeStackMotions)}; surface endpoints support sheen and none); none also stops widget, dot, and typing animations.`,
      name: '?anim=',
      values: `sheen | ${[...ICON_MOTION_TOKENS, ...extraStackMotions].join(' | ')}`,
    },
    {
      defaultVal: formatSupportingEndpoints(),
      description:
        'Unknown query parameters are ignored per route, so tracking or cache-busting parameters never change the SVG.',
      name: '?<other>=',
      values: '~any parameter a route does not document',
    },
  ];
}

/**
 * Build the edge caching rows (routes and TTLs read from the route dispatcher).
 * @returns Parameter table rows.
 */
export function buildCachingRows(): ParamTableRow[] {
  const staticRouteNames = [
    '/badge/:label/:value',
    ...SVG_ROUTES.filter((route) => route.aliasOf === undefined && route.prefix !== 'badge').map(
      (route) => `/${route.prefix}`
    ),
  ].join(', ');
  return [
    {
      defaultVal: '~–',
      description: 'Deterministic SVGs; Identical URLs always render identical output.',
      name: staticRouteNames,
      values: formatDuration(STATIC_TTL_SECONDS),
    },
    {
      defaultVal: formatDuration(SERVICE_ERROR_TTL_SECONDS),
      description: 'Upstream JSON is cached separately; Failed or pending lookups retry sooner.',
      name: '/badge/:service/…',
      values: formatDuration(SERVICE_TTL_SECONDS),
    },
  ];
}
