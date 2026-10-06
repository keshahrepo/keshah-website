"use client";

import { useState, type ReactNode } from "react";
import { ContractSigner } from "./ContractTab";
import StepGuide, { CopyBlock } from "./StepGuide";
import { ACCOUNT_SETUP_GUIDE, BIO_TEXT, POSTING_GUIDE } from "@/lib/creators/guide-content";
import type { PortalData } from "./types";
import { Button, C, Card, Eyebrow, Field, H, Msg, P, api, inputStyle } from "./ui";

type Onb = PortalData["onboarding"];

function Step({
  n,
  title,
  done,
  current,
  doneNote,
  note,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  /** The first step that isn't done: opened by default and highlighted. */
  current?: boolean;
  /** One line shown under a finished step's title. */
  doneNote?: string;
  /** One line shown under an unfinished step's title while it's closed. */
  note?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? !!current;
  return (
    <Card
      style={{
        padding: 0,
        border: current ? "1px solid rgba(255,255,255,0.35)" : done ? "1px solid rgba(74,222,128,0.25)" : C.border,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!expanded)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          minHeight: 64,
          padding: "14px 18px",
          background: "none",
          border: "none",
          color: "#fff",
          fontFamily: C.font,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 600,
            background: done ? C.green : current ? "#fff" : "rgba(255,255,255,0.1)",
            color: done || current ? "#000" : "#fff",
          }}
        >
          {done ? "✓" : n}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 16, fontWeight: 600 }}>{title}</span>
          {!expanded && (done ? doneNote : note) && (
            <span style={{ display: "block", fontSize: 13, color: done ? C.faint : C.dim, marginTop: 2 }}>{done ? doneNote : note}</span>
          )}
        </span>
        <span aria-hidden style={{ color: C.faint, fontSize: 22, lineHeight: 1, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
          ›
        </span>
      </button>
      {expanded && <div style={{ padding: "0 18px 18px" }}>{children}</div>}
    </Card>
  );
}

const ghostLink = {
  minHeight: 48,
  boxSizing: "border-box",
  alignItems: "center",
  padding: "12px 18px",
  borderRadius: 12,
  border: C.border,
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-flex",
} as const;

export default function GettingStarted({ data, onDone }: { data: PortalData; onDone: () => void }) {
  const cfg = data.config;
  const [onb, setOnb] = useState<Onb>(data.onboarding);
  const [tt, setTt] = useState(data.creator.tiktok_handle);
  const [ig, setIg] = useState(data.creator.instagram_handle);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ step: string; msg: string } | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<(number | null)[]>(() => cfg.quiz.map(() => null));
  const [quizMsg, setQuizMsg] = useState<string | null>(null);
  const [signedNow, setSignedNow] = useState(false);

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
  const link = data.tracking_url;
  const contractDone = signedNow || data.contract.status === "signed" || !!onb.contract_signed_at;
  const doneByStep = [
    contractDone,
    videosDone,
    !!onb.quiz_passed_at,
    !!onb.accounts_done_at,
    !!onb.slack_joined_at,
    warmDone,
    !!onb.rules_ack_at,
    !!onb.link_seen_at,
  ];
  const doneCount = doneByStep.filter(Boolean).length;
  // The first unfinished step opens by default. Warm-up waits a day between
  // ticks, so once today's tick is in, the next step after it opens instead.
  const currentIdx = doneByStep.findIndex((d, i) => !d && !(i === 5 && tickedToday));
  const cur = (n: number) => currentIdx === n - 1;

  if (onb.complete) {
    return (
      <div>
        <Card style={{ textAlign: "center", padding: 28 }}>
          <H style={{ fontSize: 22 }}>You&apos;re ready.</H>
          <P>Log your first 5 videos on the Today tab. Your pay starts on that day.</P>
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
      <div style={{ margin: "18px 0 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.dim, marginBottom: 8 }}>
          <span>
            {doneCount} of {doneByStep.length} done
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
          <div style={{ width: `${(doneCount / doneByStep.length) * 100}%`, height: "100%", background: C.green, borderRadius: 3 }} />
        </div>
      </div>

      <Step n={1} title="Sign your contract" done={contractDone} current={cur(1)} doneNote="Signed">
        {contractDone ? (
          <P style={{ marginBottom: 0 }}>Signed. You can download your copy from the Contract tab any time.</P>
        ) : (
          <ContractSigner
            compact
            onSigned={() => {
              setSignedNow(true);
              setOnb((o) => ({ ...o, contract_signed_at: o.contract_signed_at ?? new Date().toISOString() }));
            }}
          />
        )}
      </Step>

      {!contractDone ? (
        <Card>
          <P style={{ marginBottom: 0 }}>Once your contract is signed, the rest of the steps show up here.</P>
        </Card>
      ) : (
      <>
      <Step n={2} title="Learn KESHAH" done={videosDone} current={cur(2)} doneNote="Both videos watched">
        <P>
          Watch both of these videos. They explain how KESHAH works and the science behind it. There&apos;s a short quiz
          right after, so watch carefully.
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

      <Step n={3} title="Quick check" done={!!onb.quiz_passed_at} current={cur(3)} doneNote="Passed">
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
                        minHeight: 48,
                        padding: "12px 14px",
                        marginBottom: 8,
                        borderRadius: 12,
                        border: on ? "1px solid #fff" : C.border,
                        background: on ? "rgba(255,255,255,0.12)" : "transparent",
                        color: "#fff",
                        fontFamily: C.font,
                        fontSize: 14,
                        lineHeight: 1.4,
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

      <Step n={4} title="Set up your accounts" done={!!onb.accounts_done_at} current={cur(4)} doneNote={`@${tt} on TikTok, @${ig} on Instagram`}>
        <P>{cfg.accounts_step_text}</P>
        <Eyebrow>Your keshah.com email</Eyebrow>
        <div style={{ fontSize: 15, marginBottom: 12, wordBreak: "break-all" }}>
          {data.creator.keshah_email || <span style={{ color: C.faint }}>Not set up yet. Your manager will add it.</span>}
        </div>
        <StepGuide collapsible guide={ACCOUNT_SETUP_GUIDE} sectionIds={["tiktok", "instagram"]} keshahEmail={data.creator.keshah_email || undefined} />
        <P>Once both accounts are set up, add your handles here.</P>
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

      <Step n={5} title="Join Slack" done={!!onb.slack_joined_at} current={cur(5)} doneNote="Joined">
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

      <Step n={6} title={`${cfg.warmup_days}-day warm-up`} done={warmDone}
        current={cur(6)}
        doneNote="All warm-up days done"
        note={tickedToday ? `${warm.length} of ${cfg.warmup_days} days done. Tick the next one tomorrow.` : warm.length ? `${warm.length} of ${cfg.warmup_days} days done` : undefined}
      >
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

      <Step n={7} title="Posting guide" done={!!onb.rules_ack_at} current={cur(7)} doneNote="Read">
        <ul style={{ margin: "0 0 14px", paddingLeft: 20, listStyleType: "disc" }}>
          {cfg.posting_rules.map((r, i) => (
            <li key={i} style={{ fontSize: 14, lineHeight: 1.6, color: C.dim }}>
              {r}
            </li>
          ))}
        </ul>
        <StepGuide collapsible guide={POSTING_GUIDE} />
        {errFor("rules")}
        {!onb.rules_ack_at && (
          <Button disabled={busy === "rules"} onClick={() => mark("rules")}>
            I&apos;ve read it
          </Button>
        )}
      </Step>

      <Step n={8} title="Add your bio and link" done={!!onb.link_seen_at} current={cur(8)} doneNote="Bio and link added">
        <P style={{ marginBottom: 0 }}>Add this bio and your link to both your TikTok and Instagram profiles.</P>
        <CopyBlock label="Your bio" value={BIO_TEXT} />
        {link && <CopyBlock label="Your link" value={link} />}
        <div style={{ height: 12 }} />
        <StepGuide
          collapsible
          guide={ACCOUNT_SETUP_GUIDE}
          sectionIds={["bio"]}
          link={link || undefined}
          showSectionTitles={false}
          toggleLabel="Show me how, step by step"
        />
        {link ? (
          !onb.link_seen_at && (
            <Button disabled={busy === "link"} onClick={() => mark("link")}>
              I&apos;ve added my bio and link
            </Button>
          )
        ) : (
          <P style={{ marginBottom: 0 }}>Your link is being set up. Your manager will add it here, and you can tick this step once it shows up.</P>
        )}
        {errFor("link")}
      </Step>
      </>
      )}
    </div>
  );
}
