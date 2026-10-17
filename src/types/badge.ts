/**
 * Badge rendering, micro-animation, and special element types.
 */

import type { BadgeVariant, DotState, ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/**
 * Micro-animation mode for icons, status dots, and specular sheen.
 * - `'auto'`: Contextual icon micro-animations + status dot radar ripples (default).
 * - `'sheen'`: Enables periodic diagonal specular glint sweep in addition to `'auto'`.
 * - `'spin'`: Forces smooth 360-degree continuous rotation on the icon.
 * - `'shake'`: Forces periodic scale-up + subtle back-and-forth wiggle on the icon.
 * - `'nudge'`: Forces periodic directional nudge on the icon.
 * - `'pulse'`: Forces periodic double-beat scale pulse on the icon.
 * - `'float'`: Forces smooth vertical levitation bob on the icon.
 * - `'none'`: Disables all SVG animations for a static image.
 */
export type AnimationMode =
  | 'auto'
  | 'float'
  | 'none'
  | 'nudge'
  | 'pulse'
  | 'shake'
  | 'sheen'
  | 'spin';

/**
 * Health/heat stage of an individual tick in a segmented strip (`'0'` = critical/rose through `'9'` = optimal/emerald).
 */
export type StripTickState = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/** Unified right-compartment special data visualization element. */
export type BadgeSpecialElement =
  | {
      /** Optional override for whether the rightward shimmer wave is active (`true` by default unless `anim=none`). */
      hasPulse?: boolean;
      /** Percentage fill (`0`–`100`) for an inline horizontal capacity/progress bar. */
      type: 'bar';
      /** Progress percentage (`0`–`100`). */
      value: number;
    }
  | {
      /** Trend delta readout (e.g., `'+14%'`, `'-3.2%'`, `'0%'`). */
      type: 'delta';
      /** Formatted delta string. */
      value: string;
    }
  | {
      /** Optional override to enable a subtle pulse on the circular ring gauge (`false` by default). */
      hasPulse?: boolean;
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
      /** Segmented uptime/health history strip (up to 10 vertical status ticks from `'0'` to `'9'`). */
      states: StripTickState[];
      /** Segmented health strip indicator. */
      type: 'strip';
    };

/** Options for rendering a badge or button SVG via `renderBadge`. */
export interface BadgeRenderOptions {
  /** Optional micro-animation control mode (defaults to `'auto'`). */
  anim?: AnimationMode;
  /** Named theme color token. */
  color: ThemeColorName;
  /** Optional pulsing status indicator state. */
  dot?: DotState;
  /** Optional icon slug (Lucide or Simple Icons) or `'none'` to suppress default icons. */
  icon?: string;
  /** Left-hand label text (or button text for 1-segment badges). */
  label: string;
  /** Optional right-hand special data visualization element (`bar`, `ring`, `strip`, `delta`, or `sparkline`). */
  special?: BadgeSpecialElement;
  /** Right-hand value text (omitted on 1-segment buttons). */
  value?: string;
  /** Visual variant (`1`..`3` for badges, `b1`..`b3` for buttons). */
  variant: BadgeVariant;
}
