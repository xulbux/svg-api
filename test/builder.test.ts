/**
 * URL builder tests – Builder schemas, the builder client core (encoding, path building, prefill parsing, snippets, icon slug resolution), icon picker assets, and "Open in Builder" links, verified against the Worker's route parser (`src/routes/schema.ts`, `src/preview/builder.ts`, `src/preview/scripts/builder.client.js`).
 */

import { describe, expect, it } from 'vitest';
import { listPublicServices, STATUS_PRESET_MAP } from '@/config/services';
import { THEME_COLOR_NAMES } from '@/config/theme';
import { getSiteAsset } from '@/preview/assets';
import { renderBuilderHtml } from '@/preview/builder';
import { BUILDER_PAGES, DOCS_PAGES } from '@/preview/navigation';
import { renderDocsHtml, renderHomeHtml } from '@/preview/page';
import builderScript from '@/preview/scripts/builder.client.js';
import {
  decodeSegment,
  ICON_MOTION_TOKENS,
  parseSpecialParam,
  resolveAnimationMode,
  resolveDotState,
  resolveVariant,
  SPECIAL_ELEMENT_KINDS,
  VARIANT_TOKENS,
} from '@/routes/params';
import { getBuilderSchema, resolveBuilderTarget } from '@/routes/schema';
import { renderSvgPath, resolveSvgRoute } from '@/routes/svg';
import { getIconPickerIndex, ICON_SLUG_ALIASES, resolveIcon } from '@/svg/icons';
import type {
  BuilderKind,
  BuilderSchema,
  IconPickerIndex,
  IconPickerSetId,
  ServiceRequest,
} from '@/types';

/********************************* Fixtures *********************************/

/** Builder state (field ID -> serialized value). */
type BuilderState = Record<string, string>;

/** Pure helpers exposed by the builder client script (`svgBuilderCore`). */
interface BuilderCore {
  buildAltText: (schema: BuilderSchema, state: BuilderState) => string;
  buildPath: (schema: BuilderSchema, state: BuilderState) => { missing: string[]; path: string };
  buildSnippets: (
    url: string,
    alt: string,
    link: string
  ) => { html: string; markdown: string; url: string };
  collectStackSlugs: (groups: string) => string[];
  composeAnim: (hasSheen: boolean, left: string, right: string) => string;
  composeIconPair: (left: string, right: string, hasPresetIcon: boolean) => string;
  composeSpecial: (kind: string, payload: string, modifier: string) => string;
  createIconResolver: (index: IconPickerIndex) => {
    resolve: (slug: string, isBrandFirst: boolean) => IconPickerSetId | 'none' | undefined;
  };
  decodeSegment: (raw: string) => string;
  encodeSegment: (text: string) => string;
  parsePath: (schema: BuilderSchema, rawPath: string) => BuilderState | undefined;
  splitAnim: (value: string) => { hasSheen: boolean; left: string; right: string };
  splitIconPair: (value: string, hasPresetIcon: boolean) => [left: string, right: string];
  splitSpecial: (value: string) => { kind: string; modifier: string; payload: string };
}

/** Every builder element kind. */
const BUILDER_KINDS: readonly BuilderKind[] = BUILDER_PAGES.map((page) => page.kind);

/** Matches every "Open in Builder" preview link (`href` with escaped `&`). */
const PREVIEW_LINK_RX = /<a class="preview-link" href="(?<href>[^"]+)"/g;

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

/** Collect the decoded `?path=` of every preview link on a page. */
function collectPreviewPaths(html: string): string[] {
  const paths: string[] = [];
  for (const match of html.matchAll(PREVIEW_LINK_RX)) {
    const href = (match.groups?.href ?? '').replaceAll('&amp;', '&');
    paths.push(new URL(href, 'https://svg.xul.is').searchParams.get('path') ?? '');
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

const core = loadBuilderCore();

/********************************* Schemas *********************************/

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
      expect(option?.ownerMode, key).toBe(definition.ownerMode);
    }
    expect(services.some((service) => service.key === 'gh')).toBe(false);
  });

  it('accepts every offered select value in the matching parser', () => {
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
      }
    }
    expect(parseSpecialParam(core.composeSpecial('bar', '92', 'static'))).toMatchObject({
      hasPulse: false,
    });
    expect(parseSpecialParam(core.composeSpecial('ring', '84', 'pulse'))).toMatchObject({
      hasPulse: true,
    });
  });
});

/********************************* Builder core *********************************/

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

  it('rejects paths that belong to another builder', () => {
    expect(core.parsePath(getBuilderSchema('icon'), '/badge/build/passing')).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('service'), '/badge/build/passing')).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('badge'), '/badge/a/b/c')).toBeUndefined();
    expect(core.parsePath(getBuilderSchema('badge'), '/badge/status/online/up')).toMatchObject({
      state: 'online',
      text: 'up',
      type: 'status',
    });
  });

  it('composes and splits the composite icon, animation, and widget values', () => {
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
    expect(core.splitSpecial('bar:92:static')).toEqual({
      kind: 'bar',
      modifier: 'static',
      payload: '92',
    });
    expect(core.splitSpecial('delta:+24%')).toEqual({
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
      `<a href="https://xul.is"><img src="${url}" alt="a &#34;quoted&#34; &#60;alt&#62;" /></a>`
    );
    expect(
      core.buildAltText(getBuilderSchema('badge'), {
        label: 'build',
        type: 'static',
        value: 'passing',
      })
    ).toBe('build: passing');
  });
});

/********************************* Icon picker *********************************/

describe('icon picker index & assets', () => {
  it('resolves slugs exactly like resolveIcon in Lucide-first and brand-first contexts', () => {
    const resolver = core.createIconResolver(getIconPickerIndex());
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
      'x'.repeat(65),
    ];
    for (const slug of samples) {
      for (const isBrandFirst of [false, true]) {
        expect(resolver.resolve(slug, isBrandFirst), `${slug} (${isBrandFirst})`).toBe(
          toPickerSet(slug, isBrandFirst)
        );
      }
    }
    expect(resolver.resolve('none', false)).toBe('none');
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

/********************************* Pages & links *********************************/

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
      expect(html, kind).toContain('id="icon-picker" popover');
      for (const field of getBuilderSchema(kind).fields) {
        expect(html, `${kind}.${field.id}`).toContain(`data-field="${field.id}"`);
      }
    }
  });

  it('links every docs preview to a builder whose prefill renders the identical SVG', () => {
    const pages = [renderHomeHtml(), ...DOCS_PAGES.map((page) => renderDocsHtml(page.slug))];
    let linkCount = 0;
    for (const html of pages) {
      for (const path of collectPreviewPaths(html)) {
        const target = resolveBuilderTarget(path);
        expect(target, path).toBeDefined();
        const schema = getBuilderSchema(target?.kind ?? 'badge');
        const parsed = core.parsePath(schema, path);
        expect(parsed, path).toBeDefined();
        const rebuilt = core.buildPath(schema, parsed ?? {}).path;
        expect(renderSvgPath(rebuilt), `${path} -> ${rebuilt}`).toBe(renderSvgPath(path));
        linkCount += 1;
      }
    }
    expect(linkCount).toBeGreaterThan(100);
  });

  it('resolves builder targets per route family and skips owner-restricted services', () => {
    expect(resolveBuilderTarget('/badge/build/passing')?.kind).toBe('badge');
    expect(resolveBuilderTarget('/badge/status/online/up')?.kind).toBe('badge');
    expect(resolveBuilderTarget('/badge/pypi/xulbux/v')?.kind).toBe('service');
    expect(resolveBuilderTarget('/btn/Go')?.kind).toBe('button');
    expect(resolveBuilderTarget('/badge/gh/svg-api/stars')).toBeUndefined();
    expect(resolveBuilderTarget('/favicon.svg')).toBeUndefined();
    expect(resolveBuilderTarget('/quote/Hi?layout=vertical')?.href).toBe(
      `/builder/quote?path=${encodeURIComponent('/quote/Hi?layout=vertical')}`
    );
  });
});
