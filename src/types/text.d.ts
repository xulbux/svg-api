/**
 * Text module declarations – Website stylesheets (`*.css`), browser scripts (`*.client.js`), and vector assets (`*.svg`) are bundled as plain text.
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

declare module '*.svg' {
  /** Raw SVG document source. */
  const content: string;
  export default content;
}
