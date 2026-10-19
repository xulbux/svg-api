/**
 * Browser script types – Global JSDoc types shared by the `*.client.js` scripts (type-checked by `tsconfig.client.json`).
 */

/** Site-wide client configuration rendered into the `#site-config` JSON element. */
interface SiteClientConfig {
  /** `localStorage` key of the persisted preview stage background. */
  previewBgStorageKey: string;
  /** Allowed preview stage background values (the first one is the default and removes the attribute). */
  previewBgValues: string[];
  /** `localStorage` key of the persisted color scheme override. */
  schemeStorageKey: string;
}

/** Pure URL builder helpers exposed for the test suite when the builder script runs without a DOM. */
// oxlint-disable-next-line no-var, vars-on-top, no-implicit-globals -- Ambient `globalThis` properties must be declared with `var`.
declare var svgBuilderCore: unknown;
