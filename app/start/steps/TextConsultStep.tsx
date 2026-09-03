"use client";

// Final step of the v2 text-consult funnel. Replaces trialPaywall.
//
// User has been through: landingHook → founderStory → pinchTest →
// resultScreenshots → 5-question qualification quiz → commitment (20
// min/day gate). They've earned the ask. This step tells them they
// qualify for a free text consult with Aadi and hands them off to
// iMessage with their quiz answers pre-loaded in the SMS body.
//
// Aadi then does the equivalent of his old video-call consultation via
// text: asks a couple more diagnostic questions, sends them a
// personalized plan URL, they start the trial from a warmed position.
//
// The "You qualify" framing is deliberate — flips the dynamic from
// supplicant ("please text me") to authoritative ("you've earned access
// to me"). Same action, opposite psychology.
//
// Secondary "Or start your trial without talking" link preserves a
// direct-buy path for the already-convinced, so we don't lose those
// conversions.

import { motion } from "framer-motion";
import { useMemo } from "react";
import { useFlow } from "../lib/flow-context";
import { colors } from "../lib/tokens";

const FONT = "Poppins, -apple-system, sans-serif";
const AADI_NUMBER = "+18328634933";
const EASE_OUT: [number, number, number, number] = [0, 0, 0.2, 1];

// Map raw quiz answers → human-readable phrases for the recap sentence
// + the pre-loaded SMS body. Kept in one place so the two stay in sync.
function locationPhrase(loc: string | undefined): string {
  switch (loc) {
    case "crown":
      return "crown";
    case "hairline":
      return "hairline";
    case "part":
      return "part";
    case "all_over":
      return "all over";
    default:
      return "scalp";
  }
}

function pinchPhrase(pinch: string | undefined): string {
  switch (pinch) {
    case "muchTighter":
      return "very tight";
    case "tighter":
      return "tight";
    case "aBitTighter":
      return "a little tight";
    default:
      return "tight";
  }
}

export default function TextConsultStep() {
  const { answers } = useFlow();
  const location = locationPhrase(
    answers.hairLossLocation as string | undefined,
  );
  const pinch = pinchPhrase(
    (answers as { pinchTestAnswer?: string }).pinchTestAnswer,
  );

  // Pre-loaded iMessage body. sms: URL scheme accepts &body= on iOS.
  // Aadi's first response is substantive because he already knows their
  // situation — no "so what's up?" round.
  const smsBody = useMemo(() => {
    const raw = `Hi Aadi — I just qualified for a text consult. I'm losing hair at the ${location}, my scalp is ${pinch}, and I'm ready to commit 20 min/day. Ready to talk about my plan.`;
    return encodeURIComponent(raw);
  }, [location, pinch]);

  const smsHref = `sms:${AADI_NUMBER}&body=${smsBody}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        width: "100%",
        minHeight: 0,
        background: colors.black,
        color: colors.white,
        fontFamily: FONT,
      }}
    >
      {/* Scrollable body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "32px 25px 20px",
        }}
      >
        <div
          style={{
            maxWidth: 520,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {/* Aadi headshot */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            style={{ display: "flex", justifyContent: "center" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/aadi.png"
              alt="Aadi Agrawal, KESHAH founder"
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                objectFit: "cover",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          </motion.div>

          <div style={{ height: 22 }} />

          {/* Main headline — the "you qualify" frame */}
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1, ease: EASE_OUT }}
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.8px",
              lineHeight: 1.25,
              color: colors.white,
              textAlign: "center",
            }}
          >
            You qualify for a free text consult with Aadi.
          </motion.h1>

          <div style={{ height: 20 }} />

          {/* Conversational recap + expectation setting */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2, ease: EASE_OUT }}
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 400,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.85)",
              textAlign: "center",
            }}
          >
            You told him you&apos;re losing hair at the{" "}
            <strong style={{ color: colors.white }}>{location}</strong>, your
            scalp is <strong style={{ color: colors.white }}>{pinch}</strong>,
            and you&apos;re ready to commit 20 min a day. Aadi will look at
            your case, ask a couple more questions, and put together your
            personalized plan.
          </motion.p>

          <div style={{ height: 14 }} />

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3, ease: EASE_OUT }}
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 400,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.55)",
              textAlign: "center",
            }}
          >
            Usually takes about 5 minutes.
          </motion.p>
        </div>
      </div>

      {/* Sticky CTA — matches other step primitives' bottom-anchored
          KeshahButton pattern so the layout feels consistent inside
          /start's viewport shell. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.45, ease: EASE_OUT }}
        style={{
          padding: "12px 25px calc(env(safe-area-inset-bottom, 0px) + 16px)",
          background: colors.black,
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <a
          href={smsHref}
          onClick={() => {
            // Fire a `text_handoff_clicked` FunnelEvent so the
            // onboarding-web dashboard can measure textConsult →
            // iMessage-tap-through. Without this we know who reached
            // the page but not who actually clicked the CTA to open
            // Messages. Fire-and-forget, keepalive so the request
            // survives the anchor navigation.
            try {
              if (typeof window !== "undefined") {
                let sessionId = sessionStorage.getItem("keshah_funnel_session");
                if (!sessionId) {
                  sessionId = crypto.randomUUID();
                  sessionStorage.setItem("keshah_funnel_session", sessionId);
                }
                fetch("/api/funnel/track", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    step: "text_handoff_clicked",
                    sessionId,
                    source: "us",
                  }),
                  keepalive: true,
                }).catch(() => {});
              }
            } catch {}
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "18px 0",
            borderRadius: 40,
            background: colors.white,
            color: colors.black,
            fontFamily: FONT,
            fontSize: 16,
            fontWeight: 600,
            textAlign: "center",
            textDecoration: "none",
            boxSizing: "border-box",
          }}
        >
          Text Aadi →
        </a>
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            fontWeight: 500,
            color: "rgba(255,255,255,0.5)",
            textAlign: "center",
          }}
        >
          opens Messages · free · no obligation
        </div>
      </motion.div>
    </div>
  );
}
