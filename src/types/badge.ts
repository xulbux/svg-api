/**
 * Badge types – Badge and button rendering options, micro-animation modes, and special element shapes.
 */

import type { BadgeVariant, DotState, SizePreset, ThemeColorName } from './theme';

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
 * - `'default'`: Status dots and progress bars animate; Icons and surfaces remain static (default when `?anim=` is omitted).
 * - `'sheen'`: Enables periodic diagonal specular glint sweep across the surface without animating the icon.
 * - `'auto' | 'spin' | 'shake' | 'nudge' | 'pulse' | 'float'`: Enables contextual or explicit icon micro-animation.
 * - `'<left>,<right>'` (e.g., `'none,nudge'`, `'shake,nudge'`): Animates left and right icons independently.
 * - `'sheen,<mode>'` or `'sheen,<left>,<right>'`: Combines surface sheen with single or per-icon animations.
 * - `'none'`: Disables all SVG animations (including status dots and progress bars) for a completely static image.
 */
export type AnimationMode =
  | IconMotionMode
  | 'sheen'
  | `sheen,${IconMotionMode}`
  | `${IconMotionMode},${IconMotionMode}`
  | `sheen,${IconMotionMode},${IconMotionMode}`;

/** Health/heat stage of an individual tick in a segmented strip (`'0'` = critical/rose through `'9'` = optimal/emerald). */
export type StripTickState = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/** Inline horizontal capacity/progress bar special element. */
export interface BarSpecialElement {
  /** Optional override for whether the rightward shimmer wave is active (`true` by default unless `anim=none`). */
  hasPulse?: boolean;
  /** Special element discriminant (`'bar'`). */
  type: 'bar';
  /** Progress percentage (`0`–`100`). */
  value: number;
}

/** Inline vertical mini-bar histogram special element (`bars:<n1,n2,...>`). */
export interface BarsSpecialElement {
  /** Special element discriminant (`'bars'`). */
  type: 'bars';
  /** Numeric bar heights (at least 2 values). */
  values: number[];
}

/** Inline trend delta arrow and readout special element. */
export interface DeltaSpecialElement {
  /** Special element discriminant (`'delta'`). */
  type: 'delta';
  /** Formatted delta string (e.g., `'+14%'`, `'-3.2%'`, `'0%'`; Truncated with an ellipsis beyond `128` characters). */
  value: string;
}

/** Compact `12x12px` circular ring gauge special element. */
export interface RingSpecialElement {
  /** Optional override to enable a subtle pulse on the circular ring gauge (`false` by default). */
  hasPulse?: boolean;
  /** Special element discriminant (`'ring'`). */
  type: 'ring';
  /** Progress percentage (`0`–`100`). */
  value: number;
}

/** Inline trend sparkline with vertical area gradient fill special element. */
export interface SparklineSpecialElement {
  /** Special element discriminant (`'sparkline'`). */
  type: 'sparkline';
  /** Numeric series points (at least 2 values). */
  values: number[];
}

/** Segmented discrete progress steps special element (`steps:<done>/<total>`). */
export interface StepsSpecialElement {
  /** Completed step count (`0`–`total`). */
  done: number;
  /** Total step count (`1`–`10`). */
  total: number;
  /** Special element discriminant (`'steps'`). */
  type: 'steps';
}

/** Segmented uptime/health history strip special element. */
export interface StripSpecialElement {
  /** Up to 10 vertical status ticks from `'0'` to `'9'`. */
  states: StripTickState[];
  /** Special element discriminant (`'strip'`). */
  type: 'strip';
}

/** Unified right-compartment special data visualization element. */
export type BadgeSpecialElement =
  | BarSpecialElement
  | BarsSpecialElement
  | DeltaSpecialElement
  | RingSpecialElement
  | SparklineSpecialElement
  | StepsSpecialElement
  | StripSpecialElement;

/** Discriminant kind of an inline data visualization element (`?special=`). */
export type BadgeSpecialKind = BadgeSpecialElement['type'];

/** Candidate inline data visualization elements derived from upstream data, keyed by kind. */
export type BadgeSpecialMap = Partial<Record<BadgeSpecialKind, BadgeSpecialElement>>;

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
  /** Left-hand label text, or single-part badge text (truncated with an ellipsis beyond `128` characters). */
  label: string;
  /** Optional right-hand special data visualization element (`bar`, `bars`, `ring`, `steps`, `strip`, `delta`, or `sparkline`). */
  special?: BadgeSpecialElement;
  /** Right-hand value text, omitted on 1-segment badges (truncated with an ellipsis beyond `128` characters). */
  value?: string;
  /** Visual variant (`1` = Primary, `2` = Secondary, `3` = Tertiary). */
  variant: BadgeVariant;
}

/** Base size dimensions of a badge (`22px`) or a CTA button (`22px`–`48px`). */
export interface VariantMetrics {
  /** Font size in pixels. */
  fontSize: number;
  /** Total height of the SVG in pixels. */
  height: number;
  /** Width and height of the icon in pixels. */
  iconSize: number;
  /** Horizontal padding in pixels. */
  padX: number;
  /** Corner border radius in pixels. */
  radius: number;
}

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
  /** Primary button label text (truncated with an ellipsis beyond `128` characters). */
  label: string;
  /** Optional button size preset (`'sm'`, `'md'`, `'lg'`, `'xl'`) or custom pixel height (`22`–`48`; Defaults to `'md'` = `30px`). */
  size?: SizePreset | number;
  /** Optional secondary right-hand compartment text for split CTA buttons (`/button/:label/:value`). */
  value?: string;
  /** Visual variant (`1` = Primary, `2` = Secondary, `3` = Tertiary; Defaults to `'1'`). */
  variant: BadgeVariant;
}
