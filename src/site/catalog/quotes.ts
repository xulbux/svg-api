/**
 * Quotes Documentation Catalog
 *
 * Vertical and horizontal quote card showcase configs and parameter reference rows for `/docs/quotes`.
 */

import { DEFAULT_THEME_COLOR } from '@/config/theme';
import {
  QUOTE_LAYOUT_TOKENS,
  SIZE_TOKENS,
  TRUTHY_FLAG_LIST,
  VERTICAL_LAYOUT_TOKENS,
} from '@/routes/params';
import { DEFAULT_QUOTE_VARIANT } from '@/routes/svg';
import {
  appendDefaultLabel,
  buildColorParamRow,
  buildSheenAnimParamRow,
  buildVariantParamRow,
  ENCODED_CHAOS_QUOTE,
  formatRange,
} from '@/site/catalog/shared';
import { formatConjunctionList } from '@/site/glossary';
import {
  DEFAULT_HORIZONTAL_QUOTE_SIZE,
  DEFAULT_QUOTE_LAYOUT,
  DEFAULT_VERTICAL_QUOTE_SIZE,
  DEFAULT_VERTICAL_QUOTE_WIDTH,
  QUOTE_FONT_SIZE_RANGE,
  QUOTE_SIZE_MAP,
  QUOTE_WIDTH_RANGE,
} from '@/svg/quote';
import type { ParamTableRow, ShowcaseCardConfig } from '@/types';

// ---------------------------------------- CONSTS ---------------------------------------

/** URL-encoded second sample quote text. */
const ENCODED_EDGE_QUOTE =
  'Always+creating+more+cool+stuff+for+you%2C+with+crisp+colors+and+zero+cold+starts+at+the+edge.';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Build the vertical layout showcase cards for the dedicated `/docs/quotes` page.
 * @returns Showcase card configurations.
 */
export function buildVerticalQuoteCards(): ShowcaseCardConfig[] {
  return [
    {
      isCentered: true,
      items: [
        {
          alt: "XulbuX's Quote",
          path: `/quote/XulbuX/${ENCODED_CHAOS_QUOTE}?layout=vertical&variant=1&color=blue`,
        },
      ],
      subtitle: 'Primary gradient card with centered quote watermarks.',
      title: appendDefaultLabel(
        'variant=1 · Vertical Primary Brand Quote',
        DEFAULT_QUOTE_VARIANT === '1'
      ),
    },
    {
      isCentered: true,
      items: [
        {
          alt: "XulbuX's Quote",
          path: `/quote/XulbuX/${ENCODED_CHAOS_QUOTE}?layout=vertical&variant=2`,
        },
      ],
      subtitle: 'Tinted dark card with an indigo border.',
      title: appendDefaultLabel(
        'variant=2 · Vertical Secondary Tinted Quote',
        DEFAULT_QUOTE_VARIANT === '2'
      ),
    },
    {
      isCentered: true,
      items: [
        {
          alt: "XulbuX's Quote",
          path: `/quote/XulbuX/${ENCODED_CHAOS_QUOTE}?layout=vertical&variant=3&color=cyan`,
        },
      ],
      subtitle: 'Neutral dark card with subtle border and cyan watermarks.',
      title: appendDefaultLabel(
        'variant=3 · Vertical Tertiary Neutral Quote',
        DEFAULT_QUOTE_VARIANT === '3'
      ),
    },
  ];
}

/**
 * Build the horizontal layout showcase cards for the dedicated `/docs/quotes` page.
 * @returns Showcase card configurations.
 */
export function buildHorizontalQuoteCards(): ShowcaseCardConfig[] {
  return [
    {
      items: [{ alt: "XulbuX's Quote", path: `/quote/XulbuX/${ENCODED_CHAOS_QUOTE}?variant=1` }],
      subtitle: 'Horizontal card with a left accent bar and gradient fill.',
      title: appendDefaultLabel(
        'variant=1 · Horizontal Primary Brand Quote',
        DEFAULT_QUOTE_VARIANT === '1'
      ),
    },
    {
      items: [
        {
          alt: "XulbuX's Quote",
          path: `/quote/XulbuX/${ENCODED_CHAOS_QUOTE}?variant=2&color=cyan`,
        },
      ],
      subtitle: 'Horizontal card with a cyan border and left accent bar.',
      title: appendDefaultLabel(
        'variant=2 · Horizontal Secondary Tinted Quote',
        DEFAULT_QUOTE_VARIANT === '2'
      ),
    },
    {
      items: [
        {
          alt: "XulbuX's Quote",
          path: `/quote/${ENCODED_EDGE_QUOTE}?author=XulbuX&variant=3&anim=sheen`,
        },
      ],
      subtitle: 'Single-segment /quote/:text form with ?author= and diagonal sheen (?anim=sheen).',
      title: appendDefaultLabel(
        'variant=3 · Horizontal Tertiary Neutral Quote',
        DEFAULT_QUOTE_VARIANT === '3'
      ),
    },
  ];
}

/**
 * Build the parameter reference rows for `/quote/*` routes.
 * @returns Parameter table rows.
 */
export function buildQuoteParamRows(): ParamTableRow[] {
  const verticalAliases: string[] = [];
  for (const token of VERTICAL_LAYOUT_TOKENS) {
    if (token !== 'vertical') {
      verticalAliases.push(token);
    }
  }
  return [
    {
      defaultVal: '~required',
      description:
        'Author attribution and quote body text (+ or %20 for spaces); The single-segment form reads the author from ?author=.',
      name: ':author / :text',
      values: '/quote/XulbuX/Your+quote+here | /quote/Your+quote+here',
    },
    {
      defaultVal: '~none',
      description:
        'Quote body text when no path segment is given (e.g., /quote?text=Hi&author=XulbuX).',
      name: '?text= / ?quote=',
      values: '~any string',
    },
    {
      defaultVal: '~none',
      description: 'Author attribution for the single-segment /quote/:text and /quote?text= forms.',
      name: '?author=',
      values: '~any string',
    },
    {
      defaultVal: DEFAULT_QUOTE_LAYOUT,
      description: `Layout mode: horizontal (left accent bar) or vertical (centered watermarks); ${formatConjunctionList(verticalAliases)} are vertical aliases, and ?type= is an alias of ?layout= (an empty ?layout= falls through to ?type=).`,
      name: '?layout= / ?type=',
      values: [...QUOTE_LAYOUT_TOKENS, ...verticalAliases].join(' | '),
    },
    {
      defaultVal: '~false',
      description:
        'Shorthand for the vertical layout; Only read when ?layout= and ?type= are empty.',
      name: '?center=',
      values: TRUTHY_FLAG_LIST.join(' | '),
    },
    buildVariantParamRow(DEFAULT_QUOTE_VARIANT, 'Surface tier'),
    buildColorParamRow(DEFAULT_THEME_COLOR, 'Theme color for surface, border, and quote marks.'),
    {
      defaultVal: `${DEFAULT_HORIZONTAL_QUOTE_SIZE} (${QUOTE_SIZE_MAP[DEFAULT_HORIZONTAL_QUOTE_SIZE]}px) / ${DEFAULT_VERTICAL_QUOTE_SIZE} (${QUOTE_SIZE_MAP[DEFAULT_VERTICAL_QUOTE_SIZE]}px, vertical)`,
      description: 'Typography scale preset or custom pixel size.',
      name: '?size=',
      values: `${SIZE_TOKENS.join(' | ')} | ${formatRange(QUOTE_FONT_SIZE_RANGE)}`,
    },
    {
      defaultVal: `${QUOTE_WIDTH_RANGE.default} (horizontal) / ${DEFAULT_VERTICAL_QUOTE_WIDTH} (vertical)`,
      description:
        "Card width in pixels; The default grows proportionally with text sizes above the layout's default size, and the height adapts to the wrapped lines.",
      name: '?width=',
      values: formatRange(QUOTE_WIDTH_RANGE),
    },
    buildSheenAnimParamRow('Diagonal sheen sweep across the card surface, or none.'),
  ];
}
