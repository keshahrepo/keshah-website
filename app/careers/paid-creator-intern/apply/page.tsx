"use client";

// Paid Creator Intern application — multi-step quiz that recreates the
// KESHAH mobile onboarding flow 1:1. One question per screen. Instant
// step swap (no slide animation between steps). Each step has its own
// staggered fade-in matching post_auth_flow_2 (title 0.0-0.4, options
// 0.2-0.7, button 0.5-1.0, all 700ms easeOut, kicked off at mount).
//
// State machine: single form object + stepIndex. Step configs live in
// the STEPS array; render is a switch on step.kind. All chrome (logo
// header, spacers, bottom sticky button) comes from careers.module.css.

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../careers.module.css";
import apply from "./apply.module.css";

const SLUG = "paid-creator-intern";
const DRAFT_STORAGE_KEY = "keshah_careers_draft_id_v1";
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["video/mp4", "video/quicktime"]);

const REFERENCE_VIDEO_BY_GENDER: Record<"male" | "female", string> = {
  male: "/careers/reference-men.mp4",
  female: "/careers/reference-women.mp4",
};

// Test-video script. Edit here to change what applicants read on-screen
// + copy to clipboard. Keep to ~30-45s spoken.
// TODO(aadi): finalize this script.
const TEST_VIDEO_SCRIPT =
  `If you're losing your hair, this might be the reason nothing you've tried has worked.\n\nPinch the top of your scalp. If you can't pull the skin up much, it's tight — and tight scalp means the blood can't reach your hair follicles.\n\nOnce your scalp loosens up, your hair has a real shot at growing back. That's what KESHAH does — no drugs, just 20 minutes a day of scalp exercises. Try it free.`;

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
  consent: boolean;
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
  consent: false,
};

// ── Steps ────────────────────────────────────────────────────────
// Each step is one screen. Order = order shown. Add/remove entries to
// re-shape the flow — nothing else needs to change.
type Step =
  | { kind: "text"; key: keyof Form; title: string; subtitle?: string; placeholder?: string; type?: "text" | "email" | "tel"; autoComplete?: string; optional?: boolean }
  | { kind: "select"; key: keyof Form; title: string; subtitle?: string; options: { value: string; label: string }[] }
  | { kind: "yesno"; key: keyof Form; title: string; subtitle?: string; noSub?: string }
  | { kind: "reference"; title: string; subtitle?: string }
  | { kind: "script"; title: string; subtitle?: string }
  | { kind: "upload"; title: string; subtitle?: string }
  | { kind: "consent"; title: string; subtitle?: string };

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
  { kind: "reference", title: "Watch this first.", subtitle: "This is the style we're looking for." },
  { kind: "script", title: "Here's your script.", subtitle: "Film one short video reading this. No editing needed." },
  { kind: "upload", title: "Upload your test video.", subtitle: "MP4 or MOV, up to 60 seconds." },
  { kind: "consent", title: "One last thing.", subtitle: "Confirm you understand what happens with your video." },
];

export default function ApplyQuiz() {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const draftIdRef = useRef<string>("");
  const step = STEPS[stepIdx];

  // Video upload state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoObjectPath, setVideoObjectPath] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clipboard-copy feedback
  const [copied, setCopied] = useState(false);

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
  async function saveDraft(overrides?: Partial<Form> & { video_object_path?: string | null; video_original_name?: string | null; video_size_bytes?: number | null }) {
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
          consent: merged.consent,
          video_object_path: overrides?.video_object_path ?? videoObjectPath,
          video_original_name: overrides?.video_original_name ?? videoFile?.name ?? null,
          video_size_bytes: overrides?.video_size_bytes ?? videoFile?.size ?? null,
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
  }, [step, form, videoObjectPath]);

  function canContinue(): boolean {
    setError(null);
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
      case "reference":
      case "script":
        return true;
      case "upload":
        return !!videoObjectPath && !uploading;
      case "consent":
        return form.consent === true;
    }
  }

  function advance() {
    if (!canContinue()) return;
    saveDraft();
    if (stepIdx < STEPS.length - 1) {
      setStepIdx((i) => i + 1);
      setError(null);
    } else {
      submit();
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
    // Validate everything at once — safety net in case a user
    // hand-tampered the step machine (e.g. keyboard skip).
    const missing: string[] = [];
    if (!form.full_name.trim()) missing.push("full name");
    if (!form.email.trim()) missing.push("email");
    if (!form.phone.trim()) missing.push("phone");
    if (!form.gender) missing.push("gender");
    if (!form.college.trim()) missing.push("college");
    if (!form.graduation_year) missing.push("graduation year");
    if (!form.can_commit) missing.push("commitment");
    if (!videoObjectPath) missing.push("test video");
    if (!form.consent) missing.push("consent");
    if (missing.length > 0) {
      setError(`Missing: ${missing.join(", ")}. Tap back to fill them in.`);
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
          video_object_path: videoObjectPath,
          video_original_name: videoFile?.name ?? null,
          video_size_bytes: videoFile?.size ?? null,
          consent: form.consent,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong. Try again.");
      }
      try {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {}
      const firstName = form.full_name.trim().split(/\s+/)[0] ?? "there";
      router.push(`/careers/paid-creator-intern/apply/thanks?name=${encodeURIComponent(firstName)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Video upload flow (only on upload step) ─────────────────────────
  function pickVideo() {
    fileInputRef.current?.click();
  }

  async function onVideoChosen(file: File | null) {
    setError(null);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null);
    setVideoObjectPath(null);
    setUploadPct(0);
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Please upload an MP4 or MOV file.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError("That video's too big — 200MB max.");
      return;
    }
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    await uploadVideo(file);
  }

  async function uploadVideo(file: File) {
    setUploading(true);
    setUploadPct(0);
    try {
      const res = await fetch("/api/careers/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't prepare upload.");
      }
      const { uploadUrl, objectPath } = (await res.json()) as {
        uploadUrl: string;
        objectPath: string;
      };
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadPct(100);
            resolve();
          } else reject(new Error(`Upload failed (${xhr.status}).`));
        };
        xhr.onerror = () =>
          reject(new Error("Your upload didn't go through. Please check your connection and try again."));
        xhr.send(file);
      });
      setVideoObjectPath(objectPath);
      saveDraft({
        video_object_path: objectPath,
        video_original_name: file.name,
        video_size_bytes: file.size,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setVideoFile(null);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  }

  const refVideoUrl = useMemo(
    () =>
      form.gender === "male" || form.gender === "female"
        ? REFERENCE_VIDEO_BY_GENDER[form.gender]
        : null,
    [form.gender]
  );

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(TEST_VIDEO_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  const isFinal = stepIdx === STEPS.length - 1;
  const canGo = canContinue();

  return (
    <main className={styles.shell}>
      <div className={styles.shellInner}>
        {/* Header — wordmark + subtle progress "X of Y" like a chapter mark */}
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

        {/* Back arrow (only after first step) */}
        <div style={{ minHeight: 24, display: "flex", alignItems: "center" }}>
          {stepIdx > 0 && (
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
                    set(step.key, "yes" as never);
                    // Auto-advance on Yes — quick confirmation feels
                    // more like the mobile Commitment page than a
                    // second tap to Continue.
                    setTimeout(() => advance(), 120);
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

            {step.kind === "reference" && (
              <div className={apply.videoWrap}>
                {refVideoUrl ? (
                  <video src={refVideoUrl} controls playsInline className={apply.refVideo} />
                ) : (
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
                    (Reference video will appear here after you pick your gender.)
                  </div>
                )}
              </div>
            )}

            {step.kind === "script" && (
              <>
                <div className={apply.scriptCard}>
                  <p className={apply.scriptText}>{TEST_VIDEO_SCRIPT}</p>
                  <div className={apply.scriptCopyRow}>
                    <button type="button" className={apply.scriptCopyBtn} onClick={copyScript}>
                      {copied ? "Copied ✓" : "Copy script"}
                    </button>
                  </div>
                </div>
                <ul className={apply.tipsList}>
                  <li>Film vertically</li>
                  <li>Face a window or good light</li>
                  <li>Look at the lens, not the screen</li>
                  <li>One take is fine — don&apos;t worry about being perfect</li>
                </ul>
              </>
            )}

            {step.kind === "upload" && (
              <div className={apply.uploadArea}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,.mp4,.mov"
                  onChange={(e) => onVideoChosen(e.target.files?.[0] ?? null)}
                  style={{ display: "none" }}
                />

                {!videoFile ? (
                  <button type="button" className={apply.uploadBtn} onClick={pickVideo}>
                    Record or upload your video
                  </button>
                ) : (
                  <div className={apply.uploadedBox}>
                    {videoPreviewUrl && (
                      <video src={videoPreviewUrl} controls playsInline className={apply.uploadedPreview} />
                    )}
                    <div className={apply.uploadedRow}>
                      <div className={apply.uploadedName}>{videoFile.name}</div>
                      {uploading ? (
                        <div className={apply.uploadedStatus}>Uploading {uploadPct}%</div>
                      ) : videoObjectPath ? (
                        <div className={apply.uploadedStatusOk}>Uploaded ✓</div>
                      ) : (
                        <div className={apply.uploadedStatus}>Failed</div>
                      )}
                    </div>
                    {uploading && (
                      <div className={apply.progressTrack}>
                        <div className={apply.progressFill} style={{ width: `${uploadPct}%` }} />
                      </div>
                    )}
                    <button type="button" className={apply.replaceLink} onClick={pickVideo} disabled={uploading}>
                      Replace video
                    </button>
                  </div>
                )}
                <div className={apply.uploadHint}>MP4 or MOV, up to 60 seconds</div>
              </div>
            )}

            {step.kind === "consent" && (
              <button
                type="button"
                className={`${apply.consentBox} ${form.consent ? apply.consentBoxChecked : ""}`}
                onClick={() => set("consent", !form.consent)}
                style={{ background: "transparent", cursor: "pointer" }}
              >
                <span className={apply.consentCheck}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M3 7.5l3 3 5-6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className={apply.consentLabel}>
                  I understand my test video is used only to review my
                  application and won&apos;t be posted publicly.
                </span>
              </button>
            )}

            {error && <div className={apply.error}>{error}</div>}
          </div>
        </div>

        <div className={styles.spacerLarge} />

        {/* Bottom sticky CTA. Hidden on yesno step because Yes auto-advances
            and No is a hard-stop. */}
        {step.kind !== "yesno" && (
          <div className={`${styles.bottom} ${styles.fadeButton}`}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={advance}
              disabled={!canGo || submitting}
              aria-disabled={!canGo || submitting}
            >
              {submitting
                ? "Submitting…"
                : isFinal
                ? "Submit application"
                : step.kind === "text" && step.optional
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
