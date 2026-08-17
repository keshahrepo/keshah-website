"use client";

// Direct port of qualification_screen.dart.
// "Is KESHAH right for you?" with two lists: is for / is NOT for.
// Two buttons: primary "KESHAH is right for me" + outline "Not right for me".
// "No" path shows the shared DisqualificationScreen.
import { useState } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig, practiceTerm } from "../lib/funnel-config";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import DisqualificationScreen from "../components/DisqualificationScreen";
import styles from "./qualification.module.css";

const NOT_FOR_ITEMS = [
  "Alopecia areata (patchy)",
  "Chemotherapy-related",
  "Scarring alopecia",
];

export default function Qualification() {
  const { answers, next } = useFlow();
  const config = useFunnelConfig();
  const isFemale = answers.gender === "female" || config.audience === "women";
  const term = practiceTerm(config.audience, answers.gender);
  // Capitalized form for sentence-start use ("Scalp exercises..." / "Scalp massages...")
  const Term = term.charAt(0).toUpperCase() + term.slice(1);
  const [showDisqualified, setShowDisqualified] = useState(false);

  if (showDisqualified) {
    return (
      <DisqualificationScreen
        message={`${Term} might not be right for you.`}
        subtext={`${Term} work on tension-related hair loss. They won't help with the conditions on the bottom of the list.`}
        onGoBack={() => setShowDisqualified(false)}
      />
    );
  }

  // Each named condition is its own row so the user can spot themselves
  // in the list. Bundling under "AKA" or "and" hides matches — a woman
  // searching for "perimenopause" wants to see that exact word, not
  // "and menopause hair loss" appended to another item.
  const forItems = isFemale
    ? [
        "Female pattern hair thinning",
        "Genetic / androgenetic alopecia",
        "Postpartum shedding",
        "Perimenopause hair loss",
        "Menopause hair loss",
        "Stress-related shedding",
      ]
    : [
        "Genetic hair loss",
        "Androgenic alopecia",
        "Male pattern baldness",
        "Stress-related hair loss",
      ];

  const handleYes = () => {
    mediumHaptic();
    next();
  };

  const handleNo = () => {
    lightHaptic();
    setShowDisqualified(true);
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <h1 className={styles.headline}>{`Are ${term}\nright for you?`}</h1>

        <div className={styles.lists}>
          <div className={styles.sectionLabel}>{`${Term} work for:`}</div>
          {forItems.map((item) => (
            <div key={item} className={styles.row}>
              <CheckIcon />
              <span className={styles.rowText}>{item}</span>
            </div>
          ))}

          <div className={styles.sectionLabelGap}>Not for:</div>
          {NOT_FOR_ITEMS.map((item) => (
            <div key={item} className={styles.row}>
              <XIcon />
              <span className={styles.rowTextMuted}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.primary} onClick={handleYes}>
          Yes, this is right for me
        </button>
        <button type="button" className={styles.outline} onClick={handleNo}>
          <span className={styles.outlineMain}>Not right for me</span>
          <span className={styles.outlineSub}>{`${Term} may not be the right fit for you`}</span>
        </button>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.5 9.5L7 13L14.5 5"
        stroke="#4ADE80"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5"
        stroke="var(--fg-35)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
