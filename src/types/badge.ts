/**
 * Badge rendering, micro-animation, special element, and icon resolution types.
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

/**
 * Micro-animation mode for icons, status dots, and button specular sheen.
 * - `'auto'`: Contextual icon micro-animations + status dot radar ripples (default).
 * - `'sheen'`: Enables periodic diagonal specular glint sweep in addition to `'auto'`.
 * - `'spin'`: Forces smooth 360-degree continuous rotation on the icon.
 * - `'shake'`: Forces periodic scale-up + subtle back-and-forth wiggle on the icon.
 * - `'nudge'`: Forces periodic directional nudge on the icon.
 * - `'none'`: Disables all SVG animations for a static image.
 */
export type AnimationMode = 'auto' | 'nudge' | 'none' | 'shake' | 'sheen' | 'spin';

/** Health state of an individual tick in a segmented uptime strip. */
export type StripTickState = 'down' | 'up' | 'warn';

/** Unified right-compartment special data visualization element. */
export type BadgeSpecialElement =
  | {
      /** Percentage fill (`0`–`100`) for an inline horizontal capacity/progress bar. */
      type: 'bar';
      /** Progress percentage (`0`–`100`). */
      value: number;
    }
  | {
      /** Trend direction and optional label (e.g., `'+14%'`, `'-3.2%'`, `'up'`, `'down'`). */
      type: 'delta';
      /** Delta string or direction keyword. */
      value: string;
    }
  | {
      /** Percentage fill (`0`–`100`) for a compact `12x12px` circular ring gauge. */
      type: 'ring';
      /** Progress percentage (`0`–`100`). */
      value: number;
    }
  | {
      /** Inline trend sparkline with vertical area gradient fill. */
      type: 'sparkline';
      /** Numeric series points (at least 2 values). */
      values: number[];
    }
  | {
      /** Segmented uptime/health history strip (up to 10 vertical status ticks). */
      states: StripTickState[];
      /** Segmented health strip indicator. */
      type: 'strip';
    };

/** Options for rendering a badge or button SVG via `renderBadge`. */
export interface BadgeRenderOptions {
  /** Optional micro-animation control mode (defaults to `'auto'`). */
  anim?: AnimationMode;
  /** Optional shorthand percentage (`0`–`100`) for an inline horizontal progress bar. */
  bar?: number;
  /** Named theme color token. */
  color: ThemeColorName;
  /** Optional shorthand trend delta string (e.g., `'+12%'`, `'-3%'`, `'up'`, `'down'`). */
  delta?: string;
  /** Optional pulsing status indicator state. */
  dot?: DotState;
  /** Optional icon slug (Lucide or Simple Icons) or `'none'` to suppress default icons. */
  icon?: string;
  /** Left-hand label text (or button text for 1-segment badges). */
  label: string;
  /** Optional shorthand percentage (`0`–`100`) for an inline circular ring gauge. */
  ring?: number;
  /** Optional array of numeric data points for an inline sparkline trend graph. */
  sparkline?: number[];
  /** Optional unified right-hand special element (overrides individual shorthand fields if set). */
  special?: BadgeSpecialElement;
  /** Optional shorthand array of health states for a segmented uptime strip. */
  strip?: StripTickState[];
  /** Right-hand value text (omitted on 1-segment buttons). */
  value?: string;
  /** Visual variant (`1`..`3` for badges, `b1`..`b3` for buttons). */
  variant: BadgeVariant;
}
