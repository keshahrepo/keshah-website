"use client";

// Cold-traffic landing page — pre-quiz warmer for paid ads.
// Copy locked by Aadi; do not edit words. Design matches /start funnel
// (dark theme, Poppins, primitives). CTA links to /start so the existing
// founder story + quiz picks up from there.

import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { AnimatedPage, AnimatedPageItem, KeshahButton } from "../start/components/primitives";

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
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex justify-center pt-6 pb-4">
        <Image
          src="/images/logo.png"
          alt="KESHAH"
          width={80}
          height={20}
          priority
          className="h-5 w-auto opacity-90"
        />
      </div>

      <AnimatedPage className="flex-1 flex flex-col px-6 pt-6 pb-8 max-w-md mx-auto w-full">
        <AnimatedPageItem>
          <h1
            className="text-white font-semibold"
            style={{
              fontFamily: "Poppins, sans-serif",
              fontSize: 28,
              lineHeight: 1.2,
              letterSpacing: "-0.5px",
            }}
          >
            How I stopped my genetic hair loss in 55 days without medication
          </h1>
        </AnimatedPageItem>

        <div className="mt-8 space-y-5">
          {BULLETS.map((line, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.12, duration: 0.5, ease: [0, 0, 0.2, 1] }}
              className="text-white"
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: 15,
                fontWeight: 500,
                lineHeight: 1.5,
              }}
            >
              {line}
            </motion.p>
          ))}
        </div>

        <div className="flex-1" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 + BULLETS.length * 0.12 + 0.2, duration: 0.5, ease: [0, 0, 0.2, 1] }}
          className="pt-10"
        >
          <KeshahButton title="Show me" onTap={() => router.push("/start")} />
        </motion.div>
      </AnimatedPage>
    </div>
  );
}
