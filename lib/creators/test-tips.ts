/**
 * Format creators (invite only, ContentCreators.format_creator) make 2 of
 * their own new concepts a day: Today rows 4 and 5 are labelled "Your concept"
 * with an optional "Inspired by (link)" field and the tips card below.
 * Everyone else posts 5 given videos and sees none of this.
 * Founder-approved copy: keep the wording exactly as is.
 */

export interface TestTipsSection {
  title: string;
  /** "bullets" renders an unordered list, "steps" a numbered list. */
  style: "bullets" | "steps";
  items: string[];
}

/** Zero-based Today rows that are a format creator's own concepts (videos 4 and 5). */
export const CONCEPT_ROW_INDEXES: readonly number[] = [3, 4];
export const CONCEPT_LABEL = "Your concept";
export const INSPIRED_BY_LABEL = "Inspired by (link)";
export const TEST_TIPS_TITLE = "How to find a new concept";

export const TEST_TIPS: TestTipsSection[] = [
  {
    title: "Where to look",
    style: "bullets",
    items: [
      "Search TikTok and Reels for: hair loss, thinning hair, receding hairline, hair growth, scalp care.",
      "Look in nearby niches too: skincare, posture, jaw and face, gym, men's grooming, sleep, stress.",
      "Check the \"For You\" feed after your warm-up. It's already tuned to the niche.",
      "Only pick videos from the last 2 weeks with way more views than that account usually gets. That means the format is working, not just the account.",
    ],
  },
  {
    title: "What makes a good pick",
    style: "bullets",
    items: [
      "A strong hook in the first 2 seconds, like a question, a test, a \"stop doing this\", or a surprising claim.",
      "A format you can copy: a simple talking video, a \"try this\" test, a myth vs fact, a \"3 things\", or a reaction.",
      "Skip salon makeovers, haircuts, product ads and anything that needs special props or editing.",
    ],
  },
  {
    title: "How to make it a KESHAH video",
    style: "steps",
    items: [
      "Keep their hook and style.",
      "Bring it back to the scalp: tight scalp → squeezes the blood vessels → blood can't reach your hair → hair falls out.",
      "End with: \"Full routine in my pinned video.\"",
    ],
  },
  {
    title: "Examples",
    style: "bullets",
    items: [
      "A posture video: \"Your posture is ruining your face\" → \"Your tight scalp is ruining your hairline. Here's why.\"",
      "A skincare test: \"Press your cheek, if it stays white…\" → \"Pinch your scalp. If it doesn't move, that's a problem.\"",
    ],
  },
];
