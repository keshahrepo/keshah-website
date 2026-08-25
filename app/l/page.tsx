"use client";

// Cold-traffic landing page — pre-quiz warmer for paid ads.
// Copy locked by Aadi; do not edit words.
// Shell mirrors StartFlow layout (100dvh, overflow hidden, flex column)
// so the CTA stays pinned to the viewport bottom regardless of content
// height / iOS address bar.

import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { KeshahButton } from "../start/components/primitives";

const BULLETS = [
  "I used to be scared to run my hands through my hair because I thought more would fall out",
  "I didn't want to take Finasteride & minoxidil",
  "The “natural stuff” did…nothing",
  "I learnt it was a ‘tight-scalp’ problem",
  "Let me show you how I fixed it (now I can pull on my hair with all my force and it doesn’t go anywhere :) )",
];

export default function LandingPage() {
  const router = useRouter();
  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "#000",
        color: "#fff",
        overflow: "hidden",
      }}
    >
      {/* Logo bar — matches BackArrowWithAppLogo spacing */}
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 24, paddingBottom: 12, flexShrink: 0 }}>
        <Image
          src="/images/logo.png"
          alt="KESHAH"
          width={80}
          height={20}
          priority
          style={{ height: 20, width: "auto", opacity: 0.9 }}
        />
      </div>

      {/* Scrollable content area */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "24px 32px 0",
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

        <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 20 }}>
          {BULLETS.map((line, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.12, duration: 0.5, ease: [0, 0, 0.2, 1] }}
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: 15,
                fontWeight: 500,
                lineHeight: 1.5,
                color: "#fff",
                margin: 0,
              }}
            >
              {line}
            </motion.p>
          ))}
        </div>

        {/* Bottom padding so last bullet doesn't kiss the button */}
        <div style={{ height: 32 }} />
      </div>

      {/* Pinned CTA — flex-shrink: 0 keeps it visible regardless of content */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 + BULLETS.length * 0.12 + 0.2, duration: 0.5, ease: [0, 0, 0.2, 1] }}
        style={{ padding: "0 25px 24px", flexShrink: 0 }}
      >
        <KeshahButton expanded title="Show me" onTap={() => router.push("/start")} />
      </motion.div>
    </div>
  );
}
