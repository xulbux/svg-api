/**
 * Widget types – Tech stack grid, quote card, and typing animation rendering options.
 */

import type { AnimationMode } from './badge';
import type { BadgeVariant, SizePreset, ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Layout orientation for quote cards. */
export type QuoteLayout = 'horizontal' | 'vertical';

/** Container frame layout for typing animations. */
export type TypingLayout = 'browser' | 'ide' | 'none' | 'prompt' | 'window';

/** Caret cursor shape for typing animations. */
export type TypingCursor = 'bar' | 'block' | 'underscore';

/** Line erase transition mode for typing animations. */
export type TypingEraseMode = 'backspace' | 'fade' | 'select';

/** Bundled vector font family identifier for typing animations. */
export type TypingFont = 'mono' | 'sans';

/** Single laid-out character glyph with its horizontal advance and serialized outline at `(0, 0)`. */
export interface PositionedCharGlyph {
  /** Horizontal advance width of this character (including tracking and kerning) in pixels. */
  advance: number;
  /** Character string (one Unicode code point). */
  char: string;
  /** Horizontal baseline X offset from the start of the line in pixels. */
  glyphX: number;
  /** Serialized SVG `<path>` `d` attribute at `(0, 0)` (`''` for spaces or missing glyphs). */
  pathData: string;
}

/** Per-character glyph layout and total advance width of a line of text. */
export interface GlyphLineLayout {
  /** Ordered per-character glyphs along the baseline. */
  glyphs: PositionedCharGlyph[];
  /** Total horizontal advance width of the line in pixels. */
  totalAdvance: number;
}

/** Horizontal text alignment for typing animations. */
export type TypingAlign = 'center' | 'left';

/** Staggered per-tile micro-animation token for tech stack grids. */
export type StackTileMotion = 'default' | 'float' | 'none' | 'pulse' | 'wave';

/** Animation mode for tech stack grids, supporting static tiles, surface sheen, staggered tile motion, or sheen combined with tile motion. */
export type StackAnimationMode =
  | StackTileMotion
  | 'sheen'
  | 'sheen,float'
  | 'sheen,pulse'
  | 'sheen,wave';

/** A single logical group of tech stack icons with an optional group-specific `perLine` column limit. */
export interface StackGroup {
  /** Ordered list of trimmed, lowercase icon slugs in this group. */
  icons: string[];
  /** Optional maximum number of tiles per row for this specific group. */
  perLine?: number;
}

/** Options for rendering a tech stack icon row, grid, or multi-group layout via `renderStack`. */
export interface StackRenderOptions {
  /** Optional surface sheen and/or staggered tile animation mode. */
  anim?: StackAnimationMode;
  /** Optional uniform theme color override (when omitted, each icon uses its semantic brand palette). */
  color?: ThemeColorName;
  /** Intra-group spacing in pixels between adjacent tiles. */
  gap?: number;
  /** Inter-group spacing in pixels between side-by-side groups and vertical group bands. */
  groupGap?: number;
  /** Optional 2D array of group bands (each outer entry is a centered horizontal band of one or more side-by-side `StackGroup`s). */
  groups?: StackGroup[][];
  /** Ordered list of icon slugs or group DSL tokens. */
  icons?: string[];
  /** Default maximum number of tiles per row. */
  perLine?: number;
  /** Width and height of each square tile in pixels. */
  size?: number;
  /** Visual hierarchy tier. */
  variant?: BadgeVariant;
}

/** Options for rendering a dark-native quote card via `renderQuote`. */
export interface QuoteRenderOptions {
  /** Optional surface animation mode. */
  anim?: AnimationMode;
  /** Optional author attribution displayed below the quote text (truncated with an ellipsis to the text width). */
  author?: string;
  /** Named Tailwind v4 theme color token for the card accent. */
  color: ThemeColorName;
  /** Card layout orientation. */
  layout?: QuoteLayout;
  /** Quote typography & padding scale preset or custom pixel font size. */
  size?: SizePreset | number;
  /** Quote body text (automatically word-wrapped to fit the card width; Truncated with an ellipsis when over-long). */
  text: string;
  /** Visual hierarchy tier. */
  variant?: BadgeVariant;
  /** Total card width in pixels. */
  width?: number;
}

/** Options for rendering a realistic typing animation SVG via `renderTyping`. */
export interface TypingRenderOptions {
  /** Optional horizontal text alignment. */
  align?: TypingAlign;
  /** Optional surface animation or reduced-motion static mode. */
  anim?: AnimationMode;
  /** Named Tailwind v4 theme color token for the surface, cursor, and accents. */
  color: ThemeColorName;
  /** Caret cursor shape. */
  cursor?: TypingCursor;
  /** Target typing duration per line in milliseconds. */
  duration?: number;
  /** Line erase transition style. */
  erase?: TypingEraseMode;
  /** Bundled vector font family override. */
  font?: TypingFont;
  /** Whether to include an occasional realistic human typo and immediate backspace correction. */
  hasTypo?: boolean;
  /** Optional trailing keycap or header pill text (e.g., `'UTF-8'`, `'icon:command K'`). */
  hint?: string;
  /** Optional leading icon slug. */
  icon?: string;
  /** Container frame layout. */
  layout?: TypingLayout;
  /** Ordered list of lines to type in sequence, or a single `;`-separated string. */
  lines: readonly string[] | string;
  /** Hold pause in milliseconds after a line finishes typing before erasing. */
  pause?: number;
  /** Optional static prefix text rendered before the cycling typed lines. */
  prefix?: string;
  /** Typography & padding scale preset or custom pixel font size. */
  size?: SizePreset | number;
  /** Optional header bar or active file tab title (e.g., `'zsh'`, `'index.ts'`). */
  title?: string;
  /** Visual hierarchy tier. */
  variant?: BadgeVariant;
  /** Optional explicit container width in pixels (auto-fits the longest line when omitted). */
  width?: number;
}
