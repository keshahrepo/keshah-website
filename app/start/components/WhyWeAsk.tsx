"use client";

// "Why we ask" educational box — appears under quiz questions to provide
// clinical context for why this question matters. Modeled on Hims' under-
// question explainer pattern: builds trust, teaches the science mid-quiz,
// and gives the user a credibility-anchoring reason for each answer.
//
// Design intent: subtle background tint, clearly labelled "Why we ask"
// header, body copy in muted text. Same look in dark and cream themes via
// the --fg-* variable ladder.

import type { ReactNode } from "react";

interface Props {
  /** Body of the explainer — keep short, ~2 sentences max. */
  children: ReactNode;
  /** Optional source link (e.g., a study URL) — renders as small link
   *  underneath the body. */
  source?: { url: string; label?: string };
}

export default function WhyWeAsk({ children, source }: Props) {
  return (
    <div
      style={{
        background: "var(--fg-4)",
        border: "1px solid var(--fg-8)",
        borderRadius: 12,
        padding: "14px 16px",
        marginTop: 20,
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: "var(--fg-55)",
          margin: 0,
          marginBottom: 8,
        }}
      >
        Why we ask
      </p>
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--fg-70)",
          margin: 0,
        }}
      >
        {children}
      </p>
      {source && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 8,
            fontSize: 12,
            color: "var(--fg-55)",
            textDecoration: "underline",
          }}
        >
          {source.label ?? "Source"}
        </a>
      )}
    </div>
  );
}
