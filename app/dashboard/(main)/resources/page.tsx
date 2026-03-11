"use client";

import { useEffect, useState } from "react";
import { RESOURCES, Resource } from "@/lib/resources";

export default function ResourcesPage() {
  const [role, setRole] = useState<string>("admin");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.role) setRole(d.role);
    }).catch(() => {});
  }, []);

  const filtered = RESOURCES.filter((r) => {
    if (role === "admin") return true;
    return r.audience.includes(role as "admin" | "manager" | "creator");
  });

  function handleCopy(resource: Resource) {
    navigator.clipboard.writeText(resource.content);
    setCopied(resource.id);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleCopySection(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedSection(key);
    setTimeout(() => setCopiedSection(null), 2000);
  }

  function parseSections(content: string): { title: string; message: string; hint: string }[] {
    const parts = content.split(/\n---\n/).map((s) => s.trim());
    return parts.map((part) => {
      const lines = part.split("\n");
      const firstLine = lines[0].trim();
      // Title: line that starts with ALL-CAPS words (may have parenthetical subtitle)
      const titleMatch = firstLine.match(/^([A-Z][A-Z\s\-&:]+)/);
      const isTitle = !!titleMatch && titleMatch[1].trim().length >= 3;
      const bodyLines = isTitle ? lines.slice(1) : lines;
      // Separate hint lines from the actual message
      // Hints: lines wrapped in parentheses, or instructional lines (Escalate/Always/Don't)
      const messageLines: string[] = [];
      const hintLines: string[] = [];
      for (const line of bodyLines) {
        const trimmed = line.trim();
        if (
          (trimmed.startsWith("(") && trimmed.endsWith(")")) ||
          trimmed.startsWith("Escalate ") ||
          trimmed.startsWith("Always ") ||
          trimmed.startsWith("Don't ") ||
          trimmed.startsWith("Don\u2019t ")
        ) {
          hintLines.push(line);
        } else {
          messageLines.push(line);
        }
      }
      return {
        title: isTitle ? firstLine : "",
        message: messageLines.join("\n").trim(),
        hint: hintLines.join("\n").trim(),
      };
    });
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Resources</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
          Templates, guides, and reference documents
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((resource) => {
          const isExpanded = expandedId === resource.id;
          return (
            <div key={resource.id} style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              overflow: "hidden",
            }}>
              {/* Header — always visible */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : resource.id)}
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 2 }}>
                    {resource.title}
                  </h3>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                    {resource.description}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {resource.audience.map((a) => (
                    <span key={a} style={{
                      fontSize: 9,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      padding: "3px 6px",
                      borderRadius: 4,
                      background: a === "admin" ? "rgba(129,140,248,0.1)" : a === "manager" ? "rgba(251,191,36,0.1)" : "rgba(74,222,128,0.1)",
                      color: a === "admin" ? "#818cf8" : a === "manager" ? "#fbbf24" : "#4ade80",
                    }}>
                      {a}
                    </span>
                  ))}
                  <svg
                    width={16} height={16} viewBox="0 0 24 24" fill="none"
                    stroke="rgba(255,255,255,0.3)" strokeWidth={2}
                    style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {/* Content — expanded */}
              {isExpanded && (
                <div style={{
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  padding: "16px 20px",
                }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    {resource.pdf && (
                      <a
                        href={resource.pdf}
                        download
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 16px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#fff",
                          background: "#818cf8",
                          border: "none",
                          borderRadius: 8,
                          textDecoration: "none",
                          cursor: "pointer",
                        }}
                      >
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download PDF
                      </a>
                    )}
                    {resource.copyable && (
                      <button
                        onClick={() => handleCopy(resource)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 16px",
                          fontSize: 12,
                          fontWeight: 500,
                          color: copied === resource.id ? "#4ade80" : "rgba(255,255,255,0.6)",
                          background: copied === resource.id ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)",
                          border: "none",
                          borderRadius: 8,
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                      >
                        {copied === resource.id ? "Copied!" : "Copy text"}
                      </button>
                    )}
                  </div>
                  {!resource.pdf && (() => {
                    const hasSections = resource.content.includes("\n---\n");
                    if (hasSections) {
                      const sections = parseSections(resource.content);
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          {sections.map((section, idx) => {
                            const sectionKey = `${resource.id}-${idx}`;
                            const isCopied = copiedSection === sectionKey;
                            return (
                              <div key={idx} style={{
                                padding: "12px 14px",
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.06)",
                                borderRadius: 10,
                              }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                                  <div style={{ flex: 1 }}>
                                    {section.title && (
                                      <div style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: "rgba(255,255,255,0.5)",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.5px",
                                        marginBottom: 6,
                                      }}>
                                        {section.title}
                                      </div>
                                    )}
                                    <pre style={{
                                      fontSize: 13,
                                      color: "rgba(255,255,255,0.75)",
                                      lineHeight: 1.7,
                                      whiteSpace: "pre-wrap",
                                      wordBreak: "break-word",
                                      margin: 0,
                                      fontFamily: "inherit",
                                    }}>
                                      {section.message}
                                    </pre>
                                    {section.hint && (
                                      <p style={{
                                        fontSize: 11,
                                        color: "rgba(255,255,255,0.3)",
                                        fontStyle: "italic",
                                        marginTop: 8,
                                        marginBottom: 0,
                                      }}>
                                        {section.hint}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleCopySection(sectionKey, section.message)}
                                    style={{
                                      padding: "4px 10px",
                                      fontSize: 11,
                                      fontWeight: 500,
                                      color: isCopied ? "#4ade80" : "rgba(255,255,255,0.4)",
                                      background: isCopied ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)",
                                      border: "none",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                      whiteSpace: "nowrap",
                                      flexShrink: 0,
                                      transition: "all 0.2s",
                                    }}
                                  >
                                    {isCopied ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }
                    return (
                      <pre style={{
                        fontSize: 13,
                        color: "rgba(255,255,255,0.75)",
                        lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        margin: 0,
                        fontFamily: "inherit",
                      }}>
                        {resource.content}
                      </pre>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
