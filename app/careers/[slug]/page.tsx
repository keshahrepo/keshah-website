// /careers/[slug] — narrative role page in the mobile founder-story
// voice. Section-by-section, dense but calm. White pill CTA at bottom
// routes into the multi-step quiz application.

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import styles from "../careers.module.css";
import { APPLY_EMAIL, LISTINGS, getListing } from "../listings";

// Roles that have a purpose-built on-site quiz application flow. Any
// role not in this map falls back to a pre-filled mailto so every card
// on the landing has a real CTA behind it.
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

  const applyHref =
    ON_SITE_APPLY[listing.slug] ??
    `mailto:${APPLY_EMAIL}?subject=${encodeURIComponent(`Application: ${listing.title}`)}`;

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

        <div style={{ paddingTop: 8 }}>
          <Link
            href="/careers"
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: 13,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M7.5 2L3 6l4.5 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            All roles
          </Link>
        </div>

        <section className={styles.detailBody}>
          <h1 className={`${styles.title} ${styles.fadeTitle}`}>
            {listing.title}
          </h1>
          <div className={`${styles.detailMeta} ${styles.fadeTitle}`}>
            <span>{listing.location}</span>
            <span>{listing.employment}</span>
            <span>{listing.team}</span>
          </div>

          <div className={`${styles.fadeOptions}`} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {listing.sections.map((s, i) => (
              <div key={i} className={styles.detailSection}>
                <h2>{s.heading}</h2>
                {s.body && <p>{s.body}</p>}
                {s.bullets && (
                  <ul>
                    {s.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            <div className={styles.detailCompensation}>
              <div className={styles.detailCompensationLabel}>Compensation</div>
              <div className={styles.detailCompensationBody}>
                {listing.compensation}
              </div>
            </div>

            <div className={styles.detailSection}>
              <h2>How to apply</h2>
              <ol className={styles.detailSteps}>
                {listing.applicationProcess.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <div className={styles.spacerLarge} />

        <div className={`${styles.bottom} ${styles.fadeButton}`}>
          <Link href={applyHref} className={styles.primaryBtn} style={{ textDecoration: "none", textAlign: "center" }}>
            Start application
          </Link>
        </div>
      </div>
    </main>
  );
}
