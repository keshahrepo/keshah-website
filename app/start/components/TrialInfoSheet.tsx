"use client";

// Shared bottom sheet shown after user taps a "Try free" CTA.
// Walks through what happens today / during trial / on charge day / how to
// cancel before opening Razorpay. Apple-style "How your trial works" pattern
// — reduces disputes from users who didn't realize they'd be charged.
//
// Used by both /tryfree (7-day) and /startindiafree (1-day trial).

import { useEffect, useMemo, useState } from "react";
import sheetStyles from "./plan-modal.module.css";
import timelineStyles from "../steps/trial-paywall.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  /** Number of free trial days before first charge. Defaults to 7. */
  trialDays?: number;
  /** Subscription cadence shown in the charge-day step.
   *  Defaults to "₹999 every 3 months". /startindiafree2 passes "₹999 every month". */
  chargeText?: string;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface Step {
  title: string;
  body: React.ReactNode;
}

export default function TrialInfoSheet({
  open,
  onClose,
  onConfirm,
  busy,
  trialDays = 7,
  chargeText = "₹999 every 3 months.",
}: Props) {
  const [mounted, setMounted] = useState(false);

  const chargeDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + trialDays);
    return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  }, [trialDays]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Steps vary by trial length. 1-day = "Free today" / "Tomorrow"; longer
  // trials use "N days free" / date label.
  const steps: Step[] = useMemo(() => {
    const freeLabel = trialDays === 1 ? "Free today" : `${trialDays} days free`;
    return [
      {
        title: "Today",
        body: "₹5 UPI verification, refunded in minutes.",
      },
      {
        title: freeLabel,
        body: "Full KESHAH access.",
      },
      {
        title: chargeDate,
        body: chargeText,
      },
      {
        title: "Cancel anytime",
        body: "In your UPI app or email contact@keshah.com.",
      },
    ];
  }, [trialDays, chargeDate, chargeText]);

  if (!open) return null;

  return (
    <div
      className={`${sheetStyles.overlay} ${mounted ? sheetStyles.overlayOpen : ""}`}
      onClick={busy ? undefined : onClose}
    >
      <div
        className={`${sheetStyles.sheet} ${mounted ? sheetStyles.sheetOpen : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={sheetStyles.handle} />

        {busy ? (
          <LoadingView />
        ) : (
          <>
            <h2 className={sheetStyles.headline}>How your trial works</h2>

            <div style={{ padding: "0 25px" }}>
              <div className={timelineStyles.timeline}>
                {steps.map((s, i) => (
                  <div key={s.title} className={timelineStyles.milestone}>
                    <div className={timelineStyles.dotColumn}>
                      <div
                        className={`${timelineStyles.dot} ${
                          i === 0 ? timelineStyles.dotFilled : ""
                        }`}
                      />
                      {i < steps.length - 1 && (
                        <div className={timelineStyles.dotLine} />
                      )}
                    </div>
                    <div className={timelineStyles.milestoneText}>
                      <div className={timelineStyles.milestoneDay}>{s.title}</div>
                      <div className={timelineStyles.milestoneTitle}>{s.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              className={sheetStyles.cta}
              onClick={onConfirm}
            >
              Start free trial
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function LoadingView() {
  return (
    <div
      style={{
        padding: "40px 25px 30px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "2.5px solid rgba(255,255,255,0.15)",
          borderTopColor: "#fff",
          animation: "spin 800ms linear infinite",
        }}
      />
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "#fff",
          textAlign: "center",
          fontFamily: "Poppins, sans-serif",
        }}
      >
        Sending you to UPI verification…
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 400,
          color: "rgba(255,255,255,0.5)",
          textAlign: "center",
          lineHeight: 1.5,
          fontFamily: "Poppins, sans-serif",
          maxWidth: 280,
        }}
      >
        Approve the ₹5 mandate in your UPI app to start your trial.
      </div>
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
