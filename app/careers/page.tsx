"use client";

// /careers — proper careers-page structure (top nav, hero, filters,
// listing rows with count) rendered in KESHAH tokens (Poppins, kBlack,
// no serif, no gold). This is a marketing surface, so it uses a wide
// layout — the apply quiz below it is the narrow mobile-app shell.

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import styles from "./careers.module.css";
import { LISTINGS, allTeams, allLocations } from "./listings";

export default function CareersLanding() {
  const [q, setQ] = useState("");
  const [team, setTeam] = useState<string>("All teams");
  const [location, setLocation] = useState<string>("All locations");

  const teams = useMemo(() => ["All teams", ...allTeams()], []);
  const locations = useMemo(() => ["All locations", ...allLocations()], []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return LISTINGS.filter((l) => {
      if (team !== "All teams" && l.team !== team) return false;
      if (location !== "All locations" && l.location !== location) return false;
      if (needle) {
        const hay = `${l.title} ${l.team} ${l.summary} ${l.employment}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [q, team, location]);

  return (
    <main className={styles.page}>
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
            <Link href="/">Home</Link>
            <Link href="/support">Support</Link>
          </div>
        </nav>
      </div>

      <section className={styles.hero}>
        <div className={styles.eyebrow}>Careers at KESHAH</div>
        <h1 className={styles.heroTitle}>
          Build the drug-free future of hair loss.
        </h1>
        <p className={styles.heroSub}>
          KESHAH is a small team helping hundreds of thousands of people
          stop hair loss without pills, surgery, or empty promises. If you
          want your work to reach real people fast, this is the place.
        </p>
      </section>

      <div className={styles.filtersWrap}>
      <div className={styles.filters}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
            <path d="M14 14l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className={styles.search}
            placeholder="Search roles"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search roles"
          />
        </div>
        <select
          className={styles.select}
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          aria-label="Team"
        >
          {teams.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select
          className={styles.select}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          aria-label="Location"
        >
          {locations.map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>
      </div>

      {filtered.length > 0 ? (
        <>
          <div className={styles.count}>
            {filtered.length} open role{filtered.length === 1 ? "" : "s"}
          </div>
          <div className={styles.list}>
            {filtered.map((l) => (
              <Link key={l.slug} href={`/careers/${l.slug}`} className={styles.row}>
                <div>
                  <h2 className={styles.rowTitle}>{l.title}</h2>
                  <p className={styles.rowSummary}>{l.summary}</p>
                  <div className={styles.rowMeta}>
                    <span>{l.location}</span>
                    <span>{l.employment}</span>
                    <span>{l.team}</span>
                  </div>
                </div>
                <div className={styles.rowArrow} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M6 3l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className={styles.empty}>
          <h2>No matching roles.</h2>
          <p>
            Try clearing your filters. Still interested?{" "}
            <a href="mailto:contact@keshah.com">contact@keshah.com</a>
          </p>
        </div>
      )}

      <footer className={styles.foot}>© KESHAH</footer>
    </main>
  );
}
