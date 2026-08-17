"use client";

import styles from "../start.module.css";

interface ProgressBarProps {
  current: number;
  total: number;
}

export default function ProgressBar({ current, total }: ProgressBarProps) {
  return (
    <div className={styles.progressBar}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`${styles.progressSegment} ${
            i <= current ? styles.progressSegmentFilled : ""
          }`}
        />
      ))}
    </div>
  );
}
