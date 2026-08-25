"use client";

/**
 * FirstNameStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/first_name.dart
 *
 * Simple text-input step. Title "What's your first name?" (Poppins 26 / w600 /
 * -1 tracking / lh 1.2), a KeshahTextField below, and a bottom-anchored
 * Continue pill that toggles between a full-white live state (kBlack label)
 * and a 30% white disabled state (50% white label) — exactly mirroring the
 * mobile widget's AnimatedContainer (200ms).
 *
 * Firestore field: writes into flow state under `firstName`; the shared
 * /api/funnel/save-profile route persists it into `wp_user.display_name`
 * (see save-profile/route.ts line 183–187) — that's the exact mobile field
 * (`wp_user.displayName`) the app reads.
 */

import { useState, type ChangeEvent, type FormEvent } from "react";
import { motion } from "framer-motion";
import { AnimatedPage, AnimatedPageItem, KeshahTextField } from "../components/primitives";
import { useFlow } from "../lib/flow-context";
import { lightHaptic } from "../lib/haptics";
import { colors, radius } from "../lib/tokens";

// Mirrors FirstLetterUpperCaseFormatter on mobile — capitalises the first
// non-space character as the user types (leaves the rest untouched so
// hyphenated / multi-word names still type naturally).
function capitalizeFirstLetter(value: string): string {
  const i = value.search(/\S/);
  if (i === -1) return value;
  return value.slice(0, i) + value.charAt(i).toUpperCase() + value.slice(i + 1);
}

// Loose first-name check — same intent as FormBuilderValidators.firstName():
// at least one letter, no digits. Empty is caught by the disabled Continue
// pill so it never reaches this validator.
function validateFirstName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Please enter your first name";
  if (!/^[A-Za-z][A-Za-z '\-]*$/.test(trimmed)) {
    return "Please enter a valid first name";
  }
  return null;
}

export default function FirstNameStep() {
  const { answers, updateAnswers, next } = useFlow();
  const [value, setValue] = useState<string>(answers.firstName ?? "");
  const [error, setError] = useState<string | null>(null);

  const hasText = value.trim().length > 0;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(capitalizeFirstLetter(e.target.value));
    if (error) setError(null);
  };

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    const err = validateFirstName(trimmed);
    if (err) {
      setError(err);
      return;
    }
    lightHaptic();
    updateAnswers({ firstName: trimmed });
    next();
  };

  return (
    <AnimatedPage
      style={{
        minHeight: "100dvh",
        justifyContent: "flex-start",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: "100dvh",
        }}
      >
        {/* Title + field block — matches mobile's 32px horizontal padding. */}
        <div style={{ padding: "0 32px" }}>
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
              What&apos;s your first name?
            </h1>
          </AnimatedPageItem>

          <AnimatedPageItem style={{ marginTop: 16 }}>
            <KeshahTextField
              value={value}
              onChange={handleChange}
              autoFocus
              autoComplete="given-name"
              autoCapitalize="words"
              inputMode="text"
              enterKeyHint="done"
              errorText={error ?? undefined}
            />
          </AnimatedPageItem>
        </div>

        {/* Flex spacer — matches Flutter Spacer(). */}
        <div style={{ flex: 1 }} />

        {/* Bottom-anchored Continue pill. Mobile: 25 horizontal / 35 bottom
            padding, 18 vertical inner padding, radius 40, 200ms tween between
            live (kWhite bg + kBlack label) and disabled (30% white bg + 50%
            white label). */}
        <div style={{ padding: "0 25px 35px 25px" }}>
          <motion.button
            type="submit"
            disabled={!hasText}
            whileTap={hasText ? { scale: 0.98 } : undefined}
            transition={{ duration: 0.12, ease: "easeOut" }}
            style={{
              width: "100%",
              padding: "18px 0",
              border: "none",
              borderRadius: radius.button,
              background: hasText ? colors.white : "rgba(255,255,255,0.3)",
              color: hasText ? colors.black : "rgba(255,255,255,0.5)",
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 16,
              fontWeight: 500,
              cursor: hasText ? "pointer" : "not-allowed",
              transition: "background 200ms ease, color 200ms ease",
            }}
          >
            Continue
          </motion.button>
        </div>
      </form>
    </AnimatedPage>
  );
}
