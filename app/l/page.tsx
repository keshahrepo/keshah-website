"use client";

// Cold-traffic landing page — pre-quiz warmer for paid ads.
// Copy locked by Aadi; do not edit words.
// No logo header — headline + photo + 2 lines + CTA, all fits in
// one viewport on mobile without scrolling.

import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { KeshahButton } from "../start/components/primitives";

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
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "28px 24px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
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

        {/* Before/After side-by-side */}
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

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
            I used to be scared to run my hands through my hair because I
            thought more would fall out. I learnt it was a &lsquo;tight-scalp&rsquo; problem.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.5, ease: [0, 0, 0.2, 1] }}
            style={{
              fontFamily: "Poppins, sans-serif",
              fontSize: 15,
              fontWeight: 500,
              lineHeight: 1.5,
              color: "#fff",
              margin: 0,
            }}
          >
            Let me show you how I fixed it (now I can pull on my hair with all
            my force and it doesn&rsquo;t go anywhere :) )
          </motion.p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85, duration: 0.5, ease: [0, 0, 0.2, 1] }}
        style={{ padding: "0 25px 20px", flexShrink: 0 }}
      >
        <KeshahButton expanded title="Show me" onTap={() => router.push("/start")} />
      </motion.div>
    </div>
  );
}
