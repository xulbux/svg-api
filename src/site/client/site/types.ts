/**
 * Browser Client Types
 *
 * Shared global and helper interfaces for the site and builder client scripts.
 */

import type { BuilderClientCore, SiteClientCore, SvgSite as SharedSvgSite } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

export type {
  BuilderClientCore,
  PopoverAnchorRect,
  PopoverPlacement,
  PopoverPlacementOptions,
  PopoverSize,
  SiteClientConfig,
  SiteClientCore,
} from '@/types';

/** Popover and clipboard helpers exposed by the site script for page scripts (`globalThis.svgSite`). */
export type SvgSite = SharedSvgSite<Element, HTMLElement>;

declare global {
  // oxlint-disable-next-line no-var, vars-on-top -- Ambient `globalThis` properties require `var`.
  var svgSite: SvgSite | undefined;
  // oxlint-disable-next-line no-var, vars-on-top -- Ambient `globalThis` properties require `var`.
  var svgSiteCore: SiteClientCore | undefined;
  // oxlint-disable-next-line no-var, vars-on-top -- Ambient `globalThis` properties require `var`.
  var svgBuilderCore: BuilderClientCore | undefined;
}
