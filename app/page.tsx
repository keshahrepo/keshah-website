"use client";

// keshah.com — download splash. Replaces the previous gender-splash
// router (male → /m, female → /women) with a single download-the-app
// page. Rationale: ad traffic goes straight to the gendered landings
// (/m, /women) now, so the root is for people who type keshah.com
// directly — the right action for them is to install the app.
//
// Layout: on desktop, phone mockup on the right + QR card + store
// buttons on the left; on mobile the phone drops below the headline
// and the QR hides in favor of store-badge buttons (nothing to scan
// with on the same device).

import Image from "next/image";
import styles from "./page.module.css";

const APP_STORE_URL = "https://apps.apple.com/us/app/keshah/id6471162305";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";

export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <Image
          src="/images/logo.png"
          alt="KESHAH"
          width={40}
          height={40}
          className={styles.logo}
          priority
        />
      </div>

      <div className={styles.hero}>
        <div className={styles.copy}>
          <h1 className={styles.title}>Stop your hair loss + keep it.</h1>
          <p className={styles.subtitle}>
            20 minutes a day. No drugs. The science behind it, in your pocket.
          </p>

          {/* Desktop CTA — QR to scan with the phone that's going to
              run the app. filter: invert(1) flips the black-on-white
              SVG to white-on-black so it reads on the dark bg. */}
          <div className={styles.qrCard}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/careers/keshah-qr-code.svg"
              alt="Scan to download KESHAH"
              width={140}
              height={140}
              className={styles.qr}
            />
            <div className={styles.qrLabel}>
              <div className={styles.qrTitle}>Scan to download</div>
              <div className={styles.qrSub}>
                Opens KESHAH in the App Store or Google Play.
              </div>
            </div>
          </div>

          {/* Mobile CTA — can't scan a QR from your own phone, so
              drop in store badges. Hidden on desktop (QR takes over). */}
          <div className={styles.storeButtons}>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.storeBtnPrimary}
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
              className={styles.storeBtnSecondary}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M3.6 20.5V3.5c0-.3.1-.6.3-.8L13 12l-9.1 9.3c-.2-.2-.3-.5-.3-.8zm10.5-7.5l2.5 2.5L5.4 21.6l8.7-8.6zm0-2L5.4 2.4l11.2 6.1-2.5 2.5zM20.4 10.6l-2.9 1.4 2.9 1.4c.6.3 1 .9 1 1.4 0 .6-.4 1.1-1 1.4l-2.9 1.4-2.6-2.6 2.6-2.6 2.9 1.4z" />
              </svg>
              Google Play
            </a>
          </div>
        </div>

        <div className={styles.phoneWrap}>
          <div className={styles.phone}>
            <div className={styles.phoneNotch} />
            <Image
              src="/images/app-screenshot.png"
              alt="KESHAH app"
              width={340}
              height={736}
              className={styles.phoneScreen}
              priority
            />
          </div>
        </div>
      </div>
    </main>
  );
}
