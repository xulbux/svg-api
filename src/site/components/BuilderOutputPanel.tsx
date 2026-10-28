/**
 * Builder output panel component – Sticky right-hand live preview, snippet format tabs, syntax-highlighted code output, alt/link inputs, and action buttons (`<BuilderOutputPanel />`).
 */

import { CopyButton, UiIcon } from '@/site/components/UiIcon';
import type { HtmlFragment } from '@/site/jsx';

// ---------------------------------------- TYPES ----------------------------------------

/** Snippet output format tab. */
interface SnippetFormat {
  /** Format identifier (`data-format`). */
  readonly id: string;
  /** Visible tab label. */
  readonly label: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Snippet output formats in tab order. */
const SNIPPET_FORMATS: readonly SnippetFormat[] = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'html', label: 'HTML' },
  { id: 'url', label: 'URL' },
];

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render the preview, snippet, and action panel as a JSX component.
 * @returns Rendered `<aside class="builder-panel">` JSX fragment.
 */
export function BuilderOutputPanel(): HtmlFragment {
  const tabs: HtmlFragment[] = [];
  for (const [i, format] of SNIPPET_FORMATS.entries()) {
    const isSelected = i === 0;
    tabs.push(
      <button
        type="button"
        class={isSelected ? 'builder-tab is-active' : 'builder-tab'}
        role="tab"
        id={`builder-tab-${format.id}`}
        data-format={format.id}
        aria-selected={isSelected}
        aria-controls="builder-code"
        tabindex={isSelected ? 0 : -1}>
        {format.label}
      </button>
    );
  }
  return (
    <aside class="builder-panel" aria-label="Preview and snippets">
      <div class="builder-preview-dock">
        <div class="builder-preview-card">
          <div class="preview-stage builder-stage is-centered">
            <img
              class="builder-preview"
              id="builder-preview"
              alt="Live preview"
              decoding="async"
              hidden={true}
            />
            <p
              class="builder-loading"
              id="builder-loading"
              role="status"
              aria-live="polite"
              hidden={true}>
              <span class="builder-spinner" aria-hidden="true"></span>
              Loading preview…
            </p>
            <p class="builder-placeholder" id="builder-placeholder">
              Fill in the required fields to see a preview.
            </p>
          </div>
          <p class="builder-status" id="builder-status" role="status" aria-live="polite"></p>
        </div>
      </div>
      <div class="builder-output">
        <div class="builder-tabs" role="tablist" aria-label="Snippet format">
          {tabs}
        </div>
        <div class="code-drawer-body builder-code-body">
          <CopyButton id="builder-copy" copyTarget="builder-code" />
          <pre
            class="code-pre builder-code"
            id="builder-code"
            tabindex="0"
            role="tabpanel"
            aria-labelledby="builder-tab-markdown">
            <code></code>
          </pre>
        </div>
        <div class="builder-snippet-options">
          <div class="builder-subfield is-grow">
            <label class="builder-sublabel" for="builder-alt">
              Alt text
            </label>
            <input class="builder-input" id="builder-alt" type="text" spellcheck={false} />
          </div>
          <div class="builder-subfield is-grow">
            <label class="builder-sublabel" for="builder-link">
              Link target
            </label>
            <input
              class="builder-input"
              id="builder-link"
              type="url"
              placeholder="https://…"
              spellcheck={false}
            />
          </div>
        </div>
        <div class="builder-actions">
          <a
            class="btn-secondary btn-small"
            id="builder-open"
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled="true"
            tabindex="-1">
            <UiIcon slug="external-link" size={14} />
            Open SVG
          </a>
          <button
            type="button"
            class="btn-secondary btn-small"
            id="builder-share"
            data-copied-label="Link copied">
            <UiIcon slug="link" size={14} />
            <span id="builder-share-label" data-copy-label={true} aria-live="polite">
              Copy builder link
            </span>
          </button>
          <button type="button" class="btn-secondary btn-small" id="builder-reset">
            <UiIcon slug="eraser" size={14} />
            Clear
          </button>
        </div>
      </div>
    </aside>
  );
}
