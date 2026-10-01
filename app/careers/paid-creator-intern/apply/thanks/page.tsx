"use client";

// Thank-you page — lands here after Calendly confirms the booking.
// Calendly appends ?event_type_name=...&invitee_full_name=...
// &invitee_email=...&event_start_time=... as redirect query params
// (requires "Pass event details to redirect" turned on in Calendly's
// confirmation-page settings).
//
// Shows: "You're confirmed for [time]" + the pre-call homework
// (download KESHAH and go through onboarding). The download-the-app
// task is the real asset here — it makes the role feel real, pre-filters
// no-shows, and primes applicants with first-hand product knowledge the
// group interview can draw from.

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import styles from "../../../careers.module.css";

const DRAFT_STORAGE_KEY = "keshah_careers_draft_id_v1";

// Fallback Calendly link for applicants who land here without a
// booking (closed the embed mid-way, backed out, etc.).
const CALENDLY_URL = "https://calendly.com/aadi-keshah/group-interview";

// App Store IDs — update if the store links change.
const APP_STORE_URL = "https://apps.apple.com/us/app/keshah/id6471162305";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";

// Calendly sends event_start_time as an ISO 8601 string in the invitee's
// local time (e.g. "2026-10-07T15:00:00-07:00"). Format it in a friendly
// way without pulling in a date library.
function formatBookingTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    return fmt.format(d);
  } catch {
    return d.toLocaleString();
  }
}

function ThanksInner() {
  const params = useSearchParams();

  const bookingTime = formatBookingTime(params.get("event_start_time"));
  const hasBooking = !!bookingTime;

  // Clear the local draft id now that the application is submitted and
  // (if hasBooking) the Calendly booking has landed. A return visitor
  // starts a fresh application. If they didn't book, keep the draft so
  // they can resume the Calendly step if they come back.
  useEffect(() => {
    if (hasBooking) {
      try {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {}
    }
  }, [hasBooking]);

  return (
    <>
      <div className={styles.spacerSmall} />

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          padding: "16px 0 8px",
        }}
      >
        <h1 className={`${styles.title} ${styles.fadeTitle}`}>
          {hasBooking
            ? "One thing before your interview."
            : "Application received."}
        </h1>

        {hasBooking ? (
          <p
            className={styles.fadeTitle}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 18,
              fontWeight: 500,
              color: "#FFFFFF",
              lineHeight: 1.45,
              letterSpacing: -0.3,
              margin: 0,
            }}
          >
            Your group interview is confirmed for{" "}
            <span style={{ color: "#FFFFFF", fontWeight: 600 }}>{bookingTime}</span>.
            Check your calendar for joining details. Please complete the
            following before your call.
          </p>
        ) : (
          <p
            className={styles.fadeTitle}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 18,
              fontWeight: 500,
              color: "#FFFFFF",
              lineHeight: 1.45,
              letterSpacing: -0.3,
              margin: 0,
            }}
          >
            Finish booking your group interview below to secure your spot.
          </p>
        )}

        {/* The real ask (booked state): download the app before the
            call. Framed to make clear this is the app you'll be
            creating content around — otherwise the download task
            reads as random/unrelated. */}
        {hasBooking && (
        <div
          className={styles.fadeOptions}
          style={{
            marginTop: 8,
            padding: "20px 20px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: "#FFFFFF",
              lineHeight: 1.35,
              letterSpacing: -0.2,
            }}
          >
            Download KESHAH and go through the onboarding and quiz.
          </div>
          <div
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.7)",
              lineHeight: 1.5,
            }}
          >
            KESHAH is the product you&apos;ll be creating content around.
            Hands-on experience with the app gives you something concrete
            to speak to in your interview — we may ask about it on the call.
          </div>

          {/* Mobile: store badges. Hidden on desktop where tapping store
              links from a laptop just dead-ends on a web page. */}
          <div
            className="thanks-mobile-cta"
            style={{
              display: "flex",
              gap: 10,
              marginTop: 4,
              flexWrap: "wrap",
            }}
          >
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#FFFFFF",
                color: "#0a0a0a",
                padding: "11px 16px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 14,
                letterSpacing: -0.2,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.41-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.41C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.19 2.31-.89 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              App Store
            </a>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "transparent",
                color: "#FFFFFF",
                border: "1px solid rgba(255,255,255,0.3)",
                padding: "10px 16px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 14,
                letterSpacing: -0.2,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.6 20.5V3.5c0-.3.1-.6.3-.8L13 12l-9.1 9.3c-.2-.2-.3-.5-.3-.8zm10.5-7.5l2.5 2.5L5.4 21.6l8.7-8.6zm0-2L5.4 2.4l11.2 6.1-2.5 2.5zM20.4 10.6l-2.9 1.4 2.9 1.4c.6.3 1 .9 1 1.4 0 .6-.4 1.1-1 1.4l-2.9 1.4-2.6-2.6 2.6-2.6 2.9 1.4z" />
              </svg>
              Google Play
            </a>
          </div>

          {/* Desktop: QR code to scan with phone. Points to the smart
              link that routes to the right store. */}
          <div
            className="thanks-desktop-cta"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginTop: 8,
              padding: "14px 14px",
              background: "#FFFFFF",
              borderRadius: 12,
            }}
          >
            <img
              src="/careers/keshah-qr-code.svg"
              alt="Scan to download KESHAH"
              width={120}
              height={120}
              style={{ display: "block", borderRadius: 4 }}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                color: "#0a0a0a",
                flex: 1,
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: -0.2,
                }}
              >
                Scan with your phone
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(10,10,10,0.65)",
                  lineHeight: 1.45,
                }}
              >
                Opens KESHAH in the App Store or Google Play.
              </div>
            </div>
          </div>

          <style>{`
            @media (min-width: 720px) { .thanks-mobile-cta { display: none !important; } }
            @media (max-width: 719px) { .thanks-desktop-cta { display: none !important; } }
          `}</style>
        </div>
        )}

        {/* Not-booked state: the applicant landed here without a
            Calendly slot (closed the embed, backed out, etc.). Give
            them a one-tap way to pick a time so they're not stranded. */}
        {!hasBooking && (
          <a
            href={CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.fadeOptions}
            style={{
              marginTop: 4,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "#FFFFFF",
              color: "#0a0a0a",
              padding: "14px 20px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 15,
              letterSpacing: -0.2,
            }}
          >
            Select a time
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 7h8M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}

        <p
          className={styles.fadeButton}
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            marginTop: 4,
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
