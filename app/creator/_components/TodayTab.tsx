"use client";

import { useEffect, useState } from "react";
import type { PostedVideo } from "@/lib/creators/types";
import { postKey } from "@/lib/creators/scrape";
import { fmtDateShort, localDateIn } from "@/lib/creators/time";
import type { PortalData } from "./types";
import StepGuide from "./StepGuide";
import { POSTING_GUIDE } from "@/lib/creators/guide-content";
import { CONCEPT_LABEL, CONCEPT_ROW_INDEXES, INSPIRED_BY_LABEL, TEST_TIPS, TEST_TIPS_TITLE } from "@/lib/creators/test-tips";
import { Button, C, Card, CheckCircle, Eyebrow, H, Msg, P, ProgressBar, Row, api, inputStyle } from "./ui";

function countdown(ms: number): string {
  if (ms <= 0) return "Deadline passed";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

const isFull = (v: PostedVideo) => !!v.tiktok_url.trim() && !!v.instagram_url.trim();

/** GET /api/creator/posts (today only). */
interface FoundPosts {
  today: string;
  last_synced_at: string | null;
  days: { date: string; tiktok: number; instagram: number; posted: boolean; views: number }[];
  posts: { platform: "tiktok" | "instagram"; url: string; views: number; pinned: boolean }[];
}

/** "2:15 pm" in the creator's timezone, with the date in front when it wasn't today. */
function checkedAt(iso: string, tz: string, today: string): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })
    .format(d)
    .replace(/\s*(AM|PM)$/i, (_m, ap: string) => ` ${ap.toLowerCase()}`);
  const day = localDateIn(d, tz);
  return day === today ? time : `${fmtDateShort(day)} at ${time}`;
}

function foundLine(f: FoundPosts, tz: string, target: number): string | null {
  if (!f.last_synced_at) return null;
  const checked = ` Last checked ${checkedAt(f.last_synced_at, tz, f.today)}.`;
  const day = f.days.find((x) => x.date === f.today);
  if (day?.posted) return `Today counts. All ${target} videos found on both apps.${checked}`;
  if (!day || day.tiktok + day.instagram === 0) return `We haven't found any of today's videos yet.${checked}`;
  return `We found ${day.tiktok} of your TikToks and ${day.instagram} of your Reels from today.${checked}`;
}

interface Assignment {
  id: string;
  hook_title: string;
  onscreen_text?: string;
}

function TestTipsCard() {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ padding: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          minHeight: 56,
          padding: "0 18px",
          background: "none",
          border: "none",
          color: "#fff",
          fontFamily: C.font,
          fontSize: 15,
          fontWeight: 600,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span>{TEST_TIPS_TITLE}</span>
        <span aria-hidden style={{ color: C.faint, fontSize: 22, lineHeight: 1, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
          ›
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 18px 18px" }}>
          {TEST_TIPS.map((sec) => {
            const List = sec.style === "steps" ? "ol" : "ul";
            return (
              <div key={sec.title} style={{ marginTop: 14 }}>
                <H style={{ fontSize: 15, marginBottom: 8 }}>{sec.title}</H>
                <List style={{ margin: 0, paddingLeft: 22, listStyleType: sec.style === "steps" ? "decimal" : "disc" }}>
                  {sec.items.map((item, j) => (
                    <li key={j} style={{ fontSize: 14, lineHeight: 1.55, color: C.dim, marginBottom: 6 }}>
                      {item}
                    </li>
                  ))}
                </List>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function TodayTab({ data, onSaved }: { data: PortalData; onSaved: () => void }) {
  const target = data.config.videos_per_weekday;
  const initial = (): PostedVideo[] => {
    const rows = (data.today.log?.videos ?? []).map((v) => ({ ...v }));
    while (rows.length < target) rows.push({ tiktok_url: "", instagram_url: "" });
    return rows;
  };
  const [rows, setRows] = useState<PostedVideo[]>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [deadline] = useState(() => Date.now() + data.today.ms_until_deadline);
  const [left, setLeft] = useState(data.today.ms_until_deadline);
  const [hooks, setHooks] = useState<Assignment[] | null>(null);
  const [found, setFound] = useState<FoundPosts | null>(null);

  useEffect(() => {
    const t = setInterval(() => setLeft(deadline - Date.now()), 30000);
    return () => clearInterval(t);
  }, [deadline]);

  // Existing hook assignments (legacy portal feature), shown if any exist.
  useEffect(() => {
    api<{ assignments?: Assignment[] }>("/api/creator/me")
      .then((r) => setHooks(r.assignments ?? []))
      .catch(() => setHooks([]));
  }, []);

  // What the automatic post sync found today (status line + per-link views).
  useEffect(() => {
    api<FoundPosts>("/api/creator/posts")
      .then(setFound)
      .catch(() => setFound(null));
  }, [data.today.log?.logged_at]);

  const autoKeys = new Set(
    (data.today.log?.auto_urls ?? []).map((u) => postKey(u, /tiktok\.com/i.test(u) ? "tiktok" : "instagram")),
  );
  const views = new Map((found?.posts ?? []).map((p) => [postKey(p.url, p.platform), p.views]));
  const isAuto = (url: string, platform: "tiktok" | "instagram") => !!url.trim() && autoKeys.has(postKey(url, platform));
  const viewsOf = (url: string, platform: "tiktok" | "instagram") => (url.trim() ? views.get(postKey(url, platform)) : undefined);
  const line = found ? foundLine(found, data.creator.timezone, target) : null;

  const done = rows.filter(isFull).length;
  const expired = left <= 0;

  function set(i: number, k: keyof PostedVideo, v: string) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));
    setOk(null);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const r = await api<{ complete_videos: number }>("/api/creator/posting", { date: data.today.date, videos: rows });
      setOk(
        r.complete_videos >= target
          ? `Saved. All ${target} videos are in for today.`
          : `Saved. ${r.complete_videos} of ${target} videos have both links.`,
      );
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    }
    setSaving(false);
  }

  return (
    <div>
      <Card>
        <Eyebrow>Today · {fmtDateShort(data.today.date)}</Eyebrow>
        <Row>
          <div>
            <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>
              {done}
              <span style={{ fontSize: 18, color: C.faint }}>/{target}</span>
            </div>
            <div style={{ fontSize: 13, color: C.dim, marginTop: 6 }}>videos logged on both apps</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: expired ? C.red : left < 3 * 3600000 ? C.amber : "#fff" }}>
              {countdown(left)}
            </div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>Due 11:59 pm your time</div>
          </div>
        </Row>
        <ProgressBar value={done / target} color={done >= target ? C.green : "#fff"} style={{ marginTop: 16 }} />
        {!data.today.is_weekday && (
          <P style={{ marginTop: 12, marginBottom: 0 }}>It&apos;s the weekend, so there&apos;s nothing due today.</P>
        )}
        {line && (
          <P style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: found?.days.find((x) => x.date === found.today)?.posted ? C.green : C.dim }}>
            {line}
          </P>
        )}
        <P style={{ marginTop: line ? 6 : 12, marginBottom: 0, fontSize: 12, color: C.faint }}>
          Videos show up here on their own within a few hours. If one is missing near the deadline, paste its link.
        </P>
      </Card>

      {rows.map((row, i) => {
        // Format creators (invite only) make their own concepts on rows 4 and 5.
        const isTest = data.creator.format_creator && CONCEPT_ROW_INDEXES.includes(i);
        const lastConcept = isTest && i === CONCEPT_ROW_INDEXES[CONCEPT_ROW_INDEXES.length - 1];
        const auto = isAuto(row.tiktok_url, "tiktok") || isAuto(row.instagram_url, "instagram");
        const ttViews = viewsOf(row.tiktok_url, "tiktok");
        const igViews = viewsOf(row.instagram_url, "instagram");
        return (
          <div key={i}>
            <Card
              style={{
                padding: 16,
                ...(isFull(row) ? {} : { background: C.box, border: "1px solid transparent", borderRadius: 12 }),
                ...(isTest ? { border: "1px solid rgba(255,255,255,0.25)" } : {}),
              }}
            >
              <Row style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Eyebrow style={{ marginBottom: 0 }}>{isTest ? `Video ${i + 1} · ${CONCEPT_LABEL}` : `Video ${i + 1}`}</Eyebrow>
                  {auto && <span style={{ fontSize: 11, color: C.faint }}>Found automatically</span>}
                </div>
                {isFull(row) && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.faint, fontSize: 12, fontWeight: 500 }}>
                    <CheckCircle size={14} />
                    Both links
                  </span>
                )}
              </Row>
              <input
                style={{ ...inputStyle, marginBottom: 8 }}
                value={row.tiktok_url}
                onChange={(e) => set(i, "tiktok_url", e.target.value)}
                placeholder="TikTok link"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                aria-label={`Video ${i + 1} TikTok link`}
                disabled={expired}
              />
              <input
                style={inputStyle}
                value={row.instagram_url}
                onChange={(e) => set(i, "instagram_url", e.target.value)}
                placeholder="Instagram link"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                aria-label={`Video ${i + 1} Instagram link`}
                disabled={expired}
              />
              {(ttViews !== undefined || igViews !== undefined) && (
                <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>
                  {[
                    ttViews !== undefined ? `TikTok ${ttViews.toLocaleString("en-US")} views` : "",
                    igViews !== undefined ? `Instagram ${igViews.toLocaleString("en-US")} views` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
              {isTest && (
                <label style={{ display: "block", marginTop: 12 }}>
                  <span style={{ display: "block", fontSize: 13, color: C.dim, marginBottom: 6 }}>
                    {INSPIRED_BY_LABEL} <span style={{ color: C.faint }}>· optional</span>
                  </span>
                  <input
                    style={inputStyle}
                    value={row.inspired_by_url ?? ""}
                    onChange={(e) => set(i, "inspired_by_url", e.target.value)}
                    placeholder="https://"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    disabled={expired}
                  />
                </label>
              )}
            </Card>
            {lastConcept && <TestTipsCard />}
          </div>
        );
      })}

      <Msg error={err} ok={ok} />
      <Button onClick={save} disabled={saving || expired} style={{ width: "100%", marginBottom: 8 }}>
        {saving ? "Saving..." : "Save today's videos"}
      </Button>
      <P style={{ fontSize: 12, color: C.faint, textAlign: "center" }}>
        You can save as you go and come back to add more before the deadline.
      </P>

      {hooks && hooks.length > 0 && (
        <Card style={{ marginTop: 10 }}>
          <Eyebrow>Today&apos;s hooks</Eyebrow>
          {hooks.map((h) => (
            <div key={h.id} style={{ padding: "8px 0", borderTop: C.border }}>
              <H style={{ fontSize: 14, marginBottom: 2 }}>{h.hook_title}</H>
              {h.onscreen_text && <div style={{ fontSize: 13, color: C.dim }}>On-screen text: {h.onscreen_text}</div>}
            </div>
          ))}
        </Card>
      )}

      <div style={{ marginTop: 24 }}>
        <Eyebrow>How to post</Eyebrow>
        <StepGuide collapsible guide={POSTING_GUIDE} />
      </div>
    </div>
  );
}
