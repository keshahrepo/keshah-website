"use client";

// Thank-you page — landed by the apply form after a successful POST.
// Personalizes with ?name= from the query string (only the first name
// was pushed there, no PII beyond that). Static content otherwise.

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import styles from "../../../careers.module.css";
import thanksStyles from "./thanks.module.css";

function ThanksInner() {
  const params = useSearchParams();
  const rawName = (params.get("name") ?? "there").trim();
  // Prevent injection into the DOM via the URL param — strip anything
  // that isn't a-z/A-Z/space/hyphen/apostrophe. React would escape it
  // anyway, but this stops "?name=<script>" from looking weird on
  // screen if someone shares the URL.
  const firstName = rawName.replace(/[^A-Za-z\-'\s]/g, "").slice(0, 40) || "there";

  return (
    <>
      <header className={styles.detailHead}>
        <div className={thanksStyles.kicker}>Application received</div>
        <h1 className={styles.detailTitle}>Thanks, {firstName}.</h1>
        <p className={thanksStyles.lede}>
          We&apos;ve received your application and test video.
        </p>
      </header>

      <article className={styles.detailBody}>
        <section className={styles.section}>
          <h2>What happens next</h2>
          <ul>
            <li>Our team reviews every submission</li>
            <li>
              If selected, you&apos;ll receive an email with details on your
              paid two-week trial
            </li>
          </ul>
        </section>

        <p className={thanksStyles.contact}>
          Questions? Email{" "}
          <a href="mailto:contact@keshah.com">contact@keshah.com</a>
        </p>

        <div className={thanksStyles.ctaRow}>
          <Link href="/careers" className={thanksStyles.secondary}>
            Back to all roles
          </Link>
        </div>
      </article>
    </>
  );
}

export default function ThanksPage() {
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

      <Suspense fallback={null}>
        <ThanksInner />
      </Suspense>
    </main>
  );
}
