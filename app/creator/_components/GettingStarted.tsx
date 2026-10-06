"use client";

import { useState, type ReactNode } from "react";
import type { PortalData } from "./types";
import { Button, C, Card, Eyebrow, Field, H, Msg, P, api, inputStyle } from "./ui";

type Onb = PortalData["onboarding"];

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <Card style={{ borderColor: done ? "rgba(74,222,128,0.35)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 600,
            background: done ? C.green : "rgba(255,255,255,0.1)",
            color: done ? "#000" : "#fff",
          }}
        >
          {done ? "✓" : n}
        </div>
        <H style={{ marginBottom: 0 }}>{title}</H>
      </div>
      {children}
    </Card>
  );
}

const ghostLink = {
  padding: "12px 18px",
  borderRadius: 12,
  border: C.border,
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
} as const;

export default function GettingStarted({ data, onDone }: { data: PortalData; onDone: () => void }) {
  const cfg = data.config;
  const [onb, setOnb] = useState<Onb>(data.onboarding);
  const [tt, setTt] = useState(data.creator.tiktok_handle);
  const [ig, setIg] = useState(data.creator.instagram_handle);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ step: string; msg: string } | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(() => cfg.quiz.map(() => null));
  const [quizMsg, setQuizMsg] = useState<string | null>(null);

  async function mark(step: string, extra: Record<string, unknown> = {}) {
    setBusy(step + (extra.video_id ?? ""));
    setErr(null);
    try {
      const r = await api<{ onboarding: Onb; quiz: { passed: boolean; correct: number; total: number } | null }>(
        "/api/creator/onboarding",
        { step, ...extra },
      );
      setOnb(r.onboarding);
      if (r.quiz && !r.quiz.passed) {
        setQuizMsg(`You got ${r.quiz.correct} of ${r.quiz.total} right. Have another look and try again.`);
      } else if (r.quiz) {
        setQuizMsg(null);
      }
    } catch (e) {
      setErr({ step, msg: (e as Error).message });
    }
    setBusy(null);
  }

  const errFor = (step: string) => <Msg error={err?.step === step ? err.msg : null} />;
  const videosDone = cfg.founder_videos.every((v) => onb.videos_watched?.[v.id]);
  const warm = onb.warmup_days ?? [];
  const warmDone = warm.length >= cfg.warmup_days;
  const tickedToday = warm.includes(data.today.date);
  const link = data.link?.short_link;

  if (onb.complete) {
    return (
      <div>
        <Card style={{ textAlign: "center", padding: 28 }}>
          <H style={{ fontSize: 22 }}>You&apos;re ready.</H>
          <P>Your first posting day is the next weekday.</P>
          <Button onClick={onDone} style={{ width: "100%" }}>
            Open my portal
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>Getting started</Eyebrow>
      <H style={{ fontSize: 22 }}>Welcome, {data.creator.name.split(" ")[0] || "there"}.</H>
      <P>Go through these steps once. When they&apos;re all done, your full portal opens up.</P>

      <Step n={1} title="Learn KESHAH" done={videosDone}>
        <P>
          Start with{" "}
          <a href={cfg.site_url} target="_blank" rel="noreferrer" style={{ color: "#fff" }}>
            keshah.com
          </a>
          , then watch both of these videos.
        </P>
        {cfg.founder_videos.map((v) => {
          const done = !!onb.videos_watched?.[v.id];
          return (
            <div key={v.id} style={{ padding: "10px 0", borderTop: C.border }}>
              <div style={{ fontSize: 14, marginBottom: done ? 0 : 8 }}>
                {done ? "✓ " : ""}
                {v.title}
              </div>
              {!done && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setOpened((o) => ({ ...o, [v.id]: true }))}
                    style={ghostLink}
                  >
                    Open video
                  </a>
                  <Button disabled={!opened[v.id] || busy === "videos" + v.id} onClick={() => mark("videos", { video_id: v.id })}>
                    I watched it
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {errFor("videos")}
      </Step>

      <Step n={2} title="Quick check" done={!!onb.quiz_passed_at}>
        {onb.quiz_passed_at ? (
          <P style={{ marginBottom: 0 }}>All right. Nice work.</P>
        ) : !videosDone ? (
          <P style={{ marginBottom: 0 }}>Watch both videos first, then answer three quick questions.</P>
        ) : (
          <>
            {cfg.quiz.map((q, qi) => (
              <div key={q.id} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  {qi + 1}. {q.question}
                </div>
                {q.options.map((o, oi) => {
                  const on = answers[qi] === oi;
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => {
                        setAnswers((a) => a.map((x, j) => (j === qi ? oi : x)));
                        setQuizMsg(null);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        marginBottom: 6,
                        borderRadius: 12,
                        border: on ? "1px solid #fff" : C.border,
                        background: on ? "rgba(255,255,255,0.12)" : "transparent",
                        color: "#fff",
                        fontFamily: C.font,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            ))}
            {quizMsg && <Msg error={quizMsg} />}
            {errFor("quiz")}
            <Button disabled={answers.some((a) => a === null) || busy === "quiz"} onClick={() => mark("quiz", { answers })}>
              Check my answers
            </Button>
          </>
        )}
      </Step>

      <Step n={3} title="Set up your accounts" done={!!onb.accounts_done_at}>
        <P>{cfg.accounts_step_text}</P>
        <Eyebrow>Your keshah.com email</Eyebrow>
        <div style={{ fontSize: 15, marginBottom: 12, wordBreak: "break-all" }}>
          {data.creator.keshah_email || <span style={{ color: C.faint }}>Not set up yet. Your manager will add it.</span>}
        </div>
        {cfg.accounts_guide_url ? (
          <P>
            <a href={cfg.accounts_guide_url} target="_blank" rel="noreferrer" style={{ color: "#fff" }}>
              Open the setup guide
            </a>
          </P>
        ) : (
          <P style={{ fontSize: 12, color: C.faint }}>Setup guide coming soon.</P>
        )}
        <Field label="TikTok handle">
          <input style={inputStyle} value={tt} onChange={(e) => setTt(e.target.value)} placeholder="@yourhandle" autoCapitalize="none" />
        </Field>
        <Field label="Instagram handle">
          <input style={inputStyle} value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@yourhandle" autoCapitalize="none" />
        </Field>
        {errFor("accounts")}
        <Button disabled={busy === "accounts"} onClick={() => mark("accounts", { tiktok_handle: tt, instagram_handle: ig })}>
          {onb.accounts_done_at ? "Update handles" : "Save handles"}
        </Button>
      </Step>

      <Step n={4} title="Join Slack" done={!!onb.slack_joined_at}>
        {cfg.slack_invite_url ? (
          <P>
            <a href={cfg.slack_invite_url} target="_blank" rel="noreferrer" style={{ color: "#fff" }}>
              Open the Slack invite
            </a>{" "}
            and join the team.
          </P>
        ) : (
          <P>Your manager will send you the Slack invite link.</P>
        )}
        {errFor("slack")}
        {!onb.slack_joined_at && (
          <Button disabled={busy === "slack"} onClick={() => mark("slack")}>
            I&apos;ve joined
          </Button>
        )}
      </Step>

      <Step n={5} title={`${cfg.warmup_days}-day warm-up`} done={warmDone}>
        <P>{cfg.warmup_text}</P>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {Array.from({ length: cfg.warmup_days }, (_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "10px 0",
                borderRadius: 12,
                border: C.border,
                background: warm[i] ? "rgba(74,222,128,0.15)" : "transparent",
                color: warm[i] ? C.green : C.faint,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {warm[i] ? "✓" : ""} Day {i + 1}
            </div>
          ))}
        </div>
        {errFor("warmup")}
        {!warmDone && (
          <Button disabled={tickedToday || busy === "warmup"} onClick={() => mark("warmup")}>
            {tickedToday ? "Done for today. Back tomorrow." : "I warmed up today"}
          </Button>
        )}
      </Step>

      <Step n={6} title="Posting guide" done={!!onb.rules_ack_at}>
        {cfg.posting_guide_url ? (
          <P>
            <a href={cfg.posting_guide_url} target="_blank" rel="noreferrer" style={{ color: "#fff" }}>
              Open the full posting guide
            </a>
          </P>
        ) : (
          <P style={{ fontSize: 12, color: C.faint }}>Full posting guide coming soon.</P>
        )}
        <ul style={{ margin: "0 0 12px", paddingLeft: 18 }}>
          {cfg.posting_rules.map((r, i) => (
            <li key={i} style={{ fontSize: 14, lineHeight: 1.6, color: C.dim }}>
              {r}
            </li>
          ))}
        </ul>
        {errFor("rules")}
        {!onb.rules_ack_at && (
          <Button disabled={busy === "rules"} onClick={() => mark("rules")}>
            I&apos;ve read it
          </Button>
        )}
      </Step>

      <Step n={7} title="Your link" done={!!onb.link_seen_at}>
        {link ? (
          <>
            <P>This is your tracking link. It&apos;s how we see the people you send to KESHAH.</P>
            <div style={{ ...inputStyle, marginBottom: 10, wordBreak: "break-all" }}>{link}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {})}>
                {copied ? "Copied" : "Copy link"}
              </Button>
              {!onb.link_seen_at && (
                <Button disabled={busy === "link"} onClick={() => mark("link")}>
                  Got it
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <P>Your link isn&apos;t set up yet. Your manager will add it, and you can carry on for now.</P>
            {!onb.link_seen_at && (
              <Button disabled={busy === "link"} onClick={() => mark("link")}>
                OK
              </Button>
            )}
          </>
        )}
        {errFor("link")}
      </Step>
    </div>
  );
}
