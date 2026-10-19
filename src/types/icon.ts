/**
 * Icon types – Standalone SVG icon rendering options and resolved icon data.
 */

import type { AnimationMode } from './badge';
import type { ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Supported icon library source types. */
export type IconType = 'lucide' | 'simple';

/** Icon picker sets (`/assets/icons.json`): Lucide stroke icons and brand/tech logos. */
export type IconPickerSetId = 'brands' | 'lucide';

/** SVG icon markup and source type, without horizontal ink bounds. */
export interface IconBody {
  /** Scale factor from the icon body's native coordinate space to `24x24` (`1` for Lucide and Simple Icons, `0.1875` for Devicon Plain). */
  coordScale: number;
  /** Inner SVG elements (without the outer `<svg>` wrapper). */
  innerSvg: string;
  /** Whether the icon uses Lucide strokes or a Simple Icons fill path. */
  type: IconType;
}

/** Resolved SVG icon markup, horizontal visual bounds in `24x24` space, and source type. */
export interface ResolvedIcon extends IconBody {
  /** Rightmost visible horizontal coordinate (`0`–`24`) for exact optical spacing. */
  maxX: number;
  /** Leftmost visible horizontal coordinate (`0`–`24`) for exact optical spacing. */
  minX: number;
}

/** Horizontal ink bounds of an icon body in `24x24` icon space. */
export interface IconXBounds {
  /** Rightmost visible X coordinate. */
  maxX: number;
  /** Leftmost visible X coordinate. */
  minX: number;
}

/** Icon resolution result paired with the canonical slug it was resolved by. */
export interface IconLookup {
  /** Resolved icon data (`undefined` for `'none'`, empty, over-long, or unknown slugs). */
  data: ResolvedIcon | undefined;
  /** Canonical (trimmed, lowercase, alias-resolved) slug used for contextual lookups. */
  key: string;
}

/** Searchable icon picker index served at `/assets/icons.json`. */
export interface IconPickerIndex {
  /** Common slug aliases (`ICON_SLUG_ALIASES`) mapped to their canonical slugs. */
  aliases: Record<string, string>;
  /** Simple Icons aliases mapped to their parent slugs (applied by brand lookups only). */
  brandAliases: Record<string, string>;
  /** Alternative Lucide export names mapped to the slug listed in `sets.lucide`. */
  lucideAliases: Record<string, string>;
  /** Number of icons per body page (`/assets/icons-<set>-<page>.json`). */
  pageSize: number;
  /** Slugs per set in page order. */
  sets: Record<IconPickerSetId, string[]>;
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
