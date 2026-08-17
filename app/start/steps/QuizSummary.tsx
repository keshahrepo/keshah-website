"use client";

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import type { Gender, HairLossLocation, HairGoal, SupportNeed } from "../lib/types";
import styles from "./quiz-summary.module.css";

const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
};

const LOCATION_LABELS: Record<HairLossLocation, string> = {
  crown: "Crown",
  part: "Part line",
  hairline: "Hairline",
  all_over: "All over",
};

const GOAL_LABELS: Record<HairGoal, string> = {
  stop_the_loss: "Reduce shedding",
  regrow_hair: "Regrow lost hair",
  both: "Stop & regrow",
  thicker_fuller: "Thicker, fuller hair",
  support_health: "Support hair health",
  feel_confident: "Feel more confident",
};

const SUPPORT_SHORT: Record<SupportNeed, string> = {
  get_off_medication: "Medication",
  fix_dandruff: "Dandruff",
  dht_hormones: "DHT",
  stress: "Stress",
  bloodwork_vitamins: "Vitamins",
  diet: "Diet",
};

function summarizeSupport(needs: SupportNeed[] | undefined): string | null {
  if (!needs || needs.length === 0) return null;
  const labels = needs.slice(0, 3).map((id) => SUPPORT_SHORT[id]);
  if (needs.length > 3) labels.push(`& ${needs.length - 3} more`);
  return labels.join(", ");
}

export default function QuizSummary() {
  const { answers, next } = useFlow();
  const config = useFunnelConfig();
  const support = summarizeSupport(answers.supportNeeds);

  // Women's funnels show PersonalizedDiagnosis as the pre-paywall reveal
  // instead of this generic summary, so auto-skip here for them.
  const isWomen = config.audience === "women" || answers.gender === "female";
  useEffect(() => {
    if (isWomen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWomen]);
  if (isWomen) return null;

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <h1 className={styles.headline}>{"KESHAH is built\nfor you."}</h1>

        <div className={styles.list}>
          {answers.gender && <Row label="Gender" value={GENDER_LABELS[answers.gender]} />}
          {answers.hairLossLocation && (
            <Row label="Hair loss" value={LOCATION_LABELS[answers.hairLossLocation]} />
          )}
          {answers.hairGoal && <Row label="Goal" value={GOAL_LABELS[answers.hairGoal]} />}
          {answers.commitmentAnswer === "yes" && <Row label="Commitment" value="Yes" />}
          {support && <Row label="We'll help with" value={support} />}
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={next}>
          Continue
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{value}</span>
    </div>
  );
}
