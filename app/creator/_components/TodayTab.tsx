"use client";

import { useEffect, useRef, useState } from "react";
import type { PostedVideo } from "@/lib/creators/types";
import type { PicksPayload, PublicProven } from "@/lib/creators/proven-db";
import { postKey } from "@/lib/creators/scrape";
import { fmtDateShort, localDateIn } from "@/lib/creators/time";
import type { MonthData, PortalData } from "./types";
import StepGuide from "./StepGuide";
import { ContractSigner } from "./ContractTab";
import PaymentsSetup, { type PaymentView } from "./PaymentsSetup";
import { POSTING_GUIDE } from "@/lib/creators/guide-content";
import { CONCEPT_LABEL, CONCEPT_ROW_INDEXES, INSPIRED_BY_LABEL, TEST_TIPS, TEST_TIPS_TITLE } from "@/lib/creators/test-tips";
import { HomeHeader, Screen, StreakChip, TaskRow, TaskThumb, usePushed, useJustDone } from "./AppShell";
import { AllDone, Button, C, Card, Eyebrow, Field, Group, H, Icon, Msg, P, ProfileRow, SectionLabel, api, inputStyle } from "./ui";

function countdown(ms: number): string {
  if (ms <= 0) return "Deadline passed";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

const isFull = (v: PostedVideo) => !!v.tiktok_url.trim() && !!v.instagram_url.trim();

/** Posting days in a row up to today (approved days off count), like the app's day streak. */
export function postingStreak(m: MonthData): number {
  let n = 0;
  for (const d of [...m.days].reverse()) {
    if (d.date > m.today) continue;
    if (d.state === "posted" || d.state === "off") n++;
    else if (d.date === m.today && d.state !== "missed") continue; // today isn't over yet
    else break;
  }
  return n;
}

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

/** Collapsible tips row in the profile group style. */
function TestTipsCard() {
  const [open, setOpen] = useState(false);
  return (
    <Group style={{ marginTop: 24 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="cp-ink cp-focus"
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          padding: "16px 20px",
          background: "none",
          border: "none",
          color: "#fff",
          fontFamily: C.font,
          fontSize: 14,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span style={{ flex: 1 }}>{TEST_TIPS_TITLE}</span>
        <Icon name="chevronRight" size={20} color={C.faint} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {open && (
        <div style={{ padding: "0 20px 20px" }}>
          {TEST_TIPS.map((sec) => {
            const List = sec.style === "steps" ? "ol" : "ul";
            return (
              <div key={sec.title} style={{ marginTop: 14 }}>
                <H style={{ fontSize: 14, marginBottom: 8 }}>{sec.title}</H>
                <List style={{ margin: 0, paddingLeft: 22, listStyleType: sec.style === "steps" ? "decimal" : "disc" }}>
                  {sec.items.map((item, j) => (
                    <li key={j} style={{ fontSize: 13, lineHeight: 1.5, color: C.dim, marginBottom: 6 }}>
                      {item}
                    </li>
                  ))}
                </List>
              </div>
            );
          })}
        </div>
      )}
    </Group>
  );
}

/** The proven video (or founder idea) a given row remakes, at the top of its screen. */
function PickCard({ video, canSwap, swapping, onSwap }: { video: PublicProven; canSwap: boolean; swapping: boolean; onSwap: (() => void) | null }) {
  const [open, setOpen] = useState(false);
  const idea = video.kind === "idea";
  const link = video.source_url || video.reference_url;
  const where = video.platform === "tiktok" ? "TikTok" : video.platform === "instagram" ? "Instagram" : "";
  return (
    <div style={{ background: C.card, border: C.border, borderRadius: 16, padding: 20, marginBottom: 24 }}>
      <Eyebrow>{idea ? "Film this idea" : "Remake this video"}</Eyebrow>
      <H style={{ fontSize: 16, lineHeight: 1.4, marginBottom: 10 }}>{video.hook_line || "Open the original to see how it starts."}</H>
      {idea && video.talking_points.length > 0 && (
        <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>
          {video.talking_points.map((t, j) => (
            <li key={j} style={{ fontSize: 13, lineHeight: 1.5, color: C.dim, marginBottom: 4 }}>
              {t}
            </li>
          ))}
        </ul>
      )}
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="cp-focus" style={{ display: "inline-block", fontSize: 13, color: "#fff", textDecoration: "underline", marginBottom: 8 }}>
          {idea ? "See the reference" : `See the original on ${where || "the app"}`}
        </a>
      )}
      {!idea && video.transcript && (
        <div>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="cp-focus"
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: "4px 0", color: C.faint, fontFamily: C.font, fontSize: 13, cursor: "pointer" }}
          >
            {open ? "Hide what they say" : "Read what they say"}
            <Icon name="chevronRight" size={18} color={C.faint} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
          </button>
          {open && <P style={{ fontSize: 13, lineHeight: 1.6, color: C.dim, marginTop: 6, whiteSpace: "pre-wrap" }}>{video.transcript}</P>}
        </div>
      )}
      {onSwap && (
        <Button variant="ghost" onClick={onSwap} disabled={swapping || !canSwap} style={{ width: "100%", marginTop: 12 }}>
          {swapping ? "Swapping..." : canSwap ? "Swap for a different video" : "No other videos to swap in today"}
        </Button>
      )}
    </div>
  );
}

/** One video as a task row. */
function VideoRow({ i, row, label, hook, auto, pulse, onOpen }: { i: number; row: PostedVideo; label: string; hook?: string; auto: boolean; pulse: boolean; onOpen: () => void }) {
  const done = isFull(row);
  const justDone = useJustDone(done);
  const tt = !!row.tiktok_url.trim();
  const ig = !!row.instagram_url.trim();
  const target = tt && ig ? "TikTok and Instagram" : tt ? "TikTok in, Instagram missing" : ig ? "Instagram in, TikTok missing" : "TikTok and Instagram links";
  return (
    <TaskRow
      thumb={<TaskThumb icon="videocam" />}
      title={label}
      target={hook ? <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{hook}</span> : target}
      meta={auto ? "Found automatically" : done ? "Both links in" : "Tap to add your links"}
      doneText="Both links in"
      done={done}
      justDone={justDone}
      pulse={pulse}
      enterIndex={i}
      onClick={onOpen}
    />
  );
}

export default function TodayTab({ data, onSaved, onProfile }: { data: PortalData; onSaved: () => void; onProfile: () => void }) {
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
  const [picks, setPicks] = useState<PicksPayload | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapErr, setSwapErr] = useState<string | null>(null);
  const [found, setFound] = useState<FoundPosts | null>(null);
  const detail = usePushed<number>();
  // Creators who skipped Getting started can still be sent a contract, and may not have payment details yet.
  const contractScreen = usePushed<true>();
  const paymentsScreen = usePushed<true>();
  const [signedNow, setSignedNow] = useState(false);
  const [pay, setPay] = useState<PaymentView | null>(null);
  useEffect(() => {
    api<PaymentView>("/api/creator/payment").then(setPay, () => setPay(null));
  }, []);
  const contractDue = data.contract.status === "sent" && !signedNow;
  const paymentsDue = !!pay?.enabled && !pay.complete;
  // Saved state per row, so the list only shows a row as done once it's saved.
  const savedRef = useRef<PostedVideo[]>(initial());
  const [saved, setSaved] = useState<PostedVideo[]>(savedRef.current);

  useEffect(() => {
    const t = setInterval(() => setLeft(deadline - Date.now()), 30000);
    return () => clearInterval(t);
  }, [deadline]);

  // Today's proven videos to remake (row i = pick slot i).
  useEffect(() => {
    api<PicksPayload>("/api/creator/picks")
      .then(setPicks)
      .catch(() => setPicks(null));
  }, []);
  // A saved row keeps the pick it was saved against; otherwise row i shows pick slot i.
  const pickEntry = (idx: number) => {
    const own = saved[idx]?.proven_id;
    return (own && picks?.picks.find((p) => p.video.id === own)) || picks?.picks.find((p) => p.slot === idx);
  };
  const pickAt = (idx: number) => pickEntry(idx)?.video;

  async function swap(slot: number) {
    setSwapping(true);
    setSwapErr(null);
    try {
      setPicks(await api<PicksPayload>("/api/creator/picks", { slot }));
    } catch (e) {
      setSwapErr((e as Error).message);
    }
    setSwapping(false);
  }

  // Existing hook assignments (legacy portal feature), shown only until proven videos are set up.
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
  const foundPosted = !!found?.days.find((x) => x.date === found.today)?.posted;

  const done = saved.filter(isFull).length;
  const allDone = done >= target;
  const expired = left <= 0;
  const streak = postingStreak(data.month);
  const firstOpen = saved.findIndex((r) => !isFull(r));

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
      const was = detail.value !== null && isFull(saved[detail.value]);
      const now = detail.value !== null && isFull(rows[detail.value]);
      savedRef.current = rows.map((x) => ({ ...x }));
      setSaved(savedRef.current);
      onSaved();
      // Like finishing a session in the app: back to the list, where the check pops in.
      if (now && !was) detail.close();
    } catch (e) {
      setErr((e as Error).message);
    }
    setSaving(false);
  }

  const rowLabel = (i: number) =>
    data.creator.format_creator && CONCEPT_ROW_INDEXES.includes(i) ? `Video ${i + 1} · ${CONCEPT_LABEL}` : `Video ${i + 1}`;

  // Deadline + sync status, in the app's all-done card (_buildDayCompleteCard).
  const statusCard = (
    <div className="cp-enter" style={{ ["--i" as string]: 0, background: C.card, border: C.border, borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 13, color: expired ? C.red : C.faint }}>
        {data.today.is_weekday ? `${countdown(left)}. Due 11:59 pm your time.` : "It's the weekend, so there's nothing due today."}
      </div>
      {line && <div style={{ fontSize: 13, color: foundPosted ? C.green : "rgba(255,255,255,0.7)", marginTop: 12 }}>{line}</div>}
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 12 }}>
        Videos show up here on their own within a few hours. If one is missing near the deadline, paste its link.
      </div>
    </div>
  );

  const i = detail.value;
  const dRow = i !== null ? rows[i] : null;
  const isTest = i !== null && data.creator.format_creator && CONCEPT_ROW_INDEXES.includes(i);
  const ttViews = dRow ? viewsOf(dRow.tiktok_url, "tiktok") : undefined;
  const igViews = dRow ? viewsOf(dRow.instagram_url, "instagram") : undefined;
  const dAuto = dRow ? isAuto(dRow.tiktok_url, "tiktok") || isAuto(dRow.instagram_url, "instagram") : false;

  return (
    <div>
      <HomeHeader chatHref={data.config.slack_invite_url} onProfile={onProfile} />

      {contractDue && (
        <div className="cp-head-enter" style={{ background: C.card, border: C.border, borderRadius: 16, padding: 24, marginTop: 20 }}>
          <H style={{ fontSize: 18 }}>Your contract is ready to sign</H>
          <P>Read it and sign it right here. It only takes a few minutes.</P>
          <Button onClick={() => contractScreen.open(true)} style={{ width: "100%", marginTop: 4 }}>
            Read and sign
          </Button>
        </div>
      )}
      {paymentsDue && (
        <Group style={{ marginTop: contractDue ? 16 : 20 }}>
          <ProfileRow label="Set up your payments" subtitle="Add your bank details and tax form so we can pay you." onClick={() => paymentsScreen.open(true)} isLast />
        </Group>
      )}

      <div style={{ height: 20 }} />
      {allDone ? (
        <div style={{ display: "flex", alignItems: "center", paddingBottom: 4 }}>
          <AllDone />
          {streak > 0 && (
            <div style={{ marginLeft: 14, paddingTop: 3 }}>
              <StreakChip days={streak} />
            </div>
          )}
        </div>
      ) : (
        streak > 0 && <StreakChip days={streak} />
      )}

      <div style={{ height: 24 }} />
      {allDone ? statusCard : <SectionLabel right={`${done} / ${target}`}>Today&apos;s videos</SectionLabel>}

      {saved.map((row, idx) => (
        <VideoRow
          key={idx}
          i={idx + (allDone ? 1 : 0)}
          row={row}
          label={rowLabel(idx)}
          hook={pickAt(idx)?.hook_line}
          auto={isAuto(row.tiktok_url, "tiktok") || isAuto(row.instagram_url, "instagram")}
          pulse={idx === firstOpen && data.today.is_weekday && !expired}
          onOpen={() => {
            setRows(savedRef.current.map((x) => ({ ...x })));
            setErr(null);
            setOk(null);
            setSwapErr(null);
            detail.open(idx);
          }}
        />
      ))}

      {!allDone && statusCard}
      <Msg ok={detail.value === null ? ok : null} />

      {hooks && hooks.length > 0 && !picks?.picks.length && (
        <Card style={{ marginTop: 4 }}>
          <Eyebrow>Today&apos;s hooks</Eyebrow>
          {hooks.map((h) => (
            <div key={h.id} style={{ padding: "8px 0", borderTop: C.border }}>
              <H style={{ fontSize: 14, marginBottom: 2 }}>{h.hook_title}</H>
              {h.onscreen_text && <div style={{ fontSize: 13, color: C.dim }}>On-screen text: {h.onscreen_text}</div>}
            </div>
          ))}
        </Card>
      )}

      <div style={{ marginTop: 12 }}>
        <Eyebrow>How to post</Eyebrow>
        <StepGuide collapsible guide={POSTING_GUIDE} />
      </div>

      {contractScreen.value && (
        <Screen title="Contract" onBack={contractScreen.close} closing={contractScreen.closing}>
          <ContractSigner
            onSigned={() => {
              setSignedNow(true);
              contractScreen.close();
              onSaved();
            }}
          />
        </Screen>
      )}
      {paymentsScreen.value && (
        <Screen title="Payments" onBack={paymentsScreen.close} closing={paymentsScreen.closing}>
          <PaymentsSetup onChange={setPay} />
        </Screen>
      )}

      {i !== null && dRow && (
        <Screen title={rowLabel(i)} onBack={detail.close} closing={detail.closing}>
          {pickAt(i) && (
            <PickCard
              video={pickAt(i)!}
              canSwap={!!picks?.can_swap}
              swapping={swapping}
              // Once a video is posted for this row, the pick stays (it's how remakes are tracked).
              onSwap={!expired && !saved[i]?.tiktok_url.trim() && !saved[i]?.instagram_url.trim() ? () => swap(pickEntry(i)!.slot) : null}
            />
          )}
          {swapErr && <Msg error={swapErr} />}
          {dAuto && <P style={{ fontSize: 13, color: C.faint }}>We found this video automatically. You can still change the links.</P>}
          <Field label="TikTok link">
            <input
              className="cp-input"
              style={inputStyle}
              value={dRow.tiktok_url}
              onChange={(e) => set(i, "tiktok_url", e.target.value)}
              placeholder="Paste the TikTok link"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              aria-label={`Video ${i + 1} TikTok link`}
              disabled={expired}
            />
          </Field>
          <Field label="Instagram link">
            <input
              className="cp-input"
              style={inputStyle}
              value={dRow.instagram_url}
              onChange={(e) => set(i, "instagram_url", e.target.value)}
              placeholder="Paste the Instagram link"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              aria-label={`Video ${i + 1} Instagram link`}
              disabled={expired}
            />
          </Field>
          {(ttViews !== undefined || igViews !== undefined) && (
            <div style={{ fontSize: 13, color: C.faint, marginTop: -8, marginBottom: 20 }}>
              {[
                ttViews !== undefined ? `TikTok ${ttViews.toLocaleString("en-US")} views` : "",
                igViews !== undefined ? `Instagram ${igViews.toLocaleString("en-US")} views` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
          {isTest && (
            <Field label={`${INSPIRED_BY_LABEL} (optional)`}>
              <input
                className="cp-input"
                style={inputStyle}
                value={dRow.inspired_by_url ?? ""}
                onChange={(e) => set(i, "inspired_by_url", e.target.value)}
                placeholder="https://"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                disabled={expired}
              />
            </Field>
          )}
          <Msg error={err} ok={ok} />
          <Button onClick={save} disabled={saving || expired} style={{ width: "100%", marginTop: 4 }}>
            {saving ? "Saving..." : "Save today's videos"}
          </Button>
          <P style={{ fontSize: 12, color: C.faint, textAlign: "center", marginTop: 12 }}>
            You can save as you go and come back to add more before the deadline.
          </P>
          {isTest && <TestTipsCard />}
        </Screen>
      )}
    </div>
  );
}
