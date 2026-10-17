/**
 * Standalone SVG icon rendering and icon resolution types.
 */

import type { AnimationMode } from './badge';
import type { ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Supported icon library source types. */
export type IconType = 'lucide' | 'simple';

/** Resolved SVG icon markup and source type. */
export interface ResolvedIcon {
  /** Inner SVG elements (without the outer `<svg>` wrapper). */
  innerSvg: string;
  /** Whether the icon uses Lucide strokes or a Simple Icons fill path. */
  type: IconType;
}

/** Options for rendering a standalone SVG icon via `renderIcon`. */
export interface IconRenderOptions {
  /** Optional micro-animation control mode (defaults to `'auto'`). */
  anim?: AnimationMode;
  /** Named Tailwind v4 theme color token (defaults to `'indigo'`). */
  color: ThemeColorName;
  /** Icon slug from Lucide or Simple Icons (e.g., `'globe-code'`, `'rocket'`, `'archlinux'`). */
  icon: string;
  /** Width and height of the rendered SVG in pixels (`8`–`256`, defaults to `24`). */
  size?: number;
  /** Stroke width for Lucide icons in 24x24 viewBox units (`1`–`4`, defaults to `2.25`). */
  strokeWidth?: number;
}
