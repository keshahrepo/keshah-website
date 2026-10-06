/**
 * Creator onboarding content. Edit freely: this file is the only place the
 * portal's "Getting started" copy lives.
 */

export interface FounderVideo {
  /** Stable id: watched-state is stored against it, so don't change once live. */
  id: string;
  title: string;
  url: string;
}

export const KESHAH_SITE_URL = "https://www.keshah.com";

export const FOUNDER_VIDEOS: FounderVideo[] = [
  {
    id: "reversed-hair-loss",
    title: "How I reversed my hair loss naturally (no drugs)",
    url: "https://www.youtube.com/watch?v=Vu4qtKlTbIc",
  },
  {
    id: "science-of-hair-loss",
    title: "The real science of hair loss",
    url: "https://www.youtube.com/watch?v=tw_21vGcxBY",
  },
];

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  /** Index into options. Checked server-side only; never sent to the browser. */
  correct: number;
}

// Draft questions. All must be right to pass; retries allowed.
export const QUIZ: QuizQuestion[] = [
  {
    id: "cause",
    question: "What's usually behind the hair loss KESHAH helps with?",
    options: [
      "Washing your hair too often",
      "A tight scalp that squeezes the blood vessels, so blood can't reach the hair",
      "Wearing hats",
      "Not taking enough vitamins",
    ],
    correct: 1,
  },
  {
    id: "how",
    question: "How does KESHAH help?",
    options: [
      "A pill you take every morning",
      "A special shampoo",
      "Daily scalp exercises that loosen the scalp",
      "A laser cap",
    ],
    correct: 2,
  },
  {
    id: "cta",
    question: "Where does every video send viewers?",
    options: [
      "The link in your bio",
      "The comments",
      "The pinned video on your profile",
      "A KESHAH ad",
    ],
    correct: 2,
  },
];

/** Quiz without answers, safe to send to the browser. */
export function publicQuiz() {
  return QUIZ.map(({ id, question, options }) => ({ id, question, options }));
}

// Copy for the "Set up your accounts" step. Pending founder decision on how
// passwords are handled; change here only.
export const ACCOUNTS_STEP_TEXT =
  "Create your KESHAH TikTok and Instagram using your keshah.com email (shown here). Just add a photo and username; the team handles the bio, link and business setup.";

// PLACEHOLDER: link to the accounts setup guide PDF.
export const ACCOUNTS_GUIDE_URL = "";

// PLACEHOLDER: link to the full posting guide.
export const POSTING_GUIDE_URL = "";

export const WARMUP_DAYS = 3;
export const WARMUP_TEXT =
  "Warm up your new accounts for 3 different days before you post. Each day, spend 5 to 10 minutes on each app scrolling, liking and commenting on hair loss and hair care videos. Tick once a day.";

export const POSTING_RULES: string[] = [
  "Post 5 unique videos every weekday, Monday to Friday.",
  "Post each video on both TikTok and Instagram.",
  "Your deadline is 11:59 pm in your own timezone.",
  "Log both links for every video on the Today tab before the deadline.",
];
