// /careers/[slug] — role detail page in proper job-posting layout
// (nav → back → pills → title → 3-col meta grid → sections → comp
// callout → numbered how-to-apply → sticky Apply CTA). KESHAH tokens
// throughout (Poppins, kBlack, no serif, no gold — only #4CAF50 green
// on the compensation callout, matching the trial paywall's outcome
// milestone color).

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import styles from "../careers.module.css";
import { APPLY_EMAIL, LISTINGS, getListing } from "../listings";

const ON_SITE_APPLY: Record<string, string> = {
  "paid-creator-intern": "/careers/paid-creator-intern/apply",
};

export function generateStaticParams() {
  return LISTINGS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = getListing(slug);
  if (!listing) return { title: "Role not found — KESHAH Careers" };
  return {
    title: `${listing.title} — KESHAH Careers`,
    description: listing.summary,
  };
}

export default async function RoleDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = getListing(slug);
  if (!listing) notFound();

  const onSite = ON_SITE_APPLY[listing.slug];
  const subject = encodeURIComponent(`Application: ${listing.title}`);
  const body = encodeURIComponent(
    `Hi KESHAH team,\n\nI'd like to apply for the ${listing.title} role.\n\nName:\nSchool (if applicable):\nLink to short test video:\n\n—`
  );
  const applyHref = onSite ?? `mailto:${APPLY_EMAIL}?subject=${subject}&body=${body}`;

  return (
    <main className={styles.detailPage}>
      <div className={styles.navBar}>
        <nav className={styles.nav}>
          <Link href="/" className={styles.navLogo} aria-label="KESHAH">
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
            <Link href="/support">Support</Link>
          </div>
        </nav>
      </div>

      <Link href="/careers" className={styles.back}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M7.5 2L3 6l4.5 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to all roles
      </Link>

      <header className={styles.detailHead}>
        <div className={styles.detailPills}>
          <span>{listing.location}</span>
          <span>{listing.employment}</span>
          <span>{listing.team}</span>
        </div>
        <h1 className={styles.detailTitle}>{listing.title}</h1>

        <div className={styles.metaBox}>
          <div className={styles.metaCell}>
            <div className={styles.metaLabel}>Start date</div>
            <div className={styles.metaValue}>{listing.meta.startDate}</div>
          </div>
          <div className={styles.metaCell}>
            <div className={styles.metaLabel}>Duration</div>
            <div className={styles.metaValue}>{listing.meta.duration}</div>
          </div>
          <div className={styles.metaCell}>
            <div className={styles.metaLabel}>Schedule</div>
            <div className={styles.metaValue}>{listing.meta.schedule}</div>
          </div>
        </div>
      </header>

      <article className={styles.detailBody}>
        {listing.sections.map((s, i) => (
          <section key={i} className={styles.section}>
            <h2>{s.heading}</h2>
            {s.body && <p>{s.body}</p>}
            {s.bullets && (
              <ul>
                {s.bullets.map((b, j) => <li key={j}>{b}</li>)}
              </ul>
            )}
          </section>
        ))}

        <div className={styles.compBox}>
          <div className={styles.compLabel}>Compensation</div>
          <div className={styles.compBody}>{listing.compensation}</div>
        </div>

        <section className={styles.section}>
          <h2>How to apply</h2>
          <ol className={styles.steps}>
            {listing.applicationProcess.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>

        {listing.closingNote && (
          <p className={styles.closingNote}>{listing.closingNote}</p>
        )}
      </article>

      <div className={styles.applyBar}>
        <a href={applyHref} className={styles.applyBtn}>
          {onSite ? "Start application" : `Apply — email ${APPLY_EMAIL}`}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M3 7h8M8 3l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
        <div className={styles.applyNote}>
          {onSite
            ? "Takes about 10 minutes. Your test video is your application."
            : "Include a short test video link (Loom, unlisted YouTube, or Drive)"}
        </div>
      </div>
    </main>
  );
}
