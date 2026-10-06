"use client";

import { useEffect, useState } from "react";
import type { ProvenVideo } from "@/lib/creators/proven";
import type { SeedResult } from "@/lib/creators/proven-db";
import { Btn, ErrorText, Field, PageHeader, Pill, SubNav, api, card, h3, input, muted, td, th } from "../_ui";

type Row = { id: string } & ProvenVideo;
type Tab = "suggested" | "active" | "off" | "ideas";

const TABS: { key: Tab; label: string }[] = [
  { key: "suggested", label: "Suggested" },
  { key: "active", label: "Active" },
  { key: "off", label: "Paused & retired" },
  { key: "ideas", label: "Ideas" },
];

function fmtViews(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function inTab(v: Row, tab: Tab): boolean {
  if (tab === "ideas") return v.added_by === "founder_idea";
  if (v.added_by === "founder_idea") return false;
  if (tab === "suggested") return v.status === "suggested";
  if (tab === "active") return v.status === "active";
  return v.status === "paused" || v.status === "retired";
}

const SOURCE_LABEL: Record<string, string> = { seed: "Aadi / Isai", auto: "Creator post", founder_idea: "Your idea" };

export default function ProvenPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("suggested");
  const [err, setErr] = useState("");
  const [seedBusy, setSeedBusy] = useState(false);
  const [seed, setSeed] = useState<SeedResult | null>(null);
  const [showIdea, setShowIdea] = useState(false);

  async function load() {
    try {
      const d = await api<{ videos: Row[]; creators: Record<string, string> }>("/api/admin/creators/proven");
      setRows(d.videos);
      setNames(d.creators);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function runSeed(dryRun: boolean) {
    setSeedBusy(true);
    setErr("");
    setSeed(null);
    try {
      setSeed(await api<SeedResult>("/api/admin/creators/proven", { method: "POST", body: JSON.stringify({ action: "seed", dry_run: dryRun }) }));
      if (!dryRun) await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSeedBusy(false);
    }
  }

  function replace(v: Row) {
    setRows((rs) => (rs ?? []).map((r) => (r.id === v.id ? { ...r, ...v } : r)));
  }

  const list = (rows ?? [])
    .filter((v) => inTab(v, tab))
    .sort((a, b) =>
      tab === "active"
        ? Number(!!b.tired?.flagged) - Number(!!a.tired?.flagged) || b.views - a.views
        : tab === "ideas"
          ? b.created_at.localeCompare(a.created_at)
          : b.views - a.views,
    );
  const count = (t: Tab) => (rows ?? []).filter((v) => inTab(v, t)).length;
  const tiredCount = (rows ?? []).filter((v) => v.status === "active" && v.tired?.flagged).length;

  return (
    <div>
      <PageHeader
        title="Proven videos"
        subtitle="Videos that already worked. Creators get 5 of the active ones to remake each weekday (format creators get 3)."
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn onClick={() => runSeed(true)} disabled={seedBusy}>
              Count first
            </Btn>
            <Btn kind="primary" onClick={() => runSeed(false)} disabled={seedBusy}>
              {seedBusy ? "Looking..." : "Find proven videos"}
            </Btn>
            <Btn onClick={() => setShowIdea(!showIdea)}>{showIdea ? "Close" : "+ Add idea"}</Btn>
          </div>
        }
      />
      <SubNav />
      <ErrorText>{err}</ErrorText>
      {seedBusy && <p style={{ ...muted, marginBottom: 16 }}>This goes through every video on Aadi&apos;s and Isai&apos;s accounts, so it can take a few minutes.</p>}
      {seed && <SeedSummary r={seed} />}
      {showIdea && (
        <IdeaForm
          onDone={async () => {
            setShowIdea(false);
            setTab("ideas");
            await load();
          }}
        />
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map((t) => (
          <Btn key={t.key} kind={tab === t.key ? "primary" : "secondary"} onClick={() => setTab(t.key)}>
            {t.label} ({count(t.key)})
          </Btn>
        ))}
        {tiredCount > 0 && (
          <span style={{ ...muted, alignSelf: "center", color: "#fbbf24" }}>
            {tiredCount} active {tiredCount === 1 ? "video looks" : "videos look"} tired
          </span>
        )}
      </div>

      {!rows ? (
        <p style={muted}>Loading...</p>
      ) : !list.length ? (
        <div style={card}>
          <p style={muted}>
            {tab === "suggested"
              ? "Nothing waiting. Press Find proven videos to pull Aadi's and Isai's 100K+ videos. Big creator posts show up here after each daily sync."
              : tab === "ideas"
                ? "No ideas yet. Add one and it goes to 3 creators on their next posting day."
                : "Nothing here."}
          </p>
        </div>
      ) : (
        <div style={{ ...card, padding: 0 }}>
          <div className="cp-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={th}>Video</th>
                  <th style={th}>Hook line</th>
                  <th style={th}>Views</th>
                  <th style={th}>Remakes</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {list.map((v) => (
                  <ProvenRow key={v.id} v={v} tab={tab} names={names} onChange={replace} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SeedSummary({ r }: { r: SeedResult }) {
  return (
    <div style={card}>
      <h3 style={h3}>{r.dry_run ? "Count only (nothing saved)" : `Added ${r.added} new ${r.added === 1 ? "video" : "videos"} to Suggested`}</h3>
      <div className="cp-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Account</th>
              <th style={th}>Videos checked</th>
              <th style={th}>100K+</th>
              <th style={th}>New</th>
              <th style={th}>Already on the list</th>
            </tr>
          </thead>
          <tbody>
            {r.sources.map((s) => (
              <tr key={`${s.platform}-${s.handle}`}>
                <td style={td}>
                  {s.platform === "tiktok" ? "TikTok" : "Instagram"} @{s.handle}
                  {!s.ok && <div style={{ color: "#f87171", fontSize: 12 }}>{s.error}</div>}
                  {s.truncated && <div style={muted}>Stopped at the page limit</div>}
                </td>
                <td style={td}>{s.posts}</td>
                <td style={td}>{s.over_100k}</td>
                <td style={td}>{s.added}</td>
                <td style={td}>{s.already_listed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ ...muted, marginTop: 10 }}>
        Used {r.credits_used} ScrapeCreators credits{r.credits_remaining != null ? `, ${r.credits_remaining.toLocaleString()} left` : ""}.
        {r.transcripts_pending > 0 && ` ${r.transcripts_pending} transcripts didn't come through yet. Press the button again or wait for tonight's sync to fill them in.`}
      </p>
    </div>
  );
}

function ProvenRow({ v, tab, names, onChange }: { v: Row; tab: Tab; names: Record<string, string>; onChange: (v: Row) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hook, setHook] = useState(v.hook_line);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setErr("");
    try {
      const d = await api<{ video: Row }>(`/api/admin/creators/proven/${encodeURIComponent(v.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ action, ...extra }),
      });
      onChange(d.video);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const idea = v.added_by === "founder_idea";
  const link = v.source_url || v.reference_url || "";
  const s = v.stats;
  return (
    <tr>
      <td style={{ ...td, width: 190 }}>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", textDecoration: "none" }}>
            {idea ? "Reference" : v.platform === "tiktok" ? "TikTok" : "Instagram"} {v.handle ? `@${v.handle}` : ""} ↗
          </a>
        ) : (
          <span style={muted}>No video</span>
        )}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
          <Pill>{SOURCE_LABEL[v.added_by] ?? v.added_by}</Pill>
          {v.status !== "active" && v.status !== "suggested" && <Pill>{v.status}</Pill>}
          {v.audience && v.audience !== "any" && <Pill>{v.audience}</Pill>}
        </div>
        {v.posted_at && <div style={{ ...muted, marginTop: 4 }}>Posted {v.posted_at.slice(0, 10)}</div>}
        {v.suggest_reason && <div style={{ ...muted, marginTop: 4 }}>{v.suggest_reason}</div>}
        {idea && (v.idea_assignments ?? []).length > 0 && (
          <div style={{ ...muted, marginTop: 4 }}>
            Sent to {(v.idea_assignments ?? []).map((a) => `${names[a.creator_id] ?? a.creator_id} (${a.date})`).join(", ")}
          </div>
        )}
      </td>
      <td style={{ ...td, maxWidth: 420 }}>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea value={hook} onChange={(e) => setHook(e.target.value)} rows={3} style={input} />
            <div style={{ display: "flex", gap: 6 }}>
              <Btn kind="primary" onClick={() => act("edit_hook", { hook_line: hook })} disabled={busy}>
                Save
              </Btn>
              <Btn
                onClick={() => {
                  setHook(v.hook_line);
                  setEditing(false);
                }}
              >
                Cancel
              </Btn>
            </div>
          </div>
        ) : (
          <div style={{ fontWeight: 500 }}>{v.hook_line || <span style={muted}>No hook line yet</span>}</div>
        )}
        {idea && (v.talking_points ?? []).length > 0 && (
          <ul style={{ margin: "6px 0 0 16px", padding: 0, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
            {(v.talking_points ?? []).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {!idea && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 12, padding: 0, marginTop: 6, cursor: "pointer" }}
          >
            {open ? "Hide transcript" : v.transcript ? "Show transcript" : v.transcript_pending ? "Transcript coming" : "No transcript"}
          </button>
        )}
        {open && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {v.transcript || "No speech found in this video."}
          </p>
        )}
        {v.tired?.flagged && (
          <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(251,191,36,0.1)", color: "#fbbf24", fontSize: 12 }}>
            Possibly tired. {v.tired.reason}
          </div>
        )}
        <ErrorText>{err}</ErrorText>
      </td>
      <td style={td}>{idea ? <span style={muted}>-</span> : fmtViews(v.views)}</td>
      <td style={td}>
        {s.remakes ? (
          <>
            <div>{s.remakes} by {s.creators} {s.creators === 1 ? "creator" : "creators"}</div>
            <div style={muted}>
              {s.beat_normal} of {s.judged} beat their normal
            </div>
          </>
        ) : (
          <span style={muted}>None yet</span>
        )}
      </td>
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {tab === "suggested" && (
            <>
              <Btn kind="primary" onClick={() => act("approve")} disabled={busy}>
                Approve
              </Btn>
              <Btn onClick={() => act("dismiss")} disabled={busy}>
                Not this one
              </Btn>
            </>
          )}
          {(tab === "active" || (tab === "ideas" && v.status === "active")) && (
            <>
              {v.tired?.flagged && (
                <Btn onClick={() => act("keep")} disabled={busy}>
                  Keep
                </Btn>
              )}
              <Btn onClick={() => act("pause")} disabled={busy}>
                Pause
              </Btn>
              <Btn kind="danger" onClick={() => act("retire")} disabled={busy}>
                Retire
              </Btn>
            </>
          )}
          {(tab === "off" || (tab === "ideas" && v.status !== "active")) && (
            <Btn onClick={() => act("restore")} disabled={busy}>
              Restore
            </Btn>
          )}
          {!editing && (
            <Btn onClick={() => setEditing(true)} disabled={busy}>
              Edit hook
            </Btn>
          )}
          <select
            value={v.audience ?? "any"}
            onChange={(e) => act("set_audience", { audience: e.target.value })}
            disabled={busy}
            style={{ ...input, width: "auto", padding: "6px 8px", fontSize: 12 }}
            title="Who this video is for"
          >
            <option value="any">Anyone</option>
            <option value="men">Men</option>
            <option value="women">Women</option>
          </select>
        </div>
      </td>
    </tr>
  );
}

function IdeaForm({ onDone }: { onDone: () => void }) {
  const [hook, setHook] = useState("");
  const [points, setPoints] = useState("");
  const [ref, setRef] = useState("");
  const [audience, setAudience] = useState("any");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      await api("/api/admin/creators/proven", {
        method: "POST",
        body: JSON.stringify({ action: "add_idea", hook_line: hook, talking_points: points, reference_url: ref, audience }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <h3 style={h3}>New idea</h3>
      <p style={{ ...muted, marginBottom: 12 }}>
        It goes to 3 creators on their next posting day as one of their videos. After a week of results it joins everyone&apos;s rotation. Pause it if it doesn&apos;t work.
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Hook line">
          <input value={hook} onChange={(e) => setHook(e.target.value)} style={input} placeholder="If you're losing hair, pinch your scalp like this." />
        </Field>
        <Field label="Talking points" hint="One per line">
          <textarea value={points} onChange={(e) => setPoints(e.target.value)} rows={4} style={input} />
        </Field>
        <div className="cp-stack" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label="Reference link (optional)">
            <input value={ref} onChange={(e) => setRef(e.target.value)} style={input} placeholder="https://" />
          </Field>
          <Field label="For">
            <select value={audience} onChange={(e) => setAudience(e.target.value)} style={input}>
              <option value="any">Anyone</option>
              <option value="men">Men</option>
              <option value="women">Women</option>
            </select>
          </Field>
        </div>
      </div>
      <ErrorText>{err}</ErrorText>
      <div style={{ marginTop: 12 }}>
        <Btn kind="primary" onClick={submit} disabled={busy || !hook.trim()}>
          {busy ? "Adding..." : "Add idea"}
        </Btn>
      </div>
    </div>
  );
}
