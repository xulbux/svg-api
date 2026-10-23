/**
 * Icon picker popover component – Shared searchable icon picker dialog (`<IconPickerPopover />`) with icon set tabs, virtualized grid, and glyph templates.
 */

import { getSiteAssetUrl } from '@/site/assets';
import { BRAND_FILL_ATTRS, LUCIDE_STROKE_ATTRS, UiIcon } from '@/site/components/UiIcon';
import { raw, renderHtml } from '@/site/jsx';
import type { HtmlFragment } from '@/site/jsx';
import type { IconPickerSetId } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Icon set tab of the icon picker. */
interface IconPickerTab {
  /** Icon set identifier. */
  readonly id: IconPickerSetId;
  /** Visible tab label. */
  readonly label: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Icon set tabs of the icon picker in display order (the first one is selected initially). */
const ICON_PICKER_TABS: readonly IconPickerTab[] = [
  { id: 'lucide', label: 'Lucide' },
  { id: 'brands', label: 'Brands' },
];

/** SVG paint attributes of icon picker glyphs per set (cloned from `<template>` elements by the builder script). */
const GLYPH_PAINT_ATTRS: Readonly<Record<IconPickerSetId, string>> = {
  brands: BRAND_FILL_ATTRS,
  lucide: LUCIDE_STROKE_ATTRS,
};

/** Memoized icon picker popover HTML (`undefined` until first rendered). */
let iconPickerHtmlCache: string | undefined = undefined;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render (once per isolate) the shared icon picker dialog popover (tabs, search, the lazily filled grid, and glyph templates).
 * @returns Icon picker popover HTML string.
 */
export function renderIconPickerHtml(): string {
  if (iconPickerHtmlCache === undefined) {
    const tabs: HtmlFragment[] = [];
    for (const [i, tab] of ICON_PICKER_TABS.entries()) {
      tabs.push(
        <label class="icon-picker-tab">
          <input type="radio" name="icon-picker-set" value={tab.id} checked={i === 0} />
          <span data-picker-tab-label={tab.id} data-label={tab.label}>
            {tab.label}
          </span>
        </label>
      );
    }
    const glyphTemplates: HtmlFragment[] = [];
    for (const [set, paintAttrs] of Object.entries(GLYPH_PAINT_ATTRS)) {
      glyphTemplates.push(
        <svg data-set={set} viewBox="0 0 24 24" aria-hidden="true" rawAttrs={paintAttrs}></svg>
      );
    }
    iconPickerHtmlCache = renderHtml(
      <div
        class="popover-panel icon-picker"
        id="icon-picker"
        popover={true}
        role="dialog"
        data-index-url={getSiteAssetUrl('icons.json')}
        aria-label="Icon picker">
        <div class="icon-picker-head">
          <div class="icon-picker-search">
            <UiIcon slug="search" size={15} />
            <input
              class="icon-picker-input"
              id="icon-picker-search"
              type="search"
              placeholder="Search icons…"
              aria-label="Search icons"
              spellcheck={false}
              autocomplete="off"
            />
          </div>
          <div class="icon-picker-row">
            <div class="icon-picker-tabs" role="radiogroup" aria-label="Icon set">
              {tabs}
            </div>
            <button type="button" class="icon-picker-none" id="icon-picker-none" hidden={true}>
              No icon
            </button>
          </div>
        </div>
        <div
          class="icon-picker-grid"
          id="icon-picker-grid"
          role="listbox"
          aria-label="Icons"
          tabindex="-1"></div>
        <div class="icon-picker-empty" id="icon-picker-empty" hidden={true}></div>
        <p class="icon-picker-foot" id="icon-picker-status" aria-live="polite">
          Loading icons…
        </p>
        <template id="icon-glyph-templates">{glyphTemplates}</template>
      </div>
    );
  }
  return iconPickerHtmlCache;
}

/**
 * Render the shared icon picker dialog popover as a JSX component.
 * @returns Rendered `<div id="icon-picker">` JSX fragment.
 */
export function IconPickerPopover(): HtmlFragment {
  return raw(renderIconPickerHtml());
}
