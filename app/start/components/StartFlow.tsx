"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { FlowProvider, useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { STEP_ORDER, type StartStep } from "../lib/types";
import styles from "../start.module.css";

import Hook from "../steps/Hook";
import SignUp from "../steps/SignUp";
import FounderStory from "../steps/FounderStory";
import QuizIntro from "../steps/QuizIntro";
import FirstName from "../steps/FirstName";
import PhoneNumber from "../steps/PhoneNumber";
import QuizGender from "../steps/QuizGender";
import Age from "../steps/Age";
import ReferralSource from "../steps/ReferralSource";
import Qualification from "../steps/Qualification";
import QualificationResponse from "../steps/QualificationResponse";
import PinchTest from "../steps/PinchTest";
import HairLossLocation from "../steps/HairLossLocation";
import HairLossLocationResponse from "../steps/HairLossLocationResponse";
import HairSituation from "../steps/HairSituation";
import HairLossSeverity from "../steps/HairLossSeverity";
import HairLossTiming from "../steps/HairLossTiming";
import HairLossRate from "../steps/HairLossRate";
import HairLossRateResponse from "../steps/HairLossRateResponse";
import HairSymptoms from "../steps/HairSymptoms";
import TriggerContext from "../steps/TriggerContext";
import FamilyHistory from "../steps/FamilyHistory";
import FamilyHistoryMenResponse from "../steps/FamilyHistoryMenResponse";
import HardestPart from "../steps/HardestPart";
import HardestPartResponse from "../steps/HardestPartResponse";
import StressFrequency from "../steps/StressFrequency";
import StressFrequencyResponse from "../steps/StressFrequencyResponse";
import RecentStressEvent from "../steps/RecentStressEvent";
import HormonalChanges from "../steps/HormonalChanges";
import HormonalChangesResponse from "../steps/HormonalChangesResponse";
import TightHairstyles from "../steps/TightHairstyles";
import TightHairstylesResponse from "../steps/TightHairstylesResponse";
import AgitateInterstitial from "../steps/AgitateInterstitial";
import PhaseTransition from "../steps/PhaseTransition";
import ScalpTightAck from "../steps/ScalpTightAck";
import BloodFlowSocratic from "../steps/BloodFlowSocratic";
import TreatmentsTried from "../steps/TreatmentsTried";
import TreatmentsResponse from "../steps/TreatmentsResponse";
import HairGoal from "../steps/HairGoal";
import GoalResponse from "../steps/GoalResponse";
import HairLossMedicationMen from "../steps/HairLossMedicationMen";
import HairLossMedicationMenResponse from "../steps/HairLossMedicationMenResponse";
import CustomerResults from "../steps/CustomerResults";
import Commitment from "../steps/Commitment";
import SupportNeeds from "../steps/SupportNeeds";
import SupportNeedsResponse from "../steps/SupportNeedsResponse";
import QuizSummary from "../steps/QuizSummary";
import DiagnosisLoading from "../steps/DiagnosisLoading";
import PersonalizedDiagnosis from "../steps/PersonalizedDiagnosis";
import TechniquesPreview from "../steps/TechniquesPreview";
import DailyRoutinePreview from "../steps/DailyRoutinePreview";
import VideoSessionPreview from "../steps/VideoSessionPreview";
import LearningsPreview from "../steps/LearningsPreview";
import OutcomePreview from "../steps/OutcomePreview";
import GuidesPreview from "../steps/GuidesPreview";
import RegrowthKitPreview from "../steps/RegrowthKitPreview";
import ResultScreenshots from "../steps/ResultScreenshots";
import SocialProof from "../steps/SocialProof";
import TreatmentReady from "../steps/TreatmentReady";
import TrialPaywall from "../steps/TrialPaywall";
import PurchaseSuccess from "../steps/PurchaseSuccess";
import WhyItHappens from "../steps/WhyItHappens";
import MomentCheckYourScalp from "../steps/MomentCheckYourScalp";
import MomentHereIsWhatHappens from "../steps/MomentHereIsWhatHappens";
import MomentBuildYourPlan from "../steps/MomentBuildYourPlan";
import MomentFounderFlashback from "../steps/MomentFounderFlashback";

// Step components may return null when they auto-skip themselves
// (e.g. TreatmentsResponse skipping when no branch matches the user's
// answers). The registry type allows null returns to support that.
// Partial because alternate flows (StartFlowKit) define their own subsets
// — every step in this flow's STEP_ORDER must still have an entry here.
const STEP_COMPONENTS: Partial<Record<StartStep, () => React.ReactElement | null>> = {
  hook: Hook,
  founderStory: FounderStory,
  quizIntro: QuizIntro,
  firstName: FirstName,
  phoneNumber: PhoneNumber,
  quizGender: QuizGender,
  age: Age,
  referralSource: ReferralSource,
  qualification: Qualification,
  qualificationResponse: QualificationResponse,
  hairSituation: HairSituation,
  hairLossLocation: HairLossLocation,
  hairLossLocationResponse: HairLossLocationResponse,
  hairLossSeverity: HairLossSeverity,
  hairLossTiming: HairLossTiming,
  hairLossRate: HairLossRate,
  hairLossRateResponse: HairLossRateResponse,
  hairSymptoms: HairSymptoms,
  triggerContext: TriggerContext,
  familyHistory: FamilyHistory,
  familyHistoryMenResponse: FamilyHistoryMenResponse,
  hardestPart: HardestPart,
  hardestPartResponse: HardestPartResponse,
  stressFrequency: StressFrequency,
  stressFrequencyResponse: StressFrequencyResponse,
  recentStressEvent: RecentStressEvent,
  hormonalChanges: HormonalChanges,
  hormonalChangesResponse: HormonalChangesResponse,
  tightHairstyles: TightHairstyles,
  tightHairstylesResponse: TightHairstylesResponse,
  agitateInterstitial: AgitateInterstitial,
  phaseTransition: PhaseTransition,
  treatmentsTried: TreatmentsTried,
  treatmentsResponse: TreatmentsResponse,
  hairGoal: HairGoal,
  goalResponse: GoalResponse,
  hairLossMedicationMen: HairLossMedicationMen,
  hairLossMedicationMenResponse: HairLossMedicationMenResponse,
  customerResults: CustomerResults,
  commitment: Commitment,
  supportNeeds: SupportNeeds,
  supportNeedsResponse: SupportNeedsResponse,
  scalpTightAck: ScalpTightAck,
  bloodFlowSocratic: BloodFlowSocratic,
  quizSummary: QuizSummary,
  diagnosisLoading: DiagnosisLoading,
  personalizedDiagnosis: PersonalizedDiagnosis,
  pinchTest: PinchTest,
  techniquesPreview: TechniquesPreview,
  dailyRoutinePreview: DailyRoutinePreview,
  videoSessionPreview: VideoSessionPreview,
  learningsPreview: LearningsPreview,
  outcomePreview: OutcomePreview,
  guidesPreview: GuidesPreview,
  regrowthKitPreview: RegrowthKitPreview,
  resultScreenshots: ResultScreenshots,
  socialProof: SocialProof,
  signUp: SignUp,
  treatmentReady: TreatmentReady,
  whyItHappens: WhyItHappens,
  momentCheckYourScalp: MomentCheckYourScalp,
  momentHereIsWhatHappens: MomentHereIsWhatHappens,
  momentBuildYourPlan: MomentBuildYourPlan,
  momentFounderFlashback: MomentFounderFlashback,
  trialPaywall: TrialPaywall,
  purchaseSuccess: PurchaseSuccess,
};

function StepRenderer() {
  const { step } = useFlow();
  const Component = STEP_COMPONENTS[step];
  if (!Component) return null;
  return <Component />;
}

// Toggles the global cream/light theme by adding/removing a body class.
// Lives at the funnel root so the override persists across every step
// (vs scoping it to the shell div, which would leave the safe-area
// background outside the shell still black on iOS notched screens).
function ThemeApplier() {
  const config = useFunnelConfig();
  useEffect(() => {
    if (typeof document === "undefined") return;
    const cls = "funnel-theme-light";
    const root = document.documentElement;
    const body = document.body;
    if (config.theme === "light") {
      root.classList.add(cls);
      body.classList.add(cls);
    } else {
      root.classList.remove(cls);
      body.classList.remove(cls);
    }
    return () => {
      root.classList.remove(cls);
      body.classList.remove(cls);
    };
  }, [config.theme]);
  return null;
}

export default function StartFlow() {
  const pathname = usePathname();
  // /startus3 funnel skips the in-funnel SignUp step entirely. Web purchase
  // is anonymous in RC; the user is then handed off to mobile via the
  // RC redemption deep link surfaced on PurchaseSuccess (and emailed by RC).
  // Mobile completes the Firebase signup + entitlement merge in the
  // mini-onboarding flow we built. Removing SignUp here cuts one whole
  // friction step between Stripe sheet close and the install CTA.
  const { stepOrder, storageKey } = useMemo(() => {
    if (pathname?.startsWith("/startus3")) {
      return {
        stepOrder: STEP_ORDER.filter((s) => s !== "signUp"),
        storageKey: "keshah_start_state_us3_v2",
      };
    }
    return { stepOrder: undefined, storageKey: undefined };
  }, [pathname]);

  return (
    <FlowProvider stepOrder={stepOrder} storageKey={storageKey}>
      <ThemeApplier />
      <div className={styles.shell}>
        <StepRenderer />
      </div>
    </FlowProvider>
  );
}
