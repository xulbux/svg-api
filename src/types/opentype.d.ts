/**
 * OpenType module declarations – Ambient TypeScript declarations for `opentype.js` (`v2.0.0`) and bundled `.ttf` binary modules.
 */

declare module '*.ttf' {
  /** Raw font binary (Wrangler `Data` module rule; Mirrored by the `ttf-arraybuffer` plugin in `vitest.config.mts`). */
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

  /** Subset of the OpenType `OS/2` table used for vertical text metrics. */
  export interface FontOs2Table {
    /** Cap height in font design units. */
    sCapHeight?: number;
    /** Lowercase x-height in font design units. */
    sxHeight?: number;
  }

  /** Parsed OpenType tables used by the text measurement (`os2`). */
  export interface FontTables {
    /** `OS/2` table with cap and x-height metrics. */
    os2?: FontOs2Table;
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
    tables: FontTables;
    /** Compute total horizontal advance width of `text` at `fontSize`. */
    getAdvanceWidth: (text: string, fontSize?: number, options?: RenderOptions) => number;
    /** Build a vector `Path` for `text` positioned at `(originX, baselineY)` at `fontSize`. */
    getPath: (
      text: string,
      originX?: number,
      baselineY?: number,
      fontSize?: number,
      options?: RenderOptions
    ) => Path;
  }

  /** Parse an `ArrayBuffer` containing a `.ttf`/`.otf`/`.woff` binary into a `Font`. */
  export function parse(buffer: ArrayBuffer): Font;
}
