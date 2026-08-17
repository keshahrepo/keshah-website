"use client";

// keshah.com — gender splash. Mirrors the mobile app's
// GenderSelectionContent UI (title + outlined option cards), but
// auto-advances on tap instead of using a Continue button. The app
// pattern of "select then tap Next" doesn't pay off on a 2-option
// marketing splash where the goal is to minimize taps before the user
// hits the gendered landing.
//
// Routing on tap:
//   - Male   → /m       (was previously keshah.com/)
//   - Female → /women   (existing women's landing — unchanged)
// Existing /women links from creator bios keep working; old /-only bios
// now hit this splash and route both genders to the right landing
// instead of dropping the wrong-gender visitor on the wrong page.

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import styles from "./page.module.css";

type Gender = "male" | "female";

const OPTIONS: { value: Gender; label: string; href: string }[] = [
  { value: "male", label: "Male", href: "/m" },
  { value: "female", label: "Female", href: "/women" },
];

// Short delay between tap and route so the selected state is visually
// confirmed (white border + checkmark flashes) before the page changes.
// Without it the splash feels twitchy — the user taps and is gone
// before they see anything register.
const AUTO_ADVANCE_DELAY_MS = 180;

export default function Splash() {
  const router = useRouter();
  const [selected, setSelected] = useState<Gender | null>(null);

  const onSelect = (gender: Gender, href: string) => {
    if (selected) return; // guard against double-tap during the delay
    setSelected(gender);
    setTimeout(() => {
      router.push(href);
    }, AUTO_ADVANCE_DELAY_MS);
  };

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

      <div className={styles.body}>
        <h1 className={styles.title}>What&apos;s your gender?</h1>

        <div className={styles.options}>
          {OPTIONS.map(({ value, label, href }) => {
            const isSelected = selected === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onSelect(value, href)}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                aria-pressed={isSelected}
              >
                <span className={`${styles.optionLabel} ${isSelected ? styles.optionLabelSelected : ""}`}>
                  {label}
                </span>
                {isSelected && (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M5 12l4.5 4.5L19 7"
                      stroke="#fff"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
