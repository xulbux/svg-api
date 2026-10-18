/**
 * Text measurement – Calibrated 500-weight and 600-weight character advance lookup tables for accurate SVG pill widths.
 */

// ---------------------------------------- CONSTS ---------------------------------------

/**
 * Calibrated character advance lookup table in pixels at `11px` `font-weight: 500` (`letter-spacing: -0.01em`).
 */
const CHAR_WIDTHS_500_11PX: Readonly<Record<string, number>> = {
  ' ': 2.95,
  '!': 2.95,
  '"': 3.8,
  '#': 6.01,
  $: 6.01,
  '%': 9.67,
  '&': 7.23,
  "'": 1.99,
  '(': 3.56,
  ')': 3.56,
  '*': 4.17,
  '+': 6.32,
  ',': 2.95,
  '-': 3.56,
  '.': 2.95,
  '/': 2.95,
  '0': 6.01,
  '1': 5.28,
  '2': 6.01,
  '3': 6.01,
  '4': 6.01,
  '5': 6.01,
  '6': 6.01,
  '7': 6.01,
  '8': 6.01,
  '9': 6.01,
  ':': 2.95,
  ';': 2.95,
  '<': 6.32,
  '=': 6.32,
  '>': 6.32,
  '?': 6.01,
  '@': 11.06,
  A: 7.23,
  B: 7.23,
  C: 7.84,
  D: 7.84,
  E: 7.23,
  F: 6.61,
  G: 8.45,
  H: 7.84,
  I: 2.95,
  J: 5.39,
  K: 7.23,
  L: 6.01,
  M: 9.06,
  N: 7.84,
  O: 8.45,
  P: 7.23,
  Q: 8.45,
  R: 7.84,
  S: 7.23,
  T: 6.61,
  U: 7.84,
  V: 7.23,
  W: 10.28,
  X: 7.23,
  Y: 7.23,
  Z: 6.61,
  '[': 2.95,
  '\\': 2.95,
  ']': 2.95,
  '^': 5.05,
  _: 6.01,
  '`': 3.56,
  a: 6.01,
  b: 6.01,
  c: 5.39,
  d: 6.01,
  e: 6.01,
  f: 2.77,
  g: 6.01,
  h: 6.01,
  i: 2.34,
  j: 2.34,
  k: 5.39,
  l: 2.34,
  m: 9.06,
  n: 6.01,
  o: 6.01,
  p: 6.01,
  q: 6.01,
  r: 3.56,
  s: 5.39,
  t: 2.95,
  u: 6.01,
  v: 5.39,
  w: 7.84,
  x: 5.39,
  y: 5.39,
  z: 5.39,
  '{': 3.57,
  '|': 2.75,
  '}': 3.57,
  '~': 6.32,
};

/**
 * Calibrated character advance lookup table in pixels at `11px` `font-weight: 600` (`letter-spacing: -0.01em`).
 */
const CHAR_WIDTHS_600_11PX: Readonly<Record<string, number>> = {
  ' ': 2.94,
  '!': 3.55,
  '"': 5.1,
  '#': 6.01,
  $: 6.01,
  '%': 9.67,
  '&': 7.83,
  "'": 2.5,
  '(': 3.55,
  ')': 3.55,
  '*': 4.17,
  '+': 6.31,
  ',': 2.94,
  '-': 3.55,
  '.': 2.94,
  '/': 2.94,
  '0': 6.01,
  '1': 5.46,
  '2': 6.01,
  '3': 6.01,
  '4': 6.01,
  '5': 6.01,
  '6': 6.01,
  '7': 6.01,
  '8': 6.01,
  '9': 6.01,
  ':': 3.55,
  ';': 3.55,
  '<': 6.31,
  '=': 6.31,
  '>': 6.31,
  '?': 6.61,
  '@': 10.61,
  A: 7.83,
  B: 7.83,
  C: 7.83,
  D: 7.83,
  E: 7.23,
  F: 6.61,
  G: 8.44,
  H: 7.83,
  I: 2.94,
  J: 6.01,
  K: 7.83,
  L: 6.61,
  M: 9.05,
  N: 7.83,
  O: 8.44,
  P: 7.23,
  Q: 8.44,
  R: 7.83,
  S: 7.23,
  T: 6.61,
  U: 7.83,
  V: 7.23,
  W: 10.27,
  X: 7.23,
  Y: 7.23,
  Z: 6.61,
  '[': 3.55,
  '\\': 2.94,
  ']': 3.55,
  '^': 6.31,
  _: 6.01,
  '`': 3.55,
  a: 6.01,
  b: 6.61,
  c: 6.01,
  d: 6.61,
  e: 6.01,
  f: 3.55,
  g: 6.61,
  h: 6.61,
  i: 2.94,
  j: 2.94,
  k: 6.01,
  l: 2.94,
  m: 9.67,
  n: 6.61,
  o: 6.61,
  p: 6.61,
  q: 6.61,
  r: 4.17,
  s: 6.01,
  t: 3.55,
  u: 6.61,
  v: 6.01,
  w: 8.44,
  x: 6.01,
  y: 6.01,
  z: 5.39,
  '{': 4.17,
  '|': 2.97,
  '}': 4.17,
  '~': 6.31,
};

/** Default fallback width in pixels for characters not in the lookup tables. */
const DEFAULT_CHAR_WIDTH_11PX = 6.01;

/** Base font size in pixels for the lookup tables. */
const BASE_FONT_SIZE = 11;

/** Outer left+right glyph sidebearing trim at `11px` so measured width matches visible ink bounds. */
const OUTER_SIDEBEARING_TRIM_11PX = 1.2;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Calculate the visible pixel width of a text string at a given font size and weight.
 * @param text       Text string to measure.
 * @param fontSize   Font size in pixels (defaults to `11`).
 * @param isBold     Whether the text is rendered with semi-bold (`600`) weight.
 * @returns Rounded-up width in pixels.
 */
export function measureTextWidth(text: string, fontSize = 11, isBold = false): number {
  if (text.length === 0) {
    return 0;
  }
  const scale = fontSize / BASE_FONT_SIZE;
  const table = isBold ? CHAR_WIDTHS_600_11PX : CHAR_WIDTHS_500_11PX;
  let total = 0;
  for (const char of text) {
    total += table[char] ?? DEFAULT_CHAR_WIDTH_11PX;
  }
  const visibleTotal = Math.max(1, total - OUTER_SIDEBEARING_TRIM_11PX);
  return Math.round(visibleTotal * scale);
}
