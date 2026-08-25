// Web port of PostAuthFlow2 onboarding from KESHAH-Mobile-App.
// STEP_ORDER below is the scratch-rebuild flow — every entry maps to a step
// component in /app/start/steps/ registered in components/StartFlow.tsx.

export type StartStep =
  | "landingHook"
  // Rebuilt flow steps, in on-screen order.
  | "firstName"
  | "phoneNumber"
  | "quizGender"
  | "age"
  | "referralSource"
  | "founderStory"
  | "momentCheckYourScalp"
  | "pinchTest"
  | "momentHereIsWhatHappens"
  | "resultScreenshots"
  | "momentBuildYourPlan"
  | "qualification"
  | "qualificationResponse"
  | "hairLossLocation"
  | "hairGoal"
  | "goalResponse"
  | "hairLossMedicationMen"
  | "hairLossMedicationMenResponse"
  | "stressContribution"
  | "stressContributionResponse"
  | "hormonalChanges"
  | "hormonalChangesResponse"
  | "tightHairstyles"
  | "tightHairstylesResponse"
  | "familyHistory"
  | "familyHistoryMenResponse"
  | "hardestPart"
  | "hardestPartResponse"
  | "commitment"
  | "buildingYourPlan"
  | "planReveal"
  | "outcomePreview"
  | "socialProof"
  | "momentFounderFlashback"
  | "trialPaywall"
  | "payment"
  // Legacy step keys — kept so old peer components / dashboard code that
  // reference them still compile. Not present in STEP_ORDER.
  | "hook"
  | "quizIntro"
  | "hairSituation"
  | "hairLossLocationResponse"
  | "hairLossSeverity"
  | "hairLossTiming"
  | "hairLossRate"
  | "hairLossRateResponse"
  | "hairSymptoms"
  | "triggerContext"
  | "stressFrequency"
  | "stressFrequencyResponse"
  | "recentStressEvent"
  | "agitateInterstitial"
  | "phaseTransition"
  | "treatmentsTried"
  | "treatmentsResponse"
  | "customerResults"
  | "supportNeeds"
  | "supportNeedsResponse"
  | "scalpTightAck"
  | "bloodFlowSocratic"
  | "quizSummary"
  | "diagnosisLoading"
  | "personalizedDiagnosis"
  | "techniquesPreview"
  | "dailyRoutinePreview"
  | "videoSessionPreview"
  | "learningsPreview"
  | "guidesPreview"
  | "regrowthKitPreview"
  | "treatmentReady"
  | "whyItHappens"
  | "signUp"
  | "purchaseSuccess"
  // /watch ad-funnel steps — 4-page video landing flow. Not part of STEP_ORDER.
  | "watchVideo1"
  | "watchVideo2"
  | "watchTrialInfo";

// Scratch-rebuild flow order — matches the built list from the mobile parity
// sweep 1:1. Every entry MUST have a corresponding component registered in
// STEP_COMPONENTS in components/StartFlow.tsx. Gender / branch skipping is
// handled by wrapper logic in the registry, not per-step.
export const STEP_ORDER: StartStep[] = [
  // v1: cold-traffic funnel optimised for cleanest conversion signal.
  // firstName / phoneNumber / age / referralSource intentionally OMITTED —
  // their components + StartFlow registry entries are still there so
  // adding them back later is a one-line uncomment in this array.
  // See discussion in ACTIVATION_PROPOSALS (or ask Aadi) for why.

  // Cold-traffic pre-quiz hook. Fresh users land here first from ads;
  // returning users skip it because flow-context resumes at their last step.
  "landingHook",
  // Deliver the story promise immediately — no forms between the hook and
  // Aadi's narrative.
  "founderStory",
  "momentCheckYourScalp",
  // quizGender is required for pinch-test personalization (male vs female
  // photos) + hair-goal branching + female-only quiz beats, so it lives
  // right before the physical-proof section.
  "quizGender",
  "pinchTest",
  "momentHereIsWhatHappens",
  "resultScreenshots",
  "momentBuildYourPlan",
  // Qualification + universal quiz
  "qualification",
  "qualificationResponse", // female-only, wrapper skips on male
  "hairLossLocation",
  "hairGoal",
  "goalResponse",
  "hairLossMedicationMen",
  "hairLossMedicationMenResponse",
  "stressContribution",
  "stressContributionResponse", // skips on stress_contribution === "no"
  // Women-only hormonal + traction branches (wrapper skips on male +
  // conditional response skips).
  "hormonalChanges",
  "hormonalChangesResponse",
  "tightHairstyles",
  "tightHairstylesResponse",
  // Universal
  "familyHistory",
  "familyHistoryMenResponse", // skips on no / not_sure
  "hardestPart",
  "hardestPartResponse",
  "commitment",
  // Plan build + paywall lead-in
  "buildingYourPlan",
  "planReveal",
  "outcomePreview",
  "socialProof",
  "momentFounderFlashback",
  "trialPaywall",
  // Stripe deferred-payment step (Elements + ExpressCheckout).
  // Slotted immediately after the trial paywall CTA — user has committed
  // to the 7-day free trial and now enters card details. Backend creates
  // the subscription with trial_period_days: 7, then a signed handoff
  // deep-link opens the app for silent sign-in on first launch.
  "payment",
];

export type Gender = "male" | "female";
export type HairLossLocation = "crown" | "part" | "hairline" | "all_over";
export type HairGoal =
  | "stop_the_loss"
  | "regrow_hair"
  | "both"
  | "thicker_fuller"
  | "support_health"
  | "feel_confident";
export type CommitmentAnswer = "yes" | "no";

export type SupportNeed =
  | "get_off_medication"
  | "fix_dandruff"
  | "dht_hormones"
  | "stress"
  | "bloodwork_vitamins"
  | "diet";

// Mirrors lib/data/models/user_model.dart fields that we'll write to Firestore
// once the user pays. Stored in flow context as the user fills out the funnel.
export interface QuizAnswers {
  gender?: Gender;
  hairLossLocation?: HairLossLocation;
  /** Women's funnel symptom multi-select — surfaced in the personalized
   *  diagnosis. Names symptoms in user vocabulary ("part is wider," "scalp
   *  feels tender") so the woman feels seen by the time she hits paywall. */
  hairSymptoms?: string[];
  /** Women's funnel trigger + hormonal context multi-select — postpartum,
   *  perimenopause, COVID, stress, BC on/off, PCOS, thyroid, etc. Drives the
   *  named-cause branch on the personalized diagnosis. */
  triggerContext?: string[];
  /** Men's funnel — de-risked opener (Hims-style 5 doors). Captures intent
   *  + commitment level + preventive shoppers in one screen. Replaces the
   *  heavy yes/no Qualification gate. */
  hairSituation?: string;
  /** Men's funnel severity — "a lot" / "some" / "a little", with the social-
   *  context subtitles ("obvious to everyone" / "those close notice" /
   *  "only I notice") that reflect emotional weight. */
  hairLossSeverity?: string;
  /** Timing — when first noticed. Women's funnel diagnostic (Hers-style).
   *  Drives loss-aversion framing on the diagnosis page (longer = more urgent). */
  hairLossTiming?: string;
  /** Rate — how quickly the changes happened. Women's funnel diagnostic. */
  hairLossRate?: string;
  /** Family history — yes/no/not-sure. Both genders now. */
  familyHistory?: string;
  /** Legacy stress-frequency field (stressFrequency step is no longer in
   *  STEP_ORDER). Kept for old resume state. */
  stressFrequency?: string;
  /** New stress-contribution single-pick (yes/some/no). Persisted to
   *  Firestore field `stress_contribution`. Response step skips on 'no'. */
  stressContribution?: string;
  /** Acute stress — recent major stressful event (yes/no). Women's funnel. */
  recentStressEvent?: string;
  /** Socratic Q1 — legacy field. */
  scalpTightAck?: string;
  /** Socratic Q2 — legacy field. */
  bloodFlowSocratic?: string;
  treatmentsTried?: string[];
  hairGoal?: HairGoal;
  /** Women's funnel multi-select goals (Hers pattern). Captures both
   *  functional and emotional outcomes; one user typically picks 2-3.
   *  Men's funnel keeps the single-select `hairGoal` field above. */
  hairGoals?: HairGoal[];
  commitmentAnswer?: CommitmentAnswer;
  supportNeeds?: SupportNeed[];
  /** Firebase UID, set after the user signs up on the web (SignUp step). */
  firebaseUid?: string;
  /** Email collected at sign-in. */
  email?: string;
  /** Sign-in provider used on web. */
  providerId?: "google.com" | "apple.com" | "password";
  /** Plan tier selected on the paywall. */
  purchaseTier?: "monthly" | "threeMonth" | "threeMonthTrial" | "weekly" | "annual" | "weeklyV2" | "monthlyV2" | "monthlyPremium" | "weeklyPremium" | "monthlyPremium996" | "monthlyTrial";
  /** First name collected during the funnel. Persisted to `wp_user.display_name`. */
  firstName?: string;
  /** RevenueCat redemption URL returned from `purchasePackage()`. */
  rcRedeemUrl?: string;
  /** Phone number in E.164 format (e.g., +919999999999). Persisted to `phone_number`. */
  phoneNumber?: string;
  /** Age bucket — matches Facebook ad-targeting slices. Persisted to `age_range`. */
  ageRange?: string;
  /** Attribution — how the user heard about KESHAH. Persisted to `referral_source`. */
  referralSource?: string;
  /** Medication yes/no. Persisted to `hair_loss_medication`. */
  hairLossMedication?: string;
  /** Legacy alias for the medication answer under the historical `_men` key. */
  hairLossMedicationMen?: string;
  /** Women-only hormonal changes single-pick. Persisted to `hormonal_changes`. */
  hormonalChanges?: string;
  /** Women-only traction / tight-hairstyle frequency. Persisted to `tight_hairstyles`. */
  tightHairstyles?: string;
  /** Universal empathy single-pick — hardest part of the hair-loss journey.
   *  Persisted to `hardest_part`. */
  hardestPart?: string;
  /** Pinch-test comparison result — muchTighter | tighter | aBitTighter |
   *  aboutSame. Persisted to Firestore field `pinch_test_answer`. */
  pinchTestAnswer?: string;
  /** Trial intent marker stashed on the trial paywall CTA. Persisted to
   *  the mobile field name exactly (snake_case) so save-profile can flush
   *  it verbatim. `converted_at` is written server-side by the RC webhook. */
  started_trial?: {
    at: string;
    product_id: string | null;
    source: string;
  };
}
