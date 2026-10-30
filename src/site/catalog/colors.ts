/**
 * Colors Documentation Catalog
 *
 * Primary and secondary theme color swatch cards for `/docs/colors`.
 */

import { THEME_COLOR_NAMES } from '@/config/theme';
import type { ShowcaseCardConfig, ShowcaseItem } from '@/types';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the primary (`variant=1`) and secondary (`variant=2`) theme color swatch cards for `/docs/colors`.
 * @returns Showcase card configurations for the color palette page.
 */
export function buildColorSwatchCards(): ShowcaseCardConfig[] {
  const primaryItems: ShowcaseItem[] = [];
  const secondaryItems: ShowcaseItem[] = [];
  for (const colorName of THEME_COLOR_NAMES) {
    primaryItems.push({
      alt: `${colorName} primary`,
      path: `/badge/Color/${colorName}?variant=1&color=${colorName}&icon=sparkles`,
    });
    secondaryItems.push({
      alt: `${colorName} secondary`,
      path: `/badge/Theme/${colorName}?variant=2&color=${colorName}&icon=sparkles`,
    });
  }
  const colorCount = THEME_COLOR_NAMES.length;
  return [
    {
      items: primaryItems,
      subtitle: `All ${colorCount} theme colors in variant=1 (gradient fill).`,
      title: 'Primary Gradient Swatches (?variant=1)',
    },
    {
      items: secondaryItems,
      subtitle: `All ${colorCount} theme colors in variant=2 (tinted dark surface).`,
      title: 'Secondary Tinted Swatches (?variant=2)',
    },
  ];
}
