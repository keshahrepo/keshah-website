import Image from "next/image";
import styles from "./page.module.css";

const IOS_LINK = "https://apps.apple.com/app/id6450676544";
const ANDROID_LINK =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";

export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
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

          {/* Right side: proof + download */}
          <div className={styles.aside}>
            <p className={styles.proof}>
              <span className={styles.stars}>&#9733;&#9733;&#9733;&#9733;&#9733;</span>{" "}
              4.8 &middot; 6,000+ members
            </p>

            {/* Mobile: Store buttons */}
            <div className={styles.storeButtons}>
              <a href={IOS_LINK} className={styles.storeBadge}>
                <Image
                  src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/white/en-us?size=250x83"
                  alt="Download on the App Store"
                  width={120}
                  height={40}
                  unoptimized
                />
              </a>
              <a href={ANDROID_LINK} className={styles.storeBadge}>
                <Image
                  src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                  alt="Get it on Google Play"
                  width={135}
                  height={40}
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
