/**
 * OpenType & binary module declarations – Ambient TypeScript declarations for `opentype.js` and bundled Worker `Data` binary modules.
 */

// ---------------------------------------- TYPES ----------------------------------------

declare module '*.ttf' {
  /** Raw font binary imported as a Worker `Data` module. */
  const fontBuffer: ArrayBuffer;
  export default fontBuffer;
}

declare module '*.png' {
  /** Raw PNG image binary imported as a Worker `Data` module. */
  const pngBuffer: ArrayBuffer;
  export default pngBuffer;
}

declare module 'opentype.js' {
  /** Analytical 2D bounding box of a glyph or path. */
  export interface BoundingBox {
    /** Leftmost visible X coordinate. */
    x1: number;
    /** Rightmost visible X coordinate. */
    x2: number;
    /** Topmost visible Y coordinate. */
    y1: number;
    /** Bottommost visible Y coordinate. */
    y2: number;
  }

  /** Single SVG contour command inside `Path.commands`. */
  export type PathCommand =
    | { type: 'M' | 'L'; x: number; y: number }
    | { type: 'Q'; x1: number; y1: number; x: number; y: number }
    | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: 'Z' };

  /** Vector outline path constructed from OpenType glyph contours. */
  export interface Path {
    /** Ordered list of 2D contour commands. */
    commands: PathCommand[];
    /** Calculate the exact analytical Bezier bounding box of this path. */
    getBoundingBox: () => BoundingBox;
  }

  /** Layout options for `Font.getPath` and `Font.getAdvanceWidth`. */
  export interface RenderOptions {
    /** Enable OpenType GPOS/`kern` pair kerning (defaults to `true`). */
    kerning?: boolean;
    /** Additional letter spacing in `em` units (e.g., `-0.01`). */
    letterSpacing?: number;
    /** Additional tracking in `1/1000 em` units. */
    tracking?: number;
  }

  /** Single OpenType glyph with advance width and outline builder. */
  export interface Glyph {
    /** Horizontal advance width in font design units. */
    advanceWidth?: number;
    /** Build a vector `Path` for this glyph positioned at `(originX, baselineY)` at `fontSize`. */
    getPath: (originX?: number, baselineY?: number, fontSize?: number) => Path;
    /** Glyph index in the font (`0` is `.notdef`). */
    index: number;
  }

  /** Subset of the OpenType `OS/2` table used for vertical text metrics. */
  export interface FontOs2Table {
    /** Cap height in font design units. */
    sCapHeight?: number;
    /** Lowercase x-height in font design units. */
    sxHeight?: number;
  }

  /** Parsed OpenType tables exposed on a `Font` instance. */
  export interface FontTables {
    /** Optional `GSUB` glyph substitution table. */
    gsub?: unknown;
    /** `OS/2` table with cap and x-height metrics. */
    os2?: FontOs2Table;
  }

  /** Parsed OpenType font instance. */
  export interface Font {
    /** Typographic ascender in font design units. */
    ascender: number;
    /** Look up the OpenType `Glyph` for a single character (falls back to glyph `0` when missing). */
    charToGlyph: (char: string) => Glyph;
    /** Typographic descender in font design units. */
    descender: number;
    /** Compute total horizontal advance width of `text` at `fontSize`. */
    getAdvanceWidth: (text: string, fontSize?: number, options?: RenderOptions) => number;
    /** Look up the horizontal pair kerning adjustment in font design units between two glyphs. */
    getKerningValue: (leftGlyph: Glyph, rightGlyph: Glyph) => number;
    /** Build a vector `Path` for `text` positioned at `(originX, baselineY)` at `fontSize`. */
    getPath: (
      text: string,
      originX?: number,
      baselineY?: number,
      fontSize?: number,
      options?: RenderOptions
    ) => Path;
    /** Parsed OpenType tables (`os2`, `head`, etc.). */
    tables: FontTables;
    /** Font design units per `em` (typically `1000` or `2048`). */
    unitsPerEm: number;
  }

  /** Parse an `ArrayBuffer` containing a `.ttf`/`.otf`/`.woff` binary into a `Font`. */
  export function parse(buffer: ArrayBuffer): Font;
}
