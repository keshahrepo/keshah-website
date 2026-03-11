"use client";

import { useEffect, useState, useCallback } from "react";

interface ContentCreator {
  id: string;
  name: string;
  email: string;
  videos_per_day: number;
  status: string;
  streak: number;
  access_token: string;
  manager_id: string;
  trial_start_date: string;
  trial_day: number;
  pay_tier: number;
  total_missed_days: number;
  consecutive_missed_days: number;
  auto_cut_flagged: boolean;
}

interface Assignment {
  id: string;
  creator_id: string;
  hook_id: string;
  hook_title: string;
  hook_category: string;
  date: string;
  status: string;
  tiktok_link: string;
  manager_feedback: string;
}

const PAY_TIERS = [
  { value: 400, label: "$400/mo" },
  { value: 700, label: "$700/mo" },
  { value: 1200, label: "$1,200/mo" },
];

export default function AssignmentsPage() {
  const [creators, setCreators] = useState<ContentCreator[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>({});
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState<Record<string, string>>({});
  const [role, setRole] = useState<string>("manager");

  const fetchCreators = useCallback(async () => {
    try {
      const res = await fetch("/api/content-creators");
      if (res.ok) {
        const data = await res.json();
        setCreators(Array.isArray(data) ? data : []);

        const today = new Date().toLocaleDateString("en-CA");
        const assignmentMap: Record<string, Assignment[]> = {};
        await Promise.all(
          (Array.isArray(data) ? data : []).map(async (c: ContentCreator) => {
            const aRes = await fetch(`/api/assignments?creator_id=${c.id}&date=${today}`);
            if (aRes.ok) {
              assignmentMap[c.id] = await aRes.json();
            }
          })
        );
        setAssignments(assignmentMap);
      } else {
        console.error("Content-creators fetch failed:", res.status);
      }
    } catch (err) {
      console.error("Content-creators fetch error:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCreators();
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.role) setRole(d.role);
    }).catch(() => {});
  }, [fetchCreators]);

  async function handleAddCreator(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/content-creators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formName, email: formEmail, password: formPassword }),
    });
    if (res.ok) {
      setShowAddForm(false);
      setFormName("");
      setFormEmail("");
      setFormPassword("");
      fetchCreators();
    }
    setSubmitting(false);
  }

  async function handleFeedback(assignmentId: string) {
    const text = feedbackText[assignmentId];
    if (!text) return;
    await fetch("/api/assignments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: assignmentId, manager_feedback: text }),
    });
    setFeedbackText((prev) => ({ ...prev, [assignmentId]: "" }));
    fetchCreators();
  }

  async function handleCutCreator(creatorId: string) {
    if (!confirm("Cut this creator? They will lose access.")) return;
    await fetch("/api/content-creators", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: creatorId }),
    });
    fetchCreators();
  }

  async function handleGraduate(creatorId: string) {
    if (!confirm("Graduate this creator to paid?")) return;
    await fetch("/api/content-creators", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: creatorId, status: "active", pay_tier: 400 }),
    });
    fetchCreators();
  }

  async function handleUpdateTier(creatorId: string, tier: number) {
    await fetch("/api/content-creators", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: creatorId, pay_tier: tier }),
    });
    fetchCreators();
  }

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

  // Separate creators by status
  const flagged = creators.filter((c) => c.auto_cut_flagged && c.status === "trial");
  const pendingReview = creators.filter((c) => c.status === "pending_review");
  const inTrial = creators.filter((c) => c.status === "trial" && !c.auto_cut_flagged);
  const active = creators.filter((c) => c.status === "active");

  function renderCreatorCard(creator: ContentCreator) {
    const creatorAssignments = assignments[creator.id] || [];
    const completed = creatorAssignments.filter((a) => a.status === "completed").length;
    const total = creatorAssignments.length;
    const isExpanded = selectedCreator === creator.id;
    const isTrial = creator.status === "trial" || creator.status === "pending_review";

    return (
      <div key={creator.id} style={{
        background: creator.auto_cut_flagged ? "rgba(248,113,113,0.04)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${creator.auto_cut_flagged ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 14,
        overflow: "hidden",
      }}>
        <div
          style={{ padding: "16px 20px", cursor: "pointer" }}
          onClick={() => setSelectedCreator(isExpanded ? null : creator.id)}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{creator.name}</span>

              {/* Status pill */}
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 6,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                background: creator.status === "active" ? "rgba(74,222,128,0.1)"
                  : creator.status === "pending_review" ? "rgba(249,115,22,0.1)"
                  : creator.status === "trial" ? "rgba(129,140,248,0.1)"
                  : "rgba(248,113,113,0.1)",
                color: creator.status === "active" ? "#4ade80"
                  : creator.status === "pending_review" ? "#f97316"
                  : creator.status === "trial" ? "#818cf8"
                  : "#f87171",
              }}>
                {creator.status === "pending_review" ? "Review" : creator.status}
              </span>

              {/* Trial day */}
              {isTrial && (
                <span style={{
                  fontSize: 10,
                  color: creator.trial_day > 14 ? "#f97316" : "rgba(255,255,255,0.35)",
                  background: creator.trial_day > 14 ? "rgba(249,115,22,0.1)" : "rgba(255,255,255,0.06)",
                  padding: "3px 8px",
                  borderRadius: 6,
                }}>
                  Day {creator.trial_day} of 14
                </span>
              )}

              {/* Videos per day */}
              <span style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.06)",
                padding: "3px 8px",
                borderRadius: 6,
              }}>
                {creator.videos_per_day} vid/day
              </span>

              {/* Pay tier for active */}
              {creator.status === "active" && creator.pay_tier > 0 && (
                <span style={{
                  fontSize: 10,
                  color: "#4ade80",
                  background: "rgba(74,222,128,0.1)",
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontWeight: 600,
                }}>
                  ${creator.pay_tier}/mo
                </span>
              )}

              {/* Auto-cut flag */}
              {creator.auto_cut_flagged && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#f87171",
                  background: "rgba(248,113,113,0.15)",
                  padding: "3px 8px",
                  borderRadius: 6,
                }}>
                  {creator.consecutive_missed_days >= 2 ? "2 days missed in a row" : `${creator.total_missed_days} days missed total`}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                background: total === 0 ? "rgba(255,255,255,0.04)" : completed === total ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 600,
                color: total === 0 ? "rgba(255,255,255,0.2)" : completed === total ? "#4ade80" : "rgba(255,255,255,0.5)",
              }}>
                {total === 0 ? "--" : `${completed}/${total}`}
              </div>
            </div>
          </div>
        </div>

        {/* Expanded */}
        {isExpanded && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px" }}>
            {/* Actions */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              {/* Graduate button for pending_review */}
              {creator.status === "pending_review" && (
                <>
                  <button
                    onClick={() => handleGraduate(creator.id)}
                    style={{
                      padding: "6px 14px",
                      background: "rgba(74,222,128,0.15)",
                      color: "#4ade80",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Graduate to Paid
                  </button>
                </>
              )}

              {/* Pay tier selector for active */}
              {creator.status === "active" && (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginRight: 4 }}>Tier:</span>
                  {PAY_TIERS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => handleUpdateTier(creator.id, t.value)}
                      style={{
                        padding: "4px 10px",
                        background: creator.pay_tier === t.value ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.04)",
                        color: creator.pay_tier === t.value ? "#4ade80" : "rgba(255,255,255,0.4)",
                        fontSize: 10,
                        fontWeight: 500,
                        borderRadius: 6,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => handleCutCreator(creator.id)}
                style={{
                  padding: "6px 14px",
                  background: "rgba(239,68,68,0.1)",
                  color: "#f87171",
                  fontSize: 11,
                  fontWeight: 500,
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  marginLeft: "auto",
                }}
              >
                Cut Creator
              </button>
            </div>

            {/* Today's assignments detail */}
            {creatorAssignments.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {creatorAssignments.map((a) => (
                  <div key={a.id} style={{
                    background: a.status === "completed" ? "rgba(74,222,128,0.04)" : a.status === "missed" ? "rgba(248,113,113,0.04)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${a.status === "completed" ? "rgba(74,222,128,0.1)" : a.status === "missed" ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 10,
                    padding: "12px 16px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          background: a.status === "completed" ? "#4ade80" : a.status === "missed" ? "#f87171" : "rgba(255,255,255,0.1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          color: a.status === "completed" ? "#000" : a.status === "missed" ? "#fff" : "rgba(255,255,255,0.4)",
                        }}>
                          {a.status === "completed" ? "\u2713" : a.status === "missed" ? "\u2717" : "\u00B7"}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>{a.hook_title}</span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#818cf8",
                        textTransform: "uppercase",
                        background: "rgba(129,140,248,0.1)",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}>
                        {a.hook_category}
                      </span>
                    </div>

                    {a.tiktok_link && (
                      <a
                        href={a.tiktok_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 11, color: "#818cf8", textDecoration: "none", display: "block", marginTop: 4 }}
                      >
                        {a.tiktok_link}
                      </a>
                    )}

                    {a.status === "completed" && (
                      <div style={{ marginTop: 8 }}>
                        {a.manager_feedback ? (
                          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>
                            Feedback: {a.manager_feedback}
                          </p>
                        ) : (
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              placeholder="Add feedback..."
                              value={feedbackText[a.id] || ""}
                              onChange={(e) => setFeedbackText((prev) => ({ ...prev, [a.id]: e.target.value }))}
                              style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleFeedback(a.id); }}
                              disabled={!feedbackText[a.id]}
                              style={{
                                padding: "6px 12px",
                                background: feedbackText[a.id] ? "#fff" : "rgba(255,255,255,0.06)",
                                color: feedbackText[a.id] ? "#000" : "rgba(255,255,255,0.3)",
                                fontSize: 11,
                                fontWeight: 500,
                                borderRadius: 6,
                                border: "none",
                                cursor: feedbackText[a.id] ? "pointer" : "default",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Send
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 12 }}>
                No assignments yet — creator hasn&apos;t opened their link today
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>Manage</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {inTrial.length + flagged.length + pendingReview.length} in trial &middot; {active.length} paid
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: "10px 20px",
            background: showAddForm ? "rgba(255,255,255,0.06)" : "#fff",
            color: showAddForm ? "#fff" : "#000",
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 20,
            border: "none",
            cursor: "pointer",
          }}
        >
          {showAddForm ? "Cancel" : "+ Add Creator"}
        </button>
      </div>

      {/* Add creator form */}
      {showAddForm && (
        <form onSubmit={handleAddCreator} style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 24,
          marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20, color: "#fff" }}>Add Content Creator</h3>
          <div className="grid-responsive-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Sarah Johnson" required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="sarah@example.com" required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Password *</label>
              <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Set a password" required style={inputStyle} />
            </div>
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 16 }}>
            Creator logs in at <strong>/creator/login</strong> with their email + password. Starts at 1 video/day (Week 1), auto-escalates to 2/day (Week 2).
          </p>
          <button
            type="submit"
            disabled={submitting || !formName || !formEmail || !formPassword}
            style={{
              padding: "12px 32px",
              background: submitting || !formName || !formEmail || !formPassword ? "rgba(255,255,255,0.1)" : "#fff",
              color: submitting || !formName || !formEmail || !formPassword ? "rgba(255,255,255,0.3)" : "#000",
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 20,
              border: "none",
              cursor: submitting || !formName || !formEmail || !formPassword ? "default" : "pointer",
            }}
          >
            {submitting ? "Adding..." : "Add Creator"}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, textAlign: "center", padding: 40 }}>Loading...</p>
      ) : creators.length === 0 ? (
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "40px 24px",
          textAlign: "center",
        }}>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            No creators yet. Add your first content creator to get started.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Needs Attention */}
          {flagged.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "#f87171", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Needs Attention ({flagged.length})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {flagged.map(renderCreatorCard)}
              </div>
            </div>
          )}

          {/* Pending Review */}
          {pendingReview.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "#f97316", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Pending Review ({pendingReview.length})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pendingReview.map(renderCreatorCard)}
              </div>
            </div>
          )}

          {/* In Trial */}
          {inTrial.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "#818cf8", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                In Trial ({inTrial.length})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {inTrial.map(renderCreatorCard)}
              </div>
            </div>
          )}

          {/* Paid Creators */}
          {active.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "#4ade80", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Paid ({active.length})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {active.map(renderCreatorCard)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
