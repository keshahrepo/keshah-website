"use client";

// Paid Creator Intern application — multi-step quiz that recreates the
// KESHAH mobile onboarding flow 1:1. One question per screen. Instant
// step swap (no slide animation between steps). Each step has its own
// staggered fade-in matching post_auth_flow_2 (title 0.0-0.4, options
// 0.2-0.7, button 0.5-1.0, all 700ms easeOut, kicked off at mount).
//
// Last step is a Calendly embed where applicants pick a group-interview
// time. Prefills name + email from what we already collected so the
// Calendly form is one click. Submission to Firestore fires the moment
// the user reaches the Calendly step so we capture the applicant even
// if they close the tab before confirming a slot — Calendly's own
// webhook flips status to "booked" when a time is picked.

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import styles from "../../careers.module.css";
import apply from "./apply.module.css";

const SLUG = "paid-creator-intern";
const DRAFT_STORAGE_KEY = "keshah_careers_draft_id_v1";
const CALENDLY_URL = "https://calendly.com/aadi-keshah/group-interview";

function newDraftId(): string {
  const t = Date.now().toString(36);
  const r =
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6);
  return `d_${t}_${r}`;
}

type Gender = "male" | "female";
type YesNo = "yes" | "no";

type Form = {
  full_name: string;
  email: string;
  phone: string;
  gender: "" | Gender;
  college: string;
  graduation_year: string;
  can_commit: "" | YesNo;
  social_handle: string;
};

const EMPTY: Form = {
  full_name: "",
  email: "",
  phone: "",
  gender: "",
  college: "",
  graduation_year: "",
  can_commit: "",
  social_handle: "",
};

// ── Steps ────────────────────────────────────────────────────────
// Each step is one screen. Order = order shown. Add/remove entries to
// re-shape the flow — nothing else needs to change.
type Step =
  | { kind: "text"; key: keyof Form; title: string; subtitle?: string; placeholder?: string; type?: "text" | "email" | "tel"; autoComplete?: string; optional?: boolean }
  | { kind: "select"; key: keyof Form; title: string; subtitle?: string; options: { value: string; label: string }[] }
  | { kind: "yesno"; key: keyof Form; title: string; subtitle?: string; noSub?: string }
  | { kind: "calendly"; title: string; subtitle?: string };

const STEPS: Step[] = [
  { kind: "text", key: "full_name", title: "What's your full name?", placeholder: "First and last", autoComplete: "name" },
  { kind: "text", key: "email", title: "What's the best email for you?", subtitle: "We'll only reach out about your application.", placeholder: "you@example.com", type: "email", autoComplete: "email" },
  { kind: "text", key: "phone", title: "And your phone number?", placeholder: "e.g. (555) 555-5555", type: "tel", autoComplete: "tel" },
  { kind: "select", key: "gender", title: "What's your gender?", options: [{ value: "male", label: "Male" }, { value: "female", label: "Female" }] },
  { kind: "text", key: "college", title: "Which college or university?", placeholder: "e.g. UC Berkeley", autoComplete: "organization" },
  { kind: "select", key: "graduation_year", title: "When do you graduate?", options: [
    { value: "2026", label: "2026" }, { value: "2027", label: "2027" },
    { value: "2028", label: "2028" }, { value: "2029", label: "2029" },
  ] },
  { kind: "yesno", key: "can_commit", title: "Can you commit ~1 hr/day, Mon–Fri?", noSub: "This role may not be the right fit" },
  { kind: "text", key: "social_handle", title: "TikTok or Instagram handle?", subtitle: "Optional — helps us get a sense of how you post already.", placeholder: "@yourhandle", optional: true },
  { kind: "calendly", title: "Pick your interview time.", subtitle: "30-min group interview with Aadi, our founder. Small group — 6-8 people." },
];

export default function ApplyQuiz() {
  const [stepIdx, setStepIdx] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const draftIdRef = useRef<string>("");
  const submittedRef = useRef<boolean>(false);
  const step = STEPS[stepIdx];

  // Bootstrap draft id from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let id = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!id) {
      id = newDraftId();
      window.localStorage.setItem(DRAFT_STORAGE_KEY, id);
    }
    draftIdRef.current = id;
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Fire-and-forget draft save. Called on Continue (once per step advance).
  async function saveDraft(overrides?: Partial<Form>) {
    const id = draftIdRef.current;
    if (!id) return;
    const merged = { ...form, ...(overrides ?? {}) };
    try {
      await fetch("/api/careers/apply-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: id,
          listing_slug: SLUG,
          full_name: merged.full_name,
          email: merged.email,
          phone: merged.phone,
          gender: merged.gender,
          college: merged.college,
          graduation_year: merged.graduation_year,
          can_commit: merged.can_commit,
          social_handle: merged.social_handle,
        }),
        keepalive: true,
      });
    } catch {
      /* silent — draft save is best-effort */
    }
  }

  // Text-step Enter key = Continue
  useEffect(() => {
    if (step.kind !== "text") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && canContinue()) advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form]);

  // When the user lands on the Calendly step, submit the application
  // record once. This is what captures them even if they bail without
  // picking a slot.
  useEffect(() => {
    if (step.kind !== "calendly") return;
    if (submittedRef.current) return;
    submittedRef.current = true;
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  // Pure — must not touch state (this is called during render for
  // the disabled-state of the Continue button).
  function canContinue(): boolean {
    switch (step.kind) {
      case "text": {
        const v = form[step.key];
        if (step.optional) return true;
        return typeof v === "string" && v.trim().length > 0;
      }
      case "select": {
        const v = form[step.key];
        return typeof v === "string" && v.length > 0;
      }
      case "yesno":
        return form[step.key] === "yes" || form[step.key] === "no";
      case "calendly":
        return false; // No advance button — Calendly handles the handoff.
    }
  }

  function advance() {
    if (!canContinue()) return;
    saveDraft();
    if (stepIdx < STEPS.length - 1) {
      setStepIdx((i) => i + 1);
      setError(null);
    }
  }

  function goBack() {
    if (stepIdx > 0) {
      setStepIdx((i) => i - 1);
      setError(null);
    }
  }

  async function submit() {
    setError(null);
    const missing: string[] = [];
    if (!form.full_name.trim()) missing.push("full name");
    if (!form.email.trim()) missing.push("email");
    if (!form.phone.trim()) missing.push("phone");
    if (!form.gender) missing.push("gender");
    if (!form.college.trim()) missing.push("college");
    if (!form.graduation_year) missing.push("graduation year");
    if (!form.can_commit) missing.push("commitment");
    if (missing.length > 0) {
      setError(`Missing: ${missing.join(", ")}. Tap back to fill them in.`);
      submittedRef.current = false; // allow retry
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/careers/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: draftIdRef.current,
          listing_slug: SLUG,
          full_name: form.full_name,
          email: form.email,
          phone: form.phone,
          gender: form.gender,
          college: form.college,
          graduation_year: form.graduation_year,
          can_commit: form.can_commit,
          social_handle: form.social_handle,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong. Try again.");
      }
      // Keep the local draft id in storage until Calendly confirms the
      // booking (thanks page clears it). If the user bails here without
      // picking a slot, a return visit will update the same record.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      submittedRef.current = false; // allow retry on next render
    } finally {
      setSubmitting(false);
    }
  }

  // Calendly embed URL with name + email prefilled. Also pass the
  // internal applicant doc id as a UTM-style param so the Calendly
  // webhook can match the booking back to the right applicant.
  const calendlyEmbedUrl = (() => {
    const u = new URL(CALENDLY_URL);
    if (form.full_name.trim()) u.searchParams.set("name", form.full_name.trim());
    if (form.email.trim()) u.searchParams.set("email", form.email.trim().toLowerCase());
    if (draftIdRef.current) u.searchParams.set("utm_source", draftIdRef.current);
    // Hide default Calendly chrome — our page already has a header +
    // we don't want duplicate branding stacked on top.
    u.searchParams.set("hide_gdpr_banner", "1");
    u.searchParams.set("primary_color", "ffffff");
    u.searchParams.set("background_color", "0a0a0a");
    u.searchParams.set("text_color", "ffffff");
    return u.toString();
  })();

  const canGo = canContinue();

  return (
    <main className={styles.shell}>
      <div className={styles.shellInner}>
        {/* Header — wordmark centered like the mobile app's onboarding
            first-name/phone screens. */}
        <div className={styles.header}>
          <Link href="/careers" aria-label="KESHAH">
            <Image
              src="/images/keshah-logo-white.png"
              alt="KESHAH"
              width={130}
              height={30}
              className={styles.headerLogo}
              priority
            />
          </Link>
        </div>

        {/* Segmented progress rail — mirrors the founder story's
            Instagram-story-style chapter mark. One segment per step. */}
        <div className={styles.progressRail} aria-label={`Step ${stepIdx + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`${styles.progressSeg} ${
                i < stepIdx
                  ? styles.progressSegDone
                  : i === stepIdx
                  ? styles.progressSegActive
                  : ""
              }`}
            />
          ))}
        </div>

        {/* Back arrow (only after first step) */}
        <div style={{ minHeight: 24, display: "flex", alignItems: "center" }}>
          {stepIdx > 0 && step.kind !== "calendly" && (
            <button
              type="button"
              onClick={goBack}
              style={{
                background: "none",
                border: 0,
                color: "rgba(255,255,255,0.45)",
                fontSize: 13,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 0",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M7.5 2L3 6l4.5 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Back
            </button>
          )}
        </div>

        <div className={styles.spacerSmall} />

        {/*
          The whole step block is keyed on stepIdx so React unmounts +
          remounts on advance — that's what re-fires the CSS fade-in
          animations, matching the mobile app's per-step controllers.
        */}
        <div key={stepIdx} className={apply.stepBody}>
          <h1 className={`${styles.title} ${styles.fadeTitle}`}>{step.title}</h1>
          {step.subtitle && (
            <p className={`${styles.subtitle} ${styles.fadeTitle}`}>{step.subtitle}</p>
          )}

          <div className={styles.fadeOptions} style={{ display: "contents" }}>
            {step.kind === "text" && (
              <div className={apply.field}>
                <input
                  type={step.type ?? "text"}
                  autoComplete={step.autoComplete}
                  className={apply.input}
                  placeholder={step.placeholder}
                  value={String(form[step.key] ?? "")}
                  onChange={(e) => set(step.key, e.target.value as never)}
                  autoFocus
                  inputMode={step.type === "email" ? "email" : step.type === "tel" ? "tel" : undefined}
                />
              </div>
            )}

            {step.kind === "select" && (
              <div className={apply.options}>
                {step.options.map((opt) => {
                  const selected = form[step.key] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`${apply.option} ${selected ? apply.optionSelected : ""}`}
                      onClick={() => set(step.key, opt.value as never)}
                    >
                      <span>{opt.label}</span>
                      <svg className={apply.optionCheck} width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path
                          d="M4 10.5l4 4 8-9"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}

            {step.kind === "yesno" && (
              <div className={apply.yesNoStack}>
                <button
                  type="button"
                  className={apply.yesBtn}
                  onClick={() => {
                    // Set the answer AND advance directly — routing
                    // through advance()/canContinue() would read the
                    // stale form ref (state update is async), which is
                    // why the first tap wasn't registering. We know the
                    // value is valid here, so it's safe to jump.
                    set(step.key, "yes" as never);
                    saveDraft({ [step.key]: "yes" as never });
                    if (stepIdx < STEPS.length - 1) {
                      setStepIdx((i) => i + 1);
                      setError(null);
                    }
                  }}
                >
                  Yes, I can commit
                </button>
                <button
                  type="button"
                  className={apply.noBtn}
                  onClick={() => set(step.key, "no" as never)}
                >
                  <span>No, I can&apos;t</span>
                  {step.noSub && <span className={apply.noBtnSub}>{step.noSub}</span>}
                </button>
              </div>
            )}

            {step.kind === "calendly" && (
              <>
                <div
                  className="calendly-inline-widget"
                  data-url={calendlyEmbedUrl}
                  style={{
                    minWidth: 320,
                    width: "100%",
                    height: 720,
                    marginTop: 8,
                  }}
                />
                <Script
                  src="https://assets.calendly.com/assets/external/widget.js"
                  strategy="afterInteractive"
                />
                {submitting && (
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 8 }}>
                    Saving your application…
                  </div>
                )}
              </>
            )}

            {error && <div className={apply.error}>{error}</div>}
          </div>
        </div>

        <div className={styles.spacerLarge} />

        {/* Bottom sticky CTA. Hidden on yesno (auto-advances) and on
            calendly (handoff to Calendly's own flow). */}
        {step.kind !== "yesno" && step.kind !== "calendly" && (
          <div className={`${styles.bottom} ${styles.fadeButton}`}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={advance}
              disabled={!canGo || submitting}
              aria-disabled={!canGo || submitting}
            >
              {step.kind === "text" && step.optional
                ? form[step.key]
                  ? "Continue"
                  : "Skip"
                : "Continue"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
