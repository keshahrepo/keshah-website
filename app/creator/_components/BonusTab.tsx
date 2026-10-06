"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDateShort } from "@/lib/creators/time";
import { Button, C, Card, Eyebrow, Field, Msg, P, Pill, Row, api, inputStyle, statusColor } from "./ui";

interface Claim {
  id: string;
  video_url: string;
  platform: "tiktok" | "instagram";
  posted_on: string;
  views_claimed: number;
  status: "claimed" | "approved" | "rejected";
  admin_note: string | null;
  claimed_at: string | null;
  /** "auto": added by the automatic post sync. */
  source: "auto" | "manual";
}

const statusLabel: Record<string, string> = { claimed: "In review", approved: "Approved", rejected: "Not approved" };

export default function BonusTab({ today }: { today: string }) {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<"tiktok" | "instagram">("tiktok");
  const [postedOn, setPostedOn] = useState("");
  const [views, setViews] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ claims: Claim[] }>("/api/creator/bonus").then((r) => setClaims(r.claims), (e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      let screenshot_path: string | undefined;
      if (file) {
        const { uploadUrl, objectPath } = await api<{ uploadUrl: string; objectPath: string }>("/api/creator/bonus/upload-url", {
          filename: file.name,
          contentType: file.type || "image/jpeg",
          sizeBytes: file.size,
        });
        const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
        if (!put.ok) throw new Error("The screenshot didn't upload. Try again, or send the claim without it.");
        screenshot_path = objectPath;
      }
      await api("/api/creator/bonus", {
        video_url: url,
        platform,
        posted_on: postedOn,
        views_claimed: Number(views.replace(/[^\d]/g, "")),
        ...(screenshot_path ? { screenshot_path } : {}),
      });
      setOk("Claim sent. We'll check the views and let you know.");
      setUrl("");
      setViews("");
      setPostedOn("");
      setFile(null);
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div>
      <Card>
        <Eyebrow>Views bonuses</Eyebrow>
        <P>
          You get $15 when a video passes 100K views and $100 in total when it passes 1M, within 30 days of posting. Each platform counts
          separately.
        </P>
        <P style={{ marginBottom: 0 }}>
          Bonuses are now added for you automatically. We check your videos every few hours, and when one passes 100K or 1M views within
          30 days it shows up here and on your invoice. You only need to send a claim if one is missing.
        </P>
      </Card>

      <Card>
        <Eyebrow>Your bonuses</Eyebrow>
        {claims === null && <P style={{ marginBottom: 0 }}>Loading...</P>}
        {claims?.length === 0 && <P style={{ marginBottom: 0 }}>No bonuses yet.</P>}
        {claims?.map((c) => (
          <div key={c.id} style={{ padding: "10px 0", borderTop: C.border }}>
            <Row>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {c.platform === "tiktok" ? "TikTok" : "Instagram"} · {c.views_claimed.toLocaleString()} views
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {c.source === "auto" && <Pill color={C.dim}>Automatic</Pill>}
                <Pill color={statusColor[c.status]}>{statusLabel[c.status]}</Pill>
              </div>
            </Row>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 4, wordBreak: "break-all" }}>
              Posted {fmtDateShort(c.posted_on)} · {c.video_url}
            </div>
            {c.admin_note && c.source !== "auto" && <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>{c.admin_note}</div>}
          </div>
        ))}
      </Card>

      <Card>
        <Eyebrow>Missing a bonus?</Eyebrow>
        <P>If a video passed 100K or 1M views and it isn&apos;t in your list above after a day, claim it here. A screenshot of the views helps us check it faster.</P>
        <form onSubmit={submit}>
          <Field label="Platform">
            <div style={{ display: "flex", gap: 8 }}>
              {(["tiktok", "instagram"] as const).map((p) => (
                <Button
                  key={p}
                  variant={platform === p ? "primary" : "ghost"}
                  onClick={() => setPlatform(p)}
                  style={{ flex: 1, padding: "10px 0" }}
                >
                  {p === "tiktok" ? "TikTok" : "Instagram"}
                </Button>
              ))}
            </div>
          </Field>
          <Field label="Video link">
            <input style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" autoCapitalize="none" required />
          </Field>
          <Field label="Date you posted it">
            <input style={inputStyle} type="date" value={postedOn} max={today} onChange={(e) => setPostedOn(e.target.value)} required />
          </Field>
          <Field label="Views right now">
            <input style={inputStyle} value={views} onChange={(e) => setViews(e.target.value)} placeholder="e.g. 120000" inputMode="numeric" required />
          </Field>
          <Field label="Screenshot of the views (optional)">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ ...inputStyle, padding: 10 }}
            />
          </Field>
          <Msg error={err} ok={ok} />
          <Button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Sending..." : "Send claim"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
