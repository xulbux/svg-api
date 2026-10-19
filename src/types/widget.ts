/**
 * Widget types – Tech stack grid and quote card rendering options (`svg.xul.is/stack/*` and `svg.xul.is/quote/*`).
 */

import type { AnimationMode } from './badge';
import type { BadgeVariant, SizePreset, ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Layout orientation for quote cards (`'horizontal'` = left accent bar, `'vertical'` = centered card with top/bottom quote marks). */
export type QuoteLayout = 'horizontal' | 'vertical';

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

/** Options for rendering a dark-native quote card via `renderQuote` (`svg.xul.is/quote/...`). */
export interface QuoteRenderOptions {
  /** Optional animation mode (`'sheen'` for periodic diagonal glint sweep; Defaults to `'default'`, i.e., static). */
  anim?: AnimationMode;
  /** Optional author attribution displayed below the quote text with an em dash (`—`; Truncated with an ellipsis to the text width). */
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
