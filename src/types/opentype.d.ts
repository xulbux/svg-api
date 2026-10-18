/**
 * Ambient TypeScript declarations for `opentype.js` (`v2.0.0`) and bundled `.ttf` binary modules.
 */

declare module '*.ttf' {
  const fontBuffer: ArrayBuffer;
  export default fontBuffer;
}

declare module 'opentype.js' {
  /** Analytical 2D bounding box of a glyph or path. */
  export interface BoundingBox {
    /** Leftmost visible X coordinate. */
    x1: number;
    /** Topmost visible Y coordinate. */
    y1: number;
    /** Rightmost visible X coordinate. */
    x2: number;
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
    /** Ordered list of 2D contour commands (`M`, `L`, `Q`, `C`, `Z`). */
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

  /** Parsed OpenType font instance. */
  export interface Font {
    /** Typographic ascender in font design units. */
    ascender: number;
    /** Typographic descender in font design units. */
    descender: number;
    /** Font design units per `em` (typically `1000` or `2048`). */
    unitsPerEm: number;
    /** Parsed OpenType tables (`os2`, `head`, etc.). */
    tables: { os2?: { sCapHeight?: number; sxHeight?: number } };
    /** Compute total horizontal advance width of `text` at `fontSize`. */
    getAdvanceWidth: (text: string, fontSize?: number, options?: RenderOptions) => number;
    /** Build a vector `Path` for `text` positioned at `(x, y)` baseline at `fontSize`. */
    getPath: (
      text: string,
      x?: number,
      y?: number,
      fontSize?: number,
      options?: RenderOptions
    ) => Path;
  }

  /** Namespace interface for default `opentype.js` export. */
  interface OpenTypeNamespace {
    /** Parse an `ArrayBuffer` containing a `.ttf`/`.otf`/`.woff` binary into a `Font`. */
    parse: (buffer: ArrayBuffer) => Font;
  }

  const opentype: OpenTypeNamespace;
  export default opentype;
}
