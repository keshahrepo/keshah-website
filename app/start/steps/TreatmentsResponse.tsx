"use client";

// Personalized response based on what treatments the user has tried.
// Branches (checked in this order — first match wins):
//
//   - Nothing only           → KESHAH-as-clean-slate framing
//   - Hair transplant        → "best transplant doctors recommend exercises"
//   - PRP / Stem Cells       → "best PRP & stem cells clinics recommend..."
//   - ONLY Dermarollers      → "microneedling can work — most do it wrong"
//   - ONLY Minoxidil         → mechanism + tight-scalp limitation
//   - ONLY Finasteride       → DHT blocker temporary results
//   - Pharma (combos)        → "temporary results, no product fixes the cause"
//   - Natural only           → "great marketing, doesn't fix the cause"
//   - Otherwise              → AUTO-SKIP this step entirely (no fallback page)
//
// Procedures (transplant, PRP) take precedence over single-product branches
// because they represent the biggest investment — those users get the most
// significant message regardless of what else they tried alongside.
// The "only X" branches use length === 1 so they only fire when the user
// picked that single option. Combinations fall through to the generic pharma
// or natural branches.
import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { mediumHaptic } from "../lib/haptics";
import styles from "./response.module.css";

const PHARMA = ["Minoxidil (Rogaine)", "Finasteride / DHT Blocker"];
const NATURAL = [
  "Hair loss shampoos",
  "Supplements / vitamins",
  "Rosemary / essential oils",
];

export default function TreatmentsResponse() {
  const { answers, next } = useFlow();
  const tried = answers.treatmentsTried ?? [];

  const onlyNothing = tried.length === 1 && tried[0] === "Nothing";
  const triedTransplant = tried.includes("Hair transplant");
  const triedPRP = tried.includes("PRP / Stem Cells");
  const onlyDermarollers =
    tried.length === 1 && tried[0] === "Dermarollers / Dermastamps";
  const onlyMinoxidil =
    tried.length === 1 && tried[0] === "Minoxidil (Rogaine)";
  const onlyFinasteride =
    tried.length === 1 && tried[0] === "Finasteride / DHT Blocker";
  const triedPharma = tried.some((t) => PHARMA.includes(t));
  const triedNatural = tried.some((t) => NATURAL.includes(t));

  // Auto-skip if no branch matches — no generic fallback page.
  const shouldSkip =
    !onlyNothing &&
    !triedTransplant &&
    !triedPRP &&
    !onlyDermarollers &&
    !onlyMinoxidil &&
    !onlyFinasteride &&
    !triedPharma &&
    !triedNatural;

  useEffect(() => {
    if (shouldSkip) {
      next();
    }
  }, [shouldSkip, next]);

  if (shouldSkip) return null;

  const text = (() => {
    if (onlyNothing) {
      return (
        <>
          For most members KESHAH is all they need. I never took any pill or
          applied any product after I started. This is a good place to start
          if you want to target the root cause.
        </>
      );
    }

    if (triedTransplant) {
      return (
        <>
          The best transplant doctors actually recommend scalp exercises to
          help improve &amp; maintain results. That&apos;s what generally
          shows long-term results.
        </>
      );
    }

    if (triedPRP) {
      return (
        <>
          The best PRP &amp; stem cells clinics actually recommend scalp
          exercises to help improve &amp; maintain results. That&apos;s what
          generally shows long-term results.
        </>
      );
    }

    if (onlyDermarollers) {
      return (
        <>
          Microneedling can be effective to increase blood flow and regrow
          new hair. But most people do it wrong. We&apos;ll show you how to
          combine it with scalp exercises for the best results.
        </>
      );
    }

    if (onlyMinoxidil) {
      return (
        <>
          Put simply, minoxidil works by widening the blood vessels to
          increase blood flow to the hair. But if your scalp is tight there
          is only so much minoxidil can do. Scalp techniques actually fix the
          problem at the root.
        </>
      );
    }

    if (onlyFinasteride) {
      return (
        <>
          DHT blockers can show temporary results, but don&apos;t treat the
          root cause. Most members who are consistent with KESHAH don&apos;t
          need any DHT blockers.
        </>
      );
    }

    // Pharma path covers combos — minoxidil+finasteride, pharma+natural,
    // pharma+dermarollers, etc. The "only X" branches above already handled
    // the single-product cases.
    if (triedPharma) {
      return (
        <>
          While these can show temporary results, none of them treat the root
          cause. Unfortunately, no product is going to fix a tight &amp;
          restricted scalp. We need to put in the work.
        </>
      );
    }

    // triedNatural — natural only (not combined with pharma).
    return (
      <>
        Most natural stuff is great marketing. But it doesn&apos;t actually
        fix the root cause. Unfortunately, no product is going to fix a tight
        &amp; restricted scalp. We need to put in the work.
      </>
    );
  })();

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <p className={styles.text}>{text}</p>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
