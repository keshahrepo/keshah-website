"use client";

// Motion for the keshah.com company sections, ported from the in-app proof
// page ("Will this actually work for me?"): fade-up on scroll, the why-chain
// lighting up step by step with a count-up, and Aadi's before/after slider
// that sweeps once on reveal and can be dragged.

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./home-sections.module.css";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True once the element has scrolled (almost) into view. */
function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** Fades + slides its children up once they scroll into view; [delay] staggers siblings. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`${styles.reveal} ${seen ? styles.revealIn : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Counts [to] up from 0 when [play] turns true. */
function CountUp({ to, decimals = 0, suffix = "", play, delay = 0 }: { to: number; decimals?: number; suffix?: string; play: boolean; delay?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!play) return;
    if (reducedMotion()) {
      setV(to);
      return;
    }
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 1200));
      setV(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, to, delay]);
  return (
    <span className={styles.countUp}>
      {v.toFixed(decimals)}
      {suffix}
    </span>
  );
}

const STEP_MS = 450;

/** Why hair falls out: a timeline that lights up one step after another. */
export function Chain() {
  const [ref, play] = useInView<HTMLOListElement>();
  const steps: { title: string; body: ReactNode }[] = [
    {
      title: "Your scalp gets tight.",
      body: "The hairline and crown are generally the tightest parts of the scalp. That's also where most people lose hair first.",
    },
    {
      title: "The tightness squeezes your blood vessels.",
      body: "A tight scalp presses on the small blood vessels that feed every hair on your head.",
    },
    {
      title: "Blood can't reach your hair.",
      body: (
        <>
          Blood flow in balding areas has been measured at{" "}
          <CountUp to={2.6} decimals={1} suffix="×" play={play} delay={2 * STEP_MS} /> lower than in areas with full hair.
        </>
      ),
    },
    {
      title: "Without blood, the hair dies.",
      body: "Hair can't grow without what blood brings it, so it gets thinner and falls out.",
    },
  ];
  return (
    <ol ref={ref} className={`${styles.chain} ${play ? styles.chainPlay : ""}`}>
      {steps.map((s, k) => (
        <li key={s.title} className={styles.chainRow} style={{ ["--d" as string]: `${k * STEP_MS}ms` }}>
          <div className={styles.chainRail}>
            <span className={styles.chainDot} />
            {k < steps.length - 1 && <span className={styles.chainLine} />}
          </div>
          <div className={styles.chainText}>
            <h3 className={styles.h3}>{s.title}</h3>
            <p className={styles.body}>{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// 0.5 -> 0.15 -> 0.85 -> 0.5, easeInOut, like the app.
function sweepAt(t: number): number {
  const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const e = ease(t);
  if (e < 0.25) return 0.5 + (0.15 - 0.5) * (e / 0.25);
  if (e < 0.75) return 0.15 + (0.85 - 0.15) * ((e - 0.25) / 0.5);
  return 0.85 + (0.5 - 0.85) * ((e - 0.75) / 0.25);
}

/** Aadi's hairline: drag to compare; sweeps once by itself when it scrolls into view. */
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [pos, setPos] = useState(0.5);
  const dragged = useRef(false);

  useEffect(() => {
    if (!seen || reducedMotion()) return;
    let raf = 0;
    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        if (dragged.current) return;
        const t = Math.min(1, (now - start) / 2400);
        setPos(sweepAt(t));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, 400);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [seen]);

  const moveTo = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  };

  return (
    <div
      ref={ref}
      className={`${styles.ba} ${styles.reveal} ${seen ? styles.revealIn : ""}`}
      onPointerDown={(e) => {
        dragged.current = true;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        moveTo(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons || e.pointerType === "touch") {
          if (dragged.current) moveTo(e.clientX);
        }
      }}
      role="img"
      aria-label="Aadi's hairline before and after KESHAH"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt="" className={styles.baImg} draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={before} alt="" className={styles.baImg} draggable={false} style={{ clipPath: `inset(0 ${100 - pos * 100}% 0 0)` }} />
      <div className={styles.baHandle} style={{ left: `${pos * 100}%` }}>
        <span className={styles.baKnob}>‹ ›</span>
      </div>
      <span className={`${styles.baPill} ${styles.baPillLeft}`}>Before</span>
      <span className={`${styles.baPill} ${styles.baPillRight}`}>After</span>
    </div>
  );
}

/** Member before/afters: swipe, arrows or dots; advances by itself until touched. */
export function ResultsCarousel({ slides }: { slides: { src: string; alt: string }[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const touched = useRef(false);

  const goTo = (i: number) => {
    const el = track.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: reducedMotion() ? "auto" : "smooth" });
  };

  // Which slide is showing (nearest to the left edge).
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      let best = 0;
      kids.forEach((k, i) => {
        if (Math.abs(k.offsetLeft - el.offsetLeft - el.scrollLeft) < Math.abs(kids[best].offsetLeft - el.offsetLeft - el.scrollLeft)) best = i;
      });
      setIndex(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (reducedMotion()) return;
    const t = setInterval(() => {
      if (touched.current || document.hidden) return;
      goTo((index + 1) % slides.length);
    }, 4500);
    return () => clearInterval(t);
  }, [index, slides.length]);

  const stop = () => {
    touched.current = true;
  };

  return (
    <div className={styles.carousel}>
      <div ref={track} className={styles.carouselTrack} onPointerDown={stop} onWheel={stop} onTouchStart={stop}>
        {slides.map((s) => (
          <div key={s.src} className={styles.carouselSlide}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt={s.alt} className={styles.carouselImg} loading="lazy" draggable={false} />
          </div>
        ))}
      </div>
      <div className={styles.carouselBar}>
        <div className={styles.dots}>
          {slides.map((s, i) => (
            <button
              key={s.src}
              type="button"
              aria-label={`Show result ${i + 1}`}
              className={`${styles.dot} ${i === index ? styles.dotOn : ""}`}
              onClick={() => {
                stop();
                goTo(i);
              }}
            />
          ))}
        </div>
        <div className={styles.arrows}>
          <button type="button" aria-label="Previous result" className={styles.arrow} disabled={index === 0} onClick={() => { stop(); goTo(index - 1); }}>
            ‹
          </button>
          <button type="button" aria-label="Next result" className={styles.arrow} disabled={index === slides.length - 1} onClick={() => { stop(); goTo(index + 1); }}>
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
