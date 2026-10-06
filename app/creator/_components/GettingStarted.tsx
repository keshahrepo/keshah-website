"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ContractSigner } from "./ContractTab";
import StepGuide, { CopyBlock } from "./StepGuide";
import { ACCOUNT_SETUP_GUIDE, BIO_TEXT, POSTING_GUIDE } from "@/lib/creators/guide-content";
import type { PortalData } from "./types";
import { Button, C, Card, CheckCircle, Eyebrow, Field, H, Msg, P, ProgressBar, Title, api, buttonStyle, inputStyle } from "./ui";

type Onb = PortalData["onboarding"];

/**
 * One task row, styled like the KESHAH app's dashboard task list: grey box
 * while it still needs doing, faded translucent card with a green check once
 * it's done. The check pops in when a step is finished during this visit.
 */
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
  const wasDone = useRef(done);
  const [justDone, setJustDone] = useState(false);
  useEffect(() => {
    if (done && !wasDone.current) {
      setJustDone(true);
      setOpen(null); // fold it away; the next step opens on its own
    }
    wasDone.current = done;
  }, [done]);

  const expanded = open ?? !!current;
  const sub = done ? doneNote : !expanded ? note : undefined;
  return (
    <div
      className={current && !expanded ? "cp-pulse" : undefined}
      style={{
        background: done ? C.card : C.box,
        border: done ? C.border : current ? "1px solid rgba(255,255,255,0.3)" : "1px solid transparent",
        borderRadius: done ? 16 : 12,
        marginBottom: 12,
        transition: "background 0.3s ease, border-radius 0.3s ease",
      }}
    >
      <button
        type="button"
        className="cp-focus"
        onClick={() => setOpen(!expanded)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          width: "100%",
          minHeight: 72,
          padding: "14px 18px",
          background: "none",
          border: "none",
          borderRadius: "inherit",
          color: "#fff",
          fontFamily: C.font,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span style={{ width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {done ? (
            <CheckCircle size={30} pop={justDone} />
          ) : (
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 600,
                background: current ? "#fff" : "rgba(255,255,255,0.1)",
                color: current ? "#000" : "rgba(255,255,255,0.75)",
              }}
            >
              {n}
            </span>
          )}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: done ? "rgba(255,255,255,0.5)" : "#fff" }}>{title}</span>
          {sub && (
            <span
              className={done && justDone ? "cp-pop" : undefined}
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: done ? C.faint : C.dim, marginTop: 3 }}
            >
              {done && <CheckCircle size={13} />}
              {sub}
            </span>
          )}
        </span>
        <span aria-hidden style={{ color: C.faint, fontSize: 22, lineHeight: 1, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
          ›
        </span>
      </button>
      {expanded && <div style={{ padding: "2px 18px 20px" }}>{children}</div>}
    </div>
  );
}

/** Highlighted info line inside a step. */
function Callout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: "12px 0",
        padding: "12px 14px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.08)",
        borderLeft: "3px solid #fff",
        fontSize: 14,
        lineHeight: 1.5,
        color: "#fff",
      }}
    >
      {children}
    </div>
  );
}

/** One warm-up day in the same task-row style as the steps. */
function WarmupDay({ n, done, sub, today }: { n: number; done: boolean; sub: string; today?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: done ? 14 : 10,
        background: done ? "rgba(255,255,255,0.06)" : today ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
        border: today && !done ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(255,255,255,0.08)",
        marginBottom: 8,
      }}
    >
      {done ? (
        <CheckCircle size={24} />
      ) : (
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            flexShrink: 0,
            border: today ? "2px solid #fff" : "2px solid rgba(255,255,255,0.2)",
            boxSizing: "border-box",
          }}
        />
      )}
      <span style={{ fontSize: 14, fontWeight: 600, color: done ? "rgba(255,255,255,0.5)" : today ? "#fff" : C.faint }}>Day {n}</span>
      <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 500, color: done ? C.green : today ? "#fff" : C.faint }}>{sub}</span>
    </div>
  );
}

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
  const firstName = data.creator.name.split(" ")[0] || "there";
  // Celebrate only when the last step is finished during this visit.
  const [finishedNow] = useState(() => ({ startedComplete: data.onboarding.complete }));

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
      if (r.onboarding.complete) window.scrollTo({ top: 0, behavior: "smooth" });
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
  const allDone = onb.complete;
  // The first unfinished step opens by default. Warm-up waits a day between
  // ticks, so once today's tick is in, the next step after it opens instead.
  const currentIdx = doneByStep.findIndex((d, i) => !d && !(i === 5 && tickedToday));
  const cur = (n: number) => currentIdx === n - 1;

  return (
    <div>
      {allDone ? (
        <div className="cp-rise" style={{ marginBottom: 18 }}>
          {!finishedNow.startedComplete && (
            <div style={{ marginBottom: 14 }}>
              <CheckCircle size={56} pop />
            </div>
          )}
          <Title style={{ fontSize: 36, letterSpacing: -1.5, color: C.green, marginBottom: 10 }}>All done.</Title>
          <Card>
            <H style={{ fontSize: 18 }}>You&apos;re ready, {firstName}.</H>
            <P>{cfg.warmup_done_text}</P>
            <P>Log your first {cfg.videos_per_weekday} videos on the Today tab. Your pay starts on that day.</P>
            <Button onClick={onDone} style={{ width: "100%", marginTop: 4 }}>
              Open my portal
            </Button>
          </Card>
        </div>
      ) : (
        <>
          <Eyebrow>Getting started</Eyebrow>
          <Title>Welcome, {firstName}.</Title>
          <P>
            Go through these steps once. Don&apos;t post any videos until every step here is done. When they&apos;re all
            ticked off, your full portal opens up.
          </P>
        </>
      )}

      <div
        style={{
          margin: "16px 0 18px",
          padding: "14px 16px",
          borderRadius: 14,
          background: C.card,
          border: C.border,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div>
            <Eyebrow style={{ marginBottom: 3 }}>Your setup</Eyebrow>
            <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>
              {allDone ? "Every step is done" : doneCount === 0 ? "Let's get you set up" : `${doneByStep.length - doneCount} to go`}
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {doneCount}
            <span style={{ color: C.faint }}> / {doneByStep.length}</span>
          </div>
        </div>
        <ProgressBar value={doneCount / doneByStep.length} color={allDone ? C.green : "#fff"} />
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
            <div key={v.id} style={{ padding: "12px 0", borderTop: C.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: done ? 0 : 10, color: done ? "rgba(255,255,255,0.5)" : "#fff" }}>
                {done && <CheckCircle size={16} />}
                {v.title}
              </div>
              {!done && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="cp-btn"
                    onClick={() => setOpened((o) => ({ ...o, [v.id]: true }))}
                    style={buttonStyle(opened[v.id] ? "ghost" : "primary")}
                  >
                    Open video
                  </a>
                  <Button
                    variant={opened[v.id] ? "primary" : "ghost"}
                    disabled={!opened[v.id] || busy === "videos" + v.id}
                    onClick={() => mark("videos", { video_id: v.id })}
                  >
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
                      className="cp-focus"
                      aria-pressed={on}
                      onClick={() => {
                        setAnswers((a) => a.map((x, j) => (j === qi ? oi : x)));
                        setQuizMsg(null);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        minHeight: 48,
                        padding: "12px 16px",
                        marginBottom: 8,
                        borderRadius: 14,
                        border: on ? "1px solid #fff" : C.border,
                        background: on ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.04)",
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
        {data.creator.keshah_email ? (
          <CopyBlock label="Your keshah.com email" value={data.creator.keshah_email} />
        ) : (
          <P style={{ color: C.faint }}>Your keshah.com email isn&apos;t set up yet. Your manager will add it.</P>
        )}
        <Callout>{cfg.verification_code_text}</Callout>
        <CopyBlock label="Your username" value={cfg.suggested_handle} />
        <P style={{ marginTop: 10 }}>{cfg.handle_taken_text}</P>
        <P>Set your display name to your first name, {firstName}.</P>
        <div style={{ height: 4 }} />
        <StepGuide
          collapsible
          guide={ACCOUNT_SETUP_GUIDE}
          sectionIds={["tiktok", "instagram"]}
          keshahEmail={data.creator.keshah_email || undefined}
          handle={cfg.suggested_handle}
        />
        <P style={{ marginTop: 6 }}>Once both accounts are set up, add your handles here.</P>
        <Field label="TikTok handle">
          <input style={inputStyle} value={tt} onChange={(e) => setTt(e.target.value)} placeholder={`@${cfg.suggested_handle}`} autoCapitalize="none" />
        </Field>
        <Field label="Instagram handle">
          <input style={inputStyle} value={ig} onChange={(e) => setIg(e.target.value)} placeholder={`@${cfg.suggested_handle}`} autoCapitalize="none" />
        </Field>
        {errFor("accounts")}
        <Button disabled={busy === "accounts"} onClick={() => mark("accounts", { tiktok_handle: tt, instagram_handle: ig })}>
          {onb.accounts_done_at ? "Update handles" : "Save handles"}
        </Button>
      </Step>

      <Step n={5} title="Join Slack" done={!!onb.slack_joined_at} current={cur(5)} doneNote="Joined">
        {cfg.slack_invite_url ? (
          <>
            <P>This is where the team talks every day. Tap the button, join the workspace, then come back here.</P>
            {!onb.slack_joined_at && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a href={cfg.slack_invite_url} target="_blank" rel="noreferrer" className="cp-btn" style={buttonStyle("primary")}>
                  Join the KESHAH Slack ↗
                </a>
                <Button variant="ghost" disabled={busy === "slack"} onClick={() => mark("slack")}>
                  I&apos;ve joined
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <P>Your manager will send you the Slack invite link.</P>
            {!onb.slack_joined_at && (
              <Button variant="ghost" disabled={busy === "slack"} onClick={() => mark("slack")}>
                I&apos;ve joined
              </Button>
            )}
          </>
        )}
        {errFor("slack")}
      </Step>

      <Step
        n={6}
        title={`${cfg.warmup_days}-day warm-up`}
        done={warmDone}
        current={cur(6)}
        doneNote="Warm-up done"
        note={
          tickedToday
            ? `Day ${warm.length} done. Day ${warm.length + 1} unlocks tomorrow.`
            : warm.length
              ? `${warm.length} of ${cfg.warmup_days} days done`
              : "Don't post yet"
        }
      >
        <H style={{ fontSize: 16, lineHeight: 1.4 }}>{cfg.warmup_headline}</H>
        <P>{cfg.warmup_text}</P>
        <div style={{ margin: "12px 0" }}>
          {Array.from({ length: cfg.warmup_days }, (_, i) => {
            const done = !!warm[i];
            const isNext = i === warm.length;
            const sub = done ? "Done" : isNext ? (tickedToday ? "Unlocks tomorrow" : "Today") : `After Day ${i}`;
            return <WarmupDay key={i} n={i + 1} done={done} today={isNext && !tickedToday} sub={sub} />;
          })}
        </div>
        {warmDone ? (
          <P style={{ color: C.green, fontWeight: 500, marginBottom: 0 }}>{cfg.warmup_done_text}</P>
        ) : (
          <Button disabled={tickedToday || busy === "warmup"} onClick={() => mark("warmup")}>
            {tickedToday ? "Done for today. Come back tomorrow." : `I warmed up today (Day ${warm.length + 1})`}
          </Button>
        )}
        {errFor("warmup")}
      </Step>

      <Step n={7} title="Posting guide" done={!!onb.rules_ack_at} current={cur(7)} doneNote="Read">
        <P>Read this now so you&apos;re ready. You start posting only once every step here is done.</P>
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
        <P style={{ marginBottom: 0 }}>Add this bio and your link to both your TikTok and Instagram profiles yourself.</P>
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
