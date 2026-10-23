/**
 * Typing animation renderer – Renders realistic human-cadence SVG typing animations in Kumo 3D containers.
 *
 * Character glyphs are laid out with OpenType pair kerning, deduplicated in `<defs>` by content hash, and
 * animated with hardware-accelerated SMIL opacity fades and cursor motion. Inter-key intervals follow
 * human-computer interaction (HCI) keystroke dynamics: Fast alternating/rollover bigrams, double-letter bounce
 * penalties, word-start cognitive planning pauses, punctuation pauses, and optional QWERTY neighbor typos with
 * backspace self-correction.
 */

import { WHITE } from '@/config/palette';
import { BASE_DARK, THEMES } from '@/config/theme';
import { DEFAULT_ICON_STROKE_WIDTH, resolveIconLookup, resolvePlaceholderIcon } from '@/svg/icons';
import {
  computeCenteredBaselineY,
  layoutTextGlyphs,
  measureTextWidth,
  renderTextPathMarkup,
  resolveCharGlyph,
} from '@/svg/measure';
import {
  ELLIPSIS,
  HINT_ICON_REST_RX,
  PRIMARY_FOREGROUND_OPACITY,
  buildBottomCrescentPath,
  clampInt,
  computeIconTranslateX,
  getOwnValue,
  hashText,
  isAnimationDisabled,
  measureIconVisualWidth,
  prepareDisplayText,
  renderIconGroup,
  renderKumoBoxSurface,
  renderSheenOverlay,
  renderSurfaceGradientDefs,
  renderSvgDocument,
  resolveForegroundColor,
  resolveForegroundPaint,
  resolveScaledFontSize,
  resolveSurfaceTextColor,
  roundCoord,
  roundScale,
  roundTenths,
} from '@/svg/shared';
import type {
  AnimationMode,
  BadgeVariant,
  ForegroundPaint,
  GlyphLineLayout,
  NumericRange,
  PositionedCharGlyph,
  ResolvedIcon,
  SizePreset,
  ThemeColorName,
  ThemePalette,
  TypingAlign,
  TypingCursor,
  TypingEraseMode,
  TypingFont,
  TypingLayout,
  TypingRenderOptions,
} from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Resolved typography and container geometry for a typing widget. */
interface TypingMetrics {
  /** Height of the main typing body area in pixels (excluding the window/IDE header bar). */
  bodyHeight: number;
  /** Typed text font size in pixels. */
  fontSize: number;
  /** Height of the top window/IDE chrome bar in pixels (`0` for single-bar layouts). */
  headerHeight: number;
  /** Font size of the trailing keycap or header hint badge in pixels. */
  hintFontSize: number;
  /** Rendered box size of the leading icon in pixels. */
  iconBoxSize: number;
  /** Horizontal inner padding from the container edges in pixels (matches vertical padding). */
  padX: number;
  /** Outer container corner radius in pixels. */
  radius: number;
  /** Proportional scale factor relative to the default size preset. */
  scale: number;
  /** Font size of the window or IDE tab title in pixels. */
  titleFontSize: number;
}

/** Variant- and layout-dependent paint tokens for a typing container. */
interface TypingStyleTokens {
  /** Accent color for prompt prefixes, active highlights, and HUD/IDE accents. */
  accentColor: string;
  /** Caret cursor fill color. */
  cursorColor: string;
  /** Divider stroke color for header bars and IDE gutters. */
  dividerColor: string;
  /** `<defs>` gradient markup required by the container surface. */
  gradDefs: string;
  /** Foreground paint (color + optional opacity) for leading icons. */
  iconPaint: ForegroundPaint;
  /** Whether the typed text uses the bold font weight. */
  isBoldText: boolean;
  /** Whether the surface is a vivid primary fill. */
  isOnPrimary: boolean;
  /** Muted secondary text color for window titles, IDE gutter numbers, and keycap hints. */
  mutedTextColor: string;
  /** Selection highlight fill color for `erase = 'select'`. */
  selectionColor: string;
  /** Primary typed text fill color. */
  textColor: string;
}

/** Resolved leading icon and whether it fell back to the unknown-slug placeholder. */
interface ResolvedTypingIconSlot {
  /** Resolved icon geometry and inner SVG markup. */
  data: ResolvedIcon;
  /** Whether the requested slug was unknown and fell back to the `!` placeholder icon. */
  isFallback: boolean;
}

/** Parsed and resolved content of the optional trailing keycap or header pill. */
interface ResolvedTypingHint {
  /** Optional leading icon rendered inside the keycap or header pill. */
  iconSlot?: ResolvedTypingIconSlot;
  /** Optional display text rendered inside the keycap or header pill. */
  text: string;
}

/** Pre-measured dimensions and reserved widths of the optional trailing hint badge (independent of container `width`). */
interface HintBadgeGeometry {
  /** Total vertical height of the hint pill or keycap in pixels. */
  badgeHeight: number;
  /** Corner radius of the hint pill or keycap in pixels. */
  badgeRadius: number;
  /** Distance from the container's right edge to the right edge of the hint badge in pixels. */
  badgeRightInset: number;
  /** Total horizontal width of the hint pill or keycap in pixels. */
  badgeWidth: number;
  /** Top Y coordinate of the hint pill or keycap in pixels. */
  badgeY: number;
  /** Width of the inner icon + gap + text content in pixels. */
  contentWidth: number;
  /** Rendered icon box size in pixels. */
  iconBoxSize: number;
  /** Horizontal gap between the icon and text in pixels (`0` unless both are present). */
  iconTextGap: number;
  /** Visible horizontal ink width of the icon in pixels (`0` when no icon). */
  iconVisualWidth: number;
  /** Horizontal space reserved on the right side of the body row in pixels (`0` for header keycaps or hidden hints). */
  reservedBodyWidth: number;
  /** Horizontal space reserved on the right side of the header bar in pixels (`0` for body keycaps or hidden hints). */
  reservedHeaderWidth: number;
}

/** Geometry and SVG markup of the leading icon and static prefix in the typing row. */
interface LeadingPromptLayout {
  /** Rendered SVG markup for the leading icon and static prefix (`''` when neither is present). */
  markup: string;
  /** X coordinate where the left-aligned typed text column begins in pixels. */
  textStartX: number;
}

/** Caret cursor rectangle dimensions relative to the typing baseline. */
interface CursorGeometry {
  /** Fill opacity of the cursor when visible. */
  activeOpacity: number;
  /** Top Y coordinate of the cursor rectangle in pixels. */
  cursorY: number;
  /** Cursor rectangle height in pixels. */
  height: number;
  /** Horizontal offset from the current character's cursor X coordinate in pixels. */
  offsetX: number;
  /** Corner radius of the cursor rectangle in pixels. */
  radius: number;
  /** Cursor rectangle width in pixels. */
  width: number;
}

/** Single scheduled character appearance and disappearance interval in milliseconds. */
interface ScheduledGlyph {
  /** Timestamp in milliseconds when the character finishes fading in. */
  appearEndMs: number;
  /** Timestamp in milliseconds when the character begins fading in. */
  appearStartMs: number;
  /** Timestamp in milliseconds when the character finishes fading out. */
  eraseEndMs: number;
  /** Timestamp in milliseconds when the character begins fading out. */
  eraseStartMs: number;
  /** `<defs>` glyph path ID (`type-g-<hash>`). */
  glyphId: string;
  /** Absolute horizontal baseline X coordinate of the character in pixels. */
  glyphX: number;
  /** Whether the character belongs to the completed first line (shown in non-SMIL static viewers). */
  isFirstLineChar: boolean;
}

/** Selection highlight flash interval for `erase = 'select'` on a single line. */
interface SelectionFlash {
  /** Timestamp in milliseconds when the selection highlight clears. */
  endMs: number;
  /** Width of the selection box in pixels. */
  rectWidth: number;
  /** Left X coordinate of the selection box in pixels. */
  rectX: number;
  /** Timestamp in milliseconds when the selection highlight appears. */
  startMs: number;
}

/** Time-value pair in milliseconds for building SMIL `values`, `keyTimes`, and `keySplines` lists. */
interface TimelinePoint {
  /** Optional cubic-Bezier `keySplines` segment arriving at this point (`'x1 y1 x2 y2'`). */
  spline?: string;
  /** Timestamp in milliseconds within `[0, totalCycleMs]`. */
  timeMs: number;
  /** Numeric attribute value at `timeMs`. */
  value: number;
}

/** Prepared per-line layout and optional QWERTY typo target. */
interface PreparedTypingLine {
  /** Laid-out character glyphs of the (width-fitted) line. */
  glyphs: PositionedCharGlyph[];
  /** Leftmost baseline X coordinate of the line in pixels. */
  lineStartX: number;
  /** Total horizontal advance width of the line in pixels. */
  totalAdvance: number;
  /** Optional typo glyph positioned at `typoIndex` when `hasTypo` is enabled. */
  typoGlyph?: PositionedCharGlyph;
  /** Character index in `glyphs` where the simulated typo occurs (`-1` when none). */
  typoIndex: number;
}

/** Mutable timeline accumulator while scheduling all lines of a typing cycle. */
interface CycleTimelineState {
  /** Current simulation clock in milliseconds. */
  currentTimeMs: number;
  /** Cursor `opacity` keyframe points. */
  cursorOpacityPoints: TimelinePoint[];
  /** Cursor horizontal `x` keyframe points. */
  cursorXPoints: TimelinePoint[];
  /** Resting cursor X coordinate at the end of the first line in pixels. */
  firstLineEndCursorX: number;
  /** Timestamp in milliseconds when the first line finishes typing and enters its reading pause. */
  firstLineRestMs: number;
  /** Deduplicated `<defs>` glyph `<path>` markup keyed by `glyphId`. */
  glyphDefsById: Map<string, string>;
  /** All scheduled character appearances across every line. */
  scheduledGlyphs: ScheduledGlyph[];
  /** Selection highlight boxes for `erase = 'select'`. */
  selectionFlashes: SelectionFlash[];
}

/** Shared layout context passed to the static and animated SVG assembly helpers. */
interface TypingBodyRenderContext {
  /** Resolved animation mode. */
  animMode: AnimationMode;
  /** Accessible `aria-label` string for the `<svg>` document. */
  ariaText: string;
  /** Vertical baseline Y coordinate of the typed text in pixels. */
  baselineY: number;
  /** Caret cursor rectangle geometry. */
  cursorGeometry: CursorGeometry;
  /** Line erase transition mode. */
  eraseMode: TypingEraseMode;
  /** Total SVG height in pixels. */
  height: number;
  /** Rendered trailing 3D keycap badge markup. */
  hintMarkup: string;
  /** Container layout style. */
  layout: TypingLayout;
  /** Leading icon and static prefix layout. */
  leading: LeadingPromptLayout;
  /** Typography and spacing metrics. */
  metrics: TypingMetrics;
  /** User-supplied typing options. */
  options: TypingRenderOptions;
  /** Width-fitted, positioned lines with optional typo targets. */
  preparedLines: readonly PreparedTypingLine[];
  /** Variant- and layout-dependent paint tokens. */
  styleTokens: TypingStyleTokens;
  /** Rendered Kumo container surface and layout chrome markup. */
  surfaceMarkup: string;
  /** Total SVG width in pixels. */
  width: number;
}

/** Deterministic QWERTY neighbor typo target for a single line. */
interface ResolvedLineTypo {
  /** Positioned wrong-key glyph rendered briefly before backspace recovery. */
  typoGlyph: PositionedCharGlyph;
  /** Character index in `glyphs` where the typo occurs. */
  typoIndex: number;
}

/** Options for `scheduleLineErasePhase`. */
interface ScheduleLineEraseOptions {
  /** Active cursor fill opacity. */
  activeOpacity: number;
  /** Cursor X coordinate at the end of the line in pixels. */
  endCursorX: number;
  /** Line erase transition mode. */
  eraseMode: TypingEraseMode;
  /** Laid-out character glyphs of the line. */
  glyphs: readonly PositionedCharGlyph[];
  /** Scheduled visible glyph records of the line. */
  lineScheduledRecords: ScheduledGlyph[];
  /** Leftmost baseline X coordinate of the line in pixels. */
  lineStartX: number;
  /** Cursor X coordinate at the start of the following line in pixels. */
  nextLineStartCursorX: number;
  /** Horizontal offset of the cursor relative to the character baseline X in pixels. */
  offsetX: number;
  /** Cursor X coordinate at the start of the current line in pixels. */
  startCursorX: number;
  /** Mutable cycle timeline accumulator. */
  state: CycleTimelineState;
  /** Total horizontal advance width of the line in pixels. */
  totalAdvance: number;
}

/** Options for `scheduleLineTimeline`. */
interface ScheduleLineTimelineOptions {
  /** Caret cursor rectangle geometry. */
  cursorGeometry: CursorGeometry;
  /** Line erase transition mode. */
  eraseMode: TypingEraseMode;
  /** Prepared line layout and optional typo target. */
  line: PreparedTypingLine;
  /** Target typing duration for this line in milliseconds. */
  lineDurationMs: number;
  /** Zero-based index of this line in the cycle. */
  lineIndex: number;
  /** Cursor X coordinate at the start of the following line in pixels. */
  nextLineStartCursorX: number;
  /** Reading pause duration at the end of the line in milliseconds. */
  pauseMs: number;
  /** Mutable cycle timeline accumulator. */
  state: CycleTimelineState;
}

/** Options for `renderPositionedIconSlot`. */
interface PositionedIconSlotOptions {
  /** Target square icon box size in pixels. */
  boxSize: number;
  /** Left X coordinate of the icon slot in pixels. */
  boxX: number;
  /** Top Y coordinate of the icon slot in pixels. */
  boxY: number;
  /** Stroke or fill color of the icon. */
  color: string;
  /** Resolved icon data and fallback flag. */
  iconSlot: ResolvedTypingIconSlot;
  /** Whether to center visible ink inside `boxSize` instead of left-aligning at `boxX`. */
  isBoxCentered?: boolean;
  /** Whether the icon sits on a vivid primary surface. */
  isOnPrimary: boolean;
  /** Optional group opacity. */
  opacity: number | undefined;
}

/** Rendered SVG markup and visible ink width of a positioned icon slot. */
interface RenderedIconSlot {
  /** Rendered `<g>` icon markup. */
  markup: string;
  /** Visible horizontal ink width in pixels. */
  renderedWidth: number;
}

/** Options for `renderHintBadgeInner`. */
interface HintBadgeInnerOptions {
  /** Badge height in pixels. */
  badgeHeight: number;
  /** Badge width in pixels. */
  badgeWidth: number;
  /** Badge left X coordinate in pixels. */
  badgeX: number;
  /** Badge top Y coordinate in pixels. */
  badgeY: number;
  /** Combined inner content width in pixels. */
  contentWidth: number;
  /** Resolved hint icon and/or text. */
  hint: ResolvedTypingHint;
  /** Hint text font size in pixels. */
  hintFontSize: number;
  /** Hint icon box size in pixels. */
  iconBoxSize: number;
  /** Gap between hint icon and text in pixels. */
  iconTextGap: number;
  /** Visible ink width of the hint icon in pixels. */
  iconVisualWidth: number;
  /** Whether the surface is a vivid primary fill. */
  isOnPrimary: boolean;
  /** Fill color of the hint text. */
  keycapTextFill: string;
  /** Muted secondary text color. */
  mutedTextColor: string;
  /** Vertical optical nudge in pixels (`-0.5` on 3D recessed keycaps, `0` otherwise). */
  verticalNudge: number;
}

/** Fill, border stroke, and text colors of a keycap or header hint badge. */
interface HintBadgePaint {
  /** Background fill color of the keycap or pill. */
  keycapFill: string;
  /** Border stroke color of the keycap or pill. */
  keycapStroke: string;
  /** Text fill color inside the keycap or pill. */
  keycapTextFill: string;
}

/** Options for `renderHintBadge`. */
interface RenderHintBadgeOptions {
  /** Pre-measured hint badge geometry (`undefined` when hidden). */
  geometry: HintBadgeGeometry | undefined;
  /** Resolved hint content (`undefined` when hidden). */
  hint: ResolvedTypingHint | undefined;
  /** Active container layout. */
  layout: TypingLayout;
  /** Typography and spacing metrics. */
  metrics: TypingMetrics;
  /** Resolved theme palette. */
  palette: ThemePalette;
  /** Variant- and layout-dependent paint tokens. */
  styleTokens: TypingStyleTokens;
  /** Surface hierarchy tier. */
  variant: BadgeVariant;
  /** Total container width in pixels. */
  width: number;
}

/** Horizontal geometry of the 3-dot window/browser traffic-light controls. */
interface TrafficLightLayout {
  /** Center Y coordinate of the dots in pixels. */
  dotCy: number;
  /** Horizontal center-to-center spacing between adjacent dots in pixels. */
  dotGap: number;
  /** Dot circle radius in pixels. */
  dotRadius: number;
  /** Center X coordinate of the first dot in pixels. */
  firstDotCx: number;
  /** Rightmost edge X coordinate of the third dot in pixels. */
  rightEdgeX: number;
}

/** Horizontal geometry of the traffic-light dots and search omnibox well in `browser` layout. */
interface BrowserToolbarLayout {
  /** Leftmost edge X coordinate of the first dot in pixels. */
  dotLeftEdgeX: number;
  /** Traffic-light dot coordinates and dimensions. */
  trafficLights: TrafficLightLayout;
  /** Left X coordinate of the search omnibox well in pixels. */
  wellX: number;
}

/** Rendered traffic-light `<circle>` markup and rightmost X coordinate. */
interface RenderedTrafficLightDots {
  /** Concatenated `<circle>` SVG elements. */
  dotsMarkup: string;
  /** Rightmost edge X coordinate of the third dot in pixels. */
  rightEdgeX: number;
}

/** Horizontal geometry and inner spacing of the active file tab in `ide` layout. */
interface IdeTabMetrics {
  /** Gap between the tab title and close mark in pixels. */
  closeGap: number;
  /** Square size of the tab close `×` mark in pixels. */
  closeSize: number;
  /** Gap between the tab icon and title in pixels. */
  iconGap: number;
  /** Rendered square box size of the tab icon in pixels. */
  tabIconSize: number;
  /** Horizontal inner padding of the tab in pixels. */
  tabPadX: number;
  /** Left X coordinate of the active tab in pixels. */
  tabStartX: number;
  /** Unclamped total width of the active tab in pixels. */
  tabWidth: number;
}

/** Options for `renderWindowHeaderChrome`. */
interface WindowHeaderChromeOptions {
  /** Rendered traffic-light `<circle>` markup. */
  dotsMarkup: string;
  /** Optional header icon slot. */
  iconSlot: ResolvedTypingIconSlot | undefined;
  /** Typography and spacing metrics. */
  metrics: TypingMetrics;
  /** Variant- and layout-dependent paint tokens. */
  styleTokens: TypingStyleTokens;
  /** Sanitized window title text. */
  titleText: string;
  /** Total container width in pixels. */
  width: number;
}

/** Options for `renderIdeHeaderAndGutterChrome`. */
interface IdeHeaderChromeOptions {
  /** Rendered traffic-light `<circle>` markup. */
  dotsMarkup: string;
  /** Total container height in pixels. */
  height: number;
  /** Optional tab file icon slot. */
  iconSlot: ResolvedTypingIconSlot | undefined;
  /** Typography and spacing metrics. */
  metrics: TypingMetrics;
  /** Rightmost edge X coordinate of the traffic-light dots in pixels. */
  rightEdgeX: number;
  /** Variant- and layout-dependent paint tokens. */
  styleTokens: TypingStyleTokens;
  /** Sanitized active tab filename. */
  titleText: string;
  /** Total container width in pixels. */
  width: number;
}

/** Options for `renderTypingContainerSurface`. */
interface TypingContainerSurfaceOptions {
  /** Theme color token. */
  color: ThemeColorName;
  /** Total container height in pixels. */
  height: number;
  /** Optional leading/header icon slot. */
  iconSlot: ResolvedTypingIconSlot | undefined;
  /** Container layout style. */
  layout: TypingLayout;
  /** Typography and spacing metrics. */
  metrics: TypingMetrics;
  /** Resolved theme palette. */
  palette: ThemePalette;
  /** Variant- and layout-dependent paint tokens. */
  styleTokens: TypingStyleTokens;
  /** Sanitized header or tab title text. */
  titleText: string;
  /** Surface hierarchy tier. */
  variant: BadgeVariant;
  /** Total container width in pixels. */
  width: number;
}

/** Options for `renderLeadingPrompt`. */
interface LeadingPromptOptions {
  /** Vertical baseline Y coordinate of the body row in pixels. */
  baselineY: number;
  /** Active font family. */
  fontFamily: TypingFont;
  /** Optional leading icon slot. */
  iconSlot: ResolvedTypingIconSlot | undefined;
  /** Container layout style. */
  layout: TypingLayout;
  /** Typography and spacing metrics. */
  metrics: TypingMetrics;
  /** Sanitized static prefix text. */
  prefixText: string;
  /** Variant- and layout-dependent paint tokens. */
  styleTokens: TypingStyleTokens;
}

/** Measured `(0, 0)` glyph layouts and maximum advance width across all lines. */
interface MeasuredRawTypingLines {
  /** Largest horizontal advance width across all lines in pixels. */
  maxRawAdvance: number;
  /** Per-line `(0, 0)` glyph layouts. */
  rawLayouts: GlyphLineLayout[];
}

/** Options for `buildPreparedTypingLines`. */
interface BuildPreparedLinesOptions {
  /** Horizontal alignment mode. */
  align: TypingAlign;
  /** Horizontal center anchor X coordinate in pixels. */
  centerAnchorX: number;
  /** Active font family. */
  fontFamily: TypingFont;
  /** Typed text font size in pixels. */
  fontSize: number;
  /** Whether simulated QWERTY neighbor typos are enabled. */
  hasTypo: boolean;
  /** Whether typed text uses the bold font weight. */
  isBoldText: boolean;
  /** Maximum available width for typed text in pixels. */
  maxTextWidth: number;
  /** Unclamped `(0, 0)` glyph layouts for each line. */
  rawLayouts: readonly GlyphLineLayout[];
  /** Leftmost X coordinate of the typed text column in pixels. */
  textStartX: number;
}

/** Options for `computeMinHeaderWidth`. */
interface MinHeaderWidthOptions {
  /** Optional header/tab icon slot. */
  iconSlot: ResolvedTypingIconSlot | undefined;
  /** Container layout style. */
  layout: TypingLayout;
  /** Typography and spacing metrics. */
  metrics: TypingMetrics;
  /** Horizontal space reserved by an optional right-aligned header hint pill in pixels. */
  reservedHeaderWidth: number;
  /** Sanitized header or tab title text. */
  titleText: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Container width bounds in pixels (auto-fits the longest line when omitted). */
export const TYPING_WIDTH_RANGE: NumericRange = { default: 440, max: 720, min: 200 };

/** Custom numeric typing font size bounds in pixels. */
export const TYPING_FONT_SIZE_RANGE: NumericRange = { default: 16, max: 32, min: 12 };

/** Per-line typing duration bounds in milliseconds. */
export const TYPING_DURATION_RANGE: NumericRange = { default: 2200, max: 10_000, min: 600 };

/** Per-line reading pause bounds in milliseconds. */
export const TYPING_PAUSE_RANGE: NumericRange = { default: 1200, max: 6000, min: 200 };

/** Maximum raw lines string length in UTF-16 code units before truncation. */
export const MAX_TYPING_TEXT_LENGTH = 960;

/** Maximum number of cycling lines rendered in a typing animation. */
export const MAX_TYPING_LINES = 12;

/** Maximum character length of a single typed line before ellipsis truncation. */
export const MAX_TYPING_LINE_LENGTH = 80;

/** Maximum character length of the optional static prefix. */
export const MAX_TYPING_PREFIX_LENGTH = 48;

/** Maximum character length of the optional window or IDE header title. */
export const MAX_TYPING_TITLE_LENGTH = 64;

/** Maximum character length of the optional keycap or header hint. */
export const MAX_TYPING_HINT_LENGTH = 24;

/** Preset font sizes in pixels for named `SizePreset` tokens. */
export const TYPING_SIZE_MAP: Readonly<Record<SizePreset, number>> = {
  lg: 19,
  md: 16,
  sm: 14,
  xl: 23,
};

/** Fallback lines rendered when no visible text is supplied. */
const DEFAULT_TYPING_LINES: readonly string[] = [
  'Full-Stack Developer',
  'Design-Driven Engineering',
];

/** Default container layout when layout parameters are omitted. */
export const DEFAULT_TYPING_LAYOUT: TypingLayout = 'window';

/** Default horizontal text alignment on framed layouts when `align` is omitted. */
export const DEFAULT_TYPING_ALIGN: TypingAlign = 'left';

/** Default caret cursor shape when omitted. */
export const DEFAULT_TYPING_CURSOR: TypingCursor = 'bar';

/** Default line erase transition when omitted. */
export const DEFAULT_TYPING_ERASE: TypingEraseMode = 'backspace';

/** Default prompt chevron rendered in `window` layout when `prefix` is omitted and `align === 'left'`. */
export const DEFAULT_WINDOW_PROMPT = '❯';

/** Default active tab filename rendered in `ide` layout when `title` is omitted. */
export const DEFAULT_IDE_TITLE = 'index.ts';

/** Natural default font family per layout when `font` is omitted. */
export const DEFAULT_LAYOUT_FONTS: Readonly<Record<TypingLayout, TypingFont>> = {
  browser: 'sans',
  ide: 'mono',
  none: 'sans',
  prompt: 'sans',
  window: 'mono',
};

/** Traffic-light window control dot colors (rose, amber, emerald) for dark Kumo windows. */
const WINDOW_DOT_COLORS: readonly string[] = ['#F43F5E', '#F59E0B', '#10B981'];

/** Traffic-light window control dot opacities on vivid primary windows. */
const PRIMARY_WINDOW_DOT_OPACITIES: readonly string[] = ['0.82', '0.56', '0.36'];

/** Duration in milliseconds of each character's smooth opacity fade-in. */
const CHAR_FADE_IN_MS = 52;

/** Duration in milliseconds of each character's opacity fade-out during backspace or select clear. */
const CHAR_FAST_FADE_OUT_MS = 24;

/** Duration in milliseconds of the whole-line smooth fade-out when `erase === 'fade'`. */
const LINE_FADE_ERASE_MS = 320;

/** Duration in milliseconds of the `Cmd+A` selection highlight flash when `erase === 'select'`. */
const SELECT_HIGHLIGHT_MS = 230;

/** Duration in milliseconds of the smooth cursor horizontal glide during a keystroke. */
const CURSOR_GLIDE_MS = 38;

/** Half-period in milliseconds of the smooth cursor blink during idle/reading pauses. */
const CURSOR_BLINK_HALF_PERIOD_MS = 520;

/** Initial pause in milliseconds before the first character of a line is typed. */
const PRE_LINE_PAUSE_MS = 190;

/** Brief pause in milliseconds after erasing a line before the next line starts typing. */
const POST_ERASE_PAUSE_MS = 210;

/** Pause in milliseconds after hitting a wrong neighbor key before backspacing it. */
const TYPO_RECOGNITION_PAUSE_MS = 165;

/** Pause in milliseconds after backspacing a typo before typing the intended character. */
const TYPO_RECOVERY_PAUSE_MS = 85;

/** Minimum opacity of the cursor at the trough of an idle blink cycle. */
const CURSOR_BLINK_MIN_OPACITY = 0.08;

/** Fast alternating-hand and inward-rollover English bigrams (Dhakal et al. 2018 keystroke corpus). */
const FAST_ROLLOVER_BIGRAMS: ReadonlySet<string> = new Set([
  'al',
  'an',
  'ar',
  'as',
  'at',
  'be',
  'ce',
  'ch',
  'co',
  'de',
  'ea',
  'ed',
  'en',
  'er',
  'es',
  'ha',
  'he',
  'hi',
  'ic',
  'in',
  'io',
  'is',
  'it',
  'le',
  'li',
  'me',
  'nd',
  'ne',
  'ng',
  'nt',
  'of',
  'om',
  'on',
  'or',
  'ou',
  'ra',
  're',
  'ri',
  'ro',
  'se',
  'si',
  'st',
  'te',
  'th',
  'ti',
  'to',
  'ur',
  've',
]);

/** Horizontal QWERTY neighbor lookup table for realistic single-key slip typos. */
const QWERTY_NEIGHBOR_MAP: Readonly<Record<string, string>> = {
  a: 's',
  b: 'v',
  c: 'x',
  d: 'f',
  e: 'r',
  f: 'g',
  g: 'h',
  h: 'j',
  i: 'o',
  j: 'k',
  k: 'l',
  l: 'k',
  m: 'n',
  n: 'm',
  o: 'p',
  p: 'o',
  q: 'w',
  r: 't',
  s: 'd',
  t: 'y',
  u: 'i',
  v: 'b',
  w: 'e',
  x: 'c',
  y: 'u',
  z: 'x',
};

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches clause-ending punctuation that induces a brief cognitive motor pause after typing. */
const CLAUSE_PUNCTUATION_RX = /[,.;:!?]/;

/** Matches uppercase letters and shifted programming symbols that require modifier coordination. */
const SHIFTED_CHAR_RX = /[A-Z!@#$%^&*()_+{}|:"<>?~]/;

/** Matches ASCII letters eligible for a QWERTY neighbor typo. */
const ASCII_LETTER_RX = /[A-Za-z]/;

// -------------------------------------- INTERNALS --------------------------------------

/** Normalize user-supplied lines (array or `;`-separated string) into at most `MAX_TYPING_LINES` clean strings. */
function normalizeTypingLines(rawLines: readonly string[] | string): string[] {
  const parts: string[] = [];
  if (typeof rawLines === 'string') {
    const capped = prepareDisplayText(rawLines, MAX_TYPING_TEXT_LENGTH);
    for (const segment of capped.split(';')) {
      parts.push(segment);
    }
  } else {
    for (const entry of rawLines) {
      for (const segment of prepareDisplayText(entry, MAX_TYPING_TEXT_LENGTH).split(';')) {
        parts.push(segment);
      }
    }
  }

  const cleaned: string[] = [];
  for (const part of parts) {
    const trimmed = prepareDisplayText(part.trim(), MAX_TYPING_LINE_LENGTH).trim();
    if (trimmed.length > 0) {
      cleaned.push(trimmed);
      if (cleaned.length >= MAX_TYPING_LINES) {
        break;
      }
    }
  }

  return cleaned.length > 0 ? cleaned : [...DEFAULT_TYPING_LINES];
}

/** Resolve typography and container spacing metrics from `sizeOption` and `layout`. */
function resolveTypingMetrics(
  sizeOption: SizePreset | number | undefined,
  layout: TypingLayout
): TypingMetrics {
  const fontSize = resolveScaledFontSize(sizeOption, TYPING_SIZE_MAP, TYPING_FONT_SIZE_RANGE, 'md');

  const scale = fontSize / TYPING_SIZE_MAP.md;
  const isFrameless = layout === 'none';
  const bodyHeight = isFrameless ? Math.round(fontSize * 2.1) : Math.round(48 * scale);
  const headerHeight = layout === 'window' || layout === 'ide' ? Math.round(30 * scale) : 0;
  const iconBoxSize = Math.round(18 * scale);

  const radius = isFrameless ? 0 : Math.max(10, Math.round(13 * scale));

  // Equal X and Y padding; `(bodyHeight - iconBoxSize) / 2` = `15 * scale` on framed containers:
  const padX = isFrameless
    ? Math.round(8 * scale)
    : Math.max(10, Math.round((bodyHeight - iconBoxSize) / 2));

  return {
    bodyHeight,
    fontSize,
    headerHeight,
    hintFontSize: roundTenths(Math.max(10, fontSize * 0.72)),
    iconBoxSize,
    padX,
    radius,
    scale,
    titleFontSize: roundTenths(Math.max(10.5, fontSize * 0.75)),
  };
}

/** Resolve paint colors, font weight, and `<defs>` surface gradients for a typing widget. */
function resolveTypingStyleTokens(
  variant: BadgeVariant,
  layout: TypingLayout,
  color: ThemeColorName,
  palette: ThemePalette
): TypingStyleTokens {
  const isFrameless = layout === 'none';
  const isOnPrimary = !isFrameless && variant === '1';

  if (isFrameless) {
    let framelessTextColor = palette.accentText;
    if (variant === '1') {
      framelessTextColor = palette.iconColor;
    } else if (variant === '3') {
      framelessTextColor = BASE_DARK.textMuted;
    }
    const framelessCursorColor = variant === '3' ? BASE_DARK.textMuted : palette.iconColor;
    return {
      accentColor: palette.iconColor,
      cursorColor: framelessCursorColor,
      dividerColor: BASE_DARK.borderNeutral,
      gradDefs: '',
      iconPaint: { color: framelessCursorColor, opacity: undefined },
      isBoldText: variant === '1',
      isOnPrimary: false,
      mutedTextColor: BASE_DARK.textMuted,
      selectionColor: palette.iconColor,
      textColor: framelessTextColor,
    };
  }

  let dividerColor = BASE_DARK.borderNeutral;
  if (isOnPrimary) {
    dividerColor = 'rgba(255,255,255,0.20)';
  } else if (variant === '2') {
    dividerColor = palette.borderColor;
  }

  return {
    accentColor: resolveForegroundColor(isOnPrimary, palette.iconColor),
    cursorColor: isOnPrimary ? WHITE : palette.iconColor,
    dividerColor,
    gradDefs: renderSurfaceGradientDefs(!isOnPrimary, isOnPrimary ? [color] : undefined),
    iconPaint: resolveForegroundPaint(isOnPrimary, palette.iconColor),
    isBoldText: isOnPrimary,
    isOnPrimary,
    mutedTextColor: isOnPrimary
      ? `rgba(255,255,255,${PRIMARY_FOREGROUND_OPACITY})`
      : BASE_DARK.textMuted,
    selectionColor: isOnPrimary ? WHITE : palette.iconColor,
    textColor: resolveSurfaceTextColor(variant),
  };
}

/** Resolve the optional icon (`undefined` when omitted or `'none'`). */
function resolveTypingIcon(iconOption: string | undefined): ResolvedTypingIconSlot | undefined {
  const trimmed = iconOption?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') {
    return undefined;
  }
  const lookup = resolveIconLookup(trimmed);
  if (!lookup.data) {
    return { data: resolvePlaceholderIcon(), isFallback: true };
  }
  return { data: lookup.data, isFallback: false };
}

/** Resolve the effective static prefix text displayed before the typed text. */
function resolveTypingPrefix(
  prefixOption: string | undefined,
  layout: TypingLayout,
  align: TypingAlign
): string {
  const trimmed = prefixOption?.trim();
  if (trimmed?.toLowerCase() === 'none') {
    return '';
  }
  if (trimmed && trimmed.length > 0) {
    return prepareDisplayText(trimmed, MAX_TYPING_PREFIX_LENGTH).trim();
  }
  if (align === 'left' && layout === 'window') {
    return DEFAULT_WINDOW_PROMPT;
  }
  return '';
}

/** Resolve the optional trailing keycap or header pill content (`undefined` when hidden or omitted). */
function resolveTypingHint(hintOption: string | undefined): ResolvedTypingHint | undefined {
  const trimmed = hintOption?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') {
    return undefined;
  }
  if (trimmed.slice(0, 5).toLowerCase() === 'icon:') {
    const rest = trimmed.slice(5).trim();
    if (!rest) {
      return undefined;
    }
    const match = HINT_ICON_REST_RX.exec(rest);
    const iconSlug = match?.groups?.slug ?? '';
    const rawText = match?.groups?.text ?? '';
    const iconSlot = resolveTypingIcon(iconSlug);
    const text = rawText ? prepareDisplayText(rawText, MAX_TYPING_HINT_LENGTH).trim() : '';
    if (!iconSlot && text.length === 0) {
      return undefined;
    }
    return { ...(iconSlot ? { iconSlot } : {}), text };
  }
  const text = prepareDisplayText(trimmed, MAX_TYPING_HINT_LENGTH).trim();
  return text.length > 0 ? { text } : undefined;
}

/** Resolve the effective header/tab title string (`''` when hidden or on single-bar layouts). */
function resolveTypingTitle(titleOption: string | undefined, layout: TypingLayout): string {
  const rawTitle = titleOption?.trim() ?? '';
  if (rawTitle.toLowerCase() === 'none') {
    return '';
  }
  if (layout === 'window') {
    return rawTitle.length > 0 ? prepareDisplayText(rawTitle, MAX_TYPING_TITLE_LENGTH).trim() : '';
  }
  if (layout === 'ide') {
    return rawTitle.length > 0
      ? prepareDisplayText(rawTitle, MAX_TYPING_TITLE_LENGTH).trim()
      : DEFAULT_IDE_TITLE;
  }
  return '';
}

/** Compute cursor rectangle dimensions and vertical placement for the requested `cursor` style. */
function computeCursorGeometry(
  cursor: TypingCursor,
  baselineY: number,
  fontSize: number
): CursorGeometry {
  if (cursor === 'block') {
    const width = roundCoord(Math.max(7, fontSize * 0.56));
    const height = roundCoord(fontSize * 1.14);
    return {
      activeOpacity: 0.52,
      cursorY: roundCoord(baselineY - fontSize * 0.88),
      height,
      offsetX: roundCoord(fontSize * 0.06),
      radius: 2,
      width,
    };
  }
  if (cursor === 'underscore') {
    const width = roundCoord(Math.max(7, fontSize * 0.58));
    const height = roundCoord(Math.max(2, fontSize * 0.14));
    return {
      activeOpacity: 0.95,
      cursorY: roundCoord(baselineY + fontSize * 0.12),
      height,
      offsetX: roundCoord(fontSize * 0.06),
      radius: roundCoord(height / 2),
      width,
    };
  }
  const width = roundCoord(Math.max(2, fontSize * 0.13));
  const height = roundCoord(fontSize * 1.16);
  return {
    activeOpacity: 0.95,
    cursorY: roundCoord(baselineY - fontSize * 0.9),
    height,
    offsetX: roundCoord(fontSize * 0.08),
    radius: roundCoord(width / 2),
    width,
  };
}

/** Truncate a laid-out glyph line so its total advance width fits within `maxWidth`, appending `…` when cut. */
function clampLineGlyphsToWidth(
  layout: GlyphLineLayout,
  maxWidth: number,
  fontSize: number,
  isBold: boolean,
  fontFamily: TypingFont
): GlyphLineLayout {
  if (layout.totalAdvance <= maxWidth || layout.glyphs.length === 0) {
    return layout;
  }
  const ellipsisGlyph = resolveCharGlyph(ELLIPSIS, fontSize, isBold, fontFamily);
  const targetWidth = Math.max(0, maxWidth - ellipsisGlyph.advance);
  const fitted: PositionedCharGlyph[] = [];
  let cursorX = 0;

  for (const glyph of layout.glyphs) {
    if (glyph.glyphX + glyph.advance > targetWidth) {
      break;
    }
    fitted.push(glyph);
    cursorX = glyph.glyphX + glyph.advance;
  }

  while (fitted.length > 0 && fitted[fitted.length - 1]?.char === ' ') {
    fitted.pop();
    const last = fitted[fitted.length - 1];
    cursorX = last ? last.glyphX + last.advance : 0;
  }

  const placedEllipsis: PositionedCharGlyph = { ...ellipsisGlyph, glyphX: roundCoord(cursorX) };
  fitted.push(placedEllipsis);
  return { glyphs: fitted, totalAdvance: roundCoord(cursorX + placedEllipsis.advance) };
}

/** Compute the relative HCI inter-key interval weight before typing `glyphs[index]`. */
function computeKeystrokeWeight(
  glyphs: readonly PositionedCharGlyph[],
  index: number,
  lineIndex: number
): number {
  const char = glyphs[index]?.char ?? '';
  if (index === 0) {
    return 1.15;
  }
  const prevChar = glyphs[index - 1]?.char ?? '';
  let weight = 1;

  if (prevChar === ' ') {
    weight = 1.42;
  } else if (CLAUSE_PUNCTUATION_RX.test(prevChar)) {
    weight = 1.72;
  } else {
    const lowerPair = `${prevChar.toLowerCase()}${char.toLowerCase()}`;
    if (prevChar.toLowerCase() === char.toLowerCase() && ASCII_LETTER_RX.test(char)) {
      weight = 1.32;
    } else if (FAST_ROLLOVER_BIGRAMS.has(lowerPair)) {
      weight = 0.68;
    }
  }

  if (SHIFTED_CHAR_RX.test(char) && !SHIFTED_CHAR_RX.test(prevChar)) {
    weight += 0.24;
  }

  const hashValue =
    ((lineIndex + 1) * 131 + (index + 1) * 37 + (char.codePointAt(0) ?? 0) * 17) % 29;
  const jitter = ((hashValue - 14) / 14) * 0.14;
  return Math.max(0.48, weight + jitter);
}

/** Decide whether line `lineIndex` out of `totalLines` should include a simulated typo. */
function isLineEligibleForTypo(
  lineIndex: number,
  totalLines: number,
  rawLayouts: readonly GlyphLineLayout[]
): boolean {
  if (totalLines <= 1) {
    return true;
  }
  let cycleSeed = totalLines * 53;
  for (const layout of rawLayouts) {
    cycleSeed = (cycleSeed * 31 + layout.glyphs.length) % 997;
  }
  // Pick a sparse subset of lines (never every line) while guaranteeing at least one line in the cycle has a typo:
  const primaryLineIndex = cycleSeed % totalLines;
  if (lineIndex === primaryLineIndex) {
    return true;
  }
  if (totalLines >= 4 && Math.abs(lineIndex - primaryLineIndex) >= 2) {
    return (lineIndex + cycleSeed) % 3 === 0;
  }
  return false;
}

/** Pick a deterministic character index and QWERTY neighbor glyph for a simulated typo (`undefined` if ineligible). */
function resolveLineTypo(
  glyphs: readonly PositionedCharGlyph[],
  lineIndex: number,
  fontSize: number,
  isBold: boolean,
  fontFamily: TypingFont
): ResolvedLineTypo | undefined {
  if (glyphs.length < 4) {
    return undefined;
  }
  const candidates: number[] = [];
  for (let i = 2; i < glyphs.length - 1; i += 1) {
    const candidateChar = glyphs[i]?.char ?? '';
    if (ASCII_LETTER_RX.test(candidateChar)) {
      candidates.push(i);
    }
  }
  if (candidates.length === 0) {
    return undefined;
  }

  let seed = (lineIndex + 1) * 97;
  for (const glyph of glyphs) {
    seed = (seed * 31 + (glyph.char.codePointAt(0) ?? 0)) % 10_007;
  }
  const chosenIndex = candidates[seed % candidates.length];
  if (chosenIndex === undefined) {
    return undefined;
  }
  const targetGlyph = glyphs[chosenIndex];
  if (!targetGlyph) {
    return undefined;
  }
  const lower = targetGlyph.char.toLowerCase();
  const neighborLower = getOwnValue(QWERTY_NEIGHBOR_MAP, lower);
  if (!neighborLower) {
    return undefined;
  }
  const isUpper = targetGlyph.char !== lower;
  const wrongChar = isUpper ? neighborLower.toUpperCase() : neighborLower;
  const wrongLayout = resolveCharGlyph(wrongChar, fontSize, isBold, fontFamily);
  if (wrongLayout.pathData.length === 0) {
    return undefined;
  }
  return { typoGlyph: { ...wrongLayout, glyphX: targetGlyph.glyphX }, typoIndex: chosenIndex };
}

/** Append a `(timeMs, value)` keyframe point, keeping timestamps strictly increasing and collapsing redundant holds. */
function appendTimelinePoint(
  points: TimelinePoint[],
  timeMs: number,
  value: number,
  spline?: string
): void {
  const roundedValue = roundCoord(value);
  const roundedTime = Math.max(0, Math.round(timeMs));
  const len = points.length;
  const last = points[len - 1];
  if (!last) {
    points.push({ timeMs: roundedTime, value: roundedValue });
    return;
  }

  const prev = points[len - 2];
  if (
    prev &&
    prev.value === roundedValue &&
    last.value === roundedValue &&
    roundedTime > last.timeMs
  ) {
    last.timeMs = roundedTime;
    return;
  }

  if (roundedTime <= last.timeMs) {
    if (last.value === roundedValue) {
      return;
    }
    points.push({ spline, timeMs: last.timeMs + 1, value: roundedValue });
    return;
  }

  points.push({ spline, timeMs: roundedTime, value: roundedValue });
}

/** Append smooth cursor blink oscillation points across `[startMs, endMs]` while holding at `activeOpacity` at the boundaries. */
function appendCursorBlinkWindow(
  opacityPoints: TimelinePoint[],
  startMs: number,
  endMs: number,
  activeOpacity: number
): void {
  appendTimelinePoint(opacityPoints, startMs, activeOpacity);
  const windowDuration = endMs - startMs;
  if (windowDuration < CURSOR_BLINK_HALF_PERIOD_MS * 1.35) {
    appendTimelinePoint(opacityPoints, endMs, activeOpacity);
    return;
  }

  const troughOpacity = roundCoord(activeOpacity * CURSOR_BLINK_MIN_OPACITY);
  let cursorTime = startMs + CURSOR_BLINK_HALF_PERIOD_MS;
  let isTrough = true;
  while (cursorTime + 140 < endMs) {
    appendTimelinePoint(opacityPoints, cursorTime, isTrough ? troughOpacity : activeOpacity);
    cursorTime += CURSOR_BLINK_HALF_PERIOD_MS;
    isTrough = !isTrough;
  }
  appendTimelinePoint(opacityPoints, endMs, activeOpacity);
}

/** Serialize a list of `TimelinePoint` entries into a spline-eased SMIL `<animate>` element over `totalCycleMs`. */
function renderTimelineAnimate(
  attributeName: string,
  points: readonly TimelinePoint[],
  totalCycleMs: number,
  cycleDurAttr: string,
  defaultSpline: string
): string {
  if (points.length === 0 || totalCycleMs <= 0) {
    return '';
  }
  const valuesList: string[] = [];
  const keyTimesList: string[] = [];
  const keySplinesList: string[] = [];
  let prevKeyTime = -1;

  for (const [i, point] of points.entries()) {
    let keyTime = roundScale(Math.min(1, Math.max(0, point.timeMs / totalCycleMs)));
    if (i === 0) {
      keyTime = 0;
    } else if (i === points.length - 1) {
      keyTime = 1;
    } else {
      const remainingIntervals = points.length - 1 - i;
      const maxInteriorKeyTime = roundScale(Math.max(0.0001, 1 - remainingIntervals * 0.0001));
      const minInteriorKeyTime = roundScale(prevKeyTime + 0.0001);
      keyTime = Math.min(maxInteriorKeyTime, Math.max(minInteriorKeyTime, keyTime));
    }
    if (i > 0) {
      const prevPoint = points[i - 1];
      const isHoldSegment = prevPoint !== undefined && prevPoint.value === point.value;
      keySplinesList.push(isHoldSegment ? '0 0 1 1' : (point.spline ?? defaultSpline));
    }
    prevKeyTime = keyTime;
    valuesList.push(String(point.value));
    keyTimesList.push(String(keyTime));
  }

  if (keyTimesList[keyTimesList.length - 1] !== '1') {
    const lastValue = valuesList[valuesList.length - 1] ?? '0';
    valuesList.push(lastValue);
    keyTimesList.push('1');
    keySplinesList.push('0 0 1 1');
  }

  return `<animate attributeName="${attributeName}" values="${valuesList.join(';')}" keyTimes="${keyTimesList.join(';')}" calcMode="spline" keySplines="${keySplinesList.join(';')}" dur="${cycleDurAttr}" repeatCount="indefinite" />`;
}

/** Register a glyph's `(0, 0)` `<path>` outline in `glyphDefsById` and return its content-addressed ID. */
function registerGlyphDef(pathData: string, glyphDefsById: Map<string, string>): string {
  const glyphId = `type-g-${hashText(pathData)}`;
  if (!glyphDefsById.has(glyphId)) {
    glyphDefsById.set(glyphId, `<path id="${glyphId}" d="${pathData}" />`);
  }
  return glyphId;
}

/** Schedule the line erase phase and smooth cursor flight to `nextLineStartCursorX`. */
function scheduleLineErasePhase(options: ScheduleLineEraseOptions): void {
  const {
    activeOpacity,
    endCursorX,
    eraseMode,
    glyphs,
    lineScheduledRecords,
    lineStartX,
    nextLineStartCursorX,
    offsetX,
    startCursorX,
    state,
    totalAdvance,
  } = options;

  if (eraseMode === 'select') {
    const selectStartMs = state.currentTimeMs;
    const selectClearMs = selectStartMs + SELECT_HIGHLIGHT_MS;
    state.selectionFlashes.push({
      endMs: selectClearMs,
      rectWidth: roundCoord(Math.max(8, totalAdvance + 8)),
      rectX: roundCoord(lineStartX - 4),
      startMs: selectStartMs,
    });
    for (const record of lineScheduledRecords) {
      record.eraseStartMs = selectClearMs;
      record.eraseEndMs = selectClearMs + CHAR_FAST_FADE_OUT_MS;
    }
    appendTimelinePoint(state.cursorXPoints, selectClearMs, endCursorX);
    appendTimelinePoint(
      state.cursorXPoints,
      selectClearMs + 160,
      nextLineStartCursorX,
      '0.42 0 0.2 1'
    );
    state.currentTimeMs = selectClearMs + CHAR_FAST_FADE_OUT_MS + POST_ERASE_PAUSE_MS;
    appendTimelinePoint(state.cursorXPoints, state.currentTimeMs, nextLineStartCursorX);
    appendTimelinePoint(state.cursorOpacityPoints, state.currentTimeMs, activeOpacity);
    return;
  }

  if (eraseMode === 'fade') {
    const fadeStartMs = state.currentTimeMs;
    const fadeEndMs = fadeStartMs + LINE_FADE_ERASE_MS;
    const repositionDoneMs = fadeEndMs + 20;
    for (const record of lineScheduledRecords) {
      record.eraseStartMs = fadeStartMs;
      record.eraseEndMs = fadeEndMs;
    }
    appendTimelinePoint(state.cursorOpacityPoints, fadeStartMs, activeOpacity);
    appendTimelinePoint(state.cursorOpacityPoints, fadeEndMs, 0);
    appendTimelinePoint(state.cursorOpacityPoints, repositionDoneMs, 0);
    appendTimelinePoint(state.cursorXPoints, fadeStartMs, endCursorX);
    appendTimelinePoint(state.cursorXPoints, fadeEndMs, endCursorX);
    appendTimelinePoint(state.cursorXPoints, repositionDoneMs, nextLineStartCursorX);
    state.currentTimeMs = fadeEndMs + POST_ERASE_PAUSE_MS;
    appendTimelinePoint(state.cursorXPoints, state.currentTimeMs, nextLineStartCursorX);
    appendTimelinePoint(state.cursorOpacityPoints, state.currentTimeMs, activeOpacity);
    return;
  }

  // Default `'backspace'`; rapid OS key-repeat deletion from right to left:
  const totalEraseBudgetMs = Math.min(680, Math.max(260, glyphs.length * 32));
  const rawPerCharEraseMs = Math.round(totalEraseBudgetMs / Math.max(1, glyphs.length));
  const perCharEraseMs = clampInt(rawPerCharEraseMs, { default: 32, max: 52, min: 20 });
  let visibleRecordCursor = lineScheduledRecords.length - 1;

  for (let i = glyphs.length - 1; i >= 0; i -= 1) {
    const glyph = glyphs[i];
    if (glyph) {
      const stepDelay = i === glyphs.length - 1 ? 65 : perCharEraseMs;
      state.currentTimeMs += stepDelay;
      const targetCursorX = roundCoord(lineStartX + glyph.glyphX + offsetX);
      let stepSpline = '0 0 1 1';
      if (i === glyphs.length - 1 || (i === 0 && glyphs.length <= 2)) {
        stepSpline = '0.42 0 0.2 1';
      } else if (i === glyphs.length - 2) {
        stepSpline = '0.38 0 1 1';
      } else if (i === 0) {
        stepSpline = '0 0 0.2 1';
      }
      appendTimelinePoint(state.cursorXPoints, state.currentTimeMs, targetCursorX, stepSpline);

      if (glyph.pathData.length > 0 && visibleRecordCursor >= 0) {
        const record = lineScheduledRecords[visibleRecordCursor];
        if (record) {
          record.eraseStartMs = state.currentTimeMs - Math.min(14, Math.floor(stepDelay / 2));
          record.eraseEndMs = record.eraseStartMs + CHAR_FAST_FADE_OUT_MS;
        }
        visibleRecordCursor -= 1;
      }
    }
  }

  // Smoothly fly the cursor to `nextLineStartCursorX` when center alignment shifts the next line's start X:
  if (Math.abs(nextLineStartCursorX - startCursorX) > 0.5) {
    appendTimelinePoint(state.cursorXPoints, state.currentTimeMs + 35, startCursorX);
    appendTimelinePoint(
      state.cursorXPoints,
      state.currentTimeMs + 185,
      nextLineStartCursorX,
      '0.42 0 0.2 1'
    );
  }
  state.currentTimeMs += POST_ERASE_PAUSE_MS;
  appendTimelinePoint(state.cursorXPoints, state.currentTimeMs, nextLineStartCursorX);
  appendTimelinePoint(state.cursorOpacityPoints, state.currentTimeMs, activeOpacity);
}

/** Schedule one line's typing, optional typo, reading pause, and erase transitions onto `state`. */
function scheduleLineTimeline(options: ScheduleLineTimelineOptions): void {
  const {
    cursorGeometry,
    eraseMode,
    line,
    lineDurationMs,
    lineIndex,
    nextLineStartCursorX,
    pauseMs,
    state,
  } = options;
  const { glyphs, lineStartX, totalAdvance, typoGlyph, typoIndex } = line;
  const { activeOpacity, offsetX } = cursorGeometry;
  const startCursorX = roundCoord(lineStartX + offsetX);
  const endCursorX = roundCoord(lineStartX + totalAdvance + offsetX);

  // [1] Pre-typing pause with cursor positioned at the start of the line:
  appendTimelinePoint(state.cursorXPoints, state.currentTimeMs, startCursorX);
  appendTimelinePoint(state.cursorOpacityPoints, state.currentTimeMs, activeOpacity);
  state.currentTimeMs += PRE_LINE_PAUSE_MS;
  appendTimelinePoint(state.cursorXPoints, state.currentTimeMs, startCursorX);
  appendTimelinePoint(state.cursorOpacityPoints, state.currentTimeMs, activeOpacity);

  // [2] Compute normalized HCI keystroke intervals across the line's characters:
  const weights: number[] = [];
  let weightSum = 0;
  for (let i = 0; i < glyphs.length; i += 1) {
    const weight = computeKeystrokeWeight(glyphs, i, lineIndex);
    weights.push(weight);
    weightSum += weight;
  }
  const safeWeightSum = weightSum > 0 ? weightSum : 1;

  // Record each character's appearance window; erase timestamps are filled in step `[4]`:
  const lineScheduledRecords: ScheduledGlyph[] = [];

  for (const [i, glyph] of glyphs.entries()) {
    const stepMs = Math.max(24, Math.round(((weights[i] ?? 1) / safeWeightSum) * lineDurationMs));

    // Optional human typo + backspace correction before typing `glyph`:
    if (i === typoIndex && typoGlyph && typoGlyph.pathData.length > 0) {
      const typoStartMs = state.currentTimeMs + Math.round(stepMs * 0.45);
      const typoFadeEndMs = typoStartMs + CHAR_FADE_IN_MS;
      const typoBackspaceMs = typoFadeEndMs + TYPO_RECOGNITION_PAUSE_MS;
      const typoCursorTargetX = roundCoord(
        lineStartX + typoGlyph.glyphX + typoGlyph.advance + offsetX
      );
      const preTypoCursorX = roundCoord(lineStartX + glyph.glyphX + offsetX);

      appendTimelinePoint(state.cursorXPoints, typoStartMs, preTypoCursorX);
      appendTimelinePoint(state.cursorXPoints, typoStartMs + CURSOR_GLIDE_MS, typoCursorTargetX);
      appendTimelinePoint(state.cursorXPoints, typoBackspaceMs, typoCursorTargetX);
      appendTimelinePoint(
        state.cursorXPoints,
        typoBackspaceMs + 34,
        preTypoCursorX,
        '0.42 0 0.2 1'
      );

      const typoGlyphId = registerGlyphDef(typoGlyph.pathData, state.glyphDefsById);
      state.scheduledGlyphs.push({
        appearEndMs: typoFadeEndMs,
        appearStartMs: typoStartMs,
        eraseEndMs: typoBackspaceMs + CHAR_FAST_FADE_OUT_MS,
        eraseStartMs: typoBackspaceMs,
        glyphId: typoGlyphId,
        glyphX: roundCoord(lineStartX + typoGlyph.glyphX),
        isFirstLineChar: false,
      });

      state.currentTimeMs = typoBackspaceMs + TYPO_RECOVERY_PAUSE_MS;
    } else {
      state.currentTimeMs += stepMs;
    }

    const appearStartMs = state.currentTimeMs;
    const appearEndMs = appearStartMs + CHAR_FADE_IN_MS;
    const prevCursorX = roundCoord(lineStartX + glyph.glyphX + offsetX);
    const nextCursorX = roundCoord(lineStartX + glyph.glyphX + glyph.advance + offsetX);

    appendTimelinePoint(state.cursorXPoints, appearStartMs, prevCursorX);
    appendTimelinePoint(state.cursorXPoints, appearStartMs + CURSOR_GLIDE_MS, nextCursorX);

    if (glyph.pathData.length > 0) {
      const glyphId = registerGlyphDef(glyph.pathData, state.glyphDefsById);
      const record: ScheduledGlyph = {
        appearEndMs,
        appearStartMs,
        eraseEndMs: appearEndMs + 100,
        eraseStartMs: appearEndMs + 80,
        glyphId,
        glyphX: roundCoord(lineStartX + glyph.glyphX),
        isFirstLineChar: lineIndex === 0,
      };
      lineScheduledRecords.push(record);
      state.scheduledGlyphs.push(record);
    }
  }

  // Ensure the clock advances past the final character's fade-in:
  state.currentTimeMs += CHAR_FADE_IN_MS;
  appendTimelinePoint(state.cursorXPoints, state.currentTimeMs, endCursorX);

  // [3] Reading pause with smooth cursor blinking at the end of the line:
  const pauseStartMs = state.currentTimeMs;
  if (lineIndex === 0) {
    state.firstLineRestMs = pauseStartMs;
    state.firstLineEndCursorX = endCursorX;
  }
  const pauseEndMs = pauseStartMs + pauseMs;
  appendCursorBlinkWindow(state.cursorOpacityPoints, pauseStartMs, pauseEndMs, activeOpacity);
  state.currentTimeMs = pauseEndMs;
  appendTimelinePoint(state.cursorXPoints, state.currentTimeMs, endCursorX);

  // [4] Erase phase and transition to `nextLineStartCursorX`:
  scheduleLineErasePhase({
    activeOpacity,
    endCursorX,
    eraseMode,
    glyphs,
    lineScheduledRecords,
    lineStartX,
    nextLineStartCursorX,
    offsetX,
    startCursorX,
    state,
    totalAdvance,
  });
}

/** Render a resolved icon slot at `(boxX, boxY)` and return its SVG markup and visual width. */
function renderPositionedIconSlot(options: PositionedIconSlotOptions): RenderedIconSlot {
  const { boxSize, boxX, boxY, color, iconSlot, isBoxCentered, isOnPrimary, opacity } = options;
  const resolvedIcon = iconSlot.data;
  const scaleNum = boxSize / 24;
  const iconScale = roundScale(scaleNum);
  const renderedWidth = measureIconVisualWidth(resolvedIcon, boxSize);
  const visualStartX = isBoxCentered ? roundCoord(boxX + (boxSize - renderedWidth) / 2) : boxX;
  const iconOffsetX = computeIconTranslateX(visualStartX, resolvedIcon, scaleNum);
  const markup = renderIconGroup({
    color,
    innerSvg: resolvedIcon.innerSvg,
    isFallback: iconSlot.isFallback,
    isOnPrimary,
    opacity,
    strokeWidth: DEFAULT_ICON_STROKE_WIDTH,
    transform: `translate(${iconOffsetX}, ${roundCoord(boxY)}) scale(${iconScale})`,
    type: resolvedIcon.type,
  });
  return { markup, renderedWidth };
}

/** Render the inner icon and/or text markup inside a positioned hint pill or 3D keycap. */
function renderHintBadgeInner(options: HintBadgeInnerOptions): string {
  const {
    badgeHeight,
    badgeWidth,
    badgeX,
    badgeY,
    contentWidth,
    hint,
    hintFontSize,
    iconBoxSize,
    iconTextGap,
    iconVisualWidth,
    isOnPrimary,
    keycapTextFill,
    mutedTextColor,
    verticalNudge,
  } = options;
  const iconColor = isOnPrimary ? WHITE : mutedTextColor;
  const iconOpacity = isOnPrimary ? 0.72 : undefined;

  if (hint.iconSlot && !hint.text) {
    return renderPositionedIconSlot({
      boxSize: iconBoxSize,
      boxX: roundCoord(badgeX + (badgeWidth - iconBoxSize) / 2),
      boxY: roundCoord(badgeY + (badgeHeight - iconBoxSize) / 2 + verticalNudge),
      color: iconColor,
      iconSlot: hint.iconSlot,
      isBoxCentered: true,
      isOnPrimary,
      opacity: iconOpacity,
    }).markup;
  }

  if (!hint.iconSlot && hint.text) {
    return renderTextPathMarkup(hint.text, {
      align: 'center',
      anchorX: roundCoord(badgeX + badgeWidth / 2),
      baselineY: roundCoord(
        badgeY + computeCenteredBaselineY(badgeHeight, hintFontSize) + verticalNudge
      ),
      fill: keycapTextFill,
      font: 'mono',
      fontSize: hintFontSize,
      isBold: true,
    });
  }

  if (!hint.iconSlot) {
    return '';
  }

  const contentStartX = roundCoord(badgeX + (badgeWidth - contentWidth) / 2);
  const iconMarkup = renderPositionedIconSlot({
    boxSize: iconBoxSize,
    boxX: contentStartX,
    boxY: roundCoord(badgeY + (badgeHeight - iconBoxSize) / 2 + verticalNudge),
    color: iconColor,
    iconSlot: hint.iconSlot,
    isBoxCentered: false,
    isOnPrimary,
    opacity: iconOpacity,
  }).markup;
  const textMarkup = renderTextPathMarkup(hint.text, {
    align: 'left',
    anchorX: roundCoord(contentStartX + iconVisualWidth + iconTextGap),
    baselineY: roundCoord(
      badgeY + computeCenteredBaselineY(badgeHeight, hintFontSize) + verticalNudge
    ),
    fill: keycapTextFill,
    font: 'mono',
    fontSize: hintFontSize,
    isBold: true,
  });
  return `${iconMarkup}${textMarkup}`;
}

/** Resolve the fill, border stroke, and text fill colors for a keycap or header hint badge. */
function resolveHintBadgePaint(
  isOnPrimary: boolean,
  variant: BadgeVariant,
  palette: ThemePalette,
  mutedTextColor: string
): HintBadgePaint {
  if (isOnPrimary) {
    return {
      keycapFill: 'rgba(0,0,0,0.11)',
      keycapStroke: 'rgba(255,255,255,0.15)',
      keycapTextFill: 'rgba(255,255,255,0.72)',
    };
  }
  return {
    keycapFill: 'rgba(9,10,15,0.62)',
    keycapStroke: variant === '2' ? palette.borderColor : BASE_DARK.borderNeutral,
    keycapTextFill: mutedTextColor,
  };
}

/** Measure the dimensions and horizontal reserved space of a trailing hint badge before `width` is finalized. */
function measureHintBadgeGeometry(
  hint: ResolvedTypingHint | undefined,
  layout: TypingLayout,
  metrics: TypingMetrics
): HintBadgeGeometry | undefined {
  if (!hint || layout === 'none') {
    return undefined;
  }

  const { bodyHeight, headerHeight, hintFontSize, scale } = metrics;
  const isHeaderBadge = layout === 'window' || layout === 'ide';
  const iconBoxSize = Math.round((isHeaderBadge ? 11.5 : 13) * scale);
  const iconVisualWidth = measureIconVisualWidth(hint.iconSlot?.data, iconBoxSize);
  const textWidth = hint.text ? measureTextWidth(hint.text, hintFontSize, true, false, 'mono') : 0;
  const iconTextGap =
    hint.iconSlot && hint.text ? Math.round((isHeaderBadge ? 4.5 : 5) * scale) : 0;
  const contentWidth = iconVisualWidth + iconTextGap + textWidth;
  const badgePadX = Math.round((isHeaderBadge ? 8.5 : 7.5) * scale);
  const badgeWidth =
    hint.iconSlot && !hint.text
      ? Math.round((isHeaderBadge ? 24 : 23) * scale)
      : Math.max(Math.round(24 * scale), Math.ceil(contentWidth + badgePadX * 2));

  if (isHeaderBadge) {
    const badgeHeight = Math.round(18 * scale);
    const inset = roundCoord((headerHeight - badgeHeight) / 2);
    return {
      badgeHeight,
      badgeRadius: roundCoord(badgeHeight / 2),
      badgeRightInset: inset,
      badgeWidth,
      badgeY: inset,
      contentWidth,
      iconBoxSize,
      iconTextGap,
      iconVisualWidth,
      reservedBodyWidth: 0,
      reservedHeaderWidth: Math.ceil(badgeWidth + inset + Math.round(12 * scale)),
    };
  }

  if (layout === 'browser') {
    const wellInsetY = roundCoord(Math.max(6, Math.round(7 * scale)));
    const wellHeight = roundCoord(bodyHeight - 2 * wellInsetY);
    const badgeHeight = Math.round(22 * scale);
    const innerInset = roundCoord((wellHeight - badgeHeight) / 2);
    const badgeInset = roundCoord(wellInsetY + innerInset);
    return {
      badgeHeight,
      badgeRadius: Math.max(4, Math.round(5 * scale)),
      badgeRightInset: badgeInset,
      badgeWidth,
      badgeY: badgeInset,
      contentWidth,
      iconBoxSize,
      iconTextGap,
      iconVisualWidth,
      reservedBodyWidth: Math.ceil(badgeWidth + innerInset + Math.round(6 * scale)),
      reservedHeaderWidth: 0,
    };
  }

  const badgeHeight = Math.round(23 * scale);
  const inset = roundCoord((bodyHeight - badgeHeight) / 2);
  return {
    badgeHeight,
    badgeRadius: Math.max(5, Math.round(6 * scale)),
    badgeRightInset: inset,
    badgeWidth,
    badgeY: inset,
    contentWidth,
    iconBoxSize,
    iconTextGap,
    iconVisualWidth,
    reservedBodyWidth: Math.ceil(badgeWidth + inset + Math.round(8 * scale)),
    reservedHeaderWidth: 0,
  };
}

/** Render the trailing hint badge according to the active container layout. */
function renderHintBadge(options: RenderHintBadgeOptions): string {
  const { geometry, hint, layout, metrics, palette, styleTokens, variant, width } = options;
  if (!geometry || !hint || layout === 'none') {
    return '';
  }

  const {
    badgeHeight,
    badgeRadius,
    badgeRightInset,
    badgeWidth,
    badgeY,
    contentWidth,
    iconBoxSize,
    iconTextGap,
    iconVisualWidth,
  } = geometry;
  const badgeX = roundCoord(width - badgeRightInset - badgeWidth);

  const { keycapFill, keycapStroke, keycapTextFill } = resolveHintBadgePaint(
    styleTokens.isOnPrimary,
    variant,
    palette,
    styleTokens.mutedTextColor
  );
  const baseInnerOptions = {
    badgeHeight,
    badgeWidth,
    badgeX,
    badgeY,
    contentWidth,
    hint,
    hintFontSize: metrics.hintFontSize,
    iconBoxSize,
    iconTextGap,
    iconVisualWidth,
    isOnPrimary: styleTokens.isOnPrimary,
    keycapTextFill,
    mutedTextColor: styleTokens.mutedTextColor,
  };

  if (layout === 'window' || layout === 'ide') {
    const innerMarkup = renderHintBadgeInner({ ...baseInnerOptions, verticalNudge: 0 });
    return `<rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeRadius}" fill="${keycapFill}" stroke="${keycapStroke}" stroke-width="1" />${innerMarkup}`;
  }

  if (layout === 'browser') {
    const innerMarkup = renderHintBadgeInner({ ...baseInnerOptions, verticalNudge: 0 });
    return `<rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeRadius}" fill="${keycapFill}" />${innerMarkup}`;
  }

  // `layout === 'prompt'`; recessed 3D keycap with Kumo lower-edge crescent and outer border ring:
  const bottomCrescentPath = buildBottomCrescentPath(
    badgeX,
    badgeX + badgeWidth,
    badgeRadius,
    badgeY + badgeHeight
  );
  const crescentFill = !styleTokens.isOnPrimary && variant === '2' ? palette.borderColor : WHITE;
  let crescentOpacity = '0.065';
  if (styleTokens.isOnPrimary) {
    crescentOpacity = '0.14';
  } else if (variant === '2') {
    crescentOpacity = '0.45';
  }
  const ringGeometry = `x="${roundCoord(badgeX + 0.5)}" y="${roundCoord(badgeY + 0.5)}" width="${roundCoord(badgeWidth - 1)}" height="${roundCoord(badgeHeight - 1)}" rx="${roundCoord(badgeRadius - 0.5)}"`;
  const innerMarkup = renderHintBadgeInner({ ...baseInnerOptions, verticalNudge: -0.5 });
  return (
    `<rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeRadius}" fill="${keycapFill}" />` +
    `<path d="${bottomCrescentPath}" fill="${crescentFill}" fill-opacity="${crescentOpacity}" />` +
    `<rect ${ringGeometry} stroke="${keycapStroke}" stroke-width="1" />${innerMarkup}`
  );
}

/** Compute traffic-light dot geometry, defaulting left X-padding to match vertical Y-padding in `bandHeight`. */
function computeTrafficLightLayout(
  bandHeight: number,
  scale: number,
  leftEdgeX?: number
): TrafficLightLayout {
  const dotRadius = roundCoord(Math.max(4, 4.5 * scale));
  const dotGap = roundCoord(Math.max(12, 14 * scale));
  const dotCy = roundCoord(bandHeight / 2);
  const firstDotCx = leftEdgeX === undefined ? dotCy : roundCoord(leftEdgeX + dotRadius);
  return {
    dotCy,
    dotGap,
    dotRadius,
    firstDotCx,
    rightEdgeX: roundCoord(firstDotCx + 2 * dotGap + dotRadius),
  };
}

/** Compute balanced horizontal spacing around the traffic-light dots and search omnibox well in `browser` layout. */
function computeBrowserToolbarLayout(bodyHeight: number, scale: number): BrowserToolbarLayout {
  const dotMargin = Math.round(12 * scale);
  const dotLeftEdgeX = roundCoord(0.5 + dotMargin);
  const trafficLights = computeTrafficLightLayout(bodyHeight, scale, dotLeftEdgeX);
  return { dotLeftEdgeX, trafficLights, wellX: roundCoord(trafficLights.rightEdgeX + dotMargin) };
}

/** Compute horizontal geometry of the active file tab in `ide` layout. */
function computeIdeTabMetrics(
  rightEdgeX: number,
  scale: number,
  titleWidth: number,
  iconSlot: ResolvedTypingIconSlot | undefined
): IdeTabMetrics {
  const tabStartX = roundCoord(rightEdgeX + Math.round(12 * scale));
  const tabPadX = Math.round(10 * scale);
  const tabIconSize = Math.round(13 * scale);
  const iconGap = Math.round(6 * scale);
  const closeGap = Math.round(8 * scale);
  const closeSize = roundCoord(Math.max(4.5, 5 * scale));
  const iconVisualWidth = measureIconVisualWidth(iconSlot?.data, tabIconSize);
  const tabContentWidth =
    (iconSlot ? iconVisualWidth + iconGap : 0) + titleWidth + closeGap + closeSize;
  const tabWidth = Math.max(Math.round(84 * scale), Math.ceil(tabContentWidth + tabPadX * 2));
  return { closeGap, closeSize, iconGap, tabIconSize, tabPadX, tabStartX, tabWidth };
}

/** Render traffic-light window control dots inside `bandHeight`. */
function renderTrafficLightDots(
  bandHeight: number,
  scale: number,
  variant: BadgeVariant,
  isOnPrimary: boolean,
  leftEdgeX?: number
): RenderedTrafficLightDots {
  const { dotCy, dotGap, dotRadius, firstDotCx, rightEdgeX } = computeTrafficLightLayout(
    bandHeight,
    scale,
    leftEdgeX
  );
  let dotsMarkup = '';

  for (let i = 0; i < 3; i += 1) {
    const dotCx = roundCoord(firstDotCx + i * dotGap);
    if (isOnPrimary) {
      const opacity = PRIMARY_WINDOW_DOT_OPACITIES[i] ?? '0.4';
      dotsMarkup += `<circle cx="${dotCx}" cy="${dotCy}" r="${dotRadius}" fill="${WHITE}" fill-opacity="${opacity}" />`;
    } else {
      const dotColor = WINDOW_DOT_COLORS[i] ?? '#10B981';
      const dotOpacity = variant === '3' ? '0.62' : '0.86';
      dotsMarkup += `<circle cx="${dotCx}" cy="${dotCy}" r="${dotRadius}" fill="${dotColor}" fill-opacity="${dotOpacity}" />`;
    }
  }

  return { dotsMarkup, rightEdgeX };
}

/** Render the top chrome of `layout === 'window'`. */
function renderWindowHeaderChrome(options: WindowHeaderChromeOptions): string {
  const { dotsMarkup, iconSlot, metrics, styleTokens, titleText, width } = options;
  const { headerHeight, radius, scale, titleFontSize } = metrics;
  const innerRadius = Math.max(1, radius - 1);
  const headerTintFill = styleTokens.isOnPrimary ? '#000000' : WHITE;
  const headerTintOpacity = styleTokens.isOnPrimary ? '0.10' : '0.025';
  const headerPath = `M 1 ${headerHeight} V ${1 + innerRadius} A ${innerRadius} ${innerRadius} 0 0 1 ${1 + innerRadius} 1 H ${width - 1 - innerRadius} A ${innerRadius} ${innerRadius} 0 0 1 ${width - 1} ${1 + innerRadius} V ${headerHeight} Z`;

  let markup =
    `<path d="${headerPath}" fill="${headerTintFill}" fill-opacity="${headerTintOpacity}" />` +
    `<line x1="1" y1="${headerHeight}" x2="${width - 1}" y2="${headerHeight}" stroke="${styleTokens.dividerColor}" stroke-width="1" />${
      dotsMarkup
    }`;

  const headerIconSize = Math.round(14 * scale);
  const titleWidth =
    titleText.length > 0 ? measureTextWidth(titleText, titleFontSize, true, false, 'mono') : 0;

  if (iconSlot && titleText.length > 0) {
    const iconProbeWidth = measureIconVisualWidth(iconSlot.data, headerIconSize);
    const gap = Math.round(6 * scale);
    const totalPairWidth = iconProbeWidth + gap + titleWidth;
    const pairStartX = roundCoord((width - totalPairWidth) / 2);
    const iconY = roundCoord((headerHeight - headerIconSize) / 2);
    const renderedIcon = renderPositionedIconSlot({
      boxSize: headerIconSize,
      boxX: pairStartX,
      boxY: iconY,
      color: styleTokens.iconPaint.color,
      iconSlot,
      isOnPrimary: styleTokens.isOnPrimary,
      opacity: styleTokens.iconPaint.opacity,
    });
    markup += renderedIcon.markup;
    markup += renderTextPathMarkup(titleText, {
      align: 'left',
      anchorX: roundCoord(pairStartX + renderedIcon.renderedWidth + gap),
      baselineY: computeCenteredBaselineY(headerHeight, titleFontSize),
      fill: styleTokens.mutedTextColor,
      font: 'mono',
      fontSize: titleFontSize,
      isBold: true,
    });
    return markup;
  }

  if (iconSlot) {
    const iconY = roundCoord((headerHeight - headerIconSize) / 2);
    markup += renderPositionedIconSlot({
      boxSize: headerIconSize,
      boxX: roundCoord((width - headerIconSize) / 2),
      boxY: iconY,
      color: styleTokens.iconPaint.color,
      iconSlot,
      isBoxCentered: true,
      isOnPrimary: styleTokens.isOnPrimary,
      opacity: styleTokens.iconPaint.opacity,
    }).markup;
    return markup;
  }

  if (titleText.length > 0) {
    markup += renderTextPathMarkup(titleText, {
      align: 'center',
      anchorX: roundCoord(width / 2),
      baselineY: computeCenteredBaselineY(headerHeight, titleFontSize),
      fill: styleTokens.mutedTextColor,
      font: 'mono',
      fontSize: titleFontSize,
      isBold: true,
    });
  }
  return markup;
}

/** Render the seamless active file tab, recessed tab bar, and line-number gutter of `layout === 'ide'`. */
function renderIdeHeaderAndGutterChrome(options: IdeHeaderChromeOptions): string {
  const { dotsMarkup, height, iconSlot, metrics, rightEdgeX, styleTokens, titleText, width } =
    options;
  const { bodyHeight, headerHeight, radius, scale, titleFontSize } = metrics;
  const innerRadius = Math.max(1, radius - 1);
  const tabTopY = roundCoord(Math.max(4, Math.round(5 * scale)));
  const tabHeight = headerHeight - tabTopY;
  const tabRadius = Math.max(5, Math.round(6 * scale));
  const titleWidth =
    titleText.length > 0 ? measureTextWidth(titleText, titleFontSize, true, false, 'mono') : 0;
  const { closeSize, iconGap, tabIconSize, tabPadX, tabStartX, tabWidth } = computeIdeTabMetrics(
    rightEdgeX,
    scale,
    titleWidth,
    iconSlot
  );
  const tabEndX = roundCoord(Math.min(width - Math.round(24 * scale), tabStartX + tabWidth));

  // Darken the recessed tab strip outside the active tab so the active tab seamlessly shares the editor surface:
  const inactiveHeaderPath = `M 1 ${headerHeight} V ${1 + innerRadius} A ${innerRadius} ${innerRadius} 0 0 1 ${1 + innerRadius} 1 H ${width - 1 - innerRadius} A ${innerRadius} ${innerRadius} 0 0 1 ${width - 1} ${1 + innerRadius} V ${headerHeight} H ${tabEndX} V ${tabTopY + tabRadius} A ${tabRadius} ${tabRadius} 0 0 0 ${tabEndX - tabRadius} ${tabTopY} H ${tabStartX + tabRadius} A ${tabRadius} ${tabRadius} 0 0 0 ${tabStartX} ${tabTopY + tabRadius} V ${headerHeight} Z`;
  const inactiveHeaderOpacity = styleTokens.isOnPrimary ? '0.14' : '0.28';
  const borderPath = `M 1 ${headerHeight} H ${tabStartX} V ${tabTopY + tabRadius} A ${tabRadius} ${tabRadius} 0 0 1 ${tabStartX + tabRadius} ${tabTopY} H ${tabEndX - tabRadius} A ${tabRadius} ${tabRadius} 0 0 1 ${tabEndX} ${tabTopY + tabRadius} V ${headerHeight} H ${width - 1}`;

  let markup =
    `<path d="${inactiveHeaderPath}" fill="#000000" fill-opacity="${inactiveHeaderOpacity}" />` +
    `<path d="${borderPath}" fill="none" stroke="${styleTokens.dividerColor}" stroke-width="1" />` +
    `<line x1="${roundCoord(tabStartX + tabRadius)}" y1="${tabTopY}" x2="${roundCoord(tabEndX - tabRadius)}" y2="${tabTopY}" stroke="${styleTokens.accentColor}" stroke-width="1.5" stroke-linecap="round" />${
      dotsMarkup
    }`;

  let cursorX = roundCoord(tabStartX + tabPadX);
  if (iconSlot) {
    const iconY = roundCoord(tabTopY + (tabHeight - tabIconSize) / 2);
    const renderedIcon = renderPositionedIconSlot({
      boxSize: tabIconSize,
      boxX: cursorX,
      boxY: iconY,
      color: styleTokens.accentColor,
      iconSlot,
      isOnPrimary: styleTokens.isOnPrimary,
      opacity: styleTokens.iconPaint.opacity,
    });
    markup += renderedIcon.markup;
    cursorX = roundCoord(cursorX + renderedIcon.renderedWidth + iconGap);
  }

  if (titleText.length > 0) {
    markup += renderTextPathMarkup(titleText, {
      align: 'left',
      anchorX: cursorX,
      baselineY: roundCoord(tabTopY + computeCenteredBaselineY(tabHeight, titleFontSize)),
      fill: styleTokens.textColor,
      font: 'mono',
      fontSize: titleFontSize,
      isBold: true,
    });
  }

  // Subtle tab close `×` mark on the right side of the active tab:
  const closeCenterX = roundCoord(tabEndX - tabPadX - closeSize / 2);
  const closeCenterY = roundCoord(tabTopY + tabHeight / 2);
  const halfClose = roundCoord(closeSize / 2);
  const closePath = `M ${roundCoord(closeCenterX - halfClose)} ${roundCoord(closeCenterY - halfClose)} L ${roundCoord(closeCenterX + halfClose)} ${roundCoord(closeCenterY + halfClose)} M ${roundCoord(closeCenterX + halfClose)} ${roundCoord(closeCenterY - halfClose)} L ${roundCoord(closeCenterX - halfClose)} ${roundCoord(closeCenterY + halfClose)}`;
  markup += `<path d="${closePath}" fill="none" stroke="${styleTokens.mutedTextColor}" stroke-opacity="0.48" stroke-width="1.2" stroke-linecap="round" />`;

  // Subtle active-line highlight + line-number gutter (`1` + vertical separator line) in the editor body:
  const gutterWidth = Math.round(36 * scale);
  const activeBandInsetY = Math.round(9 * scale);
  const activeBandY = roundCoord(headerHeight + activeBandInsetY);
  const activeBandHeight = roundCoord(bodyHeight - 2 * activeBandInsetY);
  const activeBandOpacity = styleTokens.isOnPrimary ? '0.06' : '0.025';
  markup += `<rect x="${gutterWidth}" y="${activeBandY}" width="${width - gutterWidth - 1}" height="${activeBandHeight}" fill="${WHITE}" fill-opacity="${activeBandOpacity}" />`;
  markup += `<line x1="${gutterWidth}" y1="${headerHeight}" x2="${gutterWidth}" y2="${height - 1}" stroke="${styleTokens.dividerColor}" stroke-width="1" stroke-opacity="0.6" />`;

  const gutterBaselineY = roundCoord(
    headerHeight + computeCenteredBaselineY(bodyHeight, titleFontSize)
  );
  const gutterNumberPath = renderTextPathMarkup('1', {
    align: 'center',
    anchorX: roundCoord(gutterWidth / 2),
    baselineY: gutterBaselineY,
    fill: styleTokens.mutedTextColor,
    font: 'mono',
    fontSize: titleFontSize,
    isBold: false,
  });
  markup += `<g opacity="0.42">${gutterNumberPath}</g>`;

  return markup;
}

/** Render the Kumo container surface and layout-specific chrome. */
function renderTypingContainerSurface(options: TypingContainerSurfaceOptions): string {
  const {
    color,
    height,
    iconSlot,
    layout,
    metrics,
    palette,
    styleTokens,
    titleText,
    variant,
    width,
  } = options;
  if (layout === 'none') {
    return '';
  }

  const { bodyHeight, headerHeight, radius, scale } = metrics;
  let markup = renderKumoBoxSurface({ color, height, radius, variant, width });

  if (layout === 'window' || layout === 'ide') {
    const { dotsMarkup, rightEdgeX } = renderTrafficLightDots(
      headerHeight,
      scale,
      variant,
      styleTokens.isOnPrimary
    );
    if (layout === 'window') {
      return (
        markup +
        renderWindowHeaderChrome({ dotsMarkup, iconSlot, metrics, styleTokens, titleText, width })
      );
    }
    return (
      markup +
      renderIdeHeaderAndGutterChrome({
        dotsMarkup,
        height,
        iconSlot,
        metrics,
        rightEdgeX,
        styleTokens,
        titleText,
        width,
      })
    );
  }

  if (layout === 'browser') {
    const { dotLeftEdgeX, wellX } = computeBrowserToolbarLayout(bodyHeight, scale);
    const { dotsMarkup } = renderTrafficLightDots(
      bodyHeight,
      scale,
      variant,
      styleTokens.isOnPrimary,
      dotLeftEdgeX
    );
    const wellInsetY = roundCoord(Math.max(6, Math.round(7 * scale)));
    const wellWidth = roundCoord(Math.max(60, width - wellX - wellInsetY));
    const wellHeight = roundCoord(bodyHeight - 2 * wellInsetY);
    const wellRadius = Math.max(6, Math.round(8 * scale));
    const wellFill = styleTokens.isOnPrimary ? 'rgba(0,0,0,0.13)' : 'rgba(9,10,15,0.52)';
    let wellStroke = BASE_DARK.borderNeutral;
    if (styleTokens.isOnPrimary) {
      wellStroke = 'rgba(255,255,255,0.16)';
    } else if (variant === '2') {
      wellStroke = palette.borderColor;
    }
    markup += dotsMarkup;
    markup += `<rect x="${wellX}" y="${wellInsetY}" width="${wellWidth}" height="${wellHeight}" rx="${wellRadius}" fill="${wellFill}" stroke="${wellStroke}" stroke-width="1" />`;
    return markup;
  }

  if (layout === 'prompt' && iconSlot) {
    const avatarSize = Math.round(28 * scale);
    const avatarInset = roundCoord((bodyHeight - avatarSize) / 2);
    const avatarRadius = Math.max(6, Math.round(8 * scale));
    const badgeFill = styleTokens.isOnPrimary ? 'rgba(0,0,0,0.14)' : palette.iconColor;
    const badgeFillOpacity = styleTokens.isOnPrimary ? '1' : '0.16';
    const badgeStroke = styleTokens.isOnPrimary ? 'rgba(255,255,255,0.22)' : palette.iconColor;
    const badgeStrokeOpacity = styleTokens.isOnPrimary ? '1' : '0.36';
    markup += `<rect x="${avatarInset}" y="${avatarInset}" width="${avatarSize}" height="${avatarSize}" rx="${avatarRadius}" fill="${badgeFill}" fill-opacity="${badgeFillOpacity}" stroke="${badgeStroke}" stroke-opacity="${badgeStrokeOpacity}" stroke-width="1" />`;
  }

  return markup;
}

/** Resolve the initial horizontal X coordinate where leading content starts in the body row. */
function resolveBodyStartX(layout: TypingLayout, metrics: TypingMetrics): number {
  const { bodyHeight, padX, scale } = metrics;
  if (layout === 'ide') {
    return Math.round(36 * scale) + Math.round(12 * scale);
  }
  if (layout === 'browser') {
    const { wellX } = computeBrowserToolbarLayout(bodyHeight, scale);
    return roundCoord(wellX + Math.round(11 * scale));
  }
  return padX;
}

/** Render the leading icon and static prefix in the body row and return `textStartX`. */
function renderLeadingPrompt(options: LeadingPromptOptions): LeadingPromptLayout {
  const { baselineY, fontFamily, iconSlot, layout, metrics, prefixText, styleTokens } = options;
  const { bodyHeight, fontSize, headerHeight, iconBoxSize, scale } = metrics;
  let currentX = resolveBodyStartX(layout, metrics);
  let markup = '';

  // Icons on `window` and `ide` live in the header/tab bar; on `prompt`, `browser`, and `none`, they live in the body row:
  if (layout === 'prompt' && iconSlot) {
    const avatarSize = Math.round(28 * scale);
    const avatarInset = roundCoord((bodyHeight - avatarSize) / 2);
    const promptIconSize = Math.round(16 * scale);
    const iconBoxX = roundCoord(avatarInset + (avatarSize - promptIconSize) / 2);
    const iconY = roundCoord(headerHeight + (bodyHeight - promptIconSize) / 2);
    markup += renderPositionedIconSlot({
      boxSize: promptIconSize,
      boxX: iconBoxX,
      boxY: iconY,
      color: styleTokens.accentColor,
      iconSlot,
      isBoxCentered: true,
      isOnPrimary: styleTokens.isOnPrimary,
      opacity: styleTokens.iconPaint.opacity,
    }).markup;
    currentX = roundCoord(avatarInset + avatarSize + Math.round(12 * scale));
  } else if ((layout === 'browser' || layout === 'none') && iconSlot) {
    const effectiveIconSize = layout === 'browser' ? Math.round(15 * scale) : iconBoxSize;
    const iconY = roundCoord(headerHeight + (bodyHeight - effectiveIconSize) / 2);
    const renderedIcon = renderPositionedIconSlot({
      boxSize: effectiveIconSize,
      boxX: currentX,
      boxY: iconY,
      color: styleTokens.iconPaint.color,
      iconSlot,
      isOnPrimary: styleTokens.isOnPrimary,
      opacity: styleTokens.iconPaint.opacity,
    });
    markup += renderedIcon.markup;
    currentX = roundCoord(currentX + renderedIcon.renderedWidth + Math.round(10 * scale));
  }

  if (prefixText.length > 0) {
    const prefixLayout = layoutTextGlyphs(prefixText, fontSize, true, fontFamily);
    markup += renderTextPathMarkup(prefixText, {
      align: 'left',
      anchorX: currentX,
      baselineY,
      fill: styleTokens.accentColor,
      font: fontFamily,
      fontSize,
      isBold: true,
    });
    currentX = roundCoord(currentX + prefixLayout.totalAdvance + Math.round(9 * scale));
  }

  return { markup, textStartX: currentX };
}

/** Render the static typing SVG showing the first line and stationary cursor. */
function renderStaticTypingSvg(context: TypingBodyRenderContext): string {
  const {
    ariaText,
    baselineY,
    cursorGeometry,
    height,
    hintMarkup,
    leading,
    preparedLines,
    styleTokens,
    surfaceMarkup,
    width,
  } = context;
  const [firstLine] = preparedLines;
  const staticGlyphDefs = new Map<string, string>();
  let staticCharsMarkup = '';

  if (firstLine) {
    for (const glyph of firstLine.glyphs) {
      if (glyph.pathData.length > 0) {
        const glyphId = registerGlyphDef(glyph.pathData, staticGlyphDefs);
        const charX = roundCoord(firstLine.lineStartX + glyph.glyphX);
        staticCharsMarkup += `<use href="#${glyphId}" x="${charX}" y="${baselineY}" fill="${styleTokens.textColor}" />`;
      }
    }
  }

  const staticCursorBaseX = firstLine
    ? firstLine.lineStartX + firstLine.totalAdvance
    : leading.textStartX;
  const staticCursorX = roundCoord(staticCursorBaseX + cursorGeometry.offsetX);
  const staticCursorMarkup = `<rect x="${staticCursorX}" y="${cursorGeometry.cursorY}" width="${cursorGeometry.width}" height="${cursorGeometry.height}" rx="${cursorGeometry.radius}" fill="${styleTokens.cursorColor}" fill-opacity="${cursorGeometry.activeOpacity}" />`;

  let defsMarkup = styleTokens.gradDefs;
  for (const defMarkup of staticGlyphDefs.values()) {
    defsMarkup += defMarkup;
  }

  return renderSvgDocument({
    ariaLabel: ariaText,
    body: `${surfaceMarkup}${hintMarkup}${leading.markup}${staticCharsMarkup}${staticCursorMarkup}`,
    defs: defsMarkup,
    height,
    width,
  });
}

/** Render the SMIL-animated typing SVG across all scheduled lines. */
function renderAnimatedTypingSvg(context: TypingBodyRenderContext): string {
  const {
    animMode,
    ariaText,
    baselineY,
    cursorGeometry,
    eraseMode,
    height,
    hintMarkup,
    layout,
    leading,
    metrics,
    options,
    preparedLines,
    styleTokens,
    surfaceMarkup,
    width,
  } = context;
  const { fontSize, radius } = metrics;
  const baseDurationMs = clampInt(options.duration, TYPING_DURATION_RANGE);
  const pauseMs = clampInt(options.pause, TYPING_PAUSE_RANGE);
  let totalChars = 0;
  for (const line of preparedLines) {
    totalChars += Math.max(1, line.glyphs.length);
  }
  const meanLineChars = totalChars / Math.max(1, preparedLines.length);

  const timelineState: CycleTimelineState = {
    currentTimeMs: 0,
    cursorOpacityPoints: [],
    cursorXPoints: [],
    firstLineEndCursorX: roundCoord(leading.textStartX + cursorGeometry.offsetX),
    firstLineRestMs: 0,
    glyphDefsById: new Map<string, string>(),
    scheduledGlyphs: [],
    selectionFlashes: [],
  };

  for (const [i, line] of preparedLines.entries()) {
    const lengthRatio =
      preparedLines.length === 1
        ? 1
        : Math.min(1.35, Math.max(0.55, line.glyphs.length / meanLineChars));
    const lineDurationMs = Math.round(baseDurationMs * lengthRatio);
    const nextLine = preparedLines[(i + 1) % preparedLines.length] ?? line;
    const nextLineStartCursorX = roundCoord(nextLine.lineStartX + cursorGeometry.offsetX);
    scheduleLineTimeline({
      cursorGeometry,
      eraseMode,
      line,
      lineDurationMs,
      lineIndex: i,
      nextLineStartCursorX,
      pauseMs,
      state: timelineState,
    });
  }

  const totalCycleMs = Math.max(100, timelineState.currentTimeMs);
  const cycleDurAttr = `${roundTenths(totalCycleMs / 1000)}s`;

  let selectionMarkup = '';
  const selectBoxY = roundCoord(baselineY - fontSize * 0.92);
  const selectBoxHeight = roundCoord(fontSize * 1.2);
  for (const flash of timelineState.selectionFlashes) {
    const tStart = roundScale(Math.min(0.9992, Math.max(0.0001, flash.startMs / totalCycleMs)));
    const tAppear = roundScale(Math.min(0.9994, Math.max(tStart + 0.0001, tStart + 0.002)));
    const tEnd = roundScale(
      Math.min(0.9996, Math.max(tAppear + 0.0002, flash.endMs / totalCycleMs))
    );
    const tClear = roundScale(Math.min(0.9998, Math.max(tEnd + 0.0001, tEnd + 0.002)));
    selectionMarkup += `<rect x="${flash.rectX}" y="${selectBoxY}" width="${flash.rectWidth}" height="${selectBoxHeight}" rx="3" fill="${styleTokens.selectionColor}" fill-opacity="0.28" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${tStart};${tAppear};${tEnd};${tClear};1" calcMode="spline" keySplines="0 0 1 1;0.25 0 0.2 1;0 0 1 1;0.4 0 0.2 1;0 0 1 1" dur="${cycleDurAttr}" repeatCount="indefinite" /></rect>`;
  }

  let charsMarkup = `<g fill="${styleTokens.textColor}">`;
  for (const scheduled of timelineState.scheduledGlyphs) {
    const t1 = roundScale(
      Math.min(0.9992, Math.max(0.0001, scheduled.appearStartMs / totalCycleMs))
    );
    const t2 = roundScale(
      Math.min(0.9994, Math.max(t1 + 0.0002, scheduled.appearEndMs / totalCycleMs))
    );
    const t3 = roundScale(
      Math.min(0.9996, Math.max(t2 + 0.0002, scheduled.eraseStartMs / totalCycleMs))
    );
    const t4 = roundScale(
      Math.min(0.9998, Math.max(t3 + 0.0002, scheduled.eraseEndMs / totalCycleMs))
    );
    const baseOpacityAttr = scheduled.isFirstLineChar ? '' : ' opacity="0"';
    charsMarkup += `<use href="#${scheduled.glyphId}" x="${scheduled.glyphX}" y="${baselineY}"${baseOpacityAttr}><animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${t1};${t2};${t3};${t4};1" calcMode="spline" keySplines="0 0 1 1;0.25 0 0.2 1;0 0 1 1;0.4 0 0.2 1;0 0 1 1" dur="${cycleDurAttr}" repeatCount="indefinite" /></use>`;
  }
  charsMarkup += '</g>';

  const xAnimate = renderTimelineAnimate(
    'x',
    timelineState.cursorXPoints,
    totalCycleMs,
    cycleDurAttr,
    '0.25 0 0.2 1'
  );
  const opacityAnimate = renderTimelineAnimate(
    'opacity',
    timelineState.cursorOpacityPoints,
    totalCycleMs,
    cycleDurAttr,
    '0.45 0 0.55 1'
  );
  const cursorMarkup = `<rect x="${timelineState.firstLineEndCursorX}" y="${cursorGeometry.cursorY}" width="${cursorGeometry.width}" height="${cursorGeometry.height}" rx="${cursorGeometry.radius}" fill="${styleTokens.cursorColor}" opacity="${cursorGeometry.activeOpacity}">${xAnimate}${opacityAnimate}</rect>`;

  const sheen =
    layout === 'none'
      ? { clipDef: '', overlay: '' }
      : renderSheenOverlay({ animMode, height, idPrefix: 'typing-sheen', radius, width });

  let defsMarkup = `${styleTokens.gradDefs}${sheen.clipDef}`;
  for (const defMarkup of timelineState.glyphDefsById.values()) {
    defsMarkup += defMarkup;
  }

  return renderSvgDocument({
    ariaLabel: ariaText,
    body: `${surfaceMarkup}${hintMarkup}${leading.markup}${selectionMarkup}${charsMarkup}${cursorMarkup}${sheen.overlay}`,
    defs: defsMarkup,
    height,
    restTime: roundCoord(timelineState.firstLineRestMs / 1000),
    width,
  });
}

/** Measure all lines at `(0, 0)` and return their layouts alongside the maximum advance width. */
function measureRawTypingLines(
  lines: readonly string[],
  fontSize: number,
  isBoldText: boolean,
  fontFamily: TypingFont
): MeasuredRawTypingLines {
  const rawLayouts: GlyphLineLayout[] = [];
  let maxRawAdvance = 0;
  for (const line of lines) {
    const lineLayout = layoutTextGlyphs(line, fontSize, isBoldText, fontFamily);
    rawLayouts.push(lineLayout);
    if (lineLayout.totalAdvance > maxRawAdvance) {
      maxRawAdvance = lineLayout.totalAdvance;
    }
  }
  return { maxRawAdvance, rawLayouts };
}

/** Width-fit, align, and attach optional QWERTY neighbor typos to a sparse subset of lines. */
function buildPreparedTypingLines(options: BuildPreparedLinesOptions): PreparedTypingLine[] {
  const {
    align,
    centerAnchorX,
    fontFamily,
    fontSize,
    hasTypo,
    isBoldText,
    maxTextWidth,
    rawLayouts,
    textStartX,
  } = options;
  const preparedLines: PreparedTypingLine[] = [];
  const totalLines = rawLayouts.length;

  for (const [i, rawLayout] of rawLayouts.entries()) {
    const fitted = clampLineGlyphsToWidth(
      rawLayout,
      maxTextWidth,
      fontSize,
      isBoldText,
      fontFamily
    );
    const lineStartX =
      align === 'center'
        ? roundCoord(Math.max(textStartX, centerAnchorX - fitted.totalAdvance / 2))
        : textStartX;
    const isTypoLine = hasTypo && isLineEligibleForTypo(i, totalLines, rawLayouts);
    const resolvedTypo = isTypoLine
      ? resolveLineTypo(fitted.glyphs, i, fontSize, isBoldText, fontFamily)
      : undefined;
    preparedLines.push({
      glyphs: fitted.glyphs,
      lineStartX,
      totalAdvance: fitted.totalAdvance,
      typoGlyph: resolvedTypo?.typoGlyph,
      typoIndex: resolvedTypo ? resolvedTypo.typoIndex : -1,
    });
  }
  return preparedLines;
}

/** Compute the minimum container width in pixels required so the `window` or `ide` header bar never collides. */
function computeMinHeaderWidth(options: MinHeaderWidthOptions): number {
  const { iconSlot, layout, metrics, reservedHeaderWidth, titleText } = options;
  if (layout !== 'window' && layout !== 'ide') {
    return 0;
  }

  const { headerHeight, scale, titleFontSize } = metrics;
  const { rightEdgeX } = computeTrafficLightLayout(headerHeight, scale);
  const titleWidth =
    titleText.length > 0 ? measureTextWidth(titleText, titleFontSize, true, false, 'mono') : 0;

  if (layout === 'window') {
    const headerIconSize = Math.round(14 * scale);
    const iconVisualWidth = measureIconVisualWidth(iconSlot?.data, headerIconSize);
    const centerWidth =
      iconVisualWidth + (iconSlot && titleText.length > 0 ? Math.round(6 * scale) : 0) + titleWidth;
    const sideClearance = Math.max(rightEdgeX + Math.round(12 * scale), reservedHeaderWidth);
    return Math.ceil(centerWidth + sideClearance * 2);
  }

  const { tabStartX, tabWidth } = computeIdeTabMetrics(rightEdgeX, scale, titleWidth, iconSlot);
  const rightClearance = Math.max(Math.round(24 * scale), reservedHeaderWidth);
  return Math.ceil(tabStartX + tabWidth + rightClearance);
}

/** Resolve the effective horizontal text alignment of a typing card. */
function resolveTypingAlignment(
  layout: TypingLayout,
  options: TypingRenderOptions,
  hasIcon: boolean
): TypingAlign {
  if (layout === 'browser' || layout === 'ide') {
    return 'left';
  }
  const defaultAlign: TypingAlign =
    layout === 'none' && !options.prefix && !hasIcon ? 'center' : 'left';
  return options.align ?? defaultAlign;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Render a standalone SVG typing animation with configurable container frame, caret cursor, erase transition,
 * vector font family, HCI keystroke cadence, and optional QWERTY neighbor typos.
 * @param options   Typing animation rendering configuration.
 * @returns Complete, self-contained `<svg>` markup string.
 */
export function renderTyping(options: TypingRenderOptions): string {
  const { color } = options;
  const palette = THEMES[color];
  const variant: BadgeVariant = options.variant ?? '3';
  const layout: TypingLayout = options.layout ?? DEFAULT_TYPING_LAYOUT;
  const cursorStyle: TypingCursor = options.cursor ?? DEFAULT_TYPING_CURSOR;
  const eraseMode: TypingEraseMode = options.erase ?? DEFAULT_TYPING_ERASE;
  const fontFamily: TypingFont = options.font ?? DEFAULT_LAYOUT_FONTS[layout];
  const animMode: AnimationMode = options.anim ?? 'default';
  const hasTypo = options.hasTypo ?? false;

  const lines = normalizeTypingLines(options.lines);
  const iconSlot = resolveTypingIcon(options.icon);
  const align = resolveTypingAlignment(layout, options, Boolean(iconSlot));

  const metrics = resolveTypingMetrics(options.size, layout);
  const { bodyHeight, fontSize, headerHeight, padX, scale } = metrics;
  const height = headerHeight + bodyHeight;
  const baselineY = roundCoord(headerHeight + computeCenteredBaselineY(bodyHeight, fontSize));
  const styleTokens = resolveTypingStyleTokens(variant, layout, color, palette);

  const prefixText = resolveTypingPrefix(options.prefix, layout, align);
  const resolvedHint = resolveTypingHint(options.hint);
  const titleText = resolveTypingTitle(options.title, layout);
  const { maxRawAdvance, rawLayouts } = measureRawTypingLines(
    lines,
    fontSize,
    styleTokens.isBoldText,
    fontFamily
  );

  const cursorGeometry = computeCursorGeometry(cursorStyle, baselineY, fontSize);
  const cursorReserveWidth = Math.ceil(cursorGeometry.offsetX + cursorGeometry.width + 4);

  const leading = renderLeadingPrompt({
    baselineY,
    fontFamily,
    iconSlot,
    layout,
    metrics,
    prefixText,
    styleTokens,
  });
  const hintGeometry = measureHintBadgeGeometry(resolvedHint, layout, metrics);
  const reservedBodyWidth = hintGeometry?.reservedBodyWidth ?? 0;
  const reservedHeaderWidth = hintGeometry?.reservedHeaderWidth ?? 0;

  const rightInset = padX + reservedBodyWidth + cursorReserveWidth;
  const minAutoWidth = layout === 'none' ? 200 : Math.round(360 * Math.max(1, scale * 0.88));
  const minHeaderWidth = computeMinHeaderWidth({
    iconSlot,
    layout,
    metrics,
    reservedHeaderWidth,
    titleText,
  });
  const idealWidth = Math.max(
    minAutoWidth,
    minHeaderWidth,
    Math.ceil(leading.textStartX + maxRawAdvance + rightInset)
  );
  const width = clampInt(options.width, TYPING_WIDTH_RANGE, idealWidth);

  const hintMarkup = renderHintBadge({
    geometry: hintGeometry,
    hint: resolvedHint,
    layout,
    metrics,
    palette,
    styleTokens,
    variant,
    width,
  });
  const maxTextWidth = Math.max(
    fontSize * 3,
    width - leading.textStartX - padX - reservedBodyWidth - cursorReserveWidth
  );
  const centerAnchorX = roundCoord(
    (leading.textStartX + (width - padX - reservedBodyWidth - cursorReserveWidth)) / 2
  );

  const preparedLines = buildPreparedTypingLines({
    align,
    centerAnchorX,
    fontFamily,
    fontSize,
    hasTypo,
    isBoldText: styleTokens.isBoldText,
    maxTextWidth,
    rawLayouts,
    textStartX: leading.textStartX,
  });

  const surfaceMarkup = renderTypingContainerSurface({
    color,
    height,
    iconSlot,
    layout,
    metrics,
    palette,
    styleTokens,
    titleText,
    variant,
    width,
  });
  const ariaText = prefixText.length > 0 ? `${prefixText} ${lines.join(' / ')}` : lines.join(' / ');
  const renderContext: TypingBodyRenderContext = {
    animMode,
    ariaText,
    baselineY,
    cursorGeometry,
    eraseMode,
    height,
    hintMarkup,
    layout,
    leading,
    metrics,
    options,
    preparedLines,
    styleTokens,
    surfaceMarkup,
    width,
  };

  return isAnimationDisabled(animMode)
    ? renderStaticTypingSvg(renderContext)
    : renderAnimatedTypingSvg(renderContext);
}
