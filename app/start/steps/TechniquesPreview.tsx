"use client";

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import styles from "./techniques-preview.module.css";

const TECHNIQUES = [
  { name: "Scalp Pinching", image: "/start/techniques/technique_scalp_pinching.png" },
  { name: "Acupressure", image: "/start/techniques/technique_acupressure.png" },
  { name: "Scalp Pressing", image: "/start/techniques/technique_scalp_pressing.png" },
  { name: "Neck Presses", image: "/start/techniques/technique_neck_presses.png" },
  { name: "Scalp Stretches", image: "/start/techniques/technique_scalp_stretches.png" },
  { name: "Neck Stretches", image: "/start/techniques/technique_neck_stretches.png" },
];

export default function TechniquesPreview() {
  const { next, answers } = useFlow();
  const config = useFunnelConfig();
  // Women's funnels render the six technique thumbnails inline on the
  // consolidated PersonalizedDiagnosis ("Your daily scalp massage plan")
  // page, so this standalone preview step auto-skips for them. Men's
  // funnel keeps it as-is.
  const skip = config.audience === "women" || answers.gender === "female";
  useEffect(() => {
    if (skip) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);
  if (skip) return null;

  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <div className={styles.header}>
          <h1 className={styles.headline}>Here&apos;s how we&apos;ll loosen your scalp</h1>
          <p className={styles.subtitle}>
            Proven exercises to release tension and restore blood flow.
          </p>
        </div>
        <div className={styles.grid}>
          {TECHNIQUES.map((t, i) => (
            <div
              key={t.name}
              className={styles.card}
              style={{ animationDelay: `${200 + i * 120}ms` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.image} alt={t.name} className={styles.cardImage} />
              <div className={styles.cardOverlay} />
              <div className={styles.cardLabel}>{t.name}</div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={next}>
          Continue
        </button>
      </div>
    </div>
  );
}
