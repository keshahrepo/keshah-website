"use client";

import { useEffect, useState, useCallback } from "react";

interface Prospect {
  id: string;
  name: string;
  handle: string;
  platform: string;
  status: string;
  notes: string;
  dm_date: string;
  manager_id: string;
  outreach_type: "warm" | "cold";
  contract_url?: string;
}

const STAGES = [
  { key: "dm_sent", label: "Outreach Sent", color: "rgba(255,255,255,0.4)" },
  { key: "replied", label: "Replied", color: "#818cf8" },
  { key: "video_app_sent", label: "Video App Sent", color: "#f59e0b" },
  { key: "video_received", label: "Video Received", color: "#f97316" },
  { key: "accepted", label: "Accepted", color: "#4ade80" },
  { key: "contract_sent", label: "Contract Sent", color: "#34d399" },
  { key: "trial_started", label: "Trial Started", color: "#22d3ee" },
];

const PLATFORMS = ["tiktok", "instagram", "youtube", "upwork", "other", "n/a"];

function nextStage(current: string): string | null {
  const idx = STAGES.findIndex((s) => s.key === current);
  return idx < STAGES.length - 1 ? STAGES[idx + 1].key : null;
}

function stageInfo(key: string) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

export default function PipelinePage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formHandle, setFormHandle] = useState("");
  const [formPlatform, setFormPlatform] = useState("tiktok");
  const [formNotes, setFormNotes] = useState("");
  const [formOutreachType, setFormOutreachType] = useState<"warm" | "cold">("cold");
  const [submitting, setSubmitting] = useState(false);
  const [filterStage, setFilterStage] = useState("all");
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [sendingContract, setSendingContract] = useState<string | null>(null);
  const [contractLink, setContractLink] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [creatingAccount, setCreatingAccount] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({ email: "", password: "" });
  const [accountError, setAccountError] = useState("");

  const fetchProspects = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline");
      if (res.ok) {
        setProspects(await res.json());
      } else {
        console.error("Pipeline fetch failed:", res.status);
      }
    } catch (err) {
      console.error("Pipeline fetch error:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, handle: formHandle, platform: formPlatform, notes: formNotes, outreach_type: formOutreachType, client_date: new Date().toLocaleDateString("en-CA") }),
      });
      if (res.ok) {
        setShowForm(false);
        setFormName("");
        setFormHandle("");
        setFormPlatform("tiktok");
        setFormNotes("");
        setFormOutreachType("cold");
        fetchProspects();
      } else {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || `Failed to add (${res.status})`);
      }
    } catch (err) {
      setFormError("Network error — check your connection");
    }
    setSubmitting(false);
  }

  async function handleAdvance(id: string, _currentStatus: string, targetStage?: string) {
    const next = targetStage || nextStage(_currentStatus);
    if (!next) return;
    await fetch("/api/pipeline", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    fetchProspects();
  }

  async function handleSaveNotes(id: string) {
    await fetch("/api/pipeline", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, notes: noteText }),
    });
    setEditingNotes(null);
    fetchProspects();
  }

  async function handleSendContract(prospect: Prospect) {
    setSendingContract(prospect.id);
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: "creator-trial",
        recipient_name: prospect.name,
        recipient_email: prospect.handle || `${prospect.name.toLowerCase().replace(/\s+/g, "")}@placeholder.com`,
        pipeline_id: prospect.id,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const fullUrl = `${window.location.origin}${data.signing_url}`;
      navigator.clipboard.writeText(fullUrl);
      setContractLink(fullUrl);
      // Advance to contract_sent and store signing URL
      await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: prospect.id, status: "contract_sent", contract_url: fullUrl }),
      });
      fetchProspects();
      setTimeout(() => setContractLink(null), 5000);
    }
    setSendingContract(null);
  }

  async function handleReject(id: string) {
    if (!confirm("Reject this prospect? They'll be removed from the pipeline.")) return;
    await fetch("/api/pipeline", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "rejected" }),
    });
    // Deactivate so they don't show in the pipeline
    await fetch("/api/pipeline", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchProspects();
  }

  async function handleCreateAccount(prospect: Prospect) {
    if (!accountForm.email || !accountForm.password) {
      setAccountError("Email and password are required");
      return;
    }
    setAccountError("");
    const res = await fetch("/api/content-creators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: prospect.name,
        email: accountForm.email,
        password: accountForm.password,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAccountError(data.error || "Failed to create account");
      return;
    }
    // Deactivate from pipeline
    await fetch("/api/pipeline", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: prospect.id }),
    });
    setCreatingAccount(null);
    setAccountForm({ email: "", password: "" });
    fetchProspects();
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this prospect?")) return;
    await fetch("/api/pipeline", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchProspects();
  }

  const stageCounts = STAGES.map((s) => ({
    ...s,
    count: prospects.filter((p) => p.status === s.key).length,
  }));

  const filtered = filterStage === "all" ? prospects : prospects.filter((p) => p.status === filterStage);

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
          <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>Pipeline</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {prospects.length} prospects in pipeline
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
          {showForm ? "Cancel" : "+ Log Outreach"}
        </button>
      </div>

      {/* Contract link copied banner */}
      {contractLink && (
        <div style={{
          padding: "12px 16px",
          background: "rgba(129,140,248,0.1)",
          border: "1px solid rgba(129,140,248,0.2)",
          borderRadius: 10,
          marginBottom: 16,
          fontSize: 12,
          color: "#818cf8",
        }}>
          Contract signing link copied to clipboard! Send it to the creator.
        </div>
      )}

      {/* Filter tabs */}
      <div style={{
        display: "flex",
        gap: 6,
        marginBottom: 20,
        flexWrap: "wrap",
      }}>
        <button
          onClick={() => setFilterStage("all")}
          style={{
            padding: "6px 14px",
            borderRadius: 20,
            border: "none",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            background: filterStage === "all" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
            color: filterStage === "all" ? "#fff" : "rgba(255,255,255,0.4)",
          }}
        >
          All ({prospects.length})
        </button>
        {stageCounts.map((s) => (
          <button
            key={s.key}
            onClick={() => setFilterStage(filterStage === s.key ? "all" : s.key)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: "none",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              background: filterStage === s.key ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
              color: filterStage === s.key ? "#fff" : "rgba(255,255,255,0.4)",
            }}
          >
            {s.label} {s.count > 0 ? `(${s.count})` : ""}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 24,
          marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20, color: "#fff" }}>Log New Outreach</h3>
          {/* Warm / Cold toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["warm", "cold"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFormOutreachType(t)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: formOutreachType === t
                    ? (t === "warm" ? "rgba(251,191,36,0.15)" : "rgba(129,140,248,0.15)")
                    : "rgba(255,255,255,0.04)",
                  color: formOutreachType === t
                    ? (t === "warm" ? "#fbbf24" : "#818cf8")
                    : "rgba(255,255,255,0.3)",
                }}
              >
                {t === "warm" ? "Warm" : "Cold"}
              </button>
            ))}
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", alignSelf: "center", marginLeft: 4 }}>
              {formOutreachType === "warm" ? "Someone you know or were referred to" : "Found online, no prior connection"}
            </span>
          </div>
          <div className="grid-responsive-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Creator name" required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Handle</label>
              <input value={formHandle} onChange={(e) => setFormHandle(e.target.value)} placeholder="@handle" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Platform</label>
              <select value={formPlatform} onChange={(e) => setFormPlatform(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p} style={{ background: "#1a1a1a" }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Notes</label>
            <input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Warm lead, mutual friend, etc." style={inputStyle} />
          </div>
          {formError && (
            <p style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{formError}</p>
          )}
          <button
            type="submit"
            disabled={submitting || !formName}
            style={{
              padding: "12px 32px",
              background: submitting || !formName ? "rgba(255,255,255,0.1)" : "#fff",
              color: submitting || !formName ? "rgba(255,255,255,0.3)" : "#000",
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 20,
              border: "none",
              cursor: submitting || !formName ? "default" : "pointer",
            }}
          >
            {submitting ? "Adding..." : "Log Outreach"}
          </button>
        </form>
      )}

      {/* Prospects list */}
      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, textAlign: "center", padding: 40 }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "40px 24px",
          textAlign: "center",
        }}>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            {filterStage === "all" ? "No prospects yet. Log your first outreach to get started." : "No prospects at this stage."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((p) => {
            const currentIdx = STAGES.findIndex((s) => s.key === p.status);
            const stage = stageInfo(p.status);

            return (
              <div key={p.id} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                padding: "16px 20px",
              }}>
                {/* Top row: name, tags, utility buttons */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{p.name}</span>
                    {p.handle && (
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{p.handle}</span>
                    )}
                    <span style={{
                      fontSize: 9,
                      color: "rgba(255,255,255,0.25)",
                      background: "rgba(255,255,255,0.06)",
                      padding: "3px 8px",
                      borderRadius: 4,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}>
                      {p.platform}
                    </span>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 4,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      background: p.outreach_type === "warm" ? "rgba(251,191,36,0.1)" : "rgba(129,140,248,0.1)",
                      color: p.outreach_type === "warm" ? "#fbbf24" : "#818cf8",
                    }}>
                      {p.outreach_type === "warm" ? "warm" : "cold"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      onClick={() => {
                        if (editingNotes === p.id) {
                          setEditingNotes(null);
                        } else {
                          setEditingNotes(p.id);
                          setNoteText(p.notes || "");
                        }
                      }}
                      style={{
                        padding: "4px 10px",
                        background: "rgba(255,255,255,0.06)",
                        border: "none",
                        borderRadius: 6,
                        color: "rgba(255,255,255,0.4)",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      {editingNotes === p.id ? "Close" : "Notes"}
                    </button>
                    <button
                      onClick={() => handleRemove(p.id)}
                      style={{
                        padding: "4px 8px",
                        background: "rgba(239,68,68,0.08)",
                        border: "none",
                        borderRadius: 6,
                        color: "#f87171",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      &times;
                    </button>
                  </div>
                </div>

                {/* Stage progress bar */}
                <div style={{ display: "flex", gap: 3 }}>
                  {STAGES.map((s, i) => {
                    const isActive = i <= currentIdx;
                    const isCurrent = i === currentIdx;
                    const isClickable = s.key !== "accepted" && s.key !== "contract_sent" && s.key !== "trial_started" && i !== currentIdx;

                    return (
                      <button
                        key={s.key}
                        onClick={() => {
                          if (!isClickable) return;
                          handleAdvance(p.id, p.status, s.key);
                        }}
                        title={isClickable ? `Move to ${s.label}` : s.label}
                        style={{
                          flex: 1,
                          height: 32,
                          borderRadius: i === 0 ? "6px 2px 2px 6px" : i === STAGES.length - 1 ? "2px 6px 6px 2px" : 2,
                          border: "none",
                          background: isActive ? stage.color : "rgba(255,255,255,0.06)",
                          opacity: isActive ? (isCurrent ? 1 : 0.35) : 1,
                          cursor: isClickable ? "pointer" : "default",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "opacity 0.15s, background 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          if (isClickable) (e.currentTarget as HTMLButtonElement).style.opacity = "0.8";
                        }}
                        onMouseLeave={(e) => {
                          if (isClickable) (e.currentTarget as HTMLButtonElement).style.opacity = isActive ? (isCurrent ? "1" : "0.35") : "1";
                        }}
                      >
                        <span style={{
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: "0.3px",
                          textTransform: "uppercase",
                          color: isActive ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.25)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          padding: "0 2px",
                        }}>
                          {s.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Action CTA — prominent, below stage bar */}
                {p.status === "video_received" && (
                  <div style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 14,
                    padding: "12px 16px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 10,
                    alignItems: "center",
                  }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 1 }}>
                      Video received — review and decide
                    </span>
                    <button
                      onClick={() => handleAdvance(p.id, p.status, "accepted")}
                      style={{
                        padding: "8px 24px",
                        background: "rgba(74,222,128,0.15)",
                        color: "#4ade80",
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: 8,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleReject(p.id)}
                      style={{
                        padding: "8px 24px",
                        background: "rgba(239,68,68,0.1)",
                        color: "#f87171",
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: 8,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Reject
                    </button>
                  </div>
                )}

                {p.status === "accepted" && (
                  <div style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 14,
                    padding: "12px 16px",
                    background: "rgba(129,140,248,0.05)",
                    borderRadius: 10,
                    alignItems: "center",
                  }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 1 }}>
                      Accepted — send the trial contract
                    </span>
                    <button
                      onClick={() => handleSendContract(p)}
                      disabled={sendingContract === p.id}
                      style={{
                        padding: "8px 24px",
                        background: "rgba(129,140,248,0.15)",
                        color: "#818cf8",
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: 8,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {sendingContract === p.id ? "Sending..." : "Send Contract"}
                    </button>
                  </div>
                )}

                {p.status === "contract_sent" && (() => {
                  const rawUrl = p.contract_url || "";
                  const fullUrl = rawUrl.startsWith("http") ? rawUrl : rawUrl ? `${window.location.origin}${rawUrl}` : "";
                  return (
                    <div style={{
                      marginTop: 14,
                      padding: "12px 16px",
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: 10,
                      fontSize: 12,
                    }}>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontStyle: "italic", marginBottom: fullUrl ? 10 : 0 }}>
                        Waiting for contract signature...
                      </div>
                      {fullUrl && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            readOnly
                            value={fullUrl}
                            style={{
                              flex: 1,
                              padding: "6px 10px",
                              fontSize: 11,
                              color: "rgba(255,255,255,0.6)",
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 6,
                              outline: "none",
                              fontFamily: "monospace",
                            }}
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                          />
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(fullUrl);
                              setContractLink(fullUrl);
                              setTimeout(() => setContractLink(null), 2000);
                            }}
                            style={{
                              padding: "6px 12px",
                              fontSize: 11,
                              fontWeight: 600,
                              color: contractLink === fullUrl ? "#4ade80" : "rgba(255,255,255,0.5)",
                              background: contractLink === fullUrl ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)",
                              border: "none",
                              borderRadius: 6,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {contractLink === fullUrl ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {p.status === "trial_started" && (
                  <div style={{
                    marginTop: 14,
                    padding: "14px 16px",
                    background: "rgba(34,211,238,0.05)",
                    border: "1px solid rgba(34,211,238,0.12)",
                    borderRadius: 10,
                  }}>
                    {creatingAccount !== p.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 1 }}>
                          Contract signed — create their creator account to start the trial
                        </span>
                        <button
                          onClick={() => {
                            setCreatingAccount(p.id);
                            setAccountForm({ email: "", password: "" });
                            setAccountError("");
                          }}
                          style={{
                            padding: "8px 24px",
                            background: "#22d3ee",
                            color: "#000",
                            fontSize: 13,
                            fontWeight: 600,
                            borderRadius: 8,
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Create Account
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
                          Set up login credentials for <strong style={{ color: "#fff" }}>{p.name}</strong>. They&apos;ll sign in at /creator/login.
                        </p>
                        <div className="flex-stack-mobile" style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                          <input
                            type="email"
                            value={accountForm.email}
                            onChange={(e) => setAccountForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder="Email"
                            style={{ ...inputStyle, fontSize: 13, padding: "10px 12px", flex: 1 }}
                          />
                          <input
                            type="text"
                            value={accountForm.password}
                            onChange={(e) => setAccountForm((f) => ({ ...f, password: e.target.value }))}
                            placeholder="Password"
                            style={{ ...inputStyle, fontSize: 13, padding: "10px 12px", flex: 1 }}
                          />
                        </div>
                        {accountError && (
                          <p style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>{accountError}</p>
                        )}
                        <div className="flex-stack-mobile" style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => handleCreateAccount(p)}
                            disabled={!accountForm.email || !accountForm.password}
                            style={{
                              padding: "8px 20px",
                              background: !accountForm.email || !accountForm.password ? "rgba(255,255,255,0.1)" : "#22d3ee",
                              color: !accountForm.email || !accountForm.password ? "rgba(255,255,255,0.3)" : "#000",
                              fontSize: 12,
                              fontWeight: 600,
                              borderRadius: 8,
                              border: "none",
                              cursor: !accountForm.email || !accountForm.password ? "default" : "pointer",
                            }}
                          >
                            Create Account & Start Trial
                          </button>
                          <button
                            onClick={() => setCreatingAccount(null)}
                            style={{
                              padding: "8px 16px",
                              background: "rgba(255,255,255,0.06)",
                              color: "rgba(255,255,255,0.4)",
                              fontSize: 12,
                              fontWeight: 500,
                              borderRadius: 8,
                              border: "none",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes display */}
                {p.notes && editingNotes !== p.id && (
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 10 }}>{p.notes}</p>
                )}

                {/* Edit notes */}
                {editingNotes === p.id && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <input
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add notes..."
                      style={{ ...inputStyle, fontSize: 12, padding: "8px 12px" }}
                    />
                    <button
                      onClick={() => handleSaveNotes(p.id)}
                      style={{
                        padding: "8px 16px",
                        background: "#fff",
                        color: "#000",
                        fontSize: 12,
                        fontWeight: 500,
                        borderRadius: 8,
                        border: "none",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Save
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
