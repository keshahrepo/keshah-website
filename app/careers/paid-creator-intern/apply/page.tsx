"use client";

// Paid Creator Intern application form. All form UI + video-upload
// mechanics live in this one file to keep the flow legible — one page,
// one submit, no cross-file state. Style matches the mobile app 1:1
// (Poppins, kBlack bg, tight -1.2 tracking on titles, white pill CTA).
//
// Video upload = two-step:
//   1. POST /api/careers/upload-url → signed PUT URL for GCS
//   2. XHR PUT direct to that URL (so we can track progress)
//   3. On success, POST /api/careers/apply with the object path
// The video body never touches our Vercel functions.

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getListing } from "../../listings";
import styles from "../../careers.module.css";
import applyStyles from "./apply.module.css";

const SLUG = "paid-creator-intern";
const DRAFT_STORAGE_KEY = "keshah_careers_draft_id_v1";

// Local (browser-only) UUID-ish generator — good enough as a doc id
// key. Avoids a runtime dep for uuid, and Firestore doesn't care if
// the id isn't RFC 4122 exact.
function newDraftId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  return `d_${t}_${r}`;
}

// The test video script. Keep short (30-45 seconds when read aloud) —
// the whole point of the test is delivery, not lore. Edit here to
// change it — the [Copy script] button copies whatever's in this const.
// TODO(aadi): swap in the real script if this placeholder needs tuning.
const TEST_VIDEO_SCRIPT =
  `If you're losing your hair, this might be the reason nothing you've tried has worked.\n\nPinch the top of your scalp. If you can't pull the skin up much, it's tight — and tight scalp means the blood can't reach your hair follicles.\n\nOnce your scalp loosens up, your hair has a real shot at growing back. That's what KESHAH does — no drugs, just 20 minutes a day of scalp exercises. Try it free.`;

const REFERENCE_VIDEO_BY_GENDER: Record<"male" | "female", string> = {
  male: "/careers/reference-men.mp4",
  female: "/careers/reference-women.mp4",
};

const GRAD_YEARS = ["2026", "2027", "2028", "2029"] as const;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB hard cap; server enforces same
const ACCEPTED_TYPES = new Set(["video/mp4", "video/quicktime"]);

type FormState = {
  full_name: string;
  email: string;
  phone: string;
  gender: "" | "male" | "female";
  college: string;
  graduation_year: string;
  can_commit: "" | "yes" | "no";
  social_handle: string;
  consent: boolean;
};

const EMPTY_FORM: FormState = {
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

export default function ApplyPage() {
  const listing = getListing(SLUG);
  const router = useRouter();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoObjectPath, setVideoObjectPath] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Draft id lives in localStorage so a page reload picks up the same
  // pending Firestore doc instead of creating a new one every visit.
  // On successful submit we clear it, so the next open starts fresh.
  const draftIdRef = useRef<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    let id = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!id) {
      id = newDraftId();
      window.localStorage.setItem(DRAFT_STORAGE_KEY, id);
    }
    draftIdRef.current = id;
  }, []);

  // Fire-and-forget draft save. Called on every field blur (and after
  // a successful video upload). Failure is silent — we don't want a
  // transient network blip to nag the applicant mid-form.
  async function saveDraft(overrides?: Partial<FormState> & { video_object_path?: string | null; video_original_name?: string | null; video_size_bytes?: number | null }) {
    const id = draftIdRef.current;
    if (!id) return;
    const merged = { ...form, ...(overrides ?? {}) };
    const payload = {
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
      video_object_path:
        overrides?.video_object_path !== undefined
          ? overrides.video_object_path
          : videoObjectPath,
      video_original_name:
        overrides?.video_original_name !== undefined
          ? overrides.video_original_name
          : videoFile?.name ?? null,
      video_size_bytes:
        overrides?.video_size_bytes !== undefined
          ? overrides.video_size_bytes
          : videoFile?.size ?? null,
    };
    try {
      await fetch("/api/careers/apply-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch {
      /* silent — draft save is best-effort */
    }
  }

  const referenceVideoUrl = useMemo(
    () =>
      form.gender === "male" || form.gender === "female"
        ? REFERENCE_VIDEO_BY_GENDER[form.gender]
        : null,
    [form.gender]
  );

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function pickVideo() {
    fileInputRef.current?.click();
  }

  async function onVideoChosen(file: File | null) {
    setError(null);
    setUploadProgress(0);
    setVideoObjectPath(null);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null);
    setVideoFile(null);
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
    setUploadProgress(0);
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

      // XHR (not fetch) because we need upload progress events.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress(100);
            resolve();
          } else {
            reject(new Error(`Upload failed (${xhr.status}).`));
          }
        };
        xhr.onerror = () =>
          reject(
            new Error(
              "Your upload didn't go through. Please check your connection and try again."
            )
          );
        xhr.send(file);
      });

      setVideoObjectPath(objectPath);
      // Persist the video path onto the draft immediately so partial
      // fills that got as far as uploading show up with the video
      // link in the admin Recruit tab even if they never submit.
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

  function replaceVideo() {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null);
    setVideoFile(null);
    setVideoObjectPath(null);
    setUploadProgress(0);
    setError(null);
    pickVideo();
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(TEST_VIDEO_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — silent, user can still select+copy manually */
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Match the spec's exact wording so error copy is consistent.
    if (
      !form.full_name.trim() ||
      !form.email.trim() ||
      !form.phone.trim() ||
      !form.gender ||
      !form.college.trim() ||
      !form.graduation_year ||
      !form.can_commit
    ) {
      setError("Please fill in this field.");
      return;
    }
    if (!videoObjectPath) {
      setError("Please upload your test video to submit.");
      return;
    }
    if (!form.consent) {
      setError("Please tick the consent box to submit.");
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
      // Clear the draft id — a fresh open should start a new
      // application, not resume the completed one.
      try {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        /* localStorage disabled — no-op */
      }
      const firstName = form.full_name.trim().split(/\s+/)[0] ?? "there";
      router.push(
        `/careers/paid-creator-intern/apply/thanks?name=${encodeURIComponent(firstName)}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!listing) return null;

  return (
    <main className={styles.detailPage}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo}>
          <Image
            src="/images/keshah-logo-white.png"
            alt="KESHAH"
            width={100}
            height={26}
            priority
          />
        </Link>
        <div className={styles.navRight}>
          <Link href="/careers">All roles</Link>
        </div>
      </nav>

      <Link href={`/careers/${SLUG}`} className={styles.back}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M7.5 2L3 6l4.5 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to role
      </Link>

      <header className={styles.detailHead}>
        <div className={applyStyles.applyKicker}>Application</div>
        <h1 className={styles.detailTitle}>Apply: {listing.title}</h1>
        <p className={applyStyles.applyLede}>
          Takes about 10 minutes. Your test video is your application; there
          are no interviews.
        </p>
      </header>

      <form className={applyStyles.form} onSubmit={onSubmit} noValidate>
        {/* ── About you ─────────────────────────────────────────── */}
        <section className={applyStyles.section}>
          <h2 className={applyStyles.sectionTitle}>About you</h2>

          <Field label="Full name" required>
            <input
              type="text"
              className={applyStyles.input}
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              onBlur={() => saveDraft()}
              autoComplete="name"
              required
            />
          </Field>

          <div className={applyStyles.row2}>
            <Field label="Email" required>
              <input
                type="email"
                className={applyStyles.input}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                onBlur={() => saveDraft()}
                autoComplete="email"
                inputMode="email"
                required
              />
            </Field>
            <Field label="Phone number" required>
              <input
                type="tel"
                className={applyStyles.input}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                onBlur={() => saveDraft()}
                autoComplete="tel"
                inputMode="tel"
                required
              />
            </Field>
          </div>

          <Field label="Gender" required>
            <div className={applyStyles.pillGroup}>
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`${applyStyles.pill} ${form.gender === g ? applyStyles.pillActive : ""}`}
                  onClick={() => {
                    set("gender", g);
                    saveDraft({ gender: g });
                  }}
                >
                  {g === "male" ? "Male" : "Female"}
                </button>
              ))}
            </div>
          </Field>

          <Field label="College or university" required>
            <input
              type="text"
              className={applyStyles.input}
              value={form.college}
              onChange={(e) => set("college", e.target.value)}
              onBlur={() => saveDraft()}
              autoComplete="organization"
              required
            />
          </Field>

          <div className={applyStyles.row2}>
            <Field label="Graduation year" required>
              <select
                className={applyStyles.select}
                value={form.graduation_year}
                onChange={(e) => {
                  set("graduation_year", e.target.value);
                  saveDraft({ graduation_year: e.target.value });
                }}
                required
              >
                <option value="" disabled>
                  Select year
                </option>
                {GRAD_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Can you commit ~1 hr/day, Mon–Fri?" required>
              <div className={applyStyles.pillGroup}>
                {(["yes", "no"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`${applyStyles.pill} ${form.can_commit === v ? applyStyles.pillActive : ""}`}
                    onClick={() => {
                      set("can_commit", v);
                      saveDraft({ can_commit: v });
                    }}
                  >
                    {v === "yes" ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="TikTok or Instagram handle (optional)">
            <input
              type="text"
              className={applyStyles.input}
              value={form.social_handle}
              onChange={(e) => set("social_handle", e.target.value)}
              onBlur={() => saveDraft()}
              placeholder="@yourhandle"
            />
          </Field>
        </section>

        {/* ── Your test video ────────────────────────────────────── */}
        <section className={applyStyles.section}>
          <h2 className={applyStyles.sectionTitle}>Your test video</h2>
          <p className={applyStyles.sectionLede}>
            Film one short video using the script below. No editing needed.
          </p>

          {referenceVideoUrl ? (
            <div className={applyStyles.refVideoBlock}>
              <div className={applyStyles.refVideoLabel}>Reference video</div>
              <video
                src={referenceVideoUrl}
                controls
                playsInline
                className={applyStyles.refVideo}
              />
              <p className={applyStyles.refVideoNote}>
                Watch this first. It&apos;s the style we&apos;re looking for.
              </p>
            </div>
          ) : (
            <div className={applyStyles.refVideoBlock}>
              <div className={applyStyles.refVideoNote}>
                Select your gender above to see the reference video that
                matches the style we&apos;re looking for.
              </div>
            </div>
          )}

          <div className={applyStyles.scriptBlock}>
            <div className={applyStyles.scriptHead}>
              <div className={applyStyles.scriptLabel}>Your script</div>
              <div className={applyStyles.scriptActions}>
                <button
                  type="button"
                  className={applyStyles.linkBtn}
                  onClick={() => setScriptOpen((s) => !s)}
                  aria-expanded={scriptOpen}
                >
                  {scriptOpen ? "Hide" : "Show"}
                </button>
                <button
                  type="button"
                  className={applyStyles.linkBtn}
                  onClick={copyScript}
                >
                  {copied ? "Copied ✓" : "Copy script"}
                </button>
              </div>
            </div>
            {scriptOpen && (
              <div className={applyStyles.scriptBody}>{TEST_VIDEO_SCRIPT}</div>
            )}
          </div>

          <div className={applyStyles.tips}>
            <div className={applyStyles.tipsLabel}>Tips</div>
            <ul>
              <li>Film vertically</li>
              <li>Face a window or good light</li>
              <li>Look at the lens, not the screen</li>
              <li>One take is fine; don&apos;t worry about being perfect</li>
            </ul>
          </div>

          <div className={applyStyles.uploadBlock}>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,.mp4,.mov"
              className={applyStyles.hiddenFile}
              onChange={(e) => onVideoChosen(e.target.files?.[0] ?? null)}
            />

            {!videoFile ? (
              <button
                type="button"
                className={applyStyles.uploadBtn}
                onClick={pickVideo}
              >
                Record or upload your video
              </button>
            ) : (
              <div className={applyStyles.uploadedBox}>
                {videoPreviewUrl && (
                  <video
                    src={videoPreviewUrl}
                    controls
                    playsInline
                    className={applyStyles.uploadedPreview}
                  />
                )}
                <div className={applyStyles.uploadStatusRow}>
                  <div className={applyStyles.uploadFilename}>
                    {videoFile.name}
                  </div>
                  {uploading ? (
                    <div className={applyStyles.uploadPct}>
                      Uploading {uploadProgress}%
                    </div>
                  ) : videoObjectPath ? (
                    <div className={applyStyles.uploadOk}>Uploaded ✓</div>
                  ) : (
                    <div className={applyStyles.uploadPct}>Failed</div>
                  )}
                </div>
                {uploading && (
                  <div className={applyStyles.progressTrack}>
                    <div
                      className={applyStyles.progressFill}
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className={applyStyles.linkBtn}
                  onClick={replaceVideo}
                  disabled={uploading}
                >
                  Replace video
                </button>
              </div>
            )}

            <div className={applyStyles.uploadHint}>
              MP4 or MOV, up to 60 seconds
            </div>
          </div>
        </section>

        {/* ── Consent ────────────────────────────────────────────── */}
        <label className={applyStyles.consent}>
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => set("consent", e.target.checked)}
            required
          />
          <span>
            I understand my test video is used only to review my application
            and won&apos;t be posted publicly. <em>*</em>
          </span>
        </label>

        {error && <div className={applyStyles.error}>{error}</div>}

        <div className={applyStyles.submitRow}>
          <button
            type="submit"
            className={styles.applyBtn}
            disabled={submitting || uploading}
          >
            {submitting ? "Submitting…" : "Submit application"}
          </button>
        </div>
      </form>
    </main>
  );
}

// Small inline field wrapper so the form JSX above stays readable —
// label + red asterisk when required + slot for the input.
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={applyStyles.field}>
      <span className={applyStyles.fieldLabel}>
        {label}
        {required && <em className={applyStyles.req}> *</em>}
      </span>
      {children}
    </label>
  );
}
