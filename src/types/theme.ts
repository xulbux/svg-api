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

/** Visual hierarchy variants (`1` = Primary Brand Gradient, `2` = Secondary Tinted Dark, `3` = Tertiary Neutral Dark). */
export type BadgeVariant = '1' | '2' | '3';

/** Animated pulsing status dot color states. */
export type DotState = ThemeColorName;

/** Base neutral dark carbon surface tokens. */
export interface BaseDarkPalette {
  /** Inner bevel highlight color for primary filled buttons. */
  bevelHighlight: string;
  /** Bottom stop of the neutral dark vertical background gradient. */
  bgBottom: string;
  /** Top stop of the neutral dark vertical background gradient. */
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
  /** Glowing border color for secondary variants (`variant=2`). */
  borderColor: string;
  /** Inner top 3D highlight color for primary fills (`color-mix(in oklch, brand, white 30%)`). */
  emphasisBg: string;
  /** Outer 1px border ring color for primary fills (`color-mix(in oklch, brand, black 10%)`). */
  emphasisRing: string;
  /** Dot / filter glow color. */
  glowColor: string;
  /** Bottom gradient stop for primary fills (`variant=1`). */
  gradEnd: string;
  /** Top gradient stop for primary fills (`color-mix(in oklch, brand, white 15%)`). */
  gradStart: string;
  /** Icon tint color on dark backgrounds. */
  iconColor: string;
  /** Low-opacity fill color for secondary variants (`variant=2`). */
  tintBg: string;
}
