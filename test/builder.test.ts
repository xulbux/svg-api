/**
 * URL builder tests – Builder schemas, the builder client core (encoding, path building, prefill parsing, snippets, icon slug resolution), icon picker assets, and "Open in Builder" links, verified against the Worker's route parser (`src/routes/schema.ts`, `src/preview/builder.ts`, `src/preview/scripts/builder.client.js`).
 */

import { describe, expect, it } from 'vitest';
import { listPublicServices, resolveServiceOwnerMode, STATUS_PRESET_MAP } from '@/config/services';
import { THEME_COLOR_NAMES } from '@/config/theme';
import { getSiteAsset } from '@/preview/assets';
import { renderBuilderHtml } from '@/preview/builder';
import { buildMarkdownSnippetTokens } from '@/preview/components';
import { BUILDER_PAGES, DOCS_PAGES } from '@/preview/navigation';
import { renderDocsHtml, renderHomeHtml } from '@/preview/page';
import builderScript from '@/preview/scripts/builder.client.js';
import {
  decodeSegment,
  ICON_MOTION_TOKENS,
  parseSpecialParam,
  resolveAnimationMode,
  resolveDotState,
  resolveQuoteLayout,
  resolveVariant,
  SPECIAL_ELEMENT_KINDS,
  VARIANT_TOKENS,
} from '@/routes/params';
import { getBuilderSchema, resolveBuilderTarget } from '@/routes/schema';
import { renderSvgPath, resolveSvgPathRedirectUrl, resolveSvgRoute } from '@/routes/svg';
import {
  getIconPickerIndex,
  ICON_SLUG_ALIASES,
  MAX_ICON_SLUG_LENGTH,
  resolveIcon,
} from '@/svg/icons';
import type {
  BuilderKind,
  BuilderOption,
  BuilderSchema,
  HighlightToken,
  IconPickerIndex,
  IconPickerSetId,
  ServiceRequest,
} from '@/types';

/*************************************** Fixtures ***************************************/

/** Builder state (field ID -> serialized value). */
type BuilderState = Record<string, string>;

/** Snippet formats produced by the builder client. */
interface SnippetSet {
  /** HTML `<img>` snippet. */
  html: string;
  /** Markdown image snippet. */
  markdown: string;
  /** Plain URL. */
  url: string;
}

/** Pure helpers exposed by the builder client script (`svgBuilderCore`). */
interface BuilderCore {
  buildAltText: (schema: BuilderSchema, state: BuilderState) => string;
  buildDefaultLinkTarget: (schema: BuilderSchema, state: BuilderState, url: string) => string;
  buildPath: (schema: BuilderSchema, state: BuilderState) => { missing: string[]; path: string };
  buildPreviewPath: (path: string, isReducedMotion: boolean) => string;
  buildShareUrl: (href: string, path: string, alt: string, link: string) => string;
  buildSnippets: (url: string, alt: string, link: string) => SnippetSet;
  buildSnippetTokens: (
    url: string,
    alt: string,
    link: string
  ) => Record<keyof SnippetSet, HighlightToken[]>;
  collectStackSlugs: (groups: string) => string[];
  composeAnim: (hasSheen: boolean, left: string, right: string) => string;
  composeIconPair: (left: string, right: string, hasPresetIcon: boolean) => string;
  composeSpecial: (kind: string, payload: string, modifier: string) => string;
  computeGridFocusIndex: (
    key: string,
    index: number,
    columns: number,
    total: number
  ) => number | undefined;
  createAsyncCache: <T>(load: (key: string) => Promise<T>) => (key: string) => Promise<T>;
  createIconResolver: (
    index: IconPickerIndex,
    maxSlugLength: number
  ) => { resolve: (slug: string, isBrandFirst: boolean) => IconPickerSetId | 'none' | undefined };
  decodeSegment: (raw: string) => string;
  encodeSegment: (text: string) => string;
  parsePath: (schema: BuilderSchema, rawPath: string) => BuilderState | undefined;
  splitAnim: (value: string) => { hasSheen: boolean; left: string; right: string };
  splitIconPair: (value: string, hasPresetIcon: boolean) => [left: string, right: string];
  splitSpecial: (
    value: string,
    options: readonly BuilderOption[]
  ) => { kind: string; modifier: string; payload: string };
}

/** Every builder element kind. */
const BUILDER_KINDS: readonly BuilderKind[] = BUILDER_PAGES.map((page) => page.kind);

/** Matches every "Open in Builder" preview link (`href` with escaped `&`). */
const PREVIEW_LINK_RX = /<a class="preview-link" href="(?<href>[^"]+)"/g;

/** Matches SMIL animation elements in rendered SVGs. */
const SMIL_ANIMATION_RX = /<animate/;

/** Evaluate the builder client script without a DOM and return its exposed core. */
function loadBuilderCore(): BuilderCore {
  const sandbox: { svgBuilderCore?: BuilderCore } = {};
  // oxlint-disable-next-line typescript/no-implied-eval, no-new-func -- The script is evaluated exactly as shipped to browsers.
  new Function('globalThis', builderScript)(sandbox);
  if (!sandbox.svgBuilderCore) {
    throw new Error('The builder script did not expose svgBuilderCore without a DOM.');
  }
  return sandbox.svgBuilderCore;
}

const core = loadBuilderCore();

/** Collect the decoded `?path=` of every preview link on a page. */
function collectPreviewPaths(html: string): string[] {
  const paths: string[] = [];
  for (const match of html.matchAll(PREVIEW_LINK_RX)) {
    const href = (match.groups?.href ?? '').replaceAll('&amp;', '&');
    paths.push(new URL(href, 'https://svg.xul.is').searchParams.get('path') ?? '');
  }
  return paths;
}

/** Collect the decoded `?path=` of every preview link on the homepage and every docs page. */
function collectAllPreviewPaths(): string[] {
  const paths = collectPreviewPaths(renderHomeHtml());
  for (const page of DOCS_PAGES) {
    paths.push(...collectPreviewPaths(renderDocsHtml(page.slug)));
  }
  return paths;
}

/** Find a field of a builder schema. */
function findField(schema: BuilderSchema, id: string): BuilderSchema['fields'][number] {
  const field = schema.fields.find((candidate) => candidate.id === id);
  if (!field) {
    throw new Error(`Missing builder field ${schema.kind}.${id}`);
  }
  return field;
}

/** Collect the option values of a builder field. */
function collectOptionValues(schema: BuilderSchema, id: string): string[] {
  return (findField(schema, id).options ?? []).map((option) => option.value);
}

/** Map a server-resolved icon onto its picker set. */
function toPickerSet(slug: string, isBrandFirst: boolean): IconPickerSetId | undefined {
  const resolved = resolveIcon(slug, isBrandFirst);
  if (!resolved) {
    return undefined;
  }
  return resolved.type === 'lucide' ? 'lucide' : 'brands';
}

/** Parse a path with a builder, rebuild it, and return both rendered SVGs (prefill must not change the output). */
function renderPrefillRoundTrip(
  kind: BuilderKind,
  path: string
): [original: string, rebuilt: string] {
  const schema = getBuilderSchema(kind);
  const parsed = core.parsePath(schema, path);
  expect(parsed, path).toBeDefined();
  return [renderSvgPath(path), renderSvgPath(core.buildPath(schema, parsed ?? {}).path)];
}

/*************************************** Schemas ****************************************/

describe('builder schemas', () => {
  it('reads every option list from the parser and theme (drift guard)', () => {
    const badge = getBuilderSchema('badge');
    expect(collectOptionValues(badge, 'variant')).toEqual(['', ...VARIANT_TOKENS]);
    expect(collectOptionValues(badge, 'color')).toEqual(['', ...THEME_COLOR_NAMES]);
    expect(collectOptionValues(badge, 'state')).toEqual(Object.keys(STATUS_PRESET_MAP));
    expect(collectOptionValues(badge, 'special')).toEqual(['', ...SPECIAL_ELEMENT_KINDS]);
    expect(collectOptionValues(badge, 'anim')).toEqual([
      '',
      ...ICON_MOTION_TOKENS.filter((motion) => motion !== 'default'),
    ]);
    expect(collectOptionValues(getBuilderSchema('stack'), 'anim')).toEqual(['']);
    for (const kind of BUILDER_KINDS) {
      expect(getBuilderSchema(kind).maxIconSlugLength, kind).toBe(MAX_ICON_SLUG_LENGTH);
    }
  });

  it('offers every public service preset with all of its metrics, and never owner-restricted presets', () => {
    const services = getBuilderSchema('service').services ?? [];
    const publicServices = listPublicServices();
    expect(services.map((service) => service.key)).toEqual(publicServices.map(([key]) => key));
    for (const [key, definition] of publicServices) {
      const option = services.find((service) => service.key === key);
      expect(
        option?.metrics.map((metric) => metric.value),
        key
      ).toEqual(Object.keys(definition.metrics));
      expect(option?.ownerMode, key).toBe(resolveServiceOwnerMode(definition));
    }
    expect(services.some((service) => service.key === 'gh')).toBe(false);
  });

  it('accepts every offered select value and widget modifier in the matching parser', () => {
    const badge = getBuilderSchema('badge');
    for (const variant of collectOptionValues(badge, 'variant').filter(Boolean)) {
      expect(resolveVariant(variant, '1'), variant).toBe(variant);
    }
    for (const dot of collectOptionValues(badge, 'dot').filter(
      (value) => value && value !== 'none'
    )) {
      expect(resolveDotState(dot), dot).toBeDefined();
    }
    for (const motion of collectOptionValues(badge, 'anim').filter(Boolean)) {
      expect(resolveAnimationMode(core.composeAnim(false, motion, ''), 'default'), motion).toBe(
        motion
      );
      expect(
        resolveAnimationMode(core.composeAnim(true, 'shake', motion), 'default'),
        motion
      ).not.toBe('default');
    }
    for (const option of findField(badge, 'special').options ?? []) {
      if (option.value) {
        const special = parseSpecialParam(
          core.composeSpecial(option.value, option.placeholder ?? '', '')
        );
        expect(special?.type, option.value).toBe(option.value);
        for (const modifier of option.modifiers ?? []) {
          if (modifier.value) {
            const modified = parseSpecialParam(
              core.composeSpecial(option.value, option.placeholder ?? '', modifier.value)
            );
            expect(modified, `${option.value}:${modifier.value}`).toMatchObject({
              hasPulse: modifier.value === 'pulse',
            });
          }
        }
      }
    }
  });

  it('declares only layout aliases and center flags the quote parser treats as vertical (drift guard)', () => {
    const layoutField = findField(getBuilderSchema('quote'), 'layout');
    for (const option of layoutField.options ?? []) {
      for (const alias of option.aliases ?? []) {
        expect(resolveQuoteLayout(alias, undefined, undefined), alias).toBe(option.value);
      }
    }
    const quote = getBuilderSchema('quote');
    for (const center of ['1', 'true', 'yes', 'TRUE', ' Yes ', '0', 'no', 'false']) {
      const parsed = core.parsePath(quote, `/quote/Hi?center=${encodeURIComponent(center)}`);
      const expected = resolveQuoteLayout(undefined, undefined, center);
      expect(parsed?.layout || 'horizontal', center).toBe(expected);
    }
  });

  it('derives upstream redirect templates for most service metrics', () => {
    const services = getBuilderSchema('service').services ?? [];
    let metricCount = 0;
    let templateCount = 0;
    for (const service of services) {
      for (const metric of service.metrics) {
        metricCount += 1;
        if (metric.redirect) {
          templateCount += 1;
          expect(metric.redirect, `${service.key}/${metric.value}`).toContain('{target}');
          expect(metric.redirect, `${service.key}/${metric.value}`).toMatch(/^https:\/\//);
        }
      }
    }
    expect(templateCount).toBeGreaterThan(metricCount / 2);
  });
});

/************************************* Builder core *************************************/

describe('builder client core', () => {
  it('encodes path segments so the Worker decodes them back exactly (incl. +, %, /, parentheses, and Unicode)', () => {
    for (const text of [
      'build status',
      'C++',
      '99.4%',
      '2.4M/d',
      'why?',
      'a&b=c#d',
      '(beta)',
      'c,cpp:4|rust;py',
      'Grüße 👋',
      '',
    ]) {
      const encoded = core.encodeSegment(text);
      expect(decodeSegment(encoded), text).toBe(text);
      expect(core.decodeSegment(encoded), text).toBe(text);
      expect(encoded, text).not.toMatch(/[ ()/?#&]/);
    }
    expect(core.encodeSegment('build status')).toBe('build+status');
    expect(core.encodeSegment('c,cpp:4|rust;py')).toBe('c,cpp:4|rust;py');
  });

  it('builds a URL the Worker routes for the example state of every builder', () => {
    for (const kind of BUILDER_KINDS) {
      const schema = getBuilderSchema(kind);
      const { missing, path } = core.buildPath(schema, { ...schema.initialState });
      expect(missing, kind).toEqual([]);
      expect(resolveSvgRoute(new URL(path, schema.origin)), `${kind}: ${path}`).toBeDefined();
    }
  });

  it('round-trips prefill parsing: parse(build(state)) rebuilds the identical URL', () => {
    const states: [BuilderKind, BuilderState][] = [
      ['badge', { color: 'amber', icon: 'zap', label: '', type: 'static', value: '100%' }],
      [
        'badge',
        { dot: 'none', state: 'maintenance', text: 'until 18:00', type: 'status', variant: '3' },
      ],
      [
        'badge',
        { anim: 'sheen,none,nudge', label: 'C++ (beta)', special: 'ring:84:pulse', type: 'static' },
      ],
      ['button', { icon: 'none,arrow-right', label: 'Read the docs', size: '40', value: 'v2' }],
      ['icon', { anim: 'sheen,spin', icon: 'archlinux', size: '64', stroke: '1.5' }],
      ['stack', { groupgap: '30', groups: 'c,cpp:2|rust\npy,ts', perline: '8,6' }],
      ['quote', { author: '', layout: 'vertical', text: 'Ship it & smile!', width: '420' }],
      ['service', { icon: ',star', metric: 'v', owner: 'types', service: 'npm', target: 'node' }],
      ['service', { metric: 'v', service: 'go', target: 'github.com/spf13/cobra' }],
    ];
    for (const [kind, state] of states) {
      const schema = getBuilderSchema(kind);
      const { path } = core.buildPath(schema, state);
      const parsed = core.parsePath(schema, path);
      expect(parsed, path).toBeDefined();
      expect(core.buildPath(schema, parsed ?? {}).path, path).toBe(path);
      expect(resolveSvgRoute(new URL(path, schema.origin)), path).toBeDefined();
    }
  });

  it('builds the exact service request the Worker parses (owners, multi-segment targets, metrics)', () => {
    const schema = getBuilderSchema('service');
    const cases: [BuilderState, ServiceRequest][] = [
      [
        { metric: 'v', service: 'npm', target: 'hono' },
        { metric: 'v', service: 'npm', target: 'hono' },
      ],
      [
        { metric: 'dt', owner: 'types', service: 'npm', target: 'node' },
        { metric: 'dt', owner: 'types', service: 'npm', target: 'node' },
      ],
      [
        { metric: 'v', owner: 'ignored', service: 'go', target: 'github.com/spf13/cobra' },
        { metric: 'v', service: 'go', target: 'github.com/spf13/cobra' },
      ],
    ];
    for (const [state, expected] of cases) {
      const { path } = core.buildPath(schema, state);
      const match = resolveSvgRoute(new URL(path, schema.origin));
      expect(match?.kind, path).toBe('service');
      expect(match?.kind === 'service' ? match.request : undefined, path).toEqual(expected);
    }
  });

  it('reports empty required fields instead of building a broken route (regression guard: empty status text)', () => {
    const badge = getBuilderSchema('badge');
    expect(core.buildPath(badge, { state: 'online', text: '', type: 'status' }).missing).toEqual([
      'Status text',
    ]);
    expect(core.buildPath(badge, { label: '', type: 'static', value: '' }).missing).toEqual([]);
    expect(core.buildPath(getBuilderSchema('quote'), { text: ' ' }).missing).toEqual(['Quote']);
  });

  it('rejects paths that belong to another builder or that the Worker rejects (regression: prefix case, extra service segments)', () => {
    const service = getBuilderSchema('service');
    expect(core.parsePath(getBuilderSchema('icon'), '/badge/build/passing')).toBeUndefined();
    expect(core.parsePath(service, '/badge/build/passing')).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('badge'), '/badge/a/b/c')).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('badge'), '/badge/status/online/up')).toMatchObject({
      state: 'online',
      text: 'up',
      type: 'status',
    });
    // The Worker's route prefixes are case-sensitive.
    expect(resolveSvgRoute(new URL('https://svg.xul.is/Badge/build/passing'))).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('badge'), '/Badge/build/passing')).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('icon'), '/ICON/rocket')).toBeUndefined();
    // Single-segment targets take 3 or 4 segments; Owner-less presets never take an owner segment.
    expect(core.parsePath(service, '/badge/npm/a/b/c/v')).toBeUndefined();
    const ownerless = service.services?.find(
      (option) => option.ownerMode === 'none' && option.maxTargetSegments === 1
    );
    expect(ownerless).toBeDefined();
    expect(core.parsePath(service, `/badge/${ownerless?.key}/owner/target/v`)).toBeUndefined();
    const multiSegment = service.services?.find((option) => option.maxTargetSegments > 1);
    const tooLong = Array.from({ length: (multiSegment?.maxTargetSegments ?? 1) + 1 }, () => 'x');
    expect(
      core.parsePath(service, `/badge/${multiSegment?.key}/${tooLong.join('/')}/v`)
    ).toBeUndefined();
  });

  it('prefills quote layout aliases, type, and center flags like the Worker (regression: vertical aliases lost)', () => {
    const quote = getBuilderSchema('quote');
    for (const query of [
      'layout=center',
      'layout=v',
      'layout=VERTICAL',
      'type=v',
      'type=center',
      'center=true',
      'center=1',
      'center=yes',
      'layout=&type=vertical',
      'layout=foo&center=true',
      'layout=horizontal&center=true',
    ]) {
      const path = `/quote/XulbuX/Hello+world?${query}`;
      const [original, rebuilt] = renderPrefillRoundTrip('quote', path);
      expect(rebuilt, query).toBe(original);
    }
    expect(core.parsePath(quote, '/quote/Hi?type=v')?.layout).toBe('vertical');
    expect(core.parsePath(quote, '/quote/Hi?layout=center')?.layout).toBe('vertical');
    expect(core.parsePath(quote, '/quote/Hi?layout=foo&center=1')?.layout).toBe('');
  });

  it('prefills option values case-insensitively and maps unknown values to the default (regression: Emerald dropped)', () => {
    const badge = getBuilderSchema('badge');
    const path = '/badge/build/passing?color=Emerald&variant=2&dot=ONLINE&anim=Sheen';
    expect(core.parsePath(badge, path)).toMatchObject({ color: 'emerald', dot: 'online' });
    expect(core.parsePath(badge, '/badge/a/b?color=notacolor')?.color).toBe('');
    expect(core.parsePath(getBuilderSchema('button'), '/button/Go?size=bogus')?.size).toBe('');
    expect(core.parsePath(getBuilderSchema('icon'), '/icon/rocket?size=bogus')?.size).toBe('');
    for (const [kind, prefillPath] of [
      ['badge', path],
      ['badge', '/badge/a/b?color=notacolor&variant=9'],
      ['button', '/button/Go?size=LG&color=Rose'],
      ['button', '/button/Go?size=bogus'],
      ['quote', '/quote/Hi?size=XL&layout=Vertical'],
    ] as const) {
      const [original, rebuilt] = renderPrefillRoundTrip(kind, prefillPath);
      expect(rebuilt, prefillPath).toBe(original);
    }
  });

  it('reads path segment fallbacks from the schema aliases in Worker precedence (regression: hard-coded alias order)', () => {
    const stack = getBuilderSchema('stack');
    expect(core.parsePath(stack, '/stack?i=react&icons=vue&groups=svelte')?.groups).toBe('svelte');
    expect(core.parsePath(stack, '/stack?groups=&icons=vue&i=react')?.groups).toBe('vue');
    expect(core.parsePath(stack, '/stack?i=react')?.groups).toBe('react');
    for (const path of ['/stack?i=react&icons=vue&groups=svelte', '/stack?groups=&icons=vue']) {
      const [original, rebuilt] = renderPrefillRoundTrip('stack', path);
      expect(rebuilt, path).toBe(original);
    }
    expect(builderScript).not.toContain("['groups', 'icons', 'i']");
    const quote = getBuilderSchema('quote');
    expect(core.parsePath(quote, '/quote?text=&quote=Hi&author=Me')).toMatchObject({
      author: 'Me',
      text: 'Hi',
    });
  });

  it('canonicalizes service metric aliases and case like the Worker', () => {
    const schema = getBuilderSchema('service');
    const service = schema.services?.find(
      (option) => Object.keys(option.metricAliases ?? {}).length > 0 && option.ownerMode === 'none'
    );
    const [alias, canonical] = Object.entries(service?.metricAliases ?? {})[0] ?? ['', ''];
    expect(alias).not.toBe('');
    const path = `/badge/${service?.key}/target/${alias.toUpperCase()}`;
    expect(core.parsePath(schema, path)?.metric).toBe(canonical);
  });

  it('parses and builds a required owner followed by a multi-segment target', () => {
    const schema: BuilderSchema = {
      ...getBuilderSchema('service'),
      services: [
        {
          key: 'multi',
          maxTargetSegments: 3,
          metrics: [{ label: 'v', value: 'v' }],
          ownerMode: 'required',
          ownerName: ':owner',
          targetName: ':path',
          title: 'Multi',
        },
      ],
    };
    const parsed = core.parsePath(schema, '/badge/multi/acme/a/b.c/v');
    expect(parsed).toMatchObject({ metric: 'v', owner: 'acme', service: 'multi', target: 'a/b.c' });
    expect(core.buildPath(schema, parsed ?? {}).path).toBe('/badge/multi/acme/a/b.c/v');
    expect(core.parsePath(schema, '/badge/multi/acme/v')).toBeUndefined();
    expect(core.parsePath(schema, '/badge/multi/acme/a/b/c/d/v')).toBeUndefined();
  });

  it('composes and splits the composite icon, animation, and widget values', () => {
    const specialOptions = findField(getBuilderSchema('badge'), 'special').options ?? [];
    expect(core.composeIconPair('', 'arrow-right', false)).toBe('none,arrow-right');
    expect(core.composeIconPair('', 'star', true)).toBe(',star');
    expect(core.composeIconPair('rocket', '', false)).toBe('rocket');
    expect(core.splitIconPair('none,arrow-right', false)).toEqual(['', 'arrow-right']);
    expect(core.splitIconPair('none,arrow-right', true)).toEqual(['none', 'arrow-right']);
    expect(core.composeAnim(true, '', 'nudge')).toBe('sheen,default,nudge');
    expect(core.splitAnim('sheen,default,nudge')).toEqual({
      hasSheen: true,
      left: '',
      right: 'nudge',
    });
    expect(core.splitSpecial('bar:92:static', specialOptions)).toEqual({
      kind: 'bar',
      modifier: 'static',
      payload: '92',
    });
    expect(core.splitSpecial('bar:92:pulse', specialOptions)).toEqual({
      kind: 'bar',
      modifier: '',
      payload: '92:pulse',
    });
    expect(core.splitSpecial('delta:+24%', specialOptions)).toEqual({
      kind: 'delta',
      modifier: '',
      payload: '+24%',
    });
    expect(core.composeSpecial('sparkline', ' ', '')).toBe('');
    expect(core.collectStackSlugs('c,cpp:4|rust\n py ; ts:2')).toEqual([
      'c',
      'cpp',
      'rust',
      'py',
      'ts',
    ]);
  });

  it('builds exact Markdown, HTML, and URL snippets with escaped alt text and links', () => {
    const url = 'https://svg.xul.is/badge/build/passing?icon=circle-check';
    expect(core.buildSnippets(url, 'build [ok]', '')).toEqual({
      html: '<img src="https://svg.xul.is/badge/build/passing?icon=circle-check" alt="build [ok]" />',
      markdown: String.raw`![build \[ok\]](https://svg.xul.is/badge/build/passing?icon=circle-check)`,
      url,
    });
    const linked = core.buildSnippets(url, 'a "quoted" <alt>', 'https://xul.is');
    expect(linked.markdown).toBe(`[![a "quoted" <alt>](${url})](https://xul.is)`);
    expect(linked.html).toBe(
      `<a href="https://xul.is"><img src="${url}" alt="a &quot;quoted&quot; &lt;alt&gt;" /></a>`
    );
    expect(
      core.buildAltText(getBuilderSchema('badge'), {
        label: 'build',
        type: 'static',
        value: 'passing',
      })
    ).toBe('build: passing');
  });

  it('percent-encodes Markdown link targets and keeps raw & in HTML snippets (regression: broken snippets)', () => {
    const url = 'https://svg.xul.is/badge/a/b?icon=zap&color=rose';
    const snippets = core.buildSnippets(url, String.raw`a\b`, 'https://example.com/a (b)/<c>');
    expect(snippets.markdown).toBe(
      String.raw`[![a\\b](${url})](https://example.com/a%20%28b%29/%3Cc%3E)`
    );
    expect(snippets.html).toBe(
      `<a href="https://example.com/a (b)/&lt;c&gt;"><img src="https://svg.xul.is/badge/a/b?icon=zap&color=rose" alt="a\\b" /></a>`
    );
    const htmlTokens = core.buildSnippetTokens(url, 'x', '').html;
    expect(htmlTokens).toContainEqual(['hl-op', '&']);
    expect(htmlTokens).toContainEqual(['hl-key', 'color']);
  });

  it('builds the same Markdown tokens as the docs code drawers (parity with components.ts)', () => {
    const cases: [url: string, alt: string, href: string | undefined][] = [
      ['https://svg.xul.is/badge/build/passing', 'build', undefined],
      [
        'https://svg.xul.is/badge/a/b?icon=zap&color=rose&flag',
        String.raw`C++ [beta] \ x`,
        'https://xul.is',
      ],
      ['https://svg.xul.is/quote/Hi?text=a b&x=(y)', 'Quote <1>', 'https://example.com/a (b)'],
      ['https://svg.xul.is/stack/c,cpp:4|rust', 'Tech & "Stack"', undefined],
    ];
    for (const [url, alt, href] of cases) {
      expect(core.buildSnippetTokens(url, alt, href ?? '').markdown, url).toEqual(
        buildMarkdownSnippetTokens(url, alt, href)
      );
    }
  });

  it('links service badges to their upstream page like the docs (user decision: no badge URL round trip)', () => {
    const schema = getBuilderSchema('service');
    let upstreamCount = 0;
    for (const path of collectAllPreviewPaths()) {
      if (resolveBuilderTarget(path)?.kind === 'service') {
        const state = core.parsePath(schema, path) ?? {};
        const rebuilt = core.buildPath(schema, state).path;
        const url = `${schema.origin}${rebuilt}`;
        const link = core.buildDefaultLinkTarget(schema, state, url);
        const expected = resolveSvgPathRedirectUrl(path);
        if (link.startsWith(schema.origin)) {
          // No template: The query-free badge path redirects to the same page.
          expect(resolveSvgPathRedirectUrl(new URL(link).pathname), path).toBe(expected);
        } else {
          expect(link, path).toBe(expected);
          upstreamCount += 1;
        }
      }
    }
    expect(upstreamCount).toBeGreaterThan(20);
    for (const kind of BUILDER_KINDS.filter((candidate) => candidate !== 'service')) {
      const kindSchema = getBuilderSchema(kind);
      expect(
        core.buildDefaultLinkTarget(kindSchema, { ...kindSchema.initialState }, schema.origin),
        kind
      ).toBe('');
    }
  });

  it('falls back to the badge path for values outside the verified template characters', () => {
    const schema = getBuilderSchema('service');
    const service = schema.services?.find(
      (option) =>
        option.ownerMode !== 'none' &&
        option.maxTargetSegments === 1 &&
        option.metrics[0]?.redirect !== undefined
    );
    expect(service).toBeDefined();
    const metric = service?.metrics[0]?.value ?? '';
    const state = { metric, owner: 'owner', service: service?.key ?? '', target: 'target' };
    const { path } = core.buildPath(schema, state);
    expect(core.buildDefaultLinkTarget(schema, state, `${schema.origin}${path}`)).toBe(
      resolveSvgPathRedirectUrl(path)
    );
    const unsafeState = { ...state, owner: 'own+er' };
    const unsafePath = core.buildPath(schema, unsafeState).path;
    expect(
      core.buildDefaultLinkTarget(schema, unsafeState, `${schema.origin}${unsafePath}?color=rose`)
    ).toBe(`${schema.origin}${unsafePath}`);
  });

  it('renders reduced-motion previews without SMIL animations (regression: <img> previews kept animating)', () => {
    const animatedPaths = [
      ...BUILDER_KINDS.map((kind) => {
        const schema = getBuilderSchema(kind);
        return core.buildPath(schema, { ...schema.initialState, anim: 'sheen' }).path;
      }),
      '/badge/kv/84%25?special=ring:84:pulse&dot=online&anim=sheen,spin',
      '/badge/coverage/92%25?special=bar:92&icon=loader&anim=spin',
      '/button/Go?dot=online&anim=sheen,pulse,nudge',
    ];
    for (const path of animatedPaths) {
      const previewPath = core.buildPreviewPath(path, true);
      expect(previewPath, path).toContain('anim=none');
      expect(renderSvgPath(previewPath), previewPath).not.toMatch(SMIL_ANIMATION_RX);
      expect(core.buildPreviewPath(path, false)).toBe(path);
    }
    expect(renderSvgPath('/button/Go?dot=online&anim=sheen,pulse,nudge')).toMatch(
      SMIL_ANIMATION_RX
    );
    expect(core.buildPreviewPath('', true)).toBe('');
  });

  it('persists alt text and link target in share links', () => {
    const shareUrl = new URL(
      core.buildShareUrl(
        'https://svg.xul.is/builder/badge?path=%2Fold&alt=old',
        '/badge/a/b?color=rose',
        'My alt',
        'https://xul.is'
      )
    );
    expect(shareUrl.searchParams.get('path')).toBe('/badge/a/b?color=rose');
    expect(shareUrl.searchParams.get('alt')).toBe('My alt');
    expect(shareUrl.searchParams.get('link')).toBe('https://xul.is');
    const cleared = new URL(core.buildShareUrl(shareUrl.href, '/badge/a', '', ''));
    expect(cleared.searchParams.has('alt')).toBe(false);
    expect(cleared.searchParams.has('link')).toBe(false);
  });

  it('retries failed loads instead of caching the rejection (regression: failed icon fetches cached forever)', async () => {
    let calls = 0;
    const load = core.createAsyncCache((key) => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error(key)) : Promise.resolve(`${key}-${calls}`);
    });
    await expect(load('page')).rejects.toThrow('page');
    await expect(load('page')).resolves.toBe('page-2');
    await expect(load('page')).resolves.toBe('page-2');
    expect(calls).toBe(2);
  });

  it('moves the picker focus to the first and last match, not the last rendered tile (regression: Home/End)', () => {
    expect(core.computeGridFocusIndex('End', 3, 8, 5000)).toBe(4999);
    expect(core.computeGridFocusIndex('Home', 4000, 8, 5000)).toBe(0);
    expect(core.computeGridFocusIndex('ArrowDown', 4996, 8, 5000)).toBe(4999);
    expect(core.computeGridFocusIndex('ArrowUp', 3, 8, 5000)).toBe(0);
    expect(core.computeGridFocusIndex('ArrowRight', 10, 8, 5000)).toBe(11);
    expect(core.computeGridFocusIndex('Enter', 10, 8, 5000)).toBeUndefined();
    expect(core.computeGridFocusIndex('End', 0, 8, 0)).toBeUndefined();
  });
});

/************************************* Icon picker **************************************/

describe('icon picker index & assets', () => {
  it('resolves slugs exactly like resolveIcon in Lucide-first and brand-first contexts', () => {
    const resolver = core.createIconResolver(getIconPickerIndex(), MAX_ICON_SLUG_LENGTH);
    const index = getIconPickerIndex();
    const samples = [
      ...index.sets.lucide.filter((_slug, position) => position % 9 === 0),
      ...index.sets.brands.filter((_slug, position) => position % 13 === 0),
      ...Object.keys(index.lucideAliases).slice(0, 40),
      ...Object.keys(ICON_SLUG_ALIASES),
      ...Object.keys(index.brandAliases),
      'github',
      'figma',
      'c',
      'cpp',
      'Rocket',
      'arrow_right',
      'not-an-icon-at-all',
      'x'.repeat(MAX_ICON_SLUG_LENGTH + 1),
    ];
    for (const slug of samples) {
      for (const isBrandFirst of [false, true]) {
        expect(resolver.resolve(slug, isBrandFirst), `${slug} (${isBrandFirst})`).toBe(
          toPickerSet(slug, isBrandFirst)
        );
      }
    }
    expect(resolver.resolve('none', false)).toBe('none');
    expect(builderScript).not.toContain('64');
  });

  it('serves the icon index and every body page, and rejects out-of-range pages', () => {
    const indexAsset = getSiteAsset('icons.json');
    const index = JSON.parse(indexAsset?.body ?? '{}') as IconPickerIndex;
    expect(index.sets.lucide.length).toBeGreaterThan(1000);
    expect(index.sets.brands.length).toBeGreaterThan(1000);
    for (const set of ['lucide', 'brands'] as const) {
      const pageCount = Math.ceil(index.sets[set].length / index.pageSize);
      const lastPage = getSiteAsset(`icons-${set}-${pageCount - 1}.json`);
      expect(lastPage?.version, set).toBe(indexAsset?.version);
      expect(Object.keys(JSON.parse(lastPage?.body ?? '{}')).length, set).toBeGreaterThan(0);
      expect(getSiteAsset(`icons-${set}-${pageCount}.json`), set).toBeUndefined();
    }
    const firstPage = JSON.parse(getSiteAsset('icons-lucide-0.json')?.body ?? '{}') as Record<
      string,
      string
    >;
    expect(Object.keys(firstPage)).toEqual(index.sets.lucide.slice(0, index.pageSize));
    expect(getSiteAsset('icons-lucide-0001.json')).toBeUndefined();
    expect(getSiteAsset('icons-other-0.json')).toBeUndefined();
  });
});

/************************************ Pages & links *************************************/

describe('builder pages & "Open in Builder" links', () => {
  it('embeds the exact schema, the builder script, and the icon picker on every builder page', () => {
    for (const kind of BUILDER_KINDS) {
      const html = renderBuilderHtml(kind);
      const schemaJson =
        /<script type="application\/json" id="builder-schema">(?<json>[^<]*)<\/script>/.exec(html)
          ?.groups?.json;
      expect(JSON.parse(schemaJson ?? '{}'), kind).toEqual(getBuilderSchema(kind));
      expect(html, kind).toMatch(
        /<script src="\/assets\/builder\.js\?v=[\da-z]+" defer><\/script>/
      );
      expect(html, kind).toContain('id="icon-picker" popover role="dialog"');
      for (const field of getBuilderSchema(kind).fields) {
        expect(html, `${kind}.${field.id}`).toContain(`data-field="${field.id}"`);
      }
    }
  });

  it('keeps the required mark outside the relabeled text and announces color fields once (regressions: wiped asterisk, double label)', () => {
    const serviceHtml = renderBuilderHtml('service');
    expect(serviceHtml).toContain(
      '<span class="builder-label-text">Target</span><span class="builder-required" aria-hidden="true">*</span>'
    );
    expect(serviceHtml).toContain(
      '<span class="builder-label-text">Owner</span><span class="builder-required" aria-hidden="true" hidden>*</span>'
    );
    expect(builderScript).toContain("querySelector('.builder-label-text')");
    expect(builderScript).not.toContain('labelElement.textContent');
    const badgeHtml = renderBuilderHtml('badge');
    expect(badgeHtml).toMatch(/data-field="color" data-control="color">/);
    expect(badgeHtml).toContain('role="radiogroup" aria-labelledby="field-color-label"');
    expect(badgeHtml).toMatch(/data-field="anim" data-control="anim" role="group"/);
    const iconHtml = renderBuilderHtml('icon');
    expect(iconHtml).not.toContain('id="field-icon-main-label"');
    expect(iconHtml).toContain('aria-labelledby="field-icon-label field-icon-main-value"');
  });

  it('disables Open SVG and copying until the URL is complete, renders a custom checkbox, and places the Reference link next to the page title (regressions)', () => {
    const html = renderBuilderHtml('badge');
    expect(html).toContain(
      'id="builder-open" target="_blank" rel="noopener noreferrer" aria-disabled="true" tabindex="-1"'
    );
    expect(html).toContain(
      '<input class="check-input" type="checkbox" id="field-anim-sheen" data-part="sheen" /><span class="check-box" aria-hidden="true">'
    );
    expect(html).toMatch(
      /<div class="section-title-row"><h1 class="section-title">Badge Builder<\/h1><a class="section-action" href="\/docs\/badges" tabindex="0">/
    );
    expect(html).toContain(
      '<button type="button" class="icon-picker-none" id="icon-picker-none" hidden>No icon</button>'
    );
    expect(html).not.toContain('code-drawer-toolbar');
    expect(html).not.toContain('id="builder-code-label"');
    const actionsHtml = html.slice(
      html.indexOf('<div class="builder-actions">'),
      html.indexOf('</aside>')
    );
    expect(actionsHtml).not.toContain('Reference');
    expect(html).not.toContain('href="#"');
    expect(html).toContain('id="builder-copy" data-copy-target="builder-code"');
    expect(html).toContain(
      '<span id="builder-share-label" data-copy-label aria-live="polite">Copy builder link</span>'
    );
    expect(builderScript).toContain("openLink.removeAttribute('href')");
    expect(builderScript).toContain('openLink.tabIndex = 0');
    expect(builderScript).toContain('openLink.tabIndex = -1');
    expect(builderScript).toContain('copyButton.disabled = !isComplete');
    expect(builderScript).toContain('site?.copyText(');
    expect(builderScript).not.toContain('navigator.clipboard');
  });

  it('updates the preview alt text, disconnects picker observers, closes menus on focus loss, and measures fallback popovers (regressions)', () => {
    expect(builderScript).toContain('previewImage.alt = alt');
    const disconnectIndex = builderScript.indexOf('tileObserver?.disconnect()');
    expect(disconnectIndex).toBeGreaterThan(-1);
    expect(disconnectIndex).toBeLessThan(builderScript.indexOf('pickerGrid.replaceChildren()'));
    expect(builderScript).toContain("addEventListener('focusout'");
    expect(builderScript).toContain('site?.placePopover(picker, pickerTrigger');
    expect(builderScript).not.toMatch(/innerHeight - 420|innerWidth - 380/);
  });

  it('renders the icon picker glyph templates with the UI icon paint attributes', () => {
    const html = renderBuilderHtml('stack');
    expect(html).toContain(
      '<svg data-set="lucide" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg>'
    );
    expect(html).toContain(
      '<svg data-set="brands" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"></svg>'
    );
    expect(builderScript).not.toContain("'stroke-linecap'");
  });

  it('links every docs preview to a builder whose prefill renders the identical SVG', () => {
    let linkCount = 0;
    for (const path of collectAllPreviewPaths()) {
      const target = resolveBuilderTarget(path);
      expect(target, path).toBeDefined();
      const schema = getBuilderSchema(target?.kind ?? 'badge');
      const parsed = core.parsePath(schema, path);
      expect(parsed, path).toBeDefined();
      const rebuilt = core.buildPath(schema, parsed ?? {}).path;
      expect(renderSvgPath(rebuilt), `${path} -> ${rebuilt}`).toBe(renderSvgPath(path));
      linkCount += 1;
    }
    expect(linkCount).toBeGreaterThan(100);
  });

  it('resolves builder targets per route family and skips owner-restricted or invalid paths', () => {
    expect(resolveBuilderTarget('/badge/build/passing')?.kind).toBe('badge');
    expect(resolveBuilderTarget('/badge/status/online/up')?.kind).toBe('badge');
    expect(resolveBuilderTarget('/badge/pypi/xulbux/v')?.kind).toBe('service');
    expect(resolveBuilderTarget('/btn/Go')?.kind).toBe('button');
    expect(resolveBuilderTarget('/badge/gh/svg-api/stars')).toBeUndefined();
    expect(resolveBuilderTarget('/icon/a/b')).toBeUndefined();
    expect(resolveBuilderTarget('/badge/a/b/c/d')).toBeUndefined();
    expect(resolveBuilderTarget('/favicon.svg')).toBeUndefined();
    expect(resolveBuilderTarget('/quote/Hi?layout=vertical')?.href).toBe(
      `/builder/quote?path=${encodeURIComponent('/quote/Hi?layout=vertical')}`
    );
  });
});
