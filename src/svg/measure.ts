/**
 * Text measurement – Fast character-width lookup table for accurate SVG pill widths.
 */

// ---------------------------------------- CONSTS ---------------------------------------

/**
 * Character width lookup table in pixels for 11px Inter / Geist / system sans-serif.
 * Avoids heavy font-parsing WASM dependencies while keeping pill alignment exact.
 */
const CHAR_WIDTHS_11PX: Record<string, number> = {
  ' ': 2.8,
  '!': 2.9,
  '"': 4.2,
  '#': 6.8,
  $: 6.2,
  '%': 8.8,
  '&': 7.6,
  "'": 2.4,
  '(': 3.3,
  ')': 3.3,
  '*': 5.2,
  '+': 6.2,
  ',': 2.8,
  '-': 3.6,
  '.': 2.8,
  '/': 4,
  '0': 6.2,
  '1': 5.4,
  '2': 6.1,
  '3': 6.1,
  '4': 6.2,
  '5': 6.1,
  '6': 6.2,
  '7': 5.8,
  '8': 6.2,
  '9': 6.2,
  ':': 2.8,
  ';': 2.8,
  '<': 6.2,
  '=': 6.2,
  '>': 6.2,
  '?': 4.8,
  '@': 9.6,
  A: 6.9,
  B: 7,
  C: 6.9,
  D: 7.7,
  E: 6,
  F: 5.6,
  G: 7.6,
  H: 7.8,
  I: 3.5,
  J: 4.2,
  K: 6.7,
  L: 5.6,
  M: 9.4,
  N: 7.9,
  O: 8.2,
  P: 6.5,
  Q: 8.2,
  R: 6.8,
  S: 6,
  T: 6,
  U: 7.7,
  V: 6.6,
  W: 10.2,
  X: 6.5,
  Y: 6.2,
  Z: 6.2,
  '[': 3.5,
  '\\': 4,
  ']': 3.5,
  '^': 5.8,
  _: 5,
  a: 5.8,
  b: 6.3,
  c: 5.2,
  d: 6.3,
  e: 5.8,
  f: 3.6,
  g: 6.2,
  h: 6.3,
  i: 2.7,
  j: 2.7,
  k: 5.6,
  l: 2.7,
  m: 9.4,
  n: 6.3,
  o: 6.2,
  p: 6.3,
  q: 6.3,
  r: 4.1,
  s: 5.1,
  t: 3.8,
  u: 6.3,
  v: 5.4,
  w: 8.2,
  x: 5.5,
  y: 5.4,
  z: 5,
};

/** Default fallback width in pixels for characters not in `CHAR_WIDTHS_11PX`. */
const DEFAULT_CHAR_WIDTH_11PX = 6.2;

/** Base font size in pixels for the lookup table. */
const BASE_FONT_SIZE = 11;

/** Width multiplier applied when rendering semi-bold (600 weight) text. */
const BOLD_WEIGHT_MULTIPLIER = 1.015;

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
