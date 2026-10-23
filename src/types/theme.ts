/**
 * Theme types – Theme color tokens, shared visual variants, size presets, highlight band stops and sweep timings, foreground paints, and palette shapes.
 */

// ---------------------------------------- TYPES ----------------------------------------

/** Named Tailwind v4 color tokens supported across SVG endpoints. */
export type ThemeColorName =
  | 'amber'
  | 'blue'
  | 'cyan'
  | 'emerald'
  | 'fuchsia'
  | 'gray'
  | 'green'
  | 'indigo'
  | 'lime'
  | 'neutral'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'rose'
  | 'sky'
  | 'slate'
  | 'stone'
  | 'teal'
  | 'violet'
  | 'yellow'
  | 'zinc';

/** Visual hierarchy variant tier shared across multi-tier SVG surfaces. */
export type BadgeVariant = '1' | '2' | '3';

/** Named typography and geometry scale preset (`?size=`). */
export type SizePreset = 'lg' | 'md' | 'sm' | 'xl';

/** Animated pulsing status dot color states. */
export type DotState = ThemeColorName;

/** Single white highlight gradient stop (`[offset in percent, stop-opacity]`) of a sheen or shimmer band. */
export type BandStop = readonly [offsetPercent: number, opacity: string];

/** Timing of a periodic highlight sweep (sheens and shimmers): A spline-eased sweep followed by a pause. */
export interface SweepTiming {
  /** SMIL `dur` of one full cycle including the pause (e.g., `'4s'`). */
  duration: string;
  /** Cubic Bezier `keySplines` control points of the sweep segment (e.g., `'0.42 0 0.25 1'`). */
  easing: string;
  /** Fraction of the cycle (`0`–`1`) at which the sweep ends and the pause begins. */
  sweepEnd: number;
}

/** Color and optional opacity of a foreground SVG element. */
export interface ForegroundPaint {
  /** Opaque paint color. */
  color: string;
  /** Element opacity (`0`–`1`; `undefined` when fully opaque). */
  opacity: number | undefined;
}

/** Base neutral dark carbon surface tokens. */
export interface BaseDarkPalette {
  /** Bottom stop of the neutral dark vertical background gradient. */
  bgBottom: string;
  /** Top stop of the neutral dark vertical background gradient. */
  bgTop: string;
  /** Neutral 1px border color for standard dark pills. */
  borderNeutral: string;
  /** Muted foreground color for tertiary labels. */
  textMuted: string;
  /** Primary crisp white-gray foreground color for labels. */
  textPrimary: string;
}

/** Color tokens for a named theme palette. */
export interface ThemePalette {
  /** Bright readable accent text color on dark backgrounds. */
  accentText: string;
  /** Glowing border color for secondary surfaces. */
  borderColor: string;
  /** Inner top 3D specular highlight color for primary fills. */
  emphasisBg: string;
  /** Outer 1px border ring color for primary fills. */
  emphasisRing: string;
  /** Vivid glow and status dot color. */
  glowColor: string;
  /** Bottom gradient stop for primary fills. */
  gradEnd: string;
  /** Top gradient stop for primary fills. */
  gradStart: string;
  /** Icon tint color on dark backgrounds. */
  iconColor: string;
  /** Low-opacity fill color for secondary surfaces. */
  tintBg: string;
}

/** Dark and light variant of a scheme-dependent palette color. */
export interface SchemeColor {
  /** Value in the dark color scheme. */
  dark: string;
  /** Value in the light color scheme. */
  light: string;
}
