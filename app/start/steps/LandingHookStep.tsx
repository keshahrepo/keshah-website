"use client";

/**
 * LandingHookStep — cold-traffic pre-quiz hook.
 *
 * The very first slide of the /start funnel. Job: give a cold ad-clicker
 * enough context (mirror + proof + mechanism tease) that clicking "Show me"
 * feels like curiosity, not commitment. Advances into founderStory (via
 * whatever comes next in STEP_ORDER after landingHook).
 *
 * Copy locked by Aadi — do not edit words.
 * No BackArrowWithAppLogo — this is the funnel entry, no back state exists.
 */

import Image from "next/image";
import { motion } from "framer-motion";
import { KeshahButton } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

export default function LandingHookStep() {
  const { next } = useFlow();
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        width: "100%",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "24px 24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
          // Center-vertically inside the available scroll area so
          // whitespace balances above + below the content instead of
          // pooling as one big gap between body copy and the CTA.
          justifyContent: "center",
        }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0, 0, 0.2, 1] }}
          style={{
            fontFamily: "Poppins, sans-serif",
            fontSize: 28,
            fontWeight: 600,
            lineHeight: 1.25,
            letterSpacing: "-0.6px",
            color: "#fff",
            margin: 0,
          }}
        >
          How I stopped my genetic hair loss in 55 days without medication
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: [0, 0, 0.2, 1] }}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {[
            { src: "/start/story/before_hairline.jpg", label: "Day 0" },
            { src: "/start/story/after_hairline.jpg", label: "Day 55" },
          ].map(({ src, label }) => (
            <div
              key={label}
              style={{
                position: "relative",
                aspectRatio: "3 / 4",
                borderRadius: 12,
                overflow: "hidden",
                background: "#111",
              }}
            >
              <Image
                src={src}
                alt={label}
                fill
                sizes="(max-width: 600px) 50vw, 300px"
                style={{ objectFit: "cover" }}
                priority
              />
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.55)",
                  color: "#fff",
                  fontFamily: "Poppins, sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5, ease: [0, 0, 0.2, 1] }}
          style={{
            fontFamily: "Poppins, sans-serif",
            fontSize: 15,
            fontWeight: 500,
            lineHeight: 1.5,
            color: "#fff",
            margin: 0,
          }}
        >
          Turns out it wasn’t about buying{" "}
          <span style={{ fontStyle: "italic" }}>another</span> product. It was a{" "}
          <span style={{ fontWeight: 700 }}>‘tight-scalp’</span> problem. Let me
          show you…
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.95, duration: 0.5, ease: [0, 0, 0.2, 1] }}
        style={{ padding: "0 25px 20px", flexShrink: 0 }}
      >
        <KeshahButton expanded title="Show me" onTap={next} />
      </motion.div>
    </div>
  );
}
