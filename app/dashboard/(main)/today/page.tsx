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
  outreach_type?: "warm" | "cold";
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

interface Creator {
  id: string;
  name: string;
  status: string;
  streak: number;
  videos_per_day: number;
  trial_day?: number;
  total_missed_days: number;
  consecutive_missed_days: number;
  auto_cut_flagged: boolean;
  access_token: string;
}

interface ManagerBreakdown {
  id: string;
  name: string;
  email: string;
  days_active: number;
  target_30day: { trials_started: number; target: number; days_remaining: number };
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
  totals: {
    managers: number; creators_in_trial: number; creators_active_paid: number;
    creators_pending_review: number; creators_flagged: number;
    total_creators: number; total_prospects: number;
  };
  managers: ManagerBreakdown[];
}

type BlockKey = "check_posts" | "feedback" | "warm_outreach" | "cold_outreach" | "follow_ups" | "pipeline_update";

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
}
const TODAY = localDate(0);
const YESTERDAY = localDate(-1);

export default function TodayPage() {
  const [role, setRole] = useState<string>("");
  const [creators, setCreators] = useState<Creator[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [todayAssignments, setTodayAssignments] = useState<Record<string, Assignment[]>>({});
  const [yesterdayAssignments, setYesterdayAssignments] = useState<Record<string, Assignment[]>>({});
  const [loading, setLoading] = useState(true);
  const [completedBlocks, setCompletedBlocks] = useState<Set<BlockKey>>(new Set());
  const [feedbackInputs, setFeedbackInputs] = useState<Record<string, string>>({});
  const [savingFeedback, setSavingFeedback] = useState<string | null>(null);

  // Admin state
  const [adminData, setAdminData] = useState<AdminOverview | null>(null);
  const [expandedManager, setExpandedManager] = useState<string | null>(null);

  // Quick-add prospect
  const [showAddProspect, setShowAddProspect] = useState(false);
  const [newProspect, setNewProspect] = useState({ name: "", handle: "", platform: "tiktok", outreach_type: "cold" as "warm" | "cold" });

  const hasCreators = creators.length > 0;

  const fetchAll = useCallback(async () => {
    try {
      const meRes = await fetch("/api/auth/me");
      const me = await meRes.json();
      if (me.role) setRole(me.role);

      // Admin gets the overview endpoint
      if (me.role === "admin") {
        const adminRes = await fetch("/api/admin/overview");
        const adminJson = await adminRes.json();
        if (!adminJson.error) setAdminData(adminJson);
        setLoading(false);
        return;
      }

      // Manager flow
      const [creatorsRes, prospectsRes] = await Promise.all([
        fetch("/api/content-creators"),
        fetch("/api/pipeline"),
      ]);

      const creatorsData: Creator[] = await creatorsRes.json();
      setCreators(Array.isArray(creatorsData) ? creatorsData : []);

      const prospectsData: Prospect[] = await prospectsRes.json();
      setProspects(Array.isArray(prospectsData) ? prospectsData : []);

      // Fetch today + yesterday assignments for each creator
      const activeCreators = (Array.isArray(creatorsData) ? creatorsData : []).filter(
        (c) => c.status === "trial" || c.status === "active"
      );

      const assignmentPromises = activeCreators.flatMap((c) => [
        fetch(`/api/assignments?creator_id=${c.id}&date=${TODAY}`).then((r) => r.json()).then((a) => ({ creatorId: c.id, day: "today", data: a })),
        fetch(`/api/assignments?creator_id=${c.id}&date=${YESTERDAY}`).then((r) => r.json()).then((a) => ({ creatorId: c.id, day: "yesterday", data: a })),
      ]);

      const results = await Promise.all(assignmentPromises);

      const todayMap: Record<string, Assignment[]> = {};
      const yesterdayMap: Record<string, Assignment[]> = {};
      for (const r of results) {
        const assignments = Array.isArray(r.data) ? r.data : r.data?.assignments || [];
        if (r.day === "today") todayMap[r.creatorId] = assignments;
        else yesterdayMap[r.creatorId] = assignments;
      }
      setTodayAssignments(todayMap);
      setYesterdayAssignments(yesterdayMap);

      // Load saved daily task completion
      try {
        const logRes = await fetch(`/api/daily-log?date=${TODAY}`);
        const logData = await logRes.json();
        if (logData.completed_tasks && Array.isArray(logData.completed_tasks)) {
          setCompletedBlocks(new Set(logData.completed_tasks as BlockKey[]));
        }
      } catch {
        // silent
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function toggleBlock(key: BlockKey) {
    setCompletedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Persist to Firestore
      const tasks = Array.from(next);
      const totalRequired = hasCreators ? 5 : 4;
      fetch("/api/daily-log", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: TODAY, completed_tasks: tasks, total_required: totalRequired }),
      }).catch(() => {});
      return next;
    });
  }

  // Derived data
  const followUps = prospects.filter((p) => {
    if (p.status !== "dm_sent") return false;
    if (!p.dm_date) return false;
    const dmDate = new Date(p.dm_date);
    const hoursAgo = (Date.now() - dmDate.getTime()) / (1000 * 60 * 60);
    return hoursAgo >= 24;
  });

  const todayWarmDMs = prospects.filter((p) => p.dm_date === TODAY && p.outreach_type === "warm").length;
  const todayColdDMs = prospects.filter((p) => p.dm_date === TODAY && p.outreach_type !== "warm").length;

  const creatorsWithYesterdayStatus = creators
    .filter((c) => c.status === "trial" || c.status === "active")
    .map((c) => {
      const yAssignments = yesterdayAssignments[c.id] || [];
      const completed = yAssignments.filter((a) => a.status === "completed");
      const missed = yAssignments.filter((a) => a.status === "missed" || a.status === "pending");
      return { ...c, yesterdayAssignments: yAssignments, yesterdayCompleted: completed, yesterdayMissed: missed };
    });

  const needsFeedback = creators
    .filter((c) => c.status === "trial" || c.status === "active")
    .flatMap((c) => {
      const yAssignments = yesterdayAssignments[c.id] || [];
      return yAssignments
        .filter((a) => a.status === "completed" && !a.manager_feedback)
        .map((a) => ({ ...a, creatorName: c.name }));
    });

  const todayAssignmentsList = creators
    .filter((c) => c.status === "trial" || c.status === "active")
    .map((c) => {
      const tAssignments = todayAssignments[c.id] || [];
      return { ...c, todayAssignments: tAssignments };
    });

  const flaggedCreators = creators.filter((c) => c.auto_cut_flagged);
  const pendingReview = creators.filter((c) => c.status === "pending_review");

  async function handleAddProspect() {
    if (!newProspect.name) return;
    await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newProspect, client_date: TODAY }),
    });
    setNewProspect({ name: "", handle: "", platform: "tiktok", outreach_type: "cold" });
    setShowAddProspect(false);
    fetchAll();
  }

  async function handleSaveFeedback(assignmentId: string) {
    if (!feedbackInputs[assignmentId]) return;
    setSavingFeedback(assignmentId);
    await fetch("/api/assignments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: assignmentId, feedback: feedbackInputs[assignmentId] }),
    });
    setSavingFeedback(null);
    setFeedbackInputs((prev) => {
      const next = { ...prev };
      delete next[assignmentId];
      return next;
    });
    fetchAll();
  }

  async function handleAdvanceProspect(id: string, newStatus: string) {
    await fetch("/api/pipeline", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
    fetchAll();
  }

  if (loading) {
    return (
      <div>
        <p style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", paddingTop: 80 }}>Loading...</p>
      </div>
    );
  }

  // ========================
  // ADMIN VIEW
  // ========================
  if (role === "admin" && adminData) {
    const { totals, managers } = adminData;
    return (
      <div>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Today</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Top-level stats */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}>
          {[
            { label: "Managers", value: totals.managers, color: "#818cf8" },
            { label: "In Trial", value: totals.creators_in_trial, color: "#fbbf24" },
            { label: "Paid Creators", value: totals.creators_active_paid, color: "#4ade80" },
            { label: "Pending Review", value: totals.creators_pending_review, color: "#fb923c" },
            { label: "Flagged", value: totals.creators_flagged, color: totals.creators_flagged > 0 ? "#f87171" : "rgba(255,255,255,0.3)" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: "18px 16px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Alerts */}
        {(totals.creators_flagged > 0 || totals.creators_pending_review > 0) && (
          <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 8 }}>
            {managers.flatMap((m) =>
              m.creators.flagged_names.map((name) => (
                <div key={`flag-${m.id}-${name}`} style={{
                  padding: "12px 16px",
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "#f87171",
                }}>
                  <strong>{name}</strong> flagged for auto-cut <span style={{ color: "rgba(248,113,113,0.6)" }}>({m.name}&apos;s team)</span>
                </div>
              ))
            )}
            {managers.flatMap((m) =>
              m.creators.pending_review_names.map((name) => (
                <div key={`review-${m.id}-${name}`} style={{
                  padding: "12px 16px",
                  background: "rgba(251,191,36,0.08)",
                  border: "1px solid rgba(251,191,36,0.2)",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "#fbbf24",
                }}>
                  <strong>{name}</strong> ready for graduation review <span style={{ color: "rgba(251,191,36,0.6)" }}>({m.name}&apos;s team)</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Manager cards */}
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Managers</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {managers.length === 0 ? (
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: "40px 20px",
              textAlign: "center",
            }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>No managers yet</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>Add managers in the Managers tab</p>
            </div>
          ) : managers.map((m) => {
            const isExpanded = expandedManager === m.id;
            const targetPct = Math.min(100, Math.round((m.target_30day.trials_started / m.target_30day.target) * 100));
            const isInFirstMonth = m.target_30day.days_remaining > 0;

            return (
              <div key={m.id} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                overflow: "hidden",
              }}>
                {/* Manager header */}
                <button
                  onClick={() => setExpandedManager(isExpanded ? null : m.id)}
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
                      {m.email} &middot; {m.days_active} days active
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {/* Quick stats */}
                    <div style={{ display: "flex", gap: 12, marginRight: 8 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#fbbf24" }}>{m.creators.in_trial}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>trial</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#4ade80" }}>{m.creators.active_paid}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>paid</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>{m.pipeline.total_prospects}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>pipeline</div>
                      </div>
                    </div>
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
                {isExpanded && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px" }}>
                    {/* 30-day target */}
                    {isInFirstMonth && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>
                            30-day target: {m.target_30day.trials_started}/10 trials started
                          </span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                            {m.target_30day.days_remaining}d remaining
                          </span>
                        </div>
                        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                          <div style={{
                            height: 6,
                            background: targetPct >= 100 ? "#4ade80" : targetPct >= 50 ? "#fbbf24" : "#f87171",
                            borderRadius: 3,
                            width: `${targetPct}%`,
                            transition: "width 0.3s",
                          }} />
                        </div>
                      </div>
                    )}

                    {/* Creators breakdown */}
                    <div style={{ marginBottom: 16 }}>
                      <h4 style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Creators
                      </h4>
                      {m.creators.total === 0 ? (
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No creators yet</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {m.creators.in_trial_names.map((name) => (
                            <div key={`trial-${name}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                              <span style={{ fontSize: 13, color: "#fff" }}>{name}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#fbbf24", textTransform: "uppercase" }}>trial</span>
                            </div>
                          ))}
                          {m.creators.active_paid_names.map((name) => (
                            <div key={`paid-${name}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                              <span style={{ fontSize: 13, color: "#fff" }}>{name}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#4ade80", textTransform: "uppercase" }}>paid</span>
                            </div>
                          ))}
                          {m.creators.pending_review_names.map((name) => (
                            <div key={`review-${name}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                              <span style={{ fontSize: 13, color: "#fff" }}>{name}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#fb923c", textTransform: "uppercase" }}>pending review</span>
                            </div>
                          ))}
                          {m.creators.flagged_names.map((name) => (
                            <div key={`flag-${name}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "rgba(248,113,113,0.05)", borderRadius: 6 }}>
                              <span style={{ fontSize: 13, color: "#fff" }}>{name}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#f87171", textTransform: "uppercase" }}>flagged</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Pipeline breakdown */}
                    <div>
                      <h4 style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Pipeline
                      </h4>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {[
                          { label: "Prospects", value: m.pipeline.total_prospects, color: "#fff" },
                          { label: "DM sent", value: m.pipeline.dm_sent, color: "rgba(255,255,255,0.5)" },
                          { label: "Replied", value: m.pipeline.replied, color: "#818cf8" },
                          { label: "Video app", value: m.pipeline.video_app_sent, color: "#fbbf24" },
                          { label: "Video recv", value: m.pipeline.video_received, color: "#4ade80" },
                          { label: "Contract", value: m.pipeline.contract_sent, color: "#4ade80" },
                          { label: "Trial", value: m.pipeline.trial_started, color: "#4ade80" },
                        ].map((s) => (
                          <div key={s.label} style={{ minWidth: 60, textAlign: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ========================
  // MANAGER VIEW
  // ========================
  const blocks: { key: BlockKey; label: string; time: string; show: boolean; optional?: boolean }[] = hasCreators
    ? [
        { key: "check_posts", label: "Check posts", time: "~15 min", show: true },
        { key: "feedback", label: "Write & share feedback", time: "~15 min", show: true },
        { key: "warm_outreach", label: "Warm outreach", time: "~15 min", show: true, optional: true },
        { key: "cold_outreach", label: "Cold outreach", time: "~25 min", show: true },
        { key: "follow_ups", label: "Follow up", time: "~10 min", show: true },
        { key: "pipeline_update", label: "Pipeline update", time: "~10 min", show: true },
      ]
    : [
        { key: "warm_outreach", label: "Warm outreach", time: "~25 min", show: true },
        { key: "cold_outreach", label: "Cold outreach", time: "~45 min", show: true },
        { key: "follow_ups", label: "Follow up", time: "~10 min", show: true },
        { key: "pipeline_update", label: "Pipeline update", time: "~10 min", show: true },
      ];

  const requiredBlocks = blocks.filter((b) => !b.optional);
  const completedCount = requiredBlocks.filter((b) => completedBlocks.has(b.key)).length;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Today</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Key metrics */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 12,
        marginBottom: 24,
      }}>
        {[
          { label: "Outreaches", value: prospects.length, color: "#818cf8" },
          { label: "In Trial", value: creators.filter((c) => c.status === "trial" || c.status === "pending_review").length, color: "#fbbf24" },
          { label: "Paid", value: creators.filter((c) => c.status === "active").length, color: "#4ade80" },
        ].map((m) => (
          <div key={m.label} style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: "16px 0",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>
            {completedCount}/{requiredBlocks.length} tasks done
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: completedCount === requiredBlocks.length ? "#4ade80" : "rgba(255,255,255,0.3)" }}>
            {completedCount === requiredBlocks.length ? "All done!" : `~${requiredBlocks.reduce((t, b) => t + (completedBlocks.has(b.key) ? 0 : parseInt(b.time.replace(/\D/g, ""))), 0)} min left`}
          </span>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
          <div style={{
            height: 4,
            background: "#4ade80",
            borderRadius: 2,
            width: `${requiredBlocks.length > 0 ? (completedCount / requiredBlocks.length) * 100 : 0}%`,
            transition: "width 0.3s",
          }} />
        </div>
      </div>

      {/* Alerts */}
      {(flaggedCreators.length > 0 || pendingReview.length > 0) && (
        <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 8 }}>
          {flaggedCreators.map((c) => (
            <div key={c.id} style={{
              padding: "12px 16px",
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 10,
              fontSize: 13,
              color: "#f87171",
            }}>
              <strong>{c.name}</strong> is flagged for auto-cut — {c.consecutive_missed_days} consecutive missed days
            </div>
          ))}
          {pendingReview.map((c) => (
            <div key={c.id} style={{
              padding: "12px 16px",
              background: "rgba(251,191,36,0.08)",
              border: "1px solid rgba(251,191,36,0.2)",
              borderRadius: 10,
              fontSize: 13,
              color: "#fbbf24",
            }}>
              <strong>{c.name}</strong> completed their trial — ready for graduation review
            </div>
          ))}
        </div>
      )}

      {/* Tasks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* BLOCK: Check Posts (has creators) */}
        {hasCreators && (
          <BlockCard
            blockKey="check_posts"
            label="Check posts"
            time="~15 min"
            done={completedBlocks.has("check_posts")}
            onToggle={() => toggleBlock("check_posts")}
          >
            <p style={blockDescStyle}>Did your creators post yesterday? Watch each video.</p>
            {creatorsWithYesterdayStatus.length === 0 ? (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No active creators yet</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {creatorsWithYesterdayStatus.map((c) => {
                  const total = c.yesterdayAssignments.length;
                  const done = c.yesterdayCompleted.length;
                  const allDone = total > 0 && done === total;
                  const anyMissed = c.yesterdayMissed.length > 0;
                  return (
                    <div key={c.id} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: 8,
                    }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>{c.name}</span>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>
                          Day {c.trial_day || "—"} {c.status === "trial" ? "trial" : ""}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {total === 0 ? (
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>No assignments</span>
                        ) : (
                          <>
                            <span style={{ fontSize: 12, fontWeight: 600, color: allDone ? "#4ade80" : anyMissed ? "#f87171" : "#fbbf24" }}>
                              {done}/{total}
                            </span>
                            {c.yesterdayCompleted.map((a) => (
                              <a key={a.id} href={a.tiktok_link} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 11, color: "#818cf8", textDecoration: "none" }}>
                                Watch
                              </a>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </BlockCard>
        )}

        {/* BLOCK: Feedback (has creators) */}
        {hasCreators && (
          <BlockCard
            blockKey="feedback"
            label="Write & share feedback"
            time="~15 min"
            done={completedBlocks.has("feedback")}
            onToggle={() => toggleBlock("feedback")}
          >
            <p style={blockDescStyle}>Give specific feedback on completed videos.</p>
            {needsFeedback.length === 0 ? (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No videos waiting for feedback</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {needsFeedback.map((a) => (
                  <div key={a.id} style={{
                    padding: "12px 14px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 8,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>{a.creatorName}</span>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>
                          {a.hook_title}
                        </span>
                      </div>
                      {a.tiktok_link && (
                        <a href={a.tiktok_link} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: "#818cf8", textDecoration: "none" }}>
                          Watch
                        </a>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        placeholder="Write feedback..."
                        value={feedbackInputs[a.id] || ""}
                        onChange={(e) => setFeedbackInputs((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        style={inputStyle}
                      />
                      <button
                        onClick={() => handleSaveFeedback(a.id)}
                        disabled={!feedbackInputs[a.id] || savingFeedback === a.id}
                        style={{
                          ...btnStyle,
                          opacity: !feedbackInputs[a.id] ? 0.4 : 1,
                        }}
                      >
                        {savingFeedback === a.id ? "..." : "Send"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </BlockCard>
        )}



        {/* BLOCK: Warm Outreach */}
        <BlockCard
          blockKey="warm_outreach"
          label={hasCreators ? "Warm outreach (optional)" : "Warm outreach"}
          time={hasCreators ? "~15 min" : "~25 min"}
          done={completedBlocks.has("warm_outreach")}
          onToggle={() => toggleBlock("warm_outreach")}
        >
          <p style={blockDescStyle}>
            {hasCreators
              ? "Any warm leads today? Friends, mutuals, referrals — log them if you have any."
              : "Reach out to people you know — friends, mutuals, referrals, past connections. These convert best."}
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Warm outreach today: <strong style={{ color: "#fbbf24" }}>{todayWarmDMs}</strong></span>
            <button onClick={() => { setNewProspect((p) => ({ ...p, outreach_type: "warm" })); setShowAddProspect(!showAddProspect); }} style={btnStyle}>
              + Log warm
            </button>
          </div>
        </BlockCard>

        {/* BLOCK: Cold Outreach */}
        <BlockCard
          blockKey="cold_outreach"
          label="Cold outreach"
          time={hasCreators ? "~25 min" : "~45 min"}
          done={completedBlocks.has("cold_outreach")}
          onToggle={() => toggleBlock("cold_outreach")}
        >
          <p style={blockDescStyle}>
            Search TikTok, Instagram, YouTube, Upwork, Twitter, LinkedIn — anywhere you can find creators. Send {hasCreators ? "10" : "20"} messages.
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Cold outreach today: <strong style={{ color: "#818cf8" }}>{todayColdDMs}</strong></span>
            <button onClick={() => { setNewProspect((p) => ({ ...p, outreach_type: "cold" })); setShowAddProspect(!showAddProspect); }} style={btnStyle}>
              + Log cold
            </button>
          </div>
        </BlockCard>

        {/* Quick-add prospect (shared between both outreach blocks) */}
        {showAddProspect && (
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: 16,
            marginTop: -4,
            marginBottom: 4,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 6,
                textTransform: "uppercase",
                background: newProspect.outreach_type === "warm" ? "rgba(251,191,36,0.15)" : "rgba(129,140,248,0.15)",
                color: newProspect.outreach_type === "warm" ? "#fbbf24" : "#818cf8",
              }}>
                {newProspect.outreach_type}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Quick add to pipeline</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                placeholder="Name"
                value={newProspect.name}
                onChange={(e) => setNewProspect((p) => ({ ...p, name: e.target.value }))}
                style={inputStyle}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  placeholder="@handle"
                  value={newProspect.handle}
                  onChange={(e) => setNewProspect((p) => ({ ...p, handle: e.target.value }))}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <select
                  value={newProspect.platform}
                  onChange={(e) => setNewProspect((p) => ({ ...p, platform: e.target.value }))}
                  style={{ ...inputStyle, width: 100, flex: "none" }}
                >
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                  <option value="upwork">Upwork</option>
                  <option value="other">Other</option>
                  <option value="n/a">N/A</option>
                </select>
              </div>
              <button onClick={handleAddProspect} disabled={!newProspect.name} style={{ ...btnStyle, opacity: !newProspect.name ? 0.4 : 1 }}>
                Add to pipeline
              </button>
            </div>
          </div>
        )}

        {/* BLOCK: Follow Ups */}
        <BlockCard
          blockKey="follow_ups"
          label="Follow up"
          time="~10 min"
          done={completedBlocks.has("follow_ups")}
          onToggle={() => toggleBlock("follow_ups")}
        >
          <p style={blockDescStyle}>Bump unanswered DMs from 24+ hours ago.</p>
          {followUps.length === 0 ? (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No follow-ups needed right now</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {followUps.map((p) => {
                const daysAgo = Math.floor((Date.now() - new Date(p.dm_date).getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={p.id} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 8,
                  }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>{p.name}</span>
                      {p.handle && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 6 }}>@{p.handle}</span>}
                      <span style={{ fontSize: 11, color: daysAgo >= 3 ? "#f87171" : "#fbbf24", marginLeft: 8 }}>
                        {daysAgo}d ago
                      </span>
                    </div>
                    <button onClick={() => handleAdvanceProspect(p.id, "replied")} style={btnSmallStyle}>
                      Mark replied
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </BlockCard>

        {/* BLOCK: Pipeline Update */}
        <BlockCard
          blockKey="pipeline_update"
          label="Pipeline update"
          time="~10 min"
          done={completedBlocks.has("pipeline_update")}
          onToggle={() => toggleBlock("pipeline_update")}
        >
          <p style={blockDescStyle}>Update the status of every prospect — move them forward, add notes, reject dead leads. Keep it clean.</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
              {prospects.length} prospects in your pipeline
            </span>
            <a
              href="/dashboard/recruit"
              style={{
                padding: "8px 20px",
                background: "#fff",
                color: "#000",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              Go to Pipeline
            </a>
          </div>
        </BlockCard>
      </div>
    </div>
  );
}

// Block card component
function BlockCard({
  blockKey,
  label,
  time,
  done,
  onToggle,
  children,
}: {
  blockKey: string;
  label: string;
  time: string;
  done: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{
      background: done ? "rgba(74,222,128,0.04)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${done ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 14,
      overflow: "hidden",
      transition: "all 0.2s",
    }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "14px 18px",
          cursor: "pointer",
          gap: 12,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: `2px solid ${done ? "#4ade80" : "rgba(255,255,255,0.2)"}`,
            background: done ? "#4ade80" : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {done && (
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={3}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>

        <div style={{ flex: 1 }}>
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            color: done ? "rgba(255,255,255,0.4)" : "#fff",
            textDecoration: done ? "line-through" : "none",
          }}>
            {label}
          </span>
        </div>

        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginRight: 8 }}>{time}</span>

        <svg
          width={14} height={14} viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.2)" strokeWidth={2}
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {expanded && (
        <div style={{ padding: "0 18px 16px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

const blockDescStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.4)",
  marginBottom: 12,
  marginTop: 12,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 12px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#fff",
  fontSize: 13,
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "rgba(129,140,248,0.15)",
  border: "none",
  borderRadius: 8,
  color: "#818cf8",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSmallStyle: React.CSSProperties = {
  padding: "5px 10px",
  background: "rgba(129,140,248,0.1)",
  border: "none",
  borderRadius: 6,
  color: "#818cf8",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
};
