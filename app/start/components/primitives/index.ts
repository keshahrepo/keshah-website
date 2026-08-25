/**
 * Shared React primitives for the /start funnel — the surface that
 * step-rebuild agents import from. Every widget in here is either a
 * direct port of a Flutter widget under
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/ or a small utility built
 * on top of them (AnimatedPage, PersonalChip).
 *
 * Naming matches the Flutter widget name so the mobile ↔ web mapping is
 * grep-able. Add new primitives here (and re-export) rather than
 * inventing them inline in step components.
 */

export { KeshahButton } from "./KeshahButton";
export type { KeshahButtonProps } from "./KeshahButton";

export { BackArrowWithAppLogo } from "./BackArrowWithAppLogo";
export type { BackArrowWithAppLogoProps } from "./BackArrowWithAppLogo";

export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";

export { AnimatedPage, AnimatedPageItem } from "./AnimatedPage";
export type { AnimatedPageProps } from "./AnimatedPage";

export { OptionTile } from "./OptionTile";
export type { OptionTileProps } from "./OptionTile";

export { QuizSinglePick } from "./QuizSinglePick";
export type { QuizSinglePickProps } from "./QuizSinglePick";

export { QuizMultiPick } from "./QuizMultiPick";
export type { QuizMultiPickProps } from "./QuizMultiPick";

export { QuizMoment } from "./QuizMoment";
export type { QuizMomentProps } from "./QuizMoment";

export { QuizInterstitial } from "./QuizInterstitial";
export type { QuizInterstitialProps } from "./QuizInterstitial";

export { TypingReveal } from "./TypingReveal";
export type { TypingRevealProps } from "./TypingReveal";

export { TitleTextWidget } from "./TitleTextWidget";
export type { TitleTextWidgetProps } from "./TitleTextWidget";

export { PersonalChip } from "./PersonalChip";
export type { PersonalChipProps } from "./PersonalChip";

export { KeshahTextField } from "./KeshahTextField";
export type { KeshahTextFieldProps } from "./KeshahTextField";

export { DisqualificationScreen } from "./DisqualificationScreen";
export type { DisqualificationScreenProps } from "./DisqualificationScreen";
