/**
 * Design tokens shared with the KESHAH mobile app.
 *
 * SOURCE OF TRUTH: /Users/aadityaagrawal/KESHAH-Mobile-App/lib/ui_helper/colors.dart
 *                  and the "UI/Theming" section of the mobile CLAUDE.md.
 *
 * Only tokens that already exist in the Flutter codebase live here — do not
 * add speculative values. When the mobile app grows a new named token, mirror
 * it here (and in the @theme block of app/globals.css so Tailwind picks it up).
 */

// ────────────────────────────────────────────────────────────────────────────
// Colors — mirrors lib/ui_helper/colors.dart 1:1
// ────────────────────────────────────────────────────────────────────────────
export const colors = {
  // Neutrals
  black: '#000000',          // kBlack — app background
  white: '#FFFFFF',          // kWhite — primary text / foreground
  box: '#373737',            // kBoxColor — card / container background
  boxV2: '#242424',          // kBoxColorV2 — deeper card variant
  lightGrey: '#F5F5F5',      // kLightGrey / colorF5F5F5
  grey: '#C4C4C4',           // colorC4C4C4
  mutedGrey: '#959595',      // color959595
  selectDay: '#A1A8B0',      // kSelectDay
  // Accents
  orange: '#C97500',         // kOrange
  error: '#C03E06',          // colorC03E06 — error state
  green: '#359033',          // color359033 — success
  gold: '#DAA520',           // yellowTrackColor — progress / streak
  confirmed: '#7BEB78',      // kConfirmed
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Corner radii — from CLAUDE.md "UI/Theming" + onboarding widget usage
// ("10px containers, 40px buttons"; 16px is the recurring modal / sheet)
// ────────────────────────────────────────────────────────────────────────────
export const radius = {
  card: 10,
  modal: 16,
  button: 40,
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Typography — from CLAUDE.md ("Fonts: Poppins (100-900), InstrumentSerif")
// ────────────────────────────────────────────────────────────────────────────
export const font = {
  family: 'Poppins',
  serif: 'InstrumentSerif',
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Spacing scale — distilled from SizedBox / EdgeInsets values used across
// screens/auth/post_auth_flow_2. Every value below is one that already
// appears (by frequency) in the mobile onboarding.
// ────────────────────────────────────────────────────────────────────────────
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Letter spacing — the discrete set used in post_auth_flow_2 pages.
// Negative values tighten large display text; positive values open up
// uppercase eyebrow labels.
// ────────────────────────────────────────────────────────────────────────────
export const letterSpacing = {
  displayTight: -1.5,   // largest headings (quiz summary)
  headingTight: -1.2,   // section headings across quiz steps
  titleTight: -1.0,     // page titles
  bodyTight: -0.4,      // body copy
  bodyDefault: -0.2,    // default text nudge
  label: 1.5,           // uppercase eyebrow labels
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Line heights — the multipliers used for typography in the onboarding
// (Flutter TextStyle.height). Kept as unitless multipliers to match Flutter.
// ────────────────────────────────────────────────────────────────────────────
export const lineHeight = {
  tight: 1.2,      // display / heading
  snug: 1.25,      // large titles
  base: 1.3,       // subheads
  relaxed: 1.4,    // body copy
  loose: 1.5,      // long-form paragraphs
} as const;

export type ColorToken = keyof typeof colors;
export type RadiusToken = keyof typeof radius;
export type SpacingToken = keyof typeof spacing;
export type LetterSpacingToken = keyof typeof letterSpacing;
export type LineHeightToken = keyof typeof lineHeight;
