"use client";

// Thank-you page — same mobile-app shell + type scale as the apply
// quiz. Reads the applicant's first name from ?name= for a small
// personalization touch. Static content otherwise.

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import styles from "../../../careers.module.css";

function ThanksInner() {
  const params = useSearchParams();
  const raw = (params.get("name") ?? "there").trim();
  // Strip URL-injection weirdness — React would escape it, but this
  // also prevents visual noise from "?name=%3Cscript%3E".
  const firstName = raw.replace(/[^A-Za-z\-'\s]/g, "").slice(0, 40) || "there";

  return (
    <>
      <div className={styles.spacerSmall} />

      <section style={{ display: "flex", flexDirection: "column", gap: 24, padding: "24px 0" }}>
        <h1 className={`${styles.title} ${styles.fadeTitle}`}>
          Thanks, {firstName}.
        </h1>
        <p
          className={styles.fadeTitle}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 20,
            fontWeight: 500,
            color: "#FFFFFF",
            lineHeight: 1.5,
            letterSpacing: -0.3,
            margin: 0,
          }}
        >
          We&apos;ve received your application and test video.
        </p>

        <div
          className={styles.fadeOptions}
          style={{
            marginTop: 16,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, marginTop: 2 }}>1.</span>
            <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, lineHeight: 1.55 }}>
              Our team reviews every submission.
            </span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, marginTop: 2 }}>2.</span>
            <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, lineHeight: 1.55 }}>
              If selected, you&apos;ll receive an email with details on your
              paid two-week trial.
            </span>
          </div>
        </div>

        <p
          className={styles.fadeButton}
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            marginTop: 20,
          }}
        >
          Questions?{" "}
          <a
            href="mailto:contact@keshah.com"
            style={{ color: "#FFFFFF", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            contact@keshah.com
          </a>
        </p>
      </section>

      <div className={styles.spacerLarge} />

      <div className={`${styles.bottom} ${styles.fadeButton}`}>
        <Link href="/careers" className={styles.primaryBtn} style={{ textDecoration: "none", textAlign: "center" }}>
          Back to all roles
        </Link>
      </div>
    </>
  );
}

export default function ThanksPage() {
  return (
    <main className={styles.shell}>
      <div className={styles.shellInner}>
        <div className={styles.header}>
          <Link href="/" aria-label="KESHAH">
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
        <Suspense fallback={null}>
          <ThanksInner />
        </Suspense>
      </div>
    </main>
  );
}
