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
  // New text-consult funnel — final step. Replaces trialPaywall in
  // STEP_ORDER. Shows a "you qualify for a free text consult with Aadi"
  // page with an iMessage handoff CTA (sms:+18328634933 pre-loaded with
  // their quiz answers). Old paywall funnel lives on at /startv1.
  | "textConsult"
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

// v2 flow — TEXT-CONSULT FUNNEL. Replaced the 30-step paywall funnel on
// 2026-08-28 after testing showed cold Meta traffic wouldn't type a card
// at checkout (0/47 SetupIntents advanced past requires_payment_method).
//
// Hypothesis: trust deficit for unknown brand at $99 subscription is the
// killer. New model: warm the user (story + physical proof + social
// proof) → shorter qualification quiz (5 factual questions, not 20) →
// text handoff to Aadi. Aadi does the equivalent of his old video-call
// consultation via iMessage, generates a personalized plan URL,
// user starts trial from a much warmer position.
//
// The OLD 30-step paywall funnel is preserved verbatim at /startv1 as a
// fallback / A-B comparison route. Every step component removed from
// STEP_ORDER below still exists in STEP_COMPONENTS so re-adding one is
// a single-line uncomment. Meta ads still point at /start — no ad
// changes needed.
export const STEP_ORDER: StartStep[] = [
  // ── Warming: story + physical proof + social proof (7 steps) ──
  "landingHook",
  "founderStory", // full 23 beats (Aadi's call — story is central to brand)
  "momentCheckYourScalp",
  "quizGender", // needed for pinch-test personalization
  "pinchTest",
  "momentHereIsWhatHappens",
  "resultScreenshots",
  "momentBuildYourPlan", // bridge into the qualifying questions

  // ── Qualification quiz: 5 factual questions, no interstitials ──
  // Purpose is different from the old quiz: not "collect data for a
  // paywall plan generator" — it's "qualify user for text consult with
  // Aadi + give him starting context for the conversation." Emotional /
  // motivational questions (hairGoal, hardestPart, stressContribution,
  // hormonalChanges, tightHairstyles) intentionally moved TO the text
  // conversation itself so it has real diagnostic purpose.
  "qualification",
  "hairLossLocation",
  "hairLossMedicationMen", // finasteride context — universal (wrapper skips on female)
  "familyHistory",
  "commitment", // 20 min/day gate — the qualifier

  // ── Text handoff (1 step, replaces trialPaywall) ──
  "textConsult",
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
