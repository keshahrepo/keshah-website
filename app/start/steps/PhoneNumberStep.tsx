"use client";

/**
 * PhoneNumberStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/phone_number.dart
 *
 * Capture phone for WhatsApp/SMS nurture. Layout mirrors the mobile
 * quiz-question pattern: 32px horizontal padding, 26/w600 title
 * "Enter your number", 16px gap, IntlPhoneField in a #373737 rounded
 * box, Spacer, then a pill Continue button at the bottom.
 *
 * Firestore field: `phone_number` (E.164). Written by save-profile via
 * the flow context's `phoneNumber` answer key.
 *
 * Both genders, linear (no branching). Skipped if the user already has
 * phone_number set — the integrator handles that gate.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import PhoneInput, { type Country } from "react-phone-number-input";
import { isValidPhoneNumber } from "libphonenumber-js";
import { AnimatedPage, AnimatedPageItem } from "../components/primitives";
import { colors } from "../lib/tokens";
import { useFlow } from "../lib/flow-context";
import { lightHaptic } from "../lib/haptics";

// Bundle the CSS for react-phone-number-input inline — the primitive
// stylesheet only lays out its country <select> + input; the visual
// styling below overrides colors/backgrounds to match the mobile
// #373737 rounded field.
import "react-phone-number-input/style.css";

function detectInitialCountry(): Country {
  if (typeof navigator === "undefined") return "US";
  const lang = navigator.language || (navigator.languages && navigator.languages[0]) || "";
  const region = lang.split("-")[1];
  return (region ? region.toUpperCase() : "US") as Country;
}

export default function PhoneNumberStep() {
  const { updateAnswers, next } = useFlow();
  const [value, setValue] = useState<string | undefined>(undefined);
  const [country, setCountry] = useState<Country>("US");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCountry(detectInitialCountry());
    // Autofocus the input, matching mobile's post-frame requestFocus.
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  const isValid = useMemo(() => {
    if (!value) return false;
    try {
      return isValidPhoneNumber(value);
    } catch {
      return false;
    }
  }, [value]);

  const submit = () => {
    if (!isValid || !value) return;
    lightHaptic();
    updateAnswers({ phoneNumber: value });
    // Blur so the on-screen keyboard collapses before the transition.
    inputRef.current?.blur();
    next();
  };

  return (
    <AnimatedPage style={{ minHeight: "100dvh", flex: 1 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: "100dvh",
        }}
      >
        <div style={{ padding: "0 32px", display: "flex", flexDirection: "column" }}>
          <AnimatedPageItem>
            <h1
              style={{
                fontFamily: "Poppins, -apple-system, sans-serif",
                fontSize: 26,
                fontWeight: 600,
                color: colors.white,
                letterSpacing: -1,
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              Enter your number
            </h1>
          </AnimatedPageItem>

          <AnimatedPageItem style={{ marginTop: 16 }}>
            <div
              style={{
                background: colors.box,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                padding: "0 20px",
                height: 56,
              }}
            >
              <PhoneInput
                international
                defaultCountry={country}
                value={value}
                onChange={setValue}
                numberInputProps={{
                  ref: inputRef,
                  autoComplete: "tel",
                  inputMode: "tel",
                  style: {
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: colors.white,
                    caretColor: colors.white,
                    fontFamily: "Poppins, -apple-system, sans-serif",
                    fontSize: 16,
                    fontWeight: 500,
                    padding: "16px 0",
                    minWidth: 0,
                  },
                }}
                countrySelectProps={{
                  style: {
                    background: "transparent",
                    color: colors.white,
                  },
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  gap: 8,
                  color: colors.white,
                }}
              />
            </div>
            {/* Overrides for the library's built-in styles so both the
                country <select> and the flag icon read on dark. */}
            <style>{`
              .PhoneInputCountry { color: ${colors.white}; }
              .PhoneInputCountrySelect { color: ${colors.white}; background: transparent; }
              .PhoneInputCountrySelectArrow { color: ${colors.white}; opacity: 0.7; }
              .PhoneInputInput::placeholder { color: rgba(255,255,255,0.4); }
              .PhoneInputInput { color: ${colors.white}; }
            `}</style>
          </AnimatedPageItem>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ padding: "0 25px 35px 25px" }}>
          <button
            type="button"
            onClick={submit}
            disabled={!isValid}
            style={{
              width: "100%",
              padding: "18px 0",
              borderRadius: 40,
              border: "none",
              cursor: isValid ? "pointer" : "default",
              background: isValid ? colors.white : "rgba(255,255,255,0.3)",
              color: isValid ? colors.black : "rgba(255,255,255,0.5)",
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 16,
              fontWeight: 500,
              transition: "background 200ms ease, color 200ms ease",
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </AnimatedPage>
  );
}
