"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HomeHeader, Screen, TaskRow, TaskThumb, usePushed, useJustDone } from "./AppShell";
import type { MIName } from "./icons";
import { ContractSigner } from "./ContractTab";
import PaymentsSetup from "./PaymentsSetup";
import StepGuide, { CopyBlock } from "./StepGuide";
import { ACCOUNT_SETUP_GUIDE, BIO_TEXT, POSTING_GUIDE } from "@/lib/creators/guide-content";
import type { PortalData } from "./types";
import { AllDone, Button, C, CheckCircle, Field, Group, H, Msg, P, SectionLabel, api, buttonStyle, inputStyle, prefersReducedMotion } from "./ui";

type Onb = PortalData["onboarding"];

/**
 * One onboarding step as a task row on the app's Home (TaskListWidget, see
 * AppShell). Tapping it pushes the step onto its own screen, the way the app
 * opens a session from the task list. When the step is finished on that
 * screen it slides back to the list and the green check pops in.
 */
function Step({
  n,
  icon,
  title,
  done,
  current,
  locked,
  doneNote,
  note,
  children,
}: {
  n: number;
  icon: MIName;
  title: string;
  done: boolean;
  /** The first step that isn't done: it pulses, like the app's next task. */
  current?: boolean;
  /** Can't be opened yet (the grey overlay with the lock). */
  locked?: boolean;
  /** Shown next to the green check once the step is done. */
  doneNote: string;
  /** The row's white second line while it still needs doing. */
  note?: string;
  children: ReactNode;
}) {
  const screen = usePushed<true>();
  const justDone = useJustDone(done);
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current && screen.isOpen) screen.close();
    wasDone.current = done;
  }, [done, screen]);
  return (
    <>
      <TaskRow
        thumb={<TaskThumb icon={icon} />}
        title={title}
        target={`Step ${n}`}
        meta={note}
        doneText={doneNote}
        done={done}
        justDone={justDone}
        locked={locked}
        pulse={current}
        enterIndex={n - 1}
        onClick={() => screen.open(true)}
      />
      {screen.value && (
        <Screen title={title} onBack={screen.close} closing={screen.closing}>
          {children}
        </Screen>
      )}
    </>
  );
}

/** Highlighted info line inside a step. */
function Callout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: "12px 0",
        padding: "12px 14px",
        borderRadius: 10,
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

/** One warm-up day, as a row in a profile-style group. */
function WarmupDay({ n, done, sub, today, isLast }: { n: number; done: boolean; sub: string; today?: boolean; isLast?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "16px 20px",
        borderBottom: isLast ? "none" : `1px solid ${C.divider}`,
      }}
    >
      {done ? (
        <CheckCircle size={20} />
      ) : (
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            flexShrink: 0,
            border: today ? "2px solid #fff" : "2px solid rgba(255,255,255,0.2)",
          }}
        />
      )}
      <span style={{ fontSize: 14, color: done ? "rgba(255,255,255,0.5)" : today ? "#fff" : C.faint }}>Day {n}</span>
      <span style={{ marginLeft: "auto", fontSize: 13, color: done ? C.green : today ? "#fff" : "rgba(255,255,255,0.5)" }}>{sub}</span>
    </div>
  );
}

export default function GettingStarted({ data, onDone, onProfile }: { data: PortalData; onDone: () => void; onProfile: () => void }) {
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
      if (r.onboarding.complete) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
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
  // Same order as ONBOARDING_STEP_KEYS. Warm-up is last and runs over 3 days.
  const doneByStep = [
    contractDone,
    !!onb.slack_joined_at,
    videosDone,
    !!onb.quiz_passed_at,
    !!onb.accounts_done_at,
    !!onb.link_seen_at,
    !!onb.rules_ack_at,
    warmDone,
  ];
  const WARM = doneByStep.length - 1;
  const warmLocked = !onb.accounts_done_at || !onb.link_seen_at;
  const doneCount = doneByStep.filter(Boolean).length;
  const allDone = onb.complete;
  // The first unfinished step opens by default. Warm-up waits a day between
  // ticks, so once today's tick is in it stays closed until tomorrow.
  const currentIdx = doneByStep.findIndex((d, i) => !d && !(i === WARM && tickedToday));
  const cur = (n: number) => currentIdx === n - 1;

  const statusLine = allDone
    ? "Every step is done"
    : doneCount === WARM && !warmDone
      ? `Just your ${cfg.warmup_days}-day warm-up left`
      : doneCount === 0
        ? "Let's get you set up"
        : `${doneByStep.length - doneCount} to go`;

  return (
    <div>
      <HomeHeader chip="SETUPMODE" chatHref={cfg.slack_invite_url} onProfile={onProfile} />
      <div style={{ height: 20 }} />
      {allDone ? (
        <div className="cp-head-enter" style={{ marginBottom: 24 }}>
          {!finishedNow.startedComplete && (
            <div style={{ marginBottom: 14 }}>
              <CheckCircle size={56} pop />
            </div>
          )}
          <AllDone style={{ marginBottom: 24 }} />
          {/* _buildDayCompleteCard */}
          <div style={{ background: C.card, border: C.border, borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <H style={{ fontSize: 18 }}>You&apos;re ready, {firstName}.</H>
            <P>{cfg.warmup_done_text}</P>
            <P>Log your first {cfg.videos_per_weekday} videos on the Today tab. Your pay starts on that day.</P>
            <Button onClick={onDone} style={{ width: "100%", marginTop: 4 }}>
              Open my portal
            </Button>
          </div>
          {/* Last step, shown after the 8-step gate: never blocks posting. Also lives on the Invoices tab. */}
          <PaymentsSetup />
        </div>
      ) : (
        <div className="cp-head-enter" style={{ fontSize: 13, color: C.faint, marginBottom: 24 }}>
          Do steps 1 to 7 in one sitting. Then step 8, the warm-up, runs over your first {cfg.warmup_days} days. Don&apos;t post any
          videos until every step here is done. Once they&apos;re all ticked off, your full portal opens up.
        </div>
      )}

      <SectionLabel right={`${doneCount} / ${doneByStep.length}`}>Your setup</SectionLabel>
      <div style={{ fontSize: 13, color: allDone ? C.green : "rgba(255,255,255,0.7)", marginTop: -12, marginBottom: 20 }}>{statusLine}</div>

      <Step n={1} icon="description" title="Sign your contract" done={contractDone} current={cur(1)} doneNote="Signed" note="Read it, then sign">
        {contractDone ? (
          <P style={{ marginBottom: 0 }}>Signed. You can download your copy from Profile, under Contract, any time.</P>
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

      {!contractDone && (
        <div style={{ fontSize: 13, color: C.faint, marginTop: -4, marginBottom: 20 }}>
          Sign your contract first. The rest of the steps unlock after that.
        </div>
      )}
      <Step n={2} icon="forum" title="Join Slack" done={!!onb.slack_joined_at} current={cur(2)} locked={!contractDone} doneNote="Joined" note="Where the team talks">
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

      <Step n={3} icon="playCircle" title="Learn KESHAH" done={videosDone} current={cur(3)} locked={!contractDone} doneNote="Both videos watched" note={`${cfg.founder_videos.length} short videos`}>
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

      <Step n={4} icon="quiz" title="Quick check" done={!!onb.quiz_passed_at} current={cur(4)} locked={!contractDone} doneNote="Passed" note={`${cfg.quiz.length} quick questions`}>
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

      <Step n={5} icon="personAdd" title="Set up your accounts" done={!!onb.accounts_done_at} current={cur(5)} locked={!contractDone} doneNote={`@${tt} on TikTok, @${ig} on Instagram`} note="TikTok and Instagram">
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

      <Step n={6} icon="link" title="Add your bio and link" done={!!onb.link_seen_at} current={cur(6)} locked={!contractDone} doneNote="Bio and link added" note="On both profiles">
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

      <Step n={7} icon="menuBook" title="Posting guide" done={!!onb.rules_ack_at} current={cur(7)} locked={!contractDone} doneNote="Read" note="Read it before you post">
        <P>Read this now so you&apos;re ready. You start posting only after your warm-up is done.</P>
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

      <Step
        n={8}
        icon="fire"
        locked={!contractDone}
        title={`Your first ${cfg.warmup_days} days`}
        done={warmDone}
        current={cur(8)}
        doneNote="Warm-up done"
        note={
          tickedToday
            ? `Day ${warm.length} done. Day ${warm.length + 1} unlocks tomorrow.`
            : warm.length
              ? `${warm.length} of ${cfg.warmup_days} days done`
              : warmLocked
                ? "Starts after steps 5 and 6"
                : "Warm-up. Don't post yet"
        }
      >
        <H style={{ fontSize: 16, lineHeight: 1.4 }}>{cfg.warmup_headline}</H>
        <P>{cfg.warmup_text}</P>
        <P style={{ color: "#fff" }}>{cfg.first_posting_day_text}</P>
        <Group style={{ margin: "12px 0 20px" }}>
          {Array.from({ length: cfg.warmup_days }, (_, i) => {
            const done = !!warm[i];
            const isNext = i === warm.length;
            const sub = done ? "Done" : isNext && !warmLocked ? (tickedToday ? "Unlocks tomorrow" : "Today") : i === 0 ? "After step 6" : `After Day ${i}`;
            return <WarmupDay key={i} n={i + 1} done={done} today={isNext && !tickedToday && !warmLocked} sub={sub} isLast={i === cfg.warmup_days - 1} />;
          })}
        </Group>
        {warmDone ? (
          <P style={{ color: C.green, fontWeight: 500, marginBottom: 0 }}>{cfg.warmup_done_text}</P>
        ) : warmLocked ? (
          <P style={{ marginBottom: 0 }}>
            The warm-up uses your new accounts, so it starts once you&apos;ve set them up and added your bio and link (steps 5 and 6).
          </P>
        ) : (
          <Button disabled={tickedToday || busy === "warmup"} onClick={() => mark("warmup")}>
            {tickedToday ? "Done for today. Come back tomorrow." : `I warmed up today (Day ${warm.length + 1})`}
          </Button>
        )}
        {errFor("warmup")}
      </Step>

      {/* PAYMENTS SLOT: a non-blocking "Set up your payments" card goes here, under the
          warm-up row, during the warm-up days. Keep it full width with 20 below like a task row. */}
    </div>
  );
}
