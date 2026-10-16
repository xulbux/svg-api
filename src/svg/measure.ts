/**
 * Text measurement – Fast character-width lookup table for accurate SVG pill widths.
 */

// ---------------------------------------- CONSTS ---------------------------------------

/**
 * Character width lookup table in pixels for 11px Inter / Geist / system sans-serif.
 * Avoids heavy font-parsing WASM dependencies while keeping pill alignment exact.
 */
const CHAR_WIDTHS_11PX: Record<string, number> = {
  ' ': 3.2,
  '!': 3.4,
  '"': 4.2,
  '#': 7,
  $: 6.4,
  '%': 8.8,
  '&': 7.4,
  "'": 2.6,
  '(': 3.8,
  ')': 3.8,
  '*': 4.8,
  '+': 6.4,
  ',': 3,
  '-': 4.2,
  '.': 3,
  '/': 4.2,
  '0': 6.5,
  '1': 5.4,
  '2': 6.3,
  '3': 6.3,
  '4': 6.5,
  '5': 6.3,
  '6': 6.5,
  '7': 5.9,
  '8': 6.5,
  '9': 6.5,
  ':': 3.2,
  ';': 3.2,
  '<': 6.4,
  '=': 6.4,
  '>': 6.4,
  '?': 5.6,
  '@': 9.8,
  A: 7.3,
  B: 7.1,
  C: 7.4,
  D: 7.6,
  E: 6.5,
  F: 6.1,
  G: 7.8,
  H: 7.7,
  I: 3.3,
  J: 5.5,
  K: 7.1,
  L: 6,
  M: 9.1,
  N: 7.7,
  O: 8,
  P: 6.8,
  Q: 8,
  R: 7.1,
  S: 6.8,
  T: 6.6,
  U: 7.6,
  V: 7.2,
  W: 10.2,
  X: 7.1,
  Y: 6.9,
  Z: 6.7,
  '[': 3.8,
  '\\': 4.2,
  ']': 3.8,
  '^': 5.6,
  _: 5.8,
  a: 6,
  b: 6.4,
  c: 5.6,
  d: 6.4,
  e: 6,
  f: 3.8,
  g: 6.3,
  h: 6.2,
  i: 2.7,
  j: 2.8,
  k: 5.7,
  l: 2.7,
  m: 9.3,
  n: 6.2,
  o: 6.3,
  p: 6.4,
  q: 6.4,
  r: 4.1,
  s: 5.4,
  t: 4.1,
  u: 6.2,
  v: 5.7,
  w: 8.3,
  x: 5.6,
  y: 5.7,
  z: 5.3,
};

/** Default fallback width in pixels for characters not in `CHAR_WIDTHS_11PX`. */
const DEFAULT_CHAR_WIDTH_11PX = 6.4;

/** Base font size in pixels for the lookup table. */
const BASE_FONT_SIZE = 11;

/** Width multiplier applied when rendering bold (600 weight) text. */
const BOLD_WEIGHT_MULTIPLIER = 1.045;

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
