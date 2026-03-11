"use client";

import { useEffect, useState, useCallback } from "react";

interface Hook {
  id: string;
  title: string;
  category: string;
  talking_points: string[];
  core_message: string;
  reference_video_url: string;
  views: number;
}

const CATEGORIES = [
  "Pinch Test",
  "Anti-Drug",
  "Science Explainer",
  "Personal Story",
  "Drawing/Visual",
  "Technique Demo",
  "Minoxidil Debunk",
  "Authority",
  "Self-Diagnosis",
  "Protocol Reveal",
  "Other",
];

export default function HooksPage() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingHook, setEditingHook] = useState<Hook | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("Pinch Test");
  const [formTalkingPoints, setFormTalkingPoints] = useState("");
  const [formCoreMessage, setFormCoreMessage] = useState("");
  const [formRefUrl, setFormRefUrl] = useState("");
  const [formViews, setFormViews] = useState(0);

  const fetchHooks = useCallback(async () => {
    const res = await fetch("/api/hooks");
    if (res.ok) setHooks(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchHooks(); }, [fetchHooks]);

  function resetForm() {
    setFormTitle("");
    setFormCategory("Pinch Test");
    setFormTalkingPoints("");
    setFormCoreMessage("");
    setFormRefUrl("");
    setFormViews(0);
  }

  function openEdit(hook: Hook) {
    setEditingHook(hook);
    setFormTitle(hook.title);
    setFormCategory(hook.category);
    setFormTalkingPoints(hook.talking_points.join("\n"));
    setFormCoreMessage(hook.core_message);
    setFormRefUrl(hook.reference_video_url);
    setFormViews(hook.views);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const hookData = {
      title: formTitle,
      category: formCategory,
      talking_points: formTalkingPoints.split("\n").map((s) => s.trim()).filter(Boolean),
      core_message: formCoreMessage,
      reference_video_url: formRefUrl,
      views: formViews,
    };

    if (editingHook) {
      await fetch("/api/hooks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingHook.id, ...hookData }),
      });
    } else {
      await fetch("/api/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hookData),
      });
    }

    setShowForm(false);
    setEditingHook(null);
    resetForm();
    fetchHooks();
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this hook?")) return;
    await fetch("/api/hooks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchHooks();
  }

  const categories = ["all", ...new Set(hooks.map((h) => h.category))];
  const filtered = filterCategory === "all" ? hooks : hooks.filter((h) => h.category === filterCategory);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    color: "#fff",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 6,
    display: "block",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>Hook Database</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {hooks.length} hooks across {new Set(hooks.map((h) => h.category)).size} categories
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm && editingHook) {
              setEditingHook(null);
              resetForm();
            }
            setShowForm(!showForm);
          }}
          style={{
            padding: "10px 20px",
            background: showForm ? "rgba(255,255,255,0.06)" : "#fff",
            color: showForm ? "#fff" : "#000",
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 20,
            border: "none",
            cursor: "pointer",
          }}
        >
          {showForm ? "Cancel" : "+ Add Hook"}
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 24,
          marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20, color: "#fff" }}>
            {editingHook ? "Edit Hook" : "Add New Hook"}
          </h3>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Hook Title *</label>
            <input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={'e.g. "If you\'re losing hair, pinch your scalp..."'}
              required
              style={inputStyle}
            />
          </div>

          <div className="grid-responsive-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Category *</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} style={{ background: "#1a1a1a" }}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Views (reference)</label>
              <input
                type="number"
                value={formViews || ""}
                onChange={(e) => setFormViews(parseInt(e.target.value) || 0)}
                placeholder="0"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Talking Points (one per line)</label>
            <textarea
              value={formTalkingPoints}
              onChange={(e) => setFormTalkingPoints(e.target.value)}
              placeholder={"Scalp tightness causes hair loss\nPinch test proves it\nBlood flow is restricted"}
              rows={4}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Core Message</label>
            <input
              value={formCoreMessage}
              onChange={(e) => setFormCoreMessage(e.target.value)}
              placeholder="One sentence summary of the video's main point"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Reference Video URL</label>
            <input
              value={formRefUrl}
              onChange={(e) => setFormRefUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@keshah_us/video/..."
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !formTitle}
            style={{
              padding: "12px 32px",
              background: submitting ? "rgba(255,255,255,0.1)" : "#fff",
              color: submitting ? "rgba(255,255,255,0.3)" : "#000",
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 20,
              border: "none",
              cursor: submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "Saving..." : editingHook ? "Save Changes" : "Add Hook"}
          </button>
        </form>
      )}

      {/* Category filter */}
      {!loading && hooks.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              style={{
                padding: "6px 14px",
                background: filterCategory === c ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                color: filterCategory === c ? "#fff" : "rgba(255,255,255,0.4)",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 20,
                border: "none",
                cursor: "pointer",
                textTransform: c === "all" ? "uppercase" : "none",
              }}
            >
              {c === "all" ? "All" : c}
              {c !== "all" && (
                <span style={{ marginLeft: 4, opacity: 0.5 }}>
                  {hooks.filter((h) => h.category === c).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Hooks list */}
      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, textAlign: "center", padding: 40 }}>Loading...</p>
      ) : hooks.length === 0 ? (
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "40px 24px",
          textAlign: "center",
        }}>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            No hooks yet. Add your first hook or import from CSV.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((hook) => (
            <div key={hook.id} style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: "14px 18px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#818cf8",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      background: "rgba(129,140,248,0.1)",
                      padding: "2px 8px",
                      borderRadius: 4,
                    }}>
                      {hook.category}
                    </span>
                    {hook.views > 0 && (
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                        {hook.views >= 1000000 ? `${(hook.views / 1000000).toFixed(1)}M` : hook.views >= 1000 ? `${(hook.views / 1000).toFixed(1)}K` : hook.views} views
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "#fff", lineHeight: 1.4 }}>
                    {hook.title}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6, marginLeft: 12 }}>
                  <button
                    onClick={() => openEdit(hook)}
                    style={{
                      padding: "4px 10px",
                      background: "rgba(255,255,255,0.06)",
                      border: "none",
                      borderRadius: 6,
                      color: "rgba(255,255,255,0.5)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(hook.id)}
                    style={{
                      padding: "4px 10px",
                      background: "rgba(239,68,68,0.1)",
                      border: "none",
                      borderRadius: 6,
                      color: "#f87171",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Talking points preview */}
              {hook.talking_points.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {hook.talking_points.slice(0, 3).map((point, i) => (
                    <p key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>
                      &bull; {point}
                    </p>
                  ))}
                  {hook.talking_points.length > 3 && (
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
                      +{hook.talking_points.length - 3} more
                    </p>
                  )}
                </div>
              )}

              {hook.reference_video_url && (
                <a
                  href={hook.reference_video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 10, color: "#818cf8", textDecoration: "none", display: "inline-block", marginTop: 4 }}
                >
                  Reference video &rarr;
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
