"use client";

// Interview video test flow. Same chrome as the careers apply quiz
// (careers.module.css + apply.module.css), one screen per step:
//   email -> (details) -> watch -> script -> record -> consent -> done
//
// Progress is saved to localStorage per session so a phone user who
// flips back to the call (iOS sometimes reloads the tab) lands where they
// left off. The recorded file itself can't survive a reload, but once
// it's uploaded the object path is saved and they skip straight to
// consent.

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../../careers/careers.module.css";
import apply from "../../careers/paid-creator-intern/apply/apply.module.css";
import ui from "./interview.module.css";

// ── Edit the script here ────────────────────────────────────────────
// `direction` is what to do on camera (shown muted, in brackets);
// `line` is what to say out loud.
const SCRIPT: { direction: string; line: string }[] = [
  {
    direction: "Look at the camera",
    line: "If you're losing your hair, here's something most people never check.",
  },
  {
    direction:
      "Raise one hand to the top of your head and pinch the skin with your thumb and fingers",
    line: "Pinch the top of your scalp.",
  },
  {
    direction: "Keep pinching and try to lift the skin",
    line: "If the skin barely moves, it's tight.",
  },
  {
    direction: "Let go and point to the top of your head",
    line: "A tight scalp squeezes the blood vessels, so less blood reaches your hair.",
  },
  {
    direction: "Hand down, back to the camera",
    line: "That's what KESHAH works on. Daily scalp exercises that loosen it up, no drugs.",
  },
  {
    direction: "Smile, point down",
    line: "I'll show you how in my next video.",
  },
];

const REFERENCE_VIDEO_BY_GENDER: Record<Gender, string> = {
  male: "/careers/reference-men.mp4",
  female: "/careers/reference-women.mp4",
};

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_SECONDS = 60;
// Phones round and add a beat at the start/end, so allow a little slack.
const HARD_MAX_SECONDS = 75;
const UPLOAD_ATTEMPTS = 4;

type Gender = "male" | "female";
type Phase =
  | "loading"
  | "closed"
  | "email"
  | "details"
  | "already"
  | "watch"
  | "script"
  | "record"
  | "consent"
  | "done";

const RAIL: Phase[] = ["email", "watch", "script", "record", "consent"];

type Saved = {
  email: string;
  gender: Gender | null;
  firstName: string;
  phase: Phase;
  videoObjectPath: string | null;
  videoName: string | null;
  videoSize: number | null;
};

function storageKey(slug: string) {
  return `keshah_interview_${slug}`;
}
function loadSaved(slug: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function writeSaved(slug: string, s: Saved) {
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(s));
  } catch {}
}

// iOS gives video/quicktime, Android usually video/mp4. Some Android
// cameras return webm/3gpp, and a few return an empty type.
function contentTypeFor(file: File): string | null {
  const t = (file.type || "").toLowerCase();
  if (/^video\/(mp4|quicktime|webm|3gpp|x-m4v)$/.test(t)) return t;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!t || t === "application/octet-stream") {
    if (ext === "mov") return "video/quicktime";
    if (ext === "webm") return "video/webm";
    if (ext === "3gp") return "video/3gpp";
    if (ext === "m4v") return "video/x-m4v";
    return "video/mp4";
  }
  return null;
}

// Resolves to the clip length in seconds, or null if the browser can't
// read it (we don't block on that).
function readDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (d: number | null) => {
      v.removeAttribute("src");
      v.load();
      resolve(d);
    };
    const timer = window.setTimeout(() => done(null), 5000);
    v.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    v.src = url;
  });
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export default function InterviewFlow({
  slug,
  initialEmail,
}: {
  slug: string;
  initialEmail: string;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  // The real session slug ("live" resolves to e.g. "oct-7").
  const [sessionSlug, setSessionSlug] = useState<string>("");
  const [email, setEmail] = useState(initialEmail);
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [needName, setNeedName] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Video
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoObjectPath, setVideoObjectPath] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  // ── Boot: resolve the session, restore saved progress ──────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/interview/session?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as {
          open?: boolean;
          session?: { slug: string };
        };
        if (cancelled) return;
        if (!body.open || !body.session) {
          setPhase("closed");
          return;
        }
        const real = body.session.slug;
        setSessionSlug(real);
        const saved = loadSaved(real);
        const sameEmail =
          !initialEmail || (saved && saved.email.toLowerCase() === initialEmail.toLowerCase());
        if (saved && sameEmail && saved.gender && saved.phase !== "email") {
          setEmail(saved.email);
          setGender(saved.gender);
          setFirstName(saved.firstName);
          setVideoObjectPath(saved.videoObjectPath);
          setVideoName(saved.videoName);
          setVideoSize(saved.videoSize);
          // A recorded-but-not-uploaded file doesn't survive a reload.
          let p = saved.phase;
          if (p === "consent" && !saved.videoObjectPath) p = "record";
          if (p === "record" && saved.videoObjectPath) p = "consent";
          setPhase(p);
        } else {
          setPhase("email");
        }
      } catch {
        if (!cancelled) {
          setError("We couldn't load this page. Check your connection and refresh.");
          setPhase("email");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, initialEmail]);

  // Persist progress whenever it changes.
  useEffect(() => {
    if (!sessionSlug || phase === "loading" || phase === "closed") return;
    writeSaved(sessionSlug, {
      email,
      gender,
      firstName,
      phase,
      videoObjectPath,
      videoName,
      videoSize,
    });
  }, [sessionSlug, email, gender, firstName, phase, videoObjectPath, videoName, videoSize]);

  // Scroll to top on every step change (long script screen on phones).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

  // Free the preview blob when it changes / on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function go(p: Phase) {
    setError(null);
    setPhase(p);
  }

  // ── Email / details ────────────────────────────────────────────────
  async function submitEmail(withDetails: boolean) {
    setError(null);
    const e = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setError("That email doesn't look right.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/interview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: sessionSlug,
          email: e,
          ...(withDetails ? { full_name: fullName.trim(), gender } : {}),
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        closed?: boolean;
        needs_details?: boolean;
        need_name?: boolean;
        gender?: Gender;
        first_name?: string;
        already_submitted?: boolean;
        error?: string;
      };
      if (body.closed) return go("closed");
      if (!res.ok) throw new Error(body.error || "Something went wrong. Try again.");
      if (body.needs_details) {
        setNeedName(body.need_name !== false);
        return go("details");
      }
      if (body.ok && body.gender) {
        setGender(body.gender);
        setFirstName(body.first_name ?? "");
        return go(body.already_submitted ? "already" : "watch");
      }
      throw new Error("Something went wrong. Try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // ── Record / upload ────────────────────────────────────────────────
  function openCamera() {
    setError(null);
    cameraInputRef.current?.click();
  }
  function openLibrary() {
    setError(null);
    libraryInputRef.current?.click();
  }

  async function onPicked(f: File | null) {
    // Reset the input so picking the same file again still fires change.
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";
    if (!f) return;
    setError(null);
    if (!contentTypeFor(f)) {
      setError("That file type won't work. Please film an MP4 or MOV video.");
      return;
    }
    if (f.size > MAX_VIDEO_BYTES) {
      setError("That video is too big. Keep it under 60 seconds and try again.");
      return;
    }
    const url = URL.createObjectURL(f);
    const secs = await readDuration(url);
    if (secs !== null && secs > HARD_MAX_SECONDS) {
      URL.revokeObjectURL(url);
      setError(
        `That one is ${Math.round(secs)} seconds. Keep it under ${MAX_SECONDS} seconds and try again.`,
      );
      return;
    }
    setFile(f);
    setPreviewUrl(url);
    setVideoObjectPath(null);
    setUploadPct(0);
    setUploadNote(null);
  }

  const putOnce = useCallback(
    async (f: File, contentType: string): Promise<string> => {
      const res = await fetch("/api/careers/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: `interview_${sessionSlug}_${f.name || "video.mp4"}`,
          contentType,
          sizeBytes: f.size,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const err = new Error(body.error || "Couldn't get the upload ready.");
        // 400 = the file itself was rejected, no point retrying.
        (err as Error & { fatal?: boolean }).fatal = res.status === 400;
        throw err;
      }
      const { uploadUrl, objectPath } = (await res.json()) as {
        uploadUrl: string;
        objectPath: string;
      };
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed (${xhr.status}).`));
        xhr.onerror = () => reject(new Error("The connection dropped."));
        xhr.onabort = () => reject(new Error("The upload was interrupted."));
        xhr.send(f);
      });
      return objectPath;
    },
    [sessionSlug],
  );

  async function useThisVideo() {
    if (!file) return;
    const contentType = contentTypeFor(file);
    if (!contentType) return;
    setError(null);
    setUploading(true);
    setUploadPct(0);
    setUploadNote(null);
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
      try {
        if (attempt > 1) {
          setUploadNote(`Connection hiccup. Trying again (${attempt} of ${UPLOAD_ATTEMPTS})...`);
          setUploadPct(0);
        }
        const objectPath = await putOnce(file, contentType);
        setVideoObjectPath(objectPath);
        setVideoName(file.name || null);
        setVideoSize(file.size);
        setUploadPct(100);
        setUploadNote(null);
        setUploading(false);
        go("consent");
        return;
      } catch (e) {
        lastErr = e;
        if ((e as { fatal?: boolean }).fatal) break;
        if (attempt < UPLOAD_ATTEMPTS) await sleep(1500 * attempt);
      }
    }
    setUploading(false);
    setUploadNote(null);
    setError(
      `${lastErr instanceof Error ? lastErr.message : "The upload didn't go through."} ` +
        `Check your connection and tap "Use this video" to try again.`,
    );
  }

  // ── Submit ─────────────────────────────────────────────────────────
  async function submitVideo() {
    if (!videoObjectPath || !consent) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: sessionSlug,
          email: email.trim(),
          video_object_path: videoObjectPath,
          video_original_name: videoName,
          video_size_bytes: videoSize,
          consent: true,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        closed?: boolean;
        error?: string;
      };
      if (body.closed) return go("closed");
      if (!res.ok || !body.ok) throw new Error(body.error || "Something went wrong. Try again.");
      go("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function backFrom(p: Phase): Phase | null {
    switch (p) {
      case "details":
        return "email";
      case "watch":
        return "email";
      case "script":
        return "watch";
      case "record":
        return "script";
      case "consent":
        return "record";
      default:
        return null;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  const back = uploading || busy ? null : backFrom(phase);
  const railIdx = RAIL.indexOf(phase === "details" ? "email" : phase);
  const showRail = railIdx >= 0;
  const callNote = (
    <div className={ui.note}>
      <strong>On the call from your phone?</strong> Keep the call running.
      It&apos;s fine if your video freezes. Come back when you&apos;ve submitted.
    </div>
  );

  let title = "";
  let subtitle: string | null = null;
  let body: React.ReactNode = null;
  let cta: React.ReactNode = null;

  switch (phase) {
    case "loading":
      body = <div className={ui.spinner} aria-label="Loading" />;
      break;

    case "closed":
      title = "This link is closed.";
      subtitle =
        "The video test isn't open right now. If you think that's a mistake, email us at contact@keshah.com.";
      break;

    case "email":
      title = "Let's film your test video.";
      subtitle = "First, enter the email you applied with.";
      body = (
        <>
          <div className={apply.field}>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={apply.input}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitEmail(false);
              }}
            />
          </div>
          {callNote}
        </>
      );
      cta = (
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => submitEmail(false)}
          disabled={busy || !email.trim()}
        >
          {busy ? "Checking..." : "Continue"}
        </button>
      );
      break;

    case "details":
      title = needName ? "We couldn't find that email." : "One quick thing.";
      subtitle = needName
        ? "No problem. Tell us your name and we'll get you set up."
        : "Which example video should we show you?";
      body = (
        <>
          {needName && (
            <div className={apply.field}>
              <input
                type="text"
                autoComplete="name"
                className={apply.input}
                placeholder="First and last name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}
          <div className={apply.options}>
            {(
              [
                ["male", "Male"],
                ["female", "Female"],
              ] as [Gender, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                className={`${apply.option} ${gender === v ? apply.optionSelected : ""}`}
                onClick={() => setGender(v)}
              >
                <span>{label}</span>
                <svg className={apply.optionCheck} width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
          {needName && (
            <button type="button" className={ui.linkBtn} onClick={() => go("email")}>
              Try a different email
            </button>
          )}
        </>
      );
      cta = (
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => submitEmail(true)}
          disabled={busy || !gender || (needName && fullName.trim().length < 2)}
        >
          {busy ? "Saving..." : "Continue"}
        </button>
      );
      break;

    case "already":
      title = "You already sent your video.";
      subtitle = "Thanks, we've got it. If you want to film a better one, you can send a new one.";
      cta = (
        <div className={ui.btnStack}>
          <button type="button" className={styles.primaryBtn} onClick={() => go("done")}>
            I&apos;m done
          </button>
          <button type="button" className={ui.secondaryBtn} onClick={() => go("watch")}>
            Send a new one
          </button>
        </div>
      );
      break;

    case "watch":
      title = firstName ? `Hi ${firstName}. Watch this first.` : "Watch this first.";
      subtitle = "This is the style we're looking for. Turn your sound on.";
      body = (
        <div className={apply.videoWrap}>
          {gender && (
            <video
              src={REFERENCE_VIDEO_BY_GENDER[gender]}
              controls
              playsInline
              preload="metadata"
              className={apply.refVideo}
            />
          )}
        </div>
      );
      cta = (
        <button type="button" className={styles.primaryBtn} onClick={() => go("script")}>
          Got it, show me the script
        </button>
      );
      break;

    case "script":
      title = "Here's your script.";
      subtitle =
        "The bits in brackets tell you what to do. Say the rest out loud. It's short, so read it a few times, then film it in one go.";
      body = (
        <>
          <div className={apply.scriptCard}>
            <ol className={ui.scriptLines}>
              {SCRIPT.map((s, i) => (
                <li key={i}>
                  <span className={ui.direction}>[{s.direction}]</span>
                  <span className={ui.spoken}>&ldquo;{s.line}&rdquo;</span>
                </li>
              ))}
            </ol>
          </div>
          <ul className={apply.tipsList}>
            <li>Hold your phone upright</li>
            <li>Face a window or a light</li>
            <li>Look at the lens, not the screen</li>
            <li>One take is fine. It doesn&apos;t have to be perfect.</li>
          </ul>
        </>
      );
      cta = (
        <button type="button" className={styles.primaryBtn} onClick={() => go("record")}>
          I&apos;m ready to film
        </button>
      );
      break;

    case "record":
      title = "Now film yourself.";
      subtitle = `Use your front camera. Keep it under ${MAX_SECONDS} seconds.`;
      body = (
        <div className={apply.uploadArea}>
          <input
            ref={cameraInputRef}
            type="file"
            accept="video/*"
            capture="user"
            onChange={(e) => onPicked(e.target.files?.[0] ?? null)}
            style={{ display: "none" }}
          />
          <input
            ref={libraryInputRef}
            type="file"
            accept="video/*"
            onChange={(e) => onPicked(e.target.files?.[0] ?? null)}
            style={{ display: "none" }}
          />
          {!file || !previewUrl ? (
            <div className={ui.btnStack}>
              <button type="button" className={apply.uploadBtn} onClick={openCamera}>
                Open front camera
              </button>
              <button type="button" className={ui.linkBtn} onClick={openLibrary}>
                Or pick a video you already filmed
              </button>
            </div>
          ) : (
            <div className={apply.uploadedBox}>
              <video
                key={previewUrl}
                src={previewUrl}
                controls
                playsInline
                className={apply.uploadedPreview}
              />
              {uploading && (
                <>
                  <div className={ui.statusRow}>
                    <span>{uploadNote ?? "Uploading your video..."}</span>
                    <span>{uploadPct}%</span>
                  </div>
                  <div className={apply.progressTrack}>
                    <div className={apply.progressFill} style={{ width: `${uploadPct}%` }} />
                  </div>
                </>
              )}
              {!uploading && (
                <div className={ui.btnStack}>
                  <button type="button" className={apply.uploadBtn} onClick={useThisVideo}>
                    Use this video
                  </button>
                  <button type="button" className={ui.secondaryBtn} onClick={openCamera}>
                    Retake
                  </button>
                </div>
              )}
            </div>
          )}
          <div className={apply.uploadHint}>
            Up to {MAX_SECONDS} seconds. Don&apos;t close this page while it uploads.
          </div>
          {callNote}
        </div>
      );
      break;

    case "consent":
      title = "One last thing.";
      subtitle = "Confirm you understand what happens with your video.";
      body = (
        <button
          type="button"
          className={`${apply.consentBox} ${consent ? apply.consentBoxChecked : ""}`}
          onClick={() => setConsent((c) => !c)}
          style={{ background: "transparent", cursor: "pointer" }}
        >
          <span className={apply.consentCheck}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7.5l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className={apply.consentLabel}>
            I understand my test video is used only to review my application and
            won&apos;t be posted publicly.
          </span>
        </button>
      );
      cta = (
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={submitVideo}
          disabled={!consent || !videoObjectPath || busy}
        >
          {busy ? "Sending..." : "Submit my video"}
        </button>
      );
      break;

    case "done":
      title = "Thanks! We'll get back to you soon.";
      subtitle = "You can head back to the call now.";
      break;
  }

  return (
    <main className={styles.shell}>
      {showRail && (
        <div className={styles.progressRail} aria-label={`Step ${railIdx + 1} of ${RAIL.length}`}>
          {RAIL.map((_, i) => (
            <div
              key={i}
              className={`${styles.progressSeg} ${
                i < railIdx ? styles.progressSegDone : i === railIdx ? styles.progressSegActive : ""
              }`}
            />
          ))}
        </div>
      )}
      <div className={styles.shellInner}>
        <div className={styles.header}>
          <Image
            src="/images/keshah-logo-white.png"
            alt="KESHAH"
            width={130}
            height={30}
            className={styles.headerLogo}
            priority
          />
        </div>

        <div style={{ minHeight: 24, display: "flex", alignItems: "center" }}>
          {back && (
            <button
              type="button"
              onClick={() => go(back)}
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
                fontFamily: "inherit",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M7.5 2L3 6l4.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
          )}
        </div>

        <div className={styles.spacerSmall} />

        <div
          key={phase}
          className={`${apply.stepBody} ${
            phase === "closed" || phase === "done" ? ui.centerMsg : ""
          }`}
        >
          {title && <h1 className={`${styles.title} ${styles.fadeTitle}`}>{title}</h1>}
          {subtitle && <p className={`${styles.subtitle} ${styles.fadeTitle}`}>{subtitle}</p>}
          <div className={styles.fadeOptions}>
            {body}
            {error && <div className={apply.error}>{error}</div>}
          </div>
        </div>

        <div className={styles.spacerLarge} />

        {cta && <div className={`${styles.bottom} ${styles.fadeButton}`}>{cta}</div>}
      </div>
    </main>
  );
}
