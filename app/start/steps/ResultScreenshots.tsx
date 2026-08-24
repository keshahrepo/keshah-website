"use client";

// Direct port of result_screenshots.dart — full-screen tap-through.
// Slides 0..N-1 (gif slides): full-bleed transformation GIFs (gender-aware)
// Slides N..M (screenshot slides): tap-through testimonial JPEGs
//
// Intro slide ("This is what happens when your scalp loosens...") removed —
// the cinematic beat momentHereIsWhatHappens now delivers that message right
// before this page, so keeping an intro headline here would repeat the same
// line back-to-back.
import { useEffect, useMemo, useState } from "react";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { useFlow } from "../lib/flow-context";
import { currentUser } from "../lib/firebase-client";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import styles from "./result-screenshots.module.css";

// MP4 instead of GIF — ~10x smaller, hardware-decoded, smoother on mobile.
// All available clips featured here so the highlight reel runs full strength.
// Jonathon (proof_clip_1) also appears in founder story Beat 22 ("One of the
// 160"); ~17 steps separate that beat from this one, and the framing differs
// (small thumbnail there vs full-bleed hero here), so it's reuse, not redundancy.
const MALE_GIFS = [
  "/start/results/proof_clip_1.mp4", // Jonathon
  "/start/results/proof_clip_2.mp4", // Arush
  "/start/results/proof_clip_3.mp4", // Collin
  "/start/results/proof_clip_4.mp4",
  "/start/results/proof_clip_5.mp4",
  "/start/results/proof_clip_7.mp4",
  "/start/results/proof_clip_6.mp4", // Venkatesh
];

// Deliberate ordering: clips 5 / 1 / 4 lead because those are the strongest
// visible transformations — the female funnel needs its best proof up front,
// so we don't open on a weaker clip. Matches _femaleGifClips in mobile.
const FEMALE_GIFS = [
  "/start/results/women_clip_5.mp4",
  "/start/results/women_clip_1.mp4",
  "/start/results/women_clip_4.mp4",
  "/start/results/women_clip_2.mp4",
  "/start/results/women_clip_3.mp4",
  "/start/results/women_clip_6.mp4",
];

const ALL_SCREENSHOTS = [
  "/start/results/proof_tiktok_finasteride_vs_keshah.jpeg",
  "/start/results/proof_tiktok_2_days_difference.jpeg",
  "/start/results/proof_tiktok_growing_back.jpeg",
  "/start/results/proof_reddit_30_days.jpeg",
  "/start/results/proof_tiktok_tension_reduced.jpeg",
  "/start/results/proof_reddit_105_days.jpeg",
  "/start/results/proof_tiktok_3_months.jpeg",
  "/start/results/proof_reddit_worth_every_penny.jpeg",
  "/start/results/proof_tiktok_it_works.jpeg",
  "/start/results/proof_tiktok_stops_hair_loss.jpeg",
  "/start/results/proof_whatsapp_hairline.jpeg",
  "/start/results/proof_imessage_grateful.jpeg",
  "/start/results/proof_tiktok_almost_working.jpeg",
  "/start/results/proof_reddit_5_month.jpeg",
  "/start/results/proof_whatsapp_one_year.jpeg",
];

export default function ResultScreenshots() {
  const { answers, next } = useFlow();
  const [index, setIndex] = useState(0);

  const gifs = useMemo(
    () => (answers.gender === "female" ? FEMALE_GIFS : MALE_GIFS),
    [answers.gender]
  );

  const screenshots = useMemo(() => {
    if (answers.gender === "female") {
      // Hard cuts: each of these screenshots contains male-coded language,
      // a named "Aadi" reference, "brother"/"bro" salutation, or male-
      // presenting avatars + male-pattern terminology ("mpb", "barber").
      // Even when the copy itself is gender-neutral, the surrounding
      // signals will register as "not for me" to a woman scanning.
      const EXCLUDE_FOR_WOMEN = [
        "finasteride",          // male-only drug comparison
        "one_year",             // male user testimonial
        "2_days_difference",    // opens with "Hi brother,"
        "imessage_grateful",    // "Of course Aadi np" + "thanks a lot brother"
        "almost_working",       // "what this guy say" + "my grandpa tole me"
        "whatsapp_hairline",    // "my barber was shocked"
        "5_month",              // duplicate barber content under reddit name
        "tiktok_3_months",      // male-presenting avatars
        "tiktok_stops_hair_loss", // male avatar
        "reddit_105_days",      // references "mpb"
      ];
      return [
        "/start/results/proof_women_zukie.jpeg",
        ...ALL_SCREENSHOTS.filter(
          (s) => !EXCLUDE_FOR_WOMEN.some((e) => s.includes(e))
        ),
      ];
    }
    // Men's path: filter out female-coded screenshots so the "this is for
    // me" signal stays gender-pure in both directions. Most screenshots
    // are male or neutral, so the men's exclude list is short.
    const EXCLUDE_FOR_MEN = [
      "proof_women_zukie",    // explicitly women-only screenshot
      "tiktok_it_works",      // Lurapeaceloveunity, female-presenting avatar
    ];
    return ALL_SCREENSHOTS.filter(
      (s) => !EXCLUDE_FOR_MEN.some((e) => s.includes(e))
    );
  }, [answers.gender]);

  const totalSlides = gifs.length + screenshots.length;
  const isGif = index < gifs.length;
  const gifIndex = index;
  const screenshotIndex = index - gifs.length;

  // Milestone write — records when the user first landed on this step.
  // Mirrors mobile's initState write to Users/{uid}. Merged, so re-entering
  // this step (back-nav / resume) doesn't overwrite the original timestamp.
  // Guarded: web /start (US) has no auth yet at this stage; /startindia has
  // an anonymous UID from PhoneNumber. Skip silently when no user exists.
  useEffect(() => {
    const u = currentUser();
    if (!u) return;
    const db = getFirestore();
    setDoc(
      doc(db, "Users", u.uid),
      { results_screenshots_started_at: serverTimestamp() },
      { merge: true },
    ).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[result-screenshots] milestone write failed", err);
    });
  }, []);

  const advance = () => {
    if (index >= totalSlides - 1) {
      mediumHaptic();
      next();
      return;
    }
    lightHaptic();
    setIndex((i) => i + 1);
  };

  const goBack = () => {
    if (index <= 0) return;
    lightHaptic();
    setIndex((i) => i - 1);
  };

  return (
    <div className={styles.root} onClick={advance}>
      {/* Full-bleed video slide (was GIF, now MP4 for performance) */}
      {isGif && (
        <video
          key={`gif-${gifIndex}`}
          src={gifs[gifIndex]}
          className={`${styles.fullBleed} ${styles.fadeIn}`}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
        />
      )}

      {/* Screenshot slide */}
      {!isGif && (
        <div className={`${styles.screenshotWrap} ${styles.fadeIn}`} key={`shot-${screenshotIndex}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshots[screenshotIndex]}
            alt=""
            className={styles.screenshot}
          />
        </div>
      )}

      {/* Progress bar */}
      <div className={styles.progressBar}>
        {Array.from({ length: totalSlides }, (_, i) => (
          <div
            key={i}
            className={`${styles.progressSeg} ${i <= index ? styles.progressSegActive : ""}`}
          />
        ))}
      </div>

      {/* Back button */}
      {index > 0 && (
        <button
          type="button"
          className={styles.backBtn}
          onClick={(e) => {
            e.stopPropagation();
            goBack();
          }}
          aria-label="Go back"
        >
          ‹
        </button>
      )}

      {/* Bottom hint */}
      <div className={styles.hint}>Tap to continue</div>
    </div>
  );
}
