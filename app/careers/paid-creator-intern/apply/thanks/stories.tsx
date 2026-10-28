"use client";

// Full-screen, tappable intro (like Instagram stories) shown right after a
// creator books their call: who KESHAH is, why it works, the proof, the role,
// and the call. Tap right = next, left = back, hold = pause; it advances on
// its own. Content mirrors the creator call deck; assets in /public/creator-call.
// ?card=N opens on that card (for reviewing).

import { useCallback, useEffect, useRef, useState } from "react";

type Dir = 1 | -1;
type Card = { key: string; ms: number; render: (active: boolean) => React.ReactNode };

/** Headline that reveals word by word. */
function Words({ text, accent, delay = 0.1, step = 0.07 }: { text: string; accent?: string[]; delay?: number; step?: number }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((w, k) => (
        <span key={k}>
          <span className={`cs-w${accent?.includes(w.replace(/[.,]/g, "")) ? " cs-accent" : ""}`} style={{ animationDelay: `${delay + k * step}s` }}>
            {w}
          </span>
          {k < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

function CountUp({ to, active, suffix = "", decimals = 0, ms = 1400, delay = 300 }: { to: number; active: boolean; suffix?: string; decimals?: number; ms?: number; delay?: number }) {
  const [v, setV] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let t0 = 0;
    const tick = (t: number) => {
      if (!t0) t0 = t + delay;
      const p = Math.max(0, Math.min(1, (t - t0) / ms));
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, to, ms, delay]);
  return (
    <span className={done ? "cs-landed" : undefined}>
      {v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/** A video shown small and tiled down the screen, drifting up slowly: reads as a wall of many clips. */
function BgWall({ src, poster, ratio, scale, active }: { src: string; poster: string; ratio: number; scale: number; active: boolean }) {
  const refs = useRef<(HTMLVideoElement | null)[]>([]);
  useEffect(() => {
    refs.current.forEach((v, k) => {
      if (!v) return;
      if (active) {
        // Each copy starts at a different moment so the tiles don't repeat in sync.
        try {
          v.currentTime = (k * 7) % 30;
        } catch {}
        v.play().catch(() => {});
      } else v.pause();
    });
  }, [active]);
  const copies = 6;
  return (
    <div className="cs-wall" style={{ ["--w" as string]: `${scale * 100}%` }}>
      <div className="cs-wall-track">
        {Array.from({ length: copies }, (_, k) => (
          <video key={k} ref={(el) => { refs.current[k] = el; }} src={src} poster={poster} muted loop playsInline preload="auto" style={{ aspectRatio: String(ratio) }} />
        ))}
      </div>
    </div>
  );
}

/** "Thursday, 6:30 PM" from Calendly's event_start_time (their local time). */
export function shortCallTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" }).format(d);
}


export default function CreatorStories({
  bookingTime,
  startIso,
  calendarUrl,
  appStoreUrl,
  playStoreUrl,
  onClose,
}: {
  bookingTime: string | null;
  startIso: string | null;
  calendarUrl: string | null;
  appStoreUrl: string;
  playStoreUrl: string;
  onClose: () => void;
}) {
  const when = shortCallTime(startIso);
  const cards: Card[] = [
    {
      key: "booked",
      ms: 5000,
      render: () => (
        <>
          <div className="cs-aurora" />
          <div className="cs-center">
            <div className="cs-check">
              <svg viewBox="0 0 52 52" aria-hidden>
                <circle cx="26" cy="26" r="24" />
                <path d="M15 27l7 7 15-15" />
              </svg>
            </div>
            <h1 className="cs-h1">
              <Words text="You're booked." delay={0.5} />
            </h1>
            {bookingTime && (
              <p className="cs-pill cs-in" style={{ animationDelay: ".95s" }}>
                {bookingTime}
              </p>
            )}
            <p className="cs-sub cs-in" style={{ animationDelay: "1.2s" }}>
              Here&apos;s who we are. It takes a minute.
            </p>
          </div>
        </>
      ),
    },
    {
      key: "cover",
      ms: 8500,
      render: (active) => (
        <>
          <BgWall src="/creator-call/members.mp4" poster="/creator-call/members-poster.jpg" ratio={960 / 1080} scale={1} active={active} />
          <div className="cs-shade" />
          <div className="cs-bottom">
            <p className="cs-kicker cs-in">KESHAH Creator Program</p>
            <h1 className="cs-h1">
              <Words text="Join the team behind 80M+ views." accent={["80M+", "views"]} delay={0.2} />
            </h1>
            <p className="cs-sub cs-in" style={{ animationDelay: ".9s" }}>
              Behind you: real KESHAH members talking about their results.
            </p>
          </div>
        </>
      ),
    },
    {
      key: "story",
      ms: 10000,
      render: () => (
        <>
          <div className="cs-aurora" />
          <div className="cs-stack">
            <p className="cs-kicker cs-in">Where it started</p>
            <h1 className="cs-h2">
              <Words text="It started with my own hair loss." delay={0.15} />
            </h1>
            <div className="cs-ba cs-pop" style={{ animationDelay: ".4s" }}>
              <img src="/creator-call/before.webp" alt="Aadi before" />
              <div className="cs-ba-after">
                <img src="/creator-call/after.webp" alt="Aadi after" />
              </div>
              <div className="cs-ba-line" />
              <span className="cs-tag left">Before</span>
              <span className="cs-tag right">After</span>
            </div>
            <p className="cs-sub cs-in" style={{ animationDelay: "1.2s" }}>
              No drugs. Just scalp exercises every day. My hair fall stopped by around day 60.
            </p>
            <p className="cs-sign cs-in" style={{ animationDelay: "1.4s" }}>
              Aadi Agrawal, founder · UC Berkeley EECS
            </p>
          </div>
        </>
      ),
    },
    {
      key: "app",
      ms: 7500,
      render: () => (
        <>
          <div className="cs-aurora warm" />
          <div className="cs-stack">
            <p className="cs-kicker cs-in">The app</p>
            <h1 className="cs-h2">
              <Words text="So I turned it into an app." delay={0.15} />
            </h1>
            <div className="cs-phone cs-rise" style={{ animationDelay: ".45s" }}>
              <img src="/creator-call/app.webp" alt="KESHAH app" />
            </div>
            <p className="cs-sub cs-in center" style={{ animationDelay: "1s" }}>
              A few minutes of guided scalp exercises a day.
            </p>
          </div>
        </>
      ),
    },
    {
      key: "why",
      ms: 10500,
      render: () => (
        <>
          <div className="cs-aurora" />
          <div className="cs-stack">
            <p className="cs-kicker cs-in">Why it works</p>
            <h1 className="cs-h2">
              <Words text="A tight scalp starves your hair of blood." accent={["starves"]} delay={0.15} />
            </h1>
            <ol className="cs-facts">
              {[
                { n: "01", t: <>Tension squeezes the vessels that feed your hair.</>, s: "English, 2018" },
                { n: "02", t: <>Balding areas get about <em>2.6× less blood</em>.</>, s: "Klemp & Peters, 1989" },
                { n: "03", t: <><em>68.9%</em> stabilized their hair loss with daily scalp massage.</>, s: "English & Barazesh, 2019" },
              ].map((f, k) => (
                <li key={f.n} className="cs-slide" style={{ animationDelay: `${0.9 + k * 0.45}s` }}>
                  <b>{f.n}</b>
                  <span>{f.t}</span>
                  <i>{f.s}</i>
                </li>
              ))}
            </ol>
          </div>
        </>
      ),
    },
    {
      key: "members",
      ms: 8500,
      render: (active) => (
        <>
          <BgWall src="/creator-call/reviews.mp4" poster="/creator-call/reviews-poster.jpg" ratio={1920 / 1080} scale={1.3} active={active} />
          <div className="cs-shade strong" />
          <div className="cs-center">
            <p className="cs-kicker cs-in">Real members</p>
            <div className="cs-big">
              <CountUp to={15619} active={active} />
            </div>
            <p className="cs-h3 cs-in" style={{ animationDelay: ".5s" }}>
              people have started KESHAH
            </p>
            <div className="cs-rates">
              {[
                { store: "App Store", score: 4.9, n: "1.1K ratings" },
                { store: "Google Play", score: 4.8, n: "10.6K reviews" },
              ].map((r, k) => (
                <div key={r.store} className="cs-rate cs-float" style={{ animationDelay: `${1 + k * 0.3}s` }}>
                  <small>{r.store}</small>
                  <b>
                    <CountUp to={r.score} decimals={1} active={active} ms={900} delay={1100 + k * 300} />
                  </b>
                  <span className="cs-stars5">★★★★★</span>
                  <i>{r.n}</i>
                </div>
              ))}
            </div>
          </div>
        </>
      ),
    },
    {
      key: "reviews",
      ms: 9000,
      render: () => (
        <>
          <div className="cs-aurora warm" />
          <div className="cs-stack">
            <p className="cs-kicker cs-in">In their words</p>
            <h1 className="cs-h2">
              <Words text="Straight from the App Store and Google Play." delay={0.15} />
            </h1>
            <div className="cs-shots">
              <img className="cs-shot cs-pop" style={{ animationDelay: ".7s" }} src="/creator-call/appstore.webp" alt="App Store reviews: 4.9 from 1.1K ratings" />
              <img className="cs-shot cs-pop" style={{ animationDelay: "1.2s" }} src="/creator-call/play.webp" alt="Google Play: 4.8 from 10.6K reviews" />
            </div>
          </div>
        </>
      ),
    },
    {
      key: "reach",
      ms: 9500,
      render: (active) => (
        <>
          <div className="cs-aurora" />
          <div className="cs-stack">
            <p className="cs-kicker cs-in">The reach</p>
            <h1 className="cs-h2">
              <span className="cs-num">
                <CountUp to={80} active={active} suffix="M+" />
              </span>{" "}
              views so far.
            </h1>
            <div className="cs-profiles">
              {[
                { img: "aadi", handle: "@aadi.keshah", role: "Founder", top: "3.8M" },
                { img: "isai", handle: "@isai.trujillo01", role: "Creator", top: "1.5M" },
                { img: "jen", handle: "@jennifer.keshah", role: "Creator", top: "798K" },
              ].map((p, k) => (
                <figure key={p.handle} className="cs-pop" style={{ animationDelay: `${0.6 + k * 0.25}s` }}>
                  <div className="cs-pimg">
                    <img src={`/creator-call/${p.img}.webp`} alt={p.handle} />
                    <figcaption>
                      <b>{p.top}</b>
                      <span>top video</span>
                    </figcaption>
                  </div>
                  <p>
                    {p.handle}
                    <br />
                    <em>{p.role}</em>
                  </p>
                </figure>
              ))}
            </div>
            <p className="cs-sub cs-in center" style={{ animationDelay: "1.5s" }}>
              Isai and Jen are creators in this exact program.
            </p>
          </div>
        </>
      ),
    },
    {
      key: "role",
      ms: 9000,
      render: () => (
        <>
          <div className="cs-aurora warm" />
          <div className="cs-stack">
            <p className="cs-kicker cs-in">What you&apos;d do</p>
            <div className="cs-lines">
              <h2 className="cs-line l1">Film on your phone.</h2>
              <h2 className="cs-line l2">Post on accounts we set up.</h2>
              <h2 className="cs-line l3">Get paid every month.</h2>
            </div>
            <p className="cs-sub cs-in" style={{ animationDelay: "3.4s" }}>
              Scripts and hooks are ready for you. Monday to Friday, from anywhere, and nothing goes on your own page.
            </p>
          </div>
        </>
      ),
    },
    {
      key: "call",
      ms: 60000,
      render: () => (
        <>
          <div className="cs-aurora warm" />
          <div className="cs-center">
            <p className="cs-kicker cs-in">Your call</p>
            <h1 className="cs-h1">
              <Words text={when ? `See you ${when}.` : "See you on the call."} delay={0.15} />
            </h1>
            <ul className="cs-expect">
              {["15 minutes with Aadi, the founder", "Camera on, from somewhere quiet", "Nothing to prepare"].map((x, k) => (
                <li key={k} className="cs-in" style={{ animationDelay: `${0.8 + k * 0.2}s` }}>
                  {x}
                </li>
              ))}
            </ul>
            <div className="cs-actions cs-in" style={{ animationDelay: "1.5s" }} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
              {calendarUrl && (
                <a className="cs-btn primary" href={calendarUrl} target="_blank" rel="noopener noreferrer">
                  Add to calendar
                </a>
              )}
              <a className="cs-btn" href={appStoreUrl} target="_blank" rel="noopener noreferrer">
                Try the app
              </a>
              <a className="cs-btn ghost" href={playStoreUrl} target="_blank" rel="noopener noreferrer">
                On Android? Get it on Google Play
              </a>
            </div>
          </div>
        </>
      ),
    },
  ];
  const last = cards.length - 1;

  const [i, setI] = useState(0);
  // Rendered only in the browser: the call time is in the viewer's own timezone.
  const [mounted, setMounted] = useState(false);
  const [prev, setPrev] = useState<{ i: number; dir: Dir } | null>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const iRef = useRef(0);
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("card"));
    if (Number.isInteger(n) && n > 0) {
      iRef.current = Math.min(n, last);
      setI(iRef.current);
    }
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const prog = useRef(0);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);

  /** Move by d cards (stays put at the ends; back on the first card restarts it). */
  const go = useCallback(
    (d: Dir) => {
      const cur = iRef.current;
      const n = cur + d;
      if (n < 0 || n > last) {
        prog.current = 0;
        setProgress(0);
        return;
      }
      iRef.current = n;
      setPrev({ i: cur, dir: d });
      setI(n);
    },
    [last],
  );

  // The old card animates out for a moment, then unmounts.
  useEffect(() => {
    if (!prev) return;
    const t = window.setTimeout(() => setPrev(null), 520);
    return () => window.clearTimeout(t);
  }, [prev]);

  // Progress + auto-advance.
  useEffect(() => {
    prog.current = 0;
    setProgress(0);
  }, [i]);
  useEffect(() => {
    if (paused || !mounted) return;
    let raf = 0;
    let t0 = performance.now();
    const ms = cards[i].ms;
    const tick = (t: number) => {
      prog.current = Math.min(1, prog.current + (t - t0) / ms);
      t0 = t;
      setProgress(prog.current);
      if (prog.current >= 1) {
        if (i < last) go(1);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, paused, mounted]);

  // Keyboard on desktop; no page scroll behind the overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  const down = () => {
    held.current = false;
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      setPaused(true);
    }, 220);
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    if (held.current) {
      setPaused(false);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const id = Date.now();
    setRipples((rs) => [...rs.slice(-2), { id, x, y: e.clientY - r.top }]);
    window.setTimeout(() => setRipples((rs) => rs.filter((p) => p.id !== id)), 600);
    go(x < r.width * 0.3 ? -1 : 1);
  };

  if (!mounted) return <div className="cs-root" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#000" }} />;

  return (
    <div className="cs-root" role="dialog" aria-label="About KESHAH">
      <div className={`cs-frame${paused ? " is-paused" : ""}`} onPointerDown={down} onPointerUp={up} onPointerCancel={() => setPaused(false)} onContextMenu={(e) => e.preventDefault()}>
        {prev && (
          <div key={`out-${cards[prev.i].key}`} className={`cs-card cs-${cards[prev.i].key} cs-out-${prev.dir === 1 ? "next" : "back"}`}>
            {cards[prev.i].render(false)}
          </div>
        )}
        <div key={cards[i].key} className={`cs-card cs-${cards[i].key}${prev ? ` cs-in-${prev.dir === 1 ? "next" : "back"}` : ""}`}>
          {cards[i].render(true)}
        </div>
        <div className="cs-bars">
          {cards.map((c, k) => (
            <div key={c.key} className="cs-bar">
              <div style={{ transform: `scaleX(${k < i ? 1 : k === i ? progress : 0})` }} />
            </div>
          ))}
        </div>
        <button
          className="cs-close"
          aria-label="Close"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          ✕
        </button>
        {ripples.map((p) => (
          <span key={p.id} className="cs-ripple" style={{ left: p.x, top: p.y }} />
        ))}
        {i === 0 && <p className="cs-hint">Tap to continue</p>}
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.cs-root{position:fixed;inset:0;z-index:1000;background:#000;display:flex;align-items:center;justify-content:center;font-family:Poppins,system-ui,-apple-system,sans-serif;color:#fff;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.cs-frame{position:relative;width:100%;height:100dvh;max-width:460px;overflow:hidden;background:#050505;touch-action:manipulation}
@media(min-width:600px){.cs-frame{height:min(92dvh,900px);border-radius:30px;box-shadow:0 40px 120px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.06)}}
.cs-bars{position:absolute;z-index:5;top:calc(env(safe-area-inset-top,0px) + 10px);left:10px;right:10px;display:flex;gap:4px}
.cs-bar{flex:1;height:3px;border-radius:3px;background:rgba(255,255,255,.22);overflow:hidden}
.cs-bar>div{height:100%;width:100%;background:#fff;border-radius:3px;transform-origin:left}
.cs-close{position:absolute;z-index:6;top:calc(env(safe-area-inset-top,0px) + 22px);right:12px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(0,0,0,.35);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;font-size:15px;cursor:pointer}
.cs-card{position:absolute;inset:0;box-sizing:border-box;width:100%;padding:calc(env(safe-area-inset-top,0px) + 72px) 24px calc(env(safe-area-inset-bottom,0px) + 34px);display:flex;flex-direction:column;overflow:hidden;background:#050505;backface-visibility:hidden}
.cs-in-next{animation:cs-enter-next .52s cubic-bezier(.2,.8,.2,1) both;z-index:2}
.cs-in-back{animation:cs-enter-back .52s cubic-bezier(.2,.8,.2,1) both;z-index:2}
.cs-out-next{animation:cs-exit-next .52s cubic-bezier(.2,.8,.2,1) both;z-index:1;pointer-events:none}
.cs-out-back{animation:cs-exit-back .52s cubic-bezier(.2,.8,.2,1) both;z-index:1;pointer-events:none}
@keyframes cs-enter-next{from{transform:translateX(100%) scale(.96);filter:brightness(.6)}to{transform:none;filter:none}}
@keyframes cs-enter-back{from{transform:translateX(-100%) scale(.96);filter:brightness(.6)}to{transform:none;filter:none}}
@keyframes cs-exit-next{to{transform:translateX(-28%) scale(.9);filter:brightness(.35)}}
@keyframes cs-exit-back{to{transform:translateX(28%) scale(.9);filter:brightness(.35)}}
.is-paused *{animation-play-state:paused!important}
.cs-center{margin:auto 0;display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;position:relative;z-index:2;width:100%}
.cs-stack{display:flex;flex-direction:column;gap:14px;margin:auto 0;position:relative;z-index:2;width:100%}
.cs-bottom{margin-top:auto;position:relative;z-index:2;display:flex;flex-direction:column;gap:12px;width:100%}
.cs-kicker{margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.6);font-weight:600}
.cs-h1{margin:0;font-size:42px;line-height:1.04;font-weight:700;letter-spacing:-.035em;overflow-wrap:break-word;max-width:100%}
.cs-h2{margin:0;font-size:32px;line-height:1.08;font-weight:700;letter-spacing:-.03em;overflow-wrap:break-word;max-width:100%}
.cs-h3{margin:0;font-size:18px;font-weight:600;color:rgba(255,255,255,.88)}
.cs-sub{margin:0;font-size:16px;line-height:1.5;color:rgba(255,255,255,.75)}
.cs-sub.center{text-align:center}
.cs-sign{margin:0;font-size:13px;color:rgba(255,255,255,.55)}
.cs-accent{color:#E8B530}
.cs-pill{margin:0;padding:9px 18px;border-radius:999px;background:rgba(255,255,255,.1);color:#fff;font-weight:600;font-size:14px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
.cs-hint{position:absolute;z-index:4;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);left:0;right:0;text-align:center;font-size:12px;letter-spacing:.06em;color:rgba(255,255,255,.45);animation:cs-blink 1.8s 2s ease-in-out infinite both}
.cs-w{display:inline-block;opacity:0;transform:translateY(.45em);filter:blur(6px);animation:cs-word .55s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes cs-word{to{opacity:1;transform:none;filter:none}}
.cs-aurora{position:absolute;inset:-20%;z-index:0;background:radial-gradient(40% 35% at 25% 20%,rgba(255,255,255,.08),transparent 70%),radial-gradient(45% 40% at 80% 85%,rgba(255,255,255,.05),transparent 70%);animation:cs-drift 14s ease-in-out infinite alternate}
.cs-aurora.warm{background:radial-gradient(40% 35% at 25% 25%,rgba(218,165,32,.13),transparent 70%),radial-gradient(45% 40% at 80% 80%,rgba(255,255,255,.06),transparent 70%)}
@keyframes cs-drift{to{transform:translate(4%,-3%) scale(1.08)}}
.cs-bgvideo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;animation:cs-kenburns 9s ease-out forwards}
.cs-shade{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 45%,rgba(0,0,0,.88) 78%,#000 100%)}
.cs-shade.strong{background:radial-gradient(80% 60% at 50% 50%,rgba(0,0,0,.62),rgba(0,0,0,.88))}
.cs-kb{animation:cs-kenburns 9s ease-out forwards}
@keyframes cs-kenburns{from{transform:scale(1.02)}to{transform:scale(1.14)}}
.cs-check svg{width:88px;height:88px;filter:drop-shadow(0 0 22px rgba(255,255,255,.35))}
.cs-check circle{fill:none;stroke:#fff;stroke-width:3;stroke-dasharray:151;stroke-dashoffset:151;animation:cs-draw .7s .1s ease-out forwards}
.cs-check path{fill:none;stroke:#fff;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:40;stroke-dashoffset:40;animation:cs-draw .4s .6s ease-out forwards}
.cs-ba{position:relative;align-self:center;height:min(44dvh,400px);aspect-ratio:872/1600;max-width:100%;border-radius:22px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1)}
.cs-ba img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center}
.cs-ba-after{position:absolute;inset:0;clip-path:inset(0 0 0 100%);animation:cs-sweep 2.6s 1.1s cubic-bezier(.65,0,.35,1) forwards}
.cs-ba-line{position:absolute;top:0;bottom:0;width:2px;left:100%;background:#fff;box-shadow:0 0 16px rgba(255,255,255,.9);animation:cs-line 2.6s 1.1s cubic-bezier(.65,0,.35,1) forwards}
@keyframes cs-sweep{to{clip-path:inset(0 0 0 50%)}}
@keyframes cs-line{to{left:50%}}
.cs-tag{position:absolute;z-index:2;top:10px;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:11px;font-weight:600;opacity:0;animation:cs-fade .5s 3.6s forwards}
.cs-tag.left{left:10px}.cs-tag.right{right:10px}
.cs-phone{align-self:center;width:58%;max-width:230px;border-radius:32px;padding:7px;background:linear-gradient(160deg,#2a2a2a,#0d0d0d);box-shadow:0 30px 80px rgba(218,165,32,.16),0 0 0 1px rgba(255,255,255,.1)}
.cs-phone img{width:100%;display:block;border-radius:26px}
.cs-facts{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:12px}
.cs-facts li{display:grid;grid-template-columns:34px 1fr;gap:3px 12px;padding:15px 16px;border-radius:18px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.cs-facts b{grid-row:span 2;color:#DAA520;font-size:14px;padding-top:2px}
.cs-facts span{font-size:15px;line-height:1.4}
.cs-facts em{font-style:normal;color:#DAA520;font-weight:700}
.cs-facts i{font-style:normal;font-size:11px;color:rgba(255,255,255,.42)}
.cs-big{font-size:68px;font-weight:700;letter-spacing:-.045em;line-height:1}
.cs-landed{display:inline-block;animation:cs-land .5s ease-out}
@keyframes cs-land{40%{transform:scale(1.08);text-shadow:0 0 30px rgba(218,165,32,.6)}100%{transform:none}}
.cs-float{opacity:0;transform:translateY(24px) scale(.96);animation:cs-up .7s cubic-bezier(.2,.9,.25,1.15) forwards}
.cs-wall{position:absolute;inset:0;z-index:0;overflow:hidden;display:flex;justify-content:center}
.cs-wall-track{width:var(--w);flex:none;display:flex;flex-direction:column;animation:cs-wallup 40s linear infinite}
.cs-wall video{display:block;width:100%;object-fit:cover}
@keyframes cs-wallup{to{transform:translateY(-50%)}}
.cs-rates{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;margin-top:10px}
.cs-rate{display:flex;flex-direction:column;align-items:center;gap:2px;padding:14px 10px;border-radius:18px;background:rgba(255,255,255,.1);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.cs-rate small{font-size:12px;color:rgba(255,255,255,.65);font-weight:500}
.cs-rate b{font-size:34px;font-weight:700;letter-spacing:-.03em;line-height:1.1}
.cs-stars5{color:#DAA520;letter-spacing:2px;font-size:13px}
.cs-rate i{font-style:normal;font-size:12px;color:rgba(255,255,255,.6)}
.cs-shots{display:flex;flex-direction:column;gap:12px}
.cs-shot{display:block;max-width:100%;max-height:min(30dvh,300px);width:auto;align-self:flex-start;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1)}
.cs-shot:nth-child(2){align-self:flex-end}
.cs-num{color:#fff}
.cs-profiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.cs-profiles figure{margin:0}
.cs-pimg{position:relative}
.cs-profiles img{display:block;width:100%;aspect-ratio:804/1353;object-fit:cover;object-position:top;border-radius:14px;box-shadow:0 14px 36px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.1)}
.cs-profiles figcaption{position:absolute;left:6px;right:6px;bottom:6px;padding:6px 8px;border-radius:10px;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);text-align:center}
.cs-profiles figcaption b{display:block;font-size:17px;font-weight:700;color:#E8B530;line-height:1.1}
.cs-profiles figcaption span{font-size:10px;color:rgba(255,255,255,.65)}
.cs-profiles p{margin:8px 0 0;font-size:11px;line-height:1.35;color:rgba(255,255,255,.85);text-align:center;overflow-wrap:anywhere}
.cs-profiles em{font-style:normal;color:rgba(255,255,255,.5)}
.cs-lines{display:flex;flex-direction:column;gap:6px}
.cs-line{margin:0;font-size:34px;line-height:1.1;font-weight:700;letter-spacing:-.03em;opacity:0;transform:translateY(18px)}
.cs-line.l1{animation:cs-up .6s .3s cubic-bezier(.2,.8,.2,1) forwards,cs-dim .6s 1.4s forwards}
.cs-line.l2{animation:cs-up .6s 1.3s cubic-bezier(.2,.8,.2,1) forwards,cs-dim .6s 2.4s forwards}
.cs-line.l3{animation:cs-up .6s 2.3s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes cs-dim{to{opacity:.4;transform:none}}
.cs-expect{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:8px;font-size:15px;color:rgba(255,255,255,.82)}
.cs-expect li::before{content:"✓  ";color:#DAA520;font-weight:700}
.cs-actions{display:flex;flex-direction:column;gap:10px;width:100%;margin-top:14px}
.cs-btn{display:block;text-align:center;padding:16px 18px;border-radius:999px;font-weight:600;font-size:15px;text-decoration:none;color:#fff;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.cs-btn.primary{background:#fff;color:#000;box-shadow:0 10px 30px rgba(255,255,255,.15)}
.cs-btn.ghost{background:transparent;box-shadow:none;color:rgba(255,255,255,.55);padding:6px;font-size:13px;font-weight:500}
.cs-ripple{position:absolute;z-index:7;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:rgba(255,255,255,.35);pointer-events:none;animation:cs-ripple .6s ease-out forwards}
@keyframes cs-ripple{to{transform:scale(9);opacity:0}}
.cs-in{opacity:0;transform:translateY(14px);animation:cs-up .6s .1s cubic-bezier(.2,.8,.2,1) forwards}
.cs-slide{opacity:0;transform:translateX(30px);animation:cs-slide .6s cubic-bezier(.2,.8,.2,1) forwards}
.cs-rise{opacity:0;transform:translateY(60px) rotate(-4deg) scale(.95);animation:cs-rise 1s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes cs-up{to{opacity:1;transform:none}}
@keyframes cs-slide{to{opacity:1;transform:none}}
@keyframes cs-rise{to{opacity:1;transform:none}}
@keyframes cs-fade{to{opacity:1}}
@keyframes cs-draw{to{stroke-dashoffset:0}}
@keyframes cs-blink{0%,100%{opacity:.45}50%{opacity:.12}}
@media(max-height:720px){.cs-h1{font-size:35px}.cs-h2{font-size:27px}.cs-line{font-size:29px}.cs-sub{font-size:14px}.cs-big{font-size:56px}.cs-ba{height:38dvh}.cs-facts li{padding:11px 14px}.cs-rate b{font-size:28px}}
@media(prefers-reduced-motion:reduce){*{animation-duration:.01s!important;animation-delay:0s!important}}
`;
