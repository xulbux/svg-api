/**
 * Badge rendering, micro-animation, and special element types.
 */

import type { BadgeVariant, DotState, ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Single icon micro-animation token. */
export type IconMotionMode =
  | 'auto'
  | 'default'
  | 'float'
  | 'none'
  | 'nudge'
  | 'pulse'
  | 'shake'
  | 'spin';

/**
 * Micro-animation mode for icons, status dots, and specular sheen.
 * - `'default'`: Status dots and progress bars animate; icons and surfaces remain static (default when `?anim=` is omitted).
 * - `'sheen'`: Enables periodic diagonal specular glint sweep across the surface without animating the icon.
 * - `'auto' | 'spin' | 'shake' | 'nudge' | 'pulse' | 'float'`: Enables contextual or explicit icon micro-animation.
 * - `'<left>,<right>'` (e.g. `'none,nudge'`, `'shake,nudge'`): Animates left and right icons independently.
 * - `'sheen,<mode>'` or `'sheen,<left>,<right>'`: Combines surface sheen with single or per-icon animations.
 * - `'none'`: Disables all SVG animations (including status dots and progress bars) for a completely static image.
 */
export type AnimationMode =
  | IconMotionMode
  | 'sheen'
  | `sheen,${IconMotionMode}`
  | `${IconMotionMode},${IconMotionMode}`
  | `sheen,${IconMotionMode},${IconMotionMode}`;

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

/** Options for rendering a `22px` badge SVG via `renderBadge`. */
export interface BadgeRenderOptions {
  /** Optional micro-animation control mode (defaults to `'default'`). */
  anim?: AnimationMode;
  /** Named theme color token. */
  color: ThemeColorName;
  /** Optional pulsing status indicator state. */
  dot?: DotState;
  /** Optional icon spec: `'slug'` (left only), `'left,right'` (both sides), `'none,right'` (right only), or `'none'`. */
  icon?: string;
  /** Left-hand label text (or single-part badge text). */
  label: string;
  /** Optional right-hand special data visualization element (`bar`, `ring`, `strip`, `delta`, or `sparkline`). */
  special?: BadgeSpecialElement;
  /** Right-hand value text (omitted on 1-segment badges). */
  value?: string;
  /** Visual variant (`1` = Primary, `2` = Secondary, `3` = Tertiary). */
  variant: BadgeVariant;
}

/** Named size scale preset for CTA buttons (`/button/*` and `/btn/*`). */
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

/** Options for rendering a CTA button SVG via `renderButton` (`/button/*` and `/btn/*`). */
export interface ButtonRenderOptions {
  /** Optional micro-animation control mode (defaults to `'default'`). */
  anim?: AnimationMode;
  /** Named theme color token. */
  color: ThemeColorName;
  /** Optional pulsing status indicator state. */
  dot?: DotState;
  /** Optional icon spec: `'slug'` (left only), `'left,right'` (both sides), `'none,right'` (right only), or `'none'`. */
  icon?: string;
  /** Primary button label text. */
  label: string;
  /** Optional button size preset (`'sm'`, `'md'`, `'lg'`, `'xl'`) or custom pixel height (`22`–`48`, defaults to `'md'` = `30px`). */
  size?: ButtonSize | number;
  /** Optional secondary right-hand compartment text for split CTA buttons (`/button/:label/:value`). */
  value?: string;
  /** Visual variant (`1` = Primary, `2` = Secondary, `3` = Tertiary; defaults to `'1'`). */
  variant: BadgeVariant;
}
