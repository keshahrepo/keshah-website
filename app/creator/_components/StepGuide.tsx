"use client";

import { useState } from "react";
import type { Guide, GuideStep } from "@/lib/creators/guide-content";
import { C, Eyebrow } from "./ui";

const ACCENT = "#FF3B5C";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: C.faint, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, color: C.text, wordBreak: "break-all" }}>{value}</div>
      </div>
      <button
        type="button"
        onClick={async () => {
          if (await copyText(value)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }
        }}
        style={{
          flexShrink: 0,
          padding: "8px 12px",
          borderRadius: 10,
          border: "none",
          background: copied ? "rgba(74,222,128,0.15)" : "#fff",
          color: copied ? C.green : "#000",
          fontFamily: C.font,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function StepCard({
  step,
  n,
  link,
  keshahEmail,
}: {
  step: GuideStep;
  n: number;
  link?: string;
  keshahEmail?: string;
}) {
  return (
    <div
      style={{
        background: C.card,
        border: step.important ? `1px solid ${ACCENT}` : C.border,
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
      }}
    >
      {step.image && (
        <img
          src={step.image}
          alt={step.alt ?? ""}
          width={377}
          height={820}
          loading="lazy"
          decoding="async"
          style={{
            display: "block",
            width: "100%",
            maxWidth: 320,
            height: "auto",
            margin: "0 auto 14px",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        />
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            flexShrink: 0,
            width: 24,
            height: 24,
            borderRadius: 999,
            background: step.important ? ACCENT : "rgba(255,255,255,0.12)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          {n}
        </div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: C.text }}>{step.text}</p>
      </div>

      {step.important && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            borderRadius: 10,
            background: "rgba(255,59,92,0.12)",
            color: ACCENT,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Important. Don&apos;t skip this.
        </div>
      )}

      {step.slot === "email" && keshahEmail && <CopyBlock label="Your KESHAH email" value={keshahEmail} />}
      {step.slot === "link" &&
        (link ? (
          <CopyBlock label="Your AppStack link" value={link} />
        ) : (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: C.faint }}>
            Your AppStack link will show up here once we set it up for you.
          </p>
        ))}
      {step.copy && <CopyBlock label="Copy this" value={step.copy} />}
    </div>
  );
}

export default function StepGuide({
  guide,
  sectionIds,
  link,
  keshahEmail,
  showSectionTitles = true,
}: {
  guide: Guide;
  /** Only render these sections (by id). Defaults to all. */
  sectionIds?: string[];
  /** Creator's AppStack link, shown with a copy button on link steps. */
  link?: string;
  /** Creator's name@keshah.com email, shown on sign-up steps. */
  keshahEmail?: string;
  showSectionTitles?: boolean;
}) {
  const sections = sectionIds ? guide.sections.filter((s) => sectionIds.includes(s.id)) : guide.sections;
  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      {sections.map((section) => (
        <div key={section.id} style={{ marginBottom: 20 }}>
          {showSectionTitles && <Eyebrow style={{ margin: "4px 2px 10px" }}>{section.title}</Eyebrow>}
          {section.steps.map((step, i) => (
            <StepCard key={i} step={step} n={i + 1} link={link} keshahEmail={keshahEmail} />
          ))}
        </div>
      ))}
    </div>
  );
}
