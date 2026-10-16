/**
 * Theme tokens – Tailwind v4 OKLCH color palettes and Cloudflare Kumo 3D token helpers.
 */

import type { BaseDarkPalette, DotState, ThemeColorName, ThemePalette } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Perceptual OKLCH color coordinates (`lightness` in `0`–`100`%, `chroma`, `hue` in degrees). */
interface OklchColor {
  /** OKLCH chroma (`0`–`0.4`). */
  chroma: number;
  /** OKLCH hue angle in degrees (`0`–`360`). */
  hue: number;
  /** OKLCH perceptual lightness percentage (`0`–`100`). */
  lightness: number;
}

/** Three-channel RGB tuple (`0`–`1` linear light or `0`–`255` gamma-encoded). */
type RgbTuple = [red: number, green: number, blue: number];

/** Tailwind v4 OKLCH shade seeds required to derive a complete badge theme palette. */
interface TailwindFamilyScale {
  /** Whether the family is a low-chroma neutral gray scale. */
  isNeutral?: boolean;
  /** Shade `300` OKLCH coordinates (used for readable neutral accent text). */
  shade300: OklchColor;
  /** Shade `400` OKLCH coordinates (used for chromatic accent text and icons). */
  shade400: OklchColor;
  /** Shade `500` OKLCH coordinates (used for secondary tints, borders, and status dots). */
  shade500: OklchColor;
  /** Shade `600` OKLCH coordinates (used as `--color-kumo-brand` primary base). */
  shade600: OklchColor;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Tolerance for floating-point rounding when checking sRGB `[0, 1]` gamut bounds. */
const GAMUT_EPSILON = 1e-4;

/** Number of binary-search bisection steps for sRGB chroma gamut mapping. */
const CHROMA_SEARCH_STEPS = 24;

/** Upper bound for OKLCH chroma search. */
const MAX_SEARCH_CHROMA = 0.4;

/** Base dark-slate neutral surface tokens. */
export const BASE_DARK: BaseDarkPalette = {
  bevelHighlight: 'rgba(255, 255, 255, 0.28)',
  bgBottom: '#0f1118',
  bgTop: '#161923',
  borderNeutral: '#262b38',
  innerHighlight: 'rgba(255, 255, 255, 0.09)',
  textMuted: '#9ca3af',
  textPrimary: '#f3f4f6',
};

/**
 * Official Tailwind CSS v4 OKLCH color scales for all 22 families (17 chromatic + 5 neutral),
 * sorted alphabetically.
 */
const TAILWIND_V4_SCALES: Record<ThemeColorName, TailwindFamilyScale> = {
  amber: {
    shade300: { chroma: 0.169, hue: 91.605, lightness: 87.9 },
    shade400: { chroma: 0.189, hue: 84.429, lightness: 82.8 },
    shade500: { chroma: 0.188, hue: 70.08, lightness: 76.9 },
    shade600: { chroma: 0.179, hue: 58.318, lightness: 66.6 },
  },
  blue: {
    shade300: { chroma: 0.105, hue: 251.813, lightness: 80.9 },
    shade400: { chroma: 0.165, hue: 254.624, lightness: 70.7 },
    shade500: { chroma: 0.214, hue: 259.815, lightness: 62.3 },
    shade600: { chroma: 0.245, hue: 262.881, lightness: 54.6 },
  },
  cyan: {
    shade300: { chroma: 0.127, hue: 207.078, lightness: 86.5 },
    shade400: { chroma: 0.154, hue: 211.53, lightness: 78.9 },
    shade500: { chroma: 0.143, hue: 215.221, lightness: 71.5 },
    shade600: { chroma: 0.126, hue: 221.723, lightness: 60.9 },
  },
  emerald: {
    shade300: { chroma: 0.143, hue: 164.978, lightness: 84.5 },
    shade400: { chroma: 0.177, hue: 163.223, lightness: 76.5 },
    shade500: { chroma: 0.17, hue: 162.48, lightness: 69.6 },
    shade600: { chroma: 0.145, hue: 163.225, lightness: 59.6 },
  },
  fuchsia: {
    shade300: { chroma: 0.145, hue: 321.434, lightness: 83.3 },
    shade400: { chroma: 0.238, hue: 322.16, lightness: 74 },
    shade500: { chroma: 0.295, hue: 322.15, lightness: 66.7 },
    shade600: { chroma: 0.293, hue: 322.896, lightness: 59.1 },
  },
  gray: {
    isNeutral: true,
    shade300: { chroma: 0.01, hue: 258.338, lightness: 87.2 },
    shade400: { chroma: 0.022, hue: 261.325, lightness: 70.7 },
    shade500: { chroma: 0.027, hue: 264.364, lightness: 55.1 },
    shade600: { chroma: 0.03, hue: 256.802, lightness: 44.6 },
  },
  green: {
    shade300: { chroma: 0.15, hue: 154.449, lightness: 87.1 },
    shade400: { chroma: 0.209, hue: 151.711, lightness: 79.2 },
    shade500: { chroma: 0.219, hue: 149.579, lightness: 72.3 },
    shade600: { chroma: 0.194, hue: 149.214, lightness: 62.7 },
  },
  indigo: {
    shade300: { chroma: 0.115, hue: 274.713, lightness: 78.5 },
    shade400: { chroma: 0.182, hue: 276.935, lightness: 67.3 },
    shade500: { chroma: 0.233, hue: 277.117, lightness: 58.5 },
    shade600: { chroma: 0.262, hue: 276.966, lightness: 51.1 },
  },
  lime: {
    shade300: { chroma: 0.196, hue: 126.665, lightness: 89.7 },
    shade400: { chroma: 0.238, hue: 128.85, lightness: 84.1 },
    shade500: { chroma: 0.233, hue: 130.85, lightness: 76.8 },
    shade600: { chroma: 0.2, hue: 131.684, lightness: 64.8 },
  },
  neutral: {
    isNeutral: true,
    shade300: { chroma: 0, hue: 0, lightness: 87 },
    shade400: { chroma: 0, hue: 0, lightness: 70.8 },
    shade500: { chroma: 0, hue: 0, lightness: 55.6 },
    shade600: { chroma: 0, hue: 0, lightness: 43.9 },
  },
  orange: {
    shade300: { chroma: 0.128, hue: 66.29, lightness: 83.7 },
    shade400: { chroma: 0.183, hue: 55.934, lightness: 75 },
    shade500: { chroma: 0.213, hue: 47.604, lightness: 70.5 },
    shade600: { chroma: 0.222, hue: 41.116, lightness: 64.6 },
  },
  pink: {
    shade300: { chroma: 0.12, hue: 346.018, lightness: 82.3 },
    shade400: { chroma: 0.202, hue: 349.761, lightness: 71.8 },
    shade500: { chroma: 0.241, hue: 354.308, lightness: 65.6 },
    shade600: { chroma: 0.249, hue: 0.584, lightness: 59.2 },
  },
  purple: {
    shade300: { chroma: 0.119, hue: 306.383, lightness: 82.7 },
    shade400: { chroma: 0.203, hue: 305.504, lightness: 71.4 },
    shade500: { chroma: 0.265, hue: 303.9, lightness: 62.7 },
    shade600: { chroma: 0.288, hue: 302.321, lightness: 55.8 },
  },
  red: {
    shade300: { chroma: 0.114, hue: 19.571, lightness: 80.8 },
    shade400: { chroma: 0.191, hue: 22.216, lightness: 70.4 },
    shade500: { chroma: 0.237, hue: 25.331, lightness: 63.7 },
    shade600: { chroma: 0.245, hue: 27.325, lightness: 57.7 },
  },
  rose: {
    shade300: { chroma: 0.117, hue: 11.638, lightness: 81 },
    shade400: { chroma: 0.194, hue: 13.428, lightness: 71.2 },
    shade500: { chroma: 0.246, hue: 16.439, lightness: 64.5 },
    shade600: { chroma: 0.253, hue: 17.585, lightness: 58.6 },
  },
  sky: {
    shade300: { chroma: 0.111, hue: 230.318, lightness: 82.8 },
    shade400: { chroma: 0.16, hue: 232.661, lightness: 74.6 },
    shade500: { chroma: 0.169, hue: 237.323, lightness: 68.5 },
    shade600: { chroma: 0.158, hue: 241.966, lightness: 58.8 },
  },
  slate: {
    isNeutral: true,
    shade300: { chroma: 0.022, hue: 252.894, lightness: 86.9 },
    shade400: { chroma: 0.04, hue: 256.788, lightness: 70.4 },
    shade500: { chroma: 0.046, hue: 257.417, lightness: 55.4 },
    shade600: { chroma: 0.043, hue: 257.281, lightness: 44.6 },
  },
  stone: {
    isNeutral: true,
    shade300: { chroma: 0.005, hue: 56.366, lightness: 86.9 },
    shade400: { chroma: 0.01, hue: 56.259, lightness: 70.9 },
    shade500: { chroma: 0.013, hue: 58.071, lightness: 55.3 },
    shade600: { chroma: 0.011, hue: 73.639, lightness: 44.4 },
  },
  teal: {
    shade300: { chroma: 0.138, hue: 181.071, lightness: 85.5 },
    shade400: { chroma: 0.152, hue: 181.912, lightness: 77.7 },
    shade500: { chroma: 0.14, hue: 182.503, lightness: 70.4 },
    shade600: { chroma: 0.118, hue: 184.704, lightness: 60 },
  },
  violet: {
    shade300: { chroma: 0.111, hue: 293.571, lightness: 81.1 },
    shade400: { chroma: 0.183, hue: 293.541, lightness: 70.2 },
    shade500: { chroma: 0.25, hue: 292.717, lightness: 60.6 },
    shade600: { chroma: 0.281, hue: 293.009, lightness: 54.1 },
  },
  yellow: {
    shade300: { chroma: 0.182, hue: 98.111, lightness: 90.5 },
    shade400: { chroma: 0.199, hue: 91.936, lightness: 85.2 },
    shade500: { chroma: 0.184, hue: 86.047, lightness: 79.5 },
    shade600: { chroma: 0.162, hue: 75.834, lightness: 68.1 },
  },
  zinc: {
    isNeutral: true,
    shade300: { chroma: 0.006, hue: 286.286, lightness: 87.1 },
    shade400: { chroma: 0.015, hue: 286.067, lightness: 70.5 },
    shade500: { chroma: 0.016, hue: 285.938, lightness: 55.2 },
    shade600: { chroma: 0.017, hue: 285.786, lightness: 44.2 },
  },
};

/** All 22 Tailwind v4 theme color names in canonical rainbow + neutral order. */
export const THEME_COLOR_NAMES: readonly ThemeColorName[] = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
];

/** Internal cache for lazily computed theme palettes. */
const PALETTE_CACHE: Partial<Record<ThemeColorName, ThemePalette>> = {};

// -------------------------------------- INTERNALS --------------------------------------

/** Convert a linear-light sRGB channel (`0`–`1`) to gamma-encoded sRGB (`0`–`1`). */
function fromLinearChannel(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** Convert a clamped `0`–`1` channel value into a 2-digit lowercase hex byte. */
function toHexByte(channel: number): string {
  return Math.round(Math.min(1, Math.max(0, channel)) * 255)
    .toString(16)
    .padStart(2, '0');
}

/** Convert OKLCH coordinates to linear-light sRGB channels (may exceed `[0, 1]` outside sRGB gamut). */
function oklchToLinearRgb(color: OklchColor): RgbTuple {
  const unitLightness = color.lightness / 100;
  const hueRadians = (color.hue * Math.PI) / 180;
  const okA = color.chroma * Math.cos(hueRadians);
  const okB = color.chroma * Math.sin(hueRadians);

  const lmsL = (unitLightness + 0.3963377774 * okA + 0.2158037573 * okB) ** 3;
  const lmsM = (unitLightness - 0.1055613458 * okA - 0.0638541728 * okB) ** 3;
  const lmsS = (unitLightness - 0.0894841775 * okA - 1.291485548 * okB) ** 3;

  return [
    4.0767416621 * lmsL - 3.3077115913 * lmsM + 0.2309699292 * lmsS,
    -1.2684380046 * lmsL + 2.6097574011 * lmsM - 0.3413193965 * lmsS,
    -0.0041960863 * lmsL - 0.7034186147 * lmsM + 1.707614701 * lmsS,
  ];
}

/** Check whether linear-light sRGB channels fall within the displayable sRGB gamut. */
function isInSrgbGamut(linearRgb: RgbTuple): boolean {
  return (
    linearRgb[0] >= -GAMUT_EPSILON &&
    linearRgb[0] <= 1 + GAMUT_EPSILON &&
    linearRgb[1] >= -GAMUT_EPSILON &&
    linearRgb[1] <= 1 + GAMUT_EPSILON &&
    linearRgb[2] >= -GAMUT_EPSILON &&
    linearRgb[2] <= 1 + GAMUT_EPSILON
  );
}

/** Find the maximum in-gamut sRGB chroma for a given OKLCH lightness percentage and hue via bisection. */
function findMaxSrgbChroma(lightness: number, hue: number): number {
  let low = 0;
  let high = MAX_SEARCH_CHROMA;
  for (let step = 0; step < CHROMA_SEARCH_STEPS; step += 1) {
    const mid = (low + high) / 2;
    if (isInSrgbGamut(oklchToLinearRgb({ chroma: mid, hue, lightness }))) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return low;
}

/** Convert an OKLCH color to sRGB gamma-encoded channels (`0`–`1`), gamut-mapping chroma if needed. */
function oklchToSrgbChannels(color: OklchColor): RgbTuple {
  const initialLinear = oklchToLinearRgb(color);
  const inGamutLinear = isInSrgbGamut(initialLinear)
    ? initialLinear
    : oklchToLinearRgb({
        chroma: findMaxSrgbChroma(color.lightness, color.hue),
        hue: color.hue,
        lightness: color.lightness,
      });

  return [
    fromLinearChannel(inGamutLinear[0]),
    fromLinearChannel(inGamutLinear[1]),
    fromLinearChannel(inGamutLinear[2]),
  ];
}

/** Convert an OKLCH color to a `#rrggbb` sRGB hex string. */
function oklchToHex(color: OklchColor): string {
  const [red, green, blue] = oklchToSrgbChannels(color);
  return `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`;
}

/** Convert an OKLCH color and alpha opacity into a CSS `rgba(r, g, b, alpha)` string. */
function oklchToRgba(color: OklchColor, alpha: number): string {
  const [red, green, blue] = oklchToSrgbChannels(color);
  const redByte = Math.round(Math.min(1, Math.max(0, red)) * 255);
  const greenByte = Math.round(Math.min(1, Math.max(0, green)) * 255);
  const blueByte = Math.round(Math.min(1, Math.max(0, blue)) * 255);
  return `rgba(${redByte}, ${greenByte}, ${blueByte}, ${alpha})`;
}

/**
 * Compute `color-mix(in oklch, baseColor, white weight)` in perceptual OKLCH space.
 * Because white is achromatic (`chroma = 0`, powerless hue), hue is preserved.
 */
function mixOklchWithWhite(baseColor: OklchColor, whiteWeight: number): OklchColor {
  const baseWeight = 1 - whiteWeight;
  return {
    chroma: baseColor.chroma * baseWeight,
    hue: baseColor.hue,
    lightness: baseColor.lightness * baseWeight + 100 * whiteWeight,
  };
}

/**
 * Compute `color-mix(in oklch, baseColor, black weight)` in perceptual OKLCH space.
 * Because black is achromatic (`chroma = 0`, powerless hue), hue is preserved.
 */
function mixOklchWithBlack(baseColor: OklchColor, blackWeight: number): OklchColor {
  const baseWeight = 1 - blackWeight;
  return {
    chroma: baseColor.chroma * baseWeight,
    hue: baseColor.hue,
    lightness: baseColor.lightness * baseWeight,
  };
}

/** Build and memoize the full `ThemePalette` for a Tailwind v4 color family on first use. */
function getOrBuildPalette(colorName: ThemeColorName): ThemePalette {
  const cached = PALETTE_CACHE[colorName];
  if (cached) {
    return cached;
  }

  const scale = TAILWIND_V4_SCALES[colorName];
  const isNeutral = Boolean(scale.isNeutral);
  const brand = scale.shade600;
  const tintSeed = isNeutral ? scale.shade400 : scale.shade500;

  const palette: ThemePalette = {
    accentText: oklchToHex(isNeutral ? scale.shade300 : scale.shade400),
    borderColor: oklchToRgba(tintSeed, isNeutral ? 0.35 : 0.45),
    emphasisBg: oklchToHex(mixOklchWithWhite(brand, 0.3)),
    emphasisRing: oklchToHex(mixOklchWithBlack(brand, 0.1)),
    glowColor: oklchToHex(scale.shade500),
    gradEnd: oklchToHex(brand),
    gradStart: oklchToHex(mixOklchWithWhite(brand, 0.15)),
    iconColor: oklchToHex(scale.shade400),
    tintBg: oklchToRgba(tintSeed, isNeutral ? 0.14 : 0.16),
  };

  PALETTE_CACHE[colorName] = palette;
  return palette;
}

/** Create a lazily-evaluated `Record<ThemeColorName, ThemePalette>` map with enumerable keys. */
function createLazyThemesMap(): Record<ThemeColorName, ThemePalette> {
  const target = {} as Record<ThemeColorName, ThemePalette>;
  for (const colorName of THEME_COLOR_NAMES) {
    Object.defineProperty(target, colorName, {
      enumerable: true,
      get(): ThemePalette {
        return getOrBuildPalette(colorName);
      },
    });
  }
  return target;
}

/** Create a lazily-evaluated `Record<DotState, string>` map for pulsing status indicator dots. */
function createLazyDotColorsMap(): Record<DotState, string> {
  const target = {} as Record<DotState, string>;
  for (const colorName of THEME_COLOR_NAMES) {
    Object.defineProperty(target, colorName, {
      enumerable: true,
      get(): string {
        return getOrBuildPalette(colorName).glowColor;
      },
    });
  }
  return target;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Named Tailwind v4 theme color palettes, lazily computed in OKLCH on first access. */
export const THEMES: Record<ThemeColorName, ThemePalette> = createLazyThemesMap();

/** Hex colors for animated pulsing status indicator dots across all 22 Tailwind v4 families. */
export const DOT_COLORS: Record<DotState, string> = createLazyDotColorsMap();

/**
 * Resolve a raw color query parameter to a valid `ThemeColorName`.
 * @param input      Raw color query parameter (`?c=`).
 * @param fallback   Fallback color token when `input` is missing or unknown.
 * @returns The resolved `ThemeColorName`.
 */
export function resolveColor(input?: string, fallback: ThemeColorName = 'indigo'): ThemeColorName {
  if (!input) {
    return fallback;
  }
  const key = input.toLowerCase() as ThemeColorName;
  return key in TAILWIND_V4_SCALES ? key : fallback;
}
