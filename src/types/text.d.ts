/**
 * Text Module Declarations
 *
 * Website stylesheets (`*.css`), browser scripts (`*.client.js`), and pre-packed icon datasets (`*.iconpack`) are bundled as plain text.
 */

// ---------------------------------------- TYPES ----------------------------------------

declare module '*.css' {
  /** Raw stylesheet source. */
  const content: string;
  export default content;
}

declare module '*.client.js' {
  /** Raw browser script source. */
  const content: string;
  export default content;
}

declare module '*.iconpack' {
  /** Pre-packed JSON text payload lazily parsed on first lookup. */
  const content: string;
  export default content;
}
