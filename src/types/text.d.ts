/**
 * Text module declarations – Website stylesheets (`*.css`) and browser scripts (`*.client.js`) are bundled as plain text.
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
