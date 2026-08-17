// Web port of PostAuthFlow2 onboarding from KESHAH-Mobile-App.
// App-only steps (phoneNumber, ratingAsk, notificationsPermission, reminder) are intentionally omitted —
// those collect data the app doesn't need until the user is in the dashboard.

export type StartStep =
  | "hook"
  | "founderStory"
  | "quizIntro"
  | "firstName"
  | "phoneNumber"
  | "quizGender"
  | "qualification"
  | "qualificationResponse"
  | "hairSituation"
  | "hairLossLocation"
  | "hairLossLocationResponse"
  | "hairLossSeverity"
  | "hairLossTiming"
  | "hairLossRate"
  | "hairLossRateResponse"
  | "hairSymptoms"
  | "triggerContext"
  | "familyHistory"
  | "stressFrequency"
  | "stressFrequencyResponse"
  | "recentStressEvent"
  | "agitateInterstitial"
  | "phaseTransition"
  | "treatmentsTried"
  | "treatmentsResponse"
  | "hairGoal"
  | "goalResponse"
  | "customerResults"
  | "commitment"
  | "supportNeeds"
  | "supportNeedsResponse"
  | "scalpTightAck"
  | "bloodFlowSocratic"
  | "quizSummary"
  | "diagnosisLoading"
  | "personalizedDiagnosis"
  | "pinchTest"
  | "techniquesPreview"
  | "dailyRoutinePreview"
  | "videoSessionPreview"
  | "learningsPreview"
  | "guidesPreview"
  | "regrowthKitPreview"
  | "resultScreenshots"
  | "socialProof"
  | "treatmentReady"
  | "whyItHappens"
  | "trialPaywall"
  | "signUp"
  | "purchaseSuccess"
  // /watch ad-funnel steps — 4-page video landing flow. Not part of STEP_ORDER.
  | "watchVideo1"
  | "watchVideo2"
  | "watchTrialInfo";

// hook is the cold-open bridge — earns a few seconds of attention and frames
// why the pinch test is worth doing, before the first physical ask. pinchTest
// then creates the "huh, that's real" moment that primes the founder story.
export const STEP_ORDER: StartStep[] = [
  "hook",
  "pinchTest",
  "whyItHappens",
  "founderStory",
  "quizIntro",
  "quizGender",
  // Quiz section — most steps gender-branch internally. Qualification +
  // Commitment are the universal hard gates. Severity / FamilyHistory /
  // StressFrequency are men-specific (auto-skip on women). HairSymptoms /
  // TriggerContext are women-specific (auto-skip on men). Treatment-history
  // and goal-response interstitials were cut for being low-signal noise.
  "qualification",
  // Women-only transition — reframes the quiz as plan-building. Auto-skip on men.
  "qualificationResponse",
  "hairLossLocation",
  "hairLossLocationResponse",
  "hairLossSeverity",
  // Women-only Hers-style timing/rate questions, auto-skip on men.
  "hairLossTiming",
  "hairLossRate",
  // Educational interstitial after rate — branches on sudden/gradual/not-sure.
  "hairLossRateResponse",
  "hairSymptoms",
  "triggerContext",
  "familyHistory",
  "stressFrequency",
  // Educational interstitial after stressFrequency (cortisol mechanism).
  "stressFrequencyResponse",
  // Women-only acute-stress screen, auto-skips on men.
  "recentStressEvent",
  "hairGoal",
  // CustomerResults removed from the flow for now — placeholder
  // testimonials weren't landing. Step registry/types still exist so we
  // can re-enable later without re-wiring.
  "commitment",
  // Pre-paywall reveal + reinforcement. Loading interstitial sits right
  // before the diagnosis to ratify the investment — user just answered ~10
  // questions and the loader signals "we're using your data right now."
  "diagnosisLoading",
  "personalizedDiagnosis",
  "techniquesPreview",
  // Three "how it works" walkthrough pages — show the actual app screens
  // (daily routine, in-app video player, day-by-day learnings library).
  // Sit between the techniques explainer and the results / social proof so
  // the user sees what their daily life with KESHAH looks like before
  // evaluating proof-of-others-results. Regrowth kit slot intentionally
  // dropped — it pushed too hard for an upsell at this point in the funnel.
  "dailyRoutinePreview",
  "videoSessionPreview",
  "learningsPreview",
  "resultScreenshots",
  "socialProof",
  // 5-guide swipeable preview — sits as the last step before the paywall
  // so the offer's bonus reveal is top-of-mind when the user lands on
  // pricing. Only renders on Us3-pricing funnels (/startus3, /mandy, /f/);
  // other variants auto-skip.
  "guidesPreview",
  "trialPaywall",
  "signUp",
  "purchaseSuccess",
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
  /** Rate — how quickly the changes happened. Women's funnel diagnostic.
   *  "Suddenly" vs "Gradually" helps distinguish triggers (TE / stress
   *  event) from genetic patterns (slow). */
  hairLossRate?: string;
  /** Family history — yes/no/not-sure. Both genders now (Hers asks women too). */
  familyHistory?: string;
  /** Stress frequency — all-the-time/sometimes/rarely/not-sure. Both genders. */
  stressFrequency?: string;
  /** Acute stress — recent major stressful event (yes/no). Women's funnel —
   *  telogen-effluvium screen. */
  recentStressEvent?: string;
  /** Socratic Q1 — "did you notice your scalp is tight?" Drives the
   *  self-derived diagnosis the user encounters next. */
  scalpTightAck?: string;
  /** Socratic Q2 — "do you think a tight scalp could be reducing blood
   *  flow to your hair?" Self-generated hypothesis = stronger commitment
   *  to the diagnosis revealed on the next screen. */
  bloodFlowSocratic?: string;
  treatmentsTried?: string[];
  hairGoal?: HairGoal;
  /** Women's funnel multi-select goals (Hers pattern). Captures both
   *  functional and emotional outcomes; one user typically picks 2-3.
   *  Men's funnel keeps the single-select `hairGoal` field above. */
  hairGoals?: HairGoal[];
  commitmentAnswer?: CommitmentAnswer;
  supportNeeds?: SupportNeed[];
  /** Firebase UID, set after the user signs up on the web (SignUp step).
   *  Passed to RC as the App User ID so the purchase is never anonymous —
   *  the mobile app sees the same entitlement when it calls
   *  Purchases.logIn(firebaseUid) after the user signs in there. */
  firebaseUid?: string;
  /** Email collected at sign-in. Displayed on the success page so the user
   *  knows which account to use in the mobile app. */
  email?: string;
  /** Sign-in provider used on web. Used to remind the user which method to
   *  use in the mobile app (same provider → same Firebase UID → entitlement
   *  follows; different providers produce different UIDs). */
  providerId?: "google.com" | "apple.com" | "password";
  /** Plan tier selected on the paywall — stored in flow state so SignUp
   *  can forward it to save-profile (for commission / reporting). */
  purchaseTier?: "monthly" | "threeMonth" | "threeMonthTrial" | "weekly" | "annual" | "weeklyV2" | "monthlyV2" | "monthlyPremium" | "weeklyPremium" | "monthlyPremium996" | "monthlyTrial";
  /** First name collected on /startindia after QuizIntro. Used for
   *  WhatsApp nurture personalization and dashboard greeting. */
  firstName?: string;
  /** RevenueCat redemption URL returned from `purchasePackage()` —
   *  custom-scheme deep link of the form `rc-XXX://redeem_web_purchase?...`.
   *  PurchaseSuccess uses this for the "Open KESHAH" button on mobile and
   *  embeds it in a QR code for desktop users. Without it the user has to
   *  remember which provider they signed up with on web — defeats the
   *  whole point of the redemption flow. */
  rcRedeemUrl?: string;
  /** Phone number in E.164 format (e.g., +919999999999). Collected on
   *  /startindia for WhatsApp nurture. Required for India funnel. */
  phoneNumber?: string;
}
