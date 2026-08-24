"use client";

// India-only step. Mirrors mobile PostAuthFlow2 first_name screen.
// Filtered out for /start (US) by FlowProvider's runtime stepOrder.

import { useEffect, useRef, useState } from "react";
import { useFlow } from "../lib/flow-context";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

export default function FirstName() {
  const { answers, updateAnswers, next, back } = useFlow();
  const [value, setValue] = useState(answers.firstName ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    lightHaptic();
    const cleaned = value.trim();
    // Capitalize first letter (matches mobile FirstLetterUpperCaseFormatter)
    const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    updateAnswers({ firstName: capitalized });
    next();
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>What&apos;s your first name?</h1>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="given-name"
            autoCapitalize="words"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={40}
            style={{
              width: "100%",
              padding: "16px 20px",
              fontSize: 18,
              fontFamily: "Poppins, sans-serif",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              outline: "none",
              marginTop: 8,
            }}
          />
          {/* Button inline below input — stays visible above iOS keyboard. */}
          <div style={{ marginTop: 20 }}>
            <Button disabled={!value.trim()} onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}>
              Continue
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
