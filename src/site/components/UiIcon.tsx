/**
 * UI icon & inline primitive components – Inline UI icons, per-page SVG sprite, copy buttons, permalink anchors, and inline markup helpers.
 */

import { raw, renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';
import { resolveIcon } from '@/svg/icons';
import { escapeXml } from '@/svg/shared';

// ---------------------------------------- TYPES ----------------------------------------

/** Props for the inline `<UiIcon />` component. */
export interface UiIconProps {
  /** Optional additional CSS class name(s) appended to `ui-icon`. */
  readonly extraClass?: string | undefined;
  /** Width and height in pixels (defaults to `16`). */
  readonly size?: number | undefined;
  /** Icon slug (e.g., `'sparkles'`, `'copy'`, `'check'`, `'chevron-right'`, `'github'`). */
  readonly slug: string;
}

/** Props for the `<CopyButton />` component. */
export interface CopyButtonProps {
  /** Optional ID of the heading or element that describes what this button copies. */
  readonly ariaDescribedBy?: string | undefined;
  /** Optional ID of the target element whose text content is copied (`data-copy-target`). */
  readonly copyTarget?: string | undefined;
  /** Optional DOM `id` attribute for the button. */
  readonly id?: string | undefined;
}

/** Props for the `<AnchorLink />` permalink component. */
export interface AnchorLinkProps {
  /** Accessible human-readable heading or card label. */
  readonly label: string;
  /** Target anchor element ID (without `#`). */
  readonly targetId: string;
}

/** Props for the `<InlineMarkup />` component (`code` and `strong` micro-syntax). */
export interface InlineMarkupProps {
  /** Text with optional `` `code` `` and `**strong**` spans. */
  readonly text: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** SVG paint attributes of Lucide stroke icons (UI icons and the builder's icon picker glyphs). */
export const LUCIDE_STROKE_ATTRS =
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

/** SVG paint attributes of filled brand icons (UI icons and the builder's icon picker glyphs). */
export const BRAND_FILL_ATTRS = 'fill="currentColor"';

/** Shared SVG root attributes of every inline UI icon. */
const UI_ICON_SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"';

/** UI icons repeated on most pages: Emitted once per page as `<symbol>` elements and referenced with `<use>`. */
const UI_SPRITE_ICON_SLUGS: ReadonlySet<string> = new Set([
  'check',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'copy',
  'layout-grid',
  'sparkles',
  'x',
]);

/** Memoized inline UI icon HTML keyed by `slug|size|extraClass`. */
const UI_ICON_HTML_CACHE = new Map<string, string>();

/** Memoized UI icon sprite (`undefined` until first rendered). */
let uiSpriteHtmlCache: string | undefined = undefined;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches runs of characters that are not allowed in generated anchor IDs. */
const SLUG_INVALID_RX = /[^a-z0-9]+/g;

/** Matches a single leading or trailing dash left over after slug normalization. */
const SLUG_EDGE_DASH_RX = /^-|-$/g;

/** Matches inline `` `code` `` markup in section titles, descriptions, and subheads. */
const INLINE_CODE_RX = /`(?<code>[^`]+)`/g;

/** Matches inline `**strong**` markup in section titles and descriptions. */
const INLINE_STRONG_RX = /\*\*(?<strong>[^*]+)\*\*/g;

/** Matches inline markup characters (backticks and double asterisks) for plain-text labels. */
const INLINE_MARKUP_CHARS_RX = /`|\*\*/g;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Convert free text into a URL-fragment-safe anchor ID (e.g., `'variant=1 · Primary'` -> `'variant-1-primary'`).
 * @param text   Raw heading or card title text.
 * @returns Lowercase hyphen-separated anchor ID.
 */
export function slugifyText(text: string): string {
  return text.toLowerCase().replace(SLUG_INVALID_RX, '-').replace(SLUG_EDGE_DASH_RX, '');
}

/**
 * Escape text and convert inline `` `code` `` and `**strong**` markup into HTML.
 * @param text   Text with optional inline backtick or double-asterisk markup.
 * @returns Escaped HTML string.
 */
export function formatInlineMarkupHtml(text: string): string {
  return escapeXml(text)
    .replace(INLINE_CODE_RX, '<code>$<code></code>')
    .replace(INLINE_STRONG_RX, '<strong>$<strong></strong>');
}

/**
 * Strip inline markup characters for plain-text labels and anchor IDs.
 * @param text   Text with optional inline backtick or double-asterisk markup.
 * @returns Plain text without backticks or double asterisks.
 */
export function stripInlineMarkup(text: string): string {
  return text.replace(INLINE_MARKUP_CHARS_RX, '');
}

/**
 * Serialize a value as JSON for an inline `<script>` element (configs and builder schemas).
 * @param value   JSON-serializable value.
 * @returns JSON text with every `<` escaped as `\u003c`, so the payload can never close its `<script>` element.
 */
export function serializeInlineJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', String.raw`\u003c`);
}

/**
 * Render inline `` `code` `` and `**strong**` markup as a pre-escaped JSX fragment.
 * @param props   Inline markup props (`text`).
 * @returns Rendered HTML fragment.
 */
export function InlineMarkup(props: InlineMarkupProps): HtmlFragment {
  return raw(formatInlineMarkupHtml(props.text));
}

/**
 * Render a hover/focus `#` permalink to an in-page anchor.
 * @param props   Anchor link props (`targetId` and `label`).
 * @returns Rendered `<a>` JSX fragment.
 */
export function AnchorLink(props: AnchorLinkProps): HtmlFragment {
  return (
    <a
      class="anchor-link"
      href={`#${props.targetId}`}
      aria-label={`Link to “${props.label}”`}
      tabindex="0">
      #
    </a>
  );
}

/**
 * Render (once per isolate) the hidden UI icon sprite: One `<symbol id="ui-<slug>">` per repeated UI icon,
 * referenced by `renderUiIcon` with `<use href>`; Every page layout emits it once.
 * @returns Hidden inline `<svg>` sprite HTML.
 */
export function renderUiSprite(): string {
  if (uiSpriteHtmlCache === undefined) {
    const symbols: HtmlFragment[] = [];
    for (const slug of UI_SPRITE_ICON_SLUGS) {
      symbols.push(
        <symbol id={`ui-${slug}`} viewBox="0 0 24 24">
          {raw(resolveIcon(slug)?.innerSvg ?? '')}
        </symbol>
      );
    }
    uiSpriteHtmlCache = renderHtml(
      <svg
        class="ui-sprite"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false">
        {symbols}
      </svg>
    );
  }
  return uiSpriteHtmlCache;
}

/**
 * Render the hidden UI icon sprite as a JSX component.
 * @returns Hidden inline `<svg>` sprite fragment.
 */
export function UiSprite(): HtmlFragment {
  return raw(renderUiSprite());
}

/**
 * Render an inline UI icon (`<svg class="ui-icon">`) from the bundled icon registry;
 * Repeated icons (`UI_SPRITE_ICON_SLUGS`) reference the page's UI sprite instead of repeating their paths.
 * @param slug         Icon slug (e.g., `'sparkles'`, `'copy'`, `'check'`, `'chevron-right'`, `'github'`).
 * @param size         Width and height in pixels (defaults to `16`).
 * @param extraClass   Optional additional CSS class name(s) appended to `ui-icon`.
 * @returns Inline `<svg>` HTML string, or empty string if the slug is not found.
 */
export function renderUiIcon(slug: string, size = 16, extraClass = ''): string {
  const cacheKey = `${slug}|${size}|${extraClass}`;
  const cached = UI_ICON_HTML_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const resolved = resolveIcon(slug);
  const classAttr = extraClass ? `ui-icon ${extraClass}` : 'ui-icon';
  const paintAttrs = resolved?.type === 'lucide' ? LUCIDE_STROKE_ATTRS : BRAND_FILL_ATTRS;
  const bodyFragment = UI_SPRITE_ICON_SLUGS.has(slug) ? (
    <use href={`#ui-${slug}`}></use>
  ) : (
    raw(resolved?.innerSvg ?? '')
  );
  const iconHtml = resolved
    ? renderHtml(
        <svg
          class={classAttr}
          rawAttrs={UI_ICON_SVG_ATTRS}
          width={size}
          height={size}
          rawAttrs2={paintAttrs}>
          {bodyFragment}
        </svg>
      )
    : '';
  UI_ICON_HTML_CACHE.set(cacheKey, iconHtml);
  return iconHtml;
}

/**
 * Render an inline UI icon as a JSX component.
 * @param props   UI icon props (`slug`, optional `size` and `extraClass`).
 * @returns Inline `<svg>` fragment.
 */
export function UiIcon(props: UiIconProps): HtmlFragment {
  return raw(renderUiIcon(props.slug, props.size ?? 16, props.extraClass ?? ''));
}

/**
 * Render an icon-only copy button as a JSX component.
 * @param props   Copy button props (`id`, `ariaDescribedBy`, and `copyTarget`).
 * @returns Copy `<button>` fragment.
 */
export function CopyButton(props: CopyButtonProps): HtmlFragment {
  return (
    <button
      type="button"
      class="copy-btn"
      id={props.id}
      aria-describedby={props.ariaDescribedBy}
      data-copy-target={props.copyTarget}>
      <UiIcon slug="copy" size={15} extraClass="icon-copy" />
      <UiIcon slug="check" size={15} extraClass="icon-check" />
      <span class="visually-hidden" data-copy-label={true} aria-live="polite">
        Copy
      </span>
    </button>
  );
}
