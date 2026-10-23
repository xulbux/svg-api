/**
 * Badge types – Badge and button rendering options, micro-animation modes, and special element shapes.
 */

import type { BadgeVariant, DotState, SizePreset, ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Single icon micro-animation token. */
export type IconMotionMode =
  | 'auto'
  | 'breathe'
  | 'default'
  | 'float'
  | 'none'
  | 'nudge'
  | 'pulse'
  | 'shake'
  | 'spin'
  | 'turn'
  | 'whirl';

/**
 * Micro-animation mode for icons, status dots, and specular sheen.
 * - `'default'`: Status dots and progress bars animate; Icons and surfaces remain static (default when `?anim=` is omitted).
 * - `'sheen'`: Enables periodic diagonal specular glint sweep across the surface without animating the icon.
 * - Any active `IconMotionMode`: Enables contextual or explicit icon micro-animation.
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

/** Health/heat stage of an individual tick in a segmented strip, ordered from critical/rose to optimal/emerald. */
export type StripTickState = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/** Inline horizontal capacity/progress bar special element. */
export interface BarSpecialElement {
  /** Optional override for whether the rightward shimmer wave is active (`true` by default unless `anim=none`). */
  hasPulse?: boolean;
  /** Special element discriminant (`'bar'`). */
  type: 'bar';
  /** Clamped progress percentage. */
  value: number;
}

/** Inline vertical mini-bar histogram special element (`bars:<n1,n2,…>`). */
export interface BarsSpecialElement {
  /** Special element discriminant (`'bars'`). */
  type: 'bars';
  /** Numeric bar heights. */
  values: number[];
}

/** Inline trend delta arrow and readout special element. */
export interface DeltaSpecialElement {
  /** Special element discriminant (`'delta'`). */
  type: 'delta';
  /** Formatted signed delta string (e.g., `'+14%'`, `'-3.2%'`, `'0%'`; Truncated with an ellipsis when over-long). */
  value: string;
}

/** Compact circular ring gauge special element. */
export interface RingSpecialElement {
  /** Optional override to enable a subtle pulse on the circular ring gauge (`false` by default). */
  hasPulse?: boolean;
  /** Special element discriminant (`'ring'`). */
  type: 'ring';
  /** Clamped progress percentage. */
  value: number;
}

/** Inline trend sparkline with vertical area gradient fill special element. */
export interface SparklineSpecialElement {
  /** Special element discriminant (`'sparkline'`). */
  type: 'sparkline';
  /** Numeric series points. */
  values: number[];
}

/** Segmented discrete progress steps special element (`steps:<done>/<total>`). */
export interface StepsSpecialElement {
  /** Completed step count (`0`–`total`). */
  done: number;
  /** Total step count. */
  total: number;
  /** Special element discriminant (`'steps'`). */
  type: 'steps';
}

/** Segmented uptime/health history strip special element. */
export interface StripSpecialElement {
  /** Ordered sequence of vertical status tick states. */
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

/** Options for rendering a badge SVG via `renderBadge`. */
export interface BadgeRenderOptions {
  /** Optional micro-animation control mode. */
  anim?: AnimationMode;
  /** Named theme color token. */
  color: ThemeColorName;
  /** Optional pulsing status indicator state. */
  dot?: DotState;
  /** Optional single, left/right pair, or trailing-only icon specification. */
  icon?: string;
  /** Left-hand label text, or single-part badge text (truncated with an ellipsis when over-long). */
  label: string;
  /** Optional right-hand special data visualization element. */
  special?: BadgeSpecialElement;
  /** Right-hand value text, omitted on single-segment badges (truncated with an ellipsis when over-long). */
  value?: string;
  /** Visual hierarchy tier. */
  variant: BadgeVariant;
}

/** Base size dimensions of a badge or CTA button. */
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

/** Options for rendering a CTA button SVG via `renderButton`. */
export interface ButtonRenderOptions {
  /** Optional micro-animation control mode. */
  anim?: AnimationMode;
  /** Named theme color token. */
  color: ThemeColorName;
  /** Optional single, left/right pair, or trailing-only icon specification. */
  icon?: string;
  /** Primary button label text (truncated with an ellipsis when over-long). */
  label: string;
  /** Optional button size preset or custom pixel height. */
  size?: SizePreset | number;
  /** Optional secondary right-hand compartment text for split CTA buttons. */
  value?: string;
  /** Visual hierarchy tier. */
  variant: BadgeVariant;
}
