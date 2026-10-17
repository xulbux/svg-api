/**
 * Tech stack grid and quote card widget rendering types (`svg.xul.is/stack/*` and `svg.xul.is/quote/*`).
 */

import type { AnimationMode } from './badge';
import type { ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Visual style variant for standalone stack tiles and quote cards (`1` = tinted glow, `2` = dark bevel, `3` = minimal flat). */
export type WidgetVariant = '1' | '2' | '3';

/** Layout orientation for quote cards (`'horizontal'` = left accent bar, `'vertical'` = centered card with top/bottom quote marks). */
export type QuoteLayout = 'horizontal' | 'vertical';

/** Named typography and padding scale preset for quote cards. */
export type QuoteSize = 'sm' | 'md' | 'lg' | 'xl';

/** A single logical group of tech stack icons with an optional group-specific `perLine` column limit. */
export interface StackGroup {
  /** Ordered list of icon slugs in this group. */
  icons: string[];
  /** Optional maximum number of tiles per row for this specific group (`1`–`20`). */
  perLine?: number;
}

/** Options for rendering a tech stack icon row, grid, or multi-group layout via `renderStack` (`svg.xul.is/stack/:icons`). */
export interface StackRenderOptions {
  /** Optional animation mode (`'sheen'` for periodic diagonal glint sweep, `'none'` for static, defaults to `'auto'`). */
  anim?: AnimationMode;
  /** Optional uniform theme color override (when omitted, each icon uses its semantic brand palette). */
  color?: ThemeColorName;
  /** Intra-group spacing in pixels between adjacent tiles (`2`–`24`, defaults to `8`). */
  gap?: number;
  /** Inter-group spacing in pixels between side-by-side groups and vertical group bands (`8`–`64`, defaults to `26`). */
  groupGap?: number;
  /** Optional 2D array of group bands (each outer entry is a centered horizontal band of one or more side-by-side `StackGroup`s). */
  groups?: StackGroup[][];
  /** Ordered list of icon slugs or group DSL tokens (supports `;` for vertical bands, `|` for side-by-side groups, and `:N` per-group column suffixes). */
  icons?: string[];
  /** Default maximum number of tiles per row (`1`–`20`, defaults to `8`). */
  perLine?: number;
  /** Width and height of each square tile in pixels (`24`–`96`, defaults to `42`). */
  size?: number;
  /** Visual tile variant (`'1'` = tinted glow border, `'2'` = Kumo 3D dark slate (default), `'3'` = minimal flat). */
  variant?: WidgetVariant;
}

/** Options for rendering a dark-native quote card via `renderQuote` (`svg.xul.is/quote/...`). */
export interface QuoteRenderOptions {
  /** Optional animation mode (`'sheen'` for periodic diagonal glint sweep, `'none'` for static, defaults to `'auto'`). */
  anim?: AnimationMode;
  /** Optional author attribution displayed below the quote text with an em dash (`—`). */
  author?: string;
  /** Named Tailwind v4 theme color token for the card accent (defaults to `'indigo'`). */
  color: ThemeColorName;
  /** Card layout style (`'horizontal'` = left accent bar, `'vertical'` = centered profile README card; defaults to `'horizontal'`). */
  layout?: QuoteLayout;
  /** Quote typography & padding scale (`'sm'`, `'md'`, `'lg'`, `'xl'`, or numeric font size in pixels `11`–`28`). */
  size?: QuoteSize | number;
  /** Quote body text (automatically word-wrapped to fit the card width). */
  text: string;
  /** Visual card variant (`'1'` = tinted glow border, `'2'` = Kumo 3D dark card with accent bar (default), `'3'` = minimal flat). */
  variant?: WidgetVariant;
  /** Total card width in pixels (`240`–`900`, defaults to `560` for horizontal and `380` for vertical). */
  width?: number;
}
