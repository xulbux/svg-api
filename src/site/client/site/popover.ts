/**
 * Popover positioning & fallback – Viewport-clamped popover placement calculation and non-Popover-API browser fallback.
 */

import type {
  PopoverAnchorRect,
  PopoverPlacement,
  PopoverPlacementOptions,
  PopoverSize,
} from '@/site/client/site/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Currently open fallback-positioned popover tracked for scroll repositioning. */
export interface ActivePopoverState {
  /** Trigger or anchor element. */
  anchor: Element;
  /** Placement options used when opening the popover. */
  options: PopoverPlacementOptions;
  /** Open popover element. */
  popover: HTMLElement;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Minimum distance in pixels between a fallback-positioned popover and the viewport edges. */
const VIEWPORT_MARGIN = 8;

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Compute the viewport position of a popover below (or, without room, above) its anchor, clamped to the
 * viewport; Used where CSS anchor positioning is unavailable.
 * @param anchorRect     Anchor bounding rectangle.
 * @param popoverSize    Measured popover size.
 * @param viewportSize   Viewport size.
 * @param options        Placement options (`align`, `gap`, `isWidthMatched`).
 * @returns Clamped `left`, `top`, and optional `minWidth`.
 */
export function computePopoverPlacement(
  anchorRect: PopoverAnchorRect,
  popoverSize: PopoverSize,
  viewportSize: PopoverSize,
  options: PopoverPlacementOptions
): PopoverPlacement {
  const gap = options.gap ?? VIEWPORT_MARGIN;
  const width = options.isWidthMatched
    ? Math.max(popoverSize.width, anchorRect.width)
    : popoverSize.width;
  let top = anchorRect.bottom + gap;
  const hasRoomBelow = top + popoverSize.height <= viewportSize.height - VIEWPORT_MARGIN;
  const aboveTop = anchorRect.top - gap - popoverSize.height;
  if (!hasRoomBelow && aboveTop >= VIEWPORT_MARGIN) {
    top = aboveTop;
  } else if (!hasRoomBelow) {
    top = Math.max(VIEWPORT_MARGIN, viewportSize.height - VIEWPORT_MARGIN - popoverSize.height);
  }
  const preferredLeft = options.align === 'end' ? anchorRect.right - width : anchorRect.left;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(preferredLeft, viewportSize.width - VIEWPORT_MARGIN - width)
  );
  return { left, minWidth: options.isWidthMatched ? anchorRect.width : undefined, top };
}
