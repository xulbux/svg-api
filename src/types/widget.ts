/**
 * Widget types – Tech stack grid, quote card, and typing animation rendering options (`svg.xul.is/stack/*`, `svg.xul.is/quote/*`, and `svg.xul.is/typing/*`).
 */

import type { AnimationMode } from './badge';
import type { BadgeVariant, SizePreset, ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Layout orientation for quote cards (`'horizontal'` = left accent bar, `'vertical'` = centered card with top/bottom quote marks). */
export type QuoteLayout = 'horizontal' | 'vertical';

/** Container frame layout for typing animations (`'window'` = Kumo app/terminal window, `'prompt'` = modern prompt / AI bar with squircle icon badge, `'ide'` = code editor with tab bar and line gutter, `'browser'` = browser/search omnibox, `'none'` = frameless transparent canvas). */
export type TypingLayout = 'browser' | 'ide' | 'none' | 'prompt' | 'window';

/** Caret cursor shape for typing animations (`'bar'` = vertical line, `'block'` = terminal block, `'underscore'` = bottom bar). */
export type TypingCursor = 'bar' | 'block' | 'underscore';

/** Line erase transition mode for typing animations (`'backspace'` = rapid key-repeat deletion, `'select'` = highlight-all + clear, `'fade'` = whole-line smooth fade-out). */
export type TypingEraseMode = 'backspace' | 'fade' | 'select';

/** Font family for typing animations (`'mono'` = JetBrains Mono, `'sans'` = Geist Sans). */
export type TypingFont = 'mono' | 'sans';

/** Horizontal text alignment for typing animations (`'left'` or `'center'`). */
export type TypingAlign = 'center' | 'left';

/** A single logical group of tech stack icons with an optional group-specific `perLine` column limit. */
export interface StackGroup {
  /** Ordered list of trimmed, lowercase icon slugs in this group (as produced by `parseStackGroups`). */
  icons: string[];
  /** Optional maximum number of tiles per row for this specific group (`1`–`20`). */
  perLine?: number;
}

/** Options for rendering a tech stack icon row, grid, or multi-group layout via `renderStack` (`svg.xul.is/stack/:icons`). */
export interface StackRenderOptions {
  /** Optional animation mode (`'sheen'` for periodic diagonal glint sweep; Defaults to `'default'`, i.e., static). */
  anim?: AnimationMode;
  /** Optional uniform theme color override (when omitted, each icon uses its semantic brand palette). */
  color?: ThemeColorName;
  /** Intra-group spacing in pixels between adjacent tiles (`2`–`24`; Defaults to `8`). */
  gap?: number;
  /** Inter-group spacing in pixels between side-by-side groups and vertical group bands (`8`–`64`; Defaults to `round(gap * 3.25)`). */
  groupGap?: number;
  /** Optional 2D array of group bands (each outer entry is a centered horizontal band of one or more side-by-side `StackGroup`s). */
  groups?: StackGroup[][];
  /** Ordered list of icon slugs or group DSL tokens (supports `;` for vertical bands, `|` for side-by-side groups, and `:N` per-group column suffixes). */
  icons?: string[];
  /** Default maximum number of tiles per row (`1`–`20`; Defaults to `8`). */
  perLine?: number;
  /** Width and height of each square tile in pixels (`24`–`96`; Defaults to `42`). */
  size?: number;
  /** Visual tile variant (`'1'` = Primary brand gradient, `'2'` = Secondary tinted dark, `'3'` = Tertiary neutral dark; Defaults to `'2'`). */
  variant?: BadgeVariant;
}

/** Options for rendering a dark-native quote card via `renderQuote` (`svg.xul.is/quote/…`). */
export interface QuoteRenderOptions {
  /** Optional animation mode (`'sheen'` for periodic diagonal glint sweep; Defaults to `'default'`, i.e., static). */
  anim?: AnimationMode;
  /** Optional author attribution displayed below the quote text (truncated with an ellipsis to the text width). */
  author?: string;
  /** Named Tailwind v4 theme color token for the card accent (defaults to `'indigo'`). */
  color: ThemeColorName;
  /** Card layout style (`'horizontal'` = left accent bar, `'vertical'` = centered profile README card; Defaults to `'horizontal'`). */
  layout?: QuoteLayout;
  /** Quote typography & padding scale (`'sm'`, `'md'`, `'lg'`, `'xl'`, or numeric font size in pixels `11`–`28`). */
  size?: SizePreset | number;
  /** Quote body text (automatically word-wrapped to fit the card width; Truncated with an ellipsis beyond `1000` characters). */
  text: string;
  /** Visual card variant (`'1'` = Primary brand gradient, `'2'` = Secondary tinted dark, `'3'` = Tertiary neutral dark; Defaults to `'2'`). */
  variant?: BadgeVariant;
  /** Total card width in pixels (`240`–`900`; Defaults to `560` for horizontal and `380` for vertical cards, scaled up with larger font sizes). */
  width?: number;
}

/** Options for rendering a realistic typing animation SVG via `renderTyping` (`svg.xul.is/typing/*` and `svg.xul.is/type/*`). */
export interface TypingRenderOptions {
  /** Optional horizontal alignment (`'left'` or `'center'`; Defaults to `'center'` for frameless `'none'` without a prefix, `'left'` otherwise). */
  align?: TypingAlign;
  /** Optional animation mode (`'sheen'` adds a periodic diagonal glint sweep across the container; `'none'` renders the first line statically). */
  anim?: AnimationMode;
  /** Named Tailwind v4 theme color token for the surface, cursor, and accents (defaults to `'indigo'`). */
  color: ThemeColorName;
  /** Caret cursor style (`'bar'`, `'block'`, or `'underscore'`; Defaults to `'bar'`). */
  cursor?: TypingCursor;
  /** Target typing duration per line in milliseconds (`600`–`10000`; Defaults to `2200`). */
  duration?: number;
  /** Line erase transition style (`'backspace'`, `'select'`, or `'fade'`; Defaults to `'backspace'`). */
  erase?: TypingEraseMode;
  /** Typography family (`'mono'` = JetBrains Mono, `'sans'` = Geist Sans; Defaults to the layout's natural font: `'mono'` for `'window'` and `'ide'`, or `'sans'` for `'prompt'`, `'browser'`, and `'none'`). */
  font?: TypingFont;
  /** Whether to include an occasional realistic human typo + immediate backspace correction (`false` by default). */
  hasTypo?: boolean;
  /** Optional trailing keycap or header pill text (e.g., `'UTF-8'`, `'⏎'`, `'⌘K'`). */
  hint?: string;
  /** Optional icon slug (rendered in the header on `'window'`, inside the active tab on `'ide'`, inside the squircle badge on `'prompt'`, or inside the omnibox on `'browser'`). */
  icon?: string;
  /** Container frame layout (`'window'`, `'prompt'`, `'ide'`, `'browser'`, or `'none'`; Defaults to `'window'`). */
  layout?: TypingLayout;
  /** Ordered list of lines to type in sequence, or a single `;`-separated string (up to `12` lines). */
  lines: readonly string[] | string;
  /** Hold pause in milliseconds after a line finishes typing before erasing (`200`–`6000`; Defaults to `1200`). */
  pause?: number;
  /** Optional static prefix text rendered before the cycling typed lines. */
  prefix?: string;
  /** Typography & padding scale (`'sm'`, `'md'`, `'lg'`, `'xl'`, or numeric font size in pixels `12`–`32`; Defaults to `'md'` = `16px`). */
  size?: SizePreset | number;
  /** Optional header bar title for `'window'` layout (e.g., `'zsh'`, `'passions.ts'`). */
  title?: string;
  /** Visual surface variant (`'1'` = Primary brand gradient, `'2'` = Secondary tinted dark, `'3'` = Tertiary neutral dark; Defaults to `'2'`). */
  variant?: BadgeVariant;
  /** Optional explicit container width in pixels (`200`–`1000`; Defaults to auto-fitting the longest line). */
  width?: number;
}
