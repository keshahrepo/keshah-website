// Direct port of _buildBeats() from KESHAH-Mobile-App/lib/screens/founder_story/founder_story_page.dart
// Each beat matches the Flutter source line-for-line so updating either side stays mechanical.

import type { ReactNode } from "react";

export interface StoryBeat {
  /** Plain text used when no rich content is provided. May contain \n. */
  text: string;
  /** Optional rich content with inline italics. Renders instead of text when present. */
  rich?: ReactNode;
  /** Path under /public/start/ for the main image. */
  imagePath?: string;
  /** When true, image fills the entire screen with text overlaid at the bottom. */
  fullScreenImage?: boolean;
  /**
   * When true, render the single image at a constrained width (centered)
   * with the caption centered too. Used for small visual proofs like the
   * "One of the 160" GIF where the image shouldn't dominate the screen.
   */
  imageSmall?: boolean;
  /** Multiple images stacked vertically (e.g. Reddit screenshots). */
  stackedImages?: string[];
  /** Two images side-by-side (e.g. before / after). */
  sideBySideImages?: string[];
  sideBySideLabels?: string[];
  /** Caption shown below image(s). */
  imageCaption?: string;
  /** Inline video (Huberman clip). */
  videoPath?: string;
  videoCaption?: string;
  /** Custom animated graphic (blood vessel). */
  hasAnimation?: boolean;
  /** Final beat — replaces "tap to continue" with a delayed "Let's go" CTA. */
  isLastScreen?: boolean;
}

// firstName parameter is unused now (the original Flutter version greeted the
// user by name, but we don't collect first name on web). Kept as an optional
// parameter for forward compatibility if we ever add it back.
export function buildBeats(_firstName?: string): StoryBeat[] {
  return [
    // The original Beat 1 ("4 years ago I was losing my hair... Here's my story.")
    // was deleted because the pinch test result page is now the textual bridge
    // — repeating "4 years ago" and "Here's my story" here would duplicate it.
    // Story now opens with the full-screen before photo for a cinematic reveal:
    // text bridge → tap → BAM, Aadi's thinning crown.
    {
      text: "My crown was thinning and my hairline was going back.",
      imagePath: "/start/story/before_hairline.jpg",
      fullScreenImage: true,
    },
    // Beat 3: Failed remedies
    {
      text: "I tried everything. Rosemary oil. Onion juice. Ayurvedic oils. Every shampoo. Every supplement I could find.\n\nNothing worked.",
    },
    // Beat 4: Doctor
    {
      text: "I went to a dermatologist. He said \"take finasteride and minoxidil or you'll go bald in 2-3 years.\"",
    },
    // Beat 5: Internal conflict
    {
      text: "I didn't want to take pills for the rest of my life. But I didn't want to go bald either.\n\nThe anxiety was killing me.",
    },
    // Beat 6: Caved — bought finasteride
    {
      text: "I gave in. I went to Walgreens and bought a bottle of finasteride and put it on my bedside table.",
    },
    // Beat 7: The night before
    {
      text: "I told myself I'd start taking it the next morning.",
    },
    // Beat 8: Couldn't sleep
    {
      text: "I couldn't sleep that night.",
    },
    // Beat 9: Reddit rabbit hole — italic "stopped"
    {
      text: "I went down a rabbit hole. I found real people on Reddit who said scalp massages stopped their hair loss.",
      rich: (
        <>
          I went down a rabbit hole. I found real people on Reddit who said scalp massages{" "}
          <em>stopped</em> their hair loss.
        </>
      ),
      stackedImages: [
        "/start/story/reddit_1.png",
        "/start/story/reddit_2.png",
        "/start/story/reddit_3.png",
        "/start/story/reddit_4.png",
      ],
      imageCaption: "These are the exact comments I read 4 years ago. They're still up.",
    },
    // Beat 10: Skepticism
    {
      text: "I didn't believe them. I'd been let down too many times.",
    },
    // Beat 11: The study
    {
      text: "Then I found a study. The places you lose hair first? Those are the tightest parts of your scalp.",
      imagePath: "/start/story/scalp_tension_study.jpg",
      imageCaption:
        "The hairline and crown are tightest (shown in light blue). And that's where we generally first lose hair. (Byun et al., 2015)",
    },
    // Beat 12: Mechanism — animation
    {
      text: "When your scalp is tight, the blood vessels get choked. Less blood reaches your hair. Without blood, hair cannot grow.",
      hasAnimation: true,
    },
    // Beat 13: Personal proof — italic "very"
    {
      text: "I felt my scalp properly for the first time. It was very tight.",
      rich: (
        <>
          I felt my scalp properly for the first time. It was <em>very</em> tight.
        </>
      ),
    },
    // Beat 14: Hypothesis
    {
      text: "If I could loosen up my scalp and fix the blood flow, maybe my hair fall would stop?",
    },
    // Beat 15: Decision
    {
      text: "It sounded too simple to actually work. But I had nothing to lose.",
    },
    // Beat 16: The plan
    {
      text: "So I made a plan. 6 scalp + neck techniques. And I started.",
    },
    // Beat 17: The work
    {
      text: "This wasn't a gentle exercise. I had to apply a lot of force. It felt like a workout.",
    },
    // Beat 18: Results — 30 days
    {
      text: "The first few days I could barely pinch my scalp at all. After 30 days it started to get much looser.",
    },
    // Beat 19: Results — 45 days
    {
      text: "After 45 days I started to notice less hair in the shower.",
    },
    // Beat 20: Results — 60 days, side-by-side
    {
      text: "By day 60 my hair fall pretty much completely stopped.",
      sideBySideImages: ["/start/story/before_hairline.jpg", "/start/story/after_hairline.jpg"],
      sideBySideLabels: ["Before", "After"],
    },
    // Beat 21: My hair now — FULL SCREEN
    {
      text: "My hair now.",
      imagePath: "/start/story/after_selfie_2.jpg",
      imageCaption: "Aadi, KESHAH Founder",
      fullScreenImage: true,
    },
    // Beat 22 (NEW): n=1 → n=many proof — Aadi tested it on 160 others.
    // The Jonathon clip anchors the claim with one real visual instead of
    // leaving "160" as an unverified number. Rendered small + centered so
    // the visual supports the text without dominating it.
    // MP4 instead of GIF for ~10x smaller file + hardware-accelerated playback.
    {
      text: "But was it just me?\n\nFor the next 2 years, I worked 1-on-1 with 160 people.",
      imagePath: "/start/results/proof_clip_1.mp4",
      imageCaption: "Jonathon - one of 160",
      imageSmall: true,
    },
    // Beat 24: Science is catching up — Huberman
    {
      text: "Now, science is catching up.",
      videoPath: "/start/video/huberman_clip.mp4",
      videoCaption: "Dr. Andrew Huberman\nNeuroscientist, Stanford University",
    },
    // Beat 23: The question — italic
    {
      text: "I had one question left: how doesn't everyone know about this?",
      rich: (
        <>
          I had one question left: <em>how doesn&apos;t everyone know about this?</em>
        </>
      ),
    },
    // Beat 24: Built the plan
    {
      text: "So I put everything. All my research. All the exercises. What I learnt after working with 160+ people for 2.5 years. I made it into a plan.",
    },
    // Beat 25: CTA — "Let's go" button
    {
      text: "It's in your hands now.",
      isLastScreen: true,
    },
  ];
}
