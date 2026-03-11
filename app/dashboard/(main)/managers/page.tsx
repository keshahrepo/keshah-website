"use client";

import { useEffect, useState, useCallback } from "react";

interface Manager {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string | null;
}

interface DailyActivity {
  date: string;
  tasks_completed: number;
  total_required: number;
  completed_tasks: string[];
  dms_sent: number;
}

interface ManagerBreakdown {
  id: string;
  name: string;
  email: string;
  days_active: number;
  target_30day: { trials_started: number; target: number; days_remaining: number };
  daily_activity: DailyActivity[];
  creators: {
    in_trial: number; in_trial_names: string[];
    active_paid: number; active_paid_names: string[];
    pending_review: number; pending_review_names: string[];
    flagged: number; flagged_names: string[];
    total: number;
  };
  pipeline: {
    total_prospects: number; dm_sent: number; replied: number;
    video_app_sent: number; video_received: number;
    contract_sent: number; trial_started: number;
  };
}

interface AdminOverview {
  totals: Record<string, number>;
  managers: ManagerBreakdown[];
}

const TASK_LABELS: Record<string, string> = {
  check_posts: "Check posts",
  feedback: "Feedback",
  warm_outreach: "Warm outreach",
  cold_outreach: "Cold outreach",
  follow_ups: "Follow-ups",
  pipeline_update: "Pipeline",
};

export default function ManagersPage() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [managersRes, overviewRes] = await Promise.all([
        fetch("/api/managers"),
        fetch("/api/admin/overview"),
      ]);

      if (managersRes.ok) {
        const data = await managersRes.json();
        if (Array.isArray(data)) {
          setManagers(data.filter((m: Manager) => m.is_active));
        }
      }

      if (overviewRes.ok) {
        const data = await overviewRes.json();
        if (!data.error) setOverview(data);
      }
    } catch (err) {
      console.error("Failed to fetch:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/managers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formName, email: formEmail, password: formPassword }),
    });
    if (res.ok) {
      setShowForm(false);
      setFormName("");
      setFormEmail("");
      setFormPassword("");
      fetchData();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to create");
    }
    setSubmitting(false);
  }

  async function handleDeactivate(id: string) {
    if (!confirm("Deactivate this manager?")) return;
    await fetch("/api/managers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchData();
  }

  function getBreakdown(managerId: string): ManagerBreakdown | null {
    return overview?.managers.find((m) => m.id === managerId) || null;
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>Managers</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            Manage content managers who run creator teams
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
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
          {showForm ? "Cancel" : "+ Add Manager"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 24,
          marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20, color: "#fff" }}>
            Add New Manager
          </h3>
          <div className="grid-responsive-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Samia" required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="samia@keshah.com" required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Password *</label>
              <input type="text" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Set a password" required style={inputStyle} />
            </div>
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 16 }}>
            Manager will log in with their email + password at the dashboard login page.
          </p>
          <button
            type="submit"
            disabled={submitting || !formName || !formEmail || !formPassword}
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
            {submitting ? "Creating..." : "Create Manager"}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, textAlign: "center", padding: 40 }}>Loading...</p>
      ) : managers.length === 0 ? (
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "40px 24px",
          textAlign: "center",
        }}>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            No managers yet. Add your first manager to get started.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {managers.map((m) => {
            const bd = getBreakdown(m.id);
            const isExpanded = expandedId === m.id;

            return (
              <div key={m.id} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                overflow: "hidden",
              }}>
                {/* Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
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
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{m.name}</h3>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                      {m.email}
                      {m.created_at && <> &middot; Added {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>}
                      {bd && <> &middot; {bd.days_active}d active</>}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {bd && (
                      <div style={{ display: "flex", gap: 12, marginRight: 8 }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#fbbf24" }}>{bd.creators.in_trial}</div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>trial</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#4ade80" }}>{bd.creators.active_paid}</div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>paid</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>{bd.pipeline.total_prospects}</div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>pipeline</div>
                        </div>
                      </div>
                    )}
                    <svg
                      width={14} height={14} viewBox="0 0 24 24" fill="none"
                      stroke="rgba(255,255,255,0.3)" strokeWidth={2}
                      style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && bd && (() => {
                  const daysToShow = Math.min(bd.days_active + 1, 14);
                  const visibleDays = [...bd.daily_activity].reverse().slice(14 - daysToShow);

                  // Metrics
                  const totalDMs = bd.daily_activity.reduce((s, d) => s + d.dms_sent, 0);
                  const thisWeekDMs = bd.daily_activity.slice(0, 7).reduce((s, d) => s + d.dms_sent, 0);
                  const daysMissed = visibleDays.filter((d) => d.tasks_completed === 0 && d.dms_sent === 0).length;
                  const replied = bd.pipeline.replied + bd.pipeline.video_app_sent + bd.pipeline.video_received + bd.pipeline.contract_sent;
                  const totalProspects = bd.pipeline.total_prospects + bd.pipeline.trial_started;
                  const replyRate = totalProspects > 0 ? Math.round((replied / totalProspects) * 100) : 0;

                  return (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px" }}>

                    {/* Summary metrics row */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
                      gap: 8,
                      marginBottom: 20,
                    }}>
                      {[
                        { label: "DMs this week", value: thisWeekDMs, color: "#818cf8" },
                        { label: "Total DMs", value: totalDMs, color: "#818cf8" },
                        { label: "Reply rate", value: `${replyRate}%`, color: replyRate >= 15 ? "#4ade80" : replyRate >= 5 ? "#fbbf24" : "rgba(255,255,255,0.4)" },
                        { label: "Days missed", value: daysMissed, color: daysMissed === 0 ? "#4ade80" : daysMissed <= 2 ? "#fbbf24" : "#f87171" },
                      ].map((s) => (
                        <div key={s.label} style={{
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 10,
                          padding: "12px 10px",
                          textAlign: "center",
                        }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Conversion funnel */}
                    <div style={{ marginBottom: 20 }}>
                      <h4 style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Funnel
                      </h4>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {[
                          { label: "DMs", value: totalProspects, color: "rgba(255,255,255,0.5)" },
                          { label: "Replied", value: bd.pipeline.replied, color: "#818cf8" },
                          { label: "Video", value: bd.pipeline.video_app_sent + bd.pipeline.video_received, color: "#fbbf24" },
                          { label: "Trials", value: bd.creators.in_trial + bd.creators.pending_review, color: "#fb923c" },
                          { label: "Paid", value: bd.creators.active_paid, color: "#4ade80" },
                        ].map((step, i) => (
                          <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {i > 0 && <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 12 }}>&rarr;</span>}
                            <div style={{ textAlign: "center", minWidth: 45 }}>
                              <div style={{ fontSize: 16, fontWeight: 700, color: step.color }}>{step.value}</div>
                              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{step.label}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Daily Activity — only show days since manager started */}
                    <div style={{ marginBottom: 20 }}>
                      <h4 style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Daily Activity {daysToShow < 14 ? `(${daysToShow} day${daysToShow !== 1 ? "s" : ""})` : "(last 14 days)"}
                      </h4>
                      <div style={{ display: "flex", gap: 4, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
                        {visibleDays.map((day) => {
                          const pct = day.total_required > 0 ? day.tasks_completed / day.total_required : 0;
                          const isToday = day.date === new Date().toLocaleDateString("en-CA");
                          const dayLabel = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
                          const dateLabel = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

                          let bg = "rgba(255,255,255,0.04)";
                          let borderColor = "rgba(255,255,255,0.06)";
                          if (pct >= 1) { bg = "rgba(74,222,128,0.15)"; borderColor = "rgba(74,222,128,0.3)"; }
                          else if (pct > 0 || day.dms_sent > 0) { bg = "rgba(251,191,36,0.12)"; borderColor = "rgba(251,191,36,0.25)"; }

                          return (
                            <div
                              key={day.date}
                              title={`${dateLabel}\nDMs sent: ${day.dms_sent}\nTasks: ${day.tasks_completed}/${day.total_required}${day.completed_tasks.length > 0 ? "\n" + day.completed_tasks.map((t) => TASK_LABELS[t] || t).join(", ") : ""}`}
                              style={{
                                width: 52,
                                minWidth: 52,
                                flexShrink: 0,
                                padding: "8px 4px",
                                background: bg,
                                border: `1px solid ${isToday ? "#818cf8" : borderColor}`,
                                borderRadius: 8,
                                textAlign: "center",
                                cursor: "default",
                              }}
                            >
                              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 1 }}>{dayLabel}</div>
                              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginBottom: 2 }}>{new Date(day.date + "T12:00:00").getDate()}</div>
                              <div style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: day.dms_sent > 0 ? "#818cf8" : "rgba(255,255,255,0.15)",
                              }}>
                                {day.dms_sent}
                              </div>
                              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>DMs</div>
                              <div style={{
                                fontSize: 9,
                                color: pct >= 1 ? "#4ade80" : pct > 0 ? "#fbbf24" : "rgba(255,255,255,0.15)",
                                marginTop: 2,
                              }}>
                                {day.tasks_completed}/{day.total_required}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", marginRight: 4, verticalAlign: "middle" }} />
                          All done
                        </span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", marginRight: 4, verticalAlign: "middle" }} />
                          Some done
                        </span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", marginRight: 4, verticalAlign: "middle" }} />
                          Nothing
                        </span>
                      </div>
                    </div>

                    {/* 30-day target */}
                    {bd.target_30day.days_remaining > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>
                            30-day target: {bd.target_30day.trials_started}/10 trials started
                          </span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                            {bd.target_30day.days_remaining}d remaining
                          </span>
                        </div>
                        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                          <div style={{
                            height: 6,
                            background: bd.target_30day.trials_started >= 10 ? "#4ade80" : bd.target_30day.trials_started >= 5 ? "#fbbf24" : "#f87171",
                            borderRadius: 3,
                            width: `${Math.min(100, Math.round((bd.target_30day.trials_started / 10) * 100))}%`,
                            transition: "width 0.3s",
                          }} />
                        </div>
                      </div>
                    )}

                    {/* Creators */}
                    <div style={{ marginBottom: 16 }}>
                      <h4 style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Creators ({bd.creators.total})
                      </h4>
                      {bd.creators.total === 0 ? (
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No creators yet</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {bd.creators.in_trial_names.map((name) => (
                            <div key={`trial-${name}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                              <span style={{ fontSize: 13, color: "#fff" }}>{name}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#fbbf24", textTransform: "uppercase" }}>trial</span>
                            </div>
                          ))}
                          {bd.creators.active_paid_names.map((name) => (
                            <div key={`paid-${name}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                              <span style={{ fontSize: 13, color: "#fff" }}>{name}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#4ade80", textTransform: "uppercase" }}>paid</span>
                            </div>
                          ))}
                          {bd.creators.pending_review_names.map((name) => (
                            <div key={`review-${name}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                              <span style={{ fontSize: 13, color: "#fff" }}>{name}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#fb923c", textTransform: "uppercase" }}>pending review</span>
                            </div>
                          ))}
                          {bd.creators.flagged_names.map((name) => (
                            <div key={`flag-${name}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "rgba(248,113,113,0.05)", borderRadius: 6 }}>
                              <span style={{ fontSize: 13, color: "#fff" }}>{name}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#f87171", textTransform: "uppercase" }}>flagged</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Pipeline */}
                    <div style={{ marginBottom: 16 }}>
                      <h4 style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Pipeline
                      </h4>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {[
                          { label: "Prospects", value: bd.pipeline.total_prospects },
                          { label: "DM sent", value: bd.pipeline.dm_sent },
                          { label: "Replied", value: bd.pipeline.replied },
                          { label: "Video app", value: bd.pipeline.video_app_sent },
                          { label: "Video recv", value: bd.pipeline.video_received },
                          { label: "Contract", value: bd.pipeline.contract_sent },
                        ].map((s) => (
                          <div key={s.label} style={{ minWidth: 55, textAlign: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{s.value}</div>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Remove button */}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
                      <button
                        onClick={() => handleDeactivate(m.id)}
                        style={{
                          padding: "6px 14px",
                          background: "rgba(239,68,68,0.1)",
                          color: "#f87171",
                          fontSize: 11,
                          fontWeight: 500,
                          borderRadius: 8,
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Remove Manager
                      </button>
                    </div>
                  </div>
                  );
                })()}

                {/* Collapsed — no breakdown data yet */}
                {isExpanded && !bd && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px" }}>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No activity data available</p>
                    <button
                      onClick={() => handleDeactivate(m.id)}
                      style={{
                        marginTop: 12,
                        padding: "6px 14px",
                        background: "rgba(239,68,68,0.1)",
                        color: "#f87171",
                        fontSize: 11,
                        fontWeight: 500,
                        borderRadius: 8,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Remove Manager
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
