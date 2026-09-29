// /careers landing — mobile-app aesthetic (kBlack, Poppins 28/w600/-1.2,
// bottom-weighted content, quiz-style option cards for the role rows).
// Deliberately minimal and mobile-shaped even on desktop (max-width 520)
// so the whole page reads like the app's onboarding beats rather than a
// generic web listing hub.

import Link from "next/link";
import Image from "next/image";
import styles from "./careers.module.css";
import { LISTINGS } from "./listings";

export const metadata = {
  title: "Careers — KESHAH",
  description: "Build the drug-free future of hair loss treatment.",
};

export default function CareersLanding() {
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

        <div className={styles.spacerSmall} />

        <section className={styles.landingBody}>
          <h1 className={`${styles.title} ${styles.fadeTitle}`}>
            Work on the drug-free future of hair loss.
          </h1>
          <p className={`${styles.landingLede} ${styles.fadeOptions}`}>
            KESHAH is a small team helping hundreds of thousands of people
            stop hair loss without drugs or surgery. If you want your work
            to reach real people fast, this is the place.
          </p>

          <div className={`${styles.rolesLabel} ${styles.fadeOptions}`}>
            Open roles
          </div>

          {LISTINGS.length > 0 ? (
            <div className={`${styles.roles} ${styles.fadeOptions}`}>
              {LISTINGS.map((l) => (
                <Link
                  key={l.slug}
                  href={`/careers/${l.slug}`}
                  className={styles.roleCard}
                >
                  <h2 className={styles.roleTitle}>{l.title}</h2>
                  <div className={styles.roleMeta}>
                    {l.location} · {l.employment} · {l.team}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.emptyRoles}>
              No open roles right now. Still interested?{" "}
              <a href="mailto:contact@keshah.com">contact@keshah.com</a>
            </div>
          )}
        </section>

        <div className={styles.spacerLarge} />

        <div className={styles.landingFoot}>© KESHAH</div>
      </div>
    </main>
  );
}
