"use client";

import { useEffect, useState } from "react";
import type { PostedVideo } from "@/lib/creators/types";
import { fmtDateShort } from "@/lib/creators/time";
import type { PortalData } from "./types";
import StepGuide from "./StepGuide";
import { POSTING_GUIDE } from "@/lib/creators/guide-content";
import { Button, C, Card, Eyebrow, H, Msg, P, Row, api, inputStyle } from "./ui";

function countdown(ms: number): string {
  if (ms <= 0) return "Deadline passed";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

const isFull = (v: PostedVideo) => !!v.tiktok_url.trim() && !!v.instagram_url.trim();

interface Assignment {
  id: string;
  hook_title: string;
  onscreen_text?: string;
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
            <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>videos logged on both apps</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: expired ? C.red : left < 3 * 3600000 ? C.amber : "#fff" }}>
              {countdown(left)}
            </div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>Due 11:59 pm your time</div>
          </div>
        </Row>
        {!data.today.is_weekday && (
          <P style={{ marginTop: 12, marginBottom: 0 }}>It&apos;s the weekend, so there&apos;s nothing due today.</P>
        )}
      </Card>

      {rows.map((row, i) => (
        <Card key={i} style={{ padding: 14 }}>
          <Row style={{ marginBottom: 10 }}>
            <Eyebrow style={{ marginBottom: 0 }}>Video {i + 1}</Eyebrow>
            {isFull(row) && <span style={{ color: C.green, fontSize: 12, fontWeight: 600 }}>✓ Both links</span>}
          </Row>
          <input
            style={{ ...inputStyle, marginBottom: 8 }}
            value={row.tiktok_url}
            onChange={(e) => set(i, "tiktok_url", e.target.value)}
            placeholder="TikTok link"
            inputMode="url"
            autoCapitalize="none"
            disabled={expired}
          />
          <input
            style={inputStyle}
            value={row.instagram_url}
            onChange={(e) => set(i, "instagram_url", e.target.value)}
            placeholder="Instagram link"
            inputMode="url"
            autoCapitalize="none"
            disabled={expired}
          />
        </Card>
      ))}

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

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, padding: "10px 2px", color: C.dim }}>How to post</summary>
        <div style={{ marginTop: 8 }}>
          <StepGuide guide={POSTING_GUIDE} />
        </div>
      </details>
    </div>
  );
}
