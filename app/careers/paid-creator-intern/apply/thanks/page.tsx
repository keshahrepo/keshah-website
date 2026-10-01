"use client";

// Thank-you page — lands here after Calendly confirms the booking.
// Calendly appends ?event_type_name=...&invitee_full_name=...
// &invitee_email=...&event_start_time=... as redirect query params
// when the event's "Pass event details to redirect" setting is on.
//
// Layout mirrors keshah.com root: dark bg, phone mockup on the left,
// headline + booking confirmation + QR / store CTAs on the right.
// The phone mockup is deliberate — the applicant is about to interview
// to make content about this product, so showing the app itself right
// next to the "download it" ask closes the loop visually.

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

const DRAFT_STORAGE_KEY = "keshah_careers_draft_id_v1";

const APP_STORE_URL = "https://apps.apple.com/us/app/keshah/id6471162305";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";

// Calendly sends event_start_time as an ISO 8601 string in the invitee's
// local time (e.g. "2026-10-07T15:00:00-07:00").
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

  useEffect(() => {
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {}
  }, []);

  return (
    <div className="thanks-hero">
      {/* Phone mockup — same CSS frame as keshah.com root, wrapping the
          existing app-screenshot. */}
      <div className="thanks-phone-wrap">
        <div className="thanks-phone">
          <div className="thanks-phone-notch" />
          <Image
            src="/images/app-screenshot.png"
            alt="KESHAH app"
            width={340}
            height={736}
            className="thanks-phone-screen"
            priority
          />
        </div>
      </div>

      {/* Right column — booking confirmation + download CTA. */}
      <div className="thanks-copy">
        <h1 className="thanks-title">One thing before your interview.</h1>

        <p className="thanks-body">
          {bookingTime ? (
            <>
              Your group interview is confirmed for{" "}
              <span style={{ fontWeight: 600 }}>{bookingTime}</span>. Check
              your calendar for joining details.
            </>
          ) : (
            <>
              Your group interview is confirmed. Check your calendar for
              joining details.
            </>
          )}
        </p>

        <p className="thanks-context">
          KESHAH is the product you&apos;ll be creating content around.
          Hands-on experience with the app gives you something concrete to
          speak to in your interview. We may ask about it on the call.
        </p>

        {/* Desktop CTA — inverted QR card, same pattern as root. */}
        <div className="thanks-qr-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/careers/keshah-qr-code.svg"
            alt="Scan to download KESHAH"
            width={112}
            height={112}
            className="thanks-qr"
          />
          <div className="thanks-qr-label">
            <div className="thanks-qr-title">Scan to download</div>
            <div className="thanks-qr-sub">
              Opens KESHAH in the App Store or Google Play.
            </div>
          </div>
        </div>

        {/* Mobile CTA — store badges, hidden on desktop (QR takes over). */}
        <div className="thanks-store-buttons">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="thanks-store-btn-primary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.41-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.41C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.19 2.31-.89 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            App Store
          </a>
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="thanks-store-btn-secondary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M3.6 20.5V3.5c0-.3.1-.6.3-.8L13 12l-9.1 9.3c-.2-.2-.3-.5-.3-.8zm10.5-7.5l2.5 2.5L5.4 21.6l8.7-8.6zm0-2L5.4 2.4l11.2 6.1-2.5 2.5zM20.4 10.6l-2.9 1.4 2.9 1.4c.6.3 1 .9 1 1.4 0 .6-.4 1.1-1 1.4l-2.9 1.4-2.6-2.6 2.6-2.6 2.9 1.4z" />
            </svg>
            Google Play
          </a>
        </div>

        <p className="thanks-contact">
          Questions?{" "}
          <a href="mailto:contact@keshah.com">contact@keshah.com</a>
        </p>
      </div>
    </div>
  );
}

export default function ThanksPage() {
  return (
    <main className="thanks-page">
      <div className="thanks-header">
        <Link href="/" aria-label="KESHAH">
          <Image
            src="/images/keshah-logo-white.png"
            alt="KESHAH"
            width={130}
            height={30}
            className="thanks-header-logo"
            priority
          />
        </Link>
      </div>
      <Suspense fallback={null}>
        <ThanksInner />
      </Suspense>

      {/* Scoped styles. Inlined to avoid introducing a new CSS module
          + keep the thanks-page layout self-contained. Mirrors the
          root page's phone-mockup / QR-card patterns 1:1. */}
      <style>{`
        .thanks-page {
          min-height: 100dvh;
          background: #000;
          color: #fff;
          font-family: "Poppins", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
          display: flex;
          flex-direction: column;
        }

        .thanks-header {
          padding: 20px 32px 0;
          display: flex;
          align-items: center;
        }

        .thanks-header-logo {
          display: block;
          height: 30px;
          width: auto;
          opacity: 0.95;
        }

        .thanks-hero {
          flex: 1;
          display: flex;
          flex-direction: column-reverse;
          gap: 32px;
          align-items: center;
          justify-content: center;
          padding: 24px 24px 48px;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }

        .thanks-copy {
          width: 100%;
          max-width: 480px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          text-align: center;
        }

        .thanks-title {
          font-family: "Poppins", sans-serif;
          font-size: 30px;
          font-weight: 600;
          color: #fff;
          letter-spacing: -1.3px;
          line-height: 1.15;
          margin: 0;
        }

        .thanks-body {
          font-size: 16px;
          color: rgba(255, 255, 255, 0.85);
          line-height: 1.5;
          margin: 0;
          letter-spacing: -0.2px;
        }

        .thanks-context {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.65);
          line-height: 1.55;
          margin: 0;
        }

        /* QR card — black card w/ a thin outline, white (inverted) QR.
           Hidden on mobile where there's no second device to scan. */
        .thanks-qr-card {
          display: none;
          align-items: center;
          gap: 16px;
          padding: 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          text-align: left;
          margin-top: 4px;
        }

        .thanks-qr {
          width: 96px;
          height: 96px;
          display: block;
          flex-shrink: 0;
          filter: invert(1);
          border-radius: 6px;
        }

        .thanks-qr-label {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .thanks-qr-title {
          font-size: 15px;
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.2px;
        }

        .thanks-qr-sub {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.55);
          line-height: 1.4;
        }

        .thanks-store-buttons {
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: 4px;
        }

        .thanks-store-btn-primary,
        .thanks-store-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 11px 16px;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          letter-spacing: -0.2px;
          font-family: inherit;
        }

        .thanks-store-btn-primary {
          background: #fff;
          color: #000;
        }

        .thanks-store-btn-secondary {
          background: transparent;
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .thanks-contact {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.5);
          margin: 8px 0 0;
        }

        .thanks-contact a {
          color: #fff;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        /* Phone mockup — CSS frame around the app screenshot. */
        .thanks-phone-wrap {
          width: 100%;
          display: flex;
          justify-content: center;
          flex-shrink: 0;
        }

        .thanks-phone {
          position: relative;
          width: 230px;
          aspect-ratio: 9 / 19.5;
          background: #000;
          border-radius: 36px;
          padding: 6px;
          box-shadow:
            0 0 0 2px rgba(255, 255, 255, 0.08),
            0 30px 60px rgba(0, 0, 0, 0.6),
            inset 0 0 0 2px #0a0a0a;
        }

        .thanks-phone-notch {
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          width: 78px;
          height: 18px;
          background: #000;
          border-radius: 999px;
          z-index: 2;
          pointer-events: none;
        }

        .thanks-phone-screen {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top center;
          border-radius: 30px;
          background: #000;
        }

        /* Desktop — phone on LEFT, copy + QR on right. Matches root. */
        @media (min-width: 720px) {
          .thanks-hero {
            flex-direction: row-reverse;
            gap: 56px;
            padding: 32px 48px 64px;
            align-items: center;
          }

          .thanks-copy {
            text-align: left;
            align-items: flex-start;
            max-width: 460px;
          }

          .thanks-title {
            font-size: 40px;
            letter-spacing: -1.6px;
          }

          .thanks-body {
            font-size: 17px;
          }

          .thanks-qr-card {
            display: flex;
          }

          .thanks-store-buttons {
            justify-content: flex-start;
            opacity: 0.9;
          }

          .thanks-phone-wrap {
            width: auto;
          }

          .thanks-phone {
            width: 280px;
          }
        }

        @media (min-width: 1200px) {
          .thanks-title { font-size: 44px; }
          .thanks-phone { width: 300px; }
        }
      `}</style>
    </main>
  );
}
