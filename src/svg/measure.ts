/**
 * Text measurement – Fast character-width lookup table for accurate SVG pill widths.
 */

// ---------------------------------------- CONSTS ---------------------------------------

/**
 * Character width lookup table in pixels for 11px Inter / Geist / system sans-serif.
 * Avoids heavy font-parsing WASM dependencies while keeping pill alignment exact.
 */
const CHAR_WIDTHS_11PX: Record<string, number> = {
  ' ': 2.75,
  '!': 2.89,
  '"': 4.61,
  '#': 7,
  $: 6.18,
  '%': 9.26,
  '&': 8,
  "'": 2.5,
  '(': 3.32,
  ')': 3.32,
  '*': 5.92,
  '+': 6.18,
  ',': 2.89,
  '-': 3.42,
  '.': 2.88,
  '/': 4.12,
  '0': 6.18,
  '1': 6.18,
  '2': 6.18,
  '3': 6.18,
  '4': 6.18,
  '5': 6.18,
  '6': 6.18,
  '7': 6.18,
  '8': 6.18,
  '9': 6.18,
  ':': 2.88,
  ';': 2.89,
  '<': 6.18,
  '=': 6.18,
  '>': 6.18,
  '?': 4.81,
  '@': 9.78,
  A: 7.09,
  B: 7.08,
  C: 6.87,
  D: 7.93,
  E: 6.02,
  F: 5.7,
  G: 7.89,
  H: 8.12,
  I: 3.78,
  J: 3.08,
  K: 6.84,
  L: 5.76,
  M: 9.99,
  N: 8.43,
  O: 8.51,
  P: 6.6,
  Q: 8.51,
  R: 6.84,
  S: 5.94,
  T: 6.07,
  U: 8.01,
  V: 6.66,
  W: 10.24,
  X: 6.61,
  Y: 6.31,
  Z: 6.2,
  '[': 3.52,
  '\\': 4.12,
  ']': 3.52,
  '^': 6.18,
  _: 4.66,
  a: 6.18,
  b: 6.71,
  c: 5.29,
  d: 6.71,
  e: 6.2,
  f: 3.82,
  g: 6.71,
  h: 6.79,
  i: 2.86,
  j: 2.86,
  k: 6.04,
  l: 2.86,
  m: 10.31,
  n: 6.79,
  o: 6.61,
  p: 6.71,
  q: 6.71,
  r: 4.54,
  s: 5.24,
  t: 4.1,
  u: 6.79,
  v: 5.69,
  w: 8.77,
  x: 5.86,
  y: 5.7,
  z: 5.14,
};

/** Default fallback width in pixels for characters not in `CHAR_WIDTHS_11PX`. */
const DEFAULT_CHAR_WIDTH_11PX = 6.2;

/** Base font size in pixels for the lookup table. */
const BASE_FONT_SIZE = 11;

/** Width multiplier applied when rendering semi-bold (600 weight) text. */
const BOLD_WEIGHT_MULTIPLIER = 1.018;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Calculate the pixel width of a text string at a given font size and weight.
 * @param text       Text string to measure.
 * @param fontSize   Font size in pixels (defaults to `11`).
 * @param isBold     Whether the text is rendered with bold (`600`) weight.
 * @returns Rounded-up width in pixels.
 */
export function measureTextWidth(text: string, fontSize = 11, isBold = false): number {
  const scale = fontSize / BASE_FONT_SIZE;
  const weightMultiplier = isBold ? BOLD_WEIGHT_MULTIPLIER : 1;
  let total = 0;
  for (const char of text) {
    total += CHAR_WIDTHS_11PX[char] ?? DEFAULT_CHAR_WIDTH_11PX;
  }
  return Math.ceil(total * scale * weightMultiplier);
}
