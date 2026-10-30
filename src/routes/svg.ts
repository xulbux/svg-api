/**
 * SVG Route Dispatcher
 *
 * Maps every registered SVG endpoint URL onto its SSOT renderer.
 *
 * The `SVG_ROUTES` table is the single source of the route prefixes, alias mappings, segment limits,
 * builder targets, and the query parameters each route reads (which also form its normalized edge cache key).
 */

import { SERVICES_CONFIG } from '@/config/services';
import { SITE_ORIGIN } from '@/config/site';
import { DEFAULT_THEME_COLOR, resolveColor, resolveOptionalColor } from '@/config/theme';
import {
  canonicalizeSpecialParam,
  isBadgeVariant,
  isTruthyFlagParam,
  normalizeDotParam,
  parseOptionalNumber,
  parsePerLineList,
  parseSpecialParam,
  resolveAnimationMode,
  resolveDotState,
  resolveIconQueryParam,
  resolveQuoteLayout,
  resolveSizeToken,
  resolveSpecialParam,
  resolveStackAnimationMode,
  resolveTypingAlign,
  resolveTypingCursor,
  resolveTypingEraseMode,
  resolveTypingFont,
  resolveTypingLayout,
  resolveVariant,
} from '@/routes/params';
import {
  resolveMetricKey,
  resolveServicePreview,
  resolveServiceRedirectUrl,
} from '@/services/fetcher';
import { decodeRouteSegments } from '@/site/shared/encoding';
import { STACK_PER_LINE_RANGE } from '@/site/shared/stackDsl';
import {
  DEFAULT_HORIZONTAL_QUOTE_SIZE,
  DEFAULT_QUOTE_LAYOUT,
  DEFAULT_VERTICAL_QUOTE_SIZE,
  DEFAULT_QUOTE_VARIANT as QUOTE_DEFAULT_VARIANT,
  QUOTE_FONT_SIZE_RANGE,
  QUOTE_SIZE_MAP,
  QUOTE_WIDTH_RANGE,
  renderQuote,
  resolveDefaultQuoteWidth,
} from '@/svg/quote';
import {
  BUTTON_HEIGHT_RANGE,
  DEFAULT_BUTTON_SIZE,
  ICON_SIZE_RANGE,
  ICON_STROKE_RANGE,
  renderBadge,
  renderButton,
  renderIcon,
} from '@/svg/renderer';
import {
  clampInt,
  clampNumber,
  getOwnValue,
  prepareDisplayText,
  resolveScaledFontSize,
  roundCoord,
  sliceAtCodePoint,
} from '@/svg/shared';
import {
  parseStackGroups,
  renderStack,
  resolveDefaultStackGroupGap,
  DEFAULT_STACK_VARIANT as STACK_DEFAULT_VARIANT,
  STACK_GAP_RANGE,
  STACK_GROUP_GAP_RANGE,
  STACK_TILE_SIZE_RANGE,
} from '@/svg/stack';
import {
  DEFAULT_IDE_TITLE,
  DEFAULT_LAYOUT_FONTS,
  DEFAULT_TYPING_CURSOR,
  DEFAULT_TYPING_ERASE,
  DEFAULT_TYPING_LAYOUT,
  DEFAULT_TYPING_SIZE,
  MAX_TYPING_TITLE_LENGTH,
  renderTyping,
  resolveDefaultTypingAlign,
  DEFAULT_TYPING_VARIANT as TYPING_DEFAULT_VARIANT,
  TYPING_DURATION_RANGE,
  TYPING_FONT_SIZE_RANGE,
  TYPING_PAUSE_RANGE,
  TYPING_SIZE_MAP,
  TYPING_WIDTH_RANGE,
} from '@/svg/typing';
import type {
  BadgeSpecialElement,
  BadgeSpecialMap,
  BadgeVariant,
  DotState,
  MetricResult,
  NumericRange,
  ResolvedSvgRequest,
  ServicePreviewSample,
  StaticSvgRouteMatch,
  SvgRouteDefinition,
  SvgRouteMatch,
  ThemeColorName,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Normalizer mapping a raw single query parameter value onto its canonical cache-key string (`undefined` omits it). */
type QueryParamNormalizer = (rawValue: string, canonicalPrefix: string) => string | undefined;

/** Default values for a badge route before applying URL query overrides. */
interface RouteBadgeDefaults {
  /** Default theme color token. */
  color?: ThemeColorName;
  /** Default status dot state. */
  dot?: DotState;
  /** Default icon slug. */
  icon?: string;
  /** Default left-hand label text. */
  label: string;
  /** Default right-hand special element. */
  special?: BadgeSpecialElement;
  /** Candidate automatic right-hand special elements from upstream service data. */
  specials?: BadgeSpecialMap;
  /** Default right-hand value text. */
  value?: string;
  /** Default badge variant. */
  variant: BadgeVariant;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Shared edge cache TTL in seconds for static SVG routes. */
export const STATIC_TTL_SECONDS = 3600;

/** Shared edge cache TTL in seconds for successfully resolved service preset badges. */
export const SERVICE_TTL_SECONDS = 600;

/** Shared edge cache TTL in seconds for failed, pending, or invalid service preset badges. */
export const SERVICE_ERROR_TTL_SECONDS = 60;

/** Default visual hierarchy variant for static and service preset badges. */
export const DEFAULT_BADGE_VARIANT: BadgeVariant = '1';

/** Default visual hierarchy variant for CTA buttons. */
export const DEFAULT_BUTTON_VARIANT: BadgeVariant = '1';

/** Default visual hierarchy variant for quote cards. */
export const DEFAULT_QUOTE_VARIANT: BadgeVariant = QUOTE_DEFAULT_VARIANT;

/** Default visual hierarchy variant for tech stack grids. */
export const DEFAULT_STACK_VARIANT: BadgeVariant = STACK_DEFAULT_VARIANT;

/** Default visual hierarchy variant for animated typing banners. */
export const DEFAULT_TYPING_VARIANT: BadgeVariant = TYPING_DEFAULT_VARIANT;

/** Default visual hierarchy variant keyed by canonical route prefix. */
const DEFAULT_VARIANT_BY_PREFIX: Readonly<Record<string, BadgeVariant>> = {
  badge: DEFAULT_BADGE_VARIANT,
  button: DEFAULT_BUTTON_VARIANT,
  quote: DEFAULT_QUOTE_VARIANT,
  stack: DEFAULT_STACK_VARIANT,
  typing: DEFAULT_TYPING_VARIANT,
};

/** Maximum length in code points kept for `?icon=` query values in normalized cache keys. */
const MAX_ICON_QUERY_LENGTH = 160;

/** Maximum length in code points kept for free-text/DSL query values in normalized cache keys. */
const MAX_TEXT_QUERY_LENGTH = 1024;

/** Recognized query parameters for badge routes, sorted. */
const BADGE_QUERY_PARAMS: readonly string[] = [
  'anim',
  'color',
  'dot',
  'icon',
  'label',
  'special',
  'variant',
];

/** Recognized query parameters for button routes, sorted. */
const BUTTON_QUERY_PARAMS: readonly string[] = ['anim', 'color', 'icon', 'size', 'variant'];

/** Recognized query parameters for standalone icon routes, sorted. */
const ICON_QUERY_PARAMS: readonly string[] = ['anim', 'color', 'size', 'stroke'];

/** Recognized query parameters for quote card routes, sorted. */
const QUOTE_QUERY_PARAMS: readonly string[] = [
  'anim',
  'author',
  'center',
  'color',
  'layout',
  'quote',
  'size',
  'text',
  'type',
  'variant',
  'width',
];

/** Recognized query parameters for tech stack routes, sorted. */
const STACK_QUERY_PARAMS: readonly string[] = [
  'anim',
  'color',
  'gap',
  'ggap',
  'groupgap',
  'groups',
  'i',
  'icons',
  'perline',
  'size',
  'variant',
];

/** Recognized query parameters for typing animation routes, sorted. */
const TYPING_QUERY_PARAMS: readonly string[] = [
  'align',
  'anim',
  'center',
  'color',
  'cursor',
  'delete',
  'duration',
  'erase',
  'font',
  'frame',
  'hint',
  'icon',
  'layout',
  'lines',
  'pause',
  'prefix',
  'prompt',
  'size',
  'text',
  'title',
  'type',
  'typo',
  'variant',
  'width',
];

// -------------------------------------- INTERNALS --------------------------------------

/** Return the first candidate containing non-whitespace characters, or `''` when all are blank. */
function pickNonBlank(
  first: string | null | undefined,
  second?: string | null,
  third?: string | null,
  fourth?: string | null
): string {
  if (first && first.trim().length > 0) {
    return first;
  }
  if (second && second.trim().length > 0) {
    return second;
  }
  if (third && third.trim().length > 0) {
    return third;
  }
  if (fourth && fourth.trim().length > 0) {
    return fourth;
  }
  return '';
}

/** Build a deferred static SVG route match. */
function buildStaticMatch(
  render: () => string,
  ttl: number = STATIC_TTL_SECONDS
): StaticSvgRouteMatch {
  return { kind: 'static', render, ttl };
}

/** Serialize a parsed `?perline=` list (`undefined` holes become `'0'`, and a lone default is omitted). */
function serializePerLineList(
  list: readonly (number | undefined)[] | undefined
): string | undefined {
  if (!list || (list.length === 1 && list[0] === STACK_PER_LINE_RANGE.default)) {
    return undefined;
  }
  let serialized = '';
  for (let i = 0; i < list.length; i += 1) {
    if (i > 0) {
      serialized += ',';
    }
    serialized += String(list[i] ?? 0);
  }
  return serialized;
}

/** Cap a non-empty free-text query parameter value for cache-key storage (`undefined` when unset). */
function capOptionalTextQuery(value: string | undefined): string | undefined {
  return value ? sliceAtCodePoint(value, MAX_TEXT_QUERY_LENGTH) : undefined;
}

/** Clamp an integer query parameter to `range`, omitting values equal to `range.default` (`undefined` when invalid). */
function clampNormalizedInt(rawValue: string, range: NumericRange): string | undefined {
  const parsed = parseOptionalNumber(rawValue);
  if (parsed === undefined) {
    return undefined;
  }
  const clamped = clampInt(parsed, range);
  return clamped === range.default ? undefined : String(clamped);
}

/** Canonicalize `?anim=` across stack and badge/quote/typing elements (`undefined` for `'default'`). */
function normalizeAnimParam(rawValue: string, canonicalPrefix: string): string | undefined {
  const mode =
    canonicalPrefix === 'stack'
      ? resolveStackAnimationMode(rawValue)
      : resolveAnimationMode(rawValue);
  return mode === 'default' ? undefined : mode;
}

/** Canonicalize `?cursor=` (`undefined` for `DEFAULT_TYPING_CURSOR`). */
function normalizeCursorParam(rawValue: string): string | undefined {
  const cursor = resolveTypingCursor(rawValue);
  return cursor === DEFAULT_TYPING_CURSOR ? undefined : cursor;
}

/** Canonicalize `?icon=` (lowercased, length-capped, and `<left>,<right>` slots normalized while preserving leading `,`). */
function normalizeIconParam(rawValue: string, canonicalPrefix: string): string | undefined {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return undefined;
  }
  const capped = sliceAtCodePoint(trimmed, MAX_ICON_QUERY_LENGTH).toLowerCase();
  if (canonicalPrefix === 'typing') {
    return capped === 'none' ? undefined : capped;
  }
  const commaIndex = capped.indexOf(',');
  if (commaIndex === -1) {
    return capped;
  }
  const left = capped.slice(0, commaIndex).trim();
  const right = capped.slice(commaIndex + 1).trim();
  if (right === '' || right === 'none') {
    return left || undefined;
  }
  return left ? `${left},${right}` : `,${right}`;
}

/** Canonicalize `?size=` across `icon`, `stack`, `button`, and `typing` routes (`quote` resolves in `resolveQuoteAliasOverrides`). */
function normalizeSizeParam(rawValue: string, canonicalPrefix: string): string | undefined {
  if (canonicalPrefix === 'icon') {
    return clampNormalizedInt(rawValue, ICON_SIZE_RANGE);
  }
  if (canonicalPrefix === 'stack') {
    return clampNormalizedInt(rawValue, STACK_TILE_SIZE_RANGE);
  }
  const resolved = resolveSizeToken(rawValue);
  if (resolved === undefined) {
    return undefined;
  }
  if (canonicalPrefix === 'button') {
    if (resolved === DEFAULT_BUTTON_SIZE) {
      return undefined;
    }
    return typeof resolved === 'string'
      ? resolved
      : String(clampInt(resolved, BUTTON_HEIGHT_RANGE));
  }
  const fontSize = resolveScaledFontSize(
    resolved,
    TYPING_SIZE_MAP,
    TYPING_FONT_SIZE_RANGE,
    DEFAULT_TYPING_SIZE
  );
  if (fontSize === TYPING_SIZE_MAP[DEFAULT_TYPING_SIZE]) {
    return undefined;
  }
  return typeof resolved === 'string' ? resolved : String(fontSize);
}

/** Canonicalize `?special=` (`undefined` when unrecognized). */
function normalizeSpecialParam(rawValue: string): string | undefined {
  return capOptionalTextQuery(canonicalizeSpecialParam(rawValue));
}

/** Canonicalize standalone icon `?stroke=`, clamping to `ICON_STROKE_RANGE` and omitting the default. */
function normalizeStrokeParam(rawValue: string): string | undefined {
  const parsed = parseOptionalNumber(rawValue);
  if (parsed === undefined) {
    return undefined;
  }
  const clamped = roundCoord(clampNumber(parsed, ICON_STROKE_RANGE));
  return clamped === ICON_STROKE_RANGE.default ? undefined : String(clamped);
}

/** Canonicalize `?typo=` (`'true'` when enabled, `undefined` otherwise). */
function normalizeTypoParam(rawValue: string): string | undefined {
  return isTruthyFlagParam(rawValue) ? 'true' : undefined;
}

/** Canonicalize `?variant=`, omitting unrecognized values and the route's default variant. */
function normalizeVariantParam(rawValue: string, canonicalPrefix: string): string | undefined {
  const trimmed = rawValue.trim();
  if (!isBadgeVariant(trimmed)) {
    return undefined;
  }
  return trimmed === getOwnValue(DEFAULT_VARIANT_BY_PREFIX, canonicalPrefix) ? undefined : trimmed;
}

/** Canonicalize typing `?width=`, clamping to `TYPING_WIDTH_RANGE` without omitting explicit widths (omitted width auto-fits). */
function normalizeTypingWidthParam(rawValue: string): string | undefined {
  const parsed = parseOptionalNumber(rawValue);
  return parsed === undefined ? undefined : String(clampInt(parsed, TYPING_WIDTH_RANGE));
}

/** Canonicalizers keyed by single-parameter query key (free-text keys fall back to `capOptionalTextQuery`). */
const PARAM_NORMALIZERS: Readonly<Record<string, QueryParamNormalizer>> = {
  anim: normalizeAnimParam,
  color: (rawValue) => resolveOptionalColor(rawValue),
  cursor: normalizeCursorParam,
  dot: (rawValue) => normalizeDotParam(rawValue),
  duration: (rawValue) => clampNormalizedInt(rawValue, TYPING_DURATION_RANGE),
  gap: (rawValue) => clampNormalizedInt(rawValue, STACK_GAP_RANGE),
  icon: normalizeIconParam,
  pause: (rawValue) => clampNormalizedInt(rawValue, TYPING_PAUSE_RANGE),
  perline: (rawValue) => serializePerLineList(parsePerLineList(rawValue)),
  size: normalizeSizeParam,
  special: normalizeSpecialParam,
  stroke: normalizeStrokeParam,
  typo: normalizeTypoParam,
  variant: normalizeVariantParam,
  width: normalizeTypingWidthParam,
};

/** Canonicalize a single non-aliased query parameter value (`undefined` drops invalid/default values). */
function normalizeSingleQueryParam(
  name: string,
  rawValue: string,
  canonicalPrefix: string
): string | undefined {
  const normalizer = getOwnValue(PARAM_NORMALIZERS, name);
  return normalizer ? normalizer(rawValue, canonicalPrefix) : capOptionalTextQuery(rawValue);
}

/** Resolve quote route query aliases (`quote`, `layout`/`type`/`center`, layout-aware `size`/`width`, and path-shadowed `author`/`text`). */
function resolveQuoteAliasOverrides(
  rawQuery: URLSearchParams,
  segments: readonly string[]
): Record<string, string | undefined> {
  const hasAuthorSegment = segments.length === 2;
  const pathText = hasAuthorSegment ? segments[1] : segments[0];
  const hasPathText = Boolean(pathText && pathText.trim().length > 0);
  const text = hasPathText
    ? undefined
    : pickNonBlank(rawQuery.get('text'), rawQuery.get('quote')) || undefined;
  const rawAuthor = hasAuthorSegment ? undefined : (rawQuery.get('author') ?? undefined);
  const layout = resolveQuoteLayout(
    rawQuery.get('layout'),
    rawQuery.get('type'),
    rawQuery.get('center')
  );
  const defaultSizePreset =
    layout === 'vertical' ? DEFAULT_VERTICAL_QUOTE_SIZE : DEFAULT_HORIZONTAL_QUOTE_SIZE;
  const defaultFontSize = QUOTE_SIZE_MAP[defaultSizePreset];
  const rawSize = resolveSizeToken(rawQuery.get('size'));
  const fontSize = resolveScaledFontSize(
    rawSize,
    QUOTE_SIZE_MAP,
    QUOTE_FONT_SIZE_RANGE,
    defaultSizePreset
  );
  let normalizedSize: string | undefined = undefined;
  if (rawSize !== undefined && fontSize !== defaultFontSize) {
    normalizedSize = typeof rawSize === 'string' ? rawSize : String(fontSize);
  }
  const defaultWidth = resolveDefaultQuoteWidth(layout, fontSize);
  const parsedWidth = parseOptionalNumber(rawQuery.get('width'));
  const clampedWidth =
    parsedWidth === undefined ? undefined : clampInt(parsedWidth, QUOTE_WIDTH_RANGE);
  return {
    author: capOptionalTextQuery(rawAuthor),
    center: undefined,
    layout: layout === DEFAULT_QUOTE_LAYOUT ? undefined : layout,
    quote: undefined,
    size: normalizedSize,
    text: capOptionalTextQuery(text),
    type: undefined,
    width:
      clampedWidth === undefined || clampedWidth === defaultWidth
        ? undefined
        : String(clampedWidth),
  };
}

/** Resolve stack route query aliases (`groups`/`icons`/`i` and `groupgap`/`ggap` against effective `gap`). */
function resolveStackAliasOverrides(
  rawQuery: URLSearchParams,
  segments: readonly string[]
): Record<string, string | undefined> {
  const hasPathGroups = Boolean(segments[0] && segments[0].trim().length > 0);
  const groups = hasPathGroups
    ? undefined
    : pickNonBlank(rawQuery.get('groups'), rawQuery.get('icons'), rawQuery.get('i')) || undefined;
  const effectiveGap = clampInt(parseOptionalNumber(rawQuery.get('gap')), STACK_GAP_RANGE);
  const defaultGroupGap = resolveDefaultStackGroupGap(effectiveGap);
  const parsedGroupGap = parseOptionalNumber(
    pickNonBlank(rawQuery.get('groupgap'), rawQuery.get('ggap'))
  );
  const clampedGroupGap =
    parsedGroupGap === undefined ? undefined : clampInt(parsedGroupGap, STACK_GROUP_GAP_RANGE);
  return {
    ggap: undefined,
    groupgap:
      clampedGroupGap === undefined || clampedGroupGap === defaultGroupGap
        ? undefined
        : String(clampedGroupGap),
    groups: capOptionalTextQuery(groups),
    i: undefined,
    icons: undefined,
  };
}

/** Normalize typing `?title=` given the resolved container `layout` (`undefined` when hidden or matching the layout default). */
function normalizeTypingTitle(
  rawTitle: string | null,
  layout: ReturnType<typeof resolveTypingLayout>
): string | undefined {
  if (rawTitle === null || layout === 'browser' || layout === 'prompt' || layout === 'none') {
    return undefined;
  }
  const trimmed = rawTitle.trim();
  if (!trimmed) {
    return undefined;
  }
  if (layout === 'window') {
    return trimmed.toLowerCase() === 'none' ? undefined : capOptionalTextQuery(rawTitle);
  }
  if (trimmed.toLowerCase() !== 'none') {
    const sanitized = prepareDisplayText(trimmed, MAX_TYPING_TITLE_LENGTH).trim();
    if (sanitized === DEFAULT_IDE_TITLE) {
      return undefined;
    }
  }
  return capOptionalTextQuery(rawTitle);
}

/** Normalize typing `?hint=` given the resolved container `layout` (`undefined` when hidden, blank, or `'none'`). */
function normalizeTypingHint(
  rawHint: string | null,
  layout: ReturnType<typeof resolveTypingLayout>
): string | undefined {
  const trimmedHint = rawHint?.trim();
  if (layout === 'none' || !trimmedHint || trimmedHint.toLowerCase() === 'none') {
    return undefined;
  }
  return capOptionalTextQuery(rawHint ?? undefined);
}

/** Normalize typing `?align=` given `layout`, effective `prefix`, and `icon` (`undefined` when hidden or matching the layout default). */
function normalizeTypingAlign(
  rawQuery: URLSearchParams,
  layout: ReturnType<typeof resolveTypingLayout>,
  effectivePrefix: string | undefined
): string | undefined {
  if (layout === 'browser' || layout === 'ide') {
    return undefined;
  }
  const align = resolveTypingAlign(rawQuery.get('align'), rawQuery.get('center'));
  const hasPrefix = Boolean(effectivePrefix && effectivePrefix.toLowerCase() !== 'none');
  const hasIcon = normalizeIconParam(rawQuery.get('icon') ?? '', 'typing') !== undefined;
  const defaultAlign = resolveDefaultTypingAlign(layout, hasPrefix, hasIcon);
  return align === defaultAlign ? undefined : align;
}

/**
 * Resolve typing route query aliases and layout-dependent defaults
 * (`lines`/`text`, `prefix`/`prompt`, `align`/`center`, `erase`/`delete`, `layout`/`frame`/`type`, `font`, `hint`, `title`).
 */
function resolveTypingAliasOverrides(
  rawQuery: URLSearchParams,
  segments: readonly string[]
): Record<string, string | undefined> {
  const hasPrefixSegment = segments.length === 2;
  const pathLines = hasPrefixSegment ? segments[1] : segments[0];
  const hasPathLines = Boolean(pathLines && pathLines.trim().length > 0);
  const lines = hasPathLines
    ? undefined
    : pickNonBlank(rawQuery.get('lines'), rawQuery.get('text')) || undefined;
  const prefix = hasPrefixSegment
    ? undefined
    : pickNonBlank(rawQuery.get('prefix'), rawQuery.get('prompt')) || undefined;
  const layout = resolveTypingLayout(
    rawQuery.get('layout'),
    rawQuery.get('frame'),
    rawQuery.get('type')
  );
  const erase = resolveTypingEraseMode(rawQuery.get('erase'), rawQuery.get('delete'));
  const font = resolveTypingFont(rawQuery.get('font'));
  const effectivePrefix = (hasPrefixSegment ? segments[0] : prefix)?.trim();
  return {
    align: normalizeTypingAlign(rawQuery, layout, effectivePrefix),
    center: undefined,
    delete: undefined,
    erase: erase === DEFAULT_TYPING_ERASE ? undefined : erase,
    font: font === DEFAULT_LAYOUT_FONTS[layout] ? undefined : font,
    frame: undefined,
    hint: normalizeTypingHint(rawQuery.get('hint'), layout),
    layout: layout === DEFAULT_TYPING_LAYOUT ? undefined : layout,
    lines: capOptionalTextQuery(lines),
    prefix: capOptionalTextQuery(prefix),
    prompt: undefined,
    text: undefined,
    title: normalizeTypingTitle(rawQuery.get('title'), layout),
    type: undefined,
  };
}

/** Resolve multi-parameter query alias groups onto their canonical query keys (`undefined` omits the key). */
function resolveQueryAliasOverrides(
  rawQuery: URLSearchParams,
  canonicalPrefix: string,
  segments: readonly string[]
): Record<string, string | undefined> | undefined {
  if (canonicalPrefix === 'quote') {
    return resolveQuoteAliasOverrides(rawQuery, segments);
  }
  if (canonicalPrefix === 'stack') {
    return resolveStackAliasOverrides(rawQuery, segments);
  }
  if (canonicalPrefix === 'typing') {
    return resolveTypingAliasOverrides(rawQuery, segments);
  }
  return undefined;
}

/** Build a normalized query containing only canonicalized recognized parameters in sorted order. */
function pickQueryParams(
  query: URLSearchParams,
  route: SvgRouteDefinition,
  segments: readonly string[]
): URLSearchParams {
  const picked = new URLSearchParams();
  if (query.size === 0) {
    return picked;
  }
  const canonicalPrefix = route.aliasOf ?? route.prefix;
  const aliasOverrides = resolveQueryAliasOverrides(query, canonicalPrefix, segments);
  for (const name of route.queryParams) {
    if (aliasOverrides && Object.hasOwn(aliasOverrides, name)) {
      const override = aliasOverrides[name];
      if (override !== undefined) {
        picked.append(name, override);
      }
    } else {
      const rawValue = query.get(name);
      if (rawValue !== null) {
        const normalized = normalizeSingleQueryParam(name, rawValue, canonicalPrefix);
        if (normalized !== undefined) {
          picked.append(name, normalized);
        }
      }
    }
  }
  return picked;
}

/** Apply canonical badge query overrides and render. */
function renderBadgeFromQuery(
  query: URLSearchParams,
  defaults: RouteBadgeDefaults,
  hasLabelOverride: boolean
): string {
  const labelParam = hasLabelOverride ? query.get('label') : undefined;
  return renderBadge({
    anim: resolveAnimationMode(query.get('anim')),
    color: resolveColor(query.get('color'), defaults.color),
    dot: resolveDotState(query.get('dot'), defaults.dot),
    icon: resolveIconQueryParam(query.get('icon'), defaults.icon),
    label: labelParam ?? defaults.label,
    special: resolveSpecialParam(query.get('special'), defaults.special, defaults.specials),
    value: defaults.value,
    variant: resolveVariant(query.get('variant'), defaults.variant),
  });
}

/** Render a service preset badge from a resolved metric result, applying canonical query overrides (incl. `?label=`). */
function renderServiceBadge(result: MetricResult, query: URLSearchParams): string {
  return renderBadgeFromQuery(
    query,
    {
      color: result.color,
      dot: result.dot,
      icon: result.icon,
      label: result.label,
      special: result.special,
      specials: result.specials,
      value: result.value,
      variant: DEFAULT_BADGE_VARIANT,
    },
    true
  );
}

/** Dispatch `/badge/*` segments onto static or service preset badges. */
function resolveBadgeRoute(
  segments: readonly string[],
  query: URLSearchParams
): SvgRouteMatch | undefined {
  const [first = '', second, third, fourth] = segments;
  const firstLower = first.toLowerCase();

  if (segments.length <= 2) {
    return buildStaticMatch(() =>
      renderBadgeFromQuery(
        query,
        { label: first, value: second, variant: DEFAULT_BADGE_VARIANT },
        false
      )
    );
  }

  const service = getOwnValue(SERVICES_CONFIG, firstLower);
  if (!service) {
    return undefined;
  }
  function render(result: MetricResult): string {
    return renderServiceBadge(result, query);
  }
  if ((service.route.target.maxSegments ?? 1) > 1) {
    // Multi-segment targets (e.g., Go module paths); every middle segment belongs to the target,
    // except a leading required owner segment when at least 4 segments are present:
    const hasOwnerSegment = service.route.owner?.isRequired === true && segments.length >= 4;
    return {
      kind: 'service',
      render,
      request: {
        metric: resolveMetricKey(service, (segments.at(-1) ?? '').toLowerCase()),
        ...(hasOwnerSegment && second !== undefined ? { owner: second } : {}),
        service: firstLower,
        target: segments.slice(hasOwnerSegment ? 2 : 1, -1).join('/'),
      },
    };
  }
  if (segments.length === 3) {
    return {
      kind: 'service',
      render,
      request: {
        metric: resolveMetricKey(service, (third ?? '').toLowerCase()),
        service: firstLower,
        target: second ?? '',
      },
    };
  }
  if (segments.length === 4) {
    return {
      kind: 'service',
      render,
      request: {
        metric: resolveMetricKey(service, (fourth ?? '').toLowerCase()),
        owner: second,
        service: firstLower,
        target: third ?? '',
      },
    };
  }

  return undefined;
}

/** Resolve a CTA button route. */
function resolveButtonRoute(segments: readonly string[], query: URLSearchParams): SvgRouteMatch {
  const [label = '', value] = segments;
  return buildStaticMatch(() =>
    renderButton({
      anim: resolveAnimationMode(query.get('anim')),
      color: resolveColor(query.get('color')),
      icon: resolveIconQueryParam(query.get('icon')),
      label,
      size: resolveSizeToken(query.get('size')),
      value,
      variant: resolveVariant(query.get('variant'), DEFAULT_BUTTON_VARIANT),
    })
  );
}

/** Resolve a standalone icon route (exactly one segment). */
function resolveIconRoute(
  segments: readonly string[],
  query: URLSearchParams
): SvgRouteMatch | undefined {
  const [icon] = segments;
  if (icon === undefined) {
    return undefined;
  }
  return buildStaticMatch(() =>
    renderIcon({
      anim: resolveAnimationMode(query.get('anim')),
      color: resolveColor(query.get('color')),
      icon,
      size: parseOptionalNumber(query.get('size')),
      strokeWidth: parseOptionalNumber(query.get('stroke')),
    })
  );
}

/** Resolve a tech stack grid route. */
function resolveStackRoute(segments: readonly string[], query: URLSearchParams): SvgRouteMatch {
  return buildStaticMatch(() => {
    // Blank aliases (`/stack/?icons=react`, `?groupgap=%20&ggap=12`) fall through to later fallbacks:
    const rawGroups = pickNonBlank(
      segments[0],
      query.get('groups'),
      query.get('icons'),
      query.get('i')
    );
    const perLineList = parsePerLineList(query.get('perline'));
    const rawGroupGap = pickNonBlank(query.get('groupgap'), query.get('ggap'));
    return renderStack({
      anim: resolveStackAnimationMode(query.get('anim')),
      // Invalid colors keep the per-icon brand palettes instead of forcing the default fallback:
      color: resolveOptionalColor(query.get('color')),
      gap: parseOptionalNumber(query.get('gap')),
      groupGap: parseOptionalNumber(rawGroupGap),
      groups: parseStackGroups(rawGroups, perLineList),
      perLine: perLineList?.[0],
      size: parseOptionalNumber(query.get('size')),
      variant: resolveVariant(query.get('variant'), DEFAULT_STACK_VARIANT),
    });
  });
}

/** Resolve a quote card route. */
function resolveQuoteRoute(segments: readonly string[], query: URLSearchParams): SvgRouteMatch {
  const hasAuthorSegment = segments.length === 2;
  const pathText = hasAuthorSegment ? segments[1] : segments[0];
  return buildStaticMatch(() =>
    renderQuote({
      anim: resolveAnimationMode(query.get('anim')),
      author: (hasAuthorSegment ? segments[0] : query.get('author')) ?? undefined,
      color: resolveColor(query.get('color')),
      layout: resolveQuoteLayout(query.get('layout'), query.get('type'), query.get('center')),
      size: resolveSizeToken(query.get('size')),
      text: pickNonBlank(pathText, query.get('text'), query.get('quote')),
      variant: resolveVariant(query.get('variant'), DEFAULT_QUOTE_VARIANT),
      width: parseOptionalNumber(query.get('width')),
    })
  );
}

/** Resolve a typing animation route. */
function resolveTypingRoute(segments: readonly string[], query: URLSearchParams): SvgRouteMatch {
  const hasPrefixSegment = segments.length === 2;
  const pathLines = hasPrefixSegment ? segments[1] : segments[0];
  const queryPrefix = pickNonBlank(query.get('prefix'), query.get('prompt')) || undefined;
  return buildStaticMatch(() =>
    renderTyping({
      align: resolveTypingAlign(query.get('align'), query.get('center')),
      anim: resolveAnimationMode(query.get('anim')),
      color: resolveColor(query.get('color')),
      cursor: resolveTypingCursor(query.get('cursor')),
      duration: parseOptionalNumber(query.get('duration')),
      erase: resolveTypingEraseMode(query.get('erase'), query.get('delete')),
      font: resolveTypingFont(query.get('font')),
      hasTypo: isTruthyFlagParam(query.get('typo')),
      hint: query.get('hint') ?? undefined,
      icon: resolveIconQueryParam(query.get('icon')),
      layout: resolveTypingLayout(query.get('layout'), query.get('frame'), query.get('type')),
      lines: pickNonBlank(pathLines, query.get('lines'), query.get('text')),
      pause: parseOptionalNumber(query.get('pause')),
      prefix: (hasPrefixSegment ? segments[0] : queryPrefix) ?? undefined,
      size: resolveSizeToken(query.get('size')),
      title: query.get('title') ?? undefined,
      variant: resolveVariant(query.get('variant'), DEFAULT_TYPING_VARIANT),
      width: parseOptionalNumber(query.get('width')),
    })
  );
}

/** Strip static-only redundant query defaults (`label`, `dot=none`, payload-less `special`, default `color`, and `icon`). */
function pruneStaticRouteDefaults(query: URLSearchParams, canonicalPrefix: string): void {
  if (canonicalPrefix === 'badge') {
    query.delete('label');
    if (query.get('dot') === 'none') {
      query.delete('dot');
    }
    if (!parseSpecialParam(query.get('special'))) {
      query.delete('special');
    }
  }
  if (canonicalPrefix !== 'stack' && query.get('color') === DEFAULT_THEME_COLOR) {
    query.delete('color');
  }
  const normalizedIcon = query.get('icon');
  if (normalizedIcon === 'none') {
    query.delete('icon');
  } else if (
    normalizedIcon?.startsWith(',') &&
    (canonicalPrefix === 'badge' || canonicalPrefix === 'button')
  ) {
    query.set('icon', `none${normalizedIcon}`);
  }
}

/** Normalize the request pathname (trimming trailing `/`, folding route prefix aliases, and canonicalizing service/metric segments). */
function canonicalizeRequestPathname(
  urlPathname: string,
  route: SvgRouteDefinition,
  match: SvgRouteMatch
): string {
  const rawPathname =
    urlPathname.length > 1 && urlPathname.endsWith('/') ? urlPathname.slice(0, -1) : urlPathname;
  const pathname = route.aliasOf
    ? `/${route.aliasOf}${rawPathname.slice(route.prefix.length + 1)}`
    : rawPathname;
  if (match.kind !== 'service') {
    return pathname;
  }
  const rawParts = pathname.split('/');
  rawParts[2] = match.request.service;
  const service = getOwnValue(SERVICES_CONFIG, match.request.service);
  if (service && Object.hasOwn(service.metrics, match.request.metric)) {
    rawParts[rawParts.length - 1] = match.request.metric;
  }
  return rawParts.join('/');
}

// -------------------------------------- PUBLIC API -------------------------------------

/** SVG route table sorted by prefix: The single source of the Hono registrations, the dispatcher, and the edge cache keys. */
export const SVG_ROUTES: readonly SvgRouteDefinition[] = [
  {
    builderKind: 'badge',
    prefix: 'badge',
    queryParams: BADGE_QUERY_PARAMS,
    resolve: resolveBadgeRoute,
  },
  {
    aliasOf: 'button',
    builderKind: 'button',
    maxSegments: 2,
    prefix: 'btn',
    queryParams: BUTTON_QUERY_PARAMS,
    resolve: resolveButtonRoute,
  },
  {
    builderKind: 'button',
    maxSegments: 2,
    prefix: 'button',
    queryParams: BUTTON_QUERY_PARAMS,
    resolve: resolveButtonRoute,
  },
  {
    builderKind: 'icon',
    maxSegments: 1,
    prefix: 'icon',
    queryParams: ICON_QUERY_PARAMS,
    resolve: resolveIconRoute,
  },
  {
    builderKind: 'quote',
    maxSegments: 2,
    prefix: 'quote',
    queryParams: QUOTE_QUERY_PARAMS,
    resolve: resolveQuoteRoute,
  },
  {
    builderKind: 'stack',
    maxSegments: 1,
    prefix: 'stack',
    queryParams: STACK_QUERY_PARAMS,
    resolve: resolveStackRoute,
  },
  {
    aliasOf: 'typing',
    builderKind: 'typing',
    maxSegments: 2,
    prefix: 'type',
    queryParams: TYPING_QUERY_PARAMS,
    resolve: resolveTypingRoute,
  },
  {
    builderKind: 'typing',
    maxSegments: 2,
    prefix: 'typing',
    queryParams: TYPING_QUERY_PARAMS,
    resolve: resolveTypingRoute,
  },
];

/**
 * Find the SVG route table entry for a raw route prefix (the first path segment).
 * @param prefix   Raw first path segment (e.g., `'badge'`).
 * @returns Matching route definition, or `undefined` when the prefix is no SVG route.
 */
export function findSvgRoute(prefix: string): SvgRouteDefinition | undefined {
  for (const route of SVG_ROUTES) {
    if (route.prefix === prefix) {
      return route;
    }
  }
  return undefined;
}

/**
 * Resolve a request URL onto an SVG route together with its normalized edge cache key.
 * Only the route's recognized query parameters reach the renderers, and alias prefixes normalize to
 * their canonical route prefix, so the cache key always determines the rendered SVG.
 * @param url   Request URL (raw percent-encoded pathname and query string).
 * @returns Route match and cache key, or `undefined` when no SVG route matches.
 */
export function resolveSvgRequest(url: URL): ResolvedSvgRequest | undefined {
  const pathParts = url.pathname.split('/');
  const route = findSvgRoute(pathParts[1] ?? '');
  if (!route) {
    return undefined;
  }
  const segments = decodeRouteSegments(pathParts);
  if (route.maxSegments !== undefined && segments.length > route.maxSegments) {
    return undefined;
  }
  const query = pickQueryParams(url.searchParams, route, segments);
  const match = route.resolve(segments, query);
  if (!match) {
    return undefined;
  }
  const canonicalPrefix = route.aliasOf ?? route.prefix;
  // Static SVG routes have no upstream preset overrides, so strip redundant static defaults:
  if (match.kind === 'static') {
    pruneStaticRouteDefaults(query, canonicalPrefix);
  }
  const pathname = canonicalizeRequestPathname(url.pathname, route, match);
  const queryString = query.toString();
  const canonicalPathAndQuery = `${pathname}${queryString ? `?${queryString}` : ''}`;
  return {
    cacheKey: `${url.origin}${canonicalPathAndQuery}`,
    ...(route.aliasOf ? { canonicalPath: canonicalPathAndQuery } : {}),
    match,
  };
}

/**
 * Resolve a request URL onto an SVG route.
 * @param url   Request URL (raw percent-encoded pathname and query string).
 * @returns Static SVG or service preset match, or `undefined` when no SVG route matches.
 */
export function resolveSvgRoute(url: URL): SvgRouteMatch | undefined {
  return resolveSvgRequest(url)?.match;
}

/**
 * Render the generic error badge served when a request fails unexpectedly (`app.onError`).
 * @returns Complete badge SVG markup.
 */
export function renderInternalErrorBadge(): string {
  return renderBadge({
    color: 'red',
    icon: 'triangle-alert',
    label: 'error',
    value: 'internal error',
    variant: '1',
  });
}

/**
 * Render the SVG for a documented path exactly as the live Worker would (service presets use `sample`).
 * @param path     Root-relative path and query string (e.g., `'/badge/build/passing?icon=circle-check'`).
 * @param sample   Sample value or upstream payload for service preset badges (no network access).
 * @returns Complete SVG markup.
 * @throws {Error} When `path` does not match any SVG route (guards the docs against broken snippets).
 */
export function renderSvgPath(path: string, sample: ServicePreviewSample = 'n/a'): string {
  const url = new URL(path, SITE_ORIGIN);
  const match = resolveSvgRoute(url);
  if (!match) {
    throw new Error(`No SVG route matches the documented path: ${path}`);
  }
  if (match.kind === 'static') {
    return match.render();
  }
  return match.render(resolveServicePreview(match.request, sample));
}

/**
 * Resolve the click-through destination of a documented service preset path (its upstream page).
 * @param path   Root-relative path and query string.
 * @returns Upstream redirect URL for service preset paths, or `undefined` for static SVG routes.
 */
export function resolveSvgPathRedirectUrl(path: string): string | undefined {
  const match = resolveSvgRoute(new URL(path, SITE_ORIGIN));
  return match?.kind === 'service' ? resolveServiceRedirectUrl(match.request) : undefined;
}
