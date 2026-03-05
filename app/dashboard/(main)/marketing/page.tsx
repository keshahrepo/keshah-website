"use client";

import { useEffect, useState, useCallback } from "react";
import MetricCard from "@/components/MetricCard";
import { ChartCard, SimpleLineChart } from "@/components/SimpleChart";

interface PlatformEntry {
  platform: string;
  handle: string;
  profile_url: string;
  followers: number;
  views: number;
}

interface Creator {
  id: string;
  name: string;
  slug: string;
  short_link: string;
  platforms: PlatformEntry[];
  platform_slugs?: Record<string, string>;
  platform_clicks?: Record<string, number>;
  total_clicks: number;
  clicks_this_week: number;
  clicks_this_month: number;
  notes: string;
  is_active: boolean;
  stats_updated_at?: string;
  // Legacy single-platform fields (backwards compat)
  platform?: string;
  handle?: string;
  profile_url?: string;
  follower_count?: number;
  total_views?: number;
}

interface ClickData {
  date: string;
  label: string;
  clicks: number;
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "IG",
  tiktok: "TT",
  youtube: "YT",
  other: "—",
};

function formatNum(n: number): string {
  if (!n) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// Normalize creator: migrate legacy single-platform to platforms array
function normalizePlatforms(c: Creator): PlatformEntry[] {
  if (c.platforms && c.platforms.length > 0) return c.platforms;
  // Legacy: single platform fields
  if (c.platform || c.handle) {
    return [{
      platform: c.platform || "other",
      handle: c.handle || "",
      profile_url: c.profile_url || "",
      followers: c.follower_count || 0,
      views: c.total_views || 0,
    }];
  }
  return [];
}

function totalFollowers(platforms: PlatformEntry[]): number {
  return platforms.reduce((s, p) => s + (p.followers || 0), 0);
}

function totalViews(platforms: PlatformEntry[]): number {
  return platforms.reduce((s, p) => s + (p.views || 0), 0);
}

export default function MarketingPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
  const [clickData, setClickData] = useState<ClickData[]>([]);
  const [editingCreator, setEditingCreator] = useState<Creator | null>(null);
  const [editPlatforms, setEditPlatforms] = useState<PlatformEntry[]>([]);
  const [editNotes, setEditNotes] = useState("");

  // Add form state
  const [formName, setFormName] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formPlatforms, setFormPlatforms] = useState<PlatformEntry[]>([
    { platform: "instagram", handle: "", profile_url: "", followers: 0, views: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const fetchCreators = useCallback(async () => {
    const res = await fetch("/api/creators");
    if (res.ok) {
      const data = await res.json();
      setCreators(data.filter((c: Creator) => c.is_active));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCreators(); }, [fetchCreators]);

  useEffect(() => {
    if (selectedCreator) {
      fetch(`/api/creators/${selectedCreator}/clicks`)
        .then((r) => r.json())
        .then(setClickData)
        .catch(() => setClickData([]));
    }
  }, [selectedCreator]);

  // Slug from first name only — backend handles collisions (sarah → sarah2 → sarah3)
  const generatedSlug = formName.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");

  async function handleAddCreator(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/creators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formName,
        slug: generatedSlug,
        platforms: formPlatforms.filter((p) => p.handle),
        notes: formNotes,
      }),
    });
    if (res.ok) {
      setShowForm(false);
      setFormName("");
      setFormNotes("");
      setFormPlatforms([{ platform: "instagram", handle: "", profile_url: "", followers: 0, views: 0 }]);
      fetchCreators();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to create");
    }
    setSubmitting(false);
  }

  function openEdit(creator: Creator) {
    setEditingCreator(creator);
    setEditPlatforms(normalizePlatforms(creator).map((p) => ({ ...p })));
    setEditNotes(creator.notes || "");
  }

  async function handleEditSave() {
    if (!editingCreator) return;
    setSubmitting(true);
    await fetch("/api/creators", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingCreator.id,
        platforms: editPlatforms,
        notes: editNotes,
        stats_updated_at: new Date().toISOString(),
      }),
    });
    setEditingCreator(null);
    setSubmitting(false);
    fetchCreators();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this creator?")) return;
    await fetch("/api/creators", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchCreators();
  }

  function updateFormPlatform(index: number, field: keyof PlatformEntry, value: string | number) {
    setFormPlatforms((prev) => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  }

  function updateEditPlatform(index: number, field: keyof PlatformEntry, value: string | number) {
    setEditPlatforms((prev) => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  }

  const allFollowers = creators.reduce((sum, c) => sum + totalFollowers(normalizePlatforms(c)), 0);
  const allClicks = creators.reduce((sum, c) => sum + (c.total_clicks || 0), 0);
  const weeklyClicks = creators.reduce((sum, c) => sum + (c.clicks_this_week || 0), 0);
  const monthlyClicks = creators.reduce((sum, c) => sum + (c.clicks_this_month || 0), 0);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    color: "#fff",
    fontSize: 14,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 6,
    display: "block",
  };

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "3px 8px",
    fontSize: 10,
    fontWeight: 600,
    borderRadius: 6,
    background: active ? "rgba(129,140,248,0.15)" : "rgba(255,255,255,0.06)",
    color: active ? "#818cf8" : "rgba(255,255,255,0.4)",
    border: "none",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  });

  function renderPlatformRow(
    p: PlatformEntry,
    index: number,
    platforms: PlatformEntry[],
    update: (i: number, f: keyof PlatformEntry, v: string | number) => void,
    setPlatforms: (fn: (prev: PlatformEntry[]) => PlatformEntry[]) => void,
  ) {
    return (
      <div key={index} style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        padding: 16,
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <select
            value={p.platform}
            onChange={(e) => update(index, "platform", e.target.value)}
            style={{ ...inputStyle, width: 140, padding: "6px 10px", fontSize: 12 }}
          >
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="other">Other</option>
          </select>
          {platforms.length > 1 && (
            <button
              type="button"
              onClick={() => setPlatforms((prev) => prev.filter((_, i) => i !== index))}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 16, cursor: "pointer" }}
            >
              ×
            </button>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Handle</label>
            <input
              value={p.handle}
              onChange={(e) => update(index, "handle", e.target.value)}
              placeholder="@creator"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Profile URL</label>
            <input
              value={p.profile_url}
              onChange={(e) => update(index, "profile_url", e.target.value)}
              placeholder="https://..."
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Followers</label>
            <input
              type="number"
              value={p.followers || ""}
              onChange={(e) => update(index, "followers", parseInt(e.target.value) || 0)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Views</label>
            <input
              type="number"
              value={p.views || ""}
              onChange={(e) => update(index, "views", parseInt(e.target.value) || 0)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>Marketing</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            Track creator partnerships and link clicks
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
          {showForm ? "Cancel" : "+ Add Creator"}
        </button>
      </div>

      {/* Summary metrics */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}>
        <MetricCard label="Active Creators" value={creators.length} />
        <MetricCard label="This Week" value={weeklyClicks.toLocaleString()} subtitle="clicks" />
        <MetricCard label="This Month" value={monthlyClicks.toLocaleString()} subtitle="clicks" />
        <MetricCard label="All Time" value={allClicks.toLocaleString()} subtitle="clicks" />
        <MetricCard label="Total Reach" value={formatNum(allFollowers)} />
      </div>

      {/* Add creator form */}
      {showForm && (
        <form onSubmit={handleAddCreator} style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 24,
          marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20, color: "#fff" }}>
            Add New Creator
          </h3>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Name *</label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Sarah Johnson"
              required
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
              keshah.com/{generatedSlug || "..."}
            </p>
          </div>

          <label style={{ ...labelStyle, marginBottom: 12 }}>Platforms</label>
          {formPlatforms.map((p, i) => renderPlatformRow(p, i, formPlatforms, updateFormPlatform, setFormPlatforms))}
          <button
            type="button"
            onClick={() => setFormPlatforms((prev) => [...prev, { platform: "tiktok", handle: "", profile_url: "", followers: 0, views: 0 }])}
            style={{
              padding: "6px 14px",
              background: "rgba(255,255,255,0.06)",
              border: "1px dashed rgba(255,255,255,0.15)",
              borderRadius: 8,
              color: "rgba(255,255,255,0.5)",
              fontSize: 12,
              cursor: "pointer",
              marginBottom: 16,
            }}
          >
            + Add Platform
          </button>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Notes</label>
            <input
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Optional notes..."
              style={inputStyle}
            />
          </div>
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
            {submitting ? "Creating..." : "Create Creator"}
          </button>
        </form>
      )}

      {/* Creators list */}
      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, textAlign: "center", padding: 40 }}>
          Loading creators...
        </p>
      ) : creators.length === 0 ? (
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "40px 24px",
          textAlign: "center",
        }}>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            No creators yet. Click &quot;+ Add Creator&quot; to get started.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {creators.map((creator) => {
            const platforms = normalizePlatforms(creator);
            const tf = totalFollowers(platforms);
            const tv = totalViews(platforms);
            return (
              <div
                key={creator.id}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  padding: "16px 20px",
                }}
              >
                {/* Creator header with hero clicks */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{creator.name}</span>
                      {platforms.map((p) => (
                        <span key={p.platform} style={pillStyle(true)}>
                          {PLATFORM_ICONS[p.platform] || p.platform}
                        </span>
                      ))}
                    </div>
                    {creator.platform_slugs && Object.keys(creator.platform_slugs).length > 0 ? (
                      platforms.map((p) => {
                        const pSlug = creator.platform_slugs?.[p.platform];
                        return pSlug ? (
                          <span key={p.platform} style={{ marginRight: 12 }}>
                            <span style={pillStyle(true)}>{PLATFORM_ICONS[p.platform]}</span>
                            <span
                              onClick={() => navigator.clipboard.writeText(`https://keshah.com/${pSlug}`)}
                              style={{ cursor: "pointer", color: "#818cf8", fontSize: 12, marginLeft: 4 }}
                              title="Click to copy"
                            >
                              keshah.com/{pSlug}
                            </span>
                          </span>
                        ) : null;
                      })
                    ) : (
                      <span
                        onClick={() => navigator.clipboard.writeText(creator.short_link)}
                        style={{ cursor: "pointer", color: "#818cf8", fontSize: 12 }}
                        title="Click to copy"
                      >
                        {creator.short_link.replace("https://", "")}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#4ade80", lineHeight: 1 }}>
                      {(creator.total_clicks || 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                      {creator.clicks_this_week || 0} wk · {creator.clicks_this_month || 0} mo · {(creator.total_clicks || 0)} total
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button
                    onClick={() => setSelectedCreator(selectedCreator === creator.id ? null : creator.id)}
                    style={{
                      padding: "4px 10px",
                      background: "rgba(255,255,255,0.06)",
                      border: "none",
                      borderRadius: 6,
                      color: "rgba(255,255,255,0.6)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Click History
                  </button>
                  <button
                    onClick={() => openEdit(creator)}
                    style={{
                      padding: "4px 10px",
                      background: "rgba(255,255,255,0.06)",
                      border: "none",
                      borderRadius: 6,
                      color: "rgba(255,255,255,0.6)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(creator.id)}
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

                {/* Per-platform stats */}
                {platforms.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(platforms.length, 3)}, 1fr)`, gap: 12 }}>
                    {platforms.map((p) => {
                      const pClicks = creator.platform_clicks?.[p.platform] || 0;
                      return (
                        <div key={p.platform} style={{
                          background: "rgba(255,255,255,0.03)",
                          borderRadius: 8,
                          padding: "10px 14px",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                              {PLATFORM_ICONS[p.platform] || p.platform}
                            </span>
                            {p.handle && (
                              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{p.handle}</span>
                            )}
                          </div>
                          {/* Platform clicks */}
                          <div style={{ marginBottom: 8 }}>
                            <span style={{ fontSize: 18, fontWeight: 700, color: "#4ade80" }}>
                              {pClicks.toLocaleString()}
                            </span>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>clicks</span>
                          </div>
                          <div style={{ display: "flex", gap: 16 }}>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{formatNum(p.followers)}</div>
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>followers</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{formatNum(p.views)}</div>
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>views</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Totals row if multiple platforms */}
                {platforms.length > 1 && (
                  <div style={{
                    display: "flex",
                    gap: 20,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                      Total: <strong style={{ color: "#fff" }}>{formatNum(tf)}</strong> followers
                    </span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                      <strong style={{ color: "#fff" }}>{formatNum(tv)}</strong> views
                    </span>
                  </div>
                )}

                {creator.notes && (
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>{creator.notes}</p>
                )}
                {creator.stats_updated_at && (
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>
                    Updated {new Date(creator.stats_updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit panel */}
      {editingCreator && (
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 24,
          marginTop: 16,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
              Edit — {editingCreator.name}
            </h3>
            <button
              onClick={() => setEditingCreator(null)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 18, cursor: "pointer" }}
            >
              ×
            </button>
          </div>

          <label style={{ ...labelStyle, marginBottom: 12 }}>Platforms</label>
          {editPlatforms.map((p, i) => renderPlatformRow(p, i, editPlatforms, updateEditPlatform, setEditPlatforms))}
          <button
            type="button"
            onClick={() => setEditPlatforms((prev) => [...prev, { platform: "tiktok", handle: "", profile_url: "", followers: 0, views: 0 }])}
            style={{
              padding: "6px 14px",
              background: "rgba(255,255,255,0.06)",
              border: "1px dashed rgba(255,255,255,0.15)",
              borderRadius: 8,
              color: "rgba(255,255,255,0.5)",
              fontSize: 12,
              cursor: "pointer",
              marginBottom: 16,
            }}
          >
            + Add Platform
          </button>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Notes</label>
            <input
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleEditSave}
            disabled={submitting}
            style={{
              padding: "10px 28px",
              background: "#fff",
              color: "#000",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 20,
              border: "none",
              cursor: "pointer",
            }}
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      )}

      {/* Click trend chart */}
      {selectedCreator && clickData.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <ChartCard title={`Clicks — ${creators.find((c) => c.id === selectedCreator)?.name || "Creator"}`}>
            <SimpleLineChart data={clickData} dataKey="clicks" color="#4ade80" />
          </ChartCard>
        </div>
      )}
    </div>
  );
}
