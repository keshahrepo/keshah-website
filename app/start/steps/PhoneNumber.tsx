"use client";

// India-only step. Mirrors mobile PostAuthFlow2 phone_number screen.
// Captures E.164 phone for WhatsApp nurture. Filtered out for /start (US).
//
// On submit: sign in anonymously via Firebase, then POST to /api/funnel/save-lead
// to write a Users doc with phone + nurture_started_at. Anon UID is later
// upgraded to a real account via linkWithCredential at the SignUp step.

import { useEffect, useRef, useState } from "react";
import { useFlow } from "../lib/flow-context";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import { signInAnonymous } from "../lib/firebase-client";
import styles from "../start.module.css";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";

export default function PhoneNumber() {
  const { answers, updateAnswers, next, back } = useFlow();
  const [value, setValue] = useState<string | undefined>(answers.phoneNumber);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-focus the input inside the PhoneInput component
    const input = containerRef.current?.querySelector("input");
    input?.focus();
  }, []);

  const valid = value && isValidPhoneNumber(value);

  const handleContinue = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    lightHaptic();

    updateAnswers({ phoneNumber: value });

    try {
      // Anonymous Firebase sign-in: gets a UID we can save the lead under.
      // The SignUp step later upgrades this anon account to a real account
      // via linkWithCredential, preserving the same UID.
      const uid = await signInAnonymous();

      // Write the lead doc — phone + firstName + nurture_started_at — so
      // the WhatsApp Cloud Function picks them up on its next cron run.
      await fetch("/api/funnel/save-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          firstName: answers.firstName,
          phoneNumber: value,
        }),
        keepalive: true,
      });

      next();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[phone] save-lead failed", err);
      // Don't block the funnel — let user proceed even if lead save fails.
      // They just won't get WhatsApp nurture if they bail later.
      next();
    }
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>Enter your number</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleContinue();
          }}
        >
          <div ref={containerRef} className="phone-input-wrap" style={{ marginTop: 24 }}>
            <PhoneInput
              international
              countryCallingCodeEditable={false}
              defaultCountry="IN"
              value={value}
              onChange={setValue}
              placeholder="Phone number"
            />
          </div>
          {error && (
            <p style={{ color: "#ff6b6b", fontSize: 13, marginTop: 12 }}>
              {error}
            </p>
          )}
          {/* Button inline below input — stays visible above iOS keyboard. */}
          <div style={{ marginTop: 20 }}>
            <Button disabled={!valid || submitting} onClick={handleContinue}>
              {submitting ? "Saving..." : "Continue"}
            </Button>
          </div>
          {/* Hidden submit so Enter key triggers form. */}
          <button type="submit" style={{ display: "none" }} aria-hidden="true" />
        </form>
      </div>
      {/* Style overrides for the phone input library to match the dark theme. */}
      <style jsx global>{`
        .phone-input-wrap .PhoneInput {
          display: flex;
          align-items: center;
          padding: 14px 20px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
        }
        .phone-input-wrap .PhoneInputCountry {
          margin-right: 12px;
        }
        .phone-input-wrap .PhoneInputCountrySelect {
          color: #fff;
          background: transparent;
        }
        .phone-input-wrap .PhoneInputInput {
          flex: 1;
          background: transparent;
          border: none;
          color: #fff;
          font-size: 18px;
          font-family: "Poppins", sans-serif;
          outline: none;
        }
        .phone-input-wrap .PhoneInputInput::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
}
