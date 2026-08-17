"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface SuccessfulUser {
  uid: string;
  email: string | null;
  display_name: string | null;
  total_days_completed: number;
  max_day: number;
  first_paid_at: string | null;
  paid_at: string | null;
  tenure_days: number | null;
  active_now: boolean;
  gender: string | null;
  hair_loss_location: string | null;
  hair_goal: string | null;
  support_needs: string[];
  signup_source: string | null;
  referral_source: string | null;
  plan: string | null;
  payment_provider: string | null;
  phone_e164: string | null;
}

type SortKey =
  | "total_days_completed"
  | "max_day"
  | "tenure_days"
  | "first_paid_at";

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Most days completed", value: "total_days_completed" },
  { label: "Highest day reached", value: "max_day" },
  { label: "Longest tenure", value: "tenure_days" },
  { label: "First paid (oldest)", value: "first_paid_at" },
];

const MIN_DAYS_OPTIONS = [
  { label: "30 days (Engaged)", value: 30 },
  { label: "60 days (Committed)", value: 60 },
  { label: "90 days (Lifetime candidate)", value: 90 },
];

export default function SuccessfulUsersPage() {
  const [users, setUsers] = useState<SuccessfulUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [minDays, setMinDays] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey>("total_days_completed");
  const [activeOnly, setActiveOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");

  const fetchUsers = useCallback(async (md: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/successful-users?minDays=${md}`);
      const data = await res.json();
      if (data.ok) setUsers(data.users);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers(minDays);
  }, [minDays, fetchUsers]);

  // Build the unique-sources and unique-plans lists for filter dropdowns
  const allSources = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) {
      if (u.referral_source) set.add(u.referral_source);
      if (u.signup_source) set.add(u.signup_source);
    }
    return [...set].sort();
  }, [users]);

  const allPlans = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) {
      if (u.plan) set.add(u.plan);
    }
    return [...set].sort();
  }, [users]);

  const filtered = useMemo(() => {
    let list = [...users];
    if (activeOnly) list = list.filter((u) => u.active_now);
    if (sourceFilter !== "all") {
      list = list.filter(
        (u) => u.referral_source === sourceFilter || u.signup_source === sourceFilter,
      );
    }
    if (planFilter !== "all") {
      list = list.filter((u) => u.plan === planFilter);
    }

    list.sort((a, b) => {
      if (sortKey === "first_paid_at") {
        const at = a.first_paid_at ?? "";
        const bt = b.first_paid_at ?? "";
        return at.localeCompare(bt); // oldest first
      }
      const av = (a[sortKey] as number) ?? 0;
      const bv = (b[sortKey] as number) ?? 0;
      return bv - av;
    });
    return list;
  }, [users, activeOnly, sourceFilter, planFilter, sortKey]);

  const exportCsv = () => {
    const headers = [
      "uid", "email", "display_name", "total_days_completed", "max_day",
      "tenure_days", "active_now", "gender", "hair_loss_location", "hair_goal",
      "support_needs", "signup_source", "referral_source", "plan",
      "payment_provider", "phone_e164", "first_paid_at",
    ];
    const rows = filtered.map((u) =>
      headers.map((h) => {
        const v = u[h as keyof SuccessfulUser];
        if (Array.isArray(v)) return `"${v.join("|")}"`;
        if (v === null || v === undefined) return "";
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `successful-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: "0 0 48px" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>
          Successful users
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          Paid users who completed ≥{minDays} days of the routine. Sorted, filterable,
          exportable. Use this list to identify your best customers and find
          patterns / interview them.
        </p>
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          marginBottom: 20,
          padding: 16,
          background: "rgba(255,255,255,0.03)",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Selector
          label="Tier"
          value={String(minDays)}
          options={MIN_DAYS_OPTIONS.map((o) => ({ label: o.label, value: String(o.value) }))}
          onChange={(v) => setMinDays(parseInt(v, 10))}
        />
        <Selector
          label="Sort by"
          value={sortKey}
          options={SORT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          onChange={(v) => setSortKey(v as SortKey)}
        />
        <Selector
          label="Source"
          value={sourceFilter}
          options={[
            { label: "All sources", value: "all" },
            ...allSources.map((s) => ({ label: s, value: s })),
          ]}
          onChange={setSourceFilter}
        />
        <Selector
          label="Plan"
          value={planFilter}
          options={[
            { label: "All plans", value: "all" },
            ...allPlans.map((p) => ({ label: p, value: p })),
          ]}
          onChange={setPlanFilter}
        />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Active subscriptions only
        </label>
        <div style={{ flex: 1 }} />
        <button
          onClick={exportCsv}
          style={{
            padding: "8px 14px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Export CSV
        </button>
      </div>

      <div
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.55)",
          marginBottom: 12,
        }}
      >
        {loading ? "Loading…" : `${filtered.length} users matched`}
      </div>

      {/* Table */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "200px 70px 70px 90px 90px 110px 100px 100px 80px",
            padding: "12px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          <span>Email / Name</span>
          <span style={{ textAlign: "right" }}>Days</span>
          <span style={{ textAlign: "right" }}>Max day</span>
          <span style={{ textAlign: "right" }}>Tenure</span>
          <span>Source</span>
          <span>Plan</span>
          <span>Loss / Goal</span>
          <span>Support needs</span>
          <span>Action</span>
        </div>

        {loading ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "rgba(255,255,255,0.3)",
              fontSize: 14,
            }}
          >
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "rgba(255,255,255,0.3)",
              fontSize: 14,
            }}
          >
            No users match the filters.
          </div>
        ) : (
          filtered.map((u) => {
            const wa = u.phone_e164
              ? `https://wa.me/${u.phone_e164.replace(/\D/g, "")}`
              : null;
            const supportShort = u.support_needs.slice(0, 2).join(", ") +
              (u.support_needs.length > 2 ? `+${u.support_needs.length - 2}` : "");
            return (
              <div
                key={u.uid}
                style={{
                  display: "grid",
                  gridTemplateColumns: "200px 70px 70px 90px 90px 110px 100px 100px 80px",
                  padding: "12px 16px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  fontSize: 13,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    color: "#fff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={u.email ?? u.uid}
                >
                  <div style={{ fontWeight: 500 }}>
                    {u.display_name || u.email || u.uid.slice(0, 8)}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    {u.email ?? "—"}
                  </div>
                </span>
                <span style={{ textAlign: "right", color: "#4CAF50", fontWeight: 600 }}>
                  {u.total_days_completed}
                </span>
                <span style={{ textAlign: "right", color: "rgba(255,255,255,0.6)" }}>
                  {u.max_day}
                </span>
                <span style={{ textAlign: "right", color: "rgba(255,255,255,0.6)" }}>
                  {u.tenure_days != null ? `${u.tenure_days}d` : "—"}
                </span>
                <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                  {u.referral_source || u.signup_source || "—"}
                </span>
                <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                  {u.plan || "—"}
                  {u.active_now && (
                    <span style={{ marginLeft: 4, color: "#4CAF50", fontSize: 10 }}>●</span>
                  )}
                </span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  {u.hair_loss_location ?? "—"}
                  <br />
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>
                    {u.hair_goal ?? "—"}
                  </span>
                </span>
                <span
                  style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}
                  title={u.support_needs.join(", ")}
                >
                  {supportShort || "—"}
                </span>
                <span>
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#25D366",
                        fontSize: 12,
                        fontWeight: 500,
                        textDecoration: "none",
                      }}
                    >
                      WhatsApp →
                    </a>
                  ) : (
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                      no phone
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Selector({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: 11,
        color: "rgba(255,255,255,0.4)",
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      <span style={{ marginBottom: 4 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6,
          color: "#fff",
          fontSize: 13,
          padding: "6px 10px",
          cursor: "pointer",
          minWidth: 140,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: "#1a1a1a" }}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
