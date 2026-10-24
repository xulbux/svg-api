/**
 * Icon types – Standalone SVG icon rendering options and resolved icon data.
 */

import type { AnimationMode } from './badge';
import type { ThemeColorName } from './theme';

// ---------------------------------------- TYPES ----------------------------------------

/** Supported icon library source types. */
export type IconType = 'lucide' | 'simple';

/** Icon picker sets: UI stroke icons and brand/tech logos. */
export type IconPickerSetId = 'brands' | 'lucide';

/** SVG icon markup and source type, without horizontal ink bounds. */
export interface IconBody {
  /** Horizontal offset in `24x24` icon units applied before `coordScale` (`0` when omitted). */
  coordOffsetX?: number;
  /** Scale factor normalizing the icon body's native coordinate space to `24x24`. */
  coordScale: number;
  /** Inner SVG elements (without the outer `<svg>` wrapper). */
  innerSvg: string;
  /** Whether the icon renders as strokes or filled paths. */
  type: IconType;
}

/** Resolved SVG icon markup, horizontal visual bounds in `24x24` space, and source type. */
export interface ResolvedIcon extends IconBody {
  /** Rightmost visible horizontal coordinate in `24x24` icon space for optical spacing. */
  maxX: number;
  /** Leftmost visible horizontal coordinate in `24x24` icon space for optical spacing. */
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

/** Searchable icon picker index served as a static JSON asset. */
export interface IconPickerIndex {
  /** Common slug aliases mapped to their canonical slugs. */
  aliases: Record<string, string>;
  /** Brand icon aliases mapped to their parent slugs (applied by brand lookups only). */
  brandAliases: Record<string, string>;
  /** Alternative stroke icon export names mapped to the slug listed in `sets.lucide`. */
  lucideAliases: Record<string, string>;
  /** Space-separated lowercase search tags keyed by stroke icon slug. */
  lucideTags: Record<string, string>;
  /** Number of icons per paginated body asset. */
  pageSize: number;
  /** Slugs per set in page order. */
  sets: Record<IconPickerSetId, string[]>;
}

/** Options for rendering a standalone SVG icon via `renderIcon`. */
export interface IconRenderOptions {
  /** Optional micro-animation control mode. */
  anim?: AnimationMode;
  /** Named Tailwind v4 theme color token. */
  color: ThemeColorName;
  /** Bundled stroke or brand icon slug (e.g., `'globe-code'`, `'rocket'`, `'archlinux'`). */
  icon: string;
  /** Intrinsic width and height of the rendered SVG in pixels. */
  size?: number;
  /** Stroke width for stroke icons in `24x24` viewBox units. */
  strokeWidth?: number;
}
