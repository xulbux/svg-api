/**
 * Colors documentation catalog – Primary and secondary OKLCH theme color swatch cards for `/docs/colors`.
 */

import { THEME_COLOR_NAMES } from '@/config/theme';
import type { ShowcaseCardConfig, ShowcaseItem } from '@/types';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the primary (`variant=1`) and secondary (`variant=2`) OKLCH color swatch cards for `/docs/colors`.
 * @returns Showcase card configurations for the color palette page.
 */
export function buildColorSwatchCards(): ShowcaseCardConfig[] {
  const primaryItems: ShowcaseItem[] = [];
  const secondaryItems: ShowcaseItem[] = [];
  for (const colorName of THEME_COLOR_NAMES) {
    primaryItems.push({
      alt: `${colorName} primary`,
      path: `/badge/Color/${colorName}?icon=sparkles&color=${colorName}&variant=1`,
    });
    secondaryItems.push({
      alt: `${colorName} secondary`,
      path: `/badge/Theme/${colorName}?icon=sparkles&color=${colorName}&variant=2`,
    });
  }
  const colorCount = THEME_COLOR_NAMES.length;
  return [
    {
      items: primaryItems,
      subtitle: `All ${colorCount} color tokens rendered with variant=1 (3D brand gradient right cap).`,
      title: 'Primary Gradient Swatches (?variant=1)',
    },
    {
      items: secondaryItems,
      subtitle: `All ${colorCount} color tokens rendered with variant=2 (tinted dark surface + border).`,
      title: 'Secondary Tinted Swatches (?variant=2)',
    },
  ];
}
