"use client";

// Personalized response after the user picks their support needs.
// Mirrors back what they selected as concrete "recommendations added to your
// plan" — past-tense framing makes it feel like a done deal, "to your plan"
// reinforces the treatment-not-subscription positioning. Auto-skips if the
// user picked nothing (no fallback page).
import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { mediumHaptic } from "../lib/haptics";
import type { SupportNeed } from "../lib/types";
import styles from "./response.module.css";

// Natural phrasings that fit grammatically into "recommendations for X".
const SUPPORT_PHRASE: Record<SupportNeed, string> = {
  get_off_medication: "getting off medication",
  fix_dandruff: "dandruff & oily scalp",
  dht_hormones: "DHT & hormones",
  stress: "stress",
  bloodwork_vitamins: "blood work & vitamins",
  diet: "diet",
};

// English list join: "a", "a and b", "a, b, and c", "a, b, c, and d" etc.
function joinNatural(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
}

export default function SupportNeedsResponse() {
  const { answers, next } = useFlow();
  const needs = answers.supportNeeds ?? [];

  // Auto-skip if the user picked nothing — no fallback page, just continue.
  const shouldSkip = needs.length === 0;

  useEffect(() => {
    if (shouldSkip) {
      next();
    }
  }, [shouldSkip, next]);

  if (shouldSkip) return null;

  // Cap at 4 items so the sentence stays readable. If the user picked 5 or 6,
  // we list the first 4 and append "and more" instead of dumping the full
  // mouthful list.
  const allPhrases = needs.map((id) => SUPPORT_PHRASE[id]);
  const list =
    allPhrases.length > 4
      ? joinNatural([...allPhrases.slice(0, 4), "more"])
      : joinNatural(allPhrases);

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <p className={styles.text}>
          We&apos;ve added recommendations for {list} to your plan, so nothing
          comes in the way of your results.
        </p>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
