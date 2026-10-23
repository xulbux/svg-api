/**
 * Server JSX barrel – Re-exports the synchronous JSX serializer and types (`src/site/jsx/`).
 */

// -------------------------------------- PUBLIC API -------------------------------------

export { Fragment, jsx, jsxs, raw, renderHtml } from '@/site/jsx/jsx-runtime';
export type {
  FunctionComponent,
  HtmlFragment,
  IntrinsicElementAttributes,
  JsxChild,
  JSX,
} from '@/site/jsx/jsx-runtime';
