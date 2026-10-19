/**
 * Icon types – Standalone SVG icon rendering options and resolved icon data.
 */

import type { AnimationMode } from './badge';
import type { ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Supported icon library source types. */
export type IconType = 'lucide' | 'simple';

/** Resolved SVG icon markup, horizontal visual bounds in `24x24` space, and source type. */
export interface ResolvedIcon {
  /** Scale factor from the icon body's native coordinate space to `24x24` (`1` for Lucide and Simple Icons, `0.1875` for Devicon Plain). */
  coordScale: number;
  /** Inner SVG elements (without the outer `<svg>` wrapper). */
  innerSvg: string;
  /** Rightmost visible horizontal coordinate (`0`–`24`) for exact optical spacing. */
  maxX: number;
  /** Leftmost visible horizontal coordinate (`0`–`24`) for exact optical spacing. */
  minX: number;
  /** Whether the icon uses Lucide strokes or a Simple Icons fill path. */
  type: IconType;
}

/** Options for rendering a standalone SVG icon via `renderIcon`. */
export interface IconRenderOptions {
  /** Optional micro-animation control mode (defaults to `'default'`, i.e., a static icon). */
  anim?: AnimationMode;
  /** Named Tailwind v4 theme color token (defaults to `'indigo'`). */
  color: ThemeColorName;
  /** Icon slug from Lucide or Simple Icons (e.g., `'globe-code'`, `'rocket'`, `'archlinux'`). */
  icon: string;
  /** Width and height of the rendered SVG in pixels (`8`–`256`; Defaults to `24`). */
  size?: number;
  /** Stroke width for Lucide icons in `24x24` viewBox units (`1`–`4`; Defaults to `2.25`). */
  strokeWidth?: number;
}
