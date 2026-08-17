import Image from "next/image";
import styles from "./page.module.css";

// keshah.com/women — women's variant of the marketing homepage. Same
// structure as /, white background instead of dark, swap the men's
// phone screenshot for the women's "Your plan is ready" plan-reveal
// grid. Sets the page theme via the styles.page class which paints a
// pure-white background + dark text on this route only.

// Women's custom product page on App Store — the ppid query param
// scopes installs to this specific listing so we can measure /women
// traffic vs the generic landing.
const IOS_LINK =
  "https://apps.apple.com/us/app/keshah/id6450676544?ppid=c9e91a82-b648-4d7e-89d6-4ea4b29f8f98";
// Women's Play Store deep link — listing=women scopes install
// attribution to this landing's audience so /women clicks show
// up separately from the generic Android funnel.
const ANDROID_LINK =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair&listing=women";

export default function WomenHome() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        {/* Top headline — outcome promise, mirrors /m. Uses
            "hair thinning" + "medication" (vs. /m's "hair loss" +
            "drugs") per the gendered language rules. */}
        <h1 className={styles.headline}>
          Stop your hair thinning
          <br />
          in 60 days
        </h1>
        <p className={styles.subhead}>
          <span className={styles.stars}>&#9733;</span>{" "}
          4.8 &middot; Join 8,000+ women &middot; No medication
        </p>
        <div className={styles.layout}>
          {/* Phone mockup — women's plan-reveal screenshot.
              The Continue button at the bottom of the screenshot reads
              as a CTA to first-time visitors and confuses the download
              path. Kept the dark gradient overlay (hides the button)
              but removed the duplicated value-prop text. */}
          <div className={styles.phone}>
            <Image
              src="/images/app-screenshot-women.jpeg"
              alt="KESHAH app — Your plan is ready (women)"
              width={280}
              height={606}
              className={styles.screenshot}
              priority
            />
            <div className={styles.overlay} aria-hidden />
          </div>

          {/* Right side: download — proof moved up into the subheadline */}
          <div className={styles.aside}>

            {/* Mobile: Store buttons */}
            <div className={styles.storeButtons}>
              <a href={IOS_LINK} className={styles.storeBadge}>
                <Image
                  src="/images/app-store-black.svg"
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
              <p className={styles.qrLabel}>
                Scan to reverse hair thinning without medication
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
