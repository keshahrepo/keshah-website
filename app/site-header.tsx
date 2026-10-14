"use client";

// keshah.com top bar. Desktop: wordmark, centered section links and a
// quiet "Get the app" pill, sticky with a blurred background once you scroll.
// Mobile: just the logo, so the download hero still fits one screen.

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./site-header.module.css";

export default function SiteHeader({ downloadUrl }: { downloadUrl: string }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`${styles.bar} ${scrolled ? styles.scrolled : ""}`}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="KESHAH home">
          <Image src="/images/keshah-wordmark-white.png" alt="KESHAH" width={744} height={232} className={styles.wordmark} priority />
        </Link>
        <nav className={styles.nav} aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#results">Results</a>
          <a href="#story">Our story</a>
        </nav>
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className={styles.cta}>
          Get the app
        </a>
      </div>
    </header>
  );
}
