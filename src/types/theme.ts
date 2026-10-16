/**
 * Theme color and visual variant types.
 */

// ---------------------------------------- TYPES ----------------------------------------

/** Named Tailwind v4 color tokens supported by the badge engine. */
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

/** Visual badge (`1`-`3`) and micro-button (`b1`-`b3`) variants. */
export type BadgeVariant = '1' | '2' | '3' | 'b1' | 'b2' | 'b3';

/** Animated pulsing status dot color states. */
export type DotState = ThemeColorName;

/** Base dark-slate neutral surface tokens. */
export interface BaseDarkPalette {
  /** Inner bevel highlight color for primary filled buttons. */
  bevelHighlight: string;
  /** Bottom stop of the dark slate vertical background gradient. */
  bgBottom: string;
  /** Top stop of the dark slate vertical background gradient. */
  bgTop: string;
  /** Neutral 1px border color for standard dark pills. */
  borderNeutral: string;
  /** Subtle top hairline highlight color for dark surfaces. */
  innerHighlight: string;
  /** Muted foreground color for tertiary labels. */
  textMuted: string;
  /** Primary crisp white-gray foreground color for labels. */
  textPrimary: string;
}

/** Color tokens for a named theme palette. */
export interface ThemePalette {
  /** Bright readable accent text color on dark backgrounds. */
  accentText: string;
  /** Glowing border color for secondary variants (`v=2` and `v=b2`). */
  borderColor: string;
  /** Inner top 3D highlight color for primary fills (`color-mix(in oklch, brand, white 30%)`). */
  emphasisBg: string;
  /** Outer 1px border ring color for primary fills (`color-mix(in oklch, brand, black 10%)`). */
  emphasisRing: string;
  /** Dot / filter glow color. */
  glowColor: string;
  /** Bottom gradient stop for primary fills (`v=1` and `v=b1`). */
  gradEnd: string;
  /** Top gradient stop for primary fills (`color-mix(in oklch, brand, white 15%)`). */
  gradStart: string;
  /** Icon tint color on dark backgrounds. */
  iconColor: string;
  /** Low-opacity fill color for secondary variants (`v=2` and `v=b2`). */
  tintBg: string;
}
