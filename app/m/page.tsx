import Image from "next/image";
import styles from "./page.module.css";

// Route store-button clicks through /app so we get the JS + itms-apps:// fallback
// that works inside Instagram's in-app browser (which blocks plain apps.apple.com links).
const IOS_LINK = "/app?platform=ios";
const ANDROID_LINK = "/app?platform=android";

export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        {/* Top headline — outcome promise, validated as the strongest
            pitch (same as site meta title). Subheadline carries the
            gendered social proof beneath it. Three-beat hierarchy:
            outcome → proof → download. */}
        <h1 className={styles.headline}>
          Stop your hair loss
          <br />
          in 60 days
        </h1>
        <p className={styles.subhead}>
          <span className={styles.stars}>&#9733;</span>{" "}
          4.8 &middot; Join 25,000+ men &middot; No drugs
        </p>
        <div className={styles.layout}>
          {/* Phone mockup */}
          <div className={styles.phone}>
            <Image
              src="/images/app-screenshot.png"
              alt="KESHAH app — Day 1 of 60"
              width={280}
              height={606}
              className={styles.screenshot}
              priority
            />
          </div>

          {/* Right side: download — proof moved up into the subheadline */}
          <div className={styles.aside}>

            {/* Mobile: Store buttons */}
            <div className={styles.storeButtons}>
              <a href={IOS_LINK} className={styles.storeBadge}>
                <Image
                  src="/images/app-store-white.svg"
                  alt="Download on the App Store"
                  width={145}
                  height={48}
                  unoptimized
                />
              </a>
              <a href={ANDROID_LINK} className={styles.storeBadge}>
                <Image
                  src="/images/google-play.svg"
                  alt="Get it on Google Play"
                  width={145}
                  height={48}
                  unoptimized
                />
              </a>
            </div>

            {/* Desktop: QR code */}
            <div className={styles.qrSection}>
              <div className={styles.qrBox}>
                <Image
                  src="/images/qr-code.png"
                  alt="Scan to download KESHAH"
                  width={140}
                  height={140}
                  unoptimized
                />
              </div>
              <p className={styles.qrLabel}>Scan to stop your hair loss without drugs</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
