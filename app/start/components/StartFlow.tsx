"use client";

import { useEffect, type ReactElement } from "react";
import { FlowProvider, useFlow } from "../lib/flow-context";
import { type StartStep } from "../lib/types";

// Scratch-rebuild step components — one per entry in STEP_ORDER.
import LandingHookStep from "../steps/LandingHookStep";
import FirstNameStep from "../steps/FirstNameStep";
import PhoneNumberStep from "../steps/PhoneNumberStep";
import QuizGenderStep from "../steps/QuizGenderStep";
import AgeStep from "../steps/AgeStep";
import ReferralSourceStep from "../steps/ReferralSourceStep";
import FounderStoryStep from "../steps/FounderStoryStep";
import MomentCheckYourScalp from "../steps/MomentCheckYourScalp";
import PinchTestStep from "../steps/PinchTestStep";
import MomentHereIsWhatHappens from "../steps/MomentHereIsWhatHappens";
import ResultScreenshotsStep from "../steps/ResultScreenshotsStep";
import MomentBuildYourPlan from "../steps/MomentBuildYourPlan";
import QualificationStep from "../steps/QualificationStep";
import QualificationResponseStep from "../steps/QualificationResponseStep";
import HairLossLocationStep from "../steps/HairLossLocationStep";
import HairGoalStep from "../steps/HairGoalStep";
import GoalResponseStep from "../steps/GoalResponseStep";
import HairLossMedicationStep from "../steps/HairLossMedicationStep";
import HairLossMedicationResponseStep from "../steps/HairLossMedicationResponseStep";
import StressContributionStep from "../steps/StressContributionStep";
import StressContributionResponseStep from "../steps/StressContributionResponseStep";
import HormonalChangesStep from "../steps/HormonalChangesStep";
import HormonalChangesResponseStep from "../steps/HormonalChangesResponseStep";
import TightHairstylesStep from "../steps/TightHairstylesStep";
import TightHairstylesResponseStep from "../steps/TightHairstylesResponseStep";
import FamilyHistoryStep from "../steps/FamilyHistoryStep";
import FamilyHistoryResponseStep from "../steps/FamilyHistoryResponseStep";
import HardestPartStep from "../steps/HardestPartStep";
import HardestPartResponseStep from "../steps/HardestPartResponseStep";
import CommitmentStep from "../steps/CommitmentStep";
import BuildingYourPlanStep from "../steps/BuildingYourPlanStep";
import PlanRevealStep from "../steps/PlanRevealStep";
import OutcomePreviewStep from "../steps/OutcomePreviewStep";
import SocialProofStep from "../steps/SocialProofStep";
import MomentFounderFlashback from "../steps/MomentFounderFlashback";
import TrialPaywall7DayStep from "../steps/TrialPaywall7DayStep";

// Every entry in STEP_ORDER must have a matching component here. Registry is
// Partial only because the StartStep union is a superset (it keeps legacy
// step names for old peer components / dashboards to type-check).
const STEP_COMPONENTS: Partial<Record<StartStep, () => ReactElement | null>> = {
  landingHook: LandingHookStep,
  firstName: FirstNameStep,
  phoneNumber: PhoneNumberStep,
  quizGender: QuizGenderStep,
  age: AgeStep,
  referralSource: ReferralSourceStep,
  founderStory: FounderStoryStep,
  momentCheckYourScalp: MomentCheckYourScalp,
  pinchTest: PinchTestStep,
  momentHereIsWhatHappens: MomentHereIsWhatHappens,
  resultScreenshots: ResultScreenshotsStep,
  momentBuildYourPlan: MomentBuildYourPlan,
  qualification: QualificationStep,
  qualificationResponse: QualificationResponseStep,
  hairLossLocation: HairLossLocationStep,
  hairGoal: HairGoalStep,
  goalResponse: GoalResponseStep,
  hairLossMedicationMen: HairLossMedicationStep,
  hairLossMedicationMenResponse: HairLossMedicationResponseStep,
  stressContribution: StressContributionStep,
  stressContributionResponse: StressContributionResponseStep,
  hormonalChanges: HormonalChangesStep,
  hormonalChangesResponse: HormonalChangesResponseStep,
  tightHairstyles: TightHairstylesStep,
  tightHairstylesResponse: TightHairstylesResponseStep,
  familyHistory: FamilyHistoryStep,
  familyHistoryMenResponse: FamilyHistoryResponseStep,
  hardestPart: HardestPartStep,
  hardestPartResponse: HardestPartResponseStep,
  commitment: CommitmentStep,
  buildingYourPlan: BuildingYourPlanStep,
  planReveal: PlanRevealStep,
  outcomePreview: OutcomePreviewStep,
  socialProof: SocialProofStep,
  momentFounderFlashback: MomentFounderFlashback,
  trialPaywall: TrialPaywall7DayStep,
};

// Conditional-skip rules — steps whose registered component should not
// render for the current answers. Kept in the parent flow (not per step) so
// gating logic is one place to audit. Mirrors the mobile pageMap skips.
function shouldSkip(step: StartStep, answers: ReturnType<typeof useFlow>["answers"]): boolean {
  switch (step) {
    case "qualificationResponse":
      // Women-only reframe interstitial.
      return answers.gender !== "female";
    case "hormonalChanges":
    case "tightHairstyles":
      // Women-only questions.
      return answers.gender !== "female";
    case "hormonalChangesResponse":
      // Female-only + only fires for real hormonal shifts.
      if (answers.gender !== "female") return true;
      return !(
        answers.hormonalChanges === "postpartum" ||
        answers.hormonalChanges === "menopause" ||
        answers.hormonalChanges === "birth_control"
      );
    case "tightHairstylesResponse":
      // Female-only + only fires for daily / sometimes.
      if (answers.gender !== "female") return true;
      return !(
        answers.tightHairstyles === "daily" ||
        answers.tightHairstyles === "sometimes"
      );
    case "familyHistoryMenResponse":
      // Skip on no / not_sure (don't argue against a non-belief).
      return answers.familyHistory === "no" || answers.familyHistory === "not_sure";
    case "stressContributionResponse":
      // Skip when the user said stress doesn't contribute.
      return answers.stressContribution === "no";
    default:
      return false;
  }
}

function StepRenderer() {
  const { step, answers, next } = useFlow();
  const skip = shouldSkip(step, answers);

  // When the current step should be skipped for these answers, advance to
  // the next step on the next tick. useEffect so we don't setState during
  // render. Runs on every step transition — if the next step also needs to
  // skip, this re-fires until we land on a rendering step.
  useEffect(() => {
    if (skip) next();
  }, [skip, next, step]);

  if (skip) return null;

  const Component = STEP_COMPONENTS[step];
  if (!Component) return null;
  return <Component />;
}

export default function StartFlow() {
  return (
    <FlowProvider>
      {/*
        Viewport-locked shell — matches Flutter Scaffold behavior.
        - `height: 100dvh` locks to visible viewport (dvh accounts for
          the iOS/Android address bar; better than vh on mobile).
        - `overflow: hidden` on the shell prevents the whole page from
          scrolling; each step primitive scrolls its own content area
          internally (see QuizSinglePick, PageHeader wrappers) and pins
          the bottom KeshahButton to the viewport bottom.
        - Inner flex column gives step primitives a proper `flex: 1;
          min-height: 0` parent so their internal layout can size itself.
      */}
      <div
        style={{
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          background: "#000",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <StepRenderer />
        </div>
      </div>
    </FlowProvider>
  );
}
