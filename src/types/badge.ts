/**
 * Badge rendering and icon resolution types.
 */

import type { BadgeVariant, DotState, ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Supported icon library source types. */
export type IconType = 'lucide' | 'simple';

/** Resolved SVG icon markup and source type. */
export interface ResolvedIcon {
  /** Inner SVG elements (without the outer `<svg>` wrapper). */
  innerSvg: string;
  /** Whether the icon uses Lucide strokes or a Simple Icons fill path. */
  type: IconType;
}

/** Options for rendering a badge or button SVG via `renderBadge`. */
export interface BadgeRenderOptions {
  /** Named theme color token. */
  color: ThemeColorName;
  /** Optional pulsing status indicator state. */
  dot?: DotState;
  /** Optional icon slug (Lucide or Simple Icons) or `'none'` to suppress default icons. */
  icon?: string;
  /** Left-hand label text (or button text for 1-segment badges). */
  label: string;
  /** Optional array of numeric data points for an inline sparkline trend graph. */
  sparkline?: number[];
  /** Right-hand value text (omitted on 1-segment buttons). */
  value?: string;
  /** Visual variant (`1`..`3` for badges, `b1`..`b3` for buttons). */
  variant: BadgeVariant;
}
